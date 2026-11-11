import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bot, Eye, Gauge, FileWarning, Fingerprint, Globe2, KeyRound, LineChart, Pencil, RotateCw, ScanEye } from 'lucide-react';
import { useAccess } from '../../app/useAccess';
import { useSync } from '../sync/SyncContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { fetchFindings } from '../../lib/api/exposure';
import {
  fetchDashboardOverview,
  fetchScanTrends,
  fetchGenomeSummary,
  fetchPostureSummary,
  fetchScopeSettings,
  fetchLatestActivity,
} from '../../lib/api/overview';
import { useQuery } from '../../lib/hooks';
import { useToast } from '../../ui/Toast';
import { NEUTRAL_SERIES, SERIES_TOKENS } from '../../lib/domain';
import { formatDate, formatDateTime, formatNumber, formatRelative, humanizeToken, parseDate, percentValue } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { CompositionDonut } from '../../charts/CompositionDonut';
import { TrendChart } from '../../charts/TrendChart';
import { Button } from '../../ui/Button';
import { Meter } from '../../ui/Meter';
import { Panel, PanelHeader } from '../../ui/Panel';
import { MetricTile } from '../../ui/Stat';
import { Select } from '../../ui/Field';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { ChartSkeleton, DonutSkeleton, ListSkeleton, LoadingAnnouncement, Skeleton, StatStripSkeleton } from '../../ui/Skeleton';
import { ClearState, EmptyState, ErrorState, InlineError } from '../../ui/States';
import { windowPhrase } from '../../lib/api/posture';
import { RecentChangesCard } from '../changes/RecentChangesCard';
import { BandTag, Delta, ScoreRing } from '../posture/parts';
import { credentialTypeMeta, environmentLabel, functionalClassMeta, identityTypeLabel, lifecycleMeta } from '../identities/meta';
import { describeExposureError, summariseFindings } from '../exposure/scannerState';
import { ScopeStrip } from './ScopeStrip';
import { SignalList } from './SignalList';

/**
 * The organisation dashboard.
 *
 * Three services feed it - discovery (inventory counts, scoped by the user's
 * saved accounts and regions), posture (the fleet score) and behaviour
 * (baselines and anomalies) - plus credential exposure when the workspace has
 * it switched on and the role may see it. Each is asked separately and each
 * panel fails on its own, so one service being down never blanks the page.
 */
export default function OverviewPage() {
  const { can } = useAccess();
  const { exposureEnabled, status: workspaceStatus } = useWorkspace();
  /* Exposure figures appear only once the feature is switched on in
     Integrations AND the role may open them; otherwise the API is not asked. */
  const exposure = can('exposure.view') && exposureEnabled;
  const offerExposureSetup = !exposureEnabled && workspaceStatus === 'ready' && can('integrations.manage');
  return <OrganisationDashboard exposure={exposure} offerExposureSetup={offerExposureSetup} />;
}

