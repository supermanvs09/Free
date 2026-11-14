import { useState } from 'react';
import { Pencil, Play, Plus, Trash2, Workflow } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { Modal } from '../../ui/Overlay';
import { EmptyState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { actions, matchRule, useView } from '../../data/store';
import { PROVIDERS, RULES, SOURCE_PROVIDERS } from '../../data/world';
import { AppLogo } from '../../components/Logo';
import { PersonName, SeverityTag } from '../../components/bits';
import { cn } from '../../ui/cn';

const KINDS = [['finding', 'Posture findings'], ['detection', 'Detections'], ['exposure', 'Leaked secrets']];
const SEVS = ['critical', 'high', 'medium', 'low'];

export default function AutomationsPage() {
  const view = useView();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [running, setRunning] = useState(null);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Automations" lede="Route what the console finds to the right people: open Jira issues and send mail when something matches." actions={<Button variant="primary" icon={Plus} onClick={() => setEditing({ name: '', when: { kinds: ['finding'], severity: ['critical'] }, actions: { jira: { project: 'SEC', priority: 'High' }, email: [] }, enabled: true })}>New automation</Button>} />
      {view.rules.length === 0 && <Panel><EmptyState icon={Workflow} title="No automations" description="Create one to send critical findings to Jira automatically." /></Panel>}
      <div className="grid gap-3">
        {view.rules.map((r) => {
          const matches = matchRule(r, view);
          const untracked = matches.filter((m) => !m.record.ticketKey).length;
          return (
            <Panel key={r.id} className={cn(!r.enabled && 'opacity-70')}>
              <div className="flex flex-wrap items-start gap-4">
                <label className="relative mt-0.5 inline-flex cursor-pointer items-center" title={r.enabled ? 'On' : 'Off'}>
                  <input type="checkbox" className="peer sr-only" checked={r.enabled} onChange={() => actions.saveRule({ ...r, enabled: !r.enabled })} aria-label={`${r.name} ${r.enabled ? 'on' : 'off'}`} />
                  <span className="h-5 w-9 rounded-full bg-line-strong transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40" />
                  <span className="absolute left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </label>
                <div className="min-w-0 flex-1 basis-80">
                  <p className="text-[14.5px] font-semibold text-ink">{r.name}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
                    <span className="font-semibold text-ink-3">When</span>
                    {(r.when.kinds || []).map((k) => <span key={k} className="rounded-md bg-surface-3 px-1.5 py-0.5">{KINDS.find((x) => x[0] === k)?.[1]}</span>)}
                    {(r.when.severity || []).map((s) => <SeverityTag key={s} severity={s} />)}
                    {(r.when.environment || []).map((e) => <span key={e} className="rounded-md bg-surface-3 px-1.5 py-0.5">in {e}</span>)}
                    {(r.when.providers || []).map((p) => <AppLogo key={p} name={PROVIDERS[p].logo} size={18} />)}
                    {(r.when.rules || []).map((id) => <span key={id} className="rounded-md bg-surface-3 px-1.5 py-0.5">{RULES.find((x) => x.id === id)?.title}</span>)}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-2">
                    <span className="font-semibold text-ink-3">Then</span>
                    {r.actions?.jira && <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5"><AppLogo name="jira" size={16} />Open {r.actions.jira.priority} issue in {r.actions.jira.project}</span>}
                    {r.actions?.email?.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5"><AppLogo name="gmail" size={16} />Email {r.actions.email.join(', ')}</span>}
                  </p>
                  <p className="mt-2 text-[11.5px] text-ink-3">Created by <PersonName refId={r.createdBy} /> · {matches.length} open item{matches.length === 1 ? '' : 's'} match now{untracked ? `, ${untracked} without an issue` : ''}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" icon={Play} loading={running === r.id} disabled={!untracked} onClick={async () => { setRunning(r.id); const res = await actions.runRule(r.id); setRunning(null); toast.notify({ variant: 'success', title: `Ran "${r.name}"`, description: `${res.tickets} Jira issue${res.tickets === 1 ? '' : 's'} opened, ${res.mails} email${res.mails === 1 ? '' : 's'} sent.` }); }}>Run on {Math.min(untracked, 5)}</Button>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(r)} aria-label="Edit">Edit</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => actions.deleteRule(r.id)} aria-label="Delete" />
                </div>
              </div>
            </Panel>
          );
        })}
      </div>
      {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Chip({ on, onClick, children }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium', on ? 'border-brand bg-info-soft text-brand' : 'border-line text-ink-2 hover:border-line-strong')}>{children}</button>;
}
const toggle = (list = [], v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function RuleEditor({ rule, onClose }) {
  const [r, setR] = useState(rule);
  const [emails, setEmails] = useState((rule.actions?.email || []).join(', '));
  const [jiraOn, setJiraOn] = useState(Boolean(rule.actions?.jira));
  const set = (patch) => setR({ ...r, ...patch });
  const when = r.when || {};
  const save = async () => {
    await actions.saveRule({ ...r, actions: { jira: jiraOn ? { project: 'SEC', priority: r.actions?.jira?.priority || 'High' } : null, email: emails.split(/[,\s]+/).filter(Boolean) } });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={rule.id ? 'Edit automation' : 'New automation'} icon={Workflow} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!r.name.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" htmlFor="ru-name" required><Input id="ru-name" value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder="Critical findings to on-call" autoFocus /></Field>
        <Field label="When a new">
          <div className="flex flex-wrap gap-1.5">{KINDS.map(([k, l]) => <Chip key={k} on={(when.kinds || []).includes(k)} onClick={() => set({ when: { ...when, kinds: toggle(when.kinds, k) } })}>{l}</Chip>)}</div>
        </Field>
        <Field label="Is this severe">
          <div className="flex flex-wrap gap-1.5">{SEVS.map((s) => <Chip key={s} on={(when.severity || []).includes(s)} onClick={() => set({ when: { ...when, severity: toggle(when.severity, s) } })}>{s[0].toUpperCase() + s.slice(1)}</Chip>)}</div>
        </Field>
        <Field label="In these applications" hint="None selected means all.">
          <div className="flex flex-wrap gap-1.5">{SOURCE_PROVIDERS.map((p) => <Chip key={p} on={(when.providers || []).includes(p)} onClick={() => set({ when: { ...when, providers: toggle(when.providers, p) } })}><AppLogo name={PROVIDERS[p].logo} size={16} />{PROVIDERS[p].short}</Chip>)}</div>
        </Field>
        <Field label="Environment" hint="None selected means all.">
          <div className="flex flex-wrap gap-1.5">{['prod', 'staging', 'dev'].map((e) => <Chip key={e} on={(when.environment || []).includes(e)} onClick={() => set({ when: { ...when, environment: toggle(when.environment, e) } })}>{e}</Chip>)}</div>
        </Field>
        <div className="space-y-2 rounded-[12px] border border-line p-3">
          <label className="flex items-center gap-2.5 text-[13px] font-medium text-ink"><input type="checkbox" checked={jiraOn} onChange={(e) => setJiraOn(e.target.checked)} className="size-4 accent-[var(--t-brand)]" /><AppLogo name="jira" size={20} />Open a Jira issue in SEC</label>
          {jiraOn && (
            <div className="flex flex-wrap gap-1.5 pl-7">{['Highest', 'High', 'Medium'].map((p) => <Chip key={p} on={(r.actions?.jira?.priority || 'High') === p} onClick={() => set({ actions: { ...r.actions, jira: { project: 'SEC', priority: p } } })}>{p}</Chip>)}</div>
          )}
        </div>
        <Field label={<span className="inline-flex items-center gap-2"><AppLogo name="gmail" size={18} />Email</span>} htmlFor="ru-email" hint="Addresses, or owner to mail the identity's owner.">
          <Input id="ru-email" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="secops@corvane.io, owner" />
        </Field>
      </div>
    </Modal>
  );
}
