import { useSyncExternalStore } from 'react';
import { ANCHOR, FORMER, ORG, PEOPLE, PLAYBOOKS, PROVIDERS, RULES, SEV_ORDER, buildConnection, buildWorld, connectionSize, hashString } from './world';
import { connectRealtime, safeId } from './realtime';

/*
 * The shared store. The estate itself comes from world.js; everything people
 * change is a document in a shared collection, merged over it here:
 *
 *   ovr       patches to existing records, id "<kind>:<id>"
 *   tickets   Jira issues raised from the console
 *   comments  discussion on any record
 *   activity  what happened, newest first (drives notifications)
 *   mail      messages sent by the console and its people
 *   runs      remediation runs and syncs
 *   conns     applications connected from the console
 *   rules     notification rules
 *   members   people who have signed in
 */
const COLLECTIONS = ['ovr', 'tickets', 'comments', 'activity', 'mail', 'runs', 'conns', 'rules', 'members'];

const state = {
  status: 'connecting', // connecting | ready
  mode: 'local',
  me: null,
  docs: Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()])),
  loaded: new Set(),
  profiles: new Map(),
  peers: [],
  version: 0,
  now: Date.now(),
};

let rt = null;
const listeners = new Set();
const activityListeners = new Set();
let cachedView = null;
let cachedVersion = -1;

function bump() {
  state.version += 1;
  for (const fn of listeners) fn();
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** Fires for activity written by someone else while this page is open. */
export function onRemoteActivity(fn) {
  activityListeners.add(fn);
  return () => activityListeners.delete(fn);
}

/* A clock for anything that moves on its own (runs in progress, "2 min ago"). */
let ticker = 0;
function ensureTicker() {
  if (ticker) return;
  ticker = window.setInterval(() => {
    state.now = Date.now();
    const view = getView();
    if (view.runs.some((r) => r.status === 'running' || r.status === 'queued')) bump();
  }, 1000);
}
window.setInterval(() => {
  state.now = Date.now();
  bump();
}, 60_000);

/* ── Boot ──────────────────────────────────────────────────────────────── */
let bootPromise = null;
export function boot() {
  bootPromise ??= (async () => {
    rt = await connectRealtime();
    state.mode = rt.db.mode;
    const startedAt = Date.now();
    for (const name of COLLECTIONS) {
      rt.db.collection(name).onSnapshot(
        (snap) => {
          const next = new Map();
          for (const d of snap.docs) next.set(d.id, d.data());
          const prev = state.docs[name];
          state.docs[name] = next;
          const first = !state.loaded.has(name);
          state.loaded.add(name);
          if (name === 'activity' && !first) {
            for (const [id, body] of next) {
              if (prev.has(id) || !body) continue;
              if (body.actor === state.me?.ref) continue;
              if (Date.parse(body.at) < startedAt - 5000) continue;
              for (const fn of activityListeners) fn(body);
            }
          }
          if (name === 'members') refreshProfiles();
          if (state.loaded.size === COLLECTIONS.length && state.status !== 'ready') state.status = 'ready';
          bump();
        },
        () => {
          state.loaded.add(name);
          if (state.loaded.size === COLLECTIONS.length) state.status = 'ready';
          bump();
        },
      );
    }
    /* Never hold the console hostage to a slow store. */
    window.setTimeout(() => {
      if (state.status !== 'ready') {
        state.status = 'ready';
        bump();
      }
    }, 6000);
    if (rt.room) {
      try {
        rt.room.onPeers(({ peers }) => {
          state.peers = peers.filter((p) => !p.isMe && p.kind === 'viewer');
          refreshProfiles();
          bump();
        });
      } catch {
        /* presence is a nicety */
      }
    }
    ensureTicker();
    return rt;
  })();
  return bootPromise;
}

/** Who is viewing, as far as the platform can tell. Null outside a viewer. */
export async function detectViewer() {
  await boot();
  if (!rt.user) return null;
  try {
    const me = await rt.user.me();
    const id = me?.id || (await rt.user.id());
    if (!id) return null;
    return { id, name: me?.name || '', avatarUrl: me?.avatarUrl || '', color: me?.color || '', isOwner: Boolean(me?.isOwner) };
  } catch {
    return null;
  }
}

async function refreshProfiles() {
  if (!rt?.user?.profiles) return;
  const ids = new Set();
  for (const m of state.docs.members.values()) if (m?.userId) ids.add(m.userId);
  for (const p of state.peers) if (p.by) ids.add(p.by);
  const missing = [...ids].filter((id) => !state.profiles.has(id));
  if (!missing.length) return;
  try {
    const found = await rt.user.profiles(missing);
    for (const [id, profile] of Object.entries(found || {})) state.profiles.set(id, profile);
    bump();
  } catch {
    /* names fall back to "Teammate" */
  }
}

/* ── Session ───────────────────────────────────────────────────────────── */
const SESSION_KEY = 'corvane.session';
export function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}
export async function signIn({ viewer, name, email, title }) {
  await boot();
  const userId = viewer?.id || `local-${hashString(String(email || name).toLowerCase()).toString(36)}`;
  const ref = `u:${userId}`;
  const existing = state.docs.members.get(safeId(ref));
  const session = { ref, userId, name: viewer?.name || name, email: email || '', title: title || existing?.title || 'Security engineer', avatarUrl: viewer?.avatarUrl || '' };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* this visit only */
  }
  state.me = session;
  const member = {
    ref,
    userId,
    role: existing?.role || 'admin',
    title: session.title,
    team: existing?.team || 'Security Operations',
    joinedAt: existing?.joinedAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    /* Outside a viewer there is no profile service, so the name typed at
       sign-in is the only one there is. */
    ...(viewer ? {} : { localName: name, localEmail: email || '' }),
  };
  await safeWrite('members', safeId(ref), member);
  if (!existing) {
    await logActivity({ verb: 'joined', target: { kind: 'member', id: ref }, text: 'the workspace' });
  }
  bump();
  return session;
}
export function restoreSession(session) {
  state.me = session;
  bump();
}
export function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing kept */
  }
  state.me = null;
  bump();
}
export function setPresence(patch) {
  try {
    rt?.room?.presence(patch);
  } catch {
    /* presence is a nicety */
  }
}

