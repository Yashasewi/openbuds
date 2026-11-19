import { REPO } from "../lib/links";
import { CODECS, SWITCHES } from "../lib/protocol";
import { GitHubMark } from "./Site";
import { run, session, useAction, useBuds } from "../lib/store";
import { SwitchRow } from "./Sound";
import { Group, Range, Row, cx } from "./ui";

export function Features() {
  const { state } = useBuds();
  const f = state.features ?? {};
  return (
    <Group
      title="Features"
      description="In-ear optical wear sensors, 47 ms low-latency game mode and adaptive ambient volume."
    >
      {f[SWITCHES.wearDetection] !== undefined && (
        <SwitchRow
          id={SWITCHES.wearDetection}
          title="Wear detection"
          description="Pause playback when an earbud leaves your ear and resume when put back."
        />
      )}
      {f[SWITCHES.gameMode] !== undefined && (
        <SwitchRow
          id={SWITCHES.gameMode}
          title="Game mode (47 ms)"
          description="Reduces wireless audio latency for synchronized video and gaming."
        />
      )}
      {f[SWITCHES.smartVolume] !== undefined && (
        <SwitchRow
          id={SWITCHES.smartVolume}
          title="Smart volume"
          description="Automatically scales playback loudness with surrounding noise."
        />
      )}
      {!state.features && (
        <Row
          title="Not read yet"
          description={state.errors.features ?? "Connect to read your earbuds’ features."}
        />
      )}
    </Group>
  );
}

export function Connections() {
  const { state } = useBuds();
  const activeCount = state.devices?.filter((d) => d.connected).length;
  return (
    <Group
      title="Connections"
      meta={activeCount !== undefined ? `${activeCount} active` : "Bluetooth 5.4"}
      description="Bluetooth 5.4 Steady Connect multipoint pairing across two hosts."
    >
      {state.features?.[SWITCHES.dualConnection] !== undefined && (
        <SwitchRow
          id={SWITCHES.dualConnection}
          title="Dual-device connection"
          description="Stay linked to two devices simultaneously and hand off audio between them."
        />
      )}
      {state.devices?.map((device, i) => (
        <div key={`${device.name}-${i}`} className="flex items-center gap-3 py-3">
          <span
            aria-hidden
            className={cx(
              "grid size-8 shrink-0 place-items-center rounded-md",
              device.connected ? "bg-mint text-tip" : "bg-fog text-muted ring-1 ring-ink/10",
            )}
          >
            <svg viewBox="0 0 20 20" className="size-4">
              <rect
                x="3"
                y="4"
                width="14"
                height="9.5"
                rx="1.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              />
              <path d="M7 16.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-[0.88rem] font-medium text-ink">
              {device.name || "Unnamed device"}
              {device.thisDevice && (
                <span className="ml-2 font-normal text-[0.78rem] text-muted">this computer</span>
              )}
            </div>
            <div className="text-[0.78rem] text-muted">
              {device.connected
                ? device.playing
                  ? "Connected · playing audio"
                  : "Connected"
                : "Not connected"}
            </div>
          </div>
        </div>
      ))}
      {state.devices && !state.devices.length && <Row title="No devices reported" />}
    </Group>
  );
}

export function About() {
  const { state } = useBuds();
  const volume = useAction("promptVolume");
  return (
    <Group title="Device & firmware" meta={state.firmware ? `FW ${state.firmware}` : undefined}>
      <a href={REPO} className="group flex items-center gap-3 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-ink text-sheet">
          <GitHubMark className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.88rem] font-medium text-ink group-hover:text-tip">
            OpenBuds source on GitHub
          </span>
          <span className="block truncate text-[0.78rem] text-muted">
            Free, clean-room implementation under GPL-3.0-or-later
          </span>
        </span>
        <span aria-hidden className="text-muted group-hover:text-tip">
          ↗
        </span>
      </a>
      {state.promptVolume !== undefined && (
        <Row
          stack
          title="Earbud tone volume"
          description="Loudness of the earbuds’ own status chimes. Changing it plays a sample chime."
          status={volume.status}
          control={
            <Range
              label="Prompt volume"
              min={1}
              max={10}
              value={state.promptVolume}
              disabled={volume.busy}
              onCommit={(v) => run("promptVolume", () => session.setPromptVolume(v))}
            />
          }
        />
      )}
      <Info label="Model" value={state.model ? `OnePlus Buds 4 (${state.model})` : undefined} />
      <Info label="Firmware" value={state.firmware} error={state.errors.firmware} />
      <Info
        label="Active codec"
        value={
          state.codec === undefined
            ? undefined
            : (CODECS[state.codec] ?? `Unrecognized (${state.codec})`)
        }
        error={state.errors.codec}
      />
      <Info
        label="Last read"
        value={
          state.updatedAt &&
          new Date(state.updatedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        }
      />
    </Group>
  );
}

function Info({ label, value, error }: { label: string; value?: string; error?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-[0.86rem]">
      <span className="text-ink">{label}</span>
      <span className={cx("tabular-nums", value ? "text-muted" : "text-muted/60")}>
        {value ?? (error ? "Not reported" : "–")}
      </span>
    </div>
  );
}
