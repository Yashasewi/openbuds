export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function angleDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

const K1 = 1 / 250;
const K2 = 1 / 300;
const K3 = 1 / 185;

/** Divergence-free acoustic drift field. */
function airDrift(x: number, y: number, t: number, out: { x: number; y: number }) {
  const a = x * K1 + t * 0.08;
  const b = y * K2 - t * 0.06;
  const c = (x + y) * K3 + t * 0.12;
  out.x = (-K2 * Math.sin(a) * Math.sin(b) + 0.5 * K3 * Math.cos(c)) * 3200;
  out.y = (-K1 * Math.cos(a) * Math.cos(b) - 0.5 * K3 * Math.cos(c)) * 3200;
}

export const RIBBON_NODES = 22;

export interface SoundGrain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  band: number;
  energy: number;
  turn: number;
  depth: number;
}

export interface WaveRibbon {
  id: number;
  nodes: Float32Array;
  heading: number;
  speed: number;
  phase: number;
  freq: number;
  length: number;
  orbitRadius: number;
  orbitDir: 1 | -1;
  wander: number;
  depth: number;
}

export interface BudRig {
  id: number;
  side: -1 | 1;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  scale: number;
  yaw: number;
  pitch: number;
  roll: number;
  shieldRadius: number;
  phase: number;
}

export interface PulseEvent {
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export class AcousticWorld {
  width = 0;
  height = 0;
  time = 0;
  grains: SoundGrain[] = [];
  ribbons: WaveRibbon[] = [];
  buds: BudRig[] = [];
  pulses: PulseEvent[] = [];
  pointer = { x: 0, y: 0, active: false };

  private perception = 56;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketNext = new Int32Array(0);
  private tmp = { x: 0, y: 0 };

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.perception = Math.max(cellH * 3, cellW * 5);

    this.layoutBuds();

    if (first || this.grains.length === 0) {
      this.seed();
      return;
    }
    for (const g of this.grains) {
      g.x = clamp(g.x, 0, width);
      g.y = clamp(g.y, 0, height);
    }
  }

  private layoutBuds() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const scale = clamp(minSide * 0.25, 125, 225);
    const spreadX = W < 760 ? W * 0.31 : W * 0.34;

    if (this.buds.length === 0) {
      this.buds = [
        {
          id: 1,
          side: -1,
          x: W * 0.5 - spreadX,
          y: H * 0.47,
          baseX: W * 0.5 - spreadX,
          baseY: H * 0.47,
          scale,
          yaw: -0.52,
          pitch: 0.14,
          roll: -0.16,
          shieldRadius: scale * 0.86,
          phase: 0.4,
        },
        {
          id: 2,
          side: 1,
          x: W * 0.5 + spreadX,
          y: H * 0.53,
          baseX: W * 0.5 + spreadX,
          baseY: H * 0.53,
          scale,
          yaw: 0.52,
          pitch: -0.1,
          roll: 0.16,
          shieldRadius: scale * 0.86,
          phase: 2.5,
        },
      ];
    } else {
      this.buds[0].baseX = W * 0.5 - spreadX;
      this.buds[0].baseY = H * 0.47;
      this.buds[0].scale = scale;
      this.buds[0].shieldRadius = scale * 0.86;
      this.buds[1].baseX = W * 0.5 + spreadX;
      this.buds[1].baseY = H * 0.53;
      this.buds[1].scale = scale;
      this.buds[1].shieldRadius = scale * 0.86;
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);

