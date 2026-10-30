import { addInput, downloadBytes, drawerAction, expect, open, setMode, state, test } from './helpers';

test('3D view renders surfaces, implicit surfaces and curves, and exports PNG', async ({ page }) => {
  await open(page);
  await setMode(page, '3D Graphing');
  await expect(page.locator('.app-title')).toHaveText('3D Calculator');
  for (const s of ['z = sin(x) cos(y)', 'x^2 + y^2 + z^2 = 9', 'Curve(cos(t), sin(t), t/4, t, 0, 4pi)', 'P = (1, 2, 3)']) await addInput(page, s);
  await expect(page.locator('.alg-error')).toHaveCount(0);
  await expect(page.locator('.canvas-3d canvas')).toBeVisible();

  const [png] = await Promise.all([page.waitForEvent('download'), drawerAction(page, 'Export image (PNG)')]);
  expect((await downloadBytes(png)).subarray(1, 4).toString()).toBe('PNG');

  // SVG is 2D only
  await drawerAction(page, 'Export vector (SVG)');
  await expect(page.locator('.toast')).toHaveText('SVG export is available in 2D views');

  // each mode keeps its own objects
  await setMode(page, 'Graphing');
  await expect(page.locator('.canvas-wrap canvas')).toBeVisible();
  expect((await state(page)).objects).toHaveLength(0);
  await addInput(page, 'y = x^2');
  await setMode(page, 'Geometry');
  expect((await state(page)).objects).toHaveLength(0);
  await setMode(page, '3D Graphing');
  expect((await state(page)).objects.map((o) => o.input)).toContain('P = (1, 2, 3)');
  await setMode(page, 'Graphing');
  expect((await state(page)).objects.map((o) => o.input)).toEqual(['y = x^2']);
});

test('help dialog inserts examples', async ({ page }) => {
  await open(page);
  await page.locator('.rail button', { hasText: 'Help' }).click();
  await page.locator('.help-grid code', { hasText: 'Derivative(f)' }).click();
  expect((await state(page)).objects.map((o) => o.input)).toEqual(['Derivative(f)']);
  await expect(page.locator('.alg-error')).toHaveText('Unknown function: f');
});
