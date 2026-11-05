import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Clock3,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import { useAccess } from '../../app/useAccess';
import {
  MOVING_STATUSES,
  approvePlan,
  cancelPlan,
  confirmExternal,
  executePlan,
  fetchActions,
  fetchPlan,
  fetchPlanAudit,
  markPlanDone,
  rejectPlan,
  rollbackExecution,
  submitPlan,
} from '../../lib/api/remediation';
import { useQuery } from '../../lib/hooks';
import { formatDateTime, formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { CopyButton, CopyableValue } from '../../ui/Copyable';
import { Field, Textarea } from '../../ui/Field';
import { Drawer, Modal } from '../../ui/Overlay';
import { DetailList, DetailRow, SectionLabel } from '../../ui/Panel';
import { Skeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Tabs } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import {
  AUDIT_EVENT,
  EXEC_STATUS,
  MODE_LABEL,
  PRECHECK_TONE,
  approvalBlockedReason,
  executeRunOf,
  isStalled,
  fixName,
  planActions,
  riskMeta,
  statusMeta,
  targetLabel,
} from './meta';

/* Polling (§7): every 2.5 s while a run is scheduled or under way, for about
   a minute after something was done here; every minute while the plan waits
   for the next scan to resolve it. */
const FAST_MS = 2500;
const FAST_FOR_MS = 75000;
const SLOW_MS = 60000;

/**
 * One plan: what it changes, its state in plain words, the buttons this
 * person may use on it, its runs and its history. `planId` null closes it.
 */
export function PlanDrawer({ planId, onClose, onChanged, followFrom = 0 }) {
  const open = Boolean(planId);
  return open ? <PlanDrawerBody key={planId} planId={planId} onClose={onClose} onChanged={onChanged} followFrom={followFrom} /> : null;
}

function PlanDrawerBody({ planId, onClose, onChanged, followFrom }) {
  const [tab, setTab] = useState('overview');
  const [revision, setRevision] = useState(0);
  const [followUntil, setFollowUntil] = useState(() => (followFrom ? followFrom + FAST_FOR_MS : 0));
  const query = useQuery((signal) => fetchPlan(planId, signal), [planId, revision]);
  const catalog = useQuery((signal) => fetchActions(signal), []);
  const detail = query.data;
  const plan = detail?.plan;
  const status = plan?.status;

  /* Follow the plan while it moves. */
  const refetch = query.refetch;
  useEffect(() => {
    if (!status) return undefined;
    const moving = MOVING_STATUSES.includes(status) || (Date.now() < followUntil && status !== 'PENDING_APPROVAL');
    const slow = ['VERIFIED', 'EXECUTED', 'MANUALLY_DONE', 'PENDING_APPROVAL'].includes(status);
    if (!moving && !slow) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (moving && Date.now() > followUntil && !MOVING_STATUSES.includes(status)) return;
      refetch();
    }, moving ? FAST_MS : SLOW_MS);
    return () => clearInterval(id);
  }, [status, followUntil, refetch]);

  const meta = statusMeta(status);
  const title = plan ? fixName(plan.actionType, catalog.data) : 'Remediation plan';
  const reload = () => {
    setRevision((n) => n + 1);
    onChanged?.();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      eyebrow={plan ? `${MODE_LABEL[plan.mode] ?? plan.mode} plan` : 'Remediation plan'}
      title={title}
      subtitle={
        plan ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <Tag tone={meta.tone} size="sm" dot>
              {meta.label}
            </Tag>
            <Tag tone={riskMeta(plan.riskLevel).tone} size="sm">
              {riskMeta(plan.riskLevel).label}
            </Tag>
            {plan.byEngine && (
              <Tag tone="neutral" size="sm">
                Made by the rule engine
              </Tag>
            )}
            <span className="truncate" title={plan.targetArn}>
              {targetLabel(plan.targetArn)}
            </span>
          </span>
        ) : null
      }
      footer={detail ? <PlanFooter detail={detail} onDone={reload} onFollow={() => setFollowUntil(Date.now() + FAST_FOR_MS)} /> : null}
    >
      {query.isError && !detail ? (
        <div className="p-5">
          <ErrorState error={query.error} onRetry={query.refetch} title="The plan could not be read" compact />
        </div>
      ) : !detail ? (
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b border-line px-4 sm:px-5">
            <Tabs
              tabs={[
                { value: 'overview', label: 'Overview' },
                { value: 'runs', label: 'Runs', count: detail.executions.length || undefined },
                { value: 'history', label: 'History' },
              ]}
              value={tab}
              onChange={setTab}
              size="sm"
            />
          </div>
          <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
            {tab === 'overview' && <Overview detail={detail} refreshing={query.isRefreshing} />}
            {tab === 'runs' && <Runs executions={detail.executions} />}
            {tab === 'history' && <History planId={planId} revision={revision} />}
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ── Overview ──────────────────────────────────────────────────────────── */

function StatusBanner({ detail }) {
  const { user } = useAuth();
  const { can } = useAccess();
  const { plan, approvals } = detail;
  const s = plan.status;
  const blocked = approvalBlockedReason(plan, { can, user });
  const tone = statusMeta(s).tone;
  const Icon = {
    PENDING_APPROVAL: UserCheck,
    SCHEDULED: Loader2,
    EXECUTING: Loader2,
    APPROVED: Clock3,
    FAILED: XCircle,
    REJECTED: XCircle,
    DRAFT: ShieldAlert,
    ROLLED_BACK: Undo2,
    CANCELLED: CircleSlash,
    EXPIRED: CircleSlash,
  }[s] ?? (statusMeta(s).group === 'applied' || s === 'RESOLVED' ? CheckCircle2 : ShieldCheck);
  const rejecter = approvals.find((a) => a.decision === 'REJECTED');
  const text = {
    READY: plan.mode === 'GUIDED'
      ? 'Apply the steps below in AWS, then mark the plan as done. Nothing is changed by the console.'
      : 'Ready. Submit it for approval to run it.',
    DRAFT: 'A pre-check blocks this plan - see the pre-checks below. Fix what they name and make a new plan, or do it by hand and mark it done.',
    WAITING_EXTERNAL: `The fix adds an ExternalId to the role's trust policy. The vendor must set the same value first${plan.params.external_id ? ` (${plan.params.external_id})` : ''}; then confirm it here.`,
    PENDING_APPROVAL: blocked
      ? `Waiting for an approver. ${blocked}`
      : 'Waiting for an approver. One approval is enough: it then runs by itself.',
    APPROVED: plan.statusReason
      ? `Approved, but the run could not start: ${plan.statusReason}`
      : plan.byEngine
        ? 'Approved. The rule engine runs it within about 5 minutes.'
        : isStalled(plan, detail.executions)
          ? 'Approved, but the run has not started. Start it below, or cancel the plan.'
          : 'Approved. It starts in a moment.',
    SCHEDULED: 'Scheduled: the change starts in AWS shortly. This page follows it.',
    EXECUTING: 'Changing AWS now. This page follows it.',
    EXECUTED: plan.statusReason || 'Applied. The finding closes at the next scan.',
    VERIFIED: 'Applied and checked in AWS. The finding closes at the next scan.',
    MANUALLY_DONE: 'Marked as done by hand. The next scan confirms it and closes the finding.',
    RESOLVED: 'Fixed: the scan no longer finds the problem.',
    FAILED: plan.statusReason ? `The run failed: ${plan.statusReason}` : 'The run failed. See Runs for the error.',
    REJECTED: `Rejected${rejecter?.approver ? ` by ${rejecter.approver}` : ''}${plan.statusReason ? `: “${plan.statusReason}”` : '.'} Make a new plan to try again.`,
    EXPIRED: 'Nobody approved it within 72 hours. Make a new plan to try again.',
    CANCELLED: plan.statusReason ? `Cancelled: ${plan.statusReason}` : 'Cancelled.',
    SUPERSEDED: 'A newer plan replaced this one.',
    ROLLED_BACK: 'The change was undone. The finding opens again at the next scan.',
  }[s] ?? (plan.statusReason || statusMeta(s).label);
  const spin = s === 'SCHEDULED' || s === 'EXECUTING';
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-control)] border px-3.5 py-3',
        tone === 'critical' ? 'border-critical/30 bg-critical-soft' : tone === 'low' ? 'border-low/30 bg-low-soft' : tone === 'medium' ? 'border-medium/30 bg-medium-soft' : 'border-info/30 bg-info-soft',
      )}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4.5 shrink-0', spin && 'animate-spin', { critical: 'text-critical', low: 'text-low', medium: 'text-medium' }[tone] ?? 'text-info')} />
      <p className="min-w-0 text-[13px] leading-relaxed text-ink">{text}</p>
    </div>
  );
}

