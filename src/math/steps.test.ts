import { describe, expect, it } from 'vitest';
import type { MathNode } from 'mathjs';
import { compileFn, math, parseExpr } from './compile';
import { normalize, splitRelation } from './parser';
import { factoredTex, factorPoly, polyCoefficients } from './exact';
import { derivativeSteps, factorSteps, formatNote, solveSteps, systemSteps, type Step } from './steps';
import { roots } from './solve';
import { evaluateAll } from './engine';
import { translate } from '../i18n/i18n';
import type { MObj } from './types';

const P = [-2.7, -1.3, -0.45, 0.35, 0.9, 1.65, 2.45, 3.8];
const close = (a: number, b: number, tol = 1e-7) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** Evaluate a check string; D(u) is the derivative of u (computed by mathjs, independently of steps.ts). */
function at(src: string, scope: Record<string, number>, v = 'x'): number {
  const node = math.parse(src).transform((n: any) => (n.isFunctionNode && n.fn.name === 'D' ? derive(n.args[0], v) : n));
  return node.evaluate({ ...scope }) as number;
}

/** mathjs derivative (it knows log, not the app's ln alias). */
const derive = (n: MathNode, v: string) =>
  math.derivative(n.transform((m: any) => (m.isFunctionNode && m.fn.name === 'ln' ? new math.FunctionNode('log', m.args) : m)), v);

function sides(src: string): [MathNode, MathNode] {
  const rel = splitRelation(normalize(src));
  return rel ? [parseExpr(rel.lhs), parseExpr(rel.rhs)] : [parseExpr(normalize(src)), parseExpr('0')];
}

/** Every step of an equation's solution is equivalent to it, consistent, or one of its solutions. */
function checkEquation(src: string, steps: Step[], v = 'x') {
  const [l, r] = sides(src);
  const orig = compileFn(new math.OperatorNode('-', 'subtract', [l, new math.ParenthesisNode(r)]) as MathNode, [v], {}) as (x: number) => number;
  for (const s of steps) {
    const c = s.check;
    if (c.kind === 'eq') {
      // same solutions: (lhs − rhs) is a fixed nonzero multiple of the original
      const g = (x: number) => at(c.lhs, { [v]: x }, v) - at(c.rhs, { [v]: x }, v);
      const ratios = P.filter((x) => Math.abs(orig(x)) > 1e-6).map((x) => g(x) / orig(x));
      if (!ratios.length) for (const x of P) expect(g(x), s.tex).toBeCloseTo(0, 9);
      for (const q of ratios) expect(close(q, ratios[0]) && Math.abs(ratios[0]) > 1e-12, `${s.tex}: ratio ${q} vs ${ratios[0]}`).toBe(true);
    } else if (c.kind === 'solutions') {
      const xs = c.sols.map((sol) => at(sol[v], {}, v)).sort((a, b) => a - b);
      for (const x of xs) expect(Math.abs(orig(x)), `${s.tex} at ${x}`).toBeLessThan(1e-7 * Math.max(1, Math.abs(x)) ** 6);
      if (c.partial) continue;
      const want = roots(orig, -100, 100);
      expect(xs.length, s.tex).toBe(want.length);
      xs.forEach((x, i) => expect(close(x, want[i], 1e-6), `${s.tex}: ${x} vs ${want[i]}`).toBe(true));
    } else if (c.kind === 'values') {
      const vals = c.parts.map((p) => at(p, {}));
      for (const x of vals) expect(close(x, vals[0]), s.tex).toBe(true);
    } else expect(c.kind, s.tex).toBe('info');
  }
}

const solve = (src: string, v = 'x') => {
  const steps = solveSteps(...sides(src), v);
  expect(steps, src).not.toBeNull();
  checkEquation(src, steps!, v);
  return steps!;
};
const last = (s: Step[]) => s[s.length - 1];

