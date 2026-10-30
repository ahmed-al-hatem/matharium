import type { RelOp } from './types';

/** Convert keyboard / pretty symbols into parser-friendly ASCII. Quoted strings are left as typed. */
export function normalize(s: string): string {
  return s.split(/("(?:[^"\\]|\\.)*")/).map((part, i) => (i % 2 ? part : normalizeExpr(part))).join('').trim();
}

function normalizeExpr(s: string): string {
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

/** Walk `s` calling `fn(ch, i, depth)` for every character outside string literals. */
function scan(s: string, fn: (ch: string, i: number, depth: number) => boolean | void) {
  let depth = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (OPEN.includes(ch)) depth++;
    else if (CLOSE.includes(ch)) depth--;
    if (fn(ch, i, depth)) return;
  }
}

/** Split on top-level commas (outside any brackets). */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let start = 0;
  scan(s, (ch, i, depth) => { if (ch === ',' && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; } });
  const last = s.slice(start).trim();
  if (last || out.length) out.push(last);
  return out;
}

/** True when the bracket opened at index 0 closes at the last character. */
function wrapped(s: string, open: string, close: string): boolean {
  if (s[0] !== open || s[s.length - 1] !== close) return false;
  let ok = true;
  scan(s, (_ch, i, depth) => { if (depth === 0 && i < s.length - 1) return !(ok = false); });
  return ok;
}

/** "(a, b)" or "(a, b, c)" → coordinate strings. */
export function asTuple(s: string): string[] | null {
  s = s.trim();
  if (!wrapped(s, '(', ')')) return null;
  const parts = splitArgs(s.slice(1, -1));
  return parts.length === 2 || parts.length === 3 ? parts : null;
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
  let out: { lhs: string; op: RelOp; rhs: string } | null = null;
  let skip = -1;
  scan(s, (ch, i, depth) => {
    if (depth !== 0 || i <= skip) return;
    const two = s.slice(i, i + 2);
    if (two === '<=' || two === '>=') { out = { lhs: s.slice(0, i).trim(), op: two, rhs: s.slice(i + 2).trim() }; return true; }
    if (two === '==' || two === '!=') { skip = i + 1; return; }
    if (ch === '<' || ch === '>' || ch === '=') {
      if (s[i - 1] === '!' || s[i - 1] === '=') return;
      out = { lhs: s.slice(0, i).trim(), op: ch as RelOp, rhs: s.slice(i + 1).trim() };
      return true;
    }
  });
  return out;
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
  // `a(x+1)=3`-style equations would also match – only accept param lists of single letters.
  return { name, params: params ? params.split(',').map((p) => p.trim()) : undefined, body: body.trim() };
}

export type Category = 'point' | 'function' | 'number' | 'equation' | 'list' | 'path' | 'surface' | 'text' | 'label' | 'stroke' | 'arrow';

const COMMAND_CAT: Record<string, Category> = {
  Solve: 'text', NSolve: 'text', Simplify: 'function', Expand: 'function',
  Roots: 'list', Extremum: 'list', Intersect: 'list',
  Derivative: 'function', Integral: 'function', Tangent: 'path',
  Segment: 'path', Line: 'path', Ray: 'path', Vector: 'path', Circle: 'path', Polygon: 'path',
  Midpoint: 'point', Reflect: 'point', Rotate: 'point', Translate: 'point',
  Perpendicular: 'path', Parallel: 'path', PerpendicularBisector: 'path',
  Distance: 'number', Angle: 'number', Area: 'number', Length: 'number', Slope: 'number',
  Curve: 'path', Surface: 'surface', Sphere: 'surface',
  Text: 'label', Stroke: 'stroke', Arrow: 'arrow',
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
