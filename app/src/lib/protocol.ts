// Protocol facts: PROTOCOL.md.
export const SERVICE = "0000079a-d102-11e1-9b23-00025b00a5a5";
export const MODEL = "065414";

export type Bytes = number[];
const isByte = (x: number) => Number.isInteger(x) && x >= 0 && x <= 255;
const same = (p: Bytes, q: Bytes) => p.length === q.length && p.every((x, i) => x === q[i]);
const oneOf =
  (...forms: Bytes[]) =>
  (p: Bytes) =>
    forms.some((form) => same(p, form));
const empty = (p: Bytes) => !p.length;
export const s8 = (v: number) => v & 255;
const signed = (b: number) => (b > 127 ? b - 256 : b);
const le = (bytes: Bytes) => bytes.reduce((value, b, i) => value + b * 2 ** (8 * i), 0);
function minimalLE(value: number): Bytes {
  const out: Bytes = [];
  do {
    out.push(value & 255);
    value = Math.floor(value / 256);
  } while (value);
  return out;
}

// Buds 4 SET bits for 0x0404 01 01; reports use a different table (NOISE_NAMES).
export const NOISE_SET_BITS = {
  off: 0,
  anc: 1,
  transparency: 2,
  deep: 4,
  medium: 5,
  light: 6,
  smart: 7,
  adaptive: 11,
} as const;
export type NoiseMode = keyof typeof NOISE_SET_BITS;
export const ANC_LEVELS = ["smart", "deep", "medium", "light"] as const;
export type AncLevel = (typeof ANC_LEVELS)[number];
const NOISE_SET_ALLOWED: number[] = Object.values(NOISE_SET_BITS);
export const HOLD_CYCLE_BITS = { off: 0, anc: 1, transparency: 2, adaptive: 11 } as const;
export type HoldMode = keyof typeof HOLD_CYCLE_BITS;
const HOLD_CYCLE_MASK = Object.values(HOLD_CYCLE_BITS).reduce<number>((m, b) => m | (1 << b), 0);
// Switch ids returned by this firmware's 0x010D reply.
export const SWITCHES = {
  wearDetection: 4,
  gameMode: 6,
  goldenSound: 11,
  dualConnection: 17,
  hiRes: 24,
  spatial: 27,
  smartVolume: 28,
  bassWave: 29,
} as const;
const SWITCH_IDS = new Set<number>(Object.values(SWITCHES));
// Measured Buds 4 function bytes; a whole-table write can carry any of them back unchanged.
const KNOWN_FUNCTIONS = new Set([0, 1, 3, 5, 6, 7, 8, 10, 11, 12, 17, 28, 29]);
export const HEARING_STOPS = [
  -120, -88, -55, -52, -49, -45, -41, -38, -35, -30, -25, -22, -19, -15, -11, -8, -5, -1, 3, 5, 7,
  10, 13, 15, 17,
];
const HEARING_RESULTS = [-55, -49, -41, -35, -25, -19, -11, -5, 3, 7, 13, 17];
export const HEARING_START = 9;
export const HEARING_LOUD = 21;
export const EQ_BANDS = [62, 250, 1000, 4000, 8000, 16000];
export const EQ_GAIN = 6;
export const EQ_MAX_CUSTOM = 3;

const validHearingInfo = (p: Bytes) =>
  p.length === 36 &&
  Array.from({ length: 12 }, (_, i) => p.slice(i * 3, i * 3 + 3)).every(
    ([side, freq, value], i) =>
      side === Math.floor(i / 6) + 1 &&
      freq === (i % 6) + 1 &&
      HEARING_RESULTS.includes(signed(value)),
  );
