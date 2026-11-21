import axios from 'axios';
import { ApiError, describe } from './http';
import { usePayloadCrypto } from './payloadCrypto';
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
/* First, so every other interceptor sees plain requests and responses. */
usePayloadCrypto(client);
/* Session renewal goes around the client's 401 handling, not around the encryption. */
const refreshClient = usePayloadCrypto(axios.create());

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
      const res = await refreshClient.post(`${client.defaults.baseURL}/api/v1/refresh`, null, {
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
    /* Too many requests on a read: the limit refills in about a second, so
       wait the time the server names (at most 4 s) and ask once more instead
       of showing an error for a spike. */
    if (status === 429 && config && !config._rateRetried && String(config.method || 'get').toLowerCase() === 'get' && !AUTH_PATHS.test(config.url || '')) {
      config._rateRetried = true;
      const wait = Math.min(4, Math.max(1, Number(error.response.headers?.['retry-after']) || 1));
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      return client.request(config);
    }
    return Promise.reject(describe(error));
  },
);

/*
 * Identical GETs in flight at the same time share one request. A screen often
 * mounts several panels that ask for the same thing (the activity summary and
 * the event filters both read the window's totals and source IPs), and each
 * used to reach the database on its own. Each caller keeps its own abort
 * signal: the shared request is cancelled only when every caller has gone.
 * Callers after the first get their own copy of the data, so one panel
 * changing a list in place cannot change another's. Nothing is kept after the
 * response, so a refetch always asks again.
 */
const rawGet = client.get.bind(client);
const sharedGets = new Map();

function sharedKey(url, config) {
  return `${url}|${JSON.stringify(config?.params ?? {})}|${config?.responseType ?? ''}`;
}

client.get = (url, config = {}) => {
  /* Downloads and explicit opt-outs go straight through. */
  if (config.responseType === 'blob' || config.share === false) return rawGet(url, config);
  const key = sharedKey(url, config);
  let entry = sharedGets.get(key);
  if (!entry) {
    const controller = new AbortController();
    const { signal: _ignored, share: _share, ...rest } = config;
    entry = { controller, users: 0, served: 0, promise: null };
    entry.promise = rawGet(url, { ...rest, signal: controller.signal }).finally(() => {
      if (sharedGets.get(key) === entry) sharedGets.delete(key);
    });
    /* Every caller may have left (aborted) before it settles; the rejection
       then has no listener and must not surface as an unhandled error. */
    entry.promise.catch(() => {});
    sharedGets.set(key, entry);
  }
  entry.users += 1;
  const own = config.signal;
  return new Promise((resolve, reject) => {
    let done = false;
    const leave = () => {
      if (done) return;
      done = true;
      entry.users -= 1;
      if (entry.users === 0) {
        entry.controller.abort();
        if (sharedGets.get(key) === entry) sharedGets.delete(key);
      }
      reject(new axios.CanceledError());
    };
    if (own?.aborted) {
      leave();
      return;
    }
    own?.addEventListener('abort', leave, { once: true });
    entry.promise.then(
      (res) => {
        if (done) return;
        done = true;
        own?.removeEventListener('abort', leave);
        const first = entry.served === 0;
        entry.served += 1;
        resolve(first ? res : { ...res, data: structuredClone(res.data) });
      },
      (err) => {
        if (done) return;
        done = true;
        own?.removeEventListener('abort', leave);
        reject(err);
      },
    );
  });
};

export default client;
