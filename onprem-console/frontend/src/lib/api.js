/* The session token lives for the tab only (sessionStorage): closing the
   browser signs out, which suits a security console on shared desks. */
const KEY = 'onprem.session';

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(session) {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const session = getSession();
  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(session?.token && { Authorization: `Bearer ${session.token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(0, 'The console API cannot be reached. Check the server is running.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('onprem:signed-out'));
    throw new ApiError(response.status, data?.error?.message || `Request failed (${response.status}).`);
  }
  return data;
}
