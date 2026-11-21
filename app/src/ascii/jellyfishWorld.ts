/**
 * Biomechanically grounded bioluminescent jellyfish bloom for OpenBuds:
 *
 * - 4 distinct real species across 3 depth tiers framing the hero headline:
 *     1. Pacific Sea Nettle (Chrysaora fuscescens) — hero foreground, oblate rower
 *     2. Moon Jelly (Aurelia aurita) — mid-ground saucer rower with 4 clover gonads
 *     3. Helmet Jelly (Periphylla periphylla) — mid-ground prolate coronal jetter
 *     4. Crystal Jelly (Aequorea victoria) — distant ultra-flat GFP glass lens
 * - Asymmetric C2 fast-contraction / slow-viscoelastic-relaxation stroke with
 *   Passive Energy Recapture (PER) secondary coast acceleration.
 * - Paired toroidal vortex rings (Lamb-Oseen dipoles) shed from bell margins on
 *   contraction pinch-off, curling plankton and painting cyan wakes on the grid.
 * - Differentiated fluid physics for central ruffled oral-arm curtains vs.
 *   varied-length hair-thin marginal tentacles trailing behind bell velocity.
 */
import { TAU, angleDiff, clamp, current, rand, randInt } from "./math";

export const ORAL_NODES = 13;
export const TENTACLE_NODES = 16;

export type JellySpecies = "nettle" | "moon" | "helmet" | "crystal";

export interface JellySpec {
  species: JellySpecies;
  /** Relative size (1.0 = hero foreground ~21.5% of minSide). */
  size: number;
  depth: number;
}

export const DEFAULT_JELLIES: JellySpec[] = [
  { species: "nettle", size: 1.0, depth: 1.0 },
  { species: "moon", size: 0.88, depth: 0.86 },
  { species: "helmet", size: 0.76, depth: 0.74 },
  { species: "crystal", size: 0.72, depth: 0.62 },
  { species: "moon", size: 0.48, depth: 0.44 },
];

export interface SpeciesBiomechanics {
  /** Contraction duty fraction (fast systole). */
  tauC: number;
  /** Elastic relaxation duty fraction (slow diastole). */
  tauR: number;
  /** Natural pulse frequency (Hz). */
  freqHz: number;
  /** Jet vs rowing thrust weights + passive energy recapture boost. */
  kJet: number;
  kRow: number;
  kPer: number;
  /** Radial squeeze amplitude (0..0.42). */
  deltaR: number;
  /** Apex-to-margin travelling phase lag (cycles). */
  phaseLagBell: number;
  phaseLagSkirt: number;
  /** Meridional contraction power (higher = margin-focused rower). */
  meridionalPow: number;
  /** Bell height / width ratio (oblate < 0.7, prolate > 1.0). */
  bellAspect: number;
  /** 3D pitch viewing tilt (rad) exposing the hollow subumbrella cavity. */
  viewTilt: number;
  /** Oral arm count & length relative to bell diameter. */
  oralCount: number;
  oralLenMul: number;
  oralWidthMul: number;
  /** Marginal tentacle count, length & initial outward flare (rad). */
  tentacleCount: number;
  tentacleLenMul: number;
  tentacleFlare: number;
  /** Vortex shed radial offset fraction (wide for rowers, narrow for jetters). */
  vortexOffset: number;
}

