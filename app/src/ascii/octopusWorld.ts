/**
 * Artificial-life acoustic ocean for OpenBuds:
 *
 * - Sculpted Octopuses (8 arms = 1 musical octave) with plump pulsing mantles
 *   and 8 widely splayed, curling follow-the-leader tentacles gliding around
 *   a calm center sanctuary reserved for the hero typography.
 * - Swirling schools of harmonic notes & acoustic particles (♪, ♫, ♩, ♬, ~, -)
 *   driven by Reynolds boids physics + divergence-free drift + resonance waves.
 * - Harmonic octave ripples (1× fundamental + 2× overtone rings) triggered by
 *   pointer clicks and octopus jet surges.
 */
import { TAU, angleDiff, clamp, current, rand, randInt } from "./math";

export const OCTOPUS_ARMS = 8;
export const ARM_NODES = 14;

export type OctopusSpecies = "pacific" | "indigo" | "glass" | "reef";

export interface OctopusSpec {
  species: OctopusSpecies;
  size: number;
}

const DEFAULT_OCTOPUSES: OctopusSpec[] = [
  { species: "pacific", size: 1.0 },
  { species: "indigo", size: 0.84 },
  { species: "glass", size: 0.76 },
  { species: "reef", size: 0.9 },
];

export interface NoteVoice {
  cruise: number;
  minSpeed: number;
  maxSpeed: number;
  align: number;
  cohesion: number;
  mill: number;
  jitter: number;
  verticalDrag: number;
  spacing: [number, number];
  schoolSize: [number, number];
  glyphs: readonly string[];
}

export const VOICES: NoteVoice[] = [
  {
    cruise: 46,
    minSpeed: 24,
    maxSpeed: 105,
    align: 1.5,
    cohesion: 0.95,
    mill: 10,
    jitter: 24,
    verticalDrag: 0.9,
    spacing: [2.6, 1.5],
    schoolSize: [14, 28],
    glyphs: ["-", "~", "♪", "♫"],
  },
  {
    cruise: 58,
    minSpeed: 30,
    maxSpeed: 122,
    align: 1.8,
    cohesion: 1.2,
    mill: 18,
    jitter: 18,
    verticalDrag: 0.65,
    spacing: [2.2, 1.35],
    schoolSize: [12, 24],
    glyphs: ["·", "-", "♪", "♬"],
  },
  {
    cruise: 34,
    minSpeed: 18,
    maxSpeed: 84,
    align: 1.25,
    cohesion: 0.85,
    mill: 6,
    jitter: 14,
    verticalDrag: 1.15,
    spacing: [3.1, 1.8],
    schoolSize: [8, 16],
    glyphs: ["-", "♩", "♪", "♫"],
  },
];

export interface NoteParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  voice: number;
  resonance: number;
  phase: number;
  turn: number;
  depth: number;
  millDir: 1 | -1;
  pitch: number;
}

export interface Octopus {
  id: number;
  species: OctopusSpecies;
  length: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  phase: number;
  turn: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  depth: number;
  arms: Float32Array[];
  armLens: Float32Array;
  armOffsets: Float32Array;
  nextPulseAt: number;
}

export interface OctaveEvent {
  kind: "splash" | "jet" | "chord";
  x: number;
  y: number;
  strength: number;
}

export interface OctaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  strength: number;
  harmonic: boolean;
}

// Swept-back radial fan angles (relative to tail direction) so all 8 tentacles flow smoothly behind the mantle
const ARM_SPREAD_ANGLES = [-1.45, -1.04, -0.64, -0.22, 0.22, 0.64, 1.04, 1.45];
// Graceful curl bias toward the tips (outer tentacles curl outward in silky S-hooks)
const ARM_CURL_BIAS = [-0.72, -0.48, -0.24, -0.08, 0.08, 0.24, 0.48, 0.72];

const SEP_K = 400;
const ALIGN_K = 1.35;
const COHESION_K = 0.95;
const FLEE_K = 980;
const BLIND_COS = -0.55;

