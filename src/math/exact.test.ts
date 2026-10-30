import { describe, expect, it } from 'vitest';
import { exactRoots, factoredTex, factoredText, factorPoly, polyCoefficients, rationalRoots, syntheticDivision, toExact, type Poly } from './exact';
import { evaluateAll } from './engine';
import { math, parseExpr } from './compile';
import type { MObj } from './types';

const coeffs = (src: string, v = 'x') => polyCoefficients(parseExpr(src), v)!;
const nums = (p: Poly) => p.map((c) => c.valueOf());

describe('toExact', () => {
  const cases: [number, string][] = [
    [0, '0'], [3, '3'], [-7, '−7'], [0.5, '1/2'], [1 / 3, '1/3'], [-2 / 3, '−2/3'], [0.1 + 0.2, '3/10'],
    [22 / 7, '22/7'], [355 / 113, '355/113'], [1 / 997, '1/997'], [1234 / 999, '1234/999'], [1e10, '10000000000'],
    [Math.SQRT2, '√2'], [-Math.sqrt(3), '−√3'], [Math.sin(Math.PI / 4), '√2/2'], [Math.cos(Math.PI / 6), '√3/2'],
    [Math.tan(Math.PI / 6), '√3/3'], [3 * Math.sqrt(2), '3√2'], [Math.sqrt(8), '2√2'], [Math.sqrt(12) / 5, '2√3/5'],
    [Math.PI, 'π'], [-Math.PI, '−π'], [Math.PI / 2, 'π/2'], [3 * Math.PI / 4, '3π/4'], [2 * Math.PI, '2π'], [Math.acos(-0.5), '2π/3'],
    [(3 + Math.sqrt(17)) / 4, '(3 + √17)/4'], [(3 - Math.sqrt(17)) / 4, '(3 − √17)/4'], [1 + Math.SQRT2, '1 + √2'],
    [(1 + Math.sqrt(5)) / 2, '(1 + √5)/2'], [(-1 - 2 * Math.sqrt(3)) / 5, '(−1 − 2√3)/5'], [2 - Math.sqrt(3), '2 − √3'],
  ];
  it.each(cases)('%d → %s', (v, text) => expect(toExact(v)?.text).toBe(text));

  const plain = [0.123456789, Math.E, Math.PI ** 2, Math.log(2), 1 / 1009, 0.3183, Math.sqrt(2) + Math.PI, 1e-7, 123.456789012, Math.cbrt(2), Infinity, NaN];
  it.each(plain)('%d has no exact form', (v) => expect(toExact(v)).toBeNull());

  it('gives LaTeX too', () => {
    expect(toExact(1 / 3)?.tex).toBe('\\frac{1}{3}');
    expect(toExact(-0.5)?.tex).toBe('-\\frac{1}{2}');
    expect(toExact(Math.SQRT1_2)?.tex).toBe('\\frac{\\sqrt{2}}{2}');
    expect(toExact(Math.PI / 2)?.tex).toBe('\\frac{\\pi}{2}');
    expect(toExact((3 - Math.sqrt(17)) / 4)?.tex).toBe('\\frac{3 - \\sqrt{17}}{4}');
  });
});

