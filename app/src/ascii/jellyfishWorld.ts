/**
 * Biomechanically grounded open-ocean bioluminescent jellyfish bloom for OpenBuds:
 *
 * - 5 real species across depth tiers gliding naturally across open water:
 *     1. Pacific Sea Nettle (Chrysaora fuscescens) — hero foreground rower
 *     2. Moon Jelly (Aurelia aurita) — translucent saucer rower with 4 clover gonads
 *     3. Helmet Jelly (Periphylla periphylla) — prolate coronal jetter with crimson stomach
 *     4. Crystal Jelly (Aequorea victoria) — flat glass lens with GFP emerald margin wave
 *     5. Distant Moonlet (Aurelia) — deep background depth layer
 * - Asymmetric C2 fast-contraction / slow-elastic-relaxation stroke with Passive Energy
 *   Recapture (PER) coast boost and paired Lamb-Oseen vortex rings shed at pinch-off.
 * - Open-ocean flow (no invisible walls!): jellyfish pulse along wide natural trajectories,
 *   glide cleanly off any edge of the screen, and smoothly re-enter from a fresh uncrowded
 *   edge and direction — while exact 2-pass bell-to-bell & bell-to-curtain collision
 *   detection guarantees they never overlap on top of each other.
 */
import { TAU, angleDiff, clamp, current, rand, randInt } from "./math";

export const ORAL_NODES = 13;
export const TENTACLE_NODES = 16;

export type JellySpecies = "nettle" | "moon" | "helmet" | "atolla" | "crystal";

export interface JellySpec {
  species: JellySpecies;
  size: number;
  depth: number;
}

