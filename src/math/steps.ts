import type { MathNode } from 'mathjs';
import { compileFn, math, texName } from './compile';
import {
  differenceOfSquares, factoredTex, factoredText, factorPoly, gcd, polyCoefficients, polyTex, primitive, quadraticRoots, rat, ratExact,
  polyText, rationalRoot, syntheticDivision, trim, type Factorization, type Fraction, type Poly,
} from './exact';
import { roots as numRoots } from './solve';

/**
 * Machine-readable form of a step, in mathjs syntax, so tests can check every line numerically
 * against the original problem.
 */
export type Check =
  /** an equation equivalent to the original one (same solutions) */
  | { kind: 'eq'; lhs: string; rhs: string }
  /** expressions identical to the original one; D(u) stands for the derivative of u */
  | { kind: 'expr'; parts: string[] }
  /** numbers that are all equal */
  | { kind: 'values'; parts: string[] }
  /** every solution of the original problem (`partial`: some of them) */
  | { kind: 'solutions'; sols: Record<string, string>[]; partial?: boolean }
  /** equations that the solution of the original system satisfies */
  | { kind: 'system'; eqs: [string, string][] }
  | { kind: 'info' };

/** One line of a worked solution. `note` is an i18n key; `args` fill its {placeholders} (arrays are lists of keys). */
export interface Step { tex: string; note: string; args?: Record<string, string | string[]>; check: Check }

class NoSteps extends Error {}

// ---------- fractions ----------

const F = (n: number, d = 1) => math.fraction(n, d) as unknown as Fraction;
const isZ = (f: Fraction) => f.n === 0;
const num = (f: Fraction) => (f.s * f.n) / f.d;
const neg = (f: Fraction) => f.mul(-1);
const same = (a: Fraction, b: Fraction) => isZ(a.sub(b));
const isOne = (f: Fraction) => same(f, F(1));
const fx = (f: Fraction) => ratExact(f.s * f.n, f.d);
const fexpr = (f: Fraction) => (f.d === 1 ? (f.s < 0 ? `(${-f.n})` : `${f.n}`) : `(${f.s * f.n}/${f.d})`);
/** LaTeX of a number that follows an operator: negative values get parentheses. */
const ftexP = (f: Fraction) => (f.s < 0 ? `\\left(${fx(f).tex}\\right)` : fx(f).tex);

// ---------- terms: c·v^k ----------

interface Term { c: Fraction; v: string; k: number }

const termsOf = (p: Poly, v: string): Term[] => {
  const out: Term[] = [];
  for (let k = p.length - 1; k >= 0; k--) if (!isZ(p[k])) out.push({ c: p[k], v, k });
  return out;
};

function termsTex(ts: Term[]): string {
  let s = '';
  for (const t of ts) {
    if (isZ(t.c)) continue;
    const a = fx(t.c.s < 0 ? neg(t.c) : t.c);
    const body = t.k === 0 ? a.tex : `${a.value === 1 ? '' : a.tex}${texName(t.v)}${t.k > 1 ? `^{${t.k}}` : ''}`;
    s += s ? `${t.c.s < 0 ? ' - ' : ' + '}${body}` : `${t.c.s < 0 ? '-' : ''}${body}`;
  }
  return s || '0';
}

function termsExpr(ts: Term[]): string {
  const parts = ts.filter((t) => !isZ(t.c)).map((t) => (t.k === 0 ? fexpr(t.c) : `${fexpr(t.c)}*${t.v}${t.k > 1 ? `^${t.k}` : ''}`));
  return parts.join(' + ') || '0';
}

/** Like terms combined, highest power first (per variable, in order of first appearance). */
function collect(ts: Term[]): Term[] {
  const out: Term[] = [];
  for (const t of ts) {
    const key = t.k === 0 ? '' : t.v;
    const hit = out.find((o) => (o.k === 0 ? '' : o.v) === key && o.k === t.k);
    if (hit) hit.c = hit.c.add(t.c); else out.push({ ...t });
  }
  return out.filter((t) => !isZ(t.c)).sort((a, b) => (a.k === b.k ? 0 : b.k - a.k));
}

const hasLikeTerms = (ts: Term[]) => collect(ts).length !== ts.filter((t) => !isZ(t.c)).length;

// ---------- mathjs nodes ----------

type N = MathNode & Record<string, any>;
const C = (v: number) => new math.ConstantNode(v) as N;
const S = (n: string) => new math.SymbolNode(n) as N;
const op = (o: string, fn: string, args: MathNode[]) => new math.OperatorNode(o as never, fn as never, args) as N;
const mul = (a: MathNode, b: MathNode) => op('*', 'multiply', [a, b]);
const div = (a: MathNode, b: MathNode) => op('/', 'divide', [a, b]);
const pow = (a: MathNode, b: MathNode) => op('^', 'pow', [a, b]);
const add = (a: MathNode, b: MathNode) => op('+', 'add', [a, b]);
const subt = (a: MathNode, b: MathNode) => op('-', 'subtract', [a, b]);
const negN = (a: MathNode) => op('-', 'unaryMinus', [a]);
const call = (name: string, ...args: MathNode[]) => new math.FunctionNode(S(name), args) as N;
const D = (u: MathNode) => call('D', u);

const unwrap = (n: N): N => (n.isParenthesisNode ? unwrap(n.content) : n);
const isNum = (n: N) => n.isConstantNode && typeof n.value === 'number';
const isD = (n: N) => n.isFunctionNode && n.fn.name === 'D';

function dependsOn(n: MathNode, v: string) {
  let hit = false;
  n.traverse((c: any, path: string) => { if (c.isSymbolNode && path !== 'fn' && c.name === v) hit = true; });
  return hit;
}

/** Replace slider names (numbers in scope) by their values, keeping `keep` symbolic. */
function bind(n: MathNode, keep: string[], scope: Record<string, unknown>): N {
  return n.transform((c: any, path: string) =>
    c.isSymbolNode && path !== 'fn' && !keep.includes(c.name) && typeof scope[c.name] === 'number' ? C(scope[c.name] as number) : c) as N;
}

const GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda', 'mu', 'pi', 'phi', 'tau', 'omega', 'e']);

function texOf(node: MathNode, v: string): string {
  const startsTight = (s: string) => /^[\d.-]|^\\frac|^\\left\(-/.test(s);
  const handler = (n: N, options: object): string | undefined => {
    if (isD(n)) return `\\frac{d}{d${v}}\\left[${n.args[0].toTex(options)}\\right]`;
    if (n.isFunctionNode && n.fn.name === 'ln' && n.args.length === 1) return `\\ln\\left(${n.args[0].toTex(options)}\\right)`;
    if (n.isSymbolNode && !GREEK.has(n.name) && /^[A-Za-z]\w*$/.test(n.name)) return texName(n.name);
    if (n.isOperatorNode && n.fn === 'multiply' && n.args.length === 2) {
      const [a, b] = n.args.map(unwrap) as N[];
      const wrap = (m: N, first: boolean) => {
        const t = m.toTex(options);
        const sum = m.isOperatorNode && (m.fn === 'add' || m.fn === 'subtract');
        const negative = !first && ((m.isOperatorNode && m.fn === 'unaryMinus') || (isNum(m) && m.value < 0));
        return sum || negative ? `\\left(${t}\\right)` : t;
      };
      const at = wrap(a, true), bt = wrap(b, false);
      const sep = startsTight(bt) ? '\\cdot ' : isNum(a) ? '' : '\\,';
      return `${at}${sep}${bt}`;
    }
    return undefined;
  };
  try { return node.toTex({ parenthesis: 'auto', implicit: 'hide', handler } as never); } catch { return node.toString(); }
}

// ---------- equations in one variable ----------

/** Additive terms of one side, each expanded into monomials. `expanded` when brackets were opened. */
function sideTerms(node: N, v: string): { terms: Term[]; expanded: boolean } {
  const out: Term[] = [];
  let expanded = false;
  const walk = (n: N, sign: number, top: boolean) => {
    if (n.isParenthesisNode) {
      const inner = unwrap(n);
      if (!top && inner.isOperatorNode && ['add', 'subtract'].includes(inner.fn)) expanded = true;
      return walk(inner, sign, top);
    }
    if (n.isOperatorNode && n.fn === 'add') { n.args.forEach((a: N) => walk(a, sign, false)); return; }
    if (n.isOperatorNode && n.fn === 'subtract') { walk(n.args[0], sign, false); walk(n.args[1], -sign, false); return; }
    if (n.isOperatorNode && n.fn === 'unaryMinus') { walk(n.args[0], -sign, false); return; }
    const c = polyCoefficients(n, v);
    if (!c) throw new NoSteps();
    const ts = termsOf(c, v);
    if (ts.length > 1) expanded = true;
    for (const t of ts) out.push({ ...t, c: t.c.mul(sign) });
  };
  walk(node, 1, true);
  return { terms: out, expanded };
}

/** Coefficients (ascending) of a list of terms in v. */
function toPoly(ts: Term[]): Poly {
  const p: Fraction[] = [];
  for (const t of ts) {
    while (p.length <= t.k) p.push(F(0));
    p[t.k] = p[t.k].add(t.c);
  }
  return trim(p);
}

const intsPoly = (ints: number[]) => ints.map((c) => F(c));
const intsExpr = (ints: number[], v: string) => termsExpr(termsOf(intsPoly(ints), v));
const sameTerms = (a: Term[], b: Term[]) => a.length === b.length && a.every((t, i) => t.k === b[i].k && t.v === b[i].v && same(t.c, b[i].c));

interface Root { value: number; tex: string; expr: string }

const ratRoot = (f: Fraction): Root => ({ value: num(f), tex: fx(f).tex, expr: fexpr(f) });

/** "(3 − √17)/4" (the text of an Exact) as a mathjs expression. */
export const exactExpr = (text: string) => text.replace(/−/g, '-').replace(/√(\d+)/g, ' sqrt($1)').replace(/π/g, ' pi');

function eqStep(steps: Step[], L: Term[], R: Term[], note: string, args?: Step['args']) {
  steps.push({ tex: `${termsTex(L)} = ${termsTex(R)}`, note, args, check: { kind: 'eq', lhs: termsExpr(L), rhs: termsExpr(R) } });
}

function solutionsStep(steps: Step[], v: string, rs: Root[], note = 'steps.solutions') {
  const sorted = rs.slice().sort((a, b) => a.value - b.value).filter((r, i, a) => !i || Math.abs(r.value - a[i - 1].value) > 1e-9);
  steps.push({
    tex: sorted.length ? sorted.map((r) => `${texName(v)} = ${r.tex}`).join(',\\quad ') : `${texName(v)} \\in \\varnothing`,
    note: sorted.length ? note : 'steps.noSolution',
    check: { kind: 'solutions', sols: sorted.map((r) => ({ [v]: r.expr })) },
  });
}

/** Factorization display for content·∏factors with identical factors merged. */
function factored(content: Fraction, parts: number[][], v: string): { tex: string; text: string; expr: string } {
  const fz: Factorization = { content, factors: [] };
  for (const ints of parts) {
    const hit = fz.factors.find((g) => g.ints.length === ints.length && g.ints.every((c, i) => c === ints[i]));
    if (hit) hit.mult++; else fz.factors.push({ ints, mult: 1 });
  }
  const expr = [fexpr(content), ...fz.factors.map((f) => `(${intsExpr(f.ints, v)})^${f.mult}`)].join(' * ');
  return { tex: factoredTex(fz, v), text: factoredText(fz, v), expr };
}

/** Synthetic division table for dividing ints (ascending) by (v − r). */
function syntheticTable(ints: number[], r: Fraction): string {
  const p = intsPoly(ints);
  const desc = p.slice().reverse();
  const bottom: Fraction[] = [];
  const middle: Fraction[] = [];
  let carry = F(0);
  desc.forEach((c, i) => {
    const m = i === 0 ? null : carry.mul(r);
    if (m) middle.push(m);
    carry = m ? c.add(m) : c;
    bottom.push(carry);
  });
  const cols = 'r'.repeat(desc.length);
  return `\\begin{array}{r|${cols}} ${fx(r).tex} & ${desc.map((c) => fx(c).tex).join(' & ')} \\\\ & & ${middle.map((c) => fx(c).tex).join(' & ')} \\\\ \\hline & ${bottom.map((c) => fx(c).tex).join(' & ')} \\end{array}`;
}

/** p(r) written out: 2·(−1)³ − 3·(−1) + 1. */
function substTex(ints: number[], r: Fraction): string {
  let s = '';
  const rt = `\\left(${fx(r).tex}\\right)`;
  for (let k = ints.length - 1; k >= 0; k--) {
    const c = ints[k];
    if (!c) continue;
    const a = Math.abs(c);
    const body = k === 0 ? `${a}` : `${a === 1 ? '' : `${a}\\cdot `}${rt}${k > 1 ? `^{${k}}` : ''}`;
    s += s ? `${c < 0 ? ' - ' : ' + '}${body}` : `${c < 0 ? '-' : ''}${body}`;
  }
  return s || '0';
}

const divisors = (n: number) => {
  n = Math.abs(n);
  const out: number[] = [];
  for (let i = 1; i <= n && out.length < 200; i++) if (n % i === 0) out.push(i);
  return out;
};

/** Candidates ±p/q of the rational root theorem (positive values, ascending). */
function candidates(ints: number[]): Fraction[] {
  const out: Fraction[] = [];
  for (const p of divisors(ints[0])) for (const q of divisors(ints[ints.length - 1])) {
    const f = F(p, q);
    if (!out.some((g) => same(g, f))) out.push(f);
  }
  return out.sort((a, b) => num(a) - num(b));
}

/** Δ line for a·v² + b·v + c (ints ascending [c, b, a]). */
function discriminantStep(ints: number[]): { step: Step; D: number } {
  const [c, b, a] = ints;
  const D = b * b - 4 * a * c;
  const P = (n: number) => (n < 0 ? `\\left(${n}\\right)` : `${n}`);
  return {
    D,
    step: {
      tex: `\\Delta = b^{2} - 4ac = ${P(b)}^{2} - 4\\cdot ${P(a)}\\cdot ${P(c)} = ${D}`,
      note: 'steps.discriminant',
      check: { kind: 'values', parts: [`(${b})^2 - 4*(${a})*(${c})`, `${D}`] },
    },
  };
}

/**
 * Solve a quadratic factor (ints ascending, primitive) with Δ, then factoring or the formula.
 * `others` are factors already split off, shown alongside when the quadratic factors.
 */
function quadratic(ints: number[], v: string, others: number[][], steps: Step[]): { roots: Root[]; note: string } {
  const { step, D } = discriminantStep(ints);
  steps.push(step);
  const [, b, a] = ints;
  if (D < 0) {
    steps.push({ tex: `\\Delta = ${D} < 0`, note: 'steps.negativeDisc', check: { kind: 'info' } });
    return { roots: [], note: 'steps.solutions' };
  }
  const sq = Math.round(Math.sqrt(D));
  if (sq * sq === D) {
    const fz = factorPoly(intsPoly(ints));
    const parts = [...others, ...fz.factors.flatMap((f) => Array<number[]>(f.mult).fill(f.ints))];
    const f = factored(fz.content, parts, v);
    steps.push({ tex: `${f.tex} = 0`, note: 'steps.factorQuad', args: { D: `${D}`, s: `${sq}` }, check: { kind: 'eq', lhs: f.expr, rhs: '0' } });
    const roots = fz.factors.map((g) => ratRoot(F(-g.ints[0], g.ints[1])));
    return { roots, note: 'steps.zeroProduct' };
  }
  const P = (n: number) => (n < 0 ? `\\left(${n}\\right)` : `${n}`);
  steps.push({
    tex: `${texName(v)} = \\frac{-b \\pm \\sqrt{\\Delta}}{2a} = \\frac{${b ? `-${P(b)} ` : ''}\\pm \\sqrt{${D}}}{2\\cdot ${P(a)}}`,
    note: 'steps.formula',
    check: { kind: 'solutions', sols: ['-', '+'].map((s) => ({ [v]: `(-(${b}) ${s} sqrt(${D}))/(2*(${a}))` })), partial: others.length > 0 },
  });
  const roots = quadraticRoots(intsPoly(ints)).map((e) => ({ value: e.value, tex: e.tex, expr: exactExpr(e.text) }));
  return { roots, note: 'steps.simplifyRoots' };
}

/** Steps for a primitive integer polynomial = 0 of degree ≥ 2 (ints ascending, leading coefficient > 0). */
function polySteps(ints: number[], v: string, steps: Step[]) {
  const roots: Root[] = [];
  const parts: number[][] = [];
  let cur = ints;
  let k = 0;
  while (k < cur.length - 1 && cur[k] === 0) k++;
  if (k) {
    cur = cur.slice(k);
    for (let i = 0; i < k; i++) parts.push([0, 1]);
    roots.push(ratRoot(F(0)));
    const f = factored(F(1), [...parts, cur], v);
    steps.push({ tex: `${f.tex} = 0`, note: 'steps.commonX', args: { f: k > 1 ? `${v}^${k}` : v }, check: { kind: 'eq', lhs: f.expr, rhs: '0' } });
  }
  if (cur.length - 1 >= 3) {
    const cs = candidates(cur);
    const shown = cs.length > 16 ? [...cs.slice(0, 16).map((c) => fx(c).tex), '\\ldots'] : cs.map((c) => fx(c).tex);
    steps.push({
      tex: `\\pm ${shown.join(',\\ \\pm ')}`,
      note: 'steps.candidates',
      args: { a0: `${Math.abs(cur[0])}`, an: `${Math.abs(cur[cur.length - 1])}` },
      check: { kind: 'info' },
    });
  }
  let note = 'steps.solutions';
  while (cur.length - 1 >= 3) {
    const r = rationalRoot(intsPoly(cur));
    if (!r) break;
    const at = cur.map((c, i) => `${c}*(${fexpr(r)})^${i}`).join(' + ');
    const atTex = substTex(cur, r);
    steps.push({ tex: `p\\left(${fx(r).tex}\\right) = ${atTex} = 0`, note: 'steps.tryRoot', args: { r: fx(r).text }, check: { kind: 'values', parts: [at, '0'] } });
    const lin = [-r.s * r.n, r.d];
    const next = primitive(syntheticDivision(intsPoly(cur), r).quotient).ints;
    const f = factored(F(1), [...parts, lin, next], v);
    steps.push({ tex: `${syntheticTable(cur, r)} \\quad\\Rightarrow\\quad ${f.tex} = 0`, note: 'steps.synthetic', args: { r: fx(r).text }, check: { kind: 'eq', lhs: f.expr, rhs: '0' } });
    parts.push(lin);
    roots.push(ratRoot(r));
    cur = next;
  }
  const deg = cur.length - 1;
  if (deg === 2) {
    const q = quadratic(cur, v, parts, steps);
    roots.push(...q.roots);
    note = q.note;
    if (parts.length && note === 'steps.simplifyRoots') note = 'steps.solutions';
  } else if (deg === 1) {
    roots.push(ratRoot(F(-cur[0], cur[1])));
  } else if (deg >= 3) {
    steps.push({ tex: `${polyTex(cur, texName(v))} = 0`, note: 'steps.noRational', check: { kind: 'info' } });
    const p = intsPoly(cur).map(num);
    const f = (x: number) => p.reduceRight((s, c) => s * x + c, 0);
    for (const x of numRoots(f, -100, 100)) roots.push({ value: x, tex: `${+x.toFixed(6)}`, expr: `${x}` });
    note = 'steps.numericRoots';
  }
  solutionsStep(steps, v, roots, note);
}

/**
 * Worked solution of lhs = rhs in v: linear equations (expand, collect, move, divide), quadratics
 * (standard form, Δ, factoring or the formula) and polynomials with rational roots. Null when the
 * equation is not a polynomial with rational coefficients.
 */
export function solveSteps(lhs: MathNode, rhs: MathNode, v = 'x', scope: Record<string, unknown> = {}): Step[] | null {
  try {
    const Ls = sideTerms(bind(lhs, [v], scope), v), Rs = sideTerms(bind(rhs, [v], scope), v);
    const steps: Step[] = [];
    let L = Ls.terms, R = Rs.terms;
    if (Ls.expanded || Rs.expanded) eqStep(steps, L, R, 'steps.expand');
    if (hasLikeTerms(L) || hasLikeTerms(R)) { L = collect(L); R = collect(R); eqStep(steps, L, R, 'steps.collect'); }
    const p = toPoly([...L, ...R.map((t) => ({ ...t, c: neg(t.c) }))]);
    const deg = p.length - 1;
    if (deg <= 0) {
      const c = p[0] ?? F(0);
      steps.push({ tex: `${fx(c).tex} = 0`, note: isZ(c) ? 'steps.identity' : 'steps.contradiction', args: { v }, check: { kind: 'eq', lhs: fexpr(c), rhs: '0' } });
      return steps;
    }
    if (deg === 1) {
      const vx = (t: Term) => t.k > 0;
      const left = [...L.filter(vx), ...R.filter(vx).map((t) => ({ ...t, c: neg(t.c) }))];
      const right = [...R.filter((t) => !vx(t)), ...L.filter((t) => !vx(t)).map((t) => ({ ...t, c: neg(t.c) }))];
      if (R.some(vx) || L.some((t) => !vx(t)) || !L.length) eqStep(steps, left, right, 'steps.move', { v });
      const cl = collect(left), cr = collect(right);
      if (!sameTerms(cl, left) || !sameTerms(cr, right)) eqStep(steps, cl, cr, 'steps.combine');
      const a = p[1], b = cr.reduce((s, t) => s.add(t.c), F(0));
      if (!isOne(a)) eqStep(steps, [{ c: F(1), v, k: 1 }], [{ c: b.div(a), v, k: 0 }], 'steps.divide', { k: fx(a).text });
      if (!steps.length) solutionsStep(steps, v, [ratRoot(b.div(a))]);
      return steps;
    }
    const std = termsOf(p, v);
    if (R.length || !sameTerms(L, std)) eqStep(steps, std, [], 'steps.standard');
    const { content, ints } = primitive(p);
    if (!isOne(content)) {
      const inv = F(1).div(content);
      const asDiv = content.d === 1 && !isOne(neg(content));
      eqStep(steps, termsOf(intsPoly(ints), v), [], asDiv ? 'steps.divide' : 'steps.multiply', { k: asDiv ? fx(content).text : fx(inv).text });
    }
    polySteps(ints, v, steps);
    return steps;
  } catch (e) {
    if (e instanceof NoSteps) return null;
    throw e;
  }
}

// ---------- systems of two linear equations ----------

interface Row { a: Fraction; b: Fraction; k: Fraction }

/** a·x + b·y + c for a difference node that is affine in x and y, or null. */
function affine(diff: MathNode, scope: Record<string, unknown>): Row | null {
  let f: (x: number, y: number) => number;
  try { f = compileFn(bind(diff, ['x', 'y'], scope), ['x', 'y'], {}) as typeof f; } catch { return null; }
  const c = f(0, 0), a = f(1, 0) - c, b = f(0, 1) - c;
  for (const [x, y] of [[2.3, -1.7], [-3.1, 4.2], [7.5, 0.6]]) {
    const want = a * x + b * y + c;
    if (!(Math.abs(f(x, y) - want) <= 1e-9 * Math.max(1, Math.abs(want)))) return null;
  }
  const [ra, rb, rc] = [a, b, c].map((v) => rat(v));
  return ra && rb && rc ? { a: ra, b: rb, k: neg(rc) } : null;
}

const rowTerms = (r: Row): Term[] => [{ c: r.a, v: 'x', k: 1 }, { c: r.b, v: 'y', k: 1 }];
const rowTex = (r: Row) => `${termsTex(rowTerms(r))} = ${fx(r.k).tex}`;
const rowCheck = (r: Row): [string, string] => [termsExpr(rowTerms(r)), fexpr(r.k)];
const cases = (rows: string[]) => `\\begin{cases} ${rows.map((r, i) => `${r} & (${i + 1})`).join(' \\\\ ')} \\end{cases}`;
const scaleRow = (r: Row, m: Fraction): Row => ({ a: r.a.mul(m), b: r.b.mul(m), k: r.k.mul(m) });

function looksStandard(lhs: N, rhs: N): boolean {
  if (dependsOn(rhs, 'x') || dependsOn(rhs, 'y')) return false;
  let parens = false, xs = 0, ys = 0, consts = 0;
  lhs.traverse((n: any, path: string) => {
    if (n.isParenthesisNode) parens = true;
    if (n.isSymbolNode && path !== 'fn') { if (n.name === 'x') xs++; else if (n.name === 'y') ys++; }
  });
  const top = (n: N): N[] => { n = unwrap(n); return n.isOperatorNode && (n.fn === 'add' || n.fn === 'subtract') ? [...top(n.args[0]), ...top(n.args[1])] : [n]; };
  for (const t of top(lhs)) if (!dependsOn(t, 'x') && !dependsOn(t, 'y')) consts++;
  return !parens && xs <= 1 && ys <= 1 && consts === 0;
}

/** Worked solution of two linear equations in x and y, by elimination or substitution. */
export function systemSteps(eqs: [MathNode, MathNode][], scope: Record<string, unknown> = {}): Step[] | null {
  if (eqs.length !== 2) return null;
  const rows = eqs.map(([l, r]) => affine(op('-', 'subtract', [l, new math.ParenthesisNode(r)]), scope));
  if (!rows[0] || !rows[1]) return null;
  const [r1, r2] = rows as Row[];
  const steps: Step[] = [];
  const sysStep = (rs: Row[], note: string, args?: Step['args']) =>
    steps.push({ tex: rs.length > 1 ? cases(rs.map(rowTex)) : rowTex(rs[0]), note, args, check: { kind: 'system', eqs: rs.map(rowCheck) } });
  if (!eqs.every(([l, r]) => looksStandard(bind(l, ['x', 'y'], scope), bind(r, ['x', 'y'], scope)))) sysStep([r1, r2], 'steps.sysStandard');

  const det = r1.a.mul(r2.b).sub(r2.a.mul(r1.b));
  if (isZ(det)) {
    const consistent = isZ(r1.a.mul(r2.k).sub(r2.a.mul(r1.k))) && isZ(r1.b.mul(r2.k).sub(r2.b.mul(r1.k)));
    steps.push({
      tex: `a_1 b_2 - a_2 b_1 = ${ftexP(r1.a)}\\cdot ${ftexP(r2.b)} - ${ftexP(r2.a)}\\cdot ${ftexP(r1.b)} = 0`,
      note: consistent ? 'steps.sysInfinite' : 'steps.sysNone',
      check: { kind: 'values', parts: [`${fexpr(r1.a)}*${fexpr(r2.b)} - ${fexpr(r2.a)}*${fexpr(r1.b)}`, '0'] },
    });
    return steps;
  }
  const x = r1.k.mul(r2.b).sub(r2.k.mul(r1.b)).div(det);
  const y = r1.a.mul(r2.k).sub(r2.a.mul(r1.k)).div(det);
  const sol = { x, y };
  const coef = (r: Row, w: 'x' | 'y') => (w === 'x' ? r.a : r.b);
  const other = (w: 'x' | 'y') => (w === 'x' ? 'y' : 'x');
  const finish = () => steps.push({
    tex: `x = ${fx(x).tex},\\quad y = ${fx(y).tex}`, note: 'steps.solutions',
    check: { kind: 'solutions', sols: [{ x: fexpr(x), y: fexpr(y) }] },
  });
  const single = (ts: Term[], k: Fraction, note: string, args?: Step['args']) =>
    steps.push({ tex: `${termsTex(ts)} = ${fx(k).tex}`, note, args, check: { kind: 'system', eqs: [[termsExpr(ts), fexpr(k)]] } });

  // opposite or equal coefficients: add or subtract straight away
  const direct = (['y', 'x'] as const).find((w) => !isZ(coef(r1, w)) && (same(coef(r1, w), coef(r2, w)) || same(coef(r1, w), neg(coef(r2, w)))));
  const unit = direct ? undefined : ([[0, 'y'], [0, 'x'], [1, 'y'], [1, 'x']] as const).find(([i, w]) => {
    const c = coef([r1, r2][i], w);
    return (isOne(c) || isOne(neg(c))) && !isZ(coef([r1, r2][1 - i], w));
  });

  if (unit) {
    // substitution: w = (k − a·u)/c from equation i, then into equation j
    const [i, w] = unit;
    const u = other(w);
    const ri = [r1, r2][i], rj = [r1, r2][1 - i];
    const cw = coef(ri, w), cu = coef(ri, u);
    const isoConst = ri.k.div(cw), isoU = neg(cu).div(cw);
    const iso: Term[] = [{ c: isoConst, v: u, k: 0 }, { c: isoU, v: u, k: 1 }];
    const isoTex = termsTex(iso), isoExpr = termsExpr(iso);
    steps.push({ tex: `${w} = ${isoTex}`, note: 'steps.sysIsolate', args: { v: w, eq: `${i + 1}` }, check: { kind: 'system', eqs: [[w, isoExpr]] } });
    const cwj = coef(rj, w), cuj = coef(rj, u);
    const uPart = isZ(cuj) ? '' : termsTex([{ c: cuj, v: u, k: 1 }]);
    const mag = fx(cwj.s < 0 ? neg(cwj) : cwj);
    const wCoef = `${cwj.s < 0 ? '- ' : uPart ? '+ ' : ''}${mag.value === 1 ? '' : mag.tex}`;
    steps.push({
      tex: `${uPart} ${wCoef}\\left(${isoTex}\\right) = ${fx(rj.k).tex}`,
      note: 'steps.sysSubstitute', args: { v: w, eq: `${2 - i}` },
      check: { kind: 'system', eqs: [[`${isZ(cuj) ? '0' : `${fexpr(cuj)}*${u}`} + ${fexpr(cwj)}*(${isoExpr})`, fexpr(rj.k)]] },
    });
    const cuNew = cuj.add(cwj.mul(isoU)), kNew = cwj.mul(isoConst);
    const lhs: Term[] = [{ c: cuNew, v: u, k: 1 }, { c: kNew, v: u, k: 0 }];
    if (!isZ(kNew)) single(lhs, rj.k, 'steps.expandCollect');
    single([{ c: F(1), v: u, k: 1 }], sol[u], 'steps.isolate', { v: u });
    const back: Term[] = [{ c: isoConst, v: u, k: 0 }, { c: isoU.mul(sol[u]), v: u, k: 0 }];
    steps.push({
      tex: `${w} = ${termsTex(back)} = ${fx(sol[w]).tex}`, note: 'steps.sysBack', args: { v: u, val: fx(sol[u]).text },
      check: { kind: 'system', eqs: [[w, termsExpr(back)], [w, fexpr(sol[w])]] },
    });
    finish();
    return steps;
  }

  // elimination of w (a variable in both equations): m1·(1) ± m2·(2)
  const w = direct ?? (['y', 'x'] as const).find((z) => !isZ(coef(r1, z)) && !isZ(coef(r2, z)));
  if (!w) {
    // each equation has one unknown
    for (const z of ['x', 'y'] as const) single([{ c: F(1), v: z, k: 1 }], sol[z], 'steps.isolate', { v: z });
    finish();
    return steps;
  }
  const u = other(w);
  let m1 = F(1), m2 = F(1);
  if (!direct) {
    const b1 = coef(r1, w), b2 = coef(r2, w);
    const absF = (f: Fraction) => (f.s < 0 ? neg(f) : f);
    m1 = absF(b2); m2 = absF(b1);
    if (m1.d === 1 && m2.d === 1) { const g = gcd(m1.n, m2.n); m1 = m1.div(g); m2 = m2.div(g); }
    sysStep([scaleRow(r1, m1), scaleRow(r2, m2)], 'steps.sysMultiply', { m1: fx(m1).text, m2: fx(m2).text });
  }
  const s1 = scaleRow(r1, m1), s2 = scaleRow(r2, m2);
  const subtract = same(coef(s1, w), coef(s2, w));
  const comb: Row = subtract
    ? { a: s1.a.sub(s2.a), b: s1.b.sub(s2.b), k: s1.k.sub(s2.k) }
    : { a: s1.a.add(s2.a), b: s1.b.add(s2.b), k: s1.k.add(s2.k) };
  const cu = coef(comb, u);
  single([{ c: cu, v: u, k: 1 }], comb.k, subtract ? 'steps.sysSubtract' : 'steps.sysAdd', { v: w });
  if (!isOne(cu)) single([{ c: F(1), v: u, k: 1 }], sol[u], 'steps.divide', { k: fx(cu).text });
  const i = isZ(coef(r1, w)) ? 1 : 0;
  const ri = [r1, r2][i];
  const sub: Term[] = u === 'x'
    ? [{ c: ri.a.mul(sol.x), v: 'x', k: 0 }, { c: ri.b, v: 'y', k: 1 }]
    : [{ c: ri.a, v: 'x', k: 1 }, { c: ri.b.mul(sol.y), v: 'y', k: 0 }];
  single(sub, ri.k, 'steps.sysSubstituteValue', { v: u, val: fx(sol[u]).text, eq: `${i + 1}` });
  single([{ c: F(1), v: w, k: 1 }], sol[w], 'steps.isolate', { v: w });
  finish();
  return steps;
}

// ---------- factoring ----------

/** Factor steps: common factor, difference of squares, rational roots with synthetic division, irreducible rest. */
export function factorSteps(p: Poly, v = 'x'): Step[] | null {
  p = trim(p);
  if (p.length < 2) return null;
  const { content, ints } = primitive(p);
  const steps: Step[] = [];
  let k = 0;
  while (k < ints.length - 1 && ints[k] === 0) k++;
  const parts: number[][] = [];
  for (let i = 0; i < k; i++) parts.push([0, 1]);
  const work: { ints: number[]; done: boolean }[] = [{ ints: ints.slice(k), done: false }];
  const all = () => [...parts, ...work.filter((w) => w.ints.length > 1 || w.ints[0] !== 1).map((w) => w.ints)];
  const origTex = termsTex(termsOf(p, v));
  const push = (note: string, args?: Step['args']) => {
    const f = factored(content, all(), v);
    steps.push({ tex: `${steps.length ? '' : origTex} = ${f.tex}`, note, args, check: { kind: 'expr', parts: [f.expr] } });
  };
  if (k || !isOne(content)) {
    push('steps.commonFactor', { f: factored(content, parts, v).text });
  }
  for (let guard = 0; guard < 50; guard++) {
    const i = work.findIndex((w) => !w.done && w.ints.length > 2);
    if (i < 0) break;
    const cur = work[i].ints;
    const ds = differenceOfSquares(cur);
    if (ds) {
      work.splice(i, 1, { ints: ds[0], done: false }, { ints: ds[1], done: false });
      push('steps.diffSquares');
      continue;
    }
    const r = rationalRoot(intsPoly(cur));
    if (r) {
      const lin = [-r.s * r.n, r.d];
      const next = primitive(syntheticDivision(intsPoly(cur), r).quotient).ints;
      work.splice(i, 1, { ints: lin, done: true }, { ints: next, done: false });
      if (cur.length === 3) push('steps.factorQuadRoots', { r: fx(r).text });
      else {
        const f = factored(content, all(), v);
        steps.push({
          tex: `${syntheticTable(cur, r)} \\quad\\Rightarrow\\quad ${steps.length ? '' : `${origTex} = `}${f.tex}`,
          note: 'steps.factorRoot', args: { r: fx(r).text },
          check: { kind: 'expr', parts: [f.expr] },
        });
      }
      continue;
    }
    work[i].done = true;
    if (cur.length === 3) {
      const { step, D } = discriminantStep(cur);
      steps.push({ ...step, note: 'steps.irreducibleQuad', args: { f: polyText(cur, v), D: `${D}` } });
    } else steps.push({ tex: polyTex(cur, texName(v)), note: 'steps.irreducible', args: { f: polyText(cur, v) }, check: { kind: 'info' } });
  }
  if (!steps.length) steps.push({ tex: factored(content, all(), v).tex, note: 'steps.irreducible', args: { f: polyText(ints, v) }, check: { kind: 'expr', parts: [termsExpr(termsOf(p, v))] } });
  return steps;
}

// ---------- derivatives with named rules ----------

const FN_RULES: Record<string, { rule: string; d: (a: N) => N }> = {
  sin: { rule: 'steps.rule.sin', d: (a) => call('cos', a) },
  cos: { rule: 'steps.rule.cos', d: (a) => negN(call('sin', a)) },
  tan: { rule: 'steps.rule.tan', d: (a) => pow(call('sec', a), C(2)) },
  asin: { rule: 'steps.rule.asin', d: (a) => div(C(1), call('sqrt', subt(C(1), pow(a, C(2))))) },
  acos: { rule: 'steps.rule.acos', d: (a) => negN(div(C(1), call('sqrt', subt(C(1), pow(a, C(2)))))) },
  atan: { rule: 'steps.rule.atan', d: (a) => div(C(1), add(C(1), pow(a, C(2)))) },
  exp: { rule: 'steps.rule.exp', d: (a) => call('exp', a) },
  ln: { rule: 'steps.rule.ln', d: (a) => div(C(1), a) },
  log: { rule: 'steps.rule.ln', d: (a) => div(C(1), a) },
  log10: { rule: 'steps.rule.log', d: (a) => div(C(1), mul(a, call('ln', C(10)))) },
  sqrt: { rule: 'steps.rule.sqrt', d: (a) => div(C(1), mul(C(2), call('sqrt', a))) },
};

/** One application of a differentiation rule to D(u). */
function applyRule(u: N, v: string, rules: Set<string>): N {
  u = unwrap(u);
  if (!dependsOn(u, v)) { rules.add('steps.rule.constant'); return C(0); }
  if (u.isSymbolNode) { rules.add('steps.rule.power'); return C(1); }
  if (u.isOperatorNode) {
    const a = u.args as N[];
    switch (u.fn) {
      case 'add': case 'subtract':
        rules.add('steps.rule.sum');
        return op(u.op, u.fn, a.map((x) => D(x)));
      case 'unaryMinus':
        rules.add('steps.rule.constMultiple');
        return negN(D(a[0]));
      case 'unaryPlus':
        return D(a[0]);
      case 'multiply': {
        const dep = a.filter((x) => dependsOn(x, v));
        if (dep.length === 1) {
          rules.add('steps.rule.constMultiple');
          return a.map((x) => (x === dep[0] ? D(x) : x)).reduce((p, q) => mul(p, q));
        }
        rules.add('steps.rule.product');
        const [f, ...rest] = a;
        const g = rest.reduce((p, q) => mul(p, q));
        return add(mul(D(f), g), mul(f, D(g)));
      }
      case 'divide': {
        const [n, d] = a;
        if (!dependsOn(d, v)) { rules.add('steps.rule.constMultiple'); return div(D(n), d); }
        rules.add('steps.rule.quotient');
        return div(subt(mul(D(n), d), mul(n, D(d))), pow(d, C(2)));
      }
      case 'pow': {
        const [b, e] = a.map(unwrap);
        if (!dependsOn(e, v)) {
          rules.add('steps.rule.power');
          const e1 = isNum(e) ? C(e.value - 1) : subt(e, C(1));
          const outer = mul(e, pow(b, e1));
          if (b.isSymbolNode) return outer;
          rules.add('steps.rule.chain');
          return mul(outer, D(b));
        }
        if (!dependsOn(b, v)) {
          rules.add('steps.rule.expBase');
          const outer = b.isSymbolNode && b.name === 'e' ? pow(b, e) : mul(pow(b, e), call('ln', b));
          if (e.isSymbolNode) return outer;
          rules.add('steps.rule.chain');
          return mul(outer, D(e));
        }
        throw new NoSteps();
      }
    }
    throw new NoSteps();
  }
  if (u.isFunctionNode && u.args.length === 1 && FN_RULES[u.fn.name]) {
    const { rule, d } = FN_RULES[u.fn.name];
    rules.add(rule);
    const arg = unwrap(u.args[0]);
    if (arg.isSymbolNode) return d(arg);
    rules.add('steps.rule.chain');
    return mul(d(arg), D(arg));
  }
  throw new NoSteps();
}

/** Remove 0 and 1 factors, fold numbers and tidy signs; keeps the order of everything else. */
function tidy(n: MathNode): N {
  return (n as N).transform((m: any) => {
    if (m.isParenthesisNode) return tidy(m.content);
    if (!m.isOperatorNode) return m.isFunctionNode ? new math.FunctionNode(m.fn, m.args.map(tidy)) : m;
    const a = m.args.map(tidy) as N[];
    if (a.every(isNum) && m.fn !== 'divide' && !(m.fn === 'pow' && !Number.isInteger(a[1].value))) {
      const val = (op(m.op, m.fn, a).compile().evaluate() as number);
      return C(val);
    }
    const z = (x: N) => isNum(x) && x.value === 0, one = (x: N) => isNum(x) && x.value === 1;
    switch (m.fn) {
      case 'add':
        if (z(a[0])) return a[1];
        if (z(a[1])) return a[0];
        if (isNum(a[1]) && a[1].value < 0) return subt(a[0], C(-a[1].value));
        if (a[1].isOperatorNode && a[1].fn === 'unaryMinus') return subt(a[0], a[1].args[0]);
        if (a[1].isOperatorNode && a[1].fn === 'multiply' && isNum(a[1].args[0]) && a[1].args[0].value < 0) {
          return subt(a[0], tidy(mul(C(-a[1].args[0].value), a[1].args[1])));
        }
        return add(a[0], a[1]);
      case 'subtract':
        if (z(a[1])) return a[0];
        if (z(a[0])) return tidy(negN(a[1]));
        if (isNum(a[1]) && a[1].value < 0) return add(a[0], C(-a[1].value));
        if (a[1].isOperatorNode && a[1].fn === 'unaryMinus') return add(a[0], a[1].args[0]);
        return subt(a[0], a[1]);
      case 'unaryMinus':
        if (isNum(a[0])) return C(-a[0].value);
        if (a[0].isOperatorNode && a[0].fn === 'unaryMinus') return a[0].args[0];
        if (a[0].isOperatorNode && a[0].fn === 'multiply' && isNum(a[0].args[0])) return tidy(mul(C(-a[0].args[0].value), a[0].args[1]));
        return negN(a[0]);
      case 'multiply':
        if (z(a[0]) || z(a[1])) return C(0);
        if (one(a[0])) return a[1];
        if (one(a[1])) return a[0];
        if (isNum(a[0]) && a[0].value === -1) return tidy(negN(a[1]));
        if (isNum(a[0]) && a[1].isOperatorNode && a[1].fn === 'multiply' && isNum(a[1].args[0])) {
          return tidy(mul(C(a[0].value * a[1].args[0].value), a[1].args[1]));
        }
        return mul(a[0], a[1]);
      case 'divide':
        if (z(a[0])) return C(0);
        if (one(a[1])) return a[0];
        return div(a[0], a[1]);
      case 'pow':
        if (one(a[1])) return a[0];
        if (z(a[1])) return C(1);
        return pow(a[0], a[1]);
    }
    return op(m.op, m.fn, a);
  }) as N;
}

const asPoly = (n: N, v: string): N | null => {
  const c = n.isConstantNode ? null : polyCoefficients(n, v);
  return c ? tidy(math.parse(termsExpr(termsOf(c, v)))) : null;
};

/**
 * Final tidy-up: polynomial sums collected; products as number · powers of v · everything else,
 * with 1/d factors moved into one denominator.
 */
function simplifyFinal(n: N, v: string): N {
  const whole = asPoly(n, v);
  if (whole) return whole;
  const sums = n.transform((m: any) => (m.isOperatorNode && ['add', 'subtract', 'unaryMinus'].includes(m.fn) ? asPoly(m, v) ?? m : m)) as N;
  return tidy(sums.transform((m: any) => {
    if (!(m.isOperatorNode && m.fn === 'multiply')) return m;
    const factors: N[] = [];
    const flat = (x: N) => { x = unwrap(x); if (x.isOperatorNode && x.fn === 'multiply') x.args.forEach(flat); else factors.push(x); };
    flat(m);
    let k = 1;
    const vars: N[] = [], rest: N[] = [], dens: N[] = [];
    for (const f of factors) {
      if (isNum(f)) k *= f.value;
      else if (f.isOperatorNode && f.fn === 'divide' && isNum(unwrap(f.args[0]))) { k *= unwrap(f.args[0]).value; dens.push(f.args[1]); }
      else if (f.isSymbolNode || (f.isOperatorNode && f.fn === 'pow' && unwrap(f.args[0]).isSymbolNode && isNum(unwrap(f.args[1])))) vars.push(f);
      else rest.push(f);
    }
    const top = [...(k === 1 && (vars.length || rest.length) ? [] : [C(k)]), ...vars, ...rest].reduce((p, q) => mul(p, q));
    return dens.length ? div(top, dens.reduce((p, q) => mul(p, q))) : top;
  }));
}

/** Worked derivative of node with respect to v, one rule per line. Null for inputs these rules do not cover. */
export function derivativeSteps(node: MathNode, v = 'x', scope: Record<string, unknown> = {}): Step[] | null {
  try {
    const f = bind(node, [v], scope);
    const head = `${texOf(D(f), v)} = `;
    let cur: N = D(f);
    const steps: Step[] = [];
    for (let i = 0; i < 40; i++) {
      let any = false;
      const rules = new Set<string>();
      const next = cur.transform((m: any) => { if (isD(m)) { any = true; return applyRule(m.args[0], v, rules); } return m; }) as N;
      if (!any) break;
      cur = tidy(next);
      steps.push({
        tex: `${steps.length ? '= ' : head}${texOf(cur, v)}`,
        note: 'steps.rules', args: { rules: [...rules] },
        check: { kind: 'expr', parts: steps.length ? [cur.toString()] : [D(f).toString(), cur.toString()] },
      });
    }
    const fin = simplifyFinal(cur, v);
    if (fin.toString() !== cur.toString()) steps.push({ tex: `= ${texOf(fin, v)}`, note: 'steps.simplify', check: { kind: 'expr', parts: [fin.toString()] } });
    return steps.length ? steps : null;
  } catch (e) {
    if (e instanceof NoSteps) return null;
    throw e;
  }
}

/** Fill a translated note's {placeholders}; list arguments are i18n keys joined with commas. */
export function formatNote(step: Step, t: (key: string) => string, comma = ', '): string {
  return t(step.note).replace(/\{(\w+)\}/g, (m, k: string) => {
    const a = step.args?.[k];
    if (a === undefined) return m;
    return Array.isArray(a) ? a.map(t).join(comma) : a;
  });
}
