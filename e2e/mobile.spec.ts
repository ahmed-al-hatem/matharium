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
  // lifting the finger does not pick the item under it, and a quick tap right after still works
  await page.waitForTimeout(50);
  await expect(page.locator('.ctx-menu')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__matharium.getState().settings.axes)).toBe(true);
  await page.getByRole('menuitemcheckbox', { name: 'Show grid' }).tap();
  expect(await page.evaluate(() => (window as any).__matharium.getState().settings.grid)).toBe(false);
});

test('phone keyboard: space on every tab, no arrows outside 123, normal-size Enter and Backspace, shift', async ({ page }) => {
  await open(page);
  const input = page.locator('.alg-input-row input');
  await input.tap();
  const kb = page.locator('.keyboard');
  await expect(kb).toBeVisible();
  const kbWidth = (await kb.boundingBox())!.width;
  const tab = (name: string) => page.locator('.kb-tabs button', { hasText: name }).tap();
  const key = (label: string) => kb.getByRole('button', { name: label, exact: true });

  // 123 keeps its arrows and gains a space bar
  await expect(key('Space')).toHaveCount(1);
  await expect(key('Move left')).toHaveCount(1);

  // Backspace and Enter are ordinary keys now (at most 1.5 of a neighbour, like a phone keyboard), not full-width bars
  for (const [name, normal] of [['f(x)', 'Polygon'], ['ABC', 'q'], ['#&¬', '≤']]) {
    await tab(name);
    await expect(key('Space'), name).toHaveCount(1);
    await expect(key('Move left'), name).toHaveCount(0);
    await expect(key('Move right'), name).toHaveCount(0);
    const ref = (await key(normal).boundingBox())!.width;
    for (const k of ['Backspace', 'Enter']) {
      const w = (await key(k).boundingBox())!.width;
      expect(w, `${name} ${k} width`).toBeLessThanOrEqual(ref * 1.6);
      expect(w, `${name} ${k} width`).toBeLessThan(kbWidth * 0.5);
    }
  }

  // ABC: one shift tap gives one capital, a double tap locks capitals
  await tab('ABC');
  await key('Shift').tap();
  await key('A').tap();
  await key('b').tap();
  await key('Space').tap();
  await key('Shift').tap();
  await key('Shift').tap();
  await key('C').tap();
  await key('D').tap();
  await expect(input).toHaveValue('Ab CD');
  await key('Shift').tap();
  await key('e').tap();
  await expect(input).toHaveValue('Ab CDe');
  // Enter submits from the ABC tab too
  await input.fill('k = 2');
  await key('Enter').tap();
  await expect(page.locator('.alg-item')).toHaveCount(1);
});

test('phone: a long press on an algebra row opens the object menu and its properties', async ({ page }) => {
  await open(page);
  await addInput(page, 'f(x) = x^2');
  await page.keyboard.press('Escape');
  const row = (await page.locator('.alg-item').first().boundingBox())!;
  const x = row.x + row.width / 2, y = row.y + row.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('menuitem', { name: 'Settings…' }).tap();
  const panel = page.getByRole('dialog', { name: 'Object properties' });
  await expect(panel).toBeVisible();
  // a sheet that fits the phone
  const box = (await panel.boundingBox())!;
  const iw = await page.evaluate(() => innerWidth);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(iw + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(iw);
  await panel.getByRole('tab', { name: 'Style' }).tap();
  await panel.getByRole('radio', { name: 'Dotted' }).tap();
  expect(await page.evaluate(() => (window as any).__matharium.getState().objects[0].lineStyle)).toBe('dotted');
});
