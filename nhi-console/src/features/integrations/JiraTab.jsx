import { useEffect, useState } from 'react';
import { CheckCircle2, PlugZap, Ticket } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { fetchDeliveries, fetchJiraCredentials, saveAppSettings } from '../../lib/api/hub';
import { useQuery } from '../../lib/hooks';
import { createJiraIssue, testJira } from '../../lib/notify';
import { jiraIssueFor, recordDelivery, testEvent } from '../../lib/local/notifyBus';
import { Button } from '../../ui/Button';
import { Field, Input, PasswordInput, Select } from '../../ui/Field';
import { Panel, PanelHeader } from '../../ui/Panel';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { AppHeader, DeliveryLog, EVENT_KINDS, SEVERITY_OPTIONS, SevDot } from './hubParts';

const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/**
 * Alerts as Jira issues. One issue per alert, labelled with the alert's id:
 * when the same alert fires again the existing issue gets a comment instead
 * of a duplicate.
 */
export function JiraTab({ app, canManage }) {
  const workspace = useWorkspace();
  const { notify } = useToast();
  const log = useQuery((signal) => fetchDeliveries('jira', signal), []);
  const [form, setForm] = useState({
    site_url: app.site_url ?? '',
    email: app.email ?? '',
    api_token: '',
    project_key: app.project_key ?? '',
    issue_type: app.issue_type ?? 'Bug',
    min_severity: app.min_severity ?? 'CRITICAL',
    events: app.events ?? {},
    priority_map: app.priority_map ?? {},
    labels: (app.labels ?? []).join(', '),
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [tested, setTested] = useState(null);

  const { refetch: refetchLog } = log;
  useEffect(() => {
    const refresh = () => setTimeout(refetchLog, 1500);
    window.addEventListener('alerts:refresh', refresh);
    return () => window.removeEventListener('alerts:refresh', refresh);
  }, [refetchLog]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    if (['site_url', 'email', 'api_token', 'project_key'].includes(k)) setTested(null);
  };

  const validate = () => {
    const e = {};
    if (!/^https:\/\/[^\s/]+/.test(form.site_url.trim())) e.site_url = 'Enter your Jira site, e.g. https://yourteam.atlassian.net.';
    if (!/^[^@\s]+@[^@\s]+$/.test(form.email.trim())) e.email = 'Enter the Atlassian account email the token belongs to.';
    if (!form.api_token && !app.api_token_set) e.api_token = 'Paste an API token from id.atlassian.com → Security → API tokens.';
    if (!/^[A-Z][A-Z0-9_]{1,9}$/.test(form.project_key.trim())) e.project_key = 'A project key is 2-10 capital letters or digits, e.g. SEC.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const credentials = async () => {
    const stored = !form.api_token && app.api_token_set ? await fetchJiraCredentials() : null;
    return { site_url: form.site_url.trim().replace(/\/+$/, ''), email: form.email.trim(), api_token: form.api_token || stored?.api_token || '', project_key: form.project_key.trim() };
  };

  const test = async () => {
    if (!validate()) return;
    setTesting('connection');
    const res = await testJira(await credentials());
    setTesting('');
    setTested(res);
    if (res.ok) notify({ variant: 'success', title: `Connected to ${res.project_name ?? form.project_key}`, description: `Signed in as ${res.account_name ?? form.email}.` });
    else notify({ variant: 'error', title: 'Jira did not accept this', description: res.message });
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await saveAppSettings('jira', {
        site_url: form.site_url.trim(),
        email: form.email.trim(),
        ...(form.api_token ? { api_token: form.api_token } : {}),
        project_key: form.project_key.trim(),
        issue_type: form.issue_type,
        min_severity: form.min_severity,
        events: form.events,
        priority_map: form.priority_map,
        labels: form.labels.split(/[\s,]+/).filter(Boolean),
      });
      setForm((f) => ({ ...f, api_token: '' }));
      await workspace.refreshApps();
      notify({ variant: 'success', title: 'Jira saved', description: `Matching alerts open issues in ${form.project_key}.` });
    } catch (error) {
      if (error?.field) setErrors({ [error.field]: error.message });
      notify({ variant: 'error', title: 'Could not save', description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const testIssue = async () => {
    if (!validate()) return;
    setTesting('issue');
    const event = testEvent();
    const cfg = { ...app, ...(await credentials()), issue_type: form.issue_type, priority_map: form.priority_map, labels: form.labels.split(/[\s,]+/).filter(Boolean) };
    const issue = jiraIssueFor(event, cfg);
    const res = await createJiraIssue({ ...issue, summary: `[Test] ${issue.summary}` });
    recordDelivery({ channel: 'jira', event_id: event.id, title: 'Test issue', severity: 'LOW', to: form.project_key, status: res.ok ? 'sent' : 'failed', message: res.ok ? `Created ${res.key}` : res.message, issue_key: res.key ?? null, issue_url: res.url ?? null });
    setTesting('');
    log.refetch();
    if (res.ok) notify({ variant: 'success', title: `Created ${res.key}`, description: 'Open it from Recently created below.' });
    else notify({ variant: 'error', title: 'The test issue was not created', description: res.message });
  };

  return (
    <>
      <Panel>
        <AppHeader app={app}>Alerts open Jira issues as they are raised, with the identity, where it lives and a link back. The same alert firing again comments on its issue instead of opening a new one.</AppHeader>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Jira site" subtitle="Jira Cloud, with an API token of the account issues are created as." />
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
            <Field className="sm:col-span-2" label="Site" htmlFor="j-site" required error={errors.site_url}>
              <Input id="j-site" value={form.site_url} placeholder="https://yourteam.atlassian.net" onChange={(e) => set('site_url', e.target.value)} disabled={!canManage} invalid={Boolean(errors.site_url)} className="font-mono text-[12.5px]" />
            </Field>
            <Field label="Account email" htmlFor="j-email" required error={errors.email}>
              <Input id="j-email" value={form.email} placeholder="security-bot@company.com" onChange={(e) => set('email', e.target.value)} disabled={!canManage} invalid={Boolean(errors.email)} />
            </Field>
            <Field label="API token" htmlFor="j-token" required={!app.api_token_set} error={errors.api_token} hint={app.api_token_set ? 'A token is saved. Paste a new one to replace it.' : 'Kept in this workspace’s browser storage; sent only to the relay.'}>
              <PasswordInput id="j-token" value={form.api_token} placeholder={app.api_token_set ? '••••••••••••' : ''} onChange={(e) => set('api_token', e.target.value)} disabled={!canManage} invalid={Boolean(errors.api_token)} autoComplete="off" />
            </Field>
            <Field label="Project key" htmlFor="j-proj" required error={errors.project_key}>
              <Input id="j-proj" value={form.project_key} placeholder="SEC" onChange={(e) => set('project_key', e.target.value.toUpperCase())} disabled={!canManage} invalid={Boolean(errors.project_key)} className="font-mono" />
            </Field>
            <Field label="Issue type" htmlFor="j-type">
              <Select
                id="j-type"
                value={form.issue_type}
                onChange={(e) => set('issue_type', e.target.value)}
                disabled={!canManage}
                options={[...new Set([...(tested?.issue_types ?? []), 'Bug', 'Task', 'Incident', 'Story', form.issue_type])].map((t) => ({ value: t, label: t }))}
              />
            </Field>
            <Field className="sm:col-span-2" label="Labels" htmlFor="j-labels" hint="Added to every issue, as well as one for the alert kind.">
              <Input id="j-labels" value={form.labels} onChange={(e) => set('labels', e.target.value)} disabled={!canManage} />
            </Field>
          </div>
          {tested?.ok && (
            <p className="mt-3 flex items-center gap-2 rounded-[var(--radius-control)] bg-low-soft px-3 py-2 text-[12.5px] text-low">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              {tested.project_name ?? form.project_key} · signed in as {tested.account_name ?? form.email}
            </p>
          )}
          {tested && !tested.ok && <p className="mt-3 rounded-[var(--radius-control)] bg-critical-soft px-3 py-2 text-[12.5px] text-critical">{tested.message}</p>}
        </Panel>

        <Panel>
          <PanelHeader title="Which alerts, at what priority" subtitle="Only alerts that match open an issue." />
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Severity" htmlFor="j-sev">
              <Select id="j-sev" value={form.min_severity} onChange={(e) => set('min_severity', e.target.value)} disabled={!canManage} options={SEVERITY_OPTIONS} />
            </Field>
            <fieldset>
              <legend className="text-[12.5px] font-medium text-ink-2">Kinds of alert</legend>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {EVENT_KINDS.map((k) => (
                  <label key={k.key} className={cn('flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border px-3 py-2 text-[12.5px]', form.events[k.key] ? 'border-brand/40 bg-info-soft/40 text-ink' : 'border-line text-ink-2')}>
                    <input type="checkbox" className="accent-[var(--t-brand)]" checked={Boolean(form.events[k.key])} disabled={!canManage} onChange={(e) => set('events', { ...form.events, [k.key]: e.target.checked })} />
                    {k.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-[12.5px] font-medium text-ink-2">Jira priority for each severity</legend>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {SEVERITIES.map((s) => (
                  <label key={s} className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-[12.5px] text-ink-2">
                    <span className="flex items-center gap-2">
                      <SevDot severity={s} />
                      {s[0] + s.slice(1).toLowerCase()}
                    </span>
                    <select className="rounded border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink" value={form.priority_map[s] ?? ''} disabled={!canManage} onChange={(e) => set('priority_map', { ...form.priority_map, [s]: e.target.value })} aria-label={`Jira priority for ${s.toLowerCase()} alerts`}>
                      {PRIORITIES.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Panel>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" loading={saving} onClick={save}>
            Save
          </Button>
          <Button variant="secondary" icon={PlugZap} loading={testing === 'connection'} onClick={test}>
            Test connection
          </Button>
          <Button variant="secondary" icon={Ticket} loading={testing === 'issue'} onClick={testIssue}>
            Create a test issue
          </Button>
        </div>
      )}

      <Panel>
        <PanelHeader title="Recently created" subtitle="Issues opened or updated for alerts, newest first." />
        <div className="mt-3">
          <DeliveryLog rows={log.data} empty="No issues yet. Matching alerts open one here the moment they are raised." />
        </div>
      </Panel>
    </>
  );
}
