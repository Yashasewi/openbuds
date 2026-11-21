import { clamp, sdEllipse, sdTaperedCapsule, smin } from "./math";

/** Surface material flags encoded per cell in the ASCII rasterizer. */
export const FLAG_NONE = 0;
export const FLAG_SHELL = 1;
export const FLAG_EDGE = 2;
export const FLAG_TIP = 3;
export const FLAG_TOUCH = 4;
export const FLAG_VENT = 5;
export const FLAG_BORE = 6;
export const FLAG_COLLAR = 7;

export interface BudPose {
  /** Center X in CSS pixels. */
  cx: number;
  /** Center Y in CSS pixels. */
  cy: number;
  /** Characteristic scale in CSS pixels (half-height ~ 1.0 * scale). */
  scale: number;
  /** +1 for left bud (tip points right/inward), -1 for right bud (tip points left/inward). */
  flipX: 1 | -1;
  /** Subtle dynamic rotation in radians. */
  rot: number;
  /** 0 = left, 1 = right. */
  id: number;
  /** Slightly dims a bud if reported in-case or inactive. */
  dim: number;
}

export interface BudSample {
  hit: boolean;
  flag: number;
  shade: number;
  /** Normalized body coordinates for body-anchored ASCII glyph hashing. */
  u: number;
  v: number;
  /** Signed distance in normalized local space (< 0 inside). */
  dist: number;
}

/**
 * Signed distance to the main metallic/satin body (stem + concha head + nozzle neck)
 * in normalized local coordinates where:
 *   u < 0 is outer stem back, u > 0 is inward toward the ear canal
 *   v < 0 is top of acoustic head, v > 0 is bottom of stem
 */
function sdBody(u: number, v: number) {
  // Sleek tapered vertical-canted stem (OnePlus Buds 4 silhouette)
  const stem = sdTaperedCapsule(u, v, -0.25, -0.20, -0.34, 0.94, 0.148, 0.116);
  // Sculpted bulbous concha acoustic housing
  const head = sdEllipse(u, v, 0.04, -0.44, 0.41, 0.42, -0.18);
  // Subtle rounded top-outer shoulder bridging stem and head
  const shoulder = sdEllipse(u, v, -0.16, -0.34, 0.24, 0.29, 0.12);
  // Angled acoustic nozzle extending into ear tip
  const neck = sdTaperedCapsule(u, v, 0.30, -0.36, 0.56, -0.26, 0.165, 0.125);

  const upper = smin(head, shoulder, 0.14);
  const merged = smin(stem, upper, 0.21);
  return smin(merged, neck, 0.08);
}

/** Silicone oval ear tip fitted cleanly over the acoustic nozzle. */
function sdEarTip(u: number, v: number) {
  return sdEllipse(u, v, 0.60, -0.25, 0.20, 0.27, 0.32);
}

/** Combined silhouette SDF. */
function sdCombined(u: number, v: number) {
  return Math.min(sdBody(u, v), sdEarTip(u, v));
}

/** Smooth 3D dome height field z(u, v) for analytical normal estimation. */
function heightAt(u: number, v: number, isTip: boolean) {
  const d = isTip ? sdEarTip(u, v) : sdBody(u, v);
  if (d >= 0) return 0;
  const maxThick = isTip ? 0.22 : v > 0.06 ? 0.15 : 0.34;
  const t = clamp(-d / maxThick, 0, 1);
  // Smooth rounded industrial contour (slightly flatter crown than a sphere)
  const dome = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
  // Subtle ergonomic ridge along the stem center
  const stemSpine = v > -0.1 ? Math.exp(-Math.pow((u + 0.28 + v * 0.07) / 0.11, 2)) * 0.1 : 0;
  return dome + stemSpine;
}

/** Transform a screen point (px, py) into bud-local normalized coordinates (u, v). */
export function worldToBud(px: number, py: number, bud: BudPose, out: { u: number; v: number }) {
  const dx = (px - bud.cx) / bud.scale;
  const dy = (py - bud.cy) / bud.scale;
  const c = Math.cos(-bud.rot);
  const s = Math.sin(-bud.rot);
  const rx = dx * c - dy * s;
  const ry = dx * s + dy * c;
  out.u = rx * bud.flipX;
  out.v = ry;
}

/** Transform a bud-local landmark (u, v) back into CSS pixels (used for wave emitters & blueprint ticks). */
export function budToWorld(u: number, v: number, bud: BudPose) {
  const lx = u * bud.flipX;
  const ly = v;
  const c = Math.cos(bud.rot);
  const s = Math.sin(bud.rot);
  return {
    x: bud.cx + (lx * c - ly * s) * bud.scale,
    y: bud.cy + (lx * s + ly * c) * bud.scale,
  };
}

