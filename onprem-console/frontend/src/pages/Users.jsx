import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useAuth } from '../auth';
import { api } from '../lib/api';
import { PASSWORD_RULE, passwordProblem } from '../lib/passwordPolicy';
import { useApi } from '../lib/useApi';
import { timeAgo } from '../lib/format';
import { Button } from '../ui/Button';
import { Field, Input, PasswordInput, Select } from '../ui/Field';
import { Modal } from '../ui/Overlay';
import { PageHeader, Table } from '../ui/Page';
import { Panel } from '../ui/Panel';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/States';
import { Tag } from '../ui/Tag';
import { useToast } from '../ui/Toast';

const ROLES = [
  { value: 'admin', label: 'Admin: everything, including people' },
  { value: 'analyst', label: 'Analyst: connections, scans and triage' },
  { value: 'viewer', label: 'Viewer: read only' },
];

function UserForm({ user, onClose, onSaved }) {
  const { notify } = useToast();
  const editing = !!user;
  const [form, setForm] = useState({ email: user?.email || '', name: user?.name || '', role: user?.role || 'analyst', password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    const next = {};
    if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (!editing || form.password) {
      const p = passwordProblem(form.password);
      if (p) next.password = p;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      if (editing) {
        const body = { name: form.name, role: form.role };
        if (form.password) body.password = form.password;
        await api(`/users/${user.id}`, { method: 'PATCH', body });
      } else {
        await api('/users', { method: 'POST', body: form });
      }
      notify({ variant: 'success', title: editing ? 'Saved' : `${form.email} can now sign in`, description: editing ? undefined : 'Share the password with them over a secure channel.' });
      onSaved();
      onClose();
    } catch (error) {
      setErrors({ form: error.message });
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${user.email}` : 'Add a person'} icon={UserPlus}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="user-form" loading={busy}>{editing ? 'Save' : 'Add person'}</Button></>}>
      <form id="user-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {!editing && (
          <Field label="Email" htmlFor="u-email" error={errors.email} required>
            <Input id="u-email" type="email" value={form.email} onChange={set('email')} autoFocus />
          </Field>
        )}
        <Field label="Name" htmlFor="u-name"><Input id="u-name" value={form.name} onChange={set('name')} /></Field>
        <Field label="Role" htmlFor="u-role"><Select id="u-role" value={form.role} onChange={set('role')} options={ROLES} /></Field>
        <Field label={editing ? 'New password (leave blank to keep)' : 'Password'} htmlFor="u-pw" hint={PASSWORD_RULE} error={errors.password} required={!editing}>
          <PasswordInput id="u-pw" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        {errors.form && <p role="alert" className="text-[12.5px] font-medium text-critical">{errors.form}</p>}
      </form>
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const { notify } = useToast();
  const { data, error, loading, reload } = useApi('/users');
  const [editing, setEditing] = useState(null);

  async function toggle(u) {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } });
      notify({ variant: 'success', title: u.active ? `${u.email} switched off` : `${u.email} switched on`, description: u.active ? 'Their session ended at once.' : undefined });
      reload(true);
    } catch (err) {
      notify({ variant: 'error', title: 'Not changed', description: err.message });
    }
  }

  return (
    <>
      <PageHeader title="People" description="Who can sign in to this console. Admins and analysts set up connections and triage; viewers read."
        actions={<Button variant="primary" icon={UserPlus} onClick={() => setEditing('new')}>Add person</Button>} />
      <Panel flush>
        {error && !data ? (
          <ErrorState error={error} onRetry={() => reload()} compact />
        ) : loading && !data ? (
          <div className="p-4"><Skeleton className="h-40 w-full" /></div>
        ) : (
          <Table columns={['Person', 'Role', 'Status', 'Last sign-in', '']}>
            {data.users.map((u) => {
              const self = u.email === me.email;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-ink">{u.name || u.email}{self && <span className="ml-1.5 text-[11.5px] text-ink-3">(you)</span>}</span>
                    {u.name && <span className="block text-[12px] text-ink-3">{u.email}</span>}
                  </td>
                  <td className="px-4 py-3 capitalize">{u.role}</td>
                  <td className="px-4 py-3"><Tag size="sm" dot tone={u.active ? 'low' : 'neutral'}>{u.active ? 'Active' : 'Switched off'}</Tag></td>
                  <td className="px-4 py-3 text-ink-3">{timeAgo(u.last_login_at)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
                    {!self && <Button size="sm" variant="ghost" onClick={() => toggle(u)}>{u.active ? 'Switch off' : 'Switch on'}</Button>}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
      {editing && <UserForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => reload(true)} />}
    </>
  );
}
