import { useEffect, useRef, useState } from 'react';
import { GRID_TYPES, PROJECTIONS, useStore, type GridType, type LabelMode, type Projection, type SettingsTab } from '../store/project';
import { useT } from '../i18n/i18n';
import { Viewport } from '../graph2d/viewport';
import { Icon } from './Icons';
import { helpRows, type HelpGroup } from '../math/commands';

function Modal({ title, onClose, children }: { title: string; onClose(): void; children: React.ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}<button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.close /></button></h2>
        {children}
      </div>
    </div>
  );
}

const TABS: SettingsTab[] = ['general', 'graphics', '3d'];

export function SettingsDialog({ tab }: { tab: SettingsTab }) {
  const t = useT();
  const lang = useStore((x) => x.settings.lang);
  const st = useStore.getState();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const close = () => st.closeSettings();
  const select = (i: number) => {
    const next = TABS[(i + TABS.length) % TABS.length];
    st.openSettings(next);
    tabRefs.current[TABS.indexOf(next)]?.focus();
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.indexOf(tab);
    const fwd = lang === 'ar' ? 'ArrowLeft' : 'ArrowRight', back = lang === 'ar' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === fwd) select(i + 1);
    else if (e.key === back) select(i - 1);
    else if (e.key === 'Home') select(0);
    else if (e.key === 'End') select(TABS.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <Modal title={t('settings')} onClose={close}>
      <div className="tabs" role="tablist" aria-label={t('settings')} onKeyDown={onTabKey}>
        {TABS.map((id, i) => (
          <button key={id} ref={(el) => { tabRefs.current[i] = el; }} role="tab" id={`stab-${id}`} aria-controls={`spanel-${id}`}
            aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'active' : ''} onClick={() => st.openSettings(id)}>
            {t(`tab.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`spanel-${tab}`} aria-labelledby={`stab-${tab}`} className="tab-panel">
        {tab === 'general' && <GeneralTab />}
        {tab === 'graphics' && <GraphicsTab />}
        {tab === '3d' && <View3DTab />}
      </div>
      <div className="modal-actions"><button className="pill-btn" onClick={close}>{t('close')}</button></div>
    </Modal>
  );
}

function Check({ k, label }: { k: 'grid' | 'axes' | 'snap' | 'axes3d' | 'plane3d' | 'grid3d' | 'exact'; label: string }) {
  const t = useT();
  const v = useStore((x) => x.settings[k]);
  return <label className="check"><input type="checkbox" checked={v} onChange={(e) => useStore.getState().setSettings({ [k]: e.target.checked })} />{t(label)}</label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="settings-row"><span>{label}</span>{children}</label>;
}

function GeneralTab() {
  const t = useT();
  const s = useStore((x) => x.settings);
  const set = useStore.getState().setSettings;
  return (
    <>
      <Check k="exact" label="exact" />
      <Field label={t('language')}>
        <select className="field" value={s.lang} onChange={(e) => set({ lang: e.target.value as 'en' | 'ar' })}>
          <option value="en">English</option><option value="ar">العربية</option>
        </select>
      </Field>
      <div className="settings-row"><span id="rounding-label">{t('rounding')}</span>
        <div className="pair" role="group" aria-labelledby="rounding-label">
          <select className="field" value={s.digits} aria-label={t(s.sigFigs ? 'round.sig' : 'round.decimals')} onChange={(e) => set({ digits: +e.target.value })}>
            {[0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15].filter((d) => !s.sigFigs || d > 0).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="field" value={s.sigFigs ? 'sig' : 'dec'} aria-label={t('roundingKind')}
            onChange={(e) => set({ sigFigs: e.target.value === 'sig', digits: e.target.value === 'sig' ? Math.max(1, s.digits) : s.digits })}>
            <option value="dec">{t('round.decimals')}</option><option value="sig">{t('round.sig')}</option>
          </select>
        </div>
      </div>
      <Field label={t('angleUnit')}>
        <select className="field" value={s.angle} onChange={(e) => set({ angle: e.target.value as 'deg' | 'rad' })}>
          <option value="rad">{t('angle.rad')}</option><option value="deg">{t('angle.deg')}</option>
        </select>
      </Field>
      <Field label={t('fontSize')}>
        <select className="field" value={s.fontSize} onChange={(e) => set({ fontSize: +e.target.value })}>
          {[12, 14, 16, 18, 20].map((n) => <option key={n} value={n}>{n} px</option>)}
        </select>
      </Field>
      <Field label={t('labels')}>
        <select className="field" value={s.labels} onChange={(e) => set({ labels: e.target.value as LabelMode })}>
          {(['auto', 'points', 'all', 'none'] as const).map((m) => <option key={m} value={m}>{t(`labels.${m}`)}</option>)}
        </select>
      </Field>
    </>
  );
}

function GraphicsTab() {
  const t = useT();
  const s = useStore((x) => x.settings);
  const view = useStore((x) => x.view);
  const st = useStore.getState();
  const stage = document.querySelector('.stage');
  const W = stage?.clientWidth ?? 800, H = stage?.clientHeight ?? 600;
  const vp = new Viewport(view, W, H);
  const [rng, setRng] = useState({ xmin: +vp.xmin.toFixed(2), xmax: +vp.xmax.toFixed(2), ymin: +vp.ymin.toFixed(2), ymax: +vp.ymax.toFixed(2) });
  const ratio = +(view.sx / view.sy).toPrecision(4);

  const applyRange = () => {
    if (rng.xmax <= rng.xmin || rng.ymax <= rng.ymin) return;
    st.setView({ ox: (rng.xmin + rng.xmax) / 2, oy: (rng.ymin + rng.ymax) / 2, sx: W / (rng.xmax - rng.xmin), sy: H / (rng.ymax - rng.ymin) });
  };
  // x:y is how many y units take the screen length of one x unit; keep x and the centre, stretch y
  const setRatio = (r: number) => {
    if (!(r > 0) || r === ratio) return;
    const next = { ...view, sy: view.sx / r };
    st.setView({ sy: next.sy });
    const v = new Viewport(next, W, H);
    setRng({ ...rng, ymin: +v.ymin.toFixed(2), ymax: +v.ymax.toFixed(2) });
  };
  const setAxisLabel = (axis: 'x' | 'y', v: string) => st.setSettings({ axisLabels: { ...s.axisLabels, [axis]: v } });

  return (
    <>
      <Check k="axes" label="axes" /><Check k="grid" label="grid" /><Check k="snap" label="snap" />
      <Field label={t('gridType')}>
        <select className="field" value={s.gridType} onChange={(e) => st.setSettings({ gridType: e.target.value as GridType })}>
          {GRID_TYPES.map((g) => <option key={g} value={g}>{t(`gridType.${g}`)}</option>)}
        </select>
      </Field>
      <div className="form-row"><span>{t('xRange')}</span>
        <input className="field" type="number" step="any" value={rng.xmin} onChange={(e) => setRng({ ...rng, xmin: +e.target.value })} aria-label="x min" />
        <input className="field" type="number" step="any" value={rng.xmax} onChange={(e) => setRng({ ...rng, xmax: +e.target.value })} aria-label="x max" />
      </div>
      <div className="form-row"><span>{t('yRange')}</span>
        <input className="field" type="number" step="any" value={rng.ymin} onChange={(e) => setRng({ ...rng, ymin: +e.target.value })} aria-label="y min" />
        <input className="field" type="number" step="any" value={rng.ymax} onChange={(e) => setRng({ ...rng, ymax: +e.target.value })} aria-label="y max" />
      </div>
      <button className="ghost-btn" onClick={applyRange}>{t('apply')}</button>
      <div className="form-row"><span>{t('axisLabels')}</span>
        <input className="field" value={s.axisLabels.x} maxLength={12} aria-label={`${t('axisLabels')} x`} onChange={(e) => setAxisLabel('x', e.target.value)} />
        <input className="field" value={s.axisLabels.y} maxLength={12} aria-label={`${t('axisLabels')} y`} onChange={(e) => setAxisLabel('y', e.target.value)} />
      </div>
      <Field label={t('ratio')}>
        <input className="field" type="number" min={0.001} step="any" key={ratio} defaultValue={ratio} onBlur={(e) => setRatio(+e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setRatio(+(e.target as HTMLInputElement).value)} />
      </Field>
    </>
  );
}

function View3DTab() {
  const t = useT();
  const { range3d, projection } = useStore((x) => x.settings);
  return (
    <>
      <Check k="axes3d" label="axes" /><Check k="plane3d" label="plane" /><Check k="grid3d" label="grid" />
      <Field label={t('projection')}>
        <select className="field" value={projection} onChange={(e) => useStore.getState().setSettings({ projection: e.target.value as Projection })}>
          {PROJECTIONS.map((p) => <option key={p} value={p}>{t(`proj.${p}`)}</option>)}
        </select>
      </Field>
      <Field label={t('range3d')}>
        <input className="field" type="number" min={1} max={100} value={range3d}
          onChange={(e) => +e.target.value >= 1 && useStore.getState().setSettings({ range3d: +e.target.value })} />
      </Field>
    </>
  );
}

type Row = { code: string; desc: string; sig?: string };
const row = (code: string, en: string, ar: string) => ({ code, en, ar });

/** Rows that are not commands (input forms and shortcuts); the command rows come from the command table. */
const EXTRA: Partial<Record<string, { code: string; en: string; ar: string }[]>> = {
  'help.functions': [
    row('f(x) = x^3 - 3x', 'function', 'دالة'), row('y = 2x + 1', 'explicit line', 'مستقيم صريح'), row('x^2 + y^2 = 9', 'implicit curve', 'منحنى ضمني'),
    row('y < sin(x)', 'inequality region', 'منطقة متباينة'), row('a x^2 + b', 'auto-creates sliders a, b', 'ينشئ المنزلقين a و b تلقائيًا'),
    row("f'(x)", 'derivative of f', 'مشتقة f'), row('g(x) = x < 0 ? -x : x^2', 'piecewise', 'دالة متعددة التعريف'),
    row('{(1,2), (3,5), (4,1)}', 'list of points', 'قائمة نقاط'), row('l = {2, 4, 4, 5, 7}', 'list of numbers', 'قائمة أعداد'),
  ],
  'help.polar': [
    row('r = 2 sin(3θ)', 'polar curve (rose)', 'منحنى قطبي (وردة)'), row('r = θ', 'spiral, θ up to 6π', 'حلزون، θ حتى 6π'),
    row('r = 1 + cos(θ)', 'cardioid', 'منحنى قلبي'), row('(3; 45°)', 'polar point (r; θ)', 'نقطة قطبية (r; θ)'), row('(2; π/3)', 'angle in radians', 'زاوية بالراديان'),
  ],
  'help.geometry': [row('A = (1, 2)', 'free point (drag it)', 'نقطة حرة (اسحبها)')],
  'help.3d': [row('z = x^2 - y^2', 'surface', 'سطح'), row('x^2 + y^2 + z^2 = 4', 'implicit surface', 'سطح ضمني'), row('(1, 2, 3)', '3D point', 'نقطة ثلاثية الأبعاد')],
  'help.keys': [
    row('Ctrl+Z / Ctrl+Y', 'undo / redo', 'تراجع / إعادة'), row('Ctrl+S / Ctrl+Shift+S', 'save / save as', 'حفظ / حفظ باسم'), row('Ctrl+O', 'open', 'فتح'),
    row('Delete', 'delete selected object', 'حذف الكائن المحدد'), row('Esc', 'back to Move tool', 'العودة إلى أداة التحريك'), row('Wheel / pinch', 'zoom', 'تكبير وتصغير'),
    row('Tab / Enter', 'insert a suggested command', 'إدراج الأمر المقترح'),
  ],
};

const GROUPS: { key: string; table?: HelpGroup }[] = [
  { key: 'help.functions' }, { key: 'help.polar' }, { key: 'help.commands', table: 'commands' }, { key: 'help.fit', table: 'fit' }, { key: 'help.calculus', table: 'calculus' },
  { key: 'help.geometry', table: 'geometry' }, { key: 'help.stats', table: 'stats' }, { key: 'help.3d', table: '3d' }, { key: 'help.keys' },
];

export function helpContent(lang: 'en' | 'ar'): { key: string; rows: Row[] }[] {
  return GROUPS.map((g) => ({
    key: g.key,
    rows: [...(EXTRA[g.key] ?? []).map((r) => ({ code: r.code, desc: r[lang] })), ...(g.table ? helpRows(g.table, lang) : [])],
  }));
}

export function HelpDialog({ onClose }: { onClose(): void }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const add = (group: string, s: string) => {
    if (group === 'help.keys') return;
    const st = useStore.getState();
    if (group === 'help.3d' && st.mode !== '3d') st.setMode('3d');
    st.addObject(s);
    onClose();
  };
  return (
    <Modal title={t('help.title')} onClose={onClose}>
      {helpContent(lang).map((g) => (
        <div key={g.key}>
          <h3>{t(g.key)}</h3>
          <div className="help-grid">
            {g.rows.map(({ code, desc, sig }) => (
              <div key={code}><code onClick={() => add(g.key, code)} title={sig}>{code}</code><span>{desc}</span></div>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
