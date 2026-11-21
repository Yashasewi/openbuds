import { useSyncExternalStore } from "react";
import {
  EQ_BANDS,
  NOISE_NAMES,
  NOISE_REPORTS,
  SWITCHES,
  holdCycleMask,
  type Band,
  type Ear,
  type FitResult,
  type HoldMode,
  type NoiseMode,
  type Preset,
} from "./protocol";
import { BudsSession, type DeviceState, type Snapshot } from "./session";

const realSession = new BudsSession((event, details) => {
  if (import.meta.env.DEV) console.debug(event, details ?? "");
});

// ── Shared ringing signal so the ASCII Acoustic Chamber pulses during Find Earbuds ──
let ringingState = false;
const ringingListeners = new Set<() => void>();
function setRingingFlag(on: boolean) {
  if (ringingState === on) return;
  ringingState = on;
  ringingListeners.forEach((l) => l());
}
export function useRinging() {
  return useSyncExternalStore(
    (l) => {
      ringingListeners.add(l);
      return () => ringingListeners.delete(l);
    },
    () => ringingState,
  );
}

// ── Interactive Preview Mode (simulated OnePlus Buds 4, never touches Web Serial) ──
function makePreviewState(): DeviceState {
  return {
    model: "065414",
    firmware: "138.138.105",
    battery: {
      left: { percent: 94, charging: false },
      right: { percent: 91, charging: false },
      case: { percent: 78, charging: false },
    },
    wearing: {
      left: { raw: 3, inEar: true, inCase: false, lidOpen: false },
      right: { raw: 3, inEar: true, inCase: false, lidOpen: false },
      case: { raw: 0, inEar: false, inCase: true, lidOpen: false },
    },
    noise: { raw: 16, mode: "deep", name: "Noise cancelling, deep" },
    smartLevel: "medium",
    holdCycle: { mask: holdCycleMask(["anc", "transparency", "adaptive"]), modes: ["anc", "transparency", "adaptive"] },
    eq: 0,
    customPresets: [
      {
        id: 3,
        name: "Studio Vocal",
        bands: [
          { frequency: 62, gain: -1 },
          { frequency: 250, gain: 0 },
          { frequency: 1000, gain: 2 },
          { frequency: 4000, gain: 3 },
          { frequency: 8000, gain: 1 },
          { frequency: 16000, gain: 0 },
        ],
      },
    ],
    gestures: [
      { device: 1, side: "Left", button: 1, action: 1, fn: 1 },
      { device: 1, side: "Left", button: 1, action: 2, fn: 5 },
      { device: 1, side: "Left", button: 1, action: 3, fn: 3 },
      { device: 1, side: "Left", button: 1, action: 5, fn: 7 },
      { device: 1, side: "Left", button: 1, action: 4, fn: 8 },
      { device: 2, side: "Right", button: 1, action: 1, fn: 1 },
      { device: 2, side: "Right", button: 1, action: 2, fn: 6 },
      { device: 2, side: "Right", button: 1, action: 3, fn: 17 },
      { device: 2, side: "Right", button: 1, action: 5, fn: 7 },
      { device: 2, side: "Right", button: 1, action: 4, fn: 8 },
      { device: 4, side: "Both", button: 6, action: 2, fn: 29 },
      { device: 4, side: "Both", button: 6, action: 6, fn: 28 },
    ],
    features: {
      [SWITCHES.wearDetection]: 1,
      [SWITCHES.gameMode]: 0,
      [SWITCHES.goldenSound]: 1,
      [SWITCHES.dualConnection]: 1,
      [SWITCHES.hiRes]: 0,
      [SWITCHES.spatial]: 0,
      [SWITCHES.smartVolume]: 1,
      [SWITCHES.bassWave]: 1,
    },
    devices: [
      { name: "MacBook Pro", connected: true, playing: true, thisDevice: true },
      { name: "Pixel 9 Pro", connected: true, playing: false, thisDevice: false },
    ],
    codec: 2, // AAC
    bass: 2,
    promptVolume: 6,
    golden: { uid: 1, name: "Desk Profile", values: [] },
    fit: { left: "Good fit", right: "Good fit" },
    errors: {},
    updatedAt: new Date().toISOString(),
  };
}

