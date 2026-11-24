import { test, expect } from '@playwright/test';

test('the overview opens in a lightbox from the hero, with captions, and closes with Escape', async ({ page }) => {
  await page.goto('/');
  await page.locator('section[aria-labelledby="hero-h"]').getByRole('button', { name: /Watch the overview/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Deep Algorithms platform overview' });
  await expect(dialog).toBeVisible();
  // the film plays when its files are deployed; without them the lightbox offers a demo instead
  await expect(dialog.locator('video track[kind="captions"], a[href="/request-demo"]').first()).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('');
});
