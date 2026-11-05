import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Inbox, Info, ListChecks, RefreshCw, SearchX, Settings2, ShieldCheck, Wand2, XCircle } from 'lucide-react';
import { useAuth } from '../../app/AuthContext';
import { useAccess } from '../../app/useAccess';
import { useWorkspace } from '../../app/WorkspaceContext';
import {
  approvePlan,
  fetchAccountSetup,
  fetchActions,
  fetchPlans,
  fetchRemediationAccounts,
  oneClickProblem,
  rejectPlan,
  updateRemediationAccount,
  validateRemediationAccount,
} from '../../lib/api/remediation';
import { useQuery } from '../../lib/hooks';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { CopyableValue } from '../../ui/Copyable';
import { DataGrid } from '../../ui/DataGrid';
import { Field, Input, Select, Textarea } from '../../ui/Field';
import { Modal } from '../../ui/Overlay';
import { Pagination } from '../../ui/Pagination';
import { Panel } from '../../ui/Panel';
import { EmptyState, ErrorState, InlineError } from '../../ui/States';
import { SegmentedControl, Tabs } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { RecordBar, ResultCount } from '../../ui/WorkArea';
import { MODE_LABEL, STATUS_FILTERS, fixName, isCreator, riskMeta, statusMeta, targetLabel } from './meta';
import { PlanDrawer } from './PlanDrawer';

const INBOX_POLL_MS = 45000;

/**
 * Remediation: what is waiting for an approver, every plan of the workspace,
 * and where One-click is set up per AWS account. Plans are made from a
 * finding (Posture › an identity › Findings › Fix this finding); this page is
 * where they are followed and decided. `?plan=<id>` opens one, e.g. from the
 * approval e-mail.
 */
export default function RemediationPage() {
  const { can } = useAccess();
  const [params, setParams] = useSearchParams();
  const tab = ['inbox', 'plans', 'setup'].includes(params.get('tab')) ? params.get('tab') : 'inbox';
  const planParam = params.get('plan');
  const [follow, setFollow] = useState(0);
  const [revision, setRevision] = useState(0);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key === 'plan' ? false : true });
  };

  /* The inbox count is shown on its tab from any tab, and kept fresh. */
  const inbox = useQuery((signal) => fetchPlans({ status: 'PENDING_APPROVAL' }, { page: 1, pageSize: 50 }, signal), [revision]);
  const refetchInbox = inbox.refetch;
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && refetchInbox(), INBOX_POLL_MS);
    return () => clearInterval(id);
  }, [refetchInbox]);
  const waiting = inbox.data?.plans.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Remediation"
        lede="Fixes for posture findings: Guided plans you apply by hand, and One-click plans the console applies in AWS after any approval they need. Make a plan from a finding; follow and decide it here."
      />

      <div className="-mt-2 border-b border-line">
        <Tabs
          tabs={[
            { value: 'inbox', label: 'Waiting for approval', count: waiting || undefined },
            { value: 'plans', label: 'All plans' },
            { value: 'setup', label: 'One-click setup' },
          ]}
          value={tab}
          onChange={(value) => setParam('tab', value === 'inbox' ? null : value)}
        />
      </div>

      {tab === 'inbox' && <InboxTab query={inbox} onOpen={(id) => setParam('plan', id)} onChanged={() => setRevision((n) => n + 1)} />}
      {tab === 'plans' && <PlansTab revision={revision} onOpen={(id) => setParam('plan', id)} />}
      {tab === 'setup' && <SetupTab canEdit={can('remediation.settings')} />}

      <PlanDrawer
        planId={planParam}
        followFrom={follow}
        onClose={() => {
          setFollow(0);
          setParam('plan', null);
        }}
        onChanged={() => setRevision((n) => n + 1)}
      />
    </div>
  );
}

/* ── Inbox ─────────────────────────────────────────────────────────────── */

