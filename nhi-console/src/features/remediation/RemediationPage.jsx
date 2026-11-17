import { ProviderIcon } from '../../ui/ProviderIcon';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Bot, CheckCircle2, CircleDot, Clock3, Hand, ListTodo, Loader2, RotateCcw, SearchX, ShieldCheck, XCircle, Zap } from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import { fetchActions, fetchFindingsToFix, fetchPlanAudit, fetchPlans } from '../../lib/api/remediation';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { formatNumber, formatRelative } from '../../lib/format';
import { severityMeta } from '../../lib/domain';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { DataGrid } from '../../ui/DataGrid';
import { SearchInput, Select } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
import { Panel } from '../../ui/Panel';
import { StatStripSkeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl, Tabs } from '../../ui/Tabs';
import { RefreshButton, TableToolbar } from '../../ui/TableTools';
import { RecordBar, ResultCount } from '../../ui/WorkArea';
import { TONE_BG, cn } from '../../ui/cn';
import { Tag } from '../../ui/Tag';
import { AUDIT_EVENT, fixName, targetLabel } from './meta';
import { PlanStatusTag, RiskTag, SeverityTag } from './parts';

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

/* Where a finding is in the guided journey. */
const STAGES = [
  { key: 'todo', label: 'To fix', icon: ListTodo, hint: 'Open findings with no plan yet' },
  { key: 'in_progress', label: 'In progress', icon: Hand, hint: 'A plan is open: steps to apply, approval or a run' },
  { key: 'waiting_scan', label: 'Waiting for the scan', icon: Clock3, hint: 'Marked done; the next scan confirms it' },
  { key: 'fixed', label: 'Fixed · 30 days', icon: ShieldCheck, hint: 'Confirmed fixed by a scan' },
];

function stageOf(finding) {
  if (finding.status === 'RESOLVED') return 'fixed';
  if (finding.stage === 'todo' || !finding.plan) return 'todo';
  return ['MANUALLY_DONE', 'EXECUTED'].includes(finding.plan.status) ? 'waiting_scan' : 'in_progress';
}

/**
 * The guided journey as the page's cards: to fix → in progress → waiting for
 * the scan → fixed. Each stage is a count of findings (not plans), and opens
 * the list on that stage.
 */
