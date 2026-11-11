import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, CircleSlash, Clock3, Minus, Plus, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react';
import { cancelPlan, confirmExternal, fetchFindingFix, fetchPlan, fetchPlanAudit, markPlanDone } from '../../lib/api/remediation';
import { useQuery } from '../../lib/hooks';
import { useAccess } from '../../app/useAccess';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { Textarea } from '../../ui/Field';
import { Meter } from '../../ui/Meter';
import { Modal } from '../../ui/Overlay';
import { Panel, PanelHeader, SectionLabel } from '../../ui/Panel';
import { DetailSkeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { AUDIT_EVENT, fixName, targetLabel } from './meta';
import { CodeBlock, FactRow, PlanStatusTag, RiskTag, StepList } from './parts';

const OPEN = ['DRAFT', 'READY', 'WAITING_EXTERNAL'];

/* Ticks kept in this browser only (guide §4.3 D): they are the person's own checklist. */
function useChecks(planId, count) {
  const key = `dna.plan-steps.${planId}`;
  const [checked, setChecked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  });
  const set = (i, v) =>
    setChecked((cur) => {
      const next = Array.from({ length: count }, (_, j) => (j === i ? v : Boolean(cur[j])));
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage blocked: ticks last for this visit */
      }
      return next;
    });
  return [checked, set];
}

/* The file a step points to (file://trust.json …): the policy inside after_state. */
function fileToPaste(plan) {
  const after = plan.afterState ?? {};
  const cliFile = plan.steps.map((s) => /file:\/\/([\w.-]+)/.exec(s.cli || '')?.[1]).find(Boolean);
  if (plan.actionType === 'rewrite_trust' && after.trust_policy) return { name: cliFile || 'trust.json', content: after.trust_policy };
  const policyKey = Object.keys(after).find((k) => /policy/i.test(k) && after[k] && typeof after[k] === 'object');
  if (policyKey) return { name: cliFile || `${policyKey}.json`, content: after[policyKey] };
  return null;
}

const show = (v) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2));

const DIFF_TONE = {
  critical: { box: 'border-critical/30 bg-critical-soft', text: 'text-critical' },
  low: { box: 'border-low/30 bg-low-soft', text: 'text-low' },
  medium: { box: 'border-medium/30 bg-medium-soft', text: 'text-medium' },
};