const ascii = (p: Bytes, max = 32) => p.length <= max && p.every((b) => b >= 32 && b < 127);
function validNoiseSet(p: Bytes) {
  if (p[0] === 1 && p[1] === 1)
    return NOISE_SET_ALLOWED.some(
      (b) => p.length === 3 + Math.floor(b / 8) && le(p.slice(2)) === 2 ** b,
    );
  if (p[0] === 2 && p[1] === 1 && p.length >= 3 && p.length <= 6) {
    const mask = le(p.slice(2));
    return mask > 0 && !(mask & ~HOLD_CYCLE_MASK) && same(p.slice(2), minimalLE(mask));
  }
  return false;
}
function validGestureTable(p: Bytes) {
  if (p[0] < 1 || p[0] > 64 || p.length !== 1 + p[0] * 4) return false;
  for (let i = 1; i < p.length; i += 4) {
    const [dev, button, action, fn] = p.slice(i, i + 4);
    if (
      ![1, 2, 4].includes(dev) ||
      button < 1 ||
      button > 6 ||
      action < 1 ||
      action > 6 ||
      !KNOWN_FUNCTIONS.has(fn)
    )
      return false;
  }
  return true;
}
function validCustomEq(p: Bytes) {
  if (![1, 2, 3].includes(p[0]) || p[1] !== s8(-EQ_GAIN) || p[2] !== EQ_GAIN) return false;
  const nameLength = p[4];
  if (!nameLength || !ascii(p.slice(5, 5 + nameLength), 16)) return false;
  const count = p[5 + nameLength];
  const bands = p.slice(6 + nameLength);
  if (count < 1 || count > 10 || bands.length !== count * 3) return false;
  for (let i = 0; i < bands.length; i += 3)
    if (Math.abs(signed(bands[i + 2])) > EQ_GAIN) return false;
  return p[0] === 1 ? p[3] === 0 : p[3] > 2;
}
const validTone = (p: Bytes) =>
  p.length === 5 &&
  p[0] === 3 &&
  p[1] === 1 &&
  [1, 2].includes(p[2]) &&
  p[3] >= 1 &&
  p[3] <= 6 &&
  HEARING_STOPS.includes(signed(p[4]));
const validRecord = (p: Bytes) =>
  p.length >= 42 &&
  p[0] === 3 &&
  p[1] === 12 &&
  validHearingInfo(p.slice(2, 38)) &&
  ascii(p.slice(42));

// Allowlist: every command and payload shape this client may send. Firmware/OTA, resets, pairing,
// ear scans, cloud features and anything undocumented for Buds 4 are absent and therefore rejected.
const COMMANDS = new Map<number, (p: Bytes) => boolean>([
  [0x0100, empty],
  [0x0103, empty],
  [0x0105, empty],
  [0x0106, empty],
  [0x0108, empty],
  [0x0109, empty],
  [0x010c, (p) => p.length === 2 && [1, 2, 4].includes(p[0]) && p[1] === 1],
  [0x010d, (p) => p.length > 1 && p[0] === p.length - 1],
  [0x010f, empty],
  [0x0112, empty],
  [0x0114, empty],
  [0x0115, empty],
  [0x0122, empty],
  [0x0124, empty],
  [0x0130, empty],
  [0x0200, empty],
  [0x0116, (p) => p.length === 41 && p[0] === 12 && validHearingInfo(p.slice(1, 37))],
  [
    0x0205,
    (p) =>
      p.length >= 2 &&
      p[0] === p.length - 1 &&
      p.slice(1).every((x) => [1, 2, 3, 4, 8].includes(x)) &&
      new Set(p.slice(1)).size === p.length - 1,
  ],
  [0x0400, oneOf([0], [1])],
  [0x0401, validGestureTable],
  [0x0403, (p) => p.length === 2 && SWITCH_IDS.has(p[0]) && p[1] <= 1],
  [0x0404, validNoiseSet],
  [0x0405, oneOf([0], [1])],
  [0x0406, (p) => p.length === 1 && p[0] <= 15],
  [0x040d, oneOf([2, 0], [2, 1])],
  [0x040e, (p) => same(p, [4]) || validTone(p) || validRecord(p)],
  [0x0411, (p) => p.length === 5 && same(p.slice(0, 4), [1, 1, 1, 0]) && p[4] > 0],
  [0x0413, oneOf([8, 0, 0], [8, 0, 1])],
  [0x0418, validCustomEq],
  [0x041b, (p) => p.length === 3 && p[0] === 0xfb && p[1] === 5 && Math.abs(signed(p[2])) <= 5],
  [0x0427, (p) => p.length === 1 && p[0] >= 1 && p[0] <= 10],
]);
export const hex = (command: number) => command.toString(16).padStart(4, "0");
export function encode(command: number, sequence: number, payload: Bytes = []): Uint8Array {
  const valid = COMMANDS.get(command);
  if (!valid) throw Error("Command outside allowed scope");
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 254)
    throw Error("Invalid sequence");
  if (payload.length > 512 || !payload.every(isByte)) throw Error("Invalid payload");
  if (!valid(payload)) throw Error(`Invalid payload for ${hex(command)}`);
  let size = 7 + payload.length;
  const length: Bytes = [];
  do {
    const byte = size & 127;
    size = Math.floor(size / 128);
    length.push(byte | (size ? 128 : 0));
  } while (size);
  return Uint8Array.from([
    0xaa,
    ...length,
    0,
    0,
    command & 255,
    command >> 8,
    sequence,
    payload.length & 255,
    payload.length >> 8,
    ...payload,
  ]);
}