export class AcousticOceanWorld {
  width = 0;
  height = 0;
  time = 0;
  notes: NoteParticle[] = [];
  octopuses: Octopus[] = [];
  events: OctaveEvent[] = [];
  rings: OctaveRing[] = [];
  pointer = { x: 0, y: 0, active: false };

  private specs: OctopusSpec[];
  private clearCentre: boolean;
  private perception = 60;
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 36;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketNext = new Int32Array(0);
  private tmp = { x: 0, y: 0 };

  constructor(specs: OctopusSpec[] = DEFAULT_OCTOPUSES, clearCentre = true) {
    this.specs = specs;
    this.clearCentre = clearCentre;
  }

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.sepX = VOICES.map((v) => v.spacing[0] * cellW);
    this.sepY = VOICES.map((v) => v.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3.1, cellW * 5.5);
    this.foreignSep = cellW * 2.8;

    if (first || this.notes.length === 0) {
      this.seed();
      return;
    }
    for (const n of this.notes) {
      n.x = clamp(n.x, 0, width);
      n.y = clamp(n.y, 0, height);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    // Balanced bold scale so every mantle + all 8 flowing tentacles frame the hero with clear breathing room
    const baseLength = clamp(minSide * 0.43, 210, 390);
    const count = this.specs.length;

    // Deliberate perimeter quadrants around the central hero text
    const seedSlots: [number, number, number][] = [
      [0.14, 0.3, -0.45],
      [0.86, 0.25, 2.65],
      [0.86, 0.76, 2.2],
      [0.16, 0.78, -0.3],
    ];

    this.octopuses = [];
    for (let i = 0; i < count; i++) {
      const { species, size } = this.specs[i];
      const length = baseLength * size;
      const slot = seedSlots[i % seedSlots.length];
      const x = W * (slot[0] + rand(-0.04, 0.04));
      const y = H * (slot[1] + rand(-0.04, 0.04));
      const heading = slot[2] + rand(-0.2, 0.2);
      const orbitDir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const orbitRadius = minSide * rand(0.36, 0.45);

      const arms: Float32Array[] = [];
      const armLens = new Float32Array(OCTOPUS_ARMS);
      const armOffsets = new Float32Array(OCTOPUS_ARMS);

      for (let arm = 0; arm < OCTOPUS_ARMS; arm++) {
        const edgeDist = Math.abs((arm / (OCTOPUS_ARMS - 1)) * 2 - 1);
        // Long sweeping arms (front-lateral arms slightly longer like real octopuses)
        armLens[arm] = length * (0.64 + (1 - Math.abs(edgeDist - 0.35)) * 0.16 + rand(-0.03, 0.03));
        armOffsets[arm] = arm * 0.85 + rand(-0.2, 0.2);

        const nodes = new Float32Array(ARM_NODES * 2);
        const backAngle = heading + Math.PI;
        const spread = ARM_SPREAD_ANGLES[arm];
        const rootAngle = backAngle + spread * 0.72;
        const rootOffset = length * 0.1;
        const rx = x + Math.cos(rootAngle) * rootOffset;
        const ry = y + Math.sin(rootAngle) * rootOffset;
        const seg = armLens[arm] / (ARM_NODES - 1);

        let curX = rx;
        let curY = ry;
        let curAng = backAngle + spread;
        nodes[0] = curX;
        nodes[1] = curY;
        for (let k = 1; k < ARM_NODES; k++) {
          const s = k / (ARM_NODES - 1);
          curAng = backAngle + spread * (1 - s * 0.32) + ARM_CURL_BIAS[arm] * s * s * 1.15;
          curX += Math.cos(curAng) * seg;
          curY += Math.sin(curAng) * seg;
          nodes[k * 2] = curX;
          nodes[k * 2 + 1] = curY;
        }
        arms.push(nodes);
      }

      this.octopuses.push({
        id: i + 1,
        species,
        length,
        x,
        y,
        heading,
        speed: 26,
        phase: rand(0, TAU),
        turn: 0,
        wander: 0,
        orbitDir,
        orbitRadius,
        depth: clamp(size, 0.65, 1),
        arms,
        armLens,
        armOffsets,
        nextPulseAt: rand(0.6, 2.4),
      });
    }
    this.octopuses.sort((a, b) => a.length - b.length);

    // Seed harmonic schools of musical note particles
    const total = clamp(Math.round((W * H) / 4300), 110, 320);
    this.notes = [];
    while (this.notes.length < total) {
      const voice = randInt(0, VOICES.length - 1);
      const v = VOICES[voice];
      const size = Math.min(randInt(v.schoolSize[0], v.schoolSize[1]), total - this.notes.length);
      const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.05, W * 0.95);
      const cy = rand(H * 0.06, H * 0.94);
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.45, 0.45);

