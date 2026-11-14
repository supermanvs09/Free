/*
 * What people change in the console - users and roles, the audit log,
 * verdicts, plans, integration settings, alerts - is one shared workspace.
 *
 * With the workspace hub reachable (server/sync-hub.mjs, same origin under
 * /notify-api/sync), every change is sent to it as small path-level
 * operations and arrives in everyone else's console within a moment, over a
 * Server-Sent Events stream. Without it, the console keeps working on its own
 * copy in this browser (localStorage), shared by the browser's tabs.
 *
 * A few keys belong to one browser only (who is signed in here, the saved
 * scope) and are never shared.
 */
import { apply, clone, diff } from '../../../server/shared-ops.mjs';

const RELAY = (import.meta.env.VITE_NOTIFY_API || '/notify-api').replace(/\/+$/, '');
const LEGACY_KEY = 'nhi.console.state.v2';
const SHARED_KEY = 'nhi.console.shared.v3';
const LOCAL_KEY = 'nhi.console.local.v3';
export const LOCAL_KEYS = new Set(['session', 'scope']);

const listeners = new Set();
const remoteListeners = new Set();
const statusListeners = new Set();
const presenceListeners = new Set();
const liveListeners = new Set();

let cache = null; /* everything: shared keys and this browser's keys */
let shadow = {}; /* the shared keys as the hub last confirmed them */
let mode = 'local'; /* 'local' | 'shared' */
let status = 'local'; /* 'local' | 'connecting' | 'live' | 'offline' */
let workspace = null;
let rev = 0;
let leaderCid = null;
let people = [];
let liveEpoch = 0;
const cid = makeId();
let outbox = [];
let sending = false;
let source = null;
let me = { name: '', email: '', role: '' };
let where = typeof window !== 'undefined' ? window.location.pathname : '';

function makeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `c_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or refused: changes last for this page view */
  }
}

const sharedPart = (doc) => {
  const out = {};
  for (const k of Object.keys(doc)) if (!LOCAL_KEYS.has(k)) out[k] = doc[k];
  return out;
};
const localPart = (doc) => {
  const out = {};
  for (const k of LOCAL_KEYS) if (doc[k] !== undefined) out[k] = doc[k];
  return out;
};

function loadLocal() {
  const legacy = readJson(LEGACY_KEY);
  const shared = readJson(SHARED_KEY)?.doc ?? (legacy ? sharedPart(legacy) : {});
  const local = readJson(LOCAL_KEY) ?? (legacy ? localPart(legacy) : {});
  return { ...shared, ...local };
}

export function state() {
  cache ??= loadLocal();
  return cache;
}

/* ── Saving ────────────────────────────────────────────────────────────── */
let pending = null;
export function save() {
  if (!pending) pending = setTimeout(flush, 0);
  for (const fn of listeners) fn();
}

function flush() {
  pending = null;
  const doc = state();
  writeJson(LOCAL_KEY, localPart(doc));
  if (mode !== 'shared') {
    writeJson(SHARED_KEY, { workspace: null, doc: sharedPart(doc) });
    return;
  }
  const now = sharedPart(doc);
  const ops = diff(shadow, now).map((op) => (op.op === 'set' && op.path.length === 1 && shadow[op.path[0]] === undefined ? { ...op, op: 'init' } : op));
  if (!ops.length) return;
  for (const op of ops) apply(shadow, op);
  outbox.push(...ops);
  writeJson(SHARED_KEY, { workspace, rev, doc: shadow });
  pump();
}

async function pump() {
  if (sending || !outbox.length || mode !== 'shared') return;
  sending = true;
  const batch = outbox.slice(0, 300);
  try {
    const res = await fetch(`${RELAY}/sync/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cid, actor: me.email ? { name: me.name, email: me.email } : null, base: rev, ops: batch }),
      credentials: 'same-origin',
      keepalive: JSON.stringify(batch).length < 60000,
    });
    if (!res.ok) throw new Error(`hub answered ${res.status}`);
    const data = await res.json();
    outbox = outbox.slice(batch.length);
    if (data.rewrites?.length) {
      for (const op of data.rewrites) {
        apply(shadow, op);
        apply(cache, op);
      }
      bumpLive();
      for (const fn of listeners) fn();
    }
    retryIn = 500;
  } catch {
    setStatus('offline');
    setTimeout(pump, retryIn);
    retryIn = Math.min(retryIn * 2, 15000);
    sending = false;
    return;
  }
  sending = false;
  if (outbox.length) pump();
}
let retryIn = 500;

