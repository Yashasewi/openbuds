import { useEffect, useMemo, useRef, useState } from "react";
import {
  ellipseXY,
  extrudeZ,
  isoCirclePath,
  isoProject,
  latheSolid,
  orthonormalFrame,
  roundedRectXY,
  svgPath,
  vecAdd,
  vecNorm,
  vecScale,
  type Point2,
  type Point3,
  type Projection,
  type SolidPart,
} from "../lib/iso";
import { ANC_LEVELS, CODECS, type NoiseMode } from "../lib/protocol";
import { run, session, useBuds } from "../lib/store";
import { cx } from "./ui";

export type Subsystem = "all" | "drivers" | "anc" | "stem" | "case";

export const SUBSYSTEM_META: Record<
  Subsystem,
  {
    key: string;
    label: string;
    spec: string;
    summary: string;
  }
> = {
  all: {
    key: "0",
    label: "Overview",
    spec: "11 mm + 6 mm · Dual DAC · 55 dB ANC · BT 5.4",
    summary:
      "Coaxial dual-driver earbud and oval pebble case. Drag across the plate or press E to bring the five assemblies together or apart.",
  },
  drivers: {
    key: "1",
    label: "Drivers",
    spec: "11 mm 30-layer ceramic-metal woofer + 6 mm flat tweeter",
    summary:
      "A 6 mm flat-diaphragm tweeter sits coaxially ahead of an 11 mm ceramic-metal dome woofer, each driven by its own dedicated DAC.",
  },
  anc: {
    key: "2",
    label: "3-Mic ANC",
    spec: "800×/s real-time loop · 5,500 Hz bandwidth · TÜV rated",
    summary:
      "Feed-forward, feed-back and stem talk microphones sample ambient and ear-canal sound 800 times per second for dynamic cancellation and AI Clear Call.",
  },
  stem: {
    key: "3",
    label: "Stem & DAC",
    spec: "Twin DAC mainboard · LHDC 5.0 24-bit/192 kHz · Swipe bar",
    summary:
      "The cylindrical stem houses the twin-DAC Bluetooth 5.4 board, prismatic cell, capacitive volume-swipe track, talk mic and pogo contacts.",
  },
  case: {
    key: "4",
    label: "Case",
    spec: "45 h total · 11 h buds · 10 min charge → 11 h playback",
    summary:
      "Horizontal clamshell case with dual sculpted cradles, status LED and IP55-rated earbuds.",
  },
};

const PROJ: Projection = {
  origin: [358, 214],
  scale: 4.45,
  azimuth: 40,
  elevation: 30,
};

// Coaxial acoustic axis pointing forward-right toward the viewer
const AXIS: Point3 = [0.92, -0.22, 0.14];

const DEMO_MODES: { value: NoiseMode; label: string; meta: string }[] = [
  { value: "smart", label: "Noise cancelling", meta: "Up to 55 dB · 800×/s" },
  { value: "adaptive", label: "Adaptive", meta: "Auto ANC + ambient" },
  { value: "transparency", label: "Transparency", meta: "Pass-through field" },
  { value: "off", label: "Off", meta: "Passive seal" },
];

