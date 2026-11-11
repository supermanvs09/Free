import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Loader2, RefreshCw, RotateCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { MANAGE_LOCK, useAuth } from '../auth';
import { api } from '../lib/api';
import { GUIDES } from '../lib/guides';
import { useApi } from '../lib/useApi';
import { timeAgo } from '../lib/format';
import { Button } from '../ui/Button';
import { CopyButton } from '../ui/Copyable';
import { Field, Input, PasswordInput, Textarea } from '../ui/Field';
import { MARKS } from '../ui/Marks';
import { Drawer, Modal } from '../ui/Overlay';
import { PageHeader } from '../ui/Page';
import { Panel, SectionLabel } from '../ui/Panel';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/States';
import { ConnectionStatus } from '../ui/Status';
import { Code } from '../ui/Tag';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';

const KINDS = ['github', 'bitbucket', 'jenkins'];

function absolute(url) {
  return url?.startsWith('/') ? `${window.location.origin}${url}` : url;
}

function Checks({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className="flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line">
      {checks.map((c) => (
        <li key={c.name} className="flex gap-2.5 px-3 py-2.5">
          {c.ok ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" /> : <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-critical" />}
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-ink">{c.name}</span>
            {c.detail && <span className={cn('block text-[12.5px]', c.ok ? 'text-ink-3' : 'text-critical')}>{c.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StepList({ steps }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-info-soft text-[12.5px] font-bold text-brand">{i + 1}</span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[13.5px] font-semibold text-ink">{s.title}</p>
            {s.list && (
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[13px] text-ink-2 marker:text-ink-3">
                {s.list.map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
            {s.note && <p className="mt-2 text-[12.5px] text-ink-3">{s.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StartTab({ guide }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13.5px] text-ink-2">{guide.summary}</p>
      <div className="grid gap-3 @md:grid-cols-2">
        <div className="rounded-[var(--radius-control)] border border-line p-3.5">
          <SectionLabel>What you get</SectionLabel>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-2">
            {guide.unlocks.map((u) => <li key={u} className="flex gap-2"><ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-low" />{u}</li>)}
          </ul>
        </div>
        <div className="rounded-[var(--radius-control)] border border-line p-3.5">
          <SectionLabel>You need</SectionLabel>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-4 text-[13px] text-ink-2">{guide.prerequisites.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      </div>
      <div>
        <SectionLabel>Access it asks for</SectionLabel>
        <div className="mt-2 overflow-x-auto rounded-[var(--radius-control)] border border-line">
          <table className="w-full min-w-[26rem] text-left text-[12.5px]">
            <thead className="bg-surface-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
              <tr>{guide.permissions.columns.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {guide.permissions.rows.map((row) => (
                <tr key={row[0]}>{row.map((cell, i) => <td key={i} className={cn('px-3 py-2', i === 0 ? 'font-medium text-ink' : 'text-ink-2')}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">{guide.permissions.note}</p>
      </div>
      <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><Clock3 aria-hidden="true" className="size-3.5" />About {guide.minutes} minutes. Source code and full secret values are never stored.</p>
    </div>
  );
}

function ConnectTab({ kind, guide, connection, onSaved }) {
  const { canManage } = useAuth();
  const { notify } = useToast();
  const [values, setValues] = useState(() => Object.fromEntries(guide.fields.map((f) => [f.key, connection.config?.[f.key] ?? ''])));
  const [secret, setSecret] = useState('');
  const [ca, setCa] = useState(null); // null: leave the saved one alone
  const [showCa, setShowCa] = useState(connection.has_ca_cert);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = canManage ? undefined : MANAGE_LOCK;

  async function save(event) {
    event.preventDefault();
    setError('');
    const missing = guide.fields.find((f) => !f.optional && !String(values[f.key]).trim());
    if (missing) return setError(`Enter the ${missing.label.toLowerCase()}.`);
    if (!secret && !connection.has_secret) return setError(`Paste the ${guide.secret.label.toLowerCase()}.`);
    setBusy(true);
    try {
      const body = { ...values, secret };
      if (ca !== null) body.ca_cert = ca;
      const data = await api(`/connections/${kind}`, { method: 'PUT', body });
      setSecret('');
      onSaved(data.connection);
      notify(
        data.connection.status === 'connected'
          ? { variant: 'success', title: `${guide.name} connected`, description: connection.last_sync_at ? undefined : 'The first scan has started.' }
          : { variant: 'error', title: 'Saved, but a check failed', description: 'The checks below say what to fix.' },
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const savedHint = connection.has_secret ? 'Saved and encrypted. Leave blank to keep it; paste a new one to replace it.' : guide.secret.hint;
  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      {!canManage && <p className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-[12.5px] text-ink-3">{MANAGE_LOCK}</p>}
      {connection.status === 'failing' && (
        <div role="alert" className="rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft px-3.5 py-3">
          <p className="text-[13px] font-semibold text-critical">The last test failed. Fix this and test again:</p>
          {connection.checks.filter((c) => !c.ok).map((c) => (
            <p key={c.name} className="mt-1 text-[12.5px] text-ink-2"><span className="font-medium text-ink">{c.name}:</span> {c.detail}</p>
          ))}
        </div>
      )}
      {guide.fields.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`f-${f.key}`} hint={f.hint} required={!f.optional}>
          <Input id={`f-${f.key}`} value={values[f.key]} placeholder={f.placeholder} inputMode={f.inputMode} disabled={!canManage} autoComplete="off" spellCheck="false"
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
        </Field>
      ))}
      <Field label={guide.secret.label} htmlFor="f-secret" hint={savedHint} required={!connection.has_secret}>
        {guide.secret.multiline ? (
          <Textarea id="f-secret" rows={5} value={secret} disabled={!canManage} spellCheck="false" className="font-mono text-[12px]"
            placeholder={connection.has_secret ? 'Saved · paste a new key to replace it' : guide.secret.placeholder} onChange={(e) => setSecret(e.target.value)} />
        ) : (
          <PasswordInput id="f-secret" value={secret} disabled={!canManage} autoComplete="off"
            placeholder={connection.has_secret ? 'Saved · paste a new one to replace it' : guide.secret.placeholder} onChange={(e) => setSecret(e.target.value)} />
        )}
      </Field>
      {guide.caCert && (
        showCa ? (
          <Field label="CA certificate (optional)" htmlFor="f-ca" hint={connection.has_ca_cert && ca === null ? 'A CA certificate is saved. Paste a new one to replace it.' : 'Only when the server’s certificate is signed by your own certificate authority.'}>
            <Textarea id="f-ca" rows={4} value={ca ?? ''} disabled={!canManage} spellCheck="false" className="font-mono text-[12px]" placeholder="-----BEGIN CERTIFICATE-----" onChange={(e) => setCa(e.target.value)} />
            {connection.has_ca_cert && canManage && (
              <button type="button" className="self-start text-[12px] text-ink-3 underline underline-offset-2 hover:text-critical" onClick={() => setCa('')}>Remove the saved CA certificate on save</button>
            )}
          </Field>
        ) : (
          <button type="button" className="self-start text-[12.5px] font-medium text-brand hover:underline" onClick={() => setShowCa(true)} disabled={!canManage}>
            Uses a private certificate authority? Add its CA certificate
          </button>
        )
      )}
      {error && <p role="alert" className="text-[12.5px] font-medium text-critical">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={busy} locked={lock} icon={ShieldCheck}>{connection.status === 'not_configured' ? 'Save and test' : 'Save and test again'}</Button>
        {busy && <span className="text-[12.5px] text-ink-3">Testing against {guide.name}…</span>}
      </div>
      {connection.checks?.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionLabel>Last test {connection.verified_at && `· ${timeAgo(connection.verified_at)}`}</SectionLabel>
          <Checks checks={connection.checks} />
        </div>
      )}
    </form>
  );
}

function WebhookTab({ kind, guide, connection, onSaved }) {
  const { canManage } = useAuth();
  const { notify } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const hook = connection.webhook;

  async function rotate() {
    setBusy(true);
    try {
      const data = await api(`/connections/${kind}/webhook-secret`, { method: 'POST' });
      onSaved(data.connection);
      notify({ variant: 'success', title: 'New webhook secret', description: `Paste it into ${guide.name} now: deliveries signed with the old one are refused.` });
    } catch (err) {
      notify({ variant: 'error', title: 'Not changed', description: err.message });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  if (!canManage) return <p className="text-[13px] text-ink-3">The webhook address and secret are shown to admins and analysts, who set them in {guide.name}.</p>;
  if (!hook) return <p className="text-[13px] text-ink-3">Save the connection on the Connect tab first: the webhook address and secret are created then.</p>;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13.5px] text-ink-2">{guide.webhook.intro}</p>
      <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line bg-surface-2 p-3.5">
        <div>
          <SectionLabel>{kind === 'jenkins' ? 'Endpoint URL' : 'Webhook URL'}</SectionLabel>
          <div className="mt-1.5 flex items-center gap-2">
            <Code className="min-w-0 flex-1 !py-1.5">{kind === 'jenkins' ? absolute(hook.url).replace(/[^/]{12}$/, '••••••••••••') : absolute(hook.url)}</Code>
            <CopyButton value={absolute(hook.url)} label="Copy URL" />
          </div>
        </div>
        {hook.secret && (
          <div>
            <SectionLabel>{guide.webhook.field}</SectionLabel>
            <div className="mt-1.5 flex items-center gap-2">
              <Code className="min-w-0 flex-1 !py-1.5">{'•'.repeat(24)}</Code>
              <CopyButton value={hook.secret} label="Copy secret" />
            </div>
          </div>
        )}
      </div>
      <StepList steps={[{ title: `In ${guide.name}`, list: guide.webhook.list, note: guide.webhook.note }]} />
      <p className="text-[12.5px] text-ink-3">Check it arrived: Webhook activity lists every delivery and why any was refused.</p>
      <div>
        <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => setConfirm(true)}>{kind === 'jenkins' ? 'New address' : 'New secret'}</Button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title={kind === 'jenkins' ? 'Make a new webhook address?' : 'Make a new webhook secret?'} tone="critical"
        description={`The old one stops working at once. Deliveries fail until you paste the new value into ${guide.name}.`}
        footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" loading={busy} onClick={rotate}>Make a new one</Button></>} />
    </div>
  );
}

const TABS = [
  ['start', 'Before you start'],
  ['steps', 'Steps'],
  ['connect', 'Connect'],
  ['webhook', 'Webhook'],
];

function SetupDrawer({ kind, connection, onClose, onChanged }) {
  const guide = GUIDES[kind];
  const Mark = MARKS[kind];
  const [tab, setTab] = useState(connection.status === 'not_configured' ? 'start' : 'connect');
  const index = TABS.findIndex(([k]) => k === tab);
  const tabLabel = (k, l) => (k === 'steps' ? `In ${guide.name.split(' ')[0]}` : l);
  return (
    <Drawer open onClose={onClose} width="lg" eyebrow={guide.kind} title={`Connect ${guide.name}`}
      header={
        <div className="mt-3 flex items-center gap-2">
          <Mark size="sm" />
          <ConnectionStatus status={connection.status} size="sm" />
          {connection.sync_status === 'running' && <span className="flex items-center gap-1 text-[12px] text-ink-3"><Loader2 aria-hidden="true" className="size-3 animate-spin" />{connection.sync_detail}</span>}
        </div>
      }
      footer={
        <>
          {index > 0 && <Button icon={ArrowLeft} onClick={() => setTab(TABS[index - 1][0])}>Back</Button>}
          {index < TABS.length - 1 ? (
            <Button variant="primary" iconRight={ArrowRight} onClick={() => setTab(TABS[index + 1][0])}>Next: {tabLabel(...TABS[index + 1])}</Button>
          ) : (
            <Button variant="primary" onClick={onClose}>Done</Button>
          )}
        </>
      }
    >
      <div role="tablist" aria-label="Setup" className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 pt-1 sm:px-4">
        {TABS.map(([k, l], i) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-[13px] font-medium whitespace-nowrap', tab === k ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink')}>
            <span className={cn('grid size-5 place-items-center rounded-full text-[11px]', tab === k ? 'bg-brand text-white' : 'bg-surface-3 text-ink-3')}>{i + 1}</span>
            {tabLabel(k, l)}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-5">
        {tab === 'start' && <StartTab guide={guide} />}
        {tab === 'steps' && <StepList steps={guide.steps} />}
        {tab === 'connect' && <ConnectTab kind={kind} guide={guide} connection={connection} onSaved={onChanged} />}
        {tab === 'webhook' && <WebhookTab kind={kind} guide={guide} connection={connection} onSaved={onChanged} />}
      </div>
    </Drawer>
  );
}

function SourceCard({ kind, connection, onOpen, onScan, onRemove }) {
  const { canManage } = useAuth();
  const guide = GUIDES[kind];
  const Mark = MARKS[kind];
  const failed = connection.checks?.filter((c) => !c.ok) ?? [];
  const running = connection.sync_status === 'running';
  const configured = connection.status !== 'not_configured';
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Mark size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-semibold text-ink">{guide.name}</h2>
          <p className="text-[12.5px] text-ink-3">{guide.kind}</p>
          <div className="mt-2"><ConnectionStatus status={connection.status} size="sm" /></div>
        </div>
      </div>
      <div className="min-h-[3.5rem] text-[12.5px]">
        {!configured ? (
          <p className="text-ink-2">{guide.summary}</p>
        ) : failed.length ? (
          <p className="text-critical">{failed[0].name}: {failed[0].detail}</p>
        ) : running ? (
          <p className="flex items-center gap-1.5 text-ink-2"><Loader2 aria-hidden="true" className="size-3.5 animate-spin" />{connection.sync_detail}</p>
        ) : connection.sync_status === 'failed' ? (
          <p className="text-critical">Last {kind === 'jenkins' ? 'sync' : 'scan'} failed: {connection.sync_detail}</p>
        ) : (
          <p className="text-ink-2">
            {connection.sync_detail || 'Connected.'}
            {connection.last_sync_at && <span className="block text-ink-3">{timeAgo(connection.last_sync_at)}</span>}
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button variant={configured ? 'secondary' : 'primary'} onClick={onOpen} iconRight={configured ? undefined : ArrowRight}>
          {configured ? 'Settings' : canManage ? 'Set up' : 'See how it connects'}
        </Button>
        {connection.status === 'connected' && (
          <Button variant="ghost" icon={RefreshCw} disabled={running} locked={canManage ? undefined : MANAGE_LOCK} onClick={onScan}>
            {kind === 'jenkins' ? 'Sync now' : 'Scan all now'}
          </Button>
        )}
        {configured && canManage && <Button variant="ghost" icon={Trash2} className="ml-auto" aria-label={`Disconnect ${guide.name}`} onClick={onRemove} />}
      </div>
    </Panel>
  );
}

export default function Connections() {
  const { notify } = useToast();
  const [openKind, setOpenKind] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [overrides, setOverrides] = useState({});
  const { data, error, loading, reload } = useApi('/connections');
  const list = data?.connections ?? [];
  const byKind = Object.fromEntries(list.map((c) => [c.kind, overrides[c.kind] && overrides[c.kind].updated_at >= (c.updated_at ?? '') ? { ...c, ...overrides[c.kind] } : c]));
  const anyRunning = list.some((c) => c.sync_status === 'running');

  /* Poll while a scan runs, so its progress line moves. */
  useEffect(() => {
    if (!anyRunning) return undefined;
    const id = setInterval(() => reload(true), 3000);
    return () => clearInterval(id);
  }, [anyRunning, reload]);

  const changed = (c) => {
    setOverrides((o) => ({ ...o, [c.kind]: c }));
    reload(true);
  };

  async function scan(kind) {
    try {
      changed((await api(`/connections/${kind}/scan`, { method: 'POST' })).connection);
    } catch (err) {
      notify({ variant: 'error', title: 'Not started', description: err.message });
    }
  }

  async function remove() {
    try {
      await api(`/connections/${removing}`, { method: 'DELETE' });
      notify({ variant: 'success', title: `${GUIDES[removing].name} disconnected`, description: 'Its token and webhook secret were deleted. Findings stay.' });
      setOverrides((o) => ({ ...o, [removing]: undefined }));
      reload(true);
    } catch (err) {
      notify({ variant: 'error', title: 'Not removed', description: err.message });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <PageHeader title="Connections" description="GitHub, Bitbucket Data Center and Jenkins. Each connection is read-only and tested when saved; the first scan starts on its own." />
      {error && !data ? (
        <ErrorState error={error} onRetry={() => reload()} />
      ) : loading && !data ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {KINDS.map((k) => (
            <SourceCard key={k} kind={k} connection={byKind[k]} onOpen={() => setOpenKind(k)} onScan={() => scan(k)} onRemove={() => setRemoving(k)} />
          ))}
        </div>
      )}
      {openKind && byKind[openKind] && (
        <SetupDrawer kind={openKind} connection={byKind[openKind]} onClose={() => setOpenKind(null)} onChanged={changed} />
      )}
      <Modal open={!!removing} onClose={() => setRemoving(null)} tone="critical" title={removing ? `Disconnect ${GUIDES[removing].name}?` : ''}
        description="Its saved token or key and webhook secret are deleted, scans stop and webhooks are refused. Findings and history stay. Also revoke the token or uninstall the App on the other side."
        footer={<><Button onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Disconnect</Button></>} />
    </>
  );
}
