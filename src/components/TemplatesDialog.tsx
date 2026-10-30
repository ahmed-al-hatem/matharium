import { useEffect, useRef, useState } from 'react';
import { useStore, type ProjectFile } from '../store/project';
import { useT } from '../i18n/i18n';
import { TEMPLATES } from '../templates';
import { applyTemplate, deleteUserTemplate, saveUserTemplate, userTemplates } from '../io/templates';
import { drawThumb } from '../graph2d/thumb';
import { Modal } from './Dialogs';
import { Icon } from './Icons';

function Thumb({ project }: { project: ProjectFile }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // draw after the dialog has laid out, so the canvas has its size
    const id = requestAnimationFrame(() => { if (ref.current) try { drawThumb(ref.current, project); } catch { /* preview only */ } });
    return () => cancelAnimationFrame(id);
  }, [project]);
  return <canvas ref={ref} className="tpl-thumb" aria-hidden="true" />;
}

/** "New from template": built-in lessons plus the user's own templates saved in this browser. */
export function TemplatesDialog({ onClose }: { onClose(): void }) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const [mine, setMine] = useState(userTemplates);

  const open = (project: ProjectFile, title: string) => { if (applyTemplate(project, title)) onClose(); };
  const saveCurrent = () => {
    const st = useStore.getState();
    const name = prompt(t('tpl.name'), st.fileName === 'Untitled' ? t('untitled') : st.fileName.replace(/\.(mth|json)$/i, ''));
    if (!name?.trim()) return;
    st.notify(saveUserTemplate(name.trim()) ? 'tpl.saved' : 'saveFailed');
    setMine(userTemplates());
  };

  return (
    <Modal title={t('tpl.title')} onClose={onClose} wide>
      <div className="tpl-grid">
        {TEMPLATES.map(({ id, project }) => (
          <button key={id} className="tpl-card" data-template={id} onClick={() => open(project, project.meta!.title[lang])}>
            <Thumb project={project} />
            <span className="tpl-mode">{t(`modeShort.${project.mode}`)}</span>
            <strong>{project.meta!.title[lang]}</strong>
            <span className="tpl-desc">{project.meta!.description[lang]}</span>
          </button>
        ))}
      </div>
      <h3>{t('tpl.mine')}</h3>
      {mine.length === 0 && <p className="muted tpl-empty">{t('tpl.none')}</p>}
      <div className="tpl-grid">
        {mine.map((u) => (
          <div key={u.id} className="tpl-card user" data-user-template={u.title}>
            <button className="tpl-open" onClick={() => open(u.project, u.title)}>
              <Thumb project={u.project} />
              <span className="tpl-mode">{t(`modeShort.${u.project.mode}`)}</span>
              <strong dir="auto">{u.title}</strong>
            </button>
            <button className="icon-btn tpl-del" aria-label={`${t('delete')} ${u.title}`} title={t('delete')}
              onClick={() => { deleteUserTemplate(u.id); setMine(userTemplates()); }}><Icon.trash /></button>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="ghost-btn" onClick={saveCurrent}><Icon.save />{t('tpl.saveCurrent')}</button>
        <button className="pill-btn" onClick={onClose}>{t('close')}</button>
      </div>
    </Modal>
  );
}
