#!/usr/bin/env node
/*
 * NHI console notification relay.
 *
 * The console runs entirely in the browser. The one thing a browser cannot do
 * safely is send email through Amazon SES (that needs AWS credentials) or call
 * Jira Cloud (which refuses cross-site browser calls). This small process does
 * both, and nothing else. It runs next to nginx in the console's container;
 * nginx forwards /notify-api/* to it.
 *
 * No dependencies: Node 18+ only (fetch, crypto). No database, no state on disk.
 *
 * AWS credentials come from the environment the service runs in, in this order:
 *   1. AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY [/ AWS_SESSION_TOKEN]
 *   2. ECS task role / EKS Pod Identity (AWS_CONTAINER_CREDENTIALS_RELATIVE_URI or _FULL_URI)
 *   3. EKS IRSA (AWS_WEB_IDENTITY_TOKEN_FILE + AWS_ROLE_ARN)
 *   4. EC2 instance profile (IMDSv2)
 * so attaching a role with ses:SendEmail to the service is all that is needed.
 *
 * Environment
 *   MAIL_FROM                   required for email, e.g. alerts@deepalgorithms.ai (a verified SES identity)
 *   MAIL_FROM_NAME              optional display name, default "NHI Security"
 *   AWS_REGION / SES_REGION     SES region, default ap-south-1
 *   SES_CONFIGURATION_SET       optional SES configuration set
 *   ALLOWED_RECIPIENT_DOMAINS   optional comma list; when set, mail only goes to these domains
 *   ALLOWED_ORIGINS             optional comma list of console origins allowed to call the relay
 *   RATE_LIMIT_PER_MIN          per client IP, default 30
 *   JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN
 *                               optional: a server-side Jira account. When set, it is used
 *                               instead of the one entered in the console.
 *   JIRA_ALLOWED_HOSTS          optional comma list of Jira hosts; default *.atlassian.net
 *                               (Jira Data Center: list its host here)
 *   PORT                        default 8787
 *   HOST                        default 127.0.0.1 (only nginx in the same container reaches it)
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const env = process.env;
const PORT = Number(env.PORT || 8787);
const HOST = env.HOST || '127.0.0.1';
const REGION = env.SES_REGION || env.AWS_REGION || env.AWS_DEFAULT_REGION || 'ap-south-1';
const MAIL_FROM = (env.MAIL_FROM || '').trim();
const MAIL_FROM_NAME = (env.MAIL_FROM_NAME || 'NHI Security').trim();
const ALLOWED_DOMAINS = list(env.ALLOWED_RECIPIENT_DOMAINS).map((d) => d.toLowerCase().replace(/^@/, ''));
const ALLOWED_ORIGINS = list(env.ALLOWED_ORIGINS);
const JIRA_HOSTS = list(env.JIRA_ALLOWED_HOSTS);
const RATE = Number(env.RATE_LIMIT_PER_MIN || 30);
const SES_ENDPOINT = env.SES_ENDPOINT || `https://email.${REGION}.amazonaws.com`;
const MAX_BODY = 256 * 1024;
const EMAIL = /^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]+$/;

function list(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const log = (level, msg, extra = {}) => process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra })}\n`);

/* ── AWS credentials ───────────────────────────────────────────────────── */
let cached = null;

async function credentials() {
  if (cached && (!cached.expiration || cached.expiration - Date.now() > 5 * 60 * 1000)) return cached;
  cached = await resolveCredentials();
  return cached;
}

