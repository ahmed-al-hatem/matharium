import { useState } from 'react';
import { EXTRA_COLORS, GRID_TYPES, labelDefault, PALETTE, PROJECTIONS, useStore } from '../store/project';
import { ANIM_MODES, SPEEDS } from '../store/animate';
import { asPolar, splitDefinition } from '../math/parser';
import { pointCoords } from '../math/polar';
import { roundAt, textInput } from '../math/annotate';
import { shown, type MObj, type Resolved } from '../math/types';
import { fitView, Viewport } from '../graph2d/viewport';
import { exportPNG } from '../io/fileio';
import { translate } from '../i18n/i18n';
import { Icon } from './Icons';
import type { MenuBuilder, MenuEntry } from './ContextMenu';

const tr = (key: string) => translate(useStore.getState().settings.lang, key);
const GRID_ICONS = { majorMinor: Icon.gridMajorMinor, major: Icon.gridMajor, polar: Icon.gridPolar, isometric: Icon.gridIsometric, dots: Icon.gridDots };
const PROJ_ICONS = { perspective: Icon.projPerspective, orthographic: Icon.projOrthographic, oblique: Icon.projOblique, anaglyph: Icon.projAnaglyph };
const OBJ_TYPES = ['function', 'point', 'points', 'segment', 'line', 'ray', 'vector', 'circle', 'polygon', 'angle', 'number', 'curve', 'implicit', 'label', 'stroke', 'integral', 'surface', 'point3d'];

/** The 2D graph: what to show, the grid type and the view. W×H is the canvas size. */
export const graph2dMenu = (W: number, H: number): MenuBuilder => ({ items }) => {
  const st = useStore.getState(), s = st.settings;
  return [
    { kind: 'header', title: tr('ctx.graphics') },
    { kind: 'check', label: tr('axes'), checked: s.axes, onToggle: () => st.setSettings({ axes: !s.axes }) },
    { kind: 'check', label: tr('grid'), checked: s.grid, onToggle: () => st.setSettings({ grid: !s.grid }) },
    {
      kind: 'icons', label: tr('gridType'), onPick: (g) => st.setSettings({ gridType: g as typeof s.gridType, grid: true }),
      options: GRID_TYPES.map((g) => ({ id: g, label: tr(`gridType.${g}`), icon: GRID_ICONS[g], selected: s.grid && s.gridType === g })),
    },
    { kind: 'sep' },
    { kind: 'item', label: tr('home'), icon: Icon.home, onSelect: () => st.resetView() },
    {
      kind: 'item', label: tr('showAll'), icon: Icon.fit,
      onSelect: () => {
        const v = fitView(items.filter((r) => shown(r) && r.value).map((r) => r.value!), st.view, W, H);
        if (v) st.setView(v);
      },
    },
    { kind: 'item', label: tr('ratio11'), icon: Icon.ratio, onSelect: () => st.setView({ sy: st.view.sx }) },
    { kind: 'item', label: tr('snapshot'), icon: Icon.camera, onSelect: exportPNG },
    { kind: 'sep' },
    { kind: 'item', label: tr('openSettings'), icon: Icon.gear, onSelect: () => st.openSettings('graphics') },
  ];
};

export const graph3dMenu: MenuBuilder = () => {
  const st = useStore.getState(), s = st.settings;
  return [
    { kind: 'header', title: tr('ctx.graphics3d') },
    { kind: 'check', label: tr('axes'), checked: s.axes3d, onToggle: () => st.setSettings({ axes3d: !s.axes3d }) },
    { kind: 'check', label: tr('plane'), checked: s.plane3d, onToggle: () => st.setSettings({ plane3d: !s.plane3d }) },
    { kind: 'check', label: tr('grid'), checked: s.grid3d, onToggle: () => st.setSettings({ grid3d: !s.grid3d }) },
    {
      kind: 'icons', label: tr('projection'), onPick: (p) => st.setSettings({ projection: p as typeof s.projection }),
      options: PROJECTIONS.map((p) => ({ id: p, label: tr(`proj.${p}`), icon: PROJ_ICONS[p], selected: s.projection === p })),
    },
    { kind: 'sep' },
    { kind: 'item', label: tr('home'), icon: Icon.home, onSelect: () => st.resetView() },
    { kind: 'check', label: tr('autoRotate'), checked: st.autoRotate, onToggle: () => st.setAutoRotate(!st.autoRotate) },
    { kind: 'sep' },
    { kind: 'item', label: tr('openSettings'), icon: Icon.gear, onSelect: () => st.openSettings('3d') },
  ];
};

