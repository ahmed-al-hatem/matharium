import type { View } from '../store/project';
import type { Value, Vec2 } from '../math/types';

export class Viewport {
  constructor(public v: View, public W: number, public H: number) {}
  px(x: number) { return this.W / 2 + (x - this.v.ox) * this.v.sx; }
  py(y: number) { return this.H / 2 - (y - this.v.oy) * this.v.sy; }
  wx(px: number) { return this.v.ox + (px - this.W / 2) / this.v.sx; }
  wy(py: number) { return this.v.oy - (py - this.H / 2) / this.v.sy; }
  get xmin() { return this.wx(0); }
  get xmax() { return this.wx(this.W); }
  get ymin() { return this.wy(this.H); }
  get ymax() { return this.wy(0); }
}

/** Nice 1-2-5 grid step for a given scale (px per unit). */
export function niceStep(scale: number, targetPx = 80) {
  const raw = targetPx / scale;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const mant = m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10;
  return { step: mant * p, minor: (mant * p) / (mant === 2 ? 4 : 5) };
}

export function fmtTick(v: number, step: number) {
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const s = Math.abs(v) < step / 1e6 ? '0' : v.toFixed(Math.min(d, 10));
  return s.replace('-', '−');
}

/** The view that shows every bounded object (points, segments, polygons, circles, texts) with a margin, keeping x:y; null when there is none. */
export function fitView(values: Value[], view: View, W: number, H: number): View | null {
  const xs: number[] = [], ys: number[] = [];
  const add = (...ps: Vec2[]) => ps.forEach((p) => { if (Number.isFinite(p.x) && Number.isFinite(p.y)) { xs.push(p.x); ys.push(p.y); } });
  for (const v of values) {
    switch (v.type) {
      case 'point': case 'label': if (v.type === 'point' || !v.screen) add(v.p); break;
      case 'points': case 'polygon': case 'stroke': case 'polyline': add(...v.pts); break;
      case 'segment': case 'vector': case 'line': case 'ray': add(v.a, v.b); break;
      case 'angle': add(v.a, v.b, v.c); break;
      case 'circle': add({ x: v.c.x - v.r, y: v.c.y - v.r }, { x: v.c.x + v.r, y: v.c.y + v.r }); break;
    }
  }
  if (!xs.length) return null;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = view.sy / view.sx;
  const fits = [x1 > x0 ? (0.8 * W) / (x1 - x0) : Infinity, y1 > y0 ? (0.8 * H) / ((y1 - y0) * k) : Infinity];
  const sx = Math.min(...fits);
  const s = Number.isFinite(sx) ? Math.min(1e6, Math.max(1e-4, sx)) : view.sx;
  return { ox: (x0 + x1) / 2, oy: (y0 + y1) / 2, sx: s, sy: s * k };
}
