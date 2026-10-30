import { useEffect, useRef, useState } from 'react';
import { beginLive, EXTRA_COLORS, labelDefault, PALETTE, useStore } from '../store/project';
import { useResolved } from '../store/resolved';
import { EQ_FORMS, LABEL_TEXTS, LINE_STYLES, POINT_STYLES, type MObj, type Resolved } from '../math/types';
import { useT } from '../i18n/i18n';
import { Icon } from './Icons';
import { MathField } from './MathField';

const TABS = ['basic', 'color', 'style', 'algebra', 'advanced'] as const;
type Tab = (typeof TABS)[number];

const isPoint = (r: Resolved) => r.value?.type === 'point' || r.value?.type === 'point3d' || r.value?.type === 'points' || r.value?.type === 'points3d';
/** Objects drawn without a line of their own (numbers, sliders, texts). */
const NO_STROKE = ['number', 'label', 'text', 'numbers'];

/** The value all selected objects share, or undefined when they differ ("mixed"). */
function common<T>(sel: Resolved[], get: (r: Resolved) => T): T | undefined {
  const first = get(sel[0]);
  return sel.every((r) => get(r) === first) ? first : undefined;
}

/** A change while dragging a range or picking in the color dialog: one undo step, recorded when it ends. */
function live(ids: string[], patch: Partial<MObj>) {
  beginLive();
  useStore.getState().liveUpdateMany(Object.fromEntries(ids.map((id) => [id, patch])));
}
const endLive = () => useStore.getState().commit();
const st = () => useStore.getState();

