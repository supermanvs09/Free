/* NHI Genome: behaviour baselines, departures (anomalies) and their evidence. */
import { genome as env, cursorPage, failNested, rng, hashString, iso, DAY, HOUR, MIN, NOW, list } from '../util';
import { identities, identityById, identityByArn, eventsOf, visible, credentialsOf } from '../world';
import { activeAnomalySpecs, onOverlayChange } from '../entitlements';
import { estate, person } from '../seed';
import { slice, save } from '../state';
import { audit } from '../users';
import { genomeSourceType, canonicalGenomeName } from '../../identityLinks';

const DIMENSIONS = ['api_call', 'resource', 'source_ip', 'time_of_day', 'volume', 'region', 'user_agent'];
const DIM_LABEL = { api_call: 'New API call', resource: 'New resource', source_ip: 'New network origin', time_of_day: 'Unusual hour', volume: 'Volume spike', region: 'New region', user_agent: 'New client' };

export const sourceTypeOf = (i) => genomeSourceType(i.identity_type);
const keyOf = (i) => ({ source_type: sourceTypeOf(i), identity_name: canonicalGenomeName(i.identity_type, i.arn) });

export function monitored() {
  return identities().filter((i) => i.idle_days < 60 && sourceTypeOf(i));
}

function baselineOf(i) {
  const r = rng(hashString(`bl:${i.id}`));
  const required = 14;
  const built = Math.min(required, Math.max(1, Math.round((NOW - Date.parse(i.first_seen_at)) / DAY)));
  const learning = built < required || i.name.includes('staging') || r.chance(0.12);
  return {
    status: learning ? 'learning' : 'active',
    built_days: learning ? Math.min(built, r.int(4, 12)) : required,
    required_days: required,
    version: learning ? null : r.int(3, 19),
    active_since: learning ? null : iso(NOW - r.int(3, 60) * DAY),
    updated_at: iso(NOW - r.int(2, 30) * HOUR),
    retraining_status: 'idle',
  };
}

const feedback = () => slice('anomalyFeedback', () => ({}));

let cache = null;
onOverlayChange(() => {
  cache = null;
});
export function anomalies() {
  if (cache) return cache.filter((a) => visible(identityById(a.identity_id)));
  const out = [];
  /* Departures from baseline, from the entitlement model's list, each with
     the recorded events behind it (world.js eventsOf). */
  activeAnomalySpecs().forEach((spec, k) => {
    const i = estate().identities.find((x) => x.name === spec.who);
    if (!i || !sourceTypeOf(i)) return;
    const r = rng(hashString(`an:${i.id}:${k}`));
    const ev = eventsOf(i);
    const flagged = ev.filter((e) => e.anomaly === spec.dimension);
    const sample = flagged[flagged.length - 1] ?? ev[0];
    if (!sample) return;
    const detected = Date.parse(sample.event_time) + r.int(2, 9) * MIN;
    const sev = spec.severity;
    const resolved = Boolean(spec.resolved);
    out.push({
      id: `anm_${i.id.slice(4, 10)}${k}${r.hex(6)}`,
      identity_id: i.id,
      source_type: sourceTypeOf(i),
      identity_name: canonicalGenomeName(i.identity_type, i.arn),
      display_name: i.name,
      account_id: i.account_id,
      region: i.region,
      provider: i.provider,
      /* The shape the anomaly list and inbox group by. */
      identity: { source_type: sourceTypeOf(i), identity_name: canonicalGenomeName(i.identity_type, i.arn), display_name: i.name, principal_arn: i.arn, account_id: i.account_id, region: i.region, provider: i.provider, inventory_id: i.id },
      dimension: spec.dimension,
      title: `${DIM_LABEL[spec.dimension]}: ${spec.value}`,
      description: spec.description,
      what_changed: `${DIM_LABEL[spec.dimension]}: ${spec.value} (normal: ${spec.baseline})`,
      change: { dimension: spec.dimension, value: spec.value, baseline: spec.baseline },
      severity: sev,
      risk_score: { critical: r.int(88, 97), high: r.int(70, 84), medium: r.int(45, 64), low: r.int(18, 36) }[sev],
      status: resolved ? 'resolved' : 'open',
      state: resolved ? 'resolved' : 'open',
      detected_at: iso(Math.min(detected, NOW - MIN)),
      occurred_at: sample.event_time,
      anomalous_event_count: spec.count ?? (flagged.length || 1),
      model_confidence_percent: { critical: r.int(92, 98), high: r.int(84, 93), medium: r.int(72, 85), low: r.int(64, 76) }[sev],
      provenance_confidence: sev === 'critical' || sev === 'high' ? 'high' : 'medium',
      reasons: [DIM_LABEL[spec.dimension], spec.untrusted ? 'Untrusted network' : 'Outside the learned range'],
      event_id: sample.event_id,
      sample_event: { event_id: sample.event_id, event_time: sample.event_time, event_name: sample.event_name, event_source: sample.event_source, source_ip: sample.source_ip, user_agent: sample.user_agent, resource_arn: sample.resource_arn },
    });
  });
  cache = out.sort((a, b) => Date.parse(b.detected_at) - Date.parse(a.detected_at));
  return cache.filter((a) => visible(identityById(a.identity_id)));
}

