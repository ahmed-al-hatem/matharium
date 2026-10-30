import { test, expect } from '@playwright/test';

// Runs against the production build served under /matharium/ (see playwright.config.ts).
test('is installable and keeps working offline', async ({ page, context }) => {
  const errors: string[] = [];
  const external: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173/')) external.push(r.url()); });

  await page.goto('./');
  await expect(page.locator('.topbar')).toBeVisible();

  // manifest
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url()).href;
  expect(manifestUrl).toBe('http://localhost:4173/matharium/manifest.webmanifest');
  const manifest = await (await page.request.get(manifestUrl)).json();
  expect(manifest).toMatchObject({ name: 'Matharium', display: 'standalone', start_url: '.', scope: '.' });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    expect((await page.request.get(new URL(icon.src, manifestUrl).href)).ok(), icon.src).toBe(true);
  }

  // service worker installs and takes control after a reload
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe('http://localhost:4173/matharium/');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // offline: the app, KaTeX, fonts and the lazy 3D view all come from the cache
  await context.setOffline(true);
  await page.reload();
  const input = page.locator('.alg-input-row input');
  await input.fill('f(x) = sin(x)');
  await input.press('Enter');
  await expect(page.locator('.alg-item .katex')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
  )).toEqual(expect.arrayContaining(['STIX Two Text', 'Space Grotesk', 'JetBrains Mono', 'Caveat']));

  await page.locator('.mode-pill').click();
  await page.getByRole('menuitem', { name: '3D Graphing', exact: true }).click();
  await expect(page.locator('.canvas-3d canvas')).toBeVisible();

  expect(external, 'requests leaving the app origin').toEqual([]);
  expect(errors).toEqual([]);
});
