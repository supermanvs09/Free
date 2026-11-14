/* Two people, two browsers, one relay: the console end to end against mock Jira and Gmail. */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { startMock } from './mock.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const PORT = 8798, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.argv[2] || '/tmp';
const mock = startMock(9912);
writeFileSync(new URL('../.dev.vars', import.meta.url), ['JIRA_BASE_URL=http://127.0.0.1:9912', 'JIRA_EMAIL=bot@corvane.io', 'JIRA_API_TOKEN=t', 'JIRA_WEBHOOK_SECRET=s', 'GMAIL_CLIENT_ID=c', 'GMAIL_CLIENT_SECRET=s', 'GMAIL_REFRESH_TOKEN=r', 'GMAIL_SENDER=nhi-alerts@corvane.io', 'MAIL_ALLOWED_DOMAINS=corvane.io', 'GOOGLE_TOKEN_URL=http://127.0.0.1:9912/token', 'GMAIL_API_BASE=http://127.0.0.1:9912'].join('\n'));
const env = { ...process.env, NO_PROXY: '*', no_proxy: '*', HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '' };
const dev = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', `/tmp/claude-0/nhi-ui-${Date.now()}`], { cwd: new URL('..', import.meta.url).pathname, env, stdio: 'ignore', detached: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); };
try {
  for (let k = 0; k < 120; k++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await sleep(500); }
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const errors = [];
  const person = async (name, email) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await p.goto(BASE); await p.waitForSelector('#si-name', { timeout: 20000 });
    await p.fill('#si-name', name); await p.fill('#si-email', email); await p.click('button[type=submit]');
    await p.waitForSelector('#main', { timeout: 15000 });
    return p;
  };
  const a = await person('Pranav Reddy', 'pranav.reddy@corvane.io');
  const b = await person('Nikitha Rao', 'nikitha.rao@corvane.io');
  await sleep(1500);
  check('both people see each other online', await b.locator('text=/1 online/').count() > 0 || await a.locator('text=/1 online/').count() > 0);

  await a.evaluate(() => { location.hash = 'findings'; }); await sleep(1000);
  for (let k = 0; k < 15; k++) { await a.locator('tbody tr').nth(k).click(); await sleep(300); if (await a.getByRole('button', { name: 'Create Jira issue' }).count()) break; await a.keyboard.press('Escape'); await sleep(150); }
  await a.getByRole('button', { name: 'Create Jira issue' }).click(); await sleep(300);
  await a.getByRole('button', { name: 'Assignee' }).last().click(); await sleep(200);
  await a.getByRole('option', { name: /Nikitha Rao/ }).first().click(); await sleep(200);
  await a.getByRole('button', { name: 'Create issue' }).click();
  await sleep(2500);
  const created = mock.log.find((c) => c.url === '/rest/api/3/issue');
  check('the issue is created in Jira through the relay', !!created, created && JSON.parse(created.body).fields.summary);

  await b.evaluate(() => { location.hash = 'tickets'; }); await sleep(1500);
  const keyVisible = await b.locator('text=SEC-7').count();
  check('the other person sees it on their board with its real Jira key, live', keyVisible > 0);
  await b.locator('text=SEC-7').first().click(); await sleep(800);
  check('and can open it in Jira', await b.locator('text=Open SEC-7 in Jira').count() > 0);
  await b.screenshot({ path: `${SHOTS}/relay-ticket.png` });

  /* Assign a finding to Nikitha: the assignment email goes out by Gmail. */
  await a.keyboard.press('Escape'); await sleep(300);
  await a.evaluate(() => { location.hash = 'overview'; }); await sleep(400);
  await a.evaluate(() => { location.hash = 'findings'; }); await sleep(1000);
  await a.locator('tbody tr').nth(3).click(); await sleep(500);
  await a.getByRole('button', { name: 'Assignee' }).first().click(); await sleep(200);
  await a.getByRole('option', { name: /Nikitha Rao/ }).first().click(); await sleep(2500);
  const gm = mock.log.filter((c) => c.url.includes('/messages/send'));
  const raw = gm.map((c) => Buffer.from(JSON.parse(c.body).raw, 'base64url').toString()).join('\n');
  check('the assignment email is sent by Gmail to her real address', raw.includes('To: nikitha.rao@corvane.io'), `${gm.length} sent`);
  await b.evaluate(() => { location.hash = 'inbox'; }); await sleep(1200);
  await b.locator('li button:has-text("assigned you")').first().click(); await sleep(800);
  check('and her inbox shows it delivered', await b.locator('text=/Delivered by Gmail/').count() > 0);
  await b.screenshot({ path: `${SHOTS}/relay-inbox.png` });

  const hook = await fetch(`${BASE}/api/jira/webhook?secret=s`, { method: 'POST', body: JSON.stringify({ webhookEvent: 'jira:issue_updated', user: { displayName: 'Vamsi Krishna' }, issue: { key: 'SEC-7', fields: { status: { name: 'Done', statusCategory: { key: 'done' } }, priority: { name: 'High' } } } }) });
  await sleep(1500);
  await a.evaluate(() => { location.hash = 'tickets'; }); await sleep(1200);
  check('closing it in Jira moves it to Done for everyone', hook.ok && (await a.locator('section:has(h2:text("Done")) >> text=SEC-7').count()) > 0);
  await a.screenshot({ path: `${SHOTS}/relay-board.png` });
  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
} catch (e) { console.error(e); results.push(false); }
finally {
  try { process.kill(-dev.pid, 'SIGTERM'); } catch { dev.kill('SIGTERM'); } mock.close(); rmSync(new URL('../.dev.vars', import.meta.url), { force: true });
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  setTimeout(() => process.exit(0), 300);
}
