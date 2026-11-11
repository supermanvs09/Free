import { test, expect } from '@playwright/test';
import { watch, hydrated } from './helpers.js';

test.describe('desktop details', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard shortcuts are a desktop detail');

  test('Ctrl K opens search, and a result opens its page', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/');
    await hydrated(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Search the site' });
    await expect(dialog).toBeVisible();
    await page.keyboard.type('mule');
    await expect(page.getByRole('option').first()).toContainText('Mule Account Crisis');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/blogs\/india-mule-account-crisis$/);
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('the header search button opens search and Escape closes it', async ({ page }) => {
    await page.goto('/why-deep-algorithms');
    await hydrated(page);
    await page.getByRole('button', { name: 'Search the site' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Search the site' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('the ` key opens the terminal, which can open a page', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/');
    await hydrated(page);
    await page.keyboard.press('Backquote');
    await expect(page.getByRole('dialog', { name: 'Deep Algorithms terminal' })).toBeVisible();
    await page.keyboard.type('whoami');
    await page.keyboard.press('Enter');
    await expect(page.getByText('nothing about you is stored')).toBeVisible();
    await page.keyboard.type('open icms');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/dpdpa-compliance$/);
    expect(errors).toEqual([]);
  });
});

test('the main menu has no separate Contact link; Contact stays under Company', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav[aria-label="Primary"] a[href="/contact"]:visible')).toHaveCount(0);
  await expect(page.locator('footer a[href="/contact"]').first()).toBeAttached();
});

test('a missing page names the address and offers search', async ({ page }) => {
  await page.goto('/no-such-page');
  // the 404 has no reveal animations, so wait for the address the browser fills in
  await expect(page.getByText('GET /no-such-page')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search the site' }).last()).toBeVisible();
});

test('the home hero says what we stop, who we secure, and shows a decision before any scroll', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Every login proves a password. We prove the person.' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Run a bank\?/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Book a demo/ }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Rolling out AI agents\?/ })).toBeInViewport();
});

test('the utility bar carries contact, phone and the language menu, and folds away on scroll', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await page.goto('/');
  const bar = page.locator('.ubar');
  await expect(bar.getByRole('link', { name: 'Contact' })).toBeVisible();
  await expect(bar.getByRole('button', { name: /Language: English/ })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(page.locator('header.site-hdr')).toHaveClass(/scrolled/);
});

test('a demo that leaves and comes straight back keeps playing its steps', async ({ page, isMobile }) => {
  test.skip(isMobile, 'one viewport is enough');
  await page.goto('/adapid-ai/continuous-identity-risk-management');
  await hydrated(page);
  await page.locator('#wf-h').scrollIntoViewIfNeeded();
  const tabs = page.getByRole('tablist', { name: 'CIRM stages' }).getByRole('tab');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true', { timeout: 8000 });
  await page.locator('#faq-h').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.locator('#wf-h').scrollIntoViewIfNeeded();
  await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true', { timeout: 8000 });
});

test('there is no Trust center page, and nothing links to one', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href="/trust"]')).toHaveCount(0);
  await expect(page.getByText('Trust center')).toHaveCount(0);
  await page.goto('/trust');
  await expect(page.getByRole('heading', { level: 1, name: 'Security you can verify before you sign.' })).toHaveCount(0);
});
