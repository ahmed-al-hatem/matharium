import { addInput, expect, open, openSettings, setLanguage, setMode, state, test } from './helpers';

test.beforeEach(async ({ page }) => open(page));

test('Arabic switches to a right-to-left layout and keeps math left-to-right', async ({ page }) => {
  // the language lives in Settings → General, not in the top bar or the menu
  await expect(page.locator('.topbar .pill-btn')).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.locator('.drawer button', { hasText: 'العربية' })).toHaveCount(0);
  await page.locator('.drawer-backdrop').click();
  await setLanguage(page, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.rail button').first()).toHaveText('الجبر');
  const rail = (await page.locator('.rail').boundingBox())!;
  const panel = (await page.locator('.panel').boundingBox())!;
  expect(rail.x).toBeGreaterThan(panel.x);
  await expect(page.locator('.alg-input-row input')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await openSettings(page, 'عام');
  await expect(page.locator('#spanel-general select').first()).toHaveValue('ar');
  await page.locator('#spanel-general select').first().selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('settings open on the tab of the current app and switch tabs with the keyboard', async ({ page }) => {
  await openSettings(page);
  await expect(page.getByRole('tab', { name: 'Graphics', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Graphics', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: '3D Graphics' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: '3D Graphics' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('Angle unit');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // the menu's Settings item opens it too; in 3D it starts on the 3D tab
  await setMode(page, '3D Graphing');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('.drawer button', { hasText: 'Settings' }).click();
  await expect(page.getByRole('tab', { name: '3D Graphics' })).toHaveAttribute('aria-selected', 'true');
  await page.getByLabel('Show xy-plane').uncheck();
  expect(await page.evaluate(() => (window as any).__matharium.getState().settings.plane3d)).toBe(false);
});

test('angle unit: degrees make sin(30) = 0.5 and show angles in degrees', async ({ page }) => {
  await addInput(page, 'sin(30)');
  await expect(page.locator('.alg-value')).not.toHaveText('= 0.5');
  await openSettings(page, 'General');
  await page.getByLabel('Angle unit').selectOption('deg');
  await page.keyboard.press('Escape');
  await expect(page.locator('.alg-value')).toHaveText('= 0.5');
  await addInput(page, 'asin(1)');
  await expect(page.locator('.alg-value').nth(1)).toHaveText('= 90');
  for (const s of ['A = (1, 0)', 'B = (0, 0)', 'C = (0, 1)', 'Angle(A, B, C)']) await addInput(page, s);
  await expect(page.locator('.alg-value', { hasText: '°' })).toHaveText('= 90°');
  // saved with the project
  expect(await page.evaluate(() => (window as any).__matharium.getState().toFile().settings.angle)).toBe('deg');
});

test('on-screen keyboard types at the caret', async ({ page }) => {
  const input = page.locator('.alg-input-row input');
  await input.click();
  const key = (label: string) => page.locator('.key', { hasText: new RegExp(`^${label.replace(/[()[\]\\^$.|?*+]/g, '\\$&')}$`) }).first();
  await key('√').click();
  await expect(input).toHaveValue('sqrt()');
  await key('x').click();
  await expect(input).toHaveValue('sqrt(x)');
  await expect(input).toBeFocused();
  await key('→').click();
  await key('+').click();
  await key('1').click();
  await key('⌫').click();
  await key('2').click();
  await expect(input).toHaveValue('sqrt(x)+2');
  await key('↵').click();
  expect((await state(page)).objects.map((o) => o.input)).toEqual(['sqrt(x)+2']);

  await page.locator('.kb-tabs button', { hasText: 'f(x)' }).click();
  await key('Solve').click();
  await expect(input).toHaveValue('Solve()');
});

test('settings change digits and the x/y range', async ({ page }) => {
  await addInput(page, 'pi');
  await openSettings(page, 'General');
  await page.getByLabel('decimal places').selectOption('2');
  await page.getByRole('tab', { name: 'Graphics', exact: true }).click();
  await page.getByLabel('x min').fill('-1');
  await page.getByLabel('x max').fill('1');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.locator('.modal .pill-btn').click();
  await expect(page.locator('.alg-value')).toHaveText('= 3.14');
  const sx = await page.evaluate(() => (window as any).__matharium.getState().view.sx);
  const w = (await page.locator('.canvas-wrap canvas').boundingBox())!.width;
  expect(sx).toBeCloseTo(w / 2, 0);
});
