import { PASSWORD_RULE, passwordProblem as passwordRuleProblem } from '../../lib/passwordPolicy';
import { useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Pencil, RefreshCw, ShieldCheck, Trash2, UserMinus, UserPlus, UserRoundCheck, Users, X } from 'lucide-react';
import { createUser, deleteUser, fetchUsers, updateUser } from '../../lib/api/admin';
import { useAuth } from '../../app/AuthContext';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { formatDateTime, formatNumber, formatRelative, initialsOf } from '../../lib/format';
import { CAPABILITIES, ROLE_ORDER, ROLES, consoleRole, roleMeta } from '../../lib/roles';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { DataGrid } from '../../ui/DataGrid';
import { Field, Input, PasswordInput, SearchInput, Select } from '../../ui/Field';
import { Menu } from '../../ui/Menu';
import { Drawer, Modal } from '../../ui/Overlay';
import { Panel, PanelHeader } from '../../ui/Panel';
import { MetricTile } from '../../ui/Stat';
import { EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl, Tabs } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { RecordBar, ResultCount } from '../../ui/WorkArea';
import { cn } from '../../ui/cn';

/**
 * User management: who can sign in to this workspace and what each may do.
 *
 * People sign in with a workspace username (name@workspace), so the form
 * builds one from a short name and shows the full sign-in name it will be.
 * Passwords are set by the admin and shown once (generated, or typed), never
 * read back; a reset signs the person out everywhere. The rules that protect
 * the workspace - nobody changes their own role or switches themselves off,
 * the last admin cannot be taken away - are the server's, and its refusals
 * are shown in place.
 */

const ROLE_TONE = { admin: 'brand', operator: 'info', analyst: 'low', viewer: 'neutral' };
const STATUS_OPTIONS = [
  { value: '', label: 'Everyone' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Switched off' },
];

function workspaceOf(email) {
  const at = String(email || '').indexOf('@');
  return at >= 0 ? String(email).slice(at + 1) : '';
}

/** A strong, readable password: no look-alike characters. */
function generatePassword(length = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%*-_';
  /* Drawn again until it has every kind of character the rule asks for. */
  for (;;) {
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    const pw = Array.from(bytes, (n) => alphabet[n % alphabet.length]).join('');
    if (!passwordRuleProblem(pw)) return pw;
  }
}

function passwordProblem(value) {
  if (!value) return 'Set a password, or generate one.';
  return passwordRuleProblem(value);
}

export default function UsersPage() {
  const [tab, setTab] = useState('people');
  const usersQuery = useQuery((signal) => fetchUsers({}, signal), []);
  const roles = usersQuery.data?.roles ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users & roles"
        lede="Who can sign in to this workspace, and what each role may do. Changes apply at once: a switched-off account or a reset password signs that person out everywhere."
        tabs={
          <Tabs
            size="sm"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'people', label: 'People', icon: Users, count: usersQuery.data ? usersQuery.data.users.length : undefined },
              { value: 'roles', label: 'Roles & permissions', icon: ShieldCheck },
            ]}
          />
        }
      />
      {tab === 'people' ? <People query={usersQuery} roles={roles} /> : <RolesMatrix roles={roles} loading={!usersQuery.data && usersQuery.isLoading} />}
    </div>
  );
}

/* ── People ─────────────────────────────────────────────────────────────── */

