/*
 * Real-time alerts. New detections (an exposed credential, a behaviour
 * departure, a score drop, newly discovered identities) arrive here as they
 * are found. Each one becomes an alert in the inbox and a toast in the open
 * console, and is sent to Gmail (through Amazon SES) and Jira when those are
 * switched on and the alert matches their rules.
 *
 * One tab of the browser does the watching and the sending (it holds a Web
 * Lock); the others see the result through the shared state.
 */
import { apps, isOn } from './apps';
import { slice, save, onStateChange } from './state';
import { estate, scopeById } from './seed';
import { sendEmail, createJiraIssue } from '../notify';
import { postureId } from './postureEngine';
import { iso, MIN } from './util';
import { genomeRouteFor } from '../identityLinks';

const SEV_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
const listeners = new Set();

export const liveEvents = () => slice('liveEvents', () => []);
export const deliveries = () => slice('deliveries', () => []);
const cursor = () => slice('liveCursor', () => ({ next: 0, last: 0 }));

export function onLiveEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const byName = (name) => estate().identities.find((i) => i.name === name);

/* What the watchers will find next, in order. */
const UPCOMING = [
  { kind: 'exposure', severity: 'CRITICAL', who: 'svc-airflow-scheduler', title: 'AWS access key committed to DATA/airflow-dags', summary: 'An active access key for svc-airflow-scheduler was pushed to dags/s3_export.py on master by Sashi Kumar.', facts: { platform: 'bitbucket', repository: 'DATA/airflow-dags', file: 'dags/s3_export.py', line: 41, branch: 'master', redacted: 'AKIA************7QXK', verification: 'verified' } },
  { kind: 'anomaly', severity: 'CRITICAL', who: 'fraud-scoring-api', title: 'fraud-scoring-api assumed a role from a Tor exit node', summary: 'sts:AssumeRole from 185.220.101.47 into account 739204185562, never seen in 14 days of baseline. 6 AccessDenied errors followed.', facts: { dimension: 'source_ip', value: '185.220.101.47' } },
  { kind: 'posture', severity: 'HIGH', who: 'sp-pos-terminal-sync', title: 'sp-pos-terminal-sync dropped from Fair to Poor', summary: 'Score 72 → 47: its client secret expires in 9 days and it still holds Directory.ReadWrite.All.', facts: { score_before: 72, score_now: 47 } },
  { kind: 'exposure', severity: 'HIGH', who: 'jenkins-svc-bot', title: 'Jenkins API token found in OPS/jenkins-shared-lib', summary: 'The release bot’s API token is hard-coded in vars/publishRelease.groovy.', facts: { platform: 'bitbucket', repository: 'OPS/jenkins-shared-lib', file: 'vars/publishRelease.groovy', line: 18, branch: 'master', redacted: '11d4************************a9f3', verification: 'unknown' } },
  { kind: 'anomaly', severity: 'HIGH', who: 'approle/jenkins-ci', title: 'approle/jenkins-ci read payments secrets for the first time', summary: 'Read secret/data/payments/npci and secret/data/payments/hsm, outside every path in its 14-day baseline.', facts: { dimension: 'resource', value: 'secret/data/payments/*' } },
  { kind: 'posture', severity: 'CRITICAL', who: 'terraform-runner', title: 'terraform-runner can now pass any role', summary: 'A new inline policy allows iam:PassRole on *. Score 61 → 36.', facts: { score_before: 61, score_now: 36 } },
  { kind: 'scan', severity: 'MEDIUM', who: 'mi-payments-aks', title: '3 new identities discovered in Payments-Prod', summary: 'Two managed identities and one service principal appeared in the Azure subscription since the last scan.', facts: {} },
];

