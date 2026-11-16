/*
 * The posture rule engine: every identity is evaluated against the checks
 * below, across six pillars. A failed check costs points by severity; the
 * score is what is left of 100.
 */
import { credentialsOf, identities as visibleIdentities } from './world';
import { estate, scopeById, person } from './seed';
import { slice } from './state';
import { DAY, HOUR, NOW, hashString, iso, rng } from './util';
import { exposedIdentityIds } from './exposureData';
import { activeAnomalySpecs, escalationPaths, onOverlayChange } from './entitlements';

const untrustedCall = (i) => activeAnomalySpecs().find((a) => a.who === i.name && a.untrusted && !a.resolved) ?? null;

export const WEIGHTS = { CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3 };
export const PILLAR_NAMES = {
  least_privilege: 'Least privilege',
  credential_hygiene: 'Credential hygiene',
  trust_access: 'Trust & access',
  escalation: 'Escalation',
  exposure: 'Exposure',
  lifecycle: 'Lifecycle',
};

const creds = (i) => credentialsOf(i);

export const RULES = [
  {
    rule_id: 'NHI-LP-001', pillar: 'least_privilege', severity: 'MEDIUM', title: 'Permissions unused for 90 days',
    applies: () => true, fails: (i) => i.permission_utilization_pct < 40,
    detail: (i) => `Uses ${i.permission_utilization_pct}% of the actions it is allowed.`,
    why: 'Access an identity never uses is access an attacker gets for free.',
    fix: 'Remove the actions not used in 90 days; keep the ones in the activity log.',
    compliance: ['NIST-AC-6(1)', 'SOC2-CC6.3', 'ISO27001-A.5.15', 'RBI-CSF-8.4'], auto: 'trim_unused_permissions',
  },
  {
    rule_id: 'NHI-LP-002', pillar: 'least_privilege', severity: 'CRITICAL', title: 'Administrator-equivalent access',
    applies: () => true, fails: (i) => i.is_admin,
    detail: (i) => ({ aws: 'AdministratorAccess (or *:* on *) is attached.', azure: 'Owner role at subscription scope.', jenkins: 'Overall/Administer granted through the job’s credentials.', vault: 'Policy grants sudo on sys/* and auth/token/create.' })[i.provider],
    why: 'A workload with full control turns any compromise into a full account compromise.',
    fix: 'Replace with a policy scoped to the actions and resources it uses.',
    compliance: ['NIST-AC-6', 'SOC2-CC6.1', 'PCI-DSS-7.2.1', 'RBI-CSF-8.4'], auto: 'replace_admin_policy',
  },
  {
    rule_id: 'NHI-CH-001', pillar: 'credential_hygiene', severity: 'HIGH', title: 'Access key older than 90 days',
    applies: (i) => creds(i).some((c) => c.credential_type === 'access_key'), fails: (i) => creds(i).some((c) => c.credential_type === 'access_key' && c.age_days > 90 && c.status === 'active'),
    detail: (i) => { const c = creds(i).filter((x) => x.credential_type === 'access_key').sort((a, b) => b.age_days - a.age_days)[0]; return c ? `${c.access_key_id?.slice(0, 4)}…${c.access_key_id?.slice(-4)} is ${c.age_days} days old.` : ''; },
    why: 'A long-lived key that has been around for months has had months to leak.',
    fix: 'Create a new key, move the workload to it, then deactivate and delete the old one.',
    compliance: ['NIST-IA-5(1)', 'CIS-AWS-1.14', 'PCI-DSS-8.3.9'], auto: 'rotate_access_key',
  },
  {
    rule_id: 'NHI-CH-002', pillar: 'credential_hygiene', severity: 'MEDIUM', title: 'Two active access keys',
    applies: (i) => creds(i).some((c) => c.credential_type === 'access_key'), fails: (i) => creds(i).filter((c) => c.credential_type === 'access_key' && c.status === 'active').length > 1,
    detail: () => 'Both keys are active; one is not being used by the workload.', why: 'The spare key is an extra secret to leak, with nobody watching it.',
    fix: 'Deactivate the key that is not in use.', compliance: ['CIS-AWS-1.13'], auto: 'deactivate_access_key',
  },
  {
    rule_id: 'NHI-CH-003', pillar: 'credential_hygiene', severity: 'HIGH', title: 'Client secret expired or expiring within 30 days',
    applies: (i) => creds(i).some((c) => c.credential_type === 'client_secret'), fails: (i) => creds(i).some((c) => c.credential_type === 'client_secret' && c.days_until_expiry < 30),
    detail: (i) => { const c = creds(i).find((x) => x.credential_type === 'client_secret'); return c?.days_until_expiry < 0 ? `Expired ${-c.days_until_expiry} days ago and still configured.` : `Expires in ${c?.days_until_expiry} days.`; },
    why: 'An expiring secret breaks the integration; an expired one left in place hides that it was replaced by something else.',
    fix: 'Switch to a federated credential, or add a new secret and remove the old one.', compliance: ['NIST-IA-5', 'ISO27001-A.5.17'], auto: null,
  },
  {
    rule_id: 'NHI-CH-004', pillar: 'credential_hygiene', severity: 'MEDIUM', title: 'Stored secret not rotated in 180 days',
    applies: (i) => creds(i).some((c) => ['secret', 'jenkins_credential'].includes(c.credential_type)), fails: (i) => creds(i).some((c) => ['secret', 'jenkins_credential'].includes(c.credential_type) && c.rotation_overdue),
    detail: (i) => { const c = creds(i).find((x) => ['secret', 'jenkins_credential'].includes(x.credential_type) && x.rotation_overdue); return c ? `${c.name} is ${c.age_days} days old and has no rotation schedule.` : ''; },
    why: 'Static secrets are copied into laptops, CI logs and chat; age is exposure.', fix: 'Turn on rotation, or replace it with a short-lived credential from Vault.', compliance: ['NIST-IA-5(1)', 'PCI-DSS-8.6.3'], auto: 'enable_secret_rotation',
  },
  {
    rule_id: 'NHI-CH-005', pillar: 'credential_hygiene', severity: 'HIGH', title: 'Long-lived Vault token without a max TTL',
    applies: (i) => i.provider === 'vault', fails: (i) => creds(i).some((c) => c.credential_type === 'vault_token'),
    detail: () => 'Periodic orphan token, renewable for ever (period 768h, no explicit max TTL).', why: 'An orphan periodic token outlives the system that created it and is never revoked with its parent.',
    fix: 'Move the batch job to AppRole with a short token TTL and revoke the token.', compliance: ['NIST-AC-12', 'ISO27001-A.8.5'], auto: null,
  },
  {
    rule_id: 'NHI-TA-001', pillar: 'trust_access', severity: 'HIGH', title: 'Assumable from another account',
    applies: (i) => creds(i).some((c) => c.has_external_trust), fails: (i) => creds(i).some((c) => c.has_external_trust && String(c.external_principal).startsWith('arn:')),
    detail: (i) => `Trusted by ${creds(i).find((c) => c.has_external_trust)?.external_principal}.`, why: 'Anyone with access to the trusted account can become this identity.',
    fix: 'Require an ExternalId and narrow the principal to the vendor’s role.', compliance: ['NIST-AC-3', 'CIS-AWS-1.20'], auto: 'add_external_id_condition',
  },
  {
    rule_id: 'NHI-TA-002', pillar: 'trust_access', severity: 'MEDIUM', title: 'Federated trust not pinned to a branch or environment',
    applies: (i) => creds(i).some((c) => c.has_external_trust), fails: (i) => creds(i).some((c) => c.has_external_trust && !String(c.external_principal).startsWith('arn:') && !String(c.external_principal).includes('refs/heads/main')),
    detail: () => 'The OIDC subject condition allows repo:deepalgo-labs/* on any branch.', why: 'Any branch, fork workflow or pull request run in the organisation can deploy as this identity.',
    fix: 'Pin the subject to repo:<org>/<repo>:environment:production.', compliance: ['NIST-AC-3', 'SLSA-L3'], auto: 'pin_oidc_subject',
  },
  {
    rule_id: 'NHI-TA-003', pillar: 'trust_access', severity: 'HIGH', title: 'Internet-reachable workload holds credentials',
    applies: () => true, fails: (i) => i.is_publicly_accessible && creds(i).length > 0,
    detail: () => 'Has a public address and can read its credentials from the metadata service.', why: 'One remote code execution bug hands over its credentials.',
    fix: 'Put it behind a load balancer or private endpoint; require IMDSv2.', compliance: ['NIST-SC-7', 'PCI-DSS-1.3'], auto: null,
  },
  {
    rule_id: 'NHI-ES-001', pillar: 'escalation', severity: 'CRITICAL', title: 'Can widen its own access',
    applies: () => true, fails: (i) => i.is_admin && ['NHI_CICD', 'DUAL_IDENTITY'].includes(i.functional_class),
    detail: (i) => ({ aws: 'Allowed iam:PassRole and iam:CreateAccessKey on *.', azure: 'Allowed Microsoft.Authorization/roleAssignments/write.', jenkins: 'Can reconfigure jobs that bind production credentials.', vault: 'Can create tokens with any policy (auth/token/create sudo).' })[i.provider],
    why: 'An identity that can grant itself more access has no real limit.', fix: 'Remove the permission-management actions; keep deploy actions scoped to named resources.', compliance: ['NIST-AC-6(10)', 'SOC2-CC6.1'], auto: 'remove_escalation_actions',
  },
  {
    rule_id: 'NHI-ES-002', pillar: 'escalation', severity: 'CRITICAL', title: 'Can reach administrator access through a role chain',
    applies: (i) => i.provider === 'aws', fails: (i) => escalationPaths(i).length > 0,
    detail: (i) => `Can assume ${escalationPaths(i)[0].identities.slice(1).map((x) => x.name).join(', then ')}, which has administrator access.`,
    why: 'A role with little access is still as powerful as the strongest role it can become.', fix: 'Remove it from the trust policy of the first role in the chain.', compliance: ['NIST-AC-6', 'CIS-AWS-1.16', 'SOC2-CC6.3'], auto: 'break_trust_link',
  },
  {
    rule_id: 'NHI-EX-001', pillar: 'exposure', severity: 'CRITICAL', title: 'Credential found in source code',
    applies: () => true, fails: (i) => exposedIdentityIds().has(i.id),
    detail: () => 'One of its credentials was found in a repository by credential exposure scanning.', why: 'A secret in a repository is a secret on every clone, fork and CI cache.',
    fix: 'Rotate the credential now, then remove it from the repository history.', compliance: ['NIST-IA-5(7)', 'PCI-DSS-8.3.2', 'OWASP-A07'], auto: 'rotate_access_key',
  },
  {
    rule_id: 'NHI-EX-002', pillar: 'exposure', severity: 'HIGH', title: 'Credential used from an unexpected network',
    applies: () => true, fails: (i) => Boolean(untrustedCall(i)),
    detail: (i) => `Its credentials were used from ${untrustedCall(i).ip} (${untrustedCall(i).ip.startsWith('185.220') ? 'a Tor exit node' : 'a hosting provider it has never used'}) in the last 30 days.`, why: 'Its credentials are being used somewhere they should not be.',
    fix: 'Rotate its credentials and add a source network condition.', compliance: ['NIST-SI-4', 'SOC2-CC7.2'], auto: null,
  },
  {
    rule_id: 'NHI-LC-001', pillar: 'lifecycle', severity: 'HIGH', title: 'No owner',
    applies: () => true, fails: (i) => !i.owner,
    detail: () => 'No owner tag, team tag or known creator.', why: 'Nobody will notice when it misbehaves, and nobody can say whether it is still needed.',
    fix: 'Add an owner tag, or remove it if nobody claims it within 14 days.', compliance: ['NIST-AC-2', 'ISO27001-A.5.9'], auto: 'tag_owner',
  },
  {
    rule_id: 'NHI-LC-002', pillar: 'lifecycle', severity: 'MEDIUM', title: 'Unused for 90 days',
    applies: () => true, fails: (i) => i.idle_days >= 90,
    detail: (i) => `Last active ${i.idle_days} days ago.`, why: 'A dormant identity keeps all of its access and none of its scrutiny.',
    fix: 'Disable it now; delete it after 30 days if nothing breaks.', compliance: ['NIST-AC-2(3)', 'CIS-AWS-1.12'], auto: 'disable_identity',
  },
  {
    rule_id: 'NHI-LC-003', pillar: 'lifecycle', severity: 'LOW', title: 'Missing required tags',
    applies: () => true, fails: (i) => !i.tags?.['cost-center'],
    detail: () => 'cost-center and data-classification are not set.', why: 'Untagged identities cannot be routed to the right team or reviewed by data owners.',
    fix: 'Add the tags from your tagging standard.', compliance: ['ISO27001-A.5.9'], auto: 'tag_owner',
  },
];
export const rule = (id) => RULES.find((r) => r.rule_id === id);

