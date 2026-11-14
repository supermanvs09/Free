/*
 * The workspace hub: one shared copy of what people change in the console
 * (users and roles, the audit log, verdicts, plans, integration settings,
 * alerts), so what one person does appears for everyone at once.
 *
 *   GET  /sync/state            { workspace, rev, doc }
 *   POST /sync/ops              { cid, actor?, base, ops[] }  ->  { rev, rewrites[] }
 *   GET  /sync/stream?cid=...   Server-Sent Events: hello, ops, presence, leader, reset
 *   POST /sync/presence         { cid, path }
 *   POST /sync/reset            start the workspace over (admins, from the console)
 *
 * The document is kept in memory and written to DATA_DIR/workspace.json a
 * moment after each change (atomically), so a restart picks up where it was.
 * Secrets entered in the console (the Jira API token, the Gmail app password)
 * never enter the shared document: the hub keeps them in DATA_DIR/secrets.json
 * and everyone else sees only that one is set.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { apply, validOp, clone } from './shared-ops.mjs';

export const VAULT = '__stored_on_server__';

/* Fields that hold a secret. Written by the console, kept by the hub. */
const SECRET_PATHS = [
  ['apps', 'jira', 'api_token'],
  ['apps', 'gmail', 'app_password'],
];
/* Top-level keys that belong to one browser and are never shared. */
const LOCAL_KEYS = new Set(['session', 'scope']);

const MAX_OPS = 400;
const MAX_DOC_BYTES = 8 * 1024 * 1024;

