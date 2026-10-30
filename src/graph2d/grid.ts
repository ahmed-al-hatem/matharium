import type { Vec2 } from '../math/types';
import type { GridType, View } from '../store/project';
import { niceStep } from './viewport';

/** Polar circles and isometric triangles need the same world spacing on both axes, so they follow the coarser scale. */
export const polarStep = (v: View) => niceStep(Math.min(v.sx, v.sy));
/** Side of one isometric triangle (half a major step, so vertices sit about as densely as minor gridlines). */
export const isoSide = (v: View) => polarStep(v).step / 2;
/** Angle between polar rays (30°). */
export const POLAR_ANGLE = Math.PI / 6;

const SNAP_PX = 10;

/** The grid point nearest to p for the given grid type (in world units). */
export function gridPoint(p: Vec2, v: View, type: GridType): Vec2 {
  switch (type) {
    case 'polar': {
      const r = Math.hypot(p.x, p.y);
      const st = polarStep(v).minor;
      const R = Math.round(r / st) * st;
      if (!R) return { x: 0, y: 0 };
      const th = Math.round(Math.atan2(p.y, p.x) / POLAR_ANGLE) * POLAR_ANGLE;
      return { x: R * Math.cos(th), y: R * Math.sin(th) };
    }
    case 'isometric': {
      const s = isoSide(v), h = (s * Math.sqrt(3)) / 2;
      const j0 = Math.round(p.y / h);
      let best: Vec2 = { x: 0, y: 0 }, bestD = Infinity;
      for (const j of [j0 - 1, j0, j0 + 1]) {
        const i = Math.round((p.x - (j * s) / 2) / s);
        const q = { x: i * s + (j * s) / 2, y: j * h };
        const d = Math.hypot((q.x - p.x) * v.sx, (q.y - p.y) * v.sy);
        if (d < bestD) { best = q; bestD = d; }
      }
      return best;
    }
    default: {
      const pick = (scale: number) => (type === 'major' ? niceStep(scale).step : niceStep(scale).minor);
      const sx = pick(v.sx), sy = pick(v.sy);
      return { x: Math.round(p.x / sx) * sx, y: Math.round(p.y / sy) * sy };
    }
  }
}

/** Snap p to the grid when it is within a few pixels of a grid point; otherwise round it for display. */
export function snapPoint(p: Vec2, v: View, type: GridType): Vec2 {
  const q = gridPoint(p, v, type);
  const close = Math.hypot((q.x - p.x) * v.sx, (q.y - p.y) * v.sy) < SNAP_PX;
  return close ? { x: +q.x.toFixed(6), y: +q.y.toFixed(6) } : { x: +p.x.toFixed(2), y: +p.y.toFixed(2) };
}
