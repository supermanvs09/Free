import { test, expect } from '@playwright/test';
import { ROUTES, PRODUCT_PAGES, watch, scrollThrough } from './helpers.js';

test('the sitemap lists every page', () => {
  expect(ROUTES.length).toBe(44);
});

for (const route of ROUTES) {
  test(`${route} renders cleanly`, async ({ page }) => {
    const errors = watch(page);
    const res = await page.goto(route);
    expect(res.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page).toHaveTitle(/Deep Algorithms/);
    expect(await page.locator('meta[name="description"]').getAttribute('content')).toBeTruthy();
    await scrollThrough(page);
    expect(errors).toEqual([]);
  });
}

test('unknown pages answer 404 with a way back', async ({ page }) => {
  const res = await page.goto('/no-such-page');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toHaveText(/does not exist/);
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();
});

test('one type family across the site: Inter, with mono only for machine values', async ({ page }) => {
  for (const route of ['/', '/adapid-ai', '/blogs/identity-security', '/why-deep-algorithms']) {
    await page.goto(route);
    const families = await page.evaluate(() => [...document.querySelectorAll('h1, h2, h3, p, a, button, li')]
      .filter((e) => !e.closest('.vz, .mono, pre, code')).map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '')));
    expect(new Set(families), route).toEqual(new Set(['Inter Variable']));
  }
});

test('every product page is built differently', async ({ page }) => {
  const shapes = new Set();
  for (const route of PRODUCT_PAGES) {
    await page.goto(route);
    const shape = await page.evaluate(() => [...document.querySelectorAll('main section')].map((s) => s.getAttribute('aria-labelledby') || s.id || 'x').join('|'));
    shapes.add(shape);
  }
  expect(shapes.size).toBe(PRODUCT_PAGES.length);
});

test('figures that are not ours carry a source', async ({ page }) => {
  for (const route of PRODUCT_PAGES) {
    await page.goto(route);
    expect(await page.locator('main p', { hasText: /^Source: / }).count(), route).toBeGreaterThan(0);
  }
});
