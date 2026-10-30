import type { Vec2, Value } from './types';

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function polygonArea(pts: Vec2[]) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  }
  return Math.abs(s) / 2;
}

/** Angle ABC in radians (0..2π, counter-clockwise from BA to BC like a protractor). */
export function angle(a: Vec2, b: Vec2, c: Vec2) {
  const t1 = Math.atan2(a.y - b.y, a.x - b.x);
  const t2 = Math.atan2(c.y - b.y, c.x - b.x);
  let d = t2 - t1;
  while (d < 0) d += 2 * Math.PI;
  return d;
}

export function circleThrough(a: Vec2, b: Vec2, c: Vec2) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { c: { x, y }, r: dist({ x, y }, a) };
}

/** Linear objects as (point, direction). */
export function asLine(v: Value): { p: Vec2; d: Vec2 } | null {
  if (v.type === 'line' || v.type === 'segment' || v.type === 'ray' || v.type === 'vector') return { p: v.a, d: sub(v.b, v.a) };
  return null;
}

export function projectOnLine(p: Vec2, l: { p: Vec2; d: Vec2 }): Vec2 {
  const t = ((p.x - l.p.x) * l.d.x + (p.y - l.p.y) * l.d.y) / (l.d.x ** 2 + l.d.y ** 2);
  return { x: l.p.x + t * l.d.x, y: l.p.y + t * l.d.y };
}

function onSegmentParam(v: Value, t: number) {
  if (v.type === 'segment' || v.type === 'vector') return t >= -1e-9 && t <= 1 + 1e-9;
  if (v.type === 'ray') return t >= -1e-9;
  return true;
}

function lineLine(a: Value, b: Value): Vec2[] {
  const l1 = asLine(a)!, l2 = asLine(b)!;
  const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(den) < 1e-12) return [];
  const w = sub(l2.p, l1.p);
  const t = (w.x * l2.d.y - w.y * l2.d.x) / den;
  const u = (w.x * l1.d.y - w.y * l1.d.x) / den;
  if (!onSegmentParam(a, t) || !onSegmentParam(b, u)) return [];
  return [{ x: l1.p.x + t * l1.d.x, y: l1.p.y + t * l1.d.y }];
}

function lineCircle(a: Value, c: { c: Vec2; r: number }): Vec2[] {
  const l = asLine(a)!;
  const f = sub(l.p, c.c);
  const A = l.d.x ** 2 + l.d.y ** 2, B = 2 * (f.x * l.d.x + f.y * l.d.y), C = f.x ** 2 + f.y ** 2 - c.r ** 2;
  const disc = B * B - 4 * A * C;
  if (disc < -1e-12) return [];
  const s = Math.sqrt(Math.max(0, disc));
  const ts = disc < 1e-12 ? [-B / (2 * A)] : [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  return ts.filter((t) => onSegmentParam(a, t)).map((t) => ({ x: l.p.x + t * l.d.x, y: l.p.y + t * l.d.y }));
}

function circleCircle(a: { c: Vec2; r: number }, b: { c: Vec2; r: number }): Vec2[] {
  const d = dist(a.c, b.c);
  if (d < 1e-12 || d > a.r + b.r + 1e-12 || d < Math.abs(a.r - b.r) - 1e-12) return [];
  const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
  const ux = (b.c.x - a.c.x) / d, uy = (b.c.y - a.c.y) / d;
  const px = a.c.x + x * ux, py = a.c.y + x * uy;
  if (h < 1e-12) return [{ x: px, y: py }];
  return [{ x: px - h * uy, y: py + h * ux }, { x: px + h * uy, y: py - h * ux }];
}

/** Geometric intersection for lines/segments/rays/circles. Returns null if unsupported pair. */
export function intersectGeom(a: Value, b: Value): Vec2[] | null {
  const lin = (v: Value) => !!asLine(v);
  if (lin(a) && lin(b)) return lineLine(a, b);
  if (lin(a) && b.type === 'circle') return lineCircle(a, b);
  if (a.type === 'circle' && lin(b)) return lineCircle(b, a);
  if (a.type === 'circle' && b.type === 'circle') return circleCircle(a, b);
  return null;
}

/** Signed implicit form F(x,y) for curves so functions can be intersected with them. */
export function implicitOf(v: Value): ((x: number, y: number) => number) | null {
  if (v.type === 'implicit') return v.F;
  if (v.type === 'circle') return (x, y) => (x - v.c.x) ** 2 + (y - v.c.y) ** 2 - v.r ** 2;
  const l = asLine(v);
  if (l && v.type === 'line') return (x, y) => (x - l.p.x) * l.d.y - (y - l.p.y) * l.d.x;
  return null;
}
