import { addInput, canvasPoint, expect, open, setLanguage, setMode, showPanel, state, test, type Page } from './helpers';

const settingsOf = (page: Page) => page.evaluate(() => (window as any).__matharium.getState().settings);
const objectsOf = (page: Page) => page.evaluate(() => (window as any).__matharium.getState().objects as { name: string; input: string; color: string; fixed?: boolean }[]);
const menu = (page: Page) => page.locator('.ctx-menu');

async function rightClickWorld(page: Page, x: number, y: number) {
  const p = await canvasPoint(page, x, y);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  return p;
}

test.beforeEach(async ({ page }) => open(page));

test('right click on empty graph: hide the grid and change its type', async ({ page }) => {
  await rightClickWorld(page, -4, 3);
  await expect(page.getByRole('menu', { name: 'Graphics' })).toBeVisible();
  const grid = page.getByRole('menuitemcheckbox', { name: 'Show grid' });
  await expect(grid).toHaveAttribute('aria-checked', 'true');
  await grid.click();
  expect((await settingsOf(page)).grid).toBe(false);
  await expect(grid).toHaveAttribute('aria-checked', 'false'); // stays open and follows the change

  await page.getByRole('menuitemradio', { name: 'Polar' }).click();
  expect(await settingsOf(page)).toMatchObject({ grid: true, gridType: 'polar' });
  await expect(page.getByRole('menuitemradio', { name: 'Polar' })).toHaveAttribute('aria-checked', 'true');

  // near the right edge it opens to the left of the pointer, at its full width
  await page.keyboard.press('Escape');
  const box = (await page.locator('.canvas-wrap canvas').boundingBox())!;
  const x = box.x + box.width - 30, y = box.y + 80;
  await page.mouse.click(x, y, { button: 'right' });
  const m = (await menu(page).boundingBox())!;
  expect(Math.abs(m.x + m.width - x)).toBeLessThan(2);
  expect(m.width).toBeGreaterThan(230);

  await page.getByRole('menuitem', { name: 'Open settings' }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Graphics', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('right click on a function: recolour it, then delete it', async ({ page }) => {
  await addInput(page, 'f(x) = x^2');
  await rightClickWorld(page, 1, 1);
  await expect(menu(page).locator('.ctx-header')).toContainText('Function');
  await page.getByRole('menuitemradio', { name: '#3282F6' }).click();
  expect((await objectsOf(page))[0].color).toBe('#3282F6');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  expect(await objectsOf(page)).toEqual([]);
  await expect(menu(page)).toHaveCount(0);
});

test('right click on an algebra row: fix a point and switch it to polar coordinates', async ({ page }) => {
  await addInput(page, 'A = (1, 2)');
  await page.locator('.alg-item').first().click({ button: 'right' });
  await expect(menu(page).locator('.ctx-header')).toContainText('Point');
  await page.getByRole('menuitemcheckbox', { name: 'Fix object' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Polar coordinates' }).click();
  const [a] = await objectsOf(page);
  expect(a).toMatchObject({ fixed: true, input: 'A = (2.2361; 63.43°)' });
  await page.keyboard.press('Escape');
  // a fixed point does not move when dragged
  const from = await canvasPoint(page, 1, 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y + 40, { steps: 4 });
  await page.mouse.up();
  expect((await objectsOf(page))[0].input).toBe('A = (2.2361; 63.43°)');
});

test('the menu works from the keyboard', async ({ page }) => {
  const canvas = page.locator('.canvas-wrap canvas');
  await canvas.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Show axes' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await settingsOf(page)).axes).toBe(false);
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemcheckbox', { name: 'Show grid' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Major and minor gridlines' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitemradio', { name: 'Major gridlines only' })).toBeFocused();
  await page.keyboard.press('Space');
  expect((await settingsOf(page)).gridType).toBe('major');
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(canvas).toBeFocused();
});

test('in Arabic the menu opens to the left of the pointer and stays on screen', async ({ page }) => {
  await setLanguage(page, 'ar');
  const box = (await page.locator('.canvas-wrap canvas').boundingBox())!;
  const x = box.x + box.width * 0.6, y = box.y + 60;
  await page.mouse.click(x, y, { button: 'right' });
  await expect(page.getByRole('menuitemcheckbox', { name: 'إظهار الشبكة' })).toBeVisible();
  const m = (await menu(page).boundingBox())!;
  expect(Math.abs(m.x + m.width - x)).toBeLessThan(2);
  expect(m.y).toBeGreaterThanOrEqual(y - 1);
  await page.keyboard.press('Escape');

  // near the bottom it opens upwards, and near the left edge it opens to the right instead of leaving the screen
  const vw = page.viewportSize()!;
  const onCanvas = (px: number, py: number) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName, [px, py]);
  const bottom = { x: box.x + box.width / 2, y: box.y + box.height - 12 };
  expect(await onCanvas(bottom.x, bottom.y)).toBe('CANVAS');
  await page.mouse.click(bottom.x, bottom.y, { button: 'right' });
  const n = (await menu(page).boundingBox())!;
  expect(Math.abs(n.y + n.height - bottom.y)).toBeLessThan(2);
  await page.keyboard.press('Escape');
  const left = { x: box.x + 12, y: box.y + box.height * 0.4 };
  expect(await onCanvas(left.x, left.y)).toBe('CANVAS');
  await page.mouse.click(left.x, left.y, { button: 'right' });
  const l = (await menu(page).boundingBox())!;
  expect(Math.abs(l.x - left.x)).toBeLessThan(2);
  expect(l.x + l.width).toBeLessThanOrEqual(vw.width);
  expect(l.y + l.height).toBeLessThanOrEqual(vw.height);
});

test('geometry starts without axes and grid', async ({ page }) => {
  await setMode(page, 'Geometry');
  expect(await settingsOf(page)).toMatchObject({ axes: false, grid: false });
  await rightClickWorld(page, 0, 0);
  await expect(page.getByRole('menuitemcheckbox', { name: 'Show axes' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('menuitemcheckbox', { name: 'Show grid' })).toHaveAttribute('aria-checked', 'false');
});

test('3D menu: projection and auto-rotate', async ({ page }) => {
  await setMode(page, '3D Graphing');
  await addInput(page, 'z = x y');
  const wrap = page.locator('.canvas-3d');
  await wrap.click({ button: 'right', position: { x: 200, y: 200 } });
  await expect(page.getByRole('menu', { name: '3D graphics' })).toBeVisible();
  await page.getByRole('menuitemcheckbox', { name: 'Show xy-plane' }).click();
  await page.getByRole('menuitemradio', { name: 'Orthographic' }).click();
  expect(await settingsOf(page)).toMatchObject({ projection: 'orthographic', plane3d: false });
  await page.getByRole('menuitemcheckbox', { name: 'Rotate automatically' }).click();
  await page.keyboard.press('Escape');
  const shot = () => page.evaluate(() => (document.querySelector('.canvas-3d canvas') as HTMLCanvasElement).toDataURL());
  const a = await shot();
  await page.waitForTimeout(400);
  expect(await shot()).not.toBe(a); // the view keeps turning
  expect(await page.evaluate(() => (window as any).__matharium.getState().autoRotate)).toBe(true);
});

test('spreadsheet: insert a row, then plot a selection and paste', async ({ page }) => {
  await showPanel(page, 'Spreadsheet');
  await page.evaluate(() => (window as any).__matharium.getState().setSheet({ A1: '1', A2: '2', B1: '3', B2: '5', C1: '=A2*2' }));
  await page.locator('td[data-ref="A2"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Insert row above' }).click();
  expect((await state(page)).sheet).toEqual({ A1: '1', A3: '2', B1: '3', B3: '5', C1: '=A3*2' });
  await expect(page.locator('td[data-ref="C1"]')).toHaveText('4');

  await page.locator('td[data-ref="A1"]').click();
  await page.locator('td[data-ref="B3"]').click({ modifiers: ['Shift'] });
  await page.locator('td[data-ref="B1"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Create list of points' }).click();
  expect((await objectsOf(page)).map((o) => o.input)).toEqual(['{(1, 3), (2, 5)}']);

  await page.locator('td[data-ref="B1"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).click();
  await page.locator('td[data-ref="E5"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Paste' }).click();
  await expect.poll(async () => (await state(page)).sheet.F7).toBe('5');
  expect((await state(page)).sheet).toMatchObject({ E5: '1', F5: '3', E7: '2' });
});

test('text fields keep the browser menu', async ({ page }) => {
  await page.evaluate(() => document.addEventListener('contextmenu', (e) => { (window as any).__prevented = e.defaultPrevented; }));
  await page.locator('.alg-input-row input').click({ button: 'right' });
  expect(await page.evaluate(() => (window as any).__prevented)).toBe(false);
  await expect(menu(page)).toHaveCount(0);
});
