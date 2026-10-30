import { useMemo, useState } from 'react';
import { useStore } from '../store/project';
import { evaluateScope } from '../math/engine';
import { math, type Scope } from '../math/compile';
import { fmt } from '../math/solve';
import { colName, exportCSV, openProject } from '../io/fileio';
import { useT } from '../i18n/i18n';
import { Icon } from './Icons';
import { MathField } from './MathField';

const COLS = 12, ROWS = 60;
type Cell = { v: number | string; err?: boolean; text?: boolean };

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

export function SpreadsheetPanel() {
  const t = useT();
  const sheet = useStore((s) => s.sheet);
  const objects = useStore((s) => s.objects);
  const digits = useStore((s) => s.settings.digits);
  const [sel, setSel] = useState('A1');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scope = useMemo(() => evaluateScope(objects), [objects]);
  const values = useMemo(() => evalSheet(sheet, scope), [sheet, scope]);
  const st = useStore.getState;

  const startEdit = (ref: string, initial?: string) => { setSel(ref); setEditing(ref); setDraft(initial ?? sheet[ref] ?? ''); };
  const commit = (ref: string, v: string, move = true) => {
    if ((sheet[ref] ?? '') !== v) st().setCell(ref, v);
    setEditing(null);
    if (move) {
      const m = /^([A-L])(\d+)$/.exec(ref)!;
      setSel(`${m[1]}${Math.min(ROWS, +m[2] + 1)}`);
    }
  };

  const numericPairs = () => {
    const pts: [number, number][] = [];
    for (let r = 1; r <= ROWS; r++) {
      const a = values[`A${r}`], b = values[`B${r}`];
      if (a && b && typeof a.v === 'number' && typeof b.v === 'number') pts.push([a.v, b.v]);
    }
    return pts;
  };

  const plotPoints = () => {
    const pts = numericPairs();
    if (pts.length) st().addObject(`{${pts.map(([x, y]) => `(${x}, ${y})`).join(', ')}}`);
  };

  const regression = () => {
    const pts = numericPairs();
    if (pts.length < 2) return;
    const n = pts.length;
    const sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0);
    const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const c = (sy - m * sx) / n;
    if (Number.isFinite(m)) st().addObject(`y = ${+m.toFixed(6)} x ${c < 0 ? '-' : '+'} ${Math.abs(+c.toFixed(6))}`);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (editing) return;
    const m = /^([A-L])(\d+)$/.exec(sel)!;
    let c = m[1].charCodeAt(0) - 65, r = +m[2];
    if (e.key === 'ArrowDown') r++; else if (e.key === 'ArrowUp') r--; else if (e.key === 'ArrowLeft') c--; else if (e.key === 'ArrowRight' || e.key === 'Tab') c++;
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(sel); return; }
    else if (e.key === 'Delete' || e.key === 'Backspace') { st().setCell(sel, ''); return; }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); startEdit(sel, e.key); return; }
    else return;
    e.preventDefault();
    setSel(`${colName(Math.max(0, Math.min(COLS - 1, c)))}${Math.max(1, Math.min(ROWS, r))}`);
  };

  return (
    <>
      <div className="formula-bar">
        <span className="ref">{sel}</span>
        <MathField className="field" value={editing === sel ? draft : sheet[sel] ?? ''}
          onChange={(v) => { if (editing !== sel) setEditing(sel); setDraft(v); }}
          onSubmit={(v) => commit(sel, v)} onCancel={() => setEditing(null)} ariaLabel={`Cell ${sel}`} placeholder="=A1*2" />
      </div>
      <div className="sheet-wrap" tabIndex={0} onKeyDown={onKey}>
        <table className="sheet">
          <thead>
            <tr><th className="row" />{Array.from({ length: COLS }, (_, c) => <th key={c}>{colName(c)}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, r) => (
              <tr key={r}>
                <th className="row">{r + 1}</th>
                {Array.from({ length: COLS }, (_, c) => {
                  const ref = `${colName(c)}${r + 1}`;
                  const cell = values[ref];
                  const isEdit = editing === ref;
                  return (
                    <td key={ref} className={`${sel === ref ? 'sel' : ''} ${cell?.err ? 'err' : ''} ${cell?.text ? 'txt' : ''}`}
                      onClick={() => { if (editing && editing !== ref) commit(editing, draft, false); setSel(ref); }}
                      onDoubleClick={() => startEdit(ref)}>
                      {isEdit ? (
                        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commit(ref, draft); if (e.key === 'Escape') setEditing(null); }}
                          onBlur={() => editing === ref && commit(ref, draft, false)} />
                      ) : cell ? (typeof cell.v === 'number' ? fmt(cell.v, digits) : cell.v) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-footer">
        <button className="ghost-btn" onClick={plotPoints}><Icon.graph />{t('sheet.plot')}</button>
        <button className="ghost-btn" onClick={regression}><Icon.graph />{t('sheet.fit')}</button>
        <button className="ghost-btn" onClick={() => openProject()}><Icon.upload />CSV</button>
        <button className="ghost-btn" onClick={() => exportCSV('sheet')}><Icon.download />CSV</button>
        <div className="muted" style={{ fontSize: 11.5, width: '100%' }}>{t('sheet.help')}</div>
      </div>
    </>
  );
}
