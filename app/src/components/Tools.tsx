import { useEffect, useRef, useState } from "react";
import { HEARING_LOUD, HEARING_START, HEARING_STOPS, type FitResult } from "../lib/protocol";
import { confirm, run, session, useAction, useBuds } from "../lib/store";
import { Button, Dialog, Group, Row } from "./ui";

const FREQUENCIES = ["250 Hz", "500 Hz", "1 kHz", "2 kHz", "4 kHz", "8 kHz"];

export function Tools() {
  const { state, connection } = useBuds();
  const find = useAction("find"),
    fit = useAction("fit"),
    golden = useAction("hearing");
  const [ringing, setRinging] = useState(false);
  const [hearingOpen, setHearingOpen] = useState(false);
  useEffect(() => {
    if (connection !== "connected") {
      setRinging(false);
      setHearingOpen(false);
    }
  }, [connection]);

  async function ring() {
    if (
      !ringing &&
      !(await confirm(
        "Ring your earbuds?",
        "They will play a loud sound. Take them out of your ears first.",
        "Ring",
      ))
    )
      return;
    const on = !ringing;
    await run(
      "find",
      async () => {
        await session.findEarbuds(on);
        setRinging(on);
      },
      on ? "Ringing. Stop when you find them." : "Stopped ringing",
    );
  }
  async function fitTest() {
    if (
      !(await confirm(
        "Check the fit?",
        "Wear both earbuds. A short sound plays while the seal is measured, for about 10 seconds.",
        "Start",
      ))
    )
      return;
    void run(
      "fit",
      () => session.fitTest(),
      (r: FitResult) => `Left: ${r.left ?? "not measured"}. Right: ${r.right ?? "not measured"}.`,
    );
  }

  return (
    <Group title="Tools">
      {session.supports(0x0400) && (
        <Row
          title="Find earbuds"
          description="Play a sound from both earbuds to find them."
          status={find.status}
          control={
            <Button variant={ringing ? "danger" : "quiet"} disabled={find.busy} onClick={ring}>
              {ringing ? "Stop ringing" : "Ring"}
            </Button>
          }
        />
      )}
      {session.supports(0x0405) && (
        <Row
          title="Fit test"
          status={fit.status}
          description={
            state.fit
              ? `Last result. Left: ${state.fit.left ?? "not measured"}. Right: ${state.fit.right ?? "not measured"}.`
              : "Check that the ear tips seal well."
          }
          control={
            <Button disabled={fit.busy} onClick={fitTest}>
              Check fit
            </Button>
          }
        />
      )}
      {session.supports(0x040d) && (
        <Row
          title="Hearing test"
          status={golden.status}
          description="Twelve short tones, six per ear. The result becomes your Golden Sound profile."
          control={
            <Button disabled={golden.busy} onClick={() => setHearingOpen(true)}>
              Start test
            </Button>
          }
        />
      )}
      <HearingTest open={hearingOpen} onClose={() => setHearingOpen(false)} />
    </Group>
  );
}

