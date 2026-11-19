// Pure 3D isometric projection & 4-tone solid geometry builders for OpenBuds hardware figures.
// Camera: orthographic 30° elevation, parallel edges preserved, back-to-front painter's order.

export type Point2 = [number, number];
export type Point3 = [number, number, number];

export interface Projection {
  origin: Point2;
  scale: number;
  azimuth?: number;
  elevation?: number;
}

export interface SolidPart {
  id: string;
  depth: number;
  lit?: boolean;
  brass?: boolean;
  dark?: boolean;
  /** Opaque silhouette or ordered quads painted back-to-front */
  faces: { d: string; shade: 0 | 1 | 2 | 3 | "top"; seamless?: boolean }[];
  /** Crisp outer silhouette strokes */
  outline: string;
  /** Crisp subtle interior crease strokes */
  crease?: string;
}

const DEG = Math.PI / 180;

export function vecAdd(a: Point3, b: Point3): Point3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecScale(a: Point3, s: number): Point3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vecDot(a: Point3, b: Point3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vecCross(a: Point3, b: Point3): Point3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function vecNorm(a: Point3): Point3 {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / len, a[1] / len, a[2] / len];
}

export function cameraBasis(proj: Projection) {
  const a = (proj.azimuth ?? 42) * DEG;
  const e = (proj.elevation ?? 30) * DEG;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  const cosE = Math.cos(e);
  const sinE = Math.sin(e);
  const viewer: Point3 = [sinA * cosE, cosA * cosE, sinE];
  const light: Point3 = vecNorm([-0.22, 0.62, 0.75]);
  return { cosA, sinA, cosE, sinE, viewer, light, k: proj.scale };
}

export function isoProject([x, y, z]: Point3, proj: Projection): Point2 {
  const { cosA, sinA, cosE, sinE, k } = cameraBasis(proj);
  return [
    proj.origin[0] + (x * cosA - y * sinA) * k,
    proj.origin[1] + ((x * sinA + y * cosA) * sinE - z * cosE) * k,
  ];
}

export function isoDepth(p: Point3, proj: Projection): number {
  const { viewer } = cameraBasis(proj);
  return vecDot(p, viewer);
}

