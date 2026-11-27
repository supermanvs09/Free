import { test, expect } from '@playwright/test';
import { watch } from './helpers.js';

const bg = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
const sheets = (page) => page.locator('.page > :not(.dark, .fixed)');

test('one dark theme: black pages, light words, on every kind of page', async ({ page }) => {
  const errors = watch(page);
  for (const path of ['/', '/why-deep-algorithms', '/adapid-ai', '/blogs', '/request-demo']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(0, 0, 0)');
    const h = page.locator('h1').first();
    const c = await h.evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = c.match(/\d+/g).map(Number);
    expect(r + g + b, path).toBeGreaterThan(600);   // headings are near white
  }
  expect(errors).toEqual([]);
});

test('there is no theme switch', async ({ page }) => {
  await page.goto('/agentic-ai/agentic-identity');
  await expect(page.locator('.theme-btn')).toHaveCount(0);
});

test('the header keeps its tone over the hero and when scrolled', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('header')).toHaveClass(/tone-l/);
  await page.evaluate(() => window.scrollTo(0, document.getElementById('aispm').getBoundingClientRect().top + window.scrollY));
  await expect(page.locator('header')).toHaveClass(/tone-l/);
});

test('the white cards that remain are product pictures, not page sections', async ({ page }) => {
  await page.goto('/adapid-ai/nhi-security', { waitUntil: 'networkidle' });
  const win = page.locator('section[aria-labelledby="wb-h"] .vz-win').first();
  await expect(win).toBeVisible();
  expect(await bg(page.locator('section[aria-labelledby="wb-h"]'))).not.toBe('rgb(255, 255, 255)');
});
