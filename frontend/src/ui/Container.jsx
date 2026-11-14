import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from './cn';

/**
 * The one content container, after Cloudscape's: a header that names what is
 * inside (with a count and actions that apply to all of it), a body, and an
 * optional footer that leads to the full view. Pages are built from these
 * rather than from loose cards, so every block reads the same way.
 */
export function Container({ title, counter, description, actions, children, flush = false, footer, footerTo, className, id, headerClassName }) {
  return (
    <section id={id} className={cn('@container min-w-0 rounded-[10px] border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5', headerClassName)}>
          <div className="min-w-0">
            <h2 className="flex items-baseline gap-1.5 text-[15px] leading-snug font-semibold text-ink">
              {title}
              {counter !== undefined && counter !== null && <span className="text-[14px] font-normal text-ink-3">({counter})</span>}
            </h2>
            {description && <p className="mt-0.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && 'p-5')}>{children}</div>
      {(footer || footerTo) && (
        <footer className="border-t border-line px-5 py-2.5 text-center">
          {footerTo ? (
            <Link to={footerTo} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline">
              {footer} <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          ) : (
            footer
          )}
        </footer>
      )}
    </section>
  );
}

/** Label over value, in columns: the summary block of a details page. */
export function KeyValues({ items, columns = 4, className }) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-4', { 2: '@min-[36rem]:grid-cols-2', 3: '@min-[36rem]:grid-cols-2 @min-[56rem]:grid-cols-3', 4: '@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-4' }[columns], className)}>
      {items.filter(Boolean).map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[12.5px] text-ink-3">{label}</dt>
          <dd className="mt-1 min-w-0 text-[13.5px] break-words text-ink">{value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Key metrics in one strip, divided by hairlines: a dashboard's top line. */
export function MetricStrip({ items, className }) {
  return (
    <div className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line @min-[52rem]:grid-cols-5', className)}>
      {items.map((m) => {
        const Tag = m.to ? Link : 'div';
        return (
          <Tag key={m.label} to={m.to} className={cn('group min-w-0 bg-surface px-5 py-4', m.to && 'transition-colors hover:bg-surface-2')}>
            <p className="text-[12.5px] text-ink-3">{m.label}</p>
            <p className="mt-1.5 flex items-baseline gap-2">
              <span data-numeric="" className={cn('text-[28px] leading-none font-semibold tracking-[-0.02em]', m.tone === 'bad' ? 'text-critical' : 'text-ink')}>{m.value}</span>
              {m.delta && <span className={cn('text-[12.5px]', m.deltaTone === 'good' ? 'text-low' : m.deltaTone === 'bad' ? 'text-critical' : 'text-ink-3')}>{m.delta}</span>}
            </p>
            <p className="mt-1.5 truncate text-[12px] text-ink-3">{m.caption}</p>
          </Tag>
        );
      })}
    </div>
  );
}
