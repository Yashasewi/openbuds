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
    <Group title="Features">
      {f[SWITCHES.wearDetection] !== undefined && (
        <SwitchRow
          id={SWITCHES.wearDetection}
          title="Wear detection"
          description="Pause when you take an earbud out, and play when you put it back."
        />
      )}
      {f[SWITCHES.gameMode] !== undefined && (
        <SwitchRow
          id={SWITCHES.gameMode}
          title="Game mode"
          description="Lower delay between picture and sound."
        />
      )}
      {f[SWITCHES.smartVolume] !== undefined && (
        <SwitchRow
          id={SWITCHES.smartVolume}
          title="Smart volume"
          description="Adjusts volume to the noise around you."
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
  return (
    <Group title="Connections">
      {state.features?.[SWITCHES.dualConnection] !== undefined && (
        <SwitchRow
          id={SWITCHES.dualConnection}
          title="Dual connection"
          description="Stay connected to two devices and switch between them."
        />
      )}
      {state.devices?.map((device, i) => (
        <div key={`${device.name}-${i}`} className="flex items-center gap-3.5 py-3.5">
          <span
            aria-hidden
            className={cx(
              "grid size-9 shrink-0 place-items-center rounded-xl",
              device.connected ? "bg-mint/45 text-tip" : "bg-ink/[0.06] text-ink/45",
            )}
          >
            <svg viewBox="0 0 20 20" className="size-4.5">
              <rect
                x="3"
                y="4"
                width="14"
                height="9.5"
                rx="1.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path d="M7 16.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-[1rem]">
              {device.name || "Unnamed device"}
              {device.thisDevice && (
                <span className="ml-2 text-[0.85rem] text-ink/50">this Mac</span>
              )}
            </div>
            <div className="text-[0.85rem] text-ink/55">
              {device.connected
                ? device.playing
                  ? "Connected, playing audio"
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
    <Group title="About">
      <a href={REPO} className="group flex items-center gap-3.5 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ink text-sheet">
          <GitHubMark className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] group-hover:text-tip">Source on GitHub</span>
          <span className="block truncate text-[0.88rem] text-ink/50">
            OpenBuds is open source under GPL-3.0-or-later
          </span>
        </span>
        <span aria-hidden className="text-ink/35 group-hover:text-tip">
          ↗
        </span>
      </a>
      {state.promptVolume !== undefined && (
        <Row
          stack
          title="Prompt volume"
          description="Loudness of the earbuds’ own sounds. A prompt plays when you change it."
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
      <Info label="Model" value={state.model ? "OnePlus Buds 4" : undefined} />
      <Info label="Firmware" value={state.firmware} error={state.errors.firmware} />
      <Info
        label="Audio codec"
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
    <div className="flex items-center justify-between gap-4 py-3.5">
      <span className="text-[1rem]">{label}</span>
      <span className={cx("text-[0.95rem] tabular-nums", value ? "text-ink/70" : "text-ink/40")}>
        {value ?? (error ? "Not reported" : "–")}
      </span>
    </div>
  );
}
