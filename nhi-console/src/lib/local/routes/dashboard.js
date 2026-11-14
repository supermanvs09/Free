import { ok, DAY, NOW, MIN, dateOnly, iso, rng } from '../util';
import { identities, credentials, filteredEvents } from '../world';
import { scans, changesOf, visibleChanges } from '../changes';

function counts(rows, key) {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function overview() {
  const ids = identities();
  const creds = credentials();
  const stale = ids.filter((i) => i.idle_days >= 90);
  const r = rng(11);
  const growth = (total, days = 30) => {
    const out = [];
    let v = Math.round(total * 0.82);
    for (let d = days - 1; d >= 0; d -= 1) {
      v = Math.min(total, v + (d === 0 ? total - v : r.int(0, 2)));
      out.push({ date: dateOnly(NOW - d * DAY), count: d === 0 ? total : Math.min(total, v) });
    }
    return out;
  };
  const volume = new Map();
  for (const i of ids) for (const e of filteredEvents(i, { time_range: '30d' })) volume.set(e.event_time.slice(0, 10), (volume.get(e.event_time.slice(0, 10)) ?? 0) + 1);
  const utilBuckets = [
    ['used_last_7d', (c) => c.idle_days < 7],
    ['used_7_30d', (c) => c.idle_days >= 7 && c.idle_days < 30],
    ['used_30_90d', (c) => c.idle_days >= 30 && c.idle_days < 90],
    ['unused_90d_plus', (c) => c.idle_days >= 90],
  ];
  const latest = scans()[0];
  const changes = visibleChanges(changesOf(latest.scan_id, 0));
  const byType = { CREATED: 0, MODIFIED: 0, DELETED: 0 };
  for (const c of changes) byType[c.change_type] = (byType[c.change_type] ?? 0) + 1;
  const highlights = counts(changes.map((c) => ({ k: `${c.change_type}|${c.entity_type}` })), 'k').map(([k, n]) => {
    const [ct, et] = k.split('|');
    const noun = { identity: n === 1 ? 'identity' : 'identities', credential: n === 1 ? 'credential' : 'credentials', permission: n === 1 ? 'permission' : 'permissions', binding: n === 1 ? 'binding' : 'bindings', trust_edge: n === 1 ? 'trust relationship' : 'trust relationships' }[et] ?? et;
    return { change_type: ct, entity_type: et, count: n, label: `${n} ${noun} ${ct.toLowerCase()}` };
  });
  return {
    kpis: {
      total_identities: ids.length,
      total_credentials: creds.length,
      orphaned_credentials: creds.filter((c) => c.is_orphaned).length,
      stale_identities: stale.length,
      stale_credentials: creds.filter((c) => c.idle_days >= 90).length,
      publicly_accessible: ids.filter((i) => i.is_publicly_accessible).length,
      shadow_identities: ids.filter((i) => i.is_shadow).length,
      accounts_scanned: new Set(ids.map((i) => i.account_id)).size,
      permission_utilization_pct: Math.round(ids.reduce((s, i) => s + i.permission_utilization_pct, 0) / Math.max(1, ids.length)),
      active_credentials: creds.filter((c) => c.status === 'active').length,
      trust_edges: creds.filter((c) => c.credential_type === 'iam_role' || c.has_external_trust).length + 6,
      cross_account_trust_edges: creds.filter((c) => c.has_external_trust).length,
    },
    charts: {
      identities_by_type: counts(ids, 'identity_type').map(([type, count]) => ({ type, count })),
      identities_by_functional_class: counts(ids, 'functional_class').map(([cls, count]) => ({ class: cls, count })),
      identities_by_account: counts(ids, 'account_id').map(([account_id, count]) => ({ account_id, count })),
      identities_by_region: counts(ids, 'region').map(([region, count]) => ({ region, count })),
      identities_by_environment: counts(ids, 'environment').map(([environment, count]) => ({ environment, count })),
      identities_by_status: counts(ids, 'status').map(([status, count]) => ({ status, count })),
      identities_by_provider: counts(ids, 'provider').map(([provider, count]) => ({ provider, count, credentials: creds.filter((c) => c.provider === provider).length, critical: ids.filter((i) => i.provider === provider && i.severity === 'CRITICAL').length })),
      identity_growth: growth(ids.length),
      credential_growth: growth(creds.length),
      stale_vs_active: { active: ids.length - stale.length, stale: stale.length },
      credential_types: counts(creds, 'credential_type').map(([type, count]) => ({ type, count })),
      top_owners: counts(ids.filter((i) => i.owner), 'owner').slice(0, 8).map(([owner, count]) => ({ owner, count })),
      credentials_expiring_soon: creds
        .filter((c) => c.days_until_expiry !== null && c.days_until_expiry <= 45)
        .sort((a, b) => a.days_until_expiry - b.days_until_expiry)
        .map((c) => ({ credential_name: c.name, expires_at: c.expires_at, days_remaining: c.days_until_expiry, credential_id: c.id, provider: c.provider })),
      trust_edges_by_type: [
        { edge_type: 'service', count: creds.filter((c) => c.credential_type === 'iam_role' && !c.has_external_trust).length },
        { edge_type: 'cross_account', count: creds.filter((c) => c.has_external_trust && String(c.external_principal).startsWith('arn:')).length },
        { edge_type: 'oidc', count: creds.filter((c) => c.has_external_trust && !String(c.external_principal).startsWith('arn:')).length },
      ],
      event_volume: [...volume.entries()].sort().map(([date, count]) => ({ date, count })),
      credential_utilization: utilBuckets.map(([bucket, f]) => ({ bucket, count: creds.filter(f).length })),
    },
    activity_data_available: true,
    recent_changes: {
      last_scan_id: latest.scan_id,
      last_scan_at: latest.completed_at,
      previous_scan_id: latest.previous_scan_id,
      previous_scan_at: latest.previous_scan_at,
      total_changes: changes.length,
      by_change_type: byType,
      highlights,
    },
  };
}

export default function register(r) {
  r.get('/api/v1/dashboard/overview', () => ok(overview()));
  r.get('/api/v1/dashboard/trends', ({ query }) => {
    const limit = Math.min(60, Number(query.limit) || 30);
    const ids = identities().length;
    const creds = credentials().length;
    const accounts = new Set(identities().map((i) => i.account_id)).size;
    const rr = rng(5);
    const trends = [];
    for (let i = limit - 1; i >= 0; i -= 1) {
      const shrink = Math.floor(i / 4);
      trends.push({ scan_date: iso(NOW - 41 * MIN - i * 6 * 3600 * 1000), total_identities: Math.max(1, ids - shrink + (i % 3 === 0 ? rr.int(-1, 1) : 0)), total_credentials: Math.max(1, creds - Math.floor(shrink * 1.4)), accounts });
    }
    return ok({ trends });
  });
}
