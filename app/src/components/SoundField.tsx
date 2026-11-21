import { useEffect, useRef } from "react";
import {
  FLAG_BORE,
  FLAG_COLLAR,
  FLAG_TIP,
  FLAG_TOUCH,
  FLAG_VENT,
  hitBud,
  sampleBud,
  type BudPose,
  type BudSample,
} from "../ascii/budGeometry";
import { clamp, hash3 } from "../ascii/math";
import { paintGrid } from "../ascii/octopusRenderer";
import type { NoiseMode } from "../lib/protocol";

type FieldMode = NoiseMode | "unknown";

const RAMP = ":;t%SX8#@";
const TIP_RAMP = ".;:%#8@";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";
const ACCENTS = ["#5ce1ff", "#3868ff", "#33c8cc", "#e0892c", "#b45aff", "#3cb568"];
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

const ANC_RADIUS: Partial<Record<FieldMode, number>> = {
  deep: 0.41,
  anc: 0.43,
  smart: 0.43,
  medium: 0.45,
  light: 0.48,
};

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
    const start = performance.now();

    const scratch: BudSample = { hit: false, flag: 0, shade: 0, u: 0, v: 0, dist: 1 };

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
      cw = clamp(Math.round(width / 42), 7, 10);
      ch = Math.round(cw * 1.44);
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
      const activeFactor = isLive ? 1 : 0.78;

      // Pass 1: Acoustic wave field + harmonic octave notes
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
              const wave = Math.sin(dist * 34 + t * 2.4 + hash3(c, r, 9) * 6.28);
              if (wave > 0.85 && hash3(c, r, 3) < 0.44) {
                const fade = clamp((dist - shield) * 3.2, 0.18, 0.68) * activeFactor;
                ctx.fillStyle = `rgba(220,232,250,${fade.toFixed(2)})`;
                ctx.fillText(hash3(c, r, 11) > 0.72 ? "♪" : "-", x, y + 1);
              }
            }
          } else if (field === "transparency") {
            const ripple = Math.sin(dist * 26 - t * 2.6 + Math.cos(ang * 2) * 0.35);
            if (ripple > 0.72) {
              const inten = ((ripple - 0.72) / 0.28) * activeFactor;
              ctx.fillStyle = `rgba(92,225,255,${(0.24 + inten * 0.65).toFixed(2)})`;
              ctx.fillRect(
                Math.round(c * cw + cw * 0.66 - dotSize / 2),
                Math.round(r * ch + ch * 0.64 - dotSize / 2),
                dotSize,
                dotSize,
              );
            } else if (Math.sin(c * 0.35 - t * 2.1 + r * 0.2) > 0.91 && hash3(c, r, 17) < 0.38) {
              ctx.fillStyle = `rgba(225,240,255,${(0.58 * activeFactor).toFixed(2)})`;
              ctx.fillText(hash3(c, r, 23) > 0.6 ? "♪" : "~", x, y + 1);
            }
          } else if (field === "adaptive") {
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

      // Pass 2: Sculpted 3D-shaded ASCII OnePlus Buds 4 pair
      const scale = clamp(Math.min(width * 0.165, height * 0.26), 42, 64);
      const spread = width * 0.21;
      const buds: [BudPose, BudPose] = [
        {
          cx: cxW - spread,
          cy: cyW - 2 + Math.sin(t * 0.95) * 2.0,
          scale,
          flipX: 1,
          rot: -0.14,
          id: 0,
          dim: isLive ? 1 : 0.88,
        },
        {
          cx: cxW + spread,
          cy: cyW - 2 + Math.sin(t * 0.95 + 1.8) * 2.0,
          scale,
          flipX: -1,
          rot: 0.14,
          id: 1,
          dim: isLive ? 1 : 0.88,
        },
      ];

      for (const bud of buds) {
        const reach = bud.scale * 1.15;
        const cMin = Math.max(0, Math.floor((bud.cx - reach) / cw));
        const cMax = Math.min(cols - 1, Math.ceil((bud.cx + reach) / cw));
        const rMin = Math.max(0, Math.floor((bud.cy - reach) / ch));
        const rMax = Math.min(rows - 1, Math.ceil((bud.cy + reach) / ch));

        for (let r = rMin; r <= rMax; r++) {
          for (let c = cMin; c <= cMax; c++) {
            const x = c * cw;
            const y = r * ch;
            const centerHit = sampleBud(x + cw * 0.5, y + ch * 0.5, bud, scratch);
            if (!centerHit && scratch.dist > 0.24) continue;
            const flag = scratch.flag;
            const shade = scratch.shade;
            const u = scratch.u;
            const v = scratch.v;

            let hits = centerHit ? 1 : 0;
            for (let k = 0; k < SUBSAMPLES.length; k += 2) {
              if (hitBud(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, bud)) hits++;
            }
            if (hits === 0) continue;
            const coverage = hits / 5;
            const key =
              (hash3(Math.round(u * 40), Math.round(v * 40), bud.id * 41 + 13) * 4294967295) >>> 0;
            const tick = Math.floor(t * 2.2 + (key % 997) / 97);
            const roll = hash3(key, tick, 11);

            if (!centerHit || coverage < 0.6) {
              const set = coverage >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
              const g = Math.round((78 + coverage * 88) * bud.dim);
              ctx.fillStyle =
                roll < 0.07
                  ? ACCENTS[key % ACCENTS.length]
                  : `rgb(${Math.round(g * 0.9)},${Math.round(g * 0.96)},${Math.min(255, Math.round(g * 1.08))})`;
              ctx.fillText(set[(key >>> 8) % set.length], x + cw * 0.5, y + ch * 0.5 + 1);
              continue;
            }

            if (flag === FLAG_BORE || flag === FLAG_VENT) {
              ctx.fillStyle = isLive ? "#0d2536" : "#111824";
              ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
              ctx.fillStyle = isLive ? "#5ce1ff" : "#7094b8";
              ctx.fillText(flag === FLAG_BORE ? "o" : "#", x + cw * 0.5, y + ch * 0.5 + 1);
              continue;
            }

            if (flag === FLAG_TIP) {
              const lvl = Math.round((34 + shade * 108) * bud.dim);
              ctx.fillStyle = isLive
                ? `rgb(${Math.round(lvl * 0.45)},${Math.min(255, Math.round(lvl * 1.28))},${Math.min(255, Math.round(lvl * 1.62))})`
                : `rgb(${Math.round(lvl * 0.72)},${Math.round(lvl * 0.86)},${Math.min(255, Math.round(lvl * 1.15))})`;
              ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
              ctx.fillStyle = "#081018";
              ctx.fillText(
                TIP_RAMP[clamp(Math.floor((1 - shade) * (TIP_RAMP.length - 0.01)), 0, TIP_RAMP.length - 1)],
                x + cw * 0.5,
                y + ch * 0.5 + 1,
              );
              continue;
            }

            const level =
              (flag === FLAG_TOUCH ? 82 + shade * 150 : flag === FLAG_COLLAR ? 72 + shade * 140 : 46 + shade * 172) *
              bud.dim;
            ctx.fillStyle = `rgb(${Math.min(255, Math.round(level * 0.92))},${Math.min(255, Math.round(level * 0.97))},${Math.min(255, Math.round(level * 1.06 + 4))})`;
            ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

            const jitter = ((key >>> 4) % 3) - 1;
            const glyph =
              flag === FLAG_COLLAR
                ? "="
                : flag === FLAG_TOUCH
                  ? ":;t|"[(key >>> 8) % 4]
                  : RAMP[clamp(Math.floor((1 - shade) * 8.99) + jitter, 0, RAMP.length - 1)];

            if (roll < 0.08) ctx.fillStyle = ACCENTS[key % ACCENTS.length];
            else if (roll < 0.12) ctx.fillStyle = "#ffffff";
            else ctx.fillStyle = shade > 0.55 ? "#0b0d12" : "#181c24";
            ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
          }
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
