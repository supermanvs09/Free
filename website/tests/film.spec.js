import { test, expect } from '@playwright/test';

test('the film plays from the poster, with captions available', async ({ page }) => {
  await page.goto('/');
  await page.locator('#film').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /Play the film/ }).click();
  const video = page.locator('#film video');
  await expect(video).toBeVisible();
  await expect.poll(() => video.evaluate((v) => v.currentTime), { timeout: 15_000 }).toBeGreaterThan(1);
  expect(await video.evaluate((v) => Math.round(v.duration))).toBeGreaterThanOrEqual(60);
  expect(await video.evaluate((v) => v.textTracks.length)).toBe(1);
});
