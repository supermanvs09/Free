/* Identity posture (ISPM): scores, checks, findings and history. */
import { posture as env, failNested, cursorPage, list, rng, hashString, iso, DAY, HOUR, MIN, NOW, sortBy } from '../util';
import { RULES, rule, WEIGHTS, PILLAR_NAMES, evaluate, effectiveChecks, scoreOf, scoreAt, bandOf, gradeOf, pillarScores, postureRow, fromPostureId, findingStates, fleet } from '../postureEngine';
import { credentialsOf, identitiesOf, visible, eventsOf, filteredEvents } from '../world';
import { scopeById } from '../seed';
import { save } from '../state';
import { audit } from '../users';
import { emitEvent } from '../notifyBus';

const windowDays = (w) => ({ '24h': 1, '3d': 3, '7d': 7, '30d': 30, '60d': 60, '90d': 90 })[w] ?? 30;

function filtered(q) {
  let rows = fleet().map((i) => ({ i, row: postureRow(i, q.window) }));
  const has = (key) => list(q[key]).map((v) => String(v).toUpperCase());
  const bands = has('band');
  if (bands.length) rows = rows.filter(({ row }) => bands.includes(row.band));
  const sev = has('severity');
  if (sev.length) rows = rows.filter(({ row }) => sev.includes(row.severity));
  const cats = list(q.category);
  if (cats.length) rows = rows.filter(({ row }) => cats.includes(row.functional_class));
  const accts = list(q.account);
  if (accts.length) rows = rows.filter(({ row }) => accts.includes(row.account_id));
  const types = list(q.type);
  if (types.length) rows = rows.filter(({ row }) => types.includes(row.type));
  const pillars = list(q.pillar);
  if (pillars.length) rows = rows.filter(({ i }) => effectiveChecks(i).some((c) => c.counted && pillars.includes(c.pillar)));
  const failing = list(q.failing_check);
  if (failing.length) rows = rows.filter(({ i }) => effectiveChecks(i).some((c) => c.counted && failing.includes(c.rule_id)));
  if (q.changed) rows = rows.filter(({ row }) => (q.changed === 'down' ? row.change.value < 0 : q.changed === 'up' ? row.change.value > 0 : row.change.value === 0));
  if (q.q) {
    const needle = String(q.q).toLowerCase();
    rows = rows.filter(({ row }) => row.name.toLowerCase().includes(needle) || row.arn.toLowerCase().includes(needle));
  }
  return rows;
}

function sortRows(rows, sort = 'score') {
  const desc = sort.startsWith('-');
  const key = sort.replace(/^-/, '');
  const val = (row) => (key === 'failed' ? -row.checks_failed : key === 'change' ? row.change.value : key === 'name' ? row.name : row.score);
  const out = [...rows].sort((a, b) => {
    const x = val(a.row);
    const y = val(b.row);
    return x === y ? a.row.name.localeCompare(b.row.name) : x > y ? 1 : -1;
  });
  return desc ? out.reverse() : out;
}

