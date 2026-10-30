import { describe, expect, it } from 'vitest';
import { polarRange } from './polar';
import { evaluateAll } from './engine';
import { asPolar, asPolarCurve, categorize, splitDefinition } from './parser';
import type { MObj, Vec2 } from './types';

let id = 0;
const o = (input: string, name = 'f'): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true });

describe('polar parsing', () => {
  it('recognizes r = f(θ) and keeps r = 3 a definition', () => {
    expect(splitDefinition('r = 2 sin(3θ)').name).toBeUndefined();
    expect(splitDefinition('r = theta').name).toBeUndefined();
    expect(splitDefinition('r = 3').name).toBe('r');
    expect(asPolarCurve('r = 3thetaa')).toBeNull();
    expect(asPolarCurve('r = 2theta')).toBe('2theta');
    expect(categorize('r = θ')).toBe('path');
    expect(categorize('(3; 45°)')).toBe('point');
  });
  it('splits polar points on a top-level semicolon', () => {
    expect(asPolar('(3; 45)')).toEqual(['3', '45']);
    expect(asPolar('(max(1, 2); 3)')).toEqual(['max(1, 2)', '3']);
    expect(asPolar('(1; 2; 3)')).toBeNull();
    expect(asPolar('(1, 2)')).toBeNull();
    expect(asPolar('(1; )')).toBeNull();
  });
});

describe('θ range', () => {
  it.each([
    ['2 sin(3θ)', (t: number) => 2 * Math.sin(3 * t), 2],
    ['1', () => 1, 2],
    ['1 + cos(θ)', (t: number) => 1 + Math.cos(t), 2],
    ['sin(5θ/2)', (t: number) => Math.sin((5 * t) / 2), 4],
    ['sin(θ/3)', (t: number) => Math.sin(t / 3), 6],
    ['cos(θ/7)', (t: number) => Math.cos(t / 7), 14],
    ['θ (spiral)', (t: number) => t, 6],
    ['e^(θ/10)', (t: number) => Math.exp(t / 10), 6],
  ])('%s → %iπ', (_n, r, k) => {
    expect(polarRange(r) / Math.PI).toBeCloseTo(k, 9);
  });
});

describe('polar objects', () => {
  it('r = 2 sin(3θ) is a rose with three petals', () => {
    const [r] = evaluateAll([o('r = 2 sin(3θ)')]);
    expect(r.error).toBeUndefined();
    expect(r.display).toBe('0 ≤ θ ≤ 2π');
    expect(r.tex).toBe('r = 2~\\sin\\left(3~\\theta\\right)');
    const v = r.value as Extract<typeof r.value, { type: 'curve' }>;
    expect(v.type).toBe('curve');
    // petal tips are where |r| = 2; they land on three distinct points
    const tips: Vec2[] = [];
    for (let i = 0; i <= 3600; i++) {
      const t = v.t0 + ((v.t1 - v.t0) * i) / 3600;
      const p = { x: v.fx(t), y: v.fy(t) };
      if (Math.hypot(p.x, p.y) > 1.999 && !tips.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.2)) tips.push(p);
    }
    expect(tips).toHaveLength(3);
    for (const p of tips) expect(Math.hypot(p.x, p.y)).toBeCloseTo(2, 2);
  });
  it('r = θ is a spiral drawn to 6π, and θ may be written theta', () => {
    const [a, b] = evaluateAll([o('r = θ', 'f'), o('r = theta / 2', 'g')]);
    expect(a.display).toBe('0 ≤ θ ≤ 6π');
    const v = a.value as any;
    expect(v.fx(v.t1)).toBeCloseTo(6 * Math.PI, 9);
    expect(b.error).toBeUndefined();
  });
  it('unknown letters become sliders, x is rejected', () => {
    const [r] = evaluateAll([o('r = a sin(k θ)')]);
    expect(r.missing).toEqual(['a']);
    const [ok] = evaluateAll([o('a = 2', 'a'), o('r = a θ')]).slice(1);
    expect(ok.error).toBeUndefined();
    expect(evaluateAll([o('r = x θ')])[0].error).toBeTruthy();
  });
  it('polar points in degrees and radians', () => {
    const r = evaluateAll([o('A = (3; 45°)', 'A'), o('(2; π/3)', 'B'), o('(2; 90°)', 'C'), o('Segment(A, (1; 0))', 's'), o('{(1; 0), (1; 90°)}', 'l1')]);
    expect(r[0].value).toMatchObject({ type: 'point', free: true });
    expect((r[0].value as any).p.x).toBeCloseTo(3 / Math.SQRT2, 12);
    expect(r[0].display).toBe('(2.1213, 2.1213)');
    expect(r[0].tex).toBe('A = \\left(3;\\ 45^\\circ\\right)');
    expect(r[1].value).toMatchObject({ type: 'point', free: false });
    expect(r[1].display).toBe('(1, 1.7321)');
    expect((r[2].value as any).p).toEqual({ x: 0, y: 2 });
    expect(r[3].error).toBeUndefined();
    expect((r[4].value as any).pts).toEqual([{ x: 1, y: 0 }, { x: 0, y: 1 }]);
  });
});
