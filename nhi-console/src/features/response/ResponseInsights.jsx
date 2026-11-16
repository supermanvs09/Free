import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Ban, CheckCircle2, Dna, FileCode2, GitCommitHorizontal, KeyRound, Radar, ShieldAlert, ShieldCheck, Sparkles, Unlink, UserRound, Wand2 } from 'lucide-react';
import { breakLink, deactivateKey, fetchInsights, fetchLeastPrivilege, onResponseChange, rightSize } from '../../lib/api/response';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatNumber, formatRelative } from '../../lib/format';
import { genomeRouteFor } from '../../lib/identityLinks';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Overlay';
import { ProviderIcon } from '../../ui/ProviderIcon';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';

/**
 * What can be done about this identity right now, at the top of its page:
 * a key found in code, admin access it barely uses, a role chain to admin,
 * behaviour NHI Genome just flagged. Each card shows the evidence, what it
 * exposes, one action, and the result in place once someone takes it.
 *
 * A presenter can drive a card from the address bar (`?act=`), so a live
 * scenario shows the same clicks a person would make.
 */
export function ResponseInsights({ identity }) {
  const [params, setParams] = useSearchParams();
  const act = params.get('act');
  const query = useQuery((signal) => fetchInsights(identity.id, signal), [identity.id]);
  const { refetch } = query;
  useEffect(() => onResponseChange(refetch), [refetch]);
  const done = useCallback(() => {
    if (!params.get('act')) return;
    const next = new URLSearchParams(params);
    next.delete('act');
    setParams(next, { replace: true });
  }, [params, setParams]);

  const d = query.data;
  if (!d || (!d.exposure && !d.overprivilege && !d.escalation && !d.anomaly)) return null;
  /* One story at a time: a leaked key outranks how much access it has. */
  return (
    <div className="flex flex-col gap-4">
      {d.exposure && <ExposureCard data={d.exposure} identity={identity} act={act} onActed={done} reload={refetch} />}
      {d.anomaly && <AnomalyCard data={d.anomaly} identity={identity} act={act} onActed={done} reload={refetch} />}
      {d.escalation && act !== 'quiet' && <EscalationCard data={d.escalation} identity={identity} act={act} onActed={done} reload={refetch} />}
      {d.overprivilege && !d.exposure && <OverprivilegeCard data={d.overprivilege} identity={identity} act={act} onActed={done} reload={refetch} />}
    </div>
  );
}

/* ── Shared pieces ──────────────────────────────────────────────────────── */

function Card({ tone, highlight, children, label }) {
  return (
    <section
      aria-label={label}
      className={cn(
        'animate-rise overflow-hidden rounded-[var(--radius-panel)] border bg-surface shadow-[var(--t-shadow-sm)]',
        tone === 'critical' ? 'border-critical/35' : tone === 'resolved' ? 'border-low/35' : 'border-high/35',
        highlight && 'animate-attention',
      )}
    >
      {children}
    </section>
  );
}

function CardHead({ tone, icon: Icon, eyebrow, title, live, right }) {
  const resolved = tone === 'resolved';
  return (
    <header className={cn('flex flex-wrap items-start gap-3 border-b px-5 py-4', resolved ? 'border-low/20 bg-low-soft/50' : tone === 'critical' ? 'border-critical/15 bg-critical-soft/40' : 'border-high/15 bg-high-soft/40')}>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-[10px]', resolved ? 'bg-low-soft text-low' : tone === 'critical' ? 'bg-critical-soft text-critical' : 'bg-high-soft text-high')}>
        <Icon aria-hidden="true" className="size-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] uppercase', resolved ? 'text-low' : tone === 'critical' ? 'text-critical' : 'text-high')}>
          {live && !resolved && (
            <span className="relative flex size-2">
              <span className="live-ping absolute inline-flex size-full rounded-full bg-[var(--t-critical,#b42318)] opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--t-critical,#b42318)]" />
            </span>
          )}
          {eyebrow}
        </span>
        <span className="mt-0.5 block text-[16px] leading-snug font-semibold text-ink">{title}</span>
      </span>
      {right}
    </header>
  );
}

function Resolved({ title, children }) {
  return (
    <div className="animate-pop flex items-start gap-3 rounded-[var(--radius-control)] border border-low/30 bg-low-soft px-4 py-3">
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-low" />
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-low">{title}</p>
        <div className="mt-0.5 text-[12.5px] text-ink-2">{children}</div>
      </div>
    </div>
  );
}

