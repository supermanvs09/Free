import { useState } from 'react';
import { useAuth } from '../auth';
import { api } from '../lib/api';
import { PASSWORD_RULE, passwordProblem } from '../lib/passwordPolicy';
import { Button } from '../ui/Button';
import { Field, PasswordInput } from '../ui/Field';
import { PageHeader } from '../ui/Page';
import { DetailList, DetailRow, Panel, PanelHeader } from '../ui/Panel';
import { useToast } from '../ui/Toast';

const ROLE_TEXT = {
  admin: 'Admin: connections, scans, triage, people and the audit log.',
  analyst: 'Analyst: connections, scans and triage.',
  viewer: 'Viewer: read only.',
};

export default function Account() {
  const { user, role } = useAuth();
  const { notify } = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    const next = {};
    if (!form.current) next.current = 'Enter your current password.';
    const p = passwordProblem(form.next);
    if (p) next.next = p;
    else if (form.next !== form.confirm) next.confirm = 'The two new passwords differ.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { current_password: form.current, new_password: form.next } });
      notify({ variant: 'success', title: 'Password changed' });
      setForm({ current: '', next: '', confirm: '' });
    } catch (error) {
      setErrors({ current: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Your account" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Profile" />
          <DetailList className="mt-2">
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Name">{user.name || '—'}</DetailRow>
            <DetailRow label="Role">{ROLE_TEXT[role]}</DetailRow>
          </DetailList>
          <p className="mt-3 text-[12px] text-ink-3">An admin changes names and roles on the People page.</p>
        </Panel>
        <Panel>
          <PanelHeader title="Change password" subtitle={PASSWORD_RULE} />
          <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
            <Field label="Current password" htmlFor="a-cur" error={errors.current}><PasswordInput id="a-cur" autoComplete="current-password" value={form.current} onChange={set('current')} /></Field>
            <Field label="New password" htmlFor="a-new" error={errors.next}><PasswordInput id="a-new" autoComplete="new-password" value={form.next} onChange={set('next')} /></Field>
            <Field label="New password again" htmlFor="a-conf" error={errors.confirm}><PasswordInput id="a-conf" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></Field>
            <div><Button type="submit" variant="primary" loading={busy}>Change password</Button></div>
          </form>
        </Panel>
      </div>
    </>
  );
}