/** Key acoustic landmarks on a single OnePlus Buds 4 in local normalized coordinates. */
export const BUD_LANDMARKS = {
  /** Feedforward ANC microphone & pressure vent on outer shell face. */
  outerVent: { u: -0.14, v: -0.49 },
  /** Acoustic bore at the tip of the silicone nozzle (sound exit / inner listening field). */
  earBore: { u: 0.78, v: -0.17 },
  /** Touch-slide strip midpoint on the stem. */
  touchStrip: { u: -0.28, v: 0.20 },
  /** Bottom call-microphone port. */
  callMic: { u: -0.34, v: 0.90 },
  /** Acoustic driver core center. */
  driverCore: { u: 0.10, v: -0.40 },
} as const;

const tmpLocal = { u: 0, v: 0 };

/**
 * Sample a screen pixel (px, py) against one sculpted OnePlus Buds 4.
 * Writes directly into `out` to stay zero-allocation inside the per-cell raster loop.
 */
export function sampleBud(px: number, py: number, bud: BudPose, out: BudSample): boolean {
  worldToBud(px, py, bud, tmpLocal);
  const u = tmpLocal.u;
  const v = tmpLocal.v;

  // Quick local bounding box reject
  if (u < -0.65 || u > 0.98 || v < -0.98 || v > 1.15) {
    out.hit = false;
    out.dist = 1;
    return false;
  }

  const dBody = sdBody(u, v);
  const dTip = sdEarTip(u, v);
  const d = Math.min(dBody, dTip);
  out.dist = d;
  out.u = u;
  out.v = v;

  if (d > 0) {
    out.hit = false;
    return false;
  }

  const isTip = dTip < dBody;

  // Compute 3D surface normal via central difference on smooth dome height
  const eps = 0.018;
  const dhdu = (heightAt(u + eps, v, isTip) - heightAt(u - eps, v, isTip)) / (2 * eps);
  const dhdv = (heightAt(u, v + eps, isTip) - heightAt(u, v - eps, isTip)) / (2 * eps);

  // Transform gradient from mirrored/rotated bud space into screen space
  const relief = isTip ? 0.72 : 0.85;
  const lnx = -dhdu * relief * bud.flipX;
  const lny = -dhdv * relief;
  const c = Math.cos(bud.rot);
  const s = Math.sin(bud.rot);
  let nx = lnx * c - lny * s;
  let ny = lnx * s + lny * c;
  let nz = 1;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  nx /= nLen;
  ny /= nLen;
  nz /= nLen;

  // Consistent top-left studio key light + subtle cool right rim light
  const key = Math.max(0, nx * -0.56 + ny * -0.68 + nz * 0.74);
  const rim = Math.max(0, nx * 0.72 + ny * 0.14 + nz * 0.34);
  const fresnel = Math.pow(1 - clamp(nz, 0, 1), 2.1);

  // Specular highlight (sharper on metallic shell, softer on silicone ear tip)
  const hx = -0.34;
  const hy = -0.44;
  const hz = 0.83;
  const ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
  const spec = Math.pow(ndh, isTip ? 9 : 22) * (isTip ? 0.22 : 0.42);

  let shade = isTip
    ? 0.16 + key * 0.56 + rim * 0.16 + fresnel * 0.12 + spec
    : 0.24 + key * 0.62 + rim * 0.20 + fresnel * 0.15 + spec;

  // Subtle ambient occlusion seam where silicone ear tip collars onto the shell
  const collarGap = Math.abs(dTip - dBody);
  if (collarGap < 0.065) {
    shade *= 0.68 + (collarGap / 0.065) * 0.32;
  }

  let flag = isTip ? FLAG_TIP : FLAG_SHELL;

  if (isTip) {
    // Recessed acoustic nozzle bore at inward front edge of silicone ear tip
    const bore = sdEllipse(u, v, 0.75, -0.18, 0.085, 0.125, 0.36);
    if (bore < 0) {
      flag = FLAG_BORE;
      shade = 0.08;
    }
  } else {
    // Feedforward ANC mic / pressure-relief acoustic grille on outer upper face
    const vent = sdEllipse(u, v, -0.14, -0.49, 0.068, 0.115, 0.22);
    if (vent < 0) {
      flag = FLAG_VENT;
      shade = 0.10;
    } else if (
      // Sleek machined touch-control slide strip along the upper-outer stem
      v > -0.05 &&
      v < 0.46 &&
      Math.abs(u - (-0.27 - v * 0.07)) < 0.048
    ) {
      flag = FLAG_TOUCH;
      shade = clamp(shade + 0.24, 0, 1);
    } else if (
      // Subtle metallic call-mic / charging ring at bottom tip of stem
      v > 0.79 &&
      v < 0.87 &&
      Math.abs(u + 0.33) < 0.14
    ) {
      flag = FLAG_COLLAR;
      shade = clamp(shade + 0.18, 0, 1);
    }
  }

  out.hit = true;
  out.flag = flag;
  out.shade = clamp(shade, 0, 1);
  return true;
}

/** Fast silhouette-only hit test for the 4 sub-cell anti-aliasing samples. */
export function hitBud(px: number, py: number, bud: BudPose): boolean {
  worldToBud(px, py, bud, tmpLocal);
  const u = tmpLocal.u;
  const v = tmpLocal.v;
  if (u < -0.65 || u > 0.98 || v < -0.98 || v > 1.15) return false;
  return sdCombined(u, v) <= 0;
}
