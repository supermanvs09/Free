import client from './client';
import { ApiError, params, unwrapGenome, unwrapMain } from './http';
import { canonicalGenomeName, setGenomeFamilies } from '../identityLinks';

/*
 * NHI Genome (behaviour monitoring), served by the NHI backend under
 * `/api/v1/genome/*` from the pipeline's ClickHouse log_events (plus the
 * baselines / baseline_versions / alerts tables for the timeline):
 *
 *   GET /dashboard/summary                                   ?from &to
 *   GET /identities/{source_type}/{identity_name}            ?from &to
 *   GET .../genome                                           ?from &to &limit
 *   GET .../activity                                         ?from &to &bucket &recent_limit &recent_cursor
 *   GET .../timeline                                         ?limit &cursor
 *   GET .../baseline  .../drift  .../peers                   baseline health, drift evidence, peer comparison
 *   GET /anomalies  /anomalies/{id}  /anomalies/{id}/evidence
 *   POST /anomalies/{id}/feedback                            { decision, approved_for_baseline, reason }
 *   GET /workload-types                                      the workload families shown (NHI_GENOME_WORKLOAD_TYPES)
 *
 * The monitored fleet is the genome's own list (GET /identities, see
 * fetchGenomeFleet), addressed by the (source_type, identity_name) key in
 * lib/identityLinks.js.
 *
 * Envelope { data, meta: { request_id, generated_at, next_cursor } }. Unknown
 * params are rejected, so only set values are sent. Missing monitoring data is
 * a 200 with nulls / empty lists, never invented values - the screens show
 * those as "not measured yet" rather than as zero.
 */
const BASE = '/api/v1/genome';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Detection windows the console offers, as durations. */
export const WINDOW_MS = { '24h': DAY, '7d': 7 * DAY, '14d': 14 * DAY, '30d': 30 * DAY };

/**
 * `from`/`to` for a window ending now. `to` is rounded up to the next minute
 * so that re-renders inside the same minute ask the same question.
 */
export function windowRange(window) {
  const span = WINDOW_MS[window];
  if (!span) return {};
  const to = new Date(Math.ceil(Date.now() / 60000) * 60000);
  const from = new Date(to.getTime() - span);
  return { from: from.toISOString(), to: to.toISOString() };
}

function identityPath(sourceType, identityName, suffix = '') {
  return `${BASE}/identities/${encodeURIComponent(sourceType)}/${encodeURIComponent(identityName)}${suffix}`;
}

