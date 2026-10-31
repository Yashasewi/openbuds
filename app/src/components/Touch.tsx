import { useState } from "react";
import {
  ACTIONS,
  CALL_MENUS,
  FUNCTIONS,
  GESTURE_MENUS,
  type Ear,
  type HoldMode,
} from "../lib/protocol";
import { run, session, useAction, useBuds } from "../lib/store";
import { Group, Row, Segmented, Select, Status, cx } from "./ui";

const ORDER = [1, 2, 3, 5, 4];
const HOLD_MODES: { mode: HoldMode; label: string }[] = [
  { mode: "anc", label: "Noise cancelling" },
  { mode: "adaptive", label: "Adaptive" },
  { mode: "transparency", label: "Transparency" },
  { mode: "off", label: "Off" },
];
const options = (fns: number[]) =>
  fns.map((fn) => ({ value: fn, label: FUNCTIONS[fn] ?? `Function ${fn}` }));

export function Touch() {
  const { state } = useBuds();
  const [ear, setEar] = useState<Ear>("Left");
  const table = state.gestures ?? [];
  const slots = ORDER.map(
    (action) =>
      [action, table.find((g) => g.side === ear && g.button !== 6 && g.action === action)] as const,
  ).filter(([, slot]) => slot);
  const calls = Object.keys(CALL_MENUS)
    .map(Number)
    .map((action) => [action, table.find((g) => g.button === 6 && g.action === action)] as const)
    .filter(([, slot]) => slot);

  return (
    <Group
      title="Touch controls"
      description="What each touch does. Each earbud has its own controls."
    >
      <div className="py-4">
        <div className="max-w-[16rem]">
          <Segmented<Ear>
            size="sm"
            label="Earbud"
            value={ear}
            onChange={setEar}
            options={[
              { value: "Left", label: "Left earbud" },
              { value: "Right", label: "Right earbud" },
            ]}
          />
        </div>
      </div>
      {!slots.length && (
        <Row
          title="No controls reported"
          description={
            state.errors.gestures ?? "The earbuds did not report touch controls for this side."
          }
        />
      )}
      {slots.map(([action, slot]) => (
        <GestureRow key={`${ear}-${action}`} ear={ear} action={action} fn={slot!.fn} />
      ))}
      {calls.length > 0 && (
        <div className="pt-5 pb-1">
          <h3 className="text-[0.95rem] font-medium text-ink">During calls</h3>
          <p className="text-[0.85rem] text-ink/55">These apply to both earbuds.</p>
        </div>
      )}
      {calls.map(([action, slot]) => (
        <CallRow key={action} action={action} fn={slot!.fn} />
      ))}
    </Group>
  );
}

function GestureRow({ ear, action, fn }: { ear: Ear; action: number; fn: number }) {
  const key = `gesture-${ear}-${action}`;
  const { busy, status } = useAction(key);
  const { state } = useBuds();
  return (
    <Row
      title={ACTIONS[action]}
      status={status}
      control={
        <Select
          label={`${ear} earbud ${ACTIONS[action]}`}
          value={fn}
          options={options(GESTURE_MENUS[action])}
          disabled={busy}
          onChange={(v) => run(key, () => session.setGesture(ear, action, v))}
        />
      }
    >
      {action === 4 && fn === 8 && state.holdCycle && <HoldCycle modes={state.holdCycle.modes} />}
    </Row>
  );
}

function HoldCycle({ modes }: { modes: HoldMode[] }) {
  const { busy, status } = useAction("holdCycle");
  return (
    <div className="mt-3.5">
      <p className="text-[0.85rem] text-ink/60">Modes to cycle through, on both earbuds</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {HOLD_MODES.map(({ mode, label }) => {
          const on = modes.includes(mode),
            last = on && modes.length === 1;
          return (
            <button
              key={mode}
              type="button"
              role="checkbox"
              aria-checked={on}
              disabled={busy || last}
              title={last ? "Keep at least one mode" : undefined}
              onClick={() =>
                run("holdCycle", () =>
                  session.setHoldCycle(on ? modes.filter((m) => m !== mode) : [...modes, mode]),
                )
              }
              className={cx(
                "inline-flex h-9 items-center gap-2 rounded-full pr-3.5 pl-2.5 text-[0.88rem] transition-colors disabled:cursor-not-allowed",
                on ? "bg-mint/50 text-tip" : "bg-ink/[0.06] text-ink/65 hover:bg-ink/10",
                busy && "opacity-60",
              )}
            >
              <span
                className={cx(
                  "grid size-4 place-items-center rounded-full border transition-colors",
                  on ? "border-tip bg-tip" : "border-ink/30",
                )}
              >
                {on && (
                  <svg aria-hidden viewBox="0 0 12 12" className="size-2.5 text-sheet">
                    <path
                      d="m2.5 6.2 2.3 2.3 4.7-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              {label}
            </button>
          );
        })}
      </div>
      <Status status={status} />
    </div>
  );
}

function CallRow({ action, fn }: { action: number; fn: number }) {
  const key = `call-${action}`;
  const { busy, status } = useAction(key);
  return (
    <Row
      title={ACTIONS[action]}
      status={status}
      control={
        <Select
          label={`During calls, ${ACTIONS[action]}`}
          value={fn}
          options={options(CALL_MENUS[action])}
          disabled={busy}
          onChange={(v) => run(key, () => session.setCallGesture(action, v))}
        />
      }
    />
  );
}