    // Three harmonic wave ribbons orbiting the outer soundstage
    this.ribbons = [];
    const ribbonSpecs = [
      { lengthScale: 0.46, freq: 5.4, depth: 0.95, dir: 1 as const },
      { lengthScale: 0.38, freq: 6.4, depth: 0.78, dir: -1 as const },
      { lengthScale: 0.34, freq: 4.8, depth: 0.66, dir: 1 as const },
    ];
    for (let i = 0; i < ribbonSpecs.length; i++) {
      const spec = ribbonSpecs[i];
      const length = clamp(minSide * spec.lengthScale, 150, 380);
      const orbitRadius = minSide * (0.31 + i * 0.05);
      const a = (i / ribbonSpecs.length) * TAU + 0.8;
      const hx = W * 0.5 + Math.cos(a) * orbitRadius * (W / minSide) * 0.82;
      const hy = H * 0.5 + Math.sin(a) * orbitRadius;
      const heading = a + (spec.dir * Math.PI) / 2;
      const nodes = new Float32Array(RIBBON_NODES * 2);
      const seg = length / (RIBBON_NODES - 1);
      for (let n = 0; n < RIBBON_NODES; n++) {
        nodes[n * 2] = hx - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = hy - Math.sin(heading) * seg * n;
      }
      this.ribbons.push({
        id: i + 10,
        nodes,
        heading,
        speed: 38 + i * 6,
        phase: rand(0, TAU),
        freq: spec.freq,
        length,
        orbitRadius,
        orbitDir: spec.dir,
        wander: 0,
        depth: spec.depth,
      });
    }

