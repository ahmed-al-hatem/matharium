import type { Vec2 } from './types';

/** `"…"` string literal → its text (only `\"` is an escape, so LaTeX backslashes survive). */
export function parseString(s: string): string | null {
  const m = /^\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(s);
  return m ? m[1].replace(/\\"/g, '"') : null;
}

export const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

/** Round a world coordinate to what is visible at `scale` px per unit. */
export function roundAt(v: number, scale: number) {
  const d = Math.max(0, Math.min(10, Math.ceil(Math.log10(scale)) + 1));
  return +v.toFixed(d);
}

const tuple = (p: Vec2) => `(${p.x}, ${p.y})`;

export function textInput(text: string, p: Vec2, screen = false, name?: string) {
  return `${name ? `${name} = ` : ''}Text(${quote(text)}, ${tuple(p)}${screen ? ', "screen"' : ''})`;
}

export const strokeInput = (pts: Vec2[]) => `Stroke({${pts.map(tuple).join(', ')}})`;
export const arrowInput = (a: Vec2, b: Vec2) => `Arrow(${tuple(a)}, ${tuple(b)})`;

/** Douglas–Peucker: drop points closer than `eps` to the chord between kept points. */
export function simplify(pts: Vec2[], eps: number): Vec2[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    const a = pts[i], b = pts[j];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    let best = -1, bd = eps;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k];
      const d = len ? Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len : Math.hypot(p.x - a.x, p.y - a.y);
      if (d > bd) { bd = d; best = k; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

const ARABIC = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

/** Text outside `$…$` decides the direction, so `$x$ تساوي 2` is right-to-left. */
export const isRtl = (text: string) => ARABIC.test(splitMath(text).filter((p) => !p.math).map((p) => p.s).join(''));

/** Split "a $x^2$ b" into text and math parts. An unmatched `$` stays text. */
export function splitMath(text: string): { s: string; math: boolean }[] {
  const out: { s: string; math: boolean }[] = [];
  const re = /\$([^$]+)\$/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ s: text.slice(last, m.index), math: false });
    out.push({ s: m[1], math: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ s: text.slice(last), math: false });
  return out;
}

const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺', n: 'ⁿ' };
const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const SYM: Record<string, string> = {
  pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', phi: 'φ', omega: 'ω',
  cdot: '·', times: '×', div: '÷', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', infty: '∞', to: '→',
  rightarrow: '→', degree: '°', circ: '°', int: '∫', sum: 'Σ', in: '∈', sqrt: '√', angle: '∠', perp: '⊥', parallel: '∥',
  sin: 'sin', cos: 'cos', tan: 'tan', ln: 'ln', log: 'log', left: '', right: '', quad: ' ', ',': ' ',
};

/** A readable plain-text version of simple LaTeX, for canvas/SVG exports where KaTeX is not available. */
export function texToPlain(tex: string): string {
  let s = tex;
  for (let i = 0; i < 4; i++) {
    s = s
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_m, a: string, b: string) => `${a.length > 1 ? `(${a})` : a}/${b.length > 1 ? `(${b})` : b}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_m, a: string) => `√${a.length > 1 ? `(${a})` : a}`)
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1');
  }
  const script = (map: Record<string, string>, mark: string) => (_m: string, a: string) =>
    ([...a].every((c) => c in map) ? [...a].map((c) => map[c]).join('') : `${mark}(${a})`);
  s = s
    .replace(/\^\{([^{}]*)\}/g, script(SUP, '^')).replace(/\^([0-9n+-])/g, script(SUP, '^'))
    .replace(/_\{([^{}]*)\}/g, script(SUB, '_')).replace(/_([0-9])/g, script(SUB, '_'))
    .replace(/\\([A-Za-z]+|,)/g, (m, w: string) => SYM[w] ?? m.slice(1))
    .replace(/[{}]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** Plain text of a label: math parts converted with texToPlain. */
export const labelPlain = (text: string) => splitMath(text).map((p) => (p.math ? texToPlain(p.s) : p.s)).join('');
