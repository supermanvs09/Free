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

/* The identity list's links per identity (summary, baseline, activity,
   genome, timeline). The identity page calls these and shows a tab only for
   the links the list gave. An identity opened without passing through the
   list (a shared link, an alert) gets the same paths built from its key. */
const LINK_KINDS = ['summary', 'baseline', 'activity', 'genome', 'timeline'];
const knownLinks = new Map();
/* The list row's own names per identity: display_name for the page heading,
   event_identity_name (the latest event's identity name, as alerts record it)
   for the anomalies filter. */
const knownNames = new Map();

function rememberLinks(sourceType, identityName, links) {
  knownLinks.set(`${sourceType}:${identityName}`, links);
}

/** The identity's genome links, from the list when it gave them. */
export function genomeLinks(sourceType, identityName) {
  const given = knownLinks.get(`${sourceType}:${identityName}`);
  if (given) return Object.fromEntries(LINK_KINDS.filter((kind) => given[kind]).map((kind) => [kind, given[kind]]));
  return Object.fromEntries(LINK_KINDS.map((kind) => [kind, identityPath(sourceType, identityName, kind === 'summary' ? '' : `/${kind}`)]));
}

/* A link as the list sends it is a raw path; characters that would end the
   path (?, #) or are not valid in a URL are escaped, the rest kept. */
