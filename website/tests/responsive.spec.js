import { test, expect } from '@playwright/test';
import { ROUTES } from './helpers.js';

for (const route of ROUTES) {
  test(`${route} never scrolls sideways`, async ({ page }) => {
    await page.goto(route);
    for (let y = 0; y < 30000; y += 900) {
      const done = await page.evaluate((v) => { window.scrollTo(0, v); return v > document.documentElement.scrollHeight; }, y);
      if (done) break;
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}
