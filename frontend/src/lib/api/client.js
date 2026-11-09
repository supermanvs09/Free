import axios from 'axios';
import { ApiError, describe } from './http';
import { clearSession, readStoredUser, readToken, writeSession } from './session';

/**
 * One client for the NHI backend, which serves every API on one origin:
 *
 *   /api/v1/ispm/*    posture
 *   /api/v1/genome/*  genome
 *   /api/v1/*         discovery (sign-in, inventory, integrations, exposure ...)
 *
 * The dev server (vite.config.js) and nginx in production proxy /api to it.
 */
const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = readToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  /* The screen a request came from, for the audit log's "Screen" column. */
  if (typeof window !== 'undefined' && !config.headers['X-Console-Screen']) {
    config.headers['X-Console-Screen'] = window.location.pathname.slice(0, 120);
  }
  return config;
});

let unauthorizedHandler = null;
/** Called once the session cannot be renewed: the router shows sign-in. */
export function onSessionExpired(handler) {
  unauthorizedHandler = handler;
}

const AUTH_PATHS = /\/api\/(v1\/)?(auth\/)?(login|refresh|logout)$/;

/**
 * Get a new access token through the refresh cookie. Refresh tokens are single
 * use and the server treats a reused one as theft (it ends every session of
 * that user), so two tabs must never refresh at once: the Web Locks API
 * serialises refreshes across tabs. The cookie is read by the browser when
 * each request starts, so a tab that waited for the lock sends the token the
 * previous tab was just given.
 */
let inflight = null;
/* Resolves the renewed session ({ token, user }), false (no valid session) or null (the service
   could not answer: network, 429, 5xx). Only false ends the session; a
   passing outage must not sign anyone out. */
export function renewSession() {
  const run = async () => {
    try {
      const res = await axios.post(`${client.defaults.baseURL}/api/v1/refresh`, null, {
        timeout: 15000,
        withCredentials: true,
      });
      const data = res?.data?.data;
      if (!data?.token) return false;
      const before = readStoredUser()?.email;
      /* Somebody else signed in in another tab: this tab must not carry on
         showing the previous person's screens with the new person's token. */
      if (before && data.user?.email && before.toLowerCase() !== String(data.user.email).toLowerCase()) {
        clearSession({ broadcast: false });
        writeSession({ token: data.token });
        window.location.reload();
        return data;
      }
      writeSession({ token: data.token });
      return data;
    } catch (err) {
      const status = err?.response?.status;
      return status === 400 || status === 401 ? false : null;
    }
  };
  inflight ??= (
    typeof navigator !== 'undefined' && navigator.locks?.request
      ? navigator.locks.request('nhi.session.refresh', run)
      : run()
  ).finally(() => {
    inflight = null;
  });
  return inflight;
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error?.config;
    const status = error?.response?.status;
    if (status === 401 && config && !config._retried && !AUTH_PATHS.test(config.url || '')) {
      config._retried = true;
      const renewed = await renewSession();
      if (renewed) {
        config.headers.Authorization = `Bearer ${readToken()}`;
        return client.request(config);
      }
      if (renewed === null) {
        return Promise.reject(
          new ApiError({ message: 'Could not renew your session just now. Try again in a moment.', code: 'RENEW_FAILED', retryable: true }),
        );
      }
      clearSession();
      unauthorizedHandler?.();
    }
    return Promise.reject(describe(error));
  },
);

export default client;