export const BIOMECH: Record<JellySpecies, SpeciesBiomechanics> = {
  // Pacific Sea Nettle: lush wide oblate dome rower with huge ruffled oral curtains & long whips
  nettle: {
    tauC: 0.3,
    tauR: 0.52,
    freqHz: 0.44,
    kJet: 0.42,
    kRow: 0.95,
    kPer: 0.3,
    deltaR: 0.26,
    phaseLagBell: 0.11,
    phaseLagSkirt: 0.24,
    meridionalPow: 1.9,
    bellAspect: 0.56,
    viewTilt: 0.24,
    oralCount: 4,
    oralLenMul: 1.45,
    oralWidthMul: 0.135,
    tentacleCount: 10,
    tentacleLenMul: 1.85,
    tentacleFlare: 0.22,
    vortexOffset: 0.85,
  },
  // Moon Jelly: wide icy saucer rower, 4 short folded oral arms, delicate micro-fringe
  moon: {
    tauC: 0.32,
    tauR: 0.5,
    freqHz: 0.52,
    kJet: 0.34,
    kRow: 1.0,
    kPer: 0.32,
    deltaR: 0.28,
    phaseLagBell: 0.12,
    phaseLagSkirt: 0.26,
    meridionalPow: 2.1,
    bellAspect: 0.44,
    viewTilt: 0.26,
    oralCount: 4,
    oralLenMul: 0.72,
    oralWidthMul: 0.11,
    tentacleCount: 14,
    tentacleLenMul: 0.4,
    tentacleFlare: 0.28,
    vortexOffset: 0.88,
  },
  // Helmet Jelly: tall prolate coronal jetter with stiff flared radiating tentacles & compact mouth
  helmet: {
    tauC: 0.22,
    tauR: 0.46,
    freqHz: 0.68,
    kJet: 1.05,
    kRow: 0.3,
    kPer: 0.26,
    deltaR: 0.28,
    phaseLagBell: 0.07,
    phaseLagSkirt: 0.15,
    meridionalPow: 0.85,
    bellAspect: 0.96,
    viewTilt: 0.2,
    oralCount: 2,
    oralLenMul: 0.38,
    oralWidthMul: 0.085,
    tentacleCount: 10,
    tentacleLenMul: 1.32,
    tentacleFlare: 0.58,
    vortexOffset: 0.58,
  },
  // Crystal Jelly: ultra-flat glass lens with radial canals & long alternating gossamer strands
  crystal: {
    tauC: 0.31,
    tauR: 0.51,
    freqHz: 0.48,
    kJet: 0.38,
    kRow: 0.92,
    kPer: 0.28,
    deltaR: 0.25,
    phaseLagBell: 0.1,
    phaseLagSkirt: 0.22,
    meridionalPow: 2.0,
    bellAspect: 0.38,
    viewTilt: 0.26,
    oralCount: 2,
    oralLenMul: 0.36,
    oralWidthMul: 0.08,
    tentacleCount: 12,
    tentacleLenMul: 1.35,
    tentacleFlare: 0.24,
    vortexOffset: 0.86,
  },
};

const smootherstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * C2-continuous asymmetric jellyfish contraction curve c(phi) in [0, 1]:
 * Fast muscular systole (0..tauC), slow elastic mesogleal diastole (tauC..tauC+tauR), coast pause.
 */
export function sampleContraction(phi: number, tauC: number, tauR: number): number {
  const p = ((phi % 1) + 1) % 1;
  if (p < tauC) {
    return smootherstep(Math.pow(p / tauC, 0.85));
  }
  if (p < tauC + tauR) {
    const v = (p - tauC) / tauR;
    return 1 - smootherstep(1 - Math.pow(1 - v, 1.35));
  }
  return 0;
}

function wrappedDelta(a: number, b: number) {
  return (((a - b) % 1) + 1.5) % 1 - 0.5;
}

export interface VortexCore {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Signed circulation (positive CCW, negative CW). */
  gamma: number;
  age: number;
  coreR0: number;
}

export interface Plankton {
  x: number;
  y: number;
  vx: number;
  vy: number;
  school: number;
  alarm: number;
  depth: number;
  turn: number;
}

export interface Jellyfish {
  id: number;
  species: JellySpecies;
  /** Relaxed bell diameter in CSS pixels. */
  bellDiameter: number;
  /** Center of bell margin in CSS pixels. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Body orientation tilt relative to straight up (-0.72..+0.72 rad; 0 = upright). */
  tilt: number;
  omega: number;
  /** Asymmetric left-right contraction bias (-0.24..+0.24) during skidding turns. */
  turnBias: number;
  /** Normalized propulsion cycle phase phi in [0, 1). */
  phi: number;
  /** Instantaneous contraction c(phi) in [0, 1] and rate cDot (1/s). */
  contraction: number;
  cDot: number;
  /** Free-roaming wander state + flank affinity (-1 left flank, +1 right flank). */
  flank: -1 | 1;
  wanderAngle: number;
  depth: number;
  /** Nerve-net bioluminescent wave trigger clock (used by Crystal GFP & Helmet coronal flashes). */
  bioPulseAge: number;
  bioStartTheta: number;
  nextBioAt: number;
  /** Central frilled oral-arm Verlet/follow chains. */
  oralArms: Float32Array[];
  oralLens: Float32Array;
  oralRoots: Float32Array;
  /** Marginal gossamer tentacle fluid chains. */
  tentacles: Float32Array[];
  tentacleLens: Float32Array;
  tentacleRoots: Float32Array;
}

export interface BloomEvent {
  kind: "splash" | "vortex";
  x: number;
  y: number;
  strength: number;
}

const SEP_K = 360;
const ALIGN_K = 1.25;
const COHESION_K = 0.85;
const FLEE_K = 920;

export class JellyfishWorld {
  width = 0;
  height = 0;
  time = 0;
  jellies: Jellyfish[] = [];
  plankton: Plankton[] = [];
  vortices: VortexCore[] = [];
  events: BloomEvent[] = [];
  pointer = { x: 0, y: 0, active: false };

