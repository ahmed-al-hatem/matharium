import { useMemo, useState } from 'react';
import { useStore } from '../store/project';
import { evaluateScope } from '../math/engine';
import { evalSheet } from '../math/sheet';
import { fmt } from '../math/solve';
import { colName, exportCSV, openProject } from '../io/fileio';
import { useT } from '../i18n/i18n';
import { Icon } from './Icons';
import { MathField } from './MathField';

const COLS = 12, ROWS = 60;
/** Regression choices: label key → command applied to the list of points. */
const FIT_OPTIONS: [string, (list: string) => string][] = [
  ['FitLine', (l) => `FitLine(${l})`], ['FitPoly2', (l) => `FitPoly(${l}, 2)`], ['FitPoly3', (l) => `FitPoly(${l}, 3)`],
  ['FitExp', (l) => `FitExp(${l})`], ['FitLog', (l) => `FitLog(${l})`], ['FitPow', (l) => `FitPow(${l})`], ['FitSin', (l) => `FitSin(${l})`],
];

export function SpreadsheetPanel() {
  const t = useT();
  const sheet = useStore((s) => s.sheet);
  const objects = useStore((s) => s.objects);
  const digits = useStore((s) => s.settings.digits);
  const sigFigs = useStore((s) => s.settings.sigFigs);
  const angle = useStore((s) => s.settings.angle);
  const [sel, setSel] = useState('A1');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scope = useMemo(() => evaluateScope(objects, { angle }), [objects, angle]);
  const values = useMemo(() => evalSheet(sheet, scope, angle), [sheet, scope, angle]);
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

  /** Plots the A/B pairs as a list (reusing an identical list) and returns its name. */
  const plotPoints = () => {
    const pts = numericPairs();
    if (!pts.length) return null;
    const input = `{${pts.map(([x, y]) => `(${x}, ${y})`).join(', ')}}`;
    return st().objects.find((o) => o.input === input)?.name ?? st().addObject(input);
  };

  const regression = (kind: string) => {
    const make = FIT_OPTIONS.find(([k]) => k === kind)?.[1];
    if (!make) return;
    if (numericPairs().length < 2) { st().notify('sheet.fitNeed'); return; }
    st().addObject(make(plotPoints()!));
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
                      ) : cell ? (typeof cell.v === 'number' ? fmt(cell.v, digits, sigFigs) : cell.v) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-footer">
        <button className="ghost-btn" onClick={() => plotPoints()}><Icon.graph />{t('sheet.plot')}</button>
        <select className="ghost-btn fit-select" value="" aria-label={t('sheet.fit')} onChange={(e) => regression(e.target.value)}>
          <option value="" disabled>{t('sheet.fit')}</option>
          {FIT_OPTIONS.map(([k]) => <option key={k} value={k}>{t(`fit.${k}`)}</option>)}
        </select>
        <button className="ghost-btn" onClick={() => openProject()}><Icon.upload />CSV</button>
        <button className="ghost-btn" onClick={() => exportCSV('sheet')}><Icon.download />CSV</button>
        <div className="muted" style={{ fontSize: 11.5, width: '100%' }}>{t('sheet.help')}</div>
      </div>
    </>
  );
}
