import { addInput, downloadBytes, drawerAction, expect, open, openSettings, setLanguage, setMode, showPanel, state, test, type Page } from './helpers';

test.beforeEach(async ({ page }) => open(page));

const sliderValue = (page: Page, name: string) => page.evaluate((n) => {
  const o = (window as any).__matharium.getState().objects.find((x: { name: string }) => x.name === n);
  return +o.input.split('=')[1];
}, name);

const store = <T,>(page: Page, fn: string) => page.evaluate(`(${fn})((window).__matharium.getState())`) as Promise<T>;

async function openMenu(page: Page, index: number) {
  await page.locator('.alg-item').nth(index).locator('.alg-actions button').click();
  await expect(page.locator('.obj-menu')).toBeVisible();
}
const closeMenu = (page: Page) => page.locator('.file-name').click();

test('polar curves and points, polar grid, and polar curves in 3D', async ({ page }) => {
  await addInput(page, 'r = 2 sin(3θ)');
  await addInput(page, 'r = theta');
  await addInput(page, 'A = (3; 45°)');
  await expect(page.locator('.alg-error')).toHaveCount(0);
  await expect(page.locator('.alg-value').nth(0)).toHaveText('0 ≤ θ ≤ 2π');
  await expect(page.locator('.alg-value').nth(1)).toHaveText('0 ≤ θ ≤ 6π');
  await expect(page.locator('.alg-value').nth(2)).toHaveText('(2.1213, 2.1213)');
  expect((await state(page)).objects.map((o) => o.name)).toEqual(['f', 'g', 'A']);

  await openSettings(page, 'Graphics');
  await page.getByLabel('Grid type').selectOption('polar');
  await page.keyboard.press('Escape');
  expect(await store<string>(page, 's => s.settings.gridType')).toBe('polar');

  await setMode(page, '3D Graphing');
  await addInput(page, 'r = 1 + cos(θ)');
  await expect(page.locator('.alg-error')).toHaveCount(0);
  await expect(page.locator('.canvas-3d canvas')).toBeVisible();
});

test('regression commands show R² and the spreadsheet offers every fit', async ({ page }) => {
  await addInput(page, 'FitExp({(0, 2), (1, 3.3), (2, 5.4), (3, 9), (4, 14.8)})');
  await expect(page.locator('.alg-error')).toHaveCount(0);
  await expect(page.locator('.alg-value')).toHaveText(/^R² = 0\.99/);

  await page.evaluate(() => {
    const s = (window as any).__matharium.getState();
    [[1, 1], [2, 2.4], [4, 3.8], [8, 5.1]].forEach(([x, y], i) => { s.setCell(`A${i + 1}`, String(x)); s.setCell(`B${i + 1}`, String(y)); });
  });
  await showPanel(page, 'Spreadsheet');
  const fit = page.getByLabel('Regression line');
  await expect(fit.locator('option')).toHaveText(['Regression line', 'Linear', 'Quadratic', 'Cubic', 'Exponential', 'Logarithmic', 'Power', 'Sine']);
  await fit.selectOption('FitLog');
  await fit.selectOption('FitPoly2');
  const inputs = (await state(page)).objects.map((o) => o.input);
  // the points are plotted once and both fits refer to them
  expect(inputs.slice(1)).toEqual(['{(1, 1), (2, 2.4), (4, 3.8), (8, 5.1)}', 'FitLog(l1)', 'FitPoly(l1, 2)']);
  await showPanel(page, 'Algebra');
  await expect(page.locator('.alg-error')).toHaveCount(0);
});

test('a slider at ×2 animates, and stopping adds a single undo step', async ({ page }) => {
  await addInput(page, 'a x');
  await openMenu(page, 0);
  await page.getByLabel('Speed').selectOption('2');
  await closeMenu(page);
  await expect(page.locator('.speed-chip')).toHaveText('×2');
  const before = (await state(page)).past;
  const v0 = await sliderValue(page, 'a');

  await page.locator('.play-btn').click();
  await expect(page.locator('.play-btn')).toHaveAttribute('aria-label', 'Pause');
  await page.waitForTimeout(600);
  const v1 = await sliderValue(page, 'a');
  // ×2: 10 units per 2 s, so about 3 units in 0.6 s
  expect(Math.abs(v1 - v0)).toBeGreaterThan(1);
  expect((await state(page)).past).toBe(before);

  await page.locator('.play-btn').click();
  await expect(page.locator('.play-btn')).toHaveAttribute('aria-label', 'Animate');
  expect((await state(page)).past).toBe(before + 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await sliderValue(page, 'a')).toBe(v0);
});

