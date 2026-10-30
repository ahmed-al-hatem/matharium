import { describe, expect, it } from 'vitest';
import { evaluateAll, evaluateScope } from '../math/engine';
import { draw } from '../graph2d/renderer';
import { SvgCtx } from '../graph2d/svgctx';
import { evalSheet } from '../math/sheet';
import type { MObj } from '../math/types';
import { DEFAULT_SETTINGS, GRID_TYPES } from '../store/project';

const objs: MObj[] = [
  { id: '1', name: 'f', input: 'f(x) = x^2 - 2', color: '#E45B45', visible: true },
  { id: '2', name: 'A', input: 'A = (1, 2)', color: '#3282F6', visible: true },
  { id: '3', name: 'c', input: 'Circle(A, 2)', color: '#E1B549', visible: true },
  { id: '4', name: 'eq1', input: 'x^2 + y^2 <= 4', color: '#6DC4AA', visible: true },
];

describe('svg export', () => {
  it('renders the scene as SVG markup', () => {
    const ctx = new SvgCtx(400, 300);
    draw(ctx, evaluateAll(objs), {
      W: 400, H: 300, view: { ox: 0, oy: 0, sx: 40, sy: 40 }, selectedId: null,
      settings: { ...DEFAULT_SETTINGS, labels: 'all' },
    });
    const svg = ctx.toString();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('stroke="#E45B45"');
    expect(svg).toContain('>A</text>');
    expect(svg).not.toContain('NaN');
  });
});

describe('grid types in svg export', () => {
  const views = {
    normal: { ox: 0, oy: 0, sx: 40, sy: 40 },
    stretched: { ox: 1, oy: -2, sx: 60, sy: 15 },
    'origin off-screen': { ox: 500, oy: -300, sx: 30, sy: 30 },
    'zoomed out': { ox: 0, oy: 0, sx: 0.002, sy: 0.002 },
  };
  const svgFor = (gridType: (typeof GRID_TYPES)[number], view: { ox: number; oy: number; sx: number; sy: number }, extra = {}) => {
    const ctx = new SvgCtx(400, 300);
    draw(ctx, evaluateAll(objs), { W: 400, H: 300, view, selectedId: null, settings: { ...DEFAULT_SETTINGS, gridType, ...extra } });
    return ctx.toString();
  };
  for (const g of GRID_TYPES) {
    it.each(Object.entries(views))(`${g}: %s has no NaN`, (_n, view) => {
      const svg = svgFor(g, view);
      expect(svg).not.toMatch(/NaN|Infinity/);
    });
  }
  it('draws what each type looks like', () => {
    const base = svgFor('majorMinor', views.normal, { axes: false });
    const major = svgFor('major', views.normal, { axes: false });
    expect(major.length).toBeLessThan(base.length);
    expect(svgFor('polar', views.normal, { axes: false })).toMatch(/A\d/); // circles are arcs
    expect(svgFor('polar', views.normal, { angle: 'deg' })).toContain('>30°<');
    expect(svgFor('polar', views.normal)).toContain('>π/6<');
    const dots = svgFor('dots', views.normal, { axes: false });
    expect(dots).toContain('<rect');
    expect(dots).not.toContain('rgba(120,121,120,0.1)"'); // no minor lines
    expect(svgFor('isometric', views.normal, { axes: false })).not.toBe(base);
  });
});

describe('spreadsheet', () => {
  it('evaluates formulas, ranges and object references', () => {
    const v = evalSheet({ A1: '1', A2: '2', A3: '=A1+A2', B1: '=sum(A1:A3)', B2: '=f(A2)', B3: 'hello', C1: '=C1+1' }, evaluateScope(objs));
    expect(v.A3.v).toBe(3);
    expect(v.B1.v).toBe(6);
    expect(v.B2.v).toBe(2);
    expect(v.B3).toMatchObject({ v: 'hello', text: true });
    expect(v.C1.err).toBe(true);
  });
});
