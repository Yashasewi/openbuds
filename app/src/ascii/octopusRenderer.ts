/**
 * Cell-grid ASCII renderer for the OpenBuds Acoustic Deep Sea:
 *   1. Device-pixel-snapped dark cell grid on pure #000000
 *   2. Diffusing cyan/cobalt acoustic wake field + dual-ring octave harmonics
 *   3. Swirling schools of musical note particles (♪, ♫, ♩, ~, -) glinting on turns
 *   4. Sculpted 3D-lit Octopuses (bulbous pulsing mantle, expressive eyes, 8 articulated
 *      tapered tentacles with sucker flecks) supersampled with 5-point punctuation edges,
 *      density-matched shading glyphs (:;t%SX8#@), and iridescent chromatophore shimmer
 */
import { clamp, hash3, smoothstep } from "./math";
import {
  ARM_NODES,
  OCTOPUS_ARMS,
  VOICES,
  type AcousticOceanWorld,
  type Octopus,
  type OctopusSpecies,
} from "./octopusWorld";

const ALPHA_LEVELS = 6;
const NOTE_ALPHAS = [0.26, 0.42, 0.58, 0.76, 0.94];

// Iridescent chromatophore accents across the octopus skin (cyan, cobalt, violet, amber, mint, coral)
const CHROMATOPHORES = ["#5ce1ff", "#3868ff", "#b45aff", "#e0892c", "#3cb568", "#e84a72", "#d9c14a"];

// Density-matched ASCII shading ramp: sparse on lit surfaces, dense in shadow
const SKIN_RAMP = ":;t%SX8#@";
const ARM_RAMP = ":;t%SX8#";
const CROWN_GLYPHS = ":;t%";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";
const SUCKER_GLYPHS = "°o·";

const FLAG_NONE = 0;
const FLAG_MANTLE = 1;
const FLAG_ARM = 2;
const FLAG_EDGE = 3;
const FLAG_EYE = 4;
const FLAG_CROWN = 5;
const FLAG_SUCKER = 6;

// 4 sub-cell sample offsets for 5-sample supersampled anti-aliasing
const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

interface SpeciesLook {
  /** Base skin RGB multipliers */
  tint: readonly [number, number, number];
  /** Mantle length / overall length */
  mantleLen: number;
  /** Max mantle half-width / overall length */
  mantleWidth: number;
  /** Subtle organic skin spot pattern */
  spotted: boolean;
}

const SPECIES_LOOK: Record<OctopusSpecies, SpeciesLook> = {
  // Cool titanium-indigo Pacific octopus
  pacific: { tint: [0.88, 0.94, 1.08], mantleLen: 0.31, mantleWidth: 0.165, spotted: true },
  // Deep royal cobalt-violet octopus
  indigo: { tint: [0.82, 0.88, 1.16], mantleLen: 0.3, mantleWidth: 0.158, spotted: false },
  // Luminous silver-cyan glass octopus
  glass: { tint: [0.84, 1.0, 1.12], mantleLen: 0.3, mantleWidth: 0.152, spotted: false },
  // Warm slate-bronze reef octopus
  reef: { tint: [1.02, 0.94, 0.86], mantleLen: 0.32, mantleWidth: 0.17, spotted: true },
};

const SPECIES_LIST: OctopusSpecies[] = ["pacific", "indigo", "glass", "reef"];

