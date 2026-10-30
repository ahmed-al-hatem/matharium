import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { beginLive, EXTRA_COLORS, freeName, PALETTE, useStore } from '../store/project';
import { ANIM_MODES, SPEEDS } from '../store/animate';
import { useResolved } from '../store/resolved';
import { evaluateAll, missingSymbols } from '../math/engine';
import { splitDefinition } from '../math/parser';
import { is3DOnly, type Resolved } from '../math/types';
import { useT } from '../i18n/i18n';
import { Icon } from './Icons';
import { MathField } from './MathField';

function Tex({ tex }: { tex: string }) {
  const html = useMemo(() => {
    try { return katex.renderToString(tex, { throwOnError: false, strict: false }); } catch { return tex; }
  }, [tex]);
  return <div className="alg-tex" dangerouslySetInnerHTML={{ __html: html }} />;
}

const EXAMPLES = ['f(x) = sin(x)', 'y = x^2 - 3', 'x^2 + y^2 = 9', 'a x^2 + b', 'Solve(x^2 - 2x = 3)', 'A = (1, 2)'];
const EXAMPLES_3D = ['z = sin(x) cos(y)', 'x^2 + y^2 + z^2 = 9', 'Curve(cos(t), sin(t), t/4, t, 0, 4pi)', 'P = (2, 1, 3)', 'Sphere((0,0,0), 2)'];

function SliderRow({ r }: { r: Resolved }) {
  const t = useT();
  const { obj } = r;
  const s = obj.slider!;
  const value = r.value?.type === 'number' ? r.value.value : 0;
  const playing = useStore((st) => st.playing.includes(obj.id));
  const name = splitDefinition(obj.input).name ?? obj.name;
  const set = (v: number) => useStore.getState().liveUpdate(obj.id, { input: `${name} = ${+v.toFixed(6)}` });
  const speed = s.speed ?? 1;

  return (
    <div className="slider-row" onClick={(e) => e.stopPropagation()} style={{ ['--c' as string]: obj.color }}>
      <button className="play-btn" onClick={() => useStore.getState().togglePlay(obj.id)} aria-label={playing ? t('pause') : t('play')} title={playing ? t('pause') : t('play')}>
        {playing ? <Icon.pause /> : <Icon.play />}
      </button>
      {speed !== 1 && <span className="speed-chip">×{speed}</span>}
      <span className="lim">{s.min}</span>
      <input
        type="range" min={s.min} max={s.max} step={s.step} value={value}
        aria-label={name}
        onPointerDown={() => beginLive()}
        onPointerUp={() => useStore.getState().commit()}
        onChange={(e) => set(+e.target.value)}
      />
      <span className="lim">{s.max}</span>
    </div>
  );
}

