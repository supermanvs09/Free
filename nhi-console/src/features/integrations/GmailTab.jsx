import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Mail, Send, X } from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { fetchDeliveries, saveAppSettings } from '../../lib/api/hub';
import { useQuery } from '../../lib/hooks';
import { relayHealth, sendEmail } from '../../lib/notify';
import { emailFor, recordDelivery, testEvent } from '../../lib/local/notifyBus';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Field';
import { Panel, PanelHeader } from '../../ui/Panel';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { AppHeader, DeliveryLog, EVENT_KINDS, SEVERITY_OPTIONS } from './hubParts';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Real-time alert email. The From address and the sending account are the
 * relay's (set in its environment); who receives alerts, and which alerts,
 * is set here.
 */
export function GmailTab({ app, canManage }) {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const { notify } = useToast();
  const health = useQuery(() => relayHealth(), []);
  const log = useQuery((signal) => fetchDeliveries('gmail', signal), []);
  const [recipients, setRecipients] = useState(app.recipients ?? []);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [minSeverity, setMinSeverity] = useState(app.min_severity ?? 'HIGH');
  const [events, setEvents] = useState(app.events ?? {});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { refetch: refetchLog } = log;
  useEffect(() => {
    const refresh = () => setTimeout(refetchLog, 1500);
    window.addEventListener('alerts:refresh', refresh);
    return () => window.removeEventListener('alerts:refresh', refresh);
  }, [refetchLog]);

  const dirty =
    JSON.stringify(recipients) !== JSON.stringify(app.recipients ?? []) || minSeverity !== app.min_severity || JSON.stringify(events) !== JSON.stringify(app.events ?? {});

  const add = (raw = draft) => {
    const parts = String(raw)
      .split(/[\s,;]+/)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    const bad = parts.find((p) => !EMAIL.test(p));
    if (bad) {
      setDraftError(`${bad} is not an email address.`);
      return;
    }
    setRecipients((list) => [...new Set([...list, ...parts])]);
    setDraft('');
    setDraftError('');
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveAppSettings('gmail', { recipients, min_severity: minSeverity, events });
      await workspace.refreshApps();
      notify({ variant: 'success', title: 'Alert email saved', description: recipients.length ? `${recipients.length} ${recipients.length === 1 ? 'person gets' : 'people get'} matching alerts as they happen.` : 'No one is on the list yet.' });
    } catch (error) {
      notify({ variant: 'error', title: 'Could not save', description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    const to = recipients.length ? recipients : [user?.email].filter(Boolean);
    setTesting(true);
    const event = testEvent();
    const mail = emailFor(event);
    const res = await sendEmail({ to, ...mail, subject: `[Test] ${mail.subject}` });
    recordDelivery({ channel: 'gmail', event_id: event.id, title: 'Test email', severity: 'LOW', to: to.join(', '), status: res.ok ? 'sent' : 'failed', message: res.ok ? `Sent (SES message ${res.message_id ?? ''})`.trim() : res.message });
    setTesting(false);
    log.refetch();
    if (res.ok) notify({ variant: 'success', title: 'Test email sent', description: `To ${to.join(', ')} from ${res.from ?? health.data?.from ?? 'the configured sender'}.` });
    else notify({ variant: 'error', title: 'The test email was not sent', description: res.message });
  };

  const relay = health.data;
  const relayOk = relay?.ok;

  return (
    <>
      <Panel>
        <AppHeader app={app}>Alerts are emailed the moment they are raised, to the people you list here. Email is delivered through Amazon SES from the address your administrator configured.</AppHeader>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Who gets alerts" subtitle="Anyone with an email address: a person, a team list or an on-call alias." />
            <div className="mt-4 flex flex-col gap-3">
              <Field label="Add recipients" htmlFor="gm-to" hint="Paste several at once, separated by commas or spaces." error={draftError}>
                <div className="flex gap-2">
                  <Input
                    id="gm-to"
                    icon={Mail}
                    value={draft}
                    placeholder="name@company.com"
                    disabled={!canManage}
                    invalid={Boolean(draftError)}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setDraftError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        add();
                      }
                    }}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData('text');
                      if (/[,;\s]/.test(text.trim())) {
                        e.preventDefault();
                        add(text);
                      }
                    }}
                  />
                  <Button variant="secondary" onClick={() => add()} disabled={!canManage || !draft.trim()}>
                    Add
                  </Button>
                </div>
              </Field>
              {recipients.length === 0 ? (
                <p className="rounded-[var(--radius-control)] border border-dashed border-line px-3 py-3 text-[12.5px] text-ink-3">
                  No one is on the list. Add at least one address to start receiving alerts.
                  {user?.email && canManage && (
                    <button type="button" className="ml-1 font-medium text-brand hover:underline" onClick={() => setRecipients([user.email])}>
                      Add {user.email}
                    </button>
                  )}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5" aria-label="Recipients">
                  {recipients.map((r) => (
                    <li key={r} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 py-0.5 pr-1 pl-2.5 text-[12.5px] text-ink">
                      {r}
                      {canManage && (
                        <button type="button" aria-label={`Remove ${r}`} onClick={() => setRecipients((list) => list.filter((x) => x !== r))} className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink">
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Which alerts" subtitle="Only alerts that match both are emailed." />
            <div className="mt-4 grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)]">
              <Field label="Severity" htmlFor="gm-sev">
                <Select id="gm-sev" value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)} disabled={!canManage} options={SEVERITY_OPTIONS} />
              </Field>
              <fieldset>
                <legend className="text-[12.5px] font-medium text-ink-2">Kinds of alert</legend>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                  {EVENT_KINDS.map((k) => (
                    <label key={k.key} className={cn('flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border px-3 py-2', events[k.key] ? 'border-brand/40 bg-info-soft/40' : 'border-line')}>
                      <input type="checkbox" className="mt-0.5 accent-[var(--t-brand)]" checked={Boolean(events[k.key])} disabled={!canManage} onChange={(e) => setEvents((v) => ({ ...v, [k.key]: e.target.checked }))} />
                      <span>
                        <span className="block text-[12.5px] font-medium text-ink">{k.label}</span>
                        <span className="block text-[11.5px] text-ink-3">{k.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            {canManage && (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>
                  Save
                </Button>
                <Button variant="secondary" icon={Send} loading={testing} onClick={sendTest}>
                  Send a test email
                </Button>
                {dirty && <span className="text-[12px] text-medium">Unsaved changes</span>}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recently sent" subtitle="Every alert email, newest first." />
            <div className="mt-3">
              <DeliveryLog rows={log.data} empty="Nothing sent yet. Matching alerts appear here the moment they are emailed." />
            </div>
          </Panel>
        </div>

        <Panel className="h-fit">
          <PanelHeader title="Sender" subtitle="Set by your administrator in the console’s environment." />
          <div className="mt-4">
            {health.isLoading ? (
              <p className="text-[12.5px] text-ink-3">Checking the mail relay…</p>
            ) : relayOk ? (
              <dl className="flex flex-col gap-2.5 text-[12.5px]">
                <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-low-soft px-3 py-2 text-low">
                  <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  Ready to send through Amazon SES.
                </div>
                <Row k="From" v={relay.from} mono />
                <Row k="SES region" v={relay.region} />
                <Row k="Signed with" v={relay.credentials === 'role' ? 'The service’s IAM role' : relay.credentials === 'env' ? 'Access keys in the environment' : relay.credentials} />
                {relay.allowed_domains?.length > 0 && <Row k="Allowed recipients" v={relay.allowed_domains.map((d) => `@${d}`).join(', ')} />}
              </dl>
            ) : (
              <div className="flex flex-col gap-2.5 text-[12.5px]">
                <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-medium-soft px-3 py-2 text-medium">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>{relay?.message || 'The mail relay is not answering.'}</span>
                </div>
                <p className="leading-relaxed text-ink-3">
                  Email leaves through the notification relay that runs next to the console. Start it with <code className="rounded bg-surface-3 px-1 font-mono text-[11.5px]">MAIL_FROM</code> and <code className="rounded bg-surface-3 px-1 font-mono text-[11.5px]">AWS_REGION</code> set, on a service whose role may call <code className="rounded bg-surface-3 px-1 font-mono text-[11.5px]">ses:SendEmail</code>.
                </p>
                <Button variant="secondary" size="sm" onClick={() => health.refetch()}>
                  Check again
                </Button>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-line pb-2 last:border-0">
      <dt className="text-ink-3">{k}</dt>
      <dd className={cn('min-w-0 truncate text-right text-ink', mono && 'font-mono text-[12px]')} title={String(v ?? '')}>
        {v || '-'}
      </dd>
    </div>
  );
}
