import { useEffect, useRef } from "react";
import { clamp, hash3 } from "../ascii/math";
import { paintGrid } from "../ascii/renderer";
import type { NoiseMode } from "../lib/protocol";

type FieldMode = NoiseMode | "unknown";

const RAMP = ":;t%SX8#@";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";
const ACCENTS = ["#5ce1ff", "#3150e8", "#33c8cc", "#e0892c", "#b44ae0", "#3cb54a"];
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

const FLAG_BODY = 1;
const FLAG_RIDGE = 2;
const FLAG_TIP = 3;
const FLAG_NOZZLE = 4;

const ANC_RADIUS: Partial<Record<FieldMode, number>> = {
  deep: 0.34,
  anc: 0.38,
  smart: 0.38,
  medium: 0.41,
  light: 0.45,
};

interface SampleHit {
  hit: boolean;
  flag: number;
  shade: number;
  id: number;
  u: number;
  v: number;
}

/**
 * Signed-distance & 3D surface-normal evaluation for the pair of OnePlus Buds 4
 * (mirrored angled stem + rounded pebble head + oval ear tip).
 */
function sampleBuds(
  px: number,
  py: number,
  W: number,
  H: number,
  t: number,
  out: SampleHit,
): boolean {
  const S = Math.min(W, H);
  const floatL = Math.sin(t * 0.9) * S * 0.01;
  const floatR = Math.sin(t * 0.9 + 1.9) * S * 0.01;

  for (let side = 0; side < 2; side++) {
    const mirror = side === 0 ? 1 : -1;
    const cx = W * 0.5 - mirror * S * 0.162;
    const cy = H * 0.44 + (side === 0 ? floatL : floatR);
    const angle = mirror * -0.17;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);

    // Local coordinates in [-0.5, 0.5] normalized to S, mirrored for right bud.
    const dx = (px - cx) / S;
    const dy = (py - cy) / S;
    const lx = (dx * ca + dy * sa) * mirror;
    const ly = -dx * sa + dy * ca;

    // 1. Acoustic nozzle / silicone tip protruding inward toward the ear canal
    const tipX = (lx - 0.068) / 0.078;
    const tipY = (ly + 0.026) / 0.088;
    const tipR2 = tipX * tipX + tipY * tipY;

    // 2. Main rounded pebble housing
    const headX = lx / 0.136;
    const headY = (ly + 0.018) / 0.14;
    const headR2 = headX * headX + headY * headY;

    // 3. Elongated blade stem below housing
    const stemHalfW = 0.045;
    const stemTop = 0.01;
    const stemBot = 0.315;
    const clampedY = clamp(ly, stemTop, stemBot);
    const stemDx = lx / stemHalfW;
    const stemDy = (ly - clampedY) / stemHalfW;
    const stemR2 = stemDx * stemDx + stemDy * stemDy;

    if (tipR2 > 1 && headR2 > 1 && stemR2 > 1) continue;

    out.hit = true;
    out.id = side + 1;
    out.u = lx;
    out.v = ly;

    // Inner nozzle bore + cyan ring
    const nozzleX = (lx - 0.084) / 0.042;
    const nozzleY = (ly + 0.028) / 0.05;
    const nozzleR2 = nozzleX * nozzleX + nozzleY * nozzleY;
    if (nozzleR2 <= 1) {
      out.flag = nozzleR2 < 0.42 ? FLAG_NOZZLE : FLAG_TIP;
      out.shade = nozzleR2 < 0.42 ? 0.08 : 0.78;
      return true;
    }

    if (headR2 <= 1) {
      const r = Math.sqrt(headR2);
      const nz = Math.sqrt(Math.max(0, 1 - headR2));
      const light = clamp(-headX * 0.45 * mirror - headY * 0.55 + nz * 0.72, 0, 1);
      out.flag = light > 0.86 && r < 0.72 ? FLAG_RIDGE : FLAG_BODY;
      out.shade = clamp(0.18 + light * 0.76, 0.1, 0.98);
      return true;
    }

    if (tipR2 <= 1) {
      const nz = Math.sqrt(Math.max(0, 1 - tipR2));
      out.flag = FLAG_TIP;
      out.shade = clamp(0.25 + nz * 0.45, 0.15, 0.75);
      return true;
    }

    // Stem cylindrical shading + bright dorsal specular crease
    const across = clamp(Math.abs(lx) / stemHalfW, 0, 1);
    const nz = Math.sqrt(Math.max(0, 1 - across * across));
    const light = clamp(
      (-lx / stemHalfW) * 0.42 * mirror + nz * 0.72 - (ly - stemTop) * 0.35,
      0,
      1,
    );
    const onCrease = Math.abs(lx + 0.008) < 0.0085 && ly > 0.05 && ly < 0.245;
    out.flag = onCrease ? FLAG_RIDGE : FLAG_BODY;
    out.shade = onCrease ? 0.96 : clamp(0.2 + light * 0.68, 0.12, 0.9);
    return true;
  }

  out.hit = false;
  return false;
}