test('play all / stop all, modes, and traces', async ({ page }) => {
  await addInput(page, 'P = (a, b)');
  await expect(page.locator('.slider-row')).toHaveCount(2);
  await openMenu(page, 1);
  await page.getByLabel('Animation').selectOption('once');
  await closeMenu(page);

  const pIndex = (await state(page)).objects.findIndex((o) => o.name === 'P');
  await openMenu(page, pIndex);
  await page.getByRole('button', { name: 'Trace', exact: true }).click();
  await closeMenu(page);

  const before = (await state(page)).past;
  await page.getByRole('button', { name: 'Play all' }).click();
  expect(await store<number>(page, 's => s.playing.length')).toBe(2);
  // "once" runs b from 1 up to 5 and stops by itself; a keeps going
  await expect.poll(() => store<number>(page, 's => s.playing.length'), { timeout: 5000 }).toBe(1);
  expect(await sliderValue(page, 'b')).toBe(5);
  const trace = await store<number>(page, `s => (s.traces[s.objects.find(o => o.name === 'P').id] || []).length`);
  expect(trace).toBeGreaterThan(10);

  await page.getByRole('button', { name: 'Stop all' }).click();
  expect(await store<number>(page, 's => s.playing.length')).toBe(0);
  expect((await state(page)).past).toBe(before + 1);

  await openMenu(page, pIndex);
  await page.getByRole('button', { name: 'Clear trace' }).click();
  expect(await store<number>(page, `s => (s.traces[s.objects.find(o => o.name === 'P').id] || []).length`)).toBe(0);
});

test('records the animation to a WebM video and stops by itself after one cycle', async ({ page }) => {
  await page.evaluate(() => {
    const orig = URL.createObjectURL.bind(URL);
    (window as any).__blobTypes = [];
    URL.createObjectURL = (b: Blob | MediaSource) => { (window as any).__blobTypes.push((b as Blob).type); return orig(b); };
  });
  await addInput(page, 'Circle((0, 0), a)');
  await openMenu(page, 0);
  await page.getByLabel('Speed').selectOption('4');
  await page.getByLabel('Animation').selectOption('increase');
  await closeMenu(page);

  // one cycle at ×4 in "increasing" mode lasts 1 s
  const download = page.waitForEvent('download', { timeout: 8000 });
  await drawerAction(page, 'Record video (WebM)');
  await expect(page.locator('.rec-badge')).toBeVisible();
  expect(await store<number>(page, 's => s.playing.length')).toBe(1);
  const dl = await download;
  expect(dl.suggestedFilename()).toBe('Untitled.webm');
  const bytes = await downloadBytes(dl);
  expect(bytes.subarray(0, 4).toString('hex')).toBe('1a45dfa3'); // EBML header of WebM
  expect(bytes.length).toBeGreaterThan(1000);
  expect(await page.evaluate(() => (window as any).__blobTypes)).toContain('video/webm');
  await expect(page.locator('.rec-badge')).toHaveCount(0);
  // recording started the slider, so it stops it again
  expect(await store<number>(page, 's => s.playing.length')).toBe(0);
});

test('recording can be stopped with the button, also in 3D', async ({ page }) => {
  await setMode(page, '3D Graphing');
  await addInput(page, 'P = (a, 1, 2)');
  await drawerAction(page, 'Record video (WebM)');
  await expect(page.locator('.rec-badge')).toBeVisible();
  await page.waitForTimeout(700);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.rec-badge button').click()]);
  expect((await downloadBytes(dl)).subarray(0, 4).toString('hex')).toBe('1a45dfa3');
});

test('animation controls in Arabic', async ({ page }) => {
  await setLanguage(page, 'ar');
  await addInput(page, 'a x');
  await expect(page.locator('.anim-bar button').first()).toHaveText('تشغيل الكل');
  await openMenu(page, 0);
  await expect(page.getByLabel('السرعة')).toBeVisible();
  await expect(page.getByLabel('التحريك').locator('option')).toHaveText(['ذهاب وإياب', 'تزايد مع تكرار', 'مرة واحدة']);
});