describe('polynomials', () => {
  it('extracts exact rational coefficients', () => {
    expect(nums(coeffs('2x^2 - 3x - 1'))).toEqual([-1, -3, 2]);
    expect(nums(coeffs('x^2/2 + 1/3'))).toEqual([1 / 3, 0, 1 / 2]);
    expect(coeffs('x^2/3')[2].d).toBe(3);
    expect(nums(coeffs('(x + 1)^3'))).toEqual([1, 3, 3, 1]);
    expect(nums(coeffs('5'))).toEqual([5]);
    expect(nums(polyCoefficients(parseExpr('a x^2 + b'), 'x', { a: 2, b: -8 })!)).toEqual([-8, 0, 2]);
  });
  it('rejects non-polynomials', () => {
    for (const s of ['sin(x)', 'x + 1/x', 'x^2 - pi', 'sqrt(x)', 'x^2 + y']) expect(polyCoefficients(parseExpr(s), 'x')).toBeNull();
  });
  it('divides synthetically and finds rational roots', () => {
    const { quotient, remainder } = syntheticDivision(coeffs('x^3 - 6x^2 + 11x - 6'), math.fraction(1) as never);
    expect(nums(quotient)).toEqual([6, -5, 1]);
    expect(remainder.valueOf()).toBe(0);
    expect(rationalRoots(coeffs('6x^3 - 11x^2 + 6x - 1')).roots.map((r) => r.valueOf())).toEqual([1 / 3, 1 / 2, 1]);
  });
  it('solves exactly', () => {
    const t = (s: string) => exactRoots(coeffs(s));
    expect(t('2x^2 - 3x - 1').roots.map((r) => r.text)).toEqual(['(3 − √17)/4', '(3 + √17)/4']);
    expect(t('x^2 - 2').roots.map((r) => r.text)).toEqual(['−√2', '√2']);
    expect(t('(x - 1)^2').roots.map((r) => r.text)).toEqual(['1']);
    expect(t('x^2 + 1')).toEqual({ roots: [], complete: true });
    expect(t('x^4 - 5x^2 + 4').roots.map((r) => r.text)).toEqual(['−2', '−1', '1', '2']);
    expect(t('(x - 2)(x^2 - 3)').roots.map((r) => r.text)).toEqual(['−√3', '√3', '2']);
    expect(t('x^3 - 2').complete).toBe(false);
  });
});

describe('Factor', () => {
  const fac = (s: string) => factoredText(factorPoly(coeffs(s)));
  const cases: [string, string][] = [
    ['x^3 - 6x^2 + 11x - 6', '(x − 1)(x − 2)(x − 3)'],
    ['2x^2 - 8', '2(x − 2)(x + 2)'],
    ['x^2 + 1', 'x² + 1'],
    ['x^2 - 4', '(x − 2)(x + 2)'],
    ['x^2 - 2x + 1', '(x − 1)²'],
    ['3x^2 + 6x', '3x(x + 2)'],
    ['x^3', 'x³'],
    ['x^4 - 16', '(x − 2)(x + 2)(x² + 4)'],
    ['x^4 - 4', '(x² − 2)(x² + 2)'],
    ['4x^2 - 9', '(2x − 3)(2x + 3)'],
    ['6x^2 + x - 1', '(2x + 1)(3x − 1)'],
    ['-x^2 + 4', '−(x − 2)(x + 2)'],
    ['x^2/2 - 2', '(1/2)(x − 2)(x + 2)'],
    ['x^3 - x', 'x(x − 1)(x + 1)'],
    ['x^3 + 1', '(x + 1)(x² − x + 1)'],
    ['x^2 + x + 1', 'x² + x + 1'],
    ['2x + 4', '2(x + 2)'],
    ['x^4 - 2x^3 + x^2', 'x²(x − 1)²'],
    ['x^5 - x', 'x(x − 1)(x + 1)(x² + 1)'],
    ['(x - 1)^3', '(x − 1)³'],
    ['7', '7'],
  ];
  it.each(cases)('%s = %s', (src, text) => expect(fac(src)).toBe(text));

  it('keeps the value of the polynomial', () => {
    for (const [src] of cases) {
      const f = factorPoly(coeffs(src));
      const g = (x: number) => (f.content.valueOf()) * f.factors.reduce((p, { ints, mult }) => p * ints.reduce((s, c, i) => s + c * x ** i, 0) ** mult, 1);
      const h = parseExpr(src).compile();
      for (const x of [-2.5, -1, 0.3, 1.7, 3]) expect(g(x)).toBeCloseTo(h.evaluate({ x }), 8);
    }
  });

  it('renders LaTeX', () => {
    expect(factoredTex(factorPoly(coeffs('2x^2 - 8')))).toBe('2\\left(x-2\\right)\\left(x+2\\right)');
    expect(factoredTex(factorPoly(coeffs('x^2 - 2x + 1')))).toBe('\\left(x-1\\right)^{2}');
  });
});

