/*
 * Credential exposure: secrets the scanner found in GitHub and Bitbucket
 * repositories, each traced back to the identity whose credential it is.
 */
import { estate, REPOSITORIES, GITHUB_ORG, BITBUCKET_URL, person } from './seed';
import { isOn } from './apps';
import { slice } from './state';
import { DAY, HOUR, MIN, NOW, iso, rng } from './util';

const DETECTORS = {
  access_key: { detector: 'AWS', category: 'cloud_credential', mask: (c) => `${c.access_key_id.slice(0, 4)}************${c.access_key_id.slice(-4)}` },
  client_secret: { detector: 'AzureClientSecret', category: 'cloud_credential', mask: () => 'Q~8s********************Xp2' },
  jenkins_credential: { detector: 'JenkinsAPIToken', category: 'ci_token', mask: () => '11d4************************a9f3' },
  vault_token: { detector: 'VaultToken', category: 'secrets_manager', mask: () => 'hvs.CAES****************************JQ' },
  vault_secret_id: { detector: 'VaultAppRoleSecretID', category: 'secrets_manager', mask: () => '7c1e****-****-****-****-********b2d0' },
  secret: { detector: 'PostgresConnectionString', category: 'database', mask: () => 'postgres://loader:****@dpa-warehouse…' },
};
const EXTRA = [
  { detector: 'SlackWebhook', category: 'webhook', redacted: 'https://hooks.slack.com/services/T04****/B07****/****', file: 'scripts/notify_release.sh', risk: 'MEDIUM' },
  { detector: 'RazorpayKey', category: 'payment_api', redacted: 'rzp_live_****************2Kq', file: 'config/payment-gateway.yml', risk: 'HIGH' },
  { detector: 'PrivateKey', category: 'private_key', redacted: '-----BEGIN OPENSSH PRIVATE KEY----- b3Bl…', file: 'deploy/keys/agent_id_ed25519', risk: 'HIGH' },
  { detector: 'GitHubPAT', category: 'scm_token', redacted: 'ghp_************************************1aZ', file: '.github/scripts/sync-labels.py', risk: 'HIGH' },
  { detector: 'MSG91AuthKey', category: 'messaging_api', redacted: '4219********************A1', file: 'src/notify/sms.ts', risk: 'MEDIUM' },
];
const FILES = {
  access_key: ['config/settings/production.py', '.env.production', 'scripts/backfill_ledger.py', 'terraform/providers.tf', 'jobs/tally_export.groovy'],
  client_secret: ['appsettings.Production.json', 'deploy/azure/pipeline-vars.yml', 'notebooks/powerbi_refresh.ipynb'],
  jenkins_credential: ['vars/deployPayments.groovy', 'Jenkinsfile', 'docs/runbooks/ci-access.md'],
  vault_token: ['batch/legacy/run.sh', 'ansible/group_vars/prod.yml'],
  vault_secret_id: ['helm/payments-api/values-prod.yaml', 'k8s/settlement-worker/secret.yaml'],
  secret: ['dags/redshift_loader.py', 'dbt/profiles.yml'],
};
const MESSAGES = [
  'hotfix: settlement cut-off for NEFT batch',
  'chore: wire prod config for go-live',
  'temp: debug credentials for incident INC-2231',
  'feat(upi): autopay mandate retries',
  'ci: speed up release pipeline',
  'fix: refresh Power BI dataset on schedule',
  'wip: local testing',
];

function repoFor(cred, r) {
  const want = cred.provider === 'jenkins' || cred.provider === 'vault' ? 'bitbucket' : r.chance(0.7) ? 'github' : 'bitbucket';
  const pool = REPOSITORIES.filter((x) => x.platform === want);
  return r.pick(pool);
}

function uri(repo, branch, file, line, commit) {
  if (repo.platform === 'github') return `https://github.com/${repo.name}/blob/${commit}/${file}#L${line}`;
  const [project, slug] = repo.name.split('/');
  return `${BITBUCKET_URL}/projects/${project}/repos/${slug}/browse/${file}?at=${commit}#${line}`;
}

