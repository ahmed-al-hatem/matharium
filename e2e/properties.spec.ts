import { addInput, canvasPoint, downloadText, drawerAction, expect, open, setLanguage, test, type Page } from './helpers';

const objectsOf = (page: Page) => page.evaluate(() => (window as any).__matharium.getState().objects as { name: string; color: string; lineStyle?: string; showIf?: string; auxiliary?: boolean }[]);
const panel = (page: Page) => page.getByRole('dialog', { name: 'Object properties' });
const exportSvg = async (page: Page) => {
  const [d] = await Promise.all([page.waitForEvent('download'), drawerAction(page, 'Export vector (SVG)')]);
  return downloadText(d);
};

async function openFromMenu(page: Page, name: string) {
  await page.locator('.alg-item', { hasText: name }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Settings…' }).click();
  await expect(panel(page)).toBeVisible();
}

test.beforeEach(async ({ page }) => open(page));

test('object menu → properties: a dashed line shows in the SVG export', async ({ page }) => {
  await addInput(page, 'f(x) = x^2');
  await openFromMenu(page, 'f');
  await expect(panel(page).getByRole('tab', { name: 'Basic' })).toHaveAttribute('aria-selected', 'true');
  expect(await exportSvg(page)).not.toContain('stroke-dasharray');

  await panel(page).getByRole('tab', { name: 'Style' }).click();
  await panel(page).getByRole('radio', { name: 'Dashed' }).click();
  expect((await objectsOf(page))[0].lineStyle).toBe('dashed');
  const svg = await exportSvg(page);
  expect(svg).toMatch(/stroke="#E45B45"[^>]*stroke-dasharray/);
});

test('a show-if condition follows its slider', async ({ page }) => {
  await addInput(page, 'a = 1');
  await addInput(page, 'f(x) = x^2');
  // Alt + double-click on the curve opens its properties
  const p = await canvasPoint(page, 1, 1);
  await page.keyboard.down('Alt');
  await page.mouse.dblclick(p.x, p.y);
  await page.keyboard.up('Alt');
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('tab', { name: 'Advanced' }).click();
  const cond = panel(page).getByRole('textbox', { name: 'Condition to show object' });
  await cond.fill('a > 2');
  await cond.press('Enter');
  expect((await objectsOf(page)).find((o) => o.name === 'f')?.showIf).toBe('a > 2');
  expect(await exportSvg(page)).not.toContain('#E45B45');

  // the panel does not block the page: move the slider while it is open
  await page.getByRole('slider', { name: 'a' }).fill('3');
  await expect(panel(page)).toBeVisible();
  expect(await exportSvg(page)).toContain('#E45B45');
  await page.getByRole('slider', { name: 'a' }).fill('1');
  expect(await exportSvg(page)).not.toContain('#E45B45');

  // a condition that does not parse is reported and leaves the object shown
  await cond.fill('a >');
  await cond.press('Enter');
  await expect(panel(page).getByRole('alert')).toBeVisible();
  expect(await exportSvg(page)).toContain('#E45B45');
});

test('several objects change together, in one undo step', async ({ page }) => {
  await addInput(page, 'f(x) = x');
  await addInput(page, 'g(x) = -x');
  await openFromMenu(page, 'f');
  await panel(page).locator('.props-list button', { hasText: 'g' }).click({ modifiers: ['Control'] });
  await expect(panel(page).locator('h2 small')).toHaveText('2 selected');
  await panel(page).getByRole('tab', { name: 'Color' }).click();
  await panel(page).getByRole('radio', { name: '#B07CE8' }).click();
  expect((await objectsOf(page)).map((o) => o.color)).toEqual(['#B07CE8', '#B07CE8']);
  await page.evaluate(() => (window as any).__matharium.getState().undo());
  expect((await objectsOf(page)).map((o) => o.color)).not.toContain('#B07CE8');
});

test('keyboard: tabs move with the arrows, Esc closes and gives focus back', async ({ page }) => {
  await addInput(page, 'f(x) = x');
  const more = page.locator('.alg-item').first().getByRole('button', { name: 'More' });
  await more.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Settings…' }).press('Enter');
  const basic = panel(page).getByRole('tab', { name: 'Basic' });
  await expect(basic).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(panel(page).getByRole('tab', { name: 'Color' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(panel(page).getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(more).toBeFocused();
  expect(await objectsOf(page)).toHaveLength(1);
});

test('auxiliary objects leave the algebra list until Settings shows them', async ({ page }) => {
  await addInput(page, 'f(x) = x');
  await addInput(page, 'g(x) = 2x');
  await openFromMenu(page, 'g');
  await panel(page).getByRole('checkbox', { name: 'Auxiliary object (hidden in Algebra)' }).check();
  await expect(page.locator('.alg-item')).toHaveCount(1);
  await panel(page).getByRole('button', { name: 'Close' }).click();
  await page.locator('.stage-gear button').click();
  await page.getByRole('tab', { name: 'General' }).click();
  await page.getByRole('checkbox', { name: 'Show auxiliary objects in Algebra' }).check();
  await expect(page.locator('.alg-item')).toHaveCount(2);
});

test('Arabic: the panel is right-to-left and the tab arrows are mirrored', async ({ page }) => {
  await setLanguage(page, 'ar');
  await addInput(page, 'f(x) = x');
  await page.locator('.alg-item').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'الإعدادات…' }).click();
  const p = page.getByRole('dialog', { name: 'خصائص الكائن' });
  await expect(p).toBeVisible();
  const box = (await p.boundingBox())!;
  const stage = (await page.locator('.stage').boundingBox())!;
  // docked at the end of the stage, which is its left side in RTL
  expect(box.x + box.width).toBeLessThanOrEqual(stage.x + 1);
  await p.getByRole('tab', { name: 'أساسي' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(p.getByRole('tab', { name: 'اللون' })).toBeFocused();
});
