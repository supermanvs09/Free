import { test, expect } from '@playwright/test';
import { hydrated } from './helpers.js';

test('home: agentic AI security follows the posture section, in four questions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#products')).toHaveCount(0);
  for (const id of ['ag-find', 'ag-govern', 'ag-run', 'ag-stop']) await expect(page.locator(`#${id}`)).toHaveCount(1);
  const order = await page.evaluate(() => document.getElementById('aispm').compareDocumentPosition(document.getElementById('ag-find')) & Node.DOCUMENT_POSITION_FOLLOWING);
  expect(order).toBeTruthy();
});
test('home: AI-SPM shows the four kinds of identity around the globe, each linked to its product', async ({ page }) => {
  await page.goto('/');
  const sec = page.locator('#aispm');
  await expect(sec.locator('.gx-m')).toHaveCount(4);
  for (const [h, to] of [['People', '/adapid-ai'], ['Machine identities', '/adapid-ai/nhi-security'], ['AI agents', '/agentic-ai/agentic-identity'], ['Personal data', '/dpdpa-compliance']]) {
    await expect(sec.locator(`.gx-m[href="${to}"] .gx-ct:not(.gx-num) b`)).toHaveText(h);
  }
  for (const [v, l] of [['1,284', 'Assets'], ['18', 'Active Threats'], ['97%', 'Protected'], ['1,284', 'High-Risk']]) {
    await expect(sec.locator('.gx-num', { hasText: l })).toContainText(v);
  }
  await expect(sec.locator('.gx-score')).toContainText('92/100');
  await expect(sec.locator('.gx-pill')).toHaveText('Suspicious TrafficUS-East-1');
  await expect(sec.getByRole('button')).toHaveCount(0);
});

test('reduced motion still shows the Claude scene at its finished frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await hydrated(page);
  await expect(page.locator('.cl-toast')).toContainText('Blocked! This prompt contains credentials, API keys and tokens.');
  await expect(page.locator('.cl-note')).toContainText('Not sent · decision recorded by Zenstra AI');
});

test('zenstra: before and after sit side by side, five moments each', async ({ page }) => {
  await page.goto('/agentic-ai/agentic-identity');
  const sec = page.locator('section:has(#chg-h)');
  await expect(sec.getByText('Without Zenstra', { exact: true })).toBeVisible();
  await expect(sec.getByText('With Zenstra', { exact: true })).toBeVisible();
  await expect(sec.locator('.chg-with li')).toHaveCount(5);
  await expect(sec.locator('.chg-without li')).toHaveCount(5);
});

