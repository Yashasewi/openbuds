import { useState, type ReactNode } from "react";
import { ANC_LEVELS, CODECS, type AncLevel, type NoiseMode, type Side } from "../lib/protocol";
import { connect, disconnect, run, session, useAction, useBuds } from "../lib/store";
import { Button, Segmented, Status, cx } from "./ui";

type Group = "anc" | "adaptive" | "transparency" | "off";

const GROUPS: { value: Group; label: string; icon: ReactNode }[] = [
  {
    value: "anc",
    label: "Noise Cancel",
    icon: (
      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor">
        <circle cx="10" cy="7.5" r="2.6" fill="currentColor" stroke="none" />
        <path
          d="M5.6 15.2c.6-2.2 2.3-3.4 4.4-3.4s3.8 1.2 4.4 3.4"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M3.5 5.5v.01M3.5 9v.01M3.5 12.5v.01M16.5 5.5v.01M16.5 9v.01M16.5 12.5v.01"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    value: "adaptive",
    label: "Adaptive",
    icon: (
      <svg viewBox="0 0 20 20" className="size-5" fill="currentColor">
        <path d="M10.5 3.2 12 7.4l4.2 1.5L12 10.4l-1.5 4.2L9 10.4 4.8 8.9 9 7.4l1.5-4.2Z" />
        <path d="M15.2 12.8l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" />
      </svg>
    ),
  },
  {
    value: "transparency",
    label: "Transparency",
    icon: (
      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor">
        <path
          d="M6.8 8.5a3.5 3.5 0 1 1 6.6 1.6c-.5 1-.9 1.7-1.1 2.7-.2.9-.8 1.7-1.9 1.7a2 2 0 0 1-1.9-1.4"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path d="M14.2 11.8v3.2M16.4 10.8v5.2" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    value: "off",
    label: "Off",
    icon: (
      <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor">
        <circle cx="10" cy="10" r="5.5" strokeWidth="1.6" />
        <path d="m6.2 6.2 7.6 7.6" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
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

export function NowPanel() {
  const { connection, reason, state } = useBuds();
  const { busy, status } = useAction("noise");
  const [connectError, setConnectError] = useState<string>();
  const connected = connection === "connected";
  const mode = state.noise?.mode;
  const group = groupOf(mode);

  async function onConnect() {
    setConnectError(undefined);
    try {
      await connect();
    } catch (error) {
      if ((error as Error).name !== "NotFoundError") setConnectError((error as Error).message);
    }
  }

  const codecLabel = state.codec !== undefined ? CODECS[state.codec] : undefined;
  const subline = connected
    ? [codecLabel && `Connected with ${codecLabel}`, state.firmware && `fw ${state.firmware}`]
        .filter(Boolean)
        .join(" · ") || "Connected"
    : connection === "restarting"
      ? "Restarting connection…"
      : "Connect in Chrome over Bluetooth";

  const strengthNote =
    connected && group === "anc"
      ? mode === "smart"
        ? `Smart strength${state.smartLevel && LEVEL_NAMES[state.smartLevel] ? ` (${LEVEL_NAMES[state.smartLevel]!.toLowerCase()} right now)` : ""}`
        : mode && LEVEL_NAMES[mode]
          ? `${LEVEL_NAMES[mode]} strength`
          : "Choose strength"
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Device header & battery rings */}
      <div className="rounded-2xl border border-ink/[0.08] bg-sheet p-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[1.15rem] leading-snug font-semibold tracking-[-0.015em] text-ink">
              OnePlus Buds 4
            </h1>
            <p className="mt-0.5 text-[0.83rem] text-ink/55">{subline}</p>
          </div>
          <ConnectionBadge connection={connection} />
        </header>

        <BatteryRings />

        {!connected && (
          <div className="mt-5 flex flex-col gap-2.5">
            <Button
              variant="primary"
              className="h-11 w-full text-[0.95rem]"
              disabled={connection === "connecting" || connection === "restarting"}
              onClick={onConnect}
            >
              {connection === "connecting" ? "Connecting…" : "Connect earbuds"}
            </Button>
            {(connectError || (connection === "disconnected" && reason)) && (
              <p className="rounded-xl bg-amber/15 px-3 py-2 text-[0.84rem] text-warn">
                {(connection === "disconnected" && reason) || connectError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Practical Noise Control card */}
      <div
        className={cx(
          "rounded-2xl border border-ink/[0.08] bg-sheet p-5 transition-opacity",
          !connected && "opacity-55",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[0.9rem] font-medium text-ink/65">Noise Control</h2>
          {strengthNote && <span className="text-[0.8rem] text-ink/50">{strengthNote}</span>}
        </div>

        <div role="radiogroup" aria-label="Noise control" className="mt-3.5 grid grid-cols-4 gap-2">
          {GROUPS.map((g) => {
            const active = connected && group === g.value;
            return (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!connected || busy}
                onClick={() => !active && run("noise", () => session.setNoise(g.value))}
                className="group flex flex-col items-center gap-2 text-center disabled:cursor-not-allowed"
              >
                <span
                  className={cx(
                    "grid size-12 place-items-center rounded-full border transition-colors duration-150",
                    active
                      ? "border-tip bg-tip text-white shadow-[0_4px_14px_rgb(43_127_255/0.35)]"
                      : "border-ink/10 bg-ink/[0.06] text-ink/80 group-hover:bg-ink/12 group-disabled:group-hover:bg-ink/[0.06]",
                  )}
                >
                  {g.icon}
                </span>
                <span
                  className={cx(
                    "text-[0.73rem] leading-tight whitespace-nowrap",
                    active ? "font-medium text-ink" : "text-ink/65",
                  )}
                >
                  {g.label}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className={cx(
            "grid transition-[grid-template-rows,opacity,margin] duration-250",
            connected && group === "anc"
              ? "mt-4 grid-rows-[1fr] opacity-100"
              : "mt-0 grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden" inert={!connected || group !== "anc"}>
            <Segmented
              size="sm"
              label="Noise cancelling strength"
              value={mode as AncLevel}
              options={LEVELS}
              disabled={busy}
              onChange={(level) => run("noise", () => session.setNoise(level))}
            />
          </div>
        </div>

        <Status status={status} />
      </div>

      {connected && (
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={() => run("refresh", () => session.refresh())}>
            Read again
          </Button>
          <Button onClick={disconnect}>Disconnect</Button>
        </div>
      )}
    </div>
  );
}

function ConnectionBadge({ connection }: { connection: string }) {
  const label = {
    idle: "Offline",
    connecting: "Connecting",
    connected: "Connected",
    restarting: "Restarting",
    disconnected: "Offline",
  }[connection];
  const on = connection === "connected";
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.78rem] font-medium",
        on ? "bg-tip/15 text-mint" : "bg-ink/[0.07] text-ink/55",
      )}
    >
      <span
        className={cx(
          "size-1.5 rounded-full",
          on
            ? "bg-tip"
            : connection === "connecting" || connection === "restarting"
              ? "pulse bg-amber"
              : "bg-ink/35",
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

function BatteryRings() {
  const { state, connection } = useBuds();
  const stale = connection !== "connected" && !state.battery;
  const r = 24;
  const c = 2 * Math.PI * r;

  return (
    <div className={cx("mt-5 grid grid-cols-3 gap-2", stale && "opacity-70")}>
      {SIDES.map(({ side, label }) => {
        const level = state.battery?.[side];
        const wear = state.wearing?.[side];
        const pct = level?.percent;
        const offset = pct != null ? c * (1 - pct / 100) : c;
        const note = level?.charging
          ? "Charging"
          : side === "case"
            ? wear?.lidOpen
              ? "Lid open"
              : pct != null
                ? "Case"
                : "Open lid"
            : wear
              ? wear.inEar
                ? `${label}, in ear`
                : wear.inCase
                  ? "In case"
                  : `${label}, out`
              : label;

        return (
          <div key={side} className="flex flex-col items-center text-center">
            <div className="relative size-15">
              <svg viewBox="0 0 60 60" className="size-full -rotate-90" aria-hidden>
                <circle
                  cx="30"
                  cy="30"
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  className="text-ink/10"
                  strokeWidth="4"
                />
                {pct != null && (
                  <circle
                    cx="30"
                    cy="30"
                    r={r}
                    fill="none"
                    stroke={level?.charging ? "var(--color-amber)" : "#ffffff"}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={offset}
                    className="transition-[stroke-dashoffset] duration-700"
                  />
                )}
              </svg>
              <div className="absolute inset-0 grid place-items-center text-ink/85">
                {side === "case" ? (
                  <svg viewBox="0 0 20 20" className="size-4.5 text-ink/55" fill="currentColor">
                    <rect x="4" y="6" width="12" height="8.5" rx="3" />
                    <rect x="7.5" y="9.2" width="5" height="1.2" rx="0.6" className="fill-sheet" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 20 20"
                    className={cx("size-5", side === "right" && "-scale-x-100")}
                    fill="currentColor"
                  >
                    <g transform="rotate(-8 9 8)">
                      <rect x="7.6" y="8.8" width="2.5" height="6.8" rx="1.25" />
                      <circle cx="8.9" cy="7.8" r="3.3" />
                      <circle cx="11.3" cy="7.7" r="1.7" />
                      <circle cx="10.2" cy="7.5" r="1" className="fill-sheet" />
                    </g>
                  </svg>
                )}
              </div>
            </div>

            <div className="numeral mt-2 text-[1.05rem] leading-none font-semibold tabular-nums">
              {pct != null ? `${pct}%` : "–"}
            </div>
            <div
              className={cx(
                "mt-1 max-w-full truncate text-[0.76rem]",
                level?.charging ? "text-warn" : "text-ink/50",
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