function Journey({ summary, active, onPick }) {
  if (!summary) return <StatStripSkeleton count={4} />;
  const value = { todo: summary.to_do, in_progress: summary.in_progress, waiting_scan: summary.waiting_scan, fixed: summary.fixed_30d };
  const sev = summary.by_severity ?? {};
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((stage) => {
        const on = active === stage.key;
        return (
          <button
            key={stage.key}
            type="button"
            onClick={() => onPick(on ? '' : stage.key)}
            aria-pressed={on}
            className={cn(
              'group relative flex flex-col rounded-[var(--radius-panel)] border bg-surface p-4 text-left transition-[border-color,box-shadow] sm:p-5',
              on ? 'border-brand bg-info-soft/50' : 'border-line hover:border-line-strong',
            )}
          >
            <span className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-ink-2">
              {stage.label}
              <span className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-line bg-surface">
                <stage.icon aria-hidden="true" className={cn('size-3.5', stage.key === 'fixed' ? 'text-low' : stage.key === 'todo' ? 'text-high' : 'text-brand')} />
              </span>
            </span>
            <span data-numeric="" className="mt-3 font-display text-[28px] leading-none font-semibold tracking-[-0.025em] text-ink">
              {formatNumber(value[stage.key] ?? 0)}
            </span>
            <span className="mt-2 text-[12px] text-ink-3">{stage.hint}</span>
            {stage.key === 'todo' && summary.open > 0 && (
              <span className="mt-3 flex flex-col gap-1.5">
                <span className="flex h-1.5 overflow-hidden rounded-full bg-track">
                  {SEVERITIES.map((s) =>
                    sev[s] ? <span key={s} className={TONE_BG[severityMeta(s).tone]} style={{ width: `${(sev[s] / summary.open) * 100}%` }} /> : null,
                  )}
                </span>
                <span className="text-[11.5px] text-ink-3">
                  {SEVERITIES.filter((s) => sev[s]).map((s, j) => (
                    <span key={s}>
                      {j > 0 && ' · '}
                      <b className="font-semibold text-ink-2">{sev[s]}</b> {s.toLowerCase()}
                    </span>
                  ))}{' '}
                  open in all
                </span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FindingsTab({ params, set, summaryQuery }) {
  const navigate = useNavigate();
  const stage = params.get('stage') || '';
  const severity = params.get('severity') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = 25;
  const [draft, setDraft] = useState(params.get('q') || '');
  const q = useDebouncedValue(draft.trim(), 250);
  useEffect(() => {
    if ((params.get('q') || '') !== q) set({ q, page: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useQuery(
    (signal) =>
      fetchFindingsToFix(
        { status: stage === 'fixed' ? 'RESOLVED' : 'OPEN', stage: stage === 'fixed' ? '' : stage, severity, q },
        { page, pageSize },
        signal,
      ),
    [stage, severity, q, page],
  );
  useEffect(() => {
    if (query.data?.summary) summaryQuery.set(query.data.summary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const open = (f) => {
    const s = stageOf(f);
    navigate(s === 'in_progress' || s === 'waiting_scan' ? `/remediation/plans/${encodeURIComponent(f.plan.plan_id)}` : `/remediation/findings/${encodeURIComponent(f.finding_id)}`);
  };

  const columns = [
    {
      key: 'finding',
      header: 'Finding',
      primary: true,
      width: '46%',
      cell: (f) => (
        <span className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className={cn('mt-1 h-9 w-1 shrink-0 rounded-full', TONE_BG[severityMeta(f.severity).tone])} />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-ink" title={f.title}>
              {f.title || f.rule_name}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
              <ProviderIcon row={f} size={13} decorative />
              <span className="min-w-0 truncate">
                {f.identity_name} · {f.rule_id} {f.rule_name ? `· ${f.rule_name}` : ''}
              </span>
            </span>
          </span>
        </span>
      ),
    },
    { key: 'severity', header: 'Severity', width: '12%', cell: (f) => <SeverityTag severity={f.severity} /> },
    {
      key: 'stage',
      header: 'Where it is',
      width: '22%',
      cell: (f) => {
        const s = stageOf(f);
        const jira = f.jira?.key ? <span className="block font-mono text-[11px] text-ink-3">{f.jira.key} · {f.jira.assignee}</span> : null;
        if (s === 'fixed')
          return (
            <span className="block">
              <span className="flex items-center gap-1 text-[12.5px] text-low">
                <CheckCircle2 aria-hidden="true" className="size-3.5" /> Fixed {formatRelative(f.resolved_at)}
              </span>
              {jira}
            </span>
          );
        if (s === 'todo' && !f.plan)
          return (
            <span className="block">
              <span className="text-[12.5px] text-ink-3">No plan yet</span>
              {jira}
            </span>
          );
        return (
          <span className="flex flex-col items-start gap-1">
            <span className="flex flex-wrap items-center gap-1">
              <PlanStatusTag status={f.plan.status} />
              {f.plan.mode === 'ONE_CLICK' && <Tag tone="brand" size="sm" icon={Zap}>One-click</Tag>}
              {f.plan.by_engine && <Tag tone="low" size="sm" icon={Bot}>Auto</Tag>}
            </span>
            {jira}
          </span>
        );
      },
    },
    {
      key: 'action',
      header: '',
      width: '20%',
      cell: (f) => {
        const s = stageOf(f);
        return (
          <span className="flex justify-end">
            <Button size="sm" variant={s === 'todo' ? 'primary' : 'secondary'} iconRight={ArrowRight} onClick={(e) => (e.stopPropagation(), open(f))}>
              {s === 'todo' ? 'Fix' : s === 'in_progress' ? (f.plan?.status === 'PENDING_APPROVAL' ? 'Review' : 'Continue') : s === 'waiting_scan' ? 'View plan' : 'View'}
            </Button>
          </span>
        );
      },
    },
  ];

  const filtered = Boolean(stage || severity || q);
  return (
    <Panel flush className="overflow-hidden">
      <RecordBar
        trailing={
          <TableToolbar>
            <RefreshButton onRefresh={query.refetch} refreshing={query.isRefreshing} label="Refresh findings" />
          </TableToolbar>
        }
      >
        <SearchInput size="sm" value={draft} onChange={setDraft} placeholder="Search identity, rule or title…" className="w-full min-w-0 sm:w-72" aria-label="Search findings" />
        <Select
          size="sm"
          aria-label="Severity"
          className="w-40"
          value={severity}
          onChange={(e) => set({ severity: e.target.value, page: '' })}
          placeholder="Any severity"
          options={SEVERITIES.map((s) => ({ value: s, label: s }))}
        />
        <ResultCount shown={formatNumber(query.data?.findings.length ?? 0)} total={formatNumber(query.data?.total ?? 0)} unit="findings" filtered={filtered} loading={query.isLoading && !query.data} />
      </RecordBar>
      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <DataGrid
          caption="Findings to fix"
          columns={columns}
          rows={query.data?.findings ?? []}
          rowKey={(f) => f.finding_id}
          loading={query.isLoading && !query.data}
          refreshing={query.isRefreshing}
          onRowClick={open}
          emptyState={
            filtered ? (
              <EmptyState
                icon={SearchX}
                title="No finding matches"
                action={
                  <Button size="sm" variant="secondary" onClick={() => (setDraft(''), set({ stage: '', severity: '', q: '', page: '' }))}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={ShieldCheck} tone="positive" title="Nothing to fix" description="No open finding right now. New ones appear after each posture scan." />
            )
          }
        />
      )}
      {(query.data?.total ?? 0) > pageSize && (
        <Pagination page={page} pageSize={pageSize} total={query.data.total} unit="findings" pageSizes={[25]} onPageChange={(p) => set({ page: p === 1 ? '' : String(p) })} />
      )}
    </Panel>
  );
}

const PLAN_TABS = [
  { value: 'READY,DRAFT,WAITING_EXTERNAL', label: 'To do' },
  { value: 'PENDING_APPROVAL', label: 'Waiting for approval' },
  { value: 'APPROVED,SCHEDULED,EXECUTING', label: 'Running' },
  { value: 'MANUALLY_DONE,EXECUTED,VERIFIED', label: 'Applied' },
  { value: 'RESOLVED', label: 'Fixed' },
  { value: '', label: 'All' },
];
const SOURCES = [
  { value: '', label: 'Any source' },
  { value: 'manual', label: 'Made by people' },
  { value: 'auto', label: 'Auto-remediation' },
];

/* One-click / Guided, Auto and the Jira ticket: the badges a plan carries everywhere. */
export function PlanBadges({ plan }) {
  const policy = plan.policy_id || (String(plan.created_by ?? plan.createdBy ?? '').startsWith('auto:') ? String(plan.created_by ?? plan.createdBy).slice(5) : '');
  return (
    <span className="flex flex-wrap items-center gap-1">
      {plan.mode === 'ONE_CLICK' ? (
        <Tag tone="brand" size="sm" icon={Zap}>
          One-click
        </Tag>
      ) : (
        <Tag tone="neutral" size="sm" icon={Hand}>
          Guided
        </Tag>
      )}
      {policy && (
        <Tag tone="low" size="sm" icon={Bot}>
          Auto
        </Tag>
      )}
      {plan.jira?.key && <span className="font-mono text-[11px] text-ink-3">{plan.jira.key}</span>}
    </span>
  );
}

const planName = (p, catalog) => p.title || (p.actionType === 'manual_fix' ? 'Manual fix' : fixName(p.actionType, catalog));

function PlansTab({ params, set }) {
  const navigate = useNavigate();
  const status = params.has('status') ? params.get('status') : PLAN_TABS[0].value;
  const source = params.get('source') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = 20;
  const catalog = useQuery(() => fetchActions().catch(() => []), []);
  const query = useQuery((signal) => fetchPlans({ status, source }, { page, pageSize }, signal), [status, source, page]);
  const columns = [
    { key: 'status', header: 'Status', width: '18%', cell: (p) => <PlanStatusTag status={p.status} /> },
    {
      key: 'fix',
      header: 'Fix',
      primary: true,
      width: '34%',
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{planName(p, catalog.data)}</span>
          <span className="mt-0.5 block">
            <PlanBadges plan={p} />
          </span>
        </span>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      width: '22%',
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[12px] text-ink-2" title={p.targetArn}>{p.target_name ?? targetLabel(p.targetArn)}</span>
          <span className="block text-[11.5px] text-ink-3">{p.accountId}</span>
        </span>
      ),
    },
    {
      key: 'made',
      header: 'Made',
      width: '26%',
      priority: 'wide',
      cell: (p) => (
        <span className="block min-w-0 text-[12.5px]">
          <span className="block truncate text-ink-2">{p.byEngine ? `Policy ${String(p.policy_id ?? p.createdBy).replace(/^(pol_|auto:)/, '')}` : p.created_by_name || p.createdBy || 'unknown'}</span>
          <span className="block text-ink-3">{formatRelative(p.createdAt)}</span>
        </span>
      ),
    },
  ];
  return (
    <Panel flush className="overflow-hidden">
      <RecordBar
        trailing={
          <TableToolbar>
            <RefreshButton onRefresh={query.refetch} refreshing={query.isRefreshing} label="Refresh plans" />
          </TableToolbar>
        }
      >
        <SegmentedControl label="Plan status" options={PLAN_TABS} value={status} onChange={(v) => set({ status: v === PLAN_TABS[0].value ? null : v, page: '' })} />
        <Select size="sm" aria-label="Made by" className="w-44" value={source} onChange={(e) => set({ source: e.target.value, page: '' })} options={SOURCES} />
        <ResultCount shown={formatNumber(query.data?.plans.length ?? 0)} total={formatNumber(query.data?.total ?? 0)} unit="plans" loading={query.isLoading && !query.data} />
      </RecordBar>
      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <DataGrid
          caption="Remediation plans"
          columns={columns}
          rows={query.data?.plans ?? []}
          rowKey={(p) => p.id}
          loading={query.isLoading && !query.data}
          refreshing={query.isRefreshing}
          onRowClick={(p) => navigate(`/remediation/plans/${encodeURIComponent(p.id)}`)}
          emptyState={<EmptyState icon={ListTodo} title="No plan here" description="A plan is made when someone starts a fix from a finding, or when an auto-remediation policy finds something after a scan." />}
        />
      )}
      {(query.data?.total ?? 0) > pageSize && (
        <Pagination page={page} pageSize={pageSize} total={query.data.total} unit="plans" pageSizes={[20]} onPageChange={(p) => set({ page: p === 1 ? '' : String(p) })} />
      )}
    </Panel>
  );
}

/* Plans waiting for someone's decision, and runs in AWS right now. */
function ApprovalsTab() {
  const { user } = useAuth();
  const catalog = useQuery(() => fetchActions().catch(() => []), []);
  const waiting = useQuery((signal) => fetchPlans({ status: 'PENDING_APPROVAL' }, { page: 1, pageSize: 50 }, signal), []);
  const running = useQuery((signal) => fetchPlans({ status: 'APPROVED,SCHEDULED,EXECUTING' }, { page: 1, pageSize: 20 }, signal), []);
  const rows = waiting.data?.plans ?? [];
  const mine = (p) => [p.createdBy, p.created_by_name].filter(Boolean).some((v) => String(v).toLowerCase() === String(user?.email ?? '').toLowerCase());
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel flush className="overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">Waiting for approval</h2>
            <p className="text-[12px] text-ink-3">Approving starts the change in AWS through the remediation role. You cannot approve a plan you made.</p>
          </div>
          <RefreshButton onRefresh={() => (waiting.refetch(), running.refetch())} refreshing={waiting.isRefreshing} label="Refresh approvals" />
        </header>
        {!waiting.data ? (
          <div className="p-5">
            <StatStripSkeleton />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={CheckCircle2} tone="positive" title="Nothing waiting" description="Plans sent for approval, and plans made by auto-remediation policies, appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((p) => (
              <li key={p.id} data-scene="approval-row">
                <Link to={`/remediation/plans/${encodeURIComponent(p.id)}`} className="grid gap-3 px-5 py-3.5 hover:bg-surface-2/60 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{planName(p, catalog.data)}</span>
                      <RiskTag risk={p.riskLevel} />
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
                      <PlanBadges plan={p} />
                      <span className="font-mono">{p.target_name ?? targetLabel(p.targetArn)}</span>
                      <span>· {p.accountId}</span>
                      <span>· by {p.byEngine ? `policy ${String(p.policy_id).replace(/^pol_/, '')}` : p.created_by_name || p.createdBy}</span>
                      <span>· {formatRelative(p.createdAt)}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-[12px] text-ink-3" data-numeric="">
                      {p.requiredApprovals > 1 ? `${p.requiredApprovals} approvals` : '1 approval'}
                    </span>
                    {mine(p) ? (
                      <span className="text-[12px] text-ink-3">Your plan: another approver decides</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand">
                        Review <ArrowRight aria-hidden="true" className="size-3.5" />
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="flex flex-col gap-5">
        <Panel>
          <h3 className="text-[14px] font-semibold text-ink">Running in AWS</h3>
          {(running.data?.plans ?? []).length ? (
            <ul className="mt-3 flex flex-col gap-2">
              {running.data.plans.map((p) => (
                <li key={p.id}>
                  <Link to={`/remediation/plans/${encodeURIComponent(p.id)}`} className="flex items-center gap-2 text-[12.5px] text-ink hover:text-brand">
                    <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-brand" /> {planName(p, catalog.data)} <span className="font-mono text-ink-3">{p.target_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-ink-3">Nothing is running.</p>
          )}
        </Panel>
        <Panel>
          <h3 className="text-[14px] font-semibold text-ink">How approval works</h3>
          <ul className="mt-3 flex flex-col gap-2.5 text-[12px] text-ink-2">
            <li>
              <b className="font-medium text-ink">Safe fixes</b> (low risk, finding below Critical) are approved on submit and run at once.
            </li>
            <li>
              <b className="font-medium text-ink">Everything else</b> needs one approval from someone other than the person who made it; Critical needs two.
            </li>
            <li>
              <b className="font-medium text-ink">Auto-remediation</b> plans always wait here: a policy never changes AWS on its own.
            </li>
            <li>
              <b className="font-medium text-ink">Rollback</b> puts back the snapshot taken before the change, for every fix that can be undone.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

const ACTIVITY_ICON = { APPROVED: CheckCircle2, VERIFIED: ShieldCheck, ROLLED_BACK: RotateCcw, REJECTED: XCircle, EXECUTION_STARTED: Zap, AWS_CALL: Zap, DRY_RUN: Bot, SKIPPED: Bot };
const ACTIVITY_TONE = { APPROVED: 'text-low', VERIFIED: 'text-low', ROLLED_BACK: 'text-medium', REJECTED: 'text-critical', SKIPPED: 'text-medium' };

/* Everything that happened to any plan, newest first. */
function ActivityTab() {
  const q = useQuery((signal) => fetchPlanAudit('', signal), []);
  const [all, setAll] = useState(false);
  const rows = q.data ?? [];
  const shown = all ? rows : rows.slice(0, 40);
  return (
    <Panel flush className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-[14px] font-semibold text-ink">Activity</h2>
          <p className="text-[12px] text-ink-3">Every plan event, with each AWS call the remediation role made. The same record as the audit log.</p>
        </div>
        <RefreshButton onRefresh={q.refetch} refreshing={q.isRefreshing} label="Refresh activity" />
      </header>
      {!q.data ? (
        <div className="p-5">
          <StatStripSkeleton />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ListTodo} title="No activity yet" />
      ) : (
        <ol className="divide-y divide-line">
          {shown.map((a) => {
            const Icon = ACTIVITY_ICON[a.event] ?? CircleDot;
            return (
              <li key={a.audit_id}>
                <Link to={`/remediation/plans/${encodeURIComponent(a.plan_id)}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-surface-2/60">
                  <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', ACTIVITY_TONE[a.event] ?? 'text-ink-3')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-ink">
                      <b className="font-medium">{AUDIT_EVENT[a.event] ?? a.event.replace(/_/g, ' ').toLowerCase()}</b>
                      {a.plan ? (
                        <span className="text-ink-2">
                          {' '}
                          · {a.plan.title} on <span className="font-mono text-[12px]">{a.plan.target_name}</span>
                        </span>
                      ) : null}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-3">
                      {a.actor} · {formatRelative(a.at)}
                      {a.detail ? ` · ${a.detail}` : ''}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {rows.length > 40 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full border-t border-line px-5 py-2.5 text-center text-[12.5px] font-medium text-brand hover:bg-surface-2/60">
          {all ? 'Show the latest 40' : `Show all ${rows.length} events`}
        </button>
      )}
    </Panel>
  );
}

const TABS = ['findings', 'plans', 'approvals', 'activity'];

export default function RemediationPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'findings';
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === undefined) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  /* The summary arrives with every findings page; kept here for the cards. */
  const [summary, setSummary] = useState(null);
  const firstSummary = useQuery((signal) => fetchFindingsToFix({}, { page: 1, pageSize: 1 }, signal), []);
  const waiting = useQuery((signal) => fetchPlans({ status: 'PENDING_APPROVAL' }, { page: 1, pageSize: 1 }, signal), [tab]);
  const shown = summary ?? firstSummary.data?.summary ?? null;
  const summaryQuery = useMemo(() => ({ set: setSummary }), []);

  /* Older links opened a plan with ?plan=<id>. */
  const legacyPlan = params.get('plan');
  if (legacyPlan) return <Navigate to={`/remediation/plans/${encodeURIComponent(legacyPlan)}`} replace />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Remediation"
        lede="Fix what Posture found. Guided: you apply exact steps in AWS. One-click: after approval, the platform makes the change through your remediation role and can roll it back. Auto: plans created by your auto-remediation policies after a scan wait here for approval."
        tabs={
          <Tabs
            tabs={[
              { value: 'findings', label: 'Findings to fix', count: shown?.open },
              { value: 'plans', label: 'Plans' },
              { value: 'approvals', label: 'Approvals', count: waiting.data?.total || undefined },
              { value: 'activity', label: 'Activity' },
            ]}
            value={tab}
            onChange={(v) => setParams(v === 'findings' ? {} : { tab: v }, { replace: true })}
          />
        }
      />
      {tab === 'findings' &&
        (firstSummary.isError && !shown ? (
          <ErrorState error={firstSummary.error} onRetry={firstSummary.refetch} />
        ) : (
          <Journey summary={shown} active={params.get('stage') || ''} onPick={(stage) => setParams(stage ? { stage } : {}, { replace: true })} />
        ))}
      {tab === 'findings' ? (
        <FindingsTab params={params} set={set} summaryQuery={summaryQuery} />
      ) : tab === 'plans' ? (
        <PlansTab params={params} set={set} />
      ) : tab === 'approvals' ? (
        <ApprovalsTab />
      ) : (
        <ActivityTab />
      )}
      <p className="text-[12px] text-ink-3">
        Start from a finding: <b className="font-medium text-ink-2">Fix</b> shows both ways to fix it. One-click needs the remediation role in the account (Integrations → the
        account → Remediation). Findings also open from{' '}
        <Link to="/posture" className="font-medium text-brand hover:underline">
          Posture
        </Link>
        .
      </p>
    </div>
  );
}
