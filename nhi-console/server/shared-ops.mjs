/*
 * Workspace replication: the operations people's changes travel as.
 *
 * Shared by the browser (src/lib/local/state.js) and the workspace hub
 * (server/sync-hub.mjs), so both sides apply a change the same way.
 *
 * A path is a list of segments. A string or number segment is an object key
 * (or array index); an `{ id }` segment is "the element of this array whose id
 * is ...", so two people editing different rows of the same list never
 * overwrite each other.
 *
 *   { op: 'set',  path, value }          replace the value at path
 *   { op: 'del',  path }                 remove a key, or an element by { id }
 *   { op: 'ins',  path, index, value }   insert into the array at path (by id:
 *                                        replaces the element if it is there)
 *   { op: 'init', path, value }          set only if nothing is there yet
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIdSeg = (s) => isObj(s) && 'id' in s;
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Arrays whose elements are all objects with distinct ids are diffed by id. */
function idArray(arr) {
  if (!arr.length) return true;
  const seen = new Set();
  for (const x of arr) {
    if (!isObj(x) || (typeof x.id !== 'string' && typeof x.id !== 'number') || seen.has(x.id)) return false;
    seen.add(x.id);
  }
  return true;
}

function sameJson(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** The operations that turn `before` into `after`. */
export function diff(before, after, path = [], out = []) {
  if (before === after) return out;
  if (isObj(before) && isObj(after)) {
    for (const k of Object.keys(after)) {
      if (after[k] === undefined) continue;
      if (!(k in before) || before[k] === undefined) out.push({ op: 'set', path: [...path, k], value: clone(after[k]) });
      else diff(before[k], after[k], [...path, k], out);
    }
    for (const k of Object.keys(before)) if (before[k] !== undefined && (!(k in after) || after[k] === undefined)) out.push({ op: 'del', path: [...path, k] });
    return out;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length + after.length > 0 && idArray(before) && idArray(after) && (before.length || after.length)) {
      const old = new Map(before.map((x) => [x.id, x]));
      const now = new Set(after.map((x) => x.id));
      for (const x of before) if (!now.has(x.id)) out.push({ op: 'del', path: [...path, { id: x.id }] });
      after.forEach((x, index) => {
        const prev = old.get(x.id);
        if (!prev) out.push({ op: 'ins', path, index, value: clone(x) });
        else diff(prev, x, [...path, { id: x.id }], out);
      });
      return out;
    }
    if (!sameJson(before, after)) out.push({ op: 'set', path, value: clone(after) });
    return out;
  }
  if (typeof before === 'number' && typeof after === 'number' && Number.isNaN(before) && Number.isNaN(after)) return out;
  if (!sameJson(before, after)) out.push({ op: 'set', path, value: clone(after) });
  return out;
}

function step(node, seg) {
  if (node === null || typeof node !== 'object') return undefined;
  if (isIdSeg(seg)) return Array.isArray(node) ? node.find((x) => isObj(x) && x.id === seg.id) : undefined;
  return node[seg];
}

/**
 * Applies one operation to `doc` in place. Returns true when it changed
 * something. A path through something that is not there is ignored (the row
 * was removed by someone else in the meantime), except that plain object keys
 * are created on the way.
 */
export function apply(doc, op) {
  const path = Array.isArray(op?.path) ? op.path : null;
  if (!path || !path.length) return false;
  let node = doc;
  for (let i = 0; i < path.length - 1; i += 1) {
    const seg = path[i];
    let next = step(node, seg);
    if (next === undefined || next === null) {
      if (isIdSeg(seg) || !isObj(node)) return false;
      next = {};
      node[seg] = next;
    }
    if (typeof next !== 'object') return false;
    node = next;
  }
  const last = path[path.length - 1];
  switch (op.op) {
    case 'init': {
      if (isIdSeg(last) || !isObj(node) || (node[last] !== undefined && node[last] !== null)) return false;
      node[last] = clone(op.value);
      return true;
    }
    case 'set': {
      if (isIdSeg(last)) {
        if (!Array.isArray(node)) return false;
        const i = node.findIndex((x) => isObj(x) && x.id === last.id);
        if (i < 0) return false;
        node[i] = clone(op.value);
        return true;
      }
      if (Array.isArray(node) && typeof last === 'number') {
        node[last] = clone(op.value);
        return true;
      }
      if (!isObj(node) && !Array.isArray(node)) return false;
      node[last] = clone(op.value);
      return true;
    }
    case 'del': {
      if (isIdSeg(last)) {
        if (!Array.isArray(node)) return false;
        const i = node.findIndex((x) => isObj(x) && x.id === last.id);
        if (i < 0) return false;
        node.splice(i, 1);
        return true;
      }
      if (!(last in node)) return false;
      if (Array.isArray(node)) node.splice(Number(last), 1);
      else delete node[last];
      return true;
    }
    case 'ins': {
      let arr = step(node, last);
      if (arr === undefined && isObj(node) && !isIdSeg(last)) {
        arr = [];
        node[last] = arr;
      }
      if (!Array.isArray(arr)) return false;
      const value = clone(op.value);
      if (isObj(value) && value.id !== undefined) {
        const at = arr.findIndex((x) => isObj(x) && x.id === value.id);
        if (at >= 0) {
          arr[at] = value;
          return true;
        }
      }
      const index = Math.max(0, Math.min(Number.isFinite(op.index) ? op.index : arr.length, arr.length));
      arr.splice(index, 0, value);
      return true;
    }
    default:
      return false;
  }
}

/** A cheap structural check on operations arriving from the network. */
export function validOp(op) {
  if (!isObj(op) || !['set', 'del', 'ins', 'init'].includes(op.op)) return false;
  if (!Array.isArray(op.path) || !op.path.length || op.path.length > 24) return false;
  for (const seg of op.path) {
    if (typeof seg === 'string') {
      if (seg === '__proto__' || seg === 'constructor' || seg === 'prototype' || seg.length > 200) return false;
    } else if (typeof seg === 'number') {
      if (!Number.isInteger(seg) || seg < 0) return false;
    } else if (!isIdSeg(seg) || (typeof seg.id !== 'string' && typeof seg.id !== 'number')) return false;
  }
  return true;
}

export { clone };