export function fleetOverview(window = '30d') {
  const ids = fleet();
  const rows = ids.map((i) => ({ i, row: postureRow(i, window) }));
  const mean = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const score = mean(rows.map((x) => x.row.score));
  const days = windowDays(window);
  const before = mean(ids.map((i) => scoreAt(i, days)));
  const dist = { healthy: 0, fair: 0, poor: 0, critical: 0 };
  for (const { row } of rows) dist[row.band.toLowerCase()] += 1;
  const trend = [];
  const points = Math.min(30, days * (days <= 3 ? 8 : 1));
  for (let k = points - 1; k >= 0; k -= 1) {
    const back = (days * k) / Math.max(1, points - 1);
    trend.push({ at: iso(NOW - back * DAY), score: mean(ids.map((i) => scoreAt(i, back))) });
  }
  const pillars = Object.keys(PILLAR_NAMES).map((p) => {
    const per = ids.map((i) => pillarScores(i).find((x) => x.pillar === p)).filter((x) => x && x.score !== null);
    const failing = per.filter((x) => x.failing > 0).length;
    const s = mean(per.map((x) => x.score));
    return { pillar: p, key: p, name: PILLAR_NAMES[p], label: PILLAR_NAMES[p], score: s, failing, evaluated: per.length, status: failing === 0 ? 'PASS' : s < 70 ? 'FAIL' : 'WARN' };
  });
  const wins = RULES.map((rl) => {
    const affected = ids.filter((i) => effectiveChecks(i).some((c) => c.rule_id === rl.rule_id && c.counted));
    return { rule_id: rl.rule_id, title: rl.title, pillar: rl.pillar, severity: rl.severity, identities: affected.length, fleet_gain: ids.length ? Math.round(((affected.length * WEIGHTS[rl.severity]) / ids.length) * 10) / 10 : 0, fix: rl.fix };
  })
    .filter((w) => w.identities > 0)
    .sort((a, b) => b.fleet_gain - a.fleet_gain)
    .slice(0, 6);
  const byCat = new Map();
  for (const { row } of rows) {
    const e = byCat.get(row.functional_class) ?? { functional_class: row.functional_class, count: 0, scores: [], changes: [] };
    e.count += 1;
    e.scores.push(row.score);
    e.changes.push(row.change.value);
    byCat.set(row.functional_class, e);
  }
  const has = (f) => ids.filter((i) => effectiveChecks(i).some((c) => c.counted && f(c))).length;
  return {
    fleet: { score, grade: score === null ? '' : gradeOf(score), band: score === null ? '' : bandOf(score), identities_scored: ids.length, change: { delta: before === null ? null : score - before, previous: before, window } },
    trend,
    distribution: dist,
    pillars,
    quick_wins: wins,
    weakest_identities: [...rows]
      .sort((a, b) => a.row.score - b.row.score)
      .slice(0, 6)
      .map(({ row }) => ({ identity_id: row.identity_id, name: row.name, arn: row.arn, provider: row.provider, functional_class: row.functional_class, account: row.account.name, score: row.score, band: row.band, checks_failed: row.checks_failed })),
    by_category: [...byCat.values()].map((e) => ({ functional_class: e.functional_class, count: e.count, mean: mean(e.scores), change: mean(e.changes) })).sort((a, b) => a.mean - b.mean),
    by_account: [...new Set(rows.map((x) => x.row.account_id))].map((id) => {
      const mine = rows.filter((x) => x.row.account_id === id);
      return { account_id: id, account: id, name: scopeById(id)?.name ?? id, provider: scopeById(id)?.provider, count: mine.length, mean: mean(mine.map((x) => x.row.score)), change: mean(mine.map((x) => x.row.change.value)) };
    }),
    identities_with: {
      over_permissioned: has((c) => c.pillar === 'least_privilege'),
      stale_credentials: has((c) => c.pillar === 'credential_hygiene'),
      escalation_paths: has((c) => c.pillar === 'escalation'),
      exposed: has((c) => c.pillar === 'exposure' || c.rule_id === 'NHI-TA-003'),
      dormant: has((c) => c.rule_id === 'NHI-LC-002'),
      trust_issues: has((c) => c.pillar === 'trust_access'),
    },
  };
}

function facets(q) {
  const rows = filtered(q).map((x) => x.row);
  const tally = (f) => rows.reduce((m, r) => {
    const k = f(r);
    if (k !== null && k !== undefined) m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});
  const pillar = {};
  const failing = {};
  for (const { i } of filtered(q)) {
    const seen = new Set();
    for (const c of effectiveChecks(i).filter((x) => x.counted)) {
      if (!seen.has(c.pillar)) pillar[c.pillar] = (pillar[c.pillar] ?? 0) + 1;
      seen.add(c.pillar);
      failing[c.rule_id] = { count: (failing[c.rule_id]?.count ?? 0) + 1, title: c.title };
    }
  }
  const account = {};
  for (const r of rows) account[r.account_id] = { count: (account[r.account_id]?.count ?? 0) + 1, name: r.account.name };
  return {
    total: rows.length,
    band: tally((r) => r.band),
    severity: tally((r) => r.severity[0] + r.severity.slice(1).toLowerCase()),
    category: tally((r) => r.functional_class),
    type: tally((r) => r.type),
    pillar,
    account,
    failing_check: failing,
    changed: { down: rows.filter((r) => r.change.value < 0).length, up: rows.filter((r) => r.change.value > 0).length, same: rows.filter((r) => r.change.value === 0).length },
  };
}

