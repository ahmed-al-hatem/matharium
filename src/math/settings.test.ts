import { describe, expect, it } from 'vitest';
import { evaluateAll, type EvalOptions } from './engine';
import { evalSheet } from './sheet';
import { fmt } from './solve';
import type { MObj } from './types';
import { DEFAULT_SETTINGS, labelDefault, migrateSettings, useStore, type ProjectFile } from '../store/project';

let id = 0;
const o = (input: string, name = `o${id}`): MObj => ({ id: String(id++), name, input, color: '#fff', visible: true });
const num = (input: string, opts: EvalOptions = {}) => {
  const r = evaluateAll([o(input)], 4, {}, opts)[0];
  return r.value?.type === 'number' ? r.value.value : NaN;
};
const deg = { angle: 'deg' } as const;

describe('angle unit', () => {
  it('evaluates trig functions in degrees', () => {
    expect(num('sin(30)', deg)).toBe(0.5);
    expect(num('cos(60)', deg)).toBe(0.5);
    expect(num('tan(45)', deg)).toBe(1);
    expect(num('sin(180)', deg)).toBe(0);
    expect(num('cos(90)', deg)).toBe(0);
    expect(num('sec(60)', deg)).toBe(2);
    expect(num('sin(20)', deg)).toBeCloseTo(Math.sin(Math.PI / 9), 12);
    expect(num('tan(90)', deg)).toBeNaN();
  });
  it('returns degrees from inverse trig functions', () => {
    expect(num('asin(0.5)', deg)).toBeCloseTo(30, 12);
    expect(num('arcsin(1)', deg)).toBeCloseTo(90, 12);
    expect(num('acos(0)', deg)).toBeCloseTo(90, 12);
    expect(num('atan(1)', deg)).toBeCloseTo(45, 12);
    expect(num('atan2(1, -1)', deg)).toBeCloseTo(135, 12);
  });
  it('leaves radian mode unchanged', () => {
    expect(num('sin(pi / 6)')).toBeCloseTo(0.5, 12);
    expect(num('asin(1)')).toBeCloseTo(Math.PI / 2, 12);
    // and a degree run does not leak into the next radian run
    num('sin(30)', deg);
    expect(num('sin(30)')).toBeCloseTo(Math.sin(30), 12);
  });
  it('applies to plotted functions', () => {
    const f = evaluateAll([o('f(x) = sin(x)', 'f')], 4, {}, deg)[0].value as { f: (x: number) => number };
    expect(f.f(90)).toBe(1);
  });
  it('shows and stores angles in the chosen unit', () => {
    const objs = [o('A = (1, 0)', 'A'), o('B = (0, 0)', 'B'), o('C = (0, 1)', 'C'), o('Angle(A, B, C)', 'α'), o('sin(α)', 's')];
    const inDeg = evaluateAll(objs, 4, {}, deg);
    expect(inDeg[3].display).toBe('= 90°');
    expect((inDeg[4].value as { value: number }).value).toBe(1);
    const inRad = evaluateAll(objs, 4, {}, { angle: 'rad' });
    expect(inRad[3].display).toBe('= 1.5708 rad');
    expect((inRad[4].value as { value: number }).value).toBeCloseTo(1, 12);
  });
  it('rotates by degrees', () => {
    const r = evaluateAll([o('A = (1, 0)', 'A'), o('Rotate(A, 90)', 'B')], 4, {}, deg)[1];
    expect(r.display).toBe('(0, 1)');
  });
  it('applies to spreadsheet formulas', () => {
    expect(evalSheet({ A1: '=sin(30)' }, {}, 'deg').A1.v).toBe(0.5);
    expect(evalSheet({ A1: '=sin(30)' }, {}).A1.v).toBeCloseTo(Math.sin(30), 12);
  });
});

describe('rounding', () => {
  it('formats significant figures', () => {
    expect(fmt(Math.PI, 3, true)).toBe('3.14');
    expect(fmt(123456, 2, true)).toBe('120000');
    expect(fmt(0.000123456, 2, true)).toBe('0.00012');
    expect(fmt(Math.PI, 3)).toBe('3.142');
  });
  it('uses significant figures in object values', () => {
    expect(evaluateAll([o('Distance((0,0), (1000, 1))')], 3, {}, { sigFigs: true })[0].display).toBe('= 1000');
    expect(evaluateAll([o('Distance((0,0), (1,1))')], 3, {}, { sigFigs: true })[0].display).toBe('= 1.41');
  });
});

describe('settings in project files', () => {
  it('migrates version 1 settings', () => {
    const s = migrateSettings({ grid: false, axes: true, labels: false, snap: true, digits: 2, range3d: 8, lang: 'ar' });
    expect(s).toMatchObject({ grid: false, axes: true, labels: 'none', digits: 2, range3d: 8, axes3d: true, grid3d: false, angle: 'rad', sigFigs: false });
    expect('lang' in s).toBe(false);
    expect(migrateSettings({ labels: true }).labels).toBe('all');
    expect(migrateSettings(undefined)).toMatchObject({ labels: 'auto', fontSize: 14 });
  });
  it('opens a version 1 file, keeps the device language and saves version 2 without it', () => {
    const st = useStore.getState();
    st.setSettings({ lang: 'ar' });
    const v1 = {
      app: 'matharium', version: 1, mode: 'graphing', view: { ox: 0, oy: 0, sx: 50, sy: 50 },
      settings: { grid: true, axes: true, labels: true, snap: true, digits: 3, range3d: 6, lang: 'en' },
      objects: [o('f(x) = x^2', 'f')], sheet: {}, table: { ids: [], start: -5, end: 5, step: 1 },
    } as unknown as ProjectFile;
    st.load(v1);
    const s = useStore.getState().settings;
    expect(s).toMatchObject({ lang: 'ar', labels: 'all', digits: 3, angle: 'rad' });
    const out = useStore.getState().toFile();
    expect(out.version).toBe(2);
    expect('lang' in out.settings).toBe(false);
    st.setSettings({ lang: 'en' });
  });
  it('opens settings on the tab of the current mode', () => {
    const st = useStore.getState();
    st.openSettings();
    expect(useStore.getState().settingsTab).toBe('graphics');
    st.openSettings('general');
    expect(useStore.getState().settingsTab).toBe('general');
    st.closeSettings();
    st.setMode('3d');
    st.openSettings();
    expect(useStore.getState().settingsTab).toBe('3d');
    st.closeSettings();
    st.setMode('graphing');
  });
  it('labels by the automatic rule', () => {
    const s = { ...DEFAULT_SETTINGS };
    expect(labelDefault(s, 'graphing', true)).toBe(true);
    expect(labelDefault(s, 'graphing', false)).toBe(false);
    expect(labelDefault(s, 'geometry', false)).toBe(true);
    expect(labelDefault({ labels: 'none' }, 'geometry', true)).toBe(false);
    expect(labelDefault({ labels: 'points' }, 'geometry', false)).toBe(false);
  });
});
