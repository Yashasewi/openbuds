import {
  RIBBON_NODES,
  clamp,
  hash3,
  type AcousticWorld,
  type BudRig,
  type WaveRibbon,
} from "./acousticWorld";

const ALPHA_LEVELS = 6;
const GRAIN_ALPHAS = [0.24, 0.38, 0.54, 0.72, 0.9];
const ACCENTS = ["#5ce1ff", "#3150e8", "#33c8cc", "#e0892c", "#b44ae0", "#3cb54a", "#d9c14a"];

const RAMP = ":;t%SX8#@";
const RIBBON_GLYPHS = "~:;t%S";
const RIDGE_GLYPHS = "@8%";
const EDGE_HEAVY = ":;";
const EDGE_LIGHT = ".',`";

const FLAG_BODY = 1;
const FLAG_EDGE = 2;
const FLAG_RIDGE = 3;
const FLAG_TIP = 4;
const FLAG_NOZZLE = 5;
const FLAG_MIC = 6;
const FLAG_RIBBON = 7;

function smin(a: number, b: number, k: number) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function sdCapsuleVertical(px: number, py: number, pz: number, y0: number, y1: number, r: number) {
  const cy = clamp(py, y0, y1);
  return Math.hypot(px, py - cy, pz) - r;
}

function sdEllipsoid(
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number,
): number {
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  if (k0 < 1e-5) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return (k0 * (k0 - 1)) / k1;
}

/**
 * 3D Signed-Distance Function for a sculpted OnePlus Bud 4 in local space:
 *   - rounded acoustic bulb housing
 *   - angled silicone ear-tip dome & nozzle neck
 *   - elongated blade stem with flat capacitive touch facet
 */
function budSDF(lx: number, ly: number, lz: number): number {
  // Acoustic bulb housing
  const head = sdEllipsoid(lx + 0.03, ly + 0.25, lz, 0.29, 0.27, 0.25);

  // Angled nozzle neck + ear-tip dome pointing inward (-x toward center) and slightly forward
  const tipDome = sdEllipsoid(lx + 0.31, ly + 0.27, lz + 0.06, 0.19, 0.2, 0.19);
  const neck = sdEllipsoid(lx + 0.18, ly + 0.26, lz + 0.03, 0.14, 0.14, 0.14);
  const upper = smin(head, smin(neck, tipDome, 0.07), 0.09);

  // Elongated blade stem on the outer edge
  const stem = sdCapsuleVertical(lx - 0.08, ly, lz - 0.01, -0.18, 0.72, 0.105);

  return smin(upper, stem, 0.085);
}

function paintGrid(
  g: CanvasRenderingContext2D,
  W: number,
  H: number,
  cw: number,
  ch: number,
  dpr: number,
) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.strokeStyle = "rgba(255,255,255,0.055)";
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