/** Switch a text between following the graph and staying fixed on screen, keeping where it appears. */
export function pinLabel(r: Resolved) {
  const v = r.value;
  const el = document.querySelector('.canvas-wrap');
  if (v?.type !== 'label' || !el) return;
  const st = useStore.getState();
  const vp = new Viewport(st.view, el.clientWidth, el.clientHeight);
  const p = v.screen
    ? { x: roundAt(vp.wx(v.p.x), st.view.sx), y: roundAt(vp.wy(v.p.y), st.view.sy) }
    : { x: Math.round(vp.px(v.p.x)), y: Math.round(vp.py(v.p.y)) };
  st.updateInput(r.obj.id, textInput(v.text, p, !v.screen, splitDefinition(r.obj.input).name));
}

function SliderSettings({ obj }: { obj: MObj }) {
  const st = useStore.getState();
  const s = obj.slider!;
  const [range, setRange] = useState({ min: s.min, max: s.max, step: s.step });
  const save = () => range.max > range.min && range.step > 0 && st.patchObject(obj.id, { slider: { ...obj.slider!, ...range } });
  return (
    <div className="range-edit">
      {(['min', 'max', 'step'] as const).map((k) => (
        <label key={k}>{tr(k)}
          <input type="number" value={range[k]} step="any" onChange={(e) => setRange({ ...range, [k]: +e.target.value })}
            onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} />
        </label>
      ))}
      <label>{tr('speed')}
        <select value={s.speed ?? 1} aria-label={tr('speed')} onChange={(e) => st.patchObject(obj.id, { slider: { ...obj.slider!, speed: +e.target.value } })}>
          {SPEEDS.map((v) => <option key={v} value={v}>×{v}</option>)}
        </select>
      </label>
      <label className="wide">{tr('animMode')}
        <select value={s.mode ?? 'oscillate'} aria-label={tr('animMode')}
          onChange={(e) => st.patchObject(obj.id, { slider: { ...obj.slider!, mode: e.target.value as typeof ANIM_MODES[number] } })}>
          {ANIM_MODES.map((m) => <option key={m} value={m}>{tr(`anim.${m}`)}</option>)}
        </select>
      </label>
    </div>
  );
}

