import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronRight, Clock3, Hand, ListTodo, SearchX, ShieldCheck } from 'lucide-react';
import { fetchActions, fetchFindingsToFix, fetchPlans } from '../../lib/api/remediation';
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
import { fixName, targetLabel } from './meta';
import { PlanStatusTag, SeverityTag } from './parts';

const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];

/* Where a finding is in the guided journey. */
const STAGES = [
  { key: 'todo', label: 'To fix', icon: ListTodo, hint: 'Open findings with no plan yet' },
  { key: 'in_progress', label: 'In progress', icon: Hand, hint: 'Guided plans with steps still to apply' },
  { key: 'waiting_scan', label: 'Waiting for the scan', icon: Clock3, hint: 'Marked done; the next scan confirms it' },
  { key: 'fixed', label: 'Fixed · 30 days', icon: ShieldCheck, hint: 'Confirmed fixed by a scan' },
];

function stageOf(finding) {
  if (finding.status === 'RESOLVED') return 'fixed';
  if (!finding.plan) return 'todo';
  return finding.plan.status === 'MANUALLY_DONE' ? 'waiting_scan' : 'in_progress';
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
      {STAGES.map((stage, i) => {
        const on = active === stage.key;
        return (
          <button
            key={stage.key}
            type="button"
            onClick={() => onPick(on ? '' : stage.key)}
            aria-pressed={on}
            className={cn(
              'group relative flex flex-col rounded-[var(--radius-panel)] border bg-surface p-4 text-left transition-[border-color,box-shadow] sm:p-5',
              on ? 'border-brand shadow-[0_0_0_3px_color-mix(in_oklab,var(--t-brand)_14%,transparent)]' : 'border-line hover:border-line-strong',
            )}
          >
            <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
              <span className={cn('grid size-7 place-items-center rounded-full', stage.key === 'fixed' ? 'bg-low-soft text-low' : stage.key === 'todo' ? 'bg-high-soft text-high' : 'bg-info-soft text-brand')}>
                <stage.icon aria-hidden="true" className="size-3.5" />
              </span>
              <span className="font-semibold tracking-[0.04em] uppercase">{stage.label}</span>
              {i < STAGES.length - 1 && <ChevronRight aria-hidden="true" className="ml-auto hidden size-4 text-ink-3/60 xl:block" />}
            </span>
            <span data-numeric="" className="mt-3 font-display text-[30px] leading-none font-bold text-ink">
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
            <span className="block truncate text-[12px] text-ink-3">
              {f.identity_name} · {f.rule_id} {f.rule_name ? `· ${f.rule_name}` : ''}
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
        if (s === 'todo') return <span className="text-[12.5px] text-ink-3">No plan yet</span>;
        if (s === 'fixed') return <span className="flex items-center gap-1 text-[12.5px] text-low"><CheckCircle2 aria-hidden="true" className="size-3.5" /> Fixed {formatRelative(f.resolved_at)}</span>;
        return <PlanStatusTag status={f.plan.status} />;
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
              {s === 'todo' ? 'Fix' : s === 'in_progress' ? 'Continue' : s === 'waiting_scan' ? 'View plan' : 'View'}
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
  { value: 'READY', label: 'To do' },
  { value: 'DRAFT', label: 'Needs input' },
  { value: 'MANUALLY_DONE', label: 'Waiting for the scan' },
  { value: 'RESOLVED', label: 'Fixed' },
  { value: '', label: 'All' },
];

function PlansTab({ params, set }) {
  const navigate = useNavigate();
  const status = params.has('status') ? params.get('status') : 'READY';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = 20;
  const catalog = useQuery(() => fetchActions().catch(() => []), []);
  const query = useQuery((signal) => fetchPlans({ mode: 'GUIDED', status }, { page, pageSize }, signal), [status, page]);
  const columns = [
    { key: 'status', header: 'Status', width: '22%', cell: (p) => <PlanStatusTag status={p.status} /> },
    {
      key: 'fix',
      header: 'Fix',
      primary: true,
      width: '30%',
      cell: (p) => <span className="block truncate text-[13px] font-medium text-ink">{p.actionType === 'manual_fix' ? 'Manual fix' : fixName(p.actionType, catalog.data)}</span>,
    },
    {
      key: 'target',
      header: 'Target',
      width: '20%',
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate font-mono text-[12px] text-ink-2" title={p.targetArn}>{targetLabel(p.targetArn)}</span>
          <span className="block text-[11.5px] text-ink-3">{p.accountId}</span>
        </span>
      ),
    },
    {
      key: 'made',
      header: 'Made',
      width: '28%',
      priority: 'wide',
      cell: (p) => (
        <span className="block min-w-0 text-[12.5px]">
          <span className="block truncate text-ink-2">{p.createdBy || 'unknown'}</span>
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
        <SegmentedControl label="Plan status" options={PLAN_TABS} value={status} onChange={(v) => set({ status: v === 'READY' ? null : v, page: '' })} />
        <ResultCount shown={formatNumber(query.data?.plans.length ?? 0)} total={formatNumber(query.data?.total ?? 0)} unit="plans" loading={query.isLoading && !query.data} />
      </RecordBar>
      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <DataGrid
          caption="Guided plans"
          columns={columns}
          rows={query.data?.plans ?? []}
          rowKey={(p) => p.id}
          loading={query.isLoading && !query.data}
          refreshing={query.isRefreshing}
          onRowClick={(p) => navigate(`/remediation/plans/${encodeURIComponent(p.id)}`)}
          emptyState={<EmptyState icon={ListTodo} title="No plan here" description="A plan is made when someone starts a guided fix from a finding. These numbers count plans, not findings." />}
        />
      )}
      {(query.data?.total ?? 0) > pageSize && (
        <Pagination page={page} pageSize={pageSize} total={query.data.total} unit="plans" pageSizes={[20]} onPageChange={(p) => set({ page: p === 1 ? '' : String(p) })} />
      )}
    </Panel>
  );
}

export default function RemediationPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'plans' ? 'plans' : 'findings';
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
  const shown = summary ?? firstSummary.data?.summary ?? null;
  const summaryQuery = useMemo(() => ({ set: setSummary }), []);

  /* Older links opened a plan with ?plan=<id>. */
  const legacyPlan = params.get('plan');
  if (legacyPlan) return <Navigate to={`/remediation/plans/${encodeURIComponent(legacyPlan)}`} replace />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Remediation"
        lede="Fix what Posture found, by hand in AWS with exact steps. Mark a plan done when you have made the change; the next scan confirms it. Nothing is changed in AWS from here."
        tabs={
          <Tabs
            tabs={[
              { value: 'findings', label: 'Findings to fix', count: shown?.open },
              { value: 'plans', label: 'Plans' },
            ]}
            value={tab}
            onChange={(v) => setParams(v === 'plans' ? { tab: 'plans' } : {}, { replace: true })}
          />
        }
      />
      {firstSummary.isError && !shown ? (
        <ErrorState error={firstSummary.error} onRetry={firstSummary.refetch} />
      ) : (
        <Journey
          summary={shown}
          active={tab === 'findings' ? params.get('stage') || '' : ''}
          onPick={(stage) => setParams(stage ? { stage } : {}, { replace: true })}
        />
      )}
      {tab === 'findings' ? <FindingsTab params={params} set={set} summaryQuery={summaryQuery} /> : <PlansTab params={params} set={set} />}
      <p className="text-[12px] text-ink-3">
        Start from a finding: <b className="font-medium text-ink-2">Fix</b> shows its steps; <b className="font-medium text-ink-2">Start guided fix</b> makes a plan you tick
        through and mark done. Findings also open from{' '}
        <Link to="/posture" className="font-medium text-brand hover:underline">
          Posture
        </Link>
        .
      </p>
    </div>
  );
}
