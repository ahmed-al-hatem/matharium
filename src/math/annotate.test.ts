import { describe, expect, it } from 'vitest';
import { arrowInput, isRtl, labelPlain, parseString, quote, roundAt, simplify, splitMath, strokeInput, texToPlain, textInput } from './annotate';
import { evaluateAll } from './engine';
import { asCommand, categorize, normalize, splitArgs, splitRelation } from './parser';
import { freeName } from '../store/project';
import { draw } from '../graph2d/renderer';
import { SvgCtx } from '../graph2d/svgctx';
import type { MObj, Value, Vec2 } from './types';

const objs = (...inputs: string[]): MObj[] => inputs.map((input, i) => ({ id: `o${i}`, name: `o${i}`, input, color: '#E45B45', visible: true }));
const valueOf = (...inputs: string[]) => {
  const r = evaluateAll(objs(...inputs));
  const last = r[r.length - 1];
  expect(last.error).toBeUndefined();
  return last.value as Value;
};

describe('string literals', () => {
  it('round-trips quotes and keeps LaTeX backslashes', () => {
    for (const s of ['hello', 'say "hi"', '$\\frac{1}{2}$', 'مرحبا بالعالم', 'a, b (c) = d']) expect(parseString(quote(s))).toBe(s);
    expect(parseString('hello')).toBeNull();
    expect(parseString('"open')).toBeNull();
  });

  it('parser helpers ignore commas, brackets and operators inside strings', () => {
    expect(splitArgs('"a, (b", (1, 2)')).toEqual(['"a, (b"', '(1, 2)']);
    expect(asCommand('Text("f(x) = 2, ok", (1, 2))')?.args).toEqual(['"f(x) = 2, ok"', '(1, 2)']);
    expect(splitRelation('Text("x < 3", A)')).toBeNull();
    expect(normalize('Text("π² = 90°", (π, 1))')).toBe('Text("π² = 90°", (pi, 1))');
  });
});

describe('Text, Stroke and Arrow', () => {
  it('Text keeps the string as typed, with LaTeX and Arabic', () => {
    const v = valueOf('Text("$\\sqrt{2}$ تقريبًا 1.41, π", (1, -2))');
    expect(v).toEqual({ type: 'label', text: '$\\sqrt{2}$ تقريبًا 1.41, π', p: { x: 1, y: -2 }, screen: false });
  });

  it('Text can be fixed to the screen or follow a point', () => {
    expect(valueOf('Text("Title", (20, 30), "screen")')).toMatchObject({ p: { x: 20, y: 30 }, screen: true });
    const r = evaluateAll([...objs('Text("A", A)'), { id: 'a', name: 'A', input: 'A = (3, 4)', color: '', visible: true }]);
    expect(r[0].value).toMatchObject({ type: 'label', p: { x: 3, y: 4 } });
  });

  it('Text without a quoted string is an error', () => {
    expect(evaluateAll(objs('Text(hello, (1, 2))'))[0].error).toMatch(/quoted string/);
  });

  it('Stroke and Arrow are strokes; Arrow takes named points', () => {
    expect(valueOf('Stroke({(0, 0), (1, 1), (2, 0)})')).toEqual({ type: 'stroke', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], arrow: false });
    const r = evaluateAll([{ id: 'a', name: 'A', input: 'A = (1, 2)', color: '', visible: true }, ...objs('Arrow(A, (3, 4))')]);
    expect(r[1].value).toEqual({ type: 'stroke', pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }], arrow: true });
    expect(evaluateAll(objs('Stroke({(0, 0)})'))[0].error).toMatch(/two points/);
  });

  it('the generated inputs evaluate back to the same values', () => {
    expect(valueOf(textInput('a "b"', { x: 1.5, y: -2 }, true))).toEqual({ type: 'label', text: 'a "b"', p: { x: 1.5, y: -2 }, screen: true });
    expect(valueOf(strokeInput([{ x: 0, y: 0 }, { x: 1, y: 2 }]))).toMatchObject({ pts: [{ x: 0, y: 0 }, { x: 1, y: 2 }] });
    expect(valueOf(arrowInput({ x: 0, y: 0 }, { x: -1, y: 2 }))).toMatchObject({ arrow: true });
    expect(textInput('hi', { x: 0, y: 0 }, false, 'note')).toBe('note = Text("hi", (0, 0))');
  });

  it('gets its own names', () => {
    const existing = objs('Text("a", (0, 0))');
    existing[0].name = 'text1';
    expect(categorize('Text("x = 1", (0, 0))')).toBe('label');
    expect(freeName(existing, 'Text("b", (1, 1))')).toBe('text2');
    expect(freeName([], 'Stroke({(0, 0), (1, 1)})')).toBe('pen1');
    expect(freeName([], 'Arrow((0, 0), (1, 1))')).toBe('arrow1');
  });
});

