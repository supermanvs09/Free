import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { Modal } from '../../ui/Overlay';
import { useToast } from '../../ui/Toast';
import { actions, useView } from '../../data/store';
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

      <section>
        <h2 className="mb-2.5 text-[12px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Tickets and notifications</h2>
        <div className="grid gap-4 @min-[60rem]:grid-cols-2">
          {['jira', 'email'].map((p) => {
            const c = view.connections.find((x) => x.provider === p);
            return (
              <Panel key={p}>
                <div className="flex items-start gap-3.5">
                  <AppLogo name={PROVIDERS[p].logo} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">{PROVIDERS[p].name}{c && <StatusPill status={c.status} />}</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{BLURB[p]}</p>
                  </div>
                </div>
                {c ? (
                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-[10px] bg-surface-2 p-3 text-[12.5px]">
                    <div><dt className="text-ink-3">{p === 'jira' ? 'Site' : 'Delivered by'}</dt><dd className="font-medium text-ink">{c.name}</dd></div>
                    <div><dt className="text-ink-3">{p === 'jira' ? 'Project' : 'From'}</dt><dd className="font-medium text-ink">{p === 'jira' ? 'SEC · Security Engineering' : c.locator}</dd></div>
                    <div><dt className="text-ink-3">{p === 'jira' ? 'Issues raised' : 'Messages sent'}</dt><dd className="font-medium text-ink" data-numeric="">{p === 'jira' ? view.tickets.length : view.mail.length}</dd></div>
                    <div><dt className="text-ink-3">Routing</dt><dd><Link to="/automations" className="font-medium text-brand hover:underline">{view.rules.filter((r) => r.enabled && (p === 'jira' ? r.actions?.jira : r.actions?.email?.length)).length} automations</Link></dd></div>
                  </dl>
                ) : (
                  <Button className="mt-4" variant="primary" size="sm" icon={Plus} onClick={() => setWizard(p)}>Connect</Button>
                )}
                {c && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" as={Link} to={p === 'jira' ? '/tickets' : '/inbox'}>{p === 'jira' ? 'Open board' : 'Open inbox'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setWizard(p)}>Reconfigure</Button>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      </section>

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


