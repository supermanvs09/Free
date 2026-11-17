/*
 * The applications a workspace can connect, and which of them are switched on.
 * An application that is off contributes nothing: its identities,
 * credentials, findings and alerts leave every screen, and its tab leaves the
 * Integrations page.
 */
import { slice, save } from './state';
import { ago, DAY, HOUR, MIN } from './util';
import { ORG, person } from './seed';

export const APP_CATALOG = [
  { key: 'aws', name: 'Amazon Web Services', short: 'AWS', category: 'identity', summary: 'IAM roles, users, access keys, Lambda, ECS, EKS, EC2 and Secrets Manager, with CloudTrail activity.' },
  { key: 'azure', name: 'Microsoft Azure', short: 'Azure', category: 'identity', summary: 'Managed identities, service principals, app registrations and their secrets, certificates and federated credentials.' },
  { key: 'jenkins', name: 'Jenkins', short: 'Jenkins', category: 'identity', summary: 'Jobs, agents and service users, and every credential they bind from the credential store.' },
  { key: 'vault', name: 'HashiCorp Vault', short: 'Vault', category: 'identity', summary: 'AppRoles, Kubernetes roles, tokens and dynamic secret leases, with audit-device activity.' },
  { key: 'github', name: 'GitHub', short: 'GitHub', category: 'exposure', summary: 'Scans repositories and history for secrets that belong to your identities.' },
  { key: 'bitbucket', name: 'Bitbucket', short: 'Bitbucket', category: 'exposure', summary: 'Scans Bitbucket Data Center projects and history for leaked credentials.' },
  { key: 'gmail', name: 'Gmail', short: 'Gmail', category: 'notify', summary: 'Real-time alert email, sent from your Gmail or Google Workspace account.' },
  { key: 'jira', name: 'Jira', short: 'Jira', category: 'notify', summary: 'Opens and updates Jira issues for the alerts you choose.' },
];
export const APP_KEYS = APP_CATALOG.map((a) => a.key);
/* Not offered in the console for now. */
export const HIDDEN_APPS = new Set(['gmail', 'jira']);
export const IDENTITY_APPS = ['aws', 'azure', 'jenkins', 'vault'];
export const EXPOSURE_APPS = ['github', 'bitbucket'];

const check = (key, label, message, state = 'pass', fix = '') => ({ key, label, state, message, ...(fix ? { fix } : {}) });

