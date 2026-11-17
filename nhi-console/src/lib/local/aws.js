import { ApiError } from '../api/http';
import { readStoredUser } from '../api/session';
import { AWS_REGION_CATALOGUE } from '../api/awsRegions';
import { PEOPLE } from './seed';
import { slice, save } from './state';

const PRANAV = PEOPLE.find((p) => p.key === 'pranav').email;

/*
 * Connected AWS accounts: GET/POST/PUT/DELETE /api/v1/integrations/aws/*.
 * Accounts and their sync state are kept with the rest of the console's
 * state; a verify, sync or approval moves through its states on its own, the
 * way the discovery worker would move it.
 */
const DELAY = { read: 0, write: 300, verify: 1400 };


/* The platform side of the connection: the role and event bus accounts trust. */
const SETUP = {
  account_id: '600134289077',
  external_id: 'nhi-7f3a91c2-b84e2d1f6c9a4e07a5d3',
  event_bus_arn: 'arn:aws:events:ap-south-1:600134289077:event-bus/nhi-central-bus',
  region: 'ap-south-1',
  assumer_role_arn: 'arn:aws:iam::600134289077:role/NHIPlatformAssumer',
  role_name: 'NHIPlatformCollector',
  rule_name: 'nhi-forward-events',
  managed_policies: ['SecurityAudit', 'ViewOnlyAccess'],
  event_sources: ['aws.ec2', 'aws.ecs', 'aws.iam', 'aws.sts', 'aws.lambda', 'aws.eks', 'aws.secretsmanager', 'aws.kms'],
  regions: AWS_REGION_CATALOGUE,
  exposure: {
    codecommit: {
      managed_policy: '',
      actions: ['codecommit:GetBranch', 'codecommit:GetCommit', 'codecommit:GetDifferences', 'codecommit:GetBlob'],
    },
    github: {
      secret_prefix: 'nhi/github',
      actions: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
      token_permissions: ['Contents: Read-only', 'Metadata: Read-only'],
    },
  },
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const PASS = {
  assume_role: 'Signed in to your account with your External ID.',
  read_access: 'Read access works.',
  events: 'Events from your account are arriving.',
};
const LABELS = { assume_role: 'The role can be assumed', read_access: 'Your configuration is readable', events: 'Events arrive from each region' };

function awsChecks(failing = null) {
  return ['assume_role', 'read_access', 'events'].map((key) =>
    key === failing?.key
      ? { key, label: LABELS[key], state: 'fail', message: failing.message, fix: failing.fix }
      : { key, label: LABELS[key], state: 'pass', message: PASS[key] },
  );
}

function platformOff() {
  return { connected: false, checks: [], verified_at: null };
}

function githubOn(at, secretArn) {
  return {
    connected: true,
    verified_at: at,
    secret_arn: secretArn,
    checks: [
      { key: 'github_secret', label: 'Read the token secret', state: 'pass', message: 'Read the secret with your role.' },
      { key: 'github_token', label: 'GitHub accepts the token', state: 'pass', message: '7 repositories visible as nhi-secret-scanner.' },
    ],
  };
}

function codecommitOn(at, repos = 4) {
  return {
    connected: true,
    verified_at: at,
    checks: [
      { key: 'codecommit_list', label: 'List your repositories', state: 'pass', message: `${repos} repositories in 2 regions.` },
      { key: 'codecommit_read', label: 'Read repository contents', state: 'pass', message: 'Read settlement-engine.' },
    ],
  };
}

function seedAccounts() {
  const owner = 'charan@deepalgorithms.ai';
  const account = (id, regions, extra = {}) => ({
    account_id: id,
    role_arn: `arn:aws:iam::${id}:role/NHIPlatformCollector`,
    regions,
    status: 'connected',
    is_connected: true,
    checks: awsChecks(),
    last_verified_at: ago(5 * HOUR),
    last_verified_by: owner,
    connected_at: ago(64 * 24 * HOUR),
    approval: { status: 'approved', requested_at: ago(65 * 24 * HOUR), requested_by: owner, decided_at: ago(64 * 24 * HOUR), decided_by: PRANAV, note: '' },
    exposure: { github: platformOff(), codecommit: platformOff(), updated_by: '' },
    sync: { status: 'succeeded', requested_at: ago(55 * MIN), requested_by: 'scheduler', started_at: ago(54 * MIN), last_synced_at: ago(41 * MIN), last_error: '' },
    ...extra,
  });
  return [
    account('482915736104', ['ap-south-1', 'us-east-1'], {
      exposure: { github: platformOff(), codecommit: codecommitOn(ago(40 * 24 * HOUR), 3), updated_by: owner },
    }),
    account('739204185562', ['ap-south-1', 'eu-west-1'], { connected_at: ago(48 * 24 * HOUR) }),
    account('215660394871', ['ap-south-1'], {
      status: 'action_needed',
      is_connected: false,
      checks: awsChecks({ key: 'events', message: 'No events from ap-south-1 in the last 24 hours.', fix: 'Check the EventBridge rule target ARN in ap-south-1' }),
      connected_at: ago(21 * 24 * HOUR),
      sync: { status: 'succeeded', requested_at: ago(3 * HOUR), requested_by: 'scheduler', started_at: ago(3 * HOUR), last_synced_at: ago(2 * HOUR + 48 * MIN), last_error: '' },
    }),
    account('605218934417', ['ap-south-1'], { connected_at: ago(9 * 24 * HOUR) }),
  ];
}

/* ── Store ─────────────────────────────────────────────────────────────── */

function store() {
  const s = slice('awsAccounts', () => ({ accounts: seedAccounts() }));
  /* Accounts connected in a later build appear in workspaces saved before it. */
  if (!s.accounts.some((x) => x.account_id === '605218934417')) {
    const added = seedAccounts().find((a) => a.account_id === '605218934417');
    if (added) s.accounts.push(added);
  }
  return s;
}
const commit = () => save();

/** A finished sync stamps the accounts it read (and only those). */
export function markAccountsSynced(accountIds, at, by) {
  const ids = new Set(accountIds?.length ? accountIds : store().accounts.map((a) => a.account_id));
  for (const a of store().accounts) {
    if (!ids.has(a.account_id) || a.status !== 'connected') continue;
    a.sync = { ...a.sync, status: 'succeeded', last_synced_at: at, last_error: '', requested_by: by ?? a.sync.requested_by };
  }
  commit();
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = (value) => JSON.parse(JSON.stringify(value));

function actor() {
  return readStoredUser()?.email || 'you';
}

function canManage() {
  const role = String(readStoredUser()?.role ?? '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

function requireManage() {
  if (!canManage()) {
    throw new ApiError({ status: 403, code: 'FORBIDDEN', message: 'Only an admin can change integrations.' });
  }
}

function findAccount(accountId) {
  const account = store().accounts.find((entry) => entry.account_id === accountId);
  if (!account) throw new ApiError({ status: 404, code: 'AWS_ACCOUNT_NOT_FOUND', message: 'That account is not connected to this workspace.' });
  return account;
}

/* A sync moves queued -> running -> succeeded on its own, as the discovery
   worker would, so the page's polling shows it progress. */
function scheduleSync(accountId) {
  setTimeout(() => {
    const account = store().accounts.find((entry) => entry.account_id === accountId);
    if (!account || account.sync.status !== 'queued') return;
    account.sync.status = 'running';
    account.sync.started_at = new Date().toISOString();
    commit();
    setTimeout(() => {
      const again = store().accounts.find((entry) => entry.account_id === accountId);
      if (!again || again.sync.status !== 'running') return;
      again.sync.status = 'succeeded';
      again.sync.last_synced_at = new Date().toISOString();
      again.sync.last_error = '';
      commit();
    }, 20000);
  }, 6000);
}

/* The simulated admin approves after a few seconds; the role check then runs,
   and a moment later the account connects and its first sync is queued. */
function scheduleApproval(accountId) {
  setTimeout(() => {
    const account = store().accounts.find((entry) => entry.account_id === accountId);
    if (!account || account.status !== 'pending_approval') return;
    account.status = 'pending';
    account.approval = { ...account.approval, status: 'approved', decided_at: new Date().toISOString(), decided_by: PRANAV };
    account.checks = account.checks.map((check, index) => (index === 0 ? { ...check, state: 'running', message: 'Signing in to your account with your role.' } : check));
    commit();
    setTimeout(() => {
      const again = store().accounts.find((entry) => entry.account_id === accountId);
      if (!again || again.status !== 'pending') return;
      const at = new Date().toISOString();
      Object.assign(again, { status: 'connected', is_connected: true, checks: awsChecks(), connected_at: at, last_verified_at: at });
      again.sync = { ...again.sync, status: 'queued', requested_at: at, requested_by: PRANAV, last_error: '' };
      commit();
      scheduleSync(accountId);
    }, 3000);
  }, 8000);
}

function overall(accounts) {
  if (accounts.some((account) => account.status === 'action_needed')) return 'action_needed';
  if (accounts.some((account) => account.status === 'connected')) return 'connected';
  return 'not_connected';
}

/* ── Endpoints ─────────────────────────────────────────────────────────── */

export async function getIntegration() {
  await wait(DELAY.read);
  const { accounts } = store();
  return clone({
    status: overall(accounts),
    /* The point of the preview: the console behaves as a connected workspace. */
    has_connected_account: true,
    exposure_enabled: accounts.some((account) => account.exposure.codecommit.connected),
    platforms: { codecommit: accounts.some((account) => account.exposure.codecommit.connected), github: false, bitbucket: false },
    can_manage: canManage(),
    workspace: { domain: 'deepalgorithms.ai' },
    setup: SETUP,
    accounts,
  });
}

const ROLE_ARN = /^arn:aws:iam::(\d{12}):role\/[\w+=,.@\-/]+$/;

export async function verify({ role_arn: roleArn, regions }) {
  requireManage();
  await wait(DELAY.verify);
  const match = ROLE_ARN.exec(String(roleArn ?? '').trim());
  if (!match) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', field: 'role_arn', message: 'Enter the role ARN, e.g. arn:aws:iam::123456789012:role/NHIPlatformCollector.' });
  if (!Array.isArray(regions) || regions.length === 0) {
    throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', field: 'regions', message: 'Choose at least one region.' });
  }
  const accountId = match[1];
  const now = new Date().toISOString();
  const checks = awsChecks();
  let account = store().accounts.find((entry) => entry.account_id === accountId);
  const firstTime = !account || !account.connected_at;
  if (!account) {
    account = {
      account_id: accountId,
      exposure: { github: platformOff(), codecommit: platformOff(), updated_by: '' },
      sync: { status: 'idle', requested_at: null, requested_by: '', started_at: null, last_synced_at: null, last_error: '' },
    };
    store().accounts.push(account);
  }
  /* Every account not approved yet asks for approval at once and checks nothing; an admin
     (simulated) approves a few seconds later and the checks then run by
     themselves, as the service does. */
  const approved = account.approval?.status === 'approved' || account.is_connected;
  if (!approved) {
    const waiting = awsChecks().map((check) => ({ ...check, state: 'skipped', message: 'Runs once the connection is approved.' }));
    Object.assign(account, {
      role_arn: match[0],
      regions: [...regions],
      status: 'pending_approval',
      is_connected: false,
      checks: waiting,
      last_verified_at: now,
      last_verified_by: actor(),
      connected_at: null,
      approval: { status: 'pending', requested_at: now, requested_by: actor(), decided_at: null, decided_by: '', note: '' },
    });
    commit();
    scheduleApproval(accountId);
    return clone({ status: 'pending_approval', account_id: accountId, role_arn: match[0], regions, checks: waiting, verified_at: now, saved: true, sync_queued: false });
  }
  Object.assign(account, {
    role_arn: match[0],
    regions: [...regions],
    status: 'connected',
    is_connected: true,
    checks,
    last_verified_at: now,
    last_verified_by: actor(),
    connected_at: account.connected_at || now,
  });
  if (firstTime) {
    account.sync = { ...account.sync, status: 'queued', requested_at: now, requested_by: actor(), last_error: '' };
    scheduleSync(accountId);
  }
  commit();
  return clone({ status: 'connected', account_id: accountId, role_arn: match[0], regions, checks, verified_at: now, saved: true, sync_queued: firstTime });
}

export async function updateRegions(accountId, { regions }) {
  requireManage();
  await wait(DELAY.write);
  if (!Array.isArray(regions) || regions.length === 0) {
    throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', field: 'regions', message: 'Choose at least one region.' });
  }
  const account = findAccount(accountId);
  account.regions = [...regions];
  commit();
  return clone(account);
}

export async function setExposure(accountId, { github, codecommit, github_secret_arn: secretArn }) {
  requireManage();
  await wait(DELAY.verify);
  const account = findAccount(accountId);
  const now = new Date().toISOString();
  if (github) {
    if (!/^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:.+$/.test(String(secretArn ?? ''))) {
      throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', field: 'github_secret_arn', message: 'Enter the secret ARN, e.g. arn:aws:secretsmanager:us-east-1:123456789012:secret:nhi/github/token-AbCdEf.' });
    }
    account.exposure.github = githubOn(now, secretArn);
  } else {
    account.exposure.github = platformOff();
  }
  account.exposure.codecommit = codecommit ? codecommitOn(now) : platformOff();
  account.exposure.updated_by = actor();
  commit();
  const accounts = store().accounts;
  return clone({
    account,
    exposure_enabled: accounts.some((entry) => entry.exposure.github.connected || entry.exposure.codecommit.connected),
  });
}

export async function sync(accountId) {
  requireManage();
  await wait(DELAY.write);
  const account = findAccount(accountId);
  if (account.status !== 'connected') {
    throw new ApiError({ status: 409, code: 'AWS_ACCOUNT_NOT_CONNECTED', message: 'Fix the connection before syncing.' });
  }
  if (account.sync.status === 'queued' || account.sync.status === 'running') {
    return clone({ account, already_queued: true });
  }
  account.sync = { ...account.sync, status: 'queued', requested_at: new Date().toISOString(), requested_by: actor(), started_at: null, last_error: '' };
  commit();
  scheduleSync(accountId);
  return clone({ account, already_queued: false });
}

export async function cancelSync(accountId) {
  requireManage();
  await wait(DELAY.write);
  const account = findAccount(accountId);
  if (account.sync.status === 'running') {
    throw new ApiError({ status: 409, code: 'AWS_SYNC_RUNNING', message: 'This sync has already started and can no longer be cancelled. It finishes on its own.' });
  }
  if (account.sync.status !== 'queued') {
    throw new ApiError({ status: 409, code: 'AWS_SYNC_NOT_QUEUED', message: 'There is no queued sync to cancel for this account.' });
  }
  account.sync = { ...account.sync, status: account.sync.last_synced_at ? 'succeeded' : 'idle', requested_at: null, requested_by: '' };
  commit();
  return clone(account);
}

export async function remove(accountId) {
  requireManage();
  await wait(DELAY.write);
  findAccount(accountId);
  store().accounts = store().accounts.filter((entry) => entry.account_id !== accountId);
  commit();
  return { account_id: accountId };
}


/** How many AWS accounts are connected, for the Integrations overview. */
export function accountCount() {
  return store().accounts.length;
}
