/* Shared helpers for the built-in service. */

/** Deterministic PRNG (mulberry32): the same estate on every load. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const api = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    weighted: (pairs) => {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [value, w] of pairs) {
        r -= w;
        if (r <= 0) return value;
      }
      return pairs[pairs.length - 1][0];
    },
    sample: (list, n) => {
      const copy = [...list];
      const out = [];
      while (copy.length && out.length < n) out.push(copy.splice(Math.floor(next() * copy.length), 1)[0]);
      return out;
    },
    hex: (n) => Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join(''),
    alnum: (n, set = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') => Array.from({ length: n }, () => set[Math.floor(next() * set.length)]).join(''),
    uuid: () => {
      const h = Array.from({ length: 32 }, () => Math.floor(next() * 16).toString(16)).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[Math.floor(next() * 4)]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
    },
  };
  return api;
}

export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Timestamps are generated relative to the moment the console loaded. */
export const NOW = Date.now();
export const iso = (ms) => new Date(ms).toISOString();
export const ago = (ms) => iso(NOW - ms);
export const daysAgo = (d) => iso(NOW - d * DAY);
export const dateOnly = (ms) => iso(ms).slice(0, 10);

export const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

export function hashString(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ── Envelopes, one per service family the screens were written for ───── */
export const ok = (data, extra = {}) => ({ status: 200, body: { success: true, message: 'OK', data, ...extra } });
export const posture = (data, { page = null, meta = {} } = {}) => ({
  status: 200,
  body: { data, page, meta: { scan_id: 'scan-ispm-latest', computed_at: ago(42 * MIN), window: '30d', data_available: true, ...meta } },
});
export const genome = (data, meta = {}) => ({
  status: 200,
  body: { data, meta: { request_id: `req_${Math.random().toString(36).slice(2, 10)}`, generated_at: iso(Date.now()), next_cursor: null, ...meta } },
});
export const bare = (body, status = 200) => ({ status, body });
export const remed = (data, extra = {}) => ({ status: 200, body: { data, ...extra } });

export function fail(status, message, code = undefined, field = undefined) {
  return { status, body: { success: false, message, error: code ?? statusCode(status), data: field ? { field } : undefined } };
}
export function failNested(status, message, code, field) {
  return { status, body: { error: { code: code ?? statusCode(status), message, field } } };
}
function statusCode(status) {
  return { 400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT' }[status] ?? 'ERROR';
}

/** Page an array the way the discovery API does. */
export function paged(rows, params, { defaultSize = 25 } = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const size = Math.max(1, Math.min(500, Number(params.page_size ?? params.limit) || defaultSize));
  const total = rows.length;
  return {
    data: rows.slice((page - 1) * size, page * size),
    pagination: { page, page_size: size, total_count: total, total_pages: Math.max(1, Math.ceil(total / size)) },
  };
}

/** Keyset-style paging with an opaque cursor (offset encoded). */
export function cursorPage(rows, params, defaultLimit = 25) {
  const limit = Math.max(1, Math.min(500, Number(params.limit) || defaultLimit));
  const offset = params.cursor ? Number(atob(String(params.cursor))) || 0 : 0;
  const items = rows.slice(offset, offset + limit);
  const next = offset + limit < rows.length ? btoa(String(offset + limit)) : null;
  return { items, next, limit };
}

export const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : String(value).split(','));
export const truthy = (value) => value === true || value === 'true' || value === '1';

export function sortBy(rows, key, order = 'asc') {
  const dir = String(order).toLowerCase() === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x > y ? 1 : -1) * dir;
  });
}

export function matches(row, needle, fields) {
  if (!needle) return true;
  const q = String(needle).toLowerCase();
  return fields.some((f) => String(row[f] ?? '').toLowerCase().includes(q));
}
