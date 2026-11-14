/*
 * Corvane NHI relay: one Cloudflare Worker that
 *   - serves the console (static assets, same origin, no CORS);
 *   - keeps the workspace's shared state in a Durable Object and streams every
 *     change to every open console over a WebSocket;
 *   - turns console changes into real Jira Cloud issues, transitions,
 *     assignments and comments, and Jira's webhooks back into console changes;
 *   - delivers console mail through the Gmail API.
 *
 * Secrets never reach the browser. Configure with `wrangler secret put`:
 *   JIRA_BASE_URL       https://your-site.atlassian.net
 *   JIRA_EMAIL          the Atlassian account the API token belongs to
 *   JIRA_API_TOKEN      https://id.atlassian.com/manage-profile/security/api-tokens
 *   JIRA_PROJECT_KEY    e.g. SEC
 *   JIRA_WEBHOOK_SECRET any random string; the webhook URL carries it
 *   GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN
 *   GMAIL_SENDER        the mailbox mail is sent as, e.g. nhi-alerts@company.com
 *   MAIL_ALLOWED_DOMAINS  comma-separated; mail to anything else is held back
 *   CONSOLE_ORIGIN      optional, the public URL of the console (links in mail and Jira)
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const workspace = env.WORKSPACE.get(env.WORKSPACE.idFromName(url.searchParams.get('workspace') || 'default'));

    if (url.pathname === '/api/health') return json({ ok: true, relay: 'corvane-nhi', integrations: integrationStatus(env) });
    if (url.pathname === '/ws') {
      if (request.headers.get('upgrade') !== 'websocket') return json({ error: 'Expected a WebSocket upgrade' }, 426);
      return workspace.fetch(request);
    }
    if (url.pathname === '/api/jira/webhook' && request.method === 'POST') {
      if (!env.JIRA_WEBHOOK_SECRET || url.searchParams.get('secret') !== env.JIRA_WEBHOOK_SECRET) return json({ error: 'Bad webhook secret' }, 401);
      return workspace.fetch(new Request('https://do/jira-webhook', { method: 'POST', body: await request.text() }));
    }
    if (url.pathname === '/api/integrations/test' && request.method === 'POST') {
      return workspace.fetch(new Request('https://do/test', { method: 'POST', body: await request.text() }));
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Console assets are not bound', { status: 404 });
  },
};

function integrationStatus(env) {
  return {
    jira: env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN ? { configured: true, site: env.JIRA_BASE_URL.replace(/^https?:\/\//, ''), project: env.JIRA_PROJECT_KEY || 'SEC', webhook: Boolean(env.JIRA_WEBHOOK_SECRET) } : { configured: false },
    email: env.GMAIL_REFRESH_TOKEN && env.GMAIL_CLIENT_ID ? { configured: true, sender: env.GMAIL_SENDER || null, allowedDomains: (env.MAIL_ALLOWED_DOMAINS || '').split(',').map((d) => d.trim()).filter(Boolean) } : { configured: false },
  };
}

/* ── Jira Cloud REST v3 ──────────────────────────────────────────────── */
function jira(env) {
  const base = env.JIRA_BASE_URL.replace(/\/$/, '');
  const auth = `Basic ${btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`)}`;
  const call = async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, { ...init, headers: { authorization: auth, accept: 'application/json', 'content-type': 'application/json', ...(init.headers || {}) } });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`Jira ${init.method || 'GET'} ${path} -> ${res.status}: ${(body?.errorMessages || []).join('; ') || JSON.stringify(body?.errors || body)}`);
    return body;
  };
  const adf = (text) => ({ type: 'doc', version: 1, content: String(text || ' ').split(/\n{2,}/).map((p) => ({ type: 'paragraph', content: p.trim() ? [{ type: 'text', text: p }] : [] })) });
  const accountIdFor = async (email) => {
    if (!email) return null;
    const users = await call(`/rest/api/3/user/search?query=${encodeURIComponent(email)}`);
    return users?.find((u) => u.accountType === 'atlassian')?.accountId || users?.[0]?.accountId || null;
  };
  return {
    base,
    adf,
    accountIdFor,
    async create({ summary, description, priority, type, labels, assigneeEmail }) {
      const fields = { project: { key: env.JIRA_PROJECT_KEY || 'SEC' }, summary: summary.slice(0, 250), description: adf(description), issuetype: { name: type === 'Incident' ? 'Task' : type || 'Task' }, labels: (labels || ['nhi']).map((l) => l.replace(/\s+/g, '-')) };
      if (priority) fields.priority = { name: priority };
      const accountId = await accountIdFor(assigneeEmail).catch(() => null);
      if (accountId) fields.assignee = { accountId };
      try {
        return await call('/rest/api/3/issue', { method: 'POST', body: JSON.stringify({ fields }) });
      } catch (error) {
        /* Some projects hide priority from the create screen: retry without it. */
        if (fields.priority && /priority/i.test(error.message)) {
          delete fields.priority;
          return call('/rest/api/3/issue', { method: 'POST', body: JSON.stringify({ fields }) });
        }
        throw error;
      }
    },
    async transition(key, statusName) {
      const { transitions } = await call(`/rest/api/3/issue/${key}/transitions`);
      const want = statusName.toLowerCase();
      const cat = { 'to do': 'new', 'in progress': 'indeterminate', 'in review': 'indeterminate', done: 'done' }[want];
      const t = transitions.find((x) => x.to?.name?.toLowerCase() === want) || transitions.find((x) => x.name.toLowerCase() === want) || transitions.find((x) => x.to?.statusCategory?.key === cat);
      if (!t) throw new Error(`No Jira transition to "${statusName}" from the current status`);
      await call(`/rest/api/3/issue/${key}/transitions`, { method: 'POST', body: JSON.stringify({ transition: { id: t.id } }) });
      return t.to?.name || statusName;
    },
    async assign(key, email) {
      const accountId = await accountIdFor(email);
      await call(`/rest/api/3/issue/${key}/assignee`, { method: 'PUT', body: JSON.stringify({ accountId }) });
      return accountId;
    },
    priority: (key, name) => call(`/rest/api/3/issue/${key}`, { method: 'PUT', body: JSON.stringify({ fields: { priority: { name } } }) }),
    comment: (key, text) => call(`/rest/api/3/issue/${key}/comment`, { method: 'POST', body: JSON.stringify({ body: adf(text) }) }),
  };
}

/* ── Gmail API ───────────────────────────────────────────────────────── */
let gmailToken = { value: null, expires: 0 };
async function gmailAccessToken(env) {
  if (gmailToken.value && Date.now() < gmailToken.expires - 60_000) return gmailToken.value;
  const res = await fetch(env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google token exchange failed: ${body.error_description || body.error || res.status}`);
  gmailToken = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return gmailToken.value;
}
const b64url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`);
async function sendGmail(env, { to, cc = [], subject, text, html }) {
  const token = await gmailAccessToken(env);
  const boundary = `b_${crypto.randomUUID()}`;
  const lines = [
    `From: ${env.GMAIL_SENDER_NAME ? `${encodeHeader(env.GMAIL_SENDER_NAME)} <${env.GMAIL_SENDER}>` : env.GMAIL_SENDER || 'me'}`,
    `To: ${to.join(', ')}`,
    ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html || `<pre style="font:14px/1.6 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</pre>`,
    `--${boundary}--`,
  ];
  const res = await fetch(`${env.GMAIL_API_BASE || 'https://gmail.googleapis.com'}/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64url(lines.join('\r\n')) }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Gmail send failed: ${body.error?.message || res.status}`);
  return body.id;
}

