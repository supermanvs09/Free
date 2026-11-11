import { test, expect } from '@playwright/test';
import { watch, hydrated } from './helpers.js';

/* Every product demonstration works, not just animates. */
test.describe('product demonstrations', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop runs the demos; mobile.spec checks the phone layout');

  test('home: the decision console switches identity type and explains each decision', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/');
    await hydrated(page);
    const tabs = page.getByRole('tablist', { name: 'Identity types' });
    for (const [tab, decision] of [['AI agent', 'Blocked'], ['Payment', 'Payment held'], ['Cloud role', 'Least privilege proposed'], ['Employee', 'Session held']]) {
      await tabs.getByRole('tab', { name: tab }).click();
      await expect(page.locator('section[aria-labelledby="live-h"]').getByRole('group', { name: `Decision: ${decision}` })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test('CIRM: any of the seven stages can be picked, and evidence can be generated', async ({ page }) => {
    await page.goto('/adapid-ai/continuous-identity-risk-management');
    await hydrated(page);
    const stages = page.getByRole('tablist', { name: 'CIRM stages' });
    await expect(stages.getByRole('tab')).toHaveCount(7);
    await stages.getByRole('tab', { name: /Explain/ }).click();
    await expect(page.getByText('In plain language:')).toBeVisible();
    await stages.getByRole('tab', { name: /Evidence/ }).click();
    await page.getByRole('button', { name: 'Generate evidence package' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Evidence package' })).toBeVisible();
  });

  test('CIRM: the policy slider maps a score to a response', async ({ page }) => {
    await page.goto('/adapid-ai/continuous-identity-risk-management');
    await hydrated(page);
    const slider = page.getByRole('slider', { name: 'Risk score' });
    // the slider is interactive only once React owns it: retry the input until the response follows
    await expect(async () => {
      await slider.fill('20');
      await expect(page.locator('#policy').getByText('Work continues. Nothing is interrupted.')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10000 });
    await slider.fill('70');
    await expect(page.locator('#policy').getByText(/A stronger check/)).toBeVisible();
  });

  test('NHI: pick an identity, read its relationships and propose least privilege', async ({ page }) => {
    await page.goto('/adapid-ai/nhi-security');
    await hydrated(page);
    await page.getByRole('button', { name: /AKIA…7Q2N/ }).click();
    await expect(page.getByText('Committed to a public repository 3 hours ago')).toBeVisible();
    await page.getByRole('button', { name: /ecs-notify-svc/ }).click();
    await page.getByRole('tab', { name: 'Granted vs used' }).click();
    await expect(page.getByText('of 214 permissions used in 90 days')).toBeVisible();
    await page.getByRole('tab', { name: 'Recommendation' }).click();
    await page.getByRole('button', { name: 'Propose to owner' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Proposed to' })).toBeVisible();
  });

  test('Fraud: the scam payment is held and the genuine one goes through', async ({ page }) => {
    await page.goto('/adapid-ai/fraud-prevention');
    await hydrated(page);
    const journey = page.getByRole('tablist', { name: 'Payment journey' });
    await journey.getByRole('tab', { name: /Outcome/ }).click();
    await expect(page.getByRole('group', { name: 'Decision: Payment held' })).toBeVisible();
    await page.getByRole('group', { name: 'Scenario' }).getByRole('button', { name: 'Genuine customer' }).click();
    await journey.getByRole('tab', { name: /Outcome/ }).click();
    await expect(page.getByRole('group', { name: 'Decision: Approved' })).toBeVisible();
  });

  test('AD: applying the fix closes the path to Domain Admins', async ({ page }) => {
    await page.goto('/adapid-ai/active-directory-security');
    await hydrated(page);
    await expect(page.getByText('60 paths to Tier 0')).toBeVisible();
    await page.getByRole('button', { name: 'Apply fix and re-check' }).click();
    await expect(page.getByText('19 paths to Tier 0')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'no longer reaches Domain Admins' })).toBeVisible();
  });

  test('Zenstra: a tool call is held for approval, another is blocked, and the chain verifies', async ({ page }) => {
    await page.goto('/agentic-ai/agentic-identity');
    await hydrated(page);
    await page.getByRole('button', { name: /payments.create ₹4,80,000/ }).click();
    await expect(page.getByText('Held for approval').last()).toBeVisible();
    await page.getByRole('button', { name: /vendors.export/ }).click();
    await expect(page.getByText('Not part of invoice processing', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Verify chain' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Chain verified' })).toBeVisible();
  });

  test('Zenstra capabilities: discovery finds a shadow agent; MCP holds a changed tool; detection contains', async ({ page }) => {
    await page.goto('/agentic-ai/agent-discovery');
    await hydrated(page);
    await page.getByRole('button', { name: 'Run discovery scan' }).click();
    await page.getByRole('button', { name: 'Assign an owner' }).click();
    await expect(page.getByText('You · assigned just now').first()).toBeVisible();
    await page.goto('/agentic-ai/mcp-security');
    await hydrated(page);
    await page.getByRole('button', { name: 'Keep approved version' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'previous approved version' })).toBeVisible();
    await page.goto('/agentic-ai/detection-response');
    await hydrated(page);
    await page.getByRole('button', { name: 'Contain the agent' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Token revoked' })).toBeVisible();
  });

  test('Products: the filter by need narrows the list', async ({ page }) => {
    await page.goto('/products');
    await hydrated(page);
    await page.getByRole('button', { name: 'AI agents' }).click();
    await expect(page.getByText('6 matches')).toBeVisible();
    await page.getByRole('button', { name: 'Everything' }).click();
    await expect(page.getByText('14 matches')).toBeVisible();
  });

  test('reduced motion: demos show a finished state without playing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await hydrated(page);
    await expect(page.getByRole('group', { name: 'Decision: Session held' }).first()).toBeVisible();
    await page.goto('/adapid-ai/continuous-identity-risk-management');
    await expect(page.getByRole('tablist', { name: 'CIRM stages' }).getByRole('tab', { name: /Evidence/ })).toHaveAttribute('aria-selected', 'true');
  });
});

test('Book a demo: product CTAs preselect the session, and the form validates', async ({ page }) => {
  await page.goto('/request-demo?product=zenstra');
  await hydrated(page);
  await expect(page.getByLabel('Product of interest')).toHaveValue('zenstra');
  await expect(page.getByText('A live allow, hold or block on a real tool call')).toBeVisible();
  await page.getByRole('button', { name: 'Book my demo' }).click();
  await expect(page.getByText('Please enter your name.')).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeFocused();
});