function header(identity) {
  const row = postureRow(identity);
  const creds = credentialsOf(identity);
  return {
    ...row,
    badges: identity.identity_type.startsWith('iam_user') ? { mfa_enabled: identity.functional_class === 'HUMAN', console_access: identity.functional_class !== 'NHI_SERVICE' } : {},
    counts: { credentials: creds.length, checks: evaluate(identity).length, failed: row.checks_failed },
    created_at: identity.created_at_aws,
    last_activity_at: identity.last_activity_at,
  };
}

function checkView(identity, c) {
  const rl = rule(c.rule_id);
  return {
    finding_id: c.finding_id,
    rule_id: c.rule_id,
    title: c.title,
    pillar: c.pillar,
    severity: c.severity,
    status: c.status,
    detail: c.detail,
    failing_since: c.failing_since,
    points_if_fixed: c.counted ? c.points : 0,
    points: c.points,
    fix: rl?.fix ?? '',
    why: rl?.why ?? '',
    compliance: rl?.compliance ?? [],
    remediation: rl?.auto ? { action_type: rl.auto, one_click: true } : { action_type: null, one_click: false },
    finding_updated_at: c.state?.updated_at ?? c.failing_since,
    assigned_to: c.state?.assigned_to ?? null,
    accepted_reason: c.state?.accepted_reason ?? null,
    suppressed_until: c.state?.suppressed_until ?? null,
    note: c.state?.note ?? null,
  };
}

function postureOf(identity, window) {
  const checks = effectiveChecks(identity);
  const failed = checks.filter((c) => c.counted);
  const score = scoreOf(identity);
  const days = windowDays(window);
  const lost = failed.reduce((s, c) => s + c.points, 0);
  const peers = fleet().filter((x) => x.functional_class === identity.functional_class && x.id !== identity.id);
  const peerScores = peers.map(scoreOf).sort((a, b) => a - b);
  return {
    score,
    band: bandOf(score),
    grade: gradeOf(score),
    points_lost: lost,
    checks_failed: failed.length,
    checks_evaluated: checks.length,
    change: { value: score - scoreAt(identity, days), window },
    pillars: pillarScores(identity),
    findings: checks.filter((c) => c.failing).map((c) => checkView(identity, c)),
    score_impact: failed.map((c) => ({ rule_id: c.rule_id, title: c.title, fix: rule(c.rule_id)?.fix, points: c.points })).sort((a, b) => b.points - a.points),
    after_every_fix: { score: Math.min(100, score + lost), delta: Math.min(100, score + lost) - score, band: bandOf(Math.min(100, score + lost)), grade: gradeOf(Math.min(100, score + lost)) },
    peer_group: peers.length ? (() => {
      const all = [...peerScores, score].sort((a, b) => b - a);
      const average = Math.round(all.reduce((s, x) => s + x, 0) / all.length);
      const rank = all.indexOf(score) + 1;
      return { label: `${identity.functional_class.replace('NHI_', '').replace('_', ' ').toLowerCase()} identities`, functional_class: identity.functional_class, size: all.length, average, mean: average, best: all[0], median: all[Math.floor(all.length / 2)], rank, standing: score >= average + 5 ? 'Better than most identities of its kind' : score <= average - 5 ? 'Below most identities of its kind' : 'About the same as identities of its kind' };
    })() : null,
    why_this_score: failed.length ? `${failed.length} failing checks cost ${lost} points.` : 'Every applicable check passes.',
    open_alerts: failed.filter((c) => ['CRITICAL', 'HIGH'].includes(c.severity)).length,
    bound_credentials: credentialsOf(identity).map((c) => ({ id: c.id, arn: c.arn, type: c.credential_type, status: c.status, age_days: c.age_days, last_used_days: c.idle_days })),
  };
}

