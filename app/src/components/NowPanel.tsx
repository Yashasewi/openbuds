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
    <div className="flex flex-col gap-7">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[1.15rem] font-semibold tracking-[-0.02em]">Buds 4</span>
          {state.firmware && <span className="text-sm text-ink/50">firmware {state.firmware}</span>}
        </div>
        <ConnectionBadge connection={connection} />
      </header>

      <div className="relative mx-auto w-full max-w-[22rem]">
        <SoundField mode={connected ? mode : undefined} live={connected} />
      </div>

      <div className="-mt-2">
        <p className="numeral text-[2.6rem] leading-[1.05] font-medium tracking-[-0.03em] text-ink">
          {headline}
        </p>
        <p className="mt-1.5 min-h-[1.4em] text-[0.95rem] text-ink/60">
          {connected
            ? detail
            : connection === "restarting"
              ? "The earbuds are restarting their connection. This takes a few seconds."
              : "Connect to see and change what your earbuds are doing."}
        </p>
      </div>

      {connected ? (
        <div className="flex flex-col gap-2.5">
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
        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            className="h-12 w-full text-base"
            disabled={connection === "connecting" || connection === "restarting"}
            onClick={onConnect}
          >
            {connection === "connecting" ? "Connecting…" : "Connect earbuds"}
          </Button>
          {(connectError || (connection === "disconnected" && reason)) && (
            <p className="rounded-xl bg-amber/15 px-3 py-2 text-[0.88rem] text-warn">
              {(connection === "disconnected" && reason) || connectError}
            </p>
          )}
        </div>
      )}

      <Battery />

      {connected && (
        <div className="flex gap-2">
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
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.82rem]",
        on ? "bg-mint/45 text-tip" : "bg-ink/[0.06] text-ink/60",
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

function Battery() {
  const { state, connection } = useBuds();
  const stale = connection !== "connected";
  return (
    <div
      className={cx("grid grid-cols-3 gap-3 border-t border-ink/10 pt-5", stale && "opacity-55")}
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
            <div className="text-[0.85rem] text-ink/55">{label}</div>
            <div className="numeral mt-0.5 text-[2rem] leading-none font-medium tracking-[-0.03em] tabular-nums">
              {level?.percent ?? "–"}
              <span className="ml-0.5 text-base font-normal text-ink/45">
                {level?.percent ? "%" : ""}
              </span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-ink/10">
              <div
                className={cx(
                  "h-full rounded-full transition-[width] duration-700",
                  level?.charging ? "bg-amber" : "bg-tip",
                )}
                style={{ width: `${level?.percent ?? 0}%` }}
              />
            </div>
            <div
              className={cx(
                "mt-1.5 truncate text-[0.82rem]",
                level?.charging ? "text-warn" : "text-ink/55",
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