function linkUrl(sourceType, identityName, kind) {
  const link = genomeLinks(sourceType, identityName)[kind] ?? identityPath(sourceType, identityName, kind === 'summary' ? '' : `/${kind}`);
  if (/%[0-9A-Fa-f]{2}/.test(link)) return link;
  return encodeURI(link).replace(/[?#]/g, encodeURIComponent);
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
    for (const row of data.items) items.push({ ...fleetRow(row), activityKnown: data.activity_known === true });
    cursor = meta?.next_cursor || null;
    if (!cursor) return { items, complete: true };
  }
  return { items, complete: false };
}

function listNames(row) {
  return { displayName: row.display_name || null, eventIdentityName: row.event_identity_name || null };
}

/**
 * The genome list's names for one identity: { displayName, eventIdentityName }.
 * From the list already read when the page was opened from it; otherwise
 * (a shared link, an alert) the list searched for this key, exact row only.
 */
export async function fetchGenomeListNames(sourceType, identityName, signal) {
  const key = `${sourceType}:${identityName}`;
  if (knownNames.has(key)) return knownNames.get(key);
  const { data } = unwrapGenome(
    await client.get(`${BASE}/identities`, { params: params({ source_type: sourceType, search: identityName, limit: 100 }), signal }),
  );
  const row = list(data?.items).find(
    (r) => r.identity_name === identityName || (r.source_type === sourceType && r.workload_key === identityName),
  );
  const names = row ? listNames(row) : { displayName: null, eventIdentityName: null };
  knownNames.set(key, names);
  return names;
}

/**
 * The genome identity an anomaly belongs to. The anomaly names its identity
 * as the event recorded it ("ec2:eks-ap-south-2-..."), which is not always the
 * genome page's key, so the list is searched by that name and the matching
 * row's own key and links open the page. Exact name matches win; a search
 * with one result is taken as the match. null when nothing matches.
 */
export async function resolveGenomeForAnomaly(identityName, signal) {
  const name = String(identityName ?? '').trim();
  if (!name) return null;
  await loadWorkloadTypes();
  const { data } = unwrapGenome(await client.get(`${BASE}/identities`, { params: params({ search: name, limit: 100 }), signal }));
  const rows = list(data?.items);
  const row =
    rows.find((r) => [r.identity_name, r.event_identity_name, r.workload_key, r.display_name].includes(name)) ??
    (rows.length === 1 ? rows[0] : null);
  if (!row) return null;
  const shaped = fleetRow(row);
  return shaped.openable ? { sourceType: shaped.sourceType, identityName: shaped.identityName } : null;
}

function fleetRow(row) {
  const baseline = row.baseline ?? {};
  const risk = row.risk ?? {};
  const parent = row.parent ?? null;
  /* The list is one row per baseline, keyed by the baseline key, and its
     links (summary, baseline, activity, genome, timeline) address every
     genome page by that key: the row opens on its own key and the page calls
     those links. An older list without links named a discovery genome_key. */
  const genomeKey = row.discovery_identities?.[0]?.genome_key ?? null;
  const open = row.links?.summary
    ? { sourceType: row.source_type, identityName: row.identity_name }
    : genomeKey
      ? { sourceType: genomeKey.source_type, identityName: genomeKey.identity_name }
      : row.links
        ? null
        : { sourceType: row.source_type, identityName: row.identity_name };
  if (open && row.links) rememberLinks(open.sourceType, open.identityName, row.links);
  if (open) knownNames.set(`${open.sourceType}:${open.identityName}`, listNames(row));
  return {
    id: row.id || `${row.source_type}:${row.identity_name}`,
    sourceType: open?.sourceType ?? row.source_type,
    identityName: open?.identityName ?? row.identity_name,
    openable: Boolean(open),
    mapped: row.mapping ? row.mapping.status === 'mapped' : true,
    name: row.display_name || row.identity_name,
    eventIdentityName: row.event_identity_name ?? null,
    nhiType: row.nhi_identity_type ?? null,
    workloadKey: row.workload_key ?? null,
    /* ECS tasks are expanded into their task role and execution role, each
       its own monitored principal sharing the task's inventory record. */
    roleKind: row.role_kind ?? null,
    principalArn: row.principal_arn ?? row.role_arn ?? null,
    inventoryId: row.inventory_id ?? parent?.inventory_id ?? row.discovery_identities?.[0]?.inventory_id ?? null,
    resourceArn: row.resource_arn ?? parent?.arn ?? null,
    status: row.status ?? parent?.status ?? null,
    links: row.links ?? null,
    accountId: row.account_id ?? null,
    region: row.region ?? null,
    baseline: {
      status: baseline.status ? String(baseline.status).toLowerCase() : null,
      builtDays: baseline.built_days ?? null,
      requiredDays: baseline.required_days ?? null,
      activeSince: baseline.active_since ?? null,
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
    await client.get(linkUrl(sourceType, identityName, 'summary'), { params: params(windowRange(window)), signal }),
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
  { window, from, to, bucket, recentLimit, recentCursor } = {},
  signal,
) {
  /* from/to (ISO) override the window: the identity record's Activity tab
     asks for its own ranges (1h ... 90d, chosen dates). */
  const range = from && to ? { from, to } : windowRange(window);
  const { data, meta } = unwrapGenome(
    await client.get(linkUrl(sourceType, identityName, 'activity'), {
      params: params({ ...range, bucket, recent_limit: recentLimit, recent_cursor: recentCursor }),
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
    await client.get(linkUrl(sourceType, identityName, 'genome'), {
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
    await client.get(linkUrl(sourceType, identityName, 'timeline'), {
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
    return dataOf(await client.get(linkUrl(sourceType, identityName, 'baseline'), { signal }));
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

/**
 * One page of anomalies, newest first. The service pages by number and counts
 * the whole filtered result: { items, page, pageCount, total, severityCounts }.
 * `identityName` is an exact match on the alert's identity name (the list's
 * event_identity_name).
 */
export async function fetchAnomalies({ state, dimension, sourceType, identityName, severity, search, from, to, eventId, limit = 25, page = 1 } = {}, signal) {
  const { data } = unwrapGenome(
    await client.get(`${BASE}/anomalies`, {
      params: params({ state, dimension, source_type: sourceType, identity_name: identityName, severity, search, from, to, event_id: eventId, limit, page }),
      signal,
    }),
  );
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    items: list(data?.items),
    page: n(data?.page) || page,
    pageCount: n(data?.page_count),
    total: n(data?.total_count),
    severityCounts: data?.severity_counts ?? null,
  };
}

/* Pages of 100 until the service's page count, up to `maxPages`. */
async function fetchAnomalyPages(query, maxPages, signal) {
  const items = [];
  let first = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchAnomalies({ ...query, limit: 100, page }, signal);
    first ??= result;
    items.push(...result.items);
    if (page >= result.pageCount || result.items.length === 0) {
      return { items, total: first.total, severityCounts: first.severityCounts, complete: true };
    }
  }
  return { items, total: first?.total ?? items.length, severityCounts: first?.severityCounts ?? null, complete: false };
}

/**
 * Every anomaly in a state (open, or '' for all), newest first, up to 1,000,
 * so the Anomalies tab can group and filter without a request per filter.
 * `total` is the real count whatever was loaded; `complete` is false beyond.
 */
export function fetchAllAnomalies({ state, sourceType, search, from } = {}, signal) {
  return fetchAnomalyPages({ state, sourceType, search, from }, 10, signal);
}

/** How many anomalies the list API counts for a filter, without reading them. */
export async function countAnomalies(query = {}, signal) {
  return (await fetchAnomalies({ ...query, limit: 1, page: 1 }, signal)).total;
}

/**
 * One identity's anomalies, newest first, up to 2,000: the anomalies list
 * filtered by the identity's event_identity_name from the genome list.
 */
export function fetchIdentityAnomalies({ eventIdentityName, state } = {}, signal) {
  if (!eventIdentityName) return Promise.resolve({ items: [], total: 0, severityCounts: null, complete: true });
  return fetchAnomalyPages({ state, identityName: eventIdentityName }, 20, signal);
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