/* ── Writes ────────────────────────────────────────────────────────────── */
let writeErrorHandler = null;
export function onWriteError(fn) {
  writeErrorHandler = fn;
}
async function safeWrite(collection, id, body) {
  /* Apply locally first so the screen answers at once. */
  const map = new Map(state.docs[collection]);
  if (body === null) map.delete(id);
  else map.set(id, body);
  state.docs[collection] = map;
  bump();
  try {
    if (body === null) await rt.db.doc(collection, id).delete();
    else await rt.db.doc(collection, id).set(body);
    return true;
  } catch (error) {
    writeErrorHandler?.(error);
    return false;
  }
}
const nowIso = () => new Date().toISOString();
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const meRef = () => state.me?.ref || 'system';

async function patchOverlay(kind, id, patch) {
  const key = safeId(`${kind}:${id}`);
  const current = state.docs.ovr.get(key) || {};
  return safeWrite('ovr', key, { ...current, ...patch, kind, targetId: id, updatedAt: nowIso(), updatedBy: meRef() });
}

async function logActivity({ verb, target, text, recipients = [], severity }) {
  const id = newId('a');
  return safeWrite('activity', id, { id, at: nowIso(), actor: meRef(), verb, target, text, recipients, severity: severity || null });
}

/* ── The merged view ───────────────────────────────────────────────────── */
let worldCache = { key: '', world: null };
function worldFor(extraConns) {
  const key = extraConns.map((c) => c.id).join('|');
  if (worldCache.key !== key || !worldCache.world) worldCache = { key, world: buildWorld(extraConns) };
  return worldCache.world;
}

const values = (map) => [...map.values()].filter(Boolean);
const overlay = (kind, id) => state.docs.ovr.get(safeId(`${kind}:${id}`));

const RUN_STEP_MS = 4500;
function runProgress(run, playbook, now) {
  const steps = run.kind === 'sync' ? run.steps : playbook?.steps || [];
  if (run.status === 'cancelled') return { status: 'cancelled', step: 0, steps };
  if (run.seed) return { status: run.status, step: steps.length, steps, finishedAt: run.startedAt };
  if (playbook?.approval && !run.approvedBy) return { status: 'awaiting_approval', step: 0, steps };
  const from = Date.parse(run.approvedAt || run.startedAt);
  const per = run.kind === 'sync' ? 3000 : RUN_STEP_MS;
  const elapsed = now - from;
  const step = Math.min(steps.length, Math.floor(elapsed / per));
  if (step >= steps.length) return { status: 'succeeded', step: steps.length, steps, finishedAt: new Date(from + steps.length * per).toISOString() };
  return { status: elapsed < 0 ? 'queued' : 'running', step, steps, fraction: (elapsed % per) / per };
}

