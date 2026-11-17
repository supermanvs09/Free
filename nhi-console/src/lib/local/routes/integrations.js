/* Integrations: the application hub, AWS accounts, Azure, Jenkins, Vault, GitHub, Bitbucket, Gmail and Jira. */
import { ok, fail, iso, MIN, HOUR } from '../util';
import { ApiError } from '../../api/http';
import * as aws from '../aws';
import { APP_CATALOG, APP_KEYS, HIDDEN_APPS, apps, publicApp, setEnabled, isOn } from '../apps';
import { estate, REPOSITORIES } from '../seed';
import { allFindings } from '../exposureData';
import { save } from '../state';
import { audit } from '../users';
import { can } from '../roles';
import { deliveries, liveEvents } from '../notifyBus';
import { clearEvaluation } from '../postureEngine';
import { jiraIssues } from './remediation';

const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function guard(fn) {
  try {
    return ok(await fn());
  } catch (error) {
    if (error instanceof ApiError) return fail(error.status ?? 400, error.message, error.code, error.field);
    throw error;
  }
}

function inventoryOf(provider) {
  const ids = estate().identities.filter((i) => i.provider === provider);
  const creds = estate().credentials.filter((c) => c.provider === provider);
  if (provider === 'vault') {
    /* A secret store: what is kept there, and how many workloads read it. */
    const stored = estate().credentials.filter((c) => c.store === 'vault');
    const consumers = new Set(stored.flatMap((c) => (c.credential_type === 'access_key' ? (c.bound_identities ?? []).slice(1) : c.bound_identities ?? [])));
    return { identities: 0, credentials: stored.length, secrets: stored.length, consumers: consumers.size };
  }
  return { identities: ids.length, credentials: creds.length };
}

function hubEntry(key) {
  const a = publicApp(key);
  const extra = {};
  if (['aws', 'azure', 'jenkins', 'vault'].includes(key)) {
    Object.assign(extra, inventoryOf(key));
    extra.connections = key === 'aws' ? aws.accountCount() : apps()[key].connections?.length ?? 0;
  }
  if (key === 'github' || key === 'bitbucket') {
    extra.repositories = REPOSITORIES.filter((r) => r.platform === key).length;
    extra.findings = allFindings().filter((f) => f.platform === key && f.list === 'live').length;
  }
  if (key === 'gmail' || key === 'jira') {
    extra.sent_24h = deliveries().filter((d) => d.channel === key && d.status === 'sent' && Date.parse(d.at) > Date.now() - 24 * HOUR).length;
  }
  if (key === 'jira') {
    const issues = jiraIssues();
    extra.issues_open = issues.filter((i) => i.status !== 'Done').length;
    extra.issues_total = issues.length;
    extra.assignees = new Set(issues.map((i) => i.assignee)).size;
  }
  return { ...a, ...extra };
}

const REQUIRED = {
  azure: [['tenant_id', /^[0-9a-f-]{36}$/i, 'Enter the directory (tenant) ID, a GUID.'], ['subscription_id', /^[0-9a-f-]{36}$/i, 'Enter the subscription ID, a GUID.'], ['client_id', /^[0-9a-f-]{36}$/i, 'Enter the application (client) ID, a GUID.']],
  jenkins: [['url', /^https?:\/\/[^\s/]+/i, 'Enter the Jenkins URL, e.g. https://ci.example.com.'], ['username', /^.{2,}$/, 'Enter the user the API token belongs to.'], ['api_token', /^.{8,}$/, 'Paste the API token (Jenkins → your user → Security → API Token).']],
  vault: [['url', /^https?:\/\/[^\s/]+/i, 'Enter the Vault address, e.g. https://vault.example.com:8200.'], ['role_id', /^.{6,}$/, 'Enter the AppRole role_id.'], ['secret_id', /^.{6,}$/, 'Enter the AppRole secret_id.']],
};