function OrganisationDashboard({ exposure, offerExposureSetup }) {
  const overviewQuery = useQuery((signal) => fetchDashboardOverview(signal), []);
  const scopeQuery = useQuery((signal) => fetchScopeSettings(signal), []);
  const postureQuery = useQuery((signal) => fetchPostureSummary({ window: '30d' }, signal), []);
  const genomeQuery = useQuery((signal) => fetchGenomeSummary(signal), []);
  const findingsQuery = useQuery((signal) => fetchFindings(signal), [], { enabled: exposure });
  const trendsQuery = useQuery((signal) => fetchScanTrends(signal), []);
  const activityQuery = useQuery((signal) => fetchLatestActivity(signal), []);

  const overview = overviewQuery.data;
  const kpis = overview?.kpis;
  const loadingOverview = overviewQuery.isLoading && !overview;
  const overviewFailed = overviewQuery.isError && !overview;

  const findingSummary = useMemo(() => summariseFindings(findingsQuery.data?.findings), [findingsQuery.data]);

  /* Refresh says it worked: the button spins while the figures reload (they
     stay on screen, dimmed), then a note confirms the time they were read. */
  const { notify } = useToast();
  const [manualRefresh, setManualRefresh] = useState(false);
  const refreshAll = async () => {
    setManualRefresh(true);
    const started = Date.now();
    await Promise.allSettled([
      overviewQuery.refetch(),
      scopeQuery.refetch(),
      postureQuery.refetch(),
      genomeQuery.refetch(),
      trendsQuery.refetch(),
      activityQuery.refetch(),
      exposure ? findingsQuery.refetch() : null,
    ]);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 600 - (Date.now() - started))));
    setManualRefresh(false);
    notify({ variant: 'success', title: 'Figures refreshed', description: `Read at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.` });
  };

  /* A sync that finishes reloads every figure, so the cards, the scope strip
     and the Sync button show the same scan: they used to keep the old figures
     (and the old "last synced" time) until Refresh figures was pressed. */
  const { run } = useSync();
  const syncedAt = run?.stage === 'done' ? run.finishedAt : null;
  const seenSync = useRef(syncedAt);
  useEffect(() => {
    if (!syncedAt || syncedAt === seenSync.current) return;
    seenSync.current = syncedAt;
    overviewQuery.refetch();
    scopeQuery.refetch();
    postureQuery.refetch();
    genomeQuery.refetch();
    trendsQuery.refetch();
    activityQuery.refetch();
    if (exposure) findingsQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncedAt]);

  const refreshing =
    manualRefresh || overviewQuery.isRefreshing || postureQuery.isRefreshing || genomeQuery.isRefreshing || scopeQuery.isRefreshing;

  /* No tenant tables yet: one calm message instead of a page of failed cards. */
  if (overviewFailed && overviewQuery.error?.code === 'TENANT_NOT_PROVISIONED') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Dashboard" />
        <Panel>
          <ErrorState error={overviewQuery.error} onRetry={refreshAll} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        lede="What is at risk across your AWS accounts, what changed in the last sync, and where to look first."
        actions={
          <Button variant="secondary" icon={RotateCw} onClick={refreshAll} loading={refreshing}>
            Refresh figures
          </Button>
        }
        meta={
          <ScopeStrip
            scope={scopeQuery}
            lastScanAt={overview?.lastScanAt}
            onScopeSaved={() => {
              scopeQuery.refetch();
              overviewQuery.refetch();
            }}
          />
        }
      />

      {/* ── The answer first: one score, then the four numbers behind it ── */}
      <PostureBanner query={postureQuery} />

      {loadingOverview ? (
        <>
          <LoadingAnnouncement label="Loading inventory figures" />
          <StatStripSkeleton count={4} />
        </>
      ) : overviewFailed ? (
        <InlineError error={overviewQuery.error} onRetry={overviewQuery.refetch} label="Inventory figures could not be loaded" />
      ) : (
        <HeadlineTiles kpis={kpis} activity={overview.activityDataAvailable} exposure={exposure} findingsQuery={findingsQuery} findingSummary={findingSummary} />
      )}

      {/* ── Why: the exposure signals, next to what the estate is made of ── */}
      <div className="grid gap-4 @min-[52rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel prominence="lead" className="animate-rise" data-stagger="" style={{ '--stagger': 3 }}>
          <PanelHeader prominence="lead" title="Exposure signals" subtitle="Each line is a share of all your identities or credentials, largest first. Select one to open the list." />
          <div className="mt-3">
            {overviewFailed ? <Unavailable source="discovery" /> : <SignalsBody overview={overview} loading={loadingOverview} />}
          </div>
        </Panel>
        <Panel prominence="default" className="animate-rise" data-stagger="" style={{ '--stagger': 4 }}>
          <EstateMix overview={overview} loading={loadingOverview} failed={overviewFailed} />
        </Panel>
      </div>

      {/* ── What the last sync changed ─────────────────────────────────────── */}
      {!loadingOverview && !overviewFailed && overview?.recentChanges && <RecentChangesCard recent={overview.recentChanges} />}

      {/* ── What identities sign in with, and how the estate is moving ───── */}
      <div className="grid gap-4 @min-[60rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel prominence="quiet" className="animate-rise" data-stagger="" style={{ '--stagger': 5 }}>
          <CredentialSurface overview={overview} loading={loadingOverview} failed={overviewFailed} />
        </Panel>
        <Panel prominence="quiet" className="animate-rise" data-stagger="" style={{ '--stagger': 6 }}>
          <DiscoveryTrend overview={overview} trends={trendsQuery.data} loading={loadingOverview} failed={overviewFailed} />
        </Panel>
      </div>

      {/* ── What the identities are doing ──────────────────────────────────── */}
      <div className={cn('grid gap-4', exposure && '@min-[60rem]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]')}>
        <Panel prominence="quiet" className="animate-rise" data-stagger="" style={{ '--stagger': 7 }}>
          <LatestActivity query={activityQuery} genome={genomeQuery} />
        </Panel>
        {exposure && (
          <Panel prominence="quiet" className="animate-rise" data-stagger="" style={{ '--stagger': 8 }}>
            <CredentialExposure query={findingsQuery} summary={findingSummary} />
          </Panel>
        )}
      </div>

      {offerExposureSetup && (
        <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
          <FileWarning aria-hidden="true" className="size-3.5 shrink-0" />
          Looking for secrets committed to your code repositories is off for this workspace.
          <Link to="/integrations" className="font-medium text-brand hover:underline">
            Turn it on in Integrations
          </Link>
        </p>
      )}
    </div>
  );
}


/**
 * A secondary panel whose service failed. The failure and its Retry are shown
 * once, at the top of the page (inventory figures, posture score), so the
 * panels below say only that their part is missing.
 */
function Unavailable({ source }) {
  return (
    <p className="flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-line px-3 py-3 text-[12.5px] text-ink-3">
      <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
      {source === 'posture'
        ? 'Not available: security scores could not be loaded. Use Retry at the top of the page.'
        : 'Not available: inventory figures could not be loaded. Use Retry at the top of the page.'}
    </p>
  );
}