export function getView() {
  if (cachedView && cachedVersion === state.version) return cachedView;
  const now = state.now;
  const conDocs = values(state.docs.conns);
  const world = worldFor(conDocs.map((c) => ({ ...c, size: c.size ?? connectionSize(c.provider) })));

  /* Connections */
  const connections = world.connections
    .concat(conDocs.filter((c) => !world.connections.some((w) => w.id === c.id)).map((c) => buildConnection(c)))
    .map((c) => ({ ...c, ...(overlay('connection', c.id) || {}) }))
    .filter((c) => !c.removed);
  const liveConn = new Set(connections.map((c) => c.id));

  /* Runs first: finished runs change what everything else looks like. */
  const runs = [...world.runs, ...values(state.docs.runs)]
    .map((r) => {
      const playbook = PLAYBOOKS.find((p) => p.id === r.playbook);
      return { ...r, playbookMeta: playbook || null, ...runProgress(r, playbook, now) };
    })
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const effects = new Map(); // identityId -> [playbook ids]
  let lastSync = null;
  for (const r of runs) {
    if (r.status !== 'succeeded' || r.seed) continue;
    if (r.kind === 'sync') {
      for (const id of r.connections || []) lastSync = { ...(lastSync || {}), [id]: r.finishedAt };
      continue;
    }
    for (const t of r.targets || []) effects.set(t, [...(effects.get(t) || []), { playbook: r.playbook, at: r.finishedAt, run: r.id }]);
  }
  for (const c of connections) if (lastSync?.[c.id]) c.lastSyncAt = lastSync[c.id];
  const syncing = runs.find((r) => r.kind === 'sync' && (r.status === 'running' || r.status === 'queued'));
  for (const c of connections) if (syncing?.connections?.includes(c.id)) c.syncing = true;

  /* Identities and credentials */
  const credentials = world.credentials
    .filter((c) => liveConn.has(world.identities.find((i) => i.id === c.identityId)?.connectionId))
    .map((c) => {
      let next = { ...c, ...(overlay('credential', c.id) || {}) };
      for (const e of effects.get(c.identityId) || []) {
        if (['pb-rotate-aws-key', 'pb-rotate-azure-secret', 'pb-approle-ttl', 'pb-bb-token'].includes(e.playbook)) {
          next = { ...next, createdAt: e.at, ageDays: 0, status: 'active', rotatedAt: e.at, expiresAt: next.expiresAt ? new Date(Date.parse(e.at) + 180 * 864e5).toISOString() : next.expiresAt };
        }
        if (['pb-revoke-pat', 'pb-revoke-vault-token', 'pb-disable'].includes(e.playbook)) next = { ...next, status: 'revoked', revokedAt: e.at };
        if (e.playbook === 'pb-cleanup' && next.status === 'expired') next = { ...next, status: 'deleted' };
      }
      return next;
    })
    .filter((c) => c.status !== 'deleted');
  const credById = new Map(credentials.map((c) => [c.id, c]));

  const identities = world.identities
    .filter((i) => liveConn.has(i.connectionId))
    .map((i) => {
      let next = { ...i, ...(overlay('identity', i.id) || {}) };
      for (const e of effects.get(i.id) || []) {
        if (e.playbook === 'pb-disable') next = { ...next, status: 'disabled', disabledAt: e.at };
        if (e.playbook === 'pb-rightsize') next = { ...next, permissions: { ...next.permissions, adminLike: false, granted: Math.max(next.permissions.used + 2, Math.round(next.permissions.used * 1.15)), scopes: next.permissions.scopes.filter((s) => !/Administrator|Owner|admin|root/.test(s)) } };
      }
      return next;
    });
  const idById = new Map(identities.map((i) => [i.id, i]));

  /* Findings: a finished remediation resolves what it was run for. */
  const findings = world.findings
    .filter((f) => idById.has(f.identityId))
    .map((f) => {
      let next = { ...f, ...(overlay('finding', f.id) || {}) };
      const fix = (effects.get(f.identityId) || []).find((e) => e.playbook === f.playbook || (e.playbook === 'pb-disable' && f.ruleId === 'NHI-003'));
      if (fix && next.status !== 'resolved') next = { ...next, status: 'resolved', resolvedAt: fix.at, resolvedBy: 'remediation', resolvedRun: fix.run };
      if (f.ruleId === 'NHI-004' || f.ruleId === 'NHI-005') {
        const owner = idById.get(f.identityId)?.owner;
        if (owner && !FORMER.some((p) => p.id === owner) && overlay('identity', f.identityId)?.owner && next.status !== 'resolved') next = { ...next, status: 'resolved', resolvedAt: overlay('identity', f.identityId)?.updatedAt, resolvedBy: 'owner assigned' };
      }
      return next;
    });
  const findingById = new Map(findings.map((f) => [f.id, f]));

  const detections = world.detections.filter((d) => idById.has(d.identityId)).map((d) => ({ ...d, ...(overlay('detection', d.id) || {}) }));
  const detById = new Map(detections.map((d) => [d.id, d]));
  const exposures = world.exposures.map((x) => ({ ...x, ...(overlay('exposure', x.id) || {}) }));
  const expById = new Map(exposures.map((x) => [x.id, x]));

  /* Tickets */
  const tickets = [...world.tickets.map((t) => ({ ...t, ...(overlay('ticket', t.key) || {}) })), ...values(state.docs.tickets)].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const ticketByKey = new Map(tickets.map((t) => [t.key, t]));
  for (const t of tickets) {
    for (const l of t.links || []) {
      const rec = l.kind === 'finding' ? findingById.get(l.id) : l.kind === 'detection' ? detById.get(l.id) : l.kind === 'exposure' ? expById.get(l.id) : null;
      if (rec && !rec.ticketKey) rec.ticketKey = t.key;
    }
  }

  /* Comments by record */
  const commentsByTarget = new Map();
  for (const c of values(state.docs.comments).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const list = commentsByTarget.get(c.target) || [];
    list.push(c);
    commentsByTarget.set(c.target, list);
  }

  const activity = [...world.activity, ...values(state.docs.activity)].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const mail = [...world.mail, ...values(state.docs.mail)].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const rules = [...world.rules.map((r) => ({ ...r, ...(overlay('rule', r.id) || {}) })), ...values(state.docs.rules)].filter((r) => !r.deleted);

  /* People: the team, people who have left, and everyone who has signed in. */
  const members = values(state.docs.members).map((m) => {
    const profile = state.profiles.get(m.userId);
    const isMe = m.ref === state.me?.ref;
    const name = profile?.name || (isMe ? state.me?.name : '') || m.localName || 'Teammate';
    return { ref: m.ref, id: m.ref, name, title: m.title, team: m.team, role: m.role, email: m.localEmail || profile?.email || '', avatarUrl: profile?.avatarUrl || (isMe ? state.me?.avatarUrl : '') || '', color: profile?.color || '', joinedAt: m.joinedAt, lastSeenAt: m.lastSeenAt, isViewer: true, isMe };
  });
  const people = [
    ...members,
    ...PEOPLE.map((p) => ({ ...p, ref: p.id, ...(overlay('person', p.id) || {}) })),
  ];
  const former = FORMER.map((p) => ({ ...p, ref: p.id, former: true }));
  const personByRef = new Map([...people, ...former].map((p) => [p.ref, p]));

  /* Fleet posture score: the history, with today's value from open findings. */
  const open = findings.filter((f) => f.status === 'open' || f.status === 'in_progress');
  const weight = { critical: 6, high: 3, medium: 1.2, low: 0.3 };
  const penalty = open.reduce((s, f) => s + weight[f.severity], 0);
  const score = Math.max(20, Math.min(98, Math.round(100 - penalty / identities.length * 18)));
  /* The history is shifted to end where today's findings put the score, so the trend and the number agree. */
  const shift = score - world.scoreHistory.at(-2).score;
  const scoreHistory = [...world.scoreHistory.slice(0, -1).map((d) => ({ ...d, score: Math.max(15, Math.min(99, d.score + shift)) })), { date: world.scoreHistory.at(-1).date, score }];

  cachedView = {
    version: state.version,
    now,
    mode: state.mode,
    status: state.status,
    me: state.me,
    peers: state.peers.map((p) => ({ ...p, profile: state.profiles.get(p.by) })),
    connections,
    connById: new Map(connections.map((c) => [c.id, c])),
    identities,
    idById,
    credentials,
    credById,
    findings,
    findingById,
    detections,
    detById,
    exposures,
    expById,
    tickets,
    ticketByKey,
    commentsByTarget,
    activity,
    mail,
    runs,
    rules,
    people,
    personByRef,
    score,
    scoreHistory,
  };
  cachedVersion = state.version;
  return cachedView;
}