function HearingTest({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(-1);
  const [levels, setLevels] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const warned = useRef(false);
  const active = useRef(false);
  const level = levels[step] ?? HEARING_START;

  useEffect(() => {
    const stop = session.onHearing((status) => {
      const text = (
        {
          5: "An earbud is out of your ear. Put it back to continue.",
          6: "Earbud back in. Continue.",
          7: "The test timed out. Close and start again.",
        } as Record<number, string>
      )[status];
      if (text) setNote(text);
    });
    return () => {
      stop();
    };
  }, []);
  useEffect(() => {
    if (open) {
      setStep(-1);
      setLevels([]);
      setNote("");
      warned.current = false;
    }
  }, [open]);

  async function play(at: number, index: number) {
    if (index >= HEARING_LOUD && !warned.current) {
      warned.current = true;
      setNote("This level is loud. Lower it if it is uncomfortable.");
    }
    try {
      await session.playTone(at < 6 ? 1 : 2, (at % 6) + 1, HEARING_STOPS[index]);
    } catch (error) {
      setNote((error as Error).message);
    }
  }
  async function end() {
    clearTimeout(timer.current);
    if (active.current && session.connected) {
      await session.stopTone().catch(() => {});
      await session.hearingTest(false).catch(() => {});
    }
    active.current = false;
  }
  async function start() {
    setStarting(true);
    try {
      await session.hearingTest(true);
    } catch (error) {
      setNote((error as Error).message);
      setStarting(false);
      return;
    }
    active.current = true;
    setStarting(false);
    setNote("");
    setStep(0);
    void play(0, HEARING_START);
  }
  function go(next: number) {
    const filled = [...levels];
    filled[step] = level;
    setLevels(filled);
    setStep(next);
    void play(next, filled[next] ?? HEARING_START);
  }
  async function finish() {
    const values = Array.from(
      { length: 12 },
      (_, i) => HEARING_STOPS[i === step ? level : (levels[i] ?? HEARING_START)],
    );
    await end();
    onClose();
    void run(
      "hearing",
      () => session.applyHearing(values),
      "Golden Sound profile applied and confirmed",
    );
  }
  function close() {
    void end();
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} title="Hearing test">
      {step < 0 ? (
        <>
          <p className="mt-3 text-[0.95rem] text-ink/70">
            Sit somewhere quiet and wear both earbuds. For each tone, move the slider until you can
            only just hear it.
          </p>
          <p className="mt-2 text-[0.88rem] text-ink/55">
            Your earbuds keep one profile. Finishing replaces the current one.
          </p>
        </>
      ) : (
        <>
          <div className="mt-4 flex items-baseline justify-between">
            <p className="text-[1rem]">
              {step < 6 ? "Left ear" : "Right ear"}, {FREQUENCIES[step % 6]}
            </p>
            <p className="numeral text-[0.9rem] text-ink/55 tabular-nums">{step + 1} of 12</p>
          </div>
          <div className="mt-3 flex gap-1" aria-hidden>
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i < step ? "bg-tip" : i === step ? "bg-mint" : "bg-ink/10"} ${i === 6 ? "ml-2" : ""}`}
              />
            ))}
          </div>
          <div className="mt-7">
            <input
              key={step}
              type="range"
              className="range w-full"
              aria-label="Tone level"
              min={0}
              max={HEARING_STOPS.length - 1}
              step={1}
              defaultValue={level}
              style={
                {
                  "--fill": `${(level / (HEARING_STOPS.length - 1)) * 100}%`,
                } as React.CSSProperties
              }
              onInput={(e) => {
                const v = Number(e.currentTarget.value);
                e.currentTarget.style.setProperty(
                  "--fill",
                  `${(v / (HEARING_STOPS.length - 1)) * 100}%`,
                );
                const filled = [...levels];
                filled[step] = v;
                setLevels(filled);
                clearTimeout(timer.current);
                timer.current = setTimeout(() => void play(step, v), 300);
              }}
            />
            <div className="mt-1.5 flex justify-between text-[0.8rem] text-ink/50">
              <span>Quieter</span>
              <span>Louder</span>
            </div>
          </div>
        </>
      )}
      <p aria-live="polite" className="mt-4 min-h-[1.3em] text-[0.88rem] text-warn">
        {note}
      </p>
      <div className="mt-4 flex justify-between gap-2">
        <Button onClick={close}>Cancel</Button>
        <div className="flex gap-2">
          {step > 0 && <Button onClick={() => go(step - 1)}>Back</Button>}
          {step < 0 && (
            <Button variant="primary" disabled={starting} onClick={start}>
              {starting ? "Starting…" : "Start"}
            </Button>
          )}
          {step >= 0 && step < 11 && (
            <Button variant="primary" onClick={() => go(step + 1)}>
              Next
            </Button>
          )}
          {step === 11 && (
            <Button variant="primary" onClick={finish}>
              Finish and apply
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