export interface Frame {
  command: number;
  sequence: number;
  payload: Bytes;
  bytes: Bytes;
}
export class Framer {
  buffer: Bytes = [];
  private onFrame: (frame: Frame) => void;
  private onInvalid: (reason: string) => void;
  constructor(onFrame: (frame: Frame) => void, onInvalid: (reason: string) => void = () => {}) {
    this.onFrame = onFrame;
    this.onInvalid = onInvalid;
  }
  push(chunk: Uint8Array) {
    if (chunk.length > 65536 || this.buffer.length + chunk.length > 65536) {
      this.buffer = [];
      this.onInvalid("Receive buffer limit");
      return;
    }
    this.buffer.push(...chunk);
    while (this.buffer.length) {
      if (this.buffer[0] !== 0xaa) {
        this.buffer.shift();
        continue;
      }
      let size = 0,
        count = 0,
        complete = false;
      for (let i = 1; i < this.buffer.length && i <= 3; i++) {
        const byte = this.buffer[i];
        size += (byte & 127) * 2 ** (7 * count++);
        if (!(byte & 128)) {
          complete = true;
          break;
        }
      }
      if (!complete) {
        if (this.buffer.length >= 4) {
          this.buffer.shift();
          continue;
        }
        return;
      }
      if (size < 7 || size > 8192) {
        this.buffer.shift();
        this.onInvalid("Invalid frame size");
        continue;
      }
      const prefix = 1 + count,
        total = prefix + size;
      if (this.buffer.length < total) return;
      const bytes = this.buffer.splice(0, total),
        n = bytes[prefix + 5] | (bytes[prefix + 6] << 8);
      if (bytes[prefix] || bytes[prefix + 1] || n !== size - 7) {
        this.onInvalid("Unsupported flags or inconsistent length");
        continue;
      }
      this.onFrame({
        command: bytes[prefix + 2] | (bytes[prefix + 3] << 8),
        sequence: bytes[prefix + 4],
        payload: bytes.slice(prefix + 7),
        bytes,
      });
    }
  }
}

export function requireSuccess(p: Bytes, minimum = 1) {
  if (p.length < minimum) throw Error("Incomplete reply");
  if (p[0] !== 0) throw Error(`Device declined query (status ${p[0]})`);
}
export class RefusedError extends Error {
  command: number;
  status: number;
  constructor(command: number, status: number) {
    super(
      status === 14
        ? "Put at least one earbud in your ear, then try again."
        : `The earbuds refused the change (status ${status}).`,
    );
    this.command = command;
    this.status = status;
  }
}
export function acknowledged(command: number, p: Bytes) {
  if (!p.length) throw Error("Empty acknowledgement");
  if (p[0] !== 0) throw new RefusedError(command, p[0]);
  return p;
}

export type Side = "left" | "right" | "case";
export interface BatteryLevel {
  percent: number | null;
  charging: boolean;
}
export interface WearState {
  raw: number;
  inEar: boolean;
  inCase: boolean;
  lidOpen: boolean;
}
export function batteryPairs(p: Bytes, status = false): Partial<Record<Side, BatteryLevel>> | null {
  return pairsOf(p, status, true) as Partial<Record<Side, BatteryLevel>> | null;
}
export function wearPairs(p: Bytes): Partial<Record<Side, WearState>> | null {
  return pairsOf(p, false, false) as Partial<Record<Side, WearState>> | null;
}
function pairsOf(p: Bytes, status: boolean, battery: boolean) {
  for (const offset of status ? [1] : [0, 1]) {
    if (offset === 1 && p[0] !== 0) continue;
    const count = p[offset];
    if (!Number.isInteger(count) || count > 3 || p.length !== offset + 1 + 2 * count) continue;
    const result: Partial<Record<Side, BatteryLevel | WearState>> = {};
    const seen = new Set<number>();
    for (let i = 0; i < count; i++) {
      const id = p[offset + 1 + i * 2],
        value = p[offset + 2 + i * 2];
      if (id < 1 || id > 3 || seen.has(id) || (battery && (value & 127) > 100)) return null;
      seen.add(id);
      const side = (["left", "right", "case"] as const)[id - 1];
      result[side] = battery
        ? { percent: value & 127 || null, charging: !!(value & 128) }
        : { raw: value, inEar: !!(value & 2), inCase: !(value & 1), lidOpen: !!(value & 4) };
    }
    return result;
  }
  return null;
}

