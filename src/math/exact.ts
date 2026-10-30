import type { MathNode } from 'mathjs';
import { math } from './compile';

/** A number in exact form: plain text for the value line and LaTeX for rendering. */
export interface Exact { value: number; text: string; tex: string }

const TOL = 1e-10;
const MINUS = '−';
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export const gcd = (a: number, b: number): number => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const sup = (n: number) => String(n).replace(/\d/g, (d) => SUP[+d]);
const minus = (s: string) => s.replace(/-/g, MINUS);

/** Best p/q with q ≤ maxDen within tol of v (continued fraction convergents), or null. */
export function rationalApprox(v: number, maxDen = 1000, tol = TOL): [number, number] | null {
  if (!Number.isFinite(v)) return null;
  const x = Math.abs(v), sign = v < 0 ? -1 : 1;
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, y = x;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(y);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen || !Number.isSafeInteger(h2)) break;
    [h0, h1, k0, k1] = [h1, h2, k1, k2];
    if (Math.abs(x - h1 / k1) <= tol * Math.max(1, x)) return [sign * h1 || 0, k1];
    const frac = y - a;
    if (frac < 1e-15) break;
    y = 1 / frac;
  }
  return null;
}

/** n = k²·m with m squarefree. */
export function sqrtParts(n: number): [number, number] {
  let k = 1, m = n;
  for (let p = 2; p * p <= m; p++) while (m % (p * p) === 0) { m /= p * p; k *= p; }
  return [k, m];
}

const SQUAREFREE = Array.from({ length: 99 }, (_, i) => i + 2).filter((n) => sqrtParts(n)[0] === 1);

// ---------- formatting ----------

export function ratExact(p: number, q: number): Exact {
  const g = gcd(p, q) || 1;
  p /= g; q /= g;
  if (q < 0) { p = -p; q = -q; }
  const neg = p < 0 ? '-' : '';
  return {
    value: p / q,
    text: minus(q === 1 ? `${p}` : `${p}/${q}`),
    tex: q === 1 ? `${p}` : `${neg}\\frac{${Math.abs(p)}}{${q}}`,
  };
}

/** (p/q)·R for a radical symbol R such as √2 or π. */
function scaled(p: number, q: number, sym: string, symTex: string, value: number): Exact {
  const g = gcd(p, q) || 1;
  p /= g; q /= g;
  const neg = p < 0 ? MINUS : '';
  const c = Math.abs(p) === 1 ? '' : String(Math.abs(p));
  return {
    value,
    text: `${neg}${c}${sym}${q === 1 ? '' : `/${q}`}`,
    tex: `${neg ? '-' : ''}${q === 1 ? `${c}${symTex}` : `\\frac{${c}${symTex}}{${q}}`}`,
  };
}

/** (a + b√n)/c in lowest terms. */
export function surd(a: number, b: number, n: number, c: number): Exact {
  const [k, m] = sqrtParts(n);
  b *= k; n = m;
  if (n === 1) { a += b; b = 0; }
  if (c < 0) { a = -a; b = -b; c = -c; }
  const value = (a + b * Math.sqrt(n)) / c;
  if (b === 0) return ratExact(a, c);
  if (a === 0) return scaled(b, c, `√${n}`, `\\sqrt{${n}}`, value);
  const g = gcd(gcd(a, b), c);
  a /= g; b /= g; c /= g;
  const bt = Math.abs(b) === 1 ? '' : String(Math.abs(b));
  const num = `${a} ${b < 0 ? '-' : '+'} ${bt}√${n}`;
  const numTex = `${a} ${b < 0 ? '-' : '+'} ${bt}\\sqrt{${n}}`;
  return { value, text: minus(c === 1 ? num : `(${num})/${c}`), tex: c === 1 ? numTex : `\\frac{${numTex}}{${c}}` };
}

/**
 * Recognise a float as an exact value: p/q (q ≤ 1000), (p/q)√n, (p/q)π or (a ± b√n)/c.
 * Returns null unless the match holds to ~1e-10, so arbitrary decimals stay decimal.
 */