export function useView(selector = (v) => v) {
  const view = useSyncExternalStore(subscribe, getView);
  return selector(view);
}

/* ── Helpers used by screens ───────────────────────────────────────────── */
export function personName(ref, view = getView()) {
  if (!ref) return 'Unassigned';
  if (ref === 'system') return 'Corvane';
  return view.personByRef.get(ref)?.name || 'Teammate';
}
export function recordLabel(target, view = getView()) {
  if (!target) return '';
  const { kind, id } = target;
  if (kind === 'finding') return view.findingById.get(id)?.title || id;
  if (kind === 'detection') return view.detById.get(id)?.title || id;
  if (kind === 'exposure') { const x = view.expById.get(id); return x ? `${x.repo} · ${x.file}` : id; }
  if (kind === 'ticket') return `${id} ${view.ticketByKey.get(id)?.summary || ''}`.trim();
  if (kind === 'identity') return view.idById.get(id)?.name || id;
  if (kind === 'connection') return view.connById.get(id)?.name || id;
  return id;
}
export function recordPath(target) {
  if (!target) return '/overview';
  const { kind, id } = target;
  return {
    finding: `/findings?open=${id}`,
    detection: `/detections?open=${id}`,
    exposure: `/exposure?open=${id}`,
    ticket: `/tickets?open=${id}`,
    identity: `/identities/${id}`,
    connection: '/integrations',
    run: '/remediation',
    rule: '/automations',
    member: '/settings/team',
    mail: `/inbox?open=${id}`,
  }[kind] || '/overview';
}

