/*
 * The built-in service: answers every request the console makes, in the
 * browser. Routes are registered per area (routes/*.js) with path patterns:
 * `:name` matches one segment, `*name` the rest of the path.
 */
import { fail } from './util';
import { currentUser } from './users';
import auth from './routes/auth';
import inventory from './routes/inventory';
import dashboard from './routes/dashboard';
import scans from './routes/scans';
import posture from './routes/posture';
import genomeRoutes from './routes/genome';
import exposure from './routes/exposure';
import remediation from './routes/remediation';
import alerts from './routes/alerts';
import admin from './routes/admin';
import integrations from './routes/integrations';
import correlations from './routes/correlations';

const routes = [];
const add = (method, pattern, handler, { open = false } = {}) => {
  const parts = pattern.split('/').filter(Boolean);
  routes.push({ method, parts, handler, open });
};
const r = {
  get: (p, h, o) => add('get', p, h, o),
  post: (p, h, o) => add('post', p, h, o),
  put: (p, h, o) => add('put', p, h, o),
  patch: (p, h, o) => add('patch', p, h, o),
  delete: (p, h, o) => add('delete', p, h, o),
};
[auth, inventory, dashboard, scans, posture, genomeRoutes, exposure, remediation, alerts, admin, integrations, correlations].forEach((register) => register(r));

function match(route, segments) {
  const params = {};
  for (let i = 0; i < route.parts.length; i += 1) {
    const part = route.parts[i];
    if (part.startsWith('*')) {
      params[part.slice(1)] = segments.slice(i).map(safeDecode).join('/');
      return segments.length > i ? params : null;
    }
    if (i >= segments.length) return null;
    if (part.startsWith(':')) params[part.slice(1)] = safeDecode(segments[i]);
    else if (part !== segments[i]) return null;
  }
  return route.parts.length === segments.length ? params : null;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function handle({ method, url, params = {}, body = null, headers = {} }) {
  const [path, qs] = String(url).split('?');
  const query = { ...Object.fromEntries(new URLSearchParams(qs ?? '')), ...params };
  for (const [k, v] of Object.entries(query)) if (Array.isArray(v)) query[k] = v.join(',');
  const segments = path.split('/').filter(Boolean);
  const candidates = routes.filter((rt) => rt.method === method);
  for (const route of candidates) {
    const p = match(route, segments);
    if (!p) continue;
    const user = currentUser(headers.Authorization);
    if (!route.open && !user) return fail(401, 'Your session is no longer valid. Sign in again to continue.', 'UNAUTHORIZED');
    try {
      const result = await route.handler({ params: p, query, body: typeof body === 'string' ? JSON.parse(body || 'null') : body, user, headers });
      return result ?? { status: 204, body: null };
    } catch (error) {
      if (error?.status) return { status: error.status, body: error.body ?? { success: false, message: error.message, error: error.code } };
      console.error('[local service]', method.toUpperCase(), path, error);
      return fail(500, 'The service failed while handling this request.');
    }
  }
  return { status: 404, body: { success: false, message: 'That no longer exists.', error: 'ROUTE_NOT_FOUND' } };
}

/** Throw from a handler to answer with an error. */
export function refuse(status, message, code, field) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.body = { success: false, message, error: code, data: field ? { field } : undefined };
  return error;
}
