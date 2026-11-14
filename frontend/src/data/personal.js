import { useSyncExternalStore } from 'react';

/*
 * Per-person conveniences kept in this browser only: which mail has been
 * read, when the notification list was last opened. Nobody else needs these.
 */
const KEY = 'corvane.personal';
let data = {};
try {
  data = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
} catch {
  data = {};
}
const listeners = new Set();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* this visit only */
  }
  for (const fn of listeners) fn();
}
const sub = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
let snapshot = { ...data };
const get = () => snapshot;

export function usePersonal() {
  return useSyncExternalStore(sub, get);
}
export function setPersonal(patch) {
  data = { ...data, ...patch };
  snapshot = { ...data };
  save();
}
export function markMailRead(id, read = true) {
  const set = new Set(data.readMail || []);
  if (read) set.add(id);
  else set.delete(id);
  setPersonal({ readMail: [...set].slice(-800) });
}

/* Group addresses everyone on the security team receives. */
export const GROUP_ADDRESSES = ['secops@corvane.io', 'leadership@corvane.io'];

export function isMine(mail, me) {
  if (!me) return false;
  return (mail.to || []).some((r) => r === me.ref || GROUP_ADDRESSES.includes(r) || (me.email && r === me.email)) || (mail.cc || []).includes(me.ref);
}

/* Mail that arrived before someone joined counts as read for them. */
export function unreadMail(view, personal) {
  const joined = view.people.find((p) => p.isMe)?.joinedAt;
  const read = new Set(personal.readMail || []);
  return view.mail.filter((m) => isMine(m, view.me) && !read.has(m.id) && m.from !== view.me?.ref && (!joined || Date.parse(m.at) > Date.parse(joined) - 36 * 3600e3));
}

export function notificationsFor(view) {
  const me = view.me?.ref;
  return view.activity.filter((a) => (a.recipients || []).includes(me) || (a.actor !== me && a.actor !== 'system' && !a.seed) || a.seed);
}
