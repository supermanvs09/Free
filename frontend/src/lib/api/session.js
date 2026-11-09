import { TOKEN_KEY, USER_KEY } from './http';

/**
 * Where the signed-in session is kept.
 *
 *   access token + profile   this tab's sessionStorage (short-lived, 15 min)
 *   refresh token            an HttpOnly, Secure, SameSite=Strict cookie the
 *                            server sets; no script on the page can read it
 *
 * Nothing that grants access is written to localStorage. A new tab has no
 * access token of its own and gets one by renewing through the cookie (see
 * client.js `renewSession`). Signing out in one tab ends the session for all
 * of them: the cookie is shared, and the other tabs are told (see
 * `subscribeSignOut`).
 */
function tabStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function read(key) {
  try {
    return tabStore()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function readToken() {
  return read(TOKEN_KEY);
}

export function readStoredUser() {
  try {
    const raw = read(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSession({ token, user }) {
  try {
    const store = tabStore();
    if (token) store?.setItem(TOKEN_KEY, token);
    if (user) store?.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* A private window refuses storage; the session lasts for this page. */
  }
}

/** Refresh the stored profile without touching the token. */
export function writeStoredUser(user) {
  writeSession({ user });
}

/* Clean up what older builds kept browser-wide. */
try {
  for (const key of [TOKEN_KEY, USER_KEY, 'dna.refresh']) localStorage.removeItem(key);
} catch {
  /* nothing kept */
}

const SIGNED_OUT_KEY = 'dna.signedOut';

export function clearSession({ broadcast = true } = {}) {
  try {
    for (const key of [TOKEN_KEY, USER_KEY]) tabStore()?.removeItem(key);
  } catch {
    /* see writeSession */
  }
  if (!broadcast) return;
  try {
    /* A notice only - no token is ever written here. */
    localStorage.setItem(SIGNED_OUT_KEY, String(Date.now()));
    localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* see writeSession */
  }
}

/** Calls `handler` when another tab signs out (the shared session is over). */
export function subscribeSignOut(handler) {
  const onStorage = (event) => {
    if (event.key !== SIGNED_OUT_KEY || !event.newValue) return;
    if (!readToken()) return;
    clearSession({ broadcast: false });
    handler();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/* Last user activity, shared by this browser's tabs (see IdleSessionGuard).
   Signing in starts the clock; signing out removes it. */
const ACTIVITY_KEY = 'dna.lastActivity';

export function readLastActivity() {
  try {
    const value = Number(localStorage.getItem(ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeLastActivity(at = Date.now()) {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    /* storage refused: the tab still tracks its own activity */
  }
}

export function clearLastActivity() {
  try {
    localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    /* nothing kept */
  }
}
