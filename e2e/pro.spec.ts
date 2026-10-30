import { addInput, canvasPoint, clickWorld, expect, inputOf, open, pickTool, setMode, showPanel, state, test } from './helpers';

test.beforeEach(async ({ page }) => open(page));

const selected = (page: import('@playwright/test').Page) =>
  page.locator('.alg-input-row input').evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart!, el.selectionEnd!));

test('autocomplete inserts a command template and object names from the keyboard', async ({ page }) => {
  await addInput(page, 'radius = 2');
  const input = page.locator('.alg-input-row input');
  await input.pressSequentially('Circ');
  const items = page.locator('.ac-list li');
  await expect(items).toHaveCount(3);
  await expect(items.first()).toHaveText('Circle( <Center>, <Radius> )');
  await expect(items.first()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowUp');
  await input.press('Tab');
  await expect(input).toHaveValue('Circle(<Center>, <Radius>)');
  expect(await selected(page)).toBe('<Center>');

  await page.keyboard.type('(0, 0)');
  await input.press('Tab');
  expect(await selected(page)).toBe('<Radius>');
  await page.keyboard.type('rad');
  await expect(items).toHaveCount(1);
  await expect(items.locator('code')).toHaveText('radius');
  await input.press('Enter');
  await expect(input).toHaveValue('Circle((0, 0), radius)');
  await input.press('Enter');
  expect((await state(page)).objects.map((o) => o.input)).toEqual(['radius = 2', 'Circle((0, 0), radius)']);

  // Esc closes the list without leaving the field; Enter then submits as usual
  await input.pressSequentially('Ro');
  await expect(page.locator('.ac-list')).toBeVisible();
  await input.press('Escape');
  await expect(page.locator('.ac-list')).toHaveCount(0);
  await expect(input).toHaveValue('Ro');
});

test('autocomplete and help are generated in Arabic', async ({ page }) => {
  await page.locator('.topbar .pill-btn').click();
  const input = page.locator('.alg-input-row input');
  await input.click();
  await input.pressSequentially('Ri');
  await expect(page.locator('.ac-list li').first()).toContainText('RiemannSum(');
  await expect(page.locator('.ac-list li').first()).toContainText('دالة');
  await input.press('Enter');
  expect(await selected(page)).toContain('دالة');
  await input.fill('');

  await page.locator('.rail button', { hasText: 'مساعدة' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.locator('h3', { hasText: 'التفاضل والتكامل' })).toBeVisible();
  await expect(dlg.locator('h3', { hasText: 'الإحصاء والاحتمالات' })).toBeVisible();
  await expect(dlg.getByText('مجموع ريمان بالمستطيلات')).toBeVisible();
  await dlg.locator('code', { hasText: 'RiemannSum(x^2, 0, 2, 8, "mid")' }).click();
  expect((await state(page)).objects.map((o) => o.input)).toEqual(['RiemannSum(x^2, 0, 2, 8, "mid")']);
  await expect(page.locator('.alg-value')).toHaveText('= 2.6563');
});

test('a point on a circle stays on it while dragged, as one undo step', async ({ page }) => {
  await addInput(page, 'c = Circle((0, 0), 2)');
  await addInput(page, 'P = Point(c, 0)');
  const before = (await state(page)).past;
  const from = await canvasPoint(page, 2, 0), to = await canvasPoint(page, 3, 3);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  const m = /^P = Point\(c, ([\d.]+)\)$/.exec((await inputOf(page, 'P'))!);
  expect(m).not.toBeNull();
  expect(+m![1]).toBeCloseTo(0.125, 3);
  await expect(page.locator('.alg-value').nth(1)).toHaveText('(1.4142, 1.4142)');
  expect((await state(page)).past).toBe(before + 1);
  await page.keyboard.press('Control+z');
  expect(await inputOf(page, 'P')).toBe('P = Point(c, 0)');
});

test('point-on-object tool, locus and calculus/statistics commands', async ({ page }) => {
  await setMode(page, 'Geometry');
  await showPanel(page, 'Algebra');
  await addInput(page, 'c = Circle((0, 0), 2)');
  await pickTool(page, 'Point on object');
  await clickWorld(page, 0, 2);
  const inputs = (await state(page)).objects.map((o) => o.input);
  expect(inputs[1]).toMatch(/^Point\(c, 0\.2\d+\)$/);
  const name = (await state(page)).objects[1].name;

  await showPanel(page, 'Algebra');
  await addInput(page, 'B = (4, 0)');
  await addInput(page, `Q = Midpoint(${name}, B)`);
  await addInput(page, `Locus(Q, ${name})`);
  await addInput(page, 'RiemannSum(x^2, 0, 1, 100, "mid")');
  await addInput(page, 'Mean({2, 4, 4, 4, 5, 5, 7, 9})');
  await addInput(page, 'Normal(0, 1, -1, 1)');
  await expect(page.locator('.alg-error')).toHaveCount(0);
  const values = await page.locator('.alg-value').allTextContents();
  expect(values).toContain('= 0.3333');
  expect(values).toContain('= 5');
  expect(values).toContain('P(−1 ≤ X ≤ 1) = 0.6827');
});
