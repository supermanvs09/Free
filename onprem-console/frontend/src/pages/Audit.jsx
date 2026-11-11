import { useApi } from '../lib/useApi';
import { dateTime } from '../lib/format';
import { PageHeader, Table } from '../ui/Page';
import { Panel } from '../ui/Panel';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/States';

export default function Audit() {
  const { data, error, loading, reload } = useApi('/audit');
  return (
    <>
      <PageHeader title="Audit log" description="Sign-ins, connection changes, scans, triage and changes to people. The newest 200 entries." />
      <Panel flush>
        {error && !data ? (
          <ErrorState error={error} onRetry={() => reload()} compact />
        ) : loading && !data ? (
          <div className="p-4"><Skeleton className="h-40 w-full" /></div>
        ) : (
          <Table columns={['When', 'Who', 'Action', 'Target', 'Detail']}>
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2.5 whitespace-nowrap text-ink-3">{dateTime(e.at)}</td>
                <td className="px-4 py-2.5 text-ink">{e.actor}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-ink-2">{e.action}</td>
                <td className="px-4 py-2.5 text-ink-2">{e.target || '—'}</td>
                <td className="px-4 py-2.5 text-[12.5px] text-ink-3">{e.detail || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
