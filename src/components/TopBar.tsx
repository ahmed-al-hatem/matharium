import { useEffect, useRef, useState } from 'react';
import { useStore, type Mode } from '../store/project';
import { useT } from '../i18n/i18n';
import { exportCSV, exportPNG, exportSVG, newProject, openProject, saveProject, shareLink } from '../io/fileio';
import { Icon } from './Icons';
import { install } from '../io/pwa';

const MODES: { id: Mode; icon: () => JSX.Element }[] = [
  { id: 'graphing', icon: Icon.graph },
  { id: 'geometry', icon: Icon.geometry },
  { id: '3d', icon: Icon.cube },
];

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open, close]);
  return ref;
}

export function TopBar({ onHelp }: { onHelp(): void }) {
  const t = useT();
  const mode = useStore((s) => s.mode);
  const fileName = useStore((s) => s.fileName);
  const dirty = useStore((s) => s.dirty);
  const pwa = useStore((s) => s.pwa);
  const showInstall = !pwa.installed && (pwa.canInstall || pwa.ios);
  const st = useStore.getState();
  const [drawer, setDrawer] = useState(false);
  const [modeMenu, setModeMenu] = useState(false);
  const modeRef = useOutside(modeMenu, () => setModeMenu(false));
  const ModeIcon = MODES.find((m) => m.id === mode)!.icon;

  const run = (fn: () => void) => () => { setDrawer(false); fn(); };
  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';

  return (
    <header className="topbar">
      <button className="icon-btn" onClick={() => setDrawer(true)} aria-label={t('menu')} title={t('menu')}><Icon.menu /></button>
      <div className="brand">
        <span className="logo" aria-label="Matharium">math<b>a</b>rium</span>
        <span className="app-title">{t(`mode.${mode}`)}</span>
      </div>
      <div ref={modeRef} style={{ position: 'relative' }}>
        <button className="mode-pill" onClick={() => setModeMenu(!modeMenu)} aria-haspopup="menu" aria-expanded={modeMenu}>
          <ModeIcon /><span className="hide-sm">{t(`modeShort.${mode}`)}</span><Icon.chevron />
        </button>
        {modeMenu && (
          <div className="menu" role="menu">
            {MODES.map(({ id, icon: Ic }) => (
              <button key={id} role="menuitem" className={id === mode ? 'active' : ''} onClick={() => { st.setMode(id); setModeMenu(false); }}>
                <Ic />{t(`modeShort.${id}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="spacer" />
      <span className="file-name" title={fileName}>{fileName === 'Untitled' ? t('untitled') : fileName}{dirty ? ' •' : ''}</span>
      <button className="icon-btn hide-sm" onClick={() => saveProject()} aria-label={t('save')} title={`${t('save')} (${mod}S)`}><Icon.save /></button>
      {showInstall && <button className="icon-btn" onClick={install} aria-label={t('install')} title={t('install')}><Icon.download /></button>}
      <button className="icon-btn" onClick={shareLink} aria-label={t('share')} title={t('share')}><Icon.share /></button>

      {drawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawer(false)} />
          <nav className="drawer" aria-label={t('menu')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 0 12px' }}>
              <span className="logo">math<b>a</b>rium</span>
              <button className="icon-btn" style={{ width: 40 }} onClick={() => setDrawer(false)} aria-label={t('close')}><Icon.close /></button>
            </div>
            <h3>{t('file')}</h3>
            <button onClick={run(newProject)}><Icon.file />{t('new')}</button>
            <button onClick={run(openProject)}><Icon.folder />{t('open')}<kbd>{mod}O</kbd></button>
            <button onClick={run(() => saveProject())}><Icon.save />{t('save')}<kbd>{mod}S</kbd></button>
            <button onClick={run(() => saveProject(true))}><Icon.save />{t('saveAs')}<kbd>{mod}⇧S</kbd></button>
            <button onClick={run(openProject)}><Icon.upload />{t('importCsv')}</button>
            <h3>Export</h3>
            <button onClick={run(exportPNG)}><Icon.image />{t('exportPng')}</button>
            <button onClick={run(exportSVG)}><Icon.image />{t('exportSvg')}</button>
            <button onClick={run(() => exportCSV('table'))}><Icon.download />{t('exportCsv')}</button>
            <button onClick={run(() => exportCSV('sheet'))}><Icon.download />{t('exportSheetCsv')}</button>
            <h3>{t('view')}</h3>
            {MODES.map(({ id, icon: Ic }) => (
              <button key={id} onClick={run(() => st.setMode(id))} style={id === mode ? { color: 'var(--accent-blue)' } : undefined}><Ic />{t(`modeShort.${id}`)}</button>
            ))}
            <h3>{t('general')}</h3>
            {showInstall && <button onClick={run(install)}><Icon.download />{t('install')}</button>}
            <button onClick={run(() => st.openSettings())}><Icon.gear />{t('settings')}</button>
            <button onClick={run(shareLink)}><Icon.share />{t('share')}</button>
            <button onClick={run(onHelp)}><Icon.help />{t('help')}</button>
          </nav>
        </>
      )}
    </header>
  );
}