const CHECKS = {
  azure: (b) => [
    { key: 'token', label: 'Sign in to Microsoft Entra ID', state: 'pass', message: b.client_secret ? 'Signed in with the client secret.' : 'Signed in with the workload identity federation credential.' },
    { key: 'graph', label: 'Read applications and service principals', state: 'pass', message: 'Application.Read.All and Directory.Read.All granted.' },
    { key: 'arm', label: 'Read the subscription', state: 'pass', message: 'Reader role on the subscription.' },
    { key: 'activity', label: 'Read the activity log', state: 'running', message: 'Waiting for the first sign-in logs (up to 15 minutes).' },
  ],
  jenkins: (b) => [
    { key: 'reach', label: 'Reach the controller', state: 'pass', message: `${new URL(b.url).host} answered.` },
    { key: 'auth', label: 'Sign in with the API token', state: 'pass', message: `Signed in as ${b.username}.` },
    { key: 'creds', label: 'List credential stores', state: 'pass', message: 'Credential IDs and scopes readable (values are never read).' },
    { key: 'audit', label: 'Read the audit trail', state: 'running', message: 'Waiting for the Audit Trail plugin to forward its log.' },
  ],
  vault: (b) => [
    { key: 'reach', label: 'Reach the cluster', state: 'pass', message: `${new URL(b.url).host} unsealed and healthy.` },
    { key: 'auth', label: 'Sign in with AppRole', state: 'pass', message: 'Token issued with policy nhi-discovery.' },
    { key: 'policy', label: 'Read auth methods and roles', state: 'pass', message: 'sys/auth and auth/*/role readable.' },
    { key: 'audit', label: 'Read the audit device', state: 'running', message: 'Waiting for the first audit events.' },
  ],
};

