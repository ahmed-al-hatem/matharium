import { addInput, expect, open, test } from './helpers';

test('phone layout: no horizontal scroll and the graph stays usable with the keyboard open', async ({ page }) => {
  await open(page);
  await addInput(page, 'f(x) = sin(x)');
  // on touch devices focusing an input opens the math keyboard
  await expect(page.locator('.keyboard')).toBeVisible();
  const { sw, iw, ih } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight }));
  expect(sw).toBeLessThanOrEqual(iw);
  const stage = (await page.locator('.stage').boundingBox())!;
  expect(stage.height).toBeGreaterThanOrEqual(ih * 0.3);
  // everything important is on screen
  for (const sel of ['.topbar', '.rail', '.keyboard', '.alg-input-row']) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b.y + b.height, sel).toBeLessThanOrEqual(ih + 1);
  }
});

test('phone layout: the worksheet preview fits the screen width', async ({ page }) => {
  await open(page);
  await addInput(page, 'f(x) = x^2');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('.drawer button', { hasText: 'Worksheet' }).click();
  const box = (await page.locator('.ws-graph-box').boundingBox())!;
  const { iw, sw } = await page.evaluate(() => ({ iw: innerWidth, sw: document.querySelector('.ws-root')!.scrollWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(iw + 1);
  await expect(page.getByRole('button', { name: 'Print / Save as PDF' })).toBeInViewport();
});

test('phone: a long press on the graph opens its menu', async ({ page }) => {
  await open(page);
  const box = (await page.locator('.canvas-wrap canvas').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(650);
  await expect(page.locator('.ctx-menu')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // lifting the finger does not pick the item under it
  await page.waitForTimeout(200);
  await expect(page.locator('.ctx-menu')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__matharium.getState().settings.axes)).toBe(true);
  await page.getByRole('menuitemcheckbox', { name: 'Show grid' }).tap();
  expect(await page.evaluate(() => (window as any).__matharium.getState().settings.grid)).toBe(false);
});