/** Docked, non-modal panel for the properties of one or more objects. */
export function PropertiesPanel({ ids: wanted }: { ids: string[] }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const items = useResolved();
  const st = useStore.getState();
  const [tab, setTab] = useState<Tab>('basic');
  const anchor = useRef<string | null>(wanted[0] ?? null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLElement>(null);

  // undo can take objects away while the panel is open
  const ids = wanted.filter((id) => items.some((r) => r.obj.id === id));
  const sel = items.filter((r) => ids.includes(r.obj.id));

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => { if (back?.isConnected) back.focus(); };
  }, []);
  useEffect(() => { if (!sel.length) st.closeProperties(); });

  const tabs = TABS.filter((id) => id !== 'style' || sel.some((r) => !NO_STROKE.includes(r.value?.type ?? 'number') || isPoint(r)));
  const current = tabs.includes(tab) ? tab : 'basic';
  if (!sel.length) return null;

  const pick = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    if (e.shiftKey && anchor.current) {
      const order = items.map((r) => r.obj.id);
      const [a, b] = [order.indexOf(anchor.current), order.indexOf(id)].sort((x, y) => x - y);
      st.openProperties(order.slice(a, b + 1));
      return;
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) st.openProperties(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    else st.openProperties([id]);
  };
  const toggle = (id: string) => {
    anchor.current = id;
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    if (next.length) st.openProperties(next);
  };

  const select = (i: number) => {
    const next = tabs[(i + tabs.length) % tabs.length];
    setTab(next);
    tabRefs.current[tabs.indexOf(next)]?.focus();
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = tabs.indexOf(current);
    const fwd = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight', back = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd) select(i + 1);
    else if (e.key === back) select(i - 1);
    else if (e.key === 'Home') select(0);
    else if (e.key === 'End') select(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  const patch = (p: Partial<MObj>) => st.patchObjects(ids, p);
  const title = sel.length === 1 ? sel[0].obj.name : `${sel.length} ${t('props.selected')}`;

  return (
    <aside ref={root} className="props-panel" role="dialog" aria-modal="false" aria-label={t('props.title')}
      onKeyDown={(e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); st.closeProperties(); } }}>
      <h2>
        <span>{t('props.title')}<small>{title}</small></span>
        <button className="icon-btn" onClick={() => st.closeProperties()} aria-label={t('close')}><Icon.close /></button>
      </h2>
      <div className="props-body">
        <ul className="props-list" aria-label={t('props.objects')}>
          {items.map((r) => (
            <li key={r.obj.id} className={ids.includes(r.obj.id) ? 'on' : ''}>
              <input type="checkbox" checked={ids.includes(r.obj.id)} onChange={() => toggle(r.obj.id)} aria-label={r.obj.name} />
              <button onClick={(e) => pick(r.obj.id, e)} style={{ ['--c' as string]: r.obj.color }}>
                <span className="props-dot" />{r.obj.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="props-main">
          <div className="tabs" role="tablist" aria-label={t('props.title')} onKeyDown={onTabKey}>
            {tabs.map((id, i) => (
              <button key={id} ref={(el) => { tabRefs.current[i] = el; }} role="tab" id={`ptab-${id}`} aria-controls={`ppanel-${id}`}
                aria-selected={current === id} tabIndex={current === id ? 0 : -1} className={current === id ? 'active' : ''} onClick={() => setTab(id)}>
                {t(`props.tab.${id}`)}
              </button>
            ))}
          </div>
          {/* keyed by the selection so drafts start over when it changes */}
          <div role="tabpanel" id={`ppanel-${current}`} aria-labelledby={`ptab-${current}`} className="props-tab" key={ids.join()}>
            {current === 'basic' && <BasicTab sel={sel} ids={ids} patch={patch} />}
            {current === 'color' && <ColorTab sel={sel} ids={ids} patch={patch} />}
            {current === 'style' && <StyleTab sel={sel} ids={ids} patch={patch} />}
            {current === 'algebra' && <AlgebraTab sel={sel} patch={patch} />}
            {current === 'advanced' && <AdvancedTab sel={sel} patch={patch} />}
          </div>
        </div>
      </div>
    </aside>
  );
}

interface TabProps { sel: Resolved[]; ids: string[]; patch(p: Partial<MObj>): void }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="settings-row"><span>{label}</span>{children}</label>;
}

/** A checkbox that shows "mixed" when the selected objects differ. */
function TriCheck({ label, value, onChange }: { label: string; value: boolean | undefined; onChange(v: boolean): void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = value === undefined; }, [value]);
  return <label className="check"><input ref={ref} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{label}</label>;
}

/** A text field that changes the objects once, when it is left or Enter is pressed. */
function TextField({ value, placeholder, label, onCommit, invalid }: { value: string; placeholder?: string; label: string; onCommit(v: string): void; invalid?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return (
    <input className="field" value={draft} placeholder={placeholder} aria-label={label} aria-invalid={invalid || undefined}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
  );
}

function BasicTab({ sel, patch }: TabProps) {
  const t = useT();
  const st = useStore.getState();
  const mode = useStore((s) => s.mode);
  const settings = useStore((s) => s.settings);
  const one = sel.length === 1 ? sel[0] : null;
  const [def, setDef] = useState(one?.obj.input ?? '');
  useEffect(() => { if (one) setDef(one.obj.input); }, [one?.obj.input]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelled = common(sel, (r) => r.obj.showLabel ?? labelDefault(settings, mode, isPoint(r)));
  const saveDef = (v: string) => { if (one && v.trim() && v.trim() !== one.obj.input) st.updateInput(one.obj.id, v); };

  return (
    <>
      {one && (
        <>
          <Row label={t('props.name')}>
            <TextField value={one.obj.name} label={t('props.name')} onCommit={(n) => st.renameObject(one.obj.id, n.trim())} />
          </Row>
          <div className="settings-row"><span>{t('props.definition')}</span>
            <MathField value={def} onChange={setDef} onSubmit={saveDef} onBlur={() => saveDef(def)} className="math-input field" ariaLabel={t('props.definition')} complete />
          </div>
          {one.error && <div className="alg-error">{one.error}</div>}
        </>
      )}
      <Row label={t('props.caption')}>
        <TextField value={common(sel, (r) => r.obj.caption ?? '') ?? ''} placeholder={sel.length > 1 ? t('props.mixed') : ''} label={t('props.caption')}
          onCommit={(caption) => patch({ caption: caption || undefined })} />
      </Row>
      <TriCheck label={t('showObject')} value={common(sel, (r) => r.obj.visible)} onChange={(visible) => patch({ visible })} />
      <TriCheck label={t('showLabel')} value={labelled} onChange={(showLabel) => patch({ showLabel })} />
      <Row label={t('props.labelText')}>
        <select className="field" value={common(sel, (r) => r.obj.labelMode ?? 'name') ?? ''} onChange={(e) => patch({ labelMode: e.target.value as MObj['labelMode'], showLabel: true })}>
          {sel.length > 1 && common(sel, (r) => r.obj.labelMode ?? 'name') === undefined && <option value="" disabled>{t('props.mixed')}</option>}
          {LABEL_TEXTS.map((m) => <option key={m} value={m}>{t(`labelText.${m}`)}</option>)}
        </select>
      </Row>
      <TriCheck label={t('fixObject')} value={common(sel, (r) => !!r.obj.fixed)} onChange={(fixed) => patch({ fixed })} />
      {sel.every(isPoint) && (
        <TriCheck label={t('trace')} value={common(sel, (r) => !!r.obj.trace)} onChange={(trace) => {
          if (!trace) sel.forEach((r) => st.clearTrace(r.obj.id));
          patch({ trace });
        }} />
      )}
      <TriCheck label={t('props.auxiliary')} value={common(sel, (r) => !!r.obj.auxiliary)} onChange={(auxiliary) => patch({ auxiliary })} />
    </>
  );
}

function ColorTab({ sel, ids, patch }: TabProps) {
  const t = useT();
  const color = common(sel, (r) => r.obj.color.toLowerCase());
  const opacity = common(sel, (r) => r.obj.opacity);
  return (
    <>
      <div className="swatches" role="radiogroup" aria-label={t('color')}>
        {[...PALETTE, ...EXTRA_COLORS].map((c) => (
          <button key={c} className={`swatch ${color === c.toLowerCase() ? 'on' : ''}`} role="radio" aria-checked={color === c.toLowerCase()}
            aria-label={c} title={c} style={{ background: c }} onClick={() => patch({ color: c })} />
        ))}
      </div>
      <Row label={t('props.customColor')}>
        <input type="color" className="color-field" value={/^#[0-9a-f]{6}$/.test(color ?? '') ? color : '#000000'}
          onChange={(e) => live(ids, { color: e.target.value.toUpperCase() })} onBlur={endLive} />
      </Row>
      <div className="settings-row"><span id="opacity-label">{t('props.opacity')}</span>
        <div className="range-pair">
          <input type="range" min={0} max={1} step={0.05} value={opacity ?? 0.2} aria-labelledby="opacity-label"
            onChange={(e) => live(ids, { opacity: +e.target.value })} onPointerUp={endLive} onKeyUp={endLive} onBlur={endLive} />
          <output>{opacity === undefined ? t('props.default') : `${Math.round(opacity * 100)}%`}</output>
          {opacity !== undefined && <button className="ghost-btn" onClick={() => patch({ opacity: undefined })}>{t('props.default')}</button>}
        </div>
      </div>
    </>
  );
}

/** A short line drawn in each line style, for the style buttons. */
function LinePreview({ style }: { style: (typeof LINE_STYLES)[number] }) {
  const dash = style === 'dashed' ? '8 5' : style === 'dotted' ? '0.1 6' : undefined;
  return <svg width="44" height="12" aria-hidden="true"><line x1="4" y1="6" x2="40" y2="6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={dash} /></svg>;
}

function StyleTab({ sel, ids, patch }: TabProps) {
  const t = useT();
  const width = common(sel, (r) => r.obj.lineWidth ?? 2.5);
  const lineStyle = common(sel, (r) => r.obj.lineStyle ?? 'solid');
  const points = sel.filter(isPoint);
  const lines = sel.some((r) => !isPoint(r) && !NO_STROKE.includes(r.value?.type ?? 'number'));
  return (
    <>
      {lines && (
        <>
          <div className="settings-row"><span id="lw-label">{t('props.lineWidth')}</span>
            <div className="range-pair">
              <input type="range" min={0.5} max={10} step={0.5} value={width ?? 2.5} aria-labelledby="lw-label"
                onChange={(e) => live(ids, { lineWidth: +e.target.value })} onPointerUp={endLive} onKeyUp={endLive} onBlur={endLive} />
              <output>{width ?? '–'}</output>
            </div>
          </div>
          <div className="settings-row"><span id="ls-label">{t('props.lineStyle')}</span>
            <div className="seg-group" role="radiogroup" aria-labelledby="ls-label">
              {LINE_STYLES.map((s) => (
                <button key={s} role="radio" aria-checked={lineStyle === s} className={lineStyle === s ? 'on' : ''} title={t(`lineStyle.${s}`)}
                  aria-label={t(`lineStyle.${s}`)} onClick={() => patch({ lineStyle: s === 'solid' ? undefined : s })}>
                  <LinePreview style={s} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {points.length > 0 && (
        <>
          <Row label={t('props.pointStyle')}>
            <select className="field" value={common(points, (r) => r.obj.pointStyle ?? 'dot') ?? ''} onChange={(e) => st().patchObjects(points.map((r) => r.obj.id), { pointStyle: e.target.value as MObj['pointStyle'] })}>
              {common(points, (r) => r.obj.pointStyle ?? 'dot') === undefined && <option value="" disabled>{t('props.mixed')}</option>}
              {POINT_STYLES.map((s) => <option key={s} value={s}>{t(`pointStyle.${s}`)}</option>)}
            </select>
          </Row>
          <div className="settings-row"><span id="ps-label">{t('props.pointSize')}</span>
            <div className="range-pair">
              <input type="range" min={1} max={12} step={0.5} value={common(points, (r) => r.obj.pointSize ?? 5) ?? 5} aria-labelledby="ps-label"
                onChange={(e) => live(points.map((r) => r.obj.id), { pointSize: +e.target.value })} onPointerUp={endLive} onKeyUp={endLive} onBlur={endLive} />
              <output>{common(points, (r) => r.obj.pointSize ?? 5) ?? '–'}</output>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AlgebraTab({ sel, patch }: Omit<TabProps, 'ids'>) {
  const t = useT();
  const lines = sel.every((r) => r.value?.type === 'line');
  const digits = common(sel, (r) => r.obj.digits);
  const mixedDigits = sel.length > 1 && !sel.every((r) => r.obj.digits === sel[0].obj.digits);
  return (
    <>
      {lines && (
        <Row label={t('props.eqForm')}>
          <select className="field" value={common(sel, (r) => r.obj.eqForm ?? 'explicit') ?? ''} onChange={(e) => patch({ eqForm: e.target.value === 'explicit' ? undefined : e.target.value as MObj['eqForm'] })}>
            {common(sel, (r) => r.obj.eqForm ?? 'explicit') === undefined && <option value="" disabled>{t('props.mixed')}</option>}
            {EQ_FORMS.map((f) => <option key={f} value={f}>{t(`eqForm.${f}`)}</option>)}
          </select>
        </Row>
      )}
      <Row label={t('props.digits')}>
        <select className="field" value={mixedDigits ? 'mixed' : digits ?? 'global'} onChange={(e) => patch({ digits: e.target.value === 'global' ? undefined : +e.target.value })}>
          {mixedDigits && <option value="mixed" disabled>{t('props.mixed')}</option>}
          <option value="global">{t('props.digitsGlobal')}</option>
          {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Row>
      {sel.length === 1 && sel[0].display && <div className="alg-value props-preview">{sel[0].display}</div>}
    </>
  );
}

function AdvancedTab({ sel, patch }: Omit<TabProps, 'ids'>) {
  const t = useT();
  const cond = common(sel, (r) => r.obj.showIf ?? '');
  const err = sel.find((r) => r.showIfError)?.showIfError;
  return (
    <>
      <Row label={t('props.showIf')}>
        <TextField value={cond ?? ''} placeholder={cond === undefined ? t('props.mixed') : t('props.showIfHint')} label={t('props.showIf')} invalid={!!err}
          onCommit={(v) => patch({ showIf: v.trim() || undefined })} />
      </Row>
      {err && <div className="alg-error" role="alert">{err}</div>}
      <Row label={t('props.layer')}>
        <select className="field" value={common(sel, (r) => r.obj.layer ?? 0) ?? ''} onChange={(e) => patch({ layer: +e.target.value || undefined })}>
          {common(sel, (r) => r.obj.layer ?? 0) === undefined && <option value="" disabled>{t('props.mixed')}</option>}
          {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i}</option>)}
        </select>
      </Row>
    </>
  );
}
