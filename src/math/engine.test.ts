import { describe, expect, it } from 'vitest';
import { evaluateAll, missingSymbols } from './engine';
import { categorize, splitDefinition } from './parser';
import { roots } from './solve';
import type { MObj } from './types';

let id = 0;
const o = (input: string, name = 'f', extra: Partial<MObj> = {}): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true, ...extra });
const ev = (...objs: MObj[]) => evaluateAll(objs);

describe('parser', () => {
  it('splits definitions', () => {
    expect(splitDefinition('f(x) = x^2')).toEqual({ name: 'f', params: ['x'], body: 'x^2' });
    expect(splitDefinition('y = 2x').name).toBeUndefined();
    expect(splitDefinition('A=(1,2)').name).toBe('A');
    expect(splitDefinition('Solve(x^2=4)').name).toBeUndefined();
  });
  it('categorizes', () => {
    expect(categorize('x^2')).toBe('function');
    expect(categorize('(1,2)')).toBe('point');
    expect(categorize('x^2+y^2=9')).toBe('equation');
    expect(categorize('Segment(A,B)')).toBe('path');
    expect(categorize('3+4')).toBe('number');
    expect(categorize('x^2+y^2')).toBe('surface');
  });
});

describe('engine', () => {
  it('evaluates functions with implicit multiplication and sliders', () => {
    const [a, f] = ev(o('a = 2', 'a', { slider: { min: -5, max: 5, step: 0.1 } }), o('f(x) = a x^2 + 1'));
    expect(a.value).toMatchObject({ type: 'number', value: 2, slider: true });
    expect(f.value?.type).toBe('function');
    expect((f.value as any).f(3)).toBe(19);
  });
  it('resolves out-of-order dependencies', () => {
    const [g, f] = ev(o('g(x) = f(x) + 1', 'g'), o('f(x) = 2x'));
    expect(f.error).toBeUndefined();
    expect((g.value as any).f(2)).toBe(5);
  });
  it('solves equations', () => {
    const [s] = ev(o('Solve(x^2 = 4)', 'l1'));
    expect(s.display).toBe('x = −2, x = 2');
    const [d] = ev(o('Solve(x^2 = 0)', 'l1'));
    expect(d.display).toBe('x = 0');
    const [sys] = ev(o('Solve(x + y = 3, x - y = 1)', 'l1'));
    expect(sys.display).toBe('{x = 2, y = 1}');
  });
  it('computes derivatives, roots, intersections and integrals', () => {
    const r = ev(o('f(x) = x^3 - 3x'), o('Derivative(f)', 'g'), o('Roots(f)', 'l1'), o('Intersect(f, 2x)', 'l2'), o('Integral(f, 0, 2)', 'a'));
    expect((r[1].value as any).f(2)).toBeCloseTo(9);
    expect(r[1].tex).toContain('3');
    expect((r[2].value as any).pts.map((p: any) => p.x)).toEqual([-Math.sqrt(3), 0, Math.sqrt(3)].map((v) => expect.closeTo(v, 6)));
    expect((r[3].value as any).pts).toHaveLength(3);
    expect((r[4].value as any).value).toBeCloseTo(-2);
  });
  it('supports f prime notation', () => {
    const [, d] = ev(o('f(x) = sin(x)'), o("f'(0)", 'a'));
    expect((d.value as any).value).toBeCloseTo(1);
  });
  it('handles geometry', () => {
    const r = ev(o('A = (0,0)', 'A'), o('B = (4,0)', 'B'), o('C = (0,3)', 'C'), o('Segment(B, C)', 's'),
      o('Polygon(A,B,C)', 'p'), o('Midpoint(B,C)', 'M'), o('Circle(A, 2)', 'c'), o('Intersect(c, Line(A,B))', 'l1'), o('Angle(B,A,C)', 'al'));
    expect(r[3].display).toBe('= 5');
    expect(r[4].display).toBe('area = 6');
    expect((r[5].value as any).p).toEqual({ x: 2, y: 1.5 });
    expect((r[7].value as any).pts).toHaveLength(2);
    expect((r[8].value as any).value).toBeCloseTo(Math.PI / 2);
    expect((r[0].value as any).free).toBe(true);
  });
  it('classifies implicit and 3D input', () => {
    const r = ev(o('x^2 + y^2 = 9', 'eq1'), o('z = x^2 - y^2'), o('(1,2,3)', 'P'), o('x^2+y^2+z^2=4', 'eq2'), o('y = 2x + 1'));
    expect(r.map((x) => x.value?.type)).toEqual(['implicit', 'surface', 'point3d', 'implicit3d', 'function']);
  });
  it('reports missing symbols for auto sliders', () => {
    expect(missingSymbols('a x^2 + b', [])).toEqual(['a', 'b']);
  });
  it('finds real cube roots and odd powers', () => {
    const [f] = ev(o('f(x) = x^(1/3)'));
    expect((f.value as any).f(-8)).toBeCloseTo(-2);
    expect(roots((x) => Math.tan(x), -1, 1)).toEqual([0]);
  });
});
