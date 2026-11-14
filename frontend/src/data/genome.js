import { ANCHOR, DAY, HOUR, hashString } from './world';
import { eventsFor } from './events';

/*
 * NHI Genome: a behavioural model per identity, learned from its own
 * activity. Each trait is one "gene" of what normal looks like; a detection
 * is a deviation from one of them. Feedback from the team (confirm, or
 * "this is expected") is kept on the identity and moves the baseline.
 */
export const LEARNING_DAYS = 14;

/* Which trait a detection broke, from what it describes. */
export function traitOfDetection(d) {
  const t = d.title.toLowerCase();
  if (/country|network|travel|asn/.test(t) || /sign(ed)? in from/.test(t)) return 'networks';
  if (/window|hour|woke|dormant/.test(t)) return 'schedule';
  if (/clone|read|30x|spike|enumerat|denied/.test(t)) return 'volume';
  if (/created|push|key/.test(t)) return 'actions';
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

export function genomeFor(identity, view) {
  if (!identity) return null;
  const r = rng(`genome:${identity.id}`);
  const ageDays = (ANCHOR - Date.parse(identity.createdAt)) / DAY;
  const observedDays = Math.min(90, Math.floor(ageDays));
  const lastUsedDays = identity.lastUsedAt ? (ANCHOR - Date.parse(identity.lastUsedAt)) / DAY : Infinity;
  const feedback = view?.genomeFeedback?.get(identity.id) || [];
  const detections = (view?.detections || []).filter((d) => d.identityId === identity.id);
  const open = detections.filter((d) => d.status === 'new' || d.status === 'investigating');

  let status = 'established';
  if (!identity.lastUsedAt || lastUsedDays > 90) status = 'dormant';
  else if (observedDays < LEARNING_DAYS) status = 'learning';
  if (open.length) status = 'drifting';
  if (identity.status === 'disabled') status = 'dormant';

  /* Schedule: when in the day it acts. CI and humans-in-the-loop keep office
     hours; services run around the clock; batch jobs fire at fixed times. */
  const ci = /actions|pipelines|deploy|pat|apppassword|repotoken/.test(identity.type) || /deploy|release|terraform/.test(identity.name);
  const batch = /batch|nightly|backup|sync|loader|etl|cron/.test(identity.name);
  const schedule = Array.from({ length: 24 }, (_, h) => {
    let v;
    if (batch) v = [1, 2, 3, 13].includes(h) ? 0.7 + r() * 0.3 : r() * 0.05;
    else if (ci) v = h >= 8 && h <= 18 ? 0.45 + r() * 0.55 : r() * 0.06;
    else v = 0.55 + r() * 0.45;
    return Math.round(v * 100) / 100;
  });

  /* Volume band: mean and spread over the active days of the last 30. */
  const active = identity.series.filter((v) => v > 0);
  const mean = active.length ? active.reduce((s, v) => s + v, 0) / active.length : 0;
  const sd = active.length ? Math.sqrt(active.reduce((s, v) => s + (v - mean) ** 2, 0) / active.length) : 0;

  /* Actions and resources, weighted by how often they appear in the log. */
  const events = eventsFor(identity, 80);
  const count = (key) => {
    const m = new Map();
    for (const e of events) m.set(e[key], (m.get(e[key]) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, share: n / Math.max(1, events.length) }));
  };
  const actions = count('action').slice(0, 6);
  const networks = count('source').slice(0, 4);
  const resources = identity.resources.map((name, k) => ({ name, share: Math.max(0.05, 0.6 / (k + 1)) }));

  const deviations = detections.map((d) => ({ detection: d, trait: traitOfDetection(d) }));
  /* An open volume deviation is the spike on today's point. */
  const series = [...identity.series];
  if (deviations.some((x) => x.trait === 'volume' && ['new', 'investigating'].includes(x.detection.status))) series[series.length - 1] = Math.max(series.at(-1), Math.round((mean + 2 * sd) * 2.6) || 50);
  const learned = feedback.filter((f) => f.verdict === 'expected');
  const confirmed = feedback.filter((f) => f.verdict === 'confirmed');
  const version = 1 + Math.min(9, Math.floor(observedDays / 12)) + learned.length;
  const trainedAt = learned.at(-1)?.at || new Date(ANCHOR - (1 + Math.floor(r() * 20)) * HOUR).toISOString();
  const confidence = status === 'learning' ? Math.round((observedDays / LEARNING_DAYS) * 60) : status === 'dormant' ? 0 : Math.min(99, 70 + Math.round(Math.min(observedDays, 90) / 4) + learned.length * 2 - open.length * 6);

  /* The genome itself: a fingerprint of 48 bands built from the traits, so
     two identities that behave alike look alike. */
  const bands = [];
  schedule.forEach((v) => bands.push(v));
  actions.concat(networks).forEach((a) => bands.push(Math.min(1, a.share * 2.2)));
  while (bands.length < 48) bands.push(r() * 0.5);

  const history = Array.from({ length: Math.min(version, 6) }, (_, k) => {
    const v = version - k;
    const fb = learned[learned.length - 1 - k];
    return {
      version: v,
      at: fb ? fb.at : new Date(Date.parse(trainedAt) - k * 12 * DAY).toISOString(),
      note: fb ? `Learned from feedback: ${fb.note}` : v === 1 ? 'First baseline after 14 days of activity' : 'Scheduled retrain on 90 days of activity',
      by: fb?.by || null,
    };
  });

  return {
    identityId: identity.id,
    status,
    observedDays,
    confidence: Math.max(0, confidence),
    version,
    trainedAt,
    schedule,
    volume: { mean: Math.round(mean), low: Math.max(0, Math.round(mean - 2 * sd)), high: Math.round(mean + 2 * sd), series },
    actions,
    networks,
    resources,
    countries: identity.countries,
    deviations,
    feedback,
    confirmed: confirmed.length,
    learned: learned.length,
    bands: bands.slice(0, 48),
    history,
  };
}

export const TRAIT_LABEL = {
  schedule: 'Schedule',
  volume: 'Volume',
  actions: 'Actions',
  resources: 'Resources',
  networks: 'Networks and places',
  ownership: 'Ownership',
};
