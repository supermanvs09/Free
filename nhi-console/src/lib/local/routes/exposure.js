/* Credential exposure: findings, verdicts, accepted findings and deep scans. */
import { bare, iso, DAY, HOUR, MIN, NOW, rng, hashString } from '../util';
import { allFindings, liveFindings, decisions, allowlist, deepScans, platformOn } from '../exposureData';
import { REPOSITORIES, GITHUB_ORG } from '../seed';
import { isOn, apps } from '../apps';
import { save } from '../state';
import { audit } from '../users';
import { can } from '../roles';

const CE = '/api/v1/credential-exposure';
const LIST_OF = { findings: 'live', review: 'review', repeated: 'repeated', noise: 'noise', flagged: 'flagged' };

const page = (rows, q) => {
  const limit = Math.min(500, Number(q.limit) || 500);
  const offset = Number(q.offset) || 0;
  return { findings: rows.slice(offset, offset + limit), count: rows.length };
};

function deepRows() {
  const scans = deepScans();
  const out = [];
  for (const [key, scan] of Object.entries(scans)) {
    if (scan.status !== 'complete') continue;
    const [platform, repository] = key.split('|');
    if (!platformOn(platform)) continue;
    const base = allFindings().filter((f) => f.repository === repository && f.list === 'live');
    const r = rng(hashString(key));
    for (const f of base) {
      for (const branch of scan.branches) {
        out.push({ ...f, finding_id: `${f.finding_id}@${branch}#deep`, branch, deep: true, commit_id: r.hex(40), created_at: scan.completed_at });
      }
    }
  }
  return out;
}

function forbidden(user) {
  return !can(user, 'exposure') ? bare({ error: 'FORBIDDEN', message: 'Exposed credentials are for admins.' }, 403) : null;
}

