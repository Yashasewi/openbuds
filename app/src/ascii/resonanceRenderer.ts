/**
 * Supersampled Cell-Grid ASCII Renderer for the OpenBuds Tuning-Fork Cathedral:
 *   1. Crisp device-pixel-snapped cell grid on pure #000000
 *   2. Real-time 2D hyperbolic standing-wave interference field + traveling cyan wavefronts
 *   3. Cursor "ANC Silence Radius" bubble (live quiet zone framed by whisper-fine `. ' ,` ring)
 *   4. Sculpted 3D brushed-chrome Tuning Forks with 5-point punctuation anti-aliasing,
 *      density-matched shading ramp (:;t%SX8#@), electric-cyan singing rims, and sparse
 *      staggered iridescent spectral glints
 */
import {
  FLAG_EDGE,
  FLAG_NONE,
  FLAG_RIM,
  FLAG_TIP_GLOW,
  hitFork,
  sampleFork,
  type ForkSample,
} from "./forkGeometry";
import { clamp, hash3, smoothstep } from "./math";
import type { ResonanceWorld } from "./resonanceWorld";

// Density-matched ASCII ramp: sparse on bright brushed chrome, dense in shadow
const CHROME_RAMP = ":;t%SX8#@";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";
const GRAIN_GLYPHS = ["·", "-", "~", "♪"];

// Sparse staggered spectral glints (cyan, violet, magenta, amber, mint)
const SPECTRAL_GLINTS = ["#5ce1ff", "#9b6bff", "#ff4fd8", "#ffb347", "#5cffb0", "#3868ff"];

// 4 sub-cell sample offsets matching the 5-point supersampling kernel
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

const DOT_LEVELS = 7;

/** Crisp snapped cell grid on pure #000000. Shared with SoundField. */
export function paintGrid(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cw: number,
  ch: number,
  dpr: number,
  stroke = "rgba(255,255,255,0.052)",
) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = stroke;
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= Math.ceil(W / cw); c++) {
    const x = Math.round(c * cw * dpr) + 0.5;
    g.moveTo(x, 0);
    g.lineTo(x, H * dpr);
  }
  for (let r = 0; r <= Math.ceil(H / ch); r++) {
    const y = Math.round(r * ch * dpr) + 0.5;
    g.moveTo(0, y);
    g.lineTo(W * dpr, y);
  }
  g.stroke();
}

