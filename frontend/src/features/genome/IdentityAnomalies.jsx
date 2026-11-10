import { useMemo, useState } from 'react';
import { Archive, CheckCircle2, FileSearch, RotateCcw, ShieldCheck } from 'lucide-react';
import { fetchAnomalies, fetchAnomalyEvidence, saveAnomalyFeedback, setAnomalyDisposition } from '../../lib/api/genome';
import { useAccess } from '../../app/useAccess';
import { useQuery } from '../../lib/hooks';
import { severityMeta } from '../../lib/domain';
import { formatDateTime, formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Meter } from '../../ui/Meter';
import { Panel } from '../../ui/Panel';
import { ListSkeleton } from '../../ui/Skeleton';
import { EmptyState, InlineError } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { AnomalyDrawer } from './AnomalyDrawer';
import { anomalyStatusMeta, dimensionLabel } from './meta';

const asText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(asText).join(', ');
  if (typeof value !== 'object') return String(value);
  return Object.entries(value)
    .map(([k, v]) => `${k}: ${asText(v)}`)
    .join('; ');
};

const STATES = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
];

/**
 * One identity's departures from its baseline, one card each: what it
 * normally does next to what it did, how sure the detector is, and the
 * reviewer's two usual answers (dealt with, or expected). The full evidence
 * and verdict form open in the drawer.
 *
 * The list API filters by text, not by key, so the identity's own display
 * name is searched and the rows are kept to this identity's keys.
 */
export function IdentityAnomalies({ sourceType, keys, displayName }) {
  const [state, setState] = useState('open');
  const [selected, setSelected] = useState(null);
  const keySet = useMemo(() => new Set(keys.filter(Boolean)), [keys]);
  const query = useQuery(
    (signal) => fetchAnomalies({ state: state === 'all' ? '' : 'open', sourceType, search: displayName || keys[0], limit: 100 }, signal),
    [state, sourceType, displayName, [...keySet].join('|')],
  );
  const items = (query.data?.items ?? []).filter(
    (item) => keySet.has(item.identity?.identity_name) || (displayName && item.identity?.display_name === displayName),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-2">
          Each card compares what this identity normally does with what it did. Acknowledge one once it is dealt with; mark it expected if it was a planned change.
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
        items.map((item) => <AnomalyCard key={item.id} item={item} onOpen={() => setSelected(item)} onChanged={query.refetch} />)
      )}
      <AnomalyDrawer anomaly={selected} onClose={() => setSelected(null)} onReviewed={query.refetch} />
    </div>
  );
}

function AnomalyCard({ item, onOpen, onChanged }) {
  const evidence = useQuery((signal) => fetchAnomalyEvidence(item.id, signal), [item.id]);
  const { can } = useAccess();
  const canAct = can('anomalies.review');
  const { notify } = useToast();
  const [busy, setBusy] = useState(null);
  const comparison = evidence.data?.comparison;
  const severity = severityMeta(item.severity);
  const status = anomalyStatusMeta(item.state);
  const open = String(item.state).toLowerCase() === 'open';

  const act = async (key) => {
    setBusy(key);
    try {
      if (key === 'expected') {
        await saveAnomalyFeedback(item.id, { decision: 'legitimate', approvedForBaseline: true });
        await setAnomalyDisposition(item.id, { disposition: 'dismissed', reason: 'Expected behaviour' });
      } else {
        await setAnomalyDisposition(item.id, { disposition: key === 'reopen' ? 'open' : 'resolved' });
      }
      notify({
        variant: 'success',
        title: key === 'expected' ? 'Marked expected' : key === 'reopen' ? 'Opened again' : 'Acknowledged',
        description: key === 'reopen' ? 'It is back on the open list.' : 'It no longer counts as open.',
      });
      onChanged?.();
    } catch (error) {
      notify({
        variant: 'error',
        title: 'Could not update the anomaly',
        description: error?.status === 403 ? 'Your role cannot review anomalies.' : error?.message,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel prominence="lead" className="animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{dimensionLabel(item.dimension)}</h3>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">{comparison?.reason || item.what_changed}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {item.severity && (
            <Tag tone={severity.tone} size="sm" dot>
              {severity.label}
            </Tag>
          )}
          <Tag tone={status.tone} size="sm">
            {status.label}
          </Tag>
        </span>
      </div>

      <div className="mt-4 grid gap-3 @min-[40rem]:grid-cols-2">
        <div className="rounded-[var(--radius-control)] border border-line bg-surface p-3.5">
          <p className="text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">Baseline</p>
          <p className="mt-1.5 text-[14px] font-semibold break-words text-ink">
            {evidence.isLoading ? '…' : asText(comparison?.baseline_value) || 'Not recorded'}
          </p>
          <p className="mt-1 text-[12px] text-ink-3">What this identity normally does</p>
        </div>
        <div className="rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft p-3.5">
          <p className="text-[10.5px] font-semibold tracking-[0.085em] text-critical uppercase">Observed</p>
          <p className="mt-1.5 text-[14px] font-semibold break-words text-ink">
            {evidence.isLoading ? '…' : asText(comparison?.observed_value) || item.what_changed}
          </p>
          <p className="mt-1 text-[12px] text-ink-3">{item.region ? `In ${item.region}` : 'What it did this time'}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[12px] text-ink-3">Confidence</span>
        {Number.isFinite(item.provenance_confidence) ? (
          <>
            <Meter className="min-w-32 flex-1" value={item.provenance_confidence} tone={severity.tone === 'neutral' ? 'brand' : severity.tone} height={5} />
            <span data-numeric="" className="text-[13px] font-semibold text-ink">
              {item.provenance_confidence}%
            </span>
          </>
        ) : (
          <span className="flex-1 text-[12px] text-ink-3">Not measured</span>
        )}
        <span className="text-[12px] text-ink-3" title={formatDateTime(item.detected_at)}>
          Detected {formatRelative(item.detected_at)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
        {open ? (
          <>
            <Button size="sm" icon={CheckCircle2} onClick={() => act('ack')} loading={busy === 'ack'} disabled={!canAct || Boolean(busy)}>
              Acknowledge
            </Button>
            <Button variant="secondary" size="sm" icon={Archive} onClick={() => act('expected')} loading={busy === 'expected'} disabled={!canAct || Boolean(busy)}>
              Expected behaviour
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => act('reopen')} loading={busy === 'reopen'} disabled={!canAct || Boolean(busy)}>
            Open again
          </Button>
        )}
        <Button variant="ghost" size="sm" icon={FileSearch} onClick={onOpen}>
          Full evidence
        </Button>
        {!canAct && <span className="text-[11.5px] text-ink-3">Your role can read anomalies but not review them.</span>}
        {evidence.isError && <InlineError error={evidence.error} onRetry={evidence.refetch} label="Evidence" />}
      </div>
    </Panel>
  );
}
