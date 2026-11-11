import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchAllAnomalies } from '../../lib/api/genome';
import { useAccess } from '../../app/useAccess';
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
 * The list API filters by text, not by key, so the identity's own display
 * name is searched and the rows are kept to this identity's keys.
 */
export function IdentityAnomalies({ sourceType, keys, displayName }) {
  const [state, setState] = useState('open');
  const [selected, setSelected] = useState(null);
  const [pattern, setPattern] = useState(null);
  const { can } = useAccess();
  const keySet = useMemo(() => new Set(keys.filter(Boolean)), [keys]);
  const query = useQuery(
    (signal) => fetchAllAnomalies({ state: state === 'all' ? '' : 'open', sourceType, search: displayName || keys[0] }, signal),
    [state, sourceType, displayName, [...keySet].join('|')],
  );
  const items = (query.data?.items ?? []).filter(
    (item) => keySet.has(item.identity?.identity_name) || (displayName && item.identity?.display_name === displayName),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-2">
          Repeats of the same departure are folded into one line. Open one to compare normal with what happened, and give a verdict.
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
          canAct={can('anomalies.review')}
          onChanged={query.refetch}
          onOpen={(item, pattern) => {
            setSelected(item);
            setPattern(pattern ?? null);
          }}
        />
      )}
      <AnomalyDrawer anomaly={selected} pattern={pattern} onPick={setSelected} onClose={() => setSelected(null)} onReviewed={query.refetch} />
    </div>
  );
}
