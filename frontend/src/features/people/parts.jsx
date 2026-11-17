import { cn } from '../../ui/cn';
import { avatarHue, initialsOf } from './peopleMeta';

/** A person's initials on a tint that is the same every time you see them. */
export function Avatar({ name, seed, size = 36, className }) {
  const hue = avatarHue(seed ?? name);
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold select-none', className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `hsl(${hue} 70% 94%)`,
        color: `hsl(${hue} 55% 32%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 55% 82%)`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A share of a whole as a ring. The number in the middle is the reading. */
export function CoverageRing({ value, total, size = 92, stroke = 9, tone = 'var(--t-low)', label }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : null;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = pct === null ? 0 : (pct / 100) * circumference;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? (pct === null ? 'No data' : `${pct} percent`)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--t-track)" strokeWidth={stroke} />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            className="transition-[stroke-dasharray] duration-[900ms] ease-[var(--ease-out-quint)]"
          />
        )}
      </svg>
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center leading-none">
        <span data-numeric="" className="font-display text-[22px] font-extrabold tracking-[-0.03em] text-ink">
          {pct === null ? '-' : `${pct}%`}
        </span>
      </span>
    </span>
  );
}

/** One legend line: a swatch, a word, a number. */
export function LegendRow({ color, label, value }) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="text-ink-3">{label}</span>
      <span data-numeric="" className="ml-auto font-semibold text-ink">
        {value}
      </span>
    </div>
  );
}
