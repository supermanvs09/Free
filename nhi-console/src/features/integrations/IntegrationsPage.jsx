import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, LayoutGrid, Power } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { useAccess } from '../../app/useAccess';
import { setAppEnabled } from '../../lib/api/hub';
import { formatNumber } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { SyncNowButton } from '../sync/SyncButton';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Overlay';
import { ProviderIcon } from '../../ui/ProviderIcon';
import { Skeleton } from '../../ui/Skeleton';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { AwsTab } from './AwsTab';
import { ConnectionsTab } from './ConnectionsTab';
import { CodeScanTab } from './CodeScanTab';
import { GmailTab } from './GmailTab';
import { JiraTab } from './JiraTab';
import { STATUS, StatusDot } from './hubParts';

/**
 * Integrations: every application the console reads from or reports to, in
 * one place. Each application is switched on or off here. An application that
 * is on gets its own tab, where it is connected and configured; switching it
 * off removes the tab, and its identities, findings and alerts leave every
 * screen until it is switched back on. Nothing is deleted.
 */
const GROUPS = [
  { key: 'identity', title: 'Identity sources', lede: 'Where your non-human identities and their credentials live.' },
  { key: 'exposure', title: 'Code scanning', lede: 'Where their secrets leak: repositories and their history.' },
  { key: 'notify', title: 'Alerts and tickets', lede: 'Where people hear about it, as it happens.' },
];

export default function IntegrationsPage() {
  const workspace = useWorkspace();
  const { can } = useAccess();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = can('integrations.manage');
  const apps = workspace.apps;
  const enabled = apps.filter((a) => a.enabled);
  const requested = searchParams.get('tab') || 'overview';
  const active = requested === 'overview' || enabled.some((a) => a.key === requested) ? requested : 'overview';
  const [busy, setBusy] = useState('');
  const [confirmOff, setConfirmOff] = useState(null);

  const openTab = (key) => {
    const next = new URLSearchParams();
    if (key !== 'overview') next.set('tab', key);
    setSearchParams(next, { replace: false });
  };

  const toggle = async (app, on) => {
    setBusy(app.key);
    try {
      await setAppEnabled(app.key, on);
      await workspace.refreshApps();
      workspace.refresh();
      window.dispatchEvent(new CustomEvent('alerts:refresh'));
      if (on) {
        notify({ variant: 'success', title: `${app.name} is on`, description: app.category === 'identity' ? 'Its identities and credentials are back in every screen.' : 'Its tab is open: finish the setup there.' });
        openTab(app.key);
      } else {
        notify({ variant: 'info', title: `${app.name} is off`, description: 'Its tab is hidden. Connections and settings are kept for when you switch it back on.' });
        if (active === app.key) openTab('overview');
      }
    } catch (error) {
      notify({ variant: 'error', title: `Could not switch ${on ? 'on' : 'off'} ${app.name}`, description: error?.message });
    } finally {
      setBusy('');
      setConfirmOff(null);
    }
  };

  const onSwitch = (app, on) => {
    if (!on && (app.category === 'identity' || app.category === 'exposure')) setConfirmOff(app);
    else toggle(app, on);
  };

  const tabs = [{ key: 'overview', label: 'All applications' }, ...enabled.map((a) => ({ key: a.key, label: a.short, status: a.status }))];
  const activeApp = apps.find((a) => a.key === active);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Integrations"
        lede="Switch on the applications your non-human identities live in, where their secrets could leak, and where alerts should go. Each one you switch on gets its own tab."
        actions={<SyncNowButton />}
        tabs={
          <nav aria-label="Applications" className="-mb-px flex gap-0.5 overflow-x-auto">
            {tabs.map((tab) => {
              const on = tab.key === active;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => openTab(tab.key)}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-3 pt-1 pb-2.5 text-[13px] whitespace-nowrap transition-colors',
                    on ? 'border-brand font-semibold text-ink' : 'border-transparent font-medium text-ink-3 hover:text-ink',
                  )}
                >
                  {tab.key === 'overview' ? <LayoutGrid aria-hidden="true" className={cn('size-3.5', on && 'text-brand')} /> : <ProviderIcon provider={tab.key} size={14} decorative />}
                  {tab.label}
                  {tab.status && tab.status !== 'connected' && <StatusDot status={tab.status} />}
                </button>
              );
            })}
          </nav>
        }
      />

      {!workspace.appsLoaded ? (
        <HubSkeleton />
      ) : active === 'overview' ? (
        <Overview apps={apps} canManage={canManage} busy={busy} onSwitch={onSwitch} onOpen={openTab} />
      ) : (
        <div key={active} className="animate-rise flex flex-col gap-5">
          {active === 'aws' && <AwsTab app={activeApp} />}
          {['azure', 'jenkins', 'vault'].includes(active) && <ConnectionsTab app={activeApp} canManage={canManage} />}
          {['github', 'bitbucket'].includes(active) && <CodeScanTab app={activeApp} canManage={canManage} />}
          {active === 'gmail' && <GmailTab app={activeApp} canManage={canManage} />}
          {active === 'jira' && <JiraTab app={activeApp} canManage={canManage} />}
        </div>
      )}

      <Modal
        open={Boolean(confirmOff)}
        onClose={() => setConfirmOff(null)}
        icon={Power}
        tone="medium"
        title={confirmOff ? `Switch off ${confirmOff.name}?` : ''}
        description={
          confirmOff?.category === 'identity'
            ? `Its ${formatNumber(confirmOff.identities)} identities and ${formatNumber(confirmOff.credentials)} credentials, with their findings and alerts, leave every screen until you switch it back on. Connections and history are kept.`
            : `Its findings leave Credential exposure and the alerts inbox until you switch it back on. Repository settings are kept.`
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOff(null)}>
              Keep it on
            </Button>
            <Button variant="primary" loading={busy === confirmOff?.key} onClick={() => toggle(confirmOff, false)}>
              Switch off
            </Button>
          </>
        }
      />
    </div>
  );
}

