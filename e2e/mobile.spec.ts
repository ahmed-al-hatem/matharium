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
