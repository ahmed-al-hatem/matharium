import { shown, type Resolved, type Value, type Vec2 } from '../math/types';
import type { Viewport } from './viewport';
import { isRtl, labelPlain } from '../math/annotate';

export const labelBox = (text: string) => ({ w: Math.max(12, labelPlain(text).length * 8.5), h: 26 });

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
    case 'bars': return v.bars.some((b) => vp.wx(px) >= Math.min(b.x0, b.x1) && vp.wx(px) <= Math.max(b.x0, b.x1) &&
      vp.wy(py) >= Math.min(0, b.h) && vp.wy(py) <= Math.max(0, b.h)) ? 0 : Infinity;
    case 'boxplot': {
      const y = vp.py(v.y), hh = Math.min(30, 0.4 * vp.v.sy);
      return vp.wx(px) >= v.s[0] && vp.wx(px) <= v.s[4] && Math.abs(py - y) <= hh ? 0 : Infinity;
    }
    case 'polyline': {
      let best = Infinity;
      for (let i = 1; i < v.pts.length; i++) {
        const a = v.pts[i - 1], b = v.pts[i];
        if ([a.x, a.y, b.x, b.y].every(Number.isFinite)) best = Math.min(best, segDist(m, P(a), P(b)));
      }
      return best;
    }
    case 'stroke': return Math.min(...v.pts.slice(1).map((p, i) => segDist(m, P(v.pts[i]), P(p))));
    case 'label': {
      // the HTML layer's box, estimated from the plain text (17px font)
      const box = labelBox(v.text);
      const ax = v.screen ? v.p.x : vp.px(v.p.x), ay = v.screen ? v.p.y : vp.py(v.p.y);
      const x0 = isRtl(v.text) ? ax - box.w : ax;
      const dx = Math.max(x0 - px, 0, px - (x0 + box.w)), dy = Math.max(ay - py, 0, py - (ay + box.h));
      return Math.hypot(dx, dy);
    }
    case 'function': case 'integral': case 'riemann': case 'between': {
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
  let best: Resolved | null = null, bd = Infinity, bl = -1;
  for (const r of items) {
    if (!r.value || !shown(r) || !accept(r.value)) continue;
    const d = pixelDistance(r.value, vp, px, py) - (r.value.type === 'point' ? 4 : 0);
    // anything within reach on a higher layer wins: it is drawn on top
    const layer = d <= 9 ? r.obj.layer ?? 0 : -1;
    if (layer > bl || (layer === bl && d < bd)) { bd = d; best = r; bl = layer; }
  }
  return bd <= 9 ? best : null;
}
