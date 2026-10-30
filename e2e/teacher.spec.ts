import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { addInput, canvasPoint, clickWorld, downloadText, drawerAction, expect, open, setLanguage, showPanel, state, test } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'My lesson' : undefined));
  await open(page);
});

async function tool(page: Page, label: string) {
  await showPanel(page, 'Tools');
  await page.locator('.tool-btn', { hasText: new RegExp(`^${label}$`) }).click();
}

/** The numbers in an input (outside its string), compared to a pixel or so. */
function expectNums(input: string, want: number[]) {
  const got = input.replace(/"[^"]*"/g, '').match(/-?\d+(\.\d+)?/g)!.map(Number);
  expect(got).toHaveLength(want.length);
  got.forEach((v, i) => expect(Math.abs(v - want[i]), input).toBeLessThan(0.05));
}

async function dragWorld(page: Page, pts: [number, number][]) {
  const first = await canvasPoint(page, ...pts[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of pts.slice(1)) {
    const q = await canvasPoint(page, ...p);
    await page.mouse.move(q.x, q.y, { steps: 6 });
  }
  await page.mouse.up();
}

test('Arabic text with LaTeX, pen and arrow are objects that survive save and open', async ({ page }) => {
  // text tool: click, type, Enter
  await tool(page, 'Text');
  await clickWorld(page, 2, 2);
  await page.locator('.text-draft').fill('الميل $m = \\frac{1}{2}$');
  await page.locator('.text-draft').press('Enter');
  const label = page.locator('.text-layer .text-label').first();
  await expect(label).toHaveAttribute('dir', 'rtl');
  await expect(label).toContainText('الميل');
  await expect(label.locator('.katex')).toHaveCount(1);
  await expect(page.locator('.text-draft')).toHaveCount(0);

  // pen: a freehand stroke becomes a simplified Stroke(…)
  await tool(page, 'Pen');
  await dragWorld(page, [[-4, -1], [-3, 1], [-2, -1], [-1, 1], [0, -1]]);
  // arrow: drag from tail to tip
  await tool(page, 'Arrow');
  await dragWorld(page, [[1, -3], [4, -1]]);

  let objs = (await state(page)).objects;
  expect(objs.map((o) => o.name)).toEqual(['text1', 'pen1', 'arrow1']);
  expect(objs[0].input.startsWith('Text("الميل $m = \\frac{1}{2}$", (')).toBe(true);
  expectNums(objs[0].input, [2, 2]);
  const strokePts = objs[1].input.match(/\(/g)!.length - 1;
  expect(strokePts).toBeGreaterThanOrEqual(5);
  expect(strokePts).toBeLessThan(25);
  expect(objs[2].input).toMatch(/^Arrow\(/);
  expectNums(objs[2].input, [1, -3, 4, -1]);
  await expect(page.locator('.alg-error')).toHaveCount(0);

  // they are ordinary objects: recolor the stroke from its menu, delete the arrow with the Delete tool
  await showPanel(page, 'Algebra');
  await page.locator('.alg-item').nth(1).locator('.alg-actions button').click();
  await page.locator('.obj-menu .swatch[aria-label="#6DC4AA"]').click();
  await page.keyboard.press('Escape');
  await tool(page, 'Delete');
  await clickWorld(page, 2.5, -2);
  objs = (await state(page)).objects;
  expect(objs.map((o) => o.name)).toEqual(['text1', 'pen1']);
  expect((objs[1] as { color?: string }).color).toBe('#6DC4AA');
  await tool(page, 'Move');
  await showPanel(page, 'Algebra');
  await addInput(page, 'Text("Title $y = x^2$", (40, 80), "screen")');

  // save, change, then open the saved file again
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  const saved = JSON.parse(await downloadText(dl));
  expect(saved.objects.map((o: { input: string }) => o.input)).toEqual(objs.map((o) => o.input).concat('Text("Title $y = x^2$", (40, 80), "screen")'));
  await addInput(page, 'f(x) = x');
  const file = join(tmpdir(), `teacher-${Date.now()}.mth`);
  await writeFile(file, JSON.stringify(saved));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), drawerAction(page, 'Open…')]);
  await chooser.setFiles(file);
  await expect.poll(async () => (await state(page)).objects.map((o) => o.name)).toEqual(['text1', 'pen1', 'text2']);
  await expect(page.locator('.text-layer .text-label')).toHaveCount(2);
  await expect(page.locator('.text-layer .text-label').first()).toContainText('الميل');
  await expect(page.locator('.text-layer .katex')).toHaveCount(2);
  await expect(page.locator('.alg-error')).toHaveCount(0);
});