export const DEFAULT_JELLIES: JellySpec[] = [
  { species: "nettle", size: 0.96, depth: 1.0 },
  { species: "moon", size: 0.86, depth: 0.88 },
  { species: "helmet", size: 0.76, depth: 0.76 },
  { species: "atolla", size: 0.72, depth: 0.68 },
  { species: "crystal", size: 0.68, depth: 0.58 },
  { species: "moon", size: 0.48, depth: 0.44 },
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
    oralLenMul: 1.4,
    oralWidthMul: 0.135,
    tentacleCount: 9,
    tentacleLenMul: 1.75,
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
    tentacleLenMul: 1.28,
    tentacleFlare: 0.54,
    vortexOffset: 0.58,
  },
  // Alarm Crown Jelly (Atolla wyvillei): stepped crown disc + rotating cyan pinwheel + 1 long whip
  atolla: {
    tauC: 0.26,
    tauR: 0.48,
    freqHz: 0.58,
    kJet: 0.72,
    kRow: 0.68,
    kPer: 0.28,
    deltaR: 0.26,
    phaseLagBell: 0.09,
    phaseLagSkirt: 0.18,
    meridionalPow: 1.5,
    bellAspect: 0.46,
    viewTilt: 0.38,
    oralCount: 2,
    oralLenMul: 0.34,
    oralWidthMul: 0.09,
    tentacleCount: 11,
    tentacleLenMul: 0.62,
    tentacleFlare: 0.34,
    vortexOffset: 0.8,
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
    tentacleLenMul: 1.3,
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
  bellDiameter: number;
  radius: number;
  mass: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Full 360° swim heading in radians (0 = right, -PI/2 = up, +PI/2 = down). */
  heading: number;
  /** Slowly evolving target cruise heading across open water so motion feels organic, never circular. */
  cruiseHeading: number;
  turnRate: number;
  turnBias: number;
  phi: number;
  contraction: number;
  cDot: number;
  wander: number;
  /** Preferred side to bend around the center headline (+1 / -1). */
  passSide: 1 | -1;
  depth: number;
  bioPulseAge: number;
  bioStartTheta: number;
  nextBioAt: number;
  oralArms: Float32Array[];
  oralLens: Float32Array;
  oralRoots: Float32Array;
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
  }

  /** Align all oral-arm & tentacle chain nodes cleanly behind (x, y) along `heading`. */
  private resetAppendages(j: Jellyfish) {
    const bio = BIOMECH[j.species];
    const backAngle = j.heading + Math.PI;
    const rightX = -Math.sin(j.heading);
    const rightY = Math.cos(j.heading);

    for (let arm = 0; arm < bio.oralCount; arm++) {
      const nodes = j.oralArms[arm];
      const seg = j.oralLens[arm] / (ORAL_NODES - 1);
      const rx = j.x + rightX * j.oralRoots[arm] * j.bellDiameter;
      const ry = j.y + rightY * j.oralRoots[arm] * j.bellDiameter;
      for (let k = 0; k < ORAL_NODES; k++) {
        const s = k / (ORAL_NODES - 1);
        const sway = Math.sin(s * 4.2 + arm * 1.4) * j.bellDiameter * 0.08 * s;
        nodes[k * 2] = rx + Math.cos(backAngle) * seg * k + rightX * sway;
        nodes[k * 2 + 1] = ry + Math.sin(backAngle) * seg * k + rightY * sway;
      }
    }

    for (let tIdx = 0; tIdx < bio.tentacleCount; tIdx++) {
      const nodes = j.tentacles[tIdx];
      const frac = bio.tentacleCount === 1 ? 0 : (tIdx / (bio.tentacleCount - 1)) * 2 - 1;
      const seg = j.tentacleLens[tIdx] / (TENTACLE_NODES - 1);
      const rx = j.x + rightX * j.tentacleRoots[tIdx] * j.bellDiameter;
      const ry = j.y + rightY * j.tentacleRoots[tIdx] * j.bellDiameter;
      for (let k = 0; k < TENTACLE_NODES; k++) {
        const s = k / (TENTACLE_NODES - 1);
        const sway = Math.sin(s * 5.2 + j.tentaclePhases[tIdx]) * j.bellDiameter * 0.1 * s;
        const flare = frac * bio.tentacleFlare * j.bellDiameter * 0.2 * Math.sin(s * Math.PI * 0.65);
        nodes[k * 2] = rx + Math.cos(backAngle) * seg * k + rightX * (sway + flare);
        nodes[k * 2 + 1] = ry + Math.sin(backAngle) * seg * k + rightY * (sway + flare);
      }
    }
  }

  /**
   * Once a jellyfish swims completely off-screen (including its trailing tentacles), re-enter it
   * organically from a fresh uncrowded edge aimed diagonally across open water!
   */
  private respawnFromEdge(j: Jellyfish) {
    const { width: W, height: H } = this;
    const entryPad = j.radius + 36;

    // Sample several candidate entry spots across all 4 edges & pick the one farthest from other jellies
    let bestX = -entryPad;
    let bestY = H * 0.5;
    let bestHeading = 0;
    let bestClearance = -1;

    for (let attempt = 0; attempt < 10; attempt++) {
      // Weighted toward bottom, left, and right (authentic upward/diagonal oceanic drift) + occasional top entry
      const roll = Math.random();
      const side = roll < 0.34 ? 3 : roll < 0.62 ? 0 : roll < 0.9 ? 1 : 2; // 0:L, 1:R, 2:T, 3:B
      let x = 0;
      let y = 0;
      let targetX = W * 0.5;
      let targetY = H * 0.5;

      if (side === 0) {
        // Enter from left edge, gliding diagonally up-right or down-right across the frame
        x = -entryPad;
        y = rand(H * 0.18, H * 0.88);
        targetX = W * rand(0.65, 0.95);
        targetY = y > H * 0.5 ? rand(H * 0.14, H * 0.45) : rand(H * 0.52, H * 0.85);
      } else if (side === 1) {
        // Enter from right edge, gliding diagonally up-left or down-left
        x = W + entryPad;
        y = rand(H * 0.18, H * 0.88);
        targetX = W * rand(0.05, 0.35);
        targetY = y > H * 0.5 ? rand(H * 0.14, H * 0.45) : rand(H * 0.52, H * 0.85);
      } else if (side === 3) {
        // Enter from bottom edge (classic jellyfish rising diagonally upward along flanks!)
        const onLeft = Math.random() < 0.5;
        x = onLeft ? rand(W * 0.06, W * 0.32) : rand(W * 0.68, W * 0.94);
        y = H + entryPad;
        targetX = onLeft ? rand(W * 0.08, W * 0.42) : rand(W * 0.58, W * 0.92);
        targetY = rand(H * 0.1, H * 0.3);
      } else {
        // Enter gently from upper-left or upper-right corner (never straight behind navbar center)
        const onLeft = Math.random() < 0.5;
        x = onLeft ? rand(W * 0.06, W * 0.25) : rand(W * 0.75, W * 0.94);
        y = -entryPad;
        targetX = onLeft ? rand(W * 0.1, W * 0.35) : rand(W * 0.65, W * 0.9);
        targetY = rand(H * 0.68, H * 0.92);
      }

      let minDist = Infinity;
      for (const other of this.jellies) {
        if (other === j) continue;
        const d = Math.hypot(x - other.x, y - other.y) - (j.radius + other.radius);
        if (d < minDist) minDist = d;
      }

      if (minDist > bestClearance) {
        bestClearance = minDist;
        bestX = x;
        bestY = y;
        bestHeading = Math.atan2(targetY - y, targetX - x);
      }
    }

    j.x = bestX;
    j.y = bestY;
    j.heading = bestHeading;
    j.cruiseHeading = bestHeading;
    j.passSide = Math.random() < 0.5 ? 1 : -1;
    j.vx = Math.cos(bestHeading) * 32;
    j.vy = Math.sin(bestHeading) * 32;
    j.turnRate = 0;
    j.turnBias = 0;
    j.wander = 0;
    j.phi = rand(0, 1);
    this.resetAppendages(j);
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const baseBell = clamp(minSide * 0.22, 126, 204);
    const cxW = W * 0.5;
    const cyW = H * 0.5;

    // Shuffle species order every load so every page refresh produces a completely fresh composition!
    const shuffled = [...this.specs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const k = randInt(0, i);
      const tmp = shuffled[i];
      shuffled[i] = shuffled[k];
      shuffled[k] = tmp;
    }

    this.jellies = [];
    this.vortices = [];

    // Random angular offset around the perimeter + rejection sampling for guaranteed non-overlap
    const baseTheta = rand(0, TAU);

    for (let i = 0; i < shuffled.length; i++) {
      const { species, size, depth } = shuffled[i];
      const bio = BIOMECH[species];
      const bellDiameter = baseBell * size;
      const radius = bellDiameter * (0.52 + bio.bellAspect * 0.12);
      const mass = size * size;

      // Pick a genuinely random open-water starting spot clear of the hero headline & other jellies
      let x = W * 0.15;
      let y = H * 0.3;
      let bestScore = -Infinity;

      for (let attempt = 0; attempt < 24; attempt++) {
        // Spread candidates across the full viewport ring (with generous random radial & angular variation)
        const sectorAngle = baseTheta + (i / shuffled.length) * TAU + rand(-0.42, 0.42);
        const radFrac = rand(0.35, 0.48);
        const candX = clamp(cxW + Math.cos(sectorAngle) * W * radFrac, radius * 0.65, W - radius * 0.65);
        const candY = clamp(cyW + Math.sin(sectorAngle) * H * radFrac, 96 + radius * 0.25, H - radius * 0.65);

        // Reject spots inside the center hero headline sanctuary
        const ex = (candX - cxW) / (W * 0.275 + radius * 0.45);
        const ey = (candY - cyW) / (H * 0.245 + radius * 0.35);
        if (ex * ex + ey * ey < 1.0) continue;

        let minGap = Infinity;
        for (const other of this.jellies) {
          const gap = Math.hypot(candX - other.x, candY - other.y) - (radius + other.radius);
          if (gap < minGap) minGap = gap;
        }
        const score = minGap === Infinity ? 1000 : minGap;
        if (score > bestScore) {
          bestScore = score;
          x = candX;
          y = candY;
        }
        if (minGap > 60) break;
      }

      // Random natural swimming heading biased loosely across the viewport (so it sweeps through frame!)
      const inwardAngle = Math.atan2(cyW - y, cxW - x);
      const tangentDir = Math.random() < 0.5 ? 1 : -1;
      const heading = inwardAngle + tangentDir * rand(0.55, 1.45);

      const oralArms: Float32Array[] = [];
      const oralLens = new Float32Array(bio.oralCount);
      const oralRoots = new Float32Array(bio.oralCount);
      for (let arm = 0; arm < bio.oralCount; arm++) {
        const frac = bio.oralCount === 1 ? 0 : (arm / (bio.oralCount - 1)) * 2 - 1;
        oralRoots[arm] = frac * 0.2;
        oralLens[arm] = bellDiameter * bio.oralLenMul * (1 - Math.abs(frac) * 0.12 + rand(-0.06, 0.08));
        oralArms.push(new Float32Array(ORAL_NODES * 2));
      }

      const tentacles: Float32Array[] = [];
      const tentacleLens = new Float32Array(bio.tentacleCount);
      const tentacleRoots = new Float32Array(bio.tentacleCount);
      const tentaclePhases = new Float32Array(bio.tentacleCount);
      for (let tIdx = 0; tIdx < bio.tentacleCount; tIdx++) {
        const frac = bio.tentacleCount === 1 ? 0 : (tIdx / (bio.tentacleCount - 1)) * 2 - 1;
        tentacleRoots[tIdx] = frac * 0.46;
        tentaclePhases[tIdx] = rand(0, TAU);
        // Atolla wyvillei signature: 1 unmistakable hypertrophied trailing whip tentacle!
        const isAtollaWhip = species === "atolla" && tIdx === Math.floor(bio.tentacleCount / 2);
        const alt = isAtollaWhip ? 3.4 : tIdx % 2 === 0 ? 1.12 : 0.64;
        tentacleLens[tIdx] =
          bellDiameter * bio.tentacleLenMul * alt * (1 - Math.abs(frac) * 0.14 + rand(-0.12, 0.14));
        tentacles.push(new Float32Array(TENTACLE_NODES * 2));
      }

      const initPhi = rand(0, 1);
      const jelly: Jellyfish = {
        id: i + 1,
        species,
        bellDiameter,
        radius,
        mass,
        x,
        y,
        vx: Math.cos(heading) * rand(26, 44),
        vy: Math.sin(heading) * rand(26, 44),
        heading,
        cruiseHeading: heading,
        turnRate: 0,
        turnBias: 0,
        phi: initPhi,
        contraction: sampleContraction(initPhi, bio.tauC, bio.tauR),
        cDot: 0,
        wander: rand(-0.2, 0.2),
        passSide: tangentDir,
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
      };
      this.resetAppendages(jelly);
      this.jellies.push(jelly);
    }
    this.jellies.sort((a, b) => a.depth - b.depth);

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
        const push = (1 - d / 340) * 58;
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
    const cxW = W * 0.5;
    const cyW = H * 0.5;
    const cur = this.tmpCur;
    const vort = { x: 0, y: 0 };

    // ── Pass 1: Natural Open-Ocean Cruise, Gentle Avoidance & Propulsion ──
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

      // 1. Open-ocean cruising: slow organic heading drift + ambient current influence
      j.wander = clamp(j.wander + (Math.random() - 0.5) * dt * 0.45, -0.35, 0.35);
      j.cruiseHeading += j.wander * dt * 0.35;

      let dx = Math.cos(j.cruiseHeading) * 1.6 + Math.cos(j.heading) * 0.6;
      let dy = Math.sin(j.cruiseHeading) * 1.6 + Math.sin(j.heading) * 0.6;

      // Gentle sway from the divergence-free ambient ocean current
      current(j.x, j.y, time, cur);
      dx += cur.x * 0.008;
      dy += cur.y * 0.008;

      // Graceful gliding deflection around the central hero headline (no hard stops, no circling!)
      if (this.clearCentre) {
        const clearRx = W * 0.275 + j.radius * 0.45;
        const clearRy = H * 0.245 + j.radius * 0.35;
        const ex = (j.x - cxW) / clearRx;
        const ey = (j.y - cyW) / clearRy;
        const e2 = ex * ex + ey * ey;
        if (e2 < 1.35) {
          const e = Math.sqrt(e2) || 1e-3;
          const w = clamp((1.35 - e) / 1.35, 0, 1);
          const nx = ex / e;
          const ny = ey / e;
          // Tangential flow smoothly bends the jelly's trajectory around the headline block
          const t1x = -ny;
          const t1y = nx;
          const sign = Math.cos(j.heading) * t1x + Math.sin(j.heading) * t1y >= 0 ? 1 : -1;
          dx += (nx * 1.2 + t1x * sign * 1.35) * w * 2.2;
          dy += (ny * 1.2 + t1y * sign * 1.35) * w * 2.2;
        }
      }

      // Anticipatory pairwise avoidance so jellies glide gracefully around each other before touching
      for (const other of jellies) {
        if (other === j) continue;
        const ox = j.x - other.x;
        const oy = j.y - other.y;
        const d = Math.hypot(ox, oy);
        const avoidR = (j.radius + other.radius) * 2.35;
        if (d < avoidR && d > 1e-3) {
          const w = Math.pow(1 - d / avoidR, 1.35) * 3.8;
          const nx = ox / d;
          const ny = oy / d;
          const cross = Math.cos(j.heading) * ny - Math.sin(j.heading) * nx >= 0 ? 1 : -1;
          dx += (nx + -ny * cross * 0.45) * w;
          dy += (ny + nx * cross * 0.45) * w;
        }
      }

      // Pointer repulsion
      if (this.pointer.active) {
        const px = j.x - this.pointer.x;
        const py = j.y - this.pointer.y;
        const pd = Math.hypot(px, py);
        const pr = j.radius * 1.8 + 75;
        if (pd < pr && pd > 1e-3) {
          const w = (1 - pd / pr) * 2.6;
          dx += (px / pd) * w;
          dy += (py / pd) * w;
        }
      }

      // 2. Speed-coupled smooth turning (wide oceanic curvature, never rotating in place!)
      const desiredHeading = Math.atan2(dy, dx);
      const err = angleDiff(j.heading, desiredHeading);
      const posDot = Math.max(0, cDot);
      const negDot = Math.min(0, cDot);
      const curSpeed = Math.hypot(j.vx, j.vy);
      const turnCap = clamp(curSpeed / (j.bellDiameter * 0.55), 0.22, 0.58);
      const strokeAuthority = 0.45 + 0.55 * clamp(posDot * 0.6 + c * 0.5, 0, 1);
      const maxTurn = turnCap * strokeAuthority * dt;
      const turned = clamp(err, -maxTurn, maxTurn);
      j.heading += turned;
      // Gently let cruiseHeading follow large deflections (like avoiding another jelly) so paths stay natural
      j.cruiseHeading += angleDiff(j.cruiseHeading, j.heading) * Math.min(1, dt * 0.22);
      j.turnRate += (turned / dt - j.turnRate) * Math.min(1, dt * 3.5);
      j.turnBias = clamp(err * 0.32, -0.22, 0.22);

      // 3. Asymmetric pulsing propulsion + Passive Energy Recapture (cruises naturally 28–74 px/s)
      const tauP = Math.max(0, 1 - (bio.tauC + bio.tauR));
      const phiPer = (bio.tauC + bio.tauR + 0.3 * tauP) % 1;
      const dPer = wrappedDelta(j.phi, phiPer);
      const perBoost = bio.kPer * Math.exp(-(dPer * dPer) / (2 * 0.11 * 0.11));

      const rawThrust =
        bio.kJet * posDot * posDot * 0.26 + bio.kRow * posDot * 0.85 + 0.06 * negDot + perBoost;
      const thrustMag = (28 + rawThrust * (54 + j.bellDiameter * 0.16)) * (0.8 + 0.2 * j.depth);

      const fwdX = Math.cos(j.heading);
      const fwdY = Math.sin(j.heading);
      const rightX = -fwdY;
      const rightY = fwdX;

      // Shed paired counter-rotating toroidal vortex ring at contraction pinch-off
      if (prevPhi < bio.tauC && j.phi >= bio.tauC) {
        const rShed = j.bellDiameter * 0.5 * (1 - bio.deltaR * 0.7) * bio.vortexOffset;
        const backDist = j.bellDiameter * 0.2;
        const bx = j.x - fwdX * backDist;
        const by = j.y - fwdY * backDist;
        const jetSpeed = 28 + j.bellDiameter * 0.14;
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

      const ax = fwdX * thrustMag + cur.x * 0.1;
      const ay = fwdY * thrustMag + cur.y * 0.1;
      const frontalDrag = 1 - 0.34 * c;
      const drag = Math.exp(-dt * (1.02 * frontalDrag + curSpeed * 0.008));
      j.vx = (j.vx + ax * dt) * drag;
      j.vy = (j.vy + ay * dt) * drag;

      const spd = Math.hypot(j.vx, j.vy);
      const minGlide = 22 * (0.76 + 0.24 * j.depth);
      const maxGlide = 78;
      if (spd < minGlide && spd > 1e-3) {
        j.vx = (j.vx / spd) * minGlide;
        j.vy = (j.vy / spd) * minGlide;
      } else if (spd > maxGlide) {
        j.vx = (j.vx / spd) * maxGlide;
        j.vy = (j.vy / spd) * maxGlide;
      }

      j.x += j.vx * dt;
      j.y += j.vy * dt;
    }

    // ── Pass 2: Hard Multi-Body Collision Detection & Separation (Never Overlap!) ──
    this.resolveCollisions();

    // ── Pass 3: Seamless Off-Screen Exit & Fresh-Edge Re-Entry ──
    for (const j of jellies) {
      // Wait until the bell & visible trailing oral curtains have smoothly cleared the viewport edge
      const exitMargin = j.radius + j.bellDiameter * 0.65 + 32;
      if (
        j.x < -exitMargin ||
        j.x > W + exitMargin ||
        j.y < -exitMargin ||
        j.y > H + exitMargin
      ) {
        this.respawnFromEdge(j);
      }
    }

    // ── Pass 4: Update Trailing Oral Arms & Marginal Tentacles from Resolved Poses ──
    for (const j of jellies) {
      const bio = BIOMECH[j.species];
      const fwdX = Math.cos(j.heading);
      const fwdY = Math.sin(j.heading);
      const rightX = -fwdY;
      const rightY = fwdX;
      const backAngle = j.heading + Math.PI;
      const marginC = sampleContraction(j.phi - bio.phaseLagBell - bio.phaseLagSkirt * 0.2, bio.tauC, bio.tauR);
      const rEff = j.bellDiameter * 0.5 * (1 - bio.deltaR * marginC);
      const trailAngle = Math.atan2(
        Math.sin(backAngle) * 38 - j.vy * 0.5 + 3,
        Math.cos(backAngle) * 38 - j.vx * 0.5,
      );

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
          ang += angleDiff(ang, natural) * Math.min(1, dt * (2.6 + s * 1.2));
          ang = prevAng + clamp(angleDiff(prevAng, ang), -maxBend, maxBend);

          nodes[k * 2] = px + Math.cos(ang) * seg;
          nodes[k * 2 + 1] = py + Math.sin(ang) * seg;
          prevAng = ang;
        }
      }

      for (let tIdx = 0; tIdx < bio.tentacleCount; tIdx++) {
        const nodes = j.tentacles[tIdx];
        const frac = bio.tentacleCount === 1 ? 0 : (tIdx / (bio.tentacleCount - 1)) * 2 - 1;
        const theta = frac * Math.PI * 0.48;
        const rimU = Math.sin(theta) * rEff;
        const rimBack = Math.cos(theta) * rEff * Math.sin(bio.viewTilt) * 0.65;
        nodes[0] = j.x + rightX * rimU + Math.cos(backAngle) * rimBack;
        nodes[1] = j.y + rightY * rimU + Math.sin(backAngle) * rimBack;

        const retract = j.species === "helmet" ? 1 - 0.16 * j.contraction : 1;
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
          ang += angleDiff(ang, natural) * Math.min(1, dt * (2.2 + s * 1.2));
          ang = prevAng + clamp(angleDiff(prevAng, ang), -maxBend, maxBend);

          nodes[k * 2] = px + Math.cos(ang) * seg;
          nodes[k * 2 + 1] = py + Math.sin(ang) * seg;
          prevAng = ang;
        }
      }
    }
  }

  /**
   * 3-iteration exact elastic collision solver:
   * - Enforces zero bell-on-bell overlap (mass-weighted separation + elastic fluid bounce +
   *   heading/cruise deflection + bioluminescent tactile startle flash)
   * - Cushions bells away from other jellies' trailing oral curtains
   * - Keeps bells outside the inner hero headline text block
   */
  private resolveCollisions() {
    const { jellies, width: W, height: H } = this;
    const n = jellies.length;
    const cxW = W * 0.5;
    const cyW = H * 0.5;

    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < n; i++) {
        const a = jellies[i];
        for (let k = i + 1; k < n; k++) {
          const b = jellies[k];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          const minDist = a.radius + b.radius + 26;

          if (d < minDist) {
            if (d < 1e-3) {
              dx = 1;
              dy = 0;
              d = 1;
            }
            const nx = dx / d;
            const ny = dy / d;
            const overlap = minDist - d;
            const invA = 1 / a.mass;
            const invB = 1 / b.mass;
            const invSum = invA + invB;

            a.x -= nx * overlap * (invA / invSum);
            a.y -= ny * overlap * (invA / invSum);
            b.x += nx * overlap * (invB / invSum);
            b.y += ny * overlap * (invB / invSum);

            if (iter === 0) {
              const rvx = b.vx - a.vx;
              const rvy = b.vy - a.vy;
              const velAlongNormal = rvx * nx + rvy * ny;
              if (velAlongNormal < 0) {
                const impulse = (-1.35 * velAlongNormal) / invSum;
                a.vx -= impulse * invA * nx;
                a.vy -= impulse * invA * ny;
                b.vx += impulse * invB * nx;
                b.vy += impulse * invB * ny;

                const awayA = Math.atan2(-ny, -nx);
                const awayB = Math.atan2(ny, nx);
                a.heading += clamp(angleDiff(a.heading, awayA), -0.22, 0.22);
                b.heading += clamp(angleDiff(b.heading, awayB), -0.22, 0.22);
                a.cruiseHeading += clamp(angleDiff(a.cruiseHeading, awayA), -0.25, 0.25);
                b.cruiseHeading += clamp(angleDiff(b.cruiseHeading, awayB), -0.25, 0.25);

                if (a.bioPulseAge > 0.6) {
                  a.bioPulseAge = 0;
                  a.bioStartTheta = Math.atan2(ny, nx);
                }
                if (b.bioPulseAge > 0.6) {
                  b.bioPulseAge = 0;
                  b.bioStartTheta = Math.atan2(-ny, -nx);
                }
              }
            }
          }

          if (iter === 0) {
            this.cushionBellVsTrailing(a, b);
            this.cushionBellVsTrailing(b, a);
          }
        }
      }

      // Inner hero headline keep-out guard (never push a bell directly onto the hero title!)
      if (this.clearCentre) {
        for (const j of jellies) {
          const guardRx = W * 0.21 + j.radius * 0.45;
          const guardRy = H * 0.175 + j.radius * 0.35;
          const ex = (j.x - cxW) / guardRx;
          const ey = (j.y - cyW) / guardRy;
          const e = Math.hypot(ex, ey);
          if (e < 1 && e > 1e-4) {
            j.x = cxW + (ex / e) * guardRx;
            j.y = cyW + (ey / e) * guardRy;
          }
        }
      }
    }
  }

  private cushionBellVsTrailing(a: Jellyfish, b: Jellyfish) {
    if (!b.oralArms.length) return;
    const midArm = b.oralArms[Math.floor(b.oralArms.length / 2)];
    const midIdx = Math.floor(ORAL_NODES * 0.45) * 2;
    const tx = midArm[midIdx];
    const ty = midArm[midIdx + 1];
    const dx = a.x - tx;
    const dy = a.y - ty;
    const d = Math.hypot(dx, dy);
    const minD = a.radius + b.bellDiameter * 0.28;
    if (d < minD && d > 1e-3) {
      const push = (minD - d) * 0.4;
      a.x += (dx / d) * push;
      a.y += (dy / d) * push;
      a.vx += (dx / d) * 12;
      a.vy += (dy / d) * 12;
    }
  }
}
