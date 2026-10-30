import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store/project';
import { evaluateScope } from '../math/engine';
import { cellRange, evalSheet, shiftSheet } from '../math/sheet';
import { fmt } from '../math/solve';
import { colName, exportCSV, openProject } from '../io/fileio';
import { useT } from '../i18n/i18n';
import { Icon } from './Icons';
import { MathField } from './MathField';
import { openMenu, useContextTrigger } from './ContextMenu';
import { sheetMenu } from './contextMenus';

const COLS = 12, ROWS = 60;
/** Regression choices: label key → command applied to the list of points. */
const FIT_OPTIONS: [string, (list: string) => string][] = [
  ['FitLine', (l) => `FitLine(${l})`], ['FitPoly2', (l) => `FitPoly(${l}, 2)`], ['FitPoly3', (l) => `FitPoly(${l}, 3)`],
  ['FitExp', (l) => `FitExp(${l})`], ['FitLog', (l) => `FitLog(${l})`], ['FitPow', (l) => `FitPow(${l})`], ['FitSin', (l) => `FitSin(${l})`],
];

const parse = (ref: string) => { const m = /^([A-L])(\d+)$/.exec(ref)!; return { c: m[1].charCodeAt(0) - 65, r: +m[2] }; };
/** Copied cells, for when the system clipboard cannot be read. */
let clipboard = '';

