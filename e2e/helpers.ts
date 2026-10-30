import { test as base, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Fails a test on any page error or console error; starts every test with empty storage. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__e2e')) { localStorage.clear(); sessionStorage.setItem('__e2e', '1'); }
    });
    await use(page);
    expect(errors, 'console / page errors').toEqual([]);
  },
});
export { expect };

export async function open(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__matharium);
}

export async function addInput(page: Page, text: string) {
  const input = page.locator('.alg-input-row input');
  await input.fill(text);
  await input.press('Enter');
}

export interface Snap { objects: { id: string; name: string; input: string }[]; dirty: boolean; past: number; mode: string; sheet: Record<string, string> }
export function state(page: Page): Promise<Snap> {
  return page.evaluate(() => {
    const s = (window as any).__matharium.getState();
    return { objects: s.objects, dirty: s.dirty, past: s.past.length, mode: s.mode, sheet: s.sheet };
  });
}

export const inputOf = async (page: Page, name: string) => (await state(page)).objects.find((o) => o.name === name)?.input;

/** Page coordinates of a world point on the 2D canvas (same math as graph2d/viewport.ts). */
export async function canvasPoint(page: Page, x: number, y: number) {
  return page.evaluate(([x, y]) => {
    const v = (window as any).__matharium.getState().view;
    const r = document.querySelector('.canvas-wrap canvas')!.getBoundingClientRect();
    return { x: r.left + r.width / 2 + (x - v.ox) * v.sx, y: r.top + r.height / 2 - (y - v.oy) * v.sy };
  }, [x, y]);
}

export async function clickWorld(page: Page, x: number, y: number) {
  const p = await canvasPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}

export async function setMode(page: Page, label: 'Graphing' | 'Geometry' | '3D Graphing') {
  await page.locator('.mode-pill').click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

export async function showPanel(page: Page, label: string) {
  const btn = page.locator('.rail button', { hasText: label });
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
}

export async function pickTool(page: Page, label: string) {
  await showPanel(page, 'Tools');
  await page.locator('.tool-btn', { hasText: label }).first().click();
}

export async function drawerAction(page: Page, label: string) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('.drawer button', { hasText: label }).first().click();
}

export async function downloadText(d: Download) {
  return readFile((await d.path())!, 'utf8');
}

export async function downloadBytes(d: Download) {
  return readFile((await d.path())!);
}

/** Open Settings from the gear, optionally on a tab (by its accessible name). */
export async function openSettings(page: Page, tab?: string) {
  await page.locator('.stage-gear button').click();
  if (tab) await page.getByRole('tab', { name: tab }).click();
}

/** Switch the interface language from Settings → General. */
export async function setLanguage(page: Page, lang: 'en' | 'ar') {
  await page.locator('.stage-gear button').click();
  await page.getByRole('tab').first().click();
  await page.locator('#spanel-general select').first().selectOption(lang);
  await page.keyboard.press('Escape');
}