describe('linear equations', () => {
  it('3(x − 2) = x + 4 takes 4 steps: expand, move, combine, divide', () => {
    const s = solve('3(x - 2) = x + 4');
    expect(s.map((x) => x.note)).toEqual(['steps.expand', 'steps.move', 'steps.combine', 'steps.divide']);
    expect(s.map((x) => x.tex)).toEqual(['3x - 6 = x + 4', '3x - x = 4 + 6', '2x = 10', 'x = 5']);
    expect(s[3].args).toEqual({ k: '2' });
  });
  it.each([
    ['2x + 3 = 7', 'x = 2'], ['5 - x = 2x + 11', 'x = -2'], ['x/2 + 1 = 3', 'x = 4'], ['2(x + 1) + 3(x - 1) = 9', 'x = 2'],
    ['4x = 6', 'x = \\frac{3}{2}'], ['-(x - 3) = 2x', 'x = 1'], ['x + x + x = 3', 'x = 1'], ['0.5x - 0.25 = 1', 'x = \\frac{5}{2}'],
    ['7 = 3x + 1', 'x = 2'], ['x - 4 = 0', 'x = 4'], ['2(3t - 1) = t + 8', 't = 2'],
  ])('%s', (src, end) => {
    const v = src.includes('t') ? 't' : 'x';
    expect(last(solve(src, v)).tex).toBe(end);
  });
  it('identities and contradictions', () => {
    expect(last(solve('2(x + 1) = 2x + 2')).note).toBe('steps.identity');
    expect(last(solve('x + 1 = x + 2')).note).toBe('steps.contradiction');
  });
  it('slider values are substituted', () => {
    const s = solveSteps(parseExpr('a x + b'), parseExpr('0'), 'x', { a: 2, b: -6 })!;
    expect(last(s).tex).toBe('x = 3');
  });
});

describe('quadratics', () => {
  it('2x² − 3x − 1 = 0 uses Δ and the formula with exact roots', () => {
    const s = solve('2x^2 - 3x - 1 = 0');
    expect(s.map((x) => x.note)).toEqual(['steps.discriminant', 'steps.formula', 'steps.simplifyRoots']);
    expect(s[0].tex).toContain('= 17');
    expect(last(s).tex).toBe('x = \\frac{3 - \\sqrt{17}}{4},\\quad x = \\frac{3 + \\sqrt{17}}{4}');
  });
  it('factors when Δ is a perfect square', () => {
    const s = solve('x^2 = 2x + 3');
    expect(s.map((x) => x.note)).toEqual(['steps.standard', 'steps.discriminant', 'steps.factorQuad', 'steps.zeroProduct']);
    expect(s[0].tex).toBe('x^{2} - 2x - 3 = 0');
    expect(s[2].tex).toBe('\\left(x+1\\right)\\left(x-3\\right) = 0');
    expect(last(s).tex).toBe('x = -1,\\quad x = 3');
  });
  it.each([
    '(x + 1)^2 = 4', 'x^2 - 2 = 0', 'x^2 + 1 = 0', 'x^2 - 6x + 9 = 0', '2x^2 + 4x - 6 = 0', 'x^2/2 - x - 1 = 0',
    '-x^2 + 5x - 6 = 0', '6x^2 - 5x + 1 = 0', 'x*(x - 4) = 5', '3x^2 = 12', 'x^2 + x = 0', '(2x - 1)(x + 3) = 0', 'x^2 - 4x + 1 = 0',
  ])('%s', (src) => { solve(src); });
  it('scales to integer coefficients first', () => {
    const s = solve('2x^2 + 4x - 6 = 0');
    expect(s[0]).toMatchObject({ note: 'steps.divide', args: { k: '2' }, tex: 'x^{2} + 2x - 3 = 0' });
    expect(solve('x^2/2 - x - 1 = 0')[0]).toMatchObject({ note: 'steps.multiply', args: { k: '2' } });
    expect(solve('-x^2 + 5x - 6 = 0')[0]).toMatchObject({ note: 'steps.multiply', args: { k: '−1' } });
  });
  it('a negative discriminant means no real solution', () => {
    const s = solve('x^2 + 1 = 0');
    expect(s.map((x) => x.note)).toEqual(['steps.discriminant', 'steps.negativeDisc', 'steps.noSolution']);
  });
});

