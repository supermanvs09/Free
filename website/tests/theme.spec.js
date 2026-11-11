import { test, expect } from '@playwright/test';

/* v5 (docs/redesign-v5/DESIGN.md): one dark indigo theme for every page;
   text meets WCAG AA on the darkest surface it can sit on. */

const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const route of ['/', '/adapid-ai/fraud-prevention', '/agentic-ai/agentic-identity', '/solutions/bfsi', '/about-us']) {
  test(`${route}: one dark theme: indigo page, glass navigation, dark footer, no light sections`, async ({ page }) => {
    await page.goto(route);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(7, 8, 24)');
    const light = await page.evaluate(() => [...document.querySelectorAll('main section')].filter((s) => {
      const m = getComputedStyle(s).backgroundColor.match(/\d+(\.\d+)?/g);
      return m && m.length >= 3 && +m[0] + +m[1] + +m[2] > 600 && (m[3] === undefined || +m[3] > 0.5);
    }).length);
    expect(light).toBe(0);
    await expect(page.locator('header.site-hdr .navpill')).toBeVisible();
    expect(await page.locator('footer').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(5, 6, 26)');
  });
}

test('body, secondary and caption text meet AA contrast on the page and on raised cards', async ({ page }) => {
  await page.goto('/');
  const colours = await page.evaluate(() => {
    const probe = (cls) => { const p = document.createElement('p'); p.className = cls; p.textContent = 'x'; document.querySelector('main').appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
    return ['t-body', 't-small', 't-caption', 't-lead', 'app-label', 'alink'].map((c) => [c, probe(c)]);
  });
  for (const [cls, c] of colours) for (const bg of ['rgb(7, 8, 24)', 'rgb(21, 24, 56)']) expect(ratio(c, bg), `${cls} on ${bg}`).toBeGreaterThanOrEqual(4.5);
});
