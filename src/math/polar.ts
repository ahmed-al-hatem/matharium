import type { Fn1, Vec2 } from './types';

const TAU = 2 * Math.PI;

/**
 * θ range [0, θmax] that draws the whole polar curve r = f(θ): the smallest 2πk (k ≤ 12) after which the curve
 * repeats itself, or 6π for curves that never close (spirals such as r = θ).
 */
export function polarRange(r: Fn1): number {
  const N = 48;
  const at = (t: number): Vec2 => { const v = r(t); return { x: v * Math.cos(t), y: v * Math.sin(t) }; };
  const base = Array.from({ length: N }, (_, i) => at(0.1234 + (TAU * i) / N));
  const scale = Math.max(1e-9, ...base.map((p) => (Number.isFinite(p.x) && Number.isFinite(p.y) ? Math.hypot(p.x, p.y) : 0)));
  for (let k = 1; k <= 12; k++) {
    let closes = true, checked = 0;
    for (let i = 0; i < N && closes; i++) {
      const p = base[i], q = at(0.1234 + (TAU * i) / N + TAU * k);
      if (![p.x, p.y, q.x, q.y].every(Number.isFinite)) continue;
      checked++;
      if (Math.hypot(p.x - q.x, p.y - q.y) > 1e-7 * scale) closes = false;
    }
    if (closes && checked) return TAU * k;
  }
  return 3 * TAU;
}

export const polarXY = (r: Fn1): { fx: Fn1; fy: Fn1 } => ({
  fx: (t) => r(t) * Math.cos(t),
  fy: (t) => r(t) * Math.sin(t),
});
