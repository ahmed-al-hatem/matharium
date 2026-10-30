import { useStore, type ProjectFile } from '../store/project';
import { evaluateAll } from '../math/engine';

/** Filled in by whichever graph view is mounted. */
export const exporters: { png?: () => string; svg?: () => string | null } = {};

let fileHandle: any = null;
const w: any = typeof window === 'undefined' ? {} : window;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = () => useStore.getState().fileName.replace(/\.(mth|json)$/i, '') || 'matharium';

export async function saveProject(saveAs = false) {
  const st = useStore.getState();
  const json = JSON.stringify(st.toFile(), null, 2);
  try {
    if (w.showSaveFilePicker) {
      if (!fileHandle || saveAs) {
        fileHandle = await w.showSaveFilePicker({
          suggestedName: `${baseName()}.mth`,
          types: [{ description: 'Matharium project', accept: { 'application/json': ['.mth', '.json'] } }],
        });
      }
      const wr = await fileHandle.createWritable();
      await wr.write(json);
      await wr.close();
      st.markSaved(fileHandle.name);
    } else {
      let name = `${baseName()}.mth`;
      if (saveAs) name = (prompt('File name', name) ?? '').trim() || name;
      download(new Blob([json], { type: 'application/json' }), name);
      st.markSaved(name);
    }
    st.notify('saved');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') st.notify('saveFailed');
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

export const colName = (i: number) => String.fromCharCode(65 + i);

export async function loadFile(file: File, handle?: any) {
  const st = useStore.getState();
  const text = await file.text();
  if (/\.csv$/i.test(file.name)) {
    const sheet: Record<string, string> = {};
    parseCsv(text).forEach((r, ri) => r.forEach((c, ci) => { if (c.trim() && ci < 26) sheet[`${colName(ci)}${ri + 1}`] = c.trim(); }));
    st.setSheet(sheet);
    st.setPanel('spreadsheet');
    st.notify('imported');
    return;
  }
  try {
    const p = JSON.parse(text) as ProjectFile;
    if (p.app !== 'matharium' || !Array.isArray(p.objects)) throw new Error('bad');
    fileHandle = handle ?? null;
    st.load(p, file.name);
    st.notify('opened');
  } catch {
    st.notify('openFailed');
  }
}

export async function openProject() {
  const st = useStore.getState();
  if (st.dirty && st.objects.length && !confirm(st.settings.lang === 'ar' ? 'تجاهل التغييرات غير المحفوظة؟' : 'Discard unsaved changes?')) return;
  try {
    if (w.showOpenFilePicker) {
      const [h] = await w.showOpenFilePicker({
        types: [{ description: 'Matharium project or CSV', accept: { 'application/json': ['.mth', '.json'], 'text/csv': ['.csv'] } }],
      });
      await loadFile(await h.getFile(), /\.csv$/i.test(h.name) ? undefined : h);
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mth,.json,.csv';
  input.onchange = () => input.files?.[0] && loadFile(input.files[0]);
  input.click();
}

export function newProject() {
  const st = useStore.getState();
  if (st.dirty && st.objects.length && !confirm(st.settings.lang === 'ar' ? 'تجاهل التغييرات غير المحفوظة؟' : 'Discard unsaved changes?')) return;
  fileHandle = null;
  st.reset();
}

export function exportPNG() {
  const url = exporters.png?.();
  if (!url) return;
  fetch(url).then((r) => r.blob()).then((b) => download(b, `${baseName()}.png`));
}

export function exportSVG() {
  const svg = exporters.svg?.();
  if (!svg) { useStore.getState().notify('svg3d'); return; }
  download(new Blob([svg], { type: 'image/svg+xml' }), `${baseName()}.svg`);
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function tableRows(): (string | number)[][] {
  const st = useStore.getState();
  const res = evaluateAll(st.objects, st.settings.digits, st.sheet, { sigFigs: st.settings.sigFigs, angle: st.settings.angle });
  const fns = res.filter((r) => st.table.ids.includes(r.obj.id) && r.value?.type === 'function');
  const { start, end, step } = st.table;
  const rows: (string | number)[][] = [['x', ...fns.map((r) => `${r.obj.name}(x)`)]];
  if (step > 0) for (let x = start, i = 0; x <= end + 1e-9 && i < 1000; x += step, i++) {
    const xv = +x.toFixed(10);
    rows.push([xv, ...fns.map((r) => { const y = (r.value as { f: (x: number) => number }).f(xv); return Number.isFinite(y) ? +y.toFixed(st.settings.digits) : ''; })]);
  }
  return rows;
}

export function exportCSV(kind: 'table' | 'sheet') {
  let rows: (string | number)[][];
  if (kind === 'table') rows = tableRows();
  else {
    const sheet = useStore.getState().sheet;
    let maxR = 0, maxC = 0;
    for (const k of Object.keys(sheet)) {
      const m = /^([A-Z])(\d+)$/.exec(k);
      if (m) { maxC = Math.max(maxC, m[1].charCodeAt(0) - 64); maxR = Math.max(maxR, +m[2]); }
    }
    rows = Array.from({ length: maxR }, (_, r) => Array.from({ length: maxC }, (_, c) => sheet[`${colName(c)}${r + 1}`] ?? ''));
  }
  download(new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' }), `${baseName()}-${kind}.csv`);
}

export function shareLink() {
  const st = useStore.getState();
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(st.toFile()))));
  const url = `${location.origin}${location.pathname}#p=${data}`;
  navigator.clipboard?.writeText(url).then(() => st.notify('linkCopied'), () => st.notify('linkFailed'));
}

export function loadFromHash(): boolean {
  const m = /#p=(.+)$/.exec(location.hash);
  if (!m) return false;
  try {
    const p = JSON.parse(decodeURIComponent(escape(atob(m[1])))) as ProjectFile;
    if (p.app === 'matharium') { useStore.getState().load(p, 'Shared'); history.replaceState(null, '', location.pathname); return true; }
  } catch { /* ignore */ }
  return false;
}

const AUTOSAVE = 'matharium.autosave';
export function startAutosave() {
  const fromHash = loadFromHash();
  try {
    const raw = localStorage.getItem(AUTOSAVE);
    if (raw && !fromHash) {
      const { project, fileName } = JSON.parse(raw);
      if (project?.app === 'matharium') useStore.getState().load(project, fileName);
    }
    const lang = localStorage.getItem('matharium.lang');
    if (lang === 'ar' || lang === 'en') useStore.getState().setSettings({ lang });
  } catch { /* storage unavailable */ }
  let t: number | undefined;
  useStore.subscribe((s, prev) => {
    if (s.settings.lang !== prev.settings.lang) try { localStorage.setItem('matharium.lang', s.settings.lang); } catch { /* ignore */ }
    if (s.objects === prev.objects && s.sheet === prev.sheet && s.view === prev.view && s.mode === prev.mode && s.settings === prev.settings) return;
    clearTimeout(t);
    t = window.setTimeout(() => {
      try { localStorage.setItem(AUTOSAVE, JSON.stringify({ project: s.toFile(), fileName: s.fileName })); } catch { /* ignore */ }
    }, 600);
  });
}