/** Lazily initialise one slice with its default. */
export function slice(name, init) {
  const s = state();
  if (s[name] === undefined) {
    s[name] = typeof init === 'function' ? init() : init;
    save();
  }
  return s[name];
}

/** Starts the workspace over: for everyone when shared, else in this browser. */
export async function resetState() {
  if (mode === 'shared') {
    try {
      await fetch(`${RELAY}/sync/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid, actor: me }) });
    } catch {
      /* the hub is away: start over here */
    }
  }
  const local = localPart(state());
  for (const k of Object.keys(cache)) delete cache[k];
  Object.assign(cache, local);
  shadow = {};
  outbox = [];
  try {
    localStorage.removeItem(SHARED_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* nothing kept */
  }
  for (const fn of listeners) fn();
}

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ── Live updates ──────────────────────────────────────────────────────── */
/** Someone else changed the workspace: fn({ ops, actor }). */
export function onRemoteChange(fn) {
  remoteListeners.add(fn);
  return () => remoteListeners.delete(fn);
}

let liveTimer = null;
function bumpLive() {
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    liveEpoch += 1;
    for (const fn of liveListeners) fn();
    window.dispatchEvent(new CustomEvent('alerts:refresh'));
  }, 120);
}
/** Increments whenever the shared workspace changed under this console. */
export const getLiveEpoch = () => liveEpoch;
export function subscribeLiveEpoch(fn) {
  liveListeners.add(fn);
  return () => liveListeners.delete(fn);
}

function setStatus(next) {
  if (status === next) return;
  status = next;
  for (const fn of statusListeners) fn();
}
export const getSyncStatus = () => status;
export function subscribeSyncStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
export const isShared = () => mode === 'shared';

/* Who else is here. */
export const getPeople = () => people;
export function subscribePeople(fn) {
  presenceListeners.add(fn);
  return () => presenceListeners.delete(fn);
}
export const clientId = () => cid;

/** True when this console is the one that watches for detections and sends alerts. */
export const isSyncLeader = () => mode === 'shared' && status === 'live' && leaderCid === cid;
const leaderListeners = new Set();
export function onLeaderChange(fn) {
  leaderListeners.add(fn);
  return () => leaderListeners.delete(fn);
}

function postPresence(extra = {}) {
  if (mode !== 'shared') return;
  fetch(`${RELAY}/sync/presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid, path: where, ...me, ...extra }) }).catch(() => {});
}
/** Who is signed in here, for everyone else's "who is online". */
export function setPresenceUser(user) {
  const next = { name: user?.name || user?.full_name || '', email: user?.email || '', role: user?.role || '' };
  if (next.email === me.email && next.name === me.name && next.role === me.role) return;
  me = next;
  postPresence();
}
let whereTimer = null;
export function setPresencePath(path) {
  where = path;
  clearTimeout(whereTimer);
  whereTimer = setTimeout(() => postPresence(), 300);
}

function applyRemote(msg) {
  if (!msg || typeof msg.rev !== 'number') return;
  if (msg.rev <= rev) return;
  /* Changes made here a moment ago go out first, so they are not lost under
     this one. */
  if (pending) {
    clearTimeout(pending);
    flush();
  }
  if (msg.rev !== rev + 1) {
    resync();
    return;
  }
  rev = msg.rev;
  const changed = [];
  for (const op of msg.ops ?? []) {
    if (typeof op.path?.[0] === 'string' && LOCAL_KEYS.has(op.path[0])) continue;
    apply(shadow, op);
    if (apply(cache, op)) changed.push(op);
  }
  writeJson(SHARED_KEY, { workspace, rev, doc: shadow });
  if (msg.cid === cid) return;
  if (changed.length) {
    for (const fn of listeners) fn();
    for (const fn of remoteListeners) fn({ ops: changed, actor: msg.actor });
    bumpLive();
  }
}

