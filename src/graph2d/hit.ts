import type { Resolved, Value, Vec2 } from '../math/types';
import type { Viewport } from './viewport';

function segDist(p: Vec2, a: Vec2, b: Vec2, clampLo = true, clampHi = true) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1);
  if (clampLo) t = Math.max(0, t);
  if (clampHi) t = Math.min(1, t);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distance in screen pixels from (px,py) to a value, or Infinity. */
export function pixelDistance(v: Value, vp: Viewport, px: number, py: number): number {
  const P = (q: Vec2) => ({ x: vp.px(q.x), y: vp.py(q.y) });
  const m = { x: px, y: py };
  switch (v.type) {
    case 'point': return Math.hypot(vp.px(v.p.x) - px, vp.py(v.p.y) - py);
    case 'points': return Math.min(Infinity, ...v.pts.map((p) => Math.hypot(vp.px(p.x) - px, vp.py(p.y) - py)));
    case 'segment': case 'vector': return segDist(m, P(v.a), P(v.b));
    case 'line': return segDist(m, P(v.a), P(v.b), false, false);
    case 'ray': return segDist(m, P(v.a), P(v.b), true, false);
    case 'circle': return Math.abs(Math.hypot(vp.wx(px) - v.c.x, vp.wy(py) - v.c.y) - v.r) * vp.v.sx;
    case 'polygon': return Math.min(...v.pts.map((p, i) => segDist(m, P(p), P(v.pts[(i + 1) % v.pts.length]))));
    case 'function': case 'integral': {
      const y = v.f(vp.wx(px));
      return Number.isFinite(y) ? Math.abs(vp.py(y) - py) : Infinity;
    }
    case 'implicit': {
      const x = vp.wx(px), y = vp.wy(py), h = 1e-5;
      const f = v.F(x, y);
      const g = Math.hypot((v.F(x + h, y) - f) / h, (v.F(x, y + h) - f) / h);
      return g ? (Math.abs(f) / g) * vp.v.sx : Infinity;
    }
    case 'curve': {
      let best = Infinity;
      for (let i = 0; i <= 400; i++) {
        const t = v.t0 + ((v.t1 - v.t0) * i) / 400;
        best = Math.min(best, Math.hypot(vp.px(v.fx(t)) - px, vp.py(v.fy(t)) - py));
      }
      return best;
    }
    default: return Infinity;
  }
}

export function hitTest(items: Resolved[], vp: Viewport, px: number, py: number, accept: (v: Value) => boolean = () => true): Resolved | null {
  let best: Resolved | null = null, bd = Infinity;
  for (const r of items) {
    if (!r.value || !r.obj.visible || !accept(r.value)) continue;
    const d = pixelDistance(r.value, vp, px, py) - (r.value.type === 'point' ? 4 : 0);
    if (d < bd) { bd = d; best = r; }
  }
  return bd <= 9 ? best : null;
}
