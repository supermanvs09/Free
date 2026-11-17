/* People, roles, passwords and the audit log. */
import { ok, fail, iso } from '../util';
import { users, publicUser, findUser, audit, auditLog, checkPassword, setPassword, endSessions } from '../users';
import { ROLE_LIST, can } from '../roles';
import { save } from '../state';
import { ORG } from '../seed';

function strong(pw) {
  return typeof pw === 'string' && pw.length >= 10 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw);
}

export default function register(r) {
  r.get('/api/v1/users', ({ query, user }) => {
    if (!can(user, 'users')) return fail(403, 'Managing users is for admins.', 'FORBIDDEN');
    let rows = users();
    if (query.q) rows = rows.filter((u) => `${u.full_name} ${u.email} ${u.team}`.toLowerCase().includes(String(query.q).toLowerCase()));
    if (query.role) rows = rows.filter((u) => u.role === query.role);
    if (query.status) rows = rows.filter((u) => u.status === query.status);
    return ok({ users: rows.map(publicUser), roles: ROLE_LIST });
  });

  r.post('/api/v1/users', ({ body, user }) => {
    if (!can(user, 'users')) return fail(403, 'Managing users is for admins.', 'FORBIDDEN');
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{1,63}@[a-z0-9.-]+$/.test(email)) return fail(400, 'Use a sign-in name like priya@das.', 'VALIDATION_ERROR', 'email');
    if (findUser(email)) return fail(409, 'Someone with this email already has an account.', 'USER_EXISTS', 'email');
    if (!strong(body.password)) return fail(400, 'Use at least 10 characters with upper and lower case letters and a number.', 'VALIDATION_ERROR', 'password');
    const u = { id: `usr_${Date.now().toString(36)}`, email, full_name: body.full_name || email.split('@')[0], team: body.team || '', department: body.department || '', role: body.role || 'viewer', status: body.status || 'active', tenant_id: ORG.tenantId, created_at: iso(Date.now()), last_login_at: null, session_epoch: 0, cred_v: 2, created_by: user.email };
    setPassword(u, body.password);
    u.session_epoch = 0;
    users().push(u);
    save();
    audit(user, 'user.create', `Added ${u.full_name} as ${u.role}`, { target: u.email });
    return { status: 201, body: { success: true, message: 'Created', data: publicUser(u) } };
  });

  r.patch('/api/v1/users/:id', ({ params, body, user }) => {
    if (!can(user, 'users')) return fail(403, 'Managing users is for admins.', 'FORBIDDEN');
    const u = users().find((x) => x.id === params.id);
    if (!u) return fail(404, 'That person no longer has an account.', 'NOT_FOUND');
    if (u.id === user.id && body.role && body.role !== 'admin') return fail(400, 'You cannot remove your own admin role.', 'VALIDATION_ERROR', 'role');
    if (body.password !== undefined && !strong(body.password)) return fail(400, 'Use at least 10 characters with upper and lower case letters and a number.', 'VALIDATION_ERROR', 'password');
    const before = { role: u.role, status: u.status };
    for (const k of ['full_name', 'team', 'department', 'role', 'status']) if (body[k] !== undefined) u[k] = body[k];
    if (body.password !== undefined) setPassword(u, body.password);
    if (body.status === 'inactive' && before.status !== 'inactive') endSessions(u);
    save();
    const what = body.password !== undefined && Object.keys(body).length === 1
      ? `Reset the password of ${u.full_name}`
      : body.role && body.role !== before.role
        ? `Changed ${u.full_name}'s role from ${before.role} to ${u.role}`
        : body.status && body.status !== before.status
          ? `${u.status === 'active' ? 'Turned on' : 'Switched off'} ${u.full_name}'s account`
          : `Updated ${u.full_name}`;
    audit(user, body.password !== undefined && Object.keys(body).length === 1 ? 'user.password.reset' : 'user.update', what, { target: u.email });
    return ok(publicUser(u));
  });

  r.delete('/api/v1/users/:id', ({ params, user }) => {
    if (!can(user, 'users')) return fail(403, 'Managing users is for admins.', 'FORBIDDEN');
    if (params.id === user.id) return fail(400, 'You cannot delete your own account.', 'VALIDATION_ERROR');
    const list = users();
    const i = list.findIndex((x) => x.id === params.id);
    if (i < 0) return fail(404, 'That person no longer has an account.', 'NOT_FOUND');
    const [gone] = list.splice(i, 1);
    save();
    audit(user, 'user.delete', `Removed ${gone.full_name}`, { target: gone.email });
    return ok({ id: params.id });
  });

  r.patch('/api/v1/me/password', ({ body, user }) => {
    if (!checkPassword(user, body.current_password)) return fail(400, 'Your current password is not right.', 'WRONG_PASSWORD', 'current_password');
    if (!strong(body.new_password)) return fail(400, 'Use at least 10 characters with upper and lower case letters and a number.', 'VALIDATION_ERROR', 'new_password');
    setPassword(user, body.new_password, { keepSession: true });
    save();
    audit(user, 'auth.password', 'Changed their password');
    return ok({ changed: true });
  });

  const filtered = (q, user) => {
    let rows = auditLog();
    if (!can(user, 'audit.all')) rows = rows.filter((e) => e.actor === user.email);
    if (q.action) rows = rows.filter((e) => e.action === q.action);
    if (q.actor) rows = rows.filter((e) => e.actor === q.actor);
    if (q.outcome) rows = rows.filter((e) => e.outcome === q.outcome);
    if (q.q) rows = rows.filter((e) => `${e.summary} ${e.actor} ${e.action}`.toLowerCase().includes(String(q.q).toLowerCase()));
    if (q.from) rows = rows.filter((e) => e.at >= q.from);
    if (q.to) rows = rows.filter((e) => e.at <= `${q.to}T23:59:59Z`);
    return rows;
  };

  r.get('/api/v1/audit-logs', ({ query, user }) => {
    const rows = filtered(query, user);
    if (query.format === 'csv') {
      const csv = ['time,actor,action,summary,outcome,ip,screen', ...rows.map((e) => [e.at, e.actor, e.action, e.summary, e.outcome, e.ip, e.screen].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      return { status: 200, body: csv, headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"` } };
    }
    const page = Math.max(1, Number(query.page) || 1);
    const size = Math.max(1, Number(query.page_size) || 50);
    return ok({ entries: rows.slice((page - 1) * size, page * size).map((e) => ({ ...e, occurred_at: e.occurred_at ?? e.at })), total: rows.length, page, page_size: size, scope: { everyone: can(user, 'audit.all') } });
  });

  r.get('/api/v1/audit-logs/filters', ({ user }) => {
    const rows = filtered({}, user);
    return ok({ actions: [...new Set(rows.map((e) => e.action))].sort(), actors: [...new Set(rows.map((e) => e.actor))].sort(), outcomes: ['success', 'failure'] });
  });
}