function fmtValue(v) {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function Overview({ detail }) {
  const { plan, approvals } = detail;
  const blocking = plan.prechecks.filter((c) => c.result === 'BLOCK');
  return (
    <>
      <StatusBanner detail={detail} />

      <section>
        <SectionLabel>What it changes</SectionLabel>
        <DetailList className="mt-1">
          <DetailRow label="Target">
            <span className="flex min-w-0 flex-col">
              <CopyableValue value={plan.targetArn} className="max-w-full text-[12px]" />
              {plan.targetType && <span className="text-[11.5px] text-ink-3">{plan.targetType.replace(/_/g, ' ')}</span>}
            </span>
          </DetailRow>
          <DetailRow label="AWS account" mono>
            {plan.accountId || '-'}
            {plan.region ? ` · ${plan.region}` : ''}
          </DetailRow>
          <DetailRow label="Findings">
            <span className="flex flex-wrap gap-1">
              {plan.ruleIds.map((rule) => (
                <Tag key={rule} size="sm" tone="neutral">
                  {rule}
                </Tag>
              ))}
              <span className="text-[12px] text-ink-3">
                {plan.findingIds.length} finding{plan.findingIds.length === 1 ? '' : 's'}
              </span>
            </span>
          </DetailRow>
          <DetailRow label="Made">
            {plan.createdBy || 'unknown'} · <span title={formatDateTime(plan.createdAt)}>{formatRelative(plan.createdAt)}</span>
          </DetailRow>
          {plan.validUntil && plan.status === 'PENDING_APPROVAL' && (
            <DetailRow label="Approve by">
              <span title={formatDateTime(plan.validUntil)}>{formatDateTime(plan.validUntil)}</span>
            </DetailRow>
          )}
          {plan.scoreGain !== null && Number(plan.scoreGain) > 0 && (
            <DetailRow label="Posture score">
              {Number(plan.scoreCurrent).toFixed(1)} <ArrowRight aria-hidden="true" className="inline size-3.5 text-ink-3" />{' '}
              <span className="font-semibold text-low">{Number(plan.scoreProjected).toFixed(1)}</span>{' '}
              <span className="text-[12px] text-ink-3">(+{Number(plan.scoreGain).toFixed(1)})</span>
            </DetailRow>
          )}
        </DetailList>
      </section>

      {plan.diff.length > 0 && (
        <section>
          <SectionLabel>Before → after</SectionLabel>
          <div className="mt-2 overflow-x-auto rounded-[var(--radius-control)] border border-line">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-surface-2 text-[11px] tracking-[0.04em] text-ink-3 uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Setting</th>
                  <th className="px-3 py-2 font-semibold">Before</th>
                  <th className="px-3 py-2 font-semibold">After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {plan.diff.map((d, i) => (
                  <tr key={`${d.path}-${i}`}>
                    <td className="px-3 py-2 font-mono text-ink">{d.path}</td>
                    <td className="px-3 py-2 font-mono break-all text-critical/90 line-through decoration-critical/40">{fmtValue(d.before)}</td>
                    <td className="px-3 py-2 font-mono break-all text-low">{d.change === 'removed' ? <span className="text-ink-3 no-underline">removed</span> : fmtValue(d.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {plan.prechecks.length > 0 && (
        <section>
          <SectionLabel>Pre-checks{blocking.length ? ` · ${blocking.length} blocking` : ''}</SectionLabel>
          <ul className="mt-2 flex flex-col gap-1.5">
            {plan.prechecks.map((c, i) => (
              <li key={`${c.name}-${i}`} className="flex items-start gap-2.5 text-[12.5px]">
                <Tag size="sm" tone={PRECHECK_TONE[c.result] ?? 'neutral'}>
                  {c.result === 'BLOCK' ? 'Blocks' : c.result === 'WARN' ? 'Warning' : 'Passed'}
                </Tag>
                <span className="min-w-0">
                  <span className="font-medium text-ink">{c.name}</span>
                  {c.detail && <span className="block text-ink-3">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.steps.length > 0 && (
        <section>
          <SectionLabel>{plan.mode === 'GUIDED' ? 'Steps to apply in AWS' : 'What will be done'}</SectionLabel>
          <Steps steps={plan.steps} />
        </section>
      )}

      {(approvals.length > 0 || plan.status === 'PENDING_APPROVAL') && (
        <section>
          <SectionLabel>Approval</SectionLabel>
          {approvals.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-ink-3">Nobody has decided yet. The approvers were e-mailed.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {approvals.map((a) => (
                <li key={a.approval_id ?? `${a.approver}-${a.decided_at}`} className="flex items-start gap-2.5 text-[12.5px]">
                  {a.decision === 'APPROVED' ? (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" />
                  ) : (
                    <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-critical" />
                  )}
                  <span>
                    <span className="font-medium text-ink">{a.approver}</span> {a.decision === 'APPROVED' ? 'approved' : 'rejected'}{' '}
                    <span className="text-ink-3" title={formatDateTime(a.decided_at)}>
                      {formatRelative(a.decided_at)}
                    </span>
                    {a.comment && <span className="block text-ink-2">“{a.comment}”</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

/** Guided steps: the console path, the CLI and the IaC, each to copy. A <name> was not worked out: fill it in. */
export function Steps({ steps }) {
  return (
    <ol className="mt-2 flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={i} className="rounded-[var(--radius-control)] border border-line bg-surface p-3">
          <p className="flex items-start gap-2 text-[13px] font-medium text-ink">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-info-soft text-[11px] font-semibold text-brand" data-numeric="">
              {i + 1}
            </span>
            <span className="min-w-0">{step.title || `Step ${i + 1}`}</span>
          </p>
          {step.console && (
            <p className="mt-2 text-[12.5px] text-ink-2">
              <span className="font-medium text-ink-3">Console: </span>
              {step.console}
            </p>
          )}
          {['cli', 'iac'].map((k) =>
            step[k] ? (
              <div key={k} className="relative mt-2">
                <pre className="overflow-x-auto rounded-md border border-line bg-inset p-2.5 pr-10 font-mono text-[11.5px] leading-relaxed text-ink-2">{step[k]}</pre>
                <CopyButton value={step[k]} label={k === 'cli' ? 'Copy command' : 'Copy IaC'} size="sm" className="absolute top-1.5 right-1.5" />
              </div>
            ) : null,
          )}
          {/<[a-z_]+>/i.test(`${step.cli ?? ''}${step.console ?? ''}`) && (
            <p className="mt-1.5 text-[11.5px] text-medium">Values in &lt;angle brackets&gt; could not be worked out: fill them in.</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ── Runs and history ──────────────────────────────────────────────────── */

function Runs({ executions }) {
  if (!executions.length) {
    return <EmptyState compact icon={Clock3} title="Not run" description="A One-click plan runs here once it is approved (or straight away when no approval is needed). Guided plans are never run by the console." />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {executions.map((e) => {
        const meta = EXEC_STATUS[e.status] ?? { label: e.status, tone: 'neutral' };
        return (
          <li key={e.id} className="rounded-[var(--radius-control)] border border-line p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{{ EXECUTE: 'Apply', ROLLBACK: 'Roll back', FINALIZE: 'Finalise' }[e.kind] ?? e.kind}</span>
              <Tag tone={meta.tone} size="sm" dot>
                {meta.label}
              </Tag>
            </div>
            <p className="mt-1 text-[12px] text-ink-3">
              {e.triggered_by ? `By ${e.triggered_by} · ` : ''}
              {e.started_at ? `started ${formatRelative(e.started_at)}` : e.scheduled_for ? `scheduled for ${formatDateTime(e.scheduled_for)}` : ''}
              {e.completed_at ? ` · finished ${formatRelative(e.completed_at)}` : ''}
            </p>
            {(e.errorCode || e.errorMessage) && (
              <p className="mt-2 rounded-md bg-critical-soft px-2.5 py-1.5 text-[12px] text-critical">
                {e.errorCode && <span className="font-mono font-semibold">{e.errorCode}</span>} {e.errorMessage}
                {e.errorCode === 'DRIFT_DETECTED' && <span className="block text-ink-2">AWS changed after the plan was made: make a new plan.</span>}
              </p>
            )}
            {e.steps.length > 0 && (
              <ol className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
                {e.steps.map((st, i) => (
                  <li key={i} className="flex items-center gap-2 text-[12px]">
                    <Tag size="sm" tone={st.status === 'OK' ? 'low' : st.status === 'FAILED' ? 'critical' : 'neutral'}>
                      {st.status}
                    </Tag>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{st.step}</span>
                    {st.api && <span className="shrink-0 font-mono text-[11px] text-ink-3">{st.api}</span>}
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function History({ planId, revision }) {
  const query = useQuery((signal) => fetchPlanAudit(planId, signal), [planId, revision]);
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} compact title="The history could not be read" />;
  if (!query.data) return <Skeleton className="h-32 w-full" />;
  if (!query.data.length) return <EmptyState compact icon={Clock3} title="No history yet" description="Every step of the plan is recorded here." />;
  return (
    <ol className="relative flex flex-col gap-3 border-l border-line pl-4">
      {query.data.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden="true" className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-brand" />
          <p className="text-[12.5px] text-ink">
            <span className="font-medium">{AUDIT_EVENT[e.event] ?? e.event}</span>
            {e.actor ? <span className="text-ink-3"> · {e.actor}</span> : null}
          </p>
          <p className="text-[11.5px] text-ink-3" title={formatDateTime(e.at)}>
            {formatRelative(e.at)}
          </p>
          {e.details && Object.keys(e.details).length > 0 && (
            <p className="mt-0.5 font-mono text-[11px] break-all text-ink-3">
              {Object.entries(e.details)
                .filter(([, v]) => v !== '' && v !== null)
                .slice(0, 4)
                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join(' · ')}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ── Actions ───────────────────────────────────────────────────────────── */

const CONFIRM = {
  approve: {
    title: 'Approve this plan',
    tone: 'brand',
    field: 'Comment',
    optional: true,
    go: 'Approve and run',
    warn: (plan) => (plan.byEngine ? 'The rule engine then applies it in AWS.' : 'This will change AWS: it runs straight after your approval.'),
  },
  reject: { title: 'Reject this plan', tone: 'critical', field: 'Reason', optional: false, go: 'Reject plan', warn: () => 'Nothing is changed. The person who made it sees your reason.' },
  cancel: { title: 'Cancel this plan', tone: 'medium', field: 'Reason', optional: true, go: 'Cancel plan', warn: () => 'It will not run. You can make a new plan later.' },
  markDone: {
    title: 'Mark as done',
    tone: 'brand',
    field: 'Note',
    optional: true,
    go: 'Mark as done',
    warn: () => 'Say what you changed. The next scan checks it and closes the finding.',
  },
  rollback: {
    title: 'Roll back this change',
    tone: 'critical',
    go: 'Roll back',
    warn: () => 'This will change AWS again: the setting goes back to what it was before. The finding opens again at the next scan.',
  },
  submit: { title: 'Submit for approval', tone: 'brand', go: 'Submit', warn: () => 'An approver is asked to approve it; it then runs in AWS.' },
  execute: { title: 'Start the run', tone: 'medium', go: 'Start the run', warn: () => 'This will change AWS.' },
  confirmExternal: { title: 'The vendor has set the ExternalId', tone: 'brand', go: 'Confirm', warn: () => 'Only confirm once the vendor uses the new value, or their access stops working.' },
};

function PlanFooter({ detail, onDone, onFollow }) {
  const { user } = useAuth();
  const { can } = useAccess();
  const { notify } = useToast();
  const { plan, executions } = detail;
  const executeRun = useMemo(() => executeRunOf(executions), [executions]);
  const actions = planActions(plan, { can, user, executeRun, stalled: isStalled(plan, executions) });
  const [confirm, setConfirm] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const textRef = useRef(null);

  if (!actions.length) return null;

  const run = async () => {
    const spec = CONFIRM[confirm];
    if (spec.field && !spec.optional && !text.trim()) {
      setError(`Write a ${spec.field.toLowerCase()}.`);
      textRef.current?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const note = text.trim();
      const done = {
        approve: () => approvePlan(plan.id, note),
        reject: () => rejectPlan(plan.id, note),
        cancel: () => cancelPlan(plan.id, note),
        markDone: () => markPlanDone(plan.id, note),
        rollback: () => rollbackExecution(executeRun.id),
        submit: () => submitPlan(plan.id),
        execute: () => executePlan(plan.id),
        confirmExternal: () => confirmExternal(plan.id),
      }[confirm];
      await done();
      notify({
        variant: 'success',
        title: {
          approve: 'Plan approved',
          reject: 'Plan rejected',
          cancel: 'Plan cancelled',
          markDone: 'Marked as done',
          rollback: 'Rollback started',
          submit: 'Submitted for approval',
          execute: 'Run started again',
          confirmExternal: 'ExternalId confirmed',
        }[confirm],
        description: {
          approve: plan.byEngine ? 'The rule engine runs it within about 5 minutes.' : 'It runs now; this panel follows it.',
          markDone: 'The next scan confirms it.',
          rollback: 'This panel follows it.',
        }[confirm],
      });
      if (['approve', 'rollback', 'execute'].includes(confirm)) onFollow();
      setConfirm(null);
      setText('');
      onDone();
    } catch (err) {
      if (err?.status === 409 || err?.status === 403) onDone();
      setError(err?.message || 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const spec = confirm ? CONFIRM[confirm] : null;
  const variant = { primary: 'primary', secondary: 'secondary', danger: 'danger', ghost: 'ghost' };
  return (
    <>
      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        {actions.map((a) => (
          <Button
            key={a.key}
            variant={variant[a.tone] ?? 'secondary'}
            icon={a.key === 'rollback' ? RotateCcw : a.key === 'approve' ? CheckCircle2 : a.key === 'reject' ? XCircle : undefined}
            className={a.tone === 'ghost' ? 'mr-auto' : undefined}
            onClick={() => {
              setConfirm(a.key);
              setText('');
              setError('');
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>
      <Modal
        open={Boolean(spec)}
        onClose={() => !busy && setConfirm(null)}
        icon={confirm === 'rollback' || confirm === 'reject' ? AlertTriangle : ShieldCheck}
        tone={spec?.tone === 'critical' ? 'critical' : spec?.tone === 'medium' ? 'medium' : 'brand'}
        title={spec?.title}
        description={spec?.warn(plan)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
              Keep it
            </Button>
            <Button variant={spec?.tone === 'critical' ? 'danger' : 'primary'} loading={busy} onClick={run}>
              {spec?.go}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-ink-2">
            <span className="font-medium text-ink">{targetLabel(plan.targetArn)}</span> in account <span className="font-mono">{plan.accountId}</span>
          </p>
          {spec?.field && (
            <Field label={spec.field} htmlFor="plan-note" hint={spec.optional ? 'Optional. Kept with the plan.' : 'Required.'} error={error && spec.field ? error : undefined}>
              <Textarea id="plan-note" ref={textRef} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} invalid={Boolean(error)} />
            </Field>
          )}
          {error && !spec?.field && <p className="text-[12.5px] font-medium text-critical">{error}</p>}
        </div>
      </Modal>
    </>
  );
}
