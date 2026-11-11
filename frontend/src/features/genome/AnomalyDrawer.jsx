import { useState } from 'react';
import { Archive, CheckCircle2, ChevronDown, HelpCircle, MessageSquarePlus, Repeat2, RotateCcw, ShieldAlert } from 'lucide-react';
import { fetchAnomaly, fetchAnomalyEvidence, saveAnomalyFeedback, setAnomalyDisposition } from '../../lib/api/genome';
import { useAccess } from '../../app/useAccess';
import { severityMeta } from '../../lib/domain';
import { useMutation, useQuery } from '../../lib/hooks';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Drawer } from '../../ui/Overlay';
import { DetailList, DetailRow, SectionLabel } from '../../ui/Panel';
import { InlineError } from '../../ui/States';
import { DetailSkeleton } from '../../ui/Skeleton';
import { Code, Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { TONE_BG, cn } from '../../ui/cn';
import { dimensionLabel, sourceTypeLabel } from './meta';

const VERDICTS = [
  { key: 'legitimate', label: 'Expected', icon: CheckCircle2, hint: 'It was a planned or normal change.' },
  { key: 'malicious', label: 'Suspicious', icon: ShieldAlert, hint: 'Nobody should have done this.' },
  { key: 'unknown', label: 'Not sure', icon: HelpCircle, hint: 'Needs another look.' },
];

const titleCase = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

const asText = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(asText).join(', ');
  const entries = Object.entries(value);
  if (entries.length === 1 && entries[0][0] === 'value') return asText(entries[0][1]);
  return entries.length === 0 ? '' : entries.map(([k, v]) => `${k}: ${asText(v)}`).join('; ');
};

/* The baseline arrives as a frequency map ({value: weight}) or a one-key
   object ({caller_session_key: value}); people want the values, not the
   weights or the key names. */
const valuesOf = (value) => {
  if (value === null || value === undefined || value === '') return [];
  // "value: 2.63; other: 1.2" - a frequency map already flattened to text
  if (typeof value === 'string' && /:\s+-?\d+(\.\d+)?\s*(;|$)/.test(value)) {
    return value.split(';').map((part) => part.trim().replace(/:\s+-?\d+(\.\d+)?$/, '')).filter(Boolean);
  }
  if (typeof value !== 'object') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(valuesOf);
  const entries = Object.entries(value);
  if (entries.length > 0 && entries.every(([, v]) => typeof v === 'number')) {
    return entries.sort((x, y) => y[1] - x[1]).map(([k]) => k);
  }
  if (entries.length === 1) return valuesOf(entries[0][1]);
  return [asText(value)];
};

/* The detector's wording, in plain words. */
const plainReason = (text) => (/new categorical value/i.test(String(text)) ? 'Used something it has never used before' : text);

/** Usually versus this time: the question a reviewer asks first. */
function Comparison({ normal, observed }) {
  const usual = valuesOf(normal);
  const now = valuesOf(observed);
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-surface p-3.5 text-[12.5px]">
      <div>
        <p className="font-medium text-ink-3">This time</p>
        <p className="mt-0.5 font-mono font-semibold break-all text-ink">{now.join(', ') || 'Not recorded'}</p>
      </div>
      <div>
        <p className="font-medium text-ink-3">Usually</p>
        {usual.length === 0 ? (
          <p className="mt-0.5 text-ink-3">Nothing recorded yet</p>
        ) : (
          <ul className="mt-0.5 flex flex-col gap-0.5 font-mono break-all text-ink-2">
            {usual.slice(0, 3).map((v) => <li key={v}>{v}</li>)}
            {usual.length > 3 && <li className="font-sans text-ink-3">and {usual.length - 3} more</li>}
          </ul>
        )}
      </div>
    </div>
  );
}

/** How often the same thing happened, in one sentence. */
function PatternStrip({ pattern }) {
  if (!pattern || pattern.items.length < 2) return null;
  return (
    <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
      <Repeat2 aria-hidden="true" className="size-4 shrink-0 text-brand" />
      Happened <b className="font-semibold text-ink">{formatNumber(pattern.items.length)} times</b> since {formatRelative(new Date(pattern.first).toISOString())}.
    </p>
  );
}