export const postureId = (identity) => `pst_${identity.id.slice(4)}`;
export const fromPostureId = (id) => estate().identities.find((i) => `pst_${i.id.slice(4)}` === id) ?? null;

/** Analyst changes to findings: accepted, suppressed, assigned, notes. */
export function findingStates() {
  return slice('findingStates', () => ({}));
}

const evalCache = new Map();
export function evaluate(identity) {
  if (evalCache.has(identity.id)) return evalCache.get(identity.id);
  const r = rng(hashString(`ev:${identity.id}`));
  const checks = RULES.filter((rl) => rl.applies(identity)).map((rl) => {
    const failing = Boolean(rl.fails(identity));
    const id = `fnd_${identity.id.slice(4, 10)}_${rl.rule_id.slice(4).replace('-', '')}`;
    return {
      finding_id: id,
      rule_id: rl.rule_id,
      title: rl.title,
      pillar: rl.pillar,
      severity: rl.severity,
      failing,
      detail: failing ? rl.detail(identity) : 'Passes.',
      failing_since: failing ? iso(NOW - r.int(2, 140) * DAY) : null,
      points: failing ? WEIGHTS[rl.severity] : 0,
    };
  });
  evalCache.set(identity.id, checks);
  return checks;
}
export function clearEvaluation() {
  evalCache.clear();
}
onOverlayChange(clearEvaluation);

