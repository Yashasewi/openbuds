/**
 * Translucent Bioluminescent Cell-Grid ASCII Renderer for OpenBuds:
 *
 * Implements the Translucent Backlit ASCII Law (distinct from opaque sharks):
 *   1. Crisp device-pixel-snapped dark cell grid on pure #000000
 *   2. Expanding cyan toroidal vortex-ring wake dots + dinoflagellate sparkles
 *   3. Depth-sorted bioluminescent plankton motes (zero per-cell fillStyle allocs)
 *   4. 4 distinct real jellyfish species with translucent backlit bells:
 *        - Fresnel glowing rim & scalloped margin (subtle translucent glass fill + bright glyphs)
 *        - Airy hollow bell interior (grid & wake peek through!)
 *        - 3D tilted subumbrella hollow cavity separating front & back margin rims
 *        - Species-specific internal anatomy:
 *            * Moon Jelly: 4 luminous orchid-violet horseshoe clover gonads
 *            * Crystal Jelly: hairline directional radial canals + traveling GFP emerald rim beads
 *            * Pacific Sea Nettle: 16 golden-amber sunburst rays + 4 ruffled cream oral-arm curtains
 *            * Helmet Jelly: dark crimson central stomach cone + electric-blue coronal groove flashes
 *        - Slope-aware hair-thin marginal tentacles (|, /, \, ~, :, ;, ', .) with arclength shimmer
 */
import {
  BIOMECH,
  ORAL_NODES,
  TENTACLE_NODES,
  sampleContraction,
  type JellySpecies,
  type Jellyfish,
  type JellyfishWorld,
} from "./jellyfishWorld";
import { TAU, angleDiff, clamp, hash3, smoothstep } from "./math";

const ALPHA_LEVELS = 6;
const PLANKTON_ALPHAS = [0.24, 0.4, 0.56, 0.74, 0.92];

const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";
const GLASS_GLYPHS = " ·:'·: ";
const RIM_GLYPHS = ":;t%S";
const GONAD_GLYPHS = "%St;";
const STOMACH_GLYPHS = "X8#%";
const ORAL_RIDGE_GLYPHS = "S%t;";
const ORAL_FRILL_GLYPHS = ";:,'";

const FLAG_NONE = 0;
const FLAG_GLASS = 1;
const FLAG_CAVITY = 2;
const FLAG_RIM = 3;
const FLAG_ORGAN = 4;
const FLAG_CANAL = 5;
const FLAG_STOMACH = 6;
const FLAG_ORAL = 7;
const FLAG_EDGE = 8;

const SUBSAMPLES = [0.25, 0.3, 0.75, 0.3, 0.25, 0.72, 0.75, 0.72];

interface SpeciesLook {
  /** Base translucent RGB (0..255) for glass tint & luminous rim glyphs. */
  baseRgb: readonly [number, number, number];
  /** Bioluminescent highlight / organ / flash RGB. */
  accentRgb: readonly [number, number, number];
  /** Oral arm translucent ribbon RGB. */
  oralRgb: readonly [number, number, number];
  /** Marginal tentacle filament RGB. */
  tentRgb: readonly [number, number, number];
  /** Bell outline halfWidth(s) for s in [0, 1]. */
  halfWidth: (s: number) => number;
  /** Margin scallop wave offset at azimuth theta. */
  scallop: (theta: number) => number;
}

const LOOKS: Record<JellySpecies, SpeciesLook> = {
  // Pacific Sea Nettle: golden-amber dome + lacy cream oral curtains + deep amber-maroon whips
  nettle: {
    baseRgb: [232, 178, 108],
    accentRgb: [255, 190, 105],
    oralRgb: [255, 236, 204],
    tentRgb: [215, 118, 92],
    halfWidth: (s) =>
      Math.pow(Math.sin(s * Math.PI * 0.58), 0.76) * (1 - 0.06 * smoothstep(0.84, 1, s)),
    scallop: (th) => 0.042 * Math.abs(Math.sin(12 * th)),
  },
  // Moon Jelly: icy periwinkle glass saucer + glowing orchid-violet 4-clover gonads
  moon: {
    baseRgb: [168, 198, 255],
    accentRgb: [204, 150, 255],
    oralRgb: [195, 222, 255],
    tentRgb: [152, 206, 255],
    halfWidth: (s) =>
      Math.pow(Math.sin(s * Math.PI * 0.54), 0.65) * (1 - 0.05 * smoothstep(0.84, 1, s)),
    scallop: (th) => -0.036 * Math.pow(Math.abs(Math.cos(4 * th)), 6),
  },
  // Helmet Jelly: tall pointed port-wine ogive with coronal waist + electric-cyan lappet flashes
  helmet: {
    baseRgb: [206, 98, 128],
    accentRgb: [72, 212, 255],
    oralRgb: [190, 92, 118],
    tentRgb: [176, 214, 245],
    halfWidth: (s) => {
      const base =
        s < 0.58
          ? 0.78 * Math.pow(s / 0.58, 0.72)
          : 0.78 + 0.22 * smoothstep(0.58, 0.94, s) - 0.03 * smoothstep(0.94, 1, s);
      const groove = 0.08 * Math.exp(-Math.pow((s - 0.58) / 0.055, 2));
      return Math.max(0, base - groove);
    },
    scallop: (th) => 0.072 * (1 - Math.abs((((th * 8) / Math.PI) % 2) - 1)),
  },
  // Crystal Jelly: ultra-flat ice glass lens + hairline radial canals + emerald GFP margin beads
  crystal: {
    baseRgb: [154, 226, 248],
    accentRgb: [58, 255, 146],
    oralRgb: [172, 232, 252],
    tentRgb: [142, 224, 248],
    halfWidth: (s) =>
      (Math.pow(Math.sin(s * Math.PI * 0.5), 0.5) + 0.05 * smoothstep(0.78, 1, s)) / 1.05,
    scallop: () => 0,
  },
};

