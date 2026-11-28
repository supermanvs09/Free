import { test, expect } from '@playwright/test';
import { hydrated } from './helpers.js';

/* Phones get their own layout: a floating logo and menu button, no bottom
   bar, rails to swipe, a footer that folds. */
test.describe('phone layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('no bottom bar: a floating logo and one menu button, which opens a card under the header', async ({ page }) => {
    await page.goto('/adapid-ai');
    await hydrated(page);
    await expect(page.getByRole('navigation', { name: 'Quick actions' })).toHaveCount(0);
    await page.getByRole('banner').getByRole('button', { name: 'Open menu' }).click();
    const menu = page.locator('#mobile-menu');
    await expect(menu).toBeVisible();
    // groups open in place
    await menu.getByRole('button', { name: 'Solutions' }).click();
    await expect(menu.getByRole('link', { name: 'Healthcare' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Book a demo' })).toBeInViewport();
    await page.getByRole('banner').getByRole('button', { name: 'Close menu' }).first().click();
    await expect(menu).toHaveCount(0);
  });

  test('product pages carry no section bar under the header', async ({ page }) => {
    await page.goto('/dpdpa-compliance');
    await hydrated(page);
    await page.evaluate(() => window.scrollTo(0, innerHeight * 2));
    await page.waitForTimeout(700);
    await expect(page.getByRole('navigation', { name: 'On this page' })).toHaveCount(0);
  });

  test('card grids become rails you swipe, and the footer folds', async ({ page }) => {
    await page.goto('/adapid-ai');
    await hydrated(page);
    const rail = page.locator('.m-rail').first();
    await rail.scrollIntoViewIfNeeded();
    expect(await rail.evaluate((el) => el.scrollWidth > el.clientWidth + 40)).toBe(true);
    const foot = page.locator('footer');
    await foot.scrollIntoViewIfNeeded();
    await expect(foot.getByRole('link', { name: 'Leadership' })).toBeHidden();
    await foot.getByRole('button', { name: 'Company' }).click();
    await expect(foot.getByRole('link', { name: 'Leadership' })).toBeVisible();
  });
});

test('desktop keeps its own controls: no bottom bar, no section bar on product pages', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop check');
  await page.goto('/adapid-ai');
  await hydrated(page);
  await expect(page.getByRole('navigation', { name: 'Quick actions' })).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, innerHeight * 2));
  await page.waitForTimeout(700);
  await expect(page.getByRole('navigation', { name: 'On this page' })).toHaveCount(0);
  await expect(page.locator('header').getByRole('link', { name: 'Book a demo' })).toBeVisible();
});
