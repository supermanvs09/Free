import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Plus, RotateCw, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { fetchConnections, removeConnection, syncConnection, verifyConnection } from '../../lib/api/hub';
import { useQuery } from '../../lib/hooks';
import { formatNumber } from '../../lib/format';
import { Button } from '../../ui/Button';
import { CopyButton } from '../../ui/Copyable';
import { Field, Input, PasswordInput } from '../../ui/Field';
import { Modal } from '../../ui/Overlay';
import { Panel, PanelHeader } from '../../ui/Panel';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { AppHeader, CheckRows, Stat, StatusTag, When } from './hubParts';

const NOUN = { azure: 'subscription', jenkins: 'controller', vault: 'cluster' };
const LEDE = {
  azure: 'Managed identities, service principals and app registrations in each subscription, with their client secrets, certificates and federated credentials. Read-only: Reader on the subscription and Directory.Read.All in Microsoft Graph.',
  jenkins: 'Every job, agent and service user, and which credentials from the credential store each one binds. Credential values are never read: only IDs, kinds, scopes and dates.',
  vault: 'A secret store, not an identity source: which credentials are kept in Vault, which workloads read them, how each logs in (AppRole, Kubernetes, tokens, dynamic leases) and what its Vault policy lets it read - from the audit device.',
};

