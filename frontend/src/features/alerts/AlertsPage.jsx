import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCheck, Dna, FileWarning, Fingerprint, GitCommitVertical, Radius, ShieldAlert } from 'lucide-react';
import { fetchAlerts, fetchIdentityAlert } from '../../lib/api/alerts';
import { fetchBlastRadius } from '../../lib/api/blastRadius';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { genomeRoute } from '../../lib/identityLinks';
import { useAccess } from '../../app/useAccess';
import { useWorkspace } from '../../app/WorkspaceContext';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { SearchInput } from '../../ui/Field';
import { ListSkeleton } from '../../ui/Skeleton';
import { ClearState, ErrorState } from '../../ui/States';
import { cn } from '../../ui/cn';
import { identityTypeLabel } from '../posture/parts';
import { ScoreShift, actorOf } from './parts';
import { useAlertReads } from './useAlertBadge';

/* ── Vocabulary ─────────────────────────────────────────────────────────── */

const SOURCES = {
  posture: {
    label: 'Score drops',
    icon: ShieldAlert,
    what: 'Score drop',
    hint: 'Identities whose posture score fell at the latest sync. Identities that were already low stay on the Posture page; they only appear here when they get worse.',
  },
  genome: { label: 'NHI Genome', icon: Dna, what: 'Behaviour anomaly', hint: 'Identities doing something their learned behaviour never showed.' },
  exposure: { label: 'Credential exposure', icon: FileWarning, what: 'Exposed credential', hint: 'Credentials found in code.' },
};
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SEV = {
  critical: { label: 'Critical', dot: 'bg-critical', soft: 'bg-critical-soft text-critical' },
  high: { label: 'High', dot: 'bg-high', soft: 'bg-high-soft text-high' },
  medium: { label: 'Medium', dot: 'bg-medium', soft: 'bg-medium-soft text-medium' },
  low: { label: 'Low', dot: 'bg-low', soft: 'bg-low-soft text-low' },
};
const VERIFIED = {
  verified: 'Yes - the credential works',
  unverified: 'Checked - did not work',
  unsupported: 'Cannot be checked automatically',
  unknown: 'Not checked yet',
};
const BLAST = { CRITICAL: 'text-critical', HIGH: 'text-high', MEDIUM: 'text-medium', LOW: 'text-low' };

/* A genome alert for an identity discovery no longer sees (or that is out of
   scope) has no identity page; its anomalies are still listed, so link there. */
const genomeMonitored = (a) => a.facts?.monitored !== 'false';
const linkOf = (a) =>
  a.source === 'genome' && a.facts
    ? genomeMonitored(a)
      ? `${genomeRoute(a.facts.source_type, a.facts.identity_name)}?tab=anomalies`
      : `/genome?tab=anomalies&q=${encodeURIComponent(a.facts.identity_name)}`
    : a.link;
const postureId = (a) => (a.source === 'posture' ? a.key.slice('posture:'.length) : null);

/* ── One row ────────────────────────────────────────────────────────────── */

function Row({ a, selected, onSelect, isNew, unread }) {
  const src = SOURCES[a.source];
  const sev = SEV[a.severity] ?? SEV.medium;
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn('relative flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3.5 transition-colors', selected ? 'bg-info-soft/55' : 'hover:bg-surface-2/70')}
    >
      {selected && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-brand" />}
      <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', sev.dot)} title={sev.label} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {unread && <span aria-label="Unread" className="size-1.5 shrink-0 rounded-full bg-brand" />}
          <span className={cn('truncate text-[13.5px]', unread ? 'font-semibold text-ink' : 'font-medium text-ink-2')}>{a.subject}</span>
          {isNew && <span className="shrink-0 rounded-full bg-brand px-1.5 text-[10px] font-semibold tracking-wide text-white uppercase">New</span>}
          <span className="ml-auto shrink-0 text-[11px] text-ink-3" title={formatDateTime(a.detected_at)}>
            {formatRelative(a.detected_at)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{a.title}</span>
        <span className="mt-1.5 flex items-center gap-2 text-[11.5px] text-ink-3">
          <src.icon className="size-3.5" />
          <span className="truncate">{src.label}</span>
        </span>
      </span>
    </div>
  );
}

