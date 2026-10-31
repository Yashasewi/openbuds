import { useState } from "react";
import {
  CODECS,
  EQ_BANDS,
  EQ_GAIN,
  EQ_MAX_CUSTOM,
  SWITCHES,
  type Band,
  type Preset,
} from "../lib/protocol";
import { confirm, run, session, useAction, useBuds } from "../lib/store";
import { Button, Dialog, Group, Range, Row, Switch, cx } from "./ui";

const BUILT_IN: { id: number; name: string; note: string }[] = [
  { id: 0, name: "Balanced", note: "Even across the range" },
  { id: 1, name: "Serenade", note: "Brighter voices" },
  { id: 2, name: "Bass", note: "Fuller low end" },
];
const signedText = (v: number) => (v > 0 ? `+${v}` : String(v));

export function Sound() {
  const { state } = useBuds();
  const f = state.features ?? {};
  const presets = useAction("eq");
  const [editing, setEditing] = useState<Preset | "new" | null>(null);
  const custom = state.customPresets ?? [];

  return (
    <Group
      title="Sound"
      description="How your music is shaped. Every change is read back from the earbuds before it shows as done."
    >
      <Row
        stack
        title="Equalizer"
        description={
          custom.length
            ? "Select a preset. Custom presets can be edited."
            : "Select a preset, or make your own."
        }
        status={presets.status}
        control={
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BUILT_IN.map((p) => (
              <PresetTile
                key={p.id}
                name={p.name}
                note={p.note}
                selected={state.eq === p.id}
                disabled={presets.busy}
                onSelect={() => run("eq", () => session.setEq(p.id))}
              />
            ))}
            {custom.map((p) => (
              <PresetTile
                key={`${p.id}-${p.name}`}
                name={p.name}
                bands={p.bands}
                selected={state.eq === p.id}
                disabled={presets.busy}
                onSelect={() => run("eq", () => session.setEq(p.id))}
                onEdit={() => setEditing(p)}
              />
            ))}
            {state.customPresets && custom.length < EQ_MAX_CUSTOM && (
              <button
                type="button"
                disabled={presets.busy}
                onClick={() => setEditing("new")}
                className="flex min-h-[4.75rem] items-center justify-center rounded-2xl border border-dashed border-ink/20 px-3 text-[0.92rem] text-ink/60 transition-colors hover:border-tip/50 hover:text-tip disabled:opacity-45"
              >
                New preset
              </button>
            )}
          </div>
        }
      />
      <PresetEditor preset={editing} onClose={() => setEditing(null)} count={custom.length} />

      {f[SWITCHES.goldenSound] !== undefined && (
        <SwitchRow
          id={SWITCHES.goldenSound}
          title="Golden Sound"
          description={
            state.golden
              ? `Tuned to your hearing profile from ${state.golden.name}.`
              : "Tunes sound to your hearing. Run the hearing test in Tools to make a profile."
          }
        />
      )}

      {f[SWITCHES.bassWave] !== undefined && <BassWave />}
      {f[SWITCHES.hiRes] !== undefined && (
        <SwitchRow
          id={SWITCHES.hiRes}
          title="Hi-Res audio"
          description="Higher-quality wireless audio. Changing it restarts the connection for a few seconds."
          unavailable={
            state.codec !== undefined && state.codec !== 7 && state.codec !== 8
              ? `Needs LHDC, which macOS doesn’t support. This Mac is connected with ${CODECS[state.codec] ?? "another codec"}, so the earbuds refuse it here. It is set separately for each device, so it can still be on for your phone.`
              : undefined
          }
        />
      )}
      {f[SWITCHES.spatial] !== undefined && (
        <SwitchRow
          id={SWITCHES.spatial}
          title="3D Audio"
          description="Spatial sound. It can’t be on together with Hi-Res audio."
        />
      )}
    </Group>
  );
}