export function toExact(v: number): Exact | null {
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) >= 1e9) return Number.isSafeInteger(v) ? ratExact(v, 1) : null;
  const r = rationalApprox(v);
  if (r) return ratExact(r[0], r[1]);
  for (const n of SQUAREFREE) {
    const s = rationalApprox(v / Math.sqrt(n), 100);
    if (s) return scaled(s[0], s[1], `√${n}`, `\\sqrt{${n}}`, v);
  }
  const p = rationalApprox(v / Math.PI, 100);
  if (p) return scaled(p[0], p[1], 'π', '\\pi', v);
  const tol = TOL * Math.max(1, Math.abs(v));
  for (const n of SQUAREFREE) {
    const rt = Math.sqrt(n);
    for (let c = 1; c <= 24; c++) {
      for (let b = 1; b <= 24; b++) {
        for (const sb of [b, -b]) {
          const a = c * v - sb * rt;
          const ar = Math.round(a);
          if (ar !== 0 && Math.abs(ar) <= 1000 && Math.abs(a - ar) <= tol * c) return { ...surd(ar, sb, n, c), value: v };
        }
      }
    }
  }
  return null;
}

// ---------- polynomials with rational coefficients ----------
// A polynomial is an array of coefficients in ascending order: [c0, c1, …, cn].

/** mathjs fraction (fraction.js): sign s, numerator n ≥ 0, denominator d > 0. */
export interface Fraction {
  s: number; n: number; d: number;
  add(x: Fraction | number): Fraction; sub(x: Fraction | number): Fraction;
  mul(x: Fraction | number): Fraction; div(x: Fraction | number): Fraction;
  valueOf(): number;
}
export type Poly = Fraction[];

const F = (n: number, d = 1) => math.fraction(n, d) as unknown as Fraction;
const ZERO = F(0);
const isZero = (f: Fraction) => f.n === 0;

/** A float coefficient as an exact fraction (denominator ≤ 10⁶), or null if it does not look rational. */
export function rat(v: number): Fraction | null {
  const r = rationalApprox(v, 1e6, 1e-12);
  return r ? F(r[0], r[1]) : null;
}

export function trim(p: Poly): Poly {
  let n = p.length;
  while (n > 0 && isZero(p[n - 1])) n--;
  return p.slice(0, n);
}

export const degree = (p: Poly) => trim(p).length - 1;

export function evalPoly(p: Poly, x: Fraction): Fraction {
  let s = ZERO;
  for (let i = p.length - 1; i >= 0; i--) s = s.mul(x).add(p[i]);
  return s;
}

export function derivativePoly(p: Poly): Poly {
  return trim(p.slice(1).map((c, i) => c.mul(i + 1)));
}

/** Divide by (x − r): returns the quotient and the remainder p(r). */
export function syntheticDivision(p: Poly, r: Fraction): { quotient: Poly; remainder: Fraction } {
  const n = p.length - 1;
  if (n < 1) return { quotient: [], remainder: p[0] ?? ZERO };
  const q: Fraction[] = new Array(n);
  let carry = p[n];
  for (let i = n - 1; i >= 0; i--) { q[i] = carry; carry = p[i].add(carry.mul(r)); }
  return { quotient: q, remainder: carry };
}

/** p = content · ints, where ints are coprime integers with a positive leading coefficient. */
export function primitive(p: Poly): { content: Fraction; ints: number[] } {
  p = trim(p);
  if (!p.length) return { content: ZERO, ints: [] };
  const l = p.reduce((m, c) => (m * c.d) / gcd(m, c.d), 1);
  let ints = p.map((c) => c.mul(l).valueOf() as number);
  let g = ints.reduce((m, c) => gcd(m, c), 0);
  if (ints[ints.length - 1] < 0) g = -g;
  ints = ints.map((c) => c / g || 0);
  return { content: F(g).div(l), ints };
}

const divisors = (n: number): number[] => {
  n = Math.abs(n);
  const out: number[] = [];
  for (let i = 1; i * i <= n; i++) if (n % i === 0) { out.push(i); if (i * i !== n) out.push(n / i); }
  return out;
};

