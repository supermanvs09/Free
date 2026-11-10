import { test, expect } from '@playwright/test';
import { watch, hydrated } from './helpers.js';

/* The IA (docs/redesign/INFORMATION_ARCHITECTURE.md): four menus, one source
   for menus, footer and sitemap, and the moved pages redirect. */

test('four mega menus open by click, close with Escape and return focus', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop menus');
  await page.goto('/');
  await hydrated(page);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  for (const name of ['Products', 'Solutions', 'Resources', 'Company']) {
    const btn = nav.getByRole('button', { name });
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#mega')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toBeFocused();
  }
});

test('the Products menu lists every platform, product and capability, and each link works', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop menus');
  const errors = watch(page);
  await page.goto('/');
  await hydrated(page);
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Products' }).click();
  const mega = page.locator('#mega');
  for (const name of ['adapID AI overview', 'Continuous Identity Risk Management', 'NHI Security for AWS', 'Identity Fraud Prevention', 'Active Directory Security',
    'Zenstra AI overview', 'Agent Discovery', 'Agent Identity and Access', 'Runtime Enforcement', 'MCP Security', 'Detection and Response', 'Decision Record']) {
    await expect(mega.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
  }
  await expect(mega.getByRole('link', { name: /ICMS Compliance Suite/ })).toBeVisible();
  await mega.getByRole('link', { name: /NHI Security for AWS/ }).first().click();
  await expect(page).toHaveURL(/\/adapid-ai\/nhi-security$/);
  await expect(page.locator('#mega')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('menus, footer and sitemap list the same products', async ({ page }) => {
  await page.goto('/sitemap');
  const site = await page.locator('main a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  const foot = await page.locator('footer a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const href of ['/adapid-ai', '/adapid-ai/continuous-identity-risk-management', '/adapid-ai/nhi-security', '/adapid-ai/fraud-prevention', '/adapid-ai/active-directory-security', '/agentic-ai/agentic-identity', '/dpdpa-compliance']) {
    expect(site, href).toContain(href);
    expect(foot, href).toContain(href);
  }
});

test('moved pages redirect, and the company page is its own page', async ({ page }) => {
  await page.goto('/ad-security');
  await expect(page).toHaveURL(/\/adapid-ai\/active-directory-security$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Domain Admins');
  await page.goto('/platform');
  await expect(page).toHaveURL(/\/products$/);
  await page.goto('/about-us');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('identities the connected world runs on');
  await page.goto('/adapid-ai');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('every human and machine identity');
});

test('product pages carry breadcrumbs that follow the hierarchy', async ({ page }) => {
  await page.goto('/agentic-ai/mcp-security');
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs.getByRole('link', { name: 'Products' })).toBeVisible();
  await expect(crumbs.getByRole('link', { name: 'Zenstra AI' })).toBeVisible();
  await expect(crumbs.getByText('MCP Security')).toBeVisible();
});

test('the mobile drawer opens, groups the menus and closes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await hydrated(page);
  await page.getByRole('button', { name: 'Open menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Continuous Identity Risk Management' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Solutions', exact: true }).click();
  await expect(drawer.getByRole('link', { name: 'Healthcare' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close menu' }).click();
  await expect(drawer).toHaveCount(0);
});
