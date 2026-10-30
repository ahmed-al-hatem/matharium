import type { ProjectFile } from '../store/project';

const files = import.meta.glob('./*.mth', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface LessonTemplate { id: string; project: ProjectFile }

/** The built-in lesson templates, in file-name order. */
export const TEMPLATES: LessonTemplate[] = Object.keys(files).sort().map((path) => ({
  id: path.replace(/^\.\/|\.mth$/g, ''),
  project: JSON.parse(files[path]) as ProjectFile,
}));