export function ConnectionsTab({ app, canManage }) {
  const key = app.key;
  const workspace = useWorkspace();
  const { notify } = useToast();
  const query = useQuery((signal) => fetchConnections(key, signal), [key]);
  const connections = query.data?.connections ?? [];
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState('');
  const [removing, setRemoving] = useState(null);
  const [working, setWorking] = useState('');

  useEffect(() => {
    if (query.data && connections.length === 0) setAdding(true);
  }, [query.data, connections.length]);

  const moving = connections.some((c) => ['queued', 'running'].includes(c.sync?.status) || c.checks?.some((x) => x.state === 'running'));
  const { refetch } = query;
  useEffect(() => {
    if (!moving) return undefined;
    const id = setInterval(() => refetch(), 3000);
    return () => clearInterval(id);
  }, [moving, refetch]);

  const sync = async (c) => {
    setWorking(`sync:${c.id}`);
    try {
      const res = await syncConnection(key, c.id);
      notify({ variant: 'info', title: res.already_queued ? 'Already syncing' : `Syncing ${c.name}`, description: 'New and changed identities appear when it finishes.' });
      query.refetch();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not start the sync', description: error?.message });
    } finally {
      setWorking('');
    }
  };

  const remove = async () => {
    setWorking(`remove:${removing.id}`);
    try {
      await removeConnection(key, removing.id);
      notify({ variant: 'success', title: `${removing.name} disconnected` });
      setRemoving(null);
      query.refetch();
      workspace.refreshApps();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not disconnect', description: error?.message });
    } finally {
      setWorking('');
    }
  };

  const last = connections.map((c) => c.sync?.last_synced_at).filter(Boolean).sort().pop();

  return (
    <>
      <Panel>
        <AppHeader
          app={app}
          actions={
            <>
              <Button variant="secondary" size="sm" icon={RotateCw} loading={query.isRefreshing} onClick={() => query.refetch()}>
                Refresh
              </Button>
              {canManage && (
                <Button variant="primary" size="sm" icon={Plus} onClick={() => setAdding(true)} disabled={adding}>
                  Connect a {NOUN[key]}
                </Button>
              )}
            </>
          }
        >
          {LEDE[key]}
        </AppHeader>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={`${NOUN[key][0].toUpperCase()}${NOUN[key].slice(1)}s`} value={formatNumber(connections.length)} />
          <Stat label="Identities" value={formatNumber(query.data?.inventory?.identities ?? 0)} hint={<Link className="text-brand hover:underline" to={`/identities?search=`}>Open in Discovery</Link>} />
          <Stat label="Credentials" value={formatNumber(query.data?.inventory?.credentials ?? 0)} />
          <Stat label="Last sync" value={<span className="text-[15px]"><When at={last} /></span>} />
        </div>
      </Panel>

      <Panel flush className="overflow-hidden">
        <div className="border-b border-line px-5 py-3.5">
          <h3 className="text-[14px] font-semibold text-ink">Connected {NOUN[key]}s</h3>
        </div>
        {connections.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-3">{query.isLoading ? 'Loading…' : `No ${NOUN[key]} is connected yet.`}</p>
        ) : (
          <ul className="divide-y divide-line">
            {connections.map((c) => {
              const expanded = open === c.id;
              const syncing = ['queued', 'running'].includes(c.sync?.status);
              return (
                <li key={c.id}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                    <button type="button" onClick={() => setOpen(expanded ? '' : c.id)} className="flex min-w-0 flex-1 basis-72 items-center gap-2.5 text-left" aria-expanded={expanded}>
                      <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-ink-3 transition-transform', expanded && 'rotate-180')} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] font-semibold text-ink">{c.name}</span>
                          <StatusTag status={c.status} />
                        </span>
                        <span className="block truncate font-mono text-[11.5px] text-ink-3" title={c.id}>
                          {c.url || c.id}
                          {c.namespace ? ` · ns ${c.namespace}` : ''}
                        </span>
                      </span>
                    </button>
                    <span className="text-[12px] text-ink-3">
                      {c.auth === 'federated' ? 'Workload identity federation' : c.auth === 'client_secret' ? 'Client secret' : c.auth === 'approle' ? 'AppRole' : c.version || 'API token'}
                    </span>
                    <span className="w-36 text-[12px] text-ink-2">{syncing ? <span className="text-brand">{c.sync.status === 'queued' ? 'Sync queued…' : 'Syncing…'}</span> : <When at={c.sync?.last_synced_at} prefix="Synced " />}</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <Button variant="secondary" size="sm" icon={RotateCw} loading={working === `sync:${c.id}`} disabled={syncing} onClick={() => sync(c)}>
                        Sync
                      </Button>
                      {canManage && <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRemoving(c)} aria-label={`Disconnect ${c.name}`} />}
                    </div>
                  </div>
                  {expanded && (
                    <div className="grid gap-4 border-t border-line bg-surface-2/50 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
                      <CheckRows checks={c.checks} className="bg-surface" />
                      <dl className="grid content-start gap-2 text-[12.5px]">
                        {c.tenant_id && <Fact k="Tenant" v={c.tenant_id} mono />}
                        {c.client_id && <Fact k="Client ID" v={c.client_id} mono />}
                        {c.username && <Fact k="Signs in as" v={c.username} />}
                        {c.version && <Fact k="Version" v={c.version} />}
                        <Fact k="Regions" v={(c.regions ?? []).join(', ') || '-'} />
                        <Fact k="Connected" v={<When at={c.connected_at} />} />
                      </dl>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {adding && canManage && (
        <ConnectForm
          appKey={key}
          onCancel={connections.length ? () => setAdding(false) : null}
          onConnected={(conn) => {
            notify({ variant: 'success', title: `${conn.name} connected`, description: 'The first sync has started. Identities appear in Discovery in a minute.' });
            setAdding(false);
            setOpen(conn.id);
            query.refetch();
            workspace.refreshApps();
          }}
        />
      )}

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        icon={Trash2}
        tone="critical"
        title={removing ? `Disconnect ${removing.name}?` : ''}
        description={`The console stops reading this ${NOUN[key]}. What it already found stays in the history. You can connect it again at any time.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={working.startsWith('remove')} onClick={remove}>
              Disconnect
            </Button>
          </>
        }
      />
    </>
  );
}

function Fact({ k, v, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className={cn('min-w-0 truncate text-right text-ink-2', mono && 'font-mono text-[11.5px]')}>{v}</dd>
    </div>
  );
}

/* ── Connect ───────────────────────────────────────────────────────────── */

const FIELDS = {
  azure: [
    { name: 'name', label: 'Display name', placeholder: 'Payments-Prod', hint: 'How this subscription is named in the console.' },
    { name: 'tenant_id', label: 'Directory (tenant) ID', placeholder: '00000000-0000-0000-0000-000000000000', mono: true, required: true },
    { name: 'subscription_id', label: 'Subscription ID', placeholder: '00000000-0000-0000-0000-000000000000', mono: true, required: true },
    { name: 'client_id', label: 'Application (client) ID', placeholder: '00000000-0000-0000-0000-000000000000', mono: true, required: true },
  ],
  jenkins: [
    { name: 'name', label: 'Display name', placeholder: 'Jenkins CI' },
    { name: 'url', label: 'Jenkins URL', placeholder: 'https://ci.example.com', mono: true, required: true },
    { name: 'username', label: 'User', placeholder: 'nhi-reader', required: true },
    { name: 'api_token', label: 'API token', secret: true, required: true, hint: 'Your user → Security → API Token → Add new token.' },
  ],
  vault: [
    { name: 'name', label: 'Display name', placeholder: 'Vault prod' },
    { name: 'url', label: 'Vault address', placeholder: 'https://vault.example.com:8200', mono: true, required: true },
    { name: 'namespace', label: 'Namespace', placeholder: 'admin/payments', hint: 'Vault Enterprise only. Leave empty for the root namespace.' },
    { name: 'role_id', label: 'AppRole role_id', mono: true, required: true },
    { name: 'secret_id', label: 'AppRole secret_id', secret: true, required: true },
  ],
};

const SETUP = {
  azure: (federated) => [
    { title: 'Register an application', text: 'Microsoft Entra ID → App registrations → New registration. Name it nhi-discovery, single tenant.' },
    federated
      ? { title: 'Add a federated credential', text: 'Certificates & secrets → Federated credentials → Add. Choose "Other issuer" and paste these.', copy: [['Issuer', 'https://oidc.deepalgorithms.ai'], ['Subject', 'tenant:tnt_7f3a91c2:azure-discovery'], ['Audience', 'api://AzureADTokenExchange']] }
      : { title: 'Add a client secret', text: 'Certificates & secrets → New client secret. Choose 6 months; the console warns you 30 days before it expires.' },
    { title: 'Grant read access', text: 'Microsoft Graph application permissions Application.Read.All and Directory.Read.All (admin consent), and the Reader role on the subscription.', copy: [['Role assignment (CLI)', 'az role assignment create --assignee <client-id> --role Reader --scope /subscriptions/<subscription-id>']] },
    { title: 'Send sign-in logs (optional)', text: 'Diagnostic settings → SignInLogs, ServicePrincipalSignInLogs, AuditLogs → stream to the event hub so behaviour is learned.' },
  ],
  jenkins: () => [
    { title: 'Create a read-only user', text: 'Manage Jenkins → Users → Create user nhi-reader.' },
    { title: 'Give it read permissions', text: 'Manage Jenkins → Security → Matrix: Overall/Read, Job/Read, Job/ExtendedRead, Credentials/View. Nothing else.' },
    { title: 'Forward the audit trail', text: 'Install the Audit Trail plugin and add a syslog logger to the collector.', copy: [['Syslog target', 'collector.deepalgorithms.ai:6514 (TLS)']] },
  ],
  vault: () => [
    { title: 'Write the discovery policy', text: 'Read-only on auth methods, roles, accessors and the audit device configuration.', copy: [['Policy', 'path "sys/auth" { capabilities = ["read"] }\npath "auth/+/role/*" { capabilities = ["read", "list"] }\npath "auth/token/accessors" { capabilities = ["list", "sudo"] }\npath "identity/*" { capabilities = ["read", "list"] }\npath "sys/audit" { capabilities = ["read", "sudo"] }']] },
    { title: 'Create the AppRole', text: 'A short token TTL; the console logs in again when it needs to.', copy: [['CLI', 'vault write auth/approle/role/nhi-discovery token_policies=nhi-discovery token_ttl=1h token_max_ttl=4h secret_id_ttl=2160h']] },
    { title: 'Stream the audit device (optional)', text: 'A socket or file audit device forwarded to the collector, so behaviour is learned from real requests.' },
  ],
};

function ConnectForm({ appKey, onCancel, onConnected }) {
  const [values, setValues] = useState({});
  const [federated, setFederated] = useState(true);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const fields = FIELDS[appKey];
  const set = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const missing = {};
    for (const f of fields) if (f.required && !String(values[f.name] ?? '').trim()) missing[f.name] = `Enter the ${f.label.toLowerCase()}.`;
    if (appKey === 'azure' && !federated && !values.client_secret) missing.client_secret = 'Paste the client secret.';
    if (Object.keys(missing).length) {
      setErrors(missing);
      return;
    }
    setSaving(true);
    try {
      const conn = await verifyConnection(appKey, { ...values, federated: appKey === 'azure' ? federated : undefined });
      onConnected(conn);
    } catch (error) {
      if (error?.field) setErrors({ [error.field]: error.message });
      else setErrors({ _form: error?.message || 'The connection could not be verified.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader title={`Connect a ${NOUN[appKey]}`} subtitle="Read-only access. The console checks it can sign in and read before it saves anything." />
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ol className="flex flex-col gap-3">
          {SETUP[appKey](federated).map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-[11.5px] font-semibold text-ink-2">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{step.title}</p>
                <p className="text-[12.5px] leading-relaxed text-ink-3">{step.text}</p>
                {step.copy?.map(([label, value]) => (
                  <div key={label} className="mt-2 rounded-[var(--radius-control)] border border-line bg-inset">
                    <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1">
                      <span className="text-[11px] text-ink-3">{label}</span>
                      <CopyButton value={value} size="sm" label={`Copy ${label.toLowerCase()}`} />
                    </div>
                    <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2">{value}</pre>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <form onSubmit={submit} className="flex flex-col gap-3.5 rounded-[var(--radius-panel)] border border-line bg-surface-2/50 p-4" noValidate>
          {appKey === 'azure' && (
            <Field label="How it signs in">
              <SegmentedControl
                label="How it signs in"
                value={federated ? 'federated' : 'secret'}
                onChange={(v) => setFederated(v === 'federated')}
                options={[
                  { value: 'federated', label: 'Federation (no secret)' },
                  { value: 'secret', label: 'Client secret' },
                ]}
              />
            </Field>
          )}
          {fields.map((f) => (
            <Field key={f.name} label={f.label} htmlFor={`f-${f.name}`} required={f.required} hint={f.hint} error={errors[f.name]}>
              {f.secret ? (
                <PasswordInput id={`f-${f.name}`} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} invalid={Boolean(errors[f.name])} autoComplete="off" />
              ) : (
                <Input id={`f-${f.name}`} value={values[f.name] ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} invalid={Boolean(errors[f.name])} className={f.mono ? 'font-mono text-[12.5px]' : undefined} autoComplete="off" />
              )}
            </Field>
          ))}
          {appKey === 'azure' && !federated && (
            <Field label="Client secret" htmlFor="f-client_secret" required error={errors.client_secret} hint="Kept by the collector only; never shown again.">
              <PasswordInput id="f-client_secret" value={values.client_secret ?? ''} onChange={(e) => set('client_secret', e.target.value)} invalid={Boolean(errors.client_secret)} autoComplete="off" />
            </Field>
          )}
          {errors._form && <p className="text-[12.5px] text-critical">{errors._form}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" loading={saving}>
              {saving ? 'Checking access…' : 'Check and connect'}
            </Button>
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Tag size="sm" tone="neutral">
              Read-only
            </Tag>
          </div>
        </form>
      </div>
    </Panel>
  );
}
