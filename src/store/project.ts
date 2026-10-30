import { create } from 'zustand';
import { categorize, splitDefinition } from '../math/parser';
import { missingSymbols } from '../math/engine';
import type { MObj } from '../math/types';

export const PALETTE = ['#E45B45', '#6DC4AA', '#E1B549', '#3282F6'];
export const EXTRA_COLORS = ['#DCDCDC', '#B07CE8', '#E87CB0', '#8FCB5A'];

export type Mode = 'graphing' | 'geometry' | '3d';
export type Panel = 'algebra' | 'tools' | 'table' | 'spreadsheet';
export type ToolId =
  | 'move' | 'point' | 'pointOn' | 'segment' | 'line' | 'ray' | 'vector' | 'polygon' | 'circle' | 'circle3'
  | 'midpoint' | 'perpendicular' | 'parallel' | 'bisector' | 'intersect' | 'tangent'
  | 'distance' | 'angle' | 'slider' | 'delete';

export interface View { ox: number; oy: number; sx: number; sy: number }
export interface Settings {
  grid: boolean; axes: boolean; labels: boolean; snap: boolean; digits: number; range3d: number; lang: 'en' | 'ar';
}

interface Snapshot { objects: MObj[]; sheet: Record<string, string> }

/** What each mode (graphing / geometry / 3D) keeps for itself while another mode is open. */
export interface Workspace { objects: MObj[]; sheet: Record<string, string>; view: View; table: TableCfg }

export interface ProjectFile {
  app: 'matharium'; version: 1; mode: Mode; view: View; settings: Settings;
  objects: MObj[]; sheet: Record<string, string>; table: TableCfg;
  /** The other modes' workspaces (the current mode's lives in the fields above). */
  workspaces?: Partial<Record<Mode, Workspace>>;
}

export interface PwaState { canInstall: boolean; installed: boolean; ios: boolean; updateReady: boolean }

export interface TableCfg { ids: string[]; start: number; end: number; step: number }

export const DEFAULT_VIEW: View = { ox: 0, oy: 0, sx: 50, sy: 50 };
const DEFAULT_TABLE: TableCfg = { ids: [], start: -5, end: 5, step: 1 };

interface ParkedWorkspace extends Workspace { past: Snapshot[]; future: Snapshot[] }
const DEFAULT_SETTINGS: Settings = { grid: true, axes: true, labels: true, snap: true, digits: 4, range3d: 6, lang: 'en' };

interface State {
  mode: Mode;
  objects: MObj[];
  sheet: Record<string, string>;
  view: View;
  settings: Settings;
  panel: Panel | null;
  tool: ToolId;
  selectedId: string | null;
  editingId: string | null;
  keyboardOpen: boolean;
  settingsOpen: boolean;
  table: TableCfg;
  past: Snapshot[];
  future: Snapshot[];
  fileName: string;
  dirty: boolean;
  homeToken: number;
  toast: string | null;
  pwa: PwaState;
  workspaces: Partial<Record<Mode, ParkedWorkspace>>;

  setMode(m: Mode): void;
  setPanel(p: Panel | null): void;
  setTool(t: ToolId): void;
  select(id: string | null): void;
  setEditing(id: string | null): void;
  setView(v: Partial<View>): void;
  resetView(): void;
  zoom(f: number): void;
  setSettings(s: Partial<Settings>): void;
  setKeyboard(open: boolean): void;
  setSettingsOpen(open: boolean): void;
  setTable(t: Partial<TableCfg>): void;
  notify(msg: string): void;
  setPwa(p: Partial<PwaState>): void;

  /** Add an object from user input; returns its name. */
  addObject(input: string, opts?: Partial<MObj>): string;
  updateInput(id: string, input: string): void;
  /** Change without a history entry (dragging, slider animation); call commit() afterwards. */
  liveUpdate(id: string, patch: Partial<MObj>): void;
  patchObject(id: string, patch: Partial<MObj>): void;
  removeObject(id: string): void;
  renameObject(id: string, name: string): void;
  setCell(ref: string, raw: string): void;
  setSheet(sheet: Record<string, string>): void;
  commit(): void;
  undo(): void;
  redo(): void;
  load(p: ProjectFile, fileName?: string): void;
  reset(): void;
  toFile(): ProjectFile;
  markSaved(name: string): void;
}

let idSeq = Date.now();
export const newId = () => (idSeq++).toString(36);

const RESERVED = new Set(['x', 'y', 'z', 't', 'e', 'i', 'pi']);
const SEQ: Record<string, string[]> = {
  function: ['f', 'g', 'h', 'p', 'q', 'r', 's', 'u', 'v', 'w', 'k'],
  path: ['f', 'g', 'h', 'p', 'q', 'r', 's', 'u', 'v', 'w', 'k'],
  number: ['a', 'b', 'c', 'd', 'k', 'm', 'n'],
  point: 'ABCDEFGHIJKLMNOPQRSTUVWZ'.split(''),
  surface: ['f', 'g', 'h', 'p', 'q', 'r'],
};

