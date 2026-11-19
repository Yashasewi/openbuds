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

const BUILT_IN: { id: number; name: string; note: string; previewGains: number[] }[] = [
  { id: 0, name: "Balanced", note: "Even across the range", previewGains: [0, 0, 0, 0, 0, 0] },
  {
    id: 1,
    name: "Serenade",
    note: "Forward midrange & vocals",
    previewGains: [-1, 1, 3, 2, 0, -1],
  },
  { id: 2, name: "Bass", note: "Weighted low-end shelf", previewGains: [4, 3, 0, 0, 1, 0] },
];
const signedText = (v: number) => (v > 0 ? `+${v}` : String(v));

export function Sound() {
  const { state } = useBuds();
  const f = state.features ?? {};
  const presets = useAction("eq");
  const [editing, setEditing] = useState<Preset | "new" | null>(null);
  const custom = state.customPresets ?? [];

  const activeEqName =
    BUILT_IN.find((b) => b.id === state.eq)?.name ??
    custom.find((c) => c.id === state.eq)?.name ??
    undefined;
  const codecName = state.codec !== undefined ? CODECS[state.codec] : undefined;
  const meta = [codecName, activeEqName].filter(Boolean).join(" · ") || undefined;

  return (
    <Group
      title="Sound & equalizer"
      meta={meta}
      description="Shaped across the 11 mm woofer and 6 mm tweeter. Every write is read back from the earbuds before showing as confirmed."
    >
      <Row
        stack
        title="Sound Master EQ"
        description={
          custom.length
            ? "Select a preset, or edit your 6-band custom curves."
            : "Select a factory tuning, or build a 6-band custom preset."
        }
        status={presets.status}
        control={
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BUILT_IN.map((p) => (
              <PresetTile
                key={p.id}
                name={p.name}
                note={p.note}
                bands={EQ_BANDS.map((frequency, idx) => ({
                  frequency,
                  gain: p.previewGains[idx] ?? 0,
                }))}
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
                className="flex min-h-[4.6rem] items-center justify-center rounded-md border border-dashed border-ink/20 px-3 text-[0.84rem] text-muted transition-colors hover:border-tip/60 hover:text-tip disabled:opacity-45"
              >
                + New custom EQ
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
              ? `Tuned to your ear-canal & hearing profile (${state.golden.name}).`
              : "Compensates per ear across six frequencies. Run the hearing test in Tools to build a profile."
          }
        />
      )}

      {f[SWITCHES.bassWave] !== undefined && <BassWave />}
      {f[SWITCHES.hiRes] !== undefined && (
        <SwitchRow
          id={SWITCHES.hiRes}
          title="Hi-Res audio (LHDC 5.0)"
          description="Up to 24-bit / 192 kHz wireless audio. Toggling restarts the earbud link for a few seconds."
          unavailable={
            state.codec !== undefined && state.codec !== 7 && state.codec !== 8
              ? `Requires LHDC 5.0, which macOS does not transmit. Connected over ${CODECS[state.codec] ?? "another codec"} on this computer; stored separately for your phone.`
              : undefined
          }
        />
      )}
      {f[SWITCHES.spatial] !== undefined && (
        <SwitchRow
          id={SWITCHES.spatial}
          title="OnePlus 3D Audio"
          description="Spatial soundstage processing. Cannot be active at the same time as Hi-Res audio."
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
        "group relative flex min-h-[4.6rem] flex-col justify-between rounded-md p-3 transition-colors",
        selected
          ? "bg-mint/45 text-ink ring-1 ring-tip/55"
          : "bg-fog/75 text-ink ring-1 ring-ink/10 hover:ring-ink/25",
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        disabled={disabled}
        onClick={() => !selected && onSelect()}
        className="absolute inset-0 rounded-md disabled:cursor-not-allowed"
        aria-label={`Use ${name}`}
      />
      <div className="pointer-events-none flex items-center justify-between gap-2">
        <span className={cx("text-[0.86rem] leading-tight", selected && "font-medium text-tip")}>
          {name}
        </span>
        {selected && !onEdit && <span className="size-1.5 rounded-full bg-tip" />}
      </div>
      {bands && <Curve bands={bands} selected={selected} />}
      {note && (
        <span className="pointer-events-none truncate text-[0.74rem] text-muted">{note}</span>
      )}
      {onEdit && (
        <button
          type="button"
          disabled={disabled}
          onClick={onEdit}
          className="absolute top-2 right-2 rounded px-1.5 py-0.5 text-[0.74rem] text-muted transition-colors hover:bg-ink/8 hover:text-ink"
        >
          Edit
        </button>
      )}
    </div>
  );
}

function Curve({ bands, selected }: { bands: Band[]; selected: boolean }) {
  const w = 100,
    h = 20,
    x = (i: number) => (i / Math.max(1, bands.length - 1)) * w,
    y = (g: number) => h / 2 - (g / EQ_GAIN) * (h / 2 - 2.5);
  const d = bands
    .map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(b.gain).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none my-1 h-4 w-full"
    >
      <line
        x1="0"
        x2={w}
        y1={h / 2}
        y2={h / 2}
        stroke="currentColor"
        strokeOpacity="0.14"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={d}
        fill="none"
        stroke={selected ? "var(--color-tip)" : "#6d7270"}
        strokeWidth="1.5"
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
      title={existing ? `Edit ${existing.name}` : "New 6-band preset"}
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
      <label className="mt-4 block">
        <span className="text-[0.82rem] text-muted">Preset name</span>
        <input
          value={name}
          maxLength={16}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 h-9.5 w-full rounded-md bg-fog px-3 text-[0.9rem] text-ink ring-1 ring-ink/14 outline-none focus-visible:ring-2 focus-visible:ring-tip"
        />
      </label>
      {!valid && (
        <p className="mt-1.5 text-[0.78rem] text-warn">
          Use 1 to 16 plain ASCII letters, digits or symbols.
        </p>
      )}
      <div className="mt-5 grid grid-cols-6 gap-1 rounded-md border border-ink/10 bg-fog px-2 pt-3.5 pb-2.5">
        {bands.map((b, i) => (
          <label key={b.frequency} className="flex flex-col items-center gap-2">
            <output className="numeral text-[0.84rem] text-ink tabular-nums">
              {signedText(b.gain)}
            </output>
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
              className="range-vertical h-34"
            />
            <span className="text-[0.74rem] text-muted tabular-nums">{label(b.frequency)}</span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-center text-[0.74rem] text-muted">Frequency in Hz · gain in dB</p>
      <div className="mt-5 flex items-center justify-between gap-2">
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
      title="BassWave 2.0"
      description="Dynamic low-frequency reinforcement across the 11 mm woofer."
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
        <div className="mt-3">
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