/** The smallest rational root of p (rational root theorem), or null. */
export function rationalRoot(p: Poly): Fraction | null {
  const { ints } = primitive(p);
  if (ints.length < 2) return null;
  if (ints[0] === 0) return ZERO;
  const a0 = ints[0], an = ints[ints.length - 1];
  if (Math.abs(a0) > 1e9 || Math.abs(an) > 1e9) return null;
  const cands: Fraction[] = [];
  for (const num of divisors(a0)) for (const den of divisors(an)) cands.push(F(num, den), F(-num, den));
  cands.sort((x, y) => (x.valueOf() as number) - (y.valueOf() as number));
  return cands.find((c) => isZero(evalPoly(p, c))) ?? null;
}

/** Every rational root with multiplicity (ascending) and what is left after dividing them out. */
export function rationalRoots(p: Poly): { roots: Fraction[]; rest: Poly } {
  let rest = trim(p);
  const roots: Fraction[] = [];
  for (let r = rationalRoot(rest); r && rest.length > 1; r = rationalRoot(rest)) {
    roots.push(r);
    rest = syntheticDivision(rest, r).quotient;
  }
  return { roots: roots.sort((a, b) => (a.valueOf() as number) - (b.valueOf() as number)), rest };
}

/** Real roots of a·x² + b·x + c in exact form (empty when the discriminant is negative). */
export function quadraticRoots(q: Poly): Exact[] {
  const { ints } = primitive(q);
  const [c, b, a] = ints;
  const D = b * b - 4 * a * c;
  if (D < 0) return [];
  if (D === 0) return [ratExact(-b, 2 * a)];
  return [surd(-b, -1, D, 2 * a), surd(-b, 1, D, 2 * a)].sort((x, y) => x.value - y.value);
}

/**
 * Distinct real roots of p in exact form. `complete` is false when part of p (degree ≥ 3, no
 * rational roots) could hide roots that have no closed form here.
 */
export function exactRoots(p: Poly): { roots: Exact[]; complete: boolean } {
  p = trim(p);
  if (p.length <= 1) return { roots: [], complete: p.length === 1 };
  const { roots, rest } = rationalRoots(p);
  const out: Exact[] = [];
  for (const r of roots) if (!out.some((e) => e.value === r.valueOf())) out.push(ratExact(r.s * r.n, r.d));
  const d = rest.length - 1;
  if (d === 2) out.push(...quadraticRoots(rest));
  return { roots: out.sort((a, b) => a.value - b.value), complete: d <= 2 };
}

const coefCache = new Map<string, Poly | null>();

/**
 * Coefficients of `node` as a polynomial in `variable` (ascending), using math.rationalize.
 * Names with numeric values in `scope` (sliders) are substituted. Null when it is not a
 * polynomial with rational coefficients.
 */
export function polyCoefficients(node: MathNode, variable = 'x', scope: Record<string, unknown> = {}): Poly | null {
  const sub = node.transform((n: MathNode, path: string) => {
    const s = n as unknown as { isSymbolNode?: boolean; name: string };
    if (s.isSymbolNode && path !== 'fn' && s.name !== variable && typeof scope[s.name] === 'number') {
      return new math.ConstantNode(scope[s.name] as number) as MathNode;
    }
    return n;
  });
  const key = `${variable}|${sub.toString()}`;
  if (coefCache.has(key)) return coefCache.get(key)!;
  let out: Poly | null = null;
  try {
    const r = math.rationalize(sub, {}, true) as unknown as { variables: string[]; coefficients: number[]; denominator: MathNode | null };
    if (!r.denominator && r.variables.every((v) => v === variable)) {
      const nums = r.variables.length ? r.coefficients : [sub.evaluate() as number];
      const fr = nums.map(rat);
      if (fr.every((f) => f)) out = trim(fr as Fraction[]);
    }
  } catch { /* not a polynomial */ }
  if (coefCache.size > 500) coefCache.clear();
  coefCache.set(key, out);
  return out;
}

// ---------- factoring ----------

export interface Factorization {
  /** Rational constant in front (carries the sign). */
  content: Fraction;
  /** Primitive integer polynomials (ascending coefficients) with their multiplicity. */
  factors: { ints: number[]; mult: number }[];
}

const isqrt = (n: number) => { const r = Math.round(Math.sqrt(n)); return r * r === n ? r : null; };

