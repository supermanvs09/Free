import { PROGRESS_EVENT } from './events.js';

/* Practice-lab state, kept for the browser tab (sessionStorage): which view,
   which scenario, each scenario's result and transcript. Nothing here is sent
   anywhere. This file stays free of the scenarios so the launcher, which is on
   every page, can read progress without loading the lab. */
const KEY = 'ph-lab-v1';

export const fresh = (of = 5, total = 0) => ({ view: 'welcome', idx: 0, of, total, res: {}, log: {} });

export function load(of, total) {
  const base = fresh(of, total);
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object' && s.view) {
      const n = of || s.of || base.of;
      return { ...base, ...s, of: n, total: total || s.total || 0, idx: Math.min(Math.max(0, s.idx | 0), n - 1) };
    }
  } catch { /* storage blocked or corrupt */ }
  return base;
}

export const score = (s) => Object.values(s.res || {}).reduce((a, r) => a + (r.pts || 0), 0);

export function summary(s) {
  return { started: s.view !== 'welcome', done: s.view === 'done', at: s.idx + 1, of: s.of, score: score(s), total: s.total };
}

export function save(s) {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: summary(s) }));
}

export const readProgress = () => summary(load());