/** One anomaly: what departed, the call behind it, and the reviewer's verdict. */
export function AnomalyDrawer({ anomaly, pattern, onClose, onReviewed }) {
  const id = anomaly?.id;
  const detail = useQuery((signal) => (id ? fetchAnomaly(id, signal) : Promise.resolve(null)), [id]);
  const evidence = useQuery((signal) => (id ? fetchAnomalyEvidence(id, signal) : Promise.resolve(null)), [id]);
  const { notify } = useToast();
  const [reason, setReason] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [approve, setApprove] = useState(false);
  const save = useMutation((input) => saveAnomalyFeedback(id, input));
  const dispose = useMutation((input) => setAnomalyDisposition(id, input));
  const { can } = useAccess();
  const canAct = can('anomalies.review');

  const setState = async (disposition) => {
    const outcome = await dispose.mutate({ disposition, reason: reason.trim() });
    if (!outcome.ok) {
      notify({
        variant: 'error',
        title: 'Could not update the anomaly',
        description: outcome.error?.status === 403 ? 'Your role cannot close anomalies.' : outcome.error?.message,
      });
      return;
    }
    notify({
      variant: 'success',
      title: disposition === 'resolved' ? 'Marked resolved' : disposition === 'dismissed' ? 'Dismissed' : 'Opened again',
      description: disposition === 'open' ? 'It is back on the open list.' : 'It no longer counts as open.',
    });
    detail.refetch();
    onReviewed?.();
  };

  const submit = async (decision) => {
    const outcome = await save.mutate({ decision, approvedForBaseline: decision === 'legitimate' && approve, reason: reason.trim() });
    if (!outcome.ok) {
      notify({ variant: 'error', title: 'Could not save the verdict', description: outcome.error?.message });
      return;
    }
    notify({ variant: 'success', title: 'Verdict saved', description: 'Recorded with your name and used to tune the baseline.' });
    evidence.refetch();
    onReviewed?.();
  };

  const e = evidence.data;
  const d = detail.data;
  const feedback = e?.feedback;
  const identity = anomaly?.identity;
  const isOpen = String(d?.state ?? anomaly?.state).toLowerCase() === 'open';
  const sev = severityMeta(anomaly?.severity || e?.risk?.severity);
  const score = e?.comparison?.score_0_1;
  const strangeness = score !== null && score !== undefined && Number.isFinite(Number(score)) ? Math.round(Number(score) * 100) : null;
  const ev = e?.event;

  const footer = d && e && (
    <div className="flex w-full flex-col gap-2.5">
      {noteOpen && (
        <div className="flex flex-col gap-2">
          <textarea
            id="anomaly-reason"
            aria-label="Note kept with your verdict or closing"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            rows={2}
            className="w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none"
            placeholder="For example: approved deployment, change ticket CHG-1042"
          />
          <label className="flex items-center gap-2 text-[12px] text-ink-2">
            <input type="checkbox" checked={approve} onChange={(event) => setApprove(event.target.checked)} />
            If marked expected, learn it as normal behaviour
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[12px] font-medium text-ink-3">Verdict</span>
        {VERDICTS.map(({ key, label, icon: Icon, hint }) => (
          <Button
            key={key}
            size="sm"
            variant={feedback?.decision === key ? 'primary' : 'secondary'}
            icon={Icon}
            onClick={() => submit(key)}
            loading={save.pending}
            title={hint}
          >
            {label}
          </Button>
        ))}
        {!noteOpen && <Button size="sm" variant="ghost" icon={MessageSquarePlus} onClick={() => setNoteOpen(true)}>Note</Button>}
        <span className="ml-auto flex gap-2">
          {isOpen ? (
            <>
              <Button size="sm" variant="ghost" icon={Archive} onClick={() => setState('dismissed')} loading={dispose.pending} locked={canAct ? undefined : 'Your role cannot close anomalies.'}>
                Dismiss
              </Button>
              <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => setState('resolved')} loading={dispose.pending} locked={canAct ? undefined : 'Your role cannot close anomalies.'}>
                Resolve
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => setState('open')} loading={dispose.pending} locked={canAct ? undefined : 'Your role cannot reopen anomalies.'}>
              Open again
            </Button>
          )}
        </span>
      </div>
    </div>
  );

  return (
    <Drawer
      open={Boolean(anomaly)}
      onClose={onClose}
      eyebrow={identity ? sourceTypeLabel(identity.source_type, identity.identity_name) : 'Departure from baseline'}
      title={identity?.display_name || identity?.identity_name || 'Anomaly'}
      footer={footer}
    >
      {detail.isError && !d ? (
        <div className="px-4 py-4 sm:px-5"><InlineError error={detail.error} onRetry={detail.refetch} /></div>
      ) : !d || !e ? (
        <div className="px-4 py-4 sm:px-5"><DetailSkeleton rows={6} /></div>
      ) : (
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-4 pl-5">
            <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', sev.weight ? TONE_BG[sev.tone] : 'bg-line-strong')} />
            <div className="flex flex-wrap items-center gap-1.5">
              {sev.weight ? <Tag tone={sev.tone} size="sm" dot>{sev.label}</Tag> : null}
              <Tag size="sm">{dimensionLabel(e.comparison?.dimension ?? anomaly.dimension)}</Tag>
              <Tag size="sm" tone={isOpen ? 'high' : 'neutral'}>{isOpen ? 'Open' : titleCase(String(d.state))}</Tag>
              <span className="ml-auto text-[12px] text-ink-3" title={formatDateTime(d.detail?.detected_at ?? anomaly.detected_at)}>
                {formatRelative(d.detail?.detected_at ?? anomaly.detected_at)}
              </span>
            </div>
            <p className="mt-2.5 text-[15px] leading-snug font-semibold text-ink">{plainReason(e.comparison?.reason || anomaly.what_changed)}</p>
            {strangeness !== null && (
              <div className="mt-2.5 flex items-center gap-2.5">
                <span className="h-1.5 w-28 overflow-hidden rounded-full bg-track">
                  <span className={cn('block h-full rounded-full', strangeness >= 80 ? 'bg-critical' : strangeness >= 50 ? 'bg-high' : 'bg-medium')} style={{ width: `${strangeness}%` }} />
                </span>
                <span className="text-[12px] text-ink-3">
                  <b data-numeric="" className="font-semibold text-ink-2">{strangeness}%</b> unlike its normal behaviour
                </span>
              </div>
            )}
          </div>

          <Comparison normal={e.comparison?.baseline_value} observed={e.comparison?.observed_value} />

          <PatternStrip pattern={pattern} />

          <div>
            <SectionLabel>The call behind it</SectionLabel>
            {ev ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius-control)] border border-line px-3.5 py-2.5">
                <Code>{ev.event_source?.replace('.amazonaws.com', '')}:{ev.event_name}</Code>
                <span className="text-[12.5px] text-ink-2" title={formatDateTime(ev.event_time)}>{formatRelative(ev.event_time)}</span>
                <span className="font-mono text-[12px] text-ink-3">{[ev.source_ip, ev.region].filter(Boolean).join(' · ') || 'Source not recorded'}</span>
              </div>
            ) : (
              <p className="mt-1.5 text-[12.5px] text-ink-3">The call behind this anomaly could not be read from the activity store just now.</p>
            )}
          </div>

          {feedback && (
            <p className="text-[12.5px] text-ink-3">
              Marked <b className="font-semibold text-ink-2">{feedback.decision === 'legitimate' ? 'expected' : feedback.decision === 'malicious' ? 'suspicious' : 'not sure'}</b>
              {feedback.reviewer ? ` by ${feedback.reviewer}` : ''}
              {feedback.updated_at ? `, ${formatRelative(feedback.updated_at)}` : ''}.
            </p>
          )}

          <div className="border-t border-line pt-2">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className="flex w-full items-center gap-1.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink"
            >
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', !moreOpen && '-rotate-90')} />
              More details
            </button>
            {moreOpen && (
              <DetailList className="animate-fade">
                {ev && <DetailRow label="Called at">{formatDateTime(ev.event_time)}</DetailRow>}
                {ev && <DetailRow label="Resources" mono>{(ev.resource_arns ?? []).join(', ') || 'None recorded'}</DetailRow>}
                {ev && <DetailRow label="Tool used" mono>{ev.user_agent || 'Not recorded'}</DetailRow>}
                {ev && <DetailRow label="Account" mono>{ev.account_id || '—'}</DetailRow>}
                {ev && ev.request_id && <DetailRow label="Request ID" mono>{ev.request_id}</DetailRow>}
                {e.risk && (
                  <DetailRow label="Call risk">
                    {e.risk.severity || 'Unrated'}
                    {e.risk.score !== null && e.risk.score !== undefined ? ` · score ${formatNumber(e.risk.score)}` : ''}
                  </DetailRow>
                )}
                <DetailRow label="Anomaly ID" mono>{anomaly.id}</DetailRow>
              </DetailList>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