export default function register(r) {
  const B = '/api/v1/ispm';

  r.get(`${B}/posture/overview`, ({ query }) => env(fleetOverview(query.window || '30d'), { meta: { window: query.window || '30d' } }));

  r.get(`${B}/posture/quick-wins/:rule/identities`, ({ params, query }) => {
    const rl = rule(params.rule);
    if (!rl) return failNested(404, 'No such check.', 'NOT_FOUND');
    const rows = fleet().filter((i) => effectiveChecks(i).some((c) => c.rule_id === rl.rule_id && c.counted)).map((i) => postureRow(i));
    const p = cursorPage(rows, query, 25);
    return env({ rule: { rule_id: rl.rule_id, title: rl.title, pillar: rl.pillar, severity: rl.severity, fix: rl.fix }, identities: p.items }, { page: { next_cursor: p.next, limit: p.limit } });
  });

  r.get(`${B}/posture/export`, ({ query }) => {
    const rows = sortRows(filtered(query), 'score').map((x) => x.row);
    const head = 'identity,provider,type,category,account,region,score,band,grade,failed_checks,weakest_pillar';
    const csv = [head, ...rows.map((x) => [x.name, x.provider, x.type, x.functional_class, x.account.name, x.region, x.score, x.band, x.grade, x.checks_failed, x.weakest_pillar ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    return { status: 200, body: csv, headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="identity-posture-${new Date().toISOString().slice(0, 10)}.csv"` } };
  });

  r.get(`${B}/identities`, ({ query }) => {
    const rows = sortRows(filtered(query), query.sort || 'score').map((x) => x.row);
    const p = cursorPage(rows, query, 25);
    return env(p.items, { page: { next_cursor: p.next, limit: p.limit } });
  });

  r.get(`${B}/identities/facets`, ({ query }) => env(facets(query)));

  const one = (id) => {
    const identity = fromPostureId(id);
    return identity && visible(identity) ? identity : null;
  };
  const missing = () => failNested(404, 'That identity has not been scored.', 'NOT_FOUND');

  r.get(`${B}/identities/:id`, ({ params }) => {
    const i = one(params.id);
    return i ? env(header(i)) : missing();
  });
  r.get(`${B}/identities/:id/posture`, ({ params, query }) => {
    const i = one(params.id);
    return i ? env(postureOf(i, query.window || '30d'), { meta: { window: query.window || '30d' } }) : missing();
  });
  r.get(`${B}/identities/:id/checks`, ({ params, query }) => {
    const i = one(params.id);
    if (!i) return missing();
    let checks = effectiveChecks(i).map((c) => checkView(i, c));
    if (query.status === 'failed') checks = checks.filter((c) => c.status !== 'PASSED');
    if (query.status === 'passed') checks = checks.filter((c) => c.status === 'PASSED');
    if (query.pillar) checks = checks.filter((c) => c.pillar === query.pillar);
    return env(checks);
  });
  r.get(`${B}/identities/:id/history`, ({ params, query }) => {
    const i = one(params.id);
    if (!i) return missing();
    const days = windowDays(query.window);
    const pts = [];
    for (let d = days; d >= 0; d -= Math.max(1, Math.round(days / 30))) {
      const s = scoreAt(i, d);
      pts.push({ at: iso(NOW - d * DAY), score: s, band: bandOf(s), checks_failed: effectiveChecks(i).filter((c) => c.counted && (!c.failing_since || Date.parse(c.failing_since) <= NOW - d * DAY)).length });
    }
    return env(pts);
  });
  r.get(`${B}/identities/:id/credentials`, ({ params }) => {
    const i = one(params.id);
    if (!i) return missing();
    return env(credentialsOf(i).map((c) => ({ id: c.id, arn: c.arn, name: c.name, type: c.credential_type, status: c.status, age_days: c.age_days, last_used_days: c.idle_days, rotation_enabled: c.rotation_enabled, expires_at: c.expires_at, has_boundary: Boolean(c.permission_boundary_arn), shared_with: identitiesOf(c).length - 1 })));
  });
  r.get(`${B}/identities/:id/role-use`, ({ params }) => {
    const i = one(params.id);
    if (!i) return missing();
    const roles = credentialsOf(i).filter((c) => c.credential_type === 'iam_role');
    const ev = eventsOf(i);
    return env({
      assumable: roles.length > 0,
      assumed_by: roles.flatMap((c) => identitiesOf(c).filter((x) => x.id !== i.id).map((x) => ({ arn: x.arn, name: x.name, sessions: ev.length % 40, last_assumed_at: x.last_activity_at, first_assumed_at: x.first_seen_at }))),
      assumes: roles.map((c) => ({ role_arn: c.arn, role_name: c.name, sessions: Math.max(1, Math.round(ev.length / 30)), first_assumed_at: c.created_at, last_assumed_at: c.last_used_at, max_session_duration: 3600, privileged: i.is_admin })),
    });
  });
  r.get(`${B}/identities/:id/activity`, ({ params, query }) => {
    const i = one(params.id);
    if (!i) return missing();
    let ev = filteredEvents(i, { time_range: { '24h': '24h', '3d': '7d', '7d': '7d' }[query.window] ?? '30d' });
    if (query.mutating === 'true') ev = ev.filter((e) => !e.is_read_only);
    if (query.mutating === 'false') ev = ev.filter((e) => e.is_read_only);
    if (query.service) ev = ev.filter((e) => e.service === query.service);
    const p = cursorPage(ev.map((e) => ({ event_time: e.event_time, action: e.action, service: e.service, mutating: !e.is_read_only, target: e.resource_arn, source_ip: e.source_ip, error_code: e.error_code, region: e.region })), query, 50);
    return env(p.items, { page: { next_cursor: p.next, limit: p.limit } });
  });
  r.get(`${B}/identities/:id/alerts`, ({ params, query }) => {
    const i = one(params.id);
    if (!i) return missing();
    let rows = effectiveChecks(i)
      .filter((c) => c.failing)
      .map((c) => ({ id: `alr_${c.finding_id}`, finding_id: c.finding_id, rule_id: c.rule_id, title: c.title, severity: c.severity, status: c.status === 'OPEN' ? 'open' : 'closed', raised_at: c.failing_since, resolved_at: c.status === 'OPEN' ? null : c.state?.updated_at ?? null }));
    if (query.status === 'open') rows = rows.filter((x) => x.status === 'open');
    if (query.status === 'closed') rows = rows.filter((x) => x.status === 'closed');
    return env(rows);
  });
  r.get(`${B}/identities/:id/graph`, ({ params }) => {
    const i = one(params.id);
    return i ? env({ nodes: [], edges: [] }) : missing();
  });

  r.get(`${B}/checks/:rule`, ({ params }) => {
    const rl = rule(params.rule);
    if (!rl) return failNested(404, 'No such check.', 'NOT_FOUND');
    const failing = fleet().filter((i) => effectiveChecks(i).some((c) => c.rule_id === rl.rule_id && c.counted));
    return env({ rule_id: rl.rule_id, title: rl.title, pillar: rl.pillar, severity: rl.severity, why: rl.why, fix: rl.fix, remediation: { steps: [rl.fix], action_type: rl.auto, one_click: Boolean(rl.auto) }, compliance: rl.compliance, points: WEIGHTS[rl.severity], identities_failing: failing.length });
  });

  r.patch(`${B}/findings/:id`, ({ params, body, user }) => {
    const all = fleet().flatMap((i) => evaluate(i).map((c) => ({ i, c })));
    const hit = all.find((x) => x.c.finding_id === params.id);
    if (!hit) return failNested(404, 'That finding no longer exists.', 'NOT_FOUND');
    const states = findingStates();
    const prev = states[params.id] ?? { status: 'OPEN' };
    const next = { ...prev, ...body, updated_at: iso(Date.now()), updated_by: user.email };
    states[params.id] = next;
    save();
    audit(user, `finding.${String(body.status || 'update').toLowerCase()}`, `${body.status ? `${body.status[0]}${body.status.slice(1).toLowerCase()}` : 'Updated'} "${hit.c.title}" on ${hit.i.name}`);
    if (body.status === 'OPEN' && prev.status !== 'OPEN') emitEvent({ kind: 'posture', severity: hit.c.severity, title: `Reopened: ${hit.c.title}`, identity: hit.i });
    return { status: 200, body: { data: { finding_id: params.id, status: next.status, accepted_reason: next.accepted_reason ?? null, suppressed_until: next.suppressed_until ?? null, assigned_to: next.assigned_to ?? null, note: next.note ?? null, updated_at: next.updated_at, updated_by: next.updated_by } } };
  });
}

export { rng, hashString, HOUR, MIN, sortBy };
