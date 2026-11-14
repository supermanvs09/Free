import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { Modal } from '../../ui/Overlay';
import { useToast } from '../../ui/Toast';
import { actions, testIntegration, useView } from '../../data/store';
import { Container, KeyValues } from '../../ui/Container';
import { Input } from '../../ui/Field';
import { PROVIDERS, SOURCE_PROVIDERS } from '../../data/world';
import { AppLogo } from '../../components/Logo';
import { PersonName, StatusPill, Time } from '../../components/bits';

import { ConnectWizard } from './ConnectWizard';

const BLURB = {
  aws: 'IAM roles and users, Lambda, ECS, EKS and EC2 workload identities, access keys, and CloudTrail activity. Read-only cross-account role.',
  azure: 'Entra ID service principals, app registrations and managed identities, their secrets and certificates, role assignments and sign-in logs.',
  github: 'GitHub Apps, OAuth apps, personal access tokens, deploy keys and Actions OIDC trust, from the audit log. Secret scanning on every push.',
  bitbucket: 'Repository and workspace access tokens, app passwords, OAuth consumers, Pipelines OIDC and variables. Secret scanning on every push.',
  vault: 'Auth methods and roles, tokens and accessors, secret engines and leases, from the audit device. Read-only policy.',
  jira: 'Raise issues from findings and detections, keep status in sync both ways, and close findings when issues are done.',
  email: 'Alert, assignment and digest mail to owners, assignees and team lists, sent from your domain.',
};