export function emitEvent(partial) {
  const identity = partial.identity ?? (partial.who ? byName(partial.who) : null);
  const event = {
    id: partial.id ?? `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind: partial.kind,
    severity: partial.severity,
    title: partial.title,
    summary: partial.summary ?? '',
    facts: partial.facts ?? {},
    detected_at: iso(Date.now()),
    identity: identity ? { id: identity.id, name: identity.name, provider: identity.provider, arn: identity.arn, account_id: identity.account_id, account_name: scopeById(identity.account_id)?.name, region: identity.region, identity_type: identity.identity_type } : null,
    link: linkFor(partial.kind, identity),
  };
  liveEvents().unshift(event);
  if (liveEvents().length > 60) liveEvents().length = 60;
  save();
  for (const fn of listeners) fn(event);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('alerts:refresh'));
  dispatch(event);
  return event;
}

function linkFor(kind, identity) {
  if (!identity) return '/alerts';
  if (kind === 'exposure') return '/exposure';
  if (kind === 'posture') return `/posture/${postureId(identity)}`;
  if (kind === 'anomaly') return genomeRouteFor(identity) ?? '/genome';
  return `/identities/${identity.id}`;
}

const providerName = { aws: 'AWS', azure: 'Azure', jenkins: 'Jenkins', vault: 'Vault' };
const kindName = { exposure: 'Exposed credential', anomaly: 'Behaviour anomaly', posture: 'Posture drop', scan: 'Discovery' };

function matches(cfg, event) {
  return SEV_RANK[event.severity] >= SEV_RANK[cfg.min_severity ?? 'HIGH'] && cfg.events?.[event.kind] !== false;
}

/* ── Email ─────────────────────────────────────────────────────────────── */
const COLORS = { CRITICAL: '#b42318', HIGH: '#b54a07', MEDIUM: '#8f5f02', LOW: '#05734b' };
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
export function emailFor(event) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}${event.link}`;
  const who = event.identity;
  const subject = `[${event.severity}] ${event.title}`;
  const rows = [
    ['Type', kindName[event.kind]],
    who && ['Identity', `${who.name} (${providerName[who.provider]})`],
    who && ['Where', `${who.account_name ?? who.account_id} · ${who.region}`],
    ['Detected', new Date(event.detected_at).toUTCString()],
  ].filter(Boolean);
  const text = `${event.title}\n\n${event.summary}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nOpen in the console: ${url}\n`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#f4f5f7;font-family:Inter,Segoe UI,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px">
<tr><td style="padding:20px 24px 4px"><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;color:${COLORS[event.severity]};background:${COLORS[event.severity]}14">${esc(event.severity)}</span>
<span style="font-size:12px;color:#737373;margin-left:6px">${esc(kindName[event.kind])}</span></td></tr>
<tr><td style="padding:6px 24px 0;font-size:17px;font-weight:600;line-height:1.35">${esc(event.title)}</td></tr>
<tr><td style="padding:8px 24px 0;font-size:14px;line-height:1.55;color:#404040">${esc(event.summary)}</td></tr>
<tr><td style="padding:16px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">
${rows.map(([k, v]) => `<tr><td style="padding:5px 0;color:#737373;width:110px">${esc(k)}</td><td style="padding:5px 0;color:#171717">${esc(v)}</td></tr>`).join('')}
</table></td></tr>
<tr><td style="padding:20px 24px 24px"><a href="${esc(url)}" style="display:inline-block;background:#1d63ed;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px">Open in the console</a></td></tr>
</table>
<p style="font-size:11px;color:#a3a3a3;margin:12px 0 0">You get this because your address is on the alert list in Integrations → Gmail.</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}

/* ── Jira ──────────────────────────────────────────────────────────────── */
export function jiraIssueFor(event, cfg) {
  const who = event.identity;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return {
    site_url: cfg.site_url,
    email: cfg.email,
    api_token: cfg.api_token,
    project_key: cfg.project_key,
    issue_type: cfg.issue_type || 'Bug',
    priority: cfg.priority_map?.[event.severity],
    labels: [...(cfg.labels ?? []), `nhi-${event.kind}`, `nhi-${event.id}`],
    dedupe_label: `nhi-${event.id}`,
    summary: `[NHI ${event.severity}] ${event.title}`.slice(0, 250),
    description: [
      event.summary,
      '',
      who ? `Identity: ${who.name} (${providerName[who.provider]})` : null,
      who ? `ARN / ID: ${who.arn}` : null,
      who ? `Where: ${who.account_name ?? who.account_id} · ${who.region}` : null,
      `Detected: ${event.detected_at}`,
      '',
      `Open in the console: ${origin}${event.link}`,
    ]
      .filter((x) => x !== null)
      .join('\n'),
  };
}

function record(entry) {
  deliveries().unshift({ id: `dlv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: iso(Date.now()), ...entry });
  if (deliveries().length > 100) deliveries().length = 100;
  save();
}

async function dispatch(event) {
  if (!leader) return;
  const a = apps();
  if (isOn('gmail') && a.gmail.recipients?.length && matches(a.gmail, event)) {
    const mail = emailFor(event);
    const res = await sendEmail({ to: a.gmail.recipients, ...mail });
    record({ channel: 'gmail', event_id: event.id, title: event.title, severity: event.severity, to: a.gmail.recipients.join(', '), status: res.ok ? 'sent' : 'failed', message: res.ok ? `Sent (SES message ${res.message_id ?? ''})`.trim() : res.message, message_id: res.message_id ?? null });
  }
  if (isOn('jira') && a.jira.site_url && a.jira.project_key && matches(a.jira, event)) {
    const res = await createJiraIssue(jiraIssueFor(event, a.jira));
    record({ channel: 'jira', event_id: event.id, title: event.title, severity: event.severity, to: a.jira.project_key, status: res.ok ? 'sent' : 'failed', message: res.ok ? `${res.updated ? 'Updated' : 'Created'} ${res.key}` : res.message, issue_key: res.key ?? null, issue_url: res.url ?? null });
  }
}

/* ── The watcher ───────────────────────────────────────────────────────── */
let leader = false;
let timer = null;
const FIRST_AFTER = 50 * 1000;
const EVERY = 4 * MIN;

function tick() {
  const c = cursor();
  if (c.next >= UPCOMING.length) return;
  const spec = UPCOMING[c.next];
  c.next += 1;
  c.last = Date.now();
  save();
  emitEvent(spec);
}

function schedule() {
  clearTimeout(timer);
  const c = cursor();
  if (c.next >= UPCOMING.length) return;
  const since = Date.now() - (c.last || 0);
  const wait = c.last ? Math.max(5000, EVERY - since) : FIRST_AFTER;
  timer = setTimeout(() => {
    tick();
    schedule();
  }, wait);
}

/** Starts watching in the tab that holds the lock. Safe to call more than once. */
export function startWatching() {
  if (typeof window === 'undefined' || startWatching.started) return;
  startWatching.started = true;
  const become = () => {
    leader = true;
    schedule();
    return new Promise(() => {}); /* held until the tab closes */
  };
  if (navigator.locks?.request) navigator.locks.request('nhi.live.watcher', become);
  else become();
  /* Other tabs: show the toast when the leader adds an event. */
  let seen = liveEvents()[0]?.id;
  onStateChange(() => {
    const top = liveEvents()[0];
    if (!leader && top && top.id !== seen) {
      seen = top.id;
      for (const fn of listeners) fn(top);
      window.dispatchEvent(new CustomEvent('alerts:refresh'));
    }
  });
}

/** "Sync now" finds the next detection straight away. */
export function detectNow() {
  if (!leader) return;
  tick();
  schedule();
}

export function testEvent() {
  const who = byName('upi-payment-processor');
  return {
    id: `evt_test_${Date.now().toString(36)}`,
    kind: 'exposure',
    severity: 'HIGH',
    title: 'Test alert from the NHI console',
    summary: 'This is a test. Real alerts look like this, with the identity, where it lives and a link back to the console.',
    facts: {},
    detected_at: iso(Date.now()),
    identity: who ? { id: who.id, name: who.name, provider: who.provider, arn: who.arn, account_id: who.account_id, account_name: scopeById(who.account_id)?.name, region: who.region } : null,
    link: '/alerts',
  };
}

export { record as recordDelivery };
