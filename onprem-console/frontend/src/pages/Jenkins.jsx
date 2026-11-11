import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { dateTime, timeAgo } from '../lib/format';
import { PageHeader, Table } from '../ui/Page';
import { Panel } from '../ui/Panel';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/States';
import { Tag } from '../ui/Tag';
import { cn } from '../ui/cn';

function Credentials() {
  const { data, error, loading, reload } = useApi('/jenkins/credentials');
  if (error && !data) return <ErrorState error={error} onRetry={() => reload()} compact />;
  if (loading && !data) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;
  if (!data.credentials.length)
    return <EmptyState compact title="No Jenkins credentials yet" description="They appear after Jenkins is connected and its first sync finishes. Only metadata is read, never a value." />;
  return (
    <Table columns={['Credential', 'Type', 'Used by', 'First seen']}>
      {data.credentials.map((c) => (
        <tr key={c.store + c.domain + c.credential_id}>
          <td className="px-4 py-3">
            <span className="block font-mono text-[12.5px] font-medium text-ink">{c.credential_id}</span>
            {(c.description || c.display_name) && <span className="block max-w-[340px] truncate text-[12px] text-ink-3">{c.description || c.display_name}</span>}
          </td>
          <td className="px-4 py-3 text-ink-2">{c.type_name}</td>
          <td className="px-4 py-3">
            {c.used_by?.length ? (
              <span className="flex flex-wrap gap-1">{c.used_by.map((job) => <Tag key={job} size="sm">{job}</Tag>)}</span>
            ) : (
              <Tag size="sm" tone="medium">No job uses it: remove it?</Tag>
            )}
          </td>
          <td className="px-4 py-3 whitespace-nowrap text-ink-3">{timeAgo(c.first_seen)}</td>
        </tr>
      ))}
    </Table>
  );
}

function Builds({ unusual }) {
  const { data, error, loading, reload } = useApi(`/jenkins/builds${unusual ? '?unusual=true' : ''}`, { poll: 30000 });
  if (error && !data) return <ErrorState error={error} onRetry={() => reload()} compact />;
  if (loading && !data) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;
  if (!data.builds.length)
    return (
      <EmptyState compact title={unusual ? 'No unusual builds' : 'No builds received'}
        description="Builds arrive through the optional Notification plugin webhook (Connections → Jenkins → Webhook)." />
    );
  return (
    <Table columns={['Job', 'Build', 'Result', 'Why it stands out', 'When']}>
      {data.builds.map((b) => (
        <tr key={b.id}>
          <td className="px-4 py-3 font-medium text-ink">{b.job}</td>
          <td className="px-4 py-3" data-numeric>
            {b.url ? <a className="text-brand hover:underline" href={b.url} target="_blank" rel="noreferrer noopener">#{b.number}</a> : `#${b.number}`}
          </td>
          <td className="px-4 py-3"><Tag size="sm" tone={b.status === 'SUCCESS' ? 'low' : b.status ? 'critical' : 'neutral'}>{(b.status || b.phase).toLowerCase()}</Tag></td>
          <td className="px-4 py-3 text-ink-2">
            {b.unusual ? <span className="flex gap-1.5"><AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-high" />{b.unusual}</span> : <span className="text-ink-3">—</span>}
          </td>
          <td className="px-4 py-3 whitespace-nowrap text-ink-3">{dateTime(b.received_at)}</td>
        </tr>
      ))}
    </Table>
  );
}

const TABS = [
  ['credentials', 'Stored credentials'],
  ['unusual', 'Unusual builds'],
  ['builds', 'All builds'],
];

export default function Jenkins() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'credentials';
  return (
    <>
      <PageHeader title="Jenkins credentials" description="What Jenkins stores, which pipelines use each credential, and builds that ran at odd times. Metadata only." />
      <Panel flush>
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-3 pt-2">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setParams(key === 'credentials' ? {} : { tab: key }, { replace: true })}
              className={cn('-mb-px border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap', tab === key ? 'border-brand text-brand' : 'border-transparent text-ink-3 hover:text-ink')}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'credentials' ? <Credentials /> : <Builds unusual={tab === 'unusual'} />}
      </Panel>
    </>
  );
}