export default function IntegrationsPage() {
  const view = useView();
  const toast = useToast();
  const [wizard, setWizard] = useState(null);
  const [removing, setRemoving] = useState(null);
  const idCount = useMemo(() => {
    const m = new Map();
    for (const i of view.identities) m.set(i.connectionId, (m.get(i.connectionId) || 0) + 1);
    return m;
  }, [view.identities]);

  const sync = async (ids) => {
    await actions.startSync(ids);
    toast.notify({ variant: 'info', title: 'Sync started', description: 'Everyone sees the progress in the top bar.' });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Integrations"
        lede="Where identities are discovered and where the work goes. Connections are read-only unless a playbook needs to change something, and every change asks first."
        actions={<Button variant="secondary" icon={RefreshCw} onClick={() => sync()}>Sync everything</Button>}
      />

      <section>
        <h2 className="mb-2.5 text-[12px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Identity sources</h2>
        <div className="grid gap-4">
          {SOURCE_PROVIDERS.map((p) => {
            const conns = view.connections.filter((c) => c.provider === p);
            return (
              <Panel key={p} flush>
                <div className="flex flex-wrap items-start gap-4 p-4">
                  <AppLogo name={PROVIDERS[p].logo} size={44} />
                  <div className="min-w-0 flex-1 basis-72">
                    <p className="flex items-center gap-2 text-[15px] font-bold text-ink">{PROVIDERS[p].name}<span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{conns.length} connected</span></p>
                    <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-3">{BLURB[p]}</p>
                  </div>
                  <Button variant="primary" size="sm" icon={Plus} onClick={() => setWizard(p)}>Connect {PROVIDERS[p].unit}</Button>
                </div>
                {conns.length > 0 && (
                  <div className="overflow-x-auto border-t border-line">
                    <table className="w-full min-w-[760px] text-left text-[12.5px]">
                      <thead className="bg-surface-2 text-[10.5px] tracking-[0.07em] text-ink-3 uppercase">
                        <tr><th className="px-4 py-2 font-semibold">{PROVIDERS[p].unit}</th><th className="px-4 py-2 font-semibold">Identities</th><th className="px-4 py-2 font-semibold">Status</th><th className="px-4 py-2 font-semibold">Last sync</th><th className="px-4 py-2 font-semibold">Connected by</th><th className="w-12 px-2 py-2"><span className="sr-only">Actions</span></th></tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {conns.map((c) => (
                          <tr key={c.id} className="hover:bg-surface-2">
                            <td className="px-4 py-2.5">
                              <Link to={`/identities?provider=${p}`} className="block font-semibold text-ink hover:text-brand">{c.name}</Link>
                              <span className="block truncate font-mono text-[11px] text-ink-3">{c.locator}{c.env ? ` · ${c.env}` : ''}</span>
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-ink" data-numeric="">{idCount.get(c.id) || 0}</td>
                            <td className="px-4 py-2.5"><StatusPill status={c.syncing ? 'syncing' : c.status} pulse={c.syncing} /></td>
                            <td className="px-4 py-2.5 text-ink-2"><Time at={c.lastSyncAt} />{c.syncEvery && <span className="text-ink-3"> · every {c.syncEvery}</span>}</td>
                            <td className="px-4 py-2.5 text-ink-2"><PersonName refId={c.connectedBy} /> · <Time at={c.connectedAt} className="text-ink-3" /></td>
                            <td className="px-2 py-2.5 text-right">
                              <Menu
                                items={[
                                  { label: 'Sync now', icon: RefreshCw, onSelect: () => sync([c.id]) },
                                  c.status === 'paused'
                                    ? { label: 'Resume', icon: Play, onSelect: () => actions.updateConnection(c.id, { status: 'healthy' }, { verb: 'resumed', text: c.name }) }
                                    : { label: 'Pause collection', icon: Pause, onSelect: () => actions.updateConnection(c.id, { status: 'paused' }, { verb: 'paused', text: c.name }) },
                                  { label: 'Disconnect', icon: Trash2, tone: 'critical', onSelect: () => setRemoving(c) },
                                ]}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      </section>

      <WorkflowIntegrations onReconfigure={setWizard} />

      {wizard && <ConnectWizard provider={wizard} onClose={() => setWizard(null)} />}
      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Disconnect ${removing?.name}?`}
        tone="critical"
        icon={Trash2}
        description={`Its ${idCount.get(removing?.id) || 0} identities, their findings and history leave the console for everyone. Nothing changes in ${PROVIDERS[removing?.provider]?.name}; you can reconnect at any time.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>Keep it</Button>
            <Button variant="danger" onClick={async () => { await actions.updateConnection(removing.id, { removed: true }, { verb: 'disconnected', text: `${PROVIDERS[removing.provider].short} ${removing.name}` }); toast.notify({ variant: 'success', title: `${removing.name} disconnected` }); setRemoving(null); }}>Disconnect</Button>
          </>
        }
      />
    </div>
  );
}



/* Jira and Gmail: live through the relay, with a test that proves each end to end. */
function WorkflowIntegrations({ onReconfigure }) {
  const view = useView();
  const live = view.integrations;
  const relay = view.mode === 'relay';
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[15px] font-semibold text-ink">Tickets and email</h2>
      {!relay && (
        <div className="rounded-[10px] border border-line bg-surface-2 px-5 py-4 text-[13px] text-ink-2">
          <p className="font-medium text-ink">Real Jira issues and Gmail delivery run through the relay.</p>
          <p className="mt-1">Deploy the console with the relay (one Cloudflare Worker, free plan) and open it from that address. Issues and mail created here are then created in Jira and sent by Gmail, and Jira status changes flow back live. Setup steps are in <code className="rounded bg-inset px-1 font-mono text-[12px]">relay/README.md</code>.</p>
        </div>
      )}
      <div className="grid gap-4 @min-[60rem]:grid-cols-2">
        <IntegrationCard
          logo="jira"
          title="Jira Cloud"
          state={live?.jira?.configured ? 'live' : relay ? 'off' : 'local'}
          items={live?.jira?.configured ? [['Site', live.jira.site], ['Project', live.jira.project], ['Status from Jira', live.jira.webhook ? 'Webhook on, live' : 'Webhook not set'], ['Issues created', view.tickets.filter((t) => t.jiraKey).length]] : [['Issues in the console', view.tickets.length], ['Sync', 'Console only']]}
          test="jira"
          steps={['Create an API token at id.atlassian.com, Security, API tokens.', 'npx wrangler secret put JIRA_BASE_URL (https://your-site.atlassian.net), JIRA_EMAIL, JIRA_API_TOKEN, JIRA_WEBHOOK_SECRET.', 'In Jira: Settings, System, WebHooks. Add <relay>/api/jira/webhook?secret=<secret> for issue updated and comment created, JQL: labels = nhi.']}
          onReconfigure={() => onReconfigure('jira')}
        />
        <IntegrationCard
          logo="gmail"
          title="Gmail"
          state={live?.email?.configured ? 'live' : relay ? 'off' : 'local'}
          items={live?.email?.configured ? [['Sends as', live.email.sender || 'the authorised mailbox'], ['Allowed domains', live.email.allowedDomains?.join(', ') || 'Any'], ['Delivered', view.mail.filter((m) => m.delivery?.status === 'sent').length], ['Held back', view.mail.filter((m) => m.delivery?.status === 'held').length]] : [['Messages in the console', view.mail.length], ['Delivery', 'Console inbox only']]}
          test="email"
          steps={['Google Cloud console: enable the Gmail API, create an OAuth client (web application).', 'Authorise the sending mailbox once with scope gmail.send and keep the refresh token.', 'npx wrangler secret put GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER, MAIL_ALLOWED_DOMAINS.']}
          onReconfigure={() => onReconfigure('email')}
        />
      </div>
    </section>
  );
}

function IntegrationCard({ logo, title, state, items, steps, test }) {
  const me = useView((v) => v.me);
  const [to, setTo] = useState(me?.email || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const label = { live: ['Connected', 'bg-low-soft text-low'], off: ['Not configured', 'bg-medium-soft text-medium'], local: ['Console only', 'bg-surface-3 text-ink-2'] }[state];
  const run = async () => {
    setBusy(true);
    setResult(await testIntegration(test, to));
    setBusy(false);
  };
  return (
    <Container
      title={<span className="flex items-center gap-2.5"><AppLogo name={logo} size={26} />{title}</span>}
      actions={<span className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${label[1]}`}>{label[0]}</span>}
      footer={state === 'live' ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {test === 'email' && <Input size="sm" className="w-56" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@company.com" aria-label="Send a test to" />}
          <Button size="sm" variant="secondary" loading={busy} onClick={run}>{test === 'email' ? 'Send test email' : 'Test connection'}</Button>
        </div>
      ) : null}
    >
      <KeyValues columns={2} items={items} />
      {result && <p className={`mt-4 text-[13px] ${result.ok ? 'text-low' : 'text-critical'}`}>{result.detail}</p>}
      {state !== 'live' && (
        <details className="mt-4 rounded-[8px] border border-line px-4 py-3 text-[13px]">
          <summary className="cursor-pointer font-medium text-ink">How to connect</summary>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-ink-2">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
        </details>
      )}
    </Container>
  );
}
