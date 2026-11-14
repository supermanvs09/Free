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

/** Resolves the capabilities this view has; never rejects. */
export async function connectRealtime() {
  const claude = typeof window !== 'undefined' ? window.claude : undefined;
  if (!claude?.use) {
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
