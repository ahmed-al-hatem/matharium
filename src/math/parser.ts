import type { RelOp } from './types';

/** Convert keyboard / pretty symbols into parser-friendly ASCII. */
export function normalize(s: string): string {
  return s
    .replace(/π/g, 'pi')
    .replace(/[×·⋅∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√/g, 'sqrt')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/θ/g, 'theta')
    .replace(/∞/g, 'Infinity')
    .replace(/°/g, '*(pi/180)')
    .replace(/\barcsin\b/g, 'asin')
    .replace(/\barccos\b/g, 'acos')
    .replace(/\barctan\b/g, 'atan')
    .trim();
}

const OPEN = '([{';
const CLOSE = ')]}';

/** Split on top-level commas (outside any brackets). */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim() || out.length) out.push(cur.trim());
  return out;
}

/** True when the bracket opened at index 0 closes at the last character. */
function wrapped(s: string, open: string, close: string): boolean {
  if (s[0] !== open || s[s.length - 1] !== close) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (OPEN.includes(s[i])) depth++;
    else if (CLOSE.includes(s[i])) depth--;
    if (depth === 0 && i < s.length - 1) return false;
  }
  return true;
}

/** "(a, b)" or "(a, b, c)" → coordinate strings. */
export function asTuple(s: string): string[] | null {
  s = s.trim();
  if (!wrapped(s, '(', ')')) return null;
  const parts = splitArgs(s.slice(1, -1));
  return parts.length === 2 || parts.length === 3 ? parts : null;
}

/** Polar point "(r; θ)" → [r, θ] strings. */
export function asPolar(s: string): [string, string] | null {
  s = s.trim();
  if (!wrapped(s, '(', ')')) return null;
  const inner = s.slice(1, -1);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (OPEN.includes(inner[i])) depth++;
    else if (CLOSE.includes(inner[i])) depth--;
    else if (inner[i] === ';' && depth === 0) {
      const r = inner.slice(0, i).trim(), th = inner.slice(i + 1).trim();
      return r && th && !th.includes(';') ? [r, th] : null;
    }
  }
  return null;
}

/** "r = f(θ)" (θ is normalized to theta) → the right-hand side. */
export function asPolarCurve(s: string): string | null {
  const m = /^r\s*=(?!=)\s*([\s\S]+)$/.exec(s.trim());
  return m && /(^|[^A-Za-z_])theta(?![A-Za-z_0-9])/.test(m[1]) && !/[<>]|[^<>!=]=[^=]/.test(m[1]) ? m[1].trim() : null;
}

export function asList(s: string): string[] | null {
  s = s.trim();
  if (!wrapped(s, '{', '}')) return null;
  const inner = s.slice(1, -1).trim();
  return inner ? splitArgs(inner) : [];
}

export function asCommand(s: string): { name: string; args: string[] } | null {
  s = s.trim();
  const m = /^([A-Z][A-Za-z]*)\s*\(/.exec(s);
  if (!m) return null;
  const rest = s.slice(m[0].length - 1);
  if (!wrapped(rest, '(', ')')) return null;
  return { name: m[1], args: splitArgs(rest.slice(1, -1)) };
}

/** Find a top-level relational operator. */
export function splitRelation(s: string): { lhs: string; op: RelOp; rhs: string } | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth--;
    if (depth !== 0) continue;
    const two = s.slice(i, i + 2);
    if (two === '<=' || two === '>=') return { lhs: s.slice(0, i).trim(), op: two, rhs: s.slice(i + 2).trim() };
    if (two === '==' || two === '!=') { i++; continue; }
    if (ch === '<' || ch === '>' || ch === '=') {
      if (s[i - 1] === '!' || s[i - 1] === '=') continue;
      return { lhs: s.slice(0, i).trim(), op: ch as RelOp, rhs: s.slice(i + 1).trim() };
    }
  }
  return null;
}

export interface Definition { name?: string; params?: string[]; body: string }

const DEF_RE = /^([A-Za-z][A-Za-z0-9_]*)\s*(?:\(\s*([A-Za-z](?:\s*,\s*[A-Za-z])*)\s*\))?\s*(?::=|:|=(?!=))\s*([\s\S]+)$/;

/** Split "name = body", "f(x) = body", "eq1: body". "y = …"/"x = …"/"z = …" stay equations. */
export function splitDefinition(input: string): Definition {
  const s = normalize(input);
  const m = DEF_RE.exec(s);
  if (!m) return { body: s };
  const [, name, params, body] = m;
  if (!params && ['x', 'y', 'z'].includes(name)) return { body: s };
  if (!params && asPolarCurve(s)) return { body: s };
  // `a(x+1)=3`-style equations would also match – only accept param lists of single letters.
  return { name, params: params ? params.split(',').map((p) => p.trim()) : undefined, body: body.trim() };
}

export type Category = 'point' | 'function' | 'number' | 'equation' | 'list' | 'path' | 'surface' | 'text';

const COMMAND_CAT: Record<string, Category> = {
  Solve: 'text', NSolve: 'text', Simplify: 'function', Expand: 'function',
  Roots: 'list', Extremum: 'list', Intersect: 'list',
  Derivative: 'function', Integral: 'function', Tangent: 'path',
  Segment: 'path', Line: 'path', Ray: 'path', Vector: 'path', Circle: 'path', Polygon: 'path',
  Midpoint: 'point', Reflect: 'point', Rotate: 'point', Translate: 'point',
  Perpendicular: 'path', Parallel: 'path', PerpendicularBisector: 'path',
  Distance: 'number', Angle: 'number', Area: 'number', Length: 'number', Slope: 'number',
  Curve: 'path', Surface: 'surface', Sphere: 'surface',
  FitLine: 'function', FitPoly: 'function', FitExp: 'function', FitLog: 'function', FitPow: 'function', FitSin: 'function',
};

export const COMMANDS = Object.keys(COMMAND_CAT);

/** Rough category used for auto-naming before evaluation. */
export function categorize(input: string): Category {
  const d = splitDefinition(input);
  const body = d.body;
  if (d.params) return d.params.length === 1 ? 'function' : 'surface';
  const cmd = asCommand(body);
  if (cmd) {
    if (cmd.name === 'Integral' && cmd.args.length >= 3) return 'number';
    return COMMAND_CAT[cmd.name] ?? 'text';
  }
  const tup = asTuple(body);
  if (tup) return tup.length === 3 ? 'surface' : 'point';
  if (asPolar(body)) return 'point';
  if (asPolarCurve(body)) return 'path';
  if (asList(body)) return 'list';
  const rel = splitRelation(body);
  if (rel) {
    if (rel.lhs === 'y' && !/\by\b/.test(rel.rhs)) return 'function';
    if (rel.lhs === 'z' || /\bz\b/.test(body)) return 'surface';
    return 'equation';
  }
  const hasX = /(^|[^A-Za-z_])x([^A-Za-z_(]|$)/.test(body) || /\b[xyz]{2,}\b/.test(body);
  const hasY = /(^|[^A-Za-z_])y([^A-Za-z_(]|$)/.test(body);
  if (hasX && hasY) return 'surface';
  if (hasX || /(^|[^A-Za-z_])t([^A-Za-z_(]|$)/.test(body)) return 'function';
  return 'number';
}