describe('polynomials with rational roots', () => {
  it('x³ − 6x² + 11x − 6 = 0: candidates, synthetic division, then the quadratic', () => {
    const s = solve('x^3 - 6x^2 + 11x - 6 = 0');
    expect(s.map((x) => x.note)).toEqual(['steps.candidates', 'steps.tryRoot', 'steps.synthetic', 'steps.discriminant', 'steps.factorQuad', 'steps.zeroProduct']);
    expect(s[0].tex).toBe('\\pm 1,\\ \\pm 2,\\ \\pm 3,\\ \\pm 6');
    expect(s[1].tex).toBe('p\\left(1\\right) = \\left(1\\right)^{3} - 6\\cdot \\left(1\\right)^{2} + 11\\cdot \\left(1\\right) - 6 = 0');
    expect(last(s).tex).toBe('x = 1,\\quad x = 2,\\quad x = 3');
  });
  it.each([
    '2x^3 - 3x^2 - 3x + 2 = 0', 'x^4 - 5x^2 + 4 = 0', 'x^3 - 2x^2 - x + 2 = 0', 'x^3 = x', '6x^3 - 11x^2 + 6x - 1 = 0',
    'x^3 - 3x - 2 = 0', '(x - 2)(x^2 - 3) = 0', 'x^3 - 2 = 0', 'x^3 + x^2 + x + 1 = 0', 'x^4 - 1 = 0', 'x^5 - x^3 = 0',
  ])('%s', (src) => { solve(src); });
  it('falls back to numeric roots when no rational root is left', () => {
    expect(last(solve('x^3 - 2 = 0')).note).toBe('steps.numericRoots');
  });
});

describe('systems of two linear equations', () => {
  function check(a: string, b: string) {
    const eqs = [sides(a), sides(b)];
    const steps = systemSteps(eqs);
    expect(steps).not.toBeNull();
    // the solution, found independently (Cramer's rule on numeric coefficients)
    const fs = eqs.map(([l, r]) => (x: number, y: number) => (l.evaluate({ x, y }) as number) - (r.evaluate({ x, y }) as number));
    const co = fs.map((f) => [f(1, 0) - f(0, 0), f(0, 1) - f(0, 0), -f(0, 0)]);
    const det = co[0][0] * co[1][1] - co[1][0] * co[0][1];
    for (const s of steps!) {
      const c = s.check;
      if (det === 0) { expect(['values', 'system']).toContain(c.kind); continue; }
      const x = (co[0][2] * co[1][1] - co[1][2] * co[0][1]) / det, y = (co[0][0] * co[1][2] - co[1][0] * co[0][2]) / det;
      if (c.kind === 'system') {
        for (const [l, r] of c.eqs) {
          expect(close(at(l, { x, y }), at(r, { x, y })), `${s.tex}: ${l} = ${r}`).toBe(true);
          // and it is a real equation, not 0 = 0
          expect(P.some((p) => !close(at(l, { x: p, y: -p / 2 }), at(r, { x: p, y: -p / 2 }))), s.tex).toBe(true);
        }
      } else if (c.kind === 'solutions') {
        expect(c.sols).toHaveLength(1);
        expect(close(at(c.sols[0].x, {}), x) && close(at(c.sols[0].y, {}), y), s.tex).toBe(true);
      } else if (c.kind === 'values') {
        const vals = c.parts.map((p) => at(p, {}));
        for (const v of vals) expect(close(v, vals[0]), s.tex).toBe(true);
      } else expect(c.kind, s.tex).toBe('info');
    }
    return steps!;
  }
  it('adds the equations when a coefficient is opposite', () => {
    const s = check('x + y = 3', 'x - y = 1');
    expect(s.map((x) => x.note)).toEqual(['steps.sysAdd', 'steps.divide', 'steps.sysSubstituteValue', 'steps.isolate', 'steps.solutions']);
    expect(s[0].tex).toBe('2x = 4');
    expect(last(s).tex).toBe('x = 2,\\quad y = 1');
  });
  it('substitutes when a coefficient is ±1 and multiplies otherwise', () => {
    expect(check('2x + y = 7', '3x - 2y = 7').map((x) => x.note)[0]).toBe('steps.sysIsolate');
    const s = check('2x + 3y = 12', '3x + 5y = 19');
    expect(s[0]).toMatchObject({ note: 'steps.sysMultiply', args: { m1: '5', m2: '3' } });
  });
  it.each([
    ['y = 2x - 1', 'x + y = 5'], ['2x + 3y = 6', '4x - 3y = 12'], ['3x - 2y = 4', '5x + 3y = 13'], ['x = 2', 'x + y = 5'],
    ['2(x - y) = 4', 'x + 3y = 10'], ['x/2 + y/3 = 2', 'x - y = -1'], ['2x = 4', '5y = 15'], ['4x + 6y = 2', '6x + 4y = 8'],
  ])('%s, %s', (a, b) => { check(a, b); });
  it('detects parallel and identical lines', () => {
    expect(last(check('x + y = 1', '2x + 2y = 5')).note).toBe('steps.sysNone');
    expect(last(check('x + y = 1', '2x + 2y = 2')).note).toBe('steps.sysInfinite');
  });
  it('rejects non-linear systems', () => {
    expect(systemSteps([sides('x^2 + y = 1'), sides('x - y = 0')])).toBeNull();
  });
});

