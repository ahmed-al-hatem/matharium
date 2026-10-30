import { describe, expect, it } from 'vitest';
import { COMMAND_TABLE, helpRows, nextPlaceholder, signature, suggest, template, type HelpGroup } from './commands';
import { categorize } from './parser';
import { evaluateAll } from './engine';
import { paramOf, pointAt } from './geometry';
import type { MObj, Value } from './types';

let id = 0;
const o = (input: string, name = `o${id}`): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true });

describe('command table', () => {
  it('has unique names and at least one signature each', () => {
    const names = COMMAND_TABLE.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of COMMAND_TABLE) expect(c.sigs.length, c.name).toBeGreaterThan(0);
  });

  it('every command is known to the engine', () => {
    for (const c of COMMAND_TABLE) {
      const [r] = evaluateAll([o(`${c.name}()`, 'q')]);
      expect(r.error ?? '', c.name).not.toMatch(/Unknown command/);
    }
  });

  // context the examples refer to (f, g, A, B, C, l, Q, P)
  const ctx = () => [
    o('f(x) = x^2 - 1', 'f'), o('g(x) = 2x', 'g'), o('A = (1, 2)', 'A'), o('B = (4, 0)', 'B'), o('C = (0, 3)', 'C'),
    o('l = Line(B, C)', 'l'), o('c = Circle((0, 0), 2)', 'c'), o('P = Point(c, 0.1)', 'P'), o('Q = Midpoint(P, B)', 'Q'),
  ];
  const examples = COMMAND_TABLE.flatMap((c) => c.examples.map((e) => [c.name, e.code] as const));
  it.each(examples)('%s example %s evaluates without error', (_name, code) => {
    const res = evaluateAll([...ctx(), o(code, 'ex1')]);
    expect(res[res.length - 1].error).toBeUndefined();
  });

  it('drives the parser categories', () => {
    expect(categorize('Integral(f, 0, 1)')).toBe('number');
    expect(categorize('Integral(f)')).toBe('function');
    expect(categorize('Normal(0, 1)')).toBe('function');
    expect(categorize('Normal(0, 1, -1, 1)')).toBe('number');
    expect(categorize('Binomial(10, 0.5)')).toBe('list');
    expect(categorize('Point(c)')).toBe('point');
    expect(categorize('RiemannSum(x^2, 0, 1, 4)')).toBe('number');
  });

  it('builds localized signatures and templates', () => {
    expect(signature('Circle', ['center', 'radius'])).toBe('Circle( <Center>, <Radius> )');
    expect(signature('Circle', ['center', 'radius'], 'ar')).toBe('Circle( ⁨<المركز>⁩, ⁨<نصف القطر>⁩ )');
    const ar = template('Circle', ['center', 'radius'], 'ar');
    expect(ar.text.slice(...ar.select)).toBe('⁨<المركز>⁩');
    expect(nextPlaceholder(ar.text, ar.select[1])![0]).toBe(ar.text.indexOf('⁨', ar.select[1]));
    const t = template('Circle', ['center', 'radius']);
    expect(t.text).toBe('Circle(<Center>, <Radius>)');
    expect(t.text.slice(...t.select)).toBe('<Center>');
    expect(nextPlaceholder(t.text, t.select[1])).toEqual([17, 25]);
    expect(nextPlaceholder(t.text, 26)).toEqual([7, 15]);
    expect(nextPlaceholder('Circle(A, 2)', 0)).toBeNull();
  });

  it('suggests commands and objects', () => {
    const objs = [{ name: 'circ1', input: 'Circle(A, 2)' }, { name: 'A', input: '(1, 2)' }];
    const s = suggest('Ci', objs);
    expect(s.map((x) => x.label)).toEqual([
      'Circle( <Center>, <Radius> )', 'Circle( <Center>, <Point> )', 'Circle( <Point>, <Point 2>, <Point 3> )', 'circ1',
    ]);
    expect(suggest('ci', objs).map((x) => x.kind)).toContain('command');
    // single lowercase letters only match objects; an exact name is not suggested
    expect(suggest('c', objs).map((x) => x.label)).toEqual(['circ1']);
    expect(suggest('A', objs).filter((x) => x.kind === 'object')).toEqual([]);
    expect(suggest('', objs)).toEqual([]);
  });

  it('generates Help rows in both languages', () => {
    const groups: HelpGroup[] = ['commands', 'calculus', 'geometry', 'stats', '3d'];
    for (const g of groups) {
      const en = helpRows(g, 'en'), ar = helpRows(g, 'ar');
      expect(en.length, g).toBeGreaterThan(0);
      expect(ar.map((r) => r.code)).toEqual(en.map((r) => r.code));
      expect(ar.every((r) => /[؀-ۿ]/.test(r.desc)), g).toBe(true);
    }
    expect(helpRows('calculus', 'en').map((r) => r.code)).toContain('RiemannSum(x^2, 0, 2, 8, "mid")');
  });
});

