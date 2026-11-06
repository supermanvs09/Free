import { test, expect } from '@playwright/test';
import { hydrated } from './helpers.js';

test('product menu: the four platforms, the four adapID products and the tools they work with', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop menu');
  await page.goto('/');
  await page.getByRole('button', { name: 'Products' }).click();
  const mega = page.locator('#mega');
  await expect(mega).toBeVisible();
  // the only images are the three product-line logos; the brand marks are drawn inline
  const logos = mega.locator('img');
  await expect(logos).toHaveCount(3);
  for (const src of await logos.evaluateAll((els) => els.map((e) => e.getAttribute('src')))) expect(src).toMatch(/^\/brand\/products\/(zenstra|adapid|icms)\.webp$/);
  for (const name of ['Zenstra AI', 'ICMS Compliance Suite', 'Continuous Identity Risk Management', 'NHI Security for AWS', 'Identity Fraud Prevention', 'Active Directory Security']) await expect(mega.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  await expect(mega.getByText('Works with')).toBeVisible();
  await expect(mega.getByRole('img', { name: 'AWS' })).toBeVisible();
  // pointing at a product shows what that product works with, and its capabilities
  await mega.getByRole('link', { name: /Zenstra AI/ }).first().hover();
  await expect(mega.getByText('Capabilities')).toBeVisible();
  await expect(mega.getByText('Intent verification')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(mega).toBeHidden();
});

test('only Products and Solutions open a menu, with no arrows; the rest are plain links', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop menu');
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('button')).toHaveCount(2);
  await expect(nav.locator('svg')).toHaveCount(0);
  await nav.getByRole('button', { name: 'Solutions' }).hover();
  await expect(page.locator('#mega')).toBeVisible();
  await expect(page.locator('#mega img')).toHaveCount(0);
  for (const [name, href] of [['Why Deep Algorithms', '/why-deep-algorithms'], ['Blogs', '/blogs']]) await expect(nav.getByRole('link', { name })).toHaveAttribute('href', href);
});

test('the phone menu rises from the bottom bar, navigates and closes', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone menu');
  await page.goto('/');
  await hydrated(page);
  await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('button', { name: 'Menu' }).click();
  const menu = page.locator('#mobile-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'NHI Security for AWS' }).click();
  await expect(page).toHaveURL(/nhi-security/);
  await expect(menu).toBeHidden();
});

test('blog topics in the menu land on a filtered list', async ({ page }) => {
  await page.goto('/blogs?topic=threat-intelligence');
  await expect(page.getByRole('heading', { name: '2 results' })).toBeVisible();
  await page.getByLabel('Search the blogs').fill('mule');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: 'All blogs' })).toBeVisible();
});

test('the old company and Why addresses lead to Why Deep Algorithms', async ({ page }) => {
  for (const old of ['/about-us', '/platform']) {
    await page.goto(old);
    await expect(page).toHaveURL(/\/why-deep-algorithms$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('The defence has to be as intelligent as the attack.');
  }
});

test('the main navigation ends with Why Deep Algorithms', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop navigation');
  await page.goto('/');
  const items = page.locator('header nav[aria-label] > ul > li, header nav > ul > li').filter({ hasText: /\S/ });
  const labels = (await items.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  expect(labels.at(-1)).toBe('Why Deep Algorithms');
});

test('the language menu offers English and six international languages', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop utility bar');
  await page.goto('/');
  await page.getByRole('button', { name: 'Language: English' }).first().click();
  const items = page.getByRole('listbox', { name: 'Language' }).getByRole('option');
  await expect(items).toHaveCount(7);
  for (const n of ['English', 'Español', 'Français', 'Deutsch', 'Português', '日本語', '简体中文']) await expect(items.filter({ hasText: n })).toHaveCount(1);
});