function Stat({ value, label, tone }) {
  return (
    <div className="min-w-0">
      <p data-numeric="" className={cn('font-display text-[22px] leading-none font-bold', tone === 'critical' ? 'text-critical' : tone === 'low' ? 'text-low' : 'text-ink')}>
        {value}
      </p>
      <p className="mt-1 text-[11.5px] text-ink-3">{label}</p>
    </div>
  );
}

/* Runs once when a presenter cue arrives. */
function useCue(act, name, fn) {
  const fired = useRef(null);
  useEffect(() => {
    if (act === name && fired.current !== act) {
      fired.current = act;
      const t = setTimeout(fn, 450);
      return () => clearTimeout(t);
    }
    if (act !== name) fired.current = null;
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, name]);
}

/* ── 1. A key found in code ─────────────────────────────────────────────── */

function ExposureCard({ data, identity, act, onActed, reload }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const off = data.status !== 'active';
  const deactivate = async () => {
    if (off || busy) return;
    setBusy(true);
    try {
      const r = await deactivateKey(data.credential_id);
      setResult(r);
      notify({ variant: 'success', title: 'Access key deactivated', description: `${data.access_key_id} can no longer sign in. Blast radius ${formatNumber(r.before.resources)} → 0 resources.` });
      reload();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not deactivate the key', description: error?.message });
    } finally {
      setBusy(false);
      onActed();
    }
  };
  useCue(act, 'deactivate', deactivate);
  const before = result?.before ?? data.blast;
  const lines = [
    [10, '# deploy pipeline (hotfix)', ''],
    [11, 'AWS_REGION=ap-south-1', ''],
    [12, `AWS_ACCESS_KEY_ID=${data.redacted}`, 'hit'],
    [13, 'AWS_SECRET_ACCESS_KEY=****************************************', 'hit'],
    [14, 'ECS_CLUSTER=payments-prod', ''],
  ];
  return (
    <Card tone={off ? 'resolved' : 'critical'} label="Exposed access key" highlight={act === 'map'}>
      <CardHead
        tone={off ? 'resolved' : 'critical'}
        icon={off ? ShieldCheck : KeyRound}
        live
        eyebrow={off ? 'Contained' : `Exposed credential · found ${formatRelative(data.found_at)}`}
        title={off ? `${data.access_key_id} is deactivated` : `Access key ${data.access_key_id} was committed to ${data.repository}`}
        right={
          <span className={cn('rounded-full px-2.5 py-1 text-[11.5px] font-semibold', off ? 'bg-low-soft text-low' : 'bg-critical-soft text-critical')}>
            {off ? 'Inactive' : 'Active key'}
          </span>
        }
      />
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Where it was found */}
        <div className="min-w-0">
          <div className="overflow-hidden rounded-[10px] border border-line bg-surface-2">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[11.5px] text-ink-2">
              <ProviderIcon provider="github" size={13} decorative />
              <span className="truncate font-medium">{data.repository}</span>
              <span className="text-ink-3">·</span>
              <FileCode2 aria-hidden="true" className="size-3.5 text-ink-3" />
              <span className="truncate font-mono text-[11px]">{data.file_path}</span>
            </div>
            <pre className="overflow-x-auto py-1.5 font-mono text-[11.5px] leading-[1.7]">
              {lines.map(([n, text, hit]) => (
                <div key={n} className={cn('flex px-3', hit && (off ? 'bg-low-soft/60' : 'bg-critical-soft/70'))}>
                  <span className="w-7 shrink-0 text-right text-ink-3 select-none">{n}</span>
                  <span className={cn('pl-3', hit ? (off ? 'text-low line-through decoration-low/60' : 'font-semibold text-critical') : 'text-ink-2')}>{text}</span>
                </div>
              ))}
            </pre>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
            <GitCommitHorizontal aria-hidden="true" className="size-3.5" />
            <span className="font-mono">{data.commit_id?.slice(0, 7)}</span>
            <span>“{data.commit_message}”</span>
            <span>· {String(data.author).split(' <')[0]}</span>
            <span>· {data.branch}</span>
          </p>
        </div>

        {/* What it opens */}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">Mapped to</p>
          <ol className="mt-2 flex flex-wrap items-center gap-2">
            {[
              { icon: KeyRound, label: data.access_key_id, sub: 'Access key' },
              { icon: UserRound, label: identity.name, sub: 'IAM user' },
              { icon: ShieldAlert, label: 'AdministratorAccess', sub: 'Attached policy', danger: data.identity_admin },
              { icon: Radar, label: `${before.accounts} AWS accounts`, sub: `${formatNumber(before.resources)} resources`, danger: true },
            ].map((step, i) => (
              <Fragment key={step.label}>
                {i > 0 && <ArrowRight aria-hidden="true" className={cn('size-4 shrink-0', off ? 'text-ink-3' : 'text-critical')} />}
                <li
                  className={cn('animate-hop flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5', off ? 'border-line bg-surface-2 opacity-60' : step.danger ? 'border-critical/30 bg-critical-soft/60' : 'border-line bg-surface')}
                  style={{ animationDelay: `${i * 260}ms` }}
                >
                  <step.icon aria-hidden="true" className={cn('size-4 shrink-0', step.danger && !off ? 'text-critical' : 'text-ink-3')} />
                  <span className="min-w-0">
                    <span className="block truncate font-mono text-[12px] font-semibold text-ink">{step.label}</span>
                    <span className="block text-[10.5px] text-ink-3">{step.sub}</span>
                  </span>
                </li>
              </Fragment>
            ))}
          </ol>
          {!off ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3 rounded-[10px] border border-line px-4 py-3">
                <Stat value={before.score?.toFixed?.(1) ?? before.score} label="Blast radius of 10" tone="critical" />
                <Stat value={formatNumber(before.sensitive)} label="Secrets, keys, PII" tone="critical" />
                <Stat value={formatNumber(before.roles)} label="Roles it can become" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="danger" icon={Ban} loading={busy} onClick={deactivate}>
                  Deactivate key
                </Button>
                <Button variant="ghost" as={Link} to={`/identities/${identity.id}?tab=blast`}>
                  See the blast radius
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <Resolved title="Rotated before attackers reach it">
                Deactivated {formatRelative(data.deactivated_at)}
                {data.deactivated_by ? ` by ${data.deactivated_by}` : ''}. Blast radius {formatNumber(before.resources)} → <b className="text-low">0</b> resources, {before.accounts} → <b className="text-low">0</b> accounts.
              </Resolved>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── 2. Administrator access it barely uses ────────────────────────────── */

function OverprivilegeCard({ data, identity, act, onActed, reload }) {
  const [open, setOpen] = useState(false);
  const [autoApply, setAutoApply] = useState(false);
  const sized = data.right_sized;
  useCue(act, 'lp', () => {
    setOpen(true);
    onActed();
  });
  useCue(act, 'lp-apply', () => {
    setAutoApply(true);
    setOpen(true);
    onActed();
  });
  const cells = Array.from({ length: data.services_granted }, (_, i) => i < data.services_used);
  return (
    <Card tone={sized ? 'resolved' : 'critical'} label="Over-privileged" highlight={act === 'usage'}>
      <CardHead
        tone={sized ? 'resolved' : 'critical'}
        icon={sized ? ShieldCheck : ShieldAlert}
        eyebrow={sized ? 'Right-sized' : 'Over-privileged'}
        title={sized ? `${data.role_name} now has only what it uses` : data.public ? 'This internet-facing server’s role has full admin' : `${data.role_name} has full admin and barely uses it`}
      />
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cn('min-w-0', act === 'usage' && 'animate-attention rounded-[10px]')}>
          <div className="flex items-end gap-3">
            <p data-numeric="" className={cn('font-display text-[44px] leading-none font-bold', sized ? 'text-low' : 'text-critical')}>
              {sized ? '100%' : `${data.utilization_pct}%`}
            </p>
            <p className="pb-1 text-[12.5px] leading-snug text-ink-2">
              {sized ? 'of what it holds is used' : (
                <>
                  of its access used: <b className="text-ink">{data.services_used}</b> of {data.services_granted} AWS services granted by <span className="font-mono">{data.policy}</span>
                </>
              )}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-[repeat(25,minmax(0,1fr))] gap-1" aria-hidden="true">
            {cells.map((used, i) => (
              <span key={i} className={cn('h-3 rounded-[3px]', used ? 'bg-brand' : sized ? 'bg-surface-3 opacity-40' : 'bg-critical/20')} />
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Used in 90 days of CloudTrail: {data.used_services.map((s) => <span key={s} className="mr-1 rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{s}</span>)}
          </p>
          {data.imds && data.public && !sized && (
            <p className="mt-3 rounded-[10px] border border-critical/25 bg-critical-soft/50 px-3 py-2 text-[12.5px] text-ink-2">
              <b className="text-critical">Reachable from the internet, {data.imds.version} on.</b> One server-side request forgery in the web app reads this role’s credentials from the instance metadata service: an attacker gets full admin.
            </p>
          )}
        </div>
        <div className="min-w-0">
          {sized ? (
            <Resolved title="The role can only do its job now">
              Right-sized {formatRelative(sized.at)}
              {sized.by_name ? ` by ${sized.by_name}` : ''}. Blast radius {formatNumber(sized.before?.resources)} → <b className="text-low">{formatNumber(sized.after?.resources)}</b> resources (−
              {sized.before?.resources ? Math.round(((sized.before.resources - sized.after.resources) / sized.before.resources) * 100) : 0}%).
            </Resolved>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 rounded-[10px] border border-line px-4 py-3">
                <Stat value={data.blast.score.toFixed(1)} label="Blast radius of 10" tone="critical" />
                <Stat value={formatNumber(data.blast.resources)} label="Resources it reaches" tone="critical" />
                <Stat value={formatNumber(data.blast.sensitive)} label="Secrets, keys, PII" />
              </div>
              <p className="mt-3 text-[12.5px] text-ink-2">One app flaw exposes the whole account. Replace AdministratorAccess with a policy built from what it actually called.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" icon={Wand2} onClick={() => setOpen(true)}>
                  Generate least-privilege policy
                </Button>
                <Button variant="ghost" as={Link} to={`/identities/${identity.id}?tab=blast`}>
                  See the blast radius
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      {open && (
        <LeastPrivilegeModal
          identity={identity}
          autoApply={autoApply}
          onClose={() => {
            setOpen(false);
            setAutoApply(false);
          }}
          onApplied={() => {
            reload();
          }}
        />
      )}
    </Card>
  );
}

function LeastPrivilegeModal({ identity, autoApply, onClose, onApplied }) {
  const { notify } = useToast();
  const query = useQuery((signal) => fetchLeastPrivilege(identity.id, signal), [identity.id]);
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  /* The comparison stays as it was shown: once applied, a fresh read would
     compare the new policy with itself. */
  const first = useRef(null);
  if (query.data && !first.current) first.current = query.data;
  const lp = first.current;
  const apply = useCallback(async () => {
    if (busy || applied) return;
    setBusy(true);
    try {
      await rightSize(identity.id);
      setApplied(true);
      notify({ variant: 'success', title: 'Least-privilege policy applied', description: `${identity.name}: blast radius ${lp?.before.resources} → ${lp?.after.resources} resources.` });
      onApplied();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not apply the policy', description: error?.message });
    } finally {
      setBusy(false);
    }
  }, [busy, applied, identity.id, identity.name, lp, notify, onApplied]);
  useEffect(() => {
    if (autoApply && lp && !applied) {
      const t = setTimeout(apply, 2600);
      return () => clearTimeout(t);
    }
    /* Presented: once applied, step back so the result shows on the page. */
    if (autoApply && applied) {
      const t = setTimeout(onClose, 2400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [autoApply, lp, applied, apply, onClose]);

  return (
    <Modal
      open
      onClose={onClose}
      icon={Sparkles}
      title="Least-privilege policy"
      description={lp ? `Built from ${lp.based_on}. Replaces ${lp.replaces.join(', ')}.` : 'Reading what it actually used…'}
      footer={
        applied ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={ShieldCheck} loading={busy} disabled={!lp} onClick={apply}>
              Apply policy
            </Button>
          </>
        )
      }
    >
      {!lp ? (
        <p className="py-6 text-center text-[12.5px] text-ink-3">Computing…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-[10px] border border-line px-4 py-3">
            <div>
              <p className="text-[11px] text-ink-3">Today</p>
              <p data-numeric="" className="font-display text-[26px] leading-none font-bold text-critical">
                {formatNumber(lp.before.resources)}
              </p>
              <p className="text-[11px] text-ink-3">resources · score {lp.before.score.toFixed(1)}</p>
            </div>
            <ArrowRight aria-hidden="true" className="size-5 text-ink-3" />
            <div>
              <p className="text-[11px] text-ink-3">With this policy</p>
              <p data-numeric="" className="font-display text-[26px] leading-none font-bold text-low">
                {formatNumber(lp.after.resources)}
              </p>
              <p className="text-[11px] text-ink-3">resources · score {lp.after.score.toFixed(1)}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold text-ink">Blast radius drops {lp.reduction_pct}%</span>
              <span className="text-ink-3">{applied ? 'Applied' : 'Preview'}</span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-critical/20">
              <div
                className="h-full rounded-full bg-low transition-[width] duration-1000"
                style={{ width: `${Math.max(2, 100 - lp.reduction_pct)}%` }}
              />
            </div>
          </div>
          <pre className="max-h-56 overflow-auto rounded-[10px] border border-line bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">{JSON.stringify(lp.policy, null, 2)}</pre>
          {applied && <Resolved title="Applied">AdministratorAccess detached; {lp.policy_name} attached.</Resolved>}
        </div>
      )}
    </Modal>
  );
}

/* ── 3. A role chain to administrator access ───────────────────────────── */

function EscalationCard({ data, identity, act, onActed, reload }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [play, setPlay] = useState(0);
  const path = data.paths[0] ?? data.through[0] ?? null;
  const closed = data.closed[0] ?? null;
  const open = Boolean(path);
  const first = path?.links[0];
  useCue(act, 'chain', () => setPlay((n) => n + 1));
  const remove = async () => {
    if (!first || busy) return;
    setBusy(true);
    try {
      await breakLink(first.id);
      notify({ variant: 'success', title: 'Escalation path closed', description: `${first.from} is no longer in the trust policy of ${first.to}.` });
      reload();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not change the trust policy', description: error?.message });
    } finally {
      setBusy(false);
      onActed();
    }
  };
  useCue(act, 'break', remove);

  const nodes = path?.identities ?? (closed ? [{ name: closed.from }, { name: closed.to }] : []);
  return (
    <Card tone={open ? 'critical' : 'resolved'} label="Privilege escalation path" highlight={act === 'flag'}>
      <CardHead
        tone={open ? 'critical' : 'resolved'}
        icon={open ? ShieldAlert : ShieldCheck}
        eyebrow={open ? 'Privilege escalation path' : 'Path closed'}
        title={open ? `${path.identities[0].name} can assume its way to administrator access` : `${closed.from} can no longer reach ${closed.to}`}
        right={open ? <span className="rounded-full bg-critical-soft px-2.5 py-1 text-[11.5px] font-semibold text-critical">{path.links.length} hops to admin</span> : null}
      />
      <div className="px-5 py-5">
        <ol key={play} className="flex flex-wrap items-stretch gap-y-3" aria-label="Role chain">
          {nodes.map((n, i) => {
            const isAdmin = n.is_admin;
            const self = n.id === identity.id;
            const link = path?.links[i];
            return (
              <Fragment key={`${n.name}-${i}`}>
                <li className="animate-hop" style={{ animationDelay: `${i * 700}ms` }}>
                  <div className={cn('flex h-full min-w-[180px] flex-col justify-center rounded-[12px] border-2 px-3.5 py-2.5', isAdmin && open ? 'border-critical bg-critical-soft/60' : self ? 'border-brand bg-info-soft/60' : 'border-line bg-surface')}>
                    <span className="flex items-center gap-2">
                      <ProviderIcon provider="aws" size={14} decorative />
                      <span className="truncate font-mono text-[13px] font-semibold text-ink">{n.name}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-[11px]">
                      {isAdmin ? <span className="rounded-full bg-critical px-1.5 py-px font-semibold text-white">AdministratorAccess</span> : <span className="rounded-full bg-surface-3 px-1.5 py-px font-medium text-ink-2">{i === 0 ? 'read-only' : 'limited'}</span>}
                      {self && <span className="text-brand">this identity</span>}
                    </span>
                  </div>
                </li>
                {i < nodes.length - 1 && (
                  <li aria-hidden="true" className="animate-hop flex min-w-[96px] flex-1 flex-col items-center justify-center px-2" style={{ animationDelay: `${i * 700 + 350}ms` }}>
                    <span className={cn('text-[10.5px] font-semibold tracking-wide uppercase', !open && i === 0 ? 'text-low' : 'text-critical')}>{!open && i === 0 ? 'trust removed' : 'can assume'}</span>
                    <span className={cn('relative mt-1 block h-[3px] w-full rounded-full', !open && i === 0 ? 'bg-low/40' : 'edge-flow text-critical')}>
                      {!open && i === 0 && <Unlink className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface p-0.5 text-low" />}
                    </span>
                    {link && <span className="mt-1 line-clamp-2 max-w-[220px] text-center text-[10.5px] text-ink-3">{link.why.replace(/^Trust policy of /, 'trusted by ')}</span>}
                  </li>
                )}
              </Fragment>
            );
          })}
        </ol>

        {open ? (
          <div className={cn('mt-5 grid gap-4 rounded-[12px] border border-line bg-surface-2 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center', act === 'fix' && 'animate-attention')}>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-3 uppercase">One fix closes the path</p>
              <p className="mt-1 text-[13.5px] font-semibold text-ink">
                Remove <span className="font-mono">{first.from}</span> from the trust policy of <span className="font-mono">{first.to}</span>
              </p>
              <p className="mt-0.5 text-[12px] text-ink-3">{first.why}. Nothing has assumed it through this trust in 90 days; {first.to} keeps the rest of its access.</p>
            </div>
            <Button variant="danger" icon={Unlink} loading={busy} onClick={remove}>
              Remove trust
            </Button>
          </div>
        ) : (
          <div className="mt-5">
            <Resolved title="Escalation path closed">
              {closed.from} was removed from the trust policy of {closed.to} {formatRelative(closed.at)}
              {closed.by_name ? ` by ${closed.by_name}` : ''}. No route from this role to administrator access remains.
            </Resolved>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── 5. Behaviour NHI Genome just flagged ──────────────────────────────── */

function AnomalyCard({ data, identity, act, onActed, reload }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const contained = data.contained;
  const genome = genomeRouteFor(identity);
  const contain = async () => {
    if (contained || busy) return;
    setBusy(true);
    try {
      await rightSize(identity.id);
      notify({ variant: 'success', title: 'Restricted to its baseline', description: `${identity.name} can no longer read what it never used.` });
      reload();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not restrict it', description: error?.message });
    } finally {
      setBusy(false);
      onActed();
    }
  };
  useCue(act, 'contain', contain);
  const baseline = String(data.change?.baseline ?? '').replace(/ only$/, '');
  return (
    <Card tone={contained ? 'resolved' : 'critical'} label="Behaviour anomaly" highlight={act === 'detect'}>
      <CardHead
        tone={contained ? 'resolved' : 'critical'}
        icon={contained ? ShieldCheck : Dna}
        live
        eyebrow={contained ? 'Contained' : `Detected in real time · ${formatRelative(data.detected_at)}`}
        title={contained ? `${identity.name} is restricted to its baseline` : `${identity.name} is doing something it never has`}
      />
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-[13.5px] leading-relaxed text-ink-2">{data.description}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-[10px] border border-line px-3 py-2.5">
              <p className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Learned normal · 14 days</p>
              <p className="mt-1 text-[12.5px] text-ink">{baseline}</p>
            </div>
            <div className={cn('rounded-[10px] border px-3 py-2.5', contained ? 'border-line' : 'border-critical/35 bg-critical-soft/50')}>
              <p className={cn('text-[11px] font-semibold tracking-[0.1em] uppercase', contained ? 'text-ink-3' : 'text-critical')}>Now</p>
              <p className="mt-1 font-mono text-[12.5px] text-ink">
                {data.change?.value} · {formatNumber(data.anomalous_event_count)} reads
              </p>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          {contained ? (
            <Resolved title="Flagged and contained before data left">
              Restricted {formatRelative(contained.at)}
              {contained.by_name ? ` by ${contained.by_name}` : ''}. It keeps what it used in its baseline; KYC documents are no longer reachable.
            </Resolved>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 rounded-[10px] border border-line px-4 py-3">
                <Stat value={`${data.risk_score}`} label="Risk of 100" tone="critical" />
                <Stat value={`${data.model_confidence_percent}%`} label="Model confidence" />
                <Stat value={formatNumber(data.blast.resources)} label="Resources it reaches" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="danger" icon={Ban} loading={busy} onClick={contain}>
                  Restrict to its baseline
                </Button>
                {genome && (
                  <Button variant="ghost" as={Link} to={`${genome}?tab=anomalies`} icon={Dna}>
                    Open in NHI Genome
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