export function freeName(objects: MObj[], input: string): string {
  const used = new Set(objects.map((o) => o.name));
  const cat = categorize(input);
  const take = (base: string[]) => {
    for (let n = 0; ; n++) for (const b of base) {
      const name = n ? `${b}${n}` : b;
      if (!used.has(name) && !RESERVED.has(name)) return name;
    }
  };
  const numbered = (p: string) => { for (let n = 1; ; n++) if (!used.has(p + n)) return p + n; };
  if (cat === 'equation') return numbered('eq');
  if (cat === 'list' || cat === 'text') return numbered('l');
  return take(SEQ[cat] ?? SEQ.function);
}

function nextColor(objects: MObj[], input: string) {
  const cat = categorize(input);
  if (cat === 'point' || cat === 'number') return '#3282F6';
  const n = objects.filter((o) => !['point', 'number'].includes(categorize(o.input))).length;
  return PALETTE[n % PALETTE.length];
}

const snap = (s: State): Snapshot => ({ objects: s.objects, sheet: s.sheet });

export const useStore = create<State>((set, get) => {
  const record = (patch: Partial<State>) => {
    const s = get();
    set({ ...patch, past: [...s.past.slice(-99), snap(s)], future: [], dirty: true });
  };

  return {
    mode: 'graphing',
    objects: [],
    sheet: {},
    view: { ...DEFAULT_VIEW },
    settings: { ...DEFAULT_SETTINGS },
    panel: 'algebra',
    tool: 'move',
    selectedId: null,
    editingId: null,
    keyboardOpen: false,
    settingsOpen: false,
    table: { ...DEFAULT_TABLE },
    past: [],
    future: [],
    fileName: 'Untitled',
    dirty: false,
    homeToken: 0,
    toast: null,
    pwa: { canInstall: false, installed: false, ios: false, updateReady: false },
    workspaces: {},

    setMode(mode) {
      const s = get();
      if (mode === s.mode) return;
      // each mode has its own objects, sheet, view and history; park the current one and bring back the target's
      const parked: ParkedWorkspace = { objects: s.objects, sheet: s.sheet, view: s.view, table: s.table, past: s.past, future: s.future };
      const next = s.workspaces[mode] ?? { objects: [], sheet: {}, view: { ...DEFAULT_VIEW }, table: { ...DEFAULT_TABLE }, past: [], future: [] };
      const workspaces = { ...s.workspaces, [s.mode]: parked };
      delete workspaces[mode];
      set({
        mode,
        workspaces,
        ...next,
        selectedId: null,
        editingId: null,
        tool: 'move',
        panel: mode === 'geometry' ? 'tools' : s.panel === 'table' || s.panel === 'spreadsheet' ? (mode === '3d' ? 'algebra' : s.panel) : s.panel ?? 'algebra',
        settings: { ...s.settings, grid: mode !== 'geometry', axes: mode !== 'geometry' },
      });
    },
    setPanel: (panel) => set({ panel }),
    setTool: (tool) => set({ tool }),
    select: (selectedId) => set({ selectedId }),
    setEditing: (editingId) => set({ editingId }),
    setView: (v) => set({ view: { ...get().view, ...v } }),
    resetView: () => set({ view: { ...DEFAULT_VIEW }, homeToken: get().homeToken + 1 }),
    zoom(f) {
      const v = get().view;
      set({ view: { ...v, sx: v.sx * f, sy: v.sy * f } });
    },
    setSettings: (p) => set({ settings: { ...get().settings, ...p } }),
    setKeyboard: (keyboardOpen) => set({ keyboardOpen }),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    setTable: (t) => set({ table: { ...get().table, ...t }, dirty: true }),
    notify(toast) {
      set({ toast });
      setTimeout(() => get().toast === toast && set({ toast: null }), 2600);
    },

    setPwa: (p) => set({ pwa: { ...get().pwa, ...p } }),

    addObject(input, opts = {}) {
      const s = get();
      const def = splitDefinition(input);
      let objects = s.objects;
      if (def.name) {
        const existing = objects.find((o) => o.name === def.name);
        if (existing) {
          // redefining an existing name updates it (and says so, since the old definition is gone)
          get().updateInput(existing.id, input);
          get().notify('redefined');
          return def.name;
        }
      }
      const sliders: MObj[] = missingSymbols(input, objects).map((sym) => ({
        id: newId(), name: sym, input: `${sym} = 1`, color: '#3282F6', visible: true, slider: { min: -5, max: 5, step: 0.1 },
      }));
      objects = [...objects, ...sliders];
      const name = def.name ?? freeName(objects, input);
      const isSliderDef = !!def.name && !def.params && /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(def.body);
      const obj: MObj = {
        id: newId(), name, input: input.trim(), color: nextColor(objects, input), visible: true,
        slider: isSliderDef ? { min: Math.min(-5, +def.body * 2), max: Math.max(5, +def.body * 2), step: 0.1 } : undefined,
        ...opts,
      };
      record({ objects: [...objects, obj] });
      return name;
    },
    updateInput(id, input) {
      const s = get();
      const def = splitDefinition(input);
      const sliders: MObj[] = missingSymbols(input, s.objects.filter((o) => o.id !== id)).map((sym) => ({
        id: newId(), name: sym, input: `${sym} = 1`, color: '#3282F6', visible: true, slider: { min: -5, max: 5, step: 0.1 },
      }));
      record({
        objects: [...sliders, ...s.objects.map((o) => (o.id === id ? { ...o, input: input.trim(), name: def.name ?? o.name } : o))],
      });
    },
    liveUpdate(id, patch) {
      set({ objects: get().objects.map((o) => (o.id === id ? { ...o, ...patch } : o)), dirty: true });
    },
    patchObject(id, patch) {
      record({ objects: get().objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
    },
    removeObject(id) {
      const s = get();
      record({ objects: s.objects.filter((o) => o.id !== id), selectedId: s.selectedId === id ? null : s.selectedId });
    },
    renameObject(id, name) {
      const s = get();
      const o = s.objects.find((x) => x.id === id);
      if (!o || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || s.objects.some((x) => x.name === name)) return;
      const def = splitDefinition(o.input);
      const input = def.name ? o.input.replace(/^\s*[A-Za-z][A-Za-z0-9_]*/, name) : o.input;
      // update references in other objects
      const re = new RegExp(`\\b${o.name}\\b`, 'g');
      record({
        objects: s.objects.map((x) => (x.id === id ? { ...x, name, input } : { ...x, input: x.input.replace(re, name) })),
      });
    },
    setCell(ref, raw) {
      const sheet = { ...get().sheet };
      if (raw.trim()) sheet[ref] = raw; else delete sheet[ref];
      record({ sheet });
    },
    setSheet(sheet) { record({ sheet }); },
    commit() {
      // the live state is already applied; just push the pre-drag snapshot captured by beginLive
      const s = get();
      if (liveStart) {
        set({ past: [...s.past.slice(-99), liveStart], future: [], dirty: true });
        liveStart = null;
      }
    },
    undo() {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      set({ ...prev, past: s.past.slice(0, -1), future: [snap(s), ...s.future], dirty: true });
    },
    redo() {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({ ...next, future: s.future.slice(1), past: [...s.past, snap(s)], dirty: true });
    },
    load(p, fileName) {
      set({
        mode: p.mode ?? 'graphing',
        objects: p.objects ?? [],
        sheet: p.sheet ?? {},
        view: p.view ?? { ...DEFAULT_VIEW },
        settings: { ...DEFAULT_SETTINGS, ...p.settings, lang: get().settings.lang },
        table: p.table ?? get().table,
        workspaces: Object.fromEntries(Object.entries(p.workspaces ?? {})
          .filter(([m]) => m !== (p.mode ?? 'graphing'))
          .map(([m, w]) => [m, { ...w, past: [], future: [] }])),
        past: [], future: [], dirty: false, selectedId: null, editingId: null,
        fileName: fileName ?? get().fileName,
        homeToken: get().homeToken + 1,
      });
    },
    reset() {
      set({
        objects: [], sheet: {}, view: { ...DEFAULT_VIEW }, past: [], future: [], dirty: false,
        selectedId: null, editingId: null, fileName: 'Untitled', table: { ...DEFAULT_TABLE }, workspaces: {},
        homeToken: get().homeToken + 1,
      });
    },
    toFile() {
      const s = get();
      const workspaces = Object.fromEntries(Object.entries(s.workspaces)
        .filter(([, w]) => w.objects.length || Object.keys(w.sheet).length)
        .map(([m, w]) => [m, { objects: w.objects, sheet: w.sheet, view: w.view, table: w.table }]));
      return {
        app: 'matharium', version: 1, mode: s.mode, view: s.view, settings: s.settings, objects: s.objects, sheet: s.sheet, table: s.table,
        ...(Object.keys(workspaces).length ? { workspaces } : {}),
      };
    },
    markSaved(fileName) { set({ fileName, dirty: false }); },
  };
});

let liveStart: Snapshot | null = null;
/** Remember the state before a drag / animation so it becomes one undo step. */
export function beginLive() {
  if (!liveStart) liveStart = snap(useStore.getState());
}
