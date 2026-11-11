import { Link } from 'react-router-dom';
import { ArrowRight, KeyRound, PlugZap, ShieldAlert, Webhook, FolderGit2, Clock3 } from 'lucide-react';
import { useAuth } from '../auth';
import { useApi } from '../lib/useApi';
import { DETECTOR_LABEL, SOURCE_LABEL, plural, timeAgo } from '../lib/format';
import { Button } from '../ui/Button';
import { MARKS } from '../ui/Marks';
import { PageHeader } from '../ui/Page';
import { Panel, PanelHeader } from '../ui/Panel';
import { Skeleton } from '../ui/Skeleton';
import { ClearState, ErrorState } from '../ui/States';
import { ConnectionStatus, SeverityTag } from '../ui/Status';
import { Code } from '../ui/Tag';
import { cn } from '../ui/cn';

function Kpi({ icon: Icon, label, value, detail, to, tone }) {
  return (
    <Link to={to} className="group block rounded-[var(--radius-panel)] border border-line bg-surface p-4 transition-colors hover:border-line-strong sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
        <Icon aria-hidden="true" className={cn('size-4', tone === 'critical' ? 'text-critical' : 'text-ink-3')} />
      </div>
      <p data-numeric className="mt-2 font-display text-[28px] leading-none font-bold text-ink">{Number(value || 0).toLocaleString()}</p>
      <p className="mt-2 text-[12px] text-ink-3">{detail}</p>
    </Link>
  );
}

export default function Overview() {
  const { canManage } = useAuth();
  const { data, error, loading, reload } = useApi('/overview', { poll: 20000 });
  if (error && !data) return <ErrorState error={error} onRetry={() => reload()} />;
  if (loading && !data) return <Skeleton className="h-96 w-full" />;

  const { findings: f, jenkins: j, deliveries: d, connections } = data;
  const connected = connections.filter((c) => c.status === 'connected').length;

  return (
    <>
      <PageHeader title="Overview" description="Secrets found in your code, Jenkins credentials and what reached the console from your sources." />

      {connected === 0 && (
        <Panel prominence="lead" className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-info-soft text-brand">
            <PlugZap aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-ink">Connect a source to start</h2>
            <p className="mt-1 text-[13px] text-ink-3">
              {canManage
                ? 'Connect GitHub, Bitbucket Data Center or Jenkins. Each takes 5 to 15 minutes, and the first scan starts as soon as the connection passes its checks.'
                : 'Nothing is connected yet. An admin or analyst sets up the connections; this page fills in once they do.'}
            </p>
          </div>
          {canManage && (
            <Button as={Link} to="/connections" variant="primary" iconRight={ArrowRight}>
              Set up connections
            </Button>
          )}
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={ShieldAlert} tone={f.critical ? 'critical' : undefined} label="Open secrets in code" value={f.open} to="/findings"
          detail={f.open ? `${f.critical} critical · ${f.high} high · ${f.medium + f.low} other` : 'Nothing open'} />
        <Kpi icon={FolderGit2} label="Repositories scanned" value={data.repositories} to="/repositories"
          detail={`${plural(f.new_7d, 'secret')} found, ${f.resolved_7d} fixed in 7 days`} />
        <Kpi icon={KeyRound} label="Jenkins credentials" value={j.credentials} to="/jenkins"
          detail={j.credentials ? `${j.unused} not used by any job` : 'Connect Jenkins to list them'} />
        <Kpi icon={Webhook} tone={d.rejected_24h ? 'critical' : undefined} label="Webhook deliveries, 24 h" value={d.last_24h} to="/activity"
          detail={d.rejected_24h ? `${d.rejected_24h} rejected: check the secrets match` : 'All signatures valid'} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel flush>
          <PanelHeader className="p-4 sm:p-5" title="Newest open secrets" subtitle="Values are never stored: you see where it is and a redacted form."
            actions={<Button as={Link} to="/findings" size="sm" variant="ghost" iconRight={ArrowRight}>All</Button>} />
          {data.recent_findings.length === 0 ? (
            <ClearState compact title="No open secrets" description={connected ? 'Every scanned file is clean.' : 'Scans have not run yet.'} />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {data.recent_findings.map((r) => (
                <li key={r.id}>
                  <Link to={`/findings?open=${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
                    <SeverityTag severity={r.severity} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{DETECTOR_LABEL[r.detector] || r.detector}</span>
                      <span className="block truncate text-[12px] text-ink-3">{r.repository} · {r.file_path}:{r.line}</span>
                    </span>
                    <Code className="max-w-[180px]">{r.redacted}</Code>
                    <span className="text-[12px] whitespace-nowrap text-ink-3">{timeAgo(r.first_seen)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel flush>
            <PanelHeader className="p-4 sm:p-5" title="Sources" actions={<Button as={Link} to="/connections" size="sm" variant="ghost" iconRight={ArrowRight}>Manage</Button>} />
            <ul className="divide-y divide-line border-t border-line">
              {connections.map((c) => {
                const Mark = MARKS[c.kind];
                return (
                  <li key={c.kind} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <Mark size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink">{SOURCE_LABEL[c.kind]}</span>
                      <span className="flex items-center gap-1 truncate text-[12px] text-ink-3">
                        <Clock3 aria-hidden="true" className="size-3" />
                        {c.sync_status === 'running' ? c.sync_detail : c.last_sync_at ? `Last ${c.kind === 'jenkins' ? 'sync' : 'full scan'} ${timeAgo(c.last_sync_at)}` : 'No scan yet'}
                      </span>
                    </span>
                    <ConnectionStatus status={c.status} size="sm" />
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel flush>
            <PanelHeader className="p-4 sm:p-5" title="Most exposed repositories" />
            {data.top_repositories.length === 0 ? (
              <p className="border-t border-line px-5 py-4 text-[12.5px] text-ink-3">No repository has an open secret.</p>
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {data.top_repositories.map((r) => (
                  <li key={r.source + r.repository}>
                    <Link to={`/findings?repository=${encodeURIComponent(r.repository)}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.repository}</span>
                      {r.critical > 0 && <span className="text-[12px] font-semibold text-critical">{r.critical} critical</span>}
                      <span data-numeric className="text-[12.5px] text-ink-3">{r.open} open</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {j.unusual_7d > 0 && (
            <Link to="/jenkins?tab=builds" className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-high/30 bg-high-soft px-4 py-3 text-[13px] text-ink">
              <Clock3 aria-hidden="true" className="size-4 text-high" />
              <span className="flex-1">{plural(j.unusual_7d, 'unusual Jenkins build')} in the last 7 days</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
