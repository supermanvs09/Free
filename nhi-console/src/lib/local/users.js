/* People who can sign in, their sessions, and the audit log of what they did. */
import { ORG, PEOPLE } from './seed';
import { save, slice, state } from './state';
import { DAY, HOUR, MIN, NOW, ago, iso, rng } from './util';

export const DEFAULT_PASSWORD = 'Welcome@2026';

export function users() {
  return slice('users', () =>
    PEOPLE.map((p, i) => ({
      id: `usr_${String(i + 1).padStart(3, '0')}`,
      email: p.email,
      full_name: p.name,
      team: p.team,
      department: p.department,
      role: p.role,
      status: p.key === 'meghana' ? 'inactive' : 'active',
      tenant_id: ORG.tenantId,
      created_at: ago((420 - i * 23) * DAY),
      last_login_at: p.key === 'meghana' ? ago(64 * DAY) : ago((i * 7 + 3) * HOUR),
      password: DEFAULT_PASSWORD,
      created_by: i < 2 ? 'system' : PEOPLE[0].email,
    })),
  );
}

export const publicUser = (u) => {
  if (!u) return null;
  const { password: _p, ...rest } = u;
  return rest;
};

export const findUser = (email) => users().find((u) => u.email.toLowerCase() === String(email ?? '').trim().toLowerCase());

/* One session for the browser, the stand-in for the refresh cookie: kept in
   the shared state so every tab sees the same one. */
export function startSession(user) {
  const token = `nhi_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  user.last_login_at = iso(Date.now());
  setSession({ token, user_id: user.id, started_at: iso(Date.now()) });
  return token;
}

export function activeSession() {
  return state().session ?? null;
}
export function setSession(value) {
  state().session = value;
  save();
}

export function currentUser(authorization) {
  const s = activeSession();
  if (!s) return null;
  const token = String(authorization ?? '').replace(/^Bearer\s+/i, '');
  if (token && token !== s.token) return null;
  if (!token) return null;
  const u = users().find((x) => x.id === s.user_id);
  return u && u.status === 'active' ? u : null;
}

export function sessionUser() {
  const s = activeSession();
  return s ? users().find((x) => x.id === s.user_id) ?? null : null;
}

/* ── Audit log ─────────────────────────────────────────────────────────── */
const SEEDED_ACTIONS = [
  ['auth.login', 'Signed in', 'success'],
  ['integration.sync', 'Synced AWS account 482915736104', 'success'],
  ['finding.accept', 'Accepted posture finding "Access key older than 90 days"', 'success'],
  ['exposure.decision', 'Marked a GitHub finding as a real secret', 'success'],
  ['remediation.plan.create', 'Created a plan to remove unused permissions', 'success'],
  ['remediation.plan.approve', 'Approved remediation plan', 'success'],
  ['anomaly.feedback', 'Marked an anomaly as legitimate', 'success'],
  ['user.update', 'Changed a role to Analyst', 'success'],
  ['auth.login', 'Sign-in failed: wrong password', 'failure'],
  ['integration.enable', 'Switched on Azure', 'success'],
  ['integration.enable', 'Switched on HashiCorp Vault', 'success'],
  ['scan.run', 'Started a discovery scan', 'success'],
  ['export.csv', 'Exported identity posture to CSV', 'success'],
  ['notification.test', 'Sent a test email', 'success'],
];
const PATHS = { 'auth.login': '/api/v1/login', 'integration.sync': '/api/v1/integrations/aws/accounts/482915736104/sync', 'finding.accept': '/api/v1/ispm/findings/{id}', 'exposure.decision': '/api/v1/credential-exposure/decisions', 'remediation.plan.create': '/api/v1/remediation/plans', 'remediation.plan.approve': '/api/v1/remediation/plans/{id}/approve', 'anomaly.feedback': '/api/v1/genome/anomalies/{id}/feedback', 'user.update': '/api/v1/users/{id}', 'integration.enable': '/api/v1/integrations/{app}', 'scan.run': '/scan-api/api/v1/scan/start', 'export.csv': '/api/v1/ispm/posture/export', 'notification.test': '/notify-api/email' };
const SCREENS = ['/overview', '/posture', '/identities', '/integrations', '/exposure', '/remediation', '/genome', '/settings/users'];

export function auditLog() {
  return slice('audit', () => {
    const r = rng(77);
    const people = PEOPLE.filter((p) => p.key !== 'meghana');
    const out = [];
    for (let i = 0; i < 140; i += 1) {
      const [action, summary, outcome] = r.pick(SEEDED_ACTIONS);
      const p = r.pick(people);
      out.push({
        id: `aud_${(1000 + i).toString(36)}${r.hex(6)}`,
        at: iso(NOW - i * r.int(25, 190) * MIN),
        method: action.startsWith('auth') ? 'POST' : action.includes('update') || action.includes('accept') ? 'PATCH' : 'POST',
        path: PATHS[action] ?? '/api/v1/' + action.split('.')[0],
        details: action === 'user.update' ? { role: 'analyst' } : action === 'integration.enable' ? { enabled: true } : {},
        error_code: outcome === 'failure' ? 'INVALID_CREDENTIALS' : null,
        actor: p.email,
        actor_name: p.name,
        actor_role: p.role,
        action,
        summary,
        outcome,
        ip: r.pick(['106.51.73.220', '49.37.142.8', '103.211.18.4', '27.59.110.62']),
        screen: r.pick(SCREENS),
        target: action.startsWith('integration') ? 'aws:482915736104' : '',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      });
    }
    return out;
  });
}

export function audit(user, action, summary, { outcome = 'success', target = '' } = {}) {
  if (!user) return;
  auditLog().unshift({
    id: `aud_${Date.now().toString(36)}`,
    at: iso(Date.now()),
    occurred_at: iso(Date.now()),
    method: 'POST',
    path: '',
    details: {},
    error_code: outcome === 'failure' ? 'FAILED' : null,
    actor: user.email,
    actor_name: user.full_name,
    actor_role: user.role,
    action,
    summary,
    outcome,
    ip: '106.51.73.220',
    screen: typeof window !== 'undefined' ? window.location.pathname : '',
    target,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  });
  if (auditLog().length > 600) auditLog().length = 600;
  save();
}