// Bit n of the 0x8100 bitmap enables these commands (QuickBuds desktop/src/types.rs:205 BIT_COMMANDS; QuickBuds labels it [VENDOR], docs/PROTOCOL.md:265). TODO: re-verify with a capture.
const BIT_COMMANDS: number[][] = [
  [0x0105],
  [0x0106],
  [0x0107],
  [0x0108, 0x0401, 0x0416],
  [0x0109],
  [0x0400],
  [0x0402],
  [0x0403],
  [0x010c, 0x0404],
  [0x0405],
  [0x0406, 0x010f],
  [0x0407],
  [],
  [0x0408],
  [0x0409],
  [],
  [],
  [0x0114],
  [],
  [0x040e, 0x040d, 0x0115, 0x0116],
  [0x040f],
  [0x0410, 0x0119],
  [0x0205],
  [0x0f00],
  [],
  [0x0118, 0x0411],
  [0x011a, 0x0412],
  [0x011c, 0x0413],
  [],
  [0x0112, 0x040b],
  [0x011e, 0x011f, 0x0415],
  [0x040d],
  [],
  [0x0121, 0x0417],
  [0x0122, 0x0418],
  [],
  [0x011d, 0x0414],
  [0x0123, 0x041a],
  [0x0124, 0x041b],
  [0x0125, 0x041c, 0x0127, 0x041d, 0x041f],
  [0x0421, 0x0023, 0x0024, 0x0022, 0x0126, 0x0129],
  [0xef01],
  [0xef02],
  [0xef03, 0x041e],
  [0x0420],
  [0x001c],
  [],
  [0x0422, 0x012a],
  [0xef04],
  [0x0423, 0x012b],
  [],
  [0x0424],
  [0xef06],
  [],
  [],
  [0x0425, 0x012e, 0x0426],
  [0x012f],
  [0x0427, 0x0130],
  [0x0131, 0x0428],
  [0x0429, 0x0132],
  [0x0014],
  [0x042d, 0x0133],
  [0x042e],
  [0xef07],
  [0xef08],
  [0xef09],
  [0x0431, 0x0134],
];
const ALWAYS = [
  0x0100, 0x0101, 0x0102, 0x0103, 0x0104, 0x0106, 0x010b, 0x010d, 0x0200, 0x0f00, 0x0f03, 0x0f04,
];
export interface Capabilities {
  bitmap: Bytes;
  supports(command: number): boolean;
}
export function capabilities(p: Bytes): Capabilities {
  requireSuccess(p, 2);
  const offered = new Set(ALWAYS);
  for (let bit = 0; bit < Math.min((p.length - 1) * 8, BIT_COMMANDS.length); bit++)
    if ((p[1 + (bit >> 3)] >> (bit & 7)) & 1) BIT_COMMANDS[bit].forEach((c) => offered.add(c));
  return { bitmap: p.slice(1), supports: (command) => offered.has(command) };
}

