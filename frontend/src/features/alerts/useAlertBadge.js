import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { fetchAlertsSummary } from '../../lib/api/alerts';
import { useAuth } from '../../app/AuthContext';

/*
 * One poll for the whole console: every badge (expanded nav, collapsed rail,
 * mobile drawer) reads the same summary. Refreshed every minute, when the tab
 * regains focus, and when a sync finishes (the 'alerts:refresh' event).
 */
const POLL_MS = 60000;
let summary = null;
let users = 0;
let timer = null;
let inflight = null;
const listeners = new Set();

async function refresh() {
  if (inflight) return inflight;
  inflight = fetchAlertsSummary()
    .then((data) => {
      summary = data ?? null;
      listeners.forEach((fn) => fn());
    })
    .catch(() => {
      /* keep the last known count; a failed poll is not "no alerts" */
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const onFocus = () => document.visibilityState === 'visible' && refresh();

function start() {
  users += 1;
  if (users > 1) return;
  refresh();
  timer = setInterval(() => document.visibilityState === 'visible' && refresh(), POLL_MS);
  document.addEventListener('visibilitychange', onFocus);
  window.addEventListener('alerts:refresh', refresh);
}

function stop() {
  users -= 1;
  if (users > 0) return;
  clearInterval(timer);
  document.removeEventListener('visibilitychange', onFocus);
  window.removeEventListener('alerts:refresh', refresh);
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/*
 * Read state, per user, in this browser. An alert is read when it was opened
 * (its key at its current detected_at: a new anomaly on the same identity
 * makes it unread again) or when "mark all as read" ran after it was detected.
 * ponytail: browser storage, so it does not follow the user to another device;
 * move it to a per-user table if that matters.
 */
const readKey = (user) => `dna.alerts.read.${user?.tenantId ?? ''}.${user?.email ?? 'anon'}`;
const reads = new Map(); // storage key -> { all, keys }
let readsVersion = 0;

function readsFor(key) {
  if (!reads.has(key)) {
    let value = { all: 0, keys: {} };
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (raw && typeof raw === 'object') value = { all: Number(raw.all) || 0, keys: raw.keys && typeof raw.keys === 'object' ? raw.keys : {} };
    } catch {
      /* private window or cleared storage: everything unread */
    }
    reads.set(key, value);
  }
  return reads.get(key);
}

function saveReads(key, value) {
  /* Entries older than "mark all" are covered by it. */
  const keys = Object.fromEntries(Object.entries(value.keys).filter(([, t]) => t > value.all));
  reads.set(key, { all: value.all, keys });
  readsVersion += 1;
  try {
    localStorage.setItem(key, JSON.stringify({ all: value.all, keys }));
  } catch {
    /* kept in memory for this tab */
  }
  listeners.forEach((fn) => fn());
}

const timeOf = (a) => new Date(a.detected_at).getTime() || 0;

/** isUnread(alert), markRead(alert), markAllRead(alerts) for the signed-in user. */
export function useAlertReads() {
  const { user } = useAuth();
  const key = readKey(user);
  useSyncExternalStore(subscribe, () => readsVersion);
  const state = readsFor(key);
  const isUnread = useCallback((a) => timeOf(a) > state.all && state.keys[a.key] !== timeOf(a), [state]);
  const markRead = useCallback(
    (a) => {
      const cur = readsFor(key);
      if (timeOf(a) <= cur.all || cur.keys[a.key] === timeOf(a)) return;
      saveReads(key, { all: cur.all, keys: { ...cur.keys, [a.key]: timeOf(a) } });
    },
    [key],
  );
  const markAllRead = useCallback(
    (alerts) => {
      const cur = readsFor(key);
      const latest = Math.max(cur.all, Date.now(), ...alerts.map(timeOf));
      saveReads(key, { all: latest, keys: {} });
    },
    [key],
  );
  return { isUnread, markRead, markAllRead };
}

/** The alert summary, or null until the first answer. `exposure` drops exposure alerts when that feature is off. Badge = unread. */
export function useAlertSummary({ exposure = true } = {}) {
  useEffect(() => {
    start();
    return stop;
  }, []);
  const value = useSyncExternalStore(subscribe, () => summary);
  const { isUnread } = useAlertReads();
  if (!value) return null;
  const items = (value.items ?? []).filter((a) => exposure || a.source !== 'exposure');
  /* An older API without items: every current alert counts, as before. */
  const badge = value.items
    ? items.filter(isUnread).length
    : Math.max(0, (Number(value.badge) || 0) - (exposure ? 0 : Number(value.by_source?.exposure) || 0));
  return { ...value, badge };
}