export function SoundField({ mode, live }: { mode: NoiseMode | null | undefined; live: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<{ field: FieldMode; live: boolean }>({
    field: mode ?? "unknown",
    live,
  });
  propsRef.current = { field: mode ?? "unknown", live };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const bg = document.createElement("canvas");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let dpr = 1;
    let cw = 9;
    let ch = 13;
    let cols = 0;
    let rows = 0;
    let visible = true;
    let raf = 0;
    let start = performance.now();

    const scratch: SampleHit = { hit: false, flag: 0, shade: 0, id: 0, u: 0, v: 0 };

    function rebuildBg() {
      const g = bg.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#000000";
      g.fillRect(0, 0, width, height);
      paintGrid(g, width, height, cw, ch, dpr);
    }

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = clamp(Math.round(width / 38), 8, 11);
      ch = Math.round(cw * 1.42);
      cols = Math.ceil(width / cw);
      rows = Math.ceil(height / ch);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      bg.width = canvas.width;
      bg.height = canvas.height;
      rebuildBg();
      draw(reducedMotion.matches ? 2.4 : (performance.now() - start) / 1000);
    }

    function draw(t: number) {
      if (!ctx || cols === 0 || rows === 0) return;
      const { field, live: isLive } = propsRef.current;
      const fontFamily =
        getComputedStyle(canvas!).fontFamily || '"Geist Mono", ui-monospace, Menlo, monospace';

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `600 ${Math.round(ch * 0.74)}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const S = Math.min(width, height);
      const cxW = width * 0.5;
      const cyW = height * 0.48;
      const ancR = ANC_RADIUS[field];
      const activeFactor = isLive ? 1 : 0.72;

      // Pass 1: Acoustic wave field + wake dots + incoming/flowing particles
      const dotSize = Math.max(2, Math.round(cw * 0.22));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cw + cw * 0.5;
          const y = r * ch + ch * 0.5;
          const dx = x - cxW;
          const dy = (y - cyW) * 1.04;
          const dist = Math.hypot(dx, dy) / S;
          const ang = Math.atan2(dy, dx);

          if (ancR !== undefined) {
            // Active Noise Cancelling: outer noise dashes dissolve at the cyan phase barrier
            const breath = field === "smart" ? 0.022 * Math.sin(t * 1.5) : 0;
            const shield = ancR + breath;
            const ringDelta = Math.abs(dist - shield);

            if (ringDelta < 0.032) {
              const inten = (1 - ringDelta / 0.032) * activeFactor;
              ctx.fillStyle = `rgba(92,225,255,${(0.35 + inten * 0.6).toFixed(2)})`;
              ctx.fillRect(
                Math.round(c * cw + cw * 0.66 - dotSize / 2),
                Math.round(r * ch + ch * 0.64 - dotSize / 2),
                dotSize + 1,
                dotSize + 1,
              );
              if (hash3(c, r, Math.floor(t * 5)) < 0.28 * inten) {
                ctx.fillStyle = `rgba(190,242,255,${(0.45 + inten * 0.45).toFixed(2)})`;
                ctx.fillText(":", x, y + 1);
              }
            } else if (dist > shield + 0.035) {
              // Incoming noise grains drifting inward toward barrier
              const wave = Math.sin(dist * 34 + t * 2.4 + hash3(c, r, 9) * 6.28);
              if (wave > 0.86 && hash3(c, r, 3) < 0.42) {
                const fade = clamp((dist - shield) * 3.2, 0.15, 0.65) * activeFactor;
                ctx.fillStyle = `rgba(220,232,250,${fade.toFixed(2)})`;
                ctx.fillText("-", x, y + 1);
              }
            }
          } else if (field === "transparency") {
            // Open permeable harmonic waves passing smoothly across the grid
            const ripple = Math.sin(dist * 26 - t * 2.6 + Math.cos(ang * 2) * 0.35);
            if (ripple > 0.72) {
              const inten = ((ripple - 0.72) / 0.28) * activeFactor;
              ctx.fillStyle = `rgba(92,225,255,${(0.22 + inten * 0.65).toFixed(2)})`;
              ctx.fillRect(
                Math.round(c * cw + cw * 0.66 - dotSize / 2),
                Math.round(r * ch + ch * 0.64 - dotSize / 2),
                dotSize,
                dotSize,
              );
            } else if (Math.sin(c * 0.35 - t * 2.1 + r * 0.2) > 0.92 && hash3(c, r, 17) < 0.35) {
              ctx.fillStyle = `rgba(225,240,255,${(0.55 * activeFactor).toFixed(2)})`;
              ctx.fillText("~", x, y + 1);
            }
          } else if (field === "adaptive") {
            // Shifting caustic contours adapting to direction
            const ox = Math.cos(t * 0.7) * S * 0.05;
            const oy = Math.sin(t * 0.55) * S * 0.04;
            const adist = Math.hypot(x - (cxW + ox), y - (cyW + oy)) / S;
            const band = Math.sin(adist * 30 - t * 1.6 + Math.sin(ang * 3 + t) * 0.5);
            if (band > 0.76 && adist > 0.24) {
              const inten = ((band - 0.76) / 0.24) * activeFactor;
              ctx.fillStyle = `rgba(92,225,255,${(0.2 + inten * 0.58).toFixed(2)})`;
              ctx.fillRect(
                Math.round(c * cw + cw * 0.66 - dotSize / 2),
                Math.round(r * ch + ch * 0.64 - dotSize / 2),
                dotSize,
                dotSize,
              );
            }
          } else {
            // Off / idle: sparse quiet sonar breath
            const breathe = Math.sin(dist * 20 - t * 1.1);
            if (breathe > 0.9 && dist > 0.28 && dist < 0.46 && hash3(c, r, 31) < 0.35) {
              ctx.fillStyle = "rgba(140,175,220,0.26)";
              ctx.fillRect(
                Math.round(c * cw + cw * 0.66 - dotSize / 2),
                Math.round(r * ch + ch * 0.64 - dotSize / 2),
                dotSize,
                dotSize,
              );
            }
          }
        }
      }

      // Pass 2: Supersampled 3D-shaded ASCII OnePlus Buds 4 pair (culled to earbud bounds)
      const budHalfW = S * 0.34;
      const cMin = Math.max(0, Math.floor((cxW - budHalfW) / cw));
      const cMax = Math.min(cols - 1, Math.ceil((cxW + budHalfW) / cw));
      const rMin = Math.max(0, Math.floor((height * 0.14) / ch));
      const rMax = Math.min(rows - 1, Math.ceil((height * 0.86) / ch));

      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const x = c * cw;
          const y = r * ch;
          const centerHit = sampleBuds(x + cw * 0.5, y + ch * 0.5, width, height, t, scratch);
          const flag = scratch.flag;
          const shade = scratch.shade;
          const id = scratch.id;
          const u = scratch.u;
          const v = scratch.v;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (
              sampleBuds(
                x + SUBSAMPLES[k] * cw,
                y + SUBSAMPLES[k + 1] * ch,
                width,
                height,
                t,
                scratch,
              )
            ) {
              hits++;
            }
          }
          if (hits === 0) continue;
          const coverage = hits / 5;
          const key = (hash3(Math.round(u * 90), Math.round(v * 90), id * 13) * 4294967295) >>> 0;
          const tick = Math.floor(t * 2.2 + (key % 997) / 97);
          const roll = hash3(key, tick, 11);
          const dim = isLive ? 1 : 0.84;

          if (!centerHit || coverage < 0.6) {
            const set = coverage >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
            const g = Math.round((78 + coverage * 88) * dim);
            ctx.fillStyle =
              roll < 0.07
                ? ACCENTS[key % ACCENTS.length]
                : `rgb(${Math.round(g * 0.9)},${Math.round(g * 0.96)},${Math.min(255, Math.round(g * 1.08))})`;
            ctx.fillText(set[(key >>> 8) % set.length], x + cw * 0.5, y + ch * 0.5 + 1);
            continue;
          }

          if (flag === FLAG_NOZZLE) {
            ctx.fillStyle = isLive ? "#0d2536" : "#111622";
            ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
            ctx.fillStyle = isLive ? "#5ce1ff" : "#5e7396";
            ctx.fillText("o", x + cw * 0.5, y + ch * 0.5 + 1);
            continue;
          }

          if (flag === FLAG_TIP) {
            const lvl = Math.round((36 + shade * 95) * dim);
            ctx.fillStyle = isLive
              ? `rgb(${Math.round(lvl * 0.45)},${Math.min(255, Math.round(lvl * 1.35))},${Math.min(255, Math.round(lvl * 1.75))})`
              : `rgb(${Math.round(lvl * 0.72)},${Math.round(lvl * 0.86)},${Math.min(255, Math.round(lvl * 1.18))})`;
            ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
            ctx.fillStyle = "#081018";
            ctx.fillText(
              RAMP[clamp(Math.floor((1 - shade) * 7), 0, RAMP.length - 1)],
              x + cw * 0.5,
              y + ch * 0.5 + 1,
            );
            continue;
          }

          const level = (flag === FLAG_RIDGE ? 232 : 48 + shade * 168) * dim;
          const br = Math.min(255, Math.round(level * 0.92));
          const bgc = Math.min(255, Math.round(level * 0.97));
          const bb = Math.min(255, Math.round(level * 1.06 + 4));
          ctx.fillStyle = `rgb(${br},${bgc},${bb})`;
          ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

          const jitter = ((key >>> 4) % 3) - 1;
          const glyph =
            flag === FLAG_RIDGE
              ? "@8%"[(key >>> 8) % 3]
              : RAMP[clamp(Math.floor((1 - shade) * 8.99) + jitter, 0, RAMP.length - 1)];

          if (roll < 0.08) ctx.fillStyle = ACCENTS[key % ACCENTS.length];
          else if (roll < 0.12) ctx.fillStyle = "#ffffff";
          else ctx.fillStyle = shade > 0.55 ? "#0b0d12" : "#181c24";
          ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
        }
      }
    }

    let lastDraw = 0;
    function loop(now: number) {
      if (!visible || reducedMotion.matches) return;
      raf = requestAnimationFrame(loop);
      if (now - lastDraw < 42) return;
      lastDraw = now;
      draw((now - start) / 1000);
    }

    function schedule() {
      cancelAnimationFrame(raf);
      if (!visible) return;
      if (reducedMotion.matches) {
        draw(2.4);
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    });
    io.observe(canvas);
    reducedMotion.addEventListener("change", schedule);

    resize();
    void document.fonts?.load(`600 14px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      draw(reducedMotion.matches ? 2.4 : (performance.now() - start) / 1000);
    });
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      reducedMotion.removeEventListener("change", schedule);
    };
  }, []);

  return (
    <div className="relative aspect-[16/11] w-full overflow-hidden border border-ink/20 bg-fog">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="ASCII acoustic sound field around OnePlus Buds 4"
        className="block h-full w-full font-mono"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 bottom-2 flex items-center gap-3 font-mono text-[0.68rem] text-ink/45"
      >
        <span>L</span>
        <span>R</span>
      </div>
    </div>
  );
}