/** Checks after analyst decisions: an accepted or suppressed check costs nothing. */
export function effectiveChecks(identity) {
  const states = findingStates();
  return evaluate(identity).map((c) => {
    const s = states[c.finding_id];
    const status = !c.failing ? 'PASSED' : s?.status ?? 'OPEN';
    return { ...c, status, counted: c.failing && status === 'OPEN', state: s ?? null };
  });
}

export function scoreOf(identity) {
  const lost = effectiveChecks(identity).filter((c) => c.counted).reduce((s, c) => s + c.points, 0);
  return Math.max(4, Math.min(100, 100 - lost));
}
export function bandOf(score) {
  return score >= 80 ? 'HEALTHY' : score >= 60 ? 'FAIR' : score >= 40 ? 'POOR' : 'CRITICAL';
}
export function gradeOf(score) {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
}

/** Score some days ago: identities that recently gained a failing check were higher. */
export function scoreAt(identity, daysBack) {
  const now = scoreOf(identity);
  const recent = effectiveChecks(identity).filter((c) => c.counted && c.failing_since && Date.parse(c.failing_since) > NOW - daysBack * DAY);
  return Math.min(100, now + recent.reduce((s, c) => s + c.points, 0));
}

export function pillarScores(identity) {
  const checks = effectiveChecks(identity);
  return Object.keys(PILLAR_NAMES).map((p) => {
    const mine = checks.filter((c) => c.pillar === p);
    const failing = mine.filter((c) => c.counted);
    const lost = failing.reduce((s, c) => s + c.points, 0);
    return {
      pillar: p,
      key: p,
      name: PILLAR_NAMES[p],
      label: PILLAR_NAMES[p],
      score: mine.length ? Math.max(0, 100 - lost * 2) : null,
      failing: failing.length,
      evaluated: mine.length,
      points_lost: lost,
      status: !mine.length ? 'NA' : failing.some((c) => ['CRITICAL', 'HIGH'].includes(c.severity)) ? 'FAIL' : failing.length ? 'WARN' : 'PASS',
    };
  });
}

