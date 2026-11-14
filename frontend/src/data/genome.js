import { ANCHOR, DAY, HOUR, hashString } from './world';
import { eventsFor } from './events';

/*
 * NHI Genome: a behavioural model per identity, learned from its own
 * activity, in the shape UEBA tools use:
 *   - daily signals (calls, distinct resources, distinct networks) against an
 *     expected range learned from the training window;
 *   - an hour x weekday pattern of when it normally acts;
 *   - the sets it normally uses (actions, resources, networks, countries),
 *     so anything seen for the first time stands out;
 *   - a peer group (identities of the same type) to compare against.
 * Team feedback (confirm, or "this is expected") is kept per identity and
 * retrains the model.
 */
export const LEARNING_DAYS = 14;
const TRAIN_DAYS = 23; // days 0..22 train the band; the last 7 are scored against it
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const TRAIT_LABEL = {
  schedule: 'Time of day',
  volume: 'Volume',
  actions: 'Actions',
  resources: 'Resources',
  networks: 'Networks and places',
  ownership: 'Ownership',
};

export function traitOfDetection(d) {
  const t = d.title.toLowerCase();
  if (/country|network|travel|asn|two clusters/.test(t) || /sign(ed)? in from/.test(t)) return 'networks';
  if (/window|woke|dormant/.test(t)) return 'schedule';
  if (/clone|read|30x|spike|enumerat|denied/.test(t)) return 'volume';
  if (/owner left/.test(t)) return 'ownership';
  return 'actions';
}

function rng(seed) {
  let x = hashString(seed) || 1;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const SEV_SCORE = { critical: 92, high: 78, medium: 61, low: 44 };
const OPEN = (d) => d.status === 'new' || d.status === 'investigating';

/* The expected range follows the week: weekdays and weekends are learned separately. */
const isWeekend = (k) => { const d = new Date(ANCHOR - (29 - k) * DAY).getUTCDay(); return d === 0 || d === 6; };
function band(values) {
  const stats = (pick) => {
    let train = values.slice(0, TRAIN_DAYS).filter((v, k) => v > 0 && pick(k));
    if (!train.length) return { mean: 0, sd: 0 };
    /* Robust: a past incident inside the training window must not become normal. */
    const sorted = [...train].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    train = train.filter((v) => v <= med * 2.5 + 2);
    const mean = train.reduce((s, v) => s + v, 0) / train.length;
    const sd = Math.sqrt(train.reduce((s, v) => s + (v - mean) ** 2, 0) / train.length) || mean * 0.1 || 1;
    return { mean, sd };
  };
  const wk = stats((k) => !isWeekend(k));
  const we = stats((k) => isWeekend(k));
  const all = stats(() => true);
  const at = (k) => { const st = isWeekend(k) ? (we.mean ? we : all) : (wk.mean ? wk : all); return { low: Math.max(0, st.mean - 1.6 * st.sd), high: st.mean + 1.6 * st.sd, mean: st.mean }; };
  return { mean: all.mean, low: Math.max(0, all.mean - 1.6 * all.sd), high: all.mean + 1.6 * all.sd, at };
}

/** Things named in a detection that the identity had never used before. */
function firstSeen(d) {
  const out = [];
  for (const m of d.observed.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b(?:\s*\(([^)]+)\))?/g)) out.push({ kind: 'Network', value: m[2] ? `${m[1]} (${m[2]})` : m[1] });
  for (const m of d.observed.matchAll(/\b(AS\d+)\s*(\([^)]+\))?(?:,\s*([A-Z][a-z]+))?/g)) out.push({ kind: 'Network', value: `${m[1]} ${m[2] || ''}${m[3] ? `, ${m[3]}` : ''}`.trim() });
  for (const m of d.observed.matchAll(/\b(\d+\.\d+\.0\.0\/\d+)/g)) out.push({ kind: 'Network', value: m[1] });
  if (/iam:CreateAccessKey|roleAssignments\/read|Push to main/.test(d.observed)) out.push({ kind: 'Action', value: d.observed.split(' ')[0] });
  return out;
}

