/**
 * Biomechanically grounded 360° free-swimming bioluminescent jellyfish bloom for OpenBuds:
 *
 * - 5 real species across depth tiers cruising in smooth, endless buoyant orbits around the
 *   centered hero headline — never stalling on the top edge or bunching in one corner:
 *     1. Pacific Sea Nettle (Chrysaora fuscescens) — hero foreground rower
 *     2. Moon Jelly (Aurelia aurita) — translucent saucer rower with 4 clover gonads
 *     3. Helmet Jelly (Periphylla periphylla) — prolate coronal jetter with crimson stomach
 *     4. Crystal Jelly (Aequorea victoria) — flat glass lens with GFP emerald margin wave
 *     5. Distant Moonlet (Aurelia) — deep background depth layer
 * - Asymmetric C2 fast-contraction / slow-elastic-relaxation stroke with Passive Energy
 *   Recapture (PER) coast boost and paired Lamb-Oseen vortex rings shed on contraction pinch-off.
 * - Full 360° orbital steering (inspired by ascii-sharks's Reynolds circulation + clearCentre)
 *   with asymmetric left-right bell contraction during turns and organic trailing oral arms
 *   and gossamer marginal tentacles streaming cleanly behind each bell's swimming direction.
 */
import { TAU, angleDiff, clamp, current, rand, randInt } from "./math";

export const ORAL_NODES = 13;
export const TENTACLE_NODES = 16;

export type JellySpecies = "nettle" | "moon" | "helmet" | "crystal";

export interface JellySpec {
  species: JellySpecies;
  size: number;
  depth: number;
}

export const DEFAULT_JELLIES: JellySpec[] = [
  { species: "nettle", size: 1.0, depth: 1.0 },
  { species: "moon", size: 0.86, depth: 0.86 },
  { species: "helmet", size: 0.76, depth: 0.74 },
  { species: "crystal", size: 0.72, depth: 0.62 },
  { species: "moon", size: 0.48, depth: 0.46 },
];

export interface SpeciesBiomechanics {
  tauC: number;
  tauR: number;
  freqHz: number;
  kJet: number;
  kRow: number;
  kPer: number;
  deltaR: number;
  phaseLagBell: number;
  phaseLagSkirt: number;
  meridionalPow: number;
  bellAspect: number;
  viewTilt: number;
  oralCount: number;
  oralLenMul: number;
  oralWidthMul: number;
  tentacleCount: number;
  tentacleLenMul: number;
  tentacleFlare: number;
  vortexOffset: number;
}

export const BIOMECH: Record<JellySpecies, SpeciesBiomechanics> = {
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
    tentacleCount: 9,
    tentacleLenMul: 1.8,
    tentacleFlare: 0.22,
    vortexOffset: 0.85,
  },
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
    tentacleCount: 12,
    tentacleLenMul: 0.42,
    tentacleFlare: 0.26,
    vortexOffset: 0.88,
  },
  helmet: {
    tauC: 0.22,
    tauR: 0.46,
    freqHz: 0.66,
    kJet: 1.05,
    kRow: 0.3,
    kPer: 0.26,
    deltaR: 0.28,
    phaseLagBell: 0.07,
    phaseLagSkirt: 0.15,
    meridionalPow: 0.85,
    bellAspect: 0.94,
    viewTilt: 0.2,
    oralCount: 2,
    oralLenMul: 0.38,
    oralWidthMul: 0.085,
    tentacleCount: 9,
    tentacleLenMul: 1.3,
    tentacleFlare: 0.54,
    vortexOffset: 0.58,
  },
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
    tentacleCount: 10,
    tentacleLenMul: 1.32,
    tentacleFlare: 0.24,
    vortexOffset: 0.86,
  },
};

const smootherstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** C2-continuous asymmetric contraction curve c(phi) in [0, 1]. */
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
  /**
   * Full 360° swim heading in radians (0 = right, -PI/2 = straight up, +PI/2 = straight down).
   * Renderer uses `rot = heading + PI/2` so the bell apex always leads forward along `heading`.
   */
  heading: number;
  /** Smoothed angular velocity (rad/s). */
  turnRate: number;
  /** Asymmetric left-right contraction bias (-0.22..+0.22) during turning pulses. */
  turnBias: number;
  /** Normalized propulsion cycle phase phi in [0, 1). */
  phi: number;
  contraction: number;
  cDot: number;
  /** Patrol orbit direction (+1 CW, -1 CCW) & preferred elliptical orbit radius. */
  orbitDir: 1 | -1;
  orbitRadius: number;
  wander: number;
  depth: number;
  /** Nerve-net bioluminescent wave clock. */
  bioPulseAge: number;
  bioStartTheta: number;
  nextBioAt: number;
  /** Central frilled silk oral-arm fluid chains. */
  oralArms: Float32Array[];
  oralLens: Float32Array;
  oralRoots: Float32Array;
  /** Hair-thin marginal tentacle fluid chains + per-strand organic phase offsets. */
  tentacles: Float32Array[];
  tentacleLens: Float32Array;
  tentacleRoots: Float32Array;
  tentaclePhases: Float32Array;
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
      j.y = clamp(j.y, 90, height - j.bellDiameter * 0.45);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const baseBell = clamp(minSide * 0.24, 138, 224);

    // Distribute all 5 jellyfish evenly around the full elliptical perimeter around the hero text
    const seedOrbit: { angle: number; radiusMul: number; dir: 1 | -1; phi: number }[] = [
      { angle: -2.65, radiusMul: 0.41, dir: 1, phi: 0.18 }, // Hero Sea Nettle (left-upper ascending)
      { angle: -0.42, radiusMul: 0.4, dir: -1, phi: 0.62 }, // Moon Jelly (right-upper gliding)
      { angle: 0.48, radiusMul: 0.39, dir: 1, phi: 0.38 }, // Helmet Jelly (right-lower curving)
      { angle: 2.58, radiusMul: 0.38, dir: -1, phi: 0.82 }, // Crystal Jelly (left-lower rising)
      { angle: -1.78, radiusMul: 0.39, dir: 1, phi: 0.5 }, // Distant Moonlet (upper sky)
    ];

    this.jellies = [];
    this.vortices = [];

    const cxW = W * 0.5;
    const cyW = H * 0.53; // Slightly below center to leave clean clearance under the 64px top nav
    const aspectX = (W / minSide) * 0.88;

    for (let i = 0; i < this.specs.length; i++) {
      const { species, size, depth } = this.specs[i];
      const bio = BIOMECH[species];
      const bellDiameter = baseBell * size;
      const seed = seedOrbit[i % seedOrbit.length];
      const orbitRadius = minSide * seed.radiusMul;
      const a = seed.angle + rand(-0.14, 0.14);

      const x = clamp(cxW + Math.cos(a) * orbitRadius * aspectX, bellDiameter * 0.55, W - bellDiameter * 0.55);
      const y = clamp(cyW + Math.sin(a) * orbitRadius * 0.92, 115, H - bellDiameter * 0.55);
      // Tangent heading along the elliptical orbit
      const tx = -Math.sin(a) * aspectX * seed.dir;
      const ty = Math.cos(a) * 0.92 * seed.dir;
      const heading = Math.atan2(ty, tx);
      const backAngle = heading + Math.PI;
      const rightX = -Math.sin(heading);
      const rightY = Math.cos(heading);

      const oralArms: Float32Array[] = [];
      const oralLens = new Float32Array(bio.oralCount);
      const oralRoots = new Float32Array(bio.oralCount);
      for (let arm = 0; arm < bio.oralCount; arm++) {
        const frac = bio.oralCount === 1 ? 0 : (arm / (bio.oralCount - 1)) * 2 - 1;
        oralRoots[arm] = frac * 0.2;
        const len = bellDiameter * bio.oralLenMul * (1 - Math.abs(frac) * 0.12 + rand(-0.06, 0.08));
        oralLens[arm] = len;
        const nodes = new Float32Array(ORAL_NODES * 2);
        const seg = len / (ORAL_NODES - 1);
        const rx = x + rightX * oralRoots[arm] * bellDiameter;
        const ry = y + rightY * oralRoots[arm] * bellDiameter;
        for (let k = 0; k < ORAL_NODES; k++) {
          const s = k / (ORAL_NODES - 1);
          const sway = Math.sin(s * 4.2 + arm * 1.4) * bellDiameter * 0.08 * s;
          nodes[k * 2] = rx + Math.cos(backAngle) * seg * k + rightX * sway;
          nodes[k * 2 + 1] = ry + Math.sin(backAngle) * seg * k + rightY * sway;
        }
        oralArms.push(nodes);
      }

      const tentacles: Float32Array[] = [];
      const tentacleLens = new Float32Array(bio.tentacleCount);
      const tentacleRoots = new Float32Array(bio.tentacleCount);
      const tentaclePhases = new Float32Array(bio.tentacleCount);
      for (let tIdx = 0; tIdx < bio.tentacleCount; tIdx++) {
        const frac = bio.tentacleCount === 1 ? 0 : (tIdx / (bio.tentacleCount - 1)) * 2 - 1;
        tentacleRoots[tIdx] = frac * 0.46;
        tentaclePhases[tIdx] = rand(0, TAU);
        const alt = tIdx % 2 === 0 ? 1.12 : 0.64;
        const len =
          bellDiameter * bio.tentacleLenMul * alt * (1 - Math.abs(frac) * 0.14 + rand(-0.12, 0.14));
        tentacleLens[tIdx] = len;
        const nodes = new Float32Array(TENTACLE_NODES * 2);
        const seg = len / (TENTACLE_NODES - 1);
        const rx = x + rightX * tentacleRoots[tIdx] * bellDiameter;
        const ry = y + rightY * tentacleRoots[tIdx] * bellDiameter;
        for (let k = 0; k < TENTACLE_NODES; k++) {
          const s = k / (TENTACLE_NODES - 1);
          const sway = Math.sin(s * 5.2 + tentaclePhases[tIdx]) * bellDiameter * 0.11 * s;
          const flare = frac * bio.tentacleFlare * bellDiameter * 0.2 * Math.sin(s * Math.PI * 0.65);
          nodes[k * 2] = rx + Math.cos(backAngle) * seg * k + rightX * (sway + flare);
          nodes[k * 2 + 1] = ry + Math.sin(backAngle) * seg * k + rightY * (sway + flare);
        }
        tentacles.push(nodes);
      }

      this.jellies.push({
        id: i + 1,
        species,
        bellDiameter,
        x,
        y,
        vx: Math.cos(heading) * 18,
        vy: Math.sin(heading) * 18,
        heading,
        turnRate: 0,
        turnBias: 0,
        phi: seed.phi,
        contraction: sampleContraction(seed.phi, bio.tauC, bio.tauR),
        cDot: 0,
        orbitDir: seed.dir,
        orbitRadius,
        wander: 0,
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
        tentaclePhases,
      });
    }
    this.jellies.sort((a, b) => a.depth - b.depth);

    // Seed bioluminescent plankton schools
    const total = clamp(Math.round((W * H) / 4800), 90, 260);
    this.plankton = [];
    while (this.plankton.length < total) {
      const school = randInt(0, 2);
      const count = Math.min(randInt(12, 24), total - this.plankton.length);
      const cx = rand(W * 0.05, W * 0.95);
      const cy = rand(H * 0.08, H * 0.94);
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
    const minSide = Math.min(W, H);
    const cxW = W * 0.5;
    const cyW = H * 0.53;
    const aspectX = (W / minSide) * 0.88;
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

      j.bioPulseAge += dt;
      if (time >= j.nextBioAt) {
        j.bioPulseAge = 0;
        j.bioStartTheta = rand(0, TAU);
        j.nextBioAt = time + rand(3.8, 6.8);
      }

      // 1. Full 360° Reynolds-style orbital steering around the hero calm pool (never stalls on ceiling!)
      let dx = Math.cos(j.heading);
      let dy = Math.sin(j.heading);

      // Gentle unscripted wander
      j.wander = clamp(j.wander + (Math.random() - 0.5) * dt * 1.4, -0.9, 0.9);
      dx += Math.cos(j.heading + j.wander) * 0.32;
      dy += Math.sin(j.heading + j.wander) * 0.32;

      // Smooth elliptical perimeter circulation around the centered hero text
      const rx = (j.x - cxW) / aspectX;
      const ry = (j.y - cyW) / 0.92;
      const r = Math.hypot(rx, ry) || 1;
      const targetR = j.orbitRadius * (1 + 0.14 * Math.sin(time * 0.09 + j.id * 1.7));
      const radial = clamp((targetR - r) / targetR, -1, 1);
      dx += ((-ry / r) * j.orbitDir + (rx / r) * radial * 0.95) * 0.82;
      dy += ((rx / r) * j.orbitDir + (ry / r) * radial * 0.95) * 0.82;

      // Clear elliptical sanctuary in the center for effortless headline legibility
      if (this.clearCentre) {
        const ex = (j.x - cxW) / (W * 0.35 + j.bellDiameter * 0.25);
        const ey = (j.y - H * 0.5) / (H * 0.3 + j.bellDiameter * 0.2);
        const e2 = ex * ex + ey * ey;
        if (e2 < 1) {
          const e = Math.sqrt(e2) || 1e-3;
          const push = (1 - e) * 3.8;
          dx += (ex / e) * push;
          dy += (ey / e) * push;
        }
      }

      // Give other jellyfish generous room across all 4 quadrants
      for (const other of jellies) {
        if (other === j) continue;
        const ox = j.x - other.x;
        const oy = j.y - other.y;
        const d = Math.hypot(ox, oy);
        const range = (j.bellDiameter + other.bellDiameter) * 1.15;
        if (d < range && d > 1e-3) {
          const w = (1 - d / range) * 3.2;
          dx += (ox / d) * w;
          dy += (oy / d) * w;
        }
      }

      // Soft viewport containment (especially respecting the 64px top navbar so bells never clip it!)
      const topInset = 98 + j.bellDiameter * bio.bellAspect * 0.45;
      const botInset = j.bellDiameter * 0.52;
      const sideInset = j.bellDiameter * 0.46;
      const band = j.bellDiameter * 0.85;
      if (j.y < topInset + band) {
        dy += clamp((topInset + band - j.y) / band, 0, 1.5) * 3.2;
      } else if (j.y > H - botInset - band) {
        dy -= clamp((j.y - (H - botInset - band)) / band, 0, 1.5) * 2.8;
      }
      if (j.x < sideInset + band) {
        dx += clamp((sideInset + band - j.x) / band, 0, 1.5) * 3.0;
      } else if (j.x > W - sideInset - band) {
        dx -= clamp((j.x - (W - sideInset - band)) / band, 0, 1.5) * 3.0;
      }

      // Pointer repulsion
      if (this.pointer.active) {
        const px = j.x - this.pointer.x;
        const py = j.y - this.pointer.y;
        const pd = Math.hypot(px, py);
        const pr = j.bellDiameter * 1.2 + 70;
        if (pd < pr && pd > 1e-3) {
          const w = (1 - pd / pr) * 2.4;
          dx += (px / pd) * w;
          dy += (py / pd) * w;
        }
      }

      // Smooth skidding turn driven by asymmetric contraction during active pulses
      const desiredHeading = Math.atan2(dy, dx);
      const err = angleDiff(j.heading, desiredHeading);
      const posDot = Math.max(0, cDot);
      const negDot = Math.min(0, cDot);
      const turnAuthority = 0.42 + 0.58 * clamp(posDot * 0.65 + c * 0.5, 0, 1);
      const maxTurn = 0.85 * turnAuthority * dt;
      const turned = clamp(err, -maxTurn, maxTurn);
      j.heading += turned;
      j.turnRate += (turned / dt - j.turnRate) * Math.min(1, dt * 3.5);
      j.turnBias = clamp(err * 0.35, -0.22, 0.22);

      // 2. Asymmetric propulsion thrust along 360° heading + Passive Energy Recapture (PER) coast
      const tauP = Math.max(0, 1 - (bio.tauC + bio.tauR));
      const phiPer = (bio.tauC + bio.tauR + 0.3 * tauP) % 1;
      const dPer = wrappedDelta(j.phi, phiPer);
      const perBoost = bio.kPer * Math.exp(-(dPer * dPer) / (2 * 0.11 * 0.11));

      const rawThrust =
        bio.kJet * posDot * posDot * 0.22 + bio.kRow * posDot * 0.72 + 0.08 * negDot + perBoost;
      const thrustMag = (14 + rawThrust * (32 + j.bellDiameter * 0.14)) * (0.78 + 0.22 * j.depth);

      const fwdX = Math.cos(j.heading);
      const fwdY = Math.sin(j.heading);
      const rightX = -fwdY;
      const rightY = fwdX;

      // Shed paired counter-rotating toroidal vortex ring at contraction pinch-off (phi crosses tauC)
      if (prevPhi < bio.tauC && j.phi >= bio.tauC) {
        const rShed = j.bellDiameter * 0.5 * (1 - bio.deltaR * 0.7) * bio.vortexOffset;
        const backDist = j.bellDiameter * 0.2;
        const bx = j.x - fwdX * backDist;
        const by = j.y - fwdY * backDist;
        const jetSpeed = 26 + j.bellDiameter * 0.14;
        const baseGamma = (5200 + j.bellDiameter * 34) * j.depth;

        if (this.vortices.length < 24) {
          this.vortices.push(
            {
              x: bx - rightX * rShed,
              y: by - rightY * rShed,
              vx: -fwdX * jetSpeed - rightX * 5,
              vy: -fwdY * jetSpeed - rightY * 5,
              gamma: -baseGamma,
              age: 0,
              coreR0: j.bellDiameter * 0.14,
            },
            {
              x: bx + rightX * rShed,
              y: by + rightY * rShed,
              vx: -fwdX * jetSpeed + rightX * 5,
              vy: -fwdY * jetSpeed + rightY * 5,
              gamma: baseGamma,
              age: 0,
              coreR0: j.bellDiameter * 0.14,
            },
          );
        }
        this.events.push(
          { kind: "vortex", x: bx - rightX * rShed, y: by - rightY * rShed, strength: 0.72 * j.depth },
          { kind: "vortex", x: bx + rightX * rShed, y: by + rightY * rShed, strength: 0.72 * j.depth },
        );
      }

      // Integrate velocity with ambient ocean current & shape-dependent viscous drag (neutrally buoyant!)
      current(j.x, j.y, time, cur);
      const ax = fwdX * thrustMag + cur.x * 0.12;
      const ay = fwdY * thrustMag + cur.y * 0.12;
      const frontalDrag = 1 - 0.3 * c;
      const speed = Math.hypot(j.vx, j.vy);
      const drag = Math.exp(-dt * (1.28 * frontalDrag + speed * 0.01));
      j.vx = (j.vx + ax * dt) * drag;
      j.vy = (j.vy + ay * dt) * drag;

      j.x = clamp(j.x + j.vx * dt, sideInset * 0.6, W - sideInset * 0.6);
      j.y = clamp(j.y + j.vy * dt, 86, H - botInset * 0.6);

      // 3. Trailing Oral Arms & Gossamer Marginal Tentacles (streaming cleanly behind -heading!)
      const backAngle = j.heading + Math.PI;
      const marginC = sampleContraction(j.phi - bio.phaseLagBell - bio.phaseLagSkirt * 0.2, bio.tauC, bio.tauR);
      const rEff = j.bellDiameter * 0.5 * (1 - bio.deltaR * marginC);
      // Blend backward axis with actual fluid wake (-velocity) + tiny organic gravity sag (+4 down)
      const trailAngle = Math.atan2(
        Math.sin(backAngle) * 34 - j.vy * 0.55 + 4,
        Math.cos(backAngle) * 34 - j.vx * 0.55,
      );

      // Central frilled silk oral arms
      for (let arm = 0; arm < bio.oralCount; arm++) {
        const nodes = j.oralArms[arm];
        const rootU = j.oralRoots[arm] * j.bellDiameter * (1 - bio.deltaR * 0.45 * marginC);
        nodes[0] = j.x + rightX * rootU;
        nodes[1] = j.y + rightY * rootU;

        const seg = j.oralLens[arm] / (ORAL_NODES - 1);
        const maxBend = 0.24;
        let prevAng = backAngle + j.oralRoots[arm] * 0.35;

        for (let k = 1; k < ORAL_NODES; k++) {
          const s = k / (ORAL_NODES - 1);
          const px = nodes[(k - 1) * 2];
          const py = nodes[(k - 1) * 2 + 1];
          const wave = Math.sin(j.phi * TAU - s * 4.2 + arm * 1.65) * (0.12 + s * 0.24);
          const natural = trailAngle + j.oralRoots[arm] * 0.22 + wave;

          let ang = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
          ang += angleDiff(ang, natural) * Math.min(1, dt * (2.4 + s * 1.1));
          ang = prevAng + clamp(angleDiff(prevAng, ang), -maxBend, maxBend);

          nodes[k * 2] = px + Math.cos(ang) * seg;
          nodes[k * 2 + 1] = py + Math.sin(ang) * seg;
          prevAng = ang;
        }
      }

      // Hair-thin marginal tentacles (independent phases so they ribbon organically instead of combing!)
      for (let tIdx = 0; tIdx < bio.tentacleCount; tIdx++) {
        const nodes = j.tentacles[tIdx];
        const frac = bio.tentacleCount === 1 ? 0 : (tIdx / (bio.tentacleCount - 1)) * 2 - 1;
        const theta = frac * Math.PI * 0.48;
        const rimU = Math.sin(theta) * rEff;
        const rimBack = Math.cos(theta) * rEff * Math.sin(bio.viewTilt) * 0.65;
        nodes[0] = j.x + rightX * rimU + Math.cos(backAngle) * rimBack;
        nodes[1] = j.y + rightY * rimU + Math.sin(backAngle) * rimBack;

        const retract = j.species === "helmet" ? 1 - 0.16 * c : 1;
        const seg = (j.tentacleLens[tIdx] * retract) / (TENTACLE_NODES - 1);
        const maxBend = j.species === "helmet" ? 0.22 : 0.34;
        const strandPhase = j.tentaclePhases[tIdx];
        let prevAng = backAngle + frac * bio.tentacleFlare;

        for (let k = 1; k < TENTACLE_NODES; k++) {
          const s = k / (TENTACLE_NODES - 1);
          const px = nodes[(k - 1) * 2];
          const py = nodes[(k - 1) * 2 + 1];

          this.sampleVortexVelocity(nodes[k * 2], nodes[k * 2 + 1], vort);
          const vortCross = (vort.x * -Math.sin(backAngle) + vort.y * Math.cos(backAngle)) * 0.0045;
          const wave =
            Math.sin(j.phi * TAU * 0.9 - s * 5.4 + strandPhase) * (0.16 + s * 0.38) +
            Math.sin(time * 0.7 + s * 3.1 + strandPhase * 1.7) * 0.12 * s;
          const flareCurve = frac * bio.tentacleFlare * (1 - s * 0.68);
          const natural = trailAngle + flareCurve + wave + clamp(vortCross, -0.35, 0.35);

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