function withFeedback(a) {
  const f = feedback()[a.id];
  return f ? { ...a, ...f } : a;
}

function fleetRow(i) {
  const mine = anomalies().map(withFeedback).filter((a) => a.identity_id === i.id);
  const open = mine.filter((a) => a.status === 'open');
  const worst = open.sort((a, b) => b.risk_score - a.risk_score)[0];
  return {
    id: `${sourceTypeOf(i)}:${i.arn}`,
    ...keyOf(i),
    display_name: i.name,
    nhi_identity_type: i.identity_type,
    workload_key: i.identity_type,
    role_kind: null,
    principal_arn: i.arn,
    inventory_id: i.id,
    resource_arn: i.arn,
    status: i.status,
    account_id: i.account_id,
    region: i.region,
    provider: i.provider,
    baseline: baselineOf(i),
    risk: { score: worst?.risk_score ?? (mine.length ? 22 : 8), severity: worst?.severity ?? 'low' },
    last_seen: i.last_activity_at,
    open_anomaly_count: open.length,
    mapping: { status: 'mapped' },
    discovery_identities: [{ inventory_id: i.id, genome_key: keyOf(i) }],
  };
}

function findByKey(sourceType, name) {
  const i = identityByArn(name) ?? identities().find((x) => canonicalGenomeName(x.identity_type, x.arn) === name);
  return i && visible(i) && sourceTypeOf(i) === sourceType ? i : null;
}