describe('simplify (Douglas–Peucker)', () => {
  it('reduces a straight line to its end points', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 2 * i }));
    expect(simplify(line, 0.5)).toEqual([line[0], line[49]]);
  });

  it('keeps corners and stays within the tolerance', () => {
    const pts: Vec2[] = [];
    for (let i = 0; i <= 20; i++) pts.push({ x: i, y: 0 });
    for (let i = 1; i <= 20; i++) pts.push({ x: 20, y: i });
    expect(simplify(pts, 0.1)).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }]);
    const wave = Array.from({ length: 400 }, (_, i) => ({ x: i / 20, y: Math.sin(i / 20) }));
    const s = simplify(wave, 0.01);
    expect(s.length).toBeLessThan(80);
    // every dropped point is within eps of the simplified polyline
    for (const p of wave) {
      let best = Infinity;
      for (let i = 1; i < s.length; i++) {
        const a = s[i - 1], b = s[i];
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)));
        best = Math.min(best, Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y)));
      }
      expect(best).toBeLessThanOrEqual(0.01 + 1e-12);
    }
  });

  it('handles tiny inputs and closed loops', () => {
    expect(simplify([], 1)).toEqual([]);
    expect(simplify([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1)).toHaveLength(2);
    const loop = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 0 }];
    expect(simplify(loop, 0.1)).toEqual(loop);
  });
});

describe('text helpers', () => {
  it('splits math from text and detects right-to-left text', () => {
    expect(splitMath('a $x^2$ b $y$')).toEqual([{ s: 'a ', math: false }, { s: 'x^2', math: true }, { s: ' b ', math: false }, { s: 'y', math: true }]);
    expect(splitMath('costs $5')).toEqual([{ s: 'costs $5', math: false }]);
    expect(isRtl('الميل $m$')).toBe(true);
    expect(isRtl('$x$ تساوي 2')).toBe(true);
    expect(isRtl('slope $m$')).toBe(false);
    expect(isRtl('$\\text{ب}$')).toBe(false);
  });

  it('turns simple LaTeX into readable plain text', () => {
    expect(texToPlain('\\frac{1}{2}')).toBe('1/2');
    expect(texToPlain('\\frac{x+1}{2}')).toBe('(x+1)/2');
    expect(texToPlain('x^2 + y^{10}')).toBe('x² + y¹⁰');
    expect(texToPlain('a_1 + a_{n}')).toBe('a₁ + a_(n)');
    expect(texToPlain('\\sqrt{2}\\pi')).toBe('√2π');
    expect(texToPlain('\\sin^2 a + \\cos^2 a = 1')).toBe('sin² a + cos² a = 1');
    expect(texToPlain('\\theta \\le 90^\\circ')).toBe('θ ≤ 90^°');
    expect(texToPlain('\\text{area} = \\int_a^b f')).toBe('area = ∫_a^b f');
    expect(labelPlain('الميل $m = \\frac{1}{2}$')).toBe('الميل m = 1/2');
  });

  it('rounds coordinates to what the zoom can show', () => {
    expect(roundAt(1.23456789, 50)).toBe(1.235);
    expect(roundAt(1.23456789, 5000)).toBe(1.23457);
    expect(roundAt(1234.5678, 0.01)).toBe(1235);
  });
});

describe('drawing', () => {
  const settings = { grid: false, axes: false, labels: true, snap: false, digits: 4, range3d: 6, lang: 'en' as const };
  const render = (inputs: string[], htmlText: boolean, light = false) => {
    const svg = new SvgCtx(400, 300);
    draw(svg, evaluateAll(objs(...inputs)), { W: 400, H: 300, view: { ox: 0, oy: 0, sx: 50, sy: 50 }, settings, selectedId: null, htmlText, light });
    return svg.toString();
  };

  it('draws strokes and arrows into SVG', () => {
    const svg = render(['Stroke({(0, 0), (1, 1), (2, 0)})', 'Arrow((0, 0), (0, 2))'], true);
    expect(svg).toContain('M200 150L250 100L300 150');
    expect(svg.match(/fill="#E45B45"/g)?.length).toBeGreaterThanOrEqual(1); // arrow head
    expect(svg).not.toMatch(/NaN/);
  });

  it('draws text as plain text in exports, and leaves it to the HTML layer on screen', () => {
    const inputs = ['Text("الميل $m = \\frac{1}{2}$", (1, 1))'];
    expect(render(inputs, false)).toContain('>الميل m = 1/2</text>');
    expect(render(inputs, true)).not.toContain('<text');
  });

  it('uses a paper palette for printing', () => {
    expect(render([], true, true)).toContain('fill="#FFFFFF"');
    expect(render([], true)).toContain('fill="#0D0E0D"');
  });
});