/** Crisp snapped cell grid on pure #000000. Exported for SoundField too. */
export function paintGrid(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cw: number,
  ch: number,
  dpr: number,
  stroke = "rgba(255,255,255,0.055)",
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

export class OctopusAsciiRenderer {
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

  // Diffusing wake & harmonic octave fields
  private wake = new Float32Array(0);
  private wakeTmp = new Float32Array(0);
  private octaveGlow = new Float32Array(0);

  // Per-cell octopus raster buffers
  private cellFlag = new Uint8Array(0);
  private cellShade = new Float32Array(0);
  private cellKey = new Uint32Array(0);
  private cellDepth = new Float32Array(0);
  private cellSpecies = new Uint8Array(0);
  private cellShadow = new Uint8Array(0);

  // Musical note particle stamps
  private noteStamp = new Uint32Array(0);
  private frameId = 0;
  private noteBuckets: { idx: number; glyph: string; cyan: boolean }[][] = NOTE_ALPHAS.map(() => []);
  private noteStyles: string[] = [];
  private cyanNoteStyles: string[] = [];
  private wakeStyles: string[] = [];
  private octaveStyles: string[] = [];

  // Scratch sample results (zero per-cell allocation)
  private hitFlag = FLAG_NONE;
  private hitShade = 0;
  private hitU = 0;
  private hitV = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
    this.buildPalettes();
  }

  private buildPalettes() {
    this.noteStyles = NOTE_ALPHAS.map((a) => `rgba(226,236,255,${a.toFixed(2)})`);
    this.cyanNoteStyles = NOTE_ALPHAS.map((a) => `rgba(98,228,255,${Math.min(1, a + 0.1).toFixed(2)})`);
    this.wakeStyles = [];
    this.octaveStyles = [];
    for (let l = 0; l < ALPHA_LEVELS; l++) {
      const a = (l + 1) / ALPHA_LEVELS;
      this.wakeStyles.push(`rgba(92,225,255,${(a * 0.92).toFixed(3)})`);
      this.octaveStyles.push(`rgba(120,165,255,${(a * 0.85).toFixed(3)})`);
    }
  }

  get cellWidth() {
    return this.cw;
  }

  get cellHeight() {
    return this.ch;
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
    this.ch = Math.round(this.cw * 1.45);
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
      this.octaveGlow = new Float32Array(n);
      this.cellFlag = new Uint8Array(n);
      this.cellShade = new Float32Array(n);
      this.cellKey = new Uint32Array(n);
      this.cellDepth = new Float32Array(n);
      this.cellSpecies = new Uint8Array(n);
      this.cellShadow = new Uint8Array(n);
      this.noteStamp = new Uint32Array(n);
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

  /** Advance wake & octave fields during off-screen warm-up without drawing pixels. */
  warmStep(world: AcousticOceanWorld, dt: number) {
    if (this.cols === 0) return;
    this.consumeEvents(world);
    this.depositWake(world);
    this.diffuse(dt);
  }

  render(world: AcousticOceanWorld, dt: number) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    const t = world.time;

    this.consumeEvents(world);
    this.rasterizeOctopuses(world.octopuses, t);
    this.depositWake(world);
    this.diffuse(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.markNotes(world);
    this.drawWakeDots();

    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawNotes();
    this.drawOctopuses(t);
  }

  // ── Wake & Harmonic Octave Fields ───────────────────────────────────────

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private stamp(field: Float32Array, x: number, y: number, radius: number, amount: number) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.5) continue;
        const i = r * this.cols + c;
        field[i] = Math.min(1.6, field[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }

  private consumeEvents(world: AcousticOceanWorld) {
    for (const e of world.events) {
      if (e.kind === "splash") {
        this.stamp(this.wake, e.x, e.y, 5, e.strength);
        this.stamp(this.octaveGlow, e.x, e.y, 4, e.strength * 0.9);
      } else {
        this.stamp(this.wake, e.x, e.y, 3, e.strength * 0.75);
      }
    }
    world.events.length = 0;
  }

  private depositWake(world: AcousticOceanWorld) {
    const { wake, octaveGlow, cw, ch, cols, rows } = this;

    // Resonant musical notes leave delicate acoustic trails
    for (const n of world.notes) {
      const i = this.cellIndex(n.x, n.y);
      if (i >= 0) wake[i] = Math.min(1.5, wake[i] + 0.01 + n.resonance * 0.032);
    }

    // Tentacle tips & jet siphons trail luminous cyan bioluminescent wakes
    for (const oct of world.octopuses) {
      const siphonX = oct.x - Math.cos(oct.heading) * oct.length * 0.12;
      const siphonY = oct.y - Math.sin(oct.heading) * oct.length * 0.12;
      this.stamp(wake, siphonX, siphonY, 2, 0.055);
      for (let arm = 0; arm < OCTOPUS_ARMS; arm++) {
        const nodes = oct.arms[arm];
        for (let k = ARM_NODES - 5; k < ARM_NODES; k++) {
          const i = this.cellIndex(nodes[k * 2], nodes[k * 2 + 1]);
          if (i >= 0) wake[i] = Math.min(1.6, wake[i] + 0.055 + oct.speed * 0.0011);
        }
      }
    }

    // Expanding harmonic octave rings (fundamental + 2× overtone inner ring)
    for (const ring of world.rings) {
      const fade = 1 - ring.radius / ring.maxRadius;
      const radii = ring.harmonic ? [ring.radius, ring.radius * 0.58] : [ring.radius];
      for (let pass = 0; pass < radii.length; pass++) {
        const rad = radii[pass];
        if (rad < 6) continue;
        const samples = Math.max(28, Math.round((rad * Math.PI * 2) / Math.max(cw, 8)));
        const target = pass === 0 ? wake : octaveGlow;
        for (let k = 0; k < samples; k++) {
          const a = (k / samples) * Math.PI * 2;
          const c = Math.floor((ring.x + Math.cos(a) * rad) / cw);
          const r = Math.floor((ring.y + Math.sin(a) * rad) / ch);
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          target[r * cols + c] = Math.min(1.6, target[r * cols + c] + ring.strength * fade * 0.34);
        }
      }
    }

    if (world.pointer.active) {
      this.stamp(wake, world.pointer.x, world.pointer.y, 1, 0.1);
    }
  }

  private diffuse(dt: number) {
    const { cols, rows, wake, wakeTmp: tmp, octaveGlow } = this;
    const decay = Math.exp(-dt * 1.12);
    const octDecay = Math.exp(-dt * 1.55);
    for (let r = 0; r < rows; r++) {
      const rOff = r * cols;
      for (let c = 0; c < cols; c++) {
        const i = rOff + c;
        const l = c > 0 ? wake[i - 1] : wake[i];
        const rt = c < cols - 1 ? wake[i + 1] : wake[i];
        const u = r > 0 ? wake[i - cols] : wake[i];
        const d = r < rows - 1 ? wake[i + cols] : wake[i];
        tmp[i] = (wake[i] * 4 + l + rt + u + d) * 0.125 * decay;
        octaveGlow[i] *= octDecay;
      }
    }
    this.wake = tmp;
    this.wakeTmp = wake;
  }

  // ── Octopus Analytical Rasterization ────────────────────────────────────

  /**
   * Evaluate a screen pixel (px, py) against one swimming Octopus (bulbous pulsing mantle
   * + bulging eyes + collar webbing + 8 tapered sinuous tentacles).
   */
  private sampleOctopus(px: number, py: number, oct: Octopus, look: SpeciesLook): boolean {
    const L = oct.length;
    const cosH = Math.cos(oct.heading);
    const sinH = Math.sin(oct.heading);

    // Transform into mantle-local space: s along forward heading (+ front crown, - rear collar),
    // v perpendicular across mantle
    const dx = px - oct.x;
    const dy = py - oct.y;
    const fwd = dx * cosH + dy * sinH;
    const side = -dx * sinH + dy * cosH;

    // Rhythmic mantle expansion/contraction during jet propulsion
    const pulse = 1 + 0.08 * Math.sin(oct.phase - 0.5);
    const mLen = L * look.mantleLen;
    const mHalfW = L * look.mantleWidth * pulse;

    // Mantle extends from rear collar (-0.18*L) to forward dome tip (+mLen - 0.10*L)
    const sRear = -L * 0.16;
    const sFront = mLen - L * 0.1;
    const sNorm = (fwd - sRear) / (sFront - sRear); // 0 collar -> 1 crown tip

    if (sNorm >= -0.06 && sNorm <= 1.04) {
      // Sculpted pear/bulbous octopus mantle profile: narrow collar -> broad rounded crown
      let profile: number;
      if (sNorm < 0) {
        profile = 0.62 * smoothstep(-0.06, 0, sNorm);
      } else if (sNorm < 0.24) {
        // Collar + eye-ridge bulge
        profile = 0.62 + 0.16 * Math.sin((sNorm / 0.24) * Math.PI);
      } else if (sNorm < 0.72) {
        // Broad rounded bulbous mantle sac
        const k = (sNorm - 0.24) / 0.48;
        profile = 0.68 + 0.34 * Math.sin(k * Math.PI * 0.85);
      } else {
        // Smooth domed tip
        const k = clamp((sNorm - 0.72) / 0.32, 0, 1);
        profile = 0.96 * Math.pow(Math.max(0, 1 - k * k), 0.62);
      }

      const w = mHalfW * profile;
      const absSide = Math.abs(side);
      if (absSide <= w && w > 1) {
        const across = absSide / w;
        const sign = side >= 0 ? 1 : -1;
        // 3D normal in screen coordinates for top-left key lighting (-0.6, -0.78)
        const nx = (-sinH * sign * across) * 0.85 + cosH * (sNorm - 0.48) * 0.45;
        const ny = (cosH * sign * across) * 0.85 + sinH * (sNorm - 0.48) * 0.45;
        const facing = nx * -0.6 + ny * -0.78;
        let shade = 0.62 - across * across * 0.44 + facing * 0.32;

        let flag = FLAG_MANTLE;

        // Expressive prominent eyes sitting on the collar ridge
        if (sNorm > 0.06 && sNorm < 0.23 && across > 0.52 && across < 0.94) {
          flag = FLAG_EYE;
          shade = 0;
        } else if (sNorm > 0.42 && sNorm < 0.74 && across < 0.34) {
          // Bright dorsal specular dome ridge
          flag = FLAG_CROWN;
          shade = clamp(shade + 0.26, 0, 1);
        } else if (look.spotted && sNorm > 0.28 && sNorm < 0.88 && across > 0.22) {
          // Organic chromatophore mantle rings/dapples
          const spotH = hash3(Math.round(sNorm * 14), Math.round((side / (mHalfW || 1)) * 7), oct.id * 5);
          if (spotH > 0.84) shade = clamp(shade + 0.18, 0, 1);
        }

        this.hitFlag = flag;
        this.hitShade = clamp(shade, 0, 1);
        this.hitU = sNorm * 40;
        this.hitV = (side / (mHalfW || 1)) * 18;
        return true;
      }
    }

    // Test all 8 articulated tentacles; pick closest arm hit for clean layering
    let bestD = Infinity;
    let bestArm = -1;
    let bestS = 0;
    let bestHalfW = 1;
    let bestSign = 1;
    let bestNx = 0;
    let bestNy = 0;

    for (let arm = 0; arm < OCTOPUS_ARMS; arm++) {
      const nodes = oct.arms[arm];
      for (let k = 0; k < ARM_NODES - 1; k++) {
        const ax = nodes[k * 2];
        const ay = nodes[k * 2 + 1];
        const sx = nodes[(k + 1) * 2] - ax;
        const sy = nodes[(k + 1) * 2 + 1] - ay;
        const len2 = sx * sx + sy * sy || 1;
        const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
        const qx = ax + sx * u;
        const qy = ay + sy * u;
        const d2 = (px - qx) ** 2 + (py - qy) ** 2;
        if (d2 < bestD) {
          const s = (k + u) / (ARM_NODES - 1);
          // Bold muscular base tapering cleanly to crisp curling whip tip
          const halfW = L * (0.044 * Math.pow(1 - s * 0.78, 1.05) + 0.0075);
          if (d2 <= halfW * halfW) {
            bestD = d2;
            bestArm = arm;
            bestS = s;
            bestHalfW = halfW;
            const len = Math.sqrt(len2);
            bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
            bestNx = (-sy / len) * bestSign;
            bestNy = (sx / len) * bestSign;
          }
        }
      }
    }

    if (bestArm >= 0) {
      const d = Math.sqrt(bestD);
      const across = clamp(d / (bestHalfW || 1), 0, 1);
      const facing = (bestNx * -0.6 + bestNy * -0.78) * across;
      let shade = 0.56 - across * across * 0.38 + facing * 0.28 - bestS * 0.12;
      let flag = FLAG_ARM;

      // Delicate pale sucker dots along the outer flanks of the lower/mid tentacles
      if (bestS > 0.16 && bestS < 0.82 && across > 0.56 && Math.floor(bestS * 22) % 2 === 0) {
        flag = FLAG_SUCKER;
        shade = clamp(shade + 0.2, 0, 1);
      }

      this.hitFlag = flag;
      this.hitShade = clamp(shade, 0, 1);
      this.hitU = bestS * 44 + bestArm * 11;
      this.hitV = across * bestSign * 9;
      return true;
    }

    return false;
  }

  private rasterizeOctopuses(octopuses: Octopus[], t: number) {
    const {
      cellFlag,
      cellShade,
      cellKey,
      cellDepth,
      cellSpecies,
      cellShadow,
      cw,
      ch,
      cols,
      rows,
    } = this;
    cellFlag.fill(FLAG_NONE);
    cellShadow.fill(0);

    for (const oct of octopuses) {
      const look = SPECIES_LOOK[oct.species];
      const spIdx = SPECIES_LIST.indexOf(oct.species);
      const L = oct.length;

      // Compute tight screen bounding box across mantle + all 8 tentacles
      let minX = oct.x - L * 0.42;
      let maxX = oct.x + L * 0.42;
      let minY = oct.y - L * 0.42;
      let maxY = oct.y + L * 0.42;
      for (let arm = 0; arm < OCTOPUS_ARMS; arm++) {
        const nodes = oct.arms[arm];
        for (let k = 0; k < ARM_NODES; k++) {
          const nx = nodes[k * 2];
          const ny = nodes[k * 2 + 1];
          if (nx < minX) minX = nx;
          if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny;
          if (ny > maxY) maxY = ny;
        }
      }
      const pad = L * 0.08 + cw * 2;
      const c0 = Math.max(0, Math.floor((minX - pad) / cw));
      const c1 = Math.min(cols - 1, Math.ceil((maxX + pad) / cw));
      const r0 = Math.max(0, Math.floor((minY - pad) / ch));
      const r1 = Math.min(rows - 1, Math.ceil((maxY + pad) / ch));
      if (c0 > c1 || r0 > r1) continue;

      const shadowDc = Math.round((L * 0.035) / cw) + 1;
      const shadowDr = Math.round((L * 0.022) / ch) + 1;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;

          const centerHit = this.sampleOctopus(x + cw * 0.5, y + ch * 0.5, oct, look);
          const flag = this.hitFlag;
          const shade = this.hitShade;
          const u = this.hitU;
          const v = this.hitV;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (this.sampleOctopus(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, oct, look)) {
              hits++;
            }
          }
          if (hits === 0) continue;
          const coverage = hits / 5;
          const i = r * cols + c;

          const key = (hash3(Math.round(u), Math.round(v), oct.id * 31) * 4294967295) >>> 0;
          cellKey[i] = key;
          cellDepth[i] = oct.depth;
          cellSpecies[i] = spIdx;

          if (centerHit && coverage >= 0.6) {
            cellFlag[i] = flag;
            const flicker = (hash3(c, r, Math.floor(t * 5.5)) - 0.5) * 0.055;
            cellShade[i] = clamp(shade + flicker, 0, 1);
            const sc = c + shadowDc;
            const sr = r + shadowDr;
            if (sc < cols && sr < rows) cellShadow[sr * cols + sc] = 1;
          } else {
            cellFlag[i] = FLAG_EDGE;
            cellShade[i] = coverage;
          }
        }
      }
    }
  }

  private drawOctopuses(t: number) {
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
      cellSpecies,
    } = this;
    const n = cols * rows;

    const tone = (level: number, tr: number, tg: number, tb: number) =>
      `rgb(${Math.min(255, Math.round(level * tr))},${Math.min(255, Math.round(level * tg))},${Math.min(255, Math.round(level * tb + 5))})`;

    for (let i = 0; i < n; i++) {
      const flag = cellFlag[i];
      if (flag === FLAG_NONE) continue;

      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const key = cellKey[i];
      const shade = cellShade[i];
      const dim = 0.68 + 0.32 * cellDepth[i];
      const [tr, tg, tb] = SPECIES_LOOK[SPECIES_LIST[cellSpecies[i]]].tint;

      // Staggered chromatophore shimmer clock
      const tick = Math.floor(t * 2.3 + (key % 997) / 97);
      const roll = hash3(key, tick, 7);

      if (flag === FLAG_EDGE) {
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        const g = (74 + shade * 88) * dim;
        ctx.fillStyle =
          roll < 0.075
            ? CHROMATOPHORES[key % CHROMATOPHORES.length]
            : tone(g, tr, tg, tb);
        ctx.fillText(set[(key >>> 8) % set.length], x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      let level: number;
      let glyph: string;
      if (flag === FLAG_EYE) {
        level = 14;
        glyph = "o";
      } else if (flag === FLAG_CROWN) {
        level = (74 + shade * 155) * dim;
        glyph = CROWN_GLYPHS[(key >>> 8) % CROWN_GLYPHS.length];
      } else if (flag === FLAG_SUCKER) {
        level = (48 + shade * 110) * dim;
        glyph = SUCKER_GLYPHS[(key >>> 8) % SUCKER_GLYPHS.length];
      } else if (flag === FLAG_ARM) {
        level = (42 + shade * 148) * dim;
        const jitter = ((key >>> 4) % 3) - 1;
        glyph = ARM_RAMP[clamp(Math.floor((1 - shade) * (ARM_RAMP.length - 0.01)) + jitter, 0, ARM_RAMP.length - 1)];
      } else {
        level = (46 + shade * 165) * dim;
        const jitter = ((key >>> 4) % 3) - 1;
        glyph = SKIN_RAMP[clamp(Math.floor((1 - shade) * (SKIN_RAMP.length - 0.01)) + jitter, 0, SKIN_RAMP.length - 1)];
      }

      ctx.fillStyle = tone(level, tr, tg, tb);
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

      let color: string;
      if (flag === FLAG_EYE) color = "#7ee8ff";
      else if (flag === FLAG_SUCKER) color = "#d8ebff";
      else if (roll < 0.095) color = CHROMATOPHORES[key % CHROMATOPHORES.length];
      else if (roll < 0.135) color = "#ffffff";
      else color = shade > 0.55 ? "#0d0f14" : "#1a1d25";

      ctx.fillStyle = color;
      ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
    }
  }

  // ── Musical Note Particles & Wake Dots ──────────────────────────────────

  private markNotes(world: AcousticOceanWorld) {
    const { noteStamp, noteBuckets, cellFlag } = this;
    const frame = ++this.frameId;
    for (const b of noteBuckets) b.length = 0;

    for (let pass = 0; pass < 2; pass++) {
      for (const f of world.notes) {
        if ((f.depth > 0.78 ? 0 : 1) !== pass) continue;
        const i = this.cellIndex(f.x, f.y);
        if (i < 0 || noteStamp[i] === frame || cellFlag[i] !== FLAG_NONE) continue;
        noteStamp[i] = frame;

        const glint = clamp(Math.abs(f.turn) / 3.2, 0, 1);
        const v = 0.28 + (0.4 * (f.depth - 0.55)) / 0.45 + 0.34 * Math.max(glint, f.resonance);
        const bucket = clamp(Math.floor(v * NOTE_ALPHAS.length), 0, NOTE_ALPHAS.length - 1);

        // Keep far ambient particles subtle (-, ~) and sparkle foreground/resonant notes as ♪ ♫ ♩
        const voiceGlyphs = VOICES[f.voice].glyphs;
        const showMusicGlyph = f.resonance > 0.36 || glint > 0.45 || f.pitch % 3 === 0;
        const glyph = showMusicGlyph
          ? voiceGlyphs[2 + (f.pitch % 2)]
          : voiceGlyphs[f.pitch % 2];
        const cyan = f.resonance > 0.45 || glint > 0.55;

        noteBuckets[bucket].push({ idx: i, glyph, cyan });
      }
    }
  }

  private drawNotes() {
    const { ctx, cw, ch, cols, noteBuckets } = this;
    for (let b = 0; b < noteBuckets.length; b++) {
      const bucket = noteBuckets[b];
      if (!bucket.length) continue;
      for (const item of bucket) {
        ctx.fillStyle = item.cyan ? this.cyanNoteStyles[b] : this.noteStyles[b];
        ctx.fillText(
          item.glyph,
          (item.idx % cols) * cw + cw * 0.5,
          ((item.idx / cols) | 0) * ch + ch * 0.5 + 1,
        );
      }
    }
  }

  private drawWakeDots() {
    const {
      ctx,
      cols,
      rows,
      cw,
      ch,
      wake,
      octaveGlow,
      cellFlag,
      cellShadow,
      noteStamp,
      frameId,
    } = this;
    const n = cols * rows;
    const small = Math.max(2, Math.round(cw * 0.19));
    const large = small + 1;

    for (let i = 0; i < n; i++) {
      if (cellFlag[i] !== FLAG_NONE || noteStamp[i] === frameId) continue;
      const e = wake[i];
      const o = octaveGlow[i];
      if (e < 0.14 && o < 0.12) continue;

      const col = i % cols;
      const row = (i / cols) | 0;
      const shadowScale = cellShadow[i] ? 0.35 : 1;

      if (o > e * 0.85 && o >= 0.12) {
        const lvl = clamp(Math.floor((o - 0.12) * 7.0 * shadowScale), 0, ALPHA_LEVELS - 1);
        ctx.fillStyle = this.octaveStyles[lvl];
        ctx.fillRect(
          Math.round(col * cw + cw * 0.66 - large * 0.5),
          Math.round(row * ch + ch * 0.64 - large * 0.5),
          large,
          large,
        );
      } else if (e >= 0.14) {
        const lvl = clamp(Math.floor((e - 0.14) * 7.0 * shadowScale), 0, ALPHA_LEVELS - 1);
        ctx.fillStyle = this.wakeStyles[lvl];
        const size = e > 0.42 ? large : small;
        ctx.fillRect(
          Math.round(col * cw + cw * 0.66 - size * 0.5),
          Math.round(row * ch + ch * 0.64 - size * 0.5),
          size,
          size,
        );
      }
    }
  }
}