/* ── Headline tiles ───────────────────────────────────────────────────────── */

function HeadlineTiles({ kpis, activity, exposure, findingsQuery, findingSummary }) {
  return (
    <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[54rem]:grid-cols-4">
      <MetricTile
        as={Link}
        to="/identities"
        data-stagger=""
        style={{ '--stagger': 0 }}
        className="animate-rise"
        label="Identities discovered"
        value={kpis.totalIdentities}
        icon={Fingerprint}
        tone="brand"
        caption={`Non-human identities across ${formatNumber(kpis.accountsScanned)} account${kpis.accountsScanned === 1 ? '' : 's'}`}
      />
      <MetricTile
        as={Link}
        to="/identities?shadow=true"
        data-stagger=""
        style={{ '--stagger': 1 }}
        className="animate-rise"
        label="Without an owner"
        value={kpis.shadowIdentities}
        icon={Bot}
        tone="high"
        caption={
          activity
            ? 'No owner, team or creator could be resolved'
            : 'No owner tag. The AWS activity log could not be read to name a creator'
        }
        meter={percentValue(kpis.shadowIdentities, kpis.totalIdentities)}
        meterLabel="Share of all identities"
      />
      <MetricTile
        as={Link}
        to="/credentials"
        data-stagger=""
        style={{ '--stagger': 2 }}
        className="animate-rise"
        label="Credentials"
        value={kpis.totalCredentials}
        icon={KeyRound}
        tone="medium"
        caption={
          kpis.activeCredentials === null
            ? 'Keys, passwords and certificates held by identities'
            : `Keys, passwords and certificates held by identities · ${formatNumber(kpis.activeCredentials)} used or created in the last 90 days`
        }
      />
      {exposure ? (
        <CodeExposureTile query={findingsQuery} summary={findingSummary} />
      ) : (
        <MetricTile
          as={Link}
          to="/identities?is_publicly_accessible=true"
          data-stagger=""
          style={{ '--stagger': 3 }}
          className="animate-rise"
          label="Reachable from the internet"
          value={kpis.publiclyAccessible}
          icon={Globe2}
          tone="critical"
          caption="Identities anyone on the internet could reach"
          meter={percentValue(kpis.publiclyAccessible, kpis.totalIdentities)}
          meterLabel="Share of all identities"
        />
      )}
    </div>
  );
}

/** Tile for credential exposure, which has its own availability story. */
function CodeExposureTile({ query, summary }) {
  if (query.isLoading && !query.data) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-line bg-surface p-4" aria-busy="true">
        <Skeleton className="h-3 w-28 rounded" />
        <Skeleton className="mt-3 h-8 w-16 rounded" />
        <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
      </div>
    );
  }

  if (query.isError && !query.data) {
    const detail = describeExposureError(query.error);
    return (
      <div className="flex flex-col justify-between rounded-[var(--radius-panel)] border border-line bg-surface p-4">
        <p className="text-[11px] font-semibold tracking-[0.09em] text-ink-3 uppercase">Exposed secrets</p>
        <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{detail.title}</p>
        <Button variant="ghost" size="sm" icon={RotateCw} onClick={query.refetch} className="mt-2 self-start">
          Retry
        </Button>
      </div>
    );
  }

  const highish = (summary.byTier.CRITICAL || 0) + (summary.byTier.HIGH || 0);

  return (
    <MetricTile
      as={Link}
      to="/exposure"
      data-stagger=""
      style={{ '--stagger': 3 }}
      className="animate-rise"
      label="Secrets in code"
      value={summary.total}
      icon={FileWarning}
      tone={highish > 0 ? 'critical' : 'low'}
      caption={`${formatNumber(highish)} high or critical · ${formatNumber(summary.repositoryCount)} repositor${summary.repositoryCount === 1 ? 'y' : 'ies'}`}
      meter={percentValue(highish, summary.total)}
      meterLabel="Share at high or critical risk"
    />
  );
}

/* ── Risk signals ─────────────────────────────────────────────────────────── */