export const NOISE_NAMES = new Map([
  [8, "Off"],
  [2, "Noise cancelling"],
  [16, "Noise cancelling, deep"],
  [32, "Noise cancelling, medium"],
  [64, "Noise cancelling, light"],
  [128, "Noise cancelling, smart"],
  [256, "Transparency"],
  [512, "Voice transparency"],
  [2048, "Adaptive"],
]);
// What 0x810C 01 01 reports after each SET; any ANC level satisfies a plain 'anc' SET.
export const NOISE_REPORTS: Record<NoiseMode, number[]> = {
  off: [8],
  transparency: [256, 512],
  adaptive: [2048],
  deep: [16],
  medium: [32],
  light: [64],
  smart: [128],
  anc: [2, 16, 32, 64, 128],
};
export function noiseModeOf(raw: number): NoiseMode | null {
  const found = (Object.entries(NOISE_REPORTS) as [NoiseMode, number[]][]).find(
    ([mode, raws]) => mode !== "anc" && raws.includes(raw),
  );
  return found?.[0] ?? (raw === 2 ? "anc" : null);
}
export interface NoiseState {
  raw: number;
  mode: NoiseMode | null;
  name: string;
}
export function noise(p: Bytes): NoiseState {
  requireSuccess(p, 4);
  if (p[1] !== 1 || p[2] !== 1 || p.length > 7) throw Error("Unrecognized noise reply");
  const raw = le(p.slice(3));
  return { raw, mode: noiseModeOf(raw), name: NOISE_NAMES.get(raw) ?? "Unrecognized mode" };
}
export interface HoldCycle {
  mask: number;
  modes: HoldMode[];
}
export function holdCycle(p: Bytes): HoldCycle {
  requireSuccess(p, 4);
  if (p[1] !== 2 || p[2] !== 1 || p.length > 7) throw Error("Unrecognized hold-cycle reply");
  const mask = le(p.slice(3));
  return {
    mask,
    modes: (Object.keys(HOLD_CYCLE_BITS) as HoldMode[]).filter(
      (m) => mask & (1 << HOLD_CYCLE_BITS[m]),
    ),
  };
}
export function smartLevel(p: Bytes): NoiseMode | null {
  requireSuccess(p, 4);
  if (p[1] !== 4 || p[2] !== 1 || p.length > 7) throw Error("Unrecognized Smart level reply");
  const mask = le(p.slice(3));
  return (
    (Object.entries(NOISE_SET_BITS) as [NoiseMode, number][]).find(
      ([, bit]) => mask === 2 ** bit,
    )?.[0] ?? null
  );
}
export const noiseModePayload = (mode: NoiseMode): Bytes => [
  1,
  1,
  ...minimalLE(2 ** NOISE_SET_BITS[mode]),
];
export const holdCycleMask = (modes: HoldMode[]) =>
  modes.reduce((mask, mode) => mask | (1 << HOLD_CYCLE_BITS[mode]), 0);
export const holdCyclePayload = (modes: HoldMode[]): Bytes => [
  2,
  1,
  ...minimalLE(holdCycleMask(modes)),
];

export type FeatureStates = Record<number, number>;
export function featureStates(p: Bytes): FeatureStates {
  requireSuccess(p, 2);
  if (p.length !== 2 + p[1] * 2) throw Error("Invalid feature count");
  const result: FeatureStates = {};
  for (let i = 2; i < p.length; i += 2) {
    if (p[i] in result) throw Error("Duplicate feature");
    result[p[i]] = p[i + 1];
  }
  return result;
}

