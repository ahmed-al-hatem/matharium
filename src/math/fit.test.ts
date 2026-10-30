import { describe, expect, it } from 'vitest';
import { fitExp, fitExpr, fitLine, fitLog, fitPoly, fitPow, fitSin, leastSquares, rSquared } from './fit';
import { evaluateAll } from './engine';
import type { MObj, Vec2 } from './types';

/** Deterministic noise so the tests never flake. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
}
const sample = (f: (x: number) => number, xs: number[], noise = 0, seed = 1) => {
  const r = rng(seed);
  return xs.map((x) => ({ x, y: f(x) + noise * gauss(r) }));
};
const range = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);

describe('least squares', () => {
  it('solves an overdetermined system exactly when consistent', () => {
    const p = leastSquares([[1, 0], [0, 1], [1, 1]], [2, 3, 5]);
    expect(p[0]).toBeCloseTo(2, 12);
    expect(p[1]).toBeCloseTo(3, 12);
  });
  it('rejects a rank-deficient system', () => {
    expect(() => leastSquares([[1, 2], [2, 4], [3, 6]], [1, 2, 3])).toThrow();
  });
  it('R² is 1 for a perfect fit and 0 for the mean', () => {
    const pts = [{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 2 }];
    expect(rSquared((x) => [1, 3, 2][x], pts)).toBe(1);
    expect(rSquared(() => 2, pts)).toBeCloseTo(0, 12);
  });
});

describe('FitLine / FitPoly', () => {
  it('recovers an exact line', () => {
    const f = fitLine(sample((x) => 3 * x - 2, range(-5, 5, 11)));
    expect(f.params[0]).toBeCloseTo(-2, 10);
    expect(f.params[1]).toBeCloseTo(3, 10);
    expect(f.r2).toBeCloseTo(1, 12);
    expect(fitExpr(f, 4)).toBe('3 x - 2');
  });
  it('recovers a cubic', () => {
    const f = fitPoly(sample((x) => 0.5 * x ** 3 - 2 * x + 1, range(-3, 3, 25)), 3);
    [1, -2, 0, 0.5].forEach((c, i) => expect(f.params[i]).toBeCloseTo(c, 9));
  });
  it('stays accurate for badly scaled x where the normal equations lose digits', () => {
    // x around 1000: x^4 ~ 1e12, the normal-equation matrix would have condition ~1e30
    const f = fitPoly(sample((x) => 2 + 0.01 * (x - 1000) ** 2, range(995, 1005, 21)), 2);
    expect(f.r2).toBeGreaterThan(0.999999);
    expect(f.f(1003)).toBeCloseTo(2.09, 6);
  });
  it('fits noisy quadratic data well', () => {
    const f = fitPoly(sample((x) => x * x - x, range(-4, 4, 40), 0.2, 7), 2);
    expect(f.params[2]).toBeCloseTo(1, 1);
    expect(f.r2).toBeGreaterThan(0.99);
  });
  it('needs enough points', () => {
    expect(() => fitPoly([{ x: 1, y: 2 }, { x: 2, y: 3 }], 2)).toThrow(/at least 3/);
    expect(() => fitLine([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toThrow();
  });
});

describe('FitExp / FitLog / FitPow', () => {
  it('FitExp recovers a·e^(bx) from noisy data within 2% and R² > 0.99', () => {
    const xs = range(0, 6, 30);
    const pts = sample((x) => 2.5 * Math.exp(0.45 * x), xs).map((p, i) => ({ x: p.x, y: p.y * (1 + 0.01 * gauss(rng(100 + i))) }));
    const f = fitExp(pts);
    expect(rel(f.params[0], 2.5)).toBeLessThan(0.02);
    expect(rel(f.params[1], 0.45)).toBeLessThan(0.02);
    expect(f.r2).toBeGreaterThan(0.99);
  });
  it('FitExp handles decay and negative data', () => {
    const d = fitExp(sample((x) => 8 * Math.exp(-0.7 * x), range(0, 5, 12)));
    expect(d.params[0]).toBeCloseTo(8, 8);
    expect(d.params[1]).toBeCloseTo(-0.7, 8);
    const n = fitExp(sample((x) => -3 * Math.exp(0.2 * x), range(0, 5, 12)));
    expect(n.params[0]).toBeCloseTo(-3, 8);
  });
  it('FitExp refines with Gauss–Newton beyond the log-linear guess', () => {
    // additive noise biases the log fit; least squares on y itself must have a smaller residual
    const pts = sample((x) => 5 * Math.exp(0.3 * x), range(0, 10, 40), 1, 3);
    const f = fitExp(pts);
    const sse = (g: (x: number) => number) => pts.reduce((s, p) => s + (p.y - g(p.x)) ** 2, 0);
    const [la, b] = leastSquares(pts.map((p) => [1, p.x]), pts.map((p) => Math.log(p.y)));
    expect(sse(f.f)).toBeLessThan(sse((x) => Math.exp(la + b * x)));
  });
  it('FitLog recovers a + b ln x', () => {
    const f = fitLog(sample((x) => 1.5 + 2 * Math.log(x), range(0.5, 20, 30), 0.05, 11));
    expect(f.params[0]).toBeCloseTo(1.5, 1);
    expect(rel(f.params[1], 2)).toBeLessThan(0.02);
    expect(f.r2).toBeGreaterThan(0.99);
    expect(() => fitLog([{ x: 0, y: 1 }, { x: 1, y: 2 }])).toThrow(/x > 0/);
  });
  it('FitPow recovers a·x^b', () => {
    const f = fitPow(sample((x) => 3 * x ** 1.7, range(0.5, 6, 25), 0.05, 5));
    expect(rel(f.params[0], 3)).toBeLessThan(0.02);
    expect(rel(f.params[1], 1.7)).toBeLessThan(0.02);
    expect(f.r2).toBeGreaterThan(0.99);
  });
});

describe('FitSin', () => {
  it('recovers amplitude, frequency, phase and offset from noisy samples', () => {
    const f = fitSin(sample((x) => 3 * Math.sin(2 * x + 0.5) + 1, range(0, 10, 60), 0.1, 9));
    const [a, b, c, d] = f.params;
    expect(rel(a, 3)).toBeLessThan(0.02);
    expect(rel(b, 2)).toBeLessThan(0.01);
    expect(c).toBeCloseTo(0.5, 1);
    expect(d).toBeCloseTo(1, 1);
    expect(f.r2).toBeGreaterThan(0.99);
  });
  it('works with unevenly spaced x', () => {
    const r = rng(42);
    const xs = Array.from({ length: 50 }, () => r() * 12).sort((p, q) => p - q);
    const f = fitSin(sample((x) => 0.8 * Math.sin(1.3 * x - 1) - 2, xs));
    expect(f.params[0]).toBeCloseTo(0.8, 6);
    expect(f.params[1]).toBeCloseTo(1.3, 6);
    expect(f.params[3]).toBeCloseTo(-2, 6);
  });
  it('rejects too few points', () => {
    expect(() => fitSin([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow();
  });
});

describe('Fit commands', () => {
  let id = 0;
  const o = (input: string, name: string): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true });
  const pts: Vec2[] = range(0, 4, 9).map((x) => ({ x, y: 2 * Math.exp(0.5 * x) }));
  const list = `{${pts.map((p) => `(${p.x}, ${p.y})`).join(', ')}}`;

  it('accept a list literal or a list name and show R²', () => {
    const r = evaluateAll([o(list, 'l1'), o('FitExp(l1)', 'f'), o(`FitLine(${list})`, 'g'), o('FitPoly(l1, 2)', 'h')]);
    expect(r.map((x) => x.error)).toEqual([undefined, undefined, undefined, undefined]);
    expect(r[1].value?.type).toBe('function');
    expect((r[1].value as any).f(1)).toBeCloseTo(2 * Math.exp(0.5), 8);
    expect(r[1].display).toBe('R² = 1');
    expect(r[1].tex).toMatch(/^f\(x\) = 2/);
    expect(r[2].display).toMatch(/^R² = 0\.9/);
  });
  it('the fitted function can be differentiated', () => {
    const r = evaluateAll([o(list, 'l1'), o('FitExp(l1)', 'f'), o("f'(2)", 'a')]);
    expect((r[2].value as any).value).toBeCloseTo(Math.exp(1), 5);
  });
  it('report bad input as errors', () => {
    const r = evaluateAll([o('FitPoly({(1,2)}, 3)', 'f'), o('FitExp(3)', 'g'), o('FitPoly({(1,2), (2,3)})', 'h')]);
    expect(r[0].error).toMatch(/at least 4/);
    expect(r[1].error).toMatch(/list of points/);
    expect(r[2].error).toMatch(/needs 2 arguments/);
  });
});
