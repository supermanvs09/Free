import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { CopyButton } from '../../ui/Copyable';
import { cn } from '../../ui/cn';
import { ProviderIcon } from '../../ui/ProviderIcon';

/**
 * Small pieces the AWS setup screens share: copy chips that sit inside an
 * instruction, code blocks, numbered steps, disclosures and provider marks.
 */

/** Clipboard write with a selection fallback for non-secure origins. */
export async function copyText(value) {
  const text = String(value ?? '');
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the selection fallback */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** A value inline in a sentence that copies on click - placed exactly where the console asks for it. */
export function CopyChip({ value, label, className }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!value) return null;
  const copy = async (event) => {
    event.stopPropagation();
    const ok = await copyText(value);
    setCopied(ok);
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : 'Click to copy'}
      aria-label={copied ? `Copied ${label ?? value}` : `Copy ${label ?? value}`}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 align-middle font-mono text-[12px] transition-colors',
        copied ? 'border-low/40 bg-low-soft text-low' : 'border-line bg-inset text-ink hover:border-line-strong hover:bg-surface-3',
        className,
      )}
    >
      <span className="min-w-0 text-left break-all">{value}</span>
      {copied ? (
        <Check aria-hidden="true" className="size-3 shrink-0" />
      ) : (
        <Copy aria-hidden="true" className="size-3 shrink-0 text-ink-3" />
      )}
    </button>
  );
}

export function CodeBlock({ code, copyLabel, className, maxHeight = 'max-h-80' }) {
  return (
    <div className={cn('relative mt-2', className)}>
      <pre
        className={cn(
          'overflow-auto rounded-[var(--radius-control)] border border-line bg-inset p-3 pr-11 font-mono text-[11.5px] leading-relaxed text-ink-2',
          maxHeight,
        )}
      >
        {code}
      </pre>
      <CopyButton value={code} label={copyLabel} className="absolute top-2 right-2 border border-line bg-surface" />
    </div>
  );
}

/** Numbered instructions; each value sits where the console asks for it. */
export function Instructions({ items }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {items.filter(Boolean).map((item, index) => (
        <li key={index} className="flex gap-3 text-[13px] leading-relaxed text-ink-2 [&_b]:font-semibold [&_b]:text-ink">
          <span
            aria-hidden="true"
            data-numeric=""
            className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-surface-3 text-[11px] font-semibold text-ink-3"
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function Disclosure({ label, children, defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn('mt-3.5', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1 text-left text-[12.5px] font-medium text-brand hover:underline"
      >
        <ChevronDown aria-hidden="true" className={cn('size-3.5 shrink-0 transition-transform', open ? 'rotate-0' : '-rotate-90')} />
        {label}
      </button>
      {open && (
        <div id={id} className="animate-fade">
          {children}
        </div>
      )}
    </div>
  );
}


const GLYPH = { sm: 15, md: 18, lg: 22 };

/** The application marks, drawn small with their real brand glyphs. */
export function AwsMark({ size = 'md', className }) {
  return <ProviderIcon provider="aws" size={GLYPH[size] ?? 18} tile className={className} />;
}

/** CodeCommit: AWS's developer-tools blue, with a branch glyph. */
export function CodeCommitMark({ size = 'md', className }) {
  const px = (GLYPH[size] ?? 18) + 14;
  return (
    <span role="img" aria-label="AWS CodeCommit" className={cn('grid shrink-0 place-items-center rounded-[8px] border border-line bg-surface text-[#527fff]', className)} style={{ width: px, height: px }}>
      <svg viewBox="0 0 24 24" aria-hidden="true" width={GLYPH[size] ?? 18} height={GLYPH[size] ?? 18} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="5" r="2.2" />
        <circle cx="6" cy="19" r="2.2" />
        <circle cx="18" cy="8" r="2.2" />
        <path d="M6 7.2v9.6" />
        <path d="M18 10.2c0 4-6.5 3.2-11 6.6" />
      </svg>
    </span>
  );
}

export function GitHubMark({ size = 'md', className }) {
  return <ProviderIcon provider="github" size={GLYPH[size] ?? 18} tile className={className} />;
}

export function BitbucketMark({ size = 'md', className }) {
  return <ProviderIcon provider="bitbucket" size={GLYPH[size] ?? 18} tile className={className} />;
}