async function resolveCredentials() {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY, sessionToken: env.AWS_SESSION_TOKEN || null, source: 'env' };
  }
  if (env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || env.AWS_CONTAINER_CREDENTIALS_FULL_URI) {
    const url = env.AWS_CONTAINER_CREDENTIALS_FULL_URI || `http://169.254.170.2${env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`;
    const headers = {};
    let token = env.AWS_CONTAINER_AUTHORIZATION_TOKEN;
    if (!token && env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE) token = (await fs.readFile(env.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE, 'utf8')).trim();
    if (token) headers.Authorization = token;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`container credentials endpoint answered ${res.status}`);
    const c = await res.json();
    return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.Token, expiration: Date.parse(c.Expiration) || null, source: 'role' };
  }
  if (env.AWS_WEB_IDENTITY_TOKEN_FILE && env.AWS_ROLE_ARN) {
    const token = (await fs.readFile(env.AWS_WEB_IDENTITY_TOKEN_FILE, 'utf8')).trim();
    const qs = new URLSearchParams({ Action: 'AssumeRoleWithWebIdentity', Version: '2011-06-15', RoleArn: env.AWS_ROLE_ARN, RoleSessionName: env.AWS_ROLE_SESSION_NAME || 'nhi-notify-relay', WebIdentityToken: token });
    const res = await fetch(`https://sts.${REGION}.amazonaws.com/?${qs}`, { signal: AbortSignal.timeout(5000) });
    const xml = await res.text();
    if (!res.ok) throw new Error(`sts AssumeRoleWithWebIdentity answered ${res.status}`);
    const tag = (t) => (new RegExp(`<${t}>([^<]+)</${t}>`).exec(xml) || [])[1];
    return { accessKeyId: tag('AccessKeyId'), secretAccessKey: tag('SecretAccessKey'), sessionToken: tag('SessionToken'), expiration: Date.parse(tag('Expiration')) || null, source: 'role' };
  }
  /* EC2 instance profile through IMDSv2. */
  const imds = 'http://169.254.169.254/latest';
  const tokenRes = await fetch(`${imds}/api/token`, { method: 'PUT', headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '300' }, signal: AbortSignal.timeout(1500) });
  if (!tokenRes.ok) throw new Error('no AWS credentials: set a task/instance role or AWS_ACCESS_KEY_ID');
  const t = await tokenRes.text();
  const h = { 'X-aws-ec2-metadata-token': t };
  const role = (await (await fetch(`${imds}/meta-data/iam/security-credentials/`, { headers: h, signal: AbortSignal.timeout(1500) })).text()).split('\n')[0];
  const c = await (await fetch(`${imds}/meta-data/iam/security-credentials/${role}`, { headers: h, signal: AbortSignal.timeout(1500) })).json();
  return { accessKeyId: c.AccessKeyId, secretAccessKey: c.SecretAccessKey, sessionToken: c.Token, expiration: Date.parse(c.Expiration) || null, source: 'role' };
}