function unexpected() {
  return new ApiError({ message: 'The behaviour service answered with an unexpected response.' });
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Fleet dashboard: the cards (watched, established, learning, open anomalies),
 * open departures by dimension, anomalies raised per day, the most anomalous
 * identities and the recently baselined feed. With no window the service
 * answers cards for the last 24 hours and charts for the last 14 days; with a
 * window it uses that for both.
 */
export async function fetchGenomeSummary({ window, sourceType, accountId, region } = {}, signal) {
  const range = window && window !== '24h' ? windowRange(window) : {};
  const { data, meta } = unwrapGenome(
    await client.get(`${BASE}/dashboard/summary`, {
      params: params({ ...range, source_type: sourceType, account_id: accountId, region }),
      signal,
    }),
  );
  if (!data || typeof data !== 'object' || !data.cards) throw unexpected();
  return {
    cards: data.cards,
    departures: list(data.departures_by_dimension),
    anomaliesByDay: list(data.anomalies_by_day),
    mostAnomalous: list(data.most_anomalous_identities),
    recentlyBaselined: list(data.recently_baselined),
    generatedAt: meta.generated_at ?? null,
  };
}

const GENOME_LIST_PAGE = 100; // the genome list's limit cap
const GENOME_LIST_MAX_PAGES = 20;

/**
 * The monitored fleet from the genome's own list, GET /genome/identities:
 * every monitored identity in scope with its baseline (status, days learned of
 * days required), latest risk, open anomaly count and last call. Read in pages
 * of 100 by cursor, up to 2,000; `complete` is false beyond that. One request
 * per page replaces one summary request per table row.
 */
export async function fetchGenomeFleet({ sort = 'risk_desc' } = {}, signal) {
  await loadWorkloadTypes();
  const items = [];
  let cursor;
  for (let page = 0; page < GENOME_LIST_MAX_PAGES; page += 1) {
    const { data, meta } = unwrapGenome(
      await client.get(`${BASE}/identities`, { params: params({ sort, limit: GENOME_LIST_PAGE, cursor }), signal }),
    );
    if (!data || !Array.isArray(data.items)) throw unexpected();
    /* activity_known: the events store answered, so a null last_seen means
       "never called". Absent (an older service) or false: unknown. */
    for (const row of data.items) items.push({ ...fleetRow(row), activityKnown: data.activity_known === true });
    cursor = meta?.next_cursor || null;
    if (!cursor) return { items, complete: true };
  }
  return { items, complete: false };
}

function fleetRow(row) {
  const baseline = row.baseline ?? {};
  const risk = row.risk ?? {};
  return {
    id: row.id || `${row.source_type}:${row.identity_name}`,
    sourceType: row.source_type,
    identityName: row.identity_name,
    name: row.display_name || row.identity_name,
    nhiType: row.nhi_identity_type ?? null,
    workloadKey: row.workload_key ?? null,
    /* ECS tasks are expanded into their task role and execution role, each
       its own monitored principal sharing the task's inventory record. */
    roleKind: row.role_kind ?? null,
    principalArn: row.principal_arn ?? null,
    inventoryId: row.inventory_id ?? null,
    resourceArn: row.resource_arn ?? null,
    status: row.status ?? null,
    accountId: row.account_id ?? null,
    region: row.region ?? null,
    baseline: {
      status: baseline.status ? String(baseline.status).toLowerCase() : null,
      builtDays: baseline.built_days ?? null,
      requiredDays: baseline.required_days ?? null,
    },
    risk: { score: risk.score ?? null, severity: risk.severity ?? null },
    lastSeen: row.last_seen ?? null,
    openAnomalies: row.open_anomaly_count ?? null,
  };
}

/**
 * The identity page header: the identity as discovery sees it, its baseline
 * (absent until the pipeline has a baseline row) and the headline metrics -
 * calls in the window, open anomalies and the last call (absent until the
 * identity has been seen).
 */
export async function fetchGenomeIdentity(sourceType, identityName, { window } = {}, signal) {
  const { data } = unwrapGenome(
    await client.get(identityPath(sourceType, identityName), { params: params(windowRange(window)), signal }),
  );
  if (!data || typeof data !== 'object' || !data.identity) throw unexpected();
  const metrics = data.headline_metrics ?? {};
  return {
    identity: data.identity,
    baseline: data.baseline_summary ?? null,
    callsInWindow: metrics.calls_in_window ?? null,
    /* calls_in_window is present only when the events store answered. */
    activityKnown: metrics.calls_in_window !== undefined && metrics.calls_in_window !== null,
    openAnomalies: metrics.open_anomalies ?? null,
    lastSeen: metrics.last_seen ?? null,
  };
}

/** Call volume per bucket plus one page of recent calls. */
export async function fetchGenomeActivity(
  sourceType,
  identityName,
  { window, bucket, recentLimit, recentCursor } = {},
  signal,
) {
  const { data, meta } = unwrapGenome(
    await client.get(identityPath(sourceType, identityName, '/activity'), {
      params: params({ ...windowRange(window), bucket, recent_limit: recentLimit, recent_cursor: recentCursor }),
      signal,
    }),
  );
  if (!data || typeof data !== 'object') throw unexpected();
  return {
    volume: list(data.volume),
    recentCalls: list(data.recent_calls),
    totalCalls: data.total_calls ?? null,
    nextCursor: meta.next_cursor || null,
    generatedAt: meta.generated_at ?? null,
  };
}

/** The behavioural profile: fingerprint, typical actions/resources, schedule. */
export async function fetchGenomeProfile(sourceType, identityName, { window, limit } = {}, signal) {
  const { data } = unwrapGenome(
    await client.get(identityPath(sourceType, identityName, '/genome'), {
      params: params({ ...windowRange(window), limit }),
      signal,
    }),
  );
  if (!data || typeof data !== 'object') throw unexpected();
  return {
    fingerprint: list(data.fingerprint),
    typicalActions: list(data.typical_actions),
    typicalResources: list(data.typical_resources),
    activitySchedule: list(data.activity_schedule),
  };
}

/** One page of the identity's history, newest first. */
export async function fetchGenomeTimeline(sourceType, identityName, { limit, cursor } = {}, signal) {
  const { data, meta } = unwrapGenome(
    await client.get(identityPath(sourceType, identityName, '/timeline'), {
      params: params({ limit, cursor }),
      signal,
    }),
  );
  if (!data || !Array.isArray(data.items)) throw unexpected();
  return { items: data.items.map(timelineItem), nextCursor: meta.next_cursor || null };
}

/* The service groups anomalies into one item per dimension
   (type anomaly_dimension: dimension, count, open_count, latest reason).
   The screens read one anomaly shape, so it is mapped onto it here:
   openCount is how many of the item's alerts are still open. */
function timelineItem(item) {
  if (item?.type !== 'anomaly_dimension') {
    return item?.type === 'anomaly' && String(item.status).toLowerCase() === 'open'
      ? { ...item, openCount: Number(/^(\d+)/.exec(item.title ?? '')?.[1]) || 1 }
      : item;
  }
  const reason = String(item.description ?? '').replace(/^Latest reason:\s*/, '');
  return {
    ...item,
    type: 'anomaly',
    description: `Dimension: ${item.dimension ?? ''}; ${reason}`,
    openCount: Number(item.open_count) || 0,
  };
}

/**
 * The discovery (inventory) record of a genome identity, matched by ARN, or
 * null when it cannot be resolved. Genome keys Lambda and Step Functions by
 * their canonical ARN, so a discovery ARN is canonicalised before comparing.
 */
export async function resolveDiscoveryIdentity(identityName, signal) {
  const arn = String(identityName ?? '').trim();
  if (!arn.startsWith('arn:')) return null;
  const data = unwrapMain(
    await client.get('/api/v1/identities', { params: { search: arn, page_size: 25 }, signal }),
  );
  const rows = list(data?.data);
  return (
    rows.find((row) => row.arn === arn) ??
    rows.find((row) => canonicalGenomeName(row.identity_type, row.arn) === arn) ??
    null
  );
}

/* ── Workload types, baseline, drift, peers, anomalies ───────────────────── */

let familiesLoad = null;

/**
 * The workload families NHI Genome shows. Loaded once and handed to
 * identityLinks so a Genome link is offered only for those kinds. A failure
 * leaves every family on: the pages then show what the API returns.
 */
export function loadWorkloadTypes() {
  familiesLoad ??= (async () => {
    try {
      const { data } = unwrapGenome(await client.get(`${BASE}/workload-types`));
      setGenomeFamilies(data?.families, Boolean(data?.all));
      return { families: list(data?.families), all: Boolean(data?.all) };
    } catch {
      familiesLoad = null;
      return { families: [], all: true };
    }
  })();
  return familiesLoad;
}

const dataOf = (response) => unwrapGenome(response).data ?? {};

/* 404 here means no ACTIVE baseline yet (the service returns only active
   ones): the identity is still learning, which the panel shows as such. A
   page for an identity that is not monitored at all is caught by the summary
   and timeline requests, which 404 too. */
export async function fetchGenomeBaseline(sourceType, identityName, signal) {
  try {
    return dataOf(await client.get(identityPath(sourceType, identityName, '/baseline'), { signal }));
  } catch (error) {
    if (error?.status === 404) return { status: null, versions: [], dimensions: [] };
    throw error;
  }
}

export async function fetchGenomeDrift(sourceType, identityName, signal) {
  return dataOf(await client.get(identityPath(sourceType, identityName, '/drift'), { signal }));
}

export async function fetchGenomePeers(sourceType, identityName, signal) {
  const data = dataOf(await client.get(identityPath(sourceType, identityName, '/peers'), { signal }));
  return list(data.peers);
}

/** One page of anomalies, newest first: { items, nextCursor }. */
export async function fetchAnomalies({ state, dimension, sourceType, search, limit = 25, cursor } = {}, signal) {
  const { data, meta } = unwrapGenome(
    await client.get(`${BASE}/anomalies`, {
      params: params({ state, dimension, source_type: sourceType, search, limit, cursor }),
      signal,
    }),
  );
  return { items: list(data?.items), nextCursor: meta?.next_cursor || null };
}

/**
 * Every anomaly in a state (open, or '' for all), newest first: pages of 100
 * by cursor up to 1,000, so the Anomalies tab can count and filter by severity
 * and departure type without a request per filter. `complete` is false beyond
 * that.
 */
export async function fetchAllAnomalies({ state } = {}, signal) {
  const items = [];
  let cursor;
  for (let page = 0; page < 10; page += 1) {
    const result = await fetchAnomalies({ state, limit: 100, cursor }, signal);
    items.push(...result.items);
    cursor = result.nextCursor;
    if (!cursor) return { items, complete: true };
  }
  return { items, complete: false };
}

export async function fetchAnomaly(id, signal) {
  return dataOf(await client.get(`${BASE}/anomalies/${encodeURIComponent(id)}`, { signal }));
}

export async function fetchAnomalyEvidence(id, signal) {
  return dataOf(await client.get(`${BASE}/anomalies/${encodeURIComponent(id)}/evidence`, { signal }));
}

/** A reviewer's verdict: decision is legitimate | malicious | unknown. */
export async function saveAnomalyFeedback(id, { decision, approvedForBaseline = false, reason = '' }) {
  return dataOf(
    await client.post(`${BASE}/anomalies/${encodeURIComponent(id)}/feedback`, {
      decision,
      approved_for_baseline: Boolean(approvedForBaseline),
      ...(reason ? { reason } : {}),
    }),
  );
}

/** Close a departure (resolved | dismissed) or open it again (open). */
export async function setAnomalyDisposition(id, { disposition, reason = '' }) {
  return dataOf(
    await client.post(`${BASE}/anomalies/${encodeURIComponent(id)}/disposition`, {
      disposition,
      ...(reason ? { reason } : {}),
    }),
  );
}
