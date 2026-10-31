import type { NoiseMode } from "../lib/protocol";

type Field = NoiseMode | "unknown";
interface Ring {
  r: number;
  cx: number;
  cy: number;
  opacity: number;
  width: number;
  dash?: string;
}

const RINGS = 8;
const CENTER = 200;
const ANC_STEP: Partial<Record<Field, number>> = {
  light: 13,
  medium: 10.5,
  smart: 9.5,
  anc: 9.5,
  deep: 8,
};

function layout(field: Field): Ring[] {
  return Array.from({ length: RINGS }, (_, i) => {
    const t = i / (RINGS - 1);
    if (field in ANC_STEP) {
      const step = ANC_STEP[field]!;
      return {
        r: 46 + i * step,
        cx: CENTER,
        cy: CENTER,
        opacity: 0.95 - t * 0.35,
        width: i === RINGS - 1 ? 3.5 : 1.6,
      };
    }
    if (field === "transparency")
      return {
        r: 46 + i * 21,
        cx: CENTER,
        cy: CENTER,
        opacity: 0.85 - t * 0.7,
        width: 1.2,
        dash: "2 7",
      };
    if (field === "adaptive") {
      const drift = (i % 2 ? 1 : -1) * (3 + i * 1.6);
      return {
        r: 46 + i * 15,
        cx: CENTER + drift,
        cy: CENTER - drift * 0.6,
        opacity: 0.9 - t * 0.55,
        width: 1.5,
      };
    }
    if (field === "off")
      return { r: 46 + i * 2, cx: CENTER, cy: CENTER, opacity: i ? 0 : 0.5, width: 1.2 };
    return {
      r: 46 + i * 17,
      cx: CENTER,
      cy: CENTER,
      opacity: 0.28 - t * 0.2,
      width: 1,
      dash: "1 6",
    };
  });
}

export function SoundField({ mode, live }: { mode: NoiseMode | null | undefined; live: boolean }) {
  const field: Field = mode ?? "unknown";
  const rings = layout(field);
  const sealed = field in ANC_STEP;
  return (
    <svg
      viewBox="0 0 400 400"
      role="img"
      aria-label="Sound field"
      className="sound-field h-auto w-full"
    >
      <defs>
        <radialGradient id="tip-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-mint)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-mint)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx={CENTER}
        cy={CENTER}
        r={sealed ? 140 : 190}
        fill="url(#tip-glow)"
        className="field-glow"
        opacity={live ? 1 : 0.35}
      />
      {rings.map((ring, i) => (
        <circle
          key={i}
          fill="none"
          stroke="var(--color-tip)"
          strokeLinecap="round"
          style={{
            r: ring.r,
            cx: ring.cx,
            cy: ring.cy,
            opacity: ring.opacity,
            strokeWidth: ring.width,
            strokeDasharray: ring.dash ?? "none",
            transitionDelay: `${i * 35}ms`,
          }}
        />
      ))}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={30}
        fill="var(--color-tip)"
        opacity={live ? 1 : 0.45}
        className="field-core"
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={13}
        fill="none"
        stroke="var(--color-mint)"
        strokeWidth={2.5}
        opacity={live ? 1 : 0.5}
      />
    </svg>
  );
}
