import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Radar, ShieldAlert, Waypoints } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, PanelHeader } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { TrendChart } from '../../charts/TrendChart';
import { personName, recordPath, useView } from '../../data/store';
import { PROVIDERS, SLA_DAYS, SOURCE_PROVIDERS } from '../../data/world';
import { genomeFor } from '../../data/genome';
import { AppLogo, IdentityLogo } from '../../components/Logo';
import { Avatar, JiraStatus, SeverityGlyph, SeverityTag, Time } from '../../components/bits';
import { TicketLink } from '../../components/collab';
import { formatNumber } from '../../lib/format';
import { cn } from '../../ui/cn';
import { findAttackPaths } from '../access/paths';

const SEVS = ['critical', 'high', 'medium', 'low'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Kpi({ to, label, value, caption, tone }) {
  return (
    <Link to={to} className="group flex flex-col rounded-[10px] border border-line bg-surface p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-[var(--t-shadow-md)]">
      <span className="flex items-center justify-between text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">
        {label}
        <ArrowUpRight aria-hidden="true" className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span data-numeric="" className={cn('mt-2.5 text-[28px] leading-none font-semibold tracking-[-0.03em]', tone === 'bad' ? 'text-critical' : 'text-ink')}>{value}</span>
      <span className="mt-2 text-[12px] text-ink-3">{caption}</span>
    </Link>
  );
}

export default function OverviewPage() {
  const view = useView();
  const navigate = useNavigate();
  const first = view.me?.name?.split(' ')[0];

  const m = useMemo(() => {
    const now = Date.now();
    const open = view.findings.filter((f) => f.status === 'open' || f.status === 'in_progress');
    const overdue = open.filter((f) => Date.parse(f.dueAt) < now);
    const resolved = view.findings.filter((f) => f.status === 'resolved' && f.resolvedAt && (f.severity === 'critical' || f.severity === 'high'));
    const mttr = resolved.length ? resolved.reduce((s, f) => s + Math.max(0.5, (Date.parse(f.resolvedAt) - Date.parse(f.firstSeenAt)) / 864e5), 0) / resolved.length : null;
    const sla = SEVS.map((sev) => {
      const list = open.filter((f) => f.severity === sev);
      return { sev, open: list.length, overdue: list.filter((f) => Date.parse(f.dueAt) < now).length };
    });
    const leaksOpen = view.exposures.filter((x) => x.status === 'open');
    return {
      open,
      overdue,
      mttr,
      sla,
      leaksOpen,
      leaksLive: leaksOpen.filter((x) => x.validated === 'live').length,
      detOpen: view.detections.filter((d) => d.status === 'new' || d.status === 'investigating'),
      detNew: view.detections.filter((d) => d.status === 'new').length,
      lastSync: view.connections.map((c) => c.lastSyncAt).filter(Boolean).sort().at(-1),
      sources: view.connections.filter((c) => SOURCE_PROVIDERS.includes(c.provider)).length,
    };
  }, [view]);

  /* What needs a decision: new detections and live leaks one by one, findings grouped by check. */
  const decisions = useMemo(() => {
    const items = [];
    view.detections.filter((d) => d.status === 'new').forEach((d) => {
      const i = view.idById.get(d.identityId);
      items.push({ key: d.id, sev: d.severity, title: d.title, meta: `Detection · ${i?.name}`, at: d.detectedAt, to: recordPath({ kind: 'detection', id: d.id }), icon: <IdentityLogo type={i?.type} size={30} />, ticketKey: d.ticketKey });
    });
    m.leaksOpen.filter((x) => x.validated === 'live').forEach((x) => items.push({ key: x.id, sev: x.visibility === 'public' ? 'critical' : 'high', title: `Working secret committed to ${x.repo}`, meta: `Leaked secret · ${x.author}`, at: x.detectedAt, to: recordPath({ kind: 'exposure', id: x.id }), icon: <AppLogo name={PROVIDERS[x.provider].logo} size={30} />, ticketKey: x.ticketKey }));
    const groups = new Map();
    for (const f of m.open.filter((x) => x.severity === 'critical')) {
      const g = groups.get(f.ruleId) || { f, n: 0, overdue: 0, providers: new Set() };
      g.n += 1;
      if (Date.parse(f.dueAt) < Date.now()) g.overdue += 1;
      g.providers.add(f.provider);
      groups.set(f.ruleId, g);
    }
    for (const [ruleId, g] of groups) {
      items.push({
        key: ruleId,
        sev: 'critical',
        title: g.n === 1 ? g.f.title : `${g.f.title}: ${g.n} identities`,
        meta: `Finding${g.overdue ? ` · ${g.overdue} past the ${SLA_DAYS.critical}-day SLA` : ''}`,
        at: g.f.firstSeenAt,
        to: `/findings?rule=${ruleId}`,
        icon: <span className="flex -space-x-1.5">{[...g.providers].slice(0, 3).map((p) => <AppLogo key={p} name={PROVIDERS[p].logo} size={22} />)}</span>,
        overdue: g.overdue,
      });
    }
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return items.sort((a, b) => order[a.sev] - order[b.sev] || Date.parse(b.at) - Date.parse(a.at)).slice(0, 7);
  }, [view, m]);

  const byProvider = SOURCE_PROVIDERS.map((p) => {
    const ids = view.identities.filter((i) => i.provider === p);
    const f = m.open.filter((x) => x.provider === p);
    return { p, conns: view.connections.filter((c) => c.provider === p).length, identities: ids.length, critical: f.filter((x) => x.severity === 'critical').length, overdue: f.filter((x) => Date.parse(x.dueAt) < Date.now()).length, stale: ids.filter((i) => i.status === 'stale').length };
  });
  const genome = useMemo(() => {
    const c = { established: 0, learning: 0, drifting: 0, dormant: 0 };
    for (const i of view.identities) c[genomeFor(i, view).status] += 1;
    return c;
  }, [view]);
  const paths = useMemo(() => findAttackPaths(view).slice(0, 3), [view]);
  const trend = view.scoreHistory.map((d) => ({ ...d, label: new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) }));
  const delta = view.score - view.scoreHistory.at(-8).score;
  const jira = ['To Do', 'In Progress', 'In Review', 'Done'].map((s) => ({ s, n: view.tickets.filter((t) => t.status === s).length }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${greeting()}${first ? `, ${first}` : ''}`}
        lede={<>{formatNumber(view.identities.length)} machine identities across {m.sources} connected accounts, organizations and clusters. {m.lastSync && <>Last synced <Time at={m.lastSync} />.</>}</>}
        actions={
          <>
            <Button as={Link} to="/detections" variant="secondary" icon={Radar}>Triage detections</Button>
            <Button as={Link} to="/findings" variant="primary" icon={ShieldAlert}>Review findings</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 @min-[64rem]:grid-cols-5">
        <Kpi to="/findings" label="Posture score" value={view.score} caption={delta === 0 ? 'No change in 7 days' : `${delta > 0 ? '+' : ''}${delta} in 7 days`} />
        <Kpi to="/findings?view=overdue" label="Past SLA" value={m.overdue.length} tone={m.overdue.length ? 'bad' : ''} caption={`of ${m.open.length} open findings`} />
        <Kpi to="/findings?view=closed" label="Time to fix" value={m.mttr === null ? '-' : `${m.mttr < 10 ? m.mttr.toFixed(1) : Math.round(m.mttr)}d`} caption="Mean, critical and high" />
        <Kpi to="/detections" label="Open detections" value={m.detOpen.length} caption={`${m.detNew} not yet triaged`} />
        <Kpi to="/exposure" label="Leaked secrets" value={m.leaksOpen.length} tone={m.leaksLive ? 'bad' : ''} caption={`${m.leaksLive} still working`} />
      </div>

      <div className="grid gap-4 @min-[72rem]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Needs a decision" subtitle="New detections, working leaked secrets, and critical findings grouped by check." />
          <ul className="mt-2 divide-y divide-line">
            {decisions.map((a) => (
              <li key={a.key}>
                <button type="button" onClick={() => navigate(a.to)} className="group flex w-full items-center gap-3 py-3 text-left">
                  <span className="grid w-[52px] shrink-0 place-items-center">{a.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-ink group-hover:underline">{a.title}</span>
                    <span className={cn('mt-0.5 block truncate text-[12px]', a.overdue ? 'text-critical' : 'text-ink-3')}>{a.meta} · <Time at={a.at} /></span>
                  </span>
                  {a.ticketKey ? <TicketLink ticketKey={a.ticketKey} compact /> : <SeverityTag severity={a.sev} />}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title="Team activity" subtitle="Everyone in the workspace sees this as it happens." actions={<Button as={Link} to="/audit-log" variant="ghost" size="sm">Audit log</Button>} />
          <ol className="mt-3 space-y-3.5">
            {view.activity.slice(0, 8).map((a) => (
              <li key={a.id} className="animate-fade flex gap-3">
                <Avatar refId={a.actor} size={26} />
                <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
                  <p className="text-ink-2"><span className="font-medium text-ink">{personName(a.actor, view)}</span> {a.verb} <Link to={recordPath(a.target)} className="text-ink hover:underline">{a.text}</Link></p>
                  <Time at={a.at} className="text-[11.5px] text-ink-3" />
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Estate by application" subtitle="Where the open work sits." actions={<Button as={Link} to="/integrations" variant="ghost" size="sm" iconRight={ArrowRight}>Integrations</Button>} />
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line @min-[44rem]:grid-cols-3 @min-[58rem]:grid-cols-5">
          {byProvider.map((b) => (
            <Link key={b.p} to={`/identities?provider=${b.p}`} className="bg-surface p-4 transition-colors hover:bg-surface-2">
              <span className="flex items-center gap-2.5">
                <AppLogo name={PROVIDERS[b.p].logo} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{PROVIDERS[b.p].short}</span>
                  <span className="block text-[11.5px] text-ink-3">{b.conns} {PROVIDERS[b.p].unit}{b.conns === 1 ? '' : 's'}</span>
                </span>
              </span>
              <span data-numeric="" className="mt-4 block text-[24px] leading-none font-semibold tracking-[-0.03em] text-ink">{b.identities}</span>
              <span className="mt-1 block text-[11.5px] text-ink-3">identities</span>
              <span className="mt-3 flex gap-3 text-[11.5px]">
                <span className={b.critical ? 'text-critical' : 'text-ink-3'}>{b.critical} critical</span>
                <span className={b.overdue ? 'text-ink' : 'text-ink-3'}>{b.overdue} past SLA</span>
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 @min-[72rem]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Posture score, 90 days" subtitle="Weighted by open findings; a critical counts six times a medium." />
          <TrendChart className="mt-3" data={trend} dataKey="score" label="Score" height={200} yDomain={[30, 100]} color="var(--t-ink)" />
        </Panel>
        <Panel>
          <PanelHeader title="Remediation SLA" subtitle={`Critical ${SLA_DAYS.critical} days · high ${SLA_DAYS.high} · medium ${SLA_DAYS.medium} · low ${SLA_DAYS.low}`} />
          <table className="mt-3 w-full text-[12.5px]">
            <thead className="text-[11px] tracking-[0.05em] text-ink-3 uppercase">
              <tr><th className="py-2 text-left font-medium">Severity</th><th className="py-2 text-right font-medium">Open</th><th className="py-2 text-right font-medium">Past SLA</th><th className="w-28 py-2 pl-4 text-left font-medium">On track</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {m.sla.map((r) => (
                <tr key={r.sev}>
                  <td className="py-2.5"><SeverityTag severity={r.sev} /></td>
                  <td data-numeric="" className="py-2.5 text-right text-ink">{r.open}</td>
                  <td data-numeric="" className={cn('py-2.5 text-right', r.overdue ? 'font-medium text-critical' : 'text-ink-3')}>{r.overdue}</td>
                  <td className="py-2.5 pl-4"><span className="block h-1.5 overflow-hidden rounded-full bg-critical-soft"><span className="block h-full rounded-full bg-ink/70" style={{ width: `${r.open ? ((r.open - r.overdue) / r.open) * 100 : 100}%` }} /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid gap-4 @min-[72rem]:grid-cols-3">
        <Panel className="@min-[72rem]:col-span-1">
          <PanelHeader title="NHI Genome" subtitle="Behavioural baselines across the estate." actions={<Button as={Link} to="/genome" variant="ghost" size="sm">Open</Button>} />
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {[['Established', genome.established], ['Learning', genome.learning], ['Drifting', genome.drifting], ['Dormant', genome.dormant]].map(([l, n]) => (
              <Link key={l} to="/genome" className="rounded-[8px] border border-line p-3 hover:border-line-strong">
                <dt className="text-[11.5px] text-ink-3">{l}</dt>
                <dd data-numeric="" className={cn('mt-1 text-[20px] font-semibold', l === 'Drifting' && n ? 'text-critical' : 'text-ink')}>{n}</dd>
              </Link>
            ))}
          </dl>
        </Panel>
        <Panel>
          <PanelHeader title="Attack paths" subtitle="One stolen credential leading into another system." actions={<Button as={Link} to="/access-graph" variant="ghost" size="sm" icon={Waypoints}>Explore</Button>} />
          <ul className="mt-3 space-y-2">
            {paths.map((p) => (
              <li key={p.id}>
                <Link to={`/access-graph/${p.start.id}`} className="block rounded-[8px] border border-line p-3 hover:border-line-strong">
                  <span className="flex items-center gap-1.5">
                    {p.hops.map((h, k) => (
                      <span key={h.id} className="inline-flex min-w-0 items-center gap-1.5">
                        {k > 0 && <ArrowRight aria-hidden="true" className="size-3 shrink-0 text-ink-3" />}
                        <IdentityLogo type={h.type} size={18} />
                      </span>
                    ))}
                    <SeverityGlyph severity={p.severity} className="ml-auto text-critical" />
                  </span>
                  <span className="mt-1.5 block truncate text-[12.5px] font-medium text-ink">{p.start.name} → {p.end.name}</span>
                  <span className="block truncate text-[11.5px] text-ink-3">{p.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title={<span className="inline-flex items-center gap-2"><AppLogo name="jira" size={18} />Jira · SEC</span>} subtitle="Issues raised from the console." actions={<Button as={Link} to="/tickets" variant="ghost" size="sm">Board</Button>} />
          <ul className="mt-3 divide-y divide-line">
            {jira.map((j) => (
              <li key={j.s} className="flex items-center justify-between py-2.5"><JiraStatus status={j.s} /><span data-numeric="" className="text-[14px] font-semibold text-ink">{j.n}</span></li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
