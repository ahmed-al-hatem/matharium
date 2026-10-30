import { describe, expect, it } from 'vitest';
import { gridPoint, isoSide, snapPoint } from './grid';
import { niceStep } from './viewport';

const view = { ox: 0, oy: 0, sx: 50, sy: 50 };

describe('snapping to the grid', () => {
  it('snaps to the minor lattice for major and minor gridlines and for dots', () => {
    const minor = niceStep(50).minor; // 0.5 at 50 px per unit
    expect(snapPoint({ x: 0.52, y: 1.47 }, view, 'majorMinor')).toEqual({ x: 0.5, y: 1.5 });
    expect(snapPoint({ x: 0.52, y: 1.47 }, view, 'dots')).toEqual({ x: 0.5, y: 1.5 });
    expect(gridPoint({ x: 0.8, y: 0 }, view, 'majorMinor').x).toBeCloseTo(2 * minor);
  });
  it('snaps to the major lattice for major gridlines only', () => {
    expect(snapPoint({ x: 1.95, y: -0.1 }, view, 'major')).toEqual({ x: 2, y: 0 });
    expect(snapPoint({ x: 1.2, y: 0 }, view, 'major')).toEqual({ x: 1.2, y: 0 }); // 0.8 units = 40 px from 2: no snap
  });
  it('snaps polar points to the radius and to multiples of 30°', () => {
    const p = { x: 2 * Math.cos(Math.PI / 6) + 0.05, y: 2 * Math.sin(Math.PI / 6) - 0.04 };
    const q = snapPoint(p, view, 'polar');
    expect(Math.hypot(q.x, q.y)).toBeCloseTo(2, 6);
    expect(Math.atan2(q.y, q.x)).toBeCloseTo(Math.PI / 6, 6);
    expect(snapPoint({ x: 0.05, y: -0.05 }, view, 'polar')).toEqual({ x: 0, y: 0 });
  });
  it('snaps isometric points to triangle vertices', () => {
    const s = isoSide(view), h = (s * Math.sqrt(3)) / 2;
    const q = snapPoint({ x: 1.5 * s + 0.02, y: h - 0.03 }, view, 'isometric');
    expect(q.x).toBeCloseTo(1.5 * s, 6);
    expect(q.y).toBeCloseTo(h, 6);
    // every snapped point lies on the lattice: y = j·h and x - y/√3 = i·s
    for (const p of [{ x: 3.3, y: -2.2 }, { x: -1.1, y: 4.4 }, { x: 0.2, y: 0.9 }]) {
      const g = gridPoint(p, view, 'isometric');
      const j = g.y / h, i = (g.x - g.y / Math.sqrt(3)) / s;
      expect(Math.abs(j - Math.round(j))).toBeLessThan(1e-9);
      expect(Math.abs(i - Math.round(i))).toBeLessThan(1e-9);
    }
  });
  it('leaves points far from the grid alone (rounded to 2 decimals)', () => {
    expect(snapPoint({ x: 0.2449, y: 0.2551 }, view, 'majorMinor')).toEqual({ x: 0.24, y: 0.26 });
  });
});
