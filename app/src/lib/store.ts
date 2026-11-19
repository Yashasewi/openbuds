import { createContext, useContext, useSyncExternalStore } from "react";
import { BudsSession, type Snapshot } from "./session";
import { EQ_BANDS, SWITCHES } from "./protocol";

export const session = new BudsSession((event, details) => {
  if (import.meta.env.DEV) console.debug(event, details ?? "");
});

// Optional read-only sample snapshot so visitors without earbuds connected can inspect the workbench UI.
export const SAMPLE_SNAPSHOT: Snapshot = {
  connection: "disconnected",
  reason:
    "Sample Buds 4 readout. Connect your earbuds in Google Chrome to read and change live settings.",
  live: false,
  state: {
    model: "065414",
    firmware: "138.138.105",
    codec: 2, // AAC on macOS
    battery: {
      left: { percent: 94, charging: false },
      right: { percent: 91, charging: false },
      case: { percent: 78, charging: false },
    },
    wearing: {
      left: { raw: 3, inEar: true, inCase: false, lidOpen: true },
      right: { raw: 3, inEar: true, inCase: false, lidOpen: true },
      case: { raw: 4, inEar: false, inCase: true, lidOpen: true },
    },
    noise: { mode: "smart", name: "Noise cancelling, smart", raw: 128 },
    smartLevel: "deep",
    holdCycle: { modes: ["anc", "adaptive", "transparency"], mask: 0x806 },
    eq: 0,
    customPresets: [
      {
        id: 3,
        name: "Studio flat",
        bands: EQ_BANDS.map((frequency, i) => ({
          frequency,
          gain: [1, 0, 0, 1, 2, 1][i] ?? 0,
        })),
      },
    ],
    bass: 2,
    promptVolume: 7,
    golden: {
      name: "Ear scan profile",
      uid: 1,
      values: [-25, -25, -19, -19, -25, -19, -25, -25, -19, -19, -25, -19],
    },
    fit: { left: "Good seal", right: "Good seal" },
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
    gestures: [
      { device: 1, side: "Left", button: 1, action: 1, fn: 1 },
      { device: 1, side: "Left", button: 1, action: 2, fn: 6 },
      { device: 1, side: "Left", button: 1, action: 3, fn: 5 },
      { device: 1, side: "Left", button: 1, action: 5, fn: 7 },
      { device: 1, side: "Left", button: 1, action: 4, fn: 8 },
      { device: 2, side: "Right", button: 2, action: 1, fn: 1 },
      { device: 2, side: "Right", button: 2, action: 2, fn: 6 },
      { device: 2, side: "Right", button: 2, action: 3, fn: 5 },
      { device: 2, side: "Right", button: 2, action: 5, fn: 7 },
      { device: 2, side: "Right", button: 2, action: 4, fn: 8 },
      { device: 4, side: "Both", button: 6, action: 2, fn: 29 },
      { device: 4, side: "Both", button: 6, action: 6, fn: 28 },
    ],
    devices: [
      { name: "MacBook Pro", connected: true, playing: true, thisDevice: true },
      { name: "OnePlus 13", connected: true, playing: false, thisDevice: false },
    ],
    errors: {},
    updatedAt: new Date().toISOString(),
  },
};

export const PreviewControlsContext = createContext(false);

export function usePreviewMode() {
  return useContext(PreviewControlsContext);
}

export function useBuds() {
  const real = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const preview = useContext(PreviewControlsContext);
  if (!real.state.model && preview) return SAMPLE_SNAPSHOT;
  return real;
}

// After the user presses Disconnect, stay disconnected until they connect again.
let userDisconnected = false;
export async function connect() {
  userDisconnected = false;
  await session.connect(await session.choose());
}
export function disconnect() {
  userDisconnected = true;
  void session.close("You disconnected.");
}
// The earbuds take one RFCOMM control link per computer. A hidden tab that holds it locks out other tabs
// and older OpenBuds Mac apps (the current one uses GATT), so connect on our own only while visible,
// and let go after a while in the background.
const RELEASE_HIDDEN_AFTER = 30000;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
async function autoConnect() {
  const { connection } = session.snapshot;
  if (
    document.visibilityState !== "visible" ||
    userDisconnected ||
    session.connected ||
    connection === "connecting" ||
    connection === "restarting"
  )
    return;
  const port = await session.grantedPort();
  if (port) await session.connect(port, { quiet: true }).catch(() => {});
}
// Only some changes are pushed by the earbuds; others (gestures, switches changed on the phone) need a read.
function rereadOnReturn() {
  if (document.visibilityState !== "visible" || !session.connected || action.phase === "pending")
    return;
  if (Date.now() - session.lastRefresh < 15000) return;
  void session.refresh().catch(() => {});
}
function releaseWhenHidden() {
  clearTimeout(releaseTimer);
  if (document.visibilityState === "visible") return void autoConnect();
  releaseTimer = setTimeout(() => {
    if (document.visibilityState === "visible") return;
    const { connection } = session.snapshot;
    // Let a pending change or an earbud restart finish, then check again.
    if (action.phase === "pending" || connection === "connecting" || connection === "restarting")
      return releaseWhenHidden();
    if (connection !== "connected") return;
    void session.close(
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
    if (session.connected) void session.close("This tab closed.");
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
