import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Mail, Send, X } from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { fetchDeliveries, saveAppSettings } from '../../lib/api/hub';
import { useQuery } from '../../lib/hooks';
import { relayHealth, sendEmail } from '../../lib/notify';
import { emailFor, recordDelivery, testEvent } from '../../lib/local/notifyBus';
import { Button } from '../../ui/Button';
import { Field, Input, PasswordInput, Select } from '../../ui/Field';
import { isShared } from '../../lib/local/state';
import { Panel, PanelHeader } from '../../ui/Panel';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { AppHeader, DeliveryLog, EVENT_KINDS, SEVERITY_OPTIONS } from './hubParts';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Real-time alert email, sent from a Gmail or Google Workspace account (an
 * app password, kept on the server) - or from the sender set in the server's
 * environment (SMTP or Amazon SES). Who receives alerts, and which, is set here.
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
    recordDelivery({ channel: 'gmail', event_id: event.id, title: 'Test email', severity: 'LOW', to: to.join(', '), status: res.ok ? 'sent' : 'failed', message: res.ok ? `Delivered via ${res.via === 'ses' ? 'Amazon SES' : 'Gmail'}${res.from ? ` from ${res.from}` : ''}` : res.message });
    setTesting(false);
    log.refetch();
    if (res.ok) notify({ variant: 'success', title: 'Test email sent', description: `To ${to.join(', ')} from ${res.from ?? health.data?.from ?? 'the configured sender'}.` });
    else notify({ variant: 'error', title: 'The test email was not sent', description: res.message });
  };


  return (
    <>
      <Panel>
        <AppHeader app={app}>Alerts are emailed the moment they are raised, to the people you list here, from your Gmail or Google Workspace sender.</AppHeader>
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

        <SenderPanel app={app} health={health} canManage={canManage} />
      </div>
    </>
  );
}

const APP_PASSWORDS = 'https://myaccount.google.com/apppasswords';

