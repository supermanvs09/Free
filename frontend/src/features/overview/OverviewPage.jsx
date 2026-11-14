import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, FileWarning, Fingerprint, KeyRound, Radar, ShieldAlert, Waypoints } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, PanelHeader } from '../../ui/Panel';
import { MetricTile } from '../../ui/Stat';
import { Button } from '../../ui/Button';
import { TrendChart } from '../../charts/TrendChart';
import { personName, recordPath, useView } from '../../data/store';
import { IDENTITY_TYPES, PROVIDERS, SOURCE_PROVIDERS } from '../../data/world';
import { AppLogo, IdentityLogo } from '../../components/Logo';
import { Avatar, JiraStatus, ScoreRing, SeverityGlyph, SeverityTag, StatusPill, Time } from '../../components/bits';
import { TicketLink } from '../../components/collab';
import { formatNumber } from '../../lib/format';
import { cn } from '../../ui/cn';
import { findAttackPaths } from '../access/paths';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const view = useView();
  const navigate = useNavigate();
  const first = view.me?.name?.split(' ')[0];

  const stats = useMemo(() => {
    const openF = view.findings.filter((f) => f.status === 'open' || f.status === 'in_progress');
    const lastSync = view.connections.map((c) => c.lastSyncAt).filter(Boolean).sort().at(-1);
    return {
      identities: view.identities.length,
      newThisWeek: view.identities.filter((i) => Date.now() - Date.parse(i.createdAt) < 30 * 864e5).length,
      critical: openF.filter((f) => f.severity === 'critical').length,
      high: openF.filter((f) => f.severity === 'high').length,
      detections: view.detections.filter((d) => d.status === 'new' || d.status === 'investigating').length,
      newDetections: view.detections.filter((d) => d.status === 'new').length,
      liveLeaks: view.exposures.filter((x) => x.status === 'open' && x.validated === 'live').length,
      stale: view.identities.filter((i) => i.status === 'stale').length,
      overdue: view.credentials.filter((c) => c.rotationDays && c.ageDays > c.rotationDays && c.status === 'active').length,
      noExpiry: view.credentials.filter((c) => !c.expiresAt && /pat|token|secretid|apppassword/.test(c.type) && c.status === 'active').length,
      lastSync,
    };
  }, [view]);

  const attention = useMemo(() => {
    const items = [];
    view.detections.filter((d) => d.status === 'new').forEach((d) => items.push({ kind: 'detection', id: d.id, sev: d.severity, title: d.title, who: view.idById.get(d.identityId), at: d.detectedAt, label: 'Detection', ticketKey: d.ticketKey }));
    view.exposures.filter((x) => x.status === 'open' && x.validated === 'live').forEach((x) => items.push({ kind: 'exposure', id: x.id, sev: x.visibility === 'public' ? 'critical' : 'high', title: `Live secret in ${x.repo}`, who: view.idById.get(x.identityId), at: x.detectedAt, label: 'Leaked secret', ticketKey: x.ticketKey, logo: PROVIDERS[x.provider].logo }));
    view.findings.filter((f) => f.status === 'open' && f.severity === 'critical').slice(0, 6).forEach((f) => items.push({ kind: 'finding', id: f.id, sev: f.severity, title: f.title, who: view.idById.get(f.identityId), at: f.firstSeenAt, label: 'Finding', ticketKey: f.ticketKey }));
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return items.sort((a, b) => order[a.sev] - order[b.sev] || Date.parse(b.at) - Date.parse(a.at)).slice(0, 7);
  }, [view]);

  const byProvider = useMemo(
    () =>
      SOURCE_PROVIDERS.map((p) => {
        const ids = view.identities.filter((i) => i.provider === p);
        const f = view.findings.filter((x) => x.provider === p && (x.status === 'open' || x.status === 'in_progress'));
        return {
          p,
          conns: view.connections.filter((c) => c.provider === p).length,
          identities: ids.length,
          critical: f.filter((x) => x.severity === 'critical').length,
          high: f.filter((x) => x.severity === 'high').length,
          stale: ids.filter((i) => i.status === 'stale').length,
          creds: view.credentials.filter((c) => c.provider === p && c.status === 'active').length,
          risk: ids.length ? Math.round(ids.reduce((s, i) => s + i.risk, 0) / ids.length) : 0,
          levels: ['critical', 'high', 'medium', 'low'].map((l) => ids.filter((i) => i.riskLevel === l).length),
        };
      }),
    [view],
  );

  const paths = useMemo(() => findAttackPaths(view).slice(0, 3), [view]);
  const trend = view.scoreHistory.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) }));
  const delta = view.score - view.scoreHistory.at(-8).score;
  const jira = ['To Do', 'In Progress', 'In Review', 'Done'].map((s) => ({ s, n: view.tickets.filter((t) => t.status === s).length }));
  const mine = view.tickets.filter((t) => t.assignee === view.me?.ref && t.status !== 'Done');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${greeting()}${first ? `, ${first}` : ''}`}
        lede={
          <>
            {formatNumber(stats.identities)} machine identities across {view.connections.filter((c) => SOURCE_PROVIDERS.includes(c.provider)).length} connected accounts, organizations and clusters.{' '}
            {stats.lastSync && <>Last synced <Time at={stats.lastSync} />.</>}
          </>
        }
        actions={
          <>
            <Button as={Link} to="/detections" variant="secondary" icon={Radar}>Triage detections</Button>
            <Button as={Link} to="/findings" variant="primary" icon={ShieldAlert}>Review findings</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 @min-[64rem]:grid-cols-[1.25fr_1fr_1fr_1fr_1fr]">
        <Panel prominence="lead" className="col-span-2 flex items-center gap-4 @min-[64rem]:col-span-1" flush>
          <div className="flex w-full items-center gap-4 p-4">
            <ScoreRing value={view.score} size={74} stroke={7} label="Posture score" />
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold tracking-[0.085em] text-ink-3 uppercase">Posture score</p>
              <p className="mt-1 text-[13px] text-ink-2">
                {delta === 0 ? 'No change in 7 days' : <><span className={cn('font-semibold', delta > 0 ? 'text-low' : 'text-critical')}>{delta > 0 ? '+' : ''}{delta}</span> in 7 days</>}
              </p>
              <Link to="/findings" className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
                {stats.critical + stats.high} critical and high open <ArrowRight aria-hidden="true" className="size-3" />
              </Link>
            </div>
          </div>
        </Panel>
        <MetricTile as={Link} to="/identities" label="Machine identities" value={stats.identities} caption={`${stats.newThisWeek} new in 30 days · ${stats.stale} stale`} icon={Fingerprint} tone="brand" />
        <MetricTile as={Link} to="/findings" label="Critical findings" value={stats.critical} caption={`${stats.high} high severity open`} icon={ShieldAlert} tone="critical" />
        <MetricTile as={Link} to="/detections" label="Active detections" value={stats.detections} caption={`${stats.newDetections} not yet triaged`} icon={Radar} tone="high" />
        <MetricTile as={Link} to="/exposure" label="Live leaked secrets" value={stats.liveLeaks} caption={`${stats.overdue} credentials past rotation`} icon={FileWarning} tone="medium" />
      </div>

      <div className="grid gap-4 @min-[72rem]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Panel prominence="lead">
          <PanelHeader prominence="lead" title="Needs attention now" subtitle="Ranked by severity, then by how recently it started." actions={<Button as={Link} to="/detections" variant="ghost" size="sm" iconRight={ArrowRight}>All detections</Button>} />
          <ul className="mt-3 divide-y divide-line">
            {attention.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => navigate(recordPath({ kind: a.kind, id: a.id }))} className="group flex w-full items-center gap-3 py-3 text-left">
                  <span className={cn('h-9 w-1 shrink-0 rounded-full', { critical: 'bg-critical', high: 'bg-high', medium: 'bg-medium', low: 'bg-low' }[a.sev])} aria-hidden="true" />
                  {a.who ? <IdentityLogo type={a.who.type} size={32} /> : <AppLogo name={a.logo} size={32} />}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink group-hover:text-brand">{a.title}</span>
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
                      <span className="shrink-0">{a.label}</span>·<span className="truncate">{a.who?.name}</span>·<Time at={a.at} className="shrink-0" />
                    </span>
                  </span>
                  {a.ticketKey ? <TicketLink ticketKey={a.ticketKey} compact /> : <SeverityTag severity={a.sev} />}
                  <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader title="Team activity" subtitle="Live. Everyone in the workspace sees the same feed." actions={<Button as={Link} to="/audit-log" variant="ghost" size="sm">Audit log</Button>} />
          <ol className="relative mt-3 space-y-3.5 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-line">
            {view.activity.slice(0, 8).map((a) => (
              <li key={a.id} className="animate-fade relative flex gap-3">
                <Avatar refId={a.actor} size={27} ring />
                <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
                  <p className="text-ink-2">
                    <span className="font-semibold text-ink">{personName(a.actor, view)}</span> {a.verb}{' '}
                    <Link to={recordPath(a.target)} className="text-ink hover:text-brand hover:underline">{a.text}</Link>
                  </p>
                  <Time at={a.at} className="text-[11px] text-ink-3" />
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Estate by application" subtitle="Every connected source, with the risk it carries. Select one to see its identities." actions={<Button as={Link} to="/integrations" variant="ghost" size="sm" iconRight={ArrowRight}>Integrations</Button>} />
        <div className="mt-4 grid grid-cols-2 gap-3 @min-[44rem]:grid-cols-3 @min-[58rem]:grid-cols-5">
          {byProvider.map((b) => (
            <Link key={b.p} to={`/identities?provider=${b.p}`} className="group rounded-[12px] border border-line bg-surface-2 p-3.5 transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-line-strong hover:shadow-md">
              <div className="flex items-center gap-2.5">
                <AppLogo name={PROVIDERS[b.p].logo} size={34} />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{PROVIDERS[b.p].short}</p>
                  <p className="text-[11.5px] text-ink-3">{b.conns} {PROVIDERS[b.p].unit}{b.conns === 1 ? '' : 's'}</p>
                </div>
              </div>
              <p className="mt-3 flex items-baseline gap-1.5">
                <span data-numeric="" className="font-display text-[26px] leading-none font-extrabold tracking-[-0.03em] text-ink">{b.identities}</span>
                <span className="text-[12px] text-ink-3">identities</span>
              </p>
              <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-track" title="Identities by risk: critical, high, medium, low">
                {b.levels.map((n, k) => (
                  <span key={k} style={{ width: `${(n / Math.max(1, b.identities)) * 100}%` }} className={['bg-critical', 'bg-high', 'bg-medium', 'bg-low'][k]} />
                ))}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-1 text-[11px]">
                <div><dt className="text-ink-3">Critical</dt><dd data-numeric="" className={cn('text-[13px] font-semibold', b.critical ? 'text-critical' : 'text-ink')}>{b.critical}</dd></div>
                <div><dt className="text-ink-3">High</dt><dd data-numeric="" className={cn('text-[13px] font-semibold', b.high ? 'text-high' : 'text-ink')}>{b.high}</dd></div>
                <div><dt className="text-ink-3">Stale</dt><dd data-numeric="" className="text-[13px] font-semibold text-ink">{b.stale}</dd></div>
              </dl>
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 @min-[72rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Posture score, 90 days" subtitle="Weighted by open findings: a critical costs six times a medium." />
          <TrendChart className="mt-3" data={trend} dataKey="score" label="Score" height={196} yDomain={[40, 100]} color="var(--t-series-1)" />
        </Panel>
        <Panel>
          <PanelHeader title="Cross-application attack paths" subtitle="Where one leaked credential leads into another system." actions={<Button as={Link} to="/access-graph" variant="ghost" size="sm" icon={Waypoints}>Explore</Button>} />
          <ul className="mt-3 space-y-2.5">
            {paths.map((p) => (
              <li key={p.id}>
                <Link to={`/access-graph/${p.start.id}`} className="block rounded-[10px] border border-line p-3 transition-colors hover:border-line-strong hover:bg-surface-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {p.hops.map((h, k) => (
                      <span key={h.id} className="inline-flex items-center gap-1.5">
                        {k > 0 && <ArrowRight aria-hidden="true" className="size-3.5 text-ink-3" />}
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-ink">
                          <IdentityLogo type={h.type} size={18} />
                          <span className="max-w-36 truncate">{h.name}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-3">
                    <SeverityGlyph severity={p.severity} className={p.severity === 'critical' ? 'text-critical' : 'text-high'} />
                    {p.summary}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 @min-[72rem]:grid-cols-3">
        <Panel>
          <PanelHeader title="Credential hygiene" subtitle="Active long-lived secrets by age." actions={<Button as={Link} to="/credentials" variant="ghost" size="sm" icon={KeyRound}>Credentials</Button>} />
          <CredentialAges view={view} />
          <p className="mt-3 text-[12px] text-ink-3"><span className="font-semibold text-ink">{stats.noExpiry}</span> tokens never expire · <span className="font-semibold text-ink">{stats.overdue}</span> past their rotation policy</p>
        </Panel>
        <Panel>
          <PanelHeader title={<span className="inline-flex items-center gap-2"><AppLogo name="jira" size={20} />Jira · SEC</span>} subtitle="Issues raised from the console." actions={<Button as={Link} to="/tickets" variant="ghost" size="sm">Board</Button>} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {jira.map((j) => (
              <Link key={j.s} to="/tickets" className="rounded-[10px] border border-line p-2.5 hover:border-line-strong">
                <span className="flex items-center justify-between gap-2"><JiraStatus status={j.s} className="text-[10px]" /><span data-numeric="" className="font-display text-[20px] leading-none font-extrabold text-ink">{j.n}</span></span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-[12px] font-semibold text-ink-2">Assigned to you</p>
          <ul className="mt-1.5 space-y-1.5">
            {mine.length === 0 && <li className="text-[12.5px] text-ink-3">Nothing assigned to you.</li>}
            {mine.slice(0, 3).map((t) => (
              <li key={t.key}><Link to={`/tickets?open=${t.key}`} className="flex items-center gap-2 text-[12.5px] hover:text-brand"><span className="font-semibold text-ink-2">{t.key}</span><span className="truncate text-ink">{t.summary}</span></Link></li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Identity mix" subtitle="What kinds of non-human identity you run." />
          <TypeMix view={view} />
        </Panel>
      </div>
    </div>
  );
}

function CredentialAges({ view }) {
  const active = view.credentials.filter((c) => c.status === 'active' && !['aws.session', 'vault.lease', 'azure.federated'].includes(c.type));
  const buckets = [
    ['Under 30 days', (c) => c.ageDays < 30, 'var(--t-low)'],
    ['30 – 90 days', (c) => c.ageDays >= 30 && c.ageDays < 90, 'var(--t-series-1)'],
    ['90 days – 1 year', (c) => c.ageDays >= 90 && c.ageDays < 365, 'var(--t-medium)'],
    ['Over 1 year', (c) => c.ageDays >= 365, 'var(--t-critical)'],
  ].map(([label, test, color]) => ({ label, n: active.filter(test).length, color }));
  const max = Math.max(1, ...buckets.map((b) => b.n));
  return (
    <ul className="mt-4 space-y-2.5">
      {buckets.map((b) => (
        <li key={b.label} className="grid grid-cols-[110px_1fr_32px] items-center gap-3 text-[12.5px]">
          <span className="text-ink-2">{b.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-track"><span className="block h-full rounded-full" style={{ width: `${(b.n / max) * 100}%`, background: b.color }} /></span>
          <span data-numeric="" className="text-right font-semibold text-ink">{b.n}</span>
        </li>
      ))}
    </ul>
  );
}

function TypeMix({ view }) {
  const counts = new Map();
  for (const i of view.identities) counts.set(i.type, (counts.get(i.type) || 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <ul className="mt-3 space-y-2">
      {rows.map(([type, n]) => (
        <li key={type}>
          <Link to={`/identities?type=${type}`} className="grid grid-cols-[20px_minmax(0,1fr)_80px_28px] items-center gap-2.5 text-[12.5px] hover:text-brand">
            <IdentityLogo type={type} size={20} />
            <span className="truncate text-ink-2">{IDENTITY_TYPES[type].label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-track"><span className="block h-full rounded-full bg-[var(--t-ramp-4)]" style={{ width: `${(n / max) * 100}%` }} /></span>
            <span data-numeric="" className="text-right font-semibold text-ink">{n}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
