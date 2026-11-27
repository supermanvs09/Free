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
    await page.getByRole('banner').getByRole('button', { name: 'Search the site' }).click();
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

test('the retired pages are linked from nowhere, and their old addresses land on the page that replaced them', async ({ page }) => {
  await page.goto('/');
  await hydrated(page);
  const old = ['/products', '/contact', '/sitemap', '/agentic-ai/agent-discovery', '/agentic-ai/agent-access', '/agentic-ai/runtime-enforcement', '/agentic-ai/mcp-security', '/agentic-ai/detection-response', '/agentic-ai/decision-record'];
  for (const href of old) await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
  for (const [from, to] of [['/contact', /\/request-demo$/], ['/products', /\/$/], ['/agentic-ai/mcp-security', /\/agentic-ai\/agentic-identity#cap-mcp$/]]) {
    await page.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, from);
    await expect(page).toHaveURL(to);
  }
});

test('zenstra: each capability is a tab with its three steps, and a link can open any tab', async ({ page }) => {
  await page.goto('/agentic-ai/agentic-identity#cap-mcp');
  await hydrated(page);
  const tab = page.getByRole('tab', { name: 'MCP' });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByRole('tabpanel', { name: 'MCP' });
  await expect(panel.locator('ol li')).toHaveCount(3);
  await expect(panel).toContainText('Approve');
  await page.getByRole('tab', { name: 'Prove' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Prove' })).toContainText('Tamper-evident chain');
});

test('dpdpa: no auditor-questions table', async ({ page }) => {
  await page.goto('/dpdpa-compliance');
  await expect(page.locator('#chg-h')).toHaveCount(0);
  await expect(page.getByText('Five questions every auditor asks')).toHaveCount(0);
});

test('the closing call to action reads in two lines on a laptop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'laptop width');
  await page.goto('/');
  const h = page.locator('#close-h');
  const lines = await h.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBe(2);
});

test('the pictures over photos keep their tables inside the card', async ({ page }) => {
  for (const path of ['/adapid-ai/nhi-security', '/adapid-ai/fraud-prevention', '/ad-security', '/dpdpa-compliance']) {
    await page.goto(path);
    const over = await page.evaluate(() => [...document.querySelectorAll('.pf-panel table')].map((t) => t.scrollWidth - t.parentElement.clientWidth));
    for (const o of over) expect(o, path).toBeLessThanOrEqual(1);
  }
});

test('a missing page names the address and offers search', async ({ page }) => {
  await page.goto('/no-such-page');
  // the 404 has no reveal animations, so wait for the address the browser fills in
  await expect(page.getByText('GET /no-such-page')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search the site' }).last()).toBeVisible();
});

test('the home hero names who we secure, and proof follows straight after', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Discover every human, machine and AI agent identity.' })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="hero-h"]').getByRole('link', { name: 'Book a demo' })).toBeInViewport();
  // the customer proof is the very next section
  await expect(page.locator('section[aria-labelledby="hero-h"] + section').getByRole('heading', { name: 'Trusted by banks, government and enterprises across India' })).toBeAttached();
});

test('there is no line above the menu; search and language sit in the main bar', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await page.goto('/');
  await expect(page.locator('.ubar')).toHaveCount(0);
  const bar = page.getByRole('banner');
  await expect(bar.getByRole('button', { name: 'Search the site' })).toBeVisible();
  await expect(bar.getByRole('button', { name: /Region and language: India \(EN\)/ })).toBeVisible();
});

test('product pages carry no hero picture except NHI security, and no cost-of-the-problem card', async ({ page, isMobile }) => {
  test.skip(isMobile, 'one viewport is enough');
  for (const path of ['/adapid-ai', '/agentic-ai/agentic-identity', '/dpdpa-compliance', '/ad-security', '/adapid-ai/fraud-prevention']) {
    await page.goto(path);
    await expect(page.locator('section.hero-under .vzw, section.hero-under [role="img"]')).toHaveCount(0);
    await expect(page.getByText('The cost of a login nobody questioned')).toHaveCount(0);
    await expect(page.getByText('Why it matters now')).toHaveCount(0);
  }
  await page.goto('/adapid-ai/nhi-security');
  await expect(page.locator('section.hero-under').first()).toBeVisible();
});

test('a picture that leaves and comes straight back still plays its steps', async ({ page, isMobile }) => {
  test.skip(isMobile, 'one viewport is enough');
  await page.goto('/agentic-ai/agentic-identity');
  await hydrated(page);
  const vz = page.locator('section:has(#caps-h) .vz').first();
  const to = (sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start', behavior: 'instant' }), sel);
  await to('#caps-h');
  await expect(vz).not.toHaveClass(/\bk1\b/); // rewound to step 0 on entering
  await to('#cmp-h');                          // out of view before step 1…
  await page.waitForTimeout(150);
  await to('#caps-h');                           // …and straight back
  await expect(vz).toHaveClass(/\bk2\b/, { timeout: 5000 });
});

test('there is no Trust center page, and nothing links to one', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href="/trust"]')).toHaveCount(0);
  await expect(page.getByText('Trust center')).toHaveCount(0);
  await page.goto('/trust');
  await expect(page.getByRole('heading', { level: 1, name: 'Security you can verify before you sign.' })).toHaveCount(0);
});
