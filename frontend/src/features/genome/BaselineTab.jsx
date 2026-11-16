import { fetchGenomeBaseline } from '../../lib/api/genome';
import { useQuery } from '../../lib/hooks';
import { formatDate, formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { Panel, PanelHeader, DetailList, DetailRow } from '../../ui/Panel';
import { InlineError } from '../../ui/States';
import { ListSkeleton } from '../../ui/Skeleton';

const known = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const pct = (value) => (known(value) ? `${Math.round(Number(value))}%` : null);
const NOT_MEASURED = <span className="text-ink-3">Not measured yet</span>;

/**
 * How far the identity's normal behaviour is learned. Drift and peer
 * comparison are left out for now (removed on request; the API keeps them).
 */
export function BaselineTab({ sourceType, identityName }) {
  const baseline = useQuery((signal) => fetchGenomeBaseline(sourceType, identityName, signal), [sourceType, identityName]);
  return <LearningPanel query={baseline} />;
}

function LearningPanel({ query }) {
  const b = query.data;
  return (
    <Panel prominence="lead" className="animate-rise">
      <PanelHeader prominence="lead" title="Learning progress" subtitle="Normal behaviour is learned from the identity's own calls over a learning period." />
      {query.isError && !b ? (
        <InlineError error={query.error} onRetry={query.refetch} />
      ) : !b ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            {/* Established or learning - no day counts: the pipeline's built
                and required days do not add up reliably. */}
            <p className="text-[13px] font-medium text-ink">{String(b.status).toLowerCase() === 'active' ? 'Baseline established' : 'Learning'}</p>
          </div>
          <DetailList>
            <DetailRow label="First seen">{b.first_seen_date ? formatDate(b.first_seen_date) : NOT_MEASURED}</DetailRow>
            <DetailRow label="Baseline active since">{b.active_since ? <span title={formatDateTime(b.active_since)}>{formatDate(b.active_since)}</span> : NOT_MEASURED}</DetailRow>
            <DetailRow label="Last updated">{b.updated_at ? <span title={formatDateTime(b.updated_at)}>{formatRelative(b.updated_at)}</span> : NOT_MEASURED}</DetailRow>
            <DetailRow label="How sure the model is">{pct(b.model_confidence_percent) ?? NOT_MEASURED}</DetailRow>
            <DetailRow label="Versions published">{formatNumber((b.versions ?? []).length)}</DetailRow>
          </DetailList>
        </div>
      )}
    </Panel>
  );
}