export default function register(r) {
  const B = '/api/v1/genome';

  r.get(`${B}/workload-types`, () => env({ all: true, families: ['compute', 'serverless', 'container', 'cicd', 'agent', 'data', 'federated', 'azure', 'jenkins', 'vault'] }));

  r.get(`${B}/dashboard/summary`, () => {
    const fleet = monitored();
    const bl = fleet.map(baselineOf);
    const all = anomalies().map(withFeedback);
    const open = all.filter((a) => a.status === 'open');
    const byDay = new Map();
    for (let d = 13; d >= 0; d -= 1) byDay.set(iso(NOW - d * DAY).slice(0, 10), 0);
    for (const a of all) {
      const k = a.detected_at.slice(0, 10);
      if (byDay.has(k)) byDay.set(k, byDay.get(k) + 1);
    }
    const dims = new Map();
    for (const a of open) dims.set(a.dimension, (dims.get(a.dimension) ?? 0) + 1);
    return env({
      cards: {
        identities_watched: fleet.length,
        baselines_established: bl.filter((b) => b.status === 'active').length,
        still_learning: bl.filter((b) => b.status === 'learning').length,
        open_anomalies: open.length,
        critical_anomalies: open.filter((a) => a.severity === 'critical').length,
      },
      departures_by_dimension: [...dims.entries()].map(([dimension, count]) => ({ dimension, label: DIM_LABEL[dimension], count })).sort((a, b) => b.count - a.count),
      anomalies_by_day: [...byDay.entries()].map(([day, count]) => ({ day, date: day, count })),
      most_anomalous_identities: fleet
        .map(fleetRow)
        .filter((x) => x.open_anomaly_count > 0)
        .sort((a, b) => b.risk.score - a.risk.score)
        .slice(0, 6)
        .map((x) => ({ ...x, open_anomalies: x.open_anomaly_count, risk_score: x.risk.score, severity: x.risk.severity, anomalous_event_count: anomalies().filter((a) => a.identity_id === x.inventory_id).reduce((s, a) => s + a.anomalous_event_count, 0) })),
      recently_baselined: fleet
        .map((i) => ({ i, b: baselineOf(i) }))
        .filter((x) => x.b.status === 'active')
        .sort((a, b) => Date.parse(b.b.active_since) - Date.parse(a.b.active_since))
        .slice(0, 6)
        .map(({ i, b }) => ({ id: `bl_${i.id}`, ...keyOf(i), display_name: i.name, region: i.region, occurred_at: b.active_since, version: b.version, provider: i.provider, event: b.version > 1 ? 'baseline_version_published' : 'baseline_established' })),
    });
  });

  r.get(`${B}/identities`, ({ query }) => {
    let rows = monitored().map(fleetRow);
    if (query.sort === 'risk_desc' || !query.sort) rows.sort((a, b) => b.risk.score - a.risk.score);
    const p = cursorPage(rows, query, 100);
    return env({ items: p.items, activity_known: true }, { next_cursor: p.next });
  });

  r.get(`${B}/identities/:st/:name`, ({ params }) => {
    const i = findByKey(params.st, params.name);
    if (!i) return failNested(404, 'This identity is not monitored.', 'NOT_FOUND');
    const ev = eventsOf(i).filter((e) => Date.parse(e.event_time) > NOW - 7 * DAY);
    const b = baselineOf(i);
    return env({
      identity: { ...keyOf(i), display_name: i.name, arn: i.arn, resource_arn: i.arn, role_kind: null, role_arn: credentialsOf(i).find((c) => c.credential_type === 'iam_role')?.arn ?? null, account_id: i.account_id, region: i.region, nhi_identity_type: i.identity_type, provider: i.provider, inventory_id: i.id, owner: i.owner, status: i.status, first_seen_date: i.first_seen_at.slice(0, 10) },
      baseline_summary: b,
      headline_metrics: { calls_in_window: ev.length, open_anomalies: anomalies().map(withFeedback).filter((a) => a.identity_id === i.id && a.status === 'open').length, last_seen: i.last_activity_at },
    });
  });

  r.get(`${B}/identities/:st/:name/activity`, ({ params, query }) => {
    const i = findByKey(params.st, params.name);
    if (!i) return failNested(404, 'This identity is not monitored.', 'NOT_FOUND');
    const from = Date.parse(query.from) || NOW - 7 * DAY;
    const to = Date.parse(query.to) || NOW;
    const ev = eventsOf(i).filter((e) => {
      const t = Date.parse(e.event_time);
      return t >= from && t <= to;
    });
    const span = to - from;
    const bucket = query.bucket || (span <= 2 * DAY ? 'hour' : 'day');
    const size = bucket === 'hour' ? HOUR : DAY;
    const vol = new Map();
    for (let t = Math.floor(from / size) * size; t <= to; t += size) vol.set(t, 0);
    for (const e of ev) {
      const k = Math.floor(Date.parse(e.event_time) / size) * size;
      vol.set(k, (vol.get(k) ?? 0) + 1);
    }
    const p = cursorPage(ev, { limit: query.recent_limit || 20, cursor: query.recent_cursor }, 20);
    return env(
      {
        volume: [...vol.entries()].map(([t, count]) => ({ bucket: iso(t), at: iso(t), count, calls: count })),
        recent_calls: p.items.map((e) => ({ event_id: e.event_id, event_time: e.event_time, event_name: e.event_name, event_source: e.event_source, api_call: e.action, source_ip: e.source_ip, user_agent: e.user_agent, resource_arn: e.resource_arn, region: e.region, error_code: e.error_code })),
        total_calls: ev.length,
      },
      { next_cursor: p.next },
    );
  });

  r.get(`${B}/identities/:st/:name/genome`, ({ params }) => {
    const i = findByKey(params.st, params.name);
    if (!i) return failNested(404, 'This identity is not monitored.', 'NOT_FOUND');
    const ev = eventsOf(i).filter((e) => Date.parse(e.event_time) > NOW - 30 * DAY);
    const tally = (f) => {
      const m = new Map();
      for (const e of ev) m.set(f(e), (m.get(f(e)) ?? 0) + 1);
      return [...m.entries()].filter(([k]) => k).sort((a, b) => b[1] - a[1]);
    };
    const total = Math.max(1, ev.length);
    const actions = tally((e) => e.action).slice(0, 10);
    const resources = tally((e) => e.resource_arn?.replace(/\/[0-9a-f]{8}\.json$/, '/*')).slice(0, 10);
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: ev.filter((e) => new Date(e.event_time).getUTCHours() === h).length }));
    const share = (rows) => rows.map(([value, count]) => ({ value, share_percent: Math.round((count / total) * 1000) / 10 }));
    const dim = (dimension, rows) => share(rows).map((x) => ({ dimension, ...x }));
    const sched = new Map();
    for (const e of ev) {
      const d = new Date(e.event_time);
      const key = `${((d.getUTCDay() + 6) % 7) + 1}|${d.getUTCHours()}`;
      sched.set(key, (sched.get(key) ?? 0) + 1);
    }
    void hours;
    return env({
      fingerprint: [
        ...dim('api_service', tally((e) => e.service).slice(0, 5)),
        ...dim('read_write', tally((e) => (e.is_read_only ? 'read' : 'write'))),
        ...dim('result', tally((e) => (e.error_code ? 'error' : 'success'))),
        ...dim('region', tally((e) => e.region)),
        ...dim('source_network_class', tally((e) => (e.source_ip.startsWith('10.') ? 'private (VPC)' : e.source_ip.startsWith('185.') ? 'anonymiser' : 'public'))),
        ...dim('user_agent_family', tally((e) => e.user_agent.split('/')[0]).slice(0, 4)),
        ...dim('resource_type', tally((e) => e.resource_type).slice(0, 5)),
      ],
      typical_actions: actions.map(([value, count]) => ({ api_operation: value, calls: count, share_percent: Math.round((count / total) * 100) })),
      typical_resources: resources.map(([value, count]) => ({ resource: value, resource_type: ev.find((e) => e.resource_arn?.startsWith(value.replace(/\/\*$/, '')))?.resource_type ?? null, calls: count, share_percent: Math.round((count / total) * 100) })),
      activity_schedule: [...sched.entries()].map(([k, calls]) => ({ day_of_week: Number(k.split('|')[0]), hour: Number(k.split('|')[1]), calls })),
    });
  });

  r.get(`${B}/identities/:st/:name/timeline`, ({ params, query }) => {
    const i = findByKey(params.st, params.name);
    if (!i) return failNested(404, 'This identity is not monitored.', 'NOT_FOUND');
    const b = baselineOf(i);
    const items = [
      ...anomalies().map(withFeedback).filter((a) => a.identity_id === i.id).map((a) => ({ type: 'anomaly', id: a.id, title: a.title, description: a.description, severity: a.severity, status: a.status, occurred_at: a.detected_at, dimension: a.dimension })),
      ...(b.active_since
        ? [{ type: 'baseline_established', id: `bl_${i.id}`, title: `Baseline v${b.version} activated`, description: `${b.required_days} days of behaviour learned.`, occurred_at: b.active_since, version: b.version }]
        : [{ type: 'learning_started', id: `ls_${i.id}`, title: 'Learning started', description: `${b.built_days} of ${b.required_days} days learned so far.`, occurred_at: i.first_seen_at }]),
      { type: 'first_seen', id: `fs_${i.id}`, title: 'First seen', description: 'Monitoring started.', occurred_at: i.first_seen_at },
    ].sort((a, b2) => Date.parse(b2.occurred_at) - Date.parse(a.occurred_at));
    const p = cursorPage(items, query, 25);
    return env({ items: p.items }, { next_cursor: p.next });
  });

  r.get(`${B}/identities/:st/:name/baseline`, ({ params }) => {
    const i = findByKey(params.st, params.name);
    if (!i) return failNested(404, 'This identity is not monitored.', 'NOT_FOUND');
    const b = baselineOf(i);
    if (b.status !== 'active') return failNested(404, 'No active baseline yet.', 'NOT_FOUND');
    const rr = rng(hashString(`v:${i.id}`));
    return env({
      ...b,
      versions: Array.from({ length: Math.min(5, b.version) }, (_, k) => ({ version: b.version - k, status: k === 0 ? 'active' : 'superseded', created_at: iso(Date.parse(b.active_since) - k * rr.int(5, 12) * DAY), reason: k === 0 ? 'Scheduled retrain' : rr.pick(['Approved departure folded in', 'Scheduled retrain', 'Deploy changed call mix']) })),
      dimensions: DIMENSIONS.map((d) => ({ dimension: d, label: DIM_LABEL[d], values: rr.int(2, 30), psi: rr.int(1, 18) / 100 })),
    });
  });

  r.get(`${B}/identities/:st/:name/drift`, ({ params }) => {
    const i = findByKey(params.st, params.name);
    if (!i) return failNested(404, 'This identity is not monitored.', 'NOT_FOUND');
    const rr = rng(hashString(`d:${i.id}`));
    const dims = DIMENSIONS.map((d) => ({ dimension: d, label: DIM_LABEL[d], psi: rr.int(1, i.hot ? 34 : 14) / 100 }));
    const worst = [...dims].sort((a, b) => b.psi - a.psi)[0];
    return env({ psi: worst.psi, psi_max_dimension: worst.dimension, dimensions: dims, drift: worst.psi > 0.25 ? 'significant' : worst.psi > 0.1 ? 'moderate' : 'stable', updated_at: iso(NOW - 2 * HOUR) });
  });

  r.get(`${B}/identities/:st/:name/peers`, ({ params }) => {
    const i = findByKey(params.st, params.name);
    if (!i) return failNested(404, 'This identity is not monitored.', 'NOT_FOUND');
    const peers = monitored().filter((x) => x.identity_type === i.identity_type && x.id !== i.id).slice(0, 6);
    return env({ peers: peers.map((p) => ({ ...keyOf(p), display_name: p.name, calls: eventsOf(p).length, recent_call_count: eventsOf(p).filter((e) => Date.parse(e.event_time) > NOW - 7 * DAY).length, outlier_dimension: null, risk_score: fleetRow(p).risk.score })) });
  });

  r.get(`${B}/anomalies`, ({ query }) => {
    let rows = anomalies().map(withFeedback);
    if (query.state) rows = rows.filter((a) => a.status === query.state || a.state === query.state);
    if (query.dimension) rows = rows.filter((a) => list(query.dimension).includes(a.dimension));
    if (query.source_type) rows = rows.filter((a) => a.source_type === query.source_type);
    if (query.search) rows = rows.filter((a) => a.display_name.toLowerCase().includes(String(query.search).toLowerCase()));
    const p = cursorPage(rows, query, 25);
    return env({ items: p.items }, { next_cursor: p.next });
  });

  const anomaly = (id) => anomalies().map(withFeedback).find((a) => a.id === id);
  r.get(`${B}/anomalies/:id`, ({ params }) => {
    const a = anomaly(params.id);
    return a ? env({ ...a, identity: { ...keyOf(identityById(a.identity_id)), display_name: a.display_name, account_id: a.account_id, region: a.region } }) : failNested(404, 'No such anomaly.', 'NOT_FOUND');
  });
  r.get(`${B}/anomalies/:id/evidence`, ({ params }) => {
    const a = anomaly(params.id);
    if (!a) return failNested(404, 'No such anomaly.', 'NOT_FOUND');
    const i = identityById(a.identity_id);
    const ev = eventsOf(i).slice(0, 8);
    return env({ events: [{ ...a.sample_event, anomalous: true }, ...ev.map((e) => ({ event_id: e.event_id, event_time: e.event_time, event_name: e.event_name, event_source: e.event_source, source_ip: e.source_ip, user_agent: e.user_agent, resource_arn: e.resource_arn, anomalous: false }))], baseline: a.what_changed, resource_arns: ev.map((e) => e.resource_arn).filter(Boolean).slice(0, 4) });
  });
  r.post(`${B}/anomalies/:id/feedback`, ({ params, body, user }) => {
    const a = anomaly(params.id);
    if (!a) return failNested(404, 'No such anomaly.', 'NOT_FOUND');
    feedback()[params.id] = { ...(feedback()[params.id] ?? {}), feedback: { decision: body.decision, approved_for_baseline: Boolean(body.approved_for_baseline), reason: body.reason ?? '', by: user.email, at: iso(Date.now()) } };
    save();
    audit(user, 'anomaly.feedback', `Marked an anomaly on ${a.display_name} as ${body.decision}`);
    return env({ id: params.id, ...feedback()[params.id] });
  });
  r.post(`${B}/anomalies/:id/disposition`, ({ params, body, user }) => {
    const a = anomaly(params.id);
    if (!a) return failNested(404, 'No such anomaly.', 'NOT_FOUND');
    const status = body.disposition === 'open' ? 'open' : body.disposition;
    feedback()[params.id] = { ...(feedback()[params.id] ?? {}), status, state: status, disposition_reason: body.reason ?? '', disposed_by: user.email, disposed_at: iso(Date.now()) };
    save();
    audit(user, 'anomaly.disposition', `Set an anomaly on ${a.display_name} to ${status}`);
    return env({ ...a, ...feedback()[params.id] });
  });
}

export { person, credentialsOf };