let resyncing = null;
async function resync() {
  if (resyncing) return resyncing;
  resyncing = (async () => {
    try {
      const res = await fetch(`${RELAY}/sync/state`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await res.json();
      if (!data?.ok) throw new Error('no state');
      /* Keep what this console changed that the hub has not confirmed. */
      if (pending) {
        clearTimeout(pending);
        pending = null;
      }
      const mine = [...outbox, ...diff(shadow, sharedPart(state()))];
      outbox = [];
      sending = false;
      adopt(data);
      for (const op of mine) apply(cache, op);
      for (const fn of listeners) fn();
      bumpLive();
      flush();
    } catch {
      setStatus('offline');
    } finally {
      resyncing = null;
    }
  })();
  return resyncing;
}

function adopt(data) {
  const local = localPart(state());
  if (workspace && data.workspace !== workspace) outbox = [];
  workspace = data.workspace;
  rev = data.rev;
  shadow = clone(data.doc ?? {});
  for (const k of Object.keys(cache)) if (!LOCAL_KEYS.has(k)) delete cache[k];
  Object.assign(cache, clone(data.doc ?? {}), local);
  writeJson(SHARED_KEY, { workspace, rev, doc: shadow });
}

function connect() {
  if (typeof EventSource === 'undefined') return;
  const qs = new URLSearchParams({ cid, path: where, ...me });
  source = new EventSource(`${RELAY}/sync/stream?${qs}`);
  source.addEventListener('hello', (e) => {
    const msg = JSON.parse(e.data);
    leaderCid = msg.leader;
    people = msg.people ?? [];
    for (const fn of presenceListeners) fn();
    if (msg.workspace !== workspace || msg.rev !== rev) resync().then(() => setStatus('live'));
    else setStatus('live');
    postPresence();
    for (const fn of leaderListeners) fn();
    pump();
  });
  source.addEventListener('ops', (e) => applyRemote(JSON.parse(e.data)));
  source.addEventListener('presence', (e) => {
    people = JSON.parse(e.data).people ?? [];
    for (const fn of presenceListeners) fn();
  });
  source.addEventListener('leader', (e) => {
    leaderCid = JSON.parse(e.data).cid;
    for (const fn of leaderListeners) fn();
  });
  source.addEventListener('reset', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.workspace === workspace) return;
    try {
      localStorage.removeItem(SHARED_KEY);
    } catch {
      /* nothing kept */
    }
    window.location.reload();
  });
  source.onerror = () => {
    setStatus('offline');
    for (const fn of leaderListeners) fn();
  };
}

/**
 * Called once before the console renders: joins the shared workspace when
 * the hub answers, else keeps this browser's copy. Never waits more than a
 * couple of seconds.
 */
export async function initSync({ timeout = 2500 } = {}) {
  state();
  if (typeof window === 'undefined' || import.meta.env.VITE_SYNC === 'off') return 'local';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    setStatus('connecting');
    const res = await fetch(`${RELAY}/sync/state`, { headers: { Accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('json')) throw new Error('no hub');
    const data = await res.json();
    if (!data?.ok) throw new Error('no hub');
    mode = 'shared';
    adopt(data);
    connect();
    return 'shared';
  } catch {
    mode = 'local';
    setStatus('local');
    return 'local';
  } finally {
    clearTimeout(timer);
  }
}

/* Another tab of this browser changed something. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === LOCAL_KEY) {
      const local = readJson(LOCAL_KEY) ?? {};
      for (const k of LOCAL_KEYS) {
        if (local[k] === undefined) delete state()[k];
        else state()[k] = local[k];
      }
      for (const fn of listeners) fn();
      return;
    }
    if (mode === 'shared' || (event.key !== SHARED_KEY && event.key !== LEGACY_KEY)) return;
    const shared = readJson(SHARED_KEY)?.doc ?? {};
    const local = localPart(state());
    for (const k of Object.keys(cache)) delete cache[k];
    Object.assign(cache, shared, local);
    for (const fn of listeners) fn();
    bumpLive();
  });
  /* Send what is waiting before the page goes away. */
  window.addEventListener('pagehide', () => {
    if (pending) {
      clearTimeout(pending);
      flush();
    }
  });
}