describe('points on objects', () => {
  const objs: Value[] = [
    { type: 'circle', c: { x: 1, y: -1 }, r: 2 },
    { type: 'segment', a: { x: 0, y: 0 }, b: { x: 4, y: 2 } },
    { type: 'line', a: { x: 0, y: 1 }, b: { x: 1, y: 1 } },
    { type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }] },
    { type: 'function', f: (x) => x * x, param: 'x', tex: '' },
    { type: 'curve', fx: Math.cos, fy: Math.sin, t0: 0, t1: 6 },
  ];
  it.each(objs.map((v) => [v.type, v] as const))('%s: pointAt ∘ paramOf is a projection', (_t, v) => {
    for (const t of [0.1, 0.37, 0.8]) {
      const p = pointAt(v, t)!;
      expect(pointAt(v, paramOf(v, p))!.x).toBeCloseTo(p.x, 6);
      expect(pointAt(v, paramOf(v, p))!.y).toBeCloseTo(p.y, 6);
    }
  });
  it('projects onto a circle and clamps to a segment', () => {
    const c = objs[0];
    expect(paramOf(c, { x: 1, y: 5 })).toBeCloseTo(0.25, 12);
    expect(paramOf(objs[1], { x: 10, y: 10 })).toBe(1);
    expect(paramOf(objs[3], { x: 3, y: 1 })).toBeCloseTo(3 / 8, 12);
  });
  it('Point(object, t) evaluates on the object and remembers it', () => {
    const r = evaluateAll([o('c = Circle((0, 0), 2)', 'c'), o('P = Point(c, 0.25)', 'P'), o('Point(x^2, 3)', 'R'), o('Point((1, 2))', 'S')]);
    expect(r[1].value).toMatchObject({ type: 'point', p: { x: 0, y: 2 }, free: false, on: { src: 'c', t: 0.25 } });
    expect(r[2].value).toMatchObject({ p: { x: 3, y: 9 } });
    expect(r[3].error).toBeTruthy();
  });
  it('Locus traces a dependent point', () => {
    const r = evaluateAll([
      o('c = Circle((0, 0), 2)', 'c'), o('P = Point(c)', 'P'), o('B = (4, 0)', 'B'), o('Q = Midpoint(P, B)', 'Q'), o('Locus(Q, P)', 'k'),
    ]);
    const v = r[4].value as { type: string; pts: { x: number; y: number }[] };
    expect(v.type).toBe('polyline');
    expect(v.pts).toHaveLength(201);
    // the midpoint of P and (4, 0) runs on the circle of radius 1 around (2, 0)
    for (const p of v.pts) expect(Math.hypot(p.x - 2, p.y)).toBeCloseTo(1, 9);
    const bad = evaluateAll([o('A = (1, 1)', 'A'), o('B = (2, 2)', 'B'), o('Locus(B, A)', 'k')]);
    expect(bad[2].error).toMatch(/point on an object/);
  });
});
