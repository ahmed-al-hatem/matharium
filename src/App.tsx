import { useEffect, useRef, useState } from 'react';
import { useStore, type Panel } from './store/project';
import { useT } from './i18n/i18n';
import { TopBar } from './components/TopBar';
import { Stage } from './components/Stage';
import { AlgebraPanel } from './components/AlgebraPanel';
import { ToolsPanel } from './components/ToolsPanel';
import { TablePanel } from './components/TablePanel';
import { SpreadsheetPanel } from './components/SpreadsheetPanel';
import { MathKeyboard } from './components/MathKeyboard';
import { HelpDialog, SettingsDialog } from './components/Dialogs';
import { Icon } from './components/Icons';
import { openProject, saveProject } from './io/fileio';

const RAIL: { id: Panel; icon: () => JSX.Element; in3d: boolean }[] = [
  { id: 'algebra', icon: Icon.algebra, in3d: true },
  { id: 'tools', icon: Icon.tools, in3d: true },
  { id: 'table', icon: Icon.table, in3d: false },
  { id: 'spreadsheet', icon: Icon.sheet, in3d: false },
];

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

export default function App() {
  const t = useT();
  const mode = useStore((s) => s.mode);
  const panel = useStore((s) => s.panel);
  const lang = useStore((s) => s.settings.lang);
  const keyboardOpen = useStore((s) => s.keyboardOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const toast = useStore((s) => s.toast);
  const fileName = useStore((s) => s.fileName);
  const dirty = useStore((s) => s.dirty);
  const [help, setHelp] = useState(false);
  const [width, setWidth] = useState(400);
  const resizing = useRef(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  useEffect(() => { document.title = `${dirty ? '• ' : ''}${fileName} — Matharium`; }, [fileName, dirty]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
      if (mod && key === 'o') { e.preventDefault(); openProject(); return; }
      if (isTyping(e)) return;
      if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); }
      else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); st.redo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selectedId && st.panel !== 'spreadsheet') { st.removeObject(st.selectedId); }
      else if (e.key === 'Escape') { st.setTool('move'); st.select(null); }
    };
    const beforeUnload = (e: BeforeUnloadEvent) => { if (useStore.getState().dirty && useStore.getState().objects.length) e.preventDefault(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', beforeUnload);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!resizing.current) return;
      const rail = document.querySelector('.rail')!.getBoundingClientRect();
      const w = lang === 'ar' ? rail.left - e.clientX : e.clientX - rail.right;
      setWidth(Math.max(260, Math.min(window.innerWidth * 0.7, w)));
    };
    const up = () => { resizing.current = false; document.body.style.cursor = ''; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [lang]);

  const st = useStore.getState();
  const rail = RAIL.filter((r) => mode !== '3d' || r.in3d);

  return (
    <div className="app">
      <TopBar onHelp={() => setHelp(true)} />
      <div className="main">
        <nav className="rail" aria-label="Views">
          {rail.map(({ id, icon: Ic }) => (
            <button key={id} className={panel === id ? 'active' : ''} onClick={() => st.setPanel(panel === id ? null : id)} aria-pressed={panel === id}>
              <Ic />{t(`panel.${id}`)}
            </button>
          ))}
          <div className="spacer hide-sm" />
          <button className="hide-sm" onClick={() => setHelp(true)} style={{ marginBottom: 16 }}><Icon.help />{t('help').split(' ')[0]}</button>
        </nav>
        {panel && (
          <aside className="panel" style={{ ['--panel-w' as string]: `${width}px` }} aria-label={t(`panel.${panel}`)}>
            {panel === 'algebra' && <AlgebraPanel />}
            {panel === 'tools' && <ToolsPanel />}
            {panel === 'table' && <TablePanel />}
            {panel === 'spreadsheet' && <SpreadsheetPanel />}
            <div className="panel-resize" onPointerDown={() => { resizing.current = true; document.body.style.cursor = 'col-resize'; }} role="separator" aria-orientation="vertical" />
          </aside>
        )}
        <Stage />
      </div>
      {keyboardOpen && <MathKeyboard />}
      {settingsOpen && <SettingsDialog />}
      {help && <HelpDialog onClose={() => setHelp(false)} />}
      {toast && <div className="toast" role="status">{t(toast)}</div>}
    </div>
  );
}