export class AcousticRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private dpr = 1;
  private cw = 12;
  private ch = 18;
  private cols = 0;
  private rows = 0;
  private fontFamily = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

  private energy = new Float32Array(0);
  private energyTmp = new Float32Array(0);
  private wakeStyles: string[] = [];
  private wakeBuckets: number[][] = Array.from({ length: ALPHA_LEVELS }, () => []);

  private cellFlag = new Uint8Array(0);
  private cellShade = new Float32Array(0);
  private cellKey = new Uint32Array(0);
  private cellDepth = new Float32Array(0);

  private spine = new Float32Array(RIBBON_NODES * 2);
  private arc = new Float32Array(RIBBON_NODES);
  private arcTotal = 1;

  private grainStamp = new Uint32Array(0);
  private frameId = 0;
  private grainBuckets: number[][] = GRAIN_ALPHAS.map(() => []);
  private grainStyles = GRAIN_ALPHAS.map((a) => `rgba(228,238,255,${a})`);

  // Rotation basis for current 3D earbud
  private m00 = 1;
  private m01 = 0;
  private m02 = 0;
  private m10 = 0;
  private m11 = 1;
  private m12 = 0;
  private m20 = 0;
  private m21 = 0;
  private m22 = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.bg = document.createElement("canvas");

    for (let l = 0; l < ALPHA_LEVELS; l++) {
      const a = ((l + 1) / ALPHA_LEVELS) * 0.92;
      this.wakeStyles.push(`rgba(92,225,255,${a.toFixed(3)})`);
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
    this.dpr = dpr;
    this.cw = clamp(Math.round(width / 124), 8, 13);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(width / this.cw);
    this.rows = Math.ceil(height / this.ch);

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;

    const n = this.cols * this.rows;
    if (this.cols !== prevCols || this.rows !== prevRows) {
      this.energy = new Float32Array(n);
      this.energyTmp = new Float32Array(n);
      this.cellFlag = new Uint8Array(n);
      this.cellShade = new Float32Array(n);
      this.cellKey = new Uint32Array(n);
      this.cellDepth = new Float32Array(n);
      this.grainStamp = new Uint32Array(n);
    }

    const g = this.bg.getContext("2d");
    if (g) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#000000";
      g.fillRect(0, 0, width, height);
      paintGrid(g, width, height, this.cw, this.ch, dpr);
    }
  }

  warmStep(world: AcousticWorld, dt: number) {
    if (this.cols === 0) return;
    this.consumePulses(world);
    this.depositWake(world);
    this.diffuse(dt);
  }

  render(world: AcousticWorld, dt: number) {
    const { ctx, dpr, cols, ch } = this;
    if (cols === 0) return;
    const t = world.time;

    this.consumePulses(world);
    this.cellFlag.fill(0);
    this.rasterizeRibbons(world.ribbons);
    this.rasterizeBuds(world.buds, t);
    this.depositWake(world);
    this.diffuse(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.markGrains(world);
    this.drawWakeDots();

    ctx.font = `600 ${Math.round(ch * 0.74)}px ${this.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawGrains();
    this.drawSculptedCells(t);
  }

  private cellIndex(x: number, y: number) {
    const c = Math.floor(x / this.cw);
    const r = Math.floor(y / this.ch);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  private stampRing(x: number, y: number, radius: number, amount: number) {
    const c0 = Math.floor(x / this.cw);
    const r0 = Math.floor(y / this.ch);
    for (let r = r0 - radius; r <= r0 + radius; r++) {
      for (let c = c0 - radius; c <= c0 + radius; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const d = Math.hypot(c - c0, (r - r0) * 1.4);
        if (d > radius + 0.6) continue;
        const i = r * this.cols + c;
        this.energy[i] = Math.min(1.6, this.energy[i] + amount * (1 - d / (radius + 1)));
      }
    }
  }

  private consumePulses(world: AcousticWorld) {
    for (const p of world.pulses) {
      this.stampRing(p.x, p.y, p.radius, p.strength);
    }
    world.pulses.length = 0;
  }

  private depositWake(world: AcousticWorld) {
    const { energy } = this;
    for (const g of world.grains) {
      const i = this.cellIndex(g.x, g.y);
      if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.018 + g.energy * 0.065);
    }
    for (const rb of world.ribbons) {
      for (let k = RIBBON_NODES - 8; k < RIBBON_NODES; k++) {
        const i = this.cellIndex(rb.nodes[k * 2], rb.nodes[k * 2 + 1]);
        if (i >= 0) energy[i] = Math.min(1.6, energy[i] + 0.12);
      }
    }
    // Faint phase-cancellation ring around each 3D earbud
    const ringPhase = world.time * 0.9;
    for (const b of world.buds) {
      const samples = 28;
      for (let s = 0; s < samples; s++) {
        const a = (s / samples) * Math.PI * 2 + ringPhase * b.side;
        const pulse = 1 + 0.04 * Math.sin(a * 3 + world.time * 2);
        const rx = b.x + Math.cos(a) * b.shieldRadius * pulse;
        const ry = b.y + Math.sin(a) * b.shieldRadius * pulse;
        const i = this.cellIndex(rx, ry);
        if (i >= 0) energy[i] = Math.min(1.4, energy[i] + 0.055);
      }
    }
    if (world.pointer.active) {
      this.stampRing(world.pointer.x, world.pointer.y, 2, 0.18);
    }
  }

  private diffuse(dt: number) {
    const { cols, rows, energy, energyTmp: tmp } = this;
    const decay = Math.exp(-dt * 1.55);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const l = c > 0 ? energy[i - 1] : energy[i];
        const rt = c < cols - 1 ? energy[i + 1] : energy[i];
        const u = r > 0 ? energy[i - cols] : energy[i];
        const d = r < rows - 1 ? energy[i + cols] : energy[i];
        tmp[i] = (energy[i] * 4 + l + rt + u + d) * 0.125 * decay;
      }
    }
    this.energy = tmp;
    this.energyTmp = energy;
  }

  // ── Harmonic wave ribbons ───────────────────────────────────────────

  private rasterizeRibbons(ribbons: WaveRibbon[]) {
    const { cellFlag, cellShade, cellKey, cellDepth, spine, arc, cw, ch, cols, rows } = this;

    for (const rb of ribbons) {
      const L = rb.length;
      const N = RIBBON_NODES;
      const n = rb.nodes;

      for (let k = 0; k < N; k++) {
        const s = k / (N - 1);
        const a = Math.max(0, k - 1);
        const b = Math.min(N - 1, k + 1);
        let tx = n[a * 2] - n[b * 2];
        let ty = n[a * 2 + 1] - n[b * 2 + 1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const env = Math.sin(s * Math.PI);
        const off = L * 0.065 * env * Math.sin(rb.phase - s * rb.freq);
        spine[k * 2] = n[k * 2] - ty * off;
        spine[k * 2 + 1] = n[k * 2 + 1] + tx * off;
      }

      arc[0] = 0;
      let minX = spine[0];
      let maxX = spine[0];
      let minY = spine[1];
      let maxY = spine[1];
      for (let k = 1; k < N; k++) {
        const x = spine[k * 2];
        const y = spine[k * 2 + 1];
        arc[k] = arc[k - 1] + Math.hypot(x - spine[(k - 1) * 2], y - spine[(k - 1) * 2 + 1]);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      this.arcTotal = arc[N - 1] || 1;

      const maxHalfW = L * 0.055;
      const c0 = Math.max(0, Math.floor((minX - maxHalfW - cw) / cw));
      const c1 = Math.min(cols - 1, Math.ceil((maxX + maxHalfW + cw) / cw));
      const r0 = Math.max(0, Math.floor((minY - maxHalfW - ch) / ch));
      const r1 = Math.min(rows - 1, Math.ceil((maxY + maxHalfW + ch) / ch));

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const px = c * cw + cw * 0.5;
          const py = r * ch + ch * 0.5;
          let bestD2 = Infinity;
          let bestS = 0;
          for (let k = 0; k < N - 1; k++) {
            const ax = spine[k * 2];
            const ay = spine[k * 2 + 1];
            const sx = spine[(k + 1) * 2] - ax;
            const sy = spine[(k + 1) * 2 + 1] - ay;
            const len2 = sx * sx + sy * sy || 1;
            const u = clamp(((px - ax) * sx + (py - ay) * sy) / len2, 0, 1);
            const d2 = (px - (ax + sx * u)) ** 2 + (py - (ay + sy * u)) ** 2;
            if (d2 < bestD2) {
              bestD2 = d2;
              bestS = (arc[k] + u * Math.sqrt(len2)) / this.arcTotal;
            }
          }
          const env = Math.sin(bestS * Math.PI);
          const halfW = maxHalfW * (0.2 + 0.8 * env);
          const dist = Math.sqrt(bestD2);
          if (dist > halfW + cw * 0.45) continue;

          const i = r * cols + c;
          const key =
            (hash3(Math.round(bestS * 44), Math.round(dist / 5), rb.id) * 4294967295) >>> 0;
          cellKey[i] = key;
          cellDepth[i] = rb.depth;
          if (dist <= halfW * 0.72) {
            cellFlag[i] = FLAG_RIBBON;
            cellShade[i] = clamp((1 - dist / (halfW || 1)) * env, 0.18, 0.92);
          } else {
            cellFlag[i] = FLAG_EDGE;
            cellShade[i] = clamp(1 - (dist - halfW * 0.72) / (cw * 0.65), 0.25, 0.75);
          }
        }
      }
    }
  }

  // ── 3D Raymarched OnePlus Buds 4 ────────────────────────────────────

  private setBudBasis(yaw: number, pitch: number, roll: number) {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);

    // R = Rz(roll) * Rx(pitch) * Ry(yaw); transpose maps world ray -> local bud space
    this.m00 = cy * cr + sy * sp * sr;
    this.m01 = sr * cp;
    this.m02 = -sy * cr + cy * sp * sr;

    this.m10 = -cy * sr + sy * sp * cr;
    this.m11 = cr * cp;
    this.m12 = sy * sr + cy * sp * cr;

    this.m20 = sy * cp;
    this.m21 = -sp;
    this.m22 = cy * cp;
  }

  private traceBudRay(
    sx: number,
    sy: number,
    mirror: -1 | 1,
    out: { flag: number; shade: number; lx: number; ly: number; lz: number },
  ): boolean {
    // Bounding circle reject in normalized screen space
    if (sx * sx + sy * sy > 0.76) return false;

    const { m00, m01, m02, m10, m11, m12, m20, m21, m22 } = this;
    let z = -0.68;
    let hit = false;
    let lx = 0;
    let ly = 0;
    let lz = 0;

    for (let step = 0; step < 12; step++) {
      lx = (m00 * sx + m01 * sy + m02 * z) * mirror;
      ly = m10 * sx + m11 * sy + m12 * z;
      lz = m20 * sx + m21 * sy + m22 * z;
      const d = budSDF(lx, ly, lz);
      if (d < 0.008) {
        hit = true;
        break;
      }
      z += Math.max(d, 0.02);
      if (z > 0.68) break;
    }

    if (!hit) return false;

    // Tetrahedron 3D surface normal in local space
    const eps = 0.008;
    const d1 = budSDF(lx + eps, ly - eps, lz - eps);
    const d2 = budSDF(lx - eps, ly - eps, lz + eps);
    const d3 = budSDF(lx - eps, ly + eps, lz - eps);
    const d4 = budSDF(lx + eps, ly + eps, lz + eps);
    let nx = d1 - d2 - d3 + d4;
    let ny = -d1 - d2 + d3 + d4;
    let nz = -d1 + d2 - d3 + d4;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;

    // Transform local normal back to view space for consistent top-left studio lighting
    const lnx = nx * mirror;
    const vnx = m00 * lnx + m10 * ny + m20 * nz;
    const vny = m01 * lnx + m11 * ny + m21 * nz;
    const vnz = m02 * lnx + m12 * ny + m22 * nz;

    const keyLight = Math.max(0, vnx * -0.52 + vny * -0.62 + vnz * -0.58);
    const rimLight = Math.max(0, vnx * 0.58 + vny * 0.22 - vnz * 0.25) * 0.35;
    const shade = clamp(0.14 + keyLight * 0.74 + rimLight, 0.08, 0.98);

    out.lx = lx;
    out.ly = ly;
    out.lz = lz;
    out.shade = shade;

    // Material zones on the 3D OnePlus Bud 4
    const boreDist = Math.hypot(lx + 0.48, ly + 0.27, lz + 0.06);
    if (boreDist < 0.085) {
      out.flag = FLAG_NOZZLE;
      out.shade = 0.9;
      return true;
    }
    if (lx < -0.22 && ly < -0.06) {
      out.flag = FLAG_TIP;
      return true;
    }
    // Feed-forward ANC mic slot on upper outer stem
    if (Math.abs(lx - 0.17) < 0.045 && Math.abs(ly - 0.04) < 0.06 && Math.abs(lz) < 0.06) {
      out.flag = FLAG_MIC;
      out.shade = 0.16;
      return true;
    }
    // Specular metallic blade highlight along stem & upper dome crest
    if (
      (ly > -0.1 && ly < 0.66 && lx > 0.14 && shade > 0.55) ||
      (shade > 0.84 && keyLight > 0.78)
    ) {
      out.flag = FLAG_RIDGE;
      out.shade = 0.96;
      return true;
    }

    out.flag = FLAG_BODY;
    return true;
  }

  private rasterizeBuds(buds: BudRig[], t: number) {
    const { cellFlag, cellShade, cellKey, cellDepth, cw, ch, cols, rows } = this;
    const hit = { flag: 0, shade: 0, lx: 0, ly: 0, lz: 0 };
    const sub = [
      [-0.24, -0.22],
      [0.24, -0.22],
      [-0.24, 0.22],
      [0.24, 0.22],
    ];

    for (const b of buds) {
      this.setBudBasis(b.yaw, b.pitch, b.roll);
      const R = b.scale;
      const reach = R * 0.88;
      const c0 = Math.max(0, Math.floor((b.x - reach) / cw));
      const c1 = Math.min(cols - 1, Math.ceil((b.x + reach) / cw));
      const r0 = Math.max(0, Math.floor((b.y - reach) / ch));
      const r1 = Math.min(rows - 1, Math.ceil((b.y + reach) / ch));

      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const cx = c * cw + cw * 0.5;
          const cy = r * ch + ch * 0.5;
          const sx = (cx - b.x) / R;
          const sy = (cy - b.y) / R;

          const centerHit = this.traceBudRay(sx, sy, b.side, hit);
          const flag = hit.flag;
          const shade = hit.shade;
          const lx = hit.lx;
          const ly = hit.ly;
          const lz = hit.lz;

          // Early skip well outside silhouette
          if (!centerHit && sx * sx + sy * sy > 0.84) continue;

          let hits = centerHit ? 1 : 0;
          for (let k = 0; k < 4; k++) {
            const ox = sx + (sub[k][0] * cw) / R;
            const oy = sy + (sub[k][1] * ch) / R;
            if (this.traceBudRay(ox, oy, b.side, hit)) hits++;
          }
          if (hits === 0) continue;

          const coverage = hits / 5;
          const i = r * cols + c;
          // 3D object-anchored hash so glyphs ride on the rotating 3D earbud surface!
          const key =
            (hash3(Math.round(lx * 34), Math.round(ly * 34), Math.round(lz * 34) + b.id * 97) *
              4294967295) >>>
            0;

          cellKey[i] = key;
          cellDepth[i] = 1;

          if (centerHit && coverage >= 0.6) {
            cellFlag[i] = flag;
            const flicker = (hash3(c, r, Math.floor(t * 5)) - 0.5) * 0.05;
            cellShade[i] = clamp(shade + flicker, 0, 1);
          } else {
            cellFlag[i] = FLAG_EDGE;
            cellShade[i] = coverage;
          }
        }
      }
    }
  }

  private drawSculptedCells(t: number) {
    const { ctx, cols, rows, cw, ch, cellFlag, cellShade, cellKey, cellDepth } = this;
    const n = cols * rows;

    for (let i = 0; i < n; i++) {
      const flag = cellFlag[i];
      if (!flag) continue;
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = col * cw;
      const y = row * ch;
      const key = cellKey[i];
      const shade = cellShade[i];
      const dim = 0.68 + 0.32 * cellDepth[i];

      const tick = Math.floor(t * 2.3 + (key % 997) / 97);
      const roll = hash3(key, tick, 7);

      if (flag === FLAG_EDGE) {
        const set = shade >= 0.5 ? EDGE_HEAVY : EDGE_LIGHT;
        const g = Math.round((76 + shade * 88) * dim);
        ctx.fillStyle =
          roll < 0.08
            ? ACCENTS[key % ACCENTS.length]
            : `rgb(${Math.round(g * 0.9)},${Math.round(g * 0.97)},${Math.min(255, Math.round(g * 1.1))})`;
        ctx.fillText(set[(key >>> 8) % set.length], x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      if (flag === FLAG_RIBBON) {
        const lvl = Math.round((30 + shade * 95) * dim);
        ctx.fillStyle = `rgb(${Math.round(lvl * 0.7)},${Math.round(lvl * 1.05)},${Math.min(255, Math.round(lvl * 1.45))})`;
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        ctx.fillStyle = roll < 0.18 ? "#5ce1ff" : roll < 0.25 ? "#ffffff" : "#08111a";
        const glyph = RIBBON_GLYPHS[(key >>> 6) % RIBBON_GLYPHS.length];
        ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      if (flag === FLAG_NOZZLE) {
        ctx.fillStyle = "#0b2434";
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        ctx.fillStyle = "#5ce1ff";
        ctx.fillText("o", x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      if (flag === FLAG_TIP) {
        const lvl = Math.round((44 + shade * 115) * dim);
        ctx.fillStyle = `rgb(${Math.round(lvl * 0.56)},${Math.min(255, Math.round(lvl * 1.18))},${Math.min(255, Math.round(lvl * 1.52))})`;
        ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);
        ctx.fillStyle = roll < 0.1 ? "#ffffff" : "#071019";
        const glyph = RAMP[clamp(Math.floor((1 - shade) * 7.5), 0, RAMP.length - 1)];
        ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
        continue;
      }

      let level: number;
      let glyph: string;
      if (flag === FLAG_RIDGE) {
        level = 232;
        glyph = RIDGE_GLYPHS[(key >>> 8) % RIDGE_GLYPHS.length];
      } else if (flag === FLAG_MIC) {
        level = 22;
        glyph = "#%@"[(key >>> 8) % 3];
      } else {
        level = 46 + shade * 166;
        const jitter = ((key >>> 4) % 3) - 1;
        glyph = RAMP[clamp(Math.floor((1 - shade) * 8.99) + jitter, 0, RAMP.length - 1)];
      }
      level *= dim;
      ctx.fillStyle = `rgb(${Math.min(255, Math.round(level * 0.92))},${Math.min(255, Math.round(level * 0.97))},${Math.min(255, Math.round(level * 1.07 + 4))})`;
      ctx.fillRect(x + 1, y + 1, cw - 1, ch - 1);

      if (flag === FLAG_MIC) ctx.fillStyle = "#5ce1ff";
      else if (roll < 0.09) ctx.fillStyle = ACCENTS[key % ACCENTS.length];
      else if (roll < 0.13) ctx.fillStyle = "#ffffff";
      else ctx.fillStyle = shade > 0.55 ? "#0d0f14" : "#1a1e26";
      ctx.fillText(glyph, x + cw * 0.5, y + ch * 0.5 + 1);
    }
  }

  // ── Ambient sound grains & wake dots ────────────────────────────────

  private markGrains(world: AcousticWorld) {
    const { grainStamp, grainBuckets, cellFlag } = this;
    const frame = ++this.frameId;
    for (const b of grainBuckets) b.length = 0;

    for (const g of world.grains) {
      const i = this.cellIndex(g.x, g.y);
      if (i < 0 || grainStamp[i] === frame || cellFlag[i]) continue;
      grainStamp[i] = frame;
      const glint = clamp(Math.abs(g.turn) / 3.2, 0, 1);
      const v = 0.28 + 0.4 * ((g.depth - 0.55) / 0.45) + 0.32 * Math.max(glint, g.energy);
      grainBuckets[clamp(Math.floor(v * GRAIN_ALPHAS.length), 0, GRAIN_ALPHAS.length - 1)].push(i);
    }
  }

  private drawGrains() {
    const { ctx, cw, ch, cols, grainBuckets } = this;
    for (let b = 0; b < grainBuckets.length; b++) {
      const bucket = grainBuckets[b];
      if (!bucket.length) continue;
      ctx.fillStyle = this.grainStyles[b];
      for (const i of bucket) {
        ctx.fillText("-", (i % cols) * cw + cw * 0.5, ((i / cols) | 0) * ch + ch * 0.5 + 1);
      }
    }
  }

  private drawWakeDots() {
    const { ctx, cols, rows, cw, ch, energy, cellFlag, grainStamp, frameId, wakeBuckets } = this;
    for (const b of wakeBuckets) b.length = 0;
    const n = cols * rows;

    for (let i = 0; i < n; i++) {
      const e = energy[i];
      if (e < 0.085 || cellFlag[i] || grainStamp[i] === frameId) continue;
      const level = clamp(Math.floor((e - 0.085) * 8.5), 0, ALPHA_LEVELS - 1);
      wakeBuckets[level].push(i);
    }

    const size = Math.max(2, Math.round(cw * 0.22));
    for (let l = 0; l < ALPHA_LEVELS; l++) {
      const bucket = wakeBuckets[l];
      if (!bucket.length) continue;
      ctx.fillStyle = this.wakeStyles[l];
      const s = l >= 3 ? size + 1 : size;
      for (const i of bucket) {
        const col = i % cols;
        const row = (i / cols) | 0;
        ctx.fillRect(
          Math.round(col * cw + cw * 0.66 - s / 2),
          Math.round(row * ch + ch * 0.64 - s / 2),
          s,
          s,
        );
      }
    }
  }
}