export function postureRow(identity, window = '30d') {
  const score = scoreOf(identity);
  const days = { '24h': 1, '3d': 3, '7d': 7, '30d': 30, '60d': 60, '90d': 90 }[window] ?? 30;
  const before = scoreAt(identity, days);
  const checks = effectiveChecks(identity);
  const failed = checks.filter((c) => c.counted);
  const pillars = pillarScores(identity).filter((p) => p.score !== null);
  const weakest = [...pillars].sort((a, b) => a.score - b.score)[0];
  const scope = scopeById(identity.account_id);
  const cred = credentialsOf(identity)[0];
  return {
    identity_id: postureId(identity),
    discovery_id: identity.id,
    name: identity.name,
    arn: identity.arn,
    provider: identity.provider,
    type: identity.identity_type,
    functional_class: identity.functional_class,
    category: identity.functional_class,
    account: { id: identity.account_id, name: scope?.name ?? identity.account_id },
    account_id: identity.account_id,
    region: identity.region,
    score,
    band: bandOf(score),
    grade: gradeOf(score),
    failed: { total: failed.length, critical: failed.filter((c) => c.severity === 'CRITICAL').length, high: failed.filter((c) => c.severity === 'HIGH').length, medium: failed.filter((c) => c.severity === 'MEDIUM').length, low: failed.filter((c) => c.severity === 'LOW').length },
    checks_failed: failed.length,
    checks_evaluated: checks.length,
    weakest_pillar: weakest && weakest.score < 100 ? weakest.pillar : null,
    change: { value: score - before, window },
    credential: cred ? { type: cred.credential_type, age_days: cred.age_days, arn: cred.arn } : null,
    owner: identity.owner,
    severity: failed.some((c) => c.severity === 'CRITICAL') ? 'CRITICAL' : failed.some((c) => c.severity === 'HIGH') ? 'HIGH' : failed.length ? 'MEDIUM' : 'LOW',
    last_used_days: identity.idle_days,
  };
}

export function fleet() {
  return visibleIdentities();
}

export { person, HOUR };