function InboxTab({ query, onOpen, onChanged }) {
  const { can } = useAccess();
  const { user } = useAuth();
  const catalog = useQuery((signal) => fetchActions(signal), []);
  const [decide, setDecide] = useState(null); // { plan, approve }
  const plans = query.data?.plans ?? [];
  const approver = can('remediation.approve');

  const columns = [
    {
      key: 'fix',
      header: 'Fix',
      width: '34%',
      primary: true,
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{fixName(p.actionType, catalog.data)}</span>
          <span className="cell-meta block truncate font-mono text-[11px] text-ink-3" title={p.targetArn}>
            {targetLabel(p.targetArn)}
          </span>
        </span>
      ),
    },
    { key: 'account', header: 'Account', width: '14%', cell: (p) => <span className="font-mono text-[12px] text-ink-2">{p.accountId || '-'}</span> },
    {
      key: 'risk',
      header: 'Risk',
      width: '12%',
      cell: (p) => (
        <Tag size="sm" tone={riskMeta(p.riskLevel).tone}>
          {riskMeta(p.riskLevel).label.replace(' risk', '')}
        </Tag>
      ),
    },
    {
      key: 'by',
      header: 'Made by',
      width: '18%',
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate text-[12.5px] text-ink-2">{p.byEngine ? 'Rule engine' : p.createdBy || '-'}</span>
          <span className="cell-meta block text-[11px] text-ink-3" title={formatDateTime(p.createdAt)}>
            {formatRelative(p.createdAt)}
          </span>
        </span>
      ),
    },
    {
      key: 'decide',
      header: <span className="sr-only">Decide</span>,
      width: '22%',
      cell: (p) =>
        approver && !isCreator(p, user) ? (
          <span className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setDecide({ plan: p, approve: false })}>
              Reject
            </Button>
            <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => setDecide({ plan: p, approve: true })}>
              Approve
            </Button>
          </span>
        ) : (
          <span className="block text-right text-[11.5px] text-ink-3">{approver ? 'Yours - someone else approves' : 'An approver decides'}</span>
        ),
    },
  ];

  return (
    <>
      {!approver && (
        <p className="-mt-2 flex items-start gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink-2">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
          These One-click plans wait for an operator or admin to approve them. You can open each to see what it would change.
        </p>
      )}
      <Panel prominence="lead" flush className="overflow-hidden">
        <RecordBar
          trailing={
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={query.refetch} loading={query.isRefreshing}>
              Refresh
            </Button>
          }
        >
          <ResultCount shown={formatNumber(plans.length)} total={formatNumber(plans.length)} unit={plans.length === 1 ? 'plan waiting' : 'plans waiting'} loading={!query.data && query.isLoading} />
          <span className="text-[12px] text-ink-3">Checked every 45 seconds · a plan nobody approves expires after 72 hours.</span>
        </RecordBar>
        {query.isError && !query.data ? (
          <ErrorState error={query.error} onRetry={query.refetch} title="The plans waiting for approval could not be read" />
        ) : (
          <DataGrid
            caption="Plans waiting for approval"
            columns={columns}
            rows={plans}
            rowKey={(p) => p.id}
            loading={!query.data && query.isLoading}
            refreshing={query.isRefreshing}
            onRowClick={(p) => onOpen(p.id)}
            emptyState={<EmptyState compact icon={Inbox} title="Nothing is waiting" description="One-click plans that need an approver appear here, and the approvers are e-mailed." />}
          />
        )}
      </Panel>
      <DecideModal
        state={decide}
        onClose={() => setDecide(null)}
        onDone={() => {
          setDecide(null);
          onChanged();
        }}
        catalog={catalog.data}
      />
    </>
  );
}

