import { test, expect } from '@playwright/test';
import { watch } from './helpers.js';

const bg = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
const sheets = (page) => page.locator('.page > :not(.dark, .fixed)');

test('one light theme: a light hero and light sheets', async ({ page }) => {
  const errors = watch(page);
  await page.goto('/');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  // the hero is a light brand field: dark words on near-white
  const hero = page.locator('.page > .band-brand').first();
  expect(await hero.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(14, 17, 22)');
  expect(await bg(sheets(page).nth(1))).toMatch(/rgb\((2[3-5]\d), (2[3-5]\d), (2[3-5]\d)\)/);
  expect(errors).toEqual([]);
});

test('there is no theme switch, and an old saved dark choice is ignored', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('da-theme', 'dark'); } catch (e) { /* private mode */ } });
  await page.goto('/agentic-ai/agentic-identity');
  await expect(page.locator('.theme-btn')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('da-theme'))).toBeNull();
});

test('the header stays light over the light hero and when scrolled', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('header')).toHaveClass(/tone-l/);
  await page.evaluate(() => window.scrollTo(0, document.getElementById('how').getBoundingClientRect().top + window.scrollY));
  await expect(page.locator('header')).toHaveClass(/tone-l/);
});

test('product pictures are drawn light on a light sheet, the way identity vendors show them', async ({ page }) => {
  await page.goto('/adapid-ai/nhi-security', { waitUntil: 'networkidle' });
  const ink = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).getPropertyValue('--color-ink').trim().toLowerCase());
  expect(await ink('.page > :not(.dark, .fixed) h2')).toBe('#0e1116');
  await expect(page.locator('section[aria-labelledby="wb-h"]')).not.toHaveClass(/dark/);
  const win = page.locator('section[aria-labelledby="wb-h"] .vz-win').first();
  expect(await win.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
});
