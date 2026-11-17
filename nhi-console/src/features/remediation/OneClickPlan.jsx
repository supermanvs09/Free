import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileClock,
  Hourglass,
  Loader2,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import { useAccess } from '../../app/useAccess';
import { approvePlan, cancelPlan, confirmExternal, fetchExecution, fetchPlanAudit, rejectPlan, rollbackPlan, submitPlan } from '../../lib/api/remediation';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatDateTime, formatRelative } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { CopyableValue } from '../../ui/Copyable';
import { Textarea } from '../../ui/Field';
import { Modal } from '../../ui/Overlay';
import { Panel, PanelHeader } from '../../ui/Panel';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { AUDIT_EVENT, approvalBlockedReason, executeRunOf, planActions, targetLabel } from './meta';
import { PlanStatusTag, RiskTag } from './parts';

/*
 * A One-click or auto-remediation plan: what will change in AWS, who has to
 * approve it, the run the platform makes through NHIPlatformRemediator (each
 * AWS call with its request id), and the way back.
 */

const STAGES = [
  { key: 'created', label: 'Planned', icon: FileClock },
  { key: 'approval', label: 'Approval', icon: UserCheck },
  { key: 'run', label: 'Applied in AWS', icon: Zap },
  { key: 'verified', label: 'Verified', icon: ShieldCheck },
];
function stageOf(status) {
  if (['DRAFT', 'READY', 'WAITING_EXTERNAL'].includes(status)) return 0;
  if (status === 'PENDING_APPROVAL') return 1;
  if (['APPROVED', 'SCHEDULED', 'EXECUTING'].includes(status)) return 2;
  if (['EXECUTED', 'VERIFIED', 'RESOLVED'].includes(status)) return 4;
  return -1;
}

const OUTCOME = {
  VERIFIED: { tone: 'low', icon: CheckCircle2, title: 'Applied and verified in AWS', text: 'Read back through the role: the change is in place. The next scan closes the finding.' },
  EXECUTED: { tone: 'low', icon: CheckCircle2, title: 'Applied in AWS', text: 'Waiting for verification and the next scan.' },
  RESOLVED: { tone: 'low', icon: CheckCircle2, title: 'Fixed', text: 'The scan confirmed the finding is closed.' },
  ROLLED_BACK: { tone: 'medium', icon: RotateCcw, title: 'Rolled back', text: 'The platform put back exactly what was there before. The finding opens again at the next scan.' },
  REJECTED: { tone: 'critical', icon: XCircle, title: 'Rejected', text: '' },
  CANCELLED: { tone: 'neutral', icon: XCircle, title: 'Cancelled', text: '' },
  DRY_RUN: { tone: 'neutral', icon: Bot, title: 'Dry run: nothing was changed', text: '' },
  SKIPPED: { tone: 'medium', icon: TriangleAlert, title: 'Skipped by auto-remediation', text: '' },
  EXPIRED: { tone: 'neutral', icon: Hourglass, title: 'Approval window passed', text: 'Create a new plan to fix it.' },
};
const TONE_BOX = { low: 'border-low/35 bg-low-soft/50', medium: 'border-medium/35 bg-medium-soft/60', critical: 'border-critical/30 bg-critical-soft/50', neutral: 'border-line bg-surface-2' };
const TONE_TEXT = { low: 'text-low', medium: 'text-medium', critical: 'text-critical', neutral: 'text-ink-3' };

