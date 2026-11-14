/* End-to-end test: the real Worker (wrangler dev) against the mock Jira and Gmail. */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { startMock } from './mock.mjs';

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const mock = startMock(9911);
writeFileSync(new URL('../.dev.vars', import.meta.url), [
  'JIRA_BASE_URL=http://127.0.0.1:9911', 'JIRA_EMAIL=bot@corvane.io', 'JIRA_API_TOKEN=test-token', 'JIRA_PROJECT_KEY=SEC', 'JIRA_WEBHOOK_SECRET=hook123',
  'GMAIL_CLIENT_ID=cid', 'GMAIL_CLIENT_SECRET=csecret', 'GMAIL_REFRESH_TOKEN=rtok', 'GMAIL_SENDER=nhi-alerts@corvane.io', 'MAIL_ALLOWED_DOMAINS=corvane.io',
  'GOOGLE_TOKEN_URL=http://127.0.0.1:9911/token', 'GMAIL_API_BASE=http://127.0.0.1:9911', 'CONSOLE_ORIGIN=https://nhi.corvane.io',
].join('\n'));
const env = { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '' };
const dev = spawn('npx', ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', `/tmp/claude-0/nhi-relay-${Date.now()}`], { cwd: new URL('..', import.meta.url).pathname, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let out = '';
dev.stdout.on('data', (d) => (out += d));
dev.stderr.on('data', (d) => (out += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(150); } return null; };

function client(name, ref) {
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws?name=${encodeURIComponent(name)}&ref=${ref}`);
  const state = { docs: {}, peers: [], open: false };
  ws.onopen = () => (state.open = true);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'snapshot') state.docs = m.docs;
    if (m.type === 'change') { (state.docs[m.collection] ??= {}); if (m.body === null) delete state.docs[m.collection][m.id]; else state.docs[m.collection][m.id] = m.body; }
    if (m.type === 'peers') state.peers = m.peers;
  };
  return { ws, state, set: (collection, id, body) => ws.send(JSON.stringify({ type: 'set', collection, id, body })) };
}

try {
  const health = await until(async () => { try { const r = await fetch(`${BASE}/api/health`); return r.ok && r.json(); } catch { return null; } }, 60000);
  check('relay starts and reports both integrations configured', health?.integrations?.jira?.configured && health?.integrations?.email?.configured, JSON.stringify(health?.integrations));
  const page = await fetch(`${BASE}/`);
  check('serves the console from the same origin', page.ok && (await page.text()).includes('<div id="root">'));

  const a = client('Pranav Reddy', 'u:pranav');
  const b = client('Nikitha Rao', 'u:nikitha');
  await until(() => a.state.open && b.state.open);
  check('two consoles see each other online', !!(await until(() => a.state.peers.length >= 2 && b.state.peers.length >= 2)), `${a.state.peers.map((p) => p.name).join(', ')}`);

  const ticket = { id: 't-1', key: 'SEC-1441', summary: 'Rotate leaked AWS key', description: 'Found in payments-api', priority: 'Highest', type: 'Task', status: 'To Do', assignee: 'u:pranav', assigneeEmail: 'pranav.reddy@corvane.io', reporterName: 'Nikitha Rao', labels: ['nhi'], createdAt: new Date().toISOString() };
  a.set('tickets', 't-1', ticket);
  check('a change from one console reaches the other live', !!(await until(() => b.state.docs.tickets?.['t-1'])));
  const synced = await until(() => b.state.docs.tickets?.['t-1']?.jiraKey && b.state.docs.tickets['t-1']);
  check('creates the real Jira issue and broadcasts its key', !!synced, synced ? `${synced.jiraKey} ${synced.jiraUrl}` : out.slice(-400));
  const create = mock.log.find((c) => c.url === '/rest/api/3/issue');
  const fields = create && JSON.parse(create.body).fields;
  check('Jira create uses basic auth, project, priority, assignee and ADF description', create?.auth === `Basic ${btoa('bot@corvane.io:test-token')}` && fields.project.key === 'SEC' && fields.priority.name === 'Highest' && fields.assignee.accountId === 'acc-pranav' && fields.description.type === 'doc');

  a.set('tickets', 't-1', { ...synced, status: 'In Progress', fromJira: false });
  const tr = await until(() => mock.log.find((c) => /transitions$/.test(c.url) && c.method === 'POST'));
  check('moving the issue in the console transitions it in Jira', tr && JSON.parse(tr.body).transition.id === '21');

  a.set('comments', 'c-1', { id: 'c-1', target: 'ticket:SEC-1441', body: 'Rotating now.', author: 'u:pranav', authorName: 'Pranav Reddy', at: new Date().toISOString() });
  const cm = await until(() => mock.log.find((c) => /\/comment$/.test(c.url)));
  check('a console comment is posted to the Jira issue', cm && cm.url.includes(synced.jiraKey) && cm.body.includes('Rotating now.'));

  const hook = await fetch(`${BASE}/api/jira/webhook?secret=hook123`, { method: 'POST', body: JSON.stringify({ webhookEvent: 'jira:issue_updated', user: { displayName: 'Vamsi Krishna' }, issue: { key: synced.jiraKey, fields: { summary: synced.summary, status: { name: 'Done', statusCategory: { key: 'done' } }, priority: { name: 'Highest' }, assignee: { displayName: 'Vamsi Krishna' } } } }) });
  check('Jira webhook is accepted', hook.ok);
  const done = await until(() => a.state.docs.tickets?.['t-1']?.status === 'Done' && a.state.docs.tickets['t-1']);
  check('a status change made in Jira appears in every console', !!done);
  check('and is logged in the team activity feed', Object.values(a.state.docs.activity || {}).some((x) => x.actor === 'jira:Vamsi Krishna'));
  const bad = await fetch(`${BASE}/api/jira/webhook?secret=wrong`, { method: 'POST', body: '{}' });
  check('a webhook with the wrong secret is refused', bad.status === 401);

  b.set('mail', 'm-1', { id: 'm-1', subject: '[Critical] Leaked key', body: 'Rotate it now.', to: ['u:pranav', 'outside@gmail.com'], toEmails: ['pranav.reddy@corvane.io', 'outside@gmail.com'], deliver: true, link: { kind: 'exposure', id: 'X-780' }, linkPath: 'exposure', at: new Date().toISOString() });
  const sent = await until(() => a.state.docs.mail?.['m-1']?.delivery && a.state.docs.mail['m-1']);
  const gm = mock.log.find((c) => c.url === '/gmail/v1/users/me/messages/send');
  const raw = gm ? Buffer.from(JSON.parse(gm.body).raw, 'base64url').toString() : '';
  check('mail is sent through the Gmail API with a fresh access token', gm?.auth === 'Bearer ya29.test' && mock.log.some((c) => c.url === '/token' && c.body.includes('grant_type=refresh_token')));
  check('only addresses in allowed domains are emailed', sent?.delivery?.status === 'sent' && sent.delivery.to.join() === 'pranav.reddy@corvane.io' && sent.delivery.held.join() === 'outside@gmail.com' && raw.includes('To: pranav.reddy@corvane.io') && !raw.includes('outside@gmail.com'));
  check('the message links back to the console', raw.includes('https://nhi.corvane.io/#exposure'));

  const t1 = await (await fetch(`${BASE}/api/integrations/test`, { method: 'POST', body: JSON.stringify({ kind: 'jira' }) })).json();
  check('"Test connection" for Jira works', t1.ok, t1.detail);

  a.ws.close(); b.ws.close();
  const c = client('Late joiner', 'u:x');
  await until(() => c.state.open);
  const snap = await until(() => c.state.docs.tickets?.['t-1']);
  check('state survives: a late joiner gets everything', snap?.status === 'Done' && !!c.state.docs.mail?.['m-1']);
  c.ws.close();
} catch (e) {
  console.error(e, out.slice(-1500));
} finally {
  try { process.kill(-dev.pid, 'SIGTERM'); } catch { dev.kill('SIGTERM'); }
  mock.close();
  rmSync(new URL('../.dev.vars', import.meta.url), { force: true });
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