test('text pinned to the screen stays put while text on the graph pans with it', async ({ page }) => {
  await addInput(page, 'Text("graph", (1, 1))');
  await addInput(page, 'Text("fixed", (1, -1))');
  const fixed = page.locator('.text-label', { hasText: 'fixed' });
  const onGraph = page.locator('.text-label', { hasText: 'graph' });
  const before = (await fixed.boundingBox())!;
  await page.locator('.alg-item').nth(1).locator('.alg-actions button').click();
  await page.locator('.obj-menu button', { hasText: 'Pin to screen' }).click();
  expect((await state(page)).objects[1].input).toMatch(/^Text\("fixed", \(\d+, \d+\), "screen"\)$/);
  const pinned = (await fixed.boundingBox())!;
  expect(Math.abs(pinned.x - before.x)).toBeLessThan(2);
  expect(Math.abs(pinned.y - before.y)).toBeLessThan(2);

  const g0 = (await onGraph.boundingBox())!;
  await page.evaluate(() => (window as any).__matharium.getState().setView({ ox: 2, oy: 1 }));
  const g1 = (await onGraph.boundingBox())!;
  expect(g0.x - g1.x).toBeCloseTo(100, 0);
  expect(g1.y - g0.y).toBeCloseTo(50, 0);
  const f1 = (await fixed.boundingBox())!;
  expect(f1.x).toBeCloseTo(pinned.x, 0);
  expect(f1.y).toBeCloseTo(pinned.y, 0);

  // a text on the graph can be dragged with the Move tool
  const p = await canvasPoint(page, 1, 1);
  await page.mouse.move(p.x + 10, p.y + 8);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 8, { steps: 5 });
  await page.mouse.up();
  expectNums((await state(page)).objects[0].input, [2, 1]);
  expect((await state(page)).past).toBeGreaterThan(0);
});

test('every lesson template opens in its mode without errors', async ({ page }) => {
  await drawerAction(page, 'New from template…');
  const cards = page.locator('.tpl-card[data-template]');
  const n = await cards.count();
  expect(n).toBeGreaterThanOrEqual(10);
  const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-template')!));
  await page.keyboard.press('Escape');

  for (const id of ids) {
    await drawerAction(page, 'New from template…');
    const card = page.locator(`.tpl-card[data-template="${id}"]`);
    const title = await card.locator('strong').textContent();
    await card.click();
    await expect(page.locator('.modal')).toHaveCount(0);
    const expected = await page.evaluate(async (tid) => {
      const mod = await import('/src/templates/index.ts');
      return mod.TEMPLATES.find((t: { id: string }) => t.id === tid).project;
    }, id);
    const s = await state(page);
    expect(s.mode, id).toBe(expected.mode);
    expect(s.objects.length, id).toBe(expected.objects.length);
    expect(s.dirty).toBe(false);
    await expect(page.locator('.file-name')).toHaveText(title!);
    await expect(page.locator('.alg-item')).toHaveCount(expected.objects.length);
    await expect(page.locator('.alg-error'), id).toHaveCount(0);
  }
});

test('templates dialog in Arabic, and saving / deleting my own template', async ({ page }) => {
  await addInput(page, 'f(x) = sin(x)');
  await drawerAction(page, 'Save as template…');
  await expect(page.locator('.toast')).toHaveText('Template saved in this browser');

  await setLanguage(page, 'ar');
  await page.getByRole('button', { name: 'القائمة' }).click();
  await page.locator('.drawer button', { hasText: 'جديد من قالب…' }).click();
  await expect(page.locator('.modal h2')).toContainText('جديد من قالب');
  await expect(page.locator('.tpl-card[data-template="01-linear"] strong')).toHaveText('الدالة الخطية بالمنزلقات');
  await expect(page.locator('.tpl-card[data-template="11-helix"] .tpl-mode')).toHaveText('الرسم ثلاثي الأبعاد');
  const mine = page.locator('.tpl-card[data-user-template="My lesson"]');
  await expect(mine).toHaveCount(1);

  // open it in a fresh project, then delete it
  await page.evaluate(() => (window as any).__matharium.getState().reset());
  await mine.locator('.tpl-open').click();
  expect((await state(page)).objects.map((o) => o.input)).toEqual(['f(x) = sin(x)']);
  await page.getByRole('button', { name: 'القائمة' }).click();
  await page.locator('.drawer button', { hasText: 'جديد من قالب…' }).click();
  await mine.locator('.tpl-del').click();
  await expect(mine).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('matharium.templates'))).toBe('[]');
});

test('worksheet print view has the title, graph, equations and Arabic text', async ({ page }) => {
  await addInput(page, 'f(x) = x^2 - 2');
  await addInput(page, 'A = (1, 3)');
  await addInput(page, 'Text("رأس القطع $V = (0, -2)$", (0.2, -2.2))');
  await page.evaluate(() => { (window as any).__printed = 0; window.print = () => { (window as any).__printed++; }; });
  await drawerAction(page, 'Worksheet (print / PDF)…');
  await expect(page.locator('.ws-title')).toHaveText('Untitled');
  await page.locator('.ws-title').fill('اختبار قصير');
  await expect(page.locator('.ws-title')).toHaveText('اختبار قصير');

  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#root')).toBeHidden();
  await expect(page.locator('.ws-toolbar')).toBeHidden();
  const svg = page.locator('.ws-graph svg');
  await expect(svg).toBeVisible();
  expect(await svg.getAttribute('width')).toBe('700');
  // paper colors, and the curve in its own color
  const markup = await svg.evaluate((e) => e.outerHTML);
  expect(markup).toContain('fill="#FFFFFF"');
  expect(markup).toContain('#E45B45');
  await expect(page.locator('.ws-graph .text-label')).toContainText('رأس القطع');
  await expect(page.locator('.ws-graph .text-label .katex')).toHaveCount(1);
  await expect(page.locator('.ws-eqs li')).toHaveCount(3);
  await expect(page.locator('.ws-eqs .katex')).toHaveCount(3);
  await expect(page.locator('.ws-answers .ws-line')).toHaveCount(8);

  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Print / Save as PDF' }).click();
  expect(await page.evaluate(() => (window as any).__printed)).toBe(1);
  await page.getByLabel('Answer space').uncheck();
  await expect(page.locator('.ws-answers')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ws-root')).toHaveCount(0);
  await expect(page.locator('#root')).toBeVisible();
});
