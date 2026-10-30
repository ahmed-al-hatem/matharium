import { addInput, expect, inputOf, open, state, test } from './helpers';

test.beforeEach(async ({ page }) => open(page));

test('adds functions, equations, inequalities and points', async ({ page }) => {
  for (const s of ['f(x) = sin(x)', 'x^2 + y^2 = 9', 'y < x^2', 'A = (1, 2)']) await addInput(page, s);
  await expect(page.locator('.alg-item')).toHaveCount(4);
  await expect(page.locator('.alg-error')).toHaveCount(0);
  const names = (await state(page)).objects.map((o) => o.name);
  expect(names).toEqual(['f', 'eq1', 'g', 'A']);
});

test('auto-creates sliders and the slider drives the value', async ({ page }) => {
  await addInput(page, 'a x + b');
  await expect(page.locator('.slider-row')).toHaveCount(2);
  expect(await inputOf(page, 'a')).toBe('a = 1');
  await page.locator('.slider-row input[type=range]').first().fill('3');
  expect(await inputOf(page, 'a')).toBe('a = 3');
});

test('shows solver results', async ({ page }) => {
  await addInput(page, 'Solve(x^2 - 2x = 3)');
  await expect(page.locator('.alg-value').last()).toHaveText('x = −1, x = 3');
  await addInput(page, 'Integral(x^2, 0, 3)');
  await expect(page.locator('.alg-value').last()).toHaveText('= 9');
  await addInput(page, 'f(x) = x^2');
  await addInput(page, 'Intersect(f, 2x)');
  await expect(page.locator('.alg-value').last()).toHaveText('(0, 0), (2, 4)');
});

test('rejects invalid input without adding it', async ({ page }) => {
  await addInput(page, 'Segment(A)');
  await expect(page.locator('.alg-input-row .alg-error')).toContainText('Segment needs 2 arguments');
  expect((await state(page)).objects).toHaveLength(0);
  await expect(page.locator('.alg-input-row input')).toHaveValue('Segment(A)');
});

test('edits in place, deletes from the menu and with the Delete key', async ({ page }) => {
  await addInput(page, 'f(x) = sin(x)');
  await addInput(page, 'g(x) = x');
  await page.locator('.alg-item').first().locator('.alg-body').click();
  const edit = page.locator('.alg-item').first().locator('input');
  await edit.fill('f(x) = cos(x)');
  await edit.press('Enter');
  expect(await inputOf(page, 'f')).toBe('f(x) = cos(x)');

  await page.locator('.alg-item').nth(1).getByRole('button', { name: 'More' }).click();
  await page.locator('.obj-menu button', { hasText: 'Delete' }).click();
  expect((await state(page)).objects.map((o) => o.name)).toEqual(['f']);

  await page.locator('.alg-item').first().locator('.alg-body').click();
  await page.locator('.alg-item').first().locator('input').press('Escape');
  await page.keyboard.press('Delete');
  expect((await state(page)).objects).toHaveLength(0);
});

test('redefining a name replaces it, warns, and can be undone', async ({ page }) => {
  await addInput(page, 'f(x) = x');
  await addInput(page, 'f(x) = x^2');
  await expect(page.locator('.toast')).toHaveText('Existing object redefined (Ctrl+Z to undo)');
  expect((await state(page)).objects.map((o) => o.input)).toEqual(['f(x) = x^2']);
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await state(page)).objects.map((o) => o.input)).toEqual(['f(x) = x']);
});

test('undo and redo', async ({ page }) => {
  await addInput(page, 'f(x) = x');
  await addInput(page, 'g(x) = 2x');
  await page.getByRole('button', { name: 'Undo' }).click();
  expect((await state(page)).objects).toHaveLength(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  expect((await state(page)).objects).toHaveLength(2);
});