let previewActive =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";
let previewSnapshot: Snapshot = {
  connection: "connected",
  live: true,
  state: makePreviewState(),
};
const previewListeners = new Set<() => void>();
const previewDelay = (ms = 140) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function emitPreview() {
  previewListeners.forEach((l) => l());
}

function updatePreview(mutator: (prev: DeviceState) => DeviceState) {
  previewSnapshot = {
    ...previewSnapshot,
    state: {
      ...mutator(previewSnapshot.state),
      updatedAt: new Date().toISOString(),
    },
  };
  emitPreview();
}

export function enterPreview() {
  previewActive = true;
  previewSnapshot = {
    connection: "connected",
    live: true,
    state: makePreviewState(),
  };
  setRingingFlag(false);
  emitPreview();
}

export function exitPreview() {
  if (!previewActive) return;
  previewActive = false;
  setRingingFlag(false);
  emitPreview();
}

export function usePreview() {
  return useSyncExternalStore(
    (l) => {
      previewListeners.add(l);
      return () => previewListeners.delete(l);
    },
    () => previewActive,
  );
}

// Unified session facade: delegates cleanly to real Web Serial session or simulated preview.
export const session = {
  get connected() {
    return previewActive ? true : realSession.connected;
  },
  supports(command: number) {
    return previewActive ? true : realSession.supports(command);
  },
  async refresh() {
    if (!previewActive) return realSession.refresh();
    await previewDelay(180);
    updatePreview((s) => ({ ...s }));
  },
  async setNoise(mode: NoiseMode) {
    if (!previewActive) return realSession.setNoise(mode);
    await previewDelay();
    const resolved: NoiseMode = mode === "anc" ? "deep" : mode;
    const raw = NOISE_REPORTS[resolved][0] ?? 16;
    updatePreview((s) => ({
      ...s,
      noise: { raw, mode: resolved, name: NOISE_NAMES.get(raw) ?? resolved },
    }));
  },
  async setHoldCycle(modes: HoldMode[]) {
    if (!previewActive) return realSession.setHoldCycle(modes);
    await previewDelay();
    updatePreview((s) => ({
      ...s,
      holdCycle: { mask: holdCycleMask(modes), modes: [...modes] },
    }));
  },
  async setEq(id: number) {
    if (!previewActive) return realSession.setEq(id);
    await previewDelay();
    updatePreview((s) => ({ ...s, eq: id }));
  },
  async createPreset(name: string, bands: Band[]): Promise<Preset> {
    if (!previewActive) return realSession.createPreset(name, bands);
    await previewDelay();
    const existing = previewSnapshot.state.customPresets ?? [];
    const nextId = Math.max(2, ...existing.map((p) => p.id)) + 1;
    const created: Preset = {
      id: nextId,
      name,
      bands: bands.length ? bands : EQ_BANDS.map((frequency) => ({ frequency, gain: 0 })),
    };
    updatePreview((s) => ({
      ...s,
      eq: nextId,
      customPresets: [...(s.customPresets ?? []), created],
    }));
    return created;
  },
  async savePreset(preset: Preset) {
    if (!previewActive) return realSession.savePreset(preset);
    await previewDelay();
    updatePreview((s) => ({
      ...s,
      eq: preset.id,
      customPresets: (s.customPresets ?? []).map((p) => (p.id === preset.id ? preset : p)),
    }));
  },
  async deletePreset(preset: Preset) {
    if (!previewActive) return realSession.deletePreset(preset);
    await previewDelay();
    updatePreview((s) => ({
      ...s,
      eq: s.eq === preset.id ? 0 : s.eq,
      customPresets: (s.customPresets ?? []).filter((p) => p.id !== preset.id),
    }));
  },
  async setBass(level: number) {
    if (!previewActive) return realSession.setBass(level);
    await previewDelay();
    updatePreview((s) => ({ ...s, bass: level }));
  },
  async setSwitch(id: number, on: boolean, label?: string) {
    if (!previewActive) return realSession.setSwitch(id, on, label);
    await previewDelay();
    updatePreview((s) => ({
      ...s,
      features: { ...s.features, [id]: on ? 1 : 0 },
    }));
  },
  async setHiRes(on: boolean) {
    if (!previewActive) return realSession.setHiRes(on);
    await previewDelay(220);
    updatePreview((s) => {
      const nextFeatures: Record<number, number> = {
        ...s.features,
        [SWITCHES.hiRes]: on ? 1 : 0,
      };
      if (on) nextFeatures[SWITCHES.spatial] = 0;
      return { ...s, features: nextFeatures };
    });
  },
  async setSpatial(on: boolean) {
    if (!previewActive) return realSession.setSpatial(on);
    await previewDelay();
    updatePreview((s) => {
      const nextFeatures: Record<number, number> = {
        ...s.features,
        [SWITCHES.spatial]: on ? 1 : 0,
      };
      if (on) nextFeatures[SWITCHES.hiRes] = 0;
      return { ...s, features: nextFeatures };
    });
  },
  async setDualConnection(on: boolean) {
    if (!previewActive) return realSession.setDualConnection(on);
    await previewDelay();
    updatePreview((s) => ({
      ...s,
      features: { ...s.features, [SWITCHES.dualConnection]: on ? 1 : 0 },
    }));
  },
  async setGesture(ear: Ear, actionId: number, fn: number) {
    if (!previewActive) return realSession.setGesture(ear, actionId, fn);
    await previewDelay();
    updatePreview((s) => ({
      ...s,
      gestures: (s.gestures ?? []).map((g) =>
        g.side === ear && g.button !== 6 && g.action === actionId ? { ...g, fn } : g,
      ),
    }));
  },
  async setCallGesture(actionId: number, fn: number) {
    if (!previewActive) return realSession.setCallGesture(actionId, fn);
    await previewDelay();
    updatePreview((s) => ({
      ...s,
      gestures: (s.gestures ?? []).map((g) =>
        g.button === 6 && g.action === actionId ? { ...g, fn } : g,
      ),
    }));
  },
  async setPromptVolume(level: number) {
    if (!previewActive) return realSession.setPromptVolume(level);
    await previewDelay();
    updatePreview((s) => ({ ...s, promptVolume: level }));
  },
  async findEarbuds(on: boolean) {
    if (!previewActive) {
      await realSession.findEarbuds(on);
      setRingingFlag(on);
      return;
    }
    await previewDelay();
    setRingingFlag(on);
  },
  async fitTest(): Promise<FitResult> {
    if (!previewActive) return realSession.fitTest();
    await previewDelay(500);
    const result: FitResult = { left: "Good fit", right: "Good fit" };
    updatePreview((s) => ({ ...s, fit: result }));
    return result;
  },
  onHearing(fn: (status: number) => void) {
    return realSession.onHearing(fn);
  },
  async hearingTest(on: boolean) {
    if (!previewActive) return realSession.hearingTest(on);
    await previewDelay(120);
  },
  async playTone(ear: number, band: number, stop: number) {
    if (!previewActive) return realSession.playTone(ear, band, stop);
    await previewDelay(80);
  },
  async stopTone() {
    if (!previewActive) return realSession.stopTone();
    await previewDelay(60);
  },
  async applyHearing(values: number[]) {
    if (!previewActive) return realSession.applyHearing(values);
    await previewDelay(260);
    updatePreview((s) => ({
      ...s,
      golden: { uid: 2, name: "Just measured", values },
      features: { ...s.features, [SWITCHES.goldenSound]: 1 },
    }));
  },
};

