import { describe, expect, it } from 'vitest';
import { evaluateAll, evaluateScope } from '../math/engine';
import { draw } from '../graph2d/renderer';
import { SvgCtx } from '../graph2d/svgctx';
import { evalSheet } from '../components/SpreadsheetPanel';
import type { MObj } from '../math/types';

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
      settings: { grid: true, axes: true, labels: true, snap: true, digits: 4, range3d: 6, lang: 'en', exact: true },
    });
    const svg = ctx.toString();
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('stroke="#E45B45"');
    expect(svg).toContain('>A</text>');
    expect(svg).not.toContain('NaN');
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
