import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertOctagon,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Globe2,
  KeyRound,
  MapPin,
  MonitorSmartphone,
  Network,
  RefreshCcw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { fetchCredentialGenomeOne, onResponseChange, rotateInVault } from '../../lib/api/response';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatNumber, formatRelative } from '../../lib/format';
import { credentialTypeMeta } from '../identities/meta';
import { useAccess } from '../../app/useAccess';
import { Button } from '../../ui/Button';
import { ProviderIcon } from '../../ui/ProviderIcon';
import { DetailSkeleton, ListSkeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';

/*
 * NHI Genome for credentials. An identity has a behaviour; so does a key that
 * several workloads share. Each known consumer of a credential has its own
 * fingerprint (network, region, client, hours, calls); a source that matches
 * none of them is "a known credential with an unknown consumer".
 */

const STATUS = {
  unknown_consumer: { label: 'Unknown consumer', tone: 'critical' },
  contained: { label: 'Contained', tone: 'low' },
  normal: { label: 'Normal', tone: 'neutral' },
};

/* ── Tab on the NHI Genome page ───────────────────────────────────────────── */

export function CredentialsTab({ query }) {
  const [view, setView] = useState('all');
  const { refetch } = query;
  useEffect(() => onResponseChange(refetch), [refetch]);
  const rows = useMemo(() => {
    const all = query.data ?? [];
    if (view === 'shared') return all.filter((r) => r.known_consumers > 1);
    if (view === 'flagged') return all.filter((r) => r.unknown_consumers > 0);
    return all;
  }, [query.data, view]);

  if (query.isError && !query.data) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (!query.data) return <ListSkeleton rows={8} />;
  const all = query.data;
  const shared = all.filter((r) => r.known_consumers > 1).length;
  const flagged = all.filter((r) => r.unknown_consumers > 0).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={KeyRound} label="Credentials with a baseline" value={all.length} hint="Keys, secrets and Vault logins with known consumers" />
        <Stat icon={Users} label="Shared by more than one workload" value={shared} hint="Each consumer has its own fingerprint" />
        <Stat icon={AlertOctagon} label="Used by an unknown consumer" value={flagged} hint={flagged ? 'Open it: a source matches none of its consumers' : 'Every use matches a known consumer'} tone={flagged ? 'critical' : 'low'} />
      </div>

      <section className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">Who uses each credential</h2>
            <p className="text-[12px] text-ink-3">Learned over 14 days from every call made with it. A new consumer of a known credential is flagged the moment it appears.</p>
          </div>
          <SegmentedControl
            label="Show"
            value={view}
            onChange={setView}
            options={[
              { value: 'all', label: `All (${all.length})` },
              { value: 'shared', label: `Shared (${shared})` },
              { value: 'flagged', label: `Flagged (${flagged})` },
            ]}
          />
        </header>
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState compact icon={ShieldCheck} title="Nothing here" description="No credential matches this view." />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const st = STATUS[r.status] ?? STATUS.normal;
              return (
                <li key={r.credential_id}>
                  <Link
                    to={`/genome/credentials/${encodeURIComponent(r.credential_id)}`}
                    data-scene={r.unknown_consumers ? 'key-row-flagged' : undefined}
                    className={cn('grid items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/60 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]', r.unknown_consumers && 'bg-critical-soft/30')}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-[9px]', r.unknown_consumers ? 'bg-critical-soft text-critical' : 'bg-surface-2 text-ink-3')}>
                        <KeyRound aria-hidden="true" className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[13px] font-semibold text-ink">{r.name}</span>
                        <span className="block truncate text-[11.5px] text-ink-3">
                          {credentialTypeMeta(r.credential_type).label}
                          {r.owner ? ` · belongs to ${r.owner.name}` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="min-w-0 text-[12px] text-ink-2">
                      {r.stored_in ? (
                        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-2 py-0.5">
                          <ProviderIcon provider="vault" size={12} decorative />
                          <span className="truncate font-mono text-[11px]">{r.stored_in.path}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-ink-3">
                          <ProviderIcon provider={r.provider} size={12} decorative /> Held by the workload
                        </span>
                      )}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                      {r.consumers.map((c) => (
                        <span key={c.id} className="truncate rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2">
                          {c.name}
                        </span>
                      ))}
                      {r.unknown_consumers > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-critical px-2 py-0.5 text-[11.5px] font-semibold text-white">
                          <span className="size-1.5 animate-pulse rounded-full bg-white" /> + unknown
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-3">
                      <Tag tone={st.tone} size="sm" dot={r.status !== 'normal'}>
                        {st.label}
                      </Tag>
                      <ChevronRight aria-hidden="true" className="size-4 text-ink-3" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </p>
      <p data-numeric="" className={cn('mt-1 text-[22px] leading-none font-semibold', tone === 'critical' ? 'text-critical' : 'text-ink')}>
        {formatNumber(value)}
      </p>
      <p className={cn('mt-1 text-[11.5px]', tone === 'critical' ? 'text-critical' : tone === 'low' ? 'text-low' : 'text-ink-3')}>{hint}</p>
    </div>
  );
}

/* ── One credential ───────────────────────────────────────────────────────── */

function Fact({ icon: Icon, label, children, fresh }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon aria-hidden="true" className={cn('mt-0.5 size-3.5 shrink-0', fresh ? 'text-critical' : 'text-ink-3')} />
      <span className="w-[72px] shrink-0 text-[11.5px] text-ink-3">{label}</span>
      <span className={cn('min-w-0 flex-1 text-[12.5px]', fresh ? 'font-medium text-critical' : 'text-ink-2')}>
        {children}
        {fresh && <span className="ml-1.5 rounded bg-critical px-1 py-px text-[9.5px] font-bold tracking-wide text-white uppercase">new</span>}
      </span>
    </div>
  );
}

function ConsumerCard({ c }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-4 shadow-[var(--t-shadow-sm)]">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/identities/${encodeURIComponent(c.id)}`} className="min-w-0 hover:underline">
          <span className="flex items-center gap-2">
            <ProviderIcon provider={c.provider} size={14} decorative />
            <span className="truncate font-mono text-[13.5px] font-semibold text-ink">{c.name}</span>
          </span>
        </Link>
        <Tag tone="low" size="sm" dot>
          Known
        </Tag>
      </div>
      <p className="mt-0.5 text-[11.5px] text-ink-3">Known consumer for {c.first_seen_days} days</p>
      <div className="mt-2 divide-y divide-line">
        <Fact icon={Network} label="Network">
          <span className="font-mono">{c.network}</span> <span className="text-ink-3">· {c.where}</span>
        </Fact>
        <Fact icon={MapPin} label="Region">
          <span className="font-mono">{c.region}</span>
        </Fact>
        <Fact icon={MonitorSmartphone} label="Client">
          <span className="font-mono text-[11.5px]">{c.client}</span>
        </Fact>
        <Fact icon={Clock3} label="When">
          {c.hours}
        </Fact>
        <Fact icon={Activity} label="Calls">
          <span className="flex flex-wrap gap-1">
            {c.calls.map((a) => (
              <span key={a} className="rounded bg-surface-2 px-1.5 py-px font-mono text-[11px]">
                {a}
              </span>
            ))}
          </span>
        </Fact>
      </div>
      <div className="mt-2.5">
        <div className="flex justify-between text-[11px] text-ink-3">
          <span>~{formatNumber(c.per_day)} calls a day</span>
          <span>{c.share_pct}% of the key&apos;s use</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full rounded-full bg-brand" style={{ width: `${c.share_pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function StrangerCard({ s }) {
  return (
    <div data-scene="stranger-card" className="relative rounded-[14px] border-2 border-critical bg-critical-soft/40 p-4 shadow-[0_0_0_6px_color-mix(in_oklab,var(--t-critical)_12%,transparent)]">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className="relative grid size-2.5 place-items-center">
            <span className="absolute size-2.5 animate-ping rounded-full bg-critical/60" />
            <span className="size-2 rounded-full bg-critical" />
          </span>
          <span className="font-mono text-[13.5px] font-semibold text-critical">{s.sample_ip}</span>
        </span>
        <Tag tone="critical" size="sm" dot>
          Unknown consumer
        </Tag>
      </div>
      <p className="mt-0.5 text-[11.5px] text-critical">First seen {formatRelative(s.first_seen_at)} · {formatNumber(s.count)} calls so far</p>
      <div className="mt-2 divide-y divide-critical/15">
        <Fact icon={Network} label="Network" fresh>
          {s.where}
        </Fact>
        <Fact icon={Globe2} label="Region" fresh>
          <span className="font-mono">{s.region}</span>
        </Fact>
        <Fact icon={MonitorSmartphone} label="Client" fresh>
          <span className="font-mono text-[11.5px]">{s.client}</span>
        </Fact>
        <Fact icon={Activity} label="Calls" fresh>
          <span className="flex flex-wrap gap-1">
            {s.calls.map((a) => (
              <span key={a} className="rounded bg-critical/10 px-1.5 py-px font-mono text-[11px] text-critical">
                {a}
              </span>
            ))}
          </span>
        </Fact>
      </div>
    </div>
  );
}

export default function CredentialGenomePage() {
  const { id } = useParams();
  const { can } = useAccess();
  const { notify } = useToast();
  const query = useQuery((signal) => fetchCredentialGenomeOne(id, signal), [id]);
  const { refetch } = query;
  useEffect(() => onResponseChange(refetch), [refetch]);
  const [busy, setBusy] = useState(false);
  const d = query.data;

  const rotate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await rotateInVault(id);
      notify({ variant: 'success', title: 'Rotated in Vault', description: 'A new key is at the same Vault path. Known consumers pick it up on their next read; the copy outside Vault no longer works.' });
      await refetch();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not rotate the key', description: error?.message });
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Button as={Link} to="/genome?tab=credentials" variant="secondary" size="sm" icon={ArrowLeft}>
      Credentials
    </Button>
  );
  if (query.isError) return <div className="flex flex-col gap-4">{back}<ErrorState error={query.error} onRetry={refetch} /></div>;
  if (!d) return <div className="flex flex-col gap-4">{back}<DetailSkeleton rows={8} /></div>;

  const st = STATUS[d.status] ?? STATUS.normal;
  const consumers = d.consumers ?? [];
  const canAct = can('remediation.execute');

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--t-shadow-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">NHI Genome · Credential</p>
            <h1 className="mt-1 flex items-center gap-2.5 text-[21px] font-semibold text-ink">
              <KeyRound aria-hidden="true" className="size-5 text-ink-3" />
              <span className="truncate font-mono">{d.name}</span>
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
              <span>{credentialTypeMeta(d.credential_type).label}</span>
              {d.owner && (
                <>
                  <span>·</span>
                  <span>
                    belongs to{' '}
                    <Link to={`/identities/${encodeURIComponent(d.owner.id)}?tab=credentials`} className="font-medium text-brand hover:underline">
                      {d.owner.name}
                    </Link>
                  </span>
                </>
              )}
              {d.stored_in && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <ProviderIcon provider="vault" size={12} decorative /> stored in {d.stored_in.name} at{' '}
                    <span className="font-mono text-ink-2">{d.stored_in.path}</span>
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tag tone={st.tone} dot={d.status !== 'normal'}>
              {st.label}
            </Tag>
            {back}
          </div>
        </div>
      </section>

      {/* The alert, or the outcome */}
      {d.stranger && (
        <section data-scene="key-alert" className="overflow-hidden rounded-[var(--radius-panel)] border border-critical/40 bg-surface shadow-[var(--t-shadow-sm)]">
          <div className="flex flex-wrap items-start gap-4 border-b border-critical/20 bg-critical-soft/50 px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-critical text-white">
              <AlertOctagon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-critical uppercase">Detected in real time · {formatRelative(d.stranger.first_seen_at)}</p>
              <h2 className="mt-0.5 text-[17px] font-semibold text-ink">Known credential, unknown consumer</h2>
              <p className="mt-1 text-[13px] text-ink-2">
                For {d.baseline.days} days this key was used by {consumers.length} workloads, each from its own network, client and hours. A third source is using it now,
                matching none of them.
              </p>
            </div>
          </div>
          <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <ul data-scene="departures" className="flex flex-col gap-2">
              {d.departures.map((x) => (
                <li key={x.dimension} className="flex items-start gap-2.5 rounded-[10px] border border-line px-3 py-2">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-critical" />
                  <span>
                    <span className="block text-[13px] font-medium text-ink">{x.label}</span>
                    <span className="block text-[12px] text-ink-3">{x.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div data-scene="rotate-card" className="flex flex-col rounded-[12px] border border-line bg-surface-2/60 p-4">
              <p className="text-[13px] font-semibold text-ink">Recommended: rotate it in Vault</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                A new key is written to <span className="font-mono">{d.stored_in?.path ?? 'its Vault path'}</span>. {consumers.map((c) => c.name).join(' and ')} read it on their next Vault
                read - no redeploy, no downtime. The copy used from <span className="font-mono">{d.stranger.sample_ip}</span> stops working.
              </p>
              <Button data-scene="rotate-vault" className="mt-3" variant="danger" icon={RefreshCcw} loading={busy} disabled={!canAct || !d.stored_in} onClick={rotate}>
                Rotate in Vault
              </Button>
              <p className="mt-2 text-[11px] text-ink-3">Deactivating the key instead would also cut off the two legitimate workloads.</p>
            </div>
          </div>
        </section>
      )}
      {d.status === 'contained' && d.rotated && (
        <section data-scene="key-contained" className="flex flex-wrap items-start gap-4 rounded-[var(--radius-panel)] border border-low/40 bg-low-soft/40 px-5 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-low text-white">
            <CheckCircle2 aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-low uppercase">Contained · {formatRelative(d.rotated.at)}</p>
            <h2 className="mt-0.5 text-[16px] font-semibold text-ink">Rotated in Vault - the unknown consumer is cut off</h2>
            <p className="mt-1 text-[13px] text-ink-2">
              New key <span className="font-mono text-ink">{d.access_key_id}</span> at <span className="font-mono">{d.stored_in?.path}</span>
              {d.rotated.by ? `, by ${d.rotated.by}` : ''}. {consumers.map((c) => c.name).join(' and ')} kept working on the new key; the old one no longer signs anything.
            </p>
          </div>
        </section>
      )}

      {/* Who uses it */}
      <section data-scene="key-consumers" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--t-shadow-sm)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">Who uses this credential</h2>
            <p className="text-[12px] text-ink-3">
              Baseline from {d.baseline.days} days of calls: {consumers.length} known {consumers.length === 1 ? 'consumer' : 'consumers'}
              {d.stranger ? ', and one source that is none of them.' : '.'}
            </p>
          </div>
          {d.access_key_id && <span className="font-mono text-[12px] text-ink-3">Key {d.access_key_id}</span>}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* The key, and where it is kept */}
          <div className="flex flex-col items-stretch justify-center gap-2">
            {d.stored_in && (
              <div className="rounded-[12px] border border-line px-3 py-2.5 text-center">
                <ProviderIcon provider="vault" size={18} />
                <p className="mt-1 text-[11px] text-ink-3">Kept in {d.stored_in.name}</p>
                <p className="font-mono text-[11px] break-all text-ink-2">{d.stored_in.path}</p>
              </div>
            )}
            <ArrowRight aria-hidden="true" className="mx-auto size-4 rotate-90 text-ink-3 lg:rotate-0" />
            <div className={cn('rounded-[12px] border-2 px-3 py-3 text-center', d.stranger ? 'border-critical' : 'border-brand/50')}>
              <KeyRound aria-hidden="true" className={cn('mx-auto size-5', d.stranger ? 'text-critical' : 'text-brand')} />
              <p className="mt-1 font-mono text-[12px] font-semibold text-ink">{d.access_key_id ? `${d.access_key_id.slice(0, 4)}…${d.access_key_id.slice(-4)}` : d.name}</p>
              <p className="text-[11px] text-ink-3">{consumers.length + (d.stranger ? 1 : 0)} consumers right now</p>
            </div>
          </div>
          <div className={cn('grid gap-4', consumers.length + (d.stranger ? 1 : 0) > 1 ? 'md:grid-cols-2 2xl:grid-cols-3' : '')}>
            {consumers.map((c) => (
              <ConsumerCard key={c.id} c={c} />
            ))}
            {d.stranger && <StrangerCard s={d.stranger} />}
          </div>
        </div>
      </section>
    </div>
  );
}
