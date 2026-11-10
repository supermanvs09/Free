import { test, expect } from '@playwright/test';

/* One light foundation (docs/redesign/DESIGN_SYSTEM.md): dark only for the
   footer and the Prompt Heist game; text meets WCAG AA on its background. */

const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const route of ['/', '/adapid-ai/fraud-prevention', '/agentic-ai/agentic-identity', '/solutions/bfsi', '/about-us']) {
  test(`${route}: light page sections, a light header and a dark footer`, async ({ page }) => {
    await page.goto(route);
    const dark = await page.evaluate(() => [...document.querySelectorAll('main section')].filter((s) => {
      const m = getComputedStyle(s).backgroundColor.match(/\d+/g);
      return m && m.length >= 3 && +m[0] + +m[1] + +m[2] < 200 && !(m[3] === '0');
    }).length);
    expect(dark).toBe(0);
    expect(await page.locator('header.site-hdr').evaluate((e) => getComputedStyle(e).backgroundColor)).toMatch(/255, 255, 255/);
    expect(await page.locator('footer').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(10, 22, 38)');
  });
}

test('body, secondary and caption text meet AA contrast on white', async ({ page }) => {
  await page.goto('/');
  const colours = await page.evaluate(() => {
    const probe = (cls) => { const p = document.createElement('p'); p.className = cls; p.textContent = 'x'; document.querySelector('main').appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
    return ['t-body', 't-small', 't-caption', 't-lead', 'app-label', 'alink'].map((c) => [c, probe(c)]);
  });
  for (const [cls, c] of colours) expect(ratio(c, 'rgb(255, 255, 255)'), cls).toBeGreaterThanOrEqual(4.5);
});