export default function register(r) {
  /* ── Hub ─────────────────────────────────────────────────────────────── */
  /* Gmail and Jira are not offered for now: left out of the hub entirely. */
  const SHOWN = APP_KEYS.filter((k) => !HIDDEN_APPS.has(k));
  /* Jira: the tickets tracking findings, each assigned to the identity's owner. */
  r.get('/api/v1/integrations/jira/issues', () => {
    const a = apps().jira;
    return ok({ site_url: a.site_url, project_key: a.project_key, project_name: a.project_name ?? a.project_key, issues: jiraIssues() });
  });

  r.get('/api/v1/integrations', ({ user }) => ok({ apps: SHOWN.map(hubEntry), catalog: APP_CATALOG.filter((a) => !HIDDEN_APPS.has(a.key)), can_manage: can(user, 'integrations') }));

  r.put('/api/v1/integrations/:key', async ({ params, body, user }) => {
    if (!APP_KEYS.includes(params.key)) return fail(404, 'Unknown application.', 'NOT_FOUND');
    if (!can(user, 'integrations')) return fail(403, 'Only an admin can change integrations.', 'FORBIDDEN');
    const a = apps()[params.key];
    const meta = APP_CATALOG.find((x) => x.key === params.key);
    if (body.enabled !== undefined && Boolean(body.enabled) !== a.enabled) {
      await wait(350);
      setEnabled(params.key, body.enabled, user.email);
      clearEvaluation();
      audit(user, body.enabled ? 'integration.enable' : 'integration.disable', `Switched ${body.enabled ? 'on' : 'off'} ${meta.name}`, { target: params.key });
    }
    if (params.key === 'gmail' && body.settings) {
      const s = body.settings;
      const bad = (s.recipients ?? []).find((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
      if (bad) return fail(400, `${bad} is not an email address.`, 'VALIDATION_ERROR', 'recipients');
      if (s.sender_email !== undefined && s.sender_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.sender_email)) return fail(400, 'Enter the Gmail address alerts are sent from.', 'VALIDATION_ERROR', 'sender_email');
      if (s.app_password !== undefined && s.app_password && String(s.app_password).replace(/\s+/g, '').length < 16) return fail(400, 'An app password is 16 letters. Create one at myaccount.google.com/apppasswords.', 'VALIDATION_ERROR', 'app_password');
      if (s.recipients !== undefined) a.recipients = [...new Set((s.recipients ?? []).map((x) => x.trim().toLowerCase()))];
      Object.assign(a, { min_severity: s.min_severity ?? a.min_severity, events: { ...a.events, ...(s.events ?? {}) }, digest: s.digest ?? a.digest });
      const senderChanged = s.sender_email !== undefined || s.app_password || s.clear_sender;
      if (s.sender_email !== undefined) a.sender_email = String(s.sender_email).trim().toLowerCase();
      if (s.sender_name !== undefined) a.sender_name = String(s.sender_name).trim().slice(0, 80);
      if (s.app_password) a.app_password = String(s.app_password).replace(/\s+/g, '');
      if (s.clear_sender) Object.assign(a, { sender_email: '', sender_name: '', app_password: '' });
      save();
      audit(user, 'integration.update', senderChanged ? (s.clear_sender ? 'Removed the Gmail sender' : `Set the Gmail sender to ${a.sender_email}`) : 'Changed Gmail alert settings', { target: 'gmail' });
    }
    if (params.key === 'jira' && body.settings) {
      const s = body.settings;
      if (s.site_url && !/^https:\/\/[^\s/]+/.test(s.site_url)) return fail(400, 'Enter your Jira site, e.g. https://yourteam.atlassian.net.', 'VALIDATION_ERROR', 'site_url');
      if (s.project_key && !/^[A-Z][A-Z0-9_]{1,9}$/.test(s.project_key)) return fail(400, 'A project key is 2-10 capital letters or digits, e.g. SEC.', 'VALIDATION_ERROR', 'project_key');
      for (const k of ['site_url', 'email', 'project_key', 'issue_type', 'min_severity', 'labels']) if (s[k] !== undefined) a[k] = s[k];
      if (s.site_url) a.site_url = s.site_url.replace(/\/+$/, '');
      if (s.events) a.events = { ...a.events, ...s.events };
      if (s.priority_map) a.priority_map = { ...a.priority_map, ...s.priority_map };
      if (s.api_token) a.api_token = s.api_token;
      if (s.clear_token) a.api_token = '';
      save();
      audit(user, 'integration.update', 'Changed Jira settings', { target: 'jira' });
    }
    return ok(hubEntry(params.key));
  });

  /* Settings the console needs to send (the token stays in this browser). */
  r.get('/api/v1/integrations/jira/credentials', ({ user }) => {
    if (!can(user, 'integrations')) return fail(403, 'Only an admin can read this.', 'FORBIDDEN');
    const a = apps().jira;
    return ok({ site_url: a.site_url, email: a.email, api_token: a.api_token, project_key: a.project_key });
  });

  /* ── Azure, Jenkins, Vault connections ───────────────────────────────── */
  for (const key of ['azure', 'jenkins', 'vault']) {
    r.get(`/api/v1/integrations/${key}/connections`, () => ok({ connections: apps()[key].connections ?? [], inventory: inventoryOf(key) }));

    r.post(`/api/v1/integrations/${key}/verify`, async ({ body, user }) => {
      if (!can(user, 'integrations')) return fail(403, 'Only an admin can change integrations.', 'FORBIDDEN');
      for (const [field, re, msg] of REQUIRED[key]) {
        if (key === 'azure' && field === 'client_id' && !body.client_id) continue;
        if (!re.test(String(body[field] ?? '').trim())) return fail(400, msg, 'VALIDATION_ERROR', field);
      }
      if (key === 'azure' && !body.federated && !body.client_secret) return fail(400, 'Paste the client secret, or choose workload identity federation.', 'VALIDATION_ERROR', 'client_secret');
      await wait(1400);
      const list = apps()[key].connections;
      const id = key === 'azure' ? body.subscription_id : new URL(body.url).host;
      if (list.some((c) => c.id === id)) return fail(409, 'This one is already connected.', 'ALREADY_CONNECTED', key === 'azure' ? 'subscription_id' : 'url');
      const now = iso(Date.now());
      const conn = {
        id,
        name: body.name || (key === 'azure' ? 'New subscription' : new URL(body.url).host),
        ...(key === 'azure' ? { tenant_id: body.tenant_id, client_id: body.client_id, auth: body.federated ? 'federated' : 'client_secret', regions: ['centralindia'] } : {}),
        ...(key === 'jenkins' ? { url: body.url, username: body.username, version: 'Jenkins 2.479.1 LTS', regions: ['on-prem'] } : {}),
        ...(key === 'vault' ? { url: body.url, namespace: body.namespace || '', auth: 'approle', version: 'Vault 1.18', regions: ['on-prem'] } : {}),
        status: 'connected',
        checks: CHECKS[key](body),
        connected_at: now,
        sync: { status: 'queued', last_synced_at: null, last_error: '' },
      };
      list.push(conn);
      save();
      audit(user, 'integration.connect', `Connected ${conn.name} (${key})`, { target: key });
      setTimeout(() => {
        conn.sync.status = 'running';
        save();
        setTimeout(() => {
          conn.sync = { status: 'succeeded', last_synced_at: iso(Date.now()), last_error: '' };
          conn.checks = conn.checks.map((c) => (c.state === 'running' ? { ...c, state: 'pass', message: 'Events arriving.' } : c));
          save();
        }, 9000);
      }, 3000);
      return ok(conn);
    });

    r.post(`/api/v1/integrations/${key}/connections/:id/sync`, ({ params, user }) => {
      const conn = apps()[key].connections.find((c) => c.id === params.id);
      if (!conn) return fail(404, 'Not connected.', 'NOT_FOUND');
      if (['queued', 'running'].includes(conn.sync.status)) return ok({ connection: conn, already_queued: true });
      conn.sync = { ...conn.sync, status: 'running', requested_at: iso(Date.now()), requested_by: user.email };
      save();
      setTimeout(() => {
        conn.sync = { ...conn.sync, status: 'succeeded', last_synced_at: iso(Date.now()) };
        save();
      }, 7000);
      return ok({ connection: conn, already_queued: false });
    });

    r.delete(`/api/v1/integrations/${key}/connections/:id`, ({ params, user }) => {
      if (!can(user, 'integrations')) return fail(403, 'Only an admin can change integrations.', 'FORBIDDEN');
      const list = apps()[key].connections;
      const i = list.findIndex((c) => c.id === params.id);
      if (i < 0) return fail(404, 'Not connected.', 'NOT_FOUND');
      const [gone] = list.splice(i, 1);
      save();
      audit(user, 'integration.disconnect', `Disconnected ${gone.name} (${key})`, { target: key });
      return ok({ id: params.id });
    });
  }

  /* ── GitHub and Bitbucket ────────────────────────────────────────────── */
  r.post('/api/v1/integrations/github/verify', async ({ body, user }) => {
    if (!can(user, 'integrations')) return fail(403, 'Only an admin can change integrations.', 'FORBIDDEN');
    const org = String(body.org ?? '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(org)) return fail(400, 'Enter the organisation name as it appears in github.com/<org>.', 'VALIDATION_ERROR', 'org');
    await wait(1200);
    const g = apps().github;
    Object.assign(g, { org, verified_at: iso(Date.now()), checks: [{ key: 'github_app', label: 'The GitHub App is installed', state: 'pass', message: `NHI Secret Scanner installed on ${org}.` }, { key: 'github_repos', label: 'Repositories are readable', state: 'pass', message: `${REPOSITORIES.filter((x) => x.platform === 'github').length} repositories, contents read-only.` }] });
    save();
    audit(user, 'integration.update', `Verified GitHub organisation ${org}`, { target: 'github' });
    return ok(hubEntry('github'));
  });

  r.post('/api/v1/integrations/bitbucket/verify', async ({ body, user }) => {
    if (!can(user, 'integrations')) return fail(403, 'Only an admin can change integrations.', 'FORBIDDEN');
    if (!/^https:\/\/[^\s/]+/.test(String(body.base_url ?? ''))) return fail(400, 'Enter the Bitbucket address, e.g. https://bitbucket.example.com.', 'VALIDATION_ERROR', 'base_url');
    if (body.token !== undefined && String(body.token).length < 12) return fail(400, 'Paste an HTTP access token with Project read and Repository read.', 'VALIDATION_ERROR', 'token');
    await wait(1200);
    const b = apps().bitbucket;
    Object.assign(b, { base_url: body.base_url.replace(/\/+$/, ''), verified_at: iso(Date.now()), token_expires_at: body.token_expires_at || b.token_expires_at, checks: [{ key: 'bitbucket_reach', label: 'Reach Bitbucket', state: 'pass', message: 'Bitbucket Data Center 9.4.2 answered.' }, { key: 'bitbucket_token', label: 'The token can read projects', state: 'pass', message: `${REPOSITORIES.filter((x) => x.platform === 'bitbucket').length} repositories readable.` }] });
    save();
    audit(user, 'integration.update', 'Verified Bitbucket', { target: 'bitbucket' });
    return ok(hubEntry('bitbucket'));
  });

  /* ── Notifications ───────────────────────────────────────────────────── */
  r.get('/api/v1/notifications/deliveries', ({ query }) => ok({ deliveries: deliveries().filter((d) => !query.channel || d.channel === query.channel).slice(0, Number(query.limit) || 50) }));
  r.get('/api/v1/notifications/live', () => ok({ events: liveEvents().slice(0, 30) }));

  /* ── AWS accounts ────────────────────────────────────────────────────── */
  const A = '/api/v1/integrations/aws';
  r.get(A, () => guard(async () => {
    const d = await aws.getIntegration();
    return { ...d, has_connected_account: true, platforms: { ...d.platforms, github: isOn('github'), bitbucket: isOn('bitbucket') }, exposure_enabled: isOn('github') || isOn('bitbucket') || d.exposure_enabled };
  }));
  r.post(`${A}/verify`, ({ body }) => guard(() => aws.verify(body)));
  r.put(`${A}/accounts/:id/regions`, ({ params, body }) => guard(() => aws.updateRegions(params.id, body)));
  r.put(`${A}/accounts/:id/exposure`, ({ params, body }) => guard(() => aws.setExposure(params.id, body)));
  r.post(`${A}/accounts/:id/sync`, ({ params }) => guard(() => aws.sync(params.id)));
  r.delete(`${A}/accounts/:id/sync`, ({ params }) => guard(async () => ({ account: await aws.cancelSync(params.id) })));
  r.delete(`${A}/accounts/:id`, ({ params }) => guard(() => aws.remove(params.id)));
}

export { MIN };
