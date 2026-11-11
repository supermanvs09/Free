import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { SOURCE_LABEL, timeAgo } from '../lib/format';
import { MARKS } from '../ui/Marks';
import { PageHeader, Table } from '../ui/Page';
import { Panel } from '../ui/Panel';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/States';

export default function Repositories() {
  const { data, error, loading, reload } = useApi('/repositories', { poll: 30000 });
  return (
    <>
      <PageHeader title="Repositories" description="Every repository the GitHub App or the Bitbucket token can read, with when it was last scanned in full." />
      <Panel flush>
        {error && !data ? (
          <ErrorState error={error} onRetry={() => reload()} compact />
        ) : loading && !data ? (
          <div className="p-4"><Skeleton className="h-40 w-full" /></div>
        ) : data.repositories.length === 0 ? (
          <EmptyState compact title="No repository scanned yet" description="Repositories appear after the first full scan of a connected GitHub or Bitbucket source." />
        ) : (
          <Table columns={['Repository', 'Source', 'Open secrets', 'Files scanned', 'Last full scan']}>
            {data.repositories.map((r) => {
              const Mark = MARKS[r.source];
              return (
                <tr key={r.source + r.full_name}>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-ink">{r.full_name}</span>
                      {r.web_url && (
                        <a href={r.web_url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${r.full_name}`} className="text-ink-3 hover:text-brand">
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </span>
                    {r.default_branch && <span className="font-mono text-[11.5px] text-ink-3">{r.default_branch}</span>}
                  </td>
                  <td className="px-4 py-3"><span className="flex items-center gap-2"><Mark size="sm" className="!size-6 !rounded-md" />{SOURCE_LABEL[r.source]}</span></td>
                  <td className="px-4 py-3" data-numeric>
                    {r.open_findings > 0 ? (
                      <Link className="font-semibold text-critical hover:underline" to={`/findings?repository=${encodeURIComponent(r.full_name)}`}>{r.open_findings}</Link>
                    ) : (
                      <span className="text-ink-3">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2" data-numeric>{Number(r.files_scanned).toLocaleString()}</td>
                  <td className="px-4 py-3 text-ink-3">{timeAgo(r.last_scanned_at)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}
