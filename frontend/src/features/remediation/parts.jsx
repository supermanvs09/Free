import { Fragment, useState } from 'react';
import { ChevronDown, Download, Terminal, MousePointerClick, FileCode2, Check } from 'lucide-react';
import { CopyButton } from '../../ui/Copyable';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { severityMeta } from '../../lib/domain';
import { riskMeta } from './meta';

/* Guided plan statuses as the guide names them (GUIDED_DASHBOARD_FRONTEND.md §6). */
export const GUIDED_STATUS = {
  READY: { label: 'To do', tone: 'info' },
  DRAFT: { label: 'Needs input', tone: 'neutral' },
  WAITING_EXTERNAL: { label: 'Waiting for the vendor', tone: 'brand' },
  MANUALLY_DONE: { label: 'Done by hand, waiting for the scan', tone: 'medium' },
  RESOLVED: { label: 'Fixed', tone: 'low' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  SUPERSEDED: { label: 'Replaced by a newer plan', tone: 'neutral' },
};
export const guidedStatus = (s) => GUIDED_STATUS[s] ?? { label: s ? s.replace(/_/g, ' ').toLowerCase() : 'Unknown', tone: 'neutral' };

export function PlanStatusTag({ status, size = 'sm' }) {
  const m = guidedStatus(status);
  return (
    <Tag tone={m.tone} size={size} dot>
      {m.label}
    </Tag>
  );
}

export function SeverityTag({ severity, size = 'sm' }) {
  const m = severityMeta(severity);
  return (
    <Tag tone={m.tone} size={size} dot>
      {m.label}
    </Tag>
  );
}

export function RiskTag({ risk }) {
  if (!risk) return null;
  const m = riskMeta(risk);
  return <Tag tone={m.tone} size="sm">{m.label}</Tag>;
}

/** Text with <values to choose> highlighted, so they are replaced before running. */
export function Placeholders({ text }) {
  const parts = String(text ?? '').split(/(<[^<>]{1,80}>)/g);
  return parts.map((part, i) =>
    /^<[^<>]+>$/.test(part) ? (
      <mark key={i} className="rounded bg-[color-mix(in_oklab,var(--t-medium)_22%,transparent)] px-1 text-inherit" title="Replace this with your own value">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** A command or file: monospace, scrolls sideways, with Copy (and Download for a file). */
export function CodeBlock({ code, label, filename, className }) {
  const text = typeof code === 'string' ? code : JSON.stringify(code, null, 2);
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className={cn('overflow-hidden rounded-[var(--radius-control)] border border-line bg-inset', className)}>
      {(label || filename) && (
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
          <span className="truncate text-[11.5px] font-medium text-ink-3">{label || filename}</span>
          <span className="ml-auto flex items-center gap-1">
            {filename && (
              <button type="button" onClick={download} className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label={`Download ${filename}`} title={`Download ${filename}`}>
                <Download aria-hidden="true" className="size-3.5" />
              </button>
            )}
            <CopyButton value={text} size="sm" label={`Copy ${filename || 'command'}`} />
          </span>
        </div>
      )}
      <pre className="max-h-80 overflow-auto px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
        <Placeholders text={text} />
      </pre>
    </div>
  );
}

function StepLine({ icon: Icon, label, children }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3">
      <span className="flex items-center gap-1.5 pt-1 text-[11.5px] font-medium text-ink-3">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Numbered steps (§3.2 E): title, then AWS console path, AWS CLI (copy) and
 * Terraform (collapsed), each only when present. With `checked`/`onCheck` the
 * steps get a tick box each (plan page progress, kept in the browser).
 */
export function StepList({ steps, checked, onCheck }) {
  const [openIac, setOpenIac] = useState(() => new Set());
  if (!steps?.length) return <p className="text-[12.5px] text-ink-3">No steps were given for this fix.</p>;
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const done = Boolean(checked?.[i]);
        const only = !step.console && !step.cli && !step.iac;
        return (
          <li key={i} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-8 bottom-0 left-[13px] w-px bg-line" />}
            {onCheck ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={`Step ${i + 1} done`}
                onClick={() => onCheck(i, !done)}
                className={cn(
                  'relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border text-[12px] font-bold transition-colors',
                  done ? 'border-low bg-low text-white' : 'border-line-strong bg-surface text-ink-2 hover:border-brand',
                )}
              >
                {done ? <Check aria-hidden="true" className="size-4" /> : i + 1}
              </button>
            ) : (
              <span className="relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border border-brand/30 bg-info-soft text-[12px] font-bold text-brand">{i + 1}</span>
            )}
            <div className={cn('min-w-0 flex-1 pt-0.5', done && 'opacity-60')}>
              <p className={cn('text-[13.5px] font-semibold text-ink', only && 'font-medium text-ink-2')}>
                <Placeholders text={step.title} />
              </p>
              {!only && (
                <div className="mt-2 flex flex-col gap-2">
                  {step.console && (
                    <StepLine icon={MousePointerClick} label="AWS console">
                      <p className="pt-0.5 text-[12.5px] text-ink-2">
                        <Placeholders text={step.console} />
                      </p>
                    </StepLine>
                  )}
                  {step.cli && (
                    <StepLine icon={Terminal} label="AWS CLI">
                      <div className="flex items-start gap-1 rounded-[var(--radius-control)] border border-line bg-inset py-1.5 pr-1 pl-3">
                        <code className="min-w-0 flex-1 overflow-x-auto py-0.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-ink-2">
                          <Placeholders text={step.cli.split(/;\s*/).join(';\n')} />
                        </code>
                        <CopyButton value={step.cli} size="sm" label="Copy command" />
                      </div>
                    </StepLine>
                  )}
                  {step.iac && (
                    <StepLine icon={FileCode2} label="Terraform">
                      <button
                        type="button"
                        onClick={() => setOpenIac((s) => new Set(s.has(i) ? [...s].filter((x) => x !== i) : [...s, i]))}
                        className="flex items-center gap-1 pt-0.5 text-[12.5px] font-medium text-brand"
                        aria-expanded={openIac.has(i)}
                      >
                        <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', !openIac.has(i) && '-rotate-90')} />
                        {openIac.has(i) ? 'Hide' : 'Show'} Terraform
                      </button>
                      {openIac.has(i) && <CodeBlock className="mt-1.5" code={step.iac} label="Terraform" />}
                    </StepLine>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The few labelled facts of a header (rule, identity, account, resource). */
export function FactRow({ items }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {items.filter(Boolean).map(({ label, value, copy }) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px] font-medium tracking-[0.06em] text-ink-3 uppercase">{label}</dt>
          <dd className="mt-0.5 flex min-w-0 items-center gap-1 text-[13px] text-ink">
            <span className={cn('truncate', copy && 'font-mono text-[12.5px]')} title={typeof value === 'string' ? value : undefined}>
              {value}
            </span>
            {copy && <CopyButton value={copy} size="sm" label={`Copy ${label.toLowerCase()}`} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}