const SPECIES_KEYS: JellySpecies[] = ["nettle", "moon", "helmet", "crystal"];

/** Crisp device-pixel-snapped dark cell grid on pure #000000. Exported for SoundField. */
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

/** Pick directional ASCII line glyph from segment tangent (dx, dy) so canals & tentacles curve smoothly. */
function slopeGlyph(dx: number, dy: number, intensity: number): string {
  if (intensity < 0.25) return ".";
  if (intensity < 0.42) return "'";
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absY > absX * 2.1) return intensity > 0.65 ? "|" : ":";
  if (absX > absY * 2.1) return "~";
  return dx * dy > 0 ? "\\" : "/";
}

export class JellyfishRenderer {
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

  // Diffusing electric-cyan toroidal vortex wake buffer
  private wake = new Float32Array(0);
  private wakeTmp = new Float32Array(0);

  // Per-cell depth-aware jellyfish buffers
  private cellFlag = new Uint8Array(0);
  private cellShade = new Float32Array(0);
  private cellBio = new Float32Array(0);
  private cellKey = new Uint32Array(0);
  private cellDepth = new Float32Array(0);
  private cellSpecies = new Uint8Array(0);
  private cellSlopeGlyph = new Uint8Array(0); // 0 none, 1 |, 2 /, 3 \, 4 :

  // Depth-aware marginal tentacle filament buffers
  private tentVal = new Float32Array(0);
  private tentDepth = new Float32Array(0);
  private tentSpecies = new Uint8Array(0);
  private tentKey = new Uint32Array(0);
  private tentGlyphCode = new Uint8Array(0);

  // Plankton buckets (separate neutral & cyan buckets -> 1 fillStyle per bucket!)
  private planktonStamp = new Uint32Array(0);
  private frameId = 0;
  private pNeutralBuckets: { idx: number; glyph: string }[][] = PLANKTON_ALPHAS.map(() => []);
  private pCyanBuckets: { idx: number; glyph: string }[][] = PLANKTON_ALPHAS.map(() => []);
  private planktonStyles: string[] = [];
  private cyanPlanktonStyles: string[] = [];
  private wakeStyles: string[] = [];
  private tentaclePalettes: string[][] = [];

