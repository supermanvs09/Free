import { ApiError, describe } from './http';
import { clearSession, readToken, writeSession } from './session';
import { handle } from '../local/server';

/**
 * One client for every API the console reads. It keeps the axios surface the
 * API modules were written against (get / post / put / patch / delete /
 * request, `{ data, status, headers }` responses, ApiError rejections), and
 * answers from the built-in service in src/lib/local, which runs in the
 * browser: no backend, no database.
 *
 * The one thing that does leave the browser is a notification (Gmail via
 * Amazon SES, Jira issues): see src/lib/notify.js and server/notify-relay.mjs.
 */
const LATENCY = Number(import.meta.env.VITE_LOCAL_LATENCY ?? 180);
const TRACE = import.meta.env.VITE_FIELD_TRACE === 'true';

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }));
    });
  });

/* A little jitter so loading states are seen the way they will be in use. */
const jitter = (method) => (LATENCY <= 0 ? 0 : LATENCY * (method === 'get' ? 0.6 : 1.2) + Math.random() * LATENCY * 0.6);

let unauthorizedHandler = null;
/** Called once the session cannot be renewed: the router shows sign-in. */
export function onSessionExpired(handler) {
  unauthorizedHandler = handler;
}

async function request(config) {
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '');
  const token = readToken();
  await wait(jitter(method), config.signal);
  const result = await handle({
    method,
    url,
    params: config.params ?? {},
    body: config.data ?? null,
    headers: { ...(config.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  let data = result.body;
  if (config.responseType === 'blob' && !(data instanceof Blob)) {
    data = new Blob([typeof data === 'string' ? data : JSON.stringify(data)], { type: result.headers?.['content-type'] || 'application/octet-stream' });
  }
  if (TRACE && data && typeof data === 'object' && !(data instanceof Blob)) {
    const { traced } = await import('../local/trace');
    data = traced(data, `${method.toUpperCase()} ${url.replace(/\?.*$/, '')}`);
  }
  const response = { data, status: result.status, headers: result.headers ?? {}, config };
  const ok = config.validateStatus ? config.validateStatus(result.status) : result.status >= 200 && result.status < 300;
  if (ok) return response;

  if (result.status === 401 && !/\/(login|refresh|logout)$/.test(url)) {
    const renewed = await renewSession();
    if (renewed && !config._retried) return request({ ...config, _retried: true });
    clearSession();
    unauthorizedHandler?.();
  }
  throw describe({ response, config });
}

const client = {
  defaults: { baseURL: '' },
  request,
  get: (url, config = {}) => request({ ...config, method: 'get', url }),
  delete: (url, config = {}) => request({ ...config, method: 'delete', url }),
  post: (url, data, config = {}) => request({ ...config, method: 'post', url, data }),
  put: (url, data, config = {}) => request({ ...config, method: 'put', url, data }),
  patch: (url, data, config = {}) => request({ ...config, method: 'patch', url, data }),
};

/**
 * A new tab picks the signed-in session up from the built-in service (the
 * equivalent of the refresh cookie). Resolves { token, user } or false.
 */
export async function renewSession() {
  try {
    const result = await handle({ method: 'post', url: '/api/v1/refresh', params: {}, body: null, headers: {} });
    const data = result.body?.data;
    if (result.status !== 200 || !data?.token) return false;
    writeSession({ token: data.token });
    return data;
  } catch {
    return null;
  }
}

export { ApiError };
export default client;