/* ── Preview: what happened, why, and what to do ────────────────────────── */

function SectionTitle({ children }) {
  return <h3 className="mb-2.5 text-[11px] font-semibold tracking-[0.14em] text-ink-3 uppercase">{children}</h3>;
}

/** Posture: the checks that cost the points and the AWS changes behind them. */
function PostureWhy({ a }) {
  const id = postureId(a);
  const q = useQuery((signal) => fetchIdentityAlert(id, signal), [id]);
  const d = q.data;
  const subject = d ? d.credential_arn || (String(d.identity_arn).includes(':iam::') ? d.identity_arn : '') : '';
  const blast = useQuery((signal) => (subject ? fetchBlastRadius(subject, {}, signal) : Promise.resolve(null)), [subject]);
  const b = blast.data;
  return (
    <>
      <section className="rounded-[14px] border border-line p-4">
        <div className="flex items-baseline justify-between gap-3">
          <ScoreShift before={a.score_before} now={a.score_now} />
          {d?.checks_evaluated ? (
            <span className="text-[11.5px] text-ink-3" data-numeric="">
              {formatNumber(d.checks_failed)} of {formatNumber(d.checks_evaluated)} checks failing
            </span>
          ) : null}
        </div>
        {!d ? (
          <p className="mt-3 text-[12.5px] text-ink-3">{q.isError ? a.summary : 'Loading why…'}</p>
        ) : (
          <>
            {d.new_failing_checks.length > 0 && (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {d.new_failing_checks.slice(0, 4).map((c) => (
                  <li key={c.rule_id} className="flex items-start gap-3 py-2">
                    <span className={cn('mt-[6px] size-1.5 shrink-0 rounded-full', SEV[String(c.severity).toLowerCase()]?.dot ?? 'bg-ink-3')} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink">{c.title}</span>
                      {c.detail && <span className="block truncate text-[11.5px] text-ink-3" title={c.detail}>{c.detail}</span>}
                    </span>
                    <span data-numeric="" className="shrink-0 text-[13px] font-semibold text-critical">
                      −{formatNumber(c.points)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {d.inventory_changes.length > 0 && (
              <div className="mt-3 rounded-[10px] bg-surface-2/70 px-3 py-2.5">
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-ink-3">
                  <GitCommitVertical className="size-3.5" /> What changed in AWS
                </p>
                <ul className="flex flex-col gap-1">
                  {d.inventory_changes.slice(0, 3).map((c, i) => {
                    const by = actorOf(c.details);
                    return (
                      <li key={i} className="text-[12.5px] text-ink-2">
                        <span className="text-ink">{c.summary}</span>
                        <span className="text-ink-3">
                          {by ? ` · by ${by}` : ''} · {formatRelative(c.detected_at)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
      {b && (
        <section className="mt-3 flex items-center gap-3 rounded-[14px] border border-line px-4 py-3">
          <Radius className="size-4 shrink-0 text-ink-3" />
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
            If its role is taken over, an attacker reaches <span className="font-semibold text-ink">{formatNumber((b.reachable_resources ?? []).length)} resources</span>
            {(b.reachable_identities ?? []).length ? ` and can become ${formatNumber(b.reachable_identities.length)} more ${b.reachable_identities.length === 1 ? 'role' : 'roles'}` : ''}.
          </p>
          <span data-numeric="" className={cn('shrink-0 text-[15px] font-bold', BLAST[b.risk_level] ?? 'text-ink')} title="Blast radius score">
            {Number(b.blast_radius_score ?? 0).toFixed(1)}
          </span>
        </section>
      )}
      <Actions>
        <Button as={Link} to={a.link} size="sm" variant="primary" iconRight={ArrowUpRight}>
          Why it dropped, in full
        </Button>
        {d?.discovery_id && (
          <>
            <Button as={Link} to={`/identities/${encodeURIComponent(d.discovery_id)}?tab=blast`} size="sm" variant="secondary" icon={Radius}>
              Blast radius
            </Button>
            <Button as={Link} to={`/identities/${encodeURIComponent(d.discovery_id)}`} size="sm" variant="ghost" icon={Fingerprint}>
              Identity
            </Button>
          </>
        )}
      </Actions>
    </>
  );
}

function GenomeWhy({ a }) {
  return (
    <>
      <section className="rounded-[14px] border border-line p-4">
        <p className="text-[13px] text-ink-2">
          <span className="font-semibold text-ink" data-numeric="">
            {formatNumber(a.count)}
          </span>{' '}
          open {a.count === 1 ? 'departure' : 'departures'} from the behaviour it learned - {a.summary}.
        </p>
        {a.facts?.latest && (
          <p className="mt-3 rounded-[10px] bg-surface-2/70 px-3 py-2 text-[12.5px] text-ink-2">
            <span className="text-ink-3">Latest · </span>
            {a.facts.latest}
          </p>
        )}
        <p className="mt-3 text-[12px] text-ink-3">Each departure is behaviour this identity had never shown before. Check whether a deploy or config change explains it; if not, treat it as a possible takeover.</p>
      </section>
      <Actions>
        <Button as={Link} to={linkOf(a)} size="sm" variant="primary" iconRight={ArrowUpRight}>
          Investigate the departures
        </Button>
        {a.facts?.identity_name && genomeMonitored(a) && (
          <Button as={Link} to={genomeRoute(a.facts.source_type, a.facts.identity_name)} size="sm" variant="secondary" icon={Dna}>
            Its normal behaviour
          </Button>
        )}
      </Actions>
    </>
  );
}

function ExposureWhy({ a, pageOn }) {
  const f = a.facts ?? {};
  const rows = [
    ['Repository', a.subject],
    ['File', f.file ? `${f.file}${f.line && f.line !== '0' ? `:${f.line}` : ''}` : ''],
    ['Branch', f.branch],
    ['Commit', f.commit ? f.commit.slice(0, 10) : ''],
    ['Committed by', f.author],
    ['Value', f.redacted],
    ['Verified', VERIFIED[String(f.verification).toLowerCase()] ?? (f.verification ? f.verification.toLowerCase().replaceAll('_', ' ') : '')],
  ].filter(([, v]) => v);
  return (
    <>
      <section className="rounded-[14px] border border-line p-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 text-[12.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-3">{k}</dt>
              <dd className={cn('truncate text-ink', ['File', 'Commit', 'Value'].includes(k) && 'font-mono text-[12px]')} title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="mt-3 rounded-[14px] border border-line p-4">
        <SectionTitle>What to do</SectionTitle>
        <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[12.5px] text-ink-2 marker:text-ink-3">
          <li>Revoke or rotate the credential where it was issued. Deleting the file does not make it safe: it stays in the history.</li>
          <li>Check the provider's logs for use since it was committed{f.author ? ` by ${f.author}` : ''}.</li>
          <li>Move it to a secrets manager and remove it from the code.</li>
        </ol>
      </section>
      {pageOn && (
        <Actions>
          <Button as={Link} to={linkOf(a)} size="sm" variant="primary" iconRight={ArrowUpRight}>
            Open the finding
          </Button>
        </Actions>
      )}
    </>
  );
}

function Actions({ children }) {
  return <div className="mt-4 flex flex-wrap items-center gap-2">{children}</div>;
}

function Preview({ a, exposurePage }) {
  const src = SOURCES[a.source];
  const sev = SEV[a.severity] ?? SEV.medium;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="border-b border-line px-6 pt-5 pb-5">
        <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className={cn('rounded-full px-2 py-0.5 font-semibold', sev.soft)}>{sev.label}</span>
          <span className="flex items-center gap-1.5 text-ink-3">
            <src.icon className="size-3.5" /> {src.what}
          </span>
          <span className="text-ink-3" title={formatDateTime(a.detected_at)}>
            · detected {formatRelative(a.detected_at)}
          </span>
        </div>
        <h2 className="mt-3 text-[18px] leading-snug font-semibold text-ink">{a.title}</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          <span className="font-medium text-ink">{a.subject}</span>
          {a.subject_type ? ` · ${a.source === 'exposure' ? a.subject_type : identityTypeLabel(a.subject_type)}` : ''}
          {a.account_id ? ` · ${a.account_id}` : ''}
        </p>
      </header>

      <div className="px-6 py-5">
        <SectionTitle>{a.source === 'exposure' ? 'Where it was found' : 'Why'}</SectionTitle>
        {a.source === 'posture' && <PostureWhy a={a} />}
        {a.source === 'genome' && <GenomeWhy a={a} />}
        {a.source === 'exposure' && <ExposureWhy a={a} pageOn={exposurePage} />}

        <p className="mt-6 border-t border-line pt-4 text-[11.5px] text-ink-3">
          {src.label} raised this {formatRelative(a.detected_at)}. It leaves this list once the cause is fixed and the next sync no longer sees it.
        </p>
      </div>
    </div>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */

/**
 * Every alert from posture, NHI Genome and credential exposure in one
 * read-only list: what is new since the last sync, which identities carry
 * more than one signal, and for each one why and what to do.
 * ponytail: no status or comments (no tables of our own); an alert lasts as
 * long as its cause. Add triage back if teams need to mark work done.
 */
export default function AlertsPage() {
  const { can } = useAccess();
  const { exposureEnabled } = useWorkspace();
  /* Same rule as the Credential exposure page: shown once code scanning is on. */
  const showExposure = exposureEnabled && can('exposure.view');
  const [sources, setSources] = useState([]);
  const [sevs, setSevs] = useState([]);
  const [onlyNew, setOnlyNew] = useState(false);
  const [q, setQ] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const listRef = useRef(null);
  const { isUnread, markRead, markAllRead } = useAlertReads();

  const query = useQuery((signal) => fetchAlerts(signal), []);
  const prev = query.data?.summary?.previous_sync ? new Date(query.data.summary.previous_sync).getTime() : null;
  const isNew = (a) => prev !== null && new Date(a.detected_at).getTime() > prev;

  const all = useMemo(() => (query.data?.alerts ?? []).filter((a) => showExposure || a.source !== 'exposure'), [query.data, showExposure]);
  const newCount = all.filter(isNew).length;
  const unreadCount = all.filter(isUnread).length;
  /* Opening an alert reads it; the list keeps it, only its weight changes. */
  const open = (a) => {
    setSelectedKey(a.key);
    markRead(a);
  };

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(
      (a) =>
        (sources.length === 0 || sources.includes(a.source)) &&
        (sevs.length === 0 || sevs.includes(a.severity)) &&
        (!onlyNew || (prev !== null && new Date(a.detected_at).getTime() > prev)) &&
        (!term || [a.subject, a.title, a.summary, a.account_id].some((v) => String(v ?? '').toLowerCase().includes(term))),
    );
  }, [all, sources, sevs, onlyNew, prev, q]);
  const current = shown.find((a) => a.key === selectedKey) ?? shown[0] ?? null;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current?.key]);

  const countBy = (field, value) => all.filter((a) => a[field] === value).length;
  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const filtered = q || sources.length || sevs.length || onlyNew;
  const onKey = (e) => {
    if (e.target.closest('input')) return;
    const i = shown.findIndex((a) => a.key === current?.key);
    if ((e.key === 'j' || e.key === 'ArrowDown') && shown[i + 1]) {
      e.preventDefault();
      open(shown[i + 1]);
    } else if ((e.key === 'k' || e.key === 'ArrowUp') && shown[i - 1]) {
      e.preventDefault();
      open(shown[i - 1]);
    }
  };

  const lastSync = query.data?.summary?.last_sync;
  const lede = query.data
    ? [
        `${formatNumber(all.length)} ${all.length === 1 ? 'alert' : 'alerts'}`,
        newCount ? `${formatNumber(newCount)} new since the previous sync` : null,
        unreadCount ? `${formatNumber(unreadCount)} unread` : null,
      ]
        .filter(Boolean)
        .join(' · ') + (lastSync ? `. Last sync ${formatRelative(lastSync)}.` : '.')
    : 'Score drops, behaviour anomalies and exposed credentials in one place.';

  const chip = (on) => cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] transition-colors', on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink-2 hover:border-line-strong');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Alerts" lede={lede} />

      {query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : !query.data ? (
        <div className="rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)] p-4">
          <ListSkeleton rows={8} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput size="sm" value={q} onChange={setQ} placeholder="Search alerts" className="w-full sm:w-56" aria-label="Search alerts" />
            {newCount > 0 && (
              <>
                <button type="button" aria-pressed={onlyNew} onClick={() => setOnlyNew((v) => !v)} className={chip(onlyNew)}>
                  <span className={cn('size-1.5 rounded-full', onlyNew ? 'bg-surface' : 'bg-brand')} />
                  New since last sync
                  <span data-numeric="" className="font-semibold">
                    {newCount}
                  </span>
                </button>
                <span className="h-5 w-px bg-line" aria-hidden="true" />
              </>
            )}
            {Object.entries(SOURCES)
              .filter(([k]) => k !== 'exposure' || showExposure)
              .map(([k, src]) => {
                const on = sources.includes(k);
                const n = countBy('source', k);
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => toggle(sources, setSources, k)} className={chip(on)} disabled={!n && !on} title={src.hint}>
                    <src.icon className="size-3.5" />
                    {src.label}
                    <span data-numeric="" className="font-semibold">
                      {n}
                    </span>
                  </button>
                );
              })}
            <span className="h-5 w-px bg-line" aria-hidden="true" />
            {SEVERITIES.map((k) => {
              const on = sevs.includes(k);
              const n = countBy('severity', k);
              if (!n && !on) return null;
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => toggle(sevs, setSevs, k)} className={chip(on)}>
                  <span className={cn('size-1.5 rounded-full', SEV[k].dot)} />
                  {SEV[k].label}
                  <span data-numeric="" className="font-semibold">
                    {n}
                  </span>
                </button>
              );
            })}
          </div>

          <section className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)]" onKeyDown={onKey}>
            {shown.length === 0 ? (
              <ClearState
                title={filtered ? 'No alert matches' : 'All clear'}
                description={filtered ? 'Try another filter or search.' : 'Nothing needs attention. New alerts appear here after each sync.'}
              />
            ) : (
              <div className="flex h-[min(78vh,880px)] min-h-[560px]">
                <div
                  ref={listRef}
                  role="listbox"
                  tabIndex={0}
                  aria-label="Alerts"
                  className={cn('min-h-0 w-full shrink-0 overflow-y-auto border-r border-line outline-none lg:block lg:w-[420px]', mobileDetail ? 'hidden' : 'block')}
                >
                  <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-2 text-[11px] text-ink-3 backdrop-blur">
                    {formatNumber(shown.length)} · worst first
                    {unreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => markAllRead(all)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-brand hover:bg-info-soft"
                      >
                        <CheckCheck className="size-3.5" />
                        Mark all {formatNumber(unreadCount)} as read
                      </button>
                    ) : (
                      <span className="ml-auto">All read</span>
                    )}
                    <span className="hidden gap-1 sm:flex">
                      {['j', 'k'].map((k) => (
                        <kbd key={k} className="rounded border border-line px-1 font-mono text-[10px]">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                  {shown.map((a) => (
                    <Row
                      key={a.key}
                      a={a}
                      isNew={isNew(a)}
                      unread={isUnread(a)}
                      selected={a.key === current?.key}
                      onSelect={() => {
                        open(a);
                        setMobileDetail(true);
                      }}
                    />
                  ))}
                </div>
                <div className={cn('min-h-0 min-w-0 flex-1 flex-col lg:flex', mobileDetail ? 'flex' : 'hidden')}>
                  {mobileDetail && (
                    <button type="button" onClick={() => setMobileDetail(false)} className="border-b border-line px-6 py-2.5 text-left text-[12.5px] font-medium text-brand lg:hidden">
                      ← All alerts
                    </button>
                  )}
                  {current && (
                    <Preview
                      key={current.key}
                      a={current}
                      exposurePage={exposureEnabled}
                    />
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
