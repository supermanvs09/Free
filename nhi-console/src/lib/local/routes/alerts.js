/* The alerts inbox: posture drops, behaviour anomalies and exposed credentials. */
import { ok, fail, iso, DAY, HOUR, NOW } from '../util';
import { fleet, effectiveChecks, scoreOf, scoreAtTime, bandOf, postureId, fromPostureId, rule, PILLAR_NAMES, TRIGGERS } from '../postureEngine';
import { anomalies, sourceTypeOf } from './genome';
import { liveFindings } from '../exposureData';
import { liveEvents } from '../notifyBus';
import { credentialsOf, identityById, visible } from '../world';
import { scopeById } from '../seed';
import { isOn } from '../apps';
import { changesForEntity, scans } from '../changes';
import { blastRadius } from '../reach';
import { canonicalGenomeName } from '../../identityLinks';

const lower = (s) => String(s ?? '').toLowerCase();


/**
 * One identity, this sync against the sync before its drop began: the
 * baseline is the last sync completed before the first check that is new in
 * the last 7 days started failing. The alert list and the score-drop page
 * both read this, so the "from" and "to" they show are the same numbers.
 */
export function syncDiff(i) {
  const checks = effectiveChecks(i).filter((c) => c.counted);
  const now = scoreOf(i);
  const fresh = checks.filter((c) => c.failing_since && Date.parse(c.failing_since) > NOW - 7 * DAY).sort((a, b) => b.points - a.points || Date.parse(a.failing_since) - Date.parse(b.failing_since));
  const list = scans();
  const latest = list[0];
  const earliest = fresh.length ? Math.min(...fresh.map((c) => Date.parse(c.failing_since))) : Date.parse(latest.completed_at);
  const baseline = list.find((sc) => Date.parse(sc.completed_at) < earliest) ?? list.at(-1);
  const before = scoreAtTime(checks, Date.parse(baseline.completed_at));
  /* The sync that first saw each new failure: the first one completed after it. */
  const flaggedAt = (c) => [...list].reverse().find((sc) => Date.parse(sc.completed_at) >= Date.parse(c.failing_since)) ?? latest;
  return { checks, now, before, fresh, baseline, latest, flaggedAt, list };
}

function postureAlerts() {
  const out = [];
  for (const i of fleet()) {
    const { now, before, fresh } = syncDiff(i);
    if (before - now < 8) continue;
    const worst = fresh[0];
    out.push({
      key: `posture:${postureId(i)}`,
      source: 'posture',
      title: `${i.name} dropped from ${before} to ${now}`,
      summary: worst ? `${worst.title}: ${worst.detail}` : 'New failing checks.',
      severity: now < 40 ? 'critical' : now < 60 ? 'high' : 'medium',
      detected_at: worst?.failing_since ?? iso(NOW - 6 * HOUR),
      subject: i.name,
      subject_type: i.identity_type,
      identity_id: postureId(i),
      discovery_id: i.id,
      identity_name: i.name,
      identity_arn: i.arn,
      provider: i.provider,
      account_id: i.account_id,
      account_name: scopeById(i.account_id)?.name,
      region: i.region,
      score_before: before,
      score_now: now,
      band_before: bandOf(before),
      band_now: bandOf(now),
      link: `/alerts/identities/${postureId(i)}`,
      count: fresh.length,
    });
  }
  return out;
}

function genomeAlerts() {
  /* An anomaly raised live is already on the list as it happened. */
  const live = new Set(liveEvents().filter((e) => e.kind === 'anomaly' && e.scenario).map((e) => e.identity?.id));
  return anomalies()
    .filter((a) => a.status === 'open' && ['critical', 'high'].includes(a.severity) && !live.has(a.identity_id))
    .map((a) => ({
      key: `genome:${a.id}`,
      source: 'genome',
      title: `${a.display_name}: ${a.title}`,
      summary: a.description,
      severity: a.severity,
      detected_at: a.detected_at,
      subject: a.display_name,
      subject_type: identityById(a.identity_id)?.identity_type,
      identity_name: a.display_name,
      discovery_id: a.identity_id,
      provider: a.provider,
      account_id: a.account_id,
      account_name: scopeById(a.account_id)?.name,
      region: a.region,
      facts: { source_type: a.source_type, identity_name: a.identity_name, latest: a.title, dimension: a.dimension, risk_score: a.risk_score },
      link: '/genome',
      count: 1,
    }));
}