function People({ query, roles }) {
  const { user: me } = useAuth();
  const { notify } = useToast();
  const [search, setSearch] = useState('');
  const needle = useDebouncedValue(search, 200).trim().toLowerCase();
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | user
  const [resetting, setResetting] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [switching, setSwitching] = useState(null);

  const all = useMemo(() => query.data?.users ?? [], [query.data]);
  const rows = useMemo(
    () =>
      all.filter((u) => {
        if (roleFilter && consoleRole(u.role) !== roleFilter) return false;
        if (statusFilter && (String(u.status || 'active').toLowerCase() === 'active' ? 'active' : 'inactive') !== statusFilter) return false;
        if (!needle) return true;
        return [u.email, u.full_name, u.team, u.department].some((v) => String(v || '').toLowerCase().includes(needle));
      }),
    [all, roleFilter, statusFilter, needle],
  );

  const counts = useMemo(() => {
    const active = all.filter((u) => String(u.status || 'active').toLowerCase() === 'active');
    return {
      active: active.length,
      admins: active.filter((u) => consoleRole(u.role) === 'admin').length,
      off: all.length - active.length,
      never: active.filter((u) => !u.last_login_at).length,
    };
  }, [all]);

  const isSelf = (u) => String(u.email).toLowerCase() === String(me?.email || '').toLowerCase();
  const isActive = (u) => String(u.status || 'active').toLowerCase() === 'active';
  const lastActiveAdmin = (u) => consoleRole(u.role) === 'admin' && isActive(u) && counts.admins <= 1;

  const toggleStatus = async (u, next) => {
    try {
      await updateUser(u.id, { status: next });
      notify({
        variant: 'success',
        title: next === 'active' ? `${u.full_name || u.email} can sign in again` : `${u.full_name || u.email} is switched off`,
        description: next === 'active' ? 'They can sign in with their existing password.' : 'They were signed out everywhere and cannot sign in until switched back on.',
      });
      query.refetch();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not change the account', description: error?.message });
    }
    setSwitching(null);
  };

  const columns = [
    {
      key: 'person',
      header: 'Person',
      primary: true,
      width: '32%',
      cell: (u) => (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-8 shrink-0 place-items-center rounded-full text-[11.5px] font-bold',
              isActive(u) ? 'bg-info-soft text-brand' : 'bg-surface-3 text-ink-3',
            )}
          >
            {initialsOf(u.full_name || u.email)}
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('truncate text-[13px] font-semibold', isActive(u) ? 'text-ink' : 'text-ink-3')}>
                {u.full_name || u.email.split('@')[0]}
              </span>
              {isSelf(u) && (
                <Tag size="sm" tone="brand">
                  You
                </Tag>
              )}
            </span>
            <span className="cell-meta block truncate font-mono text-[11.5px] text-ink-3" title={u.email}>
              {u.email}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '13%',
      cell: (u) => (
        <Tag size="sm" tone={ROLE_TONE[consoleRole(u.role)]}>
          {roleMeta(u.role).label}
        </Tag>
      ),
    },
    {
      key: 'team',
      header: 'Team',
      width: '15%',
      priority: 'wide',
      cell: (u) => (
        <span className="block truncate text-[12.5px] text-ink-2">{[u.team, u.department].filter(Boolean).join(' · ') || <span className="text-ink-3">-</span>}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '13%',
      cell: (u) =>
        isActive(u) ? (
          <Tag size="sm" tone="low" dot>
            Active
          </Tag>
        ) : (
          <Tag size="sm" tone="neutral" dot>
            Switched off
          </Tag>
        ),
    },
    {
      key: 'last',
      header: 'Last sign-in',
      width: '14%',
      cell: (u) =>
        u.last_login_at ? (
          <span className="text-[12.5px] text-ink-2" title={formatDateTime(u.last_login_at)}>
            {formatRelative(u.last_login_at)}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-3">Never</span>
        ),
    },
    {
      key: 'added',
      header: 'Added',
      width: '13%',
      priority: 'wide',
      cell: (u) => (
        <span className="block min-w-0">
          <span className="block text-[12.5px] text-ink-2" title={u.created_at ? formatDateTime(u.created_at) : undefined}>
            {u.created_at ? formatRelative(u.created_at) : '-'}
          </span>
          {u.created_by && <span className="cell-meta block truncate text-[11px] text-ink-3">by {u.created_by}</span>}
        </span>
      ),
    },
  ];

  return (
    <>
      {query.data && (
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[54rem]:grid-cols-4">
          <MetricTile label="Can sign in" value={counts.active} tone="brand" caption="Active accounts in this workspace" />
          <MetricTile label="Admins" value={counts.admins} tone="medium" caption={counts.admins <= 1 ? 'Add a second admin, so one is always available' : 'Active admins'} />
          <MetricTile label="Switched off" value={counts.off} tone="neutral" caption="Kept for the record; cannot sign in" />
          <MetricTile label="Never signed in" value={counts.never} tone="high" caption="Active accounts nobody has used yet" />
        </div>
      )}

      <Panel prominence="lead" flush className="overflow-hidden">
        <RecordBar
          trailing={
            <>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={query.refetch} loading={query.isRefreshing}>
                Refresh
              </Button>
              <Button variant="primary" size="sm" icon={UserPlus} onClick={() => setEditing('new')}>
                Add user
              </Button>
            </>
          }
        >
          <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search name, username or team…" className="w-full min-w-0 sm:max-w-xs" />
          <Select
            size="sm"
            aria-label="Role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            options={[{ value: '', label: 'All roles' }, ...ROLE_ORDER.map((key) => ({ value: key, label: ROLES[key].label }))]}
            className="w-36"
          />
          <SegmentedControl label="Status" options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
          <ResultCount shown={formatNumber(rows.length)} total={formatNumber(all.length)} unit="people" filtered={Boolean(needle || roleFilter || statusFilter)} loading={!query.data && query.isLoading} />
        </RecordBar>

        {query.isError && !query.data ? (
          <ErrorState error={query.error} onRetry={query.refetch} title="The people of this workspace could not be loaded" />
        ) : (
          <DataGrid
            caption="People"
            columns={columns}
            rows={rows}
            rowKey={(u) => u.id}
            loading={!query.data && query.isLoading}
            refreshing={query.isRefreshing}
            onRowClick={(u) => setEditing(u)}
            rowActions={(u) => (
              <Menu
                label={`Actions for ${u.email}`}
                items={[
                  { key: 'edit', label: 'Edit details and role', icon: Pencil, onSelect: () => setEditing(u) },
                  { key: 'reset', label: 'Reset password', icon: KeyRound, onSelect: () => setResetting(u) },
                  isActive(u)
                    ? {
                        key: 'off',
                        label: isSelf(u) ? 'Switch off (not your own)' : lastActiveAdmin(u) ? 'Switch off (last admin)' : 'Switch off account',
                        icon: UserMinus,
                        disabled: isSelf(u) || lastActiveAdmin(u),
                        onSelect: () => setSwitching(u),
                      }
                    : { key: 'on', label: 'Switch back on', icon: UserRoundCheck, onSelect: () => toggleStatus(u, 'active') },
                  {
                    key: 'remove',
                    label: 'Remove…',
                    icon: Trash2,
                    tone: 'critical',
                    disabled: isSelf(u) || lastActiveAdmin(u),
                    onSelect: () => setRemoving(u),
                  },
                ]}
              />
            )}
            emptyState={
              all.length === 0 ? (
                <EmptyState icon={Users} title="Nobody here yet" description="Add the people who should sign in to this workspace." action={<Button size="sm" variant="primary" icon={UserPlus} onClick={() => setEditing('new')}>Add user</Button>} />
              ) : (
                <EmptyState compact title="Nobody matches" description="No one matches the search and filters." action={<Button size="sm" variant="secondary" onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); }}>Clear filters</Button>} />
              )
            }
          />
        )}
      </Panel>

      <UserDrawer
        target={editing}
        roles={roles}
        workspace={workspaceOf(me?.email)}
        self={editing && editing !== 'new' ? isSelf(editing) : false}
        lastAdmin={editing && editing !== 'new' ? lastActiveAdmin(editing) : false}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          query.refetch();
        }}
        onReset={(u) => {
          setEditing(null);
          setResetting(u);
        }}
      />
      <ResetPasswordModal target={resetting} self={resetting ? isSelf(resetting) : false} onClose={() => setResetting(null)} onDone={() => query.refetch()} />
      <RemoveModal target={removing} onClose={() => setRemoving(null)} onRemoved={() => { setRemoving(null); query.refetch(); }} />
      <Modal
        open={Boolean(switching)}
        onClose={() => setSwitching(null)}
        icon={UserMinus}
        tone="medium"
        title={switching ? `Switch off ${switching.full_name || switching.email}?` : ''}
        description="They are signed out everywhere at once and cannot sign in until the account is switched back on. Nothing they did is deleted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSwitching(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={UserMinus} onClick={() => toggleStatus(switching, 'inactive')}>
              Switch off
            </Button>
          </>
        }
      />
    </>
  );
}