function ItemMenu({ r, onClose }: { r: Resolved; onClose(): void }) {
  const t = useT();
  const st = useStore.getState();
  const { obj } = r;
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // fit the menu in the visible part of the list (above the on-screen keyboard) and bring it into view
    const el = ref.current, list = el?.closest('.panel-scroll');
    if (el && list) {
      el.style.maxHeight = `${Math.max(160, list.clientHeight - 16)}px`;
      el.scrollIntoView({ block: 'nearest' });
    }
    // subscribe once: the item re-renders on every animation frame, and a listener added after cleanup would leak
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close.current(); };
    const timer = setTimeout(() => document.addEventListener('pointerdown', h));
    return () => { clearTimeout(timer); document.removeEventListener('pointerdown', h); };
  }, []);
  const [range, setRange] = useState(obj.slider ?? { min: -5, max: 5, step: 0.1 });
  return (
    <div className="menu obj-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <div className="menu-item muted" style={{ fontSize: 12 }}>{t('color')}</div>
      <div className="swatches">
        {[...PALETTE, ...EXTRA_COLORS].map((c) => (
          <button key={c} className={`swatch ${c === obj.color ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => st.patchObject(obj.id, { color: c })} />
        ))}
      </div>
      {obj.slider && (
        <div className="range-edit">
          {(['min', 'max', 'step'] as const).map((k) => (
            <label key={k}>{t(k)}
              <input type="number" value={range[k]} step="any"
                onChange={(e) => setRange({ ...range, [k]: +e.target.value })}
                onBlur={() => range.max > range.min && range.step > 0 && st.patchObject(obj.id, { slider: { ...obj.slider, min: range.min, max: range.max, step: range.step } })} />
            </label>
          ))}
          <label>{t('speed')}
            <select value={obj.slider.speed ?? 1} aria-label={t('speed')}
              onChange={(e) => st.patchObject(obj.id, { slider: { ...obj.slider!, speed: +e.target.value } })}>
              {SPEEDS.map((v) => <option key={v} value={v}>×{v}</option>)}
            </select>
          </label>
          <label className="wide">{t('animMode')}
            <select value={obj.slider.mode ?? 'oscillate'} aria-label={t('animMode')}
              onChange={(e) => st.patchObject(obj.id, { slider: { ...obj.slider!, mode: e.target.value as typeof ANIM_MODES[number] } })}>
              {ANIM_MODES.map((m) => <option key={m} value={m}>{t(`anim.${m}`)}</option>)}
            </select>
          </label>
        </div>
      )}
      {(r.value?.type === 'point' || r.value?.type === 'point3d') && (
        <>
          <hr />
          <button onClick={() => {
            if (obj.trace) st.clearTrace(obj.id);
            st.patchObject(obj.id, { trace: !obj.trace });
          }}><Icon.trace />{t('trace')}{obj.trace ? ' ✓' : ''}</button>
          <button onClick={() => { st.clearTrace(obj.id); onClose(); }}><Icon.eraser />{t('clearTrace')}</button>
        </>
      )}
      <hr />
      <button onClick={() => st.patchObject(obj.id, { showLabel: !(obj.showLabel ?? st.settings.labels) })}><Icon.label />{t('showLabel')}{(obj.showLabel ?? st.settings.labels) ? ' ✓' : ''}</button>
      <button onClick={() => {
        const n = prompt(t('rename'), obj.name);
        if (n) st.renameObject(obj.id, n.trim());
        onClose();
      }}><Icon.file />{t('rename')}</button>
      <button onClick={() => {
        const def = splitDefinition(obj.input);
        st.addObject(def.name ? def.body : obj.input, { color: obj.color, slider: obj.slider });
        onClose();
      }}><Icon.copy />{t('duplicate')}</button>
      <button onClick={() => { st.removeObject(obj.id); onClose(); }} style={{ color: 'var(--curve-coral)' }}><Icon.trash />{t('delete')}</button>
    </div>
  );
}

function AlgebraItem({ r }: { r: Resolved }) {
  const t = useT();
  const { obj } = r;
  const selected = useStore((s) => s.selectedId === obj.id);
  const editing = useStore((s) => s.editingId === obj.id);
  const mode = useStore((s) => s.mode);
  const [draft, setDraft] = useState(obj.input);
  const [menu, setMenu] = useState(false);
  const st = useStore.getState;

  useEffect(() => { if (editing) setDraft(obj.input); }, [editing, obj.input]);

  const submit = (v: string) => {
    if (v.trim() && v.trim() !== obj.input) st().updateInput(obj.id, v);
    if (!v.trim()) st().removeObject(obj.id);
    st().setEditing(null);
  };

  const isSlider = r.value?.type === 'number' && r.value.slider && obj.slider;
  const only3d = mode !== '3d' && is3DOnly(r.value);

  return (
    <div className={`alg-item ${selected ? 'selected' : ''}`} onClick={() => { st().select(obj.id); st().setEditing(obj.id); }}>
      <div className="alg-gutter">
        <button
          className={`vis-dot ${obj.visible ? '' : 'off'}`}
          style={{ ['--c' as string]: obj.color }}
          aria-label={obj.visible ? t('hide') : t('show')}
          title={obj.visible ? t('hide') : t('show')}
          onClick={(e) => { e.stopPropagation(); st().patchObject(obj.id, { visible: !obj.visible }); }}
        />
      </div>
      <div className="alg-body">
        {editing ? (
          <MathField value={draft} onChange={setDraft} onSubmit={submit} autoFocus
            onCancel={() => st().setEditing(null)} onBlur={() => submit(draft)} ariaLabel={obj.name} />
        ) : (
          <Tex tex={r.tex} />
        )}
        {r.display && !editing && <div className="alg-value"><span>{r.display}</span></div>}
        {r.error && <div className="alg-error">{r.error}</div>}
        {only3d && <div className="alg-note">◇ {t('onlyIn3d')}</div>}
        {isSlider && !editing && <SliderRow r={r} />}
      </div>
      <div className="alg-actions">
        <button className="icon-btn" aria-label={t('more')} title={t('more')} onClick={(e) => { e.stopPropagation(); setMenu(!menu); }}><Icon.dots /></button>
      </div>
      {menu && <ItemMenu r={r} onClose={() => setMenu(false)} />}
    </div>
  );
}

export function AlgebraPanel() {
  const t = useT();
  const items = useResolved();
  const mode = useStore((s) => s.mode);
  const anyPlaying = useStore((s) => s.playing.length > 0);
  const hasSliders = items.some((r) => r.obj.slider);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const submit = (v: string) => {
    const input = v.trim();
    if (!input) return;
    const st = useStore.getState();
    if (!missingSymbols(input, st.objects).length) {
      const def = splitDefinition(input);
      const name = def.name ?? freeName(st.objects, input);
      const probe = evaluateAll([...st.objects.filter((o) => o.name !== def.name), { id: '__p', name, input, color: '', visible: true }]).find((x) => x.obj.id === '__p');
      if (probe?.error && !/dependency/i.test(probe.error)) { setErr(probe.error); return; }
    }
    st.addObject(input);
    setDraft('');
    setErr(null);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'nearest' }));
  };

  return (
    <div className="panel-scroll">
      {hasSliders && (
        <div className="anim-bar">
          <button className="ghost-btn" onClick={() => useStore.getState().playAll()}><Icon.play />{t('playAll')}</button>
          <button className="ghost-btn" disabled={!anyPlaying} onClick={() => useStore.getState().stopAll()}><Icon.stop />{t('stopAll')}</button>
        </div>
      )}
      {items.map((r) => <AlgebraItem key={r.obj.id} r={r} />)}
      <div className="alg-input-row" ref={endRef}>
        <div className="alg-gutter"><Icon.plus /></div>
        <div style={{ flex: 1 }}>
          <MathField value={draft} onChange={(v) => { setDraft(v); setErr(null); }} onSubmit={submit} placeholder={t('input')} autoFocus={items.length === 0} />
          {err && <div className="alg-error" style={{ padding: '0 14px 10px' }}>{err}</div>}
        </div>
      </div>
      {items.length === 0 && (
        <div className="empty-hint">
          <div style={{ marginBottom: 8 }}>{t('empty')}</div>
          {(mode === '3d' ? EXAMPLES_3D : EXAMPLES).map((ex) => <code key={ex} onClick={() => submit(ex)}>{ex}</code>)}
        </div>
      )}
    </div>
  );
}
