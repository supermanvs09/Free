/*
 * Where shared changes live.
 *
 * Opened as a published page, the console keeps everything people change in
 * the page's shared database, so one person's ticket, comment or status change
 * reaches everyone else who has it open, live. Opened anywhere else (a local
 * dev server, a saved copy), it falls back to this browser's storage and
 * BroadcastChannel, which still syncs between tabs.
 *
 * Both sides expose the same small surface:
 *   collection(name).onSnapshot(next, error) -> unsubscribe
 *   doc(collection, id).set(body) / .delete()
 */

const LOCAL_PREFIX = 'corvane.shared.';

function safeStorage() {
  try {
    const s = window.localStorage;
    const k = '__probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

function createLocalDb() {
  const storage = safeStorage();
  const memory = new Map();
  const listeners = new Map();
  let channel = null;
  try {
    channel = new BroadcastChannel('corvane-shared');
  } catch {
    channel = null;
  }

  const read = (name) => {
    if (memory.has(name)) return memory.get(name);
    let value = {};
    try {
      value = JSON.parse(storage?.getItem(LOCAL_PREFIX + name) || '{}') || {};
    } catch {
      value = {};
    }
    memory.set(name, value);
    return value;
  };
  const emit = (name) => {
    const docs = Object.entries(read(name)).map(([id, body]) => ({ id, exists: true, data: () => body }));
    for (const fn of listeners.get(name) ?? []) fn({ docs, size: docs.length, metadata: { fromCache: false } });
  };
  const write = (name, value) => {
    memory.set(name, value);
    try {
      storage?.setItem(LOCAL_PREFIX + name, JSON.stringify(value));
    } catch {
      /* storage full or refused: this tab keeps it in memory */
    }
    channel?.postMessage({ name });
    emit(name);
  };
  channel?.addEventListener('message', (event) => {
    const name = event.data?.name;
    if (!name) return;
    memory.delete(name);
    emit(name);
  });
  window.addEventListener('storage', (event) => {
    if (!event.key?.startsWith(LOCAL_PREFIX)) return;
    const name = event.key.slice(LOCAL_PREFIX.length);
    memory.delete(name);
    emit(name);
  });

  return {
    mode: 'local',
    collection(name) {
      return {
        onSnapshot(next) {
          const set = listeners.get(name) ?? new Set();
          set.add(next);
          listeners.set(name, set);
          queueMicrotask(() => emit(name));
          return () => set.delete(next);
        },
      };
    },
    doc(name, id) {
      return {
        async set(body) {
          write(name, { ...read(name), [id]: body });
        },
        async delete() {
          const next = { ...read(name) };
          delete next[id];
          write(name, next);
        },
      };
    },
  };
}

function wrapSharedDb(db) {
  return {
    mode: 'shared',
    collection(name) {
      return {
        onSnapshot(next, error) {
          return db.collection(name).onSnapshot(next, error);
        },
      };
    },
    doc(name, id) {
      const ref = db.collection(name).doc(id);
      return {
        set: (body) => ref.set(body),
        delete: () => ref.delete(),
      };
    },
  };
}

/*
 * The relay (relay/ in this repository): a Cloudflare Worker that serves the
 * console and keeps the workspace in a Durable Object. One WebSocket carries
 * every change both ways, plus who is online.
 */
function createRelayDb(base) {
  const wsUrl = `${base.replace(/^http/, 'ws')}/ws`;
  const collections = new Map(); // name -> Map(id -> body)
  const listeners = new Map();
  const peerListeners = new Set();
  const statusListeners = new Set();
  const queue = [];
  let ws = null;
  let backoff = 500;
  let identity = { name: '', ref: '' };
  let presence = {};
  let integrations = null;

  const emit = (name) => {
    const map = collections.get(name) || new Map();
    const docs = [...map.entries()].map(([id, body]) => ({ id, exists: true, data: () => body }));
    for (const fn of listeners.get(name) ?? []) fn({ docs, size: docs.length, metadata: { fromCache: false } });
  };
  const send = (msg) => {
    const raw = JSON.stringify(msg);
    if (ws?.readyState === 1) ws.send(raw);
    else queue.push(raw);
  };
  const connect = () => {
    const q = new URLSearchParams({ name: identity.name || '', ref: identity.ref || '' });
    ws = new WebSocket(`${wsUrl}?${q}`);
    ws.onopen = () => {
      backoff = 500;
      if (Object.keys(presence).length) ws.send(JSON.stringify({ type: 'presence', patch: presence }));
      while (queue.length) ws.send(queue.shift());
      for (const fn of statusListeners) fn('online');
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'snapshot') {
        integrations = msg.integrations || null;
        const names = new Set([...collections.keys(), ...Object.keys(msg.docs || {})]);
        for (const name of names) collections.set(name, new Map(Object.entries(msg.docs?.[name] || {})));
        for (const name of new Set([...names, ...listeners.keys()])) emit(name);
        for (const fn of statusListeners) fn('online');
      } else if (msg.type === 'change') {
        const map = collections.get(msg.collection) || new Map();
        if (msg.body === null) map.delete(msg.id);
        else map.set(msg.id, msg.body);
        collections.set(msg.collection, map);
        emit(msg.collection);
      } else if (msg.type === 'peers') {
        for (const fn of peerListeners) fn({ peers: msg.peers.map((p) => ({ ...p, by: p.ref?.replace(/^u:/, '') || null, isMe: p.ref === identity.ref && p.path === presence.path, kind: 'viewer', presence: { path: p.path } })) });
      }
    };
    ws.onclose = () => {
      for (const fn of statusListeners) fn('reconnecting');
      setTimeout(connect, backoff);
      backoff = Math.min(15000, backoff * 2);
    };
  };

  return {
    mode: 'relay',
    base,
    start(who) {
      identity = who || identity;
      if (!ws) connect();
    },
    integrations: () => integrations,
    onStatus(fn) {
      statusListeners.add(fn);
      return () => statusListeners.delete(fn);
    },
    collection(name) {
      return {
        onSnapshot(next) {
          const set = listeners.get(name) ?? new Set();
          set.add(next);
          listeners.set(name, set);
          if (collections.has(name)) queueMicrotask(() => emit(name));
          return () => set.delete(next);
        },
      };
    },
    doc(name, id) {
      return {
        async set(body) {
          const map = collections.get(name) || new Map();
          map.set(id, body);
          collections.set(name, map);
          send({ type: 'set', collection: name, id, body });
        },
        async delete() {
          collections.get(name)?.delete(id);
          send({ type: 'delete', collection: name, id });
        },
      };
    },
    room: {
      presence(patch) {
        presence = { ...presence, ...patch };
        send({ type: 'presence', patch });
      },
      onPeers(fn) {
        peerListeners.add(fn);
        return () => peerListeners.delete(fn);
      },
    },
    async testIntegration(kind, to) {
      const res = await fetch(`${base}/api/integrations/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, to }) });
      return res.json();
    },
  };
}

async function findRelay() {
  const candidates = [import.meta.env?.VITE_RELAY_URL, typeof location !== 'undefined' && /^https?:/.test(location.protocol) ? location.origin : null].filter(Boolean);
  for (const base of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(`${base.replace(/\/$/, '')}/api/health`, { signal: ctrl.signal });
      clearTimeout(t);
      const body = res.ok ? await res.json() : null;
      if (body?.relay === 'corvane-nhi') return base.replace(/\/$/, '');
    } catch {
      /* not a relay */
    }
  }
  return null;
}

/** Resolves the capabilities this view has; never rejects. */
export async function connectRealtime() {
  const claude = typeof window !== 'undefined' ? window.claude : undefined;
  if (!claude?.use) {
    const relay = await findRelay();
    if (relay) {
      const db = createRelayDb(relay);
      return { db, user: null, room: db.room, relay: db };
    }
    return { db: createLocalDb(), user: null, room: null };
  }
  const settle = (p) => Promise.resolve(p).catch(() => null);
  const [db, user, room] = await Promise.all([settle(claude.use('db')), settle(claude.use('user')), settle(claude.use('room'))]);
  return { db: db ? wrapSharedDb(db) : createLocalDb(), user, room };
}

/** A document id that is always a valid path segment. */
export function safeId(value) {
  return String(value).replace(/[^A-Za-z0-9_\-.~:@+]/g, '_').slice(0, 180) || 'x';
}
