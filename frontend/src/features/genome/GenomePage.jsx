import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Dna, ExternalLink, GraduationCap } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, PanelHeader, SectionLabel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { SearchInput } from '../../ui/Field';
import { EmptyState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { actions, useView } from '../../data/store';
import { IDENTITY_TYPES, PROVIDERS, SOURCE_PROVIDERS } from '../../data/world';
import { genomeFor, LEARNING_DAYS, TRAIT_LABEL } from '../../data/genome';
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
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium tracking-[0.05em] uppercase', cls)}>{label}</span>;
}

/** The fingerprint: 48 bands, darker where the trait is stronger. */
export function GenomeStrip({ bands, height = 22, drifting = false, className }) {
  return (
    <span className={cn('flex items-stretch gap-[2px]', className)} style={{ height }} aria-hidden="true">
      {bands.map((b, k) => (
        <span key={k} className={cn('w-[3px] rounded-[1px]', drifting && k % 11 === 3 ? 'bg-critical' : 'bg-ink')} style={{ opacity: 0.12 + b * 0.78 }} />
      ))}
    </span>
  );
}

export default function GenomePage() {
  const { id } = useParams();
  const view = useView();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState('');
  const [state, setState] = useState('');

  const genomes = useMemo(() => view.identities.map((i) => ({ i, g: genomeFor(i, view) })), [view]);
  const counts = useMemo(() => {
    const c = { established: 0, learning: 0, drifting: 0, dormant: 0 };
    for (const { g } of genomes) c[g.status] += 1;
    return c;
  }, [genomes]);
  const triaged = view.detections.filter((d) => d.status !== 'new');
  const precision = triaged.length ? Math.round((triaged.filter((d) => d.status !== 'false_positive').length / triaged.length) * 100) : null;

  const list = genomes
    .filter(({ i, g }) => (!provider || i.provider === provider) && (!state || g.status === state) && (!q || i.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => ({ drifting: 0, learning: 1, established: 2, dormant: 3 })[a.g.status] - ({ drifting: 0, learning: 1, established: 2, dormant: 3 })[b.g.status] || b.i.risk - a.i.risk);
  const selected = (id && genomes.find((x) => x.i.id === id)) || list[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="NHI Genome"
        lede={`A behavioural model for every identity, learned from its own activity: when it runs, how much, what it calls, what it touches and where from. After ${LEARNING_DAYS} days it has a baseline; anything outside it raises a detection.`}
      />
      <div className="grid grid-cols-2 gap-3 @min-[60rem]:grid-cols-5">
        {[
          ['Modelled', genomes.length - counts.dormant, 'identities with activity', ''],
          ['Established', counts.established, 'stable baselines', 'established'],
          ['Learning', counts.learning, `under ${LEARNING_DAYS} days of data`, 'learning'],
          ['Drifting now', counts.drifting, 'open deviations', 'drifting'],
          ['Precision', precision === null ? '-' : `${precision}%`, 'of triaged detections were real', null],
        ].map(([label, value, caption, key]) => (
          <button key={label} type="button" disabled={key === null} onClick={() => setState(state === key ? '' : key)} className={cn('rounded-[10px] border bg-surface p-4 text-left transition-colors', state && state === key ? 'border-ink' : 'border-line enabled:hover:border-line-strong')}>
            <p className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">{label}</p>
            <p data-numeric="" className="mt-2 text-[26px] leading-none font-semibold tracking-[-0.03em] text-ink">{typeof value === 'number' ? formatNumber(value) : value}</p>
            <p className="mt-1.5 text-[12px] text-ink-3">{caption}</p>
          </button>
        ))}
      </div>
      <ProviderFilter providers={SOURCE_PROVIDERS} value={provider} onChange={setProvider} />

      <div className="grid gap-4 @min-[72rem]:grid-cols-[380px_minmax(0,1fr)]">
        <Panel flush className="flex max-h-[860px] flex-col self-start">
          <div className="border-b border-line p-3"><SearchInput value={q} onChange={setQ} size="sm" placeholder="Find an identity" /></div>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
            {list.slice(0, 120).map(({ i, g }) => (
              <li key={i.id}>
                <button type="button" onClick={() => navigate(`/genome/${i.id}`)} className={cn('flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors', selected?.i.id === i.id ? 'bg-surface-3' : 'hover:bg-surface-2')}>
                  <IdentityLogo type={i.type} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{i.name}</span>
                    <GenomeStrip bands={g.bands.slice(0, 30)} height={12} drifting={g.status === 'drifting'} className="mt-1.5" />
                  </span>
                  <GenomeState status={g.status} />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        {selected ? <GenomeDetail identity={selected.i} /> : <Panel><EmptyState icon={Dna} title="No identities match" /></Panel>}
      </div>
    </div>
  );
}

export function GenomeDetail({ identity: i, compact = false }) {
  const view = useView();
  const toast = useToast();
  const g = useMemo(() => genomeFor(i, view), [i, view]);
  const maxSched = Math.max(...g.schedule, 0.01);
  const brokenTraits = new Set(g.deviations.filter((d) => ['new', 'investigating'].includes(d.detection.status)).map((d) => d.trait));
  const nowHour = new Date().getUTCHours();

  const teach = async (d, verdict) => {
    await actions.genomeFeedback(i.id, d.id, verdict, verdict === 'expected' ? d.observed.split(' ').slice(0, 8).join(' ') : '');
    toast.notify({ variant: 'success', title: verdict === 'expected' ? 'Added to the baseline' : 'Confirmed as real', description: verdict === 'expected' ? 'The next model version treats this as normal for everyone.' : 'The detection stays open for investigation.' });
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel prominence="lead">
        <div className="flex flex-wrap items-start gap-4">
          <IdentityLogo type={i.type} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.015em] text-ink">{i.name}</h2>
              <GenomeState status={g.status} />
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-3">{IDENTITY_TYPES[i.type].label} · {PROVIDERS[i.provider].short} · owner <PersonName refId={i.owner} /></p>
          </div>
          {!compact && <Button as={Link} to={`/identities/${i.id}`} size="sm" variant="secondary" icon={ExternalLink}>Open identity</Button>}
        </div>
        <GenomeStrip bands={g.bands} height={40} drifting={g.status === 'drifting'} className="mt-5" />
        <dl className="mt-4 grid grid-cols-2 gap-4 text-[12.5px] @min-[40rem]:grid-cols-4">
          <div><dt className="text-ink-3">Model</dt><dd className="mt-0.5 font-medium text-ink">Version {g.version}</dd></div>
          <div><dt className="text-ink-3">Trained</dt><dd className="mt-0.5 font-medium text-ink"><Time at={g.trainedAt} /></dd></div>
          <div><dt className="text-ink-3">Observed</dt><dd className="mt-0.5 font-medium text-ink">{g.observedDays} days</dd></div>
          <div><dt className="text-ink-3">Confidence</dt><dd className="mt-0.5 font-medium text-ink">{g.status === 'dormant' ? 'Not enough activity' : `${g.confidence}%`}</dd></div>
        </dl>
        {g.status === 'learning' && <p className="mt-3 text-[12.5px] text-ink-2">Learning. A baseline is set after {LEARNING_DAYS} days; until then deviations are recorded but not raised.</p>}
      </Panel>

      {g.deviations.length > 0 && (
        <Panel>
          <PanelHeader title="Deviations" subtitle="Where recent behaviour left the baseline. Your verdict trains the next model version." />
          <ul className="mt-3 divide-y divide-line">
            {g.deviations.map(({ detection: d, trait }) => {
              const open = d.status === 'new' || d.status === 'investigating';
              return (
                <li key={d.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityTag severity={d.severity} />
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] font-medium tracking-[0.05em] text-ink-2 uppercase">{TRAIT_LABEL[trait]}</span>
                    <Link to={`/detections?open=${d.id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink hover:underline">{d.title}</Link>
                    <StatusPill status={d.status} />
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-ink-2"><span className="text-ink-3">Seen:</span> {d.observed}</p>
                  <p className="text-[12.5px] text-ink-2"><span className="text-ink-3">Baseline:</span> {d.baseline}</p>
                  {open && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" icon={Check} onClick={() => teach(d, 'confirmed')}>Confirm, it is suspicious</Button>
                      <Button size="sm" variant="ghost" icon={GraduationCap} onClick={() => teach(d, 'expected')}>Expected, add to baseline</Button>
                    </div>
                  )}
                  {d.closedReason && <p className="mt-1.5 text-[12px] text-ink-3">{d.closedReason}</p>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 @min-[60rem]:grid-cols-2">
        <Trait title="Schedule" note="Share of calls per hour of day, UTC." broken={brokenTraits.has('schedule')}>
          <div className="flex h-24 items-end gap-[3px]">
            {g.schedule.map((v, h) => (
              <span key={h} title={`${String(h).padStart(2, '0')}:00 · ${Math.round((v / maxSched) * 100)}%`} className={cn('flex-1 rounded-t-[2px]', h === nowHour ? 'bg-ink' : 'bg-ink/25')} style={{ height: `${Math.max(3, (v / maxSched) * 100)}%` }} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-ink-3"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
        </Trait>
        <Trait title="Volume" note={`Normal band ${formatNumber(g.volume.low)} to ${formatNumber(g.volume.high)} calls a day.`} broken={brokenTraits.has('volume')}>
          <VolumeBand volume={g.volume} />
        </Trait>
        <Trait title="Actions" note="What it calls, by share of activity." broken={brokenTraits.has('actions')}>
          <Shares items={g.actions} mono />
        </Trait>
        <Trait title="Networks and places" note={g.countries.length ? `Countries: ${g.countries.join(', ')}` : 'No recent activity.'} broken={brokenTraits.has('networks')}>
          <Shares items={g.networks} />
        </Trait>
        <Trait title="Resources" note="What it touches." broken={false}>
          <Shares items={g.resources} mono />
        </Trait>
        <Trait title="Model history" note="Each version is kept; feedback creates a new one." broken={false}>
          <ol className="space-y-2.5">
            {g.history.map((h) => (
              <li key={h.version} className="flex gap-3 text-[12.5px]">
                <span className="w-8 shrink-0 font-mono text-ink-3">v{h.version}</span>
                <span className="min-w-0 flex-1 text-ink-2">{h.note}{h.by && <> · <PersonName refId={h.by} /></>}</span>
                <Time at={h.at} className="shrink-0 text-ink-3" />
              </li>
            ))}
          </ol>
        </Trait>
      </div>
    </div>
  );
}

function Trait({ title, note, broken, children }) {
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>{title}</SectionLabel>
        {broken && <span className="text-[11px] font-medium text-critical">Deviation open</span>}
      </div>
      <p className="mt-1 mb-3 text-[12px] text-ink-3">{note}</p>
      {children}
    </Panel>
  );
}

function Shares({ items, mono = false }) {
  if (!items.length) return <p className="text-[12.5px] text-ink-3">Nothing recorded.</p>;
  const max = Math.max(...items.map((x) => x.share));
  return (
    <ul className="space-y-2">
      {items.map((x) => (
        <li key={x.name} className="grid grid-cols-[minmax(0,1fr)_90px_36px] items-center gap-3 text-[12.5px]">
          <span className={cn('truncate text-ink', mono && 'font-mono text-[12px]')} title={x.name}>{x.name}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-track"><span className="block h-full rounded-full bg-ink/70" style={{ width: `${(x.share / max) * 100}%` }} /></span>
          <span data-numeric="" className="text-right text-ink-3">{Math.round(x.share * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

function VolumeBand({ volume }) {
  const W = 300;
  const H = 96;
  const max = Math.max(volume.high, ...volume.series, 1) * 1.1;
  const y = (v) => H - (v / max) * H;
  const pts = volume.series.map((v, k) => `${(k / (volume.series.length - 1)) * W},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="h-28 w-full" role="img" aria-label={`Daily calls for 30 days against a normal band of ${volume.low} to ${volume.high}`}>
      <rect x="0" y={y(volume.high)} width={W} height={Math.max(1, y(volume.low) - y(volume.high))} fill="var(--t-surface-3)" />
      <line x1="0" x2={W} y1={y(volume.mean)} y2={y(volume.mean)} stroke="var(--t-line-strong)" strokeDasharray="3 3" />
      <polyline points={pts} fill="none" stroke="var(--t-ink)" strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {volume.series.map((v, k) => (v > volume.high || (v < volume.low && v > 0) ? <circle key={k} cx={(k / (volume.series.length - 1)) * W} cy={y(v)} r="3" fill="var(--t-critical)" /> : null))}
      <text x="0" y={H + 12} fontSize="10" fill="var(--t-ink-3)">30 days ago</text>
      <text x={W} y={H + 12} fontSize="10" fill="var(--t-ink-3)" textAnchor="end">Today</text>
    </svg>
  );
}