export const ACTIONS: Record<number, string> = {
  1: "Single tap",
  2: "Double tap",
  3: "Triple tap",
  4: "Touch and hold",
  5: "Slide",
  6: "Long hold",
};
export const FUNCTIONS: Record<number, string> = {
  0: "Nothing",
  1: "Play or pause",
  3: "Voice assistant",
  5: "Previous track",
  6: "Next track",
  7: "Volume",
  8: "Cycle noise modes",
  10: "Change track",
  11: "Volume up",
  12: "Volume down",
  13: "Switch devices",
  17: "Game mode",
  28: "Decline call",
  29: "Answer or end call",
};
// Buds 4 gesture and call menus, mapped to measured function bytes. Call menus: QuickBuds captures (QuickBuds docs/PROTOCOL.md:1009). Gesture lists: no independent source; QuickBuds' Buds 4 menu entry (line 1013) is a comparison with the vendor app, not a capture. TODO: re-verify each list with a capture.
export const GESTURE_MENUS: Record<number, number[]> = {
  1: [0, 1],
  2: [0, 1, 5, 6, 3, 17],
  3: [0, 5, 6, 3, 17],
  5: [0, 7, 10],
  4: [0, 8],
};
export const CALL_MENUS: Record<number, number[]> = { 2: [0, 29], 6: [0, 28] };
export type Ear = "Left" | "Right";
export interface Gesture {
  device: number;
  side: Ear | "Both";
  button: number;
  action: number;
  fn: number;
}
const SIDES: Record<number, Gesture["side"]> = { 1: "Left", 2: "Right", 4: "Both" };
export function gestures(p: Bytes): Gesture[] {
  requireSuccess(p, 2);
  if (p[1] > 64 || p.length !== 2 + p[1] * 4) throw Error("Invalid gesture table");
  const entries: Gesture[] = [];
  for (let i = 2; i < p.length; i += 4) {
    const [device, button, action, fn] = p.slice(i, i + 4);
    if (!SIDES[device]) throw Error("Invalid gesture side");
    entries.push({ device, side: SIDES[device], button, action, fn });
  }
  return entries;
}
// Writes every slot the table has for (side, action) outside the call group; the table's shape
// varies between reads, so slots are never hardcoded.
export function gestureTablePayload(
  table: Gesture[],
  side: Ear,
  action: number,
  fn: number,
): Bytes {
  if (!GESTURE_MENUS[action]?.includes(fn)) throw Error("Function not offered for this gesture");
  const device = side === "Left" ? 1 : 2;
  let matched = 0;
  const entries = table.map((e) => {
    if (e.device === device && e.action === action && e.button !== 6) {
      matched++;
      return [e.device, e.button, e.action, fn];
    }
    return [e.device, e.button, e.action, e.fn];
  });
  if (!matched) throw Error("This gesture is not in the earbuds’ current table");
  return [entries.length, ...entries.flat()];
}
export function callGesturePayload(action: number, fn: number): Bytes {
  if (!CALL_MENUS[action]?.includes(fn)) throw Error("Function not offered for this call control");
  return [1, 4, 6, action, fn];
}