export function createHub({ dataDir, log = () => {} } = {}) {
  let workspace = crypto.randomUUID();
  let rev = 0;
  let doc = {};
  let secrets = {};
  const clients = new Map(); /* cid -> { res, info, since, path } */
  let leader = null;
  let writeTimer = null;

  const file = dataDir ? path.join(dataDir, 'workspace.json') : null;
  const secretFile = dataDir ? path.join(dataDir, 'secrets.json') : null;

  /* ── Persistence ─────────────────────────────────────────────────────── */
  function load() {
    if (!file) return;
    try {
      fss.mkdirSync(dataDir, { recursive: true });
      if (fss.existsSync(file)) {
        const saved = JSON.parse(fss.readFileSync(file, 'utf8'));
        if (saved && typeof saved === 'object' && saved.doc) ({ workspace, rev, doc } = { workspace: saved.workspace || workspace, rev: Number(saved.rev) || 0, doc: saved.doc });
      }
      if (fss.existsSync(secretFile)) secrets = JSON.parse(fss.readFileSync(secretFile, 'utf8')) || {};
      log('info', 'workspace loaded', { rev, keys: Object.keys(doc).length });
    } catch (error) {
      log('error', 'could not read the saved workspace; starting fresh', { error: error.message });
    }
  }

  async function writeAtomic(target, data) {
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data, { mode: 0o600 });
    await fs.rename(tmp, target);
  }

  function persist() {
    if (!file || writeTimer) return;
    writeTimer = setTimeout(async () => {
      writeTimer = null;
      try {
        await fs.mkdir(dataDir, { recursive: true });
        await writeAtomic(file, JSON.stringify({ workspace, rev, doc }));
      } catch (error) {
        log('error', 'could not save the workspace', { error: error.message });
      }
    }, 400);
  }

  async function persistSecrets() {
    if (!secretFile) return;
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await writeAtomic(secretFile, JSON.stringify(secrets));
    } catch (error) {
      log('error', 'could not save secrets', { error: error.message });
    }
  }

  /* ── Secrets ─────────────────────────────────────────────────────────── */
  const keyOf = (p) => p.join('.');
  const samePrefix = (a, b) => a.length <= b.length && a.every((s, i) => s === b[i]);

  /**
   * Takes secrets out of an operation before it is shared. Returns the
   * operation to apply and broadcast (with the secret replaced by VAULT).
   */
  function scrub(op) {
    let changed = false;
    const out = clone(op);
    for (const sp of SECRET_PATHS) {
      const plain = out.path.every((s) => typeof s === 'string');
      if (!plain) continue;
      if ((out.op === 'set' || out.op === 'init') && samePrefix(out.path, sp)) {
        /* The op writes the secret itself, or an object that contains it. */
        const rel = sp.slice(out.path.length);
        let holder = { v: out.value };
        let key = 'v';
        for (const s of rel) {
          if (!holder[key] || typeof holder[key] !== 'object') {
            holder = null;
            break;
          }
          holder = holder[key];
          key = s;
        }
        if (holder && holder[key] !== undefined && holder[key] !== VAULT) {
          const value = holder[key];
          if (value === '' || value === null) delete secrets[keyOf(sp)];
          else secrets[keyOf(sp)] = String(value);
          holder[key] = value ? VAULT : '';
          if (!rel.length) out.value = holder[key];
          changed = true;
        }
      } else if (out.op === 'del' && samePrefix(out.path, sp)) {
        delete secrets[keyOf(sp)];
        changed = true;
      }
    }
    return { op: out, secretsChanged: changed };
  }

  const secret = (name) => secrets[name] || '';

  /* ── Presence and the alert watcher ──────────────────────────────────── */
  function roster() {
    return [...clients.entries()].map(([cid, c]) => ({ cid, ...c.info, path: c.path, since: c.since }));
  }

  function chooseLeader() {
    if (leader && clients.has(leader)) return;
    const next = [...clients.entries()].sort((a, b) => a[1].since - b[1].since)[0]?.[0] ?? null;
    leader = next;
    broadcast('leader', { cid: leader });
  }

  function send(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      /* the connection is going away; its close handler cleans up */
    }
  }

  function broadcast(event, data, except) {
    for (const [cid, c] of clients) if (cid !== except) send(c.res, event, data);
  }

  let presenceTimer = null;
  function presenceChanged() {
    clearTimeout(presenceTimer);
    presenceTimer = setTimeout(() => broadcast('presence', { people: roster() }), 120);
  }

  /* ── Requests ────────────────────────────────────────────────────────── */
  function snapshot() {
    return { workspace, rev, doc };
  }

  function applyOps({ cid, actor, ops }) {
    if (!Array.isArray(ops) || !ops.length) return { rev, rewrites: [] };
    if (ops.length > MAX_OPS) throw Object.assign(new Error('Too many changes at once.'), { status: 413, code: 'TOO_MANY_OPS' });
    const applied = [];
    const rewrites = [];
    let secretsChanged = false;
    for (const raw of ops) {
      if (!validOp(raw) || (typeof raw.path[0] === 'string' && LOCAL_KEYS.has(raw.path[0]))) continue;
      if (raw.op === 'init' && raw.path.length === 1 && doc[raw.path[0]] !== undefined) {
        /* Someone set this up first: the sender takes theirs (secrets untouched). */
        rewrites.push({ op: 'set', path: raw.path, value: doc[raw.path[0]] });
        continue;
      }
      const { op, secretsChanged: sc } = scrub(raw);
      secretsChanged ||= sc;
      if (sc) rewrites.push(op);
      if (apply(doc, op)) applied.push(op);
    }
    if (secretsChanged) persistSecrets();
    if (!applied.length) return { rev, rewrites };
    rev += 1;
    persist();
    const size = Buffer.byteLength(JSON.stringify(doc));
    if (size > MAX_DOC_BYTES) log('warn', 'the workspace document is large', { bytes: size });
    broadcast('ops', { rev, cid, actor: actor ?? null, ops: applied });
    return { rev, rewrites };
  }

  function stream(req, res, query) {
    const cid = String(query.get('cid') || '').slice(0, 64) || crypto.randomUUID();
    const info = {
      name: String(query.get('name') || '').slice(0, 80),
      email: String(query.get('email') || '').slice(0, 120).toLowerCase(),
      role: String(query.get('role') || '').slice(0, 20),
    };
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 2000\n\n`);
    const old = clients.get(cid);
    if (old) {
      try {
        old.res.end();
      } catch {
        /* already gone */
      }
    }
    clients.set(cid, { res, info, since: old?.since ?? Date.now(), path: String(query.get('path') || '').slice(0, 200) });
    chooseLeader();
    send(res, 'hello', { workspace, rev, cid, leader, people: roster() });
    presenceChanged();
    const beat = setInterval(() => {
      try {
        res.write(`: keep-alive ${Date.now()}\n\n`);
      } catch {
        /* closed */
      }
    }, 20000);
    const done = () => {
      clearInterval(beat);
      const current = clients.get(cid);
      if (current && current.res === res) {
        clients.delete(cid);
        if (leader === cid) {
          leader = null;
          chooseLeader();
        }
        presenceChanged();
      }
    };
    req.on('close', done);
    res.on('error', done);
  }

  function presence({ cid, path: where, name, email, role }) {
    const c = clients.get(String(cid || ''));
    if (!c) return false;
    if (typeof where === 'string') c.path = where.slice(0, 200);
    if (name !== undefined) c.info.name = String(name).slice(0, 80);
    if (email !== undefined) c.info.email = String(email).slice(0, 120).toLowerCase();
    if (role !== undefined) c.info.role = String(role).slice(0, 20);
    presenceChanged();
    return true;
  }

  function reset({ cid, actor }) {
    workspace = crypto.randomUUID();
    rev = 0;
    doc = {};
    persist();
    broadcast('reset', { workspace, cid, actor: actor ?? null });
    return { workspace, rev };
  }

  load();
  return { snapshot, applyOps, stream, presence, reset, secret, stats: () => ({ workspace, rev, clients: clients.size, leader }) };
}