function DiffList({ diff }) {
  return (
    <ul className="flex flex-col gap-2">
      {diff.map((d, i) => {
        const tone = d.change === 'removed' ? 'critical' : d.change === 'added' ? 'low' : 'medium';
        const Icon = d.change === 'removed' ? Minus : d.change === 'added' ? Plus : ArrowRight;
        return (
          <li key={i} className={cn('rounded-[var(--radius-control)] border px-3 py-2', DIFF_TONE[tone].box)}>
            <p className={cn('flex items-center gap-1.5 text-[12.5px] font-semibold', DIFF_TONE[tone].text)}>
              <Icon aria-hidden="true" className="size-3.5" />
              {d.change === 'removed' ? 'Removed' : d.change === 'added' ? 'Added' : 'Changed'} <code className="font-mono">{d.path}</code>
            </p>
            {d.change === 'changed' ? (
              <p className="mt-1 font-mono text-[11.5px] break-words text-ink-2">
                {show(d.before)} → {show(d.after)}
              </p>
            ) : (
              <pre className="mt-1 max-h-40 overflow-auto font-mono text-[11.5px] whitespace-pre-wrap text-ink-2">{show(d.change === 'removed' ? d.before : d.after)}</pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ExactChange({ plan }) {
  const [view, setView] = useState('diff');
  const file = fileToPaste(plan);
  return (
    <Panel>
      <PanelHeader title="The exact change" subtitle="What the steps change, worked out from your account when the plan was made." />
      {file && <CodeBlock className="mt-4" code={file.content} filename={file.name} label={`${file.name}: paste this where the steps ask for it`} />}
      <div className="mt-4 flex items-center justify-between gap-3">
        <SectionLabel>What changes</SectionLabel>
        <SegmentedControl
          label="Change view"
          options={[
            { value: 'diff', label: 'Changes' },
            { value: 'both', label: 'Before / After' },
          ]}
          value={view}
          onChange={setView}
        />
      </div>
      <div className="mt-2">
        {view === 'diff' ? (
          <DiffList diff={plan.diff} />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <CodeBlock code={plan.beforeState} label="Before" />
            <CodeBlock code={plan.afterState} label="After" />
          </div>
        )}
      </div>
    </Panel>
  );
}

const CHECK = {
  PASS: { icon: CheckCircle2, cls: 'text-low' },
  WARN: { icon: TriangleAlert, cls: 'text-medium' },
  BLOCK: { icon: XCircle, cls: 'text-critical' },
};

function Checks({ prechecks }) {
  return (
    <Panel>
      <PanelHeader title="Checks" subtitle="Run when the plan was made." />
      <ul className="mt-3 flex flex-col gap-2">
        {prechecks.map((c, i) => {
          const m = CHECK[c.result] ?? CHECK.WARN;
          return (
            <li key={i} className="flex gap-2.5">
              <m.icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', m.cls)} />
              <span className="min-w-0 text-[13px]">
                <span className="font-medium text-ink">{c.name}</span>
                {c.result !== 'PASS' && c.detail && <span className="block text-[12.5px] text-ink-2">{c.detail}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function History({ planId, revision }) {
  const query = useQuery((signal) => fetchPlanAudit(planId, signal).catch(() => []), [planId, revision]);
  const items = query.data ?? [];
  if (!items.length) return null;
  return (
    <Panel>
      <PanelHeader title="History" />
      <ol className="mt-3 flex flex-col gap-2.5">
        {items.map((e, i) => (
          <li key={e.audit_id ?? i} className="flex gap-2.5 text-[12.5px]">
            <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
            <span className="min-w-0">
              <span className="font-medium text-ink">{AUDIT_EVENT[e.event] ?? e.event}</span>
              <span className="text-ink-3">
                {' '}
                · {e.actor || 'system'} · <span title={formatDateTime(e.at || e.created_at)}>{formatRelative(e.at || e.created_at)}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const DONE_TEXT = {
  MANUALLY_DONE: { icon: Clock3, title: 'Done by hand. Waiting for the next scan to confirm the fix.', text: 'Nothing more to do. If the change was not really made, the finding stays open after the scan.' },
  RESOLVED: { icon: ShieldCheck, title: 'Fixed. The scan confirmed the finding is gone.', text: '' },
  CANCELLED: { icon: CircleSlash, title: 'Cancelled.', text: '' },
  SUPERSEDED: { icon: CircleSlash, title: 'Replaced by a newer plan for the same target.', text: '' },
};

export default function PlanPage() {
  const { planId } = useParams();
  const { notify } = useToast();
  const { can } = useAccess();
  const [revision, setRevision] = useState(0);
  const query = useQuery((signal) => fetchPlan(planId, signal), [planId, revision]);
  const plan = query.data?.plan;
  const fixQuery = useQuery(
    (signal) => (plan?.findingIds?.[0] ? fetchFindingFix(plan.findingIds[0], signal).catch(() => null) : Promise.resolve(null)),
    [plan?.findingIds?.[0]],
  );
  const [checked, setCheck] = useChecks(planId, plan?.steps.length ?? 0);
  const [dialog, setDialog] = useState(null); // 'done' | 'cancel'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /* While waiting for the scan, look again every 90 seconds: it changes only after a scan. */
  useEffect(() => {
    if (plan?.status !== 'MANUALLY_DONE') return undefined;
    const id = setInterval(() => document.visibilityState === 'visible' && setRevision((n) => n + 1), 90000);
    return () => clearInterval(id);
  }, [plan?.status]);

  const ticked = useMemo(() => (plan ? plan.steps.filter((_, i) => checked[i]).length : 0), [plan, checked]);

  if (query.isError && !plan) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!plan) {
    return (
      <Panel>
        <DetailSkeleton rows={8} />
      </Panel>
    );
  }

  const finding = fixQuery.data;
  const name = finding?.fix?.title || fixName(plan.actionType);
  const open = OPEN.includes(plan.status);
  const canWrite = can('remediation.plan');
  const lock = canWrite ? undefined : 'Analysts, operators and admins can update a plan. Your role can read only.';
  const allTicked = plan.steps.length > 0 && ticked === plan.steps.length;
  const done = DONE_TEXT[plan.status];

  const run = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      notify({ variant: 'success', ...success });
      setDialog(null);
      setNote('');
      setRevision((n) => n + 1);
    } catch (error) {
      notify({ variant: 'error', title: 'Not changed', description: error?.message });
      if (error?.status === 409) setRevision((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={name}
        lede={
          <span className="flex flex-wrap items-center gap-1.5">
            <PlanStatusTag status={plan.status} />
            <RiskTag risk={plan.riskLevel} />
            {plan.actionType === 'manual_fix' && <span className="text-[12px] text-ink-3">Manual fix</span>}
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

      {done ? (
        <div className={cn('flex gap-3 rounded-[var(--radius-panel)] border px-4 py-3.5', plan.status === 'RESOLVED' ? 'border-low/30 bg-low-soft' : 'border-line bg-surface-2')}>
          <done.icon aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', plan.status === 'RESOLVED' ? 'text-low' : 'text-ink-3')} />
          <div>
            <p className="text-[14px] font-semibold text-ink">{done.title}</p>
            {(done.text || plan.statusReason) && <p className="mt-0.5 text-[12.5px] text-ink-2">{plan.statusReason || done.text}</p>}
          </div>
        </div>
      ) : (
        plan.statusReason && (
          <div className="flex gap-3 rounded-[var(--radius-panel)] border border-medium/30 bg-medium-soft px-4 py-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-medium" />
            <p className="text-[13px] text-ink-2">
              {plan.statusReason}
              {plan.status === 'DRAFT' && plan.findingIds[0] && (
                <>
                  {' '}
                  <Link className="font-medium text-brand hover:underline" to={`/remediation/findings/${encodeURIComponent(plan.findingIds[0])}`}>
                    Change the input and make a new plan
                  </Link>
                </>
              )}
            </p>
          </div>
        )
      )}

      <Panel>
        <FactRow
          items={[
            { label: 'Target', value: targetLabel(plan.targetArn), copy: plan.targetArn },
            plan.accountId && { label: 'AWS account', value: plan.accountId },
            plan.region && { label: 'Region', value: plan.region },
            { label: 'Made by', value: `${plan.createdBy || 'unknown'} · ${formatRelative(plan.createdAt)}` },
            plan.scoreProjected !== null &&
              plan.scoreCurrent !== null && {
                label: 'Posture score',
                value: `${formatNumber(Number(plan.scoreCurrent))} → ${formatNumber(Number(plan.scoreProjected))}${plan.scoreGain ? ` (+${formatNumber(Number(plan.scoreGain))})` : ''}`,
              },
          ]}
        />
      </Panel>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {plan.diff.length > 0 && <ExactChange plan={plan} />}
          <Panel prominence="lead">
            <PanelHeader
              title="Steps"
              subtitle={open ? 'Tick each step as you do it in AWS. The ticks stay in this browser.' : 'The steps of this plan.'}
              actions={
                open && plan.steps.length > 0 ? (
                  <span data-numeric="" className="text-[12.5px] text-ink-3">
                    {ticked} of {plan.steps.length} done
                  </span>
                ) : null
              }
            />
            {open && plan.steps.length > 0 && <Meter className="mt-3" value={(ticked / plan.steps.length) * 100} tone="low" height={5} label="Steps done" />}
            <div className="mt-5">
              <StepList steps={plan.steps} checked={open ? checked : undefined} onCheck={open ? setCheck : undefined} />
            </div>
          </Panel>
          {plan.prechecks.length > 0 && <Checks prechecks={plan.prechecks} />}
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
          {open && (
            <Panel prominence="lead" className={cn(allTicked && 'border-low/50 ring-2 ring-low/20')}>
              <PanelHeader title={allTicked ? 'All steps done' : 'When you have made the change'} subtitle="Mark the plan done. The next scan checks AWS and closes the finding." />
              <div className="mt-4 flex flex-col gap-2">
                {plan.status === 'WAITING_EXTERNAL' && (
                  <div className="mb-1 rounded-[var(--radius-control)] border border-brand/25 bg-info-soft p-3 text-[12.5px] text-ink-2">
                    Give the vendor this ExternalId first:
                    <CodeBlock className="mt-2" code={String(plan.params.external_id ?? '')} label="ExternalId" />
                    <Button className="mt-2 w-full" variant="secondary" loading={busy} locked={lock} onClick={() => run(() => confirmExternal(plan.id), { title: 'Vendor has set it', description: 'The plan is ready.' })}>
                      Vendor has set it
                    </Button>
                  </div>
                )}
                <Button variant="primary" size="lg" icon={CheckCircle2} locked={lock} onClick={() => setDialog('done')}>
                  Mark as done
                </Button>
                <Button variant="ghost" locked={lock} onClick={() => setDialog('cancel')}>
                  Cancel the plan
                </Button>
              </div>
            </Panel>
          )}
          <History planId={plan.id} revision={revision} />
        </aside>
      </div>

      <Modal
        open={dialog === 'done'}
        onClose={() => !busy && setDialog(null)}
        title="Did you make the change in AWS?"
        description="The plan is marked done by you. The next scan checks AWS: the finding closes only if the change is really there."
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Not yet</Button>
            <Button variant="primary" loading={busy} onClick={() => run(() => markPlanDone(plan.id, note.trim()), { title: 'Marked as done', description: 'Waiting for the next scan to confirm the fix.' })}>
              Yes, mark as done
            </Button>
          </>
        }
      >
        <label className="text-[12.5px] text-ink-3" htmlFor="done-note">
          Note (optional)
        </label>
        <Textarea id="done-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: changed in the AWS console, ticket SEC-142" />
      </Modal>
      <Modal
        open={dialog === 'cancel'}
        onClose={() => !busy && setDialog(null)}
        title="Cancel this plan?"
        description="The finding stays open. You can start a new plan for it later."
        tone="critical"
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Keep the plan</Button>
            <Button variant="danger" loading={busy} onClick={() => run(() => cancelPlan(plan.id, note.trim()), { title: 'Plan cancelled' })}>
              Cancel the plan
            </Button>
          </>
        }
      >
        <label className="text-[12.5px] text-ink-3" htmlFor="cancel-note">
          Reason (optional)
        </label>
        <Textarea id="cancel-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: not needed, the role is being deleted" />
      </Modal>
    </div>
  );
}