function build() {
  const r = rng(424242);
  const ids = estate().identities;
  const creds = estate().credentials;
  const findings = [];
  const leakable = creds.filter((c) => DETECTORS[c.credential_type] && (c.rotation_overdue || c.provider === 'vault' || c.credential_type === 'client_secret'));
  const chosen = r.sample(leakable, Math.min(16, leakable.length));
  const make = (fields, list = 'live') => {
    const repo = fields.repo;
    const branch = fields.branch ?? repo.branches[0];
    const line = r.int(4, 220);
    const commit = r.hex(40);
    const author = person(r.pick([repo.owner, repo.owner, 'raju', 'sanju', 'divya', 'kiran']));
    const created = NOW - r.int(1, 120) * DAY - r.int(0, 23) * HOUR;
    const f = {
      finding_id: `${repo.platform}/${repo.name}/${commit.slice(0, 12)}/${fields.file}:${line}`,
      client_id: repo.platform === 'github' ? GITHUB_ORG : 'bitbucket.deepalgorithms.ai',
      platform: repo.platform,
      repository: repo.name,
      branch,
      file_path: fields.file,
      line_number: line,
      line_preview: `${fields.file.endsWith('.py') ? 'AWS_SECRET' : fields.file.endsWith('.yml') || fields.file.endsWith('.yaml') ? 'token:' : 'key ='} ${fields.redacted}`,
      detector: fields.detector,
      detectors: [fields.detector],
      redacted: fields.redacted,
      value_fingerprint: r.hex(16),
      commit_id: commit,
      commit_message: r.pick(MESSAGES),
      author: `${author.name} <${author.email}>`,
      committer: author.name,
      commit_authored_at: iso(created - r.int(1, 48) * HOUR),
      created_at: iso(created),
      risk_tier: fields.risk,
      severity: fields.risk,
      recommended_action: fields.risk === 'CRITICAL' ? 'TRIGGER_REMEDIATION' : fields.risk === 'HIGH' ? 'PAGE_ON_CALL' : fields.risk === 'MEDIUM' ? 'NOTIFY_SOC' : 'LOG_ONLY',
      category: fields.category,
      confidence: list === 'review' ? 'medium' : 'high',
      verification_status: fields.verified ?? (r.chance(0.6) ? 'ACTIVE' : null),
      ml_decision: list === 'flagged' || list === 'noise' ? 'FALSE_POSITIVE' : 'TRUE_POSITIVE',
      ml_score: list === 'review' ? r.int(42, 61) / 100 : list === 'flagged' ? r.int(5, 22) / 100 : r.int(84, 99) / 100,
      ml_model_version: 'secretnet-2026.10',
      analyst_decision: null,
      analyst_decided_by: null,
      analyst_decided_at: null,
      repo_visibility: repo.name.endsWith('ml-experiments') ? 'public' : 'private',
      repo_stars: repo.platform === 'github' ? r.int(0, 40) : null,
      repo_forks: repo.platform === 'github' ? r.int(0, 9) : null,
      repo_pushed_at: repo.platform === 'github' ? iso(NOW - r.int(1, 30) * HOUR) : null,
      files_changed: r.int(1, 14),
      additions: repo.platform === 'github' ? r.int(3, 240) : null,
      deletions: repo.platform === 'github' ? r.int(0, 80) : null,
      github_uri: repo.platform === 'github' ? uri(repo, branch, fields.file, line, commit) : null,
      bitbucket_uri: repo.platform === 'bitbucket' ? uri(repo, branch, fields.file, line, commit) : null,
      codecommit_uri: null,
      noise_flags: fields.noise ?? '',
      reason: fields.reason ?? '',
      count: fields.count ?? 1,
      list,
      identity_id: fields.identity?.id ?? null,
      identity_name: fields.identity?.name ?? null,
      identity_provider: fields.identity?.provider ?? null,
      credential_id: fields.cred?.id ?? null,
      credential_name: fields.cred?.name ?? null,
      credential_type: fields.cred?.credential_type ?? null,
    };
    findings.push(f);
    return f;
  };

  for (const cred of chosen) {
    const d = DETECTORS[cred.credential_type];
    const identity = ids.find((i) => cred.bound_identities.includes(i.id));
    const repo = repoFor(cred, r);
    const prodLike = identity?.environment === 'production';
    make({
      repo,
      branch: r.pick(repo.branches),
      file: r.pick(FILES[cred.credential_type]),
      detector: d.detector,
      category: d.category,
      redacted: d.mask(cred),
      risk: identity?.is_admin || (prodLike && cred.credential_type === 'access_key') ? 'CRITICAL' : prodLike ? 'HIGH' : 'MEDIUM',
      cred,
      identity,
      verified: cred.status === 'active' ? 'ACTIVE' : 'INACTIVE',
    });
  }
  for (const x of EXTRA) {
    make({ repo: r.pick(REPOSITORIES), file: x.file, detector: x.detector, category: x.category, redacted: x.redacted, risk: x.risk });
  }
  /* What the scanner set aside, each with its reason. */
  make({ repo: REPOSITORIES[1], file: 'android/app/google-services.json', detector: 'GoogleAPIKey', category: 'cloud_credential', redacted: 'AIza****************************Q4', risk: 'LOW', reason: 'Restricted Android key: usable only from the signed app.' }, 'review');
  make({ repo: REPOSITORIES[3], file: 'tests/fixtures/s3_mock.py', detector: 'AWS', category: 'cloud_credential', redacted: 'AKIA************MPLE', risk: 'LOW', noise: 'known_example_value', reason: 'The published AWS documentation example key.' }, 'noise');
  make({ repo: REPOSITORIES[4], file: 'package-lock.json', detector: 'GenericHighEntropy', category: 'generic', redacted: 'sha512-p1n5****************************==', risk: 'LOW', noise: 'integrity_hash', reason: 'A package integrity checksum, not a secret.' }, 'noise');
  make({ repo: REPOSITORIES[0], file: 'docs/architecture.md', detector: 'AWS', category: 'cloud_credential', redacted: 'arn:aws:iam::482915736104:role/…', risk: 'LOW', noise: 'arn_identifier', reason: 'An ARN, which names a role but grants nothing.' }, 'noise');
  make({ repo: REPOSITORIES[2], file: 'modules/rds/main.tf', detector: 'GenericPassword', category: 'database', redacted: 'var.db_pass****', risk: 'LOW', reason: 'A Terraform variable reference, not a value.' }, 'flagged');
  make({ repo: REPOSITORIES[7], file: 'src/main/resources/application-dev.yml', detector: 'GenericPassword', category: 'database', redacted: 'changeme****', risk: 'MEDIUM', reason: 'Low model confidence: looks like a placeholder.' }, 'review');
  const rep = make({ repo: REPOSITORIES[8], file: 'vars/notifySlack.groovy', detector: 'SlackWebhook', category: 'webhook', redacted: 'https://hooks.slack.com/services/T04****/B05****/****', risk: 'MEDIUM', count: 7, reason: 'The same value appears in 7 files in one commit.' }, 'repeated');
  rep.files = ['vars/notifySlack.groovy', 'vars/deployPayments.groovy', 'vars/releaseMobile.groovy', 'vars/nightlyEtl.groovy', 'vars/terraformApply.groovy', 'vars/qaRegression.groovy', 'resources/slack.properties'];
  return findings;
}

let cache = null;
export function allFindings() {
  cache ??= build();
  return cache;
}

/** Analyst verdicts and accepted findings, kept across reloads. */
export const decisions = () => slice('exposureDecisions', () => ({}));
export const allowlist = () => slice('exposureAllowlist', () => []);
export const deepScans = () => slice('deepScans', () => ({}));

export function platformOn(platform) {
  return platform === 'codecommit' ? isOn('aws') : isOn(platform);
}

export function liveFindings() {
  const d = decisions();
  const accepted = new Set(allowlist().map((e) => [e.client_id, e.file_path, e.detector, e.redacted].join('|')));
  return allFindings()
    .filter((f) => platformOn(f.platform))
    .filter((f) => !accepted.has([f.client_id, f.file_path, f.detector, f.redacted].join('|')))
    .map((f) => (d[f.finding_id] ? { ...f, ...d[f.finding_id] } : f));
}

export function exposedIdentityIds() {
  return new Set(
    liveFindings()
      .filter((f) => f.list === 'live' && f.identity_id && f.analyst_decision !== 'false_positive')
      .map((f) => f.identity_id),
  );
}

export { HOUR, MIN };