describe('derivatives with named rules', () => {
  function check(src: string, v = 'x') {
    const node = parseExpr(src);
    const steps = derivativeSteps(node, v);
    expect(steps, src).not.toBeNull();
    const want = derive(node, v);
    for (const s of steps!) {
      expect(s.check.kind).toBe('expr');
      if (s.check.kind !== 'expr') continue;
      for (const part of s.check.parts) {
        for (const x of P.map((p) => p + 0.01)) {
          const w = want.evaluate({ [v]: x }) as number;
          if (!Number.isFinite(w) || Math.abs(w) > 1e6) continue;
          expect(close(at(part, { [v]: x }, v), w, 1e-9), `${src}: ${part} at ${x}`).toBe(true);
        }
      }
    }
    // the last line has no unevaluated d/dx left
    const end = last(steps!).check;
    expect(end.kind === 'expr' && end.parts[end.parts.length - 1]).not.toContain('D(');
    return steps!;
  }
  it('sin(x²): chain rule, then power rule, ending in 2x·cos(x²)', () => {
    const s = check('sin(x^2)');
    expect(s[0].args?.rules).toEqual(['steps.rule.sin', 'steps.rule.chain']);
    expect(s[0].tex).toBe('\\frac{d}{dx}\\left[\\sin\\left({x}^{2}\\right)\\right] = \\cos\\left({x}^{2}\\right)\\cdot \\frac{d}{dx}\\left[{x}^{2}\\right]');
    expect(s[1].args?.rules).toEqual(['steps.rule.power']);
    expect(last(s).tex).toBe('= 2x\\,\\cos\\left({x}^{2}\\right)');
  });
  it('names the product and quotient rules', () => {
    expect(check('x^2 sin(x)')[0].args?.rules).toEqual(['steps.rule.product']);
    expect(check('(x + 1)/(x - 1)')[0].args?.rules).toEqual(['steps.rule.quotient']);
    expect(check('3x^4 - 2x + 7')[0].args?.rules).toEqual(['steps.rule.sum']);
  });
  it.each([
    'x^3', '5', '3x^4 - 2x + 7', 'sqrt(x)', 'e^x', 'exp(2x)', 'ln(x^2 + 1)', 'cos(3x)', 'tan(x)', 'x e^x', 'sin(x) cos(x)',
    '2^x', '1/x', 'x^2 / (x + 1)', 'sin(x)^2', 'atan(x)', 'asin(x/2)', 'acos(x/4)', 'log10(x)', '(2x + 1)^5', 'sqrt(1 + x^2)',
    'exp(sin(x))', '-cos(x)', 'x^(1/2) + x^(-1)', 'pi x^2', 'ln(x) / x', 'e^(x^2) sin(x)',
  ])('%s', (src) => { check(src); });
  it('works in other variables and with sliders', () => {
    check('t^2 + sin(t)', 't');
    expect(last(derivativeSteps(parseExpr('a x^2'), 'x', { a: 3 })!).tex).toBe('= 6x');
  });
  it('gives up on functions it has no rule for', () => {
    expect(derivativeSteps(parseExpr('x^x'), 'x')).toBeNull();
    expect(derivativeSteps(parseExpr('abs(x)'), 'x')).toBeNull();
  });
});