export function BudsAnatomy({
  subsystem,
  onSubsystemChange,
}: {
  subsystem: Subsystem;
  onSubsystemChange: (next: Subsystem) => void;
}) {
  const { connection, state } = useBuds();
  const connected = connection === "connected";

  const [wantApart, setWantApart] = useState(true);
  const [explode, setExplode] = useState(1);
  const [demoMode, setDemoMode] = useState<NoiseMode>("smart");
  const [dragging, setDragging] = useState(false);

  const springRef = useRef({ pos: 1, vel: 0 });
  const dragStartRef = useRef<{ x: number; startPos: number; moved: boolean } | null>(null);
  const plateRef = useRef<HTMLDivElement>(null);

  const activeMode: NoiseMode = (connected ? state.noise?.mode : undefined) ?? demoMode;

  // Critically-damped spring integration (matches wheresryan22/anatomy rig physics)
  useEffect(() => {
    if (dragging) return;
    const target = wantApart ? 1 : 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      springRef.current = { pos: target, vel: 0 };
      setExplode(target);
      return;
    }

    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const stiff = 150;
      const damp = 22;
      const s = springRef.current;
      const sub = 4;
      const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        const acc = (target - s.pos) * stiff - s.vel * damp;
        s.vel += acc * h;
        s.pos += s.vel * h;
      }
      if (Math.abs(target - s.pos) < 0.0015 && Math.abs(s.vel) < 0.005) {
        s.pos = target;
        s.vel = 0;
        setExplode(target);
        return;
      }
      setExplode(Math.max(0, Math.min(1.08, s.pos)));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [wantApart, dragging]);

  // Keyboard shortcuts: E (apart/together), 0-4 (subsystems), M (cycle acoustic mode)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      const k = e.key.toLowerCase();
      if (k === "e") {
        e.preventDefault();
        setWantApart((v) => !v);
      } else if (k === "0") {
        onSubsystemChange("all");
      } else if (k === "1") {
        onSubsystemChange("drivers");
        setWantApart(true);
      } else if (k === "2") {
        onSubsystemChange("anc");
        setWantApart(true);
      } else if (k === "3") {
        onSubsystemChange("stem");
        setWantApart(true);
      } else if (k === "4") {
        onSubsystemChange("case");
        setWantApart(true);
      } else if (k === "m") {
        e.preventDefault();
        const order: NoiseMode[] = ["smart", "adaptive", "transparency", "off"];
        const idx = order.indexOf(
          (ANC_LEVELS as readonly string[]).includes(activeMode) || activeMode === "anc"
            ? "smart"
            : activeMode,
        );
        const next = order[(idx + 1) % order.length]!;
        if (connected) {
          void run("noise", () => session.setNoise(next === "smart" ? "anc" : next));
        } else {
          setDemoMode(next);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeMode, connected, onSubsystemChange]);

  const selectSubsystem = (next: Subsystem) => {
    onSubsystemChange(next);
    if (next !== "all" && explode < 0.45) {
      setWantApart(true);
    }
  };

  const scene = useMemo(
    () => buildBudsScene(explode, subsystem, activeMode, state.battery?.case?.charging),
    [explode, subsystem, activeMode, state.battery?.case?.charging],
  );

  // Corner plate readouts derived from the exact live model
  const topRight = state.firmware
    ? `ONEPLUS BUDS 4 · FW ${state.firmware}`
    : "ONEPLUS BUDS 4 · MODEL 065414";

  const bottomLeft = connected
    ? [
        state.noise?.name ?? activeMode.toUpperCase(),
        state.codec !== undefined ? CODECS[state.codec] : null,
        state.battery?.left?.percent ? `L ${state.battery.left.percent}%` : null,
        state.battery?.right?.percent ? `R ${state.battery.right.percent}%` : null,
        state.battery?.case?.percent ? `CASE ${state.battery.case.percent}%` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : SUBSYSTEM_META[subsystem].spec.toUpperCase();

  const bottomRight =
    explode > 0.85
      ? "APART · 5 ASSEMBLIES"
      : explode < 0.12
        ? "ASSEMBLED · COAXIAL SEAL"
        : `SEPARATION ${Math.round(explode * 100)}%`;

  return (
    <figure className="iso-figure" id="anatomy">
      <div
        ref={plateRef}
        role="region"
        aria-label="Interactive isometric hardware diagram of OnePlus Buds 4"
        tabIndex={0}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStartRef.current = {
            x: e.clientX,
            startPos: springRef.current.pos,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = dragStartRef.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 4) {
            d.moved = true;
            if (!dragging) setDragging(true);
            const width = plateRef.current?.clientWidth || 600;
            const next = Math.max(0, Math.min(1, d.startPos + dx / (width * 0.45)));
            springRef.current = { pos: next, vel: 0 };
            setExplode(next);
          }
        }}
        onPointerUp={() => {
          const d = dragStartRef.current;
          dragStartRef.current = null;
          if (!d) return;
          if (d.moved) {
            setDragging(false);
            setWantApart(springRef.current.pos >= 0.45);
          } else {
            setWantApart((v) => !v);
          }
        }}
        onPointerCancel={() => {
          dragStartRef.current = null;
          setDragging(false);
        }}
        className="iso-plate group select-none"
      >
        <div className="iso-plate-corners" aria-hidden>
          <span className="iso-plate-corner top-0 left-0">FIG 01</span>
          <span className="iso-plate-corner top-0 right-0">{topRight}</span>
          <span className="iso-plate-corner bottom-0 left-0">{bottomLeft}</span>
          <span className="iso-plate-corner bottom-0 right-0">{bottomRight}</span>
        </div>

        <svg
          viewBox="0 0 760 440"
          className="iso-svg"
          aria-label={`OnePlus Buds 4 hardware figure, ${wantApart ? "exploded into five coaxial assemblies" : "assembled"}`}
        >
          <defs>
            <radialGradient id="plinth-glow" cx="54%" cy="54%" r="48%">
              <stop offset="0%" stopColor="#d7eae3" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#d7eae3" stopOpacity="0" />
            </radialGradient>
            <filter id="plinth-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" />
            </filter>
          </defs>

          {/* Soft ambient acoustic glow & base contact shadow */}
          <ellipse cx="430" cy="240" rx="250" ry="135" fill="url(#plinth-glow)" />
          <path d={scene.plinthShadow} fill="#8b908d" opacity="0.22" filter="url(#plinth-shadow)" />

          {/* Plinth surface grid & calibration ticks (behind standing assemblies) */}
          {scene.plinthParts.map((part) => (
            <SolidGroup key={part.id} part={part} />
          ))}
          <path d={scene.plinthGroove} className="iso-line" data-tone="faint" />
          <path d={scene.plinthTicks} className="iso-line" data-tone="lo" />

          {/* Coaxial alignment datum lines when exploded */}
          {scene.datumLines.map((line, i) => (
            <path
              key={i}
              d={line.d}
              className="iso-line"
              data-tone={line.lit ? "celadon" : "lo"}
              strokeDasharray="1.8 3.6"
              opacity={line.opacity}
            />
          ))}

          {/* Depth-sorted 3D solid parts */}
          {scene.parts.map((part) => (
            <SolidGroup key={part.id} part={part} />
          ))}

          {/* Precision micro-details: driver basket vents, PCB traces, mesh dots, LED */}
          {scene.details.map((det, i) => (
            <path
              key={`det-${i}`}
              d={det.d}
              className="iso-line"
              data-tone={det.tone}
              strokeDasharray={det.dash}
              opacity={det.opacity ?? 1}
            />
          ))}

          {scene.dots.map((dot, i) => (
            <circle
              key={`dot-${i}`}
              cx={dot.cx}
              cy={dot.cy}
              r={dot.r}
              fill={dot.fill}
              opacity={dot.opacity ?? 1}
            />
          ))}

          {/* Acoustic & ANC wavefront rings along coaxial & feed-forward axes */}
          {scene.waves.map((wave, i) => (
            <path
              key={`wave-${i}`}
              d={wave.d}
              fill="none"
              stroke={wave.stroke}
              strokeWidth={wave.width}
              strokeDasharray={wave.dash}
              strokeLinecap="round"
              opacity={wave.opacity}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>

      {/* Caption & interactive controls strip beneath the figure plate */}
      <figcaption className="mt-3.5 flex flex-col gap-3 text-[0.84rem] text-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(SUBSYSTEM_META) as Subsystem[]).map((key) => {
              const item = SUBSYSTEM_META[key];
              const active = subsystem === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectSubsystem(key)}
                  className={cx(
                    "inline-flex h-7 items-center gap-1.5 rounded px-2 text-[0.8rem] transition-colors",
                    active
                      ? "bg-tip text-white"
                      : "bg-sheet text-ink/75 ring-1 ring-ink/12 hover:ring-ink/28 hover:text-ink",
                  )}
                >
                  <kbd
                    className={cx(
                      "font-mono text-[0.7rem]",
                      active ? "text-white/75" : "text-muted",
                    )}
                  >
                    {item.key}
                  </kbd>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setWantApart((v) => !v)}
              className="inline-flex h-7 items-center gap-1.5 rounded bg-sheet px-2.5 text-[0.8rem] text-ink ring-1 ring-ink/14 transition-colors hover:ring-ink/30"
            >
              <kbd className="rounded border border-ink/15 bg-fog px-1 py-0.2 font-mono text-[0.68rem] text-ink/75">
                E
              </kbd>
              <span>{wantApart ? "Together" : "Apart"}</span>
            </button>
          </div>
        </div>

        {/* Acoustic field selector (controls live earbuds when connected, or simulates wavefield when idle) */}
        <div className="flex flex-col gap-2 border-t border-ink/10 pt-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-[58ch] leading-relaxed text-ink/75">
            {SUBSYSTEM_META[subsystem].summary}
          </p>
          <div
            className="flex shrink-0 flex-wrap items-center gap-1"
            role="group"
            aria-label="Acoustic field mode"
          >
            {DEMO_MODES.map((m) => {
              const isAncActive =
                m.value === "smart" &&
                (activeMode === "anc" || (ANC_LEVELS as readonly string[]).includes(activeMode));
              const selected = isAncActive || activeMode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => {
                    if (connected) {
                      void run("noise", () =>
                        session.setNoise(m.value === "smart" ? "anc" : m.value),
                      );
                    } else {
                      setDemoMode(m.value);
                    }
                  }}
                  className={cx(
                    "h-6.5 rounded px-2 text-[0.76rem] transition-colors",
                    selected
                      ? "bg-mint text-tip font-medium ring-1 ring-tip/30"
                      : "text-muted hover:bg-ink/[0.04] hover:text-ink",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}

function SolidGroup({ part }: { part: SolidPart }) {
  return (
    <g
      className="iso-solid"
      data-lit={part.lit ? "" : undefined}
      data-brass={part.brass ? "" : undefined}
      data-dark={part.dark ? "" : undefined}
    >
      {part.faces.map((f, idx) => (
        <path
          key={idx}
          d={f.d}
          className={f.shade === "top" ? "iso-top" : "iso-shade"}
          data-shade={f.shade === "top" ? undefined : f.shade}
          data-seamless={f.seamless ? "" : undefined}
        />
      ))}
      {part.crease && <path d={part.crease} className="iso-line" data-tone="lo" />}
      {part.outline && (
        <path
          d={part.outline}
          className="iso-line iso-edge"
          data-tone={part.lit ? "celadon" : "hi"}
        />
      )}
    </g>
  );
}

interface BuiltScene {
  plinthShadow: string;
  plinthParts: SolidPart[];
  plinthGroove: string;
  plinthTicks: string;
  datumLines: { d: string; lit?: boolean; opacity: number }[];
  parts: SolidPart[];
  details: {
    d: string;
    tone: "hi" | "mid" | "lo" | "faint" | "celadon";
    dash?: string;
    opacity?: number;
  }[];
  dots: { cx: number; cy: number; r: number; fill: string; opacity?: number }[];
  waves: { d: string; stroke: string; width: number; dash?: string; opacity: number }[];
}

function buildBudsScene(
  explode: number,
  subsystem: Subsystem,
  mode: NoiseMode,
  caseCharging?: boolean,
): BuiltScene {
  const e = Math.max(0, Math.min(1.1, explode));
  const { u, v, w } = orthonormalFrame(AXIS);

  const litDrivers = subsystem === "drivers" || subsystem === "all";
  const litAnc = subsystem === "anc";
  const litStem = subsystem === "stem";
  const litCase = subsystem === "case";

  // ── 0. Precision Machined Datum Plinth ───────────────────────────────────
  const plinthZ = -21.5;
  const plinthH = 4.2;
  const plinthTopZ = plinthZ + plinthH;
  const shadowRing = roundedRectXY(1, 2, 118, 76, 9, 5).map((xy) =>
    isoProject([xy[0], xy[1], plinthZ - 1.4], PROJ),
  );
  const plinthShadow = svgPath(shadowRing, true);

  const plinthSkirt = extrudeZ(
    "plinth-skirt",
    roundedRectXY(0, 0, 112, 70, 7, 5),
    plinthZ - 2.0,
    2.0,
    PROJ,
  );
  const plinthDeck = extrudeZ(
    "plinth-deck",
    roundedRectXY(0, 0, 116, 74, 8, 6),
    plinthZ,
    plinthH,
    PROJ,
  );

  // Four corner hex-socket cap screws on plinth top
  const screwCoords: Point2[] = [
    [-50, -30],
    [50, -30],
    [-50, 30],
    [50, 30],
  ];
  const screwParts = screwCoords.map(([sx, sy], idx) =>
    extrudeZ(`plinth-screw-${idx}`, ellipseXY(sx, sy, 1.9, 1.9, 14), plinthTopZ, 0.8, PROJ),
  );

  const groovePts = roundedRectXY(0, 0, 107, 65, 5.5, 5).map((xy) =>
    isoProject([xy[0], xy[1], plinthTopZ + 0.05], PROJ),
  );
  const plinthGroove = svgPath(groovePts, true);

  // Calibration millimeter ticks along the front coaxial track of the plinth
  const tickSegs: string[] = [];
  for (let i = 0; i <= 14; i++) {
    const tx = -20 + i * 4.4;
    const major = i % 2 === 0;
    const pA = isoProject([tx, 25, plinthTopZ + 0.06], PROJ);
    const pB = isoProject([tx, major ? 29.2 : 27.4, plinthTopZ + 0.06], PROJ);
    tickSegs.push(svgPath([pA, pB]));
  }
  const plinthTicks = tickSegs.join("");

  const parts: SolidPart[] = [];
  const details: BuiltScene["details"] = [];
  const dots: BuiltScene["dots"] = [];

  // ── 1. Pebble Charging Case & Docked Right Bud (upper-left quadrant) ─────
  const caseCx = -29;
  const caseCy = 8;
  const caseBaseZ = plinthTopZ + 0.2;

  // Sculpted horizontal oval pebble bowl (3 tiered stadium/ellipse layers)
  parts.push(
    extrudeZ("case-foot", ellipseXY(caseCx, caseCy, 17, 11.5, 24), caseBaseZ, 2.2, PROJ, {
      lit: litCase,
      depthBias: -18,
    }),
  );
  parts.push(
    extrudeZ(
      "case-lower-mid",
      ellipseXY(caseCx, caseCy, 21.5, 14.5, 28),
      caseBaseZ + 2.1,
      4.4,
      PROJ,
      { lit: litCase, depthBias: -17.5 },
    ),
  );
  parts.push(
    extrudeZ("case-deck", ellipseXY(caseCx, caseCy, 22.8, 15.4, 28), caseBaseZ + 6.4, 3.8, PROJ, {
      lit: litCase,
      depthBias: -17,
    }),
  );

  const deckTopZ = caseBaseZ + 10.2;

  // Inner bezel, L/R charging wells, gold pogo pins & Docked Right Bud (visible once lid opens!)
  if (e > 0.08) {
    parts.push(
      extrudeZ("case-inner-lip", ellipseXY(caseCx, caseCy, 20.6, 13.4, 26), deckTopZ, 0.7, PROJ, {
        lit: litCase,
        depthBias: -16.6,
      }),
    );
    parts.push(
      extrudeZ(
        "case-well-left",
        ellipseXY(caseCx - 7.8, caseCy + 0.8, 6.2, 5.2, 20),
        deckTopZ + 0.7,
        0.35,
        PROJ,
        { dark: true, depthBias: -16.3 },
      ),
    );
    parts.push(
      extrudeZ(
        "case-well-right",
        ellipseXY(caseCx + 7.8, caseCy - 0.8, 6.2, 5.2, 20),
        deckTopZ + 0.7,
        0.35,
        PROJ,
        { dark: true, depthBias: -16.3 },
      ),
    );

    // Twin gold pogo pins visible inside the empty left cradle well
    for (const dx of [-1.4, 1.4]) {
      const pogo = isoProject([caseCx - 7.8 + dx, caseCy + 0.8, deckTopZ + 1.2], PROJ);
      dots.push({ cx: pogo[0], cy: pogo[1], r: 1.5, fill: "#c59b57" });
    }

    // Docked Right OnePlus Bud 4 seated inside the right well
    parts.push(
      latheSolid(
        "docked-right-bud",
        [caseCx + 7.5, caseCy - 1.0, deckTopZ + 1.2],
        [-0.25, 0.35, 0.9],
        [
          { s: 0, r: 3.4 },
          { s: 1.8, r: 5.1, crease: true },
          { s: 4.0, r: 4.5 },
          { s: 5.3, r: 2.2 },
          { s: 5.7, r: 0 },
        ],
        PROJ,
        { segments: 22, lit: litCase, depthBias: -15.8 },
      ),
    );

    // Rear stainless hinge knuckle mechanically linking the open clamshell lid to the case deck
    parts.push(
      extrudeZ(
        "case-hinge-knuckle",
        roundedRectXY(caseCx - 5.5, caseCy - 9.8, 6.8, 2.8, 0.8, 3),
        deckTopZ - 0.8,
        2.2 + e * 3.8,
        PROJ,
        { brass: false, lit: litCase, depthBias: -19.2 },
      ),
    );
  }

  // Front status LED jewel on the pebble equator
  const ledPos = isoProject([caseCx + 10.2, caseCy + 12.2, caseBaseZ + 5.6], PROJ);
  dots.push({
    cx: ledPos[0],
    cy: ledPos[1],
    r: 2.1,
    fill: caseCharging ? "#c9822b" : "#2a6f5b",
  });

  // Hinged Pebble Clamshell Lid:
  // Closed (e -> 0): rests flush over case-deck, forming the smooth closed pebble top dome.
  // Open (e -> 1): swings back on the rear hinge knuckle, revealing the docked Right Bud & pogo pins.
  const lidOpen = e;
  const lidTilt = lidOpen * 0.96;
  const lidAxis: Point3 =
    lidOpen < 0.02
      ? [0, 0, 1]
      : vecNorm([-0.32 * Math.sin(lidTilt), -0.54 * Math.sin(lidTilt), Math.cos(lidTilt)]);
  const lidOrigin: Point3 = [
    caseCx - 5.8 * lidOpen,
    caseCy - 8.4 * lidOpen,
    deckTopZ + 0.1 + lidOpen * 5.2,
  ];
  parts.push(
    latheSolid(
      "case-lid",
      lidOrigin,
      lidAxis,
      [
        { s: 0, r: 0 },
        { s: 0.05, r: 15.4, crease: true },
        { s: 1.6, r: 14.8 },
        { s: 3.3, r: 12.6 },
        { s: 4.6, r: 8.4 },
        { s: 5.3, r: 0 },
      ],
      PROJ,
      {
        segments: 30,
        ellipseScaleV: 1.0,
        ellipseScaleW: 1.48,
        lit: litCase,
        depthBias: lidOpen < 0.1 ? -12.0 : -20.8,
      },
    ),
  );

  // ── 2. Primary Left OnePlus Bud 4 — 5 Coaxial Assemblies ─────────────────
  // At e = 0: Front shell mates flush onto rear acoustic cup (s = 2.2) with ear tip on nozzle (s = 11.2).
  // At e = 1: Separates cleanly into 5 spaced coaxial stations across the plate.
  const anchor: Point3 = [2 - e * 16.5, -7 + e * 1.5, 11];
  const atStation = (s: number): Point3 => vecAdd(anchor, vecScale(u, s));

  const sStem = 0;
  const sWoofer = 2.4 + e * 14.8;
  const sTweeter = 3.6 + e * 27.8;
  const sFront = 2.1 + e * 43.2;
  const sTip = 11.0 + e * 50.5;

  // Coaxial alignment datum lines when separated
  const datumLines: BuiltScene["datumLines"] = [];
  if (e > 0.04) {
    datumLines.push({
      d: svgPath([isoProject(atStation(sStem + 2), PROJ), isoProject(atStation(sTip + 4), PROJ)]),
      lit: litDrivers,
      opacity: Math.min(0.85, e * 1.2),
    });
    // Secondary upper mic datum line
    const micRear = vecAdd(atStation(sStem + 1), [0, 0, 7.6]);
    const micFront = vecAdd(atStation(sFront + 1), [0, 0, 7.6]);
    datumLines.push({
      d: svgPath([isoProject(micRear, PROJ), isoProject(micFront, PROJ)]),
      lit: litAnc,
      opacity: Math.min(0.55, e * 0.8),
    });
  }

  // ── Assembly A: Vertical Stem, Twin-DAC PCB, Stem Cell & Rear Cradle ─────
  const stemBase = atStation(sStem);
  const stemTopZ = stemBase[2] + 1.5;
  const stemBotZ = stemBase[2] - 25.5;

  // Lower stem metallic collar + Talk Mic + gold pogo pads
  parts.push(
    extrudeZ(
      "stem-bottom-cap",
      roundedRectXY(stemBase[0] - 2.2, stemBase[1] - 0.8, 6.2, 5.4, 2.6, 5),
      stemBotZ - 1.4,
      1.5,
      PROJ,
      { brass: true, depthBias: -2.2 },
    ),
  );

  // Talk Mic port dot at bottom of stem
  const talkMicPt = isoProject([stemBase[0] + 0.6, stemBase[1] + 1.6, stemBotZ - 0.7], PROJ);
  dots.push({
    cx: talkMicPt[0],
    cy: talkMicPt[1],
    r: 1.7,
    fill: litAnc || litStem ? "#2a6f5b" : "#262928",
  });

  // Rear half of vertical stem housing
  const stemSplit = e * 4.2;
  parts.push(
    extrudeZ(
      "stem-rear-shell",
      roundedRectXY(
        stemBase[0] - 2.2 - stemSplit * 0.45,
        stemBase[1] - 0.8 - stemSplit * 0.35,
        6.4,
        5.6,
        2.7,
        5,
      ),
      stemBotZ,
      stemTopZ - stemBotZ,
      PROJ,
      { lit: litStem, depthBias: -3.5 },
    ),
  );

  // Internal Stem Cell + Twin-DAC / BT 5.4 Mainboard (visible when stem separates!)
  if (e > 0.06) {
    // Prismatic Li-ion stem battery cell (lower half of stem)
    parts.push(
      extrudeZ(
        "stem-battery-cell",
        roundedRectXY(stemBase[0] - 1.9, stemBase[1] - 0.7, 3.8, 3.4, 1.0, 4),
        stemBotZ + 1.8,
        10.2,
        PROJ,
        { lit: litStem, depthBias: -2.0 },
      ),
    );
    // Multi-layer Dual-DAC PCB (upper half of stem)
    parts.push(
      extrudeZ(
        "stem-dac-pcb",
        roundedRectXY(stemBase[0] - 1.7, stemBase[1] - 0.6, 3.6, 1.3, 0.4, 3),
        stemBotZ + 12.6,
        11.2,
        PROJ,
        { lit: litStem, depthBias: -1.6 },
      ),
    );
    // DAC 1 (Woofer DAC) & DAC 2 (Tweeter DAC) micro-IC dies + BT 5.4 RF shield
    parts.push(
      extrudeZ(
        "dac-chip-1",
        roundedRectXY(stemBase[0] - 1.3, stemBase[1] + 0.2, 2.2, 1.1, 0.25, 2),
        stemBotZ + 13.8,
        2.4,
        PROJ,
        { brass: !litStem, lit: litStem, depthBias: -1.1 },
      ),
    );
    parts.push(
      extrudeZ(
        "dac-chip-2",
        roundedRectXY(stemBase[0] - 1.3, stemBase[1] + 0.2, 2.2, 1.1, 0.25, 2),
        stemBotZ + 17.0,
        2.4,
        PROJ,
        { brass: !litStem, lit: litStem, depthBias: -1.0 },
      ),
    );
    parts.push(
      extrudeZ(
        "bt54-soc-shield",
        roundedRectXY(stemBase[0] - 1.3, stemBase[1] + 0.2, 2.5, 1.2, 0.3, 2),
        stemBotZ + 20.1,
        2.9,
        PROJ,
        { lit: litStem, depthBias: -0.9 },
      ),
    );
  }

  // Outer capacitive swipe bar shell (glides slightly forward-left when exploded to expose DACs)
  const capOffsetX = stemBase[0] - 2.2 + stemSplit * 0.55;
  const capOffsetY = stemBase[1] + 1.2 + stemSplit * 0.55;
  parts.push(
    extrudeZ(
      "stem-swipe-bar",
      roundedRectXY(capOffsetX, capOffsetY, 3.4, 1.6, 0.75, 4),
      stemBotZ + 3.2,
      17.8,
      PROJ,
      { lit: litStem, depthBias: -0.3 },
    ),
  );

  // Tactile swipe indicator groove line along the capacitive touch bar
  const swipeTop = isoProject([capOffsetX + 0.6, capOffsetY + 0.85, stemBotZ + 18.8], PROJ);
  const swipeBot = isoProject([capOffsetX + 0.6, capOffsetY + 0.85, stemBotZ + 6.2], PROJ);
  details.push({
    d: svgPath([swipeTop, swipeBot]),
    tone: litStem ? "celadon" : "mid",
  });

  // Rear Acoustic Cradle Bowl (sits atop the stem, faces +AXIS)
  parts.push(
    latheSolid(
      "rear-acoustic-cup",
      stemBase,
      AXIS,
      [
        { s: -5.8, r: 0 },
        { s: -5.2, r: 4.2 },
        { s: -3.2, r: 7.4 },
        { s: -0.8, r: 8.9, crease: true },
        { s: 2.2, r: 9.2, crease: true },
        { s: 2.6, r: 8.2 },
        { s: 2.6, r: 0 },
      ],
      PROJ,
      { segments: 30, lit: litStem || litAnc, depthBias: 0 },
    ),
  );

  // Feed-Forward Microphone module at top crown of rear shell (800×/s ambient sampling)
  const ffMicPos = vecAdd(stemBase, [0.2, 0.2, 8.6]);
  parts.push(
    extrudeZ(
      "feed-forward-mic",
      roundedRectXY(ffMicPos[0], ffMicPos[1], 3.4, 2.0, 0.9, 4),
      ffMicPos[2],
      1.2,
      PROJ,
      { lit: litAnc, brass: !litAnc, depthBias: 0.8 },
    ),
  );

  // ── Assembly B & C: 11 mm Woofer + 6 mm Coaxial Tweeter (enclosed inside shell when e <= 0.05) ──
  if (e > 0.05) {
    const wooferOrigin = atStation(sWoofer);
    // Neodymium rear motor pot
    parts.push(
      latheSolid(
        "woofer-motor",
        wooferOrigin,
        AXIS,
        [
          { s: -3.8, r: 0 },
          { s: -3.6, r: 5.0, crease: true },
          { s: -1.4, r: 5.2, crease: true },
          { s: -1.3, r: 3.8 },
          { s: -1.3, r: 0 },
        ],
        PROJ,
        { segments: 28, lit: litDrivers, depthBias: 4 },
      ),
    );
    // Brass/copper voice-coil ring (matches gold coil collar in OnePlus Buds 4 cutaway)
    parts.push(
      latheSolid(
        "woofer-voice-coil",
        wooferOrigin,
        AXIS,
        [
          { s: -1.4, r: 0 },
          { s: -1.4, r: 5.9, crease: true },
          { s: 0.2, r: 6.1, crease: true },
          { s: 0.2, r: 0 },
        ],
        PROJ,
        { segments: 28, brass: true, depthBias: 4.5 },
      ),
    );
    // 11 mm cast basket flange + rolled surround + 30-layer ceramic-metal dome diaphragm
    parts.push(
      latheSolid(
        "woofer-cone-basket",
        wooferOrigin,
        AXIS,
        [
          { s: 0.2, r: 0 },
          { s: 0.2, r: 8.4, crease: true },
          { s: 1.7, r: 8.6, crease: true },
          { s: 2.1, r: 7.4, crease: true },
          { s: 1.5, r: 5.8, crease: true },
          { s: 2.3, r: 3.4, crease: true },
          { s: 2.7, r: 1.4 },
          { s: 2.8, r: 0 },
        ],
        PROJ,
        { segments: 32, lit: litDrivers, depthBias: 5 },
      ),
    );
    // Concentric ceramic-metal diaphragm detail ring
    details.push({
      d: isoCirclePath(vecAdd(wooferOrigin, vecScale(u, 2.05)), AXIS, 4.7, PROJ, { segments: 32 }),
      tone: litDrivers ? "celadon" : "mid",
    });

    // Assembly C: 6 mm Coaxial Flat-Diaphragm Tweeter
    const tweeterOrigin = atStation(sTweeter);
    parts.push(
      latheSolid(
        "tweeter-body",
        tweeterOrigin,
        AXIS,
        [
          { s: -1.8, r: 0 },
          { s: -1.6, r: 3.8, crease: true },
          { s: -0.2, r: 4.2, crease: true },
          { s: 0.5, r: 6.8, crease: true },
          { s: 1.1, r: 6.8, crease: true },
          { s: 1.1, r: 4.6, crease: true },
          { s: 1.5, r: 4.4, crease: true },
          { s: 1.52, r: 0 },
        ],
        PROJ,
        { segments: 28, lit: litDrivers, depthBias: 9 },
      ),
    );
    const tabBase = vecAdd(tweeterOrigin, vecAdd(vecScale(v, -6.2), vecScale(w, 2.2)));
    parts.push(
      extrudeZ(
        "tweeter-gold-tab",
        roundedRectXY(tabBase[0], tabBase[1], 2.2, 1.4, 0.3, 2),
        tabBase[2] - 0.8,
        1.6,
        PROJ,
        { brass: true, depthBias: 9.6 },
      ),
    );
    details.push({
      d: isoCirclePath(vecAdd(tweeterOrigin, vecScale(u, 1.53)), AXIS, 2.7, PROJ, { segments: 28 }),
      tone: litDrivers ? "celadon" : "mid",
    });
  }

  // ── Assembly D: Front Acoustic Shell, Feed-Back Mic & Nozzle Grille ──────
  const frontOrigin = atStation(sFront);
  // Internal Feed-Back Microphone capsule (monitors ear-canal residual noise up to 5,500 Hz)
  if (e > 0.12) {
    const fbPos = vecAdd(frontOrigin, vecAdd(vecScale(u, -1.6), [0, 0, -2.4]));
    parts.push(
      extrudeZ(
        "feedback-mic-module",
        roundedRectXY(fbPos[0], fbPos[1], 2.8, 2.2, 0.6, 3),
        fbPos[2],
        1.8,
        PROJ,
        { lit: litAnc, brass: !litAnc, depthBias: 12.2 },
      ),
    );
  }

  // Sculpted teardrop front acoustic chamber + angled ear-canal nozzle barrel
  parts.push(
    latheSolid(
      "front-shell-nozzle",
      frontOrigin,
      AXIS,
      [
        { s: -0.4, r: 0 },
        { s: -0.4, r: 9.1, crease: true },
        { s: 1.8, r: 9.0 },
        { s: 4.2, r: 7.7 },
        { s: 6.2, r: 5.3, crease: true },
        { s: 6.5, r: 4.1, crease: true }, // nozzle neck
        { s: 8.6, r: 4.1, crease: true },
        { s: 9.1, r: 4.5, crease: true }, // tip retention barb
        { s: 9.5, r: 4.2, crease: true },
        { s: 9.55, r: 0 },
      ],
      PROJ,
      { segments: 32, lit: litAnc, depthBias: 14 },
    ),
  );

  // Characteristic OnePlus Buds 4 vertical oval tuning/relief vent on upper front shell
  const ventCenter = vecAdd(frontOrigin, vecAdd(vecScale(u, 2.4), vecScale(w, 7.8)));
  const ventTop = isoProject(vecAdd(ventCenter, vecScale(w, 0.9)), PROJ);
  const ventBot = isoProject(vecAdd(ventCenter, vecScale(w, -1.1)), PROJ);
  details.push({
    d: svgPath([ventTop, ventBot]),
    tone: litAnc ? "celadon" : "hi",
  });

  // Stainless nozzle mesh micro-perforations across nozzle face
  const meshCenter = vecAdd(frontOrigin, vecScale(u, 9.58));
  const meshRings = [
    { r: 0, n: 1 },
    { r: 1.5, n: 6 },
    { r: 2.8, n: 10 },
  ];
  for (const mr of meshRings) {
    for (let k = 0; k < mr.n; k++) {
      const ang = (2 * Math.PI * k) / mr.n;
      const p3 =
        mr.r === 0
          ? meshCenter
          : vecAdd(
              meshCenter,
              vecAdd(vecScale(v, Math.cos(ang) * mr.r), vecScale(w, Math.sin(ang) * mr.r)),
            );
      const p2 = isoProject(p3, PROJ);
      dots.push({
        cx: p2[0],
        cy: p2[1],
        r: 0.75,
        fill: litAnc ? "#2a6f5b" : "#555a58",
        opacity: 0.75,
      });
    }
  }

  // ── Assembly E: Flared Soft Silicone Ear Tip ─────────────────────────────
  const tipOrigin = atStation(sTip);
  parts.push(
    latheSolid(
      "silicone-ear-tip",
      tipOrigin,
      AXIS,
      [
        { s: -2.2, r: 0 },
        { s: -2.1, r: 7.4, crease: true }, // rear umbrella skirt
        { s: -0.4, r: 7.8 },
        { s: 1.6, r: 7.1 },
        { s: 3.4, r: 5.5, crease: true },
        { s: 4.5, r: 3.4, crease: true }, // bore opening lip
        { s: 4.55, r: 2.1, crease: true },
        { s: 4.6, r: 0 },
      ],
      PROJ,
      { segments: 32, lit: subsystem === "anc", depthBias: 19 },
    ),
  );

  // Sort all 3D parts strictly back-to-front by camera depth
  parts.sort((a, b) => a.depth - b.depth);

  // ── Coaxial Acoustic & Noise-Control Wavefronts ──────────────────────────
  const waves: BuiltScene["waves"] = [];
  const waveStart = sTip + 7.2;
  const isAnc = mode === "anc" || (ANC_LEVELS as readonly string[]).includes(mode);
  const ancStep = mode === "deep" ? 2.5 : mode === "light" ? 4.2 : mode === "medium" ? 3.4 : 3.0;

  const waveCount = mode === "off" ? 2 : 6;
  for (let i = 0; i < waveCount; i++) {
    const t = i / Math.max(1, waveCount - 1);
    if (isAnc) {
      // Dense phase-inverting cancellation rings + counter-phase dashed wave
      const pos = atStation(waveStart + i * ancStep);
      const rad = 4.2 + i * 1.45;
      waves.push({
        d: isoCirclePath(pos, AXIS, rad, PROJ, { segments: 36 }),
        stroke: i % 2 === 0 ? "#2a6f5b" : "#5d8f7e",
        width: i === waveCount - 1 ? 1.6 : 0.9,
        dash: i % 2 === 1 ? "2.5 3.5" : undefined,
        opacity: 0.85 - t * 0.45,
      });
    } else if (mode === "adaptive") {
      const pos = atStation(waveStart + i * 4.0);
      const rad = 4.4 + i * 1.9;
      waves.push({
        d: isoCirclePath(pos, AXIS, rad, PROJ, { segments: 36 }),
        stroke: "#2a6f5b",
        width: i % 2 === 0 ? 1.2 : 0.75,
        dash: i % 2 === 1 ? "4 3" : undefined,
        opacity: 0.78 - t * 0.48,
      });
    } else if (mode === "transparency") {
      const pos = atStation(waveStart + i * 4.8);
      const rad = 4.5 + i * 2.25;
      waves.push({
        d: isoCirclePath(pos, AXIS, rad, PROJ, { segments: 36 }),
        stroke: "#2a6f5b",
        width: 0.95,
        dash: "1.6 4.6",
        opacity: 0.72 - t * 0.5,
      });
    } else {
      const pos = atStation(waveStart + i * 3.0);
      waves.push({
        d: isoCirclePath(pos, AXIS, 4.0 + i * 1.1, PROJ, { segments: 32 }),
        stroke: "#8c918f",
        width: 0.75,
        opacity: 0.35 - i * 0.15,
      });
    }
  }

  // Ambient sampling arcs above the Feed-Forward Microphone when ANC or Adaptive is active
  if (isAnc || mode === "adaptive" || litAnc) {
    for (let i = 0; i < 3; i++) {
      const arcCenter: Point3 = [ffMicPos[0], ffMicPos[1], ffMicPos[2] + 2.6 + i * 2.2];
      waves.push({
        d: isoCirclePath(arcCenter, [0, 0, 1], 2.6 + i * 1.8, PROJ, {
          segments: 24,
          arc: [-Math.PI * 0.15, Math.PI * 0.85],
        }),
        stroke: "#2a6f5b",
        width: 0.85,
        dash: isAnc ? undefined : "2 3",
        opacity: 0.65 - i * 0.18,
      });
    }
  }

  return {
    plinthShadow,
    plinthParts: [plinthSkirt, plinthDeck, ...screwParts],
    plinthGroove,
    plinthTicks,
    datumLines,
    parts,
    details,
    dots,
    waves,
  };
}
