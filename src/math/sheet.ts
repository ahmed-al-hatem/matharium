import { math, type Scope } from './compile';

export type Cell = { v: number | string; err?: boolean; text?: boolean };

const CELL_RE = /\b([A-L])([1-9]\d*)\b/g;

/** Evaluate every non-empty cell, following references with cycle detection. */
export function evalSheet(sheet: Record<string, string>, scope: Scope): Record<string, Cell> {
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
        let expr = raw.slice(1).replace(/\b([A-L])([1-9]\d*):([A-L])([1-9]\d*)\b/g, (_m, c1, r1, c2, r2) => {
          const refs: string[] = [];
          for (let c = c1.charCodeAt(0); c <= c2.charCodeAt(0); c++) for (let r = +r1; r <= +r2; r++) refs.push(`${String.fromCharCode(c)}${r}`);
          return `[${refs.join(',')}]`;
        });
        expr = expr.replace(/\b(Sum|Mean|Min|Max|Median)\(/g, (_m, f: string) => `${f.toLowerCase()}(`);
        const local: Record<string, unknown> = { ...scope };
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
