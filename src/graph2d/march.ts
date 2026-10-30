import type { Fn2 } from '../math/types';

/**
 * Marching squares for F(x,y) = 0 on a regular grid.
 * Returns line segments [x1, y1, x2, y2] in world coordinates.
 */
export function march(F: Fn2, x0: number, x1: number, y0: number, y1: number, nx: number, ny: number): number[][] {
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;
  const v = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = F(x0 + i * dx, y0 + j * dy);
  const out: number[][] = [];
  const lerp = (a: number, b: number) => (Math.abs(a - b) < 1e-300 ? 0.5 : a / (a - b));
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * (nx + 1) + i;
      const a = v[k], b = v[k + 1], c = v[k + nx + 2], d = v[k + nx + 1]; // bl, br, tr, tl
      if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) continue;
      const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const X = x0 + i * dx, Y = y0 + j * dy;
      // reject sign changes across poles (e.g. 1/x)
      const center = F(X + dx / 2, Y + dy / 2);
      const mx = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d));
      if (!Number.isFinite(center) || Math.abs(center) > 4 * mx + 1e-9) continue;
      const bottom = [X + lerp(a, b) * dx, Y];
      const right = [X + dx, Y + lerp(b, c) * dy];
      const top = [X + lerp(d, c) * dx, Y + dy];
      const left = [X, Y + lerp(a, d) * dy];
      const seg = (p: number[], q: number[]) => out.push([p[0], p[1], q[0], q[1]]);
      switch (idx) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(right, top); break;
        case 6: case 9: seg(bottom, top); break;
        case 7: case 8: seg(left, top); break;
        case 5: if (center > 0) { seg(left, top); seg(bottom, right); } else { seg(left, bottom); seg(right, top); } break;
        case 10: if (center > 0) { seg(left, bottom); seg(right, top); } else { seg(left, top); seg(bottom, right); } break;
      }
    }
  }
  return out;
}
