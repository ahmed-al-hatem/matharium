import { addInput, expect, open, setLanguage, state, test } from './helpers';

test.beforeEach(async ({ page }) => open(page));

const row = (page: import('@playwright/test').Page, i = -1) => page.locator('.alg-item').nth(i);

test('Steps under Solve shows the four steps of a linear equation', async ({ page }) => {
  await addInput(page, 'Solve(3(x - 2) = x + 4)');
  const r = row(page);
  await expect(r.locator('.alg-value span')).toHaveText('x = 5');
  const before = (await state(page)).past;
  await r.getByRole('button', { name: 'Steps' }).click();
  const items = r.locator('.steps-list li');
  await expect(items).toHaveCount(4);
  await expect(items.locator('.step-note')).toHaveText([
    'Expand the brackets', 'Move the x terms to the left and the numbers to the right', 'Combine like terms', 'Divide both sides by 2',
  ]);
  await expect(items.last().locator('.katex-mathml')).toContainText('x=5');
  // opening steps is a view toggle: no undo step, no editing
  expect((await state(page)).past).toBe(before);
  await expect(r.locator('input')).toHaveCount(0);
  await r.getByRole('button', { name: 'Hide steps' }).click();
  await expect(items).toHaveCount(0);
});

test('derivative steps in Arabic name the chain rule', async ({ page }) => {
  await setLanguage(page, 'ar');
  await addInput(page, 'Derivative(sin(x^2))');
  const r = row(page);
  await r.getByRole('button', { name: 'الخطوات' }).click();
  const items = r.locator('.steps-list li');
  await expect(items.first().locator('.step-note')).toHaveText('مشتقة sin، قاعدة السلسلة');
  await expect(items.nth(1).locator('.step-note')).toHaveText('قاعدة القوة');
  await expect(items.last().locator('.step-note')).toHaveText('التبسيط');
  await expect(items.last().locator('.katex-mathml')).toContainText('2x\\,\\cos\\left({x}^{2}\\right)');
  await expect(r.getByRole('button', { name: 'إخفاء الخطوات' })).toHaveAttribute('aria-expanded', 'true');
});

test('the Steps command opens its steps right away', async ({ page }) => {
  await addInput(page, 'Steps(x + y = 3, x - y = 1)');
  const items = row(page).locator('.steps-list li');
  await expect(items).toHaveCount(5);
  await expect(items.first().locator('.step-note')).toHaveText('Add the equations to eliminate y');
  await addInput(page, 'Steps(Factor(x^3 - 6x^2 + 11x - 6))');
  await expect(row(page).locator('.alg-value')).toHaveText('= (x − 1)(x − 2)(x − 3)');
  await expect(row(page).locator('.steps-list .step-note').first()).toHaveText('x = 1 is a rational root: divide by (x − 1)');
  await addInput(page, 'Steps(Circle((0, 0), 1))');
  await expect(page.locator('.alg-input-row .alg-error')).toContainText('Steps works with Solve, Derivative and Factor');
  await expect(page.locator('.alg-item .alg-error')).toHaveCount(0);
});

test('rows without a worked solution say so', async ({ page }) => {
  await addInput(page, 'Solve(sin(x) = 0.5)');
  await row(page).getByRole('button', { name: 'Steps' }).click();
  await expect(row(page).locator('.alg-note')).toHaveText('No step-by-step solution for this input');
});
