import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronDown, X } from 'lucide-react';
import { PROVIDERS } from '../data/world';
import { usePopover } from '../lib/hooks';
import { cn } from '../ui/cn';
import { AppLogo } from './Logo';

/** Application filter as a row of logo chips: the fastest way to slice an estate. */
export function ProviderFilter({ providers, value, onChange, counts = {} }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by application">
      <button type="button" onClick={() => onChange('')} aria-pressed={!value} className={cn('h-8 rounded-full border px-3 text-[12.5px] font-medium transition-colors', !value ? 'border-brand bg-info-soft text-brand' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}>
        All{counts.all !== undefined && <span className="ml-1.5 text-ink-3">{counts.all}</span>}
      </button>
      {providers.map((p) => (
        <button key={p} type="button" onClick={() => onChange(value === p ? '' : p)} aria-pressed={value === p} className={cn('inline-flex h-8 items-center gap-1.5 rounded-full border pr-3 pl-1 text-[12.5px] font-medium transition-colors', value === p ? 'border-brand bg-info-soft text-brand' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}>
          <AppLogo name={PROVIDERS[p].logo} size={24} />
          {PROVIDERS[p].short}
          {counts[p] !== undefined && <span className="text-ink-3">{counts[p]}</span>}
        </button>
      ))}
    </div>
  );
}

/** A compact multi-select dropdown for one facet. */
export function FacetSelect({ label, options, value = [], onChange, className }) {
  const [open, setOpen] = useState(false);
  const { wrapperRef, triggerRef, panelProps } = usePopover(open, () => setOpen(false));
  const active = value.length > 0;
  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button ref={triggerRef} type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn('inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-[12.5px] font-medium transition-colors', active ? 'border-brand/50 bg-info-soft text-brand' : 'border-line-strong bg-surface text-ink-2 hover:border-ink-3/50')}>
        {label}
        {active && <span className="rounded-full bg-brand px-1.5 text-[10.5px] leading-4 text-white">{value.length}</span>}
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </button>
      {open && (
        <div {...panelProps} className="animate-pop absolute left-0 z-50 mt-1 w-64 overflow-y-auto rounded-[12px] border border-line bg-surface p-1 shadow-lg">
          {options.map((o) => {
            const on = value.includes(o.value);
            return (
              <button key={o.value} type="button" onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-surface-2">
                <span className={cn('grid size-4 shrink-0 place-items-center rounded border', on ? 'border-brand bg-brand text-white' : 'border-line-strong')}>{on && <Check aria-hidden="true" className="size-3" />}</span>
                {o.icon}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.count !== undefined && <span className="text-[11px] text-ink-3">{o.count}</span>}
              </button>
            );
          })}
          {active && (
            <button type="button" onClick={() => onChange([])} className="mt-1 flex w-full items-center gap-1.5 border-t border-line px-2 pt-2 pb-1 text-[12px] font-medium text-brand">
              <X aria-hidden="true" className="size-3.5" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Sort + page a list held in memory. */
export function useTable(rows, { sort: initialSort, pageSize: initialSize = 25, getters = {} } = {}) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = getters[sort.key] || ((r) => r[sort.key]);
    const dir = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x > y ? 1 : x < y ? -1 : 0) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const pageRows = sorted.slice((page - 1) * pageSize, page * pageSize);
  return { sort, setSort: (s) => { setSort(s); setPage(1); }, page, setPage, pageSize, setPageSize: (n) => { setPageSize(n); setPage(1); }, rows: pageRows, total: rows.length };
}

/** `?open=ID` opens a record's drawer and keeps it in the address. */
export function useOpenParam(name = 'open') {
  const [params, setParams] = useSearchParams();
  const value = params.get(name);
  const set = (next) => {
    const p = new URLSearchParams(params);
    if (next) p.set(name, next);
    else p.delete(name);
    setParams(p, { replace: !next });
  };
  return [value, set];
}