export function genomeFor(identity, view) {
  if (!identity) return null;
  const r = rng(`genome:${identity.id}`);
  const ageDays = (ANCHOR - Date.parse(identity.createdAt)) / DAY;
  const observedDays = Math.max(0, Math.min(90, Math.floor(ageDays)));
  const lastUsedDays = identity.lastUsedAt ? (ANCHOR - Date.parse(identity.lastUsedAt)) / DAY : Infinity;
  const feedback = view?.genomeFeedback?.get(identity.id) || [];
  const detections = (view?.detections || []).filter((d) => d.identityId === identity.id);
  const open = detections.filter(OPEN);

  let status = 'established';
  if (!identity.lastUsedAt || lastUsedDays > 90 || identity.status === 'disabled') status = 'dormant';
  else if (observedDays < LEARNING_DAYS) status = 'learning';
  if (open.length) status = 'drifting';

  /* Signals per day for 30 days. */
  const dayIndex = (iso) => 29 - Math.floor((ANCHOR - Date.parse(iso)) / DAY);
  const calls = [...identity.series];
  const baseRes = Math.max(1, identity.resources.length);
  const resources = calls.map((v) => (v ? Math.max(1, Math.round(baseRes * (0.6 + r() * 0.5))) : 0));
  const events = eventsFor(identity, 80);
  const netCount = Math.max(1, new Set(events.map((e) => e.source)).size - 1);
  const networks = calls.map((v) => (v ? Math.max(1, Math.round(netCount * (0.7 + r() * 0.5))) : 0));
  const deviations = detections.map((d) => ({ detection: d, trait: traitOfDetection(d), day: dayIndex(d.detectedAt), firstSeen: firstSeen(d) }));
  for (const dv of deviations) {
    if (dv.day < 0 || dv.day > 29) continue;
    const ratio = dv.detection.metric.baseline ? dv.detection.metric.observed / dv.detection.metric.baseline : 4;
    if (dv.trait === 'volume') calls[dv.day] = Math.max(calls[dv.day], Math.round((band(calls).high || 40) * Math.min(6, Math.max(2.2, Math.log10(ratio + 1) * 2.4))));
    if (dv.trait === 'networks') networks[dv.day] = Math.max(networks[dv.day], netCount + 2);
    if (dv.trait === 'actions' || dv.trait === 'ownership') resources[dv.day] = Math.max(resources[dv.day], baseRes + 3);
    if (dv.trait === 'schedule') calls[dv.day] = Math.max(calls[dv.day], Math.round((band(calls).mean || 10) * 0.6));
  }
  const signals = {
    calls: { label: 'Calls per day', values: calls, band: band(calls) },
    resources: { label: 'Distinct resources per day', values: resources, band: band(resources) },
    networks: { label: 'Distinct source networks per day', values: networks, band: band(networks) },
  };

  /* When it acts: hour x weekday. Pipelines and people keep office hours,
     services run around the clock, batch jobs fire at fixed times. */
  const ci = /actions|pipelines|pat|apppassword|repotoken|deploykey/.test(identity.type) || /deploy|release|terraform|publish/.test(identity.name);
  const batch = /batch|nightly|backup|sync|loader|etl|cron|extract/.test(identity.name);
  const pattern = WEEKDAYS.map((_, wd) =>
    Array.from({ length: 24 }, (_, h) => {
      const weekend = wd >= 5;
      let p;
      if (batch) p = [1, 2, 3, 13].includes(h) ? 0.75 + r() * 0.25 : 0.02 * r();
      else if (ci) p = h >= 8 && h <= 18 && !weekend ? 0.45 + r() * 0.55 : r() * 0.06;
      else p = (weekend ? 0.45 : 0.6) + r() * 0.4;
      return status === 'dormant' ? 0 : Math.round(p * 100) / 100;
    }),
  );
  const offHours = deviations.filter((dv) => OPEN(dv.detection)).map((dv) => {
    const t = new Date(dv.detection.detectedAt);
    return { wd: (t.getUTCDay() + 6) % 7, h: t.getUTCHours(), detection: dv.detection };
  });

  /* What it normally uses. */
  const share = (key, n) => {
    const m = new Map();
    for (const e of events) m.set(e[key], (m.get(e[key]) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, c]) => ({ name, share: c / Math.max(1, events.length) }));
  };

  /* Peers: identities of the same type. */
  const peers = (view?.identities || []).filter((x) => x.type === identity.type && x.id !== identity.id && x.lastUsedAt);
  const avg = (s) => s.reduce((a, v) => a + v, 0) / Math.max(1, s.length);
  const peerMeans = peers.map((p) => avg(p.series)).sort((a, b) => a - b);
  const mine = avg(identity.series);
  const peerMedian = peerMeans.length ? peerMeans[Math.floor(peerMeans.length / 2)] : 0;
  const percentile = peerMeans.length ? Math.round((peerMeans.filter((v) => v <= mine).length / peerMeans.length) * 100) : null;
  const peerResources = new Set(peers.flatMap((p) => p.resources));
  const uniqueResources = identity.resources.filter((x) => !peerResources.has(x));

  const learned = feedback.filter((f) => f.verdict === 'expected');
  const version = 1 + Math.min(9, Math.floor(observedDays / 12)) + learned.length;
  const trainedAt = learned.at(-1)?.at || new Date(ANCHOR - (1 + Math.floor(r() * 20)) * HOUR).toISOString();
  const confidence = status === 'learning' ? Math.round((observedDays / LEARNING_DAYS) * 60) : status === 'dormant' ? 0 : Math.min(99, 72 + Math.round(Math.min(observedDays, 90) / 5) + learned.length * 2);
  const score = open.length ? Math.max(...open.map((d) => SEV_SCORE[d.severity])) : status === 'dormant' ? 0 : Math.round(8 + r() * 22);

  /* Daily deviation score: how far the day sat outside its expected range. */
  const daily = calls.map((_, k) => {
    let s = 0;
    for (const sig of Object.values(signals)) {
      const { high, mean } = sig.band.at(k);
      const v = sig.values[k];
      if (v > high && high > 0) s = Math.max(s, Math.min(100, 40 + ((v - high) / Math.max(1, high - mean)) * 18));
    }
    return Math.round(s);
  });

  const history = Array.from({ length: Math.min(version, 6) }, (_, k) => {
    const v = version - k;
    const fb = learned[learned.length - 1 - k];
    return { version: v, at: fb ? fb.at : new Date(Date.parse(trainedAt) - k * 12 * DAY).toISOString(), note: fb ? `Learned from feedback: ${fb.note}` : v === 1 ? `First baseline after ${LEARNING_DAYS} days of activity` : 'Scheduled retrain on 90 days of activity', by: fb?.by || null };
  });

  return {
    identityId: identity.id,
    status,
    observedDays,
    confidence: Math.max(0, confidence),
    version,
    trainedAt,
    score,
    daily,
    signals,
    pattern,
    offHours,
    actions: share('action', 6),
    networks: share('source', 4),
    resources: identity.resources,
    countries: identity.countries,
    deviations,
    feedback,
    learned: learned.length,
    peers: { count: peers.length, median: Math.round(peerMedian), mine: Math.round(mine), percentile, uniqueResources },
    history,
  };
}

/** One line on what changed, for lists. */
export function changeSummary(d) {
  const { label, baseline, observed } = d.metric;
  const ratio = baseline ? observed / baseline : null;
  if (ratio && ratio >= 2 && baseline >= 3) return `${label}: ${baseline} → ${observed.toLocaleString()} (${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}x)`;
  return `${label}: ${baseline} → ${observed.toLocaleString()}`;
}
