import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bot, CheckCircle2, CircleDashed, FileJson, Hand, Lock, RotateCcw, ShieldCheck, Sparkles, UserCheck, Zap } from 'lucide-react';
import { fetchAccountSetup, fetchRemediationAccount, updateRemediationAccount, validateRemediationAccount } from '../../lib/api/remediation';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatRelative } from '../../lib/format';
import { useAccess } from '../../app/useAccess';
import { Button } from '../../ui/Button';
import { CopyableValue } from '../../ui/Copyable';
import { Switch } from '../../ui/Switch';
import { DetailSkeleton } from '../../ui/Skeleton';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { CodeBlock, Disclosure } from './parts';

/*
 * One AWS account's remediation: whether the platform may fix things in it
 * (One-click), whether the rule engine's auto-remediation plans run here,
 * the role it assumes to do so, and the exact documents to put in place.
 */

/* A policy document as the client pastes it. */
export function PolicyCard({ title, note, document, defaultOpen = false, badge }) {
  const json = typeof document === 'string' ? document : JSON.stringify(document, null, 2);
  return (
    <div className="rounded-[12px] border border-line bg-surface">
      <Disclosure
        defaultOpen={defaultOpen}
        label={
          <span className="flex min-w-0 items-center gap-2">
            <FileJson aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
            <span className="truncate text-[13px] font-semibold text-ink">{title}</span>
            {badge && <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">{badge}</span>}
          </span>
        }
        className="mt-0 px-3.5 py-2.5"
      >
        {note && <p className="mb-2 text-[12px] text-ink-3">{note}</p>}
        <CodeBlock code={json} copyLabel="Copy JSON" />
      </Disclosure>
    </div>
  );
}

const FLOW = {
  one: [
    { icon: Hand, title: 'You choose the fix', text: 'On a finding, pick One-click. The plan shows the exact change and its pre-checks.' },
    { icon: UserCheck, title: 'An approver approves', text: 'Someone other than you. Safe fixes below Critical go straight through.' },
    { icon: Zap, title: 'The platform applies it', text: 'ispm-remediator assumes NHIPlatformRemediator with this account’s External ID and makes the change.' },
    { icon: RotateCcw, title: 'Verified, and reversible', text: 'Each AWS call is logged with its request id; Roll back restores the snapshot taken before.' },
  ],
  auto: [
    { icon: Sparkles, title: 'A scan finds it', text: 'After each sync the rule engine checks its auto-remediation policies.' },
    { icon: Bot, title: 'The engine drafts a plan', text: 'Created by auto:<policy>, it waits in Remediation → Approvals.' },
    { icon: UserCheck, title: 'An approver approves', text: 'Approve or reject like any plan; dry-run policies only record what they would change.' },
    { icon: RotateCcw, title: 'The engine runs it', text: 'Same role, same audit trail, same Roll back button.' },
  ],
};

function Flow({ title, tone, items, on }) {
  return (
    <div className={cn('rounded-[12px] border p-3.5', on ? 'border-line bg-surface' : 'border-dashed border-line bg-surface-2/40')}>
      <p className="flex items-center justify-between gap-2 text-[13px] font-semibold text-ink">
        {title}
        <Tag tone={on ? tone : 'neutral'} size="sm" dot={on}>
          {on ? 'On' : 'Off'}
        </Tag>
      </p>
      <ol className="mt-2.5 flex flex-col gap-2">
        {items.map((s, k) => (
          <li key={s.title} className="flex gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
              <s.icon aria-hidden="true" className="size-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ink">
                {k + 1}. {s.title}
              </span>
              <span className="block text-[11.5px] leading-snug text-ink-3">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AccountRemediation({ accountId }) {
  const { can } = useAccess();
  const { notify } = useToast();
  const admin = can('integrations.operate');
  const q = useQuery((signal) => fetchRemediationAccount(accountId, signal), [accountId]);
  const setup = useQuery((signal) => fetchAccountSetup(accountId, signal), [accountId]);
  const [busy, setBusy] = useState('');
  const a = q.data;
  if (!a) return <DetailSkeleton rows={6} />;

  const toggle = async (on) => {
    setBusy('toggle');
    try {
      await updateRemediationAccount(accountId, { enabled: on, roleArn: a.roleArn || `arn:aws:iam::${accountId}:role/NHIPlatformRemediator`, allowedActionTypes: a.allowedActionTypes, enabledRegions: a.enabledRegions.length ? a.enabledRegions : ['ap-south-1'] });
      notify({ variant: 'success', title: on ? 'One-click is on' : 'One-click is off', description: `For account ${accountId}.` });
      await q.refetch();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not change One-click', description: error?.message });
    } finally {
      setBusy('');
    }
  };
  const validate = async () => {
    setBusy('validate');
    try {
      await validateRemediationAccount(accountId);
      await q.refetch();
      notify({ variant: 'success', title: 'Remediation access checked', description: 'The role was assumed and its permissions are in place.' });
    } finally {
      setBusy('');
    }
  };

  const checks = a.checks ?? [];
  return (
    <div className="flex flex-col gap-4">
      {/* Status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-line p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold text-ink">One-click remediation</p>
              <p className="text-[11.5px] text-ink-3">The platform applies an approved fix in this account.</p>
            </div>
            <Switch checked={a.enabled} busy={busy === 'toggle'} disabled={!admin} onChange={toggle} label={`${a.enabled ? 'Turn off' : 'Turn on'} One-click for ${accountId}`} />
          </div>
        </div>
        <div className="rounded-[12px] border border-line p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[13px] font-semibold text-ink">Auto-remediation</p>
              <p className="text-[11.5px] text-ink-3">Plans the rule engine drafts after each scan, approved in Remediation.</p>
            </div>
            <Tag tone={a.autoEnabled ? 'low' : 'neutral'} size="sm" dot={a.autoEnabled}>
              {a.autoEnabled ? 'On' : 'Off'}
            </Tag>
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-3">
            <Lock aria-hidden="true" className="size-3" /> Managed by the rule engine’s policies
          </p>
        </div>
      </div>

      {/* How it works */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Flow title="How One-click works" tone="brand" items={FLOW.one} on={a.enabled} />
        <Flow title="How auto-remediation works" tone="low" items={FLOW.auto} on={a.autoEnabled} />
      </div>

      {/* Role and checks */}
      <div className="rounded-[12px] border border-line p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            <ShieldCheck aria-hidden="true" className="size-4 text-ink-3" /> Remediation access
            <Tag tone={a.accessStatus === 'OK' ? 'low' : a.accessStatus === 'NOT_CONFIGURED' ? 'neutral' : 'critical'} size="sm" dot>
              {a.accessStatus === 'OK' ? 'OK' : a.accessStatus === 'NOT_CONFIGURED' ? 'Not set up' : a.accessStatus}
            </Tag>
          </p>
          <span className="flex items-center gap-2 text-[11.5px] text-ink-3">
            {a.accessCheckedAt && `Checked ${formatRelative(a.accessCheckedAt)}`}
            {admin && a.roleArn && (
              <Button size="sm" variant="secondary" loading={busy === 'validate'} onClick={validate}>
                Validate
              </Button>
            )}
          </span>
        </div>
        <dl className="mt-2.5 grid gap-2 text-[12.5px] sm:grid-cols-[150px_minmax(0,1fr)]">
          <dt className="text-ink-3">Role it assumes</dt>
          <dd className="min-w-0">{a.roleArn ? <CopyableValue value={a.roleArn} /> : <span className="text-ink-3">Not set</span>}</dd>
          <dt className="text-ink-3">Assumed by</dt>
          <dd className="min-w-0">
            <CopyableValue value={setup.data?.worker_principal ?? 'arn:aws:iam::884264984984:user/ispm-remediator'} />
          </dd>
          <dt className="text-ink-3">External ID</dt>
          <dd>{a.remediation_external_id ? <CopyableValue value={a.remediation_external_id} /> : <span className="text-ink-3">Generated when One-click is turned on</span>}</dd>
          <dt className="text-ink-3">Regions</dt>
          <dd className="text-ink-2">{a.enabledRegions.join(', ') || '-'}</dd>
          <dt className="text-ink-3">Approvals needed</dt>
          <dd className="text-ink-2">
            {Object.entries(a.approval_policy ?? {})
              .map(([k, v]) => `${k.toLowerCase()} ${v}`)
              .join(' · ')}
          </dd>
          <dt className="text-ink-3">Fixes allowed</dt>
          <dd className="flex flex-wrap gap-1">
            {a.allowedActionTypes.length ? (
              a.allowedActionTypes.map((t) => (
                <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                  {t}
                </span>
              ))
            ) : (
              <span className="text-ink-3">None</span>
            )}
          </dd>
        </dl>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 rounded-[8px] bg-surface-2/60 px-2.5 py-2">
              {c.state === 'pass' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-low" /> : <CircleDashed aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />}
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-ink">{c.label}</span>
                {c.message && <span className="block text-[11px] text-ink-3">{c.message}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* The documents */}
      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Policies to put in place</p>
        {(setup.data?.policies ?? []).map((p, k) => (
          <PolicyCard key={p.key} title={p.title} note={p.note} document={p.document} defaultOpen={k === 0} badge={k === 2 ? 'platform side' : 'in this account'} />
        ))}
      </div>

      <Link to="/remediation?tab=approvals" className="inline-flex items-center gap-1 self-start text-[12.5px] font-medium text-brand hover:underline">
        Open Remediation → Approvals <ArrowRight aria-hidden="true" className="size-3.5" />
      </Link>
    </div>
  );
}