test('a hero takes the reader into the page instead of repeating Book a demo', async ({ page }) => {
  await page.goto('/adapid-ai/nhi-security');
  await hydrated(page);
  await expect(page.locator('main section').first().getByRole('link', { name: 'Book a demo' })).toHaveCount(0);
  await page.getByRole('button', { name: 'See how it works' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
});

test('home: the hero leads with discovery and offers a demo and the film', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('section[aria-labelledby="hero-h"]');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Discover every human, machine and AI agent identity.');
  await expect(hero.getByRole('link', { name: 'Book a demo' })).toHaveAttribute('href', '/request-demo');
  await expect(hero.getByRole('button', { name: /Watch video/ })).toBeVisible();
  await expect(hero.getByRole('link', { name: /product tour/i })).toHaveCount(0);
  // no stills from the brand film anywhere on the page
  expect(await page.locator('img[src*="/img/film/"]').count()).toBe(0);
  await expect(page.locator('#aispm')).toContainText('Continuous AI Security Posture Management');
});

test('home: "Watch video" plays the brand film in a dialog, and Escape closes it', async ({ page }) => {
  await page.goto('/');
  await hydrated(page);
  const btn = page.locator('section[aria-labelledby="hero-h"]').getByRole('button', { name: /Watch video/ });
  await btn.click();
  const dlg = page.getByRole('dialog', { name: 'Deep Algorithms brand film' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('video')).toHaveAttribute('src', '/video/deep-algorithms-film.mp4');
  await expect(dlg.getByRole('button', { name: 'Close the film' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(btn).toBeFocused();
});

test('home: industries, certifications and research each lead somewhere real', async ({ page }) => {
  await page.goto('/');
  const ind = page.locator('section[aria-labelledby="ind-h"]');
  await expect(ind.locator('a[href^="/solutions/"]')).toHaveCount(4);
  const certs = page.locator('section[aria-labelledby="num-h"]');
  await expect(certs.locator('.ce-grid li')).toHaveCount(4);
  // the certifications section is certifications only
  await expect(certs.locator('img')).toHaveCount(0);
  await expect(certs).not.toContainText('Patent');
  const res = page.locator('section[aria-labelledby="res-h"]');
  await expect(res.locator('a[href^="/blogs/"]')).toHaveCount(3);
  await expect(res.getByRole('link', { name: /All research/ })).toHaveAttribute('href', '/blogs');
});

test('home: the hero is one sentence, two actions and the identity radar', async ({ page }) => {
  await page.goto('/');
  await hydrated(page);
  const hero = page.locator('section[aria-labelledby="hero-h"]');
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText('Discover every human, machine and AI agent identity.');
  await expect(hero.getByRole('link', { name: 'Book a demo' })).toBeVisible();
  await expect(hero.locator('.rd-node')).toHaveCount(15);
  await expect(hero.locator('.rd-status')).toContainText('identities discovered');
  await hero.getByRole('button', { name: 'Pause animation' }).click();
  await expect(hero.getByRole('button', { name: 'Play animation' })).toBeVisible();
});

test('home: the AI-SPM section leads with its name, then the promise', async ({ page }) => {
  await page.goto('/');
  const sec = page.locator('#aispm');
  await expect(sec.getByRole('heading', { level: 2 })).toHaveText('Continuous AI Security Posture Management');
  await expect(sec.locator('.ai-sub')).toHaveText('Securing your Identities and Digital Ecosystem from AI-driven threats.');
});

test('every hero rolls the customer logos, with a pause control', async ({ page }) => {
  for (const path of ['/adapid-ai']) {
    await page.goto(path);
    const roll = page.locator('.marquee').first();
    await expect(roll).toBeAttached();
    expect(await roll.locator('img[alt]:not([alt=""])').count()).toBeGreaterThanOrEqual(17);
    await page.getByRole('button', { name: 'Pause customer logos' }).first().click();
    await expect(page.getByRole('button', { name: 'Play customer logos' }).first()).toBeVisible();
  }
});

test('product pictures keep their smallest text readable, phone or desktop', async ({ page }) => {
  for (const path of ['/adapid-ai', '/ad-security', '/dpdpa-compliance']) {
    await page.goto(path);
    await hydrated(page);
    const smallest = await page.evaluate(() => {
      let min = 99;
      for (const v of document.querySelectorAll('.vz')) for (const e of v.querySelectorAll('*')) {
        if (!e.getBoundingClientRect().width || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 1)) continue;
        min = Math.min(min, parseFloat(getComputedStyle(e).fontSize));
      }
      return min;
    });
    expect(smallest, path).toBeGreaterThanOrEqual(9.5);
  }
});

test('on a phone the attack path reads as a chain, one step under the other', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout');
  await page.goto('/ad-security');
  await hydrated(page);
  const bench = page.locator('figure:has([role=tablist])').first();
  await bench.scrollIntoViewIfNeeded();
  await bench.getByRole('tab', { name: 'Attack paths' }).click();
  const chain = bench.locator('.wb-chain');
  await expect(chain).toBeVisible();
  for (const n of ['j.mehta', 'WKS-0412', 'svc-sql', 'Server Admins', 'Domain Admins']) await expect(chain.getByText(n, { exact: true })).toBeVisible();
  await bench.getByRole('tab', { name: 'Remediation' }).click();
  await expect(bench.getByText('Remediated, and checked again')).toBeVisible({ timeout: 8000 });
});


test('home ends with the latest research, and the platform is one scroll away', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#orbit')).toHaveCount(0);
  await page.locator('#aispm-h').scrollIntoViewIfNeeded();
  await expect(page.locator('#aispm-h')).toBeInViewport({ timeout: 5000 });
  // the latest three posts close the page (docs/reference/home-ia.md); blogs stay in the menu too
  await expect(page.locator('#res-h')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Blogs' })).toHaveAttribute('href', '/blogs');
});
