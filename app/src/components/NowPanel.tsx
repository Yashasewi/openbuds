import { useState } from "react";
import { ANC_LEVELS, type AncLevel, type NoiseMode, type Side } from "../lib/protocol";
import {
  connect,
  disconnect,
  run,
  session,
  useAction,
  useBuds,
  usePreviewMode,
} from "../lib/store";
import { Button, Segmented, Status, cx } from "./ui";

type Group = "anc" | "adaptive" | "transparency" | "off";
const GROUPS: { value: Group; label: string }[] = [
  { value: "anc", label: "Noise cancelling" },
  { value: "adaptive", label: "Adaptive" },
  { value: "transparency", label: "Transparency" },
  { value: "off", label: "Off" },
];
const LEVELS: { value: AncLevel; label: string }[] = [
  { value: "smart", label: "Smart" },
  { value: "deep", label: "Deep" },
  { value: "medium", label: "Medium" },
  { value: "light", label: "Light" },
];
const LEVEL_NAMES: Partial<Record<NoiseMode, string>> = {
  deep: "Deep",
  medium: "Medium",
  light: "Light",
};
const groupOf = (mode: NoiseMode | null | undefined): Group | undefined =>
  !mode
    ? undefined
    : mode === "anc" || (ANC_LEVELS as readonly string[]).includes(mode)
      ? "anc"
      : (mode as Group);

/**
 * Primary Connect & Noise-Control workbench block situated directly under FIG 01.
 */