/* Who hears about a record: its owner, assignee and the people on its ticket. */
function stakeholders(target, extra = []) {
  const view = getView();
  const refs = new Set(extra.filter(Boolean));
  if (target?.kind === 'finding') { const f = view.findingById.get(target.id); refs.add(f?.assignee); refs.add(view.idById.get(f?.identityId)?.owner); }
  if (target?.kind === 'detection') refs.add(view.detById.get(target.id)?.assignee);
  if (target?.kind === 'ticket') { const t = view.ticketByKey.get(target.id); refs.add(t?.assignee); refs.add(t?.reporter); }
  refs.delete(meRef());
  refs.delete(undefined);
  refs.delete(null);
  return [...refs];
}

/* ── Actions ───────────────────────────────────────────────────────────── */
const STATUS_TEXT = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', risk_accepted: 'Risk accepted', new: 'New', investigating: 'Investigating', false_positive: 'False positive', revoked: 'Revoked' };

export const actions = {
  async updateFinding(id, patch) {
    const f = getView().findingById.get(id);
    await patchOverlay('finding', id, patch);
    if (patch.status && patch.status !== f?.status) await logActivity({ verb: 'set', target: { kind: 'finding', id }, text: `${f?.title || id} to ${STATUS_TEXT[patch.status] || patch.status}`, recipients: stakeholders({ kind: 'finding', id }) });
    if ('assignee' in patch && patch.assignee !== f?.assignee) {
      await logActivity({ verb: 'assigned', target: { kind: 'finding', id }, text: `${f?.title || id} to ${personName(patch.assignee)}`, recipients: [patch.assignee].filter((r) => r && r !== meRef()) });
      if (patch.assignee && patch.assignee !== meRef()) await sendSystemMail({ to: [patch.assignee], subject: `${personName(meRef())} assigned you a ${f?.severity || ''} finding`, body: `${f?.title}\n\nIdentity: ${getView().idById.get(f?.identityId)?.name}\nSeverity: ${f?.severity}\n\nOpen it in the console to see the evidence and the fix.`, link: { kind: 'finding', id }, kind: 'assignment' });
    }
  },
  async updateDetection(id, patch) {
    const d = getView().detById.get(id);
    await patchOverlay('detection', id, patch);
    if (patch.status && patch.status !== d?.status) await logActivity({ verb: 'set', target: { kind: 'detection', id }, text: `${d?.title || id} to ${STATUS_TEXT[patch.status] || patch.status}`, recipients: stakeholders({ kind: 'detection', id }), severity: d?.severity });
    if ('assignee' in patch && patch.assignee !== d?.assignee) {
      await logActivity({ verb: 'assigned', target: { kind: 'detection', id }, text: `${d?.title || id} to ${personName(patch.assignee)}`, recipients: [patch.assignee].filter((r) => r && r !== meRef()) });
      if (patch.assignee && patch.assignee !== meRef()) await sendSystemMail({ to: [patch.assignee], subject: `[${(d?.severity || '').toUpperCase()}] You're on detection ${id}`, body: `${d?.title}\n\nObserved: ${d?.observed}\nBaseline: ${d?.baseline}`, link: { kind: 'detection', id }, kind: 'assignment' });
    }
  },
  async updateExposure(id, patch, verbText) {
    const x = getView().expById.get(id);
    await patchOverlay('exposure', id, patch);
    if (verbText) await logActivity({ verb: verbText.verb, target: { kind: 'exposure', id }, text: verbText.text || `${x?.repo} · ${x?.file}` });
  },
  async updateIdentity(id, patch, note) {
    const i = getView().idById.get(id);
    await patchOverlay('identity', id, patch);
    if ('owner' in patch && patch.owner !== i?.owner) {
      await logActivity({ verb: 'made', target: { kind: 'identity', id }, text: `${personName(patch.owner)} owner of ${i?.name}`, recipients: [patch.owner].filter((r) => r !== meRef()) });
      if (patch.owner && patch.owner !== meRef()) await sendSystemMail({ to: [patch.owner], subject: `You now own ${i?.name}`, body: `${personName(meRef())} made you the accountable owner of ${i?.name} (${PROVIDERS[i?.provider]?.name}).\n\nOwners are asked to confirm access every quarter and are told about findings on this identity.`, link: { kind: 'identity', id }, kind: 'assignment' });
    } else if (note) {
      await logActivity({ verb: note.verb, target: { kind: 'identity', id }, text: note.text || i?.name });
    }
  },
  async updateCredential(id, patch, note) {
    await patchOverlay('credential', id, patch);
    if (note) await logActivity({ verb: note.verb, target: { kind: 'identity', id: getView().credById.get(id)?.identityId }, text: note.text });
  },

  async createTicket({ summary, description = '', priority = 'Medium', type = 'Task', assignee = null, links = [], labels = ['nhi'], auto = false }) {
    const view = getView();
    const max = view.tickets.reduce((m, t) => Math.max(m, Number(String(t.key).split('-')[1]) || 0), 1440);
    const key = `${ORG.jiraProject.key}-${max + 1 + (hashString(meRef() + Date.now()) % 2)}`;
    const id = newId('t');
    const ticket = { id, key, summary, description, priority, type, status: 'To Do', assignee, reporter: meRef(), links, labels, createdAt: nowIso(), updatedAt: nowIso(), auto };
    await safeWrite('tickets', id, ticket);
    for (const l of links) {
      if (l.kind === 'finding') await patchOverlay('finding', l.id, { ticketKey: key, ...(assignee ? { assignee } : {}) });
      if (l.kind === 'detection') await patchOverlay('detection', l.id, { ticketKey: key });
      if (l.kind === 'exposure') await patchOverlay('exposure', l.id, { ticketKey: key });
    }
    await logActivity({ verb: 'created', target: { kind: 'ticket', id: key }, text: `${key} ${summary}`, recipients: [assignee].filter((r) => r && r !== meRef()) });
    if (assignee) await jiraMail(ticket, assignee, `${auto ? 'An automation' : personName(meRef())} assigned ${key} to you`);
    return key;
  },
  async updateTicket(key, patch) {
    const view = getView();
    const t = view.ticketByKey.get(key);
    if (!t) return;
    const body = { ...patch, updatedAt: nowIso() };
    if (t.seed) await patchOverlay('ticket', key, body);
    else await safeWrite('tickets', t.id, { ...state.docs.tickets.get(t.id), ...body });
    if (patch.status && patch.status !== t.status) {
      await logActivity({ verb: 'moved', target: { kind: 'ticket', id: key }, text: `${key} to ${patch.status}`, recipients: stakeholders({ kind: 'ticket', id: key }) });
      for (const ref of stakeholders({ kind: 'ticket', id: key })) await jiraMail({ ...t, ...patch }, ref, `${personName(meRef())} moved ${key} to ${patch.status}`);
      /* Done in Jira closes the finding it was raised for. */
      if (patch.status === 'Done') for (const l of t.links || []) {
        if (l.kind === 'finding') await patchOverlay('finding', l.id, { status: 'resolved', resolvedAt: nowIso(), resolvedBy: key });
        if (l.kind === 'detection') await patchOverlay('detection', l.id, { status: 'resolved' });
        if (l.kind === 'exposure') await patchOverlay('exposure', l.id, { status: 'resolved' });
      }
      if (patch.status === 'In Progress') for (const l of t.links || []) if (l.kind === 'finding' && view.findingById.get(l.id)?.status === 'open') await patchOverlay('finding', l.id, { status: 'in_progress' });
    }
    if ('assignee' in patch && patch.assignee !== t.assignee) {
      await logActivity({ verb: 'assigned', target: { kind: 'ticket', id: key }, text: `${key} to ${personName(patch.assignee)}`, recipients: [patch.assignee].filter((r) => r && r !== meRef()) });
      if (patch.assignee && patch.assignee !== meRef()) await jiraMail({ ...t, ...patch }, patch.assignee, `${personName(meRef())} assigned ${key} to you`);
    }
    if (patch.priority && patch.priority !== t.priority) await logActivity({ verb: 'changed', target: { kind: 'ticket', id: key }, text: `${key} priority to ${patch.priority}` });
  },

  async addComment(target, body) {
    const id = newId('c');
    const view = getView();
    const mentions = view.people.filter((p) => body.includes(`@${p.name}`)).map((p) => p.ref);
    await safeWrite('comments', id, { id, target: `${target.kind}:${target.id}`, body, author: meRef(), at: nowIso(), mentions });
    await logActivity({ verb: 'commented on', target, text: recordLabel(target), recipients: [...new Set([...stakeholders(target), ...mentions])].filter((r) => r !== meRef()) });
    for (const ref of mentions) if (ref !== meRef()) await sendSystemMail({ to: [ref], subject: `${personName(meRef())} mentioned you on ${recordLabel(target)}`, body: `"${body}"`, link: target, kind: 'mention' });
  },

  async sendMail({ to, cc = [], subject, body, link = null }) {
    const id = newId('m');
    await safeWrite('mail', id, { id, at: nowIso(), from: meRef(), to, cc, subject, body, link, kind: 'message' });
    await logActivity({ verb: 'emailed', target: link || { kind: 'mail', id }, text: `${to.map((r) => (r.includes('@') ? r : personName(r))).join(', ')}: ${subject}`, recipients: to.filter((r) => !r.includes('@')) });
    return id;
  },

  async startRun(playbookId, targets, { reason = '' } = {}) {
    const pb = PLAYBOOKS.find((p) => p.id === playbookId);
    const id = newId('r');
    await safeWrite('runs', id, { id, playbook: playbookId, targets, startedBy: meRef(), startedAt: nowIso(), reason, status: 'started' });
    const names = targets.map((t) => getView().idById.get(t)?.name).filter(Boolean);
    await logActivity({ verb: pb?.approval ? 'requested approval for' : 'started', target: { kind: 'run', id }, text: `${pb?.title} on ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` and ${names.length - 2} more` : ''}` });
    if (pb?.approval) {
      const approvers = getView().people.filter((p) => p.role === 'admin' && p.ref !== meRef()).slice(0, 3).map((p) => p.ref);
      await sendSystemMail({ to: approvers, subject: `Approval needed: ${pb.title}`, body: `${personName(meRef())} wants to run "${pb.title}" on ${names.join(', ')}.\n\n${reason ? `Reason: ${reason}\n\n` : ''}Steps:\n${pb.steps.map((s, k) => `${k + 1}. ${s}`).join('\n')}`, link: { kind: 'run', id }, kind: 'approval' });
    }
    ensureTicker();
    return id;
  },
  async approveRun(id) {
    const run = state.docs.runs.get(id);
    if (!run) return;
    await safeWrite('runs', id, { ...run, approvedBy: meRef(), approvedAt: nowIso() });
    await logActivity({ verb: 'approved', target: { kind: 'run', id }, text: PLAYBOOKS.find((p) => p.id === run.playbook)?.title, recipients: [run.startedBy].filter((r) => r !== meRef()) });
    ensureTicker();
  },
  async cancelRun(id) {
    const run = state.docs.runs.get(id);
    if (!run) return;
    await safeWrite('runs', id, { ...run, status: 'cancelled', cancelledBy: meRef() });
    await logActivity({ verb: 'cancelled', target: { kind: 'run', id }, text: PLAYBOOKS.find((p) => p.id === run.playbook)?.title });
  },

  async startSync(connectionIds) {
    const view = getView();
    const ids = connectionIds?.length ? connectionIds : view.connections.filter((c) => PROVIDERS[c.provider].kind !== 'workflow' && c.status !== 'paused').map((c) => c.id);
    const id = newId('sync');
    const steps = ids.map((cid) => `Read ${view.connById.get(cid)?.name} (${PROVIDERS[view.connById.get(cid)?.provider]?.short})`).concat(['Score posture', 'Compare behaviour to baselines']);
    await safeWrite('runs', id, { id, kind: 'sync', connections: ids, steps, startedBy: meRef(), startedAt: nowIso() });
    await logActivity({ verb: 'started', target: { kind: 'run', id }, text: `a sync of ${ids.length} connection${ids.length === 1 ? '' : 's'}` });
    ensureTicker();
    return id;
  },

  async connect(provider, form) {
    const id = `c-${provider}-${Date.now().toString(36)}`;
    const conn = { id, provider, name: form.name, locator: form.locator, env: form.env || 'prod', regions: form.regions || [], tenant: form.tenant || null, size: connectionSize(provider), status: 'healthy', connectedAt: nowIso(), connectedBy: meRef(), lastSyncAt: nowIso(), details: form.details || {} };
    await safeWrite('conns', id, conn);
    await logActivity({ verb: 'connected', target: { kind: 'connection', id }, text: `${PROVIDERS[provider].short} ${PROVIDERS[provider].unit} ${form.name}` });
    return id;
  },
  async updateConnection(id, patch, note) {
    if (state.docs.conns.has(id)) await safeWrite('conns', id, { ...state.docs.conns.get(id), ...patch });
    else await patchOverlay('connection', id, patch);
    if (note) await logActivity({ verb: note.verb, target: { kind: 'connection', id }, text: note.text });
  },

  async saveRule(rule) {
    const view = getView();
    const existing = view.rules.find((r) => r.id === rule.id);
    if (existing?.seed) await patchOverlay('rule', rule.id, rule);
    else {
      const id = rule.id || newId('rule');
      await safeWrite('rules', id, { ...rule, id, createdBy: rule.createdBy || meRef(), updatedAt: nowIso() });
    }
    await logActivity({ verb: existing ? 'updated' : 'created', target: { kind: 'rule', id: rule.id }, text: `automation "${rule.name}"` });
  },
  async deleteRule(id) {
    const rule = getView().rules.find((r) => r.id === id);
    if (rule?.seed) await patchOverlay('rule', id, { deleted: true });
    else await safeWrite('rules', id, null);
    await logActivity({ verb: 'deleted', target: { kind: 'rule', id }, text: `automation "${rule?.name}"` });
  },
  /* Runs a rule over what is open now: opens Jira issues and sends mail. */
  async runRule(id) {
    const view = getView();
    const rule = view.rules.find((r) => r.id === id);
    if (!rule) return { tickets: 0, mails: 0 };
    const items = matchRule(rule, view).filter((it) => !it.record.ticketKey).slice(0, 5);
    let tickets = 0;
    let mails = 0;
    for (const it of items) {
      if (rule.actions?.jira) {
        await actions.createTicket({ summary: it.title, priority: rule.actions.jira.priority || 'High', type: it.kind === 'finding' ? 'Task' : 'Incident', links: [{ kind: it.kind, id: it.record.id }], description: `Raised by automation "${rule.name}".`, auto: true });
        tickets += 1;
      }
      if (rule.actions?.email?.length) {
        const to = rule.actions.email.flatMap((e) => (e === 'owner' ? [view.idById.get(it.record.identityId)?.owner].filter(Boolean) : e === 'committer' ? [] : [e]));
        if (to.length) {
          await sendSystemMail({ to, subject: `[${it.record.severity?.toUpperCase()}] ${it.title}`, body: `${it.title}\n\nIdentity: ${view.idById.get(it.record.identityId)?.name || '-'}\nSent by automation "${rule.name}".`, link: { kind: it.kind, id: it.record.id }, kind: 'alert' });
          mails += 1;
        }
      }
    }
    await logActivity({ verb: 'ran', target: { kind: 'rule', id }, text: `automation "${rule.name}": ${tickets} issue${tickets === 1 ? '' : 's'}, ${mails} email${mails === 1 ? '' : 's'}` });
    return { tickets, mails, matched: items.length };
  },

  async setMember(ref, patch) {
    const key = safeId(ref);
    const current = state.docs.members.get(key);
    if (current) {
      await safeWrite('members', key, { ...current, ...patch });
      await logActivity({ verb: 'updated', target: { kind: 'member', id: ref }, text: `${personName(ref)}${patch.role ? ` to ${patch.role}` : ''}`, recipients: [ref].filter((r) => r !== meRef()) });
    } else {
      await patchOverlay('person', ref, patch);
      await logActivity({ verb: 'updated', target: { kind: 'member', id: ref }, text: `${personName(ref)}${patch.role ? ` to ${patch.role}` : ''}` });
    }
  },
  async touchMember() {
    const key = safeId(meRef());
    const current = state.docs.members.get(key);
    if (current) await safeWrite('members', key, { ...current, lastSeenAt: nowIso() });
  },
};