    // Ambient sound grains in acoustic streams
    const total = clamp(Math.round((W * H) / 4800), 90, 290);
    this.grains = [];
    for (let i = 0; i < total; i++) {
      const band = i % 3;
      const dir = (band === 0 ? 0 : band === 1 ? Math.PI : rand(0, TAU)) + rand(-0.4, 0.4);
      const cruise = 34 + band * 9;
      this.grains.push({
        x: rand(W * 0.04, W * 0.96),
        y: rand(H * 0.06, H * 0.94),
        vx: Math.cos(dir) * cruise,
        vy: Math.sin(dir) * cruise,
        band,
        energy: 0,
        turn: 0,
        depth: rand(0.55, 1),
      });
    }
    this.bucketNext = new Int32Array(this.grains.length);
  }

  triggerPulse(x: number, y: number) {
    this.pulses.push({ x, y, radius: 7, strength: 1.45 });
    const blast = 230;
    for (const g of this.grains) {
      const dx = g.x - x;
      const dy = g.y - y;
      const d = Math.hypot(dx, dy);
      if (d > blast || d < 1e-3) continue;
      const k = (1 - d / blast) * 240;
      g.vx += (dx / d) * k;
      g.vy += (dy / d) * k;
      g.energy = 1;
    }
  }

  step(dt: number) {
    this.time += dt;
    this.stepBuds();
    this.rebuildHash();
    this.stepGrains(dt);
    this.stepRibbons(dt);
  }

  private stepBuds() {
    const t = this.time;
    const minSide = Math.min(this.width, this.height);
    for (const b of this.buds) {
      const driftX = Math.cos(t * 0.32 + b.phase) * minSide * 0.035;
      const driftY = Math.sin(t * 0.44 + b.phase) * minSide * 0.055;
      b.x = b.baseX + driftX;
      b.y = b.baseY + driftY;
      // Gentle 3D orientation sweep around an iconic 3/4 profile angle facing inward
      b.yaw = b.side * -0.46 + Math.sin(t * 0.38 + b.phase) * 0.38;
      b.pitch = 0.08 * b.side + Math.cos(t * 0.31 + b.phase) * 0.2;
      b.roll = b.side * -0.15 + Math.sin(t * 0.27 + b.phase * 1.3) * 0.12;
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
    if (this.bucketNext.length !== this.grains.length) {
      this.bucketNext = new Int32Array(this.grains.length);
    }
    for (let i = 0; i < this.grains.length; i++) {
      const g = this.grains[i];
      const c = clamp(Math.floor(g.x / size) + 2, 0, this.bucketCols - 1);
      const r = clamp(Math.floor(g.y / size) + 2, 0, this.bucketRows - 1);
      const b = r * this.bucketCols + c;
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
    }
  }

  private stepGrains(dt: number) {
    const { grains, buds, ribbons, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const decay = Math.exp(-dt * 0.85);

    for (let i = 0; i < grains.length; i++) {
      const g = grains[i];
      g.energy *= decay;

      const speed = Math.hypot(g.vx, g.vy) || 1;
      const hx = g.vx / speed;
      const hy = g.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let count = 0;

      const bc = clamp(Math.floor(g.x / R) + 2, 0, cols - 1);
      const br = clamp(Math.floor(g.y / R) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = grains[j];
              const dx = o.x - g.x;
              const dy = o.y - g.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                if (d < 22) {
                  const k = (22 - d) / d;
                  sx -= dx * k;
                  sy -= dy * k;
                }
                if (o.band === g.band) {
                  avx += o.vx;
                  avy += o.vy;
                  cx += dx;
                  cy += dy;
                  count++;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * 22;
      ay += sy * 22;
      if (count > 0) {
        ax += (avx / count - g.vx) * 2.1 + (cx / count) * 0.7;
        ay += (avy / count - g.vy) * 2.1 + (cy / count) * 0.7;
      }

      // Active Noise Cancellation shield around each orbiting OnePlus Bud 4:
      // ambient sound grains part tangentially around the quiet sanctuary.
      for (const b of buds) {
        const dx = g.x - b.x;
        const dy = g.y - b.y;
        const d = Math.hypot(dx, dy);
        const outer = b.shieldRadius * 1.18;
        if (d < outer && d > 1e-3) {
          const w = (1 - d / outer) ** 2;
          const nx = dx / d;
          const ny = dy / d;
          const spin = nx * hy - ny * hx >= 0 ? 1 : -1;
          ax += (nx * 0.85 - ny * spin * 0.95) * 1050 * w;
          ay += (ny * 0.85 + nx * spin * 0.95) * 1050 * w;
          g.energy = Math.max(g.energy, Math.sqrt(w));
        }
      }

      // Harmonic wave ribbons sweep nearby grains along their crest
      for (const rb of ribbons) {
        const rx = rb.nodes[0];
        const ry = rb.nodes[1];
        const dx = g.x - rx;
        const dy = g.y - ry;
        const d = Math.hypot(dx, dy);
        if (d < 110 && d > 1e-3) {
          const w = 1 - d / 110;
          ax += (dx / d) * 320 * w;
          ay += (dy / d) * 320 * w;
          g.energy = Math.max(g.energy, w * 0.7);
        }
      }

      if (pointer.active) {
        const dx = g.x - pointer.x;
        const dy = g.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < 135 && d > 1e-3) {
          const w = (1 - d / 135) ** 2;
          ax += (dx / d) * 980 * w;
          ay += (dy / d) * 980 * w;
          g.energy = Math.max(g.energy, Math.sqrt(w) * 0.9);
        }
      }

      // Soft viewport margins
      const m = 36;
      if (g.x < m) ax += (m - g.x) * 7;
      else if (g.x > W - m) ax -= (g.x - (W - m)) * 7;
      if (g.y < m) ay += (m - g.y) * 7;
      else if (g.y > H - m) ay -= (g.y - (H - m)) * 7;

      airDrift(g.x, g.y, time, cur);
      ax += cur.x * 0.48 + (Math.random() - 0.5) * 32;
      ay += cur.y * 0.48 + (Math.random() - 0.5) * 32 - g.vy * 0.85 * (1 - 0.6 * g.energy);

      const cruise = (36 + g.band * 8) * (1 + g.energy * 1.1);
      ax += (cruise - speed) * hx * 1.5;
      ay += (cruise - speed) * hy * 1.5;

      const before = Math.atan2(g.vy, g.vx);
      g.vx += ax * dt;
      g.vy += ay * dt;
      const maxS = 78 * (1 + g.energy * 1.4);
      const ns = Math.hypot(g.vx, g.vy);
      if (ns > maxS) {
        g.vx *= maxS / ns;
        g.vy *= maxS / ns;
      } else if (ns < 16 && ns > 1e-3) {
        g.vx *= 16 / ns;
        g.vy *= 16 / ns;
      }

      g.turn += (angleDiff(before, Math.atan2(g.vy, g.vx)) / dt - g.turn) * Math.min(1, dt * 8);
      g.x = clamp(g.x + g.vx * dt, -40, W + 40);
      g.y = clamp(g.y + g.vy * dt, -40, H + 40);
    }
  }

  private stepRibbons(dt: number) {
    const { ribbons, buds, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    const cxW = W * 0.5;
    const cyW = H * 0.5;

    for (const rb of ribbons) {
      const nodes = rb.nodes;
      const hx = nodes[0];
      const hy = nodes[1];

      let dx = Math.cos(rb.heading);
      let dy = Math.sin(rb.heading);

      rb.wander = clamp(rb.wander + (Math.random() - 0.5) * dt * 2.8, -1.0, 1.0);
      dx += Math.cos(rb.heading + rb.wander) * 0.4;
      dy += Math.sin(rb.heading + rb.wander) * 0.4;

      // Orbit gently around the open hero center
      const rx = (hx - cxW) / (W / minSide);
      const ry = hy - cyW;
      const r = Math.hypot(rx, ry) || 1;
      const targetR = rb.orbitRadius * (1 + 0.14 * Math.sin(time * 0.08 + rb.id));
      const radial = clamp((targetR - r) / targetR, -1, 1);
      dx += ((-ry / r) * rb.orbitDir + (rx / r) * radial * 0.95) * 0.65;
      dy += ((rx / r) * rb.orbitDir + (ry / r) * radial * 0.95) * 0.65;

      // Keep clear of the hero copy ellipse
      const ex = (hx - cxW) / (W * 0.3);
      const ey = (hy - cyW) / (H * 0.23);
      const e2 = ex * ex + ey * ey;
      if (e2 < 1) {
        const e = Math.sqrt(e2) || 1e-3;
        const w = (1 - e) * 3.0;
        dx += (ex / e) * w;
        dy += (ey / e) * w;
      }

      // Steer smoothly around the two 3D earbuds
      for (const b of buds) {
        const bx = hx - b.x;
        const by = hy - b.y;
        const bd = Math.hypot(bx, by);
        const avoid = b.shieldRadius * 1.05;
        if (bd < avoid && bd > 1e-3) {
          const w = (1 - bd / avoid) * 2.6;
          dx += (bx / bd) * w;
          dy += (by / bd) * w;
        }
      }

      const over = Math.max(-hx + 20, hx - (W - 20), -hy + 20, hy - (H - 20));
      if (over > 0) {
        const w = clamp(over / 120, 0, 1) * 3.2;
        const toX = cxW - hx;
        const toY = cyW - hy;
        const d = Math.hypot(toX, toY) || 1;
        dx += (toX / d) * w;
        dy += (toY / d) * w;
      }

      const desired = Math.atan2(dy, dx);
      const maxTurn = 1.15 * dt;
      rb.heading += clamp(angleDiff(rb.heading, desired), -maxTurn, maxTurn);
      rb.phase += dt * 4.4;

      nodes[0] += Math.cos(rb.heading) * rb.speed * dt;
      nodes[1] += Math.sin(rb.heading) * rb.speed * dt;

      const seg = rb.length / (RIBBON_NODES - 1);
      let prevAngle = rb.heading + Math.PI;
      for (let k = 1; k < RIBBON_NODES; k++) {
        const px = nodes[(k - 1) * 2];
        const py = nodes[(k - 1) * 2 + 1];
        let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
        angle = prevAngle + clamp(angleDiff(prevAngle, angle), -0.17, 0.17);
        nodes[k * 2] = px + Math.cos(angle) * seg;
        nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
        prevAngle = angle;
      }
    }
  }
}
