import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { beginLive, freeName, useStore } from '../store/project';
import { useResolved } from '../store/resolved';
import { evaluateAll, missingSymbols } from '../math/engine';
import { splitDefinition } from '../math/parser';
import { is3DOnly, type Resolved } from '../math/types';
import { formatNote } from '../math/steps';
import { useT } from '../i18n/i18n';
import { Icon } from './Icons';
import { MathField } from './MathField';
import { RichText } from './RichText';
import { openMenu, useContextTrigger } from './ContextMenu';
import { objectMenu } from './contextMenus';

function Tex({ tex, className = 'alg-tex' }: { tex: string; className?: string }) {
  const html = useMemo(() => {
    try { return katex.renderToString(tex, { throwOnError: false, strict: false }); } catch { return tex; }
  }, [tex]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function StepsList({ r }: { r: Resolved }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const steps = useMemo(() => r.steps?.() ?? null, [r]);
  if (!steps?.length) return <div className="alg-note">{t('steps.none')}</div>;
  return (
    <ol className="steps-list" onClick={(e) => e.stopPropagation()}>
      {steps.map((s, i) => (
        <li key={i}>
          <Tex tex={s.tex} className="step-tex" />
          <div className="step-note">{formatNote(s, t, lang === 'ar' ? '، ' : ', ')}</div>
        </li>
      ))}
    </ol>
  );
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
        aria-label={name} disabled={obj.fixed}
        onPointerDown={() => beginLive()}
        onPointerUp={() => useStore.getState().commit()}
        onChange={(e) => set(+e.target.value)}
      />
      <span className="lim">{s.max}</span>
    </div>
  );
}

function AlgebraItem({ r }: { r: Resolved }) {
  const t = useT();
  const { obj } = r;
  const selected = useStore((s) => s.selectedId === obj.id);
  const editing = useStore((s) => s.editingId === obj.id);
  const mode = useStore((s) => s.mode);
  const exactDefault = useStore((s) => s.settings.exact);
  const [draft, setDraft] = useState(obj.input);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const showMenu = (x: number, y: number, via: 'mouse' | 'touch' | 'key') => {
    st().select(obj.id);
    openMenu({ x, y, via, label: obj.name, build: objectMenu(obj.id), returnFocus: menuBtn.current });
  };
  const trigger = useContextTrigger((x, y, via) => showMenu(x, y, via));
  const [stepsOpen, setStepsOpen] = useState(!!r.stepsOpen);
  const st = useStore.getState;

  useEffect(() => { if (editing) setDraft(obj.input); }, [editing, obj.input]);
  useEffect(() => { if (r.stepsOpen) setStepsOpen(true); }, [r.stepsOpen]);

  const submit = (v: string) => {
    if (v.trim() && v.trim() !== obj.input) st().updateInput(obj.id, v);
    if (!v.trim()) st().removeObject(obj.id);
    st().setEditing(null);
  };

  const isSlider = r.value?.type === 'number' && r.value.slider && obj.slider;
  const only3d = mode !== '3d' && is3DOnly(r.value);
  const exact = r.exact;
  const approx = obj.approx ?? !exactDefault;

  return (
    <div className={`alg-item ${selected ? 'selected' : ''} ${obj.auxiliary ? 'aux' : ''}`} onClick={(e) => { if (e.altKey) return; st().select(obj.id); st().setEditing(obj.id); }}
      onDoubleClick={(e) => { if (e.altKey) { st().select(obj.id); st().setEditing(null); st().openProperties([obj.id]); } }}
      onContextMenu={trigger.onContextMenu} onKeyDown={trigger.onKeyDown} onPointerDown={trigger.onPointerDown}
      onPointerMove={trigger.onPointerMove} onPointerUp={trigger.onPointerUp} onPointerCancel={trigger.onPointerCancel}>
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
          <MathField value={draft} onChange={setDraft} onSubmit={submit} autoFocus complete
            onCancel={() => st().setEditing(null)} onBlur={() => submit(draft)} ariaLabel={obj.name} />
        ) : r.value?.type === 'label' ? (
          <RichText className="alg-tex alg-text" text={r.value.text} />
        ) : (
          <Tex tex={r.tex} />
        )}
        {r.display && !editing && (
          <div className="alg-value">
            <span>{exact && !approx ? exact : r.display}</span>
            {exact && (
              <button className={`approx-btn ${approx ? 'on' : ''}`} aria-pressed={approx} aria-label={approx ? t('showExact') : t('showDecimal')}
                title={approx ? t('showExact') : t('showDecimal')}
                onClick={(e) => { e.stopPropagation(); st().liveUpdate(obj.id, { approx: !approx }); }}>≈</button>
            )}
          </div>
        )}
        {r.steps && !editing && (
          <button className={`steps-btn ${stepsOpen ? 'on' : ''}`} aria-expanded={stepsOpen}
            onClick={(e) => { e.stopPropagation(); setStepsOpen(!stepsOpen); }}>
            {stepsOpen ? t('steps.hide') : t('steps.show')}
          </button>
        )}
        {r.steps && stepsOpen && !editing && <StepsList r={r} />}
        {r.error && <div className="alg-error">{r.error}</div>}
        {only3d && <div className="alg-note">◇ {t('onlyIn3d')}</div>}
        {isSlider && !editing && <SliderRow r={r} />}
      </div>
      <div className="alg-actions">
        <button ref={menuBtn} className="icon-btn" aria-label={t('more')} title={t('more')} aria-haspopup="menu" onClick={(e) => {
          e.stopPropagation();
          const b = e.currentTarget.getBoundingClientRect();
          showMenu(document.dir === 'rtl' ? b.left : b.right, b.bottom, e.detail ? 'mouse' : 'key');
        }}><Icon.dots /></button>
      </div>
    </div>
  );
}

export function AlgebraPanel() {
  const t = useT();
  const items = useResolved();
  const mode = useStore((s) => s.mode);
  const anyPlaying = useStore((s) => s.playing.length > 0);
  const showAux = useStore((s) => s.settings.showAux);
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
      const probe = evaluateAll([...st.objects.filter((o) => o.name !== def.name), { id: '__p', name, input, color: '', visible: true }], 4, st.sheet, { angle: st.settings.angle }).find((x) => x.obj.id === '__p');
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
      {items.filter((r) => showAux || !r.obj.auxiliary).map((r) => <AlgebraItem key={r.obj.id} r={r} />)}
      <div className="alg-input-row" ref={endRef}>
        <div className="alg-gutter"><Icon.plus /></div>
        <div style={{ flex: 1 }}>
          <MathField value={draft} onChange={(v) => { setDraft(v); setErr(null); }} onSubmit={submit} placeholder={t('input')} autoFocus={items.length === 0} complete />
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