function Overview({ apps, canManage, busy, onSwitch, onOpen }) {
  const on = apps.filter((a) => a.enabled);
  const identities = on.reduce((s, a) => s + (Number(a.identities) || 0), 0);
  const repos = on.reduce((s, a) => s + (Number(a.repositories) || 0), 0);
  const sent = on.reduce((s, a) => s + (Number(a.sent_24h) || 0), 0);
  const attention = on.filter((a) => a.status === 'action_needed' || a.status === 'not_connected');
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Applications on" value={`${on.length} of ${apps.length}`} />
        <Summary label="Identities discovered" value={formatNumber(identities)} hint={`from ${on.filter((a) => a.category === 'identity').length} sources`} />
        <Summary label="Repositories scanned" value={formatNumber(repos)} />
        <Summary label="Alerts delivered, 24h" value={formatNumber(sent)} hint={attention.length ? `${attention.length} ${attention.length === 1 ? 'application needs' : 'applications need'} attention` : 'Everything healthy'} tone={attention.length ? 'medium' : 'low'} />
      </div>

      {GROUPS.map((group) => (
        <section key={group.key} aria-labelledby={`group-${group.key}`} className="flex flex-col gap-3">
          <div>
            <h2 id={`group-${group.key}`} className="text-[14px] font-semibold text-ink">{group.title}</h2>
            <p className="text-[12px] text-ink-3">{group.lede}</p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {apps
              .filter((a) => a.category === group.key)
              .map((app) => (
                <AppCard key={app.key} app={app} canManage={canManage} busy={busy === app.key} onSwitch={(v) => onSwitch(app, v)} onOpen={() => onOpen(app.key)} />
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function AppCard({ app, canManage, busy, onSwitch, onOpen }) {
  const status = STATUS[app.status] ?? STATUS.off;
  const facts = useMemo(() => {
    if (!app.enabled) return [];
    if (app.category === 'identity') {
      const noun = { aws: 'account', azure: 'subscription', jenkins: 'controller', vault: 'cluster' }[app.key];
      return [`${formatNumber(app.connections)} ${noun}${app.connections === 1 ? '' : 's'}`, `${formatNumber(app.identities)} identities`, `${formatNumber(app.credentials)} credentials`];
    }
    if (app.category === 'exposure') return [`${formatNumber(app.repositories)} repositories`, `${formatNumber(app.findings)} open findings`];
    if (app.key === 'gmail') return [app.recipients?.length ? `${app.recipients.length} recipient${app.recipients.length === 1 ? '' : 's'}` : 'No recipients yet', `${formatNumber(app.sent_24h)} sent in 24h`];
    if (app.key === 'jira') return [app.project_key ? `Project ${app.project_key}` : 'No project yet', `${formatNumber(app.sent_24h)} issues in 24h`];
    return [];
  }, [app]);

  return (
    <li
      className={cn(
        'group flex min-h-[176px] flex-col rounded-[var(--radius-panel)] border bg-surface p-4 shadow-[var(--t-shadow-sm)] transition-[border-color,box-shadow,transform] duration-200',
        app.enabled ? 'border-line hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--t-shadow-md)]' : 'border-dashed border-line bg-surface-2/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ProviderIcon provider={app.key} size={22} tile className={cn(!app.enabled && 'opacity-70 grayscale-[35%]')} />
        <Switch checked={app.enabled} busy={busy} disabled={!canManage} onChange={onSwitch} label={`${app.enabled ? 'Switch off' : 'Switch on'} ${app.name}`} />
      </div>
      <h3 className={cn('mt-3 text-[14.5px] font-semibold', app.enabled ? 'text-ink' : 'text-ink-2')}>{app.name}</h3>
      <span className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] text-ink-3">
        <StatusDot status={app.status} />
        {status.label}
      </span>
      {app.enabled && facts.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {facts.map((fact) => (
            <li key={fact} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2">
              {fact}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-ink-3">{app.summary}</p>
      )}
      <div className="mt-auto flex items-center justify-end pt-3">
        {app.enabled ? (
          <Button variant="secondary" size="sm" iconRight={ArrowRight} onClick={onOpen}>
            {app.status === 'not_connected' ? 'Set up' : 'Open'}
          </Button>
        ) : (
          <span className="text-[11.5px] text-ink-3">Switch on to connect</span>
        )}
      </div>
    </li>
  );
}

function Summary({ label, value, hint, tone }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3">
      <p className="text-[12px] text-ink-3">{label}</p>
      <p data-numeric="" className="mt-1 text-[20px] leading-tight font-semibold tracking-[-0.015em] text-ink">
        {value}
      </p>
      {hint && <p className={cn('mt-0.5 text-[11.5px]', tone === 'medium' ? 'text-medium' : tone === 'low' ? 'text-low' : 'text-ink-3')}>{hint}</p>}
    </div>
  );
}

function HubSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[74px] rounded-[var(--radius-panel)]" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-[var(--radius-panel)]" />
    </div>
  );
}