/** One object, opened from the graph or from its algebra row. */
export const objectMenu = (id: string): MenuBuilder => ({ items }) => {
  const st = useStore.getState();
  const r = items.find((x) => x.obj.id === id);
  if (!r) return [];
  const { obj, value: v } = r;
  const name = splitDefinition(obj.input).name ?? obj.name;
  const isPoint = v?.type === 'point' || v?.type === 'point3d';
  const kind = obj.slider ? 'slider' : v && OBJ_TYPES.includes(v.type) ? v.type : 'object';
  const labelled = obj.showLabel ?? labelDefault(st.settings, st.mode, isPoint);
  const out: MenuEntry[] = [
    { kind: 'header', title: obj.name, subtitle: tr(`obj.${kind}`) },
    { kind: 'check', label: tr('showObject'), checked: obj.visible, onToggle: () => st.patchObject(obj.id, { visible: !obj.visible }) },
    { kind: 'check', label: tr('showLabel'), checked: labelled, onToggle: () => st.patchObject(obj.id, { showLabel: !labelled }) },
  ];
  if (isPoint) {
    out.push({ kind: 'check', label: tr('trace'), checked: !!obj.trace, onToggle: () => { if (obj.trace) st.clearTrace(obj.id); st.patchObject(obj.id, { trace: !obj.trace }); } });
    if (obj.trace) out.push({ kind: 'item', label: tr('clearTrace'), icon: Icon.eraser, onSelect: () => st.clearTrace(obj.id) });
  }
  out.push(
    { kind: 'check', label: tr('fixObject'), checked: !!obj.fixed, onToggle: () => st.patchObject(obj.id, { fixed: !obj.fixed }) },
    {
      kind: 'icons', label: tr('color'), onPick: (c) => st.patchObject(obj.id, { color: c }),
      options: [...PALETTE, ...EXTRA_COLORS].map((c) => ({ id: c, label: c, color: c, selected: c.toLowerCase() === obj.color.toLowerCase() })),
    },
  );

  // what only this kind of object can do
  const special: MenuEntry[] = [];
  if (v?.type === 'function') {
    special.push(
      { kind: 'item', label: tr('tableOfValues'), icon: Icon.table, onSelect: () => {
        const ids = st.table.ids.filter((x) => st.objects.some((o) => o.id === x));
        st.setTable({ ids: ids.includes(obj.id) ? ids : [...ids, obj.id] });
        st.setPanel('table');
      } },
      { kind: 'item', label: tr('derivative'), icon: Icon.graph, onSelect: () => st.addObject(`Derivative(${name})`) },
      { kind: 'item', label: tr('roots'), icon: Icon.plus, onSelect: () => st.addObject(`Roots(${name})`) },
    );
  }
  if (v?.type === 'point' && v.free && !v.on && st.mode !== '3d') {
    const polar = !!asPolar(splitDefinition(obj.input).body);
    const p = { x: +v.p.x.toFixed(4), y: +v.p.y.toFixed(4) };
    special.push({ kind: 'check', label: tr('polarCoords'), checked: polar, onToggle: () => st.updateInput(obj.id, `${splitDefinition(obj.input).name ? `${name} = ` : ''}${pointCoords(p, !polar)}`) });
  }
  if (obj.slider) {
    const playing = st.playing.includes(obj.id);
    special.push(
      { kind: 'check', label: tr('play'), checked: playing, onToggle: () => st.togglePlay(obj.id) },
      { kind: 'custom', render: () => <SliderSettings obj={obj} /> },
    );
  }
  if (v?.type === 'label' && st.mode !== '3d') special.push({ kind: 'item', label: tr(v.screen ? 'pinGraph' : 'pinScreen'), icon: Icon.label, onSelect: () => pinLabel(r) });
  if (special.length) out.push({ kind: 'sep' }, ...special);

  out.push(
    { kind: 'sep' },
    { kind: 'item', label: tr('rename'), icon: Icon.file, onSelect: () => { const n = prompt(tr('rename'), obj.name); if (n) st.renameObject(obj.id, n.trim()); } },
    { kind: 'item', label: tr('duplicate'), icon: Icon.copy, onSelect: () => { const def = splitDefinition(obj.input); st.addObject(def.name ? def.body : obj.input, { color: obj.color, slider: obj.slider }); } },
    { kind: 'item', label: tr('copyDef'), icon: Icon.copy, onSelect: () => { navigator.clipboard?.writeText(obj.input).then(() => st.notify('copied'), () => {}); } },
    { kind: 'item', label: tr('delete'), icon: Icon.trash, danger: true, onSelect: () => st.removeObject(obj.id) },
  );
  out.push({ kind: 'sep' }, { kind: 'item', label: `${tr('settings')}…`, icon: Icon.gear, onSelect: () => st.openProperties([obj.id]) });
  return out;
};

export interface SheetActions {
  cut(): void; copy(): void; paste(): void; clear(): void;
  insertRow(below: boolean): void; insertCol(after: boolean): void; deleteRow(): void; deleteCol(): void;
  makePoints(): void; regression(kind: string): void; fits: string[];
}

export const sheetMenu = (a: SheetActions): MenuBuilder => () => [
  { kind: 'item', label: tr('sheet.cut'), icon: Icon.cut, onSelect: a.cut },
  { kind: 'item', label: tr('sheet.copy'), icon: Icon.copy, onSelect: a.copy },
  { kind: 'item', label: tr('sheet.paste'), icon: Icon.paste, onSelect: a.paste },
  { kind: 'item', label: tr('sheet.clear'), icon: Icon.eraser, onSelect: a.clear },
  { kind: 'sep' },
  { kind: 'item', label: tr('sheet.rowAbove'), icon: Icon.rowAdd, onSelect: () => a.insertRow(false) },
  { kind: 'item', label: tr('sheet.rowBelow'), icon: Icon.rowAdd, onSelect: () => a.insertRow(true) },
  { kind: 'item', label: tr('sheet.colBefore'), icon: Icon.colAdd, onSelect: () => a.insertCol(false) },
  { kind: 'item', label: tr('sheet.colAfter'), icon: Icon.colAdd, onSelect: () => a.insertCol(true) },
  { kind: 'item', label: tr('sheet.rowDelete'), icon: Icon.rowDel, onSelect: a.deleteRow },
  { kind: 'item', label: tr('sheet.colDelete'), icon: Icon.colDel, onSelect: a.deleteCol },
  { kind: 'sep' },
  { kind: 'item', label: tr('sheet.makePoints'), icon: Icon.graph, onSelect: a.makePoints },
  { kind: 'submenu', label: tr('sheet.fit'), icon: Icon.graph, items: a.fits.map((k) => ({ kind: 'item', label: tr(`fit.${k}`), onSelect: () => a.regression(k) })) },
];