export function WorkbenchBar({ onTogglePreview }: { onTogglePreview: () => void }) {
  const { connection, reason, state } = useBuds();
  const preview = usePreviewMode();
  const { busy, status } = useAction("noise");
  const [connectError, setConnectError] = useState<string>();

  const connected = connection === "connected";
  const hasRealData = !!state.model && !preview;
  const mode = state.noise?.mode;
  const group = groupOf(mode);
  const serialSupported = typeof navigator !== "undefined" && "serial" in navigator;

  async function onConnect() {
    setConnectError(undefined);
    try {
      await connect();
    } catch (error) {
      if ((error as Error).name !== "NotFoundError") setConnectError((error as Error).message);
    }
  }

  const detail = !connected
    ? null
    : group !== "anc"
      ? null
      : mode === "smart"
        ? `Smart strength${state.smartLevel && LEVEL_NAMES[state.smartLevel] ? ` (${LEVEL_NAMES[state.smartLevel]!.toLowerCase()} right now)` : ", adapts to your surroundings"}`
        : mode === "anc"
          ? "Choose a strength below"
          : `${LEVEL_NAMES[mode!]} strength`;

  if (!connected && !hasRealData) {
    return (
      <section
        id="connect"
        aria-label="Connect earbuds"
        className="scroll-mt-8 rounded-[4px] border border-ink/12 bg-sheet p-4.5 sm:p-5"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[0.95rem] font-semibold text-ink">Connect your OnePlus Buds 4</h2>
              <span className="rounded bg-fog px-2 py-0.5 text-[0.74rem] text-muted ring-1 ring-ink/10">
                {serialSupported ? "Web Serial ready" : "Requires Google Chrome"}
              </span>
            </div>
            <p className="mt-1 max-w-[52ch] text-[0.84rem] leading-relaxed text-muted">
              Pair the earbuds in macOS or Windows Bluetooth first, then open the control link here.
              Every change waits for the earbuds to confirm and reads the value back.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              variant="primary"
              className="h-9.5 px-4"
              disabled={connection === "connecting" || connection === "restarting"}
              onClick={onConnect}
            >
              {connection === "connecting" ? "Connecting…" : "Connect earbuds"}
            </Button>
            <Button onClick={onTogglePreview}>
              {preview ? "Hide sample sheet" : "Inspect controls"}
            </Button>
          </div>
        </div>

        {(connectError || (connection === "disconnected" && reason && !preview)) && (
          <p className="mt-3 rounded bg-amber/12 px-3 py-2 text-[0.82rem] text-warn ring-1 ring-amber/25">
            {(connection === "disconnected" && reason) || connectError}
          </p>
        )}

        <ol className="mt-4 grid gap-3 border-t border-ink/[0.08] pt-3.5 text-[0.81rem] sm:grid-cols-3 sm:gap-5">
          {[
            [
              "1",
              "Pair in Bluetooth",
              "Connect OnePlus Buds 4 to your computer as audio headphones.",
            ],
            [
              "2",
              "Open in Chrome",
              "Desktop Chrome speaks RFCOMM over Web Serial; other browsers do not yet.",
            ],
            [
              "3",
              "Select Buds 4",
              "Press Connect earbuds above and pick OnePlus Buds 4 from the port sheet.",
            ],
          ].map(([num, title, body]) => (
            <li key={num} className="flex gap-2.5">
              <span className="numeral mt-0.5 font-mono text-[0.75rem] font-medium text-tip">
                {num}.
              </span>
              <div>
                <div className="font-medium text-ink">{title}</div>
                <p className="mt-0.5 leading-snug text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section
      id="noise"
      aria-label="Noise control and battery"
      className="scroll-mt-8 rounded-[4px] border border-ink/12 bg-sheet p-4.5 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[0.95rem] font-semibold text-ink">
              {GROUPS.find((g) => g.value === group)?.label ?? state.noise?.name ?? "Noise control"}
            </h2>
            <ConnectionBadge connection={connection} />
          </div>
          {detail && <p className="mt-0.5 text-[0.83rem] text-muted">{detail}</p>}
        </div>

        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Button disabled={busy} onClick={() => run("refresh", () => session.refresh())}>
                Read again
              </Button>
              <Button onClick={disconnect}>Disconnect</Button>
            </>
          ) : (
            <Button
              variant="primary"
              disabled={connection === "connecting" || connection === "restarting"}
              onClick={onConnect}
            >
              {connection === "connecting" ? "Connecting…" : "Reconnect"}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Segmented
          label="Noise control"
          value={group}
          options={GROUPS}
          disabled={!connected || busy}
          onChange={(g) => run("noise", () => session.setNoise(g))}
        />
        <div
          className={cx(
            "grid transition-[grid-template-rows,opacity] duration-200",
            group === "anc" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden" inert={group !== "anc"}>
            <Segmented
              size="sm"
              label="Noise cancelling strength"
              value={mode as AncLevel}
              options={LEVELS}
              disabled={!connected || busy}
              onChange={(level) => run("noise", () => session.setNoise(level))}
            />
          </div>
        </div>
        <Status status={status} />
      </div>

      <div className="mt-4 border-t border-ink/[0.08] pt-4 xl:hidden">
        <BatteryGrid />
      </div>
    </section>
  );
}

export function ConnectionBadge({ connection }: { connection: string }) {
  const label = {
    idle: "Standby",
    connecting: "Connecting",
    connected: "Connected",
    restarting: "Restarting",
    disconnected: "Not connected",
  }[connection];
  const on = connection === "connected";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[0.75rem]",
        on ? "bg-mint text-tip font-medium" : "bg-ink/[0.05] text-muted",
      )}
    >
      <span
        className={cx(
          "size-1.5 rounded-full",
          on
            ? "bg-tip"
            : connection === "connecting" || connection === "restarting"
              ? "pulse bg-amber"
              : "bg-ink/30",
        )}
      />
      {label}
    </span>
  );
}

const SIDES: { side: Side; label: string }[] = [
  { side: "left", label: "Left" },
  { side: "right", label: "Right" },
  { side: "case", label: "Case" },
];

export function BatteryGrid({ compact }: { compact?: boolean }) {
  const { state, connection } = useBuds();
  const preview = usePreviewMode();
  const hasAny = Boolean(state.battery?.left || state.battery?.right || state.battery?.case);
  const stale = connection !== "connected" && !preview;

  return (
    <div className={cx("grid grid-cols-3 gap-3", stale && hasAny && "opacity-65")}>
      {SIDES.map(({ side, label }) => {
        const level = state.battery?.[side];
        const wear = state.wearing?.[side];
        const note = level?.charging
          ? "Charging"
          : side === "case"
            ? wear?.lidOpen
              ? "Lid open"
              : level?.percent
                ? "Reported"
                : "45 h rated"
            : wear
              ? wear.inEar
                ? "In ear"
                : wear.inCase
                  ? "In case"
                  : "Out"
              : "11 h rated";
        return (
          <div key={side} className="min-w-0">
            <div className="text-[0.75rem] text-muted">{label}</div>
            <div
              className={cx(
                "numeral mt-0.5 leading-none font-medium tracking-[-0.02em] text-ink tabular-nums",
                compact ? "text-[1.25rem]" : "text-[1.45rem]",
              )}
            >
              {level?.percent ?? "–"}
              {level?.percent !== undefined && (
                <span className="ml-0.5 text-[0.75rem] font-normal text-muted">%</span>
              )}
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/10">
              <div
                className={cx(
                  "h-full rounded-full transition-[width] duration-500",
                  level?.charging ? "bg-amber" : "bg-tip",
                )}
                style={{ width: `${level?.percent ?? 0}%` }}
              />
            </div>
            <div
              className={cx(
                "mt-1 truncate text-[0.72rem]",
                level?.charging ? "text-warn" : "text-muted",
              )}
            >
              {note}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Right-margin interactive legend & telemetry block aligned beside FIG 01 on wide screens.
 */
export function MarginTelemetry() {
  const { connection, state } = useBuds();
  const preview = usePreviewMode();

  return (
    <div className="flex flex-col gap-5 text-[0.78rem] text-muted">
      <div>
        <div className="mb-2 font-medium text-ink">Figure controls</div>
        <ul className="space-y-1.5">
          <li className="flex items-center justify-between gap-2">
            <span>Separate / close</span>
            <kbd className="rounded border border-ink/15 bg-sheet px-1.5 py-0.5 font-mono text-[0.68rem] text-ink">
              E
            </kbd>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Scrub assembly</span>
            <span className="font-mono text-[0.7rem] text-ink/75">Drag ↔</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Cycle sound field</span>
            <kbd className="rounded border border-ink/15 bg-sheet px-1.5 py-0.5 font-mono text-[0.68rem] text-ink">
              M
            </kbd>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Isolate part</span>
            <kbd className="rounded border border-ink/15 bg-sheet px-1.5 py-0.5 font-mono text-[0.68rem] text-ink">
              0–4
            </kbd>
          </li>
        </ul>
      </div>

      <div className="border-t border-ink/10 pt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-ink">{state.model ? "Telemetry" : "Battery spec"}</span>
          <span className="text-[0.72rem] tabular-nums">
            {preview ? "Sample" : connection === "connected" ? "Live" : "Idle"}
          </span>
        </div>
        <BatteryGrid compact />
      </div>

      <div className="border-t border-ink/10 pt-4 leading-relaxed">
        <div className="font-medium text-ink">Hardware profile</div>
        <dl className="mt-1.5 space-y-1 text-[0.75rem]">
          <div className="flex justify-between gap-2">
            <dt>Drivers</dt>
            <dd className="text-ink/80 tabular-nums">11 mm + 6 mm</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>ANC depth</dt>
            <dd className="text-ink/80 tabular-nums">55 dB · 5.5 kHz</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Hi-Res</dt>
            <dd className="text-ink/80 tabular-nums">LHDC 5.0 · 192k</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Protection</dt>
            <dd className="text-ink/80 tabular-nums">IP55 · BT 5.4</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