function exposureAlerts() {
  return liveFindings()
    /* A live leak is already on the list as it happened (liveAlerts). */
    .filter((f) => f.list === 'live' && !f.scenario && ['CRITICAL', 'HIGH'].includes(f.risk_tier) && f.analyst_decision !== 'false_positive')
    .map((f) => ({
      key: `exposure:${f.finding_id}`,
      source: 'exposure',
      title: `${f.detector} secret in ${f.repository}`,
      summary: f.identity_name ? `A credential of ${f.identity_name} is in ${f.file_path}.` : `Found in ${f.file_path}.`,
      severity: lower(f.risk_tier),
      detected_at: f.created_at,
      subject: f.repository,
      subject_type: f.platform === 'github' ? 'GitHub repository' : 'Bitbucket repository',
      identity_name: f.identity_name,
      discovery_id: f.identity_id,
      provider: f.platform,
      finding_id: f.finding_id,
      facts: { author: f.committer, branch: f.branch, commit: f.commit_id, file: f.file_path, line: f.line_number, redacted: f.redacted, verification: f.verification_status === 'ACTIVE' ? 'verified' : f.verification_status === 'INACTIVE' ? 'unverified' : 'unknown', platform: f.platform },
      link: `/exposure?finding=${encodeURIComponent(f.finding_id)}`,
      count: 1,
    }));
}

function liveAlerts() {
  const map = { exposure: 'exposure', anomaly: 'genome', posture: 'posture', scan: 'posture' };
  return liveEvents()
    .filter((e) => e.kind !== 'scan')
    .filter((e) => !e.identity || visible(identityById(e.identity.id)))
    .filter((e) => (e.kind === 'exposure' ? isOn(e.facts?.platform ?? 'github') : true))
    .map((e) => ({
      key: e.kind === 'posture' && e.identity ? `posture:${postureId(identityById(e.identity.id))}` : `${map[e.kind]}:${e.id}`,
      source: map[e.kind],
      title: e.title,
      summary: e.summary,
      severity: lower(e.severity),
      detected_at: e.detected_at,
      subject: e.identity?.name ?? e.facts?.subject ?? '',
      subject_type: e.kind === 'exposure' ? `${e.facts?.platform === 'github' ? 'GitHub' : 'Bitbucket'} repository` : e.identity?.identity_type,
      identity_name: e.identity?.name,
      discovery_id: e.identity?.id,
      provider: e.identity?.provider ?? e.facts?.provider,
      account_id: e.identity?.account_id,
      account_name: e.identity?.account_name,
      region: e.identity?.region,
      score_before: e.facts?.score_before,
      score_now: e.facts?.score_now,
      band_before: e.facts?.score_before ? bandOf(e.facts.score_before) : undefined,
      band_now: e.facts?.score_now ? bandOf(e.facts.score_now) : undefined,
      facts: e.kind === 'anomaly' ? { source_type: sourceTypeOf(identityById(e.identity.id)), identity_name: canonicalGenomeName(identityById(e.identity.id).identity_type, e.identity.arn), latest: e.title, ...e.facts } : e.kind === 'exposure' ? { author: 'Sashi Kumar', commit: 'a91c3e7d20f4b8e1c6a5d9f02b7e4c13a8d6f590', ...e.facts } : e.facts,
      /* A score drop opens its sync comparison; a live incident (a replayed
         story) opens where it is handled. */
      link: e.kind === 'posture' && e.identity && !e.scenario ? `/alerts/identities/${postureId(identityById(e.identity.id))}` : e.link,
      scenario: e.scenario ?? null,
      count: 1,
      live: true,
      resolution: e.resolution ?? null,
    }));
}

export function allAlerts() {
  const seen = new Set();
  const out = [];
  for (const a of [...liveAlerts(), ...postureAlerts(), ...genomeAlerts(), ...(isOn('github') || isOn('bitbucket') ? exposureAlerts() : [])]) {
    if (seen.has(a.key)) continue;
    seen.add(a.key);
    out.push(a);
  }
  return out.sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at));
}

