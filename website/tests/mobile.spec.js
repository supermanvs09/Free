import { test, expect } from '@playwright/test';
import { hydrated } from './helpers.js';

test.describe('phone layout', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone only');

  test('one bottom bar with the menu and Book a demo, which steps aside at the footer', async ({ page }) => {
    await page.goto('/adapid-ai');
    await hydrated(page);
    const bar = page.getByRole('navigation', { name: 'Quick actions' });
    await expect(bar.getByRole('button', { name: 'Menu' })).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Book a demo' })).toBeVisible();
    await bar.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    await page.getByRole('button', { name: 'Close menu' }).click();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator('.mbar')).toHaveClass(/is-down/);
  });

  for (const route of ['/', '/adapid-ai/fraud-prevention', '/agentic-ai/agentic-identity', '/adapid-ai/nhi-security', '/request-demo']) {
    test(`${route} has no sideways scroll at 360px`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(route);
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sw).toBeLessThanOrEqual(cw + 1);
    });
  }

  test('the demo form comes first on the Book a demo page', async ({ page }) => {
    await page.goto('/request-demo');
    const form = await page.getByLabel('Full name').boundingBox();
    expect(form.y).toBeLessThan(844);
  });

  test('the footer columns fold into rows you open', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('footer').getByRole('button', { name: 'Products' });
    await btn.click();
    await expect(page.locator('footer').getByRole('link', { name: 'adapID AI' })).toBeVisible();
  });
});

test('desktop keeps its own controls: no bottom bar, and a sticky section bar on product pages', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await page.goto('/adapid-ai/nhi-security');
  await expect(page.locator('.mbar')).toBeHidden();
  const sub = page.getByRole('navigation', { name: 'NHI Security for AWS sections' });
  await expect(sub).toBeVisible();
  await sub.getByRole('link', { name: 'Secrets in code' }).click();
  await expect(page).toHaveURL(/#secrets$/);
});
