/*
 * What the console changes is kept in this browser (localStorage), so a
 * decision, a connection or a setting survives a reload and is shared by the
 * browser's tabs. Everything else is derived from the estate in seed.js.
 */
const KEY = 'nhi.console.state.v2';
const listeners = new Set();
let cache = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  return {};
}

export function state() {
  cache ??= load();
  return cache;
}

let pending = null;
export function save() {
  if (pending) return;
  pending = setTimeout(() => {
    pending = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(cache ?? {}));
    } catch {
      /* storage full or refused: changes last for this page view */
    }
  }, 0);
  for (const fn of listeners) fn();
}

/** Lazily initialise one slice with its default. */
export function slice(name, init) {
  const s = state();
  if (s[name] === undefined) {
    s[name] = typeof init === 'function' ? init() : init;
    save();
  }
  return s[name];
}

export function resetState() {
  cache = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
  for (const fn of listeners) fn();
}

export function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Another tab changed something: read it again. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    cache = load();
    for (const fn of listeners) fn();
  });
}
