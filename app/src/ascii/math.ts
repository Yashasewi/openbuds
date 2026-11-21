export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

export const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));

export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Shortest signed angle from a to b, in (-PI, PI]. */
export function angleDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Deterministic integer hash in [0, 1) so surface glyphs and shimmer stay body-anchored. */
export function hash3(x: number, y: number, z: number) {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(z | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Polynomial smooth minimum for organic industrial-design curves. */
export function smin(a: number, b: number, k: number) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

/** Tapered 2D capsule SDF from (ax, ay) with radius r1 to (bx, by) with radius r2. */
export function sdTaperedCapsule(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r1: number,
  r2: number,
) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay || 1), 0, 1);
  const dx = pax - bax * h;
  const dy = pay - bay * h;
  return Math.hypot(dx, dy) - (r1 + (r2 - r1) * h);
}

/** Fast approximate rotated ellipse SDF. */
export function sdEllipse(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle = 0,
) {
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const k0 = Math.hypot(lx / rx, ly / ry);
  if (k0 < 1e-6) return -Math.min(rx, ry);
  const k1 = Math.hypot(lx / (rx * rx), ly / (ry * ry));
  return (k0 * (k0 - 1)) / (k1 || 1);
}

const K1 = 1 / 260;
const K2 = 1 / 310;
const K3 = 1 / 190;
const CURRENT_SCALE = 3100;

/**
 * Divergence-free acoustic drift field: curl of a slowly moving stream function ψ(x, y, t)
 * so musical note clusters flow gracefully without bunching into corners.
 */
export function current(x: number, y: number, t: number, out: { x: number; y: number }) {
  const a = x * K1 + t * 0.065;
  const b = y * K2 - t * 0.048;
  const c = (x + y) * K3 + t * 0.1;
  out.x = (-K2 * Math.sin(a) * Math.sin(b) + 0.5 * K3 * Math.cos(c)) * CURRENT_SCALE;
  out.y = (-K1 * Math.cos(a) * Math.cos(b) - 0.5 * K3 * Math.cos(c)) * CURRENT_SCALE;
  return out;
}
