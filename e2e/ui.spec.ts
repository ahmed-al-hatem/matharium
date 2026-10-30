import { addInput, expect, open, state, test } from './helpers';

test.beforeEach(async ({ page }) => open(page));

test('Arabic switches to a right-to-left layout and keeps math left-to-right', async ({ page }) => {
  await page.locator('.topbar .pill-btn').click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.rail button').first()).toHaveText('الجبر');
  const rail = (await page.locator('.rail').boundingBox())!;
  const panel = (await page.locator('.panel').boundingBox())!;
  expect(rail.x).toBeGreaterThan(panel.x);
  await expect(page.locator('.alg-input-row input')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
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
  await expect(page.locator('.alg-value span')).toHaveText('= π');
  await page.getByRole('button', { name: 'Show decimal value' }).click();
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.locator('.modal select').first().selectOption('2');
  await page.getByLabel('x min').fill('-1');
  await page.getByLabel('x max').fill('1');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.locator('.modal .pill-btn').click();
  await expect(page.locator('.alg-value span')).toHaveText('= 3.14');
  const sx = await page.evaluate(() => (window as any).__matharium.getState().view.sx);
  const w = (await page.locator('.canvas-wrap canvas').boundingBox())!.width;
  expect(sx).toBeCloseTo(w / 2, 0);
});