export default function register(r) {
  for (const [path, list] of Object.entries(LIST_OF)) {
    const url = path === 'findings' ? `${CE}/findings` : `${CE}/findings/${path}`;
    r.get(url, ({ query, user }) => {
      const no = forbidden(user);
      if (no) return no;
      if (path === 'findings' && query.finding_id) {
        const all = [...liveFindings(), ...deepRows()];
        const f = all.find((x) => x.finding_id === query.finding_id);
        return f ? bare(f) : bare({ error: 'NOT_FOUND', message: 'That finding no longer exists.' }, 404);
      }
      return bare(page(liveFindings().filter((f) => f.list === list).map((f) => ({ ...f, deep: false })), query));
    });
  }

  r.get(`${CE}/deep-findings`, ({ query }) => bare(page(deepRows(), query)));

  r.get(`${CE}/findings/summary`, () => {
    const live = liveFindings();
    const main = live.filter((f) => f.list === 'live');
    const byPlatform = {};
    for (const f of main) byPlatform[f.platform] = (byPlatform[f.platform] ?? 0) + 1;
    return bare({
      total_findings: main.length,
      critical_count: main.filter((f) => f.risk_tier === 'CRITICAL').length,
      high_count: main.filter((f) => f.risk_tier === 'HIGH' || f.risk_tier === 'CRITICAL').length,
      medium_count: main.filter((f) => f.risk_tier === 'MEDIUM').length,
      low_count: main.filter((f) => f.risk_tier === 'LOW').length,
      affected_repositories: new Set(main.map((f) => f.repository)).size,
      lists: {
        main: main.length,
        review: live.filter((f) => f.list === 'review').length,
        repeated: live.filter((f) => f.list === 'repeated').length,
        noise: live.filter((f) => f.list === 'noise').length,
        ml_flagged: live.filter((f) => f.list === 'flagged').length,
      },
      by_platform: byPlatform,
      platforms: ['github', 'bitbucket', 'codecommit'].filter(platformOn),
      deep_findings: deepRows().length,
      deep_available: true,
      accepted: allowlist().length,
    });
  });

  r.post(`${CE}/decisions`, ({ body, user }) => {
    const f = liveFindings().find((x) => x.finding_id === body.finding_id) ?? deepRows().find((x) => x.finding_id === body.finding_id);
    if (!f) return bare({ error: 'NOT_FOUND', message: 'That finding no longer exists.' }, 404);
    decisions()[body.finding_id] = { analyst_decision: body.decision, analyst_decided_by: user.email, analyst_decided_at: iso(Date.now()) };
    save();
    audit(user, 'exposure.decision', `Marked a ${f.platform === 'github' ? 'GitHub' : 'Bitbucket'} finding in ${f.repository} as ${body.decision === 'real_secret' ? 'a real secret' : 'a false positive'}`);
    return bare({ ok: true, finding_id: body.finding_id, decision: body.decision });
  });

  r.get(`${CE}/repositories`, () => {
    const scans = deepScans();
    return bare({
      repositories: REPOSITORIES.filter((x) => platformOn(x.platform)).map((x) => {
        const rr = rng(hashString(x.name));
        return {
          repository: x.name,
          name: x.name,
          platform: x.platform,
          client_id: x.platform === 'github' ? GITHUB_ORG : 'bitbucket.deepalgorithms.ai',
          default_branch: x.branches[0],
          last_scanned_at: iso(NOW - rr.int(10, 300) * MIN),
          findings: allFindings().filter((f) => f.repository === x.name && f.list === 'live').length,
          branches: x.branches.map((b, k) => {
            const s = scans[`${x.platform}|${x.name}`];
            return { name: b, default: k === 0, last_scanned_at: iso(NOW - rr.int(10, 300) * MIN), deep_scan: s && s.branches.includes(b) ? { status: s.status, requested_at: s.requested_at, completed_at: s.completed_at, commits_scanned: s.commits_scanned } : null };
          }),
        };
      }),
    });
  });

  r.get(`${CE}/branches`, ({ query }) => {
    const repo = REPOSITORIES.find((x) => x.name === query.repository);
    if (!repo) return bare({ error: 'NOT_FOUND', message: 'Unknown repository.' }, 404);
    return bare({ options: [{ value: 'default', label: `Default branch (${repo.branches[0]})`, kind: 'default' }, { value: 'all', label: `All ${repo.branches.length} branches`, kind: 'all' }, ...repo.branches.map((b) => ({ value: b, label: b, kind: 'branch' }))] });
  });

  r.get(`${CE}/allowlist`, () => bare({ entries: allowlist() }));
  r.post(`${CE}/allowlist`, ({ body, user }) => {
    const entry = { client_id: body.client_id, file_path: body.file_path, detector: body.detector, redacted: body.redacted, reason: body.reason ?? '', dismissed_by: user.email, dismissed_at: iso(Date.now()) };
    const f = allFindings().find((x) => x.client_id === body.client_id && x.file_path === body.file_path && x.detector === body.detector);
    if (f) Object.assign(entry, { repository: f.repository, platform: f.platform, branch: f.branch, risk_tier: f.risk_tier, category: f.category, created_at: f.created_at, finding_id: f.finding_id, identity_name: f.identity_name, identity_provider: f.identity_provider });
    allowlist().unshift(entry);
    save();
    audit(user, 'exposure.accept', `Accepted a finding in ${entry.repository ?? entry.file_path}`);
    return bare({ ok: true, entry });
  });
  r.delete(`${CE}/allowlist`, ({ body, user }) => {
    const list = allowlist();
    const i = list.findIndex((e) => e.client_id === body.client_id && e.file_path === body.file_path && e.detector === body.detector && e.redacted === body.redacted);
    if (i >= 0) list.splice(i, 1);
    save();
    audit(user, 'exposure.restore', 'Moved an accepted finding back to the live list');
    return bare({ ok: true });
  });

  r.post(`${CE}/deep-scan`, ({ body, user }) => {
    const repo = REPOSITORIES.find((x) => x.name === body.repository);
    if (!repo) return bare({ error: 'NOT_FOUND', message: 'Unknown repository.' }, 404);
    const key = `${repo.platform}|${repo.name}`;
    const existing = deepScans()[key];
    if (existing && existing.status === 'running') return bare({ already_running: true, status: 'running' }, 200);
    const branches = body.branches === 'all' ? repo.branches : Array.isArray(body.branches) ? body.branches : [repo.branches[0]];
    deepScans()[key] = { status: 'running', requested_at: iso(Date.now()), requested_by: user.email, branches, commits_scanned: 0, completed_at: null, started: Date.now() };
    save();
    audit(user, 'exposure.deep_scan', `Started a deep scan of ${repo.name}`);
    return bare({ accepted: true, status: 'running', already_running: false }, 202);
  });

  r.get(`${CE}/deep-scan/status`, ({ query }) => {
    const repo = REPOSITORIES.find((x) => x.name === query.repository);
    if (!repo) return bare({ status: 'not_started' });
    const s = deepScans()[`${repo.platform}|${repo.name}`];
    if (!s) return bare({ status: 'not_started' });
    if (s.status === 'running' && Date.now() - (s.started ?? 0) > 20000) {
      const rr = rng(hashString(repo.name));
      Object.assign(s, { status: 'complete', completed_at: iso(Date.now()), commits_scanned: rr.int(800, 6400) });
      save();
    } else if (s.status === 'running') {
      s.commits_scanned = Math.round(((Date.now() - (s.started ?? Date.now())) / 20000) * 2400);
    }
    return bare({ status: s.status, requested_at: s.requested_at, completed_at: s.completed_at, commits_scanned: s.commits_scanned, findings: s.status === 'complete' ? allFindings().filter((f) => f.repository === repo.name && f.list === 'live').length * s.branches.length : null, branches: s.branches });
  });

  /* GitHub and Bitbucket as code sources (the AWS page's view of them). */
  r.get('/api/v1/integrations/code-sources', () => {
    const a = apps();
    return { status: 200, body: { success: true, data: {
      github: { connected: isOn('github'), org: a.github.org, verified_at: a.github.verified_at, checks: a.github.checks, repositories: REPOSITORIES.filter((x) => x.platform === 'github').length },
      bitbucket: { connected: isOn('bitbucket'), base_url: a.bitbucket.base_url, verified_at: a.bitbucket.verified_at, token_expires_at: a.bitbucket.token_expires_at, checks: a.bitbucket.checks, repositories: REPOSITORIES.filter((x) => x.platform === 'bitbucket').length },
    } } };
  });
}

export { HOUR, DAY };