function Stepper({ plan, counted }) {
  const at = stageOf(plan.status);
  const rolled = plan.status === 'ROLLED_BACK';
  const stopped = at === -1 && !rolled;
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STAGES.map((s, k) => {
        const done = rolled ? k < 4 : k < at;
        const now = k === at;
        const Icon = s.icon;
        return (
          <li key={s.key} className={cn('flex items-center gap-2.5 rounded-[12px] border px-3 py-2.5', done ? 'border-low/35 bg-low-soft/40' : now ? 'border-brand/50 bg-info-soft/50' : 'border-line')}>
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-full', done ? 'bg-low text-white' : now ? 'bg-brand text-white' : 'bg-surface-2 text-ink-3')}>
              {done ? <Check aria-hidden="true" className="size-4" /> : now && plan.status === 'EXECUTING' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Icon aria-hidden="true" className="size-3.5" />}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-[12.5px] font-semibold', done || now ? 'text-ink' : 'text-ink-3')}>{s.label}</span>
              <span className="block truncate text-[11px] text-ink-3">
                {s.key === 'approval'
                  ? plan.requiredApprovals
                    ? `${Math.min(counted, plan.requiredApprovals)} of ${plan.requiredApprovals}`
                    : 'Not needed (safe fix)'
                  : s.key === 'verified' && rolled
                    ? 'then rolled back'
                    : stopped && k >= Math.max(0, at)
                      ? '-'
                      : done
                        ? 'Done'
                        : now
                          ? 'Now'
                          : 'Next'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Diff({ diff }) {
  return (
    <ul className="flex flex-col gap-2">
      {diff.map((d) => (
        <li key={d.path} className="rounded-[10px] border border-line p-3">
          <p className="text-[12px] font-semibold text-ink-3">{d.path}</p>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
            <span className="rounded-[8px] bg-critical-soft/60 px-2.5 py-1.5 font-mono text-[12px] text-ink line-through decoration-critical/50">{String(d.before ?? 'none')}</span>
            <ArrowRight aria-hidden="true" className="hidden size-4 text-ink-3 sm:block" />
            <span className="rounded-[8px] bg-low-soft/70 px-2.5 py-1.5 font-mono text-[12px] text-ink">{String(d.after ?? 'none')}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

const STEP_ICON = { OK: CheckCircle2, UNDONE: RotateCcw, FAILED: XCircle, RUNNING: Loader2, PENDING: CircleDashed, SKIPPED: CircleDashed };
const STEP_TONE = { OK: 'text-low', UNDONE: 'text-medium', FAILED: 'text-critical', RUNNING: 'text-brand', PENDING: 'text-ink-3', SKIPPED: 'text-ink-3' };

/* One run, read live while it moves. */
function Run({ run, onFinished, of }) {
  const [live, setLive] = useState(run);
  useEffect(() => {
    if (live.status !== 'RUNNING' && live.status !== 'QUEUED') return undefined;
    const t = setInterval(async () => {
      const next = await fetchExecution(live.id).catch(() => null);
      if (!next) return;
      setLive(next);
      if (next.status !== 'RUNNING' && next.status !== 'QUEUED') onFinished?.();
    }, 1500);
    return () => clearInterval(t);
  }, [live.id, live.status, onFinished]);
  const rollback = live.kind === 'ROLLBACK';
  return (
    <div data-scene={rollback ? 'run-rollback' : 'run-execute'} className={cn('rounded-[12px] border p-3.5', rollback ? 'border-medium/40' : 'border-line')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          {rollback ? <RotateCcw aria-hidden="true" className="size-4 text-medium" /> : <Zap aria-hidden="true" className="size-4 text-brand" />}
          {rollback ? 'Rollback' : 'Run'}
          {rollback && of && <span className="text-[11.5px] font-normal text-ink-3">undoes the run of {formatRelative(of.started_at)}</span>}
        </p>
        <Tag tone={live.status === 'SUCCEEDED' ? 'low' : live.status === 'FAILED' ? 'critical' : 'brand'} size="sm" dot>
          {live.status === 'RUNNING' ? 'Running' : live.status === 'SUCCEEDED' ? 'Succeeded' : live.status.toLowerCase()}
        </Tag>
      </div>
      <p className="mt-1 text-[11.5px] text-ink-3">
        As <span className="font-mono">{String(live.assumed_role_arn ?? '').split('/').pop()}</span> · CloudTrail session <span className="font-mono">{live.session_name}</span> · started{' '}
        {formatRelative(live.started_at)}
      </p>
      <ol className="mt-2.5 flex flex-col gap-1.5">
        {live.steps.map((s) => {
          const Icon = STEP_ICON[s.status] ?? CircleDashed;
          return (
            <li key={s.index} className="flex items-start gap-2.5 rounded-[8px] bg-surface-2/60 px-2.5 py-2">
              <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', STEP_TONE[s.status], s.status === 'RUNNING' && 'animate-spin')} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-ink">{s.step ?? s.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
                  <span className="font-mono">{s.api}</span>
                  {['OK', 'UNDONE'].includes(s.status) && (
                    <span className="inline-flex items-center gap-1">
                      request <CopyableValue value={s.request_id} />
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {live.verify_result && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-low">
          <ShieldCheck aria-hidden="true" className="size-3.5" /> {live.verify_result.detail ?? 'Verified'}
        </p>
      )}
      {live.errorMessage && <p className="mt-2 text-[12px] text-critical">{live.errorCode}: {live.errorMessage}</p>}
    </div>
  );
}

export function OneClickPlan({ data, finding, onChanged }) {
  const { plan, approvals, executions, approvalsCounted } = data;
  const { user } = useAuth();
  const { can } = useAccess();
  const { notify } = useToast();
  const [dialog, setDialog] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useQuery((signal) => fetchPlanAudit(plan.id, signal), [plan.id, plan.status, executions.length]);
  const executeRun = executeRunOf(executions);
  const actions = planActions(plan, { can, user, executeRun });
  const blocked = approvalBlockedReason(plan, { can, user });
  const outcome = OUTCOME[plan.status];
  const policy = plan.byEngine ? String(plan.createdBy).replace(/^auto:/, '') : null;
  const runs = useMemo(() => [...executions].reverse(), [executions]);

  const act = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      notify({ variant: 'success', ...success });
      setDialog(null);
      setNote('');
      onChanged();
    } catch (error) {
      notify({ variant: 'error', title: 'Not changed', description: error?.message });
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const handle = (key) => {
    if (key === 'submit') return act(() => submitPlan(plan.id), { title: plan.approval_required ? 'Sent for approval' : 'Approved and started', description: plan.approval_required ? 'An approver has been asked.' : 'A safe fix below Critical: no approval needed.' });
    if (key === 'confirmExternal') return act(() => confirmExternal(plan.id), { title: 'Vendor confirmed', description: 'The plan is ready to send for approval.' });
    return setDialog(key);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={plan.title || finding?.fix?.title || 'One-click fix'}
        lede={
          <span className="flex flex-wrap items-center gap-1.5">
            <Tag tone="brand" size="sm" icon={Zap}>
              One-click
            </Tag>
            {policy && (
              <Tag tone="low" size="sm" icon={Bot}>
                Auto · {policy}
              </Tag>
            )}
            <PlanStatusTag status={plan.status} />
            <RiskTag risk={plan.riskLevel} />
            <Tag tone={plan.reversible ? 'low' : 'medium'} size="sm">
              {plan.reversible ? 'Can be rolled back' : 'Cannot be undone'}
            </Tag>
            {plan.jira && (
              <a href={plan.jira.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2 hover:text-brand">
                {plan.jira.key} · {plan.jira.assignee} <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            )}
          </span>
        }
        actions={
          <>
            {plan.findingIds[0] && (
              <Button variant="ghost" as={Link} to={`/remediation/findings/${encodeURIComponent(plan.findingIds[0])}`}>
                The finding
              </Button>
            )}
            <Button variant="secondary" as={Link} to="/remediation?tab=plans" icon={ArrowLeft}>
              Plans
            </Button>
          </>
        }
      />

      <Panel>
        <Stepper plan={plan} counted={approvalsCounted} />
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-[11px] text-ink-3">Target</dt>
            <dd className="font-mono text-ink">{plan.target_name ?? targetLabel(plan.targetArn)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-3">Account</dt>
            <dd className="font-mono text-ink">{plan.accountId}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-3">Created by</dt>
            <dd className="text-ink">
              {plan.created_by_name ?? plan.createdBy} <span className="text-ink-3">· {formatRelative(plan.createdAt)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-3">Posture score</dt>
            <dd className="text-ink" data-numeric="">
              {plan.scoreCurrent} → <b className="text-low">{plan.scoreProjected}</b> <span className="text-ink-3">(+{plan.scoreGain})</span>
            </dd>
          </div>
        </dl>
      </Panel>

      {outcome && (
        <div data-scene="plan-outcome" className={cn('flex gap-3 rounded-[var(--radius-panel)] border px-4 py-3.5', TONE_BOX[outcome.tone])}>
          <outcome.icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', TONE_TEXT[outcome.tone])} />
          <div>
            <p className="text-[14px] font-semibold text-ink">{outcome.title}</p>
            {(plan.statusReason || outcome.text) && <p className="mt-0.5 text-[12.5px] text-ink-2">{plan.statusReason || outcome.text}</p>}
          </div>
        </div>
      )}

      {plan.status === 'WAITING_EXTERNAL' && (
        <section className="rounded-[var(--radius-panel)] border border-brand/30 bg-info-soft/50 p-4">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Hourglass aria-hidden="true" className="size-4 text-brand" /> Waiting for the vendor
          </p>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">
            This fix adds an External ID to the trust of <span className="font-mono">{plan.target_name}</span>. Give this ID to the vendor first; when they have configured it,
            confirm below. Then the plan goes for approval.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
            <span className="text-[12px] text-ink-3">External ID</span>
            <CopyableValue value={String(plan.params.external_id ?? '')} />
            <span className="text-[12px] text-ink-3">Vendor account</span>
            <span className="font-mono text-[12.5px] text-ink">{plan.params.vendor_account}</span>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3" title="A vendor uses one AWS account for all its customers. The External ID proves the vendor is acting for you, not for another customer who knows your role ARN.">
            Why? A vendor uses one AWS account for all its customers; the External ID proves it is acting for you.
          </p>
        </section>
      )}

      {/* Decision bar */}
      {(actions.length > 0 || blocked) && (
        <div data-scene="plan-actions" className="flex flex-wrap items-center gap-2 rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3 shadow-[var(--t-shadow-sm)]">
          <p className="mr-auto text-[12.5px] text-ink-2">
            {plan.status === 'PENDING_APPROVAL'
              ? `Waiting for approval: ${approvalsCounted} of ${plan.requiredApprovals}. Approving starts the run in AWS.`
              : plan.status === 'READY'
                ? plan.approval_required
                  ? 'Ready. Send it for approval; the run starts when it is approved.'
                  : 'A safe fix below Critical: submitting approves it and starts the run.'
                : ['EXECUTED', 'VERIFIED', 'RESOLVED'].includes(plan.status)
                  ? 'Applied. Roll back to restore exactly what was there before.'
                  : ''}
            {blocked && <span className="ml-1 text-ink-3">{blocked}</span>}
          </p>
          {actions.map((a) => (
            <Button key={a.key} data-scene={`plan-${a.key}`} variant={a.tone === 'danger' ? 'danger' : a.tone === 'primary' ? 'primary' : a.tone === 'ghost' ? 'ghost' : 'secondary'} loading={busy && dialog === a.key} onClick={() => handle(a.key)}>
              {a.label}
            </Button>
          ))}
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHeader title="What will change in AWS" subtitle={plan.usage_basis ? `Based on: ${plan.usage_basis}` : 'Read from the live state just before the plan was made.'} />
            <div className="mt-3">
              <Diff diff={plan.diff} />
            </div>
          </Panel>

          {runs.length > 0 && (
            <Panel>
              <PanelHeader title="Runs" subtitle="Each AWS call the remediation role made, with its CloudTrail request id." />
              <div className="mt-3 flex flex-col gap-3">
                {runs.map((r) => (
                  <Run key={`${r.id}-${r.status}`} run={r} of={executions.find((e) => e.id === r.rollback_of)} onFinished={onChanged} />
                ))}
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHeader title="What the platform does" subtitle={`As NHIPlatformRemediator in ${plan.accountId}, in this order.`} />
            <ol className="mt-3 flex flex-col gap-1.5">
              {plan.steps.map((s, k) => (
                <li key={`${s.api}-${k}`} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink-2">{k + 1}</span>
                  <span className="text-ink">{s.title}</span>
                  <span className="font-mono text-[11.5px] text-ink-3">{s.api}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <aside className="flex flex-col gap-4">
          <Panel>
            <PanelHeader title="Pre-checks" />
            <ul className="mt-3 flex flex-col gap-2">
              {plan.prechecks.map((c) => (
                <li key={c.name ?? c.label} className="flex items-start gap-2">
                  {c.result === 'PASS' || c.status === 'PASS' ? (
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" />
                  ) : c.result === 'BLOCK' ? (
                    <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-critical" />
                  ) : (
                    <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-medium" />
                  )}
                  <span>
                    <span className="block text-[12.5px] font-medium text-ink">{c.name ?? c.label}</span>
                    <span className="block text-[11.5px] text-ink-3">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader title="Approvals" subtitle={plan.requiredApprovals ? `${approvalsCounted} of ${plan.requiredApprovals} needed` : 'Not needed: a safe fix below Critical'} />
            {approvals.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {approvals.map((a) => (
                  <li key={`${a.actor}-${a.at}`} className="text-[12.5px]">
                    <span className="flex items-center gap-1.5 font-medium text-ink">
                      {a.decision === 'APPROVE' ? <CheckCircle2 aria-hidden="true" className="size-3.5 text-low" /> : <XCircle aria-hidden="true" className="size-3.5 text-critical" />}
                      {a.actor}
                    </span>
                    <span className="block text-[11.5px] text-ink-3">
                      {a.decision === 'APPROVE' ? 'Approved' : 'Rejected'} {formatRelative(a.at)}
                      {a.comment ? ` · “${a.comment}”` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-ink-3">{plan.status === 'PENDING_APPROVAL' ? 'No decision yet.' : 'None.'}</p>
            )}
            {plan.validUntil && plan.status === 'PENDING_APPROVAL' && (
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-ink-3">
                <Clock3 aria-hidden="true" className="size-3.5" /> Approval window ends {formatDateTime(plan.validUntil)}
              </p>
            )}
          </Panel>
          <Panel>
            <PanelHeader title="History" />
            <ol className="mt-3 flex flex-col gap-2">
              {(history.data ?? []).map((h) => (
                <li key={h.audit_id} className="text-[12px]">
                  <span className="block font-medium text-ink">{AUDIT_EVENT[h.event] ?? h.event.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="block text-[11.5px] text-ink-3">
                    {h.actor} · {formatRelative(h.at)}
                    {h.detail ? ` · ${h.detail}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>
      </div>

      <Modal
        open={dialog === 'approve' || dialog === 'reject'}
        onClose={() => !busy && setDialog(null)}
        title={dialog === 'approve' ? 'Approve this change?' : 'Reject this plan?'}
        description={
          dialog === 'approve'
            ? `Approving starts the run: the platform assumes NHIPlatformRemediator in ${plan.accountId} and makes the change shown. ${plan.reversible ? 'It can be rolled back.' : 'It cannot be undone.'}`
            : 'The plan stops here. Say why, so the person who made it knows.'
        }
        tone={dialog === 'reject' ? 'critical' : undefined}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Back</Button>
            {dialog === 'approve' ? (
              <Button data-scene="plan-approve-confirm" variant="primary" loading={busy} onClick={() => act(() => approvePlan(plan.id, note.trim()), { title: 'Approved', description: 'The run has started.' })}>
                Approve and run
              </Button>
            ) : (
              <Button variant="danger" loading={busy} disabled={!note.trim()} onClick={() => act(() => rejectPlan(plan.id, note.trim()), { title: 'Rejected' })}>
                Reject
              </Button>
            )}
          </>
        }
      >
        <label className="text-[12.5px] text-ink-3" htmlFor="decision-note">
          {dialog === 'reject' ? 'Reason' : 'Comment (optional)'}
        </label>
        <Textarea id="decision-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
      <Modal
        open={dialog === 'rollback'}
        onClose={() => !busy && setDialog(null)}
        title="Undo this change in AWS?"
        description="The platform puts back exactly what was there before (the snapshot taken before the change). The finding will open again at the next scan."
        tone="critical"
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button data-scene="plan-rollback-confirm" variant="danger" loading={busy} onClick={() => act(() => rollbackPlan(plan.id), { title: 'Rolling back', description: 'Follow the run below.' })}>
              Roll back
            </Button>
          </>
        }
      />
      <Modal
        open={dialog === 'cancel'}
        onClose={() => !busy && setDialog(null)}
        title="Cancel this plan?"
        description="Nothing is changed in AWS. The finding stays open."
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Keep it</Button>
            <Button variant="danger" loading={busy} onClick={() => act(() => cancelPlan(plan.id, note.trim()), { title: 'Plan cancelled' })}>
              Cancel the plan
            </Button>
          </>
        }
      />
    </div>
  );
}

export default OneClickPlan;
