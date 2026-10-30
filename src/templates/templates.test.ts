import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '.';
import { evaluateAll } from '../math/engine';

describe('lesson templates', () => {
  it('there are at least ten, covering every mode', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TEMPLATES.map((t) => t.project.mode))).toEqual(new Set(['graphing', 'geometry', '3d']));
  });

  for (const { id, project: p } of TEMPLATES) {
    it(`${id} is a valid project with a title and description in English and Arabic`, () => {
      expect(p.app).toBe('matharium');
      expect(['graphing', 'geometry', '3d']).toContain(p.mode);
      for (const lang of ['en', 'ar'] as const) {
        expect(p.meta?.title[lang]).toBeTruthy();
        expect(p.meta?.description[lang]).toBeTruthy();
      }
      expect(p.meta!.title.ar).toMatch(/[؀-ۿ]/);
      expect(new Set(p.objects.map((o) => o.id)).size).toBe(p.objects.length);
    });

    it(`${id} evaluates without errors`, () => {
      const res = evaluateAll(p.objects);
      for (const r of res) expect(r.error, `${r.obj.name}: ${r.obj.input}`).toBeUndefined();
      expect(res.every((r) => r.value)).toBe(true);
      // sliders are recognised as sliders
      for (const r of res.filter((x) => x.obj.slider)) expect(r.value).toMatchObject({ type: 'number', slider: true });
    });
  }
});
