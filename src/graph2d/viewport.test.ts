import { describe, expect, it } from 'vitest';
import { fitView, Viewport } from './viewport';
import type { Value } from '../math/types';

describe('fitView', () => {
  const view = { ox: 0, oy: 0, sx: 50, sy: 25 };

  it('shows every bounded object and keeps x:y', () => {
    const values: Value[] = [
      { type: 'point', p: { x: 10, y: 4 }, free: true },
      { type: 'circle', c: { x: -5, y: 0 }, r: 2 },
      { type: 'function', f: (x) => x, param: 'x', tex: '' },
    ];
    const v = fitView(values, view, 800, 600)!;
    expect(v.sy / v.sx).toBeCloseTo(0.5);
    const vp = new Viewport(v, 800, 600);
    expect(vp.xmin).toBeLessThan(-7);
    expect(vp.xmax).toBeGreaterThan(10);
    expect(vp.ymin).toBeLessThan(-2);
    expect(vp.ymax).toBeGreaterThan(4);
  });

  it('centres a single point without changing the scale, and gives up without bounded objects', () => {
    expect(fitView([{ type: 'point', p: { x: 3, y: 1 }, free: true }], view, 800, 600)).toEqual({ ox: 3, oy: 1, sx: 50, sy: 25 });
    expect(fitView([{ type: 'label', text: 'hi', p: { x: 5, y: 5 }, screen: true }], view, 800, 600)).toBeNull();
  });
});
