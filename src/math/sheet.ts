import { angleScope, math, type AngleUnit, type Scope } from './compile';

export type Cell = { v: number | string; err?: boolean; text?: boolean };

const CELL_RE = /\b([A-L])([1-9]\d*)\b/g;

/** Evaluate every non-empty cell, following references with cycle detection. */
export function evalSheet(sheet: Record<string, string>, scope: Scope, angle: AngleUnit = 'rad'): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  const visiting = new Set<string>();
  const get = (ref: string): Cell => {
    if (out[ref]) return out[ref];
    const raw = sheet[ref];
    if (raw === undefined || raw === '') return { v: '' };
    if (visiting.has(ref)) return { v: '#CYCLE', err: true };
    visiting.add(ref);
    let cell: Cell;
    try {
      if (raw.startsWith('=')) {
        if (raw.includes('#REF')) throw new Error('ref');
        let expr = raw.slice(1).replace(/\b([A-L])([1-9]\d*):([A-L])([1-9]\d*)\b/g, (_m, c1, r1, c2, r2) => {
          const refs: string[] = [];
          for (let c = c1.charCodeAt(0); c <= c2.charCodeAt(0); c++) for (let r = +r1; r <= +r2; r++) refs.push(`${String.fromCharCode(c)}${r}`);
          return `[${refs.join(',')}]`;
        });
        expr = expr.replace(/\b(Sum|Mean|Min|Max|Median)\(/g, (_m, f: string) => `${f.toLowerCase()}(`);
        const local: Record<string, unknown> = { ...angleScope(angle), ...scope };
        for (const m of expr.matchAll(CELL_RE)) {
          const c = get(m[0]);
          if (c.err) throw new Error('ref');
          local[m[0]] = c.v === '' ? 0 : c.v;
        }
        const v = math.evaluate(expr, local);
        cell = typeof v === 'number' ? { v } : { v: String(v), text: true };
      } else if (/^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(raw)) cell = { v: +raw };
      else cell = { v: raw, text: true };
    } catch {
      cell = { v: '#ERR', err: true };
    }
    visiting.delete(ref);
    out[ref] = cell;
    return cell;
  };
  for (const ref of Object.keys(sheet)) get(ref);
  return out;
}

export const SHEET_COLS = 12;
const cellRef = (c: number, r: number) => `${String.fromCharCode(65 + c)}${r}`;

/**
 * Insert (n = 1) or delete (n = -1) a row (`at` = row number) or column (`at` = 0-based index) and move the cells after it,
 * rewriting A1 references in formulas; a reference to a deleted cell becomes #REF.
 */
export function shiftSheet(sheet: Record<string, string>, axis: 'row' | 'col', at: number, n: 1 | -1): Record<string, string> {
  const move = (c: number, r: number): string | null => {
    const pos = axis === 'row' ? r : c;
    if (n < 0 && pos === at) return null;
    const next = pos >= at ? pos + n : pos;
    const [c2, r2] = axis === 'row' ? [c, next] : [next, r];
    return c2 < SHEET_COLS && r2 >= 1 ? cellRef(c2, r2) : null;
  };
  const rewrite = (raw: string) =>
    raw.startsWith('=') ? raw.replace(CELL_RE, (_m, c: string, r: string) => move(c.charCodeAt(0) - 65, +r) ?? '#REF') : raw;
  const out: Record<string, string> = {};
  for (const [ref, raw] of Object.entries(sheet)) {
    const m = /^([A-L])(\d+)$/.exec(ref);
    const to = m && move(m[1].charCodeAt(0) - 65, +m[2]);
    if (to) out[to] = rewrite(raw);
  }
  return out;
}

/** Cell refs of the rectangle spanned by two cells, row by row. */
export function cellRange(a: string, b: string): string[][] {
  const [, ca, ra] = /^([A-L])(\d+)$/.exec(a)!, [, cb, rb] = /^([A-L])(\d+)$/.exec(b)!;
  const c0 = Math.min(ca.charCodeAt(0), cb.charCodeAt(0)) - 65, c1 = Math.max(ca.charCodeAt(0), cb.charCodeAt(0)) - 65;
  const r0 = Math.min(+ra, +rb), r1 = Math.max(+ra, +rb);
  return Array.from({ length: r1 - r0 + 1 }, (_, i) => Array.from({ length: c1 - c0 + 1 }, (_, j) => cellRef(c0 + j, r0 + i)));
}