export function useBuds() {
  const realSnap = useSyncExternalStore(realSession.subscribe, realSession.getSnapshot);
  const inPreview = usePreview();
  const previewSnap = useSyncExternalStore(
    (l) => {
      previewListeners.add(l);
      return () => previewListeners.delete(l);
    },
    () => previewSnapshot,
  );
  return inPreview ? previewSnap : realSnap;
}

// After the user presses Disconnect, stay disconnected until they connect again.
let userDisconnected = false;
export async function connect() {
  exitPreview();
  userDisconnected = false;
  await realSession.connect(await realSession.choose());
}
export function disconnect() {
  if (previewActive) {
    exitPreview();
    return;
  }
  userDisconnected = true;
  setRingingFlag(false);
  void realSession.close("You disconnected.");
}
// The earbuds take one RFCOMM control link per computer. A hidden tab that holds it locks out other tabs
// and older OpenBuds Mac apps (the current one uses GATT), so connect on our own only while visible,
// and let go after a while in the background.
const RELEASE_HIDDEN_AFTER = 30000;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
async function autoConnect() {
  const { connection } = realSession.snapshot;
  if (
    previewActive ||
    document.visibilityState !== "visible" ||
    userDisconnected ||
    realSession.connected ||
    connection === "connecting" ||
    connection === "restarting"
  )
    return;
  const port = await realSession.grantedPort();
  if (port) await realSession.connect(port, { quiet: true }).catch(() => {});
}
// Only some changes are pushed by the earbuds; others (gestures, switches changed on the phone) need a read.
function rereadOnReturn() {
  if (
    previewActive ||
    document.visibilityState !== "visible" ||
    !realSession.connected ||
    action.phase === "pending"
  )
    return;
  if (Date.now() - realSession.lastRefresh < 15000) return;
  void realSession.refresh().catch(() => {});
}
function releaseWhenHidden() {
  clearTimeout(releaseTimer);
  if (document.visibilityState === "visible") return void autoConnect();
  releaseTimer = setTimeout(() => {
    if (document.visibilityState === "visible") return;
    const { connection } = realSession.snapshot;
    // Let a pending change or an earbud restart finish, then check again.
    if (action.phase === "pending" || connection === "connecting" || connection === "restarting")
      return releaseWhenHidden();
    if (connection !== "connected") return;
    setRingingFlag(false);
    void realSession.close(
      "Paused while this tab was in the background, so other apps can use your earbuds.",
    );
  }, RELEASE_HIDDEN_AFTER);
}
let started = false;
export function startBackground() {
  if (started) return;
  started = true;
  void autoConnect();
  // Give the earbuds a moment to bring up their services after the link returns, as the Mac app does.
  navigator.serial?.addEventListener(
    "connect",
    () => void setTimeout(() => void autoConnect(), 1500),
  );
  document.addEventListener("visibilitychange", rereadOnReturn);
  document.addEventListener("visibilitychange", releaseWhenHidden);
  window.addEventListener("focus", rereadOnReturn);
  window.addEventListener("pagehide", () => {
    if (realSession.connected) void realSession.close("This tab closed.");
  });
}

