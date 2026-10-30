import { addInput, expect, inputOf, open, state, test } from './helpers';

test.beforeEach(async ({ page }) => open(page));

const value = (page: import('@playwright/test').Page, i = -1) => page.locator('.alg-item').nth(i).locator('.alg-value');

test('≈ switches a row between its exact and decimal value', async ({ page }) => {
  await addInput(page, 'Solve(2x^2 - 3x - 1 = 0)');
  const v = value(page);
  await expect(v.locator('span')).toHaveText('x = (3 − √17)/4, x = (3 + √17)/4');
  const before = (await state(page)).past;
  await v.getByRole('button', { name: 'Show decimal value' }).click();
  await expect(v.locator('span')).toHaveText('x = −0.2808, x = 1.7808');
  await expect(v.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  // a display toggle is not an undo step, but it is saved with the project
  expect((await state(page)).past).toBe(before);
  expect(await page.evaluate(() => (window as any).__matharium.getState().objects[0].approx)).toBe(true);
  await v.getByRole('button', { name: 'Show exact value' }).click();
  await expect(v.locator('span')).toHaveText('x = (3 − √17)/4, x = (3 + √17)/4');
});

test('integrals, trig values and right angles are exact; plain decimals have no ≈', async ({ page }) => {
  await addInput(page, 'Integral(x^2, 0, 1)');
  await expect(value(page).locator('span')).toHaveText('= 1/3');
  await addInput(page, 'sin(pi/4)');
  await expect(value(page).locator('span')).toHaveText('= √2/2');
  for (const s of ['A = (1, 0)', 'B = (0, 0)', 'C = (0, 2)', 'Angle(A, B, C)']) await addInput(page, s);
  await expect(value(page).locator('span')).toHaveText('= 90° = π/2');
  await addInput(page, '0.123456789 * 2');
  await expect(value(page).locator('span')).toHaveText('= 0.2469');
  await expect(value(page).getByRole('button')).toHaveCount(0);
});

test('the Exact values setting sets the default for every row', async ({ page }) => {
  await addInput(page, 'Integral(x^2, 0, 1)');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.getByLabel('Exact values (fractions, √, π)').uncheck();
  await page.locator('.modal .pill-btn').click();
  await expect(value(page).locator('span')).toHaveText('= 0.3333');
  await value(page).getByRole('button', { name: 'Show exact value' }).click();
  await expect(value(page).locator('span')).toHaveText('= 1/3');
});

test('Factor from the keyboard shows the factored form and plots a function', async ({ page }) => {
  const input = page.locator('.alg-input-row input');
  await input.click();
  await page.locator('.kb-tabs button', { hasText: 'f(x)' }).click();
  await page.locator('.key', { hasText: /^Factor$/ }).click();
  await expect(input).toHaveValue('Factor()');
  await input.fill('Factor(x^3 - 6x^2 + 11x - 6)');
  await input.press('Enter');
  await expect(value(page)).toHaveText('= (x − 1)(x − 2)(x − 3)');
  expect(await inputOf(page, 'f')).toBe('Factor(x^3 - 6x^2 + 11x - 6)');
  await addInput(page, 'Factor(x^2 + 1)');
  await expect(value(page)).toHaveText('= x² + 1');
  await expect(page.locator('.alg-error')).toHaveCount(0);
});

test('Arabic labels the ≈ button', async ({ page }) => {
  await page.locator('.topbar .pill-btn').click();
  await addInput(page, 'Integral(x^2, 0, 1)');
  await value(page).getByRole('button', { name: 'عرض القيمة العشرية' }).click();
  await expect(value(page).locator('span')).toHaveText('= 0.3333');
});