function SignalsBody({ overview, loading }) {
  if (loading || !overview) return <SignalList rows={[]} loading />;
  const { kpis, activityDataAvailable: activity } = overview;
  const rows = [
    {
      key: 'public',
      label: 'Reachable from the internet',
      rationale: 'Anyone on the internet can reach it, so a leaked credential here can be used from anywhere.',
      count: kpis.publiclyAccessible,
      denominator: kpis.totalIdentities,
      denominatorLabel: 'of identities',
      tone: 'critical',
      to: '/identities?is_publicly_accessible=true',
    },
    {
      key: 'owner',
      label: 'Created outside your normal process',
      rationale: activity
        ? 'Nobody is recorded as its owner or creator, so there is nobody to ask before changing it.'
        : 'No owner tag. The AWS activity log (CloudTrail) could not be read, so creators were not checked.',
      count: kpis.shadowIdentities,
      denominator: kpis.totalIdentities,
      denominatorLabel: 'of identities',
      tone: 'high',
      to: '/identities?shadow=true',
    },
    {
      key: 'orphaned',
      label: 'Credentials not used by any identity',
      rationale: 'No identity is set up to use them, so nobody is responsible for changing (rotating) or removing them.',
      count: kpis.orphanedCredentials,
      denominator: kpis.totalCredentials,
      denominatorLabel: 'of credentials',
      tone: 'high',
      to: '/credentials?is_orphaned=true',
    },
    {
      key: 'stale-identities',
      label: 'Identities unused for 90+ days',
      rationale: activity
        ? 'No recorded activity in the last 90 days, or never used and created over 90 days ago. Candidates for removal.'
        : 'Created over 90 days ago. The AWS activity log could not be read, so use is not counted.',
      count: kpis.staleIdentities,
      denominator: kpis.totalIdentities,
      denominatorLabel: 'of identities',
      tone: 'medium',
      to: '/identities?min_idle_days=90',
    },
    {
      key: 'stale-credentials',
      label: 'Credentials unused for 90+ days',
      rationale: 'No recorded use in the last 90 days, or never used and over 90 days old. Change (rotate) or remove them.',
      count: kpis.staleCredentials,
      denominator: kpis.totalCredentials,
      denominatorLabel: 'of credentials',
      tone: 'medium',
      to: '/credentials?min_idle_days=90',
    },
  ];

  return <SignalList rows={rows} />;
}

/** Of all the actions identities are allowed to take, the share the activity log saw them use. */
function PermissionShare({ overview }) {
  if (!overview) return null;
  const { kpis, activityDataAvailable: activity } = overview;
  const utilisation = kpis.permissionUtilizationPct;
  return (
    <div className="mt-4 border-t border-line pt-3">
      {activity && utilisation !== null ? (
        <div className="flex items-center gap-4">
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-ink">Share of permissions actually used</span>
            <span className="mt-0.5 block text-[11.5px] text-ink-3">
              Of all the actions your identities are allowed to take, the share the AWS activity log (CloudTrail) saw them use.
              The rest is access nobody uses, which could be removed.
            </span>
            <Meter value={Math.min(100, utilisation)} tone="info" height={4} className="mt-2" label="Share of permissions actually used" />
          </span>
          <span data-numeric="" className="w-20 shrink-0 text-right font-display text-[19px] leading-none font-extrabold text-ink">
            {utilisation.toFixed(1)}%
          </span>
        </div>
      ) : (
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          The AWS activity log (CloudTrail) could not be read for these accounts, so the share of permissions used is not
          measured and the 90-day counts go by creation date only.
        </p>
      )}
    </div>
  );
}

/* ── Identity mix ─────────────────────────────────────────────────────────── */

const MIX_VIEWS = [
  { value: 'class', label: 'By purpose' },
  { value: 'type', label: 'By AWS type' },
  { value: 'environment', label: 'By environment' },
  { value: 'account', label: 'By AWS account' },
  { value: 'region', label: 'By region' },
  { value: 'status', label: 'By lifecycle status' },
  { value: 'activity', label: 'Active vs unused 90+ days' },
];

const asIs = (value) => value;

/* Type, environment, account, region and status have no canonical order, so
   hues follow rank and the tail folds into one neutral slice rather than
   inventing an eighth hue. A slice links to the list only where the list API
   has a filter for it (`param`); it has none for account or region. */
function rankedSlices(items, labelOf, param) {
  const sorted = [...items].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 6).map((item, index) => ({
    key: item.key,
    label: labelOf(item.key),
    value: item.value,
    color: SERIES_TOKENS[index],
    to: param ? `/identities?${param}=${encodeURIComponent(item.key)}` : undefined,
  }));
  const rest = sorted.slice(6).reduce((sum, item) => sum + item.value, 0);
  if (rest > 0) head.push({ key: '__other', label: 'Other', value: rest, color: NEUTRAL_SERIES });
  return head;
}

const WHAT_OPTIONS = [
  { value: 'identities', label: 'Identities' },
  { value: 'credentials', label: 'Credentials' },
];

