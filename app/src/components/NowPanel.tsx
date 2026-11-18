import { useState } from "react";
import { ANC_LEVELS, type AncLevel, type NoiseMode, type Side } from "../lib/protocol";
import { connect, disconnect, run, session, useAction, useBuds } from "../lib/store";
import { SoundField } from "./SoundField";
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

export function NowPanel() {
  const { connection, reason, state } = useBuds();
  const { busy, status } = useAction("noise");
  const [connectError, setConnectError] = useState<string>();
  const [previewMode, setPreviewMode] = useState<Group>("anc");
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

  const headline = !connected
    ? connection === "restarting"
      ? "Restarting"
      : "Not connected"
    : (GROUPS.find((g) => g.value === group)?.label ?? state.noise?.name ?? "Reading…");
  const detail = !connected
    ? null
    : group !== "anc"
      ? null
      : mode === "smart"
        ? `Smart strength${state.smartLevel && LEVEL_NAMES[state.smartLevel] ? `, at ${LEVEL_NAMES[state.smartLevel]!.toLowerCase()} right now` : ", follows your surroundings"}`
        : mode === "anc"
          ? "Choose a strength below"
          : `${LEVEL_NAMES[mode!]} strength`;

  return (
    <div className="border border-ink/35 bg-sheet/88 backdrop-blur-[2px]">
      <header className="flex items-center justify-between gap-4 border-b border-ink/15 px-5 py-3.5">
        <div className="flex items-baseline gap-2.5">
          <span className="display-sharp text-[1.05rem] font-normal tracking-[-0.015em] text-ink">
            Buds 4
          </span>
          {state.firmware && (
            <span className="font-mono text-[0.76rem] text-ink/48">fw {state.firmware}</span>
          )}
        </div>
        <ConnectionBadge connection={connection} />
      </header>

      <div className="flex flex-col gap-5 p-5">
        <SoundField mode={connected ? mode : previewMode} live={connected} />

        {!connected && (
          <Segmented
            size="sm"
            label="Preview sound field"
            value={previewMode}
            options={GROUPS}
            onChange={setPreviewMode}
          />
        )}

        <div>
          <p className="display-sharp text-[2.2rem] leading-[1.04] font-extralight tracking-[-0.025em] text-ink">
            {headline}
          </p>
          <p className="mt-1.5 min-h-[1.4em] text-[0.88rem] font-light leading-relaxed text-ink/58">
            {connected
              ? detail
              : connection === "restarting"
                ? "The earbuds are restarting their connection. This takes a few seconds."
                : "Connect in Chrome to read and control your OnePlus Buds 4."}
          </p>
        </div>

        {connected ? (
          <div className="flex flex-col gap-2">
            <Segmented
              label="Noise control"
              value={group}
              options={GROUPS}
              disabled={busy}
              onChange={(g) => run("noise", () => session.setNoise(g))}
            />
            <div
              className={cx(
                "grid transition-[grid-template-rows,opacity] duration-300",
                group === "anc" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
            >
              <div className="overflow-hidden" inert={group !== "anc"}>
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
        ) : (
          <div className="flex flex-col gap-2.5">
            <Button
              variant="primary"
              className="h-11 w-full text-[0.92rem]"
              disabled={connection === "connecting" || connection === "restarting"}
              onClick={onConnect}
            >
              {connection === "connecting" ? "Connecting…" : "Connect earbuds"}
            </Button>
            {(connectError || (connection === "disconnected" && reason)) && (
              <p className="border border-amber/40 bg-amber/12 px-3 py-2 text-[0.83rem] text-warn">
                {(connection === "disconnected" && reason) || connectError}
              </p>
            )}
          </div>
        )}

        <Battery />

        {connected && (
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => run("refresh", () => session.refresh())}>
              Read again
            </Button>
            <Button onClick={disconnect}>Disconnect</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionBadge({ connection }: { connection: string }) {
  const label = {
    idle: "Not connected",
    connecting: "Connecting",
    connected: "Connected",
    restarting: "Restarting",
    disconnected: "Not connected",
  }[connection];
  const on = connection === "connected";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 border px-2.5 py-0.5 font-mono text-[0.74rem]",
        on ? "border-tip/50 bg-tip/12 text-tip" : "border-ink/20 bg-fog/60 text-ink/58",
      )}
    >
      <span
        className={cx(
          "size-1.5",
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

function Battery() {
  const { state, connection } = useBuds();
  const stale = connection !== "connected";
  return (
    <div
      className={cx("grid grid-cols-3 gap-3 border-t border-ink/15 pt-4", stale && "opacity-65")}
    >
      {SIDES.map(({ side, label }) => {
        const level = state.battery?.[side],
          wear = state.wearing?.[side];
        const note = level?.charging
          ? "Charging"
          : side === "case"
            ? wear?.lidOpen
              ? "Lid open"
              : level?.percent
                ? "Last reported"
                : "Open the lid"
            : wear
              ? wear.inEar
                ? "In ear"
                : wear.inCase
                  ? "In case"
                  : "Out of ear"
              : "\u00a0";
        return (
          <div key={side} className="min-w-0">
            <div className="font-mono text-[0.76rem] text-ink/52">{label}</div>
            <div className="mt-1 font-mono text-[1.7rem] leading-none font-light tracking-[-0.03em] text-ink tabular-nums">
              {level?.percent ?? "–"}
              <span className="ml-0.5 text-xs text-ink/45">{level?.percent ? "%" : ""}</span>
            </div>
            <div className="mt-2.5 h-[2px] overflow-hidden bg-ink/14">
              <div
                className={cx(
                  "h-full transition-[width] duration-700",
                  level?.charging ? "bg-amber" : "bg-tip",
                )}
                style={{ width: `${level?.percent ?? 0}%` }}
              />
            </div>
            <div
              className={cx(
                "mt-1.5 truncate font-mono text-[0.72rem]",
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
