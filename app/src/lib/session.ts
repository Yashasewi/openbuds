import {
  SERVICE,
  MODEL,
  SWITCHES,
  EQ_MAX_CUSTOM,
  NOISE_REPORTS,
  hex,
  encode,
  Framer,
  capabilities,
  requireSuccess,
  acknowledged,
  batteryPairs,
  wearPairs,
  noise,
  holdCycle,
  smartLevel,
  featureStates,
  gestures,
  customPresets,
  connectedDevices,
  firmware,
  bassLevel,
  fitResult,
  goldenRecord,
  hearingEnhanceType,
  noiseModePayload,
  holdCycleMask,
  holdCyclePayload,
  gestureTablePayload,
  callGesturePayload,
  customEqPayload,
  bassPayload,
  tonePayload,
  hearingFilterPayload,
  hearingRecordPayload,
  hearingSnap,
  type Bytes,
  type Capabilities,
  type Frame,
  type NoiseMode,
  type HoldMode,
  type Ear,
  type Band,
  type Preset,
  type BatteryLevel,
  type WearState,
  type Side,
  type NoiseState,
  type HoldCycle,
  type FeatureStates,
  type Gesture,
  type HostDevice,
  type GoldenRecord,
  type FitResult,
} from "./protocol";

export interface DeviceState {
  model?: string;
  battery?: Partial<Record<Side, BatteryLevel>>;
  wearing?: Partial<Record<Side, WearState>>;
  firmware?: string;
  noise?: NoiseState;
  smartLevel?: NoiseMode | null;
  holdCycle?: HoldCycle;
  eq?: number;
  customPresets?: Preset[];
  gestures?: Gesture[];
  features?: FeatureStates;
  devices?: HostDevice[];
  codec?: number;
  bass?: number;
  promptVolume?: number;
  golden?: GoldenRecord | null;
  fit?: FitResult;
  hearingStatus?: { kind: number; status: number };
  errors: Partial<Record<Field, string>>;
  updatedAt?: string;
}
export type Connection = "idle" | "connecting" | "connected" | "restarting" | "disconnected";
export interface Snapshot {
  connection: Connection;
  reason?: string;
  live: boolean;
  state: DeviceState;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// If the earbud link drops while a port is opening, the browser can keep the channel and never settle open().
const OPEN_TIMEOUT = 10000;
const STUCK_OPEN =
  "Your browser is still holding the earbuds from an earlier attempt. Quit the browser completely (Cmd+Q), open this page again, and connect.";
const byte = (p: Bytes) => {
  requireSuccess(p, 2);
  if (p.length !== 2) throw Error("Invalid byte reply");
  return p[1];
};
const parsed = <T>(value: T | null) => {
  if (value == null) throw Error("Unrecognized reply");
  return value;
};
const READS = {
  battery: [
    0x0106,
    [],
    (p: Bytes) => {
      requireSuccess(p, 2);
      return parsed(batteryPairs(p, true));
    },
  ],
  firmware: [0x0105, [], firmware],
  wearing: [0x0109, [], (p: Bytes) => parsed(wearPairs(p))],
  noise: [0x010c, [1, 1], noise],
  smartLevel: [0x010c, [4, 1], smartLevel],
  holdCycle: [0x010c, [2, 1], holdCycle],
  eq: [0x010f, [], byte],
  customPresets: [0x0122, [], customPresets],
  gestures: [0x0108, [], gestures],
  features: [0x010d, [9, 5, 4, 11, 17, 24, 6, 27, 29, 28], featureStates],
  devices: [0x0112, [], connectedDevices],
  codec: [0x0114, [], byte],
  bass: [0x0124, [], bassLevel],
  promptVolume: [0x0130, [], byte],
  golden: [0x0115, [], (p: Bytes) => (p[0] === 0 ? goldenRecord(p) : null)],
} as const satisfies Record<string, readonly [number, readonly number[], (p: Bytes) => unknown]>;
export type Field = keyof typeof READS;
const REFRESH = Object.keys(READS) as Field[];

interface Pending {
  resolve(p: Bytes): void;
  reject(e: Error): void;
}
interface Waiter {
  kind: string;
  resolve(v: unknown): void;
  reject(e: Error): void;
}
type Log = (event: string, details?: Record<string, unknown>) => void;

export class BudsSession {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pending = new Map<string, Pending>();
  private waiters = new Set<Waiter>();
  private sequence = 1;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private closing: Promise<void> | null = null;
  private caps: Capabilities | null = null;
  private batteryTimer?: ReturnType<typeof setTimeout>;
  private expectDrop = false;
  private listeners = new Set<() => void>();
  private hearingListeners = new Set<(status: number) => void>();
  private log: Log;
  connected = false;
  lastRefresh = 0;
  subscribed: number[] = [];
  snapshot: Snapshot = { connection: "idle", live: false, state: { errors: {} } };