let id = 0;
const o = (input: string, name = 'f'): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true });
const one = (input: string, name = 'l1') => evaluateAll([o(input, name)])[0];

describe('engine exact display', () => {
  it('solves quadratics exactly, decimals stay available', () => {
    const r = one('Solve(2x^2 - 3x - 1 = 0)');
    expect(r.exact).toBe('x = (3 − √17)/4, x = (3 + √17)/4');
    expect(r.display).toBe('x = −0.2808, x = 1.7808');
  });
  it('solves polynomials with rational roots exactly, even outside the numeric range', () => {
    expect(one('Solve(6x^3 - 11x^2 + 6x = 1)').exact).toBe('x = 1/3, x = 1/2, x = 1');
    expect(one('Solve(x^2 = 1000000)').display).toBe('x = −1000, x = 1000');
    expect(one('Solve(x^2 + 1 = 0)').display).toBe('no real solution');
  });
  it('falls back to numeric for everything else', () => {
    const r = one('Solve(x^3 - 2x - 5 = 0)');
    expect(r.display).toBe('x = 2.0946');
    expect(r.exact).toBeUndefined();
    expect(one('Solve(sin(x) = 0.5, x)').display).toContain('x = 0.5236');
  });
  it('shows integrals, numbers and angles exactly', () => {
    expect(one('Integral(x^2, 0, 1)', 'a').exact).toBe('= 1/3');
    expect(one('Integral(x^2, 0, 1)', 'a').display).toBe('= 0.3333');
    expect(one('sin(pi/4)', 'a').exact).toBe('= √2/2');
    const r = evaluateAll([o('A = (1, 0)', 'A'), o('B = (0, 0)', 'B'), o('C = (0, 5)', 'C'), o('Angle(A, B, C)', 'al')]);
    // angles follow the angle unit: radians by default (exactly π/2), degrees on request
    expect(r[3].display).toBe('= 1.5708 rad');
    expect(r[3].exact).toBe('= π/2');
    const d = evaluateAll([o('A = (1, 0)', 'A'), o('B = (0, 0)', 'B'), o('C = (0, 5)', 'C'), o('Angle(A, B, C)', 'al')], 4, {}, { angle: 'deg' });
    expect(d[3].display).toBe('= 90°');
  });
  it('shows roots, extrema, intersections and points exactly', () => {
    const r = evaluateAll([o('f(x) = x^2 - 2'), o('Roots(f)', 'l1'), o('Extremum(x^3 - 6x)', 'l2'), o('Intersect(f, x)', 'l3'), o('Midpoint((0,0), (1,1))', 'M')]);
    expect(r[1].exact).toBe('(−√2, 0), (√2, 0)');
    expect(r[2].exact).toBe('(−√2, 4√2), (√2, −4√2)');
    expect(r[3].exact).toBeUndefined();
    expect(r[4].exact).toBe('(1/2, 1/2)');
  });
  it('factors via the Factor command and keeps the function', () => {
    const r = evaluateAll([o('Factor(x^3 - 6x^2 + 11x - 6)', 'g'), o('p(x) = 2x^2 - 8', 'p'), o('Factor(p)', 'h'), o('Factor(sin(x))', 'k')]);
    expect(r[0].display).toBe('= (x − 1)(x − 2)(x − 3)');
    expect((r[0].value as { f(x: number): number }).f(4)).toBe(6);
    expect(r[2].display).toBe('= 2(x − 2)(x + 2)');
    expect(r[2].value).toMatchObject({ type: 'function', tex: '2\\left(x-2\\right)\\left(x+2\\right)' });
    expect(r[3].error).toMatch(/polynomial/);
  });
  it('uses sliders when they are rational', () => {
    const r = evaluateAll([{ ...o('a = 2', 'a'), slider: { min: -5, max: 5, step: 0.1 } }, o('Solve(a x^2 = 6)', 'l1')]);
    expect(r[1].exact).toBe('x = −√3, x = √3');
  });
});
