import { test, expect } from '@playwright/test';
import { hydrated } from './helpers.js';

/* Phones get their own layout: controls at the bottom, a bar of sections on
   long pages, rails to swipe, a footer that folds. */
test.describe('phone layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('the bottom bar holds menu, search and the one Book a demo, which steps aside at the end', async ({ page }) => {
    await page.goto('/adapid-ai');
    await hydrated(page);
    const bar = page.getByRole('navigation', { name: 'Quick actions' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Book a demo' })).toBeVisible();
    await expect(page.locator('header').getByRole('link', { name: 'Book a demo' })).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(bar.locator('.mbar-cta')).toHaveClass(/is-away/);
    await bar.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('dialog', { name: 'Search the site' })).toBeVisible();
  });

  test('the menu sheet is never covered by the bar', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);
    await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('button', { name: 'Menu' }).click();
    const sheet = page.locator('#mobile-menu');
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: 'Book a demo' }).scrollIntoViewIfNeeded();
    await expect(sheet.getByRole('link', { name: 'Book a demo' })).toBeInViewport();
    await expect(page.locator('.mbar')).toHaveClass(/is-down/);
    await sheet.getByRole('button', { name: 'Close menu' }).click();
    await expect(page.locator('.mbar')).not.toHaveClass(/is-down/);
  });

  test('long pages get a bar of their sections that jumps to each', async ({ page }) => {
    await page.goto('/dpdpa-compliance');
    await hydrated(page);
    await page.evaluate(() => window.scrollTo(0, innerHeight * 1.6));
    const jump = page.getByRole('navigation', { name: 'On this page' });
    await expect(jump).toBeVisible();
    await jump.getByRole('button', { name: 'FAQ' }).click();
    await expect(page.locator('#faq-h')).toBeInViewport();
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

test('desktop keeps its own controls: no bottom bar, a section bar with the page name', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop check');
  await page.goto('/adapid-ai');
  await hydrated(page);
  await expect(page.getByRole('navigation', { name: 'Quick actions' })).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, innerHeight * 2));
  const bar = page.getByRole('navigation', { name: 'On this page' });
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('adapID AI');
  await expect(bar.getByRole('link', { name: 'Book a demo' })).toHaveCount(0); // the header already offers it
  await expect(page.locator('header').getByRole('link', { name: 'Book a demo' })).toBeVisible();
});
