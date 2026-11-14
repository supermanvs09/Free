import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import { formatRelative, formatDateTime } from '../../lib/format';
import { ProviderIcon } from '../../ui/ProviderIcon';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';

export const STATUS = {
  connected: { label: 'Connected', tone: 'low', dot: 'bg-low' },
  action_needed: { label: 'Action needed', tone: 'medium', dot: 'bg-medium' },
  not_connected: { label: 'Finish setup', tone: 'info', dot: 'bg-brand' },
  off: { label: 'Off', tone: 'neutral', dot: 'bg-ink-3/50' },
};

export function StatusDot({ status, className }) {
  return <span aria-hidden="true" className={cn('inline-block size-1.5 shrink-0 rounded-full', STATUS[status]?.dot ?? 'bg-ink-3', className)} />;
}

export function StatusTag({ status }) {
  const meta = STATUS[status] ?? STATUS.off;
  return (
    <Tag tone={meta.tone} size="sm" dot>
      {meta.label}
    </Tag>
  );
}

/** One application's section header inside its tab. */
export function AppHeader({ app, children, actions }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <ProviderIcon provider={app.key} size={20} tile />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{app.name}</h2>
            <StatusTag status={app.status} />
          </div>
          <p className="mt-0.5 max-w-2xl text-[12.5px] leading-relaxed text-ink-3">{children ?? app.summary}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const CHECK_ICON = {
  pass: { Icon: CheckCircle2, cls: 'text-low' },
  fail: { Icon: XCircle, cls: 'text-critical' },
  running: { Icon: Loader2, cls: 'text-brand animate-spin' },
  skipped: { Icon: CircleDashed, cls: 'text-ink-3' },
};

export function CheckRows({ checks = [], className }) {
  if (!checks.length) return null;
  return (
    <ul className={cn('flex flex-col divide-y divide-line rounded-[var(--radius-control)] border border-line', className)}>
      {checks.map((check) => {
        const meta = CHECK_ICON[check.state] ?? CHECK_ICON.skipped;
        return (
          <li key={check.key} className="flex items-start gap-2.5 px-3 py-2.5">
            <meta.Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', meta.cls)} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-medium text-ink">{check.label}</span>
              <span className="block text-[12px] text-ink-3">{check.message}</span>
              {check.fix && <span className="mt-1 block text-[12px] text-medium">Fix: {check.fix}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-control)] bg-surface-2 px-3.5 py-3">
      <p className="truncate text-[11.5px] text-ink-3">{label}</p>
      <p data-numeric="" className="mt-0.5 text-[19px] leading-tight font-semibold tracking-[-0.01em] text-ink">
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

export function When({ at, prefix = '' }) {
  if (!at) return <span className="text-ink-3">Never</span>;
  return (
    <span title={formatDateTime(at)}>
      {prefix}
      {formatRelative(at)}
    </span>
  );
}

/** Sent alerts for one channel, newest first. */
export function DeliveryLog({ rows, empty }) {
  if (!rows?.length) return <p className="rounded-[var(--radius-control)] border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-ink-3">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-control)] border border-line">
      <table className="w-full min-w-[640px] text-left text-[12.5px]">
        <thead className="bg-surface-2 text-[11px] text-ink-3">
          <tr>
            <th className="px-3 py-2 font-medium">When</th>
            <th className="px-3 py-2 font-medium">Alert</th>
            <th className="px-3 py-2 font-medium">To</th>
            <th className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.id} className="align-top">
              <td className="px-3 py-2.5 whitespace-nowrap text-ink-2">
                <When at={row.at} />
              </td>
              <td className="px-3 py-2.5">
                <span className="flex items-start gap-1.5">
                  <SevDot severity={row.severity} />
                  <span className="text-ink">{row.title}</span>
                </span>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-ink-2" title={row.to}>
                {row.to}
              </td>
              <td className="px-3 py-2.5">
                {row.status === 'sent' ? (
                  <span className="text-low">
                    {row.issue_url ? (
                      <a className="underline-offset-2 hover:underline" href={row.issue_url} target="_blank" rel="noreferrer">
                        {row.message}
                      </a>
                    ) : (
                      row.message
                    )}
                  </span>
                ) : (
                  <span className="text-critical">{row.message}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SEV = { CRITICAL: 'bg-critical', HIGH: 'bg-high', MEDIUM: 'bg-medium', LOW: 'bg-low' };
export function SevDot({ severity }) {
  return <span aria-hidden="true" className={cn('mt-[6px] size-1.5 shrink-0 rounded-full', SEV[String(severity).toUpperCase()] ?? 'bg-ink-3')} />;
}

export const SEVERITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical only' },
  { value: 'HIGH', label: 'High and above' },
  { value: 'MEDIUM', label: 'Medium and above' },
  { value: 'LOW', label: 'Everything' },
];

export const EVENT_KINDS = [
  { key: 'exposure', label: 'Exposed credentials', hint: 'A secret of one of your identities found in a repository' },
  { key: 'anomaly', label: 'Behaviour anomalies', hint: 'An identity departs from the behaviour NHI Genome learned' },
  { key: 'posture', label: 'Posture drops', hint: 'An identity’s score falls into a worse band' },
  { key: 'scan', label: 'New identities', hint: 'A discovery scan finds identities that were not there before' },
];