  constructor(log: Log = () => {}) {
    this.log = log;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.snapshot;
  onHearing(listener: (status: number) => void) {
    this.hearingListeners.add(listener);
    return () => this.hearingListeners.delete(listener);
  }
  private publish(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }
  get state() {
    return this.snapshot.state;
  }
  private setState(patch: Partial<DeviceState>) {
    this.publish({ state: { ...this.state, ...patch, updatedAt: new Date().toISOString() } });
  }
  supports(command: number) {
    return !!this.caps?.supports(command);
  }

  // A port this origin was already granted; opening it needs no click.
  async grantedPort() {
    const matches = ((await navigator.serial?.getPorts()) ?? []).filter(
      (port) => port.getInfo().bluetoothServiceClassId?.toLowerCase() === SERVICE,
    );
    return matches.length === 1 ? matches[0] : null;
  }
  async choose() {
    const serial = navigator.serial;
    if (!serial) throw Error("Open this page in Google Chrome to connect your earbuds.");
    return (
      (await this.grantedPort()) ??
      serial.requestPort({
        allowedBluetoothServiceClassIds: [SERVICE],
        filters: [{ bluetoothServiceClassId: SERVICE }],
      })
    );
  }
  async connect(port: SerialPort, { quiet = false } = {}) {
    if (this.connected || this.reader) throw Error("Already connected");
    if (this.closing) await this.closing;
    if (!this.expectDrop) this.publish({ connection: "connecting", reason: undefined });
    this.port = port;
    let opened = false;
    let stuck = false;
    try {
      const opening = port.open({ baudRate: 9600 });
      // An open that settles after we gave up would hold the channel with nobody reading it.
      opening.then(
        () => {
          opened = true;
          if (stuck) port.close().catch(() => {});
        },
        () => {},
      );
      await Promise.race([
        opening,
        delay(OPEN_TIMEOUT).then(() => {
          if (opened) return;
          stuck = true;
          throw Error(STUCK_OPEN);
        }),
      ]);
    } catch (error) {
      if (!this.expectDrop)
        this.publish(
          quiet && !stuck
            ? { connection: "idle", reason: undefined }
            : {
                connection: "disconnected",
                reason: stuck
                  ? STUCK_OPEN
                  : "Couldn’t reach the earbuds. Check they are connected in Bluetooth settings, and close any other tab or browser using them, then try again. An OpenBuds Mac app older than this release also holds this link. If this keeps happening, turn Bluetooth off and on.",
              },
        );
      throw error;
    }
    // From here on any failure must close the port, or the tab keeps the channel while showing "Connecting".
    try {
      this.connected = true;
      this.snapshot = { ...this.snapshot, live: false, state: { errors: {} } };
      const generation = ++this.generation;
      const reader = (this.reader = port.readable.getReader());
      const framer = new Framer(
        (frame) => this.receive(frame),
        (reason) => this.log("invalid_frame", { reason }),
      );
      void (async () => {
        try {
          while (this.connected && this.generation === generation) {
            const { value, done } = await reader.read();
            if (done) break;
            framer.push(value);
          }
          if (this.connected && this.generation === generation)
            void this.close("The earbuds disconnected.");
        } catch (error) {
          if (this.connected && this.generation === generation)
            void this.close((error as Error).message);
        }
      })();
      this.log("connected", { info: port.getInfo() });
      await delay(300);
      this.caps = capabilities(await this.query(0x0100));
      const identity = await this.query(0x0103);
      requireSuccess(identity, 4);
      if (identity.length !== 4) throw Error("Invalid model reply");
      const model = (identity[1] | (identity[2] << 8) | (identity[3] << 16))
        .toString(16)
        .padStart(6, "0");
      if (model !== MODEL) throw Error("This app supports OnePlus Buds 4 only.");
      this.setState({ model });
      await this.refresh();
      try {
        await this.subscribeEvents();
      } catch (error) {
        this.log("subscription_error", { message: (error as Error).message });
      }
      this.publish({ connection: "connected" });
    } catch (error) {
      await this.close((error as Error).message);
      throw error;
    }
  }
  async close(reason = "Disconnected.") {
    if (this.closing) return this.closing;
    this.connected = false;
    ++this.generation;
    clearTimeout(this.batteryTimer);
    for (const item of this.pending.values()) item.reject(Error(reason));
    this.pending.clear();
    for (const waiter of this.waiters) waiter.reject(Error(reason));
    this.waiters.clear();
    const reader = this.reader;
    this.reader = null;
    this.publish({
      connection: this.expectDrop ? "restarting" : "disconnected",
      reason,
      live: false,
    });
    this.closing = (async () => {
      try {
        await reader?.cancel();
      } catch {
        /* already closed */
      }
      try {
        reader?.releaseLock();
      } catch {
        /* already released */
      }
      try {
        await this.port?.close();
      } catch {
        /* already closed */
      }
      this.log("disconnected", { reason });
      this.queue = Promise.resolve();
    })();
    try {
      await this.closing;
    } finally {
      this.closing = null;
    }
  }
  // The buds restart their link after some changes; reopen the same granted port.
  private async reconnect(timeout = 25000) {
    const until = Date.now() + timeout;
    let last: Error | undefined;
    while (Date.now() < until) {
      await delay(2000);
      try {
        await this.connect(this.port!);
        return;
      } catch (error) {
        last = error as Error;
        if (/Buds 4 only/.test(last.message)) throw last;
      }
    }
    throw Error(
      `The earbuds did not come back (${last?.message ?? "timeout"}). Connect again when they are ready.`,
    );
  }
  query(command: number, payload: Bytes = [], timeout = 3500): Promise<Bytes> {
    const generation = this.generation;
    const work = this.queue
      .catch(() => {})
      .then(async () => {
        if (!this.connected || generation !== this.generation) throw Error("Session changed");
        const sequence = this.sequence;
        this.sequence = sequence === 254 ? 1 : sequence + 1;
        const bytes = encode(command, sequence, payload),
          key = `${command | 0x8000}:${sequence}`;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const answer = new Promise<Bytes>((resolve, reject) => {
          this.pending.set(key, { resolve, reject });
          timer = setTimeout(() => reject(Error(`No reply for ${hex(command)}`)), timeout);
        });
        answer.catch(() => {});
        try {
          const writer = this.port!.writable.getWriter();
          try {
            await writer.write(bytes);
          } finally {
            writer.releaseLock();
          }
          this.log("request", { command: hex(command), sequence, payload });
          return await answer;
        } finally {
          clearTimeout(timer);
          this.pending.delete(key);
          await delay(150);
        }
      });
    this.queue = work;
    return work;
  }
  private receive(frame: Frame) {
    const item = this.pending.get(`${frame.command}:${frame.sequence}`);
    if (item) {
      this.pending.delete(`${frame.command}:${frame.sequence}`);
      item.resolve(frame.payload);
      return;
    }
    const p = frame.payload,
      state = this.state;
    if (state.model !== MODEL) return;
    let patch: Partial<DeviceState> | undefined;
    if (frame.command === 0x0204) {
      const sub = p.slice(1),
        withStatus = [0, ...sub];
      if (p[0] === 1) {
        const battery = batteryPairs(sub);
        if (battery) patch = { battery: { ...state.battery, ...battery } };
      }
      if (p[0] === 2) {
        const wearing = wearPairs(sub);
        if (wearing) {
          patch = { wearing: { ...state.wearing, ...wearing } };
          // The case reports battery only with its lid open, and opening it does not always push a battery event.
          const caseVisible = (w?: Partial<Record<Side, WearState>>) =>
            !!(
              w?.case?.lidOpen ||
              (w?.left?.inCase && w.left.lidOpen) ||
              (w?.right?.inCase && w.right.lidOpen)
            );
          if (caseVisible(patch.wearing) && !caseVisible(state.wearing)) {
            clearTimeout(this.batteryTimer);
            this.batteryTimer = setTimeout(() => {
              if (this.connected) void this.read("battery");
            }, 800);
          }
        }
      }
      if (p[0] === 3 && p[1] === 1 && p[2] === 1)
        try {
          patch = { noise: noise(withStatus) };
        } catch {
          /* malformed */
        }
      if (p[0] === 3 && p[1] === 2 && p[2] === 1)
        try {
          patch = { holdCycle: holdCycle(withStatus) };
        } catch {
          /* malformed */
        }
      if (p[0] === 3 && p[1] === 4 && p[2] === 1)
        try {
          patch = { smartLevel: smartLevel(withStatus) };
        } catch {
          /* malformed */
        }
      if (p[0] === 4) {
        patch = { fit: fitResult(sub) };
        this.resolveWaiters("fit", patch.fit);
      }
      if (p[0] === 5 && p.length === 2)
        patch = { features: { ...state.features, [SWITCHES.gameMode]: p[1] } };
      if (p[0] === 8 && p.length >= 3) {
        patch = { hearingStatus: { kind: p[1], status: p[2] } };
        this.hearingListeners.forEach((l) => l(p[2]));
      }
    }
    if (frame.command === 0x0504 && p.length === 1) patch = { eq: p[0] };
    if (patch) {
      this.setState(patch);
      this.publish({ live: true });
    } else this.log("unhandled_frame", { command: hex(frame.command), payloadLength: p.length });
  }
  private waitFor<T>(kind: string, timeout: number) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => waiter.reject(Error("No result from the earbuds in time")),
        timeout,
      );
      const waiter: Waiter = {
        kind,
        resolve: (value) => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          reject(error);
        },
      };
      this.waiters.add(waiter);
    });
  }
  private resolveWaiters(kind: string, value: unknown) {
    for (const w of this.waiters) if (w.kind === kind) w.resolve(value);
  }

  async read(field: Field) {
    const [command, payload, decoder] = READS[field];
    if (!this.supports(command)) return;
    const errors = { ...this.state.errors };
    try {
      const value = decoder(await this.query(command, [...payload]));
      delete errors[field];
      this.setState({ [field]: value, errors });
    } catch (error) {
      errors[field] = (error as Error).message;
      this.setState({ errors });
      this.log("query_error", { command: hex(command), field, message: errors[field] });
    }
  }
  async refresh() {
    if (!this.connected) throw Error("Connect first");
    this.lastRefresh = Date.now();
    for (const field of REFRESH) await this.read(field);
  }
  private async reread<F extends Field>(field: F): Promise<DeviceState[F]> {
    await this.read(field);
    if (this.state.errors[field])
      throw Error(`Could not read back ${field}: ${this.state.errors[field]}`);
    return this.state[field];
  }
  private async subscribeEvents() {
    const p = await this.query(0x0200);
    requireSuccess(p, 2);
    if (p.length !== p[1] + 2) throw Error("Invalid offered-event list");
    const offered = p.slice(2),
      wanted = [1, 2, 3];
    if (this.supports(0x0405)) wanted.push(4);
    if (this.supports(0x040d)) wanted.push(8);
    const ids = wanted.filter((id) => offered.includes(id));
    if (ids.length && this.supports(0x0205)) {
      await this.query(0x0205, [ids.length, ...ids]);
      this.subscribed = ids;
    }
  }

  // Changes. Each one requires the buds' acknowledgement and, where a read exists, a matching read-back:
  // an ack of 00 alone does not prove a write took.
  private async send(name: string, command: number, payload: Bytes) {
    if (!this.connected) throw Error("Connect your earbuds first.");
    if (!this.supports(command)) throw Error(`${name} is not offered by these earbuds.`);
    this.log("write", { name, command: hex(command), payload });
    return acknowledged(command, await this.query(command, payload));
  }
  private async change<F extends Field>(
    name: string,
    command: number,
    payload: Bytes,
    field: F,
    check: (v: DeviceState[F]) => boolean,
  ) {
    await this.send(name, command, payload);
    const value = await this.reread(field);
    if (!check(value))
      throw Error(`${name}: the earbuds accepted the change but still report the old value.`);
    this.log("write_verified", { name, field });
  }
  async setNoise(mode: NoiseMode) {
    await this.change(
      `Noise mode ${mode}`,
      0x0404,
      noiseModePayload(mode),
      "noise",
      (v) => !!v && NOISE_REPORTS[mode].includes(v.raw),
    );
    if (mode === "smart" || mode === "anc") await this.read("smartLevel");
  }
  async setHoldCycle(modes: HoldMode[]) {
    if (!modes.length) throw Error("Touch and hold needs at least one mode.");
    const mask = holdCycleMask(modes);
    await this.change(
      "Touch-and-hold cycle",
      0x0404,
      holdCyclePayload(modes),
      "holdCycle",
      (v) => v?.mask === mask,
    );
  }
  async setSwitch(id: number, on: boolean, name = `Switch ${id}`) {
    await this.change(
      `${name} ${on ? "on" : "off"}`,
      0x0403,
      [id, on ? 1 : 0],
      "features",
      (v) => v?.[id] === (on ? 1 : 0),
    );
  }
  async setDualConnection(on: boolean) {
    await this.setSwitch(SWITCHES.dualConnection, on, "Dual connection");
    // The phone sends this state frame after every toggle (frame captured in QuickBuds docs/PROTOCOL.md:886; the flag meanings are unverified). Observed behavior; TODO: re-verify with a capture.
    await this.send("Dual connection follow-up", 0x0413, [8, 0, on ? 0 : 1]);
    await this.read("devices");
  }
  // Hi-Res and 3D Audio are mutually exclusive; any Hi-Res change restarts the buds' link.
  async setSpatial(on: boolean) {
    if (on && this.state.features?.[SWITCHES.hiRes] === 1) {
      await this.setSwitch(SWITCHES.spatial, true, "3D Audio");
      return this.writeHiRes(false);
    }
    return this.setSwitch(SWITCHES.spatial, on, "3D Audio");
  }
  async setHiRes(on: boolean) {
    if (on && this.state.features?.[SWITCHES.spatial] === 1)
      await this.setSwitch(SWITCHES.spatial, false, "3D Audio");
    return this.writeHiRes(on);
  }
  private async writeHiRes(on: boolean) {
    const id = SWITCHES.hiRes,
      name = `Hi-Res audio ${on ? "on" : "off"}`;
    this.expectDrop = true;
    try {
      try {
        await this.send(name, 0x0403, [id, on ? 1 : 0]);
      } catch (error) {
        if (this.connected) throw error;
      }
      const until = Date.now() + 8000;
      while (this.connected && Date.now() < until) await delay(250);
      if (!this.connected) await this.reconnect();
    } finally {
      this.expectDrop = false;
    }
    const value = await this.reread("features");
    if (value?.[id] !== (on ? 1 : 0))
      throw Error(`${name}: the earbuds still report the old value.`);
  }
  async setGesture(side: Ear, action: number, fn: number) {
    const table = this.state.gestures;
    if (!table) throw Error("Read the gesture table first.");
    const device = side === "Left" ? 1 : 2;
    await this.change(
      `${side} gesture ${action}`,
      0x0401,
      gestureTablePayload(table, side, action, fn),
      "gestures",
      (v) => {
        const slots =
          v?.filter((e) => e.device === device && e.action === action && e.button !== 6) ?? [];
        return slots.length > 0 && slots.every((e) => e.fn === fn);
      },
    );
  }
  async setCallGesture(action: number, fn: number) {
    await this.change(
      `Call gesture ${action}`,
      0x0401,
      callGesturePayload(action, fn),
      "gestures",
      (v) => {
        const slots = v?.filter((e) => e.button === 6 && e.action === action) ?? [];
        return slots.length > 0 && slots.every((e) => e.fn === fn);
      },
    );
  }
  setEq(id: number) {
    return this.change(`Equalizer ${id}`, 0x0406, [id], "eq", (v) => v === id);
  }
  async createPreset(name: string, bands: Band[]) {
    if ((this.state.customPresets?.length ?? 0) >= EQ_MAX_CUSTOM)
      throw Error(`The earbuds hold at most ${EQ_MAX_CUSTOM} custom presets.`);
    const before = new Set(this.state.customPresets?.map((p) => p.id));
    const isNew = (p: Preset) => !before.has(p.id) && p.name === name;
    await this.change(
      `Create preset ${name}`,
      0x0418,
      customEqPayload("create", { name, bands }),
      "customPresets",
      (v) => !!v?.some(isNew),
    );
    // Ids are renumbered after create/delete; always use the fresh list.
    return this.state.customPresets!.find(isNew)!;
  }
  async savePreset(preset: Preset) {
    const matches = (p: Preset) =>
      p.id === preset.id &&
      p.name === preset.name &&
      p.bands.length === preset.bands.length &&
      p.bands.every((b, i) => b.gain === preset.bands[i].gain);
    await this.change(
      `Save preset ${preset.name}`,
      0x0418,
      customEqPayload("save", preset),
      "customPresets",
      (v) => !!v?.some(matches),
    );
    await this.read("eq");
  }
  async deletePreset(preset: Preset) {
    const remaining = (this.state.customPresets ?? []).filter((p) => p.id !== preset.id).length;
    await this.change(
      `Delete preset ${preset.name}`,
      0x0418,
      customEqPayload("delete", preset),
      "customPresets",
      (v) =>
        v?.length === remaining && !v.some((p) => p.id === preset.id && p.name === preset.name),
    );
    await this.read("eq");
  }
  setBass(level: number) {
    return this.change(
      `BassWave level ${level}`,
      0x041b,
      bassPayload(level),
      "bass",
      (v) => v === level,
    );
  }
  // Every prompt-volume write plays a prompt in the ears.
  setPromptVolume(level: number) {
    return this.change(
      `Prompt volume ${level}`,
      0x0427,
      [level],
      "promptVolume",
      (v) => v === level,
    );
  }

  // Actions with no persistent state; only the acknowledgement can be checked.
  findEarbuds(on: boolean) {
    return this.send(on ? "Ring earbuds" : "Stop ringing", 0x0400, [on ? 1 : 0]);
  }
  async fitTest() {
    if (!this.subscribed.includes(4)) throw Error("These earbuds did not accept fit-test results.");
    const result = this.waitFor<FitResult>("fit", 15000);
    result.catch(() => {});
    await this.send("Fit test start", 0x0405, [1]);
    try {
      return await result;
    } finally {
      if (this.connected) await this.send("Fit test stop", 0x0405, [0]).catch(() => {});
    }
  }
  hearingTest(on: boolean) {
    return this.send(on ? "Hearing test start" : "Hearing test stop", 0x040d, [2, on ? 1 : 0]);
  }
  async playTone(side: number, freq: number, value: number) {
    await this.send("Stop tone", 0x040e, [4]);
    return this.send("Play tone", 0x040e, tonePayload(side, freq, value));
  }
  stopTone() {
    return this.send("Stop tone", 0x040e, [4]);
  }
  // Golden Sound apply order: read the filter (gives the enhance type), restore id, record, then the switch on. QuickBuds's apply sequence (docs/PROTOCOL.md section 20) gives restore, record, switch on; the leading filter read is observed behavior; TODO: re-verify with a capture.
  async applyHearing(levels: number[]) {
    if (levels.length !== 12) throw Error("A hearing result needs 12 values.");
    if (!this.supports(0x0116)) throw Error("Golden Sound is not offered by these earbuds.");
    const values = levels.map(hearingSnap),
      uid = crypto.getRandomValues(new Uint32Array(1))[0];
    const now = new Date(),
      pad = (n: number) => String(n).padStart(2, "0");
    const name = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const type = hearingEnhanceType(await this.query(0x0116, hearingFilterPayload(uid, values)));
    if (type > 0) await this.send("Golden Sound restore", 0x0411, [1, 1, 1, 0, type]);
    await this.change(
      "Golden Sound profile",
      0x040e,
      hearingRecordPayload(uid, name, values),
      "golden",
      (v) => v?.uid === uid && v.values.every((x, i) => x === values[i]),
    );
    await this.setSwitch(SWITCHES.goldenSound, true, "Golden Sound");
  }
}
