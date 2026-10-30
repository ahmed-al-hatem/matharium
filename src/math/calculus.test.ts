import { describe, expect, it } from 'vitest';
import { polyAt, polyText, riemannSum, rk4, solveODE, taylorCoeffs } from './calculus';
import { evaluateAll } from './engine';
import type { MObj } from './types';

let id = 0;
const o = (input: string, name = `o${id}`): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true });
const sq = (x: number) => x * x;
const fnOf = (v: unknown) => (v as { f(x: number): number }).f;

describe('Riemann sums', () => {
  it('matches the acceptance value for the midpoint rule', () => {
    expect(riemannSum(sq, 0, 1, 100, 'mid')).toBeCloseTo(0.33332, 5);
  });
  it('brackets an increasing function and the trapezoid overestimates a convex one', () => {
    const l = riemannSum(sq, 0, 1, 10, 'left'), r = riemannSum(sq, 0, 1, 10, 'right'), t = riemannSum(sq, 0, 1, 10, 'trap');
    expect(l).toBeCloseTo(0.285, 10);
    expect(r).toBeCloseTo(0.385, 10);
    expect(t).toBeCloseTo((l + r) / 2, 12);
    expect(t).toBeGreaterThan(1 / 3);
  });
  it('is exact for linear functions with the midpoint rule', () => {
    expect(riemannSum((x) => 3 * x + 1, -2, 4, 7, 'mid')).toBeCloseTo(24, 10);
  });
  it('works through the engine, also with a slider for n', () => {
    const r = evaluateAll([o('n = 100', 'n'), o('RiemannSum(x^2, 0, 1, n, "mid")', 'a')]);
    expect(r[1].value).toMatchObject({ type: 'riemann', n: 100, rule: 'mid' });
    expect((r[1].value as { value: number }).value).toBeCloseTo(0.33332, 5);
    expect(evaluateAll([o('RiemannSum(x^2, 0, 1, 4, "middle")')])[0].error).toMatch(/Rule must be/);
  });
});

describe('ODE solutions', () => {
  it("y' = y from (0, 1) matches e^x at x = 2 within 1e-4", () => {
    const f = solveODE((_x, y) => y, 0, 1);
    expect(Math.abs(f(2) - Math.exp(2))).toBeLessThan(1e-4);
    expect(Math.abs(f(-1.234) - Math.exp(-1.234))).toBeLessThan(1e-6);
    expect(Math.abs(f(0.005) - Math.exp(0.005))).toBeLessThan(1e-9);
  });
  it("y' = -x/y is a circle through (0, 2) and stops where the slope blows up", () => {
    const f = solveODE((x, y) => -x / y, 0, 2);
    expect(f(1)).toBeCloseTo(Math.sqrt(3), 6);
    expect(f(3)).toBeNaN();
  });
  it('rk4 has fourth order accuracy', () => {
    const err = (h: number) => Math.abs(rk4((_x, y) => y, 0, 1, h, Math.round(1 / h)).ys[Math.round(1 / h)] - Math.E);
    expect(err(0.1) / err(0.05)).toBeGreaterThan(14);
  });
  it('SolveODE through a named point follows the point', () => {
    const r = evaluateAll([o('A = (0, 1)', 'A'), o('SolveODE(y, A)', 'f')]);
    expect(r[1].value?.type).toBe('function');
    expect(fnOf(r[1].value)(1)).toBeCloseTo(Math.E, 6);
    const r2 = evaluateAll([o('A = (0, 2)', 'A'), o('SolveODE(y, A)', 'f')]);
    expect(fnOf(r2[1].value)(1)).toBeCloseTo(2 * Math.E, 6);
  });
  it('SlopeField compiles f(x, y)', () => {
    const [s] = evaluateAll([o('SlopeField(x - y)', 'f')]);
    expect(s.value?.type).toBe('slopefield');
    expect((s.value as { F(x: number, y: number): number }).F(3, 1)).toBe(2);
  });
});

describe('Taylor polynomials', () => {
  it('coefficients and text', () => {
    expect(taylorCoeffs([1, 1, 1, 1])).toEqual([1, 1, 0.5, 1 / 6]);
    expect(polyText([0, 1, 0, -1 / 6], 0, 4)).toBe('x - 0.1667 x^3');
    expect(polyText([1, -2], 1)).toBe('1 - 2 (x - 1)');
    expect(polyAt([1, 2, 3], 1)(2)).toBe(6);
  });
  it('sin(x) to degree 5 at 0', () => {
    const [t] = evaluateAll([o('TaylorPolynomial(sin(x), 0, 5)', 'p')]);
    expect(fnOf(t.value)(0.5)).toBeCloseTo(0.5 - 0.5 ** 3 / 6 + 0.5 ** 5 / 120, 12);
    expect(t.tex).toContain('p(x)');
  });
  it('e^x at a = 1 of a named function', () => {
    const r = evaluateAll([o('f(x) = exp(x)', 'f'), o('TaylorPolynomial(f, 1, 8)', 'p')]);
    expect(fnOf(r[1].value)(1.3)).toBeCloseTo(Math.exp(1.3), 8);
  });
});

describe('IntegralBetween', () => {
  it('area between x and x^2 on [0, 1] is 1/6', () => {
    const [a] = evaluateAll([o('IntegralBetween(x, x^2, 0, 1)', 'a')]);
    expect(a.value).toMatchObject({ type: 'between' });
    expect((a.value as { value: number }).value).toBeCloseTo(1 / 6, 10);
  });
});