export function SpreadsheetPanel() {
  const t = useT();
  const sheet = useStore((s) => s.sheet);
  const objects = useStore((s) => s.objects);
  const digits = useStore((s) => s.settings.digits);
  const sigFigs = useStore((s) => s.settings.sigFigs);
  const angle = useStore((s) => s.settings.angle);
  const [sel, setSel] = useState('A1');
  const [anchor, setAnchor] = useState('A1');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scope = useMemo(() => evaluateScope(objects, { angle }), [objects, angle]);
  const values = useMemo(() => evalSheet(sheet, scope, angle), [sheet, scope, angle]);
  const range = useMemo(() => cellRange(anchor, sel), [anchor, sel]);
  const inRange = useMemo(() => new Set(range.flat()), [range]);
  const st = useStore.getState;

  // the menu's actions run right after a right click moves the selection, before React re-renders: they read this
  const current = useRef({ sel, anchor });
  const select = (ref: string, extend = false) => {
    current.current = { sel: ref, anchor: extend ? current.current.anchor : ref };
    setSel(ref);
    if (!extend) setAnchor(ref);
  };
  const selRange = () => cellRange(current.current.anchor, current.current.sel);
  const startEdit = (ref: string, initial?: string) => { select(ref); setEditing(ref); setDraft(initial ?? sheet[ref] ?? ''); };
  const commit = (ref: string, v: string, move = true) => {
    if ((sheet[ref] ?? '') !== v) st().setCell(ref, v);
    setEditing(null);
    if (move) {
      const m = /^([A-L])(\d+)$/.exec(ref)!;
      select(`${m[1]}${Math.min(ROWS, +m[2] + 1)}`);
    }
  };

  /** The x and y columns: the first two of a selection that spans several columns, else A and B. */
  const pairColumns = () => {
    const range = selRange();
    if (range[0].length < 2) return { x: 'A', y: 'B', r0: 1, r1: ROWS };
    const [a, b] = range[0];
    return { x: a[0], y: b[0], r0: parse(range[0][0]).r, r1: parse(range[range.length - 1][0]).r };
  };
  const numericPairs = () => {
    const { x, y, r0, r1 } = pairColumns();
    const pts: [number, number][] = [];
    for (let r = r0; r <= r1; r++) {
      const a = values[`${x}${r}`], b = values[`${y}${r}`];
      if (a && b && typeof a.v === 'number' && typeof b.v === 'number') pts.push([a.v, b.v]);
    }
    return pts;
  };

  /** Plots the selected pairs as a list (reusing an identical list) and returns its name. */
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

  const without = (refs: string[]) => { const next = { ...st().sheet }; refs.forEach((r) => delete next[r]); return next; };
  const copy = () => {
    const range = selRange();
    clipboard = range.map((row) => row.map((ref) => st().sheet[ref] ?? '').join('\t')).join('\n');
    navigator.clipboard?.writeText(clipboard).catch(() => {});
  };
  const clear = () => { const range = selRange(); if (range.flat().some((r) => st().sheet[r] !== undefined)) st().setSheet(without(range.flat())); };
  const paste = async () => {
    let text = clipboard;
    try { text = (await navigator.clipboard.readText()) || clipboard; } catch { /* no permission: use our own copy */ }
    if (!text) return;
    const { c: c0, r: r0 } = parse(selRange()[0][0]);
    const next = { ...st().sheet };
    text.replace(/\r/g, '').replace(/\n$/, '').split('\n').forEach((line, i) => line.split('\t').forEach((v, j) => {
      const c = c0 + j, r = r0 + i;
      if (c >= COLS) return;
      const ref = `${colName(c)}${r}`;
      if (v.trim()) next[ref] = v; else delete next[ref];
    }));
    st().setSheet(next);
  };
  const bounds = (range = selRange()) => ({ ...parse(range[0][0]), c1: parse(range[0][range[0].length - 1]).c, r1: parse(range[range.length - 1][0]).r });
  const repeat = (n: number, f: (s: Record<string, string>) => Record<string, string>) => {
    let s = st().sheet;
    for (let i = 0; i < n; i++) s = f(s);
    st().setSheet(s);
  };
  const actions = {
    cut: () => { copy(); clear(); }, copy, paste: () => { paste(); }, clear,
    insertRow: (below: boolean) => { const b = bounds(); repeat(1, (s) => shiftSheet(s, 'row', below ? b.r1 + 1 : b.r, 1)); },
    insertCol: (after: boolean) => { const b = bounds(); repeat(1, (s) => shiftSheet(s, 'col', after ? b.c1 + 1 : b.c, 1)); },
    deleteRow: () => { const b = bounds(); repeat(b.r1 - b.r + 1, (s) => shiftSheet(s, 'row', b.r, -1)); },
    deleteCol: () => { const b = bounds(); repeat(b.c1 - b.c + 1, (s) => shiftSheet(s, 'col', b.c, -1)); },
    makePoints: () => { plotPoints(); }, regression, fits: FIT_OPTIONS.map(([k]) => k),
  };

  const trigger = useContextTrigger((x, y, via, target) => {
    const ref = target instanceof Element ? target.closest<HTMLElement>('td[data-ref]')?.dataset.ref : undefined;
    if (ref && !selRange().flat().includes(ref)) select(ref);
    if (editing) commit(editing, draft, false);
    let at = { x, y };
    if (via === 'key') { const b = document.querySelector(`td[data-ref="${current.current.sel}"]`)?.getBoundingClientRect(); if (b) at = { x: b.left + b.width / 2, y: b.bottom }; }
    openMenu({ ...at, via, label: t('ctx.sheet'), build: sheetMenu(actions) });
  });

  const onKey = (e: React.KeyboardEvent) => {
    if (editing) return;
    trigger.onKeyDown(e);
    if (e.defaultPrevented) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ['c', 'x', 'v'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      ({ c: actions.copy, x: actions.cut, v: actions.paste } as Record<string, () => void>)[e.key.toLowerCase()]();
      return;
    }
    const m = /^([A-L])(\d+)$/.exec(sel)!;
    let c = m[1].charCodeAt(0) - 65, r = +m[2];
    if (e.key === 'ArrowDown') r++; else if (e.key === 'ArrowUp') r--; else if (e.key === 'ArrowLeft') c--; else if (e.key === 'ArrowRight' || e.key === 'Tab') c++;
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(sel); return; }
    else if (e.key === 'Delete' || e.key === 'Backspace') { clear(); return; }
    else if (e.key.length === 1 && !mod) { e.preventDefault(); startEdit(sel, e.key); return; }
    else return;
    e.preventDefault();
    select(`${colName(Math.max(0, Math.min(COLS - 1, c)))}${Math.max(1, Math.min(ROWS, r))}`, e.shiftKey && e.key !== 'Tab');
  };

  return (
    <>
      <div className="formula-bar">
        <span className="ref">{inRange.size > 1 ? `${range[0][0]}:${range[range.length - 1][range[0].length - 1]}` : sel}</span>
        <MathField className="field" value={editing === sel ? draft : sheet[sel] ?? ''}
          onChange={(v) => { if (editing !== sel) setEditing(sel); setDraft(v); }}
          onSubmit={(v) => commit(sel, v)} onCancel={() => setEditing(null)} ariaLabel={`Cell ${sel}`} placeholder="=A1*2" />
      </div>
      <div className="sheet-wrap" tabIndex={0} onKeyDown={onKey} onContextMenu={trigger.onContextMenu}
        onPointerDown={trigger.onPointerDown} onPointerMove={trigger.onPointerMove} onPointerUp={trigger.onPointerUp} onPointerCancel={trigger.onPointerCancel}>
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
                    <td key={ref} data-ref={ref} aria-selected={inRange.has(ref)}
                      className={`${sel === ref ? 'sel' : ''} ${inRange.has(ref) && inRange.size > 1 ? 'in-range' : ''} ${cell?.err ? 'err' : ''} ${cell?.text ? 'txt' : ''}`}
                      onClick={(e) => { if (editing && editing !== ref) commit(editing, draft, false); select(ref, e.shiftKey); }}
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
