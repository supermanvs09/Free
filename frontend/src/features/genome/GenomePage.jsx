import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Check, ExternalLink, GraduationCap } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, PanelHeader, SectionLabel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { SearchInput } from '../../ui/Field';
import { SegmentedControl } from '../../ui/Tabs';
import { EmptyState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { actions, useView } from '../../data/store';
import { ANCHOR, DAY, IDENTITY_TYPES, PROVIDERS, SOURCE_PROVIDERS } from '../../data/world';
import { changeSummary, genomeFor, LEARNING_DAYS, TRAIT_LABEL, WEEKDAYS } from '../../data/genome';
import { IdentityLogo } from '../../components/Logo';
import { PersonName, SeverityTag, StatusPill, Time } from '../../components/bits';
import { ProviderFilter } from '../../components/listkit';
import { formatNumber } from '../../lib/format';
import { cn } from '../../ui/cn';

const STATE = {
  established: ['Established', 'bg-low-soft text-low'],
  learning: ['Learning', 'bg-surface-3 text-ink-2'],
  drifting: ['Drifting', 'bg-critical-soft text-critical'],
  dormant: ['Dormant', 'bg-surface-3 text-ink-3'],
};
export function GenomeState({ status }) {
  const [label, cls] = STATE[status] || STATE.dormant;
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium', cls)}>{label}</span>;
}
const dayLabel = (k) => new Date(ANCHOR - (29 - k) * DAY).toLocaleDateString([], { month: 'short', day: 'numeric' });
const scoreTone = (s) => (s >= 85 ? 'text-critical' : s >= 70 ? 'text-high' : s >= 50 ? 'text-medium' : 'text-ink-3');

export default function GenomePage() {
  const { id } = useParams();
  const view = useView();
  if (id) {
    const i = view.idById.get(id);
    return i ? <GenomeIdentityPage identity={i} /> : <Panel className="mt-4"><EmptyState title="This identity is no longer in the estate" action={<Button as={Link} to="/genome" size="sm" variant="primary">Back to NHI Genome</Button>} /></Panel>;
  }
  return <GenomeOverview />;
}

function GenomeOverview() {
  const view = useView();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('');
  const [tab, setTab] = useState('changes');

  const genomes = useMemo(() => view.identities.map((i) => ({ i, g: genomeFor(i, view) })), [view]);
  const counts = useMemo(() => {
    const c = { established: 0, learning: 0, drifting: 0, dormant: 0 };
    for (const { g } of genomes) c[g.status] += 1;
    return c;
  }, [genomes]);
  const triaged = view.detections.filter((d) => d.status !== 'new');
  const precision = triaged.length ? Math.round((triaged.filter((d) => d.status !== 'false_positive').length / triaged.length) * 100) : null;

  /* How many identities sat outside their own range, day by day. */
  const estate = useMemo(
    () => Array.from({ length: 30 }, (_, k) => ({ label: dayLabel(k), outside: genomes.filter(({ g }) => g.daily[k] >= 70 || g.deviations.some((d) => d.day === k)).length, alerts: view.detections.filter((d) => 29 - Math.floor((ANCHOR - Date.parse(d.detectedAt)) / DAY) === k).length })),
    [genomes, view.detections],
  );

  const filtered = genomes.filter(({ i }) => (!provider || i.provider === provider) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const changes = filtered.filter(({ g }) => g.deviations.length).sort((a, b) => b.g.score - a.g.score);
  const learning = filtered.filter(({ g }) => g.status === 'learning').sort((a, b) => b.g.observedDays - a.g.observedDays);
  const all = [...filtered].sort((a, b) => b.g.score - a.g.score);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="NHI Genome"
        lede={`Each identity's behaviour, learned from its own activity and compared with identities like it. After ${LEARNING_DAYS} days of data it has a baseline; leaving it raises a detection.`}
      />
      <div className="grid grid-cols-2 gap-3 @min-[60rem]:grid-cols-5">
        {[
          ['Modelled', genomes.length - counts.dormant, 'identities with activity'],
          ['Established', counts.established, 'stable baselines'],
          ['Learning', counts.learning, `under ${LEARNING_DAYS} days of data`],
          ['Behaviour changed', counts.drifting, 'with an open deviation', true],
          ['Precision', precision === null ? '-' : `${precision}%`, 'of triaged deviations were real'],
        ].map(([label, value, caption, bad]) => (
          <div key={label} className="rounded-[10px] border border-line bg-surface p-4">
            <p className="text-[12px] font-medium text-ink-3">{label}</p>
            <p data-numeric="" className={cn('mt-2 text-[26px] leading-none font-semibold', bad && value ? 'text-critical' : 'text-ink')}>{typeof value === 'number' ? formatNumber(value) : value}</p>
            <p className="mt-1.5 text-[12px] text-ink-3">{caption}</p>
          </div>
        ))}
      </div>

      <Panel>
        <PanelHeader title="Behaviour outside baseline, 30 days" subtitle="Identities that moved well outside their own expected range each day. Red marks are detections raised that day." />
        <div className="mt-3 h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={estate} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--t-chart-grid)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--t-chart-axis)', fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--t-chart-axis)', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<ChartTip rows={[['outside', 'Identities outside range'], ['alerts', 'Detections raised']]} />} cursor={{ stroke: 'var(--t-line-strong)' }} />
              <Area type="linear" dataKey="outside" stroke="var(--t-ink)" strokeWidth={1.5} fill="var(--t-ink)" fillOpacity={0.06} isAnimationActive={false} />
              <Scatter dataKey="alerts" shape={(p) => (p.payload.alerts ? <circle cx={p.cx} cy={p.cy} r={4} fill="var(--t-critical)" /> : null)} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center gap-3">
        <ProviderFilter providers={SOURCE_PROVIDERS} value={provider} onChange={setProvider} />
        <SearchInput value={q} onChange={setQ} size="sm" placeholder="Find an identity" className="ml-auto w-64" />
      </div>

      <Panel flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <SegmentedControl
            label="View"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'changes', label: `Behaviour changes (${changes.length})` },
              { value: 'learning', label: `Learning (${learning.length})` },
              { value: 'all', label: 'All identities' },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="bg-surface-2 text-[11.5px] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Identity</th>
                <th className="px-4 py-2.5 font-medium">{tab === 'learning' ? 'Progress' : 'What changed'}</th>
                <th className="px-4 py-2.5 font-medium">30 days</th>
                <th className="px-4 py-2.5 text-right font-medium">Deviation</th>
                <th className="px-4 py-2.5 font-medium">Baseline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(tab === 'changes' ? changes : tab === 'learning' ? learning : all.slice(0, 60)).map(({ i, g }) => {
                const top = g.deviations.find((d) => d.detection.status === 'new' || d.detection.status === 'investigating') || g.deviations[0];
                return (
                  <tr key={i.id} onClick={() => navigate(`/genome/${i.id}`)} className="cursor-pointer hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <IdentityLogo type={i.type} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{i.name}</span>
                          <span className="block truncate text-[12px] text-ink-3">{IDENTITY_TYPES[i.type].label} · {view.connById.get(i.connectionId)?.name}</span>
                        </span>
                      </span>
                    </td>
                    <td className="max-w-[360px] px-4 py-3">
                      {tab === 'learning' ? (
                        <span className="text-ink-2">{g.observedDays} of {LEARNING_DAYS} days observed</span>
                      ) : top ? (
                        <span className="block">
                          <span className="text-[12px] font-medium text-ink-3">{TRAIT_LABEL[top.trait]}</span>
                          <span className="block truncate text-ink">{changeSummary(top.detection)}</span>
                        </span>
                      ) : (
                        <span className="text-ink-3">Within range</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><DeviationSpark daily={g.daily} /></td>
                    <td data-numeric="" className={cn('px-4 py-3 text-right text-[15px] font-semibold', scoreTone(g.score))}>{g.status === 'dormant' ? '-' : g.score}</td>
                    <td className="px-4 py-3"><GenomeState status={g.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* Deviation score as a line: flat when normal, a peak where behaviour left the range. */
function DeviationSpark({ daily }) {
  const W = 120;
  const H = 26;
  const pts = daily.map((v, k) => `${(k / 29) * W},${H - 2 - (v / 100) * (H - 4)}`).join(' ');
  const peak = daily.reduce((m, v, k) => (v > daily[m] ? k : m), 0);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line x1="0" x2={W} y1={H - 2 - 0.7 * (H - 4)} y2={H - 2 - 0.7 * (H - 4)} stroke="var(--t-line-strong)" strokeDasharray="2 3" />
      <polyline points={pts} fill="none" stroke="var(--t-ink-3)" strokeWidth="1.25" />
      {daily[peak] >= 70 && <circle cx={(peak / 29) * W} cy={H - 2 - (daily[peak] / 100) * (H - 4)} r="2.5" fill="var(--t-critical)" />}
    </svg>
  );
}

function ChartTip({ active, payload, rows }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-[8px] border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--t-shadow-md)]">
      <p className="mb-1 font-medium text-ink">{p.label}</p>
      {rows.map(([k, l]) => p[k] !== undefined && p[k] !== null && <p key={k} className="text-ink-2">{l}: <span className="font-medium text-ink">{typeof p[k] === 'number' ? formatNumber(Math.round(p[k])) : p[k]}</span></p>)}
      {p.note && <p className="mt-1 max-w-56 text-critical">{p.note}</p>}
    </div>
  );
}

function GenomeIdentityPage({ identity: i }) {
  return (
    <div className="flex flex-col gap-4">
      <Link to="/genome" className="inline-flex w-fit items-center gap-1 text-[12.5px] font-medium text-ink-3 hover:text-ink"><ArrowLeft aria-hidden="true" className="size-3.5" />NHI Genome</Link>
      <GenomeDetail identity={i} />
    </div>
  );
}

export function GenomeDetail({ identity: i, compact = false }) {
  const view = useView();
  const toast = useToast();
  const g = useMemo(() => genomeFor(i, view), [i, view]);
  const topTrait = (g.deviations.find((d) => d.detection.status === 'new' || d.detection.status === 'investigating') || g.deviations[0])?.trait;
  const [signal, setSignal] = useState(topTrait === 'networks' ? 'networks' : topTrait === 'actions' || topTrait === 'ownership' ? 'resources' : 'calls');
  const open = g.deviations.filter((d) => d.detection.status === 'new' || d.detection.status === 'investigating');

  const teach = async (d, verdict) => {
    await actions.genomeFeedback(i.id, d.id, verdict, verdict === 'expected' ? d.observed.split(' ').slice(0, 8).join(' ') : '');
    toast.notify({ variant: 'success', title: verdict === 'expected' ? 'Added to the baseline' : 'Confirmed as suspicious', description: verdict === 'expected' ? 'The next model version treats this as normal.' : 'The detection stays open for investigation.' });
  };

  const sig = g.signals[signal];
  const devByDay = new Map(g.deviations.map((d) => [d.day, d]));
  const data = sig.values.map((v, k) => {
    const b = sig.band.at(k);
    return {
    label: dayLabel(k),
    value: v,
    base: Math.round(b.low * 10) / 10,
    range: Math.max(0, Math.round((b.high - b.low) * 10) / 10),
    expected: `${formatNumber(Math.round(b.low))} to ${formatNumber(Math.round(b.high))}`,
    outside: v > b.high && b.high > 0 ? v : null,
    note: devByDay.get(k)?.detection.title,
    score: g.daily[k],
    };
  });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel>
        <div className="flex flex-wrap items-start gap-4">
          <IdentityLogo type={i.type} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-semibold text-ink">{i.name}</h2>
              <GenomeState status={g.status} />
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{IDENTITY_TYPES[i.type].label} · {PROVIDERS[i.provider].short} · {view.connById.get(i.connectionId)?.name} · {i.owner ? <>owner <PersonName refId={i.owner} /></> : 'no owner'}</p>
          </div>
          {!compact && <Button as={Link} to={`/identities/${i.id}`} size="sm" variant="secondary" icon={ExternalLink}>Open identity</Button>}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 text-[12.5px] @min-[44rem]:grid-cols-5">
          <div><dt className="text-ink-3">Deviation score</dt><dd data-numeric="" className={cn('mt-0.5 text-[20px] font-semibold', scoreTone(g.score))}>{g.status === 'dormant' ? '-' : g.score}<span className="text-[12px] font-normal text-ink-3"> / 100</span></dd></div>
          <div><dt className="text-ink-3">Model</dt><dd className="mt-1 font-medium text-ink">Version {g.version}, trained <Time at={g.trainedAt} /></dd></div>
          <div><dt className="text-ink-3">Observed</dt><dd className="mt-1 font-medium text-ink">{g.observedDays} days</dd></div>
          <div><dt className="text-ink-3">Confidence</dt><dd className="mt-1 font-medium text-ink">{g.status === 'dormant' ? 'Not enough activity' : `${g.confidence}%`}</dd></div>
          <div><dt className="text-ink-3">Peer group</dt><dd className="mt-1 font-medium text-ink">{g.peers.count} {IDENTITY_TYPES[i.type].label}s</dd></div>
        </dl>
        {g.status === 'learning' && <p className="mt-3 rounded-[8px] bg-surface-3 px-3 py-2 text-[12.5px] text-ink-2">Still learning: {g.observedDays} of {LEARNING_DAYS} days observed. Deviations are recorded but not raised as detections yet.</p>}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PanelHeader title="Behaviour against baseline" subtitle="The shaded range is what the model expects for this identity. Points above it are deviations." />
          <SegmentedControl label="Signal" value={signal} onChange={setSignal} options={[{ value: 'calls', label: 'Calls' }, { value: 'resources', label: 'Resources' }, { value: 'networks', label: 'Networks' }]} />
        </div>
        <div className="mt-4 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid stroke="var(--t-chart-grid)" vertical={false} />
              <ReferenceArea x1={data[23].label} x2={data[29].label} fill="var(--t-surface-3)" fillOpacity={0.6}  />
              <XAxis dataKey="label" tick={{ fill: 'var(--t-chart-axis)', fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--t-chart-axis)', fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => formatNumber(v)} />
              <Tooltip content={<ChartTip rows={[['value', sig.label], ['expected', 'Expected']]} />} cursor={{ stroke: 'var(--t-line-strong)' }} />
              <Area type="step" dataKey="base" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
              <Area type="step" dataKey="range" stackId="band" stroke="none" fill="var(--t-ink)" fillOpacity={0.09} isAnimationActive={false} />
              <Line dataKey="value" stroke="var(--t-ink)" strokeWidth={1.75} dot={false} activeDot={{ r: 4, fill: 'var(--t-ink)', stroke: 'var(--t-surface)' }} isAnimationActive={false} />
              <Scatter dataKey="outside" fill="var(--t-critical)" isAnimationActive={false} />
              
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-ink-3">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-ink" />Observed</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] bg-ink/10" />Expected range</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-critical" />Outside range</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-[2px] bg-surface-3" />Last 7 days, scored</span>
        </div>
      </Panel>

      {g.deviations.length > 0 && (
        <Panel>
          <PanelHeader title="What changed" subtitle="Baseline compared with what was seen. Your verdict trains the next model version." />
          <ul className="mt-3 divide-y divide-line">
            {g.deviations.map(({ detection: d, trait, firstSeen }) => {
              const isOpen = d.status === 'new' || d.status === 'investigating';
              return (
                <li key={d.id} className="py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityTag severity={d.severity} />
                    <span className="text-[12px] font-medium text-ink-3">{TRAIT_LABEL[trait]}</span>
                    <Link to={`/detections?open=${d.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink hover:underline">{d.title}</Link>
                    <StatusPill status={d.status} />
                    <Time at={d.detectedAt} className="text-[12px] text-ink-3" />
                  </div>
                  <div className="mt-3 grid gap-px overflow-hidden rounded-[8px] border border-line bg-line @min-[44rem]:grid-cols-2">
                    <div className="bg-surface-2 p-3">
                      <p className="text-[11.5px] font-medium text-ink-3">Baseline</p>
                      <p className="mt-1 text-[13px] text-ink-2">{d.baseline}</p>
                      <p data-numeric="" className="mt-2 text-[12px] text-ink-3">{d.metric.label}: <span className="font-medium text-ink">{formatNumber(d.metric.baseline)}</span></p>
                    </div>
                    <div className="bg-surface p-3">
                      <p className="text-[11.5px] font-medium text-critical">Seen</p>
                      <p className="mt-1 text-[13px] text-ink">{d.observed}</p>
                      <p data-numeric="" className="mt-2 text-[12px] text-ink-3">{d.metric.label}: <span className="font-medium text-critical">{formatNumber(d.metric.observed)}</span></p>
                    </div>
                  </div>
                  {firstSeen.length > 0 && (
                    <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                      First seen for this identity:
                      {firstSeen.map((f) => <span key={f.value} className="rounded-full bg-critical-soft px-2 py-0.5 font-mono text-[11.5px] text-critical">{f.value}</span>)}
                    </p>
                  )}
                  {isOpen && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" icon={Check} onClick={() => teach(d, 'confirmed')}>Confirm, it is suspicious</Button>
                      <Button size="sm" variant="ghost" icon={GraduationCap} onClick={() => teach(d, 'expected')}>Expected, add to baseline</Button>
                    </div>
                  )}
                  {d.closedReason && <p className="mt-2 text-[12px] text-ink-3">{d.closedReason}</p>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 @min-[64rem]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="When it acts" subtitle="Usual activity by weekday and hour (UTC). Darker means more likely. Outlined cells are activity outside that pattern." />
          <Heatmap pattern={g.pattern} offHours={g.offHours} />
        </Panel>
        <Panel>
          <PanelHeader title="Compared with its peers" subtitle={`${g.peers.count} other ${IDENTITY_TYPES[i.type].label}s in the estate.`} />
          <PeerStrip i={i} view={view} g={g} />
          <dl className="mt-4 space-y-2 text-[12.5px]">
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Calls per day, this identity</dt><dd data-numeric="" className="font-medium text-ink">{formatNumber(g.peers.mine)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Peer median</dt><dd data-numeric="" className="font-medium text-ink">{formatNumber(g.peers.median)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Rank among peers</dt><dd className="font-medium text-ink">{g.peers.percentile === null ? '-' : `Busier than ${g.peers.percentile}%`}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-3">Resources no peer touches</dt><dd className={cn('text-right font-medium', g.peers.uniqueResources.length ? 'text-high' : 'text-ink')}>{g.peers.uniqueResources.length ? g.peers.uniqueResources.join(', ') : 'None'}</dd></div>
          </dl>
        </Panel>
      </div>

      <div className="grid gap-4 @min-[64rem]:grid-cols-3">
        <Panel>
          <SectionLabel>Usual actions</SectionLabel>
          <Shares items={g.actions} mono />
        </Panel>
        <Panel>
          <SectionLabel>Usual networks</SectionLabel>
          <Shares items={g.networks} />
          <p className="mt-3 text-[12px] text-ink-3">Countries: {g.countries.length ? g.countries.join(', ') : 'none recently'}</p>
        </Panel>
        <Panel>
          <SectionLabel>Model history</SectionLabel>
          <ol className="mt-3 space-y-2.5">
            {g.history.map((h) => (
              <li key={h.version} className="grid grid-cols-[32px_minmax(0,1fr)] gap-2 text-[12.5px]">
                <span className="font-mono text-ink-3">v{h.version}</span>
                <span className="text-ink-2">{h.note}{h.by && <> · <PersonName refId={h.by} /></>}<br /><Time at={h.at} className="text-[12px] text-ink-3" /></span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
      {open.length === 0 && g.deviations.length === 0 && g.status !== 'dormant' && <p className="text-[12.5px] text-ink-3">No deviations in 30 days.</p>}
    </div>
  );
}

function Heatmap({ pattern, offHours }) {
  const off = new Map(offHours.map((o) => [`${o.wd}-${o.h}`, o.detection]));
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="inline-grid min-w-full grid-cols-[36px_repeat(24,minmax(14px,1fr))] gap-[3px]">
        <span />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center font-mono text-[10px] text-ink-3">{h % 6 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
        {pattern.map((row, wd) => (
          <div key={wd} className="contents">
            <span className="self-center text-[11.5px] text-ink-3">{WEEKDAYS[wd]}</span>
            {row.map((p, h) => {
              const d = off.get(`${wd}-${h}`);
              return (
                <span
                  key={h}
                  title={`${WEEKDAYS[wd]} ${String(h).padStart(2, '0')}:00 · ${Math.round(p * 100)}% likely${d ? ` · outside pattern: ${d.title}` : ''}`}
                  className={cn('aspect-square rounded-[3px]', d && 'ring-2 ring-critical ring-offset-1 ring-offset-surface')}
                  style={{ background: `color-mix(in srgb, var(--t-ink) ${Math.round(4 + p * 70)}%, var(--t-surface))` }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 text-[11.5px] text-ink-3">
        Rare
        {[0.05, 0.25, 0.5, 0.75, 1].map((p) => <span key={p} className="size-3 rounded-[2px]" style={{ background: `color-mix(in srgb, var(--t-ink) ${Math.round(4 + p * 70)}%, var(--t-surface))` }} />)}
        Usual
      </p>
    </div>
  );
}

/* Each peer is a tick on one axis; this identity is the dot. */
function PeerStrip({ i, view, g }) {
  const peers = view.identities.filter((x) => x.type === i.type && x.lastUsedAt);
  const means = peers.map((p) => ({ id: p.id, v: p.series.reduce((a, b) => a + b, 0) / 30 }));
  const max = Math.max(1, ...means.map((m) => m.v));
  const x = (v) => `${(Math.log10(v + 1) / Math.log10(max + 1)) * 100}%`;
  return (
    <div className="mt-6 px-1">
      <div className="relative h-8">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        {means.filter((m) => m.id !== i.id).map((m) => <span key={m.id} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink-3/60" style={{ left: x(m.v) }} />)}
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink" style={{ left: x(g.peers.mine) }} title={`${i.name}: ${formatNumber(g.peers.mine)} calls a day`} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>Quieter</span><span>Calls per day, log scale</span><span>Busier</span></div>
    </div>
  );
}

function Shares({ items, mono = false }) {
  if (!items.length) return <p className="mt-3 text-[12.5px] text-ink-3">Nothing recorded.</p>;
  return (
    <ul className="mt-3 divide-y divide-line">
      {items.map((x) => (
        <li key={x.name} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
          <span className={cn('min-w-0 truncate text-ink', mono && 'font-mono text-[12px]')} title={x.name}>{x.name}</span>
          <span data-numeric="" className="shrink-0 text-ink-3">{Math.round(x.share * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}
