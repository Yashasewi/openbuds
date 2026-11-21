import { clamp, sdTaperedCapsule, smin } from "./math";

export const FLAG_NONE = 0;
export const FLAG_CHROME = 1;
export const FLAG_EDGE = 2;
export const FLAG_RIM = 3;
export const FLAG_TIP_GLOW = 4;

export interface ForkPose {
  /** Center of U-saddle pivot in CSS pixels. */
  cx: number;
  cy: number;
  /** Characteristic scale in CSS pixels (total height ~ 1.80 * scale). */
  scale: number;
  /** Subtle harmonic tilt rotation in radians (near-vertical cathedral poise). */
  rot: number;
  /** 0..1 active vibration energy (drives cantilever tine flex & cyan tip rim glow). */
  energy: number;
  /** Current signed instantaneous tine flex (-1..+1). */
  flex: number;
  /** Depth brightness factor (0.7 distant -> 1.0 hero foreground). */
  depth: number;
  /** Stable identifier for body-anchored texture & shimmer hashing. */
  id: number;
  /** Subtle metallic tint multipliers (r, g, b). */
  tint: readonly [number, number, number];
}

export interface ForkSample {
  hit: boolean;
  flag: number;
  shade: number;
  u: number;
  v: number;
  dist: number;
  nz: number;
}

const SEP = 0.155; // Half-spacing between parallel tines (crisp pure-black U-slot)
const TINE_TOP = -0.88;
const ARCH_Y = 0.04;
const ARCH_DEPTH = 0.21; // Graceful deep forged-steel U-bowl before transitioning into center stem
const TINE_R = 0.052;
const ARCH_R = 0.056;

/**
 * Signed distance to a classic forged brushed-chrome Tuning Fork in local normalized space (u, v):
 *   - Twin parallel cylindrical tines (symmetric via |u|, flexing outward/inward in anti-phase)
 *   - Deep elliptical U-saddle bowl smoothly funneling into the exact center axis (u = 0)
 *   - Sleek tapered central handle stem + machined spherical resonator bead at bottom
 */
export function sdTuningFork(u: number, v: number, flex: number): number {
  const au = Math.abs(u);

  // Cantilever bending along the parallel tines (fixed at U-saddle, maximum flex at tine tips)
  const heightFrac = clamp((ARCH_Y - v) / (ARCH_Y - TINE_TOP), 0, 1);
  const tineCenterU = SEP + flex * 0.044 * Math.pow(heightFrac, 1.65);

  // 1. Twin parallel cylindrical tines
  const dTine = sdTaperedCapsule(
    au,
    v,
    SEP,
    ARCH_Y,
    tineCenterU,
    TINE_TOP,
    TINE_R,
    TINE_R * 0.94,
  );

  // 2. Graceful deep elliptical U-bowl (u/SEP)^2 + ((v - ARCH_Y)/ARCH_DEPTH)^2 = 1 for v >= ARCH_Y
  let dArch: number;
  if (v >= ARCH_Y) {
    const nx = au / SEP;
    const ny = (v - ARCH_Y) / ARCH_DEPTH;
    const k0 = Math.hypot(nx, ny);
    const k1 = Math.hypot(nx / SEP, ny / ARCH_DEPTH) || 1;
    const radialDist = Math.abs(k0 - 1) * (k0 / k1);
    // Subtle forged shoulder thickening at the dead-center bottom saddle where stem meets bowl
    const shoulder = Math.pow(clamp((v - ARCH_Y) / ARCH_DEPTH, 0, 1), 3) * 0.014;
    dArch = radialDist - (ARCH_R + shoulder);
  } else {
    dArch = Math.hypot(au - SEP, v - ARCH_Y) - ARCH_R;
  }

  // 3. Tapered cylindrical handle stem descending cleanly from exact center (u = 0)
  const stemStart = ARCH_Y + ARCH_DEPTH;
  const stemEnd = stemStart + 0.56;
  const dStem = sdTaperedCapsule(au, v, 0, stemStart, 0, stemEnd, 0.064, 0.048);

  // 4. Machined spherical resonator bead at the base of the handle
  const beadY = stemEnd + 0.055;
  const dBead = Math.hypot(au, v - beadY) - 0.088;

  const upper = Math.min(dTine, dArch);
  const lower = smin(dStem, dBead, 0.042);
  return smin(upper, lower, 0.064);
}