function PresetTile({
  name,
  note,
  bands,
  selected,
  disabled,
  onSelect,
  onEdit,
}: {
  name: string;
  note?: string;
  bands?: Band[];
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onEdit?: () => void;
}) {
  return (
    <div
      className={cx(
        "group relative flex min-h-[4.75rem] flex-col justify-between rounded-2xl p-3 transition-colors",
        selected ? "bg-tip text-sheet" : "bg-ink/[0.05] text-ink hover:bg-ink/[0.08]",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => !selected && onSelect()}
        className="absolute inset-0 rounded-2xl disabled:cursor-not-allowed"
        aria-label={`Use ${name}`}
      />
      <div className="pointer-events-none flex items-start justify-between gap-2">
        <span className="text-[0.95rem] leading-tight">{name}</span>
      </div>
      {bands ? (
        <Curve bands={bands} selected={selected} />
      ) : (
        <span
          className={cx(
            "pointer-events-none text-[0.8rem]",
            selected ? "text-sheet/70" : "text-ink/50",
          )}
        >
          {note}
        </span>
      )}
      {onEdit && (
        <button
          type="button"
          disabled={disabled}
          onClick={onEdit}
          className={cx(
            "absolute top-2 right-2 rounded-lg px-2 py-0.5 text-[0.78rem] transition-colors",
            selected ? "text-sheet/80 hover:bg-sheet/15" : "text-ink/55 hover:bg-ink/10",
          )}
        >
          Edit
        </button>
      )}
    </div>
  );
}

function Curve({ bands, selected }: { bands: Band[]; selected: boolean }) {
  const w = 100,
    h = 22,
    x = (i: number) => (i / Math.max(1, bands.length - 1)) * w,
    y = (g: number) => h / 2 - (g / EQ_GAIN) * (h / 2 - 2);
  const d = bands
    .map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(b.gain).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none h-5 w-full"
    >
      <line
        x1="0"
        x2={w}
        y1={h / 2}
        y2={h / 2}
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke={selected ? "var(--color-mint)" : "var(--color-tip)"}
        strokeWidth="1.8"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PresetEditor({
  preset,
  onClose,
  count,
}: {
  preset: Preset | "new" | null;
  onClose: () => void;
  count: number;
}) {
  const existing = preset && preset !== "new" ? preset : null;
  return (
    <Dialog
      open={!!preset}
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : "New preset"}
      wide
    >
      {preset && (
        <EditorBody
          key={existing ? `${existing.id}-${existing.name}` : "new"}
          existing={existing}
          count={count}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function EditorBody({
  existing,
  count,
  onClose,
}: {
  existing: Preset | null;
  count: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? `Custom ${count + 1}`);
  const [bands, setBands] = useState<Band[]>(
    existing?.bands ?? EQ_BANDS.map((frequency) => ({ frequency, gain: 0 })),
  );
  const valid = /^[ -~]{1,16}$/.test(name.trim());
  const label = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f));

  function save() {
    const finalName = name.trim();
    onClose();
    void run(
      "eq",
      async () => {
        const target =
          existing ??
          (await session.createPreset(
            finalName,
            bands.map((b) => ({ ...b, gain: 0 })),
          ));
        await session.savePreset({ ...target, name: finalName, bands });
      },
      existing ? `${finalName} saved and confirmed` : `${finalName} created and confirmed`,
    );
  }
  async function remove() {
    if (!existing) return;
    onClose();
    if (
      await confirm(`Delete ${existing.name}?`, "The preset is removed from the earbuds.", "Delete")
    )
      void run("eq", () => session.deletePreset(existing), `${existing.name} deleted`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save();
      }}
    >
      <label className="mt-5 block">
        <span className="text-[0.88rem] text-ink/60">Name</span>
        <input
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-xl bg-ink/[0.06] px-3.5 text-base text-ink outline-none focus-visible:ring-2 focus-visible:ring-tip"
        />
      </label>
      {!valid && (
        <p className="mt-1.5 text-[0.82rem] text-warn">
          Use 1 to 16 plain letters, digits or symbols.
        </p>
      )}
      <div className="mt-6 grid grid-cols-6 gap-1 rounded-2xl bg-ink/[0.04] px-2 pt-4 pb-3">
        {bands.map((b, i) => (
          <label key={b.frequency} className="flex flex-col items-center gap-2">
            <output className="numeral text-[0.95rem] tabular-nums">{signedText(b.gain)}</output>
            <input
              type="range"
              min={-EQ_GAIN}
              max={EQ_GAIN}
              step={1}
              value={b.gain}
              aria-label={`${b.frequency} Hz`}
              onChange={(e) =>
                setBands(
                  bands.map((x, j) => (j === i ? { ...x, gain: Number(e.target.value) } : x)),
                )
              }
              className="range-vertical h-36"
            />
            <span className="text-[0.78rem] text-ink/55">{label(b.frequency)}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-center text-[0.78rem] text-ink/45">Hz, gain in dB</p>
      <div className="mt-6 flex items-center justify-between gap-2">
        {existing ? (
          <Button variant="danger" onClick={remove}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={!valid}>
            {existing ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function BassWave() {
  const { state } = useBuds();
  const toggle = useAction("bassWave"),
    level = useAction("bassLevel");
  const on = state.features?.[SWITCHES.bassWave];
  return (
    <Row
      title="BassWave"
      description="Extra bass that adapts to what you play."
      status={toggle.status ?? level.status}
      control={
        <Switch
          label="BassWave"
          on={on === undefined ? undefined : on === 1}
          disabled={toggle.busy}
          onChange={(v) =>
            run("bassWave", () => session.setSwitch(SWITCHES.bassWave, v, "BassWave"))
          }
        />
      }
    >
      {on === 1 && state.bass !== undefined && (
        <div className="mt-3.5">
          <Range
            label="BassWave strength"
            min={-5}
            max={5}
            value={state.bass}
            disabled={level.busy}
            format={signedText}
            onCommit={(v) => run("bassLevel", () => session.setBass(v))}
          />
        </div>
      )}
    </Row>
  );
}

export function SwitchRow({
  id,
  title,
  description,
  unavailable,
}: {
  id: number;
  title: string;
  description: string;
  unavailable?: string;
}) {
  const { state } = useBuds();
  const key = `switch-${id}`;
  const { busy, status } = useAction(key);
  const value = state.features?.[id];
  const f = state.features ?? {};

  async function change(on: boolean) {
    if (id === SWITCHES.hiRes) {
      const extra = on && f[SWITCHES.spatial] === 1 ? " 3D Audio will be turned off." : "";
      if (
        !(await confirm(
          `Turn Hi-Res audio ${on ? "on" : "off"}?`,
          `The earbuds restart their connection for a few seconds.${extra}`,
          on ? "Turn on" : "Turn off",
        ))
      )
        return;
      return run(key, () => session.setHiRes(on));
    }
    if (id === SWITCHES.spatial) {
      if (
        on &&
        f[SWITCHES.hiRes] === 1 &&
        !(await confirm(
          "Turn on 3D Audio?",
          "3D Audio and Hi-Res can’t be on together. Hi-Res will be turned off, which restarts the connection.",
          "Turn on",
        ))
      )
        return;
      return run(key, () => session.setSpatial(on));
    }
    if (
      id === SWITCHES.goldenSound &&
      on &&
      !state.golden &&
      !(await confirm(
        "Turn on Golden Sound?",
        "No hearing profile was found on the earbuds. Run the hearing test in Tools to make one.",
        "Turn on anyway",
      ))
    )
      return;
    if (id === SWITCHES.dualConnection) {
      if (
        !on &&
        !(await confirm(
          "Turn off dual connection?",
          "Your other device may disconnect from the earbuds.",
          "Turn off",
        ))
      )
        return;
      return run(key, () => session.setDualConnection(on));
    }
    return run(key, () => session.setSwitch(id, on, title));
  }

  return (
    <Row
      title={title}
      description={unavailable ?? description}
      status={status}
      control={
        <Switch
          label={title}
          on={value === undefined ? undefined : value === 1}
          disabled={busy || !!unavailable}
          onChange={change}
        />
      }
    />
  );
}