/** What the estate is made of: identities by purpose, type, account...; or credentials by kind. */
function EstateMix({ overview, loading, failed }) {
  const navigate = useNavigate();
  const [what, setWhat] = useState('identities');
  const [view, setView] = useState('class');

  const slices = useMemo(() => {
    if (!overview) return [];
    const { charts } = overview;
    if (what === 'credentials') {
      const kinds = charts.credentialTypes.map((item) => ({ key: item.key, value: item.value }));
      return rankedSlices(kinds, (key) => credentialTypeMeta(key).label, 'credential_type').map((slice) => ({
        ...slice,
        to: slice.to ? slice.to.replace('/identities?', '/credentials?') : undefined,
      }));
    }
    if (view === 'type') return rankedSlices(charts.byType, identityTypeLabel, 'identity_type');
    if (view === 'environment') return rankedSlices(charts.byEnvironment, environmentLabel, 'environment');
    if (view === 'account') return rankedSlices(charts.byAccount, asIs, null);
    if (view === 'region') return rankedSlices(charts.byRegion, asIs, null);
    if (view === 'status') return rankedSlices(charts.byStatus, (value) => lifecycleMeta(value).label, 'status');
    if (view === 'activity') {
      /* Stale is the same 90-day measure as the risk signal, so it opens the same list. */
      return [
        { key: 'active', label: 'Active', value: charts.staleVsActive.active, color: SERIES_TOKENS[0] },
        { key: 'stale', label: 'Unused for 90+ days', value: charts.staleVsActive.stale, color: SERIES_TOKENS[1], to: '/identities?min_idle_days=90' },
      ].filter((item) => item.value > 0);
    }
    return charts.byClass
      .filter((item) => item.value > 0)
      .map((item) => {
        const meta = functionalClassMeta(item.key);
        return {
          key: item.key,
          label: meta.label,
          value: item.value,
          color: meta.color,
          to: `/identities?functional_class=${encodeURIComponent(item.key)}`,
        };
      });
  }, [overview, view, what]);

  const credentials = what === 'credentials';
  const typeCount = overview?.charts.byType.filter((item) => item.value > 0).length ?? 0;

  return (
    <>
      <PanelHeader
        title={credentials ? 'Credential mix' : 'Classification mix'}
        subtitle={
          credentials
            ? 'What your identities sign in with. Select a slice to list those credentials.'
            : typeCount > 0
              ? `${formatNumber(typeCount)} AWS type${typeCount === 1 ? '' : 's'} in all. Select a slice to list those identities.`
              : undefined
        }
        actions={<SegmentedControl label="Show" options={WHAT_OPTIONS} value={what} onChange={setWhat} />}
      />
      {!credentials && (
        <div className="mt-3">
          <Select size="sm" aria-label="Break down by" options={MIX_VIEWS} value={view} onChange={(event) => setView(event.target.value)} />
        </div>
      )}
      <div className="mt-4">
        {loading ? (
          <DonutSkeleton />
        ) : failed ? (
          <Unavailable source="discovery" />
        ) : slices.length === 0 ? (
          <EmptyState
            compact
            title={credentials ? 'No credentials yet' : 'No identities yet'}
            description="Discovery has not found any in the accounts and regions these figures cover."
          />
        ) : (
          <CompositionDonut
            data={slices}
            total={credentials ? overview.kpis.totalCredentials : overview.kpis.totalIdentities}
            centerLabel={credentials ? 'Credentials' : 'Identities'}
            onSelect={(slice) => slice?.to && navigate(slice.to)}
          />
        )}
      </div>
      {!loading && !failed && <PermissionShare overview={overview} />}
    </>
  );
}

/* ── Credential surface ───────────────────────────────────────────────────── */