export default function register(r) {
  r.get('/api/v1/alerts', () => ok({ alerts: allAlerts(), generated_at: iso(Date.now()), summary: { previous_sync: iso(Date.now() - 6 * HOUR - 41 * 60000), last_sync: iso(Date.now() - 41 * 60000) } }));

  r.get('/api/v1/alerts/summary', () => {
    const all = allAlerts();
    const by = (k) => all.reduce((m, a) => ({ ...m, [a[k]]: (m[a[k]] ?? 0) + 1 }), {});
    return ok({ badge: all.length, total: all.length, new: all.filter((a) => Date.parse(a.detected_at) > Date.now() - DAY).length, by_source: by('source'), by_severity: by('severity'), latest_at: all[0]?.detected_at ?? null });
  });

  r.get('/api/v1/alerts/identities/:id', ({ params }) => {
    const i = fromPostureId(params.id);
    if (!i || !visible(i)) return fail(404, 'That identity is not in scope.', 'NOT_FOUND');
    const { checks, now, before, fresh, baseline, latest, flaggedAt, list } = syncDiff(i);
    const all = effectiveChecks(i);
    const old = checks.filter((c) => !fresh.includes(c));
    const lost = fresh.reduce((s, c) => s + c.points, 0);
    const syncRef = (sc) => (sc ? { scan_id: sc.scan_id, completed_at: sc.completed_at } : null);
    const view = (c) => {
      const r = rule(c.rule_id);
      return {
        rule_id: c.rule_id,
        title: c.title,
        severity: c.severity,
        pillar: c.pillar,
        pillar_name: PILLAR_NAMES[c.pillar] ?? c.pillar,
        detail: c.detail,
        points: c.points,
        share_pct: lost ? Math.round((c.points / lost) * 100) : 0,
        failing_since: c.failing_since,
        flagged_by: syncRef(flaggedAt(c)),
        finding_id: c.finding_id,
        why: r?.why ?? null,
        fix: r?.fix ?? null,
        compliance: r?.compliance ?? [],
        trigger: TRIGGERS[c.rule_id]?.kind ?? 'change',
        trigger_text: TRIGGERS[c.rule_id]?.text ?? null,
        change_id: TRIGGERS[c.rule_id]?.kind === 'change' ? `chg_${c.finding_id.slice(4)}` : null,
      };
    };
    /* No longer counted since the baseline: accepted or suppressed by someone. */
    const settled = all
      .filter((c) => c.failing && !c.counted && c.state?.updated_at && Date.parse(c.state.updated_at) > Date.parse(baseline.completed_at))
      .map((c) => ({ rule_id: c.rule_id, title: c.title, severity: c.severity, points: c.points, status: c.status, by: c.state?.updated_by_name ?? c.state?.updated_by ?? null, at: c.state?.updated_at }));
    /* Everything about the identity and its credentials AWS changed between the two syncs. */
    const window = (c) => Date.parse(c.detected_at) > Date.parse(baseline.completed_at) && Date.parse(c.detected_at) <= Date.parse(latest.completed_at) + 60000;
    const rows = [changesForEntity('identity', i).changes, ...credentialsOf(i).map((cr) => changesForEntity('credential', cr).changes)].flat();
    const seen = new Set();
    const changes = rows
      .filter((c) => window(c) && !seen.has(c.change_id) && seen.add(c.change_id))
      .sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at))
      .map((c) => ({ change_id: c.change_id, rule_id: c.rule_id ?? null, scan_id: c.scan_id, change_type: c.change_type, entity_type: c.entity_type, entity_name: c.entity_name, entity_arn: c.entity_arn, summary: c.summary, detected_at: c.detected_at, details: c.details, cloudtrail: c.cloudtrail_evidence }));
    /* Score at every sync in the last 10 days, oldest first. */
    const series = [...list].reverse().map((sc) => ({ at: sc.completed_at, scan_id: sc.scan_id, score: scoreAtTime(checks, Date.parse(sc.completed_at)) }));
    const pillars = Object.keys(PILLAR_NAMES)
      .map((p) => {
        const nowLost = checks.filter((c) => c.pillar === p).reduce((s, c) => s + c.points, 0);
        const newLost = fresh.filter((c) => c.pillar === p).reduce((s, c) => s + c.points, 0);
        const evaluated = all.filter((c) => c.pillar === p).length;
        return { pillar: p, name: PILLAR_NAMES[p], evaluated, points_lost_now: nowLost, points_lost_before: nowLost - newLost, new_points: newLost };
      })
      .filter((p) => p.evaluated > 0);
    const subject = credentialsOf(i).find((c) => c.credential_type === 'iam_role')?.arn ?? i.arn;
    const b = blastRadius(subject);
    const scope = scopeById(i.account_id);
    return ok({
      identity_id: params.id,
      discovery_id: i.id,
      identity_name: i.name,
      identity_arn: i.arn,
      identity_type: i.identity_type,
      provider: i.provider,
      environment: i.environment,
      owner: i.owner ? { email: i.owner, name: i.owner_name, team: i.owner_team } : null,
      credential_arn: credentialsOf(i)[0]?.arn ?? null,
      account_id: i.account_id,
      account_name: scope?.name ?? i.account_id,
      region: i.region,
      score_now: now,
      score_before: before,
      points_new: fresh.reduce((s, c) => s + c.points, 0),
      band_now: bandOf(now),
      band_before: bandOf(before),
      before_at: baseline.completed_at,
      this_sync: syncRef(latest),
      previous_sync: syncRef(baseline),
      syncs_between: Math.max(0, list.indexOf(baseline) - 1),
      checks_failed: checks.length,
      checks_failed_before: old.length,
      checks_evaluated: all.length,
      new_failing_checks: fresh.map(view),
      still_failing_checks: old.map(view),
      no_longer_counted: settled,
      inventory_changes: changes,
      series,
      pillars,
      blast: b ? { score: b.blast_radius_score, risk: b.risk_level, resources: b.reachable_resources.length, sensitive: b.summary.sensitive, accounts: b.reachable_resources.length ? b.summary.accounts : 0, roles: b.reachable_identities.length } : null,
      timeline: fresh.map((c) => ({ at: c.failing_since, title: c.title, points: -c.points })),
      why_this_score: `${checks.length} failing checks cost ${checks.reduce((s, c) => s + c.points, 0)} points.`,
      prevent: fresh[0] ? rule(fresh[0].rule_id)?.fix : null,
    });
  });
}