export function worldToFork(px: number, py: number, fork: ForkPose, out: { u: number; v: number }) {
  const dx = (px - fork.cx) / fork.scale;
  const dy = (py - fork.cy) / fork.scale;
  const c = Math.cos(-fork.rot);
  const s = Math.sin(-fork.rot);
  out.u = dx * c - dy * s;
  out.v = dx * s + dy * c;
}

export function forkToWorld(u: number, v: number, fork: ForkPose) {
  const c = Math.cos(fork.rot);
  const s = Math.sin(fork.rot);
  return {
    x: fork.cx + (u * c - v * s) * fork.scale,
    y: fork.cy + (u * s + v * c) * fork.scale,
  };
}

const tmpLocal = { u: 0, v: 0 };

/**
 * Evaluate true 3D cylindrical brushed-chrome lighting for a screen pixel against one tuning fork.
 * Zero per-sample allocations.
 */
export function sampleFork(px: number, py: number, fork: ForkPose, out: ForkSample): boolean {
  worldToFork(px, py, fork, tmpLocal);
  const u = tmpLocal.u;
  const v = tmpLocal.v;

  if (u < -0.4 || u > 0.4 || v < -0.98 || v > 1.05) {
    out.hit = false;
    out.dist = 1;
    return false;
  }

  const d = sdTuningFork(u, v, fork.flex);
  out.dist = d;
  out.u = u;
  out.v = v;

  if (d > 0) {
    out.hit = false;
    return false;
  }

  const eps = 0.011;
  const gx = sdTuningFork(u + eps, v, fork.flex) - sdTuningFork(u - eps, v, fork.flex);
  const gy = sdTuningFork(u, v + eps, fork.flex) - sdTuningFork(u, v - eps, fork.flex);
  const gLen = Math.hypot(gx, gy) || 1;
  const dirX = gx / gLen;
  const dirY = gy / gLen;

  const isBead = v > 0.78;
  const tubeR = isBead ? 0.088 : TINE_R * 1.06;
  const depthFrac = clamp(-d / tubeR, 0, 1);
  const sinTheta = 1 - depthFrac;
  const nz = Math.sqrt(Math.max(0.03, 1 - sinTheta * sinTheta));

  const c = Math.cos(fork.rot);
  const s = Math.sin(fork.rot);
  const nx = (dirX * c - dirY * s) * sinTheta;
  const ny = (dirX * s + dirY * c) * sinTheta;

  // Crisp upper-left studio key light + subtle warm lower-right fill + brushed-chrome specular band
  const key = Math.max(0, nx * -0.6 + ny * -0.64 + nz * 0.72);
  const wrapKey = clamp((nx * -0.6 + ny * -0.64 + nz * 0.72 + 0.24) / 1.24, 0, 1);
  const fill = Math.max(0, nx * 0.62 + ny * 0.55 + nz * 0.28) * 0.14;

  const hx = -0.38;
  const hy = -0.4;
  const hz = 0.83;
  const ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
  const spec = Math.pow(ndh, 15) * 0.5;
  const fresnel = Math.pow(1 - nz, 2.1) * 0.16;
  const envSheen = 0.06 * Math.sin(v * 9.0 + fork.id * 1.4);

  let shade = 0.16 + wrapKey * 0.48 + key * 0.2 + fill + spec + fresnel + envSheen;

  const onTine = v < ARCH_Y;
  const tipFactor = clamp((ARCH_Y - v) / (ARCH_Y - TINE_TOP), 0, 1);
  let flag = FLAG_CHROME;

  if (nz < 0.46 && (nx > 0.12 || ny < -0.18) && (fork.energy > 0.12 || tipFactor > 0.3)) {
    flag = onTine && fork.energy > 0.25 && tipFactor > 0.35 ? FLAG_TIP_GLOW : FLAG_RIM;
    shade = clamp(shade + 0.16 + fork.energy * 0.24, 0, 1);
  }

  out.hit = true;
  out.flag = flag;
  out.shade = clamp(shade, 0, 1);
  out.nz = nz;
  return true;
}

export function hitFork(px: number, py: number, fork: ForkPose): boolean {
  worldToFork(px, py, fork, tmpLocal);
  const u = tmpLocal.u;
  const v = tmpLocal.v;
  if (u < -0.4 || u > 0.4 || v < -0.98 || v > 1.05) return false;
  return sdTuningFork(u, v, fork.flex) <= 0;
}