  private specs: JellySpec[];
  private clearCentre: boolean;
  private perception = 58;
  private sepX = 28;
  private sepY = 22;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketNext = new Int32Array(0);
  private tmpCur = { x: 0, y: 0 };

  constructor(specs: JellySpec[] = DEFAULT_JELLIES, clearCentre = true) {
    this.specs = specs;
    this.clearCentre = clearCentre;
  }

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.sepX = cellW * 2.5;
    this.sepY = cellH * 1.45;
    this.perception = Math.max(cellH * 3, cellW * 5.2);

    if (first || this.plankton.length === 0) {
      this.seed();
      return;
    }
    for (const p of this.plankton) {
      p.x = clamp(p.x, 0, width);
      p.y = clamp(p.y, 0, height);
    }
    for (const j of this.jellies) {
      j.x = clamp(j.x, j.bellDiameter * 0.45, width - j.bellDiameter * 0.45);
      j.y = clamp(j.y, j.bellDiameter * 0.5, height - j.bellDiameter * 0.4);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    // Generous bell scale (~228px hero down to ~110px distant moonlet) so every dome reads unmistakably
    const baseBell = clamp(minSide * 0.252, 146, 236);

    // 5 staggered slots across outer flanks + high upper sky (zero overlap, clear hero center)
    const slots: { x: number; y: number; tilt: number; flank: -1 | 1; phi: number }[] = [
      { x: 0.125, y: 0.28, tilt: 0.22, flank: -1, phi: 0.72 }, // 1. Hero Sea Nettle (far left upper)
      { x: 0.865, y: 0.25, tilt: -0.22, flank: 1, phi: 0.62 }, // 2. Moon Jelly (far right upper)
      { x: 0.775, y: 0.68, tilt: -0.15, flank: 1, phi: 0.38 }, // 3. Helmet Jelly (lower right-inner)
      { x: 0.245, y: 0.71, tilt: 0.16, flank: -1, phi: 0.84 }, // 4. Crystal Jelly (lower left-inner)
      { x: 0.37, y: 0.13, tilt: 0.28, flank: -1, phi: 0.5 }, // 5. Distant Moonlet (upper sky, short fringe)
    ];

    this.jellies = [];
    this.vortices = [];

    for (let i = 0; i < this.specs.length; i++) {
      const { species, size, depth } = this.specs[i];
      const bio = BIOMECH[species];
      const bellDiameter = baseBell * size;
      const slot = slots[i % slots.length];
      const x = W * (slot.x + rand(-0.015, 0.015));
      const y = H * (slot.y + rand(-0.02, 0.02));
      const tilt = slot.tilt + rand(-0.05, 0.05);

      const oralArms: Float32Array[] = [];
      const oralLens = new Float32Array(bio.oralCount);
      const oralRoots = new Float32Array(bio.oralCount);
      for (let a = 0; a < bio.oralCount; a++) {
        const frac = bio.oralCount === 1 ? 0 : (a / (bio.oralCount - 1)) * 2 - 1;
        oralRoots[a] = frac * 0.2;
        const len = bellDiameter * bio.oralLenMul * (1 - Math.abs(frac) * 0.12 + rand(-0.06, 0.08));
        oralLens[a] = len;
        const nodes = new Float32Array(ORAL_NODES * 2);
        const seg = len / (ORAL_NODES - 1);
        const rx = x + Math.cos(tilt) * oralRoots[a] * bellDiameter;
        const ry = y + Math.sin(tilt) * oralRoots[a] * bellDiameter;
        for (let k = 0; k < ORAL_NODES; k++) {
          const s = k / (ORAL_NODES - 1);
          const sway = Math.sin(s * 4.2 + a * 1.4) * bellDiameter * 0.09 * s;
          nodes[k * 2] = rx - Math.sin(tilt) * seg * k + sway;
          nodes[k * 2 + 1] = ry + Math.cos(tilt) * seg * k;
        }
        oralArms.push(nodes);
      }

      const tentacles: Float32Array[] = [];
      const tentacleLens = new Float32Array(bio.tentacleCount);
      const tentacleRoots = new Float32Array(bio.tentacleCount);
      for (let tIdx = 0; tIdx < bio.tentacleCount; tIdx++) {
        const frac = bio.tentacleCount === 1 ? 0 : (tIdx / (bio.tentacleCount - 1)) * 2 - 1;
        tentacleRoots[tIdx] = frac * 0.48;
        // Varied alternating lengths (long primary whips + shorter delicate marginal strands)
        const alt = tIdx % 2 === 0 ? 1.08 : 0.68;
        const len =
          bellDiameter * bio.tentacleLenMul * alt * (1 - Math.abs(frac) * 0.14 + rand(-0.08, 0.12));
        tentacleLens[tIdx] = len;
        const nodes = new Float32Array(TENTACLE_NODES * 2);
        const seg = len / (TENTACLE_NODES - 1);
        const rx = x + Math.cos(tilt) * tentacleRoots[tIdx] * bellDiameter;
        const ry = y + Math.sin(tilt) * tentacleRoots[tIdx] * bellDiameter;
        for (let k = 0; k < TENTACLE_NODES; k++) {
          const s = k / (TENTACLE_NODES - 1);
          const flareX = frac * bio.tentacleFlare * bellDiameter * 0.24 * Math.sin(s * Math.PI * 0.65);
          const sway = Math.sin(s * 5.0 + tIdx * 0.95) * bellDiameter * 0.1 * s;
          nodes[k * 2] = rx - Math.sin(tilt) * seg * k + flareX + sway;
          nodes[k * 2 + 1] = ry + Math.cos(tilt) * seg * k;
        }
        tentacles.push(nodes);
      }

      this.jellies.push({
        id: i + 1,
        species,
        bellDiameter,
        x,
        y,
        vx: Math.sin(tilt) * 14,
        vy: -Math.cos(tilt) * 14,
        tilt,
        omega: 0,
        turnBias: 0,
        phi: slot.phi,
        contraction: sampleContraction(slot.phi, bio.tauC, bio.tauR),
        cDot: 0,
        flank: slot.flank,
        wanderAngle: tilt,
        depth,
        bioPulseAge: rand(0.2, 1.4),
        bioStartTheta: rand(0, TAU),
        nextBioAt: rand(2.2, 5.2),
        oralArms,
        oralLens,
        oralRoots,
        tentacles,
        tentacleLens,
        tentacleRoots,
      });
    }
    // Paint distant/smaller jellies first so larger foreground jellies layer smoothly on top
    this.jellies.sort((a, b) => a.depth - b.depth);

    // Seed bioluminescent plankton schools
    const total = clamp(Math.round((W * H) / 4800), 90, 260);
    this.plankton = [];
    while (this.plankton.length < total) {
      const school = randInt(0, 2);
      const count = Math.min(randInt(12, 24), total - this.plankton.length);
      const cx = rand(W * 0.05, W * 0.95);
      const cy = rand(H * 0.06, H * 0.94);
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < count; k++) {
        this.plankton.push({
          x: cx + rand(-1, 1) * this.sepX * Math.sqrt(count),
          y: cy + rand(-1, 1) * this.sepY * Math.sqrt(count) * 0.7,
          vx: Math.cos(dir) * 38,
          vy: Math.sin(dir) * 38,
          school,
          alarm: 0,
          depth: rand(0.5, 1),
          turn: 0,
        });
      }
    }
    this.bucketNext = new Int32Array(this.plankton.length);
  }

  /** Click anywhere: emit a bioluminescent ripple, trigger nerve-net flashes, and scatter plankton. */
  splash(x: number, y: number) {
    this.events.push({ kind: "splash", x, y, strength: 1.5 });
    const r = 240;
    for (const p of this.plankton) {
      const dx = p.x - x;
      const dy = p.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      const k = (1 - d / r) * 240;
      p.vx += (dx / d) * k;
      p.vy += (dy / d) * k;
      p.alarm = 1;
    }
    for (const j of this.jellies) {
      const dx = j.x - x;
      const dy = j.y - y;
      const d = Math.hypot(dx, dy);
      if (d < 340 && d > 1e-3) {
        const push = (1 - d / 340) * 44;
        j.vx += (dx / d) * push;
        j.vy += (dy / d) * push;
        // Startled jellyfish fire their bioluminescent nerve-net wave!
        j.bioPulseAge = 0;
        j.bioStartTheta = Math.atan2(y - j.y, x - j.x);
      }
    }
  }

  step(dt: number) {
    this.time += dt;
    this.rebuildHash();
    this.stepVortices(dt);
    this.stepPlankton(dt);
    this.stepJellies(dt);
  }

  private stepVortices(dt: number) {
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.age += dt;
      v.x += v.vx * dt;
      v.y += v.vy * dt;
      v.vx *= Math.exp(-dt * 0.85);
      v.vy *= Math.exp(-dt * 0.85);
      v.gamma *= Math.exp(-dt * 0.58);
      if (v.age > 3.2 || Math.abs(v.gamma) < 12) {
        this.vortices.splice(i, 1);
      }
    }
  }

  /** Lamb-Oseen regularized 2D vortex dipole velocity induced at point (px, py). */
  private sampleVortexVelocity(px: number, py: number, out: { x: number; y: number }) {
    let ux = 0;
    let uy = 0;
    for (const v of this.vortices) {
      const dx = px - v.x;
      const dy = py - v.y;
      const r2 = dx * dx + dy * dy;
      if (r2 > 220 * 220) continue;
      const rc2 = v.coreR0 * v.coreR0 + 420 * v.age;
      const factor = (v.gamma / (TAU * (r2 + rc2))) * (1 - Math.exp(-r2 / rc2));
      ux += -dy * factor;
      uy += dx * factor;
    }
    out.x = ux;
    out.y = uy;
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
    }
    this.bucketHead.fill(-1);
    if (this.bucketNext.length !== this.plankton.length) {
      this.bucketNext = new Int32Array(this.plankton.length);
    }
    for (let i = 0; i < this.plankton.length; i++) {
      const p = this.plankton[i];
      const b = this.bucketOf(p.x, p.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
    }
  }

  private bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  private stepPlankton(dt: number) {
    const { plankton, jellies, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmpCur;
    const vort = { x: 0, y: 0 };
    const calmDecay = Math.exp(-dt * 0.72);
    const contagion = Math.min(1, dt * 5);

    for (let i = 0; i < plankton.length; i++) {
      const p = plankton[i];
      const spread = 1 + 1.5 * p.alarm;
      const sepX = this.sepX * spread;
      const sepY = this.sepY * spread;

      const speed = Math.hypot(p.vx, p.vy) || 1;
      const hx = p.vx / speed;
      const hy = p.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let nCount = 0;
      let neighbourAlarm = 0;

      const bc = clamp(Math.floor(p.x / R) + 2, 0, cols - 1);
      const br = clamp(Math.floor(p.y / R) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = plankton[j];
              const dx = o.x - p.x;
              const dy = o.y - p.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const qx = dx / sepX;
                const qy = dy / sepY;
                const q2 = qx * qx + qy * qy;
                if (q2 < 1) {
                  const q = Math.sqrt(q2) || 1e-3;
                  const k = (1 - q) / q;
                  sx -= qx * k;
                  sy -= qy * k;
                }
                if (o.school === p.school) {
                  avx += o.vx;
                  avy += o.vy;
                  cx += dx;
                  cy += dy;
                  nCount++;
                }
                if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * SEP_K;
      ay += sy * SEP_K;
      if (nCount > 0) {
        ax += (avx / nCount - p.vx) * ALIGN_K + (cx / nCount) * COHESION_K * (1 - 0.7 * p.alarm);
        ay += (avy / nCount - p.vy) * ALIGN_K + (cy / nCount) * COHESION_K * (1 - 0.7 * p.alarm);
      }

      // Advect plankton through shed Lamb-Oseen jellyfish vortex rings!
      this.sampleVortexVelocity(p.x, p.y, vort);
      const vortSpeed = Math.hypot(vort.x, vort.y);
      ax += vort.x * 2.2;
      ay += vort.y * 2.2;

      let fear = clamp(vortSpeed / 90, 0, 0.85);
      for (const jelly of jellies) {
        const rr = jelly.bellDiameter * 0.72 + 24;
        const dx = p.x - jelly.x;
        const dy = p.y - jelly.y;
        const d = Math.hypot(dx, dy);
        if (d < rr && d > 1e-3) {
          const w = (1 - d / rr) ** 2;
          ax += (dx / d) * FLEE_K * 0.55 * w;
          ay += (dy / d) * FLEE_K * 0.55 * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.85);
        }
      }

      if (pointer.active) {
        const pr = 140;
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FLEE_K * w;
          ay += (dy / d) * FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.9);
        }
      }

      let alarm = Math.max(p.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.84;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      p.alarm = alarm;

      const m = 34;
      if (p.x < m) ax += (m - p.x) * 6.5;
      else if (p.x > W - m) ax -= (p.x - (W - m)) * 6.5;
      if (p.y < m) ay += (m - p.y) * 6.5;
      else if (p.y > H - m) ay -= (p.y - (H - m)) * 6.5;

      current(p.x, p.y, time, cur);
      ax += cur.x * 0.45 + (Math.random() - 0.5) * 18;
      ay += cur.y * 0.45 + (Math.random() - 0.5) * 18;
      ay -= p.vy * 0.72 * (1 - 0.6 * p.alarm);

      const preferred = 40 * (1 + 1.2 * p.alarm);
      ax += (preferred - speed) * hx * 1.4;
      ay += (preferred - speed) * hy * 1.4;

      const before = Math.atan2(p.vy, p.vx);
      p.vx += ax * dt;
      p.vy += ay * dt;
      const maxS = 98 * (1 + 1.45 * p.alarm);
      const s = Math.hypot(p.vx, p.vy);
      if (s > maxS) {
        p.vx *= maxS / s;
        p.vy *= maxS / s;
      } else if (s < 18 && s > 1e-3) {
        p.vx *= 18 / s;
        p.vy *= 18 / s;
      }
      p.turn += (angleDiff(before, Math.atan2(p.vy, p.vx)) / dt - p.turn) * Math.min(1, dt * 8);
      p.x = clamp(p.x + p.vx * dt, -40, W + 40);
      p.y = clamp(p.y + p.vy * dt, -40, H + 40);
    }
  }

  private stepJellies(dt: number) {
    const { jellies, width: W, height: H, time } = this;
    const cxW = W * 0.5;
    const cyW = H * 0.48;
    const cur = this.tmpCur;
    const vort = { x: 0, y: 0 };

    for (const j of jellies) {
      const bio = BIOMECH[j.species];
      const prevPhi = j.phi;
      j.phi = (j.phi + dt * bio.freqHz) % 1;

      const c = sampleContraction(j.phi, bio.tauC, bio.tauR);
      const cPrev = sampleContraction(prevPhi, bio.tauC, bio.tauR);
      const cDot = (c - cPrev) / dt;
      j.contraction = c;
      j.cDot = cDot;

      // Nerve-net bioluminescent wave timer (Crystal GFP rim & Helmet coronal pulses)
      j.bioPulseAge += dt;
      if (time >= j.nextBioAt) {
        j.bioPulseAge = 0;
        j.bioStartTheta = rand(0, TAU);
        j.nextBioAt = time + rand(3.8, 6.8);
      }

      // 1. Asymmetric propulsion thrust + Passive Energy Recapture (PER) secondary coast boost
      const posDot = Math.max(0, cDot);
      const negDot = Math.min(0, cDot);
      const tauP = Math.max(0, 1 - (bio.tauC + bio.tauR));
      const phiPer = (bio.tauC + bio.tauR + 0.3 * tauP) % 1;
      const dPer = wrappedDelta(j.phi, phiPer);
      const perBoost = bio.kPer * Math.exp(-(dPer * dPer) / (2 * 0.11 * 0.11));

      // Scale thrust cleanly so average buoyant upward propulsion exceeds gentle gravity!
      const rawThrust =
        bio.kJet * posDot * posDot * 0.25 + bio.kRow * posDot * 0.8 + 0.1 * negDot + perBoost;
      const thrustMag = rawThrust * (32 + j.bellDiameter * 0.18);

      // Shed paired counter-rotating toroidal vortex ring at end of contraction (phi crosses tauC)!
      if (prevPhi < bio.tauC && j.phi >= bio.tauC) {
        const cosT = Math.cos(j.tilt);
        const sinT = Math.sin(j.tilt);
        const rShed = j.bellDiameter * 0.5 * (1 - bio.deltaR * 0.7) * bio.vortexOffset;
        const backDist = j.bellDiameter * 0.18;
        const bx = j.x - sinT * backDist;
        const by = j.y + cosT * backDist;
        const jetSpeed = 28 + j.bellDiameter * 0.16;
        const baseGamma = (5500 + j.bellDiameter * 38) * j.depth;

        if (this.vortices.length < 24) {
          this.vortices.push(
            {
              x: bx - cosT * rShed,
              y: by - sinT * rShed,
              vx: -sinT * jetSpeed - cosT * 6,
              vy: cosT * jetSpeed - sinT * 6,
              gamma: -baseGamma,
              age: 0,
              coreR0: j.bellDiameter * 0.14,
            },
            {
              x: bx + cosT * rShed,
              y: by + sinT * rShed,
              vx: -sinT * jetSpeed + cosT * 6,
              vy: cosT * jetSpeed + sinT * 6,
              gamma: baseGamma,
              age: 0,
              coreR0: j.bellDiameter * 0.14,
            },
          );
        }
        this.events.push(
          { kind: "vortex", x: bx - cosT * rShed, y: by - sinT * rShed, strength: 0.75 * j.depth },
          { kind: "vortex", x: bx + cosT * rShed, y: by + sinT * rShed, strength: 0.75 * j.depth },
        );
      }

      // 2. Free-roaming buoyant navigation (no rubber-band home spring!)
      // Subtle negative buoyancy sinking between pulses + upward thrust along bell heading
      const gravity = 11.5;
      let ax = Math.sin(j.tilt) * thrustMag;
      let ay = -Math.cos(j.tilt) * thrustMag + gravity;

      // Gentle ambient current & slow unscripted heading wander
      current(j.x, j.y, time, cur);
      ax += cur.x * 0.18;
      ay += cur.y * 0.14;

      j.wanderAngle = clamp(j.wanderAngle + (Math.random() - 0.5) * dt * 0.9, -0.58, 0.58);
      let desiredTilt = j.wanderAngle;

      // Keep each jelly roaming naturally within the outer flank corridors & safe vertical envelope
      const topLimit = j.bellDiameter * (bio.bellAspect * 0.85) + 46;
      const bottomLimit = H * 0.73; // Leaves room below bell so oral arms & tentacles curl naturally
      if (j.y < topLimit) {
        ay += (topLimit - j.y) * 0.65;
        desiredTilt += j.flank * 0.18;
      } else if (j.y > bottomLimit) {
        ay -= (j.y - bottomLimit) * 0.75;
        desiredTilt *= 0.5;
      }

      const sideMin = j.bellDiameter * 0.52;
      const sideMax = W - j.bellDiameter * 0.52;
      if (j.x < sideMin) {
        ax += (sideMin - j.x) * 0.9;
        desiredTilt = Math.max(desiredTilt, 0.36);
      } else if (j.x > sideMax) {
        ax -= (j.x - sideMax) * 0.9;
        desiredTilt = Math.min(desiredTilt, -0.36);
      }

      // Asymmetric hero headline sanctuary: repel bells cleanly around headline & CTA block
      if (this.clearCentre) {
        const halfCorridorX = W * 0.255 + j.bellDiameter * 0.42;
        const dxC = j.x - cxW;
        const dyC = j.y - (cyW + H * 0.01);
        const ex = dxC / halfCorridorX;
        const ey = dyC / (H * 0.31);
        const e2 = ex * ex + ey * ey;
        if (e2 < 1) {
          const e = Math.sqrt(e2) || 1e-3;
          const push = (1 - e) * 145;
          const nx = ex === 0 ? j.flank : ex / e;
          const ny = ey / e;
          ax += nx * push;
          ay += ny * push * 0.65;
          desiredTilt = clamp(desiredTilt + Math.sign(nx) * (1 - e) * 0.5, -0.62, 0.62);
        }
      }

      // Gentle jelly-to-jelly separation
      for (const other of jellies) {
        if (other === j) continue;
        const ox = j.x - other.x;
        const oy = j.y - other.y;
        const d = Math.hypot(ox, oy);
        const minD = (j.bellDiameter + other.bellDiameter) * 0.95;
        if (d < minD && d > 1e-3) {
          const push = (1 - d / minD) * 78;
          ax += (ox / d) * push;
          ay += (oy / d) * push;
        }
      }

      // Gentle pointer fluid cushion
      if (this.pointer.active) {
        const dx = j.x - this.pointer.x;
        const dy = j.y - this.pointer.y;
        const d = Math.hypot(dx, dy);
        const pr = j.bellDiameter * 1.15 + 64;
        if (d < pr && d > 1e-3) {
          const push = (1 - d / pr) * 72;
          ax += (dx / d) * push;
          ay += (dy / d) * push;
        }
      }

      // Quadratic + linear hydrodynamic drag (contracted bell has lower frontal drag -> sleek glide!)
      const frontalDrag = 1 - 0.32 * c;
      const speed = Math.hypot(j.vx, j.vy);
      const dragFactor = Math.exp(-dt * (1.25 * frontalDrag + speed * 0.012));
      j.vx = (j.vx + ax * dt) * dragFactor;
      j.vy = (j.vy + ay * dt) * dragFactor;
      j.x = clamp(j.x + j.vx * dt, sideMin * 0.7, W - sideMin * 0.7);
      j.y = clamp(j.y + j.vy * dt, topLimit * 0.65, H * 0.72);

      // Passive buoyancy righting torque + asymmetric skidding turn torque (strongest during active stroke)
      const tiltErr = desiredTilt - j.tilt;
      j.turnBias = clamp(tiltErr * 0.55, -0.22, 0.22);
      const strokeAuthority = 0.25 + 0.75 * Math.max(0, Math.min(1, posDot * 0.6 + c * 0.5));
      const angAccel = tiltErr * 2.8 * strokeAuthority - j.omega * 3.2;
      j.omega += angAccel * dt;
      j.tilt = clamp(j.tilt + j.omega * dt, -0.64, 0.64);

      // 3. Differentiated Oral-Arm & Marginal-Tentacle Fluid Chains (velocity-trailing + vortex coupling!)
      const cosT = Math.cos(j.tilt);
      const sinT = Math.sin(j.tilt);
      const marginC = sampleContraction(j.phi - bio.phaseLagBell - bio.phaseLagSkirt * 0.2, bio.tauC, bio.tauR);
      const rEff = j.bellDiameter * 0.5 * (1 - bio.deltaR * marginC);
      const downAngle = Math.PI * 0.5 + j.tilt;
      // Trail behind the bell's actual velocity vector so turns & upward surges whip trailing arms naturally
      const trailAngle = Math.atan2(Math.cos(j.tilt) * 32 - j.vy * 0.65, -Math.sin(j.tilt) * 32 - j.vx * 0.65);

      // Central frilled silk oral arms (higher bending stiffness -> broad graceful S-curves)
      for (let a = 0; a < bio.oralCount; a++) {
        const nodes = j.oralArms[a];
        const rootU = j.oralRoots[a] * j.bellDiameter * (1 - bio.deltaR * 0.45 * marginC);
        nodes[0] = j.x + cosT * rootU;
        nodes[1] = j.y + sinT * rootU;

        const seg = j.oralLens[a] / (ORAL_NODES - 1);
        const maxBend = 0.24;
        let prevAng = downAngle + j.oralRoots[a] * 0.4;

        for (let k = 1; k < ORAL_NODES; k++) {
          const s = k / (ORAL_NODES - 1);
          const px = nodes[(k - 1) * 2];
          const py = nodes[(k - 1) * 2 + 1];
          const wave = Math.sin(j.phi * TAU - s * 4.2 + a * 1.55) * (0.12 + s * 0.24);
          const natural = trailAngle + j.oralRoots[a] * 0.25 + wave;

          let ang = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
          ang += angleDiff(ang, natural) * Math.min(1, dt * (2.4 + s * 1.1));
          ang = prevAng + clamp(angleDiff(prevAng, ang), -maxBend, maxBend);

          nodes[k * 2] = px + Math.cos(ang) * seg;
          nodes[k * 2 + 1] = py + Math.sin(ang) * seg;
          prevAng = ang;
        }
      }

      // Hair-thin marginal tentacles (low bending stiffness + margin-whipping + Lamb-Oseen vortex swirl)
      for (let tIdx = 0; tIdx < bio.tentacleCount; tIdx++) {
        const nodes = j.tentacles[tIdx];
        const frac = bio.tentacleCount === 1 ? 0 : (tIdx / (bio.tentacleCount - 1)) * 2 - 1;
        // Attach around outer curved rim ellipse (front/back 2.5D projection)
        const theta = frac * Math.PI * 0.48;
        const rimU = Math.sin(theta) * rEff;
        const rimDrop = Math.cos(theta) * rEff * Math.sin(bio.viewTilt) * 0.72;
        nodes[0] = j.x + cosT * rimU - sinT * rimDrop;
        nodes[1] = j.y + sinT * rimU + cosT * rimDrop;

        // Prolate jetters (Helmet) retract tentacles slightly during crisp swim bursts to cut drag
        const retract = j.species === "helmet" ? 1 - 0.16 * c : 1;
        const seg = (j.tentacleLens[tIdx] * retract) / (TENTACLE_NODES - 1);
        const maxBend = j.species === "helmet" ? 0.22 : 0.34;
        let prevAng = downAngle + frac * bio.tentacleFlare;

        for (let k = 1; k < TENTACLE_NODES; k++) {
          const s = k / (TENTACLE_NODES - 1);
          const px = nodes[(k - 1) * 2];
          const py = nodes[(k - 1) * 2 + 1];

          this.sampleVortexVelocity(nodes[k * 2], nodes[k * 2 + 1], vort);
          const vortBias = clamp((vort.x * Math.cos(downAngle) + vort.y * Math.sin(downAngle)) * 0.004, -0.35, 0.35);
          const wave = Math.sin(j.phi * TAU - s * 5.6 + tIdx * 0.9) * (0.14 + s * 0.34);
          const flareCurve = frac * bio.tentacleFlare * (1 - s * 0.62);
          const natural = trailAngle + flareCurve + wave + vortBias;

          let ang = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
          ang += angleDiff(ang, natural) * Math.min(1, dt * (2.0 + s * 1.1));
          ang = prevAng + clamp(angleDiff(prevAng, ang), -maxBend, maxBend);

          nodes[k * 2] = px + Math.cos(ang) * seg;
          nodes[k * 2 + 1] = py + Math.sin(ang) * seg;
          prevAng = ang;
        }
      }
    }
  }
}
