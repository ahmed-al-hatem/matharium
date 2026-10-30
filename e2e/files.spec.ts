import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addInput, downloadBytes, downloadText, drawerAction, expect, open, showPanel, state, test } from './helpers';

test.beforeEach(async ({ page }) => {
  // force the download / <input type=file> fallbacks so automation can drive them
  await page.addInitScript(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });
  page.on('dialog', (d) => d.accept());
  await open(page);
});

test('save downloads a project file that opens again', async ({ page }) => {
  await addInput(page, 'f(x) = x^2');
  await addInput(page, 'A = (1, 2)');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save', exact: true }).click()]);
  expect(dl.suggestedFilename()).toBe('Untitled.mth');
  const project = JSON.parse(await downloadText(dl));
  expect(project.app).toBe('matharium');
  expect(project.objects.map((o: { input: string }) => o.input)).toEqual(['f(x) = x^2', 'A = (1, 2)']);
  expect((await state(page)).dirty).toBe(false);
  await expect(page.locator('.file-name')).toHaveText('Untitled.mth');

  // change something, then open the saved file (confirm dialog is accepted)
  await addInput(page, 'g(x) = 3');
  const file = join(tmpdir(), `matharium-${Date.now()}.mth`);
  await writeFile(file, JSON.stringify(project));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), drawerAction(page, 'Open…')]);
  await chooser.setFiles(file);
  await expect.poll(async () => (await state(page)).objects.map((o) => o.input)).toEqual(['f(x) = x^2', 'A = (1, 2)']);
  await expect(page.locator('.toast')).toHaveText('Project opened');
});

test('rejects a file that is not a project', async ({ page }) => {
  const file = join(tmpdir(), `bad-${Date.now()}.json`);
  await writeFile(file, '{"hello": 1}');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), drawerAction(page, 'Open…')]);
  await chooser.setFiles(file);
  await expect(page.locator('.toast')).toHaveText('Not a valid Matharium file');
});

test('imports CSV into the spreadsheet', async ({ page }) => {
  const file = join(tmpdir(), `data-${Date.now()}.csv`);
  await writeFile(file, 'x,y\n1,2\n3,"4"\n');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), drawerAction(page, 'Import CSV…')]);
  await chooser.setFiles(file);
  await expect.poll(async () => (await state(page)).sheet).toEqual({ A1: 'x', B1: 'y', A2: '1', B2: '2', A3: '3', B3: '4' });
  await expect(page.locator('.sheet-wrap')).toBeVisible();
});

test('exports PNG, SVG and CSV', async ({ page }) => {
  await addInput(page, 'f(x) = x^2');
  await addInput(page, 'x^2 + y^2 = 4');

  const [png] = await Promise.all([page.waitForEvent('download'), drawerAction(page, 'Export image (PNG)')]);
  const bytes = await downloadBytes(png);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(10_000);

  const [svg] = await Promise.all([page.waitForEvent('download'), drawerAction(page, 'Export vector (SVG)')]);
  const svgText = await downloadText(svg);
  expect(svgText.startsWith('<svg')).toBe(true);
  expect(svgText).toContain('#E45B45');
  expect(svgText).not.toMatch(/NaN|Infinity/);

  await showPanel(page, 'Table');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.locator('.panel-footer button', { hasText: 'CSV' }).click()]);
  const rows = (await downloadText(csv)).split('\n');
  expect(rows[0]).toBe('x,f(x)');
  expect(rows).toContain('0,0');
  expect(rows).toContain('-3,9');

  await page.evaluate(() => { const s = (window as any).__matharium.getState(); s.setCell('A1', '1'); s.setCell('B2', '=A1*2'); });
  const [sheet] = await Promise.all([page.waitForEvent('download'), drawerAction(page, 'Export spreadsheet (CSV)')]);
  expect(await downloadText(sheet)).toBe('1,\n,=A1*2');
});

test('share link restores the project in a fresh browser', async ({ page, context, browser }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await addInput(page, 'f(x) = sin(x)');
  await addInput(page, 'A = (2, 3)');
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.locator('.toast')).toHaveText('Share link copied');
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url).toMatch(/#p=/);

  const other = await (await browser.newContext()).newPage();
  await other.goto(url);
  await other.waitForFunction(() => !!(window as any).__matharium);
  expect(await other.evaluate(() => (window as any).__matharium.getState().objects.map((o: { input: string }) => o.input))).toEqual(['f(x) = sin(x)', 'A = (2, 3)']);
  expect(await other.evaluate(() => location.hash)).toBe('');
});

test('autosave restores the work after a reload', async ({ page }) => {
  await addInput(page, 'f(x) = x^3');
  await page.waitForTimeout(900);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__matharium);
  await expect(page.locator('.alg-item')).toHaveCount(1);
  expect((await state(page)).objects[0].input).toBe('f(x) = x^3');
});