const fmt = (n: number) => {
  const s = (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
  return s === "-0" ? "0" : s;
};

export function svgPath(pts: Point2[], closed = false): string {
  if (!pts.length) return "";
  return (
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${fmt(x)} ${fmt(y)}`).join("") +
    (closed ? "Z" : "")
  );
}

export function shadeFromNormal(normal: Point3, light: Point3): 0 | 1 | 2 | 3 | "top" {
  if (normal[2] > 0.82) return "top";
  const d = vecDot(normal, light);
  if (d > 0.52) return 3;
  if (d > 0.16) return 2;
  if (d > -0.22) return 1;
  return 0;
}

/** 2D rounded rectangle ring in XY plane (CCW when viewed from +Z) */
export function roundedRectXY(
  cx: number,
  cy: number,
  w: number,
  d: number,
  r: number,
  cornerSteps = 6,
): Point2[] {
  const hw = w / 2;
  const hd = d / 2;
  const rad = Math.max(0, Math.min(r, hw, hd));
  const corners: [number, number, number][] = [
    [cx + hw - rad, cy + hd - rad, 0],
    [cx - hw + rad, cy + hd - rad, 90],
    [cx - hw + rad, cy - hd + rad, 180],
    [cx + hw - rad, cy - hd + rad, 270],
  ];
  const pts: Point2[] = [];
  for (const [ox, oy, startDeg] of corners) {
    const steps = rad > 0 ? cornerSteps : 0;
    for (let i = 0; i <= steps; i++) {
      const ang = (startDeg + (steps ? (90 * i) / steps : 45)) * DEG;
      pts.push([ox + rad * Math.cos(ang), oy + rad * Math.sin(ang)]);
    }
  }
  return pts;
}

/** 2D ellipse ring in XY plane (CCW) */
export function ellipseXY(cx: number, cy: number, rx: number, ry: number, steps = 28): Point2[] {
  const pts: Point2[] = [];
  for (let i = 0; i < steps; i++) {
    const ang = (360 * i * DEG) / steps;
    pts.push([cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)]);
  }
  return pts;
}

function signedArea2(pts: Point2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/**
 * Extrudes a convex/rounded 2D XY polygon vertically from z0 to z0 + height.
 */
export function extrudeZ(
  id: string,
  rawRing: Point2[],
  z0: number,
  height: number,
  proj: Projection,
  opts: { lit?: boolean; brass?: boolean; dark?: boolean; depthBias?: number } = {},
): SolidPart {
  // Ensure CCW winding in XY so outward normal of edge i -> i+1 is [dy, -dx, 0]
  const ring = signedArea2(rawRing) >= 0 ? rawRing : [...rawRing].reverse();
  const n = ring.length;
  const { viewer, light } = cameraBasis(proj);

  const top3: Point3[] = ring.map(([x, y]) => [x, y, z0 + height]);
  const bot3: Point3[] = ring.map(([x, y]) => [x, y, z0]);
  const top2 = top3.map((p) => isoProject(p, proj));
  const bot2 = bot3.map((p) => isoProject(p, proj));

  const edgeNormals: Point3[] = ring.map(([x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % n]!;
    return vecNorm([y2 - y1, -(x2 - x1), 0]);
  });
  const frontFacing = edgeNormals.map((en) => vecDot(en, viewer) > 1e-6);

  // Collect visible side quads sorted back-to-front
  const sideQuads: { depth: number; d: string; shade: 0 | 1 | 2 | 3 }[] = [];
  if (height > 0) {
    for (let i = 0; i < n; i++) {
      if (!frontFacing[i]) continue;
      const j = (i + 1) % n;
      const c: Point3 = [
        (top3[i]![0] + top3[j]![0]) * 0.5,
        (top3[i]![1] + top3[j]![1]) * 0.5,
        z0 + height * 0.5,
      ];
      const sh = shadeFromNormal(edgeNormals[i]!, light);
      sideQuads.push({
        depth: vecDot(c, viewer),
        d: svgPath([bot2[i]!, bot2[j]!, top2[j]!, top2[i]!], true),
        shade: sh === "top" ? 3 : sh,
      });
    }
    sideQuads.sort((a, b) => a.depth - b.depth);
  }

  const faces: SolidPart["faces"] = [
    ...sideQuads.map((q) => ({ d: q.d, shade: q.shade, seamless: true })),
    { d: svgPath(top2, true), shade: "top" },
  ];

  // Build crisp silhouette outline + front-top rim crease
  const outlineSegs: string[] = [];
  const creaseSegs: string[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (frontFacing[i]) {
      if (height > 0) {
        outlineSegs.push(svgPath([bot2[i]!, bot2[j]!]));
        creaseSegs.push(svgPath([top2[i]!, top2[j]!]));
      } else {
        outlineSegs.push(svgPath([top2[i]!, top2[j]!]));
      }
    } else {
      outlineSegs.push(svgPath([top2[i]!, top2[j]!]));
    }
    const prevFront = frontFacing[(i - 1 + n) % n];
    if (height > 0 && prevFront !== frontFacing[i]) {
      outlineSegs.push(svgPath([bot2[i]!, top2[i]!]));
    }
  }

  // Centroid depth
  let cx = 0;
  let cy = 0;
  for (const [x, y] of ring) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;
  const depth = isoDepth([cx, cy, z0 + height * 0.5], proj) + (opts.depthBias ?? 0);

  return {
    id,
    depth,
    lit: opts.lit,
    brass: opts.brass,
    dark: opts.dark,
    faces,
    outline: outlineSegs.join(""),
    crease: creaseSegs.join(""),
  };
}

export interface LatheStation {
  /** Axial coordinate along `axis` */
  s: number;
  /** Radius >= 0 perpendicular to `axis` */
  r: number;
  /** Emit crisp ring crease at this station */
  crease?: boolean;
}

export function orthonormalFrame(axisRaw: Point3): { u: Point3; v: Point3; w: Point3 } {
  const u = vecNorm(axisRaw);
  // Pick a world up helper not parallel to u
  const up: Point3 = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const v = vecNorm(vecCross(up, u));
  const w = vecNorm(vecCross(u, v));
  return { u, v, w };
}

/**
 * Builds a true 3D revolved lathe solid along an arbitrary 3D axis `axisRaw`.
 * Station list goes from rear (`s` smaller) to front (`s` larger); include `r: 0` caps to close ends!
 */
export function latheSolid(
  id: string,
  origin: Point3,
  axisRaw: Point3,
  stations: LatheStation[],
  proj: Projection,
  opts: {
    segments?: number;
    lit?: boolean;
    brass?: boolean;
    dark?: boolean;
    depthBias?: number;
    ellipseScaleV?: number;
    ellipseScaleW?: number;
  } = {},
): SolidPart {
  const segs = opts.segments ?? 28;
  const scaleV = opts.ellipseScaleV ?? 1;
  const scaleW = opts.ellipseScaleW ?? 1;
  const { u, v, w } = orthonormalFrame(axisRaw);
  const { viewer, light } = cameraBasis(proj);

  // Precompute 3D & 2D rings for each station
  const rings3: Point3[][] = stations.map((st) => {
    const base = vecAdd(origin, vecScale(u, st.s));
    const pts: Point3[] = [];
    for (let k = 0; k < segs; k++) {
      const ang = (2 * Math.PI * k) / segs;
      const radial = vecAdd(
        vecScale(v, Math.cos(ang) * st.r * scaleV),
        vecScale(w, Math.sin(ang) * st.r * scaleW),
      );
      pts.push(vecAdd(base, radial));
    }
    return pts;
  });
  const rings2: Point2[][] = rings3.map((r3) => r3.map((p) => isoProject(p, proj)));

  const quads: { depth: number; d: string; shade: 0 | 1 | 2 | 3 | "top" }[] = [];
  const outlineSegs: string[] = [];
  const creaseSegs: string[] = [];

  for (let i = 0; i < stations.length - 1; i++) {
    const stA = stations[i]!;
    const stB = stations[i + 1]!;
    if (stA.r < 1e-4 && stB.r < 1e-4) continue;

    const ds = stB.s - stA.s;
    const dr = stB.r - stA.r;
    const visFlags: boolean[] = [];
    const quadNormals: Point3[] = [];

    for (let k = 0; k < segs; k++) {
      const kNext = (k + 1) % segs;
      const angMid = (2 * Math.PI * (k + 0.5)) / segs;
      // Outward normal for revolved surface: ds * radialDir - dr * u (when ds >= 0)
      const radDir = vecNorm(
        vecAdd(vecScale(v, Math.cos(angMid) / scaleV), vecScale(w, Math.sin(angMid) / scaleW)),
      );
      let normal: Point3;
      if (Math.abs(ds) < 1e-5) {
        // Flat disc cap: normal points along +u if radius shrinks (front cap), -u if radius grows (back cap)
        normal = dr < 0 ? u : vecScale(u, -1);
      } else {
        const sign = ds > 0 ? 1 : -1;
        normal = vecNorm(vecAdd(vecScale(radDir, Math.abs(ds)), vecScale(u, -dr * sign)));
      }
      quadNormals.push(normal);
      const visible = vecDot(normal, viewer) > -0.02;
      visFlags.push(visible);

      if (visible) {
        const p0 = rings3[i]![k]!;
        const p1 = rings3[i]![kNext]!;
        const p2 = rings3[i + 1]![kNext]!;
        const p3 = rings3[i + 1]![k]!;
        const center: Point3 = [
          (p0[0] + p1[0] + p2[0] + p3[0]) * 0.25,
          (p0[1] + p1[1] + p2[1] + p3[1]) * 0.25,
          (p0[2] + p1[2] + p2[2] + p3[2]) * 0.25,
        ];
        const q2 =
          stA.r < 1e-4
            ? [rings2[i]![0]!, rings2[i + 1]![kNext]!, rings2[i + 1]![k]!]
            : stB.r < 1e-4
              ? [rings2[i]![k]!, rings2[i]![kNext]!, rings2[i + 1]![0]!]
              : [rings2[i]![k]!, rings2[i]![kNext]!, rings2[i + 1]![kNext]!, rings2[i + 1]![k]!];

        quads.push({
          depth: vecDot(center, viewer),
          d: svgPath(q2, true),
          shade: shadeFromNormal(normal, light),
        });
      }
    }

    // Horizon silhouette edges between visible and hidden angular strips
    if (stA.r >= 1e-4 && stB.r >= 1e-4) {
      for (let k = 0; k < segs; k++) {
        const prevVis = visFlags[(k - 1 + segs) % segs];
        if (prevVis !== visFlags[k]) {
          outlineSegs.push(svgPath([rings2[i]![k]!, rings2[i + 1]![k]!]));
        }
      }
    }
  }

  // Station ring outlines/creases where surface turns sharply or is marked
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i]!;
    if (st.r < 1e-4) continue;
    const isEnd =
      i === 0 ||
      i === stations.length - 1 ||
      stations[i - 1]!.r < 1e-4 ||
      stations[i + 1]!.r < 1e-4;
    if (!isEnd && !st.crease) continue;

    for (let k = 0; k < segs; k++) {
      const kNext = (k + 1) % segs;
      const angMid = (2 * Math.PI * (k + 0.5)) / segs;
      const radDir = vecAdd(vecScale(v, Math.cos(angMid)), vecScale(w, Math.sin(angMid)));
      // Visible half of the ring facing the viewer or along +u
      const facing = vecDot(radDir, viewer) > -0.12 || vecDot(u, viewer) > 0.35;
      if (!facing) continue;
      const segPath = svgPath([rings2[i]![k]!, rings2[i]![kNext]!]);
      if (isEnd) outlineSegs.push(segPath);
      else creaseSegs.push(segPath);
    }
  }

  quads.sort((a, b) => a.depth - b.depth);

  const sMid = stations.length > 0 ? (stations[0]!.s + stations[stations.length - 1]!.s) * 0.5 : 0;
  const center3 = vecAdd(origin, vecScale(u, sMid));
  const depth = isoDepth(center3, proj) + (opts.depthBias ?? 0);

  return {
    id,
    depth,
    lit: opts.lit,
    brass: opts.brass,
    dark: opts.dark,
    faces: quads.map((q) => ({ d: q.d, shade: q.shade, seamless: true })),
    outline: outlineSegs.join(""),
    crease: creaseSegs.join(""),
  };
}

/** Projects a 3D circle perpendicular to `axisRaw` into an SVG path */
export function isoCirclePath(
  origin: Point3,
  axisRaw: Point3,
  radius: number,
  proj: Projection,
  opts: { segments?: number; scaleV?: number; scaleW?: number; arc?: [number, number] } = {},
): string {
  const segs = opts.segments ?? 36;
  const sv = opts.scaleV ?? 1;
  const sw = opts.scaleW ?? 1;
  const { v, w } = orthonormalFrame(axisRaw);
  const [a0, a1] = opts.arc ?? [0, Math.PI * 2];
  const closed = !opts.arc;
  const pts: Point2[] = [];
  const count = closed ? segs : segs + 1;
  for (let k = 0; k < count; k++) {
    const t = closed ? k / segs : k / segs;
    const ang = a0 + (a1 - a0) * t;
    const p3 = vecAdd(
      origin,
      vecAdd(
        vecScale(v, Math.cos(ang) * radius * (opts.scaleV ?? sv)),
        vecScale(w, Math.sin(ang) * radius * (opts.scaleW ?? sw)),
      ),
    );
    pts.push(isoProject(p3, proj));
  }
  return svgPath(pts, closed);
}