export interface Band {
  frequency: number;
  gain: number;
}
export interface Preset {
  id: number;
  name: string;
  selected?: boolean;
  range?: [number, number];
  bands: Band[];
}
export function customPresets(p: Bytes): Preset[] {
  requireSuccess(p, 2);
  if (p[1] > 10) throw Error("Invalid preset count");
  let cursor = 2;
  const result: Preset[] = [];
  for (let i = 0; i < p[1]; i++) {
    if (cursor + 5 > p.length) throw Error("Truncated preset");
    const [selected, lo, hi, id, nameLength] = p.slice(cursor, cursor + 5);
    cursor += 5;
    if (cursor + nameLength + 1 > p.length) throw Error("Truncated preset name");
    const name = new TextDecoder().decode(Uint8Array.from(p.slice(cursor, cursor + nameLength)));
    cursor += nameLength;
    const count = p[cursor++];
    if (count > 16 || cursor + count * 3 > p.length) throw Error("Truncated preset bands");
    const bands: Band[] = [];
    for (let b = 0; b < count; b++) {
      bands.push({ frequency: p[cursor] | (p[cursor + 1] << 8), gain: signed(p[cursor + 2]) });
      cursor += 3;
    }
    result.push({ id, name, selected: selected === 1, range: [signed(lo), signed(hi)], bands });
  }
  if (cursor !== p.length) throw Error("Unexpected preset suffix");
  return result;
}
const CUSTOM_EQ = { create: 1, save: 2, delete: 3 } as const;
export function customEqPayload(
  action: keyof typeof CUSTOM_EQ,
  { id = 0, name, bands }: Preset | (Omit<Preset, "id"> & { id?: number }),
): Bytes {
  const text = Array.from(new TextEncoder().encode(name));
  return [
    CUSTOM_EQ[action],
    s8(-EQ_GAIN),
    EQ_GAIN,
    action === "create" ? 0 : id,
    text.length,
    ...text,
    bands.length,
    ...bands.flatMap(({ frequency, gain }) => [frequency & 255, frequency >> 8, s8(gain)]),
  ];
}
export const bassPayload = (level: number): Bytes => [0xfb, 5, s8(level)];
export function bassLevel(p: Bytes) {
  requireSuccess(p, 4);
  if (p.length !== 4 || p[1] !== 0xfb || p[2] !== 5) throw Error("Invalid BassWave reply");
  return signed(p[3]);
}
export const CODECS: Record<number, string> = {
  1: "SBC",
  2: "AAC",
  3: "LDAC",
  4: "aptX",
  5: "aptX HD",
  6: "aptX Adaptive",
  7: "LHDC",
  8: "LHDC V5",
};
export interface HostDevice {
  name: string;
  connected: boolean;
  thisDevice: boolean;
  playing: boolean;
}
export function connectedDevices(p: Bytes): HostDevice[] {
  requireSuccess(p, 2);
  if (p[1] > 10) throw Error("Invalid device count");
  let cursor = 2;
  const result: HostDevice[] = [];
  for (let i = 0; i < p[1]; i++) {
    if (cursor + 10 > p.length) throw Error("Truncated connected device");
    const length = p[cursor + 6],
      state = p[cursor + 7],
      flags = p[cursor + 8],
      n = p[cursor + 9];
    if (length !== 3 + n || cursor + 10 + n > p.length) throw Error("Invalid device name length");
    const name = new TextDecoder().decode(Uint8Array.from(p.slice(cursor + 10, cursor + 10 + n)));
    result.push({
      name,
      connected: state === 2,
      thisDevice: !!(flags & 1),
      playing: !!(flags & 4),
    });
    cursor += 10 + n;
  }
  if (cursor !== p.length) throw Error("Unexpected device suffix");
  return result;
}
export function firmware(p: Bytes) {
  requireSuccess(p, 3);
  const parts = new TextDecoder().decode(Uint8Array.from(p.slice(2))).split(",");
  if (parts.length % 3) throw Error("Unrecognized firmware record");
  const versions: string[] = [];
  for (let i = 0; i < parts.length; i += 3)
    if (parts[i + 1].trim() === "2") versions.push(parts[i + 2].trim());
  if (!versions.length || versions.some((x) => !/^\d+$/.test(x)))
    throw Error("Unrecognized firmware version");
  return versions.join(".");
}
// Fit test push 04 <dev> <status> <dev> <status>: 1 good, 0 average, 6 poor, other values are errors.
export type FitResult = Partial<Record<"left" | "right", string>>;
export function fitResult(p: Bytes): FitResult {
  const result: FitResult = {};
  for (let i = 0; i + 1 < p.length; i += 2) {
    const side = ({ 1: "left", 2: "right" } as const)[p[i] as 1 | 2];
    if (side)
      result[side] =
        ({ 1: "Good seal", 0: "Average seal", 6: "Poor seal" } as Record<number, string>)[
          p[i + 1]
        ] ?? "Not measured";
  }
  return result;
}
// Golden Sound hearing values: left 1..6 then right 1..6, each <side> <freq> <value>.
export const hearingSnap = (v: number) =>
  HEARING_RESULTS.reduce((best, r) => (Math.abs(r - v) < Math.abs(best - v) ? r : best));
const hearingInfo = (values: number[]) =>
  values.flatMap((v, i) => [Math.floor(i / 6) + 1, (i % 6) + 1, s8(v)]);
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const tonePayload = (side: number, freq: number, value: number): Bytes => [
  3,
  1,
  side,
  freq,
  s8(value),
];
export const hearingFilterPayload = (uid: number, values: number[]): Bytes => [
  12,
  ...hearingInfo(values),
  ...be32(uid),
];
export const hearingRecordPayload = (uid: number, name: string, values: number[]): Bytes => [
  3,
  12,
  ...hearingInfo(values),
  ...be32(uid),
  ...Array.from(new TextEncoder().encode(name)),
];
export function hearingEnhanceType(p: Bytes) {
  requireSuccess(p, 10);
  if (p[5] !== 4) throw Error("Unrecognized hearing filter reply");
  return p[9];
}
export interface GoldenRecord {
  values: number[];
  uid: number;
  name: string;
}
export function goldenRecord(p: Bytes): GoldenRecord | null {
  if (p[0] !== 0 || p[1] !== 3 || p[2] !== 12 || p.length < 43) return null;
  const values: number[] = [];
  for (let i = 3; i < 39; i += 3) values.push(signed(p[i + 2]));
  return {
    values,
    uid: ((p[39] << 24) | (p[40] << 16) | (p[41] << 8) | p[42]) >>> 0,
    name: new TextDecoder().decode(Uint8Array.from(p.slice(43))),
  };
}
