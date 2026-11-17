import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { fetchIdentityEvents } from '../../lib/api/inventory';
import { useQuery } from '../../lib/hooks/useQuery';
import { Panel } from '../../ui/Panel';
import { DetailSkeleton } from '../../ui/Skeleton';
import { EmptyState, InlineError } from '../../ui/States';

/**
 * The API calls this identity makes, in three fields: what call, which
 * service, what resource. No scores, timestamps or badges. Values wrap rather
 * than cut off, so an ARN can always be read in full.
 */
export function ApiCallsCard({ identityId }) {
  const query = useQuery((signal) => fetchIdentityEvents(identityId, 'timeline', { pageSize: 20 }, signal), [identityId]);
  const events = query.data?.events ?? [];

  return (
    <Panel prominence="quiet" flush className="animate-rise overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="text-[13px] font-semibold text-ink">API calls</h3>
        <Link to={`/identities/${encodeURIComponent(identityId)}?tab=activity`} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand hover:underline">
          View all <ArrowUpRight aria-hidden="true" className="size-3" />
        </Link>
      </div>

      {query.isLoading && !query.data && <DetailSkeleton rows={4} />}
      {query.isError && !query.data && <InlineError error={query.error} onRetry={query.refetch} label="API calls could not be loaded" />}
      {query.data && events.length === 0 && (
        <EmptyState compact title="No API calls recorded" description="The AWS activity log (CloudTrail) has not recorded any call for this identity." />
      )}
      {events.length > 0 && (
        <ul className="divide-y divide-line">
          {events.map((event, i) => (
            <li key={event.event_id ?? i} className="px-4 py-2.5">
              <span className="block font-mono text-[12.5px] font-medium text-ink [overflow-wrap:anywhere]">{event.event_name || 'Unnamed call'}</span>
              <span className="mt-0.5 block text-[11px] text-ink-3 [overflow-wrap:anywhere]">
                {event.event_source || 'Service not recorded'} · {event.resource_arn || event.resource_name || 'No resource'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
