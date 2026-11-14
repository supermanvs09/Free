import { cn } from './cn';

/** An on/off switch. `label` names it for assistive tech when no visible label is next to it. */
export function Switch({ checked, onChange, disabled, label, size = 'md', className, busy = false }) {
  const sm = size === 'sm';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={(event) => {
        event.stopPropagation();
        onChange?.(!checked);
      }}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[var(--t-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60',
        sm ? 'h-[18px] w-[30px]' : 'h-[22px] w-[38px]',
        checked ? 'border-brand bg-brand' : 'border-line-strong bg-surface-3',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-150',
          sm ? 'size-[12px] left-[2px]' : 'size-[16px] left-[2px]',
          checked && (sm ? 'translate-x-[12px]' : 'translate-x-[16px]'),
          busy && 'animate-pulse',
        )}
      />
    </button>
  );
}
