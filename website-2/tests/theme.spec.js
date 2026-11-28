import { test, expect } from '@playwright/test';
import { watch, hydrated } from './helpers.js';

const bg = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
const sheets = (page) => page.locator('.page > :not(.dark, .fixed)');

test('light by default: porcelain paper, navy words, dark navy panels as highlights', async ({ page }) => {
  const errors = watch(page);
  for (const path of ['/', '/why-deep-algorithms', '/adapid-ai', '/blogs', '/request-demo']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), path).toBe('rgb(245, 247, 251)');
    const [r, g, b] = (await page.locator('h1').first().evaluate((el) => getComputedStyle(el).color)).match(/\d+/g).map(Number);
    expect(r + g + b, path).toBeLessThan(150);   // headings are navy ink
    expect(await bg(page.locator('footer'))).toBe('rgb(10, 18, 38)'); // the footer is a dark panel
  }
  expect(errors).toEqual([]);
});

test('the theme switch turns the site dark, and the choice is remembered', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the phone bar has its own switch (mobile.spec)');
  await page.goto('/adapid-ai');
  await hydrated(page);
  await page.getByRole('banner').getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const [r, g, b] = (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).match(/\d+/g).map(Number);
  expect(r + g + b).toBeLessThan(45);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('banner').getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the header keeps its tone over the hero and when scrolled', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByRole('banner')).toHaveClass(/tone-l/);
  await page.evaluate(() => window.scrollTo(0, document.getElementById('aispm').getBoundingClientRect().top + window.scrollY));
  await expect(page.getByRole('banner')).toHaveClass(/tone-l/);
});

test('in dark mode, the white cards that remain are product pictures, not page sections', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('da2-theme', 'dark'); } catch {} });
  await page.goto('/adapid-ai/nhi-security', { waitUntil: 'networkidle' });
  const win = page.locator('section[aria-labelledby="wb-h"] .vz-win').first();
  await expect(win).toBeVisible();
  expect(await bg(page.locator('section[aria-labelledby="wb-h"]'))).not.toBe('rgb(255, 255, 255)');
});
