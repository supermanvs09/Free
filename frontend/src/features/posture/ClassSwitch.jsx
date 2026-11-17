import { Layers, UserRound, Workflow } from 'lucide-react';
import { formatNumber } from '../../lib/format';
import { ProportionBar } from '../../ui/Meter';
import { cn } from '../../ui/cn';

/**
 * Which identities this page is about: everyone, the people (HI) or the
 * workloads and keys (NHI). Three cards that act as one choice - the figures,
 * the quick wins and the list below all follow it - each showing how many there
 * are and what share of the whole, so the split is visible before choosing.
 */
const OPTIONS = [
  { value: '', label: 'All identities', hint: 'People and workloads together', icon: Layers, tag: 'All' },
  { value: 'HI', label: 'Human', hint: 'People who sign in', icon: UserRound, tag: 'HI' },
  { value: 'NHI', label: 'Non-human', hint: 'Workloads, keys and services', icon: Workflow, tag: 'NHI' },
];

export function ClassSwitch({ value, counts, onChange }) {
  const hi = counts?.HI ?? 0;
  const nhi = counts?.NHI ?? 0;
  const all = hi + nhi;
  const known = Boolean(counts);
  const count = (option) => (option.value === 'HI' ? hi : option.value === 'NHI' ? nhi : all);

  return (
    <div role="radiogroup" aria-label="Which identities" className="grid gap-3 sm:grid-cols-3">
      {OPTIONS.map((option, i) => {
        const active = option.value === value;
        const n = count(option);
        const share = all > 0 ? Math.round((n / all) * 100) : 0;
        return (
          <button
            key={option.value || 'all'}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            data-stagger=""
            style={{ '--stagger': i }}
            className={cn(
              'animate-rise group relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[var(--radius-panel)] border p-4 text-left transition-[border-color,box-shadow,background-color] duration-200 focus-visible:ring-2 focus-visible:ring-brand',
              active
                ? 'border-brand bg-info-soft/50 shadow-[0_0_0_3px_color-mix(in_srgb,var(--t-brand)_14%,transparent)]'
                : 'border-line bg-surface shadow-[var(--t-shadow-sm)] hover:border-line-strong',
            )}
          >
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-[10px] border transition-colors',
                  active ? 'border-brand/30 bg-brand text-white' : 'border-line bg-surface-2 text-ink-3 group-hover:text-ink-2',
                )}
              >
                <option.icon aria-hidden="true" className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-ink">{option.label}</span>
                  <span className={cn('rounded-full px-1.5 py-px text-[10px] font-bold tracking-wide', active ? 'bg-brand text-white' : 'bg-surface-3 text-ink-3')}>{option.tag}</span>
                </span>
                <span className="block truncate text-[11.5px] text-ink-3">{option.hint}</span>
              </span>
              <span data-numeric="" className="font-display text-[26px] leading-none font-extrabold tracking-[-0.03em] text-ink">
                {known ? formatNumber(n) : '-'}
              </span>
            </span>
            {option.value === '' ? (
              <ProportionBar
                height={6}
                total={all}
                ariaLabel="Split between human and non-human identities"
                segments={[
                  { key: 'hi', label: 'Human', value: hi, color: 'var(--t-series-2)' },
                  { key: 'nhi', label: 'Non-human', value: nhi, color: 'var(--t-series-1)' },
                ]}
              />
            ) : (
              <ProportionBar
                height={6}
                total={all}
                ariaLabel={`${share} percent of identities`}
                segments={[{ key: option.value, label: option.label, value: n, color: option.value === 'HI' ? 'var(--t-series-2)' : 'var(--t-series-1)' }]}
              />
            )}
            <span className="-mt-1 text-[11.5px] text-ink-3">
              {known && all > 0 ? (option.value === '' ? `${formatNumber(hi)} human · ${formatNumber(nhi)} non-human` : `${share}% of all identities`) : 'No identities scored yet'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