export function matchRule(rule, view = getView()) {
  const w = rule.when || {};
  const out = [];
  const sevOk = (s) => !w.severity?.length || w.severity.includes(s);
  const envOk = (identityId) => !w.environment?.length || w.environment.includes(view.idById.get(identityId)?.environment);
  const provOk = (p) => !w.providers?.length || w.providers.includes(p);
  if (!w.kinds || w.kinds.includes('finding')) for (const f of view.findings) if ((f.status === 'open') && sevOk(f.severity) && envOk(f.identityId) && provOk(f.provider) && (!w.rules?.length || w.rules.includes(f.ruleId))) out.push({ kind: 'finding', record: f, title: `${f.title}: ${view.idById.get(f.identityId)?.name}` });
  if (!w.rules?.length && (!w.kinds || w.kinds.includes('detection'))) for (const d of view.detections) if (d.status === 'new' && sevOk(d.severity) && envOk(d.identityId) && provOk(d.provider)) out.push({ kind: 'detection', record: d, title: d.title });
  if (!w.rules?.length && (!w.kinds || w.kinds.includes('exposure'))) for (const x of view.exposures) if (x.status === 'open' && provOk(x.provider)) out.push({ kind: 'exposure', record: { ...x, severity: x.visibility === 'public' ? 'critical' : 'high' }, title: `Secret exposed in ${x.repo}` });
  return out;
}

async function sendSystemMail({ to, subject, body, link, kind }) {
  const id = newId('m');
  await safeWrite('mail', id, { id, at: nowIso(), from: ORG.mailFrom, to, cc: [], subject, body, link, kind, triggeredBy: meRef() });
}
async function jiraMail(ticket, ref, headline) {
  const id = newId('m');
  await safeWrite('mail', id, {
    id,
    at: nowIso(),
    from: `jira@${ORG.jiraSite}`,
    to: [ref],
    cc: [],
    subject: `[JIRA] ${headline}`,
    body: `${ticket.key} ${ticket.summary}\n\nStatus: ${ticket.status}\nPriority: ${ticket.priority}\nAssignee: ${personName(ticket.assignee)}\nReporter: ${personName(ticket.reporter)}`,
    link: { kind: 'ticket', id: ticket.key },
    kind: 'jira',
    triggeredBy: meRef(),
  });
}

export { SEV_ORDER, PLAYBOOKS, RULES, ANCHOR };
