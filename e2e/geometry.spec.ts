import { canvasPoint, clickWorld, expect, inputOf, open, pickTool, setMode, showPanel, state, test } from './helpers';

test('builds a construction with tools and keeps dependents in sync while dragging', async ({ page }) => {
  await open(page);
  await setMode(page, 'Geometry');

  await pickTool(page, 'Polygon');
  for (const [x, y] of [[-2, -2], [2, -2], [2, 1], [-1, 2], [-2, -2]]) await clickWorld(page, x, y);
  await pickTool(page, 'Midpoint');
  await clickWorld(page, -2, -2);
  await clickWorld(page, 2, 1);
  await pickTool(page, 'Circle: center');
  await clickWorld(page, 2, -2);
  await clickWorld(page, -1, 2);
  await pickTool(page, 'Angle');
  await clickWorld(page, 2, -2);
  await clickWorld(page, -2, -2);
  await clickWorld(page, -1, 2);

  const s = await state(page);
  expect(s.objects.map((o) => o.input)).toEqual([
    '(-2, -2)', '(2, -2)', '(2, 1)', '(-1, 2)',
    'Polygon(A, B, C, D)', 'Midpoint(A, C)', 'Circle(B, D)', 'Angle(B, A, D)',
  ]);

  await showPanel(page, 'Algebra');
  const values = page.locator('.alg-value');
  await expect(values.filter({ hasText: 'area' }).locator('span')).toHaveText('area = 25/2');
  await values.filter({ hasText: 'area' }).getByRole('button', { name: 'Show decimal value' }).click();
  await expect(values.filter({ hasText: 'area' }).locator('span')).toHaveText('area = 12.5');
  await expect(values.filter({ hasText: '°' })).toHaveText('= 75.9638°');

  // drag D from (-1, 2) to (0, 3)
  await pickTool(page, 'Move');
  const from = await canvasPoint(page, -1, 2), to = await canvasPoint(page, 0, 3);
  const before = s.past;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  expect(await inputOf(page, 'D')).toBe('(0, 3)');
  await showPanel(page, 'Algebra');
  await expect(values.filter({ hasText: 'area' })).toHaveText('area = 13');
  expect((await state(page)).past).toBe(before + 1);

  // the whole drag is one undo step
  await page.keyboard.press('Control+z');
  expect(await inputOf(page, 'D')).toBe('(-1, 2)');
});

test('intersect, perpendicular and delete tools', async ({ page }) => {
  await open(page);
  await setMode(page, 'Geometry');
  await pickTool(page, 'Line');
  await clickWorld(page, -3, 0);
  await clickWorld(page, 3, 0);
  await pickTool(page, 'Circle: center');
  await clickWorld(page, 0, 0);
  await clickWorld(page, 2, 0);
  await pickTool(page, 'Intersect');
  await clickWorld(page, -1, 0);
  await clickWorld(page, 0, 2);
  await pickTool(page, 'Perpendicular');
  await clickWorld(page, 0, 2);
  await clickWorld(page, 1, 0);
  const inputs = (await state(page)).objects.map((o) => o.input);
  expect(inputs).toContain('Intersect(f, g)');
  expect(inputs.some((i) => /^Perpendicular\(\w+, f\)$/.test(i))).toBe(true);

  await pickTool(page, 'Delete');
  const n = (await state(page)).objects.length;
  await clickWorld(page, -3, 0);
  expect((await state(page)).objects).toHaveLength(n - 1);
});
