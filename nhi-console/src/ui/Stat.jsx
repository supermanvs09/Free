import { ArrowUpRight } from 'lucide-react';
import { formatNumber } from '../lib/format';
import { Meter } from './Meter';
import { cn, TONE_FG, TONE_VAR } from './cn';

/**
 * Metric tile. The number is the loudest thing in the tile; the label,
 * denominator and meter exist to make it interpretable at a glance.
 * Tiles that lead somewhere render as links and say so on hover.
 *
 * Its type and padding run about 10% tighter than the rest of the console on
 * purpose: four of these sit in one row, and at that count the uppercase label
 * is what decides how narrow a readable tile can be.
 */
export function MetricTile({
  label,
  value,
  unit,
  caption,
  tone = 'brand',
  meter,
  meterLabel,
  /** Numbers for an inline history line, revealed on hover. Supplied only
      where the backend actually carries history for this measure. */
  sparkline,
  /** What the sparkline counts, for its legend ("identities"). */
  sparklineLabel,
  icon: Icon,
  as: Tag = 'div',
  className,
  ...rest
}) {
  /* The number is printed, not counted up to. An operator reads these figures
     dozens of times a day and needs to compare them against what they saw an
     hour ago; a 620ms roll-up delays every one of those reads and makes the
     digits unstable while it runs. Counting up is a first-impression effect on
     a screen nobody sees for the first time twice. */
  // null means "not known", which must not read as zero (Number(null) is 0).
  const numeric = value === null || value === undefined || value === '' ? NaN : Number(value);
  const display = Number.isFinite(numeric) ? formatNumber(numeric) : '-';
  const interactive = Tag !== 'div';

  return (
    <Tag
      className={cn(
        /* w-full h-full: a <button> tile sizes to its content otherwise and spills out of its grid cell. */
        'group relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-[var(--t-shadow-sm)] text-left',
        interactive &&
          'transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
      {...rest}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-medium text-ink-2">{label}</span>
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-[7px] border border-line bg-surface">
            <Icon aria-hidden="true" className={cn('size-3.5', TONE_FG[tone])} />
          </span>
        )}
        {interactive && !Icon && (
          <ArrowUpRight
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          />
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          data-numeric=""
          className="font-display text-[28px] leading-none font-semibold tracking-[-0.025em] text-ink"
        >
          {display}
        </span>
        {unit && <span className="text-[12px] font-medium text-ink-3">{unit}</span>}
      </div>

      {caption && <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">{caption}</p>}

      {/* Both small graphics say what they are, in a line under them and in
          a tooltip: an unlabelled line or bar left people guessing. */}
      {sparkline?.length > 1 && <SparklineWithLegend values={sparkline} tone={tone} unitLabel={sparklineLabel} />}

      {meter !== undefined && meter !== null && (
        <div className="mt-3" title={`${meterLabel || label}: ${Math.round(Number(meter) || 0)}%`}>
          <Meter value={meter} tone={tone} height={4} label={meterLabel || label} />
          <p className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-ink-3">
            <span className="truncate">{meterLabel || 'Share'}</span>
            <span data-numeric="" className="shrink-0 font-semibold text-ink-2">
              {formatPercent(meter)}
            </span>
          </p>
        </div>
      )}
    </Tag>
  );
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n < 1 && n > 0 ? n.toFixed(1) : Math.round(n)}%`;
}

function SparklineWithLegend({ values, tone, unitLabel }) {
  const numbers = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (numbers.length < 2) return null;
  const first = numbers[0];
  const last = numbers[numbers.length - 1];
  const delta = last - first;
  /* The dashboard's curves are cumulative by month first seen ("how many of
     today's identities existed by the end of each month"). */
  const legend = `Growth over ${numbers.length} months: ${formatNumber(first)} → ${formatNumber(last)}${unitLabel ? ` ${unitLabel}` : ''}, by the month each was first discovered`;
  return (
    <div className="mt-3" title={legend}>
      <Sparkline values={numbers} tone={tone} />
      <p className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-ink-3">
        <span className="truncate">Growth over {numbers.length} months</span>
        <span data-numeric="" className="shrink-0 font-semibold text-ink-2">
          {delta === 0 ? 'no change' : `${delta > 0 ? '+' : '−'}${formatNumber(Math.abs(delta))}`}
        </span>
      </p>
    </div>
  );
}

/**
 * History line for a metric tile. Recedes until the tile is hovered, so the
 * headline number stays the loudest thing in the tile. Rendered only where the
 * backend actually carries history for that measure.
 */
function Sparkline({ values, tone, className }) {
  const numbers = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (numbers.length < 2) return null;

  const max = Math.max(...numbers);
  const min = Math.min(...numbers);
  const span = max - min || 1;
  const points = numbers
    .map((value, index) => {
      const x = (index / (numbers.length - 1)) * 100;
      const y = 22 - ((value - min) / span) * 20;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      className={cn(
        'h-6 w-full opacity-40 transition-opacity duration-200 group-hover:opacity-100',
        className,
      )}
    >
      <polyline
        points={points}
        fill="none"
        stroke={TONE_VAR[tone]}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