function DecideModal({ state, onClose, onDone, catalog }) {
  const { notify } = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = state?.plan;
  const approve = state?.approve;
  const close = () => {
    if (busy) return;
    setComment('');
    setError('');
    onClose();
  };
  const go = async () => {
    if (!approve && !comment.trim()) {
      setError('Say why, so the person who made it knows what to change.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await (approve ? approvePlan(plan.id, comment.trim()) : rejectPlan(plan.id, comment.trim()));
      notify(
        approve
          ? { variant: 'success', title: 'Approved', description: plan.byEngine ? 'The rule engine runs it within about 5 minutes.' : 'It runs in AWS now.' }
          : { variant: 'success', title: 'Rejected', description: 'Nothing was changed.' },
      );
      setComment('');
      onDone();
    } catch (err) {
      setError(err?.message || 'That did not work.');
      if (err?.status === 409) onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={Boolean(state)}
      onClose={close}
      icon={approve ? ShieldCheck : XCircle}
      tone={approve ? 'brand' : 'critical'}
      title={approve ? 'Approve and run' : 'Reject this plan'}
      description={approve ? 'This will change AWS: the fix runs straight after your approval.' : 'Nothing is changed. The person who made the plan sees your reason.'}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Keep it
          </Button>
          <Button variant={approve ? 'primary' : 'danger'} loading={busy} onClick={go}>
            {approve ? 'Approve and run' : 'Reject plan'}
          </Button>
        </>
      }
    >
      {plan && (
        <div className="flex flex-col gap-3">
          <div className="rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2.5 text-[12.5px]">
            <p className="font-medium text-ink">{fixName(plan.actionType, catalog)}</p>
            <p className="font-mono text-[11.5px] break-all text-ink-3">{plan.targetArn}</p>
            <p className="mt-1 text-ink-3">
              {riskMeta(plan.riskLevel).label} · account <span className="font-mono">{plan.accountId}</span> · made by {plan.byEngine ? 'the rule engine' : plan.createdBy}
            </p>
          </div>
          <Field label={approve ? 'Comment' : 'Reason'} htmlFor="decide-comment" hint={approve ? 'Optional.' : 'Required.'} error={error || undefined}>
            <Textarea id="decide-comment" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} invalid={Boolean(error)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/* ── All plans ─────────────────────────────────────────────────────────── */

function PlansTab({ revision, onOpen }) {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const catalog = useQuery((signal) => fetchActions(signal), []);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('');
  const [accountId, setAccountId] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const query = useQuery(
    (signal) => fetchPlans({ status, mode, accountId }, { page, pageSize }, signal),
    [status, mode, accountId, page, pageSize, revision],
  );
  const accounts = (workspace.integration?.accounts ?? []).map((a) => a.accountId);
  const reset = (setter) => (value) => {
    setPage(1);
    setter(value);
  };
  /* There is no "only mine" filter on the server: this one filters the page shown. */
  const rows = useMemo(() => (query.data?.plans ?? []).filter((p) => !mine || isCreator(p, user)), [query.data, mine, user]);
  const filtered = Boolean(status || mode || accountId || mine);

  const columns = [
    {
      key: 'fix',
      header: 'Fix',
      width: '34%',
      primary: true,
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13px] font-medium text-ink">{fixName(p.actionType, catalog.data)}</span>
          <span className="cell-meta block truncate font-mono text-[11px] text-ink-3" title={p.targetArn}>
            {targetLabel(p.targetArn)} · {p.accountId}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '24%',
      cell: (p) => (
        <span className="block min-w-0">
          <Tag size="sm" tone={statusMeta(p.status).tone} dot>
            {statusMeta(p.status).label}
          </Tag>
          {p.statusReason && (
            <span className="cell-meta mt-0.5 block truncate text-[11px] text-ink-3" title={p.statusReason}>
              {p.statusReason}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'mode',
      header: 'Mode',
      width: '12%',
      cell: (p) => (
        <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-2">
          {p.mode === 'ONE_CLICK' ? <Wand2 aria-hidden="true" className="size-3.5" /> : <ListChecks aria-hidden="true" className="size-3.5" />}
          {MODE_LABEL[p.mode] ?? p.mode}
        </span>
      ),
    },
    {
      key: 'by',
      header: 'Made',
      width: '18%',
      cell: (p) => (
        <span className="block min-w-0">
          <span className="block truncate text-[12.5px] text-ink-2">{p.byEngine ? 'Rule engine' : p.createdBy || '-'}</span>
          <span className="cell-meta block text-[11px] text-ink-3" title={formatDateTime(p.createdAt)}>
            {formatRelative(p.createdAt)}
          </span>
        </span>
      ),
    },
    {
      key: 'risk',
      header: 'Risk',
      width: '12%',
      priority: 'wide',
      cell: (p) => (
        <Tag size="sm" tone={riskMeta(p.riskLevel).tone}>
          {riskMeta(p.riskLevel).label.replace(' risk', '')}
        </Tag>
      ),
    },
  ];

  return (
    <Panel prominence="lead" flush className="overflow-hidden" data-list-top="">
      <RecordBar
        trailing={
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={query.refetch} loading={query.isRefreshing}>
            Refresh
          </Button>
        }
      >
        <Select size="sm" aria-label="Status" value={status} onChange={(e) => reset(setStatus)(e.target.value)} options={STATUS_FILTERS} className="w-56" />
        <SegmentedControl
          label="Mode"
          options={[
            { value: '', label: 'Any mode' },
            { value: 'GUIDED', label: 'Guided' },
            { value: 'ONE_CLICK', label: 'One-click' },
          ]}
          value={mode}
          onChange={reset(setMode)}
        />
        {accounts.length > 1 && (
          <Select
            size="sm"
            aria-label="AWS account"
            value={accountId}
            onChange={(e) => reset(setAccountId)(e.target.value)}
            options={[{ value: '', label: 'Every account' }, ...accounts.map((a) => ({ value: a, label: a }))]}
            className="w-44"
          />
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" className="size-4 accent-[var(--t-brand)]" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          Made by me
        </label>
        <ResultCount
          shown={formatNumber(rows.length)}
          total={query.data?.exact ? formatNumber(query.data.total) : formatNumber(rows.length)}
          unit={rows.length === 1 ? 'plan' : 'plans'}
          paged
          filtered={filtered}
          loading={!query.data && query.isLoading}
        />
      </RecordBar>
      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={query.refetch} title="The plans could not be read" />
      ) : (
        <DataGrid
          caption="Remediation plans"
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          loading={!query.data && query.isLoading}
          refreshing={query.isRefreshing}
          onRowClick={(p) => onOpen(p.id)}
          emptyState={
            filtered ? (
              <EmptyState
                compact
                icon={SearchX}
                title="No plan matches"
                description="Try another status, mode or account."
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setStatus('');
                      setMode('');
                      setAccountId('');
                      setMine(false);
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={ListChecks}
                title="No plans yet"
                description="Open a finding (Posture › an identity › Findings) and choose Fix this finding to make the first plan."
              />
            )
          }
        />
      )}
      {query.data && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={query.data.total}
          unit="plans"
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </Panel>
  );
}

/* ── One-click setup ───────────────────────────────────────────────────── */

const ACCESS = {
  OK: { label: 'Role works', tone: 'low' },
  CANNOT_ASSUME: { label: 'Role cannot be assumed', tone: 'critical' },
  MISSING_PERMISSIONS: { label: 'Role lacks permissions', tone: 'critical' },
  UNKNOWN: { label: 'Not checked yet', tone: 'neutral' },
};

function SetupTab({ canEdit }) {
  const workspace = useWorkspace();
  const settings = useQuery((signal) => fetchRemediationAccounts(signal), []);
  const catalog = useQuery((signal) => fetchActions(signal), []);
  const [editing, setEditing] = useState(null);
  const connected = (workspace.integration?.accounts ?? []).filter((a) => a.connectedAt);
  const byId = new Map((settings.data ?? []).map((a) => [a.accountId, a]));
  const ids = [...new Set([...connected.map((a) => a.accountId), ...byId.keys()])];

  if (settings.isError && !settings.data) return <ErrorState error={settings.error} onRetry={settings.refetch} title="The One-click settings could not be read" />;

  return (
    <>
      <p className="-mt-2 flex items-start gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink-2">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
        One-click needs a separate remediation role in each AWS account, with only the write permissions of the fixes you allow. Guided plans need nothing: they work in every account.
        {!canEdit && ' An admin changes these settings.'}
      </p>
      {!settings.data ? (
        <Panel>
          <div className="h-24 animate-pulse rounded bg-surface-2" />
        </Panel>
      ) : ids.length === 0 ? (
        <Panel>
          <EmptyState compact icon={Settings2} title="No AWS account connected" description="Connect an account on the Integrations page first." />
        </Panel>
      ) : (
        <div className="grid gap-3 @min-[64rem]:grid-cols-2">
          {ids.map((id) => {
            const a = byId.get(id) ?? null;
            const problem = oneClickProblem(a);
            const access = ACCESS[a?.accessStatus] ?? ACCESS.UNKNOWN;
            return (
              <Panel key={id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[14px] font-semibold text-ink">{id}</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">{problem || 'One-click is ready in this account.'}</p>
                  </div>
                  <Tag tone={problem ? 'neutral' : 'low'} size="sm" dot>
                    {a?.enabled ? 'One-click on' : 'One-click off'}
                  </Tag>
                </div>
                {a && (
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
                    <dt className="text-ink-3">Role</dt>
                    <dd className="min-w-0 font-mono text-[11.5px] break-all text-ink-2">{a.roleArn || '-'}</dd>
                    <dt className="text-ink-3">Access</dt>
                    <dd>
                      <Tag size="sm" tone={access.tone}>
                        {access.label}
                      </Tag>
                      {a.accessDetail && <span className="ml-2 text-ink-3">{a.accessDetail}</span>}
                    </dd>
                    <dt className="text-ink-3">Fixes allowed</dt>
                    <dd className="text-ink-2">
                      {a.allowedActionTypes.length ? a.allowedActionTypes.map((t) => fixName(t, catalog.data)).join(', ') : 'Every supported fix'}
                    </dd>
                    <dt className="text-ink-3">Regions</dt>
                    <dd className="font-mono text-[11.5px] text-ink-2">{a.enabledRegions.length ? a.enabledRegions.join(', ') : 'All of the account’s regions'}</dd>
                    <dt className="text-ink-3">Automatic</dt>
                    <dd className="text-ink-2">{a.autoEnabled ? 'The rule engine may make plans by itself' : 'Off'}</dd>
                  </dl>
                )}
                {canEdit && (
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    <Button size="sm" variant={a?.enabled ? 'secondary' : 'primary'} icon={Settings2} onClick={() => setEditing({ id, account: a })}>
                      {a ? 'Edit' : 'Set up One-click'}
                    </Button>
                    {a?.roleArn && <ValidateButton accountId={id} onDone={settings.refetch} />}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
      {editing && (
        <AccountModal
          accountId={editing.id}
          account={editing.account}
          regions={(workspace.integration?.accounts ?? []).find((a) => a.accountId === editing.id)?.regions ?? []}
          catalog={(catalog.data ?? []).filter((c) => c.one_click_supported && c.enabled !== false)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            settings.refetch();
          }}
        />
      )}
    </>
  );
}

function ValidateButton({ accountId, onDone }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={ShieldCheck}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const a = await validateRemediationAccount(accountId);
          notify(
            a.accessStatus === 'OK'
              ? { variant: 'success', title: 'The role works', description: a.accessDetail }
              : { variant: 'error', title: 'The role does not work yet', description: a.accessDetail || a.accessStatus },
          );
          onDone();
        } catch (error) {
          notify({ variant: 'error', title: 'Could not check the role', description: error?.message });
        } finally {
          setBusy(false);
        }
      }}
    >
      Check the role
    </Button>
  );
}

function AccountModal({ accountId, account, regions, catalog, onClose, onSaved }) {
  const { notify } = useToast();
  const setup = useQuery((signal) => fetchAccountSetup(accountId, signal).catch(() => null), [accountId]);
  const [enabled, setEnabled] = useState(account?.enabled ?? true);
  const [roleArn, setRoleArn] = useState(account?.roleArn ?? '');
  const [allowed, setAllowed] = useState(() => new Set(account?.allowedActionTypes ?? []));
  const [chosenRegions, setChosenRegions] = useState(() => new Set(account?.enabledRegions ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const suggested = setup.data?.remediation_role_arn || '';
  const toggle = (set, setter, value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };
  const save = async () => {
    if (enabled && !roleArn.trim()) {
      setError({ message: 'Paste the ARN of the remediation role to turn One-click on.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await updateRemediationAccount(accountId, {
        enabled,
        roleArn: roleArn.trim(),
        allowedActionTypes: [...allowed],
        enabledRegions: [...chosenRegions],
      });
      notify(
        saved.accessStatus && saved.accessStatus !== 'OK' && enabled
          ? { variant: 'error', title: 'Saved - but the role does not work yet', description: saved.accessDetail || saved.accessStatus }
          : { variant: 'success', title: enabled ? 'One-click is on' : 'One-click is off', description: `Account ${accountId}.` },
      );
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      icon={Settings2}
      title={`One-click in ${accountId}`}
      description="The role is checked as soon as you save."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-ink">
          <input type="checkbox" className="size-4 accent-[var(--t-brand)]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Allow One-click fixes in this account
        </label>
        {setup.data && (
          <div className="rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 py-2.5 text-[12.5px]">
            <p className="mb-1 font-medium text-ink">Create the role with these values</p>
            <p className="text-ink-3">External ID</p>
            <CopyableValue value={setup.data.external_id} className="text-[12px]" />
            {suggested && (
              <>
                <p className="mt-1.5 text-ink-3">Role ARN</p>
                <CopyableValue value={suggested} className="text-[12px]" />
              </>
            )}
          </div>
        )}
        <Field label="Remediation role ARN" htmlFor="rem-role">
          <Input id="rem-role" value={roleArn} onChange={(e) => setRoleArn(e.target.value)} placeholder={suggested || `arn:aws:iam::${accountId}:role/ISPMRemediation`} className="font-mono text-[12.5px]" />
        </Field>
        {suggested && !roleArn && (
          <Button size="sm" variant="ghost" className="-mt-3 self-start" onClick={() => setRoleArn(suggested)}>
            Use {targetLabel(suggested)}
          </Button>
        )}
        {catalog.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-[12.5px] font-medium text-ink">Fixes it may apply <span className="font-normal text-ink-3">(none ticked: every supported fix)</span></legend>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-[var(--radius-control)] border border-line p-2 sm:grid-cols-2">
              {catalog.map((c) => (
                <label key={c.action_type} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-surface-2">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--t-brand)]" checked={allowed.has(c.action_type)} onChange={() => toggle(allowed, setAllowed, c.action_type)} />
                  <span className="min-w-0">
                    <span className="block text-ink">{c.title}</span>
                    <span className="block text-[11px] text-ink-3">{riskMeta(c.risk_level).label}{c.reversible ? ' · reversible' : ''}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {regions.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-[12.5px] font-medium text-ink">Regions <span className="font-normal text-ink-3">(none ticked: all)</span></legend>
            <div className="flex flex-wrap gap-2">
              {regions.map((r) => (
                <label key={r} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-2.5 py-1 font-mono text-[12px]">
                  <input type="checkbox" className="size-3.5 accent-[var(--t-brand)]" checked={chosenRegions.has(r)} onChange={() => toggle(chosenRegions, setChosenRegions, r)} />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {error && <InlineError error={error} label="Not saved" />}
      </div>
    </Modal>
  );
}