export class ResonanceRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private cw = 11;
  private ch = 16;
  private cols = 0;
  private rows = 0;
  private fontFamily = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

  // Diffusing wake field for smooth cyan trails behind wavefronts
  private wake = new Float32Array(0);
  private wakeTmp = new Float32Array(0);

  // Per-cell tuning-fork raster buffers
  private cellFlag = new Uint8Array(0);
  private cellShade = new Float32Array(0);
  private cellKey = new Uint32Array(0);
  private cellDepth = new Float32Array(0);
  private cellEnergy = new Float32Array(0);
  private cellForkIdx = new Uint8Array(0);

  // Precomputed color tables
  private cyanDotStyles: string[] = [];
  private silverDotStyles: string[] = [];
  private octaveDotStyles: string[] = [];

  private sampleOut: ForkSample = {
    hit: false,
    flag: FLAG_NONE,
    shade: 0,
    u: 0,
    v: 0,
    dist: 1,
    nz: 1,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
    this.buildPalettes();
  }

  private buildPalettes() {
    this.cyanDotStyles = [];
    this.silverDotStyles = [];
    this.octaveDotStyles = [];
    for (let i = 0; i < DOT_LEVELS; i++) {
      const a = (i + 1) / DOT_LEVELS;
      this.cyanDotStyles.push(`rgba(92,225,255,${(a * 0.92).toFixed(3)})`);
      this.silverDotStyles.push(`rgba(210,224,244,${(a * 0.56).toFixed(3)})`);
      this.octaveDotStyles.push(`rgba(130,152,255,${(a * 0.78).toFixed(3)})`);
    }
  }

  setFontFamily(family: string) {
    if (family) this.fontFamily = family;
  }

  resize(width: number, height: number, dpr: number) {
    const prevCols = this.cols;
    const prevRows = this.rows;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.cw = clamp(Math.round(width / 124), 8, 12);
    this.ch = Math.round(this.cw * 1.46);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;

    const n = this.cols * this.rows;
    if (this.cols !== prevCols || this.rows !== prevRows) {
      this.wake = new Float32Array(n);
      this.wakeTmp = new Float32Array(n);
      this.cellFlag = new Uint8Array(n);
      this.cellShade = new Float32Array(n);
      this.cellKey = new Uint32Array(n);
      this.cellDepth = new Float32Array(n);
      this.cellEnergy = new Float32Array(n);
      this.cellForkIdx = new Uint8Array(n);
    }

    this.paintBackground();
  }

  private paintBackground() {
    const g = this.bg.getContext("2d");
    if (!g) return;
    const { width: W, height: H, dpr, cw, ch } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#000000";
    g.fillRect(0, 0, W, H);
    paintGrid(g, W, H, cw, ch, dpr);
  }

  warmStep(world: ResonanceWorld, dt: number) {
    if (this.cols === 0) return;
    this.depositWaveWake(world);
    this.diffuseWake(dt);
  }

  render(world: ResonanceWorld, dt: number) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;

    this.rasterizeForks(world);
    this.depositWaveWake(world);
    this.diffuseWake(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawInterferenceField(world);
    this.drawGrains(world);
    this.drawSilenceBubble(world);
    this.drawForks(world);
  }

  // ── Wake Deposit & Diffusion ────────────────────────────────────────────

  private depositWaveWake(world: ResonanceWorld) {
    const { wake, cols, rows, cw, ch } = this;
    // Continuous shimmering emission aura right between each singing fork's twin tines
    for (const f of world.forks) {
      if (f.energy < 0.15) continue;
      const rad = f.pose.scale * (0.28 + 0.18 * Math.sin(world.time * 2.2 + f.id));
      const samples = 22;
      for (let k = 0; k < samples; k++) {
        const a = (k / samples) * Math.PI * 2;
        const c = Math.floor((f.emitterX + Math.cos(a) * rad) / cw);
        const r = Math.floor((f.emitterY + Math.sin(a) * rad) / ch);
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        wake[r * cols + c] = Math.min(1.5, wake[r * cols + c] + f.energy * 0.16);
      }
    }

    for (const w of world.waves) {
      const fade = 1 - w.radius / w.maxRadius;
      const radii = w.harmonic ? [w.radius, w.radius * 0.62] : [w.radius];
      for (let pass = 0; pass < radii.length; pass++) {
        const rad = radii[pass];
        if (rad < 6) continue;
        const samples = Math.max(36, Math.round((rad * Math.PI * 2) / Math.max(cw, 7)));
        const boost = pass === 0 ? 0.48 : 0.3;
        for (let k = 0; k < samples; k++) {
          const a = (k / samples) * Math.PI * 2;
          const c = Math.floor((w.x + Math.cos(a) * rad) / cw);
          const r = Math.floor((w.y + Math.sin(a) * rad) / ch);
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const idx = r * cols + c;
          wake[idx] = Math.min(1.5, wake[idx] + w.strength * fade * boost);
        }
      }
    }
  }

  private diffuseWake(dt: number) {
    const { cols, rows, wake, wakeTmp: tmp } = this;
    const decay = Math.exp(-dt * 1.45);
    for (let r = 0; r < rows; r++) {
      const rOff = r * cols;
      for (let c = 0; c < cols; c++) {
        const i = rOff + c;
        const l = c > 0 ? wake[i - 1] : wake[i];
        const rt = c < cols - 1 ? wake[i + 1] : wake[i];
        const u = r > 0 ? wake[i - cols] : wake[i];
        const d = r < rows - 1 ? wake[i + cols] : wake[i];
        tmp[i] = (wake[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.wake = tmp;
    this.wakeTmp = wake;
  }

  // ── 2D Standing-Wave Interference Field & ANC Quiet Sanctuary ───────────

  private drawInterferenceField(world: ResonanceWorld) {
    const { ctx, cols, rows, cw, ch, width: W, height: H, wake, cellFlag } = this;
    const t = world.time;
    const mode = world.mode;
    const cxW = W * 0.5;
    const cyW = H * 0.5;

    // Elliptical quiet sanctuary behind the hero headline
    const sanctuaryRx = W * (mode === "anc" ? 0.34 : mode === "adaptive" ? 0.3 : 0.23);
    const sanctuaryRy = H * (mode === "anc" ? 0.29 : mode === "adaptive" ? 0.25 : 0.2);

    const hasCursorBubble = world.silenceBubble > 0.05;
    const bubbleR =
      world.silenceRadius * (mode === "adaptive" ? 0.85 + 0.25 * Math.sin(t * 1.4) : 1);

    const smallDot = Math.max(2, Math.round(cw * 0.2));
    const largeDot = smallDot + 1;

    // Pre-extract twin fork emitter data for tight inner loop
    const f0 = world.forks[0];
    const f1 = world.forks[1];

    for (let r = 0; r < rows; r++) {
      const y = r * ch;
      const py = y + ch * 0.5;
      const rOff = r * cols;

      for (let c = 0; c < cols; c++) {
        const i = rOff + c;
        if (cellFlag[i] !== FLAG_NONE) continue;

        const x = c * cw;
        const px = x + cw * 0.5;

        // Cursor ANC Silence Bubble cleanly suppresses turbulence & interference
        let cursorMask = 1;
        if (hasCursorBubble) {
          const dp = Math.hypot(px - world.pointer.x, py - world.pointer.y);
          if (dp < bubbleR) {
            cursorMask = 1 - smoothstep(bubbleR, bubbleR * 0.65, dp) * world.silenceBubble * 0.96;
          }
        }

        // Elliptical ANC Quiet Sanctuary around the hero headline
        const ex = (px - cxW) / sanctuaryRx;
        const ey = (py - cyW) / sanctuaryRy;
        const eDist = Math.hypot(ex, ey);

        // In ANC mode, paint a crisp elliptical phase-cancellation halo around the calm sanctuary
        if (mode === "anc" && Math.abs(eDist - 1.0) < 0.052) {
          const ring = 1 - Math.abs(eDist - 1.0) / 0.052;
          const shimmer = 0.6 + 0.4 * Math.sin(Math.atan2(ey, ex) * 6 - t * 1.6);
          const alpha = (0.3 + ring * 0.58 * shimmer) * cursorMask;
          if (alpha > 0.16) {
            ctx.fillStyle = `rgba(92,225,255,${alpha.toFixed(2)})`;
            const sz = ring > 0.55 ? largeDot : smallDot;
            ctx.fillRect(
              Math.round(x + cw * 0.66 - sz * 0.5),
              Math.round(y + ch * 0.64 - sz * 0.5),
              sz,
              sz,
            );
            continue;
          }
        }

        // Smooth attenuation inside center pool so hero text remains effortlessly legible
        const centerAtten =
          mode === "anc"
            ? smoothstep(0.86, 1.06, eDist)
            : mode === "adaptive"
              ? smoothstep(0.68, 1.06, eDist)
              : 0.16 + 0.84 * smoothstep(0.42, 1.0, eDist);

        // True two-source hyperbolic standing-wave interference across the whole cathedral!
        const d0 = Math.hypot(px - f0.emitterX, py - f0.emitterY);
        const d1 = Math.hypot(px - f1.emitterX, py - f1.emitterY);

        const w0 = (Math.sin(d0 * f0.waveK - t * 3.0) * f0.energy) / (1 + d0 * 0.0011);
        const w1 = (Math.sin(d1 * f1.waveK - t * 3.5 + 0.9) * f1.energy) / (1 + d1 * 0.0011);

        // Constructive interference crests form unmistakable curved Chladni / ripple-tank fringes
        const psi = (w0 + w1) * 0.78;
        const crest = Math.max(0, psi);
        const trough = Math.max(0, -psi);

        const wakeVal = wake[i] * centerAtten * cursorMask;
        const modeAmp =
          mode === "anc" ? 0.92 : mode === "adaptive" ? 1.05 : mode === "transparency" ? 1.18 : 1.32;
        const fieldVal = Math.pow(crest, 1.25) * modeAmp * centerAtten * cursorMask;
        const overtoneVal = Math.pow(trough, 1.35) * 0.65 * modeAmp * centerAtten * cursorMask;

        const totalCyan = wakeVal + fieldVal * 0.95;
        if (totalCyan > 0.24) {
          const lvl = clamp(Math.floor((totalCyan - 0.24) * 6.8), 0, DOT_LEVELS - 1);
          if (totalCyan > 0.76 && hash3(c, r, Math.floor(t * 2)) < 0.26) {
            ctx.fillStyle = this.cyanDotStyles[lvl];
            ctx.fillText(hash3(c, r, 13) > 0.72 ? ":" : "·", x + cw * 0.5, y + ch * 0.5 + 1);
          } else {
            ctx.fillStyle = this.cyanDotStyles[lvl];
            const sz = totalCyan > 0.56 ? largeDot : smallDot;
            ctx.fillRect(
              Math.round(x + cw * 0.66 - sz * 0.5),
              Math.round(y + ch * 0.64 - sz * 0.5),
              sz,
              sz,
            );
          }
          continue;
        }

        if (overtoneVal > 0.28) {
          const lvl = clamp(Math.floor((overtoneVal - 0.28) * 5.2), 0, DOT_LEVELS - 1);
          ctx.fillStyle = mode === "off" ? this.octaveDotStyles[lvl] : this.silverDotStyles[lvl];
          ctx.fillRect(
            Math.round(x + cw * 0.66 - smallDot * 0.5),
            Math.round(y + ch * 0.64 - smallDot * 0.5),
            smallDot,
            smallDot,
          );
        }
      }
    }
  }

  /** Draw drifting micro acoustic particles & occasional harmonic notes outside the silence zone. */
  private drawGrains(world: ResonanceWorld) {
    const { ctx, cw, ch, cols, rows, cellFlag, width: W, height: H } = this;
    const cxW = W * 0.5;
    const cyW = H * 0.5;
    const bubbleActive = world.silenceBubble > 0.1;

    for (const g of world.grains) {
      const c = Math.floor(g.x / cw);
      const r = Math.floor(g.y / ch);
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      if (cellFlag[r * cols + c] !== FLAG_NONE) continue;

      // Keep clear margin around centered hero headline
      const ex = (g.x - cxW) / (W * 0.31);
      const ey = (g.y - cyW) / (H * 0.24);
      if (ex * ex + ey * ey < 0.92 && world.mode !== "off") continue;

      // Freeze & dim inside the cursor ANC silence bubble
      let dim = 1;
      if (bubbleActive) {
        const dp = Math.hypot(g.x - world.pointer.x, g.y - world.pointer.y);
        if (dp < world.silenceRadius * 0.9) dim = 0.2;
      }

      const alpha = clamp((0.24 + g.depth * 0.34 + g.energy * 0.35) * dim, 0.08, 0.88);
      const isCyan = g.energy > 0.55;
      ctx.fillStyle = isCyan
        ? `rgba(92,225,255,${alpha.toFixed(2)})`
        : `rgba(216,228,246,${alpha.toFixed(2)})`;

      const glyph =
        g.energy > 0.6 && g.pitch % 3 === 0
          ? GRAIN_GLYPHS[3]
          : GRAIN_GLYPHS[g.pitch % 3];
      ctx.fillText(glyph, c * cw + cw * 0.5, r * ch + ch * 0.5 + 1);
    }
  }

  /** Draw the crisp whisper-fine `. ' ,` ring marking the user's live ANC Silence Radius bubble. */
  private drawSilenceBubble(world: ResonanceWorld) {
    if (world.silenceBubble < 0.08) return;
    const { ctx, cw, ch, cols, rows, cellFlag } = this;
    const rad =
      world.silenceRadius *
      (world.mode === "adaptive" ? 0.85 + 0.25 * Math.sin(world.time * 1.4) : 1);
    const px = world.pointer.x;
    const py = world.pointer.y;
    const c0 = Math.max(0, Math.floor((px - rad - cw) / cw));
    const c1 = Math.min(cols - 1, Math.ceil((px + rad + cw) / cw));
    const r0 = Math.max(0, Math.floor((py - rad - ch) / ch));
    const r1 = Math.min(rows - 1, Math.ceil((py + rad + ch) / ch));
    const band = Math.max(cw, 10) * 1.05;

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (cellFlag[r * cols + c] !== FLAG_NONE) continue;
        const x = c * cw + cw * 0.5;
        const y = r * ch + ch * 0.5;
        const d = Math.hypot(x - px, y - py);
        const delta = Math.abs(d - rad);
        if (delta > band) continue;
        const inten = (1 - delta / band) * world.silenceBubble;
        if (inten < 0.18) continue;
        const ang = Math.atan2(y - py, x - px);
        // Directional sub-cell punctuation around the silence circle
        const chGlyph = ang < -0.5 ? "'" : ang > 0.5 ? "." : ",";
        ctx.fillStyle = `rgba(92,225,255,${(inten * 0.72).toFixed(2)})`;
        ctx.fillText(chGlyph, x, y + 1);
      }
    }
  }

  // ── Sculpted 3D Brushed-Chrome Tuning Forks ─────────────────────────────

  private rasterizeForks(world: ResonanceWorld) {
    const {
      cellFlag,
      cellShade,
      cellKey,
      cellDepth,
      cellEnergy,
      cellForkIdx,
      cw,
      ch,
      cols,
      rows,
    } = this;
    cellFlag.fill(FLAG_NONE);

    // Draw distant forks first so hero foreground forks layer cleanly on top
    const ordered = [...world.forks].sort((a, b) => a.depth - b.depth);

    for (const fork of ordered) {
      const idxInWorld = world.forks.indexOf(fork);
      const pose = fork.pose;
      const reach = pose.scale * 1.12;
      const c0 = Math.max(0, Math.floor((pose.cx - reach) / cw));
      const c1 = Math.min(cols - 1, Math.ceil((pose.cx + reach) / cw));
      const r0 = Math.max(0, Math.floor((pose.cy - reach) / ch));
      const r1 = Math.min(rows - 1, Math.ceil((pose.cy + reach) / ch));
      if (c0 > c1 || r0 > r1) continue;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;

          const centerHit = sampleFork(x + cw * 0.5, y + ch * 0.5, pose, this.sampleOut);
          if (!centerHit && this.sampleOut.dist > 0.18) continue;

          const flag = this.sampleOut.flag;
          const shade = this.sampleOut.shade;
          const u = this.sampleOut.u;
          const v = this.sampleOut.v;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (hitFork(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, pose)) hits++;
          }
          if (hits === 0) continue;
          const coverage = hits / 5;
          const i = r * cols + c;

          // Body-anchored deterministic hash so glyphs never crawl across static chrome
          const key =
            (hash3(Math.round(u * 42), Math.round(v * 42), fork.id * 53 + 7) * 4294967295) >>> 0;
          cellKey[i] = key;
          cellDepth[i] = fork.depth;
          cellEnergy[i] = fork.energy;
          cellForkIdx[i] = idxInWorld;

          if (centerHit && coverage >= 0.55) {
            cellFlag[i] = flag;
            cellShade[i] = shade;
          } else {
            cellFlag[i] = FLAG_EDGE;
            cellShade[i] = coverage;
          }
        }
      }
    }
  }

  private drawForks(world: ResonanceWorld) {
    const {
      ctx,
      cols,
      rows,
      cw,
      ch,
      cellFlag,
      cellShade,
      cellKey,
      cellDepth,
      cellEnergy,
      cellForkIdx,
    } = this;
    const t = world.time;
    const n = cols * rows;

    const tone = (level: number, tr: number, tg: number, tb: number) =>
      `rgb(${Math.min(255, Math.round(level * tr))},${Math.min(255, Math.round(level * tg))},${Math.min(255, Math.round(level * tb + 4))})`;

    for (let i = 0; i < n; i++) {
      const flag = cellFlag[i];
      if (flag === FLAG_NONE) continue;

      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const key = cellKey[i];
      const shade = cellShade[i];
      const dim = 0.58 + 0.42 * cellDepth[i];
      const energy = cellEnergy[i];
      const [tr, tg, tb] = world.forks[cellForkIdx[i]].tint;

      // Sparse staggered spectral glint clock (controlled ~5% accent distribution)
      const tick = Math.floor(t * 2.1 + (key % 997) / 97);
      const roll = hash3(key, tick, 11);

      if (flag === FLAG_EDGE) {
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        const g = (76 + shade * 96) * dim;
        if (roll < 0.045 + energy * 0.04) {
          ctx.fillStyle = "#5ce1ff";
        } else {
          ctx.fillStyle = tone(g, tr, tg, tb);
        }
        ctx.fillText(set[(key >>> 8) % set.length], x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      // Quantized 8-band luminance mapping for silky non-shimmering brushed chrome
      const qShade = Math.round(shade * 7) / 7;
      let level = (34 + qShade * 188) * dim;
      if (flag === FLAG_TIP_GLOW) {
        // Luminous cyan-tinted brushed highlight along actively ringing tine edges
        const boost = 0.45 + energy * 0.55;
        ctx.fillStyle = `rgb(${Math.min(255, Math.round(level * 0.65))},${Math.min(255, Math.round(level * (0.98 + boost * 0.2)))},${Math.min(255, Math.round(level * (1.12 + boost * 0.22)))})`;
      } else {
        ctx.fillStyle = tone(level, tr, tg, tb);
      }
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

      const glyphIdx = clamp(Math.floor((1 - qShade) * (CHROME_RAMP.length - 0.01)), 0, CHROME_RAMP.length - 1);
      const glyph = CHROME_RAMP[glyphIdx];

      let glyphColor: string;
      if (flag === FLAG_RIM && roll < 0.25 + energy * 0.28) {
        glyphColor = "#5ce1ff";
      } else if (roll < 0.045) {
        glyphColor = SPECTRAL_GLINTS[key % SPECTRAL_GLINTS.length];
      } else if (roll < 0.075 && qShade > 0.7) {
        glyphColor = "#ffffff";
      } else {
        glyphColor = qShade > 0.54 ? "#0c0f15" : "#161b24";
      }

      ctx.fillStyle = glyphColor;
      ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
    }
  }
}