/** a·x^(2k) − b with a and b perfect squares → (√a·x^k − √b)(√a·x^k + √b). */
export function differenceOfSquares(ints: number[]): [number[], number[]] | null {
  const n = ints.length - 1;
  if (n < 2 || n % 2 || ints.slice(1, n).some((c) => c !== 0)) return null;
  const a = isqrt(ints[n]), b = ints[0] < 0 ? isqrt(-ints[0]) : null;
  if (!a || !b) return null;
  const half = (s: number) => { const p = new Array(n / 2 + 1).fill(0); p[0] = s * b; p[n / 2] = a; return p; };
  return [half(-1), half(1)];
}

const toPoly = (ints: number[]): Poly => ints.map((c) => F(c));

function split(ints: number[]): number[][] {
  if (ints.length <= 2) return [ints];
  const ds = differenceOfSquares(ints);
  if (ds) return [...split(ds[0]), ...split(ds[1])];
  const p = toPoly(ints);
  const r = rationalRoot(p);
  if (!r) return [ints];
  const lin = [-r.s * r.n, r.d];
  return [lin, ...split(primitive(syntheticDivision(p, r).quotient).ints)];
}

/**
 * Factor over the rationals: common factor, then difference of squares, then rational roots with
 * synthetic division; what remains (e.g. an irreducible quadratic) is kept as one factor.
 */
export function factorPoly(p: Poly): Factorization {
  const { content, ints } = primitive(p);
  const factors: Factorization['factors'] = [];
  const push = (f: number[]) => {
    const same = factors.find((g) => g.ints.length === f.length && g.ints.every((c, i) => c === f[i]));
    if (same) same.mult++; else factors.push({ ints: f, mult: 1 });
  };
  let k = 0;
  while (k < ints.length - 1 && ints[k] === 0) k++;
  if (k) factors.push({ ints: [0, 1], mult: k });
  const rest = ints.slice(k);
  if (rest.length > 1) for (const f of split(rest)) push(f);
  return { content, factors };
}

/** Plain-text polynomial: x² − 5x + 6. */
export function polyText(ints: number[], v = 'x'): string {
  const terms: string[] = [];
  for (let i = ints.length - 1; i >= 0; i--) {
    const c = ints[i];
    if (!c) continue;
    const a = Math.abs(c);
    const body = i === 0 ? String(a) : `${a === 1 ? '' : a}${v}${i > 1 ? sup(i) : ''}`;
    terms.push(terms.length ? `${c < 0 ? MINUS : '+'} ${body}` : `${c < 0 ? MINUS : ''}${body}`);
  }
  return terms.join(' ') || '0';
}

export function polyTex(ints: number[], v = 'x'): string {
  let s = '';
  for (let i = ints.length - 1; i >= 0; i--) {
    const c = ints[i];
    if (!c) continue;
    const a = Math.abs(c);
    const body = i === 0 ? String(a) : `${a === 1 ? '' : a}${v}${i > 1 ? `^{${i}}` : ''}`;
    s += s ? `${c < 0 ? '-' : '+'}${body}` : `${c < 0 ? '-' : ''}${body}`;
  }
  return s || '0';
}

function renderFactored(f: Factorization, v: string, tex: boolean): string {
  const { content, factors } = f;
  const c = ratExact(content.s * content.n, content.d);
  if (!factors.length) return tex ? c.tex : c.text;
  // a lone factor such as x² + 1 is shown bare; otherwise every sum gets parentheses
  const wrap = factors.length > 1 || c.value !== 1;
  const parts = factors.map(({ ints, mult }) => {
    const inner = tex ? polyTex(ints, v) : polyText(ints, v);
    const base = ints.filter((k) => k).length > 1 && (wrap || mult > 1) ? (tex ? `\\left(${inner}\\right)` : `(${inner})`) : inner;
    return mult > 1 ? (tex ? `${base}^{${mult}}` : `${base}${sup(mult)}`) : base;
  });
  let lead = '';
  if (c.value === -1) lead = tex ? '-' : MINUS;
  else if (c.value !== 1) lead = tex ? c.tex : content.d === 1 ? c.text : `(${c.text})`;
  return lead + parts.join('');
}

export const factoredText = (f: Factorization, v = 'x') => renderFactored(f, v, false);
export const factoredTex = (f: Factorization, v = 'x') => renderFactored(f, v, true);