// One change at a time: a write and its read-back must not interleave with another write.
export type Phase = "pending" | "done" | "error";
export interface ActionState {
  key: string | null;
  phase?: Phase;
  message?: string;
}
let action: ActionState = { key: null };
const actionListeners = new Set<() => void>();
let clearTimer: ReturnType<typeof setTimeout> | undefined;
function setAction(next: ActionState) {
  action = next;
  actionListeners.forEach((l) => l());
}
const subscribeAction = (l: () => void) => {
  actionListeners.add(l);
  return () => actionListeners.delete(l);
};

export async function run<T>(
  key: string,
  work: () => Promise<T>,
  success?: string | ((result: T) => string),
) {
  if (action.phase === "pending" || !session.connected) return;
  clearTimeout(clearTimer);
  setAction({ key, phase: "pending" });
  try {
    const result = await work();
    setAction({
      key,
      phase: "done",
      message: typeof success === "function" ? success(result) : success,
    });
    clearTimer = setTimeout(() => setAction({ key: null }), success ? 6000 : 1800);
    return result;
  } catch (error) {
    setAction({ key, phase: "error", message: (error as Error).message });
    clearTimer = setTimeout(() => setAction({ key: null }), 9000);
  }
}

export function useAction(key?: string) {
  const current = useSyncExternalStore(subscribeAction, () => action);
  const busy = current.phase === "pending";
  return { busy, status: key && current.key === key ? current : undefined };
}

// Promise-based confirmation, rendered by <ConfirmHost/>.
export interface ConfirmRequest {
  title: string;
  body: string;
  action: string;
  resolve(ok: boolean): void;
}
let confirmRequest: ConfirmRequest | null = null;
const confirmListeners = new Set<() => void>();
export function confirm(title: string, body: string, actionLabel = "Continue") {
  return new Promise<boolean>((resolve) => {
    confirmRequest = {
      title,
      body,
      action: actionLabel,
      resolve: (ok) => {
        confirmRequest = null;
        confirmListeners.forEach((l) => l());
        resolve(ok);
      },
    };
    confirmListeners.forEach((l) => l());
  });
}
export function useConfirmRequest() {
  return useSyncExternalStore(
    (l) => {
      confirmListeners.add(l);
      return () => confirmListeners.delete(l);
    },
    () => confirmRequest,
  );
}
