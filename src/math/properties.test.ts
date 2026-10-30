import { describe, expect, it } from 'vitest';
import { evaluateAll } from './engine';
import { labelText, shown, type MObj } from './types';
import { draw } from '../graph2d/renderer';
import { SvgCtx } from '../graph2d/svgctx';
import { DEFAULT_SETTINGS, FILE_VERSION, migrateObjects, migrateSettings, useStore, type ProjectFile } from '../store/project';

let id = 0;
const o = (input: string, name: string, extra: Partial<MObj> = {}): MObj => ({ id: String(id++), name, input, color: '#E45B45', visible: true, ...extra });
const byName = (objs: MObj[]) => Object.fromEntries(evaluateAll(objs).map((r) => [r.obj.name, r]));

const svgOf = (objs: MObj[]) => {
  const ctx = new SvgCtx(400, 300);
  draw(ctx, evaluateAll(objs), { W: 400, H: 300, view: { ox: 0, oy: 0, sx: 40, sy: 40 }, selectedId: null, settings: { ...DEFAULT_SETTINGS, axes: false, grid: false } });
  return ctx.toString();
};

describe('show-if condition', () => {
  const scene = (a: number, cond: string) => byName([o(`a = ${a}`, 'a'), o('f(x) = x^2', 'f', { showIf: cond })]);
  it('hides the object while the condition is false', () => {
    expect(shown(scene(1, 'a > 2').f)).toBe(false);
    expect(shown(scene(3, 'a > 2').f)).toBe(true);
    expect(shown(scene(3, 'a > 2 and a < 5').f)).toBe(true);
    expect(shown(scene(6, 'a > 2 and a < 5').f)).toBe(false);
  });
  it('keeps the object shown when the condition is invalid, and says why', () => {
    const r = scene(1, 'a >').f;
    expect(shown(r)).toBe(true);
    expect(r.showIfError).toBeTruthy();
  });
  it('is not drawn when hidden', () => {
    const objs = (a: number) => [o(`a = ${a}`, 'a'), o('f(x) = x', 'f', { showIf: 'a > 2', color: '#123456' })];
    expect(svgOf(objs(1))).not.toContain('#123456');
    expect(svgOf(objs(3))).toContain('#123456');
  });
});

describe('per-object rounding and line equations', () => {
  it('rounds only the object that asks for it', () => {
    const r = byName([o('c = 1/3', 'c', { digits: 1 }), o('d = 1/3', 'd')]);
    expect(r.c.display).toBe('= 0.3');
    expect(r.d.display).toBe('= 0.3333');
  });
  it('writes a line in each equation form', () => {
    const pts = [o('A = (0, 1)', 'A'), o('B = (2, 2)', 'B')];
    const line = (eqForm?: MObj['eqForm']) => byName([...pts, o('Line(A, B)', 'g', { eqForm })]).g.display;
    expect(line()).toBe('y = 0.5x + 1');
    expect(line('explicit')).toBe('y = 0.5x + 1');
    expect(line('implicit')).toBe('x − 2y = −2');
    expect(line('parametric')).toBe('X = (0, 1) + λ(2, 1)');
    // lowest whole terms
    expect(byName([o('C = (1, 2)', 'C'), o('D = (-2, -1)', 'D'), o('Line(C, D)', 'h', { eqForm: 'implicit' })]).h.display).toBe('x − y = −1');
  });
});

describe('label text', () => {
  const r = byName([o('A = (1, 2)', 'A', { caption: 'start' }), o('Line((0, 1), (2, 2))', 'g')]);
  it('says the name, the value, both, or the caption', () => {
    expect(labelText(r.A)).toBe('A');
    expect(labelText({ ...r.A, obj: { ...r.A.obj, labelMode: 'nameValue' } })).toBe('A = (1, 2)');
    expect(labelText({ ...r.A, obj: { ...r.A.obj, labelMode: 'value' } })).toBe('(1, 2)');
    expect(labelText({ ...r.A, obj: { ...r.A.obj, labelMode: 'caption' } })).toBe('start');
    expect(labelText({ ...r.g, obj: { ...r.g.obj, labelMode: 'nameValue' } })).toBe('g: y = 0.5x + 1');
    const f = byName([o('f(x) = sin(x) + 1', 'f'), o('2x', 'h')]);
    expect(labelText({ ...f.f, obj: { ...f.f.obj, labelMode: 'nameValue' } })).toBe('f(x) = sin(x) + 1');
    expect(labelText({ ...f.f, obj: { ...f.f.obj, labelMode: 'value' } })).toBe('sin(x) + 1');
    expect(labelText({ ...f.h, obj: { ...f.h.obj, labelMode: 'nameValue' } })).toBe('h(x) = 2x');
  });
});

