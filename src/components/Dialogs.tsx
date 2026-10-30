import { useEffect, useState } from 'react';
import { useStore } from '../store/project';
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

export function SettingsDialog() {
  const t = useT();
  const s = useStore((x) => x.settings);
  const view = useStore((x) => x.view);
  const mode = useStore((x) => x.mode);
  const st = useStore.getState();
  const stage = document.querySelector('.stage');
  const W = stage?.clientWidth ?? 800, H = stage?.clientHeight ?? 600;
  const vp = new Viewport(view, W, H);
  const [rng, setRng] = useState({ xmin: +vp.xmin.toFixed(2), xmax: +vp.xmax.toFixed(2), ymin: +vp.ymin.toFixed(2), ymax: +vp.ymax.toFixed(2) });
  const close = () => st.setSettingsOpen(false);

  const applyRange = () => {
    if (rng.xmax <= rng.xmin || rng.ymax <= rng.ymin) return;
    st.setView({ ox: (rng.xmin + rng.xmax) / 2, oy: (rng.ymin + rng.ymax) / 2, sx: W / (rng.xmax - rng.xmin), sy: H / (rng.ymax - rng.ymin) });
  };

  const check = (key: 'grid' | 'axes' | 'labels' | 'snap') => (
    <label className="check"><input type="checkbox" checked={s[key]} onChange={(e) => st.setSettings({ [key]: e.target.checked })} />{t(key)}</label>
  );

  return (
    <Modal title={t('settings')} onClose={close}>
      <h3>{t('view')}</h3>
      {check('grid')}{check('axes')}{check('labels')}{mode !== '3d' && check('snap')}
      {mode !== '3d' ? (
        <>
          <div className="form-row"><span>{t('xRange')}</span>
            <input className="field" type="number" step="any" value={rng.xmin} onChange={(e) => setRng({ ...rng, xmin: +e.target.value })} aria-label="x min" />
            <input className="field" type="number" step="any" value={rng.xmax} onChange={(e) => setRng({ ...rng, xmax: +e.target.value })} aria-label="x max" />
          </div>
          <div className="form-row"><span>{t('yRange')}</span>
            <input className="field" type="number" step="any" value={rng.ymin} onChange={(e) => setRng({ ...rng, ymin: +e.target.value })} aria-label="y min" />
            <input className="field" type="number" step="any" value={rng.ymax} onChange={(e) => setRng({ ...rng, ymax: +e.target.value })} aria-label="y max" />
          </div>
          <button className="ghost-btn" onClick={applyRange}>{t('apply')}</button>
        </>
      ) : (
        <div className="form-row"><span>{t('range3d')}</span>
          <input className="field" type="number" min={1} max={100} value={s.range3d} onChange={(e) => +e.target.value >= 1 && st.setSettings({ range3d: +e.target.value })} />
        </div>
      )}
      <h3>{t('general')}</h3>
      <div className="form-row"><span>{t('digits')}</span>
        <select className="field" value={s.digits} onChange={(e) => st.setSettings({ digits: +e.target.value })}>
          {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="field" value={s.lang} onChange={(e) => st.setSettings({ lang: e.target.value as 'en' | 'ar' })} aria-label="Language">
          <option value="en">English</option><option value="ar">العربية</option>
        </select>
      </div>
      <div className="modal-actions"><button className="pill-btn" onClick={close}>{t('close')}</button></div>
    </Modal>
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
  'help.geometry': [row('A = (1, 2)', 'free point (drag it)', 'نقطة حرة (اسحبها)')],
  'help.3d': [row('z = x^2 - y^2', 'surface', 'سطح'), row('x^2 + y^2 + z^2 = 4', 'implicit surface', 'سطح ضمني'), row('(1, 2, 3)', '3D point', 'نقطة ثلاثية الأبعاد')],
  'help.keys': [
    row('Ctrl+Z / Ctrl+Y', 'undo / redo', 'تراجع / إعادة'), row('Ctrl+S / Ctrl+Shift+S', 'save / save as', 'حفظ / حفظ باسم'), row('Ctrl+O', 'open', 'فتح'),
    row('Delete', 'delete selected object', 'حذف الكائن المحدد'), row('Esc', 'back to Move tool', 'العودة إلى أداة التحريك'), row('Wheel / pinch', 'zoom', 'تكبير وتصغير'),
    row('Tab / Enter', 'insert a suggested command', 'إدراج الأمر المقترح'),
  ],
};

const GROUPS: { key: string; table?: HelpGroup }[] = [
  { key: 'help.functions' }, { key: 'help.commands', table: 'commands' }, { key: 'help.calculus', table: 'calculus' },
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
