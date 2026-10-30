import { newId, useStore, type ProjectFile } from '../store/project';
import { forgetFileHandle } from './fileio';

const KEY = 'matharium.templates';

export interface UserTemplate { id: string; title: string; created: number; project: ProjectFile }

export function userTemplates(): UserTemplate[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((t) => t?.project?.app === 'matharium') : [];
  } catch {
    return [];
  }
}

function store(list: UserTemplate[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** Save the current project (all modes) as a template in this browser. */
export function saveUserTemplate(title: string): boolean {
  const project = useStore.getState().toFile();
  return store([...userTemplates(), { id: newId(), title, created: Date.now(), project }]);
}

export function deleteUserTemplate(id: string) {
  store(userTemplates().filter((t) => t.id !== id));
}

/** Start a new project from a template; it opens in the template's own mode. */
export function applyTemplate(project: ProjectFile, title: string): boolean {
  const st = useStore.getState();
  if (st.dirty && st.objects.length && !confirm(st.settings.lang === 'ar' ? 'تجاهل التغييرات غير المحفوظة؟' : 'Discard unsaved changes?')) return false;
  const { meta: _meta, ...p } = project;
  forgetFileHandle();
  st.load(JSON.parse(JSON.stringify(p)), title);
  // templates are driven by their sliders, which live in the algebra panel
  st.setPanel('algebra');
  st.setTool('move');
  return true;
}
