import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchIdentityAnomalies } from '../../lib/api/genome';
import { formatNumber } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { Panel } from '../../ui/Panel';
import { ListSkeleton } from '../../ui/Skeleton';
import { EmptyState, InlineError } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { AnomalyDrawer } from './AnomalyDrawer';
import { AnomalyPatterns } from './AnomalyGroups';

const STATES = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
];

/**
 * One identity's departures from its baseline, folded into repeating
 * patterns (same departure, numbers aside) so hundreds of near-identical
 * anomalies read as one line each. The evidence and verdict open in the drawer.
 *
 * The rows are the anomalies list filtered by this identity's
 * event_identity_name from the genome list (the name its alerts are recorded
 * under). `loading` is true while that name is being looked up.
 */
export function IdentityAnomalies({ eventIdentityName, loading = false }) {
  const [state, setState] = useState('open');
  const [selected, setSelected] = useState(null);
  const [pattern, setPattern] = useState(null);
  const query = useQuery(
    (signal) => (loading ? new Promise(() => {}) : fetchIdentityAnomalies({ state: state === 'all' ? '' : 'open', eventIdentityName }, signal)),
    [state, eventIdentityName, loading],
  );
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const total = query.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-2">
          {query.data ? (
            <>
              <span className="font-semibold text-ink" data-numeric="">
                {formatNumber(total)}
              </span>{' '}
              {state === 'open' ? 'open' : ''} {total === 1 ? 'anomaly' : 'anomalies'}
              {items.length < total ? `, the newest ${formatNumber(items.length)} shown` : ''}. Repeats of the same departure are folded into one line; open
              one to compare normal with what happened and give a verdict.
            </>
          ) : (
            'Repeats of the same departure are folded into one line. Open one to compare normal with what happened, and give a verdict.'
          )}
        </p>
        <SegmentedControl label="Which anomalies" options={STATES} value={state} onChange={setState} />
      </div>
      {query.isError && !query.data ? (
        <Panel prominence="quiet">
          <InlineError error={query.error} onRetry={query.refetch} />
        </Panel>
      ) : !query.data ? (
        <Panel prominence="quiet">
          <ListSkeleton rows={3} />
        </Panel>
      ) : items.length === 0 ? (
        <Panel prominence="quiet">
          <EmptyState
            compact
            icon={ShieldCheck}
            title={state === 'open' ? 'No open anomalies' : 'No anomalies recorded'}
            description={
              state === 'open'
                ? 'This identity is behaving like its baseline. Choose All to see the ones already reviewed.'
                : 'Everything this identity did matched its normal behaviour.'
            }
          />
        </Panel>
      ) : (
        <AnomalyPatterns
          items={items}
          onOpen={(item, pattern) => {
            setSelected(item);
            setPattern(pattern ?? null);
          }}
        />
      )}
      <AnomalyDrawer anomaly={selected} pattern={pattern} onClose={() => setSelected(null)} onReviewed={query.refetch} />
    </div>
  );
}
