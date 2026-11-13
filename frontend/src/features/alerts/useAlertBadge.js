import { useEffect, useSyncExternalStore } from 'react';
import { fetchAlertsSummary } from '../../lib/api/alerts';

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

/** Ask every badge to re-read the counts (after a sync, after reviewing). */
export const refreshAlerts = () => window.dispatchEvent(new Event('alerts:refresh'));

/** The alert summary, or null until the first answer. `exposure` drops exposure counts when that feature is off. */
export function useAlertSummary({ exposure = true } = {}) {
  useEffect(() => {
    start();
    return stop;
  }, []);
  const value = useSyncExternalStore(subscribe, () => summary);
  if (!value) return null;
  /* The badge is unworked alerts; exposure ones drop out when that feature is off. */
  const hidden = exposure ? 0 : Number(value.open_by_source?.exposure) || 0;
  return { ...value, badge: Math.max(0, (Number(value.badge) || 0) - hidden) };
}
