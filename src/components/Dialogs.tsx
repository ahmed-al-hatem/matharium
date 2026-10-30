import { useEffect, useState } from 'react';
import { useStore } from '../store/project';
import { useT } from '../i18n/i18n';
import { Viewport } from '../graph2d/viewport';
import { Icon } from './Icons';

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

const HELP: { key: string; rows: [string, string][] }[] = [
  { key: 'help.functions', rows: [
    ['f(x) = x^3 - 3x', 'function'], ['y = 2x + 1', 'explicit line'], ['x^2 + y^2 = 9', 'implicit curve'],
    ['y < sin(x)', 'inequality region'], ['a x^2 + b', 'auto-creates sliders a, b'], ["f'(x)", 'derivative of f'],
    ['g(x) = x < 0 ? -x : x^2', 'piecewise'], ['{(1,2), (3,5), (4,1)}', 'list of points'],
  ] },
  { key: 'help.commands', rows: [
    ['Solve(x^2 - 2x = 3)', 'solve equation'], ['Solve(x + y = 3, x - y = 1)', 'solve system'],
    ['Roots(f)', 'zeros'], ['Extremum(f)', 'max / min'], ['Intersect(f, g)', 'intersection points'],
    ['Derivative(f)', 'symbolic derivative'], ['Integral(f, 0, 2)', 'definite integral (shaded)'],
    ['Tangent(1, f)', 'tangent line at x = 1'], ['Simplify(x(x+1) - x)', 'simplify'], ['Expand((x+1)^3)', 'expand'],
  ] },
  { key: 'help.geometry', rows: [
    ['A = (1, 2)', 'free point (drag it)'], ['Segment(A, B)', 'segment'], ['Circle(A, 3)', 'circle'],
    ['Polygon(A, B, C)', 'polygon & area'], ['Midpoint(A, B)', 'midpoint'], ['Angle(A, B, C)', 'angle at B'],
    ['Perpendicular(A, l)', 'perpendicular line'], ['Rotate(A, 90°, B)', 'rotation'],
  ] },
  { key: 'help.3d', rows: [
    ['z = x^2 - y^2', 'surface'], ['x^2 + y^2 + z^2 = 4', 'implicit surface'], ['(1, 2, 3)', '3D point'],
    ['Curve(cos(t), sin(t), t/4, t, 0, 4pi)', 'space curve'], ['Sphere((0,0,0), 2)', 'sphere'],
    ['Surface(u, v, u v, u, -2, 2, v, -2, 2)', 'parametric surface'],
  ] },
  { key: 'help.keys', rows: [
    ['Ctrl+Z / Ctrl+Y', 'undo / redo'], ['Ctrl+S / Ctrl+Shift+S', 'save / save as'], ['Ctrl+O', 'open'],
    ['Delete', 'delete selected object'], ['Esc', 'back to Move tool'], ['Wheel / pinch', 'zoom'],
  ] },
];

export function HelpDialog({ onClose }: { onClose(): void }) {
  const t = useT();
  const add = (s: string) => {
    if (s.startsWith('Ctrl') || s.startsWith('Wheel') || ['Delete', 'Esc'].includes(s)) return;
    const st = useStore.getState();
    if (/Sphere|Curve\(cos|Surface|z =|z\^2|, 3\)$/.test(s) && st.mode !== '3d') st.setMode('3d');
    st.addObject(s);
    onClose();
  };
  return (
    <Modal title={t('help.title')} onClose={onClose}>
      {HELP.map((g) => (
        <div key={g.key}>
          <h3>{t(g.key)}</h3>
          <div className="help-grid">
            {g.rows.map(([code, desc]) => (
              <div key={code}><code onClick={() => add(code)}>{code}</code><span>{desc}</span></div>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