describe('Factor steps', () => {
  function check(src: string) {
    const p = polyCoefficients(parseExpr(src), 'x')!;
    const steps = factorSteps(p)!;
    for (const s of steps) {
      if (s.check.kind === 'expr') {
        for (const part of s.check.parts) for (const x of P) expect(close(at(part, { x }), parseExpr(src).evaluate({ x }) as number), `${src}: ${part}`).toBe(true);
      } else if (s.check.kind === 'values') {
        const vals = s.check.parts.map((q) => at(q, {}));
        for (const v of vals) expect(close(v, vals[0]), s.tex).toBe(true);
      } else expect(s.check.kind).toBe('info');
    }
    // the last expression is the factorization Factor() shows
    const lastExpr = [...steps].reverse().find((s) => s.check.kind === 'expr');
    if (lastExpr) expect(lastExpr.tex.endsWith(factorTexOf(src))).toBe(true);
    return steps;
  }
  const factorTexOf = (src: string) => factoredTex(factorPoly(polyCoefficients(parseExpr(src), 'x')!));
  it('x³ − 6x² + 11x − 6: rational root with synthetic division, then the quadratic', () => {
    const s = check('x^3 - 6x^2 + 11x - 6');
    expect(s.map((x) => x.note)).toEqual(['steps.factorRoot', 'steps.factorQuadRoots']);
    expect(s[0].tex).toContain('\\begin{array}');
    expect(last(s).tex).toBe(' = \\left(x-1\\right)\\left(x-2\\right)\\left(x-3\\right)');
  });
  it('2x² − 8: common factor then difference of squares', () => {
    const s = check('2x^2 - 8');
    expect(s.map((x) => x.note)).toEqual(['steps.commonFactor', 'steps.diffSquares']);
    expect(s[0].args).toEqual({ f: '2' });
    expect(s[0].tex).toBe('2x^{2} - 8 = 2\\left(x^{2}-4\\right)');
  });
  it('x² + 1 stays as it is', () => {
    const s = check('x^2 + 1');
    expect(s.map((x) => x.note)).toEqual(['steps.irreducibleQuad']);
  });
  it.each([
    'x^4 - 16', 'x^3 - x', '6x^2 + x - 2', 'x^4 - 5x^2 + 4', '3x^3 - 12x', 'x^5 - x', 'x^2 - 2', '4x^2 - 12x + 9', 'x^3 + 1',
    '2x^3 - 3x^2 - 3x + 2', 'x + 1', 'x^3 - 2', 'x^2/2 - 1/2', '-x^2 + 1',
  ])('%s', (src) => { check(src); });
});

describe('notes', () => {
  it('fill placeholders and translate rule lists in both languages', () => {
    const s = solve('3(x - 2) = x + 4');
    expect(formatNote(s[3], (k) => translate('en', k))).toBe('Divide both sides by 2');
    expect(formatNote(s[3], (k) => translate('ar', k))).toContain('2');
    const d = derivativeSteps(parseExpr('sin(x^2)'))!;
    expect(formatNote(d[0], (k) => translate('en', k))).toBe('Derivative of sin, Chain rule');
    // every key used has an English and an Arabic text
    const keys = new Set<string>();
    const all = [s, solve('x^3 - 6x^2 + 11x - 6 = 0'), solve('2x^2 - 3x - 1'), solve('x^2 + 1'), d, derivativeSteps(parseExpr('x^2 sin(x) + ln(x)/x + 2^x + tan(x) + sqrt(x) + atan(x) + asin(x) + acos(x) + log10(x) + exp(x)'))!,
      systemSteps([sides('x + y = 3'), sides('x - y = 1')])!, systemSteps([sides('2x + y = 7'), sides('3x - 2y = 7')])!,
      systemSteps([sides('2x + 3y = 12'), sides('3x + 5y = 19')])!, factorSteps(polyCoefficients(parseExpr('2x^3 - 8x'))!)!];
    for (const st of all) for (const x of st) { keys.add(x.note); for (const a of Object.values(x.args ?? {})) if (Array.isArray(a)) a.forEach((k) => keys.add(k)); }
    for (const k of keys) {
      expect(translate('en', k), k).not.toBe(k);
      if (!/^\{\w+\}$/.test(translate('en', k))) expect(translate('ar', k), k).not.toBe(translate('en', k));
    }
  });
});

describe('engine', () => {
  let id = 0;
  const o = (input: string, name = 'f'): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true });
  it('Solve, Derivative and Factor rows carry steps; Steps(...) opens them', () => {
    const [a, b, c, d, e] = evaluateAll([o('Solve(3(x - 2) = x + 4)', 's'), o('Derivative(sin(x^2))', 'g'), o('Factor(2x^2 - 8)', 'h'),
      o('Steps(Solve(x + y = 3, x - y = 1))', 'k'), o('Steps(3(x - 2) = x + 4)', 'm')]);
    expect(a.steps!()!.length).toBe(4);
    expect(a.stepsOpen).toBeFalsy();
    expect(last(b.steps!()!).tex).toContain('\\cos');
    expect(c.steps!()![0].note).toBe('steps.commonFactor');
    expect(d.stepsOpen).toBe(true);
    expect(last(d.steps!()!).tex).toBe('x = 2,\\quad y = 1');
    expect(e.display).toBe('x = 5');
    expect(e.steps!()!.length).toBe(4);
    expect(evaluateAll([o('Steps(Circle((0,0), 1))', 'q')])[0].error).toMatch(/Steps/);
  });
});