describe('style in the svg export', () => {
  it('dashes and dots lines', () => {
    expect(svgOf([o('f(x) = x', 'f')])).not.toContain('stroke-dasharray');
    expect(svgOf([o('f(x) = x', 'f', { lineStyle: 'dashed' })])).toContain('stroke-dasharray="10 6.25"');
    expect(svgOf([o('f(x) = x', 'f', { lineStyle: 'dotted', lineWidth: 2 })])).toContain('stroke-dasharray="0.1 4.4"');
  });
  it('fills with the object opacity', () => {
    const fills = (extra: Partial<MObj>) => svgOf([o('Polygon((0,0), (2,0), (0,2))', 'p', extra)]).match(/fill="#E45B45" opacity="([\d.]+)"/)?.[1];
    expect(fills({})).toBe('0.2');
    expect(fills({ opacity: 0.6 })).toBe('0.6');
    expect(svgOf([o('Polygon((0,0), (2,0), (0,2))', 'p', { opacity: 0 })])).not.toMatch(/<path[^>]*fill="#E45B45"[^>]*opacity="0.2"/);
  });
  it('draws higher layers on top', () => {
    const objs = (layer?: number) => [o('f(x) = x', 'f', { color: '#111111', layer }), o('g(x) = -x', 'g', { color: '#222222' })];
    const order = (svg: string) => svg.indexOf('#111111') < svg.indexOf('#222222');
    expect(order(svgOf(objs()))).toBe(true);
    expect(order(svgOf(objs(2)))).toBe(false);
  });
  it('draws each point style', () => {
    for (const pointStyle of ['dot', 'ring', 'cross', 'square', 'diamond'] as const) {
      const svg = svgOf([o('A = (1, 1)', 'A', { pointStyle, pointSize: 8 })]);
      expect(svg).toContain('#E45B45');
      expect(svg).not.toMatch(/NaN/);
    }
  });
});

describe('file version 5', () => {
  it('drops property values it does not know', () => {
    const [a] = migrateObjects([o('A = (1, 2)', 'A', {
      lineStyle: 'wavy' as never, pointStyle: 'star' as never, opacity: 3, layer: 12, digits: -1, eqForm: 'polar' as never, caption: 'kept', pointSize: 6,
    })]);
    expect(a).toMatchObject({ caption: 'kept', pointSize: 6 });
    for (const k of ['lineStyle', 'pointStyle', 'opacity', 'layer', 'digits', 'eqForm']) expect(k in a).toBe(false);
  });
  it('opens version 1 and 4 files and saves version 5 with the new properties', () => {
    const st = useStore.getState();
    const objects = [o('A = (1, 2)', 'A', { fixed: true }), o('f(x) = x^2', 'f')];
    for (const [version, settings] of [[1, { grid: true, axes: true, labels: true }], [4, migrateSettings(undefined)]] as const) {
      st.load({ app: 'matharium', version, mode: 'graphing', view: { ox: 0, oy: 0, sx: 40, sy: 40 }, settings, objects, sheet: {}, table: { ids: [], start: -5, end: 5, step: 1 } } as unknown as ProjectFile);
      const s = useStore.getState();
      expect(s.objects.map((x) => [x.name, x.input, x.fixed])).toEqual([['A', 'A = (1, 2)', true], ['f', 'f(x) = x^2', undefined]]);
      expect(evaluateAll(s.objects).every((r) => !r.error && shown(r))).toBe(true);
    }
    const s = useStore.getState();
    st.patchObjects(s.objects.map((x) => x.id), { lineStyle: 'dashed', showIf: 'true', layer: 3 });
    expect(useStore.getState().past.length).toBe(1);
    const out = useStore.getState().toFile();
    expect(out.version).toBe(FILE_VERSION);
    expect(FILE_VERSION).toBe(5);
    expect(out.objects.every((x) => x.lineStyle === 'dashed' && x.layer === 3)).toBe(true);
    st.undo();
    expect(useStore.getState().objects.some((x) => x.lineStyle)).toBe(false);
    st.reset();
  });
  it('closes the properties panel when its objects go away', () => {
    const st = useStore.getState();
    st.addObject('A = (1, 2)');
    const a = useStore.getState().objects[0].id;
    st.openProperties([a]);
    st.removeObject(a);
    expect(useStore.getState().propsIds).toBe(null);
    st.reset();
  });
});
