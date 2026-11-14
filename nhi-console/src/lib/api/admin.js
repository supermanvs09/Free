import client from './client';
import { ApiError, unwrapMain } from './http';
import { seal } from './seal';

/**
 * Administration of the console itself: the people who can sign in
 * (/api/v1/users), the audit log of what everyone did (/api/v1/audit-logs)
 * and changing one's own password (/api/v1/me/password).
 *
 * Users answer { success, message, data, error }; a refusal names the field it
 * is about in data.field, which is kept on the error so a form can put the
 * message under the right input.
 */

function withField(error) {
  return error instanceof ApiError ? error : new ApiError({ message: error?.message || 'Request failed.' });
}

async function call(promise) {
  try {
    return unwrapMain(await promise);
  } catch (error) {
    throw withField(error);
  }
}

/* ── People ─────────────────────────────────────────────────────────────── */

/** { users: User[], roles: [{ key, label, summary, capabilities[] }] } */
export async function fetchUsers({ q, role, status } = {}, signal) {
  const params = {};
  if (q?.trim()) params.q = q.trim();
  if (role) params.role = role;
  if (status) params.status = status;
  const data = await call(client.get('/api/v1/users', { params, signal }));
  return { users: Array.isArray(data?.users) ? data.users : [], roles: Array.isArray(data?.roles) ? data.roles : [] };
}

export async function createUser(input) {
  return call(
    client.post('/api/v1/users', {
      email: input.email,
      password: await seal(input.password ?? ''),
      full_name: input.fullName || '',
      team: input.team || '',
      department: input.department || '',
      role: input.role,
      status: input.status || 'active',
    }),
  );
}

/** Only the fields present are changed. */
export async function updateUser(id, changes) {
  const body = {};
  if (changes.fullName !== undefined) body.full_name = changes.fullName;
  if (changes.team !== undefined) body.team = changes.team;
  if (changes.department !== undefined) body.department = changes.department;
  if (changes.role !== undefined) body.role = changes.role;
  if (changes.status !== undefined) body.status = changes.status;
  if (changes.password !== undefined) body.password = await seal(changes.password);
  return call(client.patch(`/api/v1/users/${encodeURIComponent(id)}`, body));
}

export async function deleteUser(id) {
  return call(client.delete(`/api/v1/users/${encodeURIComponent(id)}`));
}

export async function changeOwnPassword({ currentPassword, newPassword }) {
  return call(
    client.patch('/api/v1/me/password', {
      current_password: await seal(currentPassword),
      new_password: await seal(newPassword),
    }),
  );
}

/* ── Audit log ──────────────────────────────────────────────────────────── */

function auditParams(filters = {}) {
  const params = {};
  for (const key of ['action', 'actor', 'outcome', 'q', 'from', 'to']) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') params[key] = String(value).trim();
  }
  return params;
}

/** { entries, total, page, pageSize, everyone } */
export async function fetchAuditLog(filters = {}, { page = 1, pageSize = 50 } = {}, signal) {
  const data = await call(client.get('/api/v1/audit-logs', { params: { ...auditParams(filters), page, page_size: pageSize }, signal }));
  return {
    entries: Array.isArray(data?.entries) ? data.entries : [],
    total: Number(data?.total) || 0,
    page: Number(data?.page) || page,
    pageSize: Number(data?.page_size) || pageSize,
    everyone: Boolean(data?.scope?.everyone),
  };
}

/** The values the filters offer: { actions[], actors[], outcomes[] }. */
export async function fetchAuditFacets(signal) {
  const data = await call(client.get('/api/v1/audit-logs/filters', { signal }));
  return {
    actions: Array.isArray(data?.actions) ? data.actions : [],
    actors: Array.isArray(data?.actors) ? data.actors : [],
    outcomes: Array.isArray(data?.outcomes) ? data.outcomes : [],
  };
}

/** Downloads the filtered log as CSV, under the name the server gives it. */
export async function exportAuditLog(filters = {}) {
  const response = await client.get('/api/v1/audit-logs', {
    params: { ...auditParams(filters), format: 'csv' },
    responseType: 'blob',
    headers: { Accept: 'text/csv' },
    timeout: 120000,
  });
  const disposition = response.headers?.['content-disposition'] ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match ? match[1] : `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename };
}