/** Where alert email is sent from: set here (Gmail + app password) or on the server. */
function SenderPanel({ app, health, canManage }) {
  const workspace = useWorkspace();
  const { notify } = useToast();
  const relay = health.data;
  const fromServer = relay?.ok && relay.sender_source === 'environment';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ sender_email: app.sender_email ?? '', sender_name: app.sender_name ?? '', app_password: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const configured = Boolean(app.sender_email && app.app_password_set);
  const showForm = canManage && !fromServer && (editing || !configured);

  const saveSender = async () => {
    const e = {};
    if (!EMAIL.test(form.sender_email.trim())) e.sender_email = 'Enter the Gmail or Google Workspace address alerts are sent from.';
    const pw = form.app_password.replace(/\s+/g, '');
    if (!pw && !app.app_password_set) e.app_password = 'Paste the 16-letter app password.';
    else if (pw && pw.length !== 16) e.app_password = 'An app password is exactly 16 letters (spaces are fine).';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await saveAppSettings('gmail', { sender_email: form.sender_email.trim(), sender_name: form.sender_name.trim(), ...(pw ? { app_password: pw } : {}) });
      await workspace.refreshApps();
      setForm((f) => ({ ...f, app_password: '' }));
      setEditing(false);
      setTimeout(() => health.refetch(), 400);
      notify({ variant: 'success', title: 'Sender saved', description: `Alerts will be sent from ${form.sender_email.trim()}. Send a test email to check it.` });
    } catch (error) {
      notify({ variant: 'error', title: 'Could not save the sender', description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  const removeSender = async () => {
    setSaving(true);
    try {
      await saveAppSettings('gmail', { clear_sender: true });
      await workspace.refreshApps();
      setForm({ sender_email: '', sender_name: '', app_password: '' });
      setTimeout(() => health.refetch(), 400);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="h-fit">
      <PanelHeader title="Sender" subtitle={fromServer ? 'Set on the server this console runs on.' : 'The Google account alert email is sent from.'} />
      <div className="mt-4 flex flex-col gap-3 text-[12.5px]">
        {health.isLoading && !relay ? (
          <p className="text-ink-3">Checking the sender…</p>
        ) : relay?.ok ? (
          <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-low-soft px-3 py-2 text-low">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>Ready. Alerts go out from <b className="font-semibold">{relay.from}</b> via {relay.via === 'ses' ? 'Amazon SES' : 'Gmail'}.</span>
          </div>
        ) : relay && !relay.unreachable ? (
          <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-medium-soft px-3 py-2 text-medium">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>No sender yet. Connect a Google account below to start sending.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-[var(--radius-control)] bg-medium-soft px-3 py-2 text-medium">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{relay?.message || 'The mail service is not answering.'}</span>
          </div>
        )}

        {fromServer && (
          <dl className="flex flex-col gap-2.5">
            <Row k="From" v={relay.from} mono />
            <Row k="Delivered by" v={relay.via === 'ses' ? `Amazon SES (${relay.region})` : relay.smtp_host || 'Gmail'} />
            {relay.allowed_domains?.length > 0 && <Row k="Allowed recipients" v={relay.allowed_domains.map((d) => `@${d}`).join(', ')} />}
          </dl>
        )}

        {!fromServer && configured && !showForm && (
          <>
            <dl className="flex flex-col gap-2.5">
              <Row k="From" v={app.sender_email} mono />
              {app.sender_name && <Row k="Name" v={app.sender_name} />}
              <Row k="App password" v="Saved on the server" />
            </dl>
            {canManage && (
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  Change
                </Button>
                <Button variant="ghost" size="sm" loading={saving} onClick={removeSender}>
                  Remove
                </Button>
              </div>
            )}
          </>
        )}

        {showForm && (
          <div className="flex flex-col gap-3">
            <Field label="Gmail address" htmlFor="gm-from" required error={errors.sender_email}>
              <Input id="gm-from" icon={Mail} value={form.sender_email} placeholder="alerts@yourcompany.com" autoComplete="off" invalid={Boolean(errors.sender_email)} onChange={(e) => setForm((f) => ({ ...f, sender_email: e.target.value }))} />
            </Field>
            <Field label="Display name" htmlFor="gm-name" hint="Shown as the sender in the inbox.">
              <Input id="gm-name" value={form.sender_name} placeholder="NHI Security" onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))} />
            </Field>
            <Field
              label="App password"
              htmlFor="gm-pass"
              required={!app.app_password_set}
              error={errors.app_password}
              hint={app.app_password_set ? 'One is saved. Paste a new one to replace it.' : isShared() ? 'Kept on the server only - never sent to anyone’s browser.' : 'Kept in this browser only.'}
            >
              <PasswordInput id="gm-pass" value={form.app_password} placeholder={app.app_password_set ? '•••• •••• •••• ••••' : 'abcd efgh ijkl mnop'} autoComplete="new-password" invalid={Boolean(errors.app_password)} onChange={(e) => setForm((f) => ({ ...f, app_password: e.target.value }))} />
            </Field>
            <ol className="list-decimal space-y-1 rounded-[var(--radius-control)] bg-surface-2 py-2.5 pr-3 pl-7 text-[12px] leading-relaxed text-ink-3">
              <li>Turn on 2-Step Verification for the Google account.</li>
              <li>
                Open{' '}
                <a href={APP_PASSWORDS} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand hover:underline">
                  App passwords <ExternalLink aria-hidden="true" className="size-3" />
                </a>
                , name it “NHI alerts” and create it.
              </li>
              <li>Paste the 16 letters here, save, then send a test email.</li>
            </ol>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" loading={saving} onClick={saveSender}>
                Save sender
              </Button>
              {configured && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
        {!canManage && !configured && !fromServer && <p className="text-ink-3">An admin connects the Google account alerts are sent from.</p>}
      </div>
    </Panel>
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