/* ── Add / edit ─────────────────────────────────────────────────────────── */

function UserDrawer({ target, roles, workspace, self, lastAdmin, onClose, onSaved, onReset }) {
  const isNew = target === 'new';
  const open = Boolean(target);
  const key = isNew ? 'new' : target?.id ?? 'none';
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      eyebrow="Users & roles"
      title={isNew ? 'Add a user' : target ? target.full_name || target.email : ''}
      subtitle={isNew ? 'They sign in with the username and password you set here.' : target?.email}
    >
      {open && <UserForm key={key} target={isNew ? null : target} roles={roles} workspace={workspace} self={self} lastAdmin={lastAdmin} onCancel={onClose} onSaved={onSaved} onReset={onReset} />}
    </Drawer>
  );
}

function UserForm({ target, roles, workspace, self, lastAdmin, onCancel, onSaved, onReset }) {
  const { notify } = useToast();
  const isNew = !target;
  const [name, setName] = useState(target?.full_name ?? '');
  const [username, setUsername] = useState(() => (target ? '' : ''));
  const [team, setTeam] = useState(target?.team ?? '');
  const [department, setDepartment] = useState(target?.department ?? '');
  const [role, setRole] = useState(target ? consoleRole(target.role) : 'analyst');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null); // { email, password } shown once

  const short = username.trim().toLowerCase();
  const email = short.includes('@') ? short : workspace ? `${short}@${workspace}` : short;
  const roleLocked = !isNew && (self || lastAdmin);
  const roleList = roles.length ? roles : ROLE_ORDER.map((k) => ({ key: k, label: ROLES[k].label, summary: ROLES[k].summary }));

  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    if (isNew) {
      if (!short) next.username = 'Choose a username.';
      else if (!/^[a-z0-9][a-z0-9._-]{1,63}(@[a-z0-9._-]+)?$/.test(short)) next.username = 'Use letters, digits, dot, dash or underscore (2-64 characters).';
      const problem = passwordProblem(password);
      if (problem) next.password = problem;
    }
    if (name.trim().length > 0 && name.trim().length < 2) next.name = 'Enter their full name, or leave it empty.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      if (isNew) {
        await createUser({ email, password, fullName: name.trim(), team: team.trim(), department: department.trim(), role });
        setCreated({ email, password });
      } else {
        const changes = {};
        if (name.trim() !== (target.full_name || '')) changes.fullName = name.trim();
        if (team.trim() !== (target.team || '')) changes.team = team.trim();
        if (department.trim() !== (target.department || '')) changes.department = department.trim();
        if (role !== consoleRole(target.role)) changes.role = role;
        if (Object.keys(changes).length === 0) {
          onCancel();
          return;
        }
        await updateUser(target.id, changes);
        notify({ variant: 'success', title: 'Saved', description: changes.role ? `${target.full_name || target.email} is now ${ROLES[role].label}. It applies to their next action.` : 'Their details are updated.' });
        onSaved();
      }
    } catch (error) {
      const field = { email: 'username', full_name: 'name' }[error?.field] ?? error?.field;
      if (field) setErrors({ [field]: error.message });
      else notify({ variant: 'error', title: isNew ? 'Could not add the user' : 'Could not save', description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return <CreatedNotice created={created} onDone={onSaved} />;
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5 p-4 sm:p-5">
      <Field label="Full name" htmlFor="u-name" error={errors.name}>
        <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" autoComplete="off" />
      </Field>

      {isNew && (
        <Field
          label="Username"
          htmlFor="u-username"
          required
          error={errors.username}
          hint={short ? `They sign in as ${email}` : workspace ? `They sign in as name@${workspace}` : 'They sign in with this exactly.'}
        >
          <Input id="u-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. priya" autoComplete="off" invalid={Boolean(errors.username)} />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Team" htmlFor="u-team">
          <Input id="u-team" value={team} onChange={(e) => setTeam(e.target.value)} placeholder="e.g. Platform" />
        </Field>
        <Field label="Department" htmlFor="u-dept">
          <Input id="u-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Security" />
        </Field>
      </div>

      <fieldset>
        <legend className="text-[12.5px] font-medium text-ink-2">Role</legend>
        {roleLocked && (
          <p className="mt-1 text-[11.5px] text-ink-3">
            {self ? 'You cannot change your own role. Ask another admin.' : 'This is the only active admin. Make someone else an admin first.'}
          </p>
        )}
        <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Role">
          {roleList.map((option) => {
            const active = role === option.key;
            return (
              <label
                key={option.key}
                className={cn(
                  'flex gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 transition-colors',
                  active ? 'border-brand bg-info-soft' : 'border-line hover:bg-surface-2',
                  roleLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={option.key}
                  checked={active}
                  disabled={roleLocked}
                  onChange={() => setRole(option.key)}
                  className="mt-0.5 size-3.5 shrink-0 accent-[var(--t-brand)]"
                />
                <span className="min-w-0">
                  <span className={cn('block text-[13px] font-semibold', active ? 'text-brand' : 'text-ink')}>{option.label}</span>
                  <span className="block text-[12px] leading-snug text-ink-3">{option.summary || ROLES[option.key]?.summary}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {isNew ? (
        <Field
          label="Password"
          htmlFor="u-password"
          required
          error={errors.password}
          hint={`${PASSWORD_RULE} You will see it once, to pass on to them.`}
          labelSuffix={
            <button type="button" onClick={() => setPassword(generatePassword())} className="text-[12px] font-medium text-brand hover:underline">
              Generate
            </button>
          }
        >
          <PasswordInput id="u-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" invalid={Boolean(errors.password)} />
        </Field>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2.5">
          <span className="text-[12.5px] text-ink-2">
            Password
            <span className="block text-[11.5px] text-ink-3">Never shown. A reset signs them out everywhere.</span>
          </span>
          <Button type="button" size="sm" variant="secondary" icon={KeyRound} onClick={() => onReset(target)}>
            Reset…
          </Button>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-4 flex justify-end gap-2 border-t border-line bg-surface-2 px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving} icon={isNew ? UserPlus : Check}>
          {isNew ? 'Add user' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

/** After adding someone: the sign-in details, once, with a copy button. */
function CreatedNotice({ created, onDone }) {
  const [copied, setCopied] = useState(false);
  const text = `Sign in at ${window.location.origin}\nUsername: ${created.email}\nPassword: ${created.password}`;
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-low/30 bg-low-soft px-3.5 py-3">
        <UserRoundCheck aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 text-low" />
        <p className="text-[13px] text-ink-2">
          <b className="font-semibold text-ink">{created.email}</b> can sign in now. Pass on these details safely - the password is not
          shown again.
        </p>
      </div>
      <pre className="overflow-x-auto rounded-[var(--radius-control)] border border-line bg-inset px-3.5 py-3 font-mono text-[12.5px] text-ink">{text}</pre>
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          icon={copied ? Check : Copy}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy details'}
        </Button>
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

/* ── Reset password ─────────────────────────────────────────────────────── */

function ResetPasswordModal({ target, self, onClose, onDone }) {
  const { notify } = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const close = () => {
    setPassword('');
    setError('');
    setDone(false);
    setCopied(false);
    onClose();
  };
  const submit = async () => {
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await updateUser(target.id, { password });
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(err?.message || 'Could not reset the password.');
      notify({ variant: 'error', title: 'Could not reset the password', description: err?.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(target)}
      onClose={close}
      icon={KeyRound}
      title={target ? `Reset the password of ${target.full_name || target.email}` : ''}
      description={
        done
          ? 'Done. They were signed out everywhere; pass on the new password safely. It is not shown again.'
          : self
            ? 'Use "Change password" in your account menu for your own: it asks for your current one.'
            : 'They are signed out everywhere and sign in again with the new password.'
      }
      footer={
        done ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" icon={KeyRound} loading={saving} onClick={submit} disabled={self}>
              Reset password
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-inset px-3 py-2 font-mono text-[13px] text-ink">{password}</code>
          <Button
            variant="secondary"
            size="sm"
            icon={copied ? Check : Copy}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(password);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      ) : (
        !self && (
          <Field
            label="New password"
            htmlFor="reset-pw"
            error={error}
            hint={PASSWORD_RULE}
            labelSuffix={
              <button type="button" onClick={() => { setPassword(generatePassword()); setError(''); }} className="text-[12px] font-medium text-brand hover:underline">
                Generate
              </button>
            }
          >
            <PasswordInput id="reset-pw" value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} autoComplete="new-password" invalid={Boolean(error)} />
          </Field>
        )
      )}
    </Modal>
  );
}

/* ── Remove ─────────────────────────────────────────────────────────────── */

function RemoveModal({ target, onClose, onRemoved }) {
  const { notify } = useToast();
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const matches = target && typed.trim().toLowerCase() === String(target.email).toLowerCase();
  const close = () => {
    setTyped('');
    onClose();
  };
  const remove = async () => {
    setSaving(true);
    try {
      await deleteUser(target.id);
      notify({ variant: 'success', title: `${target.email} was removed`, description: 'Their entries in the audit log stay.' });
      setTyped('');
      onRemoved();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not remove the user', description: error?.message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={Boolean(target)}
      onClose={close}
      icon={Trash2}
      tone="critical"
      title={target ? `Remove ${target.full_name || target.email}?` : ''}
      description="The account is deleted and they are signed out everywhere. This cannot be undone - to keep the account for later, switch it off instead. Their actions stay in the audit log."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="danger" icon={Trash2} loading={saving} disabled={!matches} onClick={remove}>
            Remove
          </Button>
        </>
      }
    >
      <Field label={`Type ${target?.email ?? ''} to confirm`} htmlFor="remove-confirm">
        <Input id="remove-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </Field>
    </Modal>
  );
}

/* ── Roles & permissions ────────────────────────────────────────────────── */

function RolesMatrix({ roles, loading }) {
  const list = roles.length ? roles : ROLE_ORDER.map((key) => ({ key, label: ROLES[key].label, summary: ROLES[key].summary, capabilities: null }));
  return (
    <Panel prominence="lead" flush className="overflow-hidden">
      <div className="border-b border-line px-4 py-3.5 sm:px-5">
        <PanelHeader
          title="What each role may do"
          subtitle="Read from the server's own rules, the same table every request is checked against. A new screen or API follows these rules automatically."
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-surface-2">
              <th scope="col" className="px-4 py-3 text-[11px] font-semibold tracking-[0.07em] text-ink-3 uppercase sm:px-5">
                Permission
              </th>
              {list.map((role) => (
                <th key={role.key} scope="col" className="w-[14%] px-3 py-3 text-center">
                  <Tag size="sm" tone={ROLE_TONE[role.key]}>
                    {role.label}
                  </Tag>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((cap) => (
              <tr key={cap.key} className="border-b border-line/80 last:border-b-0">
                <th scope="row" className="px-4 py-2.5 text-[12.5px] font-normal text-ink-2 sm:px-5">
                  {cap.label}
                </th>
                {list.map((role) => {
                  const held = role.capabilities ? role.capabilities.includes(cap.key) : null;
                  return (
                    <td key={role.key} className="px-3 py-2.5 text-center">
                      {loading || held === null ? (
                        <span className="text-ink-3">·</span>
                      ) : held ? (
                        <Check aria-label="Allowed" className="mx-auto size-4 text-low" />
                      ) : (
                        <X aria-label="Not allowed" className="mx-auto size-3.5 text-ink-3/60" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 border-t border-line bg-surface-2 px-4 py-3.5 sm:grid-cols-2 sm:px-5">
        {list.map((role) => (
          <p key={role.key} className="text-[12px] leading-relaxed text-ink-3">
            <b className="font-semibold text-ink-2">{role.label}.</b> {role.summary || ROLES[role.key]?.summary}
          </p>
        ))}
      </div>
    </Panel>
  );
}