  // Scratch sample results
  private hitFlag = FLAG_NONE;
  private hitShade = 0;
  private hitBio = 0;
  private hitU = 0;
  private hitV = 0;
  private hitDist = 9999;
  private hitSlope = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");
    this.buildPalettes();
  }

  private buildPalettes() {
    this.planktonStyles = PLANKTON_ALPHAS.map((a) => `rgba(218,232,252,${a.toFixed(2)})`);
    this.cyanPlanktonStyles = PLANKTON_ALPHAS.map(
      (a) => `rgba(94,228,255,${Math.min(1, a + 0.1).toFixed(2)})`,
    );
    this.wakeStyles = [];
    for (let l = 0; l < ALPHA_LEVELS; l++) {
      const a = (l + 1) / ALPHA_LEVELS;
      this.wakeStyles.push(`rgba(98,230,255,${(a * 0.94).toFixed(3)})`);
    }
    // Precompute quantized tentacle rgba styles per species to eliminate per-cell string allocs
    this.tentaclePalettes = SPECIES_KEYS.map((sp) => {
      const [r, g, b] = LOOKS[sp].tentRgb;
      const ramp: string[] = [];
      for (let i = 0; i < 8; i++) {
        const a = 0.14 + (i / 7) * 0.72;
        ramp.push(`rgba(${r},${g},${b},${a.toFixed(2)})`);
      }
      return ramp;
    });
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
      this.cellFlag = new Uint8Array(n);
      this.cellShade = new Float32Array(n);
      this.cellBio = new Float32Array(n);
      this.cellKey = new Uint32Array(n);
      this.cellDepth = new Float32Array(n);
      this.cellSpecies = new Uint8Array(n);
      this.cellSlopeGlyph = new Uint8Array(n);
      this.tentVal = new Float32Array(n);
      this.tentDepth = new Float32Array(n);
      this.tentSpecies = new Uint8Array(n);
      this.tentKey = new Uint32Array(n);
      this.tentGlyphCode = new Uint8Array(n);
      this.planktonStamp = new Uint32Array(n);
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

  warmStep(world: JellyfishWorld, dt: number) {
    if (this.cols === 0) return;
    this.consumeEvents(world);
    this.depositWake(world);
    this.diffuse(dt);
  }

  render(world: JellyfishWorld, dt: number) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    const t = world.time;

    this.consumeEvents(world);
    this.rasterizeJellies(world.jellies, t);
    this.rasterizeTentacles(world.jellies);
    this.depositWake(world);
    this.diffuse(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Draw background grid wake & plankton BEFORE translucent jellyfish so glass bells let them peek through!
    this.markPlankton(world);
    this.drawWakeDots(t);

    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawPlankton();
    this.drawTentacles(t);
    this.drawJellies(t);
  }

  // ── Toroidal Vortex-Ring Wake Field ─────────────────────────────────────

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

  private consumeEvents(world: JellyfishWorld) {
    for (const e of world.events) {
      if (e.kind === "splash") {
        this.stamp(this.wake, e.x, e.y, 6, e.strength);
      } else {
        this.stamp(this.wake, e.x, e.y, 3, e.strength * 0.85);
      }
    }
    world.events.length = 0;
  }

  private depositWake(world: JellyfishWorld) {
    const { wake } = this;
    for (const p of world.plankton) {
      const i = this.cellIndex(p.x, p.y);
      if (i >= 0) wake[i] = Math.min(1.5, wake[i] + 0.01 + p.alarm * 0.032);
    }
    // Active travelling vortex cores continuously leave glowing cyan chevron wakes
    for (const v of world.vortices) {
      const strength = clamp(Math.abs(v.gamma) / 10000, 0.07, 0.24);
      this.stamp(wake, v.x, v.y, 2, strength);
    }
    // Systole margin jet shear & drifting oral-arm tips
    for (const j of world.jellies) {
      const bio = BIOMECH[j.species];
      if (j.cDot > 0.12) {
        const fwdX = Math.cos(j.heading);
        const fwdY = Math.sin(j.heading);
        const rightX = -fwdY;
        const rightY = fwdX;
        const rMargin = j.bellDiameter * 0.5 * (1 - bio.deltaR * j.contraction) * bio.vortexOffset;
        const drop = j.bellDiameter * 0.22;
        const bx = j.x - fwdX * drop;
        const by = j.y - fwdY * drop;
        const amt = clamp(j.cDot * 0.085 * j.depth, 0.045, 0.26);
        this.stamp(wake, bx - rightX * rMargin, by - rightY * rMargin, 2, amt);
        this.stamp(wake, bx + rightX * rMargin, by + rightY * rMargin, 2, amt);
      }
      for (let a = 0; a < bio.oralCount; a++) {
        const nodes = j.oralArms[a];
        for (let k = ORAL_NODES - 5; k < ORAL_NODES; k++) {
          const i = this.cellIndex(nodes[k * 2], nodes[k * 2 + 1]);
          if (i >= 0) wake[i] = Math.min(1.5, wake[i] + 0.052 * j.depth);
        }
      }
    }
    if (world.pointer.active) {
      this.stamp(wake, world.pointer.x, world.pointer.y, 1, 0.11);
    }
  }

  private diffuse(dt: number) {
    const { cols, rows, wake, wakeTmp: tmp } = this;
    const decay = Math.exp(-dt * 1.12);
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

  // ── Translucent Bell & Ruffled Oral-Arm Sampling ────────────────────────

  private sampleJelly(px: number, py: number, j: Jellyfish, look: SpeciesLook): boolean {
    const bio = BIOMECH[j.species];
    const B = j.bellDiameter;
    // Rotate screen point into bell-local frame where -lv is forward along j.heading
    const rot = j.heading + Math.PI * 0.5;
    const cosT = Math.cos(-rot);
    const sinT = Math.sin(-rot);
    const dx = px - j.x;
    const dy = py - j.y;
    const lu = dx * cosT - dy * sinT;
    const lv = dx * sinT + dy * cosT;

    const cApex = sampleContraction(j.phi, bio.tauC, bio.tauR);
    const R0 = B * 0.5;
    const H0 = B * bio.bellAspect;
    const H = H0 * (1 + (j.species === "helmet" ? 0.14 : 0.1) * cApex);

    // 1. Evaluate Translucent Umbrella Bell with apex-to-margin phase lag & 3D tilted subumbrella cavity
    const marginDropMax = R0 * Math.sin(bio.viewTilt) * 0.85 + H0 * 0.1;
    if (lv >= -H * 1.04 && lv <= marginDropMax && Math.abs(lu) <= R0 * 1.15) {
      const sRaw = (lv + H) / (H || 1);
      const sClamped = clamp(sRaw, 0, 1);

      // Apex-to-margin travelling contraction wave + asymmetric left/right turning contraction
      const sideSign = lu >= 0 ? 1 : -1;
      const phiLocal =
        j.phi - bio.phaseLagBell * sClamped - bio.phaseLagSkirt * Math.pow(Math.max(0, sClamped - 0.72), 2);
      const cLoc = sampleContraction(phiLocal, bio.tauC, bio.tauR);
      const wMeridional = Math.pow(sClamped, bio.meridionalPow);
      const asym = 1 - sideSign * j.turnBias;
      // Velarium hysteresis whip flare during rapid contraction
      const whip = 0.045 * R0 * Math.max(0, sClamped - 0.72) * j.cDot;
      const halfW =
        Math.max(0.5, R0 * look.halfWidth(sClamped) * (1 - bio.deltaR * wMeridional * cLoc * asym) + whip);

      const absU = Math.abs(lu);
      const across = clamp(absU / halfW, 0, 1.5);
      const theta = Math.acos(clamp(lu / halfW, -1, 1));

      // 3D tilted elliptical subumbrella opening: front rim curves down, back rim curves up!
      const Rmargin =
        R0 *
        look.halfWidth(1) *
        (1 - bio.deltaR * sampleContraction(j.phi - bio.phaseLagBell - bio.phaseLagSkirt * 0.08, bio.tauC, bio.tauR));
      const dRim = Rmargin * Math.sin(bio.viewTilt);
      const sinTh = Math.sin(theta);
      const scallopOff = H0 * look.scallop(theta);
      const yRimFront = dRim * sinTh * 0.62 + scallopOff;
      const yRimBack = -dRim * sinTh * 0.3 + scallopOff * 0.4;

      if (absU <= halfW && lv <= yRimFront) {
        const nz = Math.sqrt(Math.max(0.02, 1 - Math.min(1, across) * Math.min(1, across)));
        const fresnel = smoothstep(0.66, 1.0, across);
        const frontMarginBand = smoothstep(yRimFront - H0 * 0.19, yRimFront, lv);
        const inCavity = lv > yRimBack && lv < yRimFront - H0 * 0.11 && sClamped > 0.84;

        // Upper-left soft caustic lighting on the glass dome
        const facing = (sideSign * across * -0.55 + (sClamped - 0.5) * -0.7) * 0.5 + 0.5;
        let shade = 0.24 + facing * 0.26 + fresnel * 0.52;
        let flag = inCavity ? FLAG_CAVITY : FLAG_GLASS;
        let bioGlow = 0;
        let slopeCode = 0;

        // Species-specific internal anatomy & bioluminescent wave laws!
        if (frontMarginBand > 0.42 || across > 0.74 || sClamped < 0.12) {
          flag = FLAG_RIM;
          shade = clamp(0.64 + Math.max(fresnel, frontMarginBand) * 0.36, 0, 1);
          // Crystal Jelly: GFP emerald photocyte bead wave strictly along the bell margin!
          if (j.species === "crystal" && frontMarginBand > 0.36) {
            const waveTheta = j.bioStartTheta + j.bioPulseAge * 2.5;
            const dTh1 = Math.abs(angleDiff(theta, waveTheta));
            const dTh2 = Math.abs(angleDiff(theta, j.bioStartTheta - j.bioPulseAge * 2.5));
            const pulse =
              Math.max(Math.exp(-dTh1 * dTh1 * 12), Math.exp(-dTh2 * dTh2 * 12)) *
              Math.exp(-j.bioPulseAge * 0.9);
            const bead = Math.pow(Math.abs(Math.cos(theta * 10)), 5);
            bioGlow = clamp(pulse * (0.45 + 0.55 * bead) + bead * 0.45, 0, 1);
          } else if (j.species === "helmet" && frontMarginBand > 0.4) {
            // Helmet Jelly: cold electric-blue flash down the 16 marginal lappets
            bioGlow = clamp(Math.exp(-j.bioPulseAge * 1.4) * 0.85 + 0.28, 0, 1);
          }
        } else if (j.species === "moon") {
          // Moon Jelly: unmistakable 4-lobe horseshoe clover gonads inside the glassy dome!
          const gCenters: [number, number][] = [
            [-0.26, 0.44],
            [0.26, 0.44],
            [-0.14, 0.62],
            [0.14, 0.62],
          ];
          for (const [gu, gs] of gCenters) {
            const gDist = Math.hypot((lu / R0 - gu) * 1.0, (sClamped - gs) * 1.25);
            if (Math.abs(gDist - 0.13) < 0.062) {
              flag = FLAG_ORGAN;
              shade = 0.88;
              bioGlow = 0.82;
              break;
            }
          }
          if (flag === FLAG_GLASS && sClamped > 0.2 && sClamped < 0.92) {
            const canalWave = Math.abs(Math.sin(theta * 8));
            if (canalWave > 0.94) {
              flag = FLAG_CANAL;
              shade = 0.46;
              slopeCode = across < 0.25 ? 1 : lu < 0 ? 2 : 3;
            }
          }
        } else if (j.species === "crystal") {
          // Crystal Jelly: crisp hairline radial canals radiating from compact pale-cyan stomach
          if (sClamped > 0.18 && sClamped < 0.94 && !inCavity) {
            const stomach = Math.hypot(lu / R0, (sClamped - 0.36) * 1.2);
            if (stomach < 0.2) {
              flag = FLAG_ORGAN;
              shade = 0.78;
              bioGlow = 0.28;
            } else if (Math.abs(Math.sin(theta * 14)) > 0.92) {
              flag = FLAG_CANAL;
              shade = 0.56;
              slopeCode = across < 0.22 ? 1 : lu < 0 ? 2 : 3;
            }
          }
        } else if (j.species === "nettle") {
          // Pacific Sea Nettle: 16 golden-amber exumbrella sunburst rays radiating from dome crown
          if (sClamped > 0.12 && sClamped < 0.92 && !inCavity) {
            const ray = Math.abs(Math.sin(theta * 8));
            if (ray > 0.74) {
              flag = FLAG_ORGAN;
              shade = 0.58 + (ray - 0.74) * 1.4;
              bioGlow = 0.4;
            }
          }
        } else if (j.species === "helmet") {
          // Helmet Jelly: opaque dark port-wine central stomach cone + electric-blue coronal groove!
          const grooveDist = Math.abs(sClamped - 0.58);
          if (grooveDist < 0.065) {
            flag = FLAG_RIM;
            shade = 0.82;
            bioGlow = clamp(Math.exp(-j.bioPulseAge * 1.3) * 0.95 + 0.45, 0, 1);
          } else if (sClamped > 0.14 && sClamped < 0.56 && across < 0.58) {
            flag = FLAG_STOMACH;
            shade = 0.42 + (1 - across) * 0.36;
            bioGlow = 0;
          } else if (sClamped > 0.6 && sClamped < 0.96 && Math.abs(Math.sin(theta * 8)) > 0.85) {
            flag = FLAG_CANAL;
            shade = 0.64;
            bioGlow = clamp(Math.exp(-j.bioPulseAge * 1.4) * 0.75 + 0.25, 0, 1);
            slopeCode = 1;
          }
        }

        // Subtle back-wall depth attenuation inside cavity
        if (inCavity && flag === FLAG_CAVITY) {
          shade = 0.12 + nz * 0.12;
        }

        this.hitFlag = flag;
        this.hitShade = clamp(shade, 0, 1);
        this.hitBio = bioGlow;
        this.hitU = (lu / (R0 || 1)) * 22;
        this.hitV = sClamped * 28;
        this.hitDist = 0;
        this.hitSlope = slopeCode;
        return true;
      }
    }

    // 2. Central Ruffled Translucent Silk Oral-Arm Curtains
    let bestD2 = Infinity;
    let bestArm = -1;
    let bestS = 0;
    let bestW = 1;
    let bestSign = 1;
    let bestNx = 0;
    let bestNy = 0;

    for (let a = 0; a < bio.oralCount; a++) {
      const nodes = j.oralArms[a];
      for (let k = 0; k < ORAL_NODES - 1; k++) {
        const ax = nodes[k * 2];
        const ay = nodes[k * 2 + 1];
        const sx = nodes[(k + 1) * 2] - ax;
        const sy = nodes[(k + 1) * 2 + 1] - ay;
        const len2 = sx * sx + sy * sy || 1;
        const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
        const qx = ax + sx * u;
        const qy = ay + sy * u;
        const d2 = (px - qx) ** 2 + (py - qy) ** 2;
        if (d2 < bestD2) {
          const s = (k + u) / (ORAL_NODES - 1);
          // Interfering helical curtain ruffle (stays >= 0.65*cw down to s=0.8 so curtains stay continuous!)
          const ruffle = 0.62 + 0.38 * Math.abs(Math.sin(s * 14 - j.phi * TAU + a * 1.8));
          const halfW = Math.max(this.cw * 0.55 * (1 - s * 0.55), B * bio.oralWidthMul * (1 - s * 0.65) * ruffle);
          if (d2 <= halfW * halfW) {
            bestD2 = d2;
            bestArm = a;
            bestS = s;
            bestW = halfW;
            const len = Math.sqrt(len2);
            bestSign = sx * (py - ay) - sy * (px - ax) >= 0 ? 1 : -1;
            bestNx = (-sy / len) * bestSign;
            bestNy = (sx / len) * bestSign;
          }
        }
      }
    }

    if (bestArm >= 0) {
      const d = Math.sqrt(bestD2);
      const across = clamp(d / (bestW || 1), 0, 1);
      const facing = (bestNx * -0.55 + bestNy * -0.75) * across;
      // Brighter along the curled silk fold ridge and gently fading toward tips
      const fold = 0.68 - across * 0.22 + facing * 0.24 - bestS * 0.36;
      this.hitFlag = FLAG_ORAL;
      this.hitShade = clamp(fold, 0.16, 0.96);
      this.hitBio = across > 0.6 ? 0.35 : 0.15;
      this.hitU = bestS * 42 + bestArm * 11;
      this.hitV = across * bestSign * 8;
      this.hitDist = d;
      this.hitSlope = 0;
      return true;
    }

    // Distance hint for fast early-out in rasterizeJellies
    this.hitDist = Math.min(Math.hypot(dx, dy) - R0 * 1.15, Math.sqrt(bestD2));
    return false;
  }

  private rasterizeJellies(jellies: Jellyfish[], t: number) {
    const {
      cellFlag,
      cellShade,
      cellBio,
      cellKey,
      cellDepth,
      cellSpecies,
      cellSlopeGlyph,
      cw,
      ch,
      cols,
      rows,
    } = this;
    cellFlag.fill(FLAG_NONE);
    cellDepth.fill(0);

    const skipBeyond = Math.hypot(cw, ch) * 1.35;

    for (const j of jellies) {
      const look = LOOKS[j.species];
      const bio = BIOMECH[j.species];
      const spIdx = SPECIES_KEYS.indexOf(j.species);
      const B = j.bellDiameter;

      const bellReach = B * Math.max(0.75, bio.bellAspect + 0.25);
      let minX = j.x - bellReach;
      let maxX = j.x + bellReach;
      let minY = j.y - bellReach;
      let maxY = j.y + bellReach;
      for (let a = 0; a < bio.oralCount; a++) {
        const nodes = j.oralArms[a];
        for (let k = 0; k < ORAL_NODES; k++) {
          const nx = nodes[k * 2];
          const ny = nodes[k * 2 + 1];
          if (nx < minX) minX = nx;
          if (nx > maxX) maxX = nx;
          if (ny < minY) minY = ny;
          if (ny > maxY) maxY = ny;
        }
      }

      const pad = B * 0.14 + cw * 2;
      const c0 = Math.max(0, Math.floor((minX - pad) / cw));
      const c1 = Math.min(cols - 1, Math.ceil((maxX + pad) / cw));
      const r0 = Math.max(0, Math.floor((minY - pad) / ch));
      const r1 = Math.min(rows - 1, Math.ceil((maxY + pad) / ch));
      if (c0 > c1 || r0 > r1) continue;

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = c * cw;
          const y = r * ch;

          const centerHit = this.sampleJelly(x + cw * 0.5, y + ch * 0.5, j, look);
          if (!centerHit && this.hitDist > skipBeyond) continue;

          const flag = this.hitFlag;
          const shade = this.hitShade;
          const bioVal = this.hitBio;
          const u = this.hitU;
          const v = this.hitV;
          const slope = this.hitSlope;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < SUBSAMPLES.length; k += 2) {
            if (this.sampleJelly(x + SUBSAMPLES[k] * cw, y + SUBSAMPLES[k + 1] * ch, j, look)) {
              hits++;
            }
          }
          if (hits === 0) continue;
          const coverage = hits / 5;
          const i = r * cols + c;

          // Foreground jelly always composites cleanly over background jelly (including its soft edges!)
          if (cellFlag[i] !== FLAG_NONE && j.depth < cellDepth[i]) continue;

          const key = (hash3(Math.round(u), Math.round(v), j.id * 43) * 4294967295) >>> 0;
          cellKey[i] = key;
          cellDepth[i] = j.depth;
          cellSpecies[i] = spIdx;

          if (centerHit && (coverage >= 0.5 || flag === FLAG_ORAL)) {
            cellFlag[i] = flag;
            const caustic = 0.05 * Math.sin(c * 0.14 + r * 0.09 - t * 0.9);
            cellShade[i] = clamp(shade + caustic, 0, 1);
            cellBio[i] = bioVal;
            cellSlopeGlyph[i] = slope;
          } else {
            cellFlag[i] = FLAG_EDGE;
            cellShade[i] = coverage;
            cellBio[i] = bioVal;
            cellSlopeGlyph[i] = 0;
          }
        }
      }
    }
  }

  /**
   * Rasterize hair-thin marginal tentacles with directional slope glyphs, arclength hashing,
   * and proper depth layering (foreground tentacles can cross over background bells!).
   */
  private rasterizeTentacles(jellies: Jellyfish[]) {
    const { tentVal, tentDepth, tentSpecies, tentKey, tentGlyphCode, cellFlag, cellDepth, cw, ch, cols, rows } =
      this;
    tentVal.fill(0);
    tentDepth.fill(0);

    for (const j of jellies) {
      const bio = BIOMECH[j.species];
      const spIdx = SPECIES_KEYS.indexOf(j.species);

      for (let tIdx = 0; tIdx < bio.tentacleCount; tIdx++) {
        const nodes = j.tentacles[tIdx];
        let arcAcc = 0;
        for (let k = 0; k < TENTACLE_NODES - 1; k++) {
          const ax = nodes[k * 2];
          const ay = nodes[k * 2 + 1];
          const bx = nodes[(k + 1) * 2];
          const by = nodes[(k + 1) * 2 + 1];
          const dx = bx - ax;
          const dy = by - ay;
          const dist = Math.hypot(dx, dy);
          const steps = Math.max(2, Math.ceil((dist / Math.min(cw, ch)) * 1.45));

          for (let st = 0; st <= steps; st++) {
            const frac = st / steps;
            const px = ax + dx * frac;
            const py = ay + dy * frac;
            const c = Math.floor(px / cw);
            const r = Math.floor(py / ch);
            if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
            const idx = r * cols + c;

            // Only hide tentacle behind solid bell/oral-arm of the SAME or NEARER jellyfish
            if (cellFlag[idx] !== FLAG_NONE && cellFlag[idx] !== FLAG_EDGE && cellDepth[idx] >= j.depth) {
              continue;
            }

            const s = (k + frac) / (TENTACLE_NODES - 1);
            const alpha = (1 - s * 0.84) * (0.45 + 0.55 * j.depth);
            if (j.depth > tentDepth[idx] || (j.depth === tentDepth[idx] && alpha > tentVal[idx])) {
              tentVal[idx] = alpha;
              tentDepth[idx] = j.depth;
              tentSpecies[idx] = spIdx;
              // Arclength-anchored hash prevents whole-segment brick flickering!
              const arcBin = Math.floor((arcAcc + dist * frac) / Math.max(ch, 12));
              tentKey[idx] = (hash3(arcBin, tIdx * 7, j.id * 29) * 4294967295) >>> 0;
              const gChar = slopeGlyph(dx, dy, alpha);
              tentGlyphCode[idx] =
                gChar === "|"
                  ? 1
                  : gChar === "/"
                    ? 2
                    : gChar === "\\"
                      ? 3
                      : gChar === "~"
                        ? 4
                        : gChar === ":"
                          ? 5
                          : gChar === "'"
                            ? 6
                            : 7;
            }
          }
          arcAcc += dist;
        }
      }
    }
  }

  private drawTentacles(t: number) {
    const { ctx, cols, rows, cw, ch, tentVal, tentSpecies, tentKey, tentGlyphCode } = this;
    const n = cols * rows;
    const glyphTable = ["", "|", "/", "\\", "~", ":", "'", "."];

    for (let i = 0; i < n; i++) {
      const v = tentVal[i];
      if (v <= 0.08) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const key = tentKey[i];
      const spIdx = tentSpecies[i];
      const sp = LOOKS[SPECIES_KEYS[spIdx]];

      const tick = Math.floor(t * 2.2 + (key % 509) / 61);
      const roll = hash3(key, tick, 19);

      if (roll < 0.08 && v > 0.38) {
        const [ar, ag, ab] = sp.accentRgb;
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${Math.min(1, v + 0.15).toFixed(2)})`;
        ctx.fillText(roll < 0.03 ? "°" : glyphTable[tentGlyphCode[i]], col * cw + cw * 0.5, row * ch + ch * 0.5 + 1);
      } else {
        const pal = this.tentaclePalettes[spIdx];
        ctx.fillStyle = pal[clamp(Math.floor(v * 7.99), 0, pal.length - 1)];
        ctx.fillText(glyphTable[tentGlyphCode[i]], col * cw + cw * 0.5, row * ch + ch * 0.5 + 1);
      }
    }
  }

  /**
   * Translucent Backlit ASCII Jellyfish Drawing:
   * Low-alpha glass fills + luminous self-lit glyphs so every jellyfish reads as hollow,
   * glowing, and glass-like over the dark cell grid!
   */
  private drawJellies(t: number) {
    const {
      ctx,
      cols,
      rows,
      cw,
      ch,
      cellFlag,
      cellShade,
      cellBio,
      cellKey,
      cellDepth,
      cellSpecies,
      cellSlopeGlyph,
    } = this;
    const n = cols * rows;
    const canalGlyphs = [":", "|", "/", "\\"];

    for (let i = 0; i < n; i++) {
      const flag = cellFlag[i];
      if (flag === FLAG_NONE) continue;

      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const key = cellKey[i];
      const shade = cellShade[i];
      const bio = cellBio[i];
      const dim = 0.52 + 0.48 * cellDepth[i];
      const look = LOOKS[SPECIES_KEYS[cellSpecies[i]]];
      const [br, bg, bb] = look.baseRgb;
      const [ar, ag, ab] = look.accentRgb;

      const tick = Math.floor(t * 2.3 + (key % 997) / 97);
      const roll = hash3(key, tick, 7);

      // 1. Sub-cell anti-aliased edge punctuation (no fillRect!)
      if (flag === FLAG_EDGE) {
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        const mix = clamp(bio * 0.85, 0, 1);
        const r = Math.round((br + (ar - br) * mix) * dim);
        const g = Math.round((bg + (ag - bg) * mix) * dim);
        const b = Math.round((bb + (ab - bb) * mix) * dim);
        const a = clamp((0.38 + shade * 0.52) * dim, 0.2, 0.94);
        ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(2)})`;
        ctx.fillText(set[(key >>> 8) % set.length], x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      // 2. Hollow subumbrella shadow cavity (almost pure black void letting grid breathe)
      if (flag === FLAG_CAVITY) {
        ctx.fillStyle = `rgba(${br},${bg},${bb},${(0.03 * dim).toFixed(3)})`;
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        if ((key & 7) === 0) {
          ctx.fillStyle = `rgba(${br},${bg},${bb},${(0.24 * dim).toFixed(2)})`;
          ctx.fillText(".", x + cw * 0.5, y + ch * 0.5 + 1);
        }
        continue;
      }

      // 3. Glassy translucent bell interior (luminous tint + airy sparse glyphs so bell stays cohesive)
      if (flag === FLAG_GLASS) {
        const glassAlpha = (0.09 + shade * 0.13) * dim;
        ctx.fillStyle = `rgba(${br},${bg},${bb},${glassAlpha.toFixed(3)})`;
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        const glyph = GLASS_GLYPHS[(key >>> 4) % GLASS_GLYPHS.length];
        if (glyph !== " ") {
          const ga = clamp((0.36 + shade * 0.42) * dim, 0.22, 0.78);
          ctx.fillStyle = `rgba(${br},${bg},${bb},${ga.toFixed(2)})`;
          ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
        }
        continue;
      }

      // 4. Crisp hairline radial canals floating inside the translucent bell (no fillRect!)
      if (flag === FLAG_CANAL) {
        const mix = clamp(bio, 0, 1);
        const r = Math.round(br + (ar - br) * mix);
        const g = Math.round(bg + (ag - bg) * mix);
        const b = Math.round(bb + (ab - bb) * mix);
        ctx.fillStyle = `rgba(${r},${g},${b},${clamp((0.36 + shade * 0.36 + bio * 0.3) * dim, 0.22, 0.92).toFixed(2)})`;
        ctx.fillText(canalGlyphs[cellSlopeGlyph[i] % canalGlyphs.length], x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      // 5. Fresnel glowing bell rim & scalloped margin (translucent rim tint + luminous glyphs!)
      if (flag === FLAG_RIM) {
        const mix = clamp(bio * 0.9, 0, 1);
        const r = Math.round(br + (ar - br) * mix);
        const g = Math.round(bg + (ag - bg) * mix);
        const b = Math.round(bb + (ab - bb) * mix);
        const bgA = clamp((0.14 + shade * 0.22 + bio * 0.16) * dim, 0.08, 0.48);
        ctx.fillStyle = `rgba(${r},${g},${b},${bgA.toFixed(2)})`;
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

        const gIdx = clamp(Math.floor(shade * (RIM_GLYPHS.length - 0.01)), 0, RIM_GLYPHS.length - 1);
        const glyph = bio > 0.65 && roll < 0.45 ? "*" : bio > 0.42 ? "°" : RIM_GLYPHS[gIdx];
        ctx.fillStyle =
          roll < 0.035 && shade > 0.72
            ? "#ffffff"
            : `rgba(${Math.min(255, r + 28)},${Math.min(255, g + 28)},${Math.min(255, b + 28)},${clamp((0.68 + shade * 0.32) * dim, 0.4, 1).toFixed(2)})`;
        ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      // 6. Glowing internal organs (Moon clover gonads, Nettle sunburst rays, Crystal stomach)
      if (flag === FLAG_ORGAN) {
        const mix = clamp(0.35 + bio * 0.65, 0, 1);
        const r = Math.round(br + (ar - br) * mix);
        const g = Math.round(bg + (ag - bg) * mix);
        const b = Math.round(bb + (ab - bb) * mix);
        ctx.fillStyle = `rgba(${r},${g},${b},${clamp((0.2 + shade * 0.24) * dim, 0.12, 0.48).toFixed(2)})`;
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        ctx.fillStyle = `rgba(${Math.min(255, r + 35)},${Math.min(255, g + 35)},${Math.min(255, b + 35)},${clamp((0.65 + shade * 0.32) * dim, 0.38, 0.96).toFixed(2)})`;
        ctx.fillText(GONAD_GLYPHS[(key >>> 4) % GONAD_GLYPHS.length], x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      // 7. Helmet Jelly opaque dark-crimson central stomach cone (masks prey bioluminescence!)
      if (flag === FLAG_STOMACH) {
        ctx.fillStyle = `rgba(118,22,36,${(0.62 * dim).toFixed(2)})`;
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        ctx.fillStyle = `rgba(182,48,68,${(0.85 * dim).toFixed(2)})`;
        ctx.fillText(STOMACH_GLYPHS[(key >>> 4) % STOMACH_GLYPHS.length], x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      // 8. Central frilled silk oral-arm curtains (faint translucent ribbon + luminous lacy edges!)
      if (flag === FLAG_ORAL) {
        const [or, og, ob] = look.oralRgb;
        const bgA = clamp((0.08 + shade * 0.18) * dim, 0.05, 0.3);
        ctx.fillStyle = `rgba(${or},${og},${ob},${bgA.toFixed(2)})`;
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

        const isRidge = shade > 0.56;
        const glyph = isRidge
          ? ORAL_RIDGE_GLYPHS[(key >>> 4) % ORAL_RIDGE_GLYPHS.length]
          : ORAL_FRILL_GLYPHS[(key >>> 4) % ORAL_FRILL_GLYPHS.length];
        if (roll < 0.035 && isRidge) {
          ctx.fillStyle = `rgba(${ar},${ag},${ab},${(0.95 * dim).toFixed(2)})`;
        } else {
          ctx.fillStyle = `rgba(${or},${og},${ob},${clamp((0.46 + shade * 0.48) * dim, 0.25, 0.94).toFixed(2)})`;
        }
        ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
      }
    }
  }

  // ── Bucketed Plankton & Vortex-Ring Wake Dots ───────────────────────────

  private markPlankton(world: JellyfishWorld) {
    const { planktonStamp, pNeutralBuckets, pCyanBuckets, cellFlag, tentVal } = this;
    const frame = ++this.frameId;
    for (const b of pNeutralBuckets) b.length = 0;
    for (const b of pCyanBuckets) b.length = 0;

    for (const p of world.plankton) {
      const i = this.cellIndex(p.x, p.y);
      if (i < 0 || planktonStamp[i] === frame || tentVal[i] > 0.35) continue;
      // Let plankton subtly show through glassy bell interior, skip solid rim/organs
      if (cellFlag[i] !== FLAG_NONE && cellFlag[i] !== FLAG_GLASS && cellFlag[i] !== FLAG_CAVITY) {
        continue;
      }
      planktonStamp[i] = frame;
      const glint = clamp(Math.abs(p.turn) / 3.2, 0, 1);
      const v = 0.26 + (0.4 * (p.depth - 0.5)) / 0.5 + 0.35 * Math.max(glint, p.alarm);
      const bucket = clamp(Math.floor(v * PLANKTON_ALPHAS.length), 0, PLANKTON_ALPHAS.length - 1);
      const glyph = p.alarm > 0.55 ? "~" : p.school === 0 ? "-" : "·";
      if (p.alarm > 0.42 || glint > 0.5) {
        pCyanBuckets[bucket].push({ idx: i, glyph });
      } else {
        pNeutralBuckets[bucket].push({ idx: i, glyph });
      }
    }
  }

  private drawPlankton() {
    const { ctx, cw, ch, cols, pNeutralBuckets, pCyanBuckets } = this;
    for (let b = 0; b < pNeutralBuckets.length; b++) {
      const neutral = pNeutralBuckets[b];
      if (neutral.length) {
        ctx.fillStyle = this.planktonStyles[b];
        for (const item of neutral) {
          ctx.fillText(
            item.glyph,
            (item.idx % cols) * cw + cw * 0.5,
            ((item.idx / cols) | 0) * ch + ch * 0.5 + 1,
          );
        }
      }
      const cyan = pCyanBuckets[b];
      if (cyan.length) {
        ctx.fillStyle = this.cyanPlanktonStyles[b];
        for (const item of cyan) {
          ctx.fillText(
            item.glyph,
            (item.idx % cols) * cw + cw * 0.5,
            ((item.idx / cols) | 0) * ch + ch * 0.5 + 1,
          );
        }
      }
    }
  }

  private drawWakeDots(t: number) {
    const { ctx, cols, rows, cw, ch, wake, planktonStamp, frameId } = this;
    const n = cols * rows;
    const small = Math.max(2, Math.round(cw * 0.2));
    const large = small + 1;

    for (let i = 0; i < n; i++) {
      if (planktonStamp[i] === frameId) continue;
      const e = wake[i];
      if (e < 0.09) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const lvl = clamp(Math.floor((e - 0.09) * 6.8), 0, ALPHA_LEVELS - 1);
      ctx.fillStyle = this.wakeStyles[lvl];
      const sz = e > 0.42 ? large : small;
      ctx.fillRect(
        Math.round(col * cw + cw * 0.66 - sz * 0.5),
        Math.round(row * ch + ch * 0.64 - sz * 0.5),
        sz,
        sz,
      );
      // Bioluminescent dinoflagellate sparkle inside fresh vortex-ring crests
      if (e > 0.72 && hash3(col, row, Math.floor(t * 4)) < 0.09) {
        ctx.fillStyle = "rgba(195,246,255,0.62)";
        ctx.fillText("·", col * cw + cw * 0.5, row * ch + ch * 0.5 + 1);
      }
    }
  }
}