/** What the identities sign in with, by kind: each row opens the credential list on that kind. */
function CredentialSurface({ overview, loading, failed }) {
  const navigate = useNavigate();
  const rows = [...(overview?.charts.credentialTypes ?? [])].filter((item) => item.value > 0).sort((a, b) => b.value - a.value);
  const total = overview?.kpis.totalCredentials ?? rows.reduce((sum, item) => sum + item.value, 0);
  return (
    <>
      <PanelHeader
        prominence="quiet"
        title="Credential surface"
        actions={
          <Button as={Link} to="/credentials" variant="secondary" size="sm" iconRight={ArrowRight}>
            Inspect
          </Button>
        }
      />
      <div className="mt-3">
        {loading ? (
          <ListSkeleton rows={5} />
        ) : failed ? (
          <Unavailable source="discovery" />
        ) : rows.length === 0 ? (
          <EmptyState compact icon={KeyRound} title="No credentials yet" description="Discovery has not found any in the accounts and regions these figures cover." />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {rows.slice(0, 6).map((item) => {
                const share = total > 0 ? (item.value / total) * 100 : 0;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => navigate(`/credentials?credential_type=${encodeURIComponent(item.key)}`)}
                      className="group grid w-full grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-4 gap-y-1.5 rounded-md px-1 py-2.5 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-ink group-hover:text-brand">{credentialTypeMeta(item.key).label}</span>
                        <span data-numeric="" className="shrink-0 text-[11.5px] text-ink-3">
                          {share.toFixed(1)}%
                        </span>
                      </span>
                      <span data-numeric="" className="row-span-2 text-right text-[15px] font-semibold text-ink">
                        {formatNumber(item.value)}
                      </span>
                      <Meter value={share} height={6} label={`${credentialTypeMeta(item.key).label}: ${share.toFixed(1)}% of credentials`} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <dl className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3.5">
              <div>
                <dt className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Total credentials</dt>
                <dd data-numeric="" className="mt-1 font-display text-[20px] leading-none font-bold text-ink">
                  {formatNumber(total)}
                </dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Distinct types</dt>
                <dd data-numeric="" className="mt-1 font-display text-[20px] leading-none font-bold text-ink">
                  {formatNumber(rows.length)}
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </>
  );
}

/* ── Discovery trend ──────────────────────────────────────────────────────── */

const monthLabel = (value) => {
  const date = parseDate(`${value}T00:00:00Z`) ?? parseDate(value);
  return date ? date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }) : String(value);
};
const dayLabel = (value) => {
  const date = parseDate(`${value}T00:00:00Z`) ?? parseDate(value);
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) : String(value);
};

/* Without three scans, each curve is cumulative by first-seen month, carried
   forward so both read the same month. */
function growthPoints(series) {
  return series.map((point) => ({ label: monthLabel(point.date), subtitle: 'First seen by this month', count: point.count }));
}

/**
 * One chart per measure: identities, CloudTrail events and credentials differ
 * by orders of magnitude, so a shared axis would flatten two of them.
 * Identities and credentials are what each scan counted (or, before three
 * scans, when today's items were first seen); events are per day.
 */
function DiscoveryTrend({ overview, trends, loading, failed }) {
  const fromScans = (trends?.length ?? 0) >= 3;
  const series = useMemo(() => {
    if (!overview) return [];
    const scan = (key) => trends.map((point) => ({ label: formatDate(point.date), subtitle: `Scan finished ${formatDateTime(point.date)}`, count: point[key] }));
    const events = (overview.charts.eventVolume ?? []).map((point) => ({ label: dayLabel(point.date), subtitle: 'Events in the AWS activity log that day', count: point.count }));
    return [
      { key: 'identities', label: 'Identities', color: 'var(--t-series-1)', data: fromScans ? scan('identities') : growthPoints(overview.charts.identityGrowth), note: fromScans ? 'at the last scan' : 'today' },
      overview.activityDataAvailable && events.length > 0
        ? { key: 'events', label: 'CloudTrail events', color: 'var(--t-series-5)', data: events, note: 'on the last day' }
        : null,
      { key: 'credentials', label: 'Credentials', color: 'var(--t-series-2)', data: fromScans ? scan('credentials') : growthPoints(overview.charts.credentialGrowth), note: fromScans ? 'at the last scan' : 'today' },
    ].filter(Boolean);
  }, [overview, trends, fromScans]);
  const drawable = series.filter((entry) => entry.data.length >= 3);

  return (
    <>
      <PanelHeader
        prominence="quiet"
        title="Discovery trend"
        subtitle="One chart per measure: the three differ by orders of magnitude, so a shared axis would flatten two of them."
      />
      <div className="mt-4">
        {loading ? (
          <ChartSkeleton height={240} bars={8} />
        ) : failed ? (
          <Unavailable source="discovery" />
        ) : drawable.length === 0 ? (
          <EmptyState
            compact
            icon={LineChart}
            title="No trend to draw yet"
            description="The chart appears after three discovery scans, or once discoveries span three months."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {drawable.map((entry) => (
              <div key={entry.key}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[12px] font-semibold text-ink-2">{entry.label}</p>
                  <p className="text-[11.5px] text-ink-3" data-numeric="">
                    latest {formatNumber(entry.data[entry.data.length - 1].count)} {entry.note}
                  </p>
                </div>
                <TrendChart data={entry.data} dataKey="count" label={entry.label} color={entry.color} height={96} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Latest API activity ──────────────────────────────────────────────────── */

/**
 * The newest calls across the fleet, with whether the workloads have learned
 * their normal behaviour yet: a call only means something next to a baseline.
 */
function LatestActivity({ query, genome }) {
  const data = query.data;
  const cards = genome.data?.cards;
  const coverage = cards && cards.watched > 0 && cards.established !== null ? Math.round((cards.established / cards.watched) * 100) : null;
  return (
    <>
      <PanelHeader
        prominence="quiet"
        title="Latest API activity"
        actions={
          <Button as={Link} to="/activity" variant="secondary" size="sm" iconRight={ArrowRight}>
            All activity
          </Button>
        }
      />
      {/* Baseline established: how much of the fleet these calls can be judged against. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] border border-line bg-inset px-3.5 py-2.5">
        <ScanEye aria-hidden="true" className="size-4 shrink-0 text-low" />
        {genome.isLoading && !genome.data ? (
          <Skeleton className="h-3 w-48 rounded" />
        ) : cards && cards.established !== null ? (
          <>
            <span className="text-[12.5px] text-ink-2">
              <b data-numeric="" className="font-semibold text-ink">
                {formatNumber(cards.established)}
              </b>{' '}
              of {formatNumber(cards.watched)} watched identities have a baseline established
              {cards.learning ? ` · ${formatNumber(cards.learning)} still learning` : ''}
            </span>
            {coverage !== null && <Meter className="min-w-24 flex-1" value={coverage} tone="low" height={5} label="Share of watched identities with a baseline" />}
            <Link to="/genome" className="text-[12px] font-medium text-brand hover:underline">
              NHI Genome
            </Link>
          </>
        ) : (
          <span className="text-[12.5px] text-ink-3">Baselines are not measured yet for this workspace.</span>
        )}
      </div>
      <div className="mt-3">
        {query.isLoading && !data ? (
          <ListSkeleton rows={5} />
        ) : query.isError && !data ? (
          <InlineError error={query.error} onRetry={query.refetch} label="Latest activity could not be loaded" />
        ) : !data.available ? (
          <EmptyState compact icon={LineChart} title="No activity log data" description="The AWS activity log (CloudTrail) could not be read for these accounts." />
        ) : data.events.length === 0 ? (
          <EmptyState compact icon={LineChart} title="No calls in the last 30 days" description="No identity in these accounts and regions made an AWS call recently." />
        ) : (
          <ol className="flex flex-col">
            {data.events.map((event, index) => {
              const mutating = !event.is_read_only;
              const Icon = mutating ? Pencil : Eye;
              const last = index === data.events.length - 1;
              return (
                <li key={`${event.event_id}-${event.identity.id}`} className="relative flex gap-3 pb-3.5">
                  {!last && <span aria-hidden="true" className="absolute top-9 bottom-0 left-[17px] w-px bg-line" />}
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-full border',
                      mutating ? 'border-high/30 bg-high-soft text-high' : 'border-line bg-surface-2 text-ink-3',
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{event.event_name}</span>
                      <span className="shrink-0 text-[11.5px] text-ink-3" title={formatDateTime(event.event_time)}>
                        {formatRelative(event.event_time)}
                      </span>
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-3">
                      <Link to={`/activity?identity=${encodeURIComponent(event.identity.id)}`} className="font-medium text-brand hover:underline">
                        {event.identity.name}
                      </Link>
                      {event.event_source ? ` · ${event.event_source}` : ''}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-ink-3">
                      {event.source_ip && <span className="font-mono">{event.source_ip}</span>}
                      {event.aws_region && <span>{event.aws_region}</span>}
                      <span className={mutating ? 'font-medium text-high' : ''}>{mutating ? 'Mutating' : 'Read-only'}</span>
                      {event.status === 'error' && <span className="font-medium text-critical">Failed</span>}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}

/* ── Credential exposure ──────────────────────────────────────────────────── */

const RISK_ROWS = [
  { key: 'CRITICAL', label: 'Critical', tone: 'critical' },
  { key: 'HIGH', label: 'High', tone: 'high' },
  { key: 'MEDIUM', label: 'Medium', tone: 'medium' },
  { key: 'LOW', label: 'Low', tone: 'low' },
];

function CredentialExposure({ query, summary }) {
  const max = Math.max(1, ...RISK_ROWS.map((row) => summary.byTier[row.key] || 0));
  const rows = RISK_ROWS.filter((row) => row.key !== 'CRITICAL' || summary.byTier.CRITICAL > 0);
  const platforms = [
    { key: 'github', label: 'GitHub' },
    { key: 'codecommit', label: 'CodeCommit' },
    { key: 'bitbucket', label: 'Bitbucket' },
  ].filter((platform) => platform.key !== 'bitbucket' || summary.byPlatform.bitbucket > 0);
  return (
    <>
      <PanelHeader
        prominence="quiet"
        title="Credential exposure"
        actions={
          <Button as={Link} to="/exposure" variant="secondary" size="sm" iconRight={ArrowRight}>
            Review findings
          </Button>
        }
      />
      <div className="mt-4">
        {query.isLoading && !query.data ? (
          <ListSkeleton rows={4} />
        ) : query.isError && !query.data ? (
          <InlineError error={query.error} onRetry={query.refetch} label="Code findings could not be loaded" />
        ) : summary.total === 0 ? (
          <ClearState compact title="No secrets found in code" description="The scanned repositories hold no exposed credential." />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line">
              {rows.map((row) => (
                <li key={row.key}>
                  <Link to={`/exposure?risk_tier=${row.key}`} className="group grid grid-cols-[5.5rem_minmax(0,1fr)_3rem] items-center gap-4 py-2.5">
                    <Tag tone={row.tone} size="sm" dot className="justify-center">
                      {row.label}
                    </Tag>
                    <Meter value={((summary.byTier[row.key] || 0) / max) * 100} tone={row.tone} height={6} />
                    <span data-numeric="" className="text-right text-[15px] font-semibold text-ink group-hover:text-brand">
                      {formatNumber(summary.byTier[row.key] || 0)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3.5 sm:grid-cols-3">
              {platforms.map((platform) => (
                <div key={platform.key}>
                  <dt className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{platform.label}</dt>
                  <dd data-numeric="" className="mt-1 font-display text-[20px] leading-none font-bold text-ink">
                    {formatNumber(summary.byPlatform[platform.key] || 0)}
                  </dd>
                </div>
              ))}
            </dl>
            {summary.detectors.length > 0 && (
              <div className="mt-3.5 border-t border-line pt-3.5">
                <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Most frequent detectors</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {summary.detectors.slice(0, 4).map((detector) => (
                    <li key={detector.key} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className="truncate text-ink-2">{humanizeToken(detector.key)}</span>
                      <span data-numeric="" className="font-semibold text-ink">
                        {formatNumber(detector.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ── Posture banner ───────────────────────────────────────────────────────── */

/**
 * The posture score leads the dashboard: it is the one number that says how
 * exposed the estate is. Its detail lives on Posture; this says where it
 * stands, which way it is moving, and the single fix that would move it most.
 */
function PostureBanner({ query }) {
  const data = query.data;
  if (query.isError && !data) {
    return <InlineError error={query.error} onRetry={query.refetch} label="Security score could not be loaded" />;
  }
  if (!data) {
    return (
      <Panel prominence="lead" aria-busy="true">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-48 rounded" />
            <Skeleton className="h-3 w-72 rounded" />
          </div>
        </div>
      </Panel>
    );
  }

  if (!data.available) {
    return (
      <Panel prominence="lead" className="animate-rise">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="grid size-[72px] shrink-0 place-items-center rounded-full border-[6px] border-track text-ink-3">
            <Gauge aria-hidden="true" className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Security score (0-100)</p>
            <p className="mt-1 text-[13px] font-semibold text-ink">No score yet</p>
            <p className="mt-0.5 text-[12.5px] text-ink-3">
              This workspace's identities have not been scored yet. The score appears after the next discovery scan is
              scored.
            </p>
          </div>
          <Button as={Link} to="/posture" variant="secondary" size="sm" iconRight={ArrowRight}>
            Open Posture
          </Button>
        </div>
      </Panel>
    );
  }

  const { fleet } = data;
  /* The exact fleet score, shown to one decimal as on Posture (rounding it here made the two pages disagree). */
  const score = fleet.score;
  const weakest = data.pillars.filter((pillar) => pillar.score !== null).sort((a, b) => a.score - b.score)[0];
  const win = [...data.quickWins].sort((a, b) => b.fleetGain - a.fleetGain)[0];
  const delta = fleet.delta === null ? null : Math.round(fleet.delta * 10) / 10;

  const gain = win ? Math.round(win.fleetGain * 10) / 10 : null;

  return (
    <Panel prominence="lead" className="animate-rise">
      <div className="grid items-center gap-x-8 gap-y-5 @min-[44rem]:grid-cols-2 @min-[60rem]:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)_auto]">
        <div className="flex items-center gap-4">
          <ScoreRing score={score} size={76} grade={fleet.grade} />
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Security score (0-100)</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
              <BandTag score={score} />
              {fleet.grade && <span className="font-medium">Grade {fleet.grade}</span>}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[12px] text-ink-3" data-numeric="">
              {delta === null ? (
                <span>First score, nothing to compare with yet</span>
              ) : (
                <>
                  <Delta value={delta} />
                  <span>over {windowPhrase(fleet.changeWindow)}</span>
                </>
              )}
            </p>
            <p className="mt-0.5 text-[11.5px] text-ink-3" data-numeric="">
              Average of {formatNumber(fleet.scored)} {fleet.scored === 1 ? 'identity' : 'identities'}
              {data.computedAt ? (
                <span title={formatDateTime(data.computedAt)}> · scored {formatRelative(data.computedAt)}</span>
              ) : (
                ''
              )}
            </p>
          </div>
        </div>

        <PostureFact label="Weakest security area" className="@min-[60rem]:border-l @min-[60rem]:border-line @min-[60rem]:pl-8">
          {weakest ? (
            <>
              <span className="block truncate text-[14px] font-semibold text-ink">{weakest.name}</span>
              <span className="mt-0.5 block text-[12px] text-ink-3" data-numeric="">
                Averages {Math.round(weakest.score)} of 100
              </span>
            </>
          ) : (
            <span className="text-[12.5px] text-ink-3">No area scores yet</span>
          )}
        </PostureFact>

        <PostureFact label="Fix that helps most" className="@min-[60rem]:border-l @min-[60rem]:border-line @min-[60rem]:pl-8">
          {win ? (
            <>
              <span className="line-clamp-2 text-[13.5px] leading-snug font-semibold text-ink" title={win.title}>
                {win.title}
              </span>
              <span className="mt-0.5 block text-[12px] text-ink-3" data-numeric="">
                <span className="font-semibold text-low">+{gain}</span> to the overall score · fixes {formatNumber(win.identities)}{' '}
                {win.identities === 1 ? 'identity' : 'identities'}
              </span>
            </>
          ) : (
            <span className="text-[12.5px] text-ink-3">Nothing left to fix</span>
          )}
        </PostureFact>

        <div className="@min-[44rem]:justify-self-start @min-[60rem]:justify-self-end">
          <Button as={Link} to="/posture#quick-wins" variant="secondary" size="sm" iconRight={ArrowRight}>
            See what to fix
          </Button>

        </div>
      </div>
    </Panel>
  );
}

function PostureFact({ label, className, children }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
