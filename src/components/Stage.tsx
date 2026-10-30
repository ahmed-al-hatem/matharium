import { lazy, Suspense, useEffect, useState } from 'react';
import { useStore } from '../store/project';
import { useT } from '../i18n/i18n';
import { Canvas2D } from '../graph2d/Canvas2D';
import { cam3d } from '../graph3d/handle';
import { Icon } from './Icons';
import { stopRecording } from '../io/record';

const Canvas3D = lazy(() => import('../graph3d/Canvas3D').then((m) => ({ default: m.Canvas3D })));

export function Stage() {
  const t = useT();
  const mode = useStore((s) => s.mode);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const grid = useStore((s) => s.settings.grid);
  const keyboardOpen = useStore((s) => s.keyboardOpen);
  const recording = useStore((s) => s.recording);
  const st = useStore.getState();

  // the canvas being recorded goes away with the mode
  useEffect(() => stopRecording, [mode]);

  const zoom = (f: number) => (mode === '3d' ? cam3d.zoom?.(f) : st.zoom(f));
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

  return (
    <section className="stage">
      {mode === '3d' ? (
        <Suspense fallback={null}><Canvas3D /></Suspense>
      ) : (
        <Canvas2D />
      )}
      <div className="stage-top">
        <button className="icon-btn" disabled={!canUndo} onClick={st.undo} aria-label={t('undo')} title={`${t('undo')} (Ctrl+Z)`}><Icon.undo /></button>
        <button className="icon-btn" disabled={!canRedo} onClick={st.redo} aria-label={t('redo')} title={`${t('redo')} (Ctrl+Y)`}><Icon.redo /></button>
      </div>
      {recording !== null && <RecBadge start={recording} />}
      <div className="stage-gear">
        <button className="icon-btn" onClick={() => st.setSettingsOpen(true)} aria-label={t('settings')} title={t('settings')}><Icon.gear /></button>
      </div>
      <div className="view-ctrls">
        <button className="fab" onClick={st.resetView} aria-label={t('home')} title={t('home')}><Icon.home /></button>
        <button className={`fab ${grid ? 'on' : ''}`} onClick={() => st.setSettings({ grid: !grid })} aria-label={t('toggleGrid')} title={t('toggleGrid')}><Icon.grid /></button>
        <button className="fab" onClick={() => zoom(1.25)} aria-label={t('zoomIn')} title={t('zoomIn')}><Icon.zoomIn /></button>
        <button className="fab" onClick={() => zoom(0.8)} aria-label={t('zoomOut')} title={t('zoomOut')}><Icon.zoomOut /></button>
        <button className="fab" onClick={fullscreen} aria-label={t('fullscreen')} title={t('fullscreen')}><Icon.fullscreen /></button>
      </div>
      {!keyboardOpen && (
        <button className="fab kb-toggle" onClick={() => st.setKeyboard(true)} aria-label={t('keyboard')} title={t('keyboard')}><Icon.keyboard /></button>
      )}
    </section>
  );
}

function RecBadge({ start }: { start: number }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const sec = Math.max(0, Math.floor((now - start) / 1000));
  return (
    <div className="rec-badge" role="status">
      <span className="rec-dot" />REC {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
      <button onClick={stopRecording}><Icon.stop />{t('stopRecording')}</button>
    </div>
  );
}
