import { addInput, clickWorld, downloadBytes, downloadText, drawerAction, expect, inputOf, open, openSettings, pickTool, setMode, test } from './helpers';

const settingsOf = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__matharium.getState().settings);

test.beforeEach(async ({ page }) => {
  // force the download fallback so automation can capture exports
  await page.addInitScript(() => { delete (window as any).showSaveFilePicker; });
  await open(page);
});

test('each grid type is selectable and exports a clean SVG', async ({ page }) => {
  await addInput(page, 'f(x) = x^2 - 2');
  const types = [['Major gridlines only', 'major'], ['Polar', 'polar'], ['Isometric', 'isometric'], ['Dots', 'dots'], ['Major and minor gridlines', 'majorMinor']];
  const sizes = new Set<number>();
  for (const [label, value] of types) {
    await openSettings(page, 'Graphics');
    await page.getByLabel('Grid type').selectOption({ label });
    await page.keyboard.press('Escape');
    expect((await settingsOf(page)).gridType).toBe(value);
    const [svg] = await Promise.all([page.waitForEvent('download'), drawerAction(page, 'Export vector (SVG)')]);
    const text = await downloadText(svg);
    expect(text.startsWith('<svg')).toBe(true);
    expect(text).not.toMatch(/NaN|Infinity/);
    sizes.add(text.length);
  }
  expect(sizes.size).toBe(types.length); // every grid draws differently
});

test('points snap to the polar grid', async ({ page }) => {
  await openSettings(page, 'Graphics');
  await page.getByLabel('Grid type').selectOption('polar');
  await page.keyboard.press('Escape');
  await pickTool(page, 'Point');
  await clickWorld(page, 2 * Math.cos(Math.PI / 6) + 0.06, 2 * Math.sin(Math.PI / 6) - 0.05);
  expect(await inputOf(page, 'A')).toBe('(1.732051, 1)');
});

test('switching 3D projections keeps working and exports PNG in every mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await setMode(page, '3D Graphing');
  await addInput(page, 'z = x^2 - y^2');
  const projections = [['Orthographic', 'orthographic'], ['Oblique', 'oblique'], ['Red–cyan glasses', 'anaglyph'], ['Perspective', 'perspective']];
  const images = new Set<string>();
  for (const [label, value] of projections) {
    await openSettings(page, '3D Graphics');
    await page.getByLabel('Projection').selectOption({ label });
    await page.keyboard.press('Escape');
    expect((await settingsOf(page)).projection).toBe(value);
    const [png] = await Promise.all([page.waitForEvent('download'), drawerAction(page, 'Export image (PNG)')]);
    const bytes = await downloadBytes(png);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.length).toBeGreaterThan(10_000);
    images.add(bytes.toString('base64'));
  }
  expect(images.size).toBe(projections.length); // each projection renders a different picture
  expect(errors).toEqual([]);
});