function defaults() {
  const by = person('charan').email;
  return {
    aws: { enabled: true, enabled_at: ago(64 * DAY), enabled_by: by },
    azure: {
      enabled: true,
      enabled_at: ago(41 * DAY),
      enabled_by: by,
      connections: [
        {
          id: 'a3f1c2d4-5b6e-4f70-8a91-b2c3d4e5f607',
          name: 'Payments-Prod',
          tenant_id: '9c4e1b72-0d3a-4f6b-a8e2-51c7d93f0b14',
          client_id: '5d2f8a10-7c3e-4b9a-b6d1-2e0f4a8c9b37',
          auth: 'federated',
          regions: ['centralindia', 'southindia'],
          status: 'connected',
          checks: [
            check('token', 'Sign in to Microsoft Entra ID', 'Signed in with the workload identity federation credential.'),
            check('graph', 'Read applications and service principals', 'Application.Read.All and Directory.Read.All granted.'),
            check('arm', 'Read the subscription', 'Reader role on the subscription.'),
            check('activity', 'Read the activity log', 'Sign-in and audit logs arriving from the diagnostic setting.'),
          ],
          connected_at: ago(41 * DAY),
          sync: { status: 'succeeded', last_synced_at: ago(48 * MIN), last_error: '' },
        },
        {
          id: '7e2d9c18-4a3b-42f1-9d6e-0c5b8a7f3e21',
          name: 'Analytics-Dev',
          tenant_id: '9c4e1b72-0d3a-4f6b-a8e2-51c7d93f0b14',
          client_id: '5d2f8a10-7c3e-4b9a-b6d1-2e0f4a8c9b37',
          auth: 'federated',
          regions: ['centralindia'],
          status: 'action_needed',
          checks: [
            check('token', 'Sign in to Microsoft Entra ID', 'Signed in with the workload identity federation credential.'),
            check('graph', 'Read applications and service principals', 'Application.Read.All and Directory.Read.All granted.'),
            check('arm', 'Read the subscription', 'Reader role on the subscription.'),
            check('activity', 'Read the activity log', 'No sign-in logs in the last 24 hours.', 'fail', 'Send SignInLogs and AuditLogs to the event hub in the diagnostic setting.'),
          ],
          connected_at: ago(19 * DAY),
          sync: { status: 'succeeded', last_synced_at: ago(3 * HOUR), last_error: '' },
        },
      ],
    },
    jenkins: {
      enabled: true,
      enabled_at: ago(33 * DAY),
      enabled_by: person('raju').email,
      connections: [
        {
          id: 'ci.deepalgorithms.ai',
          name: 'Jenkins CI',
          url: 'https://ci.deepalgorithms.ai',
          username: 'nhi-reader',
          version: '2.479.1 LTS',
          regions: ['on-prem'],
          status: 'connected',
          checks: [
            check('reach', 'Reach the controller', 'Jenkins 2.479.1 LTS answered in 182 ms.'),
            check('auth', 'Sign in with the API token', 'Signed in as nhi-reader (Overall/Read, Job/Read, Credentials/View).'),
            check('creds', 'List credential stores', '3 stores, 41 credentials (values are never read).'),
            check('audit', 'Read the audit trail', 'Audit Trail plugin log forwarded.'),
          ],
          connected_at: ago(33 * DAY),
          sync: { status: 'succeeded', last_synced_at: ago(22 * MIN), last_error: '' },
        },
      ],
    },
    vault: {
      enabled: true,
      enabled_at: ago(27 * DAY),
      enabled_by: person('harika').email,
      connections: [
        {
          id: 'vault.deepalgorithms.ai',
          name: 'Vault prod',
          url: 'https://vault.deepalgorithms.ai:8200',
          namespace: 'admin/payments',
          auth: 'approle',
          version: 'Vault Enterprise 1.18.2',
          regions: ['ap-south-1'],
          status: 'connected',
          checks: [
            check('reach', 'Reach the cluster', 'Cluster vault-prod (3 nodes, raft) unsealed and healthy.'),
            check('auth', 'Sign in with AppRole', 'Signed in with role nhi-discovery; token TTL 1h.'),
            check('policy', 'Read auth methods and roles', 'sys/auth, auth/*/role and identity/* readable.'),
            check('audit', 'Read the audit device', 'File audit device streamed to the collector.'),
          ],
          connected_at: ago(27 * DAY),
          sync: { status: 'succeeded', last_synced_at: ago(37 * MIN), last_error: '' },
        },
      ],
    },
    github: {
      enabled: true,
      enabled_at: ago(52 * DAY),
      enabled_by: by,
      org: 'deepalgo-labs',
      app_installation: 51829374,
      checks: [
        check('github_app', 'The GitHub App is installed', 'NHI Secret Scanner installed on deepalgo-labs.'),
        check('github_repos', 'Repositories are readable', '7 repositories, contents read-only.'),
      ],
      verified_at: ago(6 * HOUR),
    },
    bitbucket: {
      enabled: true,
      enabled_at: ago(30 * DAY),
      enabled_by: person('raju').email,
      base_url: 'https://bitbucket.deepalgorithms.ai',
      token_expires_at: ago(-148 * DAY),
      checks: [
        check('bitbucket_reach', 'Reach Bitbucket', 'Bitbucket Data Center 9.4.2 answered.'),
        check('bitbucket_token', 'The token can read projects', '3 projects, 4 repositories readable.'),
      ],
      verified_at: ago(9 * HOUR),
    },
    gmail: {
      enabled: true,
      enabled_at: ago(12 * DAY),
      enabled_by: person('pranav').email,
      recipients: [],
      min_severity: 'HIGH',
      events: { exposure: true, posture: true, anomaly: true, scan: false },
      digest: 'instant',
    },
    jira: {
      enabled: false,
      site_url: '',
      email: '',
      api_token: '',
      project_key: '',
      issue_type: 'Bug',
      min_severity: 'CRITICAL',
      events: { exposure: true, posture: true, anomaly: false, scan: false },
      priority_map: { CRITICAL: 'Highest', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' },
      labels: ['nhi-security'],
    },
  };
}

export function apps() {
  const s = slice('apps', defaults);
  /* New applications added in a later build appear with their defaults. */
  const base = defaults();
  for (const key of APP_KEYS) if (!s[key]) s[key] = base[key];
  return s;
}

export const isOn = (key) => Boolean(apps()[key]?.enabled);
export const enabledProviders = () => IDENTITY_APPS.filter(isOn);

export function setEnabled(key, enabled, actor) {
  const a = apps()[key];
  a.enabled = Boolean(enabled);
  if (enabled) {
    a.enabled_at = new Date().toISOString();
    a.enabled_by = actor;
  }
  save();
  return a;
}

export function publicApp(key) {
  const meta = APP_CATALOG.find((x) => x.key === key);
  const a = apps()[key];
  const { api_token: token, app_password: appPassword, ...rest } = a;
  const out = { ...meta, ...rest };
  if (key === 'jira') out.api_token_set = Boolean(token);
  if (key === 'gmail') out.app_password_set = Boolean(appPassword);
  out.status = statusOf(key);
  return out;
}

function statusOf(key) {
  const a = apps()[key];
  if (!a.enabled) return 'off';
  if (a.connections) {
    if (a.connections.some((c) => c.status === 'action_needed')) return 'action_needed';
    return a.connections.length ? 'connected' : 'not_connected';
  }
  if (key === 'gmail') return a.recipients?.length ? 'connected' : 'not_connected';
  if (key === 'jira') return a.site_url && a.project_key && (a.api_token || a.server_token) ? 'connected' : 'not_connected';
  return 'connected';
}

export { ORG };