/* ── Signature Version 4 ───────────────────────────────────────────────── */
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const encodeRfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function signV4({ method, url, headers = {}, body = '', service, region, creds, now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const all = { ...headers, host: u.host, 'x-amz-date': amzDate };
  if (creds.sessionToken) all['x-amz-security-token'] = creds.sessionToken;
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const names = Object.keys(lower).sort();
  const canonicalHeaders = names.map((k) => `${k}:${lower[k]}\n`).join('');
  const signedHeaders = names.join(';');
  const path = u.pathname.split('/').map((seg) => encodeRfc3986(decodeURIComponent(seg))).join('/') || '/';
  const query = [...u.searchParams.entries()]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonical = [method.toUpperCase(), path, query, canonicalHeaders, signedHeaders, sha256(body)].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kDate = hmac(`AWS4${creds.secretAccessKey}`, date);
  const kSigning = hmac(hmac(hmac(kDate, region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  const out = { ...all, Authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` };
  return out;
}

/* ── SES ───────────────────────────────────────────────────────────────── */
async function sendEmail({ to, subject, text, html }) {
  if (!MAIL_FROM) throw httpError(503, 'MAIL_FROM is not set on the relay.', 'NOT_CONFIGURED');
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) throw httpError(400, 'Add at least one recipient.', 'NO_RECIPIENTS');
  if (recipients.length > 50) throw httpError(400, 'At most 50 recipients per alert.', 'TOO_MANY_RECIPIENTS');
  const bad = recipients.find((r) => !EMAIL.test(r));
  if (bad) throw httpError(400, `${bad} is not an email address.`, 'BAD_RECIPIENT');
  if (ALLOWED_DOMAINS.length) {
    const outside = recipients.find((r) => !ALLOWED_DOMAINS.includes(r.split('@')[1]));
    if (outside) throw httpError(403, `${outside} is outside the domains this relay may email (${ALLOWED_DOMAINS.join(', ')}).`, 'RECIPIENT_NOT_ALLOWED');
  }
  if (!subject || String(subject).length > 300) throw httpError(400, 'A subject of up to 300 characters is required.', 'BAD_SUBJECT');
  const payload = {
    FromEmailAddress: MAIL_FROM_NAME ? `${MAIL_FROM_NAME.replace(/[<>"]/g, '')} <${MAIL_FROM}>` : MAIL_FROM,
    Destination: { ToAddresses: recipients },
    Content: {
      Simple: {
        Subject: { Data: String(subject).replace(/[\r\n]+/g, ' '), Charset: 'UTF-8' },
        Body: {
          ...(text ? { Text: { Data: String(text).slice(0, 100000), Charset: 'UTF-8' } } : {}),
          ...(html ? { Html: { Data: String(html).slice(0, 200000), Charset: 'UTF-8' } } : {}),
        },
      },
    },
    ...(env.SES_CONFIGURATION_SET ? { ConfigurationSetName: env.SES_CONFIGURATION_SET } : {}),
  };
  const body = JSON.stringify(payload);
  const url = `${SES_ENDPOINT}/v2/email/outbound-emails`;
  let creds;
  try {
    creds = await credentials();
  } catch (error) {
    throw httpError(503, `The relay has no AWS credentials: ${error.message}`, 'NO_CREDENTIALS');
  }
  const headers = signV4({ method: 'POST', url, headers: { 'content-type': 'application/json' }, body, service: 'ses', region: REGION, creds });
  const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 403) cached = null;
    const message = data.message || data.Message || `SES answered ${res.status}`;
    throw httpError(res.status === 400 || res.status === 403 ? res.status : 502, `SES refused the email: ${message}`, data.__type || data.code || 'SES_ERROR');
  }
  return { message_id: data.MessageId, from: MAIL_FROM, to: recipients };
}

/* ── Jira ──────────────────────────────────────────────────────────────── */
function jiraConfig(input = {}) {
  const server = env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN;
  const site = String(server ? env.JIRA_BASE_URL : input.site_url || '').replace(/\/+$/, '');
  const email = server ? env.JIRA_EMAIL : input.email;
  const token = server ? env.JIRA_API_TOKEN : input.api_token;
  let host;
  try {
    const u = new URL(site);
    if (u.protocol !== 'https:' && !(env.JIRA_INSECURE_HTTP === 'true' && JIRA_HOSTS.includes(u.host))) throw new Error();
    host = u.host;
  } catch {
    throw httpError(400, 'Enter your Jira site as https://yourteam.atlassian.net.', 'BAD_SITE');
  }
  const allowed = JIRA_HOSTS.length ? JIRA_HOSTS.includes(host) : host.endsWith('.atlassian.net');
  if (!allowed) throw httpError(403, `${host} is not a Jira host this relay may call.`, 'HOST_NOT_ALLOWED');
  if (!email || !token) throw httpError(400, 'The Jira account email and API token are required.', 'NO_TOKEN');
  const project = String(input.project_key || '').trim();
  if (!/^[A-Z][A-Z0-9_]{1,9}$/.test(project)) throw httpError(400, 'A project key is 2-10 capital letters or digits.', 'BAD_PROJECT');
  return { site, project, auth: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` };
}

async function jira(cfg, method, path, body) {
  const res = await fetch(`${cfg.site}${path}`, {
    method,
    headers: { Authorization: cfg.auth, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.errorMessages?.join(' ') || Object.values(data.errors || {}).join(' ') || data.message || `Jira answered ${res.status}`;
    const error = httpError(res.status === 401 ? 401 : res.status === 403 ? 403 : res.status === 404 ? 404 : 502, res.status === 401 ? 'Jira did not accept the email and API token.' : detail, `JIRA_${res.status}`);
    error.jira = data;
    throw error;
  }
  return data;
}

const adf = (text) => ({
  type: 'doc',
  version: 1,
  content: String(text || '')
    .split('\n')
    .map((line) => {
      const url = /(https?:\/\/\S+)/.exec(line);
      if (!line.trim()) return { type: 'paragraph', content: [] };
      if (!url) return { type: 'paragraph', content: [{ type: 'text', text: line }] };
      const [before, after] = [line.slice(0, url.index), line.slice(url.index + url[1].length)];
      return { type: 'paragraph', content: [...(before ? [{ type: 'text', text: before }] : []), { type: 'text', text: url[1], marks: [{ type: 'link', attrs: { href: url[1] } }] }, ...(after ? [{ type: 'text', text: after }] : [])] };
    }),
});

async function jiraTest(input) {
  const cfg = jiraConfig(input);
  const me = await jira(cfg, 'GET', '/rest/api/3/myself');
  const project = await jira(cfg, 'GET', `/rest/api/3/project/${encodeURIComponent(cfg.project)}`);
  return { account_name: me.displayName, project_name: project.name, issue_types: (project.issueTypes || []).filter((t) => !t.subtask).map((t) => t.name) };
}

async function jiraIssue(input) {
  const cfg = jiraConfig(input);
  const labels = (Array.isArray(input.labels) ? input.labels : []).map((l) => String(l).replace(/\s+/g, '-').slice(0, 255)).filter(Boolean).slice(0, 10);
  const dedupe = String(input.dedupe_label || '').replace(/[^\w.-]/g, '');
  if (dedupe) {
    const jql = `project = "${cfg.project}" AND labels = "${dedupe}" ORDER BY created DESC`;
    let found = null;
    try {
      const r = await jira(cfg, 'POST', '/rest/api/3/search/jql', { jql, maxResults: 1, fields: ['key'] });
      found = r.issues?.[0];
    } catch {
      const r = await jira(cfg, 'GET', `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=1&fields=key`).catch(() => null);
      found = r?.issues?.[0] ?? null;
    }
    if (found) {
      await jira(cfg, 'POST', `/rest/api/3/issue/${found.key}/comment`, { body: adf(`The alert fired again.\n\n${input.description || ''}`) });
      return { key: found.key, url: `${cfg.site}/browse/${found.key}`, updated: true };
    }
  }
  const fields = {
    project: { key: cfg.project },
    summary: String(input.summary || 'NHI alert').replace(/[\r\n]+/g, ' ').slice(0, 250),
    issuetype: { name: String(input.issue_type || 'Bug') },
    description: adf(input.description),
    labels,
    ...(input.priority ? { priority: { name: String(input.priority) } } : {}),
  };
  let created;
  try {
    created = await jira(cfg, 'POST', '/rest/api/3/issue', { fields });
  } catch (error) {
    /* Some projects hide the priority field: try once without it. */
    if (fields.priority && error.jira?.errors?.priority) {
      delete fields.priority;
      created = await jira(cfg, 'POST', '/rest/api/3/issue', { fields });
    } else throw error;
  }
  return { key: created.key, url: `${cfg.site}/browse/${created.key}`, updated: false };
}

/* ── HTTP ──────────────────────────────────────────────────────────────── */
function httpError(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(httpError(413, 'Request too large.', 'TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(httpError(400, 'Send JSON.', 'BAD_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://relay').pathname.replace(/^\/notify-api/, '');
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    if (req.method === 'GET' && path === '/health') {
      let credentialsSource = null;
      let credentialsError = null;
      try {
        credentialsSource = (await credentials()).source;
      } catch (error) {
        credentialsError = error.message;
      }
      const ok = Boolean(MAIL_FROM) && Boolean(credentialsSource);
      return send(res, 200, {
        ok,
        from: MAIL_FROM || null,
        region: REGION,
        credentials: credentialsSource,
        allowed_domains: ALLOWED_DOMAINS,
        jira_server_token: Boolean(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN),
        message: ok ? 'ready' : !MAIL_FROM ? 'MAIL_FROM is not set on the relay.' : `No AWS credentials: ${credentialsError}`,
      });
    }
    if (req.method !== 'POST') throw httpError(405, 'Not allowed.', 'METHOD');
    const origin = req.headers.origin;
    if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin)) throw httpError(403, 'This origin may not use the relay.', 'ORIGIN');
    if (!String(req.headers['content-type'] || '').includes('application/json')) throw httpError(415, 'Send JSON.', 'CONTENT_TYPE');
    if (limited(ip)) throw httpError(429, 'Too many notifications from this client. Try again in a minute.', 'RATE_LIMITED');
    const body = await readBody(req);
    if (path === '/email') {
      const out = await sendEmail(body);
      log('info', 'email sent', { to: out.to.length, message_id: out.message_id });
      return send(res, 200, { ok: true, ...out });
    }
    if (path === '/jira/test') return send(res, 200, { ok: true, ...(await jiraTest(body)) });
    if (path === '/jira/issue') {
      const out = await jiraIssue(body);
      log('info', out.updated ? 'jira issue updated' : 'jira issue created', { key: out.key });
      return send(res, 200, { ok: true, ...out });
    }
    throw httpError(404, 'Not found.', 'NOT_FOUND');
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) log('error', error.message, { path });
    send(res, status, { ok: false, error: error.code || 'ERROR', message: status >= 500 && !error.status ? 'The relay failed.' : error.message });
  }
});

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  server.listen(PORT, HOST, () => log('info', 'notify relay listening', { host: HOST, port: PORT, region: REGION, from: MAIL_FROM || '(MAIL_FROM not set)' }));
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
}

export { server };
