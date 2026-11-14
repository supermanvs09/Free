/*
 * Development aid (VITE_FIELD_TRACE=true): records every field a screen reads
 * from a response that the response does not have, as
 * window.__missing["GET /api/v1/x"] = Set("data.items[].field"). Used to keep
 * the built-in service complete against what the screens read.
 */
const IGNORE = new Set(['then', 'toJSON', 'constructor', '$$typeof', 'nodeType', 'tagName', '@@iterator', 'asymmetricMatch', '_isAMomentObject', 'prototype', '__proto__', 'valueOf', 'toString', 'length', 'size']);

export function traced(value, endpoint) {
  const missing = (globalThis.__missing ??= {});
  const record = (path) => (missing[endpoint] ??= new Set()).add(path);
  const wrap = (obj, path) =>
    new Proxy(obj, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (typeof prop === 'symbol' || IGNORE.has(prop)) return v;
        if (Array.isArray(target) && (/^\d+$/.test(prop) || typeof v === 'function')) {
          return v && typeof v === 'object' ? wrap(v, `${path}[]`) : v;
        }
        if (!(prop in target)) {
          record(`${path}.${prop}`);
          return v;
        }
        return v && typeof v === 'object' ? wrap(v, `${path}.${prop}`) : v;
      },
    });
  return wrap(value, '');
}
