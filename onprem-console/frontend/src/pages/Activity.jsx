import { useState } from 'react';
import { useApi } from '../lib/useApi';
import { SOURCE_LABEL, dateTime } from '../lib/format';
import { PageHeader, Table } from '../ui/Page';
import { Panel } from '../ui/Panel';
import { Select } from '../ui/Field';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/States';
import { Tag } from '../ui/Tag';

const OUTCOME = { processed: 'low', accepted: 'info', ignored: 'neutral', rejected: 'critical', failed: 'high' };

export default function Activity() {
  const [source, setSource] = useState('');
  const { data, error, loading, reload } = useApi(`/deliveries${source ? `?source=${source}` : ''}`, { poll: 15000 });
  return (
    <>
      <PageHeader title="Webhook activity" description="Every event GitHub, Bitbucket and Jenkins sent. A rejected delivery almost always means the webhook secret or address does not match."
        actions={<Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="All sources"
          options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} className="w-44" />} />
      <Panel flush>
        {error && !data ? (
          <ErrorState error={error} onRetry={() => reload()} compact />
        ) : loading && !data ? (
          <div className="p-4"><Skeleton className="h-40 w-full" /></div>
        ) : !data.deliveries.length ? (
          <EmptyState compact title="Nothing received yet" description="Deliveries show here once a source's webhook points at this console." />
        ) : (
          <Table columns={['When', 'Source', 'Event', 'Repository or job', 'Outcome', 'Detail']} minWidth="52rem">
            {data.deliveries.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-3 whitespace-nowrap text-ink-3">{dateTime(d.received_at)}</td>
                <td className="px-4 py-3">{SOURCE_LABEL[d.source]}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-ink-2">{d.event || '—'}</td>
                <td className="max-w-[220px] truncate px-4 py-3 text-ink">{d.repository || '—'}</td>
                <td className="px-4 py-3"><Tag size="sm" tone={OUTCOME[d.outcome]} className="capitalize">{d.outcome}</Tag></td>
                <td className="max-w-[360px] px-4 py-3 text-[12.5px] text-ink-2">{d.detail}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
