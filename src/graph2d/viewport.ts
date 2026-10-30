import type { View } from '../store/project';

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
