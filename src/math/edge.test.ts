import { describe, expect, it } from 'vitest';
import { evaluateAll, missingSymbols } from './engine';
import { draw, type Ctx } from '../graph2d/renderer';
import { SvgCtx } from '../graph2d/svgctx';
import type { MObj } from './types';
import type { View } from '../store/project';

let id = 0;
const o = (input: string, name = `o${id}`): MObj => ({ id: String(id++), name, input, color: '#E45B45', visible: true });
const settings = { grid: true, axes: true, labels: true, snap: true, digits: 4, range3d: 6, lang: 'en' as const };

describe('engine never throws on odd input', () => {
  const odd = [
    '', '   ', '(((', ')', 'x^', '1/0', 'sqrt(-1)', 'f(x) = f(x)', 'Segment(A)', 'Foo(1, 2)', 'ابحث عن x',
    '='.repeat(5), 'x'.repeat(2000), '(1, 2, 3, 4)', '{(1,2), 3}', 'Solve()', 'Circle((0,0), -1)', 'Curve(t, t, t, 0)',
    'Integral(x, 1)', '"text"', 'x <= y <= 1', '1e999', '0/0', 'A = (1, )', 'y = ', 'Polygon(A, B)', 'Roots(x^2 + 1)',
  ];
  it.each(odd)('%j', (input) => {
    let res: ReturnType<typeof evaluateAll> | undefined;
    expect(() => { res = evaluateAll([o(input, 'f')]); }).not.toThrow();
    expect(res).toHaveLength(1);
    const r = res![0];
    expect(r.error || r.value).toBeTruthy();
  });

  it('reports cycles instead of hanging', () => {
    const r = evaluateAll([o('a = b + 1', 'a'), o('b = a + 1', 'b')]);
    expect(r.every((x) => x.error)).toBe(true);
  });

  it('resolves commands that reference objects defined later', () => {
    const r = evaluateAll([o('Segment(P, Q)', 's'), o('Circle(P, r)', 'c'), o('P = (0, 0)', 'P'), o('Q = (3, 4)', 'Q'), o('r = 2', 'r')]);
    expect(r[0].display).toBe('= 5');
    expect(r[1].value).toMatchObject({ type: 'circle', r: 2 });
  });

  it('missingSymbols terminates on garbage', () => {
    expect(() => missingSymbols('(((', [])).not.toThrow();
    expect(missingSymbols('Derivative(f)', [])).toEqual([]);
  });

  it('splits implicit products but keeps known names', () => {
    const [f] = evaluateAll([o('xy + 1', 'f')]);
    expect(f.value?.type).toBe('surface');
    const [, g] = evaluateAll([o('xy = 3', 'xy'), o('xy * 2', 'g')]);
    expect(g.value).toMatchObject({ type: 'number', value: 6 });
  });
});

describe('renderer is robust at extreme views', () => {
  const objs = [o('tan(x)', 'f'), o('1/x', 'g'), o('x^2 + y^2 = 0', 'eq1'), o('y > sin(x)', 'h'), o('A = (1, 2)', 'A'), o('Circle(A, 3)', 'c'), o('Integral(sin(x), 0, 3)', 'a'),
    o('RiemannSum(x^2, -1, 2, 30, "trap")', 'b'), o('IntegralBetween(x, x^2, 0, 1)', 'd'), o('SlopeField(x - y)', 's'), o('SolveODE(y, (0, 1))', 'u'),
    o('Histogram({1, 2, 2, 3, 7}, 1)', 'l1'), o('BoxPlot({1, 2, 2, 3, 7})', 'l2'), o('Binomial(8, 0.3, 2, 4)', 'l3'), o('Normal(0, 1, -1, 2)', 'n'),
    o('P = Point(c, 0.3)', 'P'), o('Q = Midpoint(P, A)', 'Q'), o('Locus(Q, P)', 'k')];
  const views: View[] = [
    { ox: 0, oy: 0, sx: 1e-4, sy: 1e-4 },
    { ox: 0, oy: 0, sx: 1e6, sy: 1e6 },
    { ox: 1e9, oy: -1e9, sx: 50, sy: 50 },
    { ox: 0, oy: 0, sx: 50, sy: 0.5 },
  ];
  it.each(views)('view %j', (view) => {
    const ctx = new SvgCtx(800, 600);
    draw(ctx, evaluateAll(objs), { W: 800, H: 600, view, settings, selectedId: 'x' });
    expect(ctx.toString()).not.toMatch(/NaN|Infinity/);
  });
});

/** Context that does nothing, to time the renderer's own work. */
const noop = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => undefined), set: () => true }) as unknown as Ctx;

describe('performance budgets', () => {
  it('evaluates 300 mixed objects quickly', () => {
    const objs: MObj[] = [];
    for (let i = 0; i < 60; i++) {
      objs.push(o(`P${i} = (${i % 7}, ${i % 5})`, `P${i}`), o(`k${i} = ${i}`, `k${i}`), o(`f${i}(x) = k${i} sin(x) + x^2`, `f${i}`),
        o(`Segment(P${i}, P${(i + 1) % 60})`, `s${i}`), o(`Roots(f${i}, -3, 3)`, `r${i}`));
    }
    evaluateAll(objs); // warm up
    const t = performance.now();
    const res = evaluateAll(objs);
    const ms = performance.now() - t;
    expect(res.filter((r) => r.error)).toEqual([]);
    expect(ms).toBeLessThan(250); // ~130 ms measured; headroom for slower machines
    console.log(`evaluateAll(300): ${ms.toFixed(0)} ms`);
  });

  it('draws five implicit curves at 1400x860 within budget', () => {
    const objs = [o('x^2 + y^2 = 9'), o('x^3 - y^2 = 1'), o('sin(x) = cos(y)'), o('x y = 2'), o('x^2 - y^2 = 1')];
    const items = evaluateAll(objs);
    const opts = { W: 1400, H: 860, view: { ox: 0, oy: 0, sx: 50, sy: 50 }, settings, selectedId: null };
    draw(noop, items, opts);
    const t = performance.now();
    draw(noop, items, opts);
    const ms = performance.now() - t;
    expect(ms).toBeLessThan(120);
    console.log(`draw 5 implicit: ${ms.toFixed(0)} ms`);
  });
});