      for (let k = 0; k < size; k++) {
        this.notes.push({
          x: cx + rand(-1, 1) * this.sepX[voice] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[voice] * Math.sqrt(size) * 0.65,
          vx: Math.cos(dir) * v.cruise,
          vy: Math.sin(dir) * v.cruise,
          voice,
          resonance: rand(0.05, 0.35),
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir,
          pitch: randInt(0, 15),
        });
      }
    }
    this.bucketNext = new Int32Array(this.notes.length);
  }

  /** Click anywhere: emit a harmonic octave ripple (1× fundamental + 2× overtone) that excites nearby notes. */
  splash(x: number, y: number) {
    this.events.push({ kind: "splash", x, y, strength: 1.5 });
    this.rings.push({
      x,
      y,
      radius: 8,
      maxRadius: Math.min(this.width, this.height) * 0.52,
      speed: 230,
      strength: 1.25,
      harmonic: true,
    });

    const r = 250;
    for (const n of this.notes) {
      const dx = n.x - x;
      const dy = n.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      const k = (1 - d / r) * 230;
      n.vx += (dx / d) * k;
      n.vy += (dy / d) * k;
      n.resonance = 1;
    }
  }

  step(dt: number) {
    this.time += dt;
    this.rebuildHash();
    this.stepNotes(dt);
    this.stepOctopuses(dt);
    this.stepRings(dt);
  }

  private stepRings(dt: number) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      ring.radius += ring.speed * dt;
      if (ring.radius >= ring.maxRadius) {
        this.rings.splice(i, 1);
      }
    }
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
    if (this.bucketNext.length !== this.notes.length) {
      this.bucketNext = new Int32Array(this.notes.length);
    }
    for (let i = 0; i < this.notes.length; i++) {
      const p = this.notes[i];
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

  private stepNotes(dt: number) {
    const { notes, octopuses, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.65);
    const contagion = Math.min(1, dt * 5.5);

    for (let i = 0; i < notes.length; i++) {
      const f = notes[i];
      const sp = VOICES[f.voice];
      const spread = 1 + 1.5 * f.resonance;
      const sepX = this.sepX[f.voice] * spread;
      const sepY = this.sepY[f.voice] * spread;

      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let nCount = 0;
      let neighbourRes = 0;

      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = notes[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.voice === f.voice) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    nCount++;
                  } else if (d < foreignSep) {
                    const k = ((1 - d / foreignSep) / d) * 0.55;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.resonance > neighbourRes) neighbourRes = o.resonance;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * SEP_K;
      ay += sy * SEP_K;
      if (nCount > 0) {
        const alignK = ALIGN_K * sp.align;
        const cohesionK = COHESION_K * sp.cohesion * (1 - 0.7 * f.resonance);
        ax += (avx / nCount - f.vx) * alignK + (cx / nCount) * cohesionK;
        ay += (avy / nCount - f.vy) * alignK + (cy / nCount) * cohesionK;
        if (sp.mill > 0) {
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * f.millDir * sp.mill * (1 - f.resonance);
          ay += (cx / cl) * f.millDir * sp.mill * (1 - f.resonance);
        }
      }

      let excite = 0;
      for (const oct of octopuses) {
        const fearR = oct.length * 0.45 + 45;
        const dx = f.x - oct.x;
        const dy = f.y - oct.y;
        const d = Math.hypot(dx, dy);
        if (d < fearR && d > 1e-3) {
          const w = (1 - d / fearR) ** 2;
          const awayX = dx / d;
          const awayY = dy / d;
          ax += (awayX * 0.65 - awayY * oct.orbitDir * 0.75) * FLEE_K * w;
          ay += (awayY * 0.65 + awayX * oct.orbitDir * 0.75) * FLEE_K * w;
          excite = Math.max(excite, Math.sqrt(w));
        }
      }

      if (pointer.active) {
        const pr = 140;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FLEE_K * w;
          ay += (dy / d) * FLEE_K * w;
          excite = Math.max(excite, Math.sqrt(w) * 0.9);
        }
      }

      let res = Math.max(f.resonance * calmDecay, excite);
      const relayed = neighbourRes * 0.85;
      if (relayed > res) res += (relayed - res) * contagion;
      f.resonance = res;

      const m = 36;
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7;

      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay -= f.vy * sp.verticalDrag * (1 - 0.65 * f.resonance);

      const preferred = sp.cruise * (1 + 1.15 * f.resonance);
      ax += (preferred - speed) * hx * 1.5;
      ay += (preferred - speed) * hy * 1.5;

      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.45 * f.resonance);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (6 + Math.hypot(f.vx, f.vy) * 0.1);
      f.x = clamp(f.x + f.vx * dt, -50, W + 50);
      f.y = clamp(f.y + f.vy * dt, -50, H + 50);
    }
  }

  private stepOctopuses(dt: number) {
    const { octopuses, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    const cxW = W * 0.5;
    const cyW = H * 0.5;

    for (const oct of octopuses) {
      const L = oct.length;

      let dx = Math.cos(oct.heading);
      let dy = Math.sin(oct.heading);
      oct.wander = clamp(oct.wander + (Math.random() - 0.5) * dt * 2.0, -0.85, 0.85);
      dx += Math.cos(oct.heading + oct.wander) * 0.36;
      dy += Math.sin(oct.heading + oct.wander) * 0.36;

      // Lazy elliptical patrol around the hero headline
      const rx = (oct.x - cxW) / (W / minSide);
      const ry = oct.y - cyW;
      const r = Math.hypot(rx, ry) || 1;
      const radius = oct.orbitRadius * (1 + 0.12 * Math.sin(time * 0.08 + oct.id * 1.7));
      const radial = clamp((radius - r) / radius, -1, 1);
      dx += ((-ry / r) * oct.orbitDir + (rx / r) * radial * 0.9) * 0.72;
      dy += ((rx / r) * oct.orbitDir + (ry / r) * radial * 0.9) * 0.72;

      // Generous separation so every octopus's 8 tentacles stay crisp and uncluttered
      for (const other of octopuses) {
        if (other === oct) continue;
        const ox = oct.x - other.x;
        const oy = oct.y - other.y;
        const d = Math.hypot(ox, oy);
        const range = (L + other.length) * 0.62;
        if (d < range && d > 1e-3) {
          const w = (1 - d / range) * 3.8;
          dx += (ox / d) * w;
          dy += (oy / d) * w;
        }
      }

      // Soft elliptical clear zone around the hero text
      if (this.clearCentre) {
        const ex = (oct.x - cxW) / (W * 0.36);
        const ey = (oct.y - cyW) / (H * 0.28);
        const e2 = ex * ex + ey * ey;
        if (e2 < 1) {
          const e = Math.sqrt(e2) || 1e-3;
          const w = (1 - e) * 4.2;
          dx += (ex / e) * w;
          dy += (ey / e) * w;
        }
      }

      // Keep octopuses framed inside the viewport
      const margin = L * 0.14;
      const over = Math.max(margin - oct.x, oct.x - (W - margin), margin - oct.y, oct.y - (H - margin));
      if (over > 0) {
        const w = clamp(over / (L * 0.35), 0, 1) * 4.2;
        const toX = cxW - oct.x;
        const toY = cyW - oct.y;
        const d = Math.hypot(toX, toY) || 1;
        dx += (toX / d) * w;
        dy += (toY / d) * w;
      }

      const desired = Math.atan2(dy, dx);
      const maxTurn = 0.72 * dt;
      const turned = clamp(angleDiff(oct.heading, desired), -maxTurn, maxTurn);
      oct.heading += turned;
      oct.turn += (turned / dt - oct.turn) * Math.min(1, dt * 3);

      // Rhythmic jet propulsion surge + glide
      oct.phase += dt * (1.75 + 0.14 * (oct.id % 3));
      const jetWave = Math.pow(Math.max(0, Math.sin(oct.phase)), 2.0);
      const baseCruise = 20 + L * 0.048;
      const targetSpeed = baseCruise * (0.65 + jetWave * 1.05);
      oct.speed += (targetSpeed - oct.speed) * Math.min(1, dt * 3.0);

      oct.x += Math.cos(oct.heading) * oct.speed * dt;
      oct.y += Math.sin(oct.heading) * oct.speed * dt;

      // Emit shimmering cyan octave pulse during jet propulsion
      if (jetWave > 0.85 && time >= oct.nextPulseAt) {
        oct.nextPulseAt = time + rand(2.2, 4.4);
        const siphonX = oct.x - Math.cos(oct.heading) * L * 0.1;
        const siphonY = oct.y - Math.sin(oct.heading) * L * 0.1;
        this.events.push({ kind: "jet", x: siphonX, y: siphonY, strength: 1.1 });
        if (this.rings.length < 6) {
          this.rings.push({
            x: siphonX,
            y: siphonY,
            radius: L * 0.08,
            maxRadius: L * 0.82,
            speed: 115,
            strength: 0.78,
            harmonic: true,
          });
        }
      }

      // Sculpted radial-splayed 8-tentacle kinematics
      const backAngle = oct.heading + Math.PI;
      const collarDist = L * 0.095;
      const collarRadius = L * 0.11;

      for (let arm = 0; arm < OCTOPUS_ARMS; arm++) {
        const nodes = oct.arms[arm];
        const spread = ARM_SPREAD_ANGLES[arm];
        const curlBias = ARM_CURL_BIAS[arm];
        const rootAngle = backAngle + spread * 0.72;

        // Attach evenly around the muscular base of the head skirt
        nodes[0] = oct.x + Math.cos(rootAngle) * collarDist + Math.cos(rootAngle) * (collarRadius * 0.25);
        nodes[1] = oct.y + Math.sin(rootAngle) * collarDist + Math.sin(rootAngle) * (collarRadius * 0.25);

        const seg = oct.armLens[arm] / (ARM_NODES - 1);
        const maxBend = 0.29;
        // Splay widens smoothly when mantle opens, narrows slightly during forward jet burst
        const flare = 1.04 - jetWave * 0.18;
        let prevAngle = backAngle + spread * flare;

        for (let k = 1; k < ARM_NODES; k++) {
          const s = k / (ARM_NODES - 1);
          const px = nodes[(k - 1) * 2];
          const py = nodes[(k - 1) * 2 + 1];

          // Sinuous traveling wave + graceful curling tip hook
          const wave =
            Math.sin(oct.phase * 1.15 - s * 4.2 + oct.armOffsets[arm]) * (0.16 + s * 0.34);
          const curl = curlBias * s * s * (1.05 + 0.35 * Math.sin(oct.phase * 0.6 + arm));
          const targetAngle = backAngle + spread * flare * (1 - s * 0.34) + wave + curl;

          let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
          angle += angleDiff(angle, targetAngle) * Math.min(1, dt * (3.6 + s * 1.8));
          angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);

          nodes[k * 2] = px + Math.cos(angle) * seg;
          nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
          prevAngle = angle;
        }
      }
    }
  }
}