/* ── The workspace ───────────────────────────────────────────────────── */
const JIRA_STATUS = (s) => {
  const name = s?.name || '';
  if (/review/i.test(name)) return 'In Review';
  const cat = s?.statusCategory?.key;
  return cat === 'done' ? 'Done' : cat === 'indeterminate' ? 'In Progress' : 'To Do';
};
const nowIso = () => new Date().toISOString();

export class Workspace {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (collection, id))');
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/jira-webhook') return this.onJiraWebhook(await request.json());
    if (url.pathname === '/test') return this.onTest(await request.json());
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peer: crypto.randomUUID(), name: url.searchParams.get('name') || 'Teammate', ref: url.searchParams.get('ref') || null, path: '/' });
    server.send(JSON.stringify({ type: 'snapshot', docs: this.all(), integrations: integrationStatus(this.env) }));
    this.broadcastPeers();
    return new Response(null, { status: 101, webSocket: client });
  }

  all() {
    const out = {};
    for (const row of this.sql.exec('SELECT collection, id, body FROM docs')) (out[row.collection] ??= {})[row.id] = JSON.parse(row.body);
    return out;
  }
  get(collection, id) {
    const row = this.sql.exec('SELECT body FROM docs WHERE collection = ? AND id = ?', collection, id).toArray()[0];
    return row ? JSON.parse(row.body) : null;
  }
  put(collection, id, body, from = null) {
    if (body === null) this.sql.exec('DELETE FROM docs WHERE collection = ? AND id = ?', collection, id);
    else this.sql.exec('INSERT OR REPLACE INTO docs (collection, id, body, updated_at) VALUES (?, ?, ?, ?)', collection, id, JSON.stringify(body), Date.now());
    const msg = JSON.stringify({ type: 'change', collection, id, body });
    for (const ws of this.ctx.getWebSockets()) if (ws !== from) ws.send(msg);
  }
  broadcastPeers() {
    const peers = this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment()).filter(Boolean);
    const msg = JSON.stringify({ type: 'peers', peers });
    for (const ws of this.ctx.getWebSockets()) ws.send(msg);
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'presence') {
      ws.serializeAttachment({ ...ws.deserializeAttachment(), ...msg.patch });
      this.broadcastPeers();
      return;
    }
    if (msg.type !== 'set' && msg.type !== 'delete') return;
    const { collection, id } = msg;
    if (!/^[\w-]{1,40}$/.test(collection) || typeof id !== 'string' || id.length > 200) return;
    const before = this.get(collection, id);
    const body = msg.type === 'delete' ? null : msg.body;
    this.put(collection, id, body, ws);
    ws.send(JSON.stringify({ type: 'ack', collection, id }));
    /* Side effects run after the reply so the console never waits on Jira or Gmail. */
    this.ctx.waitUntil(this.sideEffects(collection, id, before, body).catch((e) => this.recordError(collection, id, e)));
  }
  webSocketClose() {
    this.broadcastPeers();
  }
  webSocketError() {
    this.broadcastPeers();
  }

  recordError(collection, id, error) {
    const doc = this.get(collection, id);
    if (doc) this.put(collection, id, { ...doc, syncError: String(error.message || error).slice(0, 400), syncErrorAt: nowIso() });
  }

  async sideEffects(collection, id, before, after) {
    const env = this.env;
    const jiraOn = env.JIRA_BASE_URL && env.JIRA_API_TOKEN;
    const link = (path) => (env.CONSOLE_ORIGIN ? `${env.CONSOLE_ORIGIN.replace(/\/$/, '')}/#${path}` : '');

    if (collection === 'tickets' && after && jiraOn) {
      const j = jira(env);
      if (!after.jiraKey && !before?.jiraKey) {
        const created = await j.create({
          summary: after.summary,
          description: `${after.description || ''}\n\nRaised from the NHI console by ${after.reporterName || 'a teammate'}.${link('tickets') ? `\n${link('tickets')}` : ''}`,
          priority: after.priority,
          type: after.type,
          labels: after.labels,
          assigneeEmail: after.assigneeEmail,
        });
        const fresh = this.get('tickets', id) || after;
        this.put('tickets', id, { ...fresh, jiraKey: created.key, jiraUrl: `${j.base}/browse/${created.key}`, syncedAt: nowIso(), syncError: null });
        return;
      }
      const key = after.jiraKey || before?.jiraKey;
      if (!key || after.fromJira) return;
      if (before && after.status !== before.status) await j.transition(key, after.status);
      if (before && after.assignee !== before.assignee && after.assigneeEmail) await j.assign(key, after.assigneeEmail);
      if (before && after.priority !== before.priority) await j.priority(key, after.priority);
    }

    if (collection === 'comments' && after && !before && jiraOn && after.target?.startsWith('ticket:') && !after.fromJira) {
      const consoleKey = after.target.slice(7);
      const ticket = Object.values(this.all().tickets || {}).find((t) => t.key === consoleKey || t.jiraKey === consoleKey);
      if (ticket?.jiraKey) await jira(env).comment(ticket.jiraKey, `${after.authorName || 'Teammate'} (NHI console): ${after.body}`);
    }

    if (collection === 'mail' && after && !before && after.deliver && env.GMAIL_REFRESH_TOKEN) {
      const allowed = (env.MAIL_ALLOWED_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
      const ok = (addr) => /.+@.+\..+/.test(addr) && (!allowed.length || allowed.includes(addr.split('@')[1].toLowerCase()));
      /* Jira emails its own assignees; only notices for issues kept in the console go by Gmail. */
      if (after.kind === 'jira' && jiraOn) {
        this.put('mail', id, { ...after, delivery: { status: 'jira', at: nowIso() } });
        return;
      }
      const to = (after.toEmails || []).filter(ok);
      const held = (after.toEmails || []).filter((a) => !ok(a));
      if (!to.length) {
        this.put('mail', id, { ...after, delivery: { status: 'held', held, at: nowIso(), reason: 'No recipient in an allowed domain' } });
        return;
      }
      const footer = after.link && link(after.linkPath || '') ? `\n\nOpen in the console: ${link(after.linkPath)}` : '';
      const gmailId = await sendGmail(env, { to, cc: (after.ccEmails || []).filter(ok), subject: after.subject, text: `${after.body}${footer}` });
      this.put('mail', id, { ...(this.get('mail', id) || after), delivery: { status: 'sent', to, held, gmailId, at: nowIso() } });
    }
  }

  /* Jira → console: status, assignee, priority and comments made in Jira. */
  async onJiraWebhook(event) {
    const issue = event.issue;
    if (!issue?.key) return json({ ok: true, ignored: true });
    const tickets = this.all().tickets || {};
    const [id, ticket] = Object.entries(tickets).find(([, t]) => t.jiraKey === issue.key) || [];
    if (!ticket) return json({ ok: true, ignored: 'not a console issue' });
    const actor = event.user?.displayName || event.comment?.author?.displayName || 'Someone in Jira';
    const patch = {
      status: JIRA_STATUS(issue.fields?.status),
      priority: issue.fields?.priority?.name || ticket.priority,
      summary: issue.fields?.summary || ticket.summary,
      jiraAssignee: issue.fields?.assignee?.displayName || null,
      updatedAt: nowIso(),
      fromJira: true,
    };
    const changed = patch.status !== ticket.status;
    this.put('tickets', id, { ...ticket, ...patch });
    if (changed) {
      const aid = `a-jira-${Date.now().toString(36)}`;
      this.put('activity', aid, { id: aid, at: nowIso(), actor: `jira:${actor}`, verb: 'moved', target: { kind: 'ticket', id: ticket.key }, text: `${issue.key} to ${patch.status} in Jira`, recipients: [ticket.assignee, ticket.reporter].filter(Boolean) });
    }
    if (event.webhookEvent === 'comment_created' && event.comment && !/\(NHI console\):/.test(JSON.stringify(event.comment.body))) {
      const cid = `c-jira-${event.comment.id}`;
      const text = (event.comment.body?.content || []).flatMap((p) => (p.content || []).map((t) => t.text || '')).join('\n') || String(event.comment.body || '');
      this.put('comments', cid, { id: cid, target: `ticket:${ticket.key}`, body: text, author: `jira:${actor}`, at: nowIso(), mentions: [], fromJira: true });
    }
    return json({ ok: true, ticket: ticket.key, status: patch.status });
  }

  /* Settings → Integrations → "Send test": proves the credentials end to end. */
  async onTest({ kind, to }) {
    try {
      if (kind === 'jira') {
        const j = jira(this.env);
        const me = await (await fetch(`${j.base}/rest/api/3/myself`, { headers: { authorization: `Basic ${btoa(`${this.env.JIRA_EMAIL}:${this.env.JIRA_API_TOKEN}`)}`, accept: 'application/json' } })).json();
        return json({ ok: true, detail: `Signed in to Jira as ${me.displayName || me.emailAddress || 'the API user'}` });
      }
      if (kind === 'email') {
        const gmailId = await sendGmail(this.env, { to: [to], subject: 'NHI console: test message', text: 'This is a test from the NHI console. Mail delivery is working.' });
        return json({ ok: true, detail: `Sent to ${to}`, gmailId });
      }
      return json({ ok: false, detail: 'Unknown integration' }, 400);
    } catch (error) {
      return json({ ok: false, detail: String(error.message || error) }, 502);
    }
  }
}
