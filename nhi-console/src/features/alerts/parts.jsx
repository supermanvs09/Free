import { bandFor } from '../../lib/posture';
import { cn } from '../../ui/cn';

/* A drop is graded the way score services grade decreases: by size, and by
   whether it crossed into a worse band. */
export function dropSeverity(delta, bandBefore, bandNow) {
  const fell = Math.abs(Number(delta) || 0);
  const crossed = bandBefore && bandNow && String(bandBefore).toLowerCase() !== String(bandNow).toLowerCase();
  if (fell >= 20 || (crossed && String(bandNow).toLowerCase() === 'critical')) return { key: 'critical', label: 'Sharp drop', tone: 'critical' };
  if (fell >= 10 || crossed) return { key: 'high', label: 'Drop', tone: 'high' };
  return { key: 'medium', label: 'Slight drop', tone: 'medium' };
}

const TONE_TEXT = { low: 'text-low', medium: 'text-medium', high: 'text-high', critical: 'text-critical' };
const TONE_DOT = { low: 'bg-low', medium: 'bg-medium', high: 'bg-high', critical: 'bg-critical' };

/** "78 → 41", each number in its band's colour. */
export function ScoreShift({ before, now, size = 'md' }) {
  const b = bandFor(Number(before));
  const n = bandFor(Number(now));
  const big = size === 'lg';
  return (
    <span className={cn('inline-flex items-baseline gap-2 tabular-nums', big ? 'text-[40px] leading-none' : 'text-[15px]')} data-numeric="">
      <span className={cn('font-semibold text-ink-3 line-through decoration-1', big && 'text-[28px]')}>{before}</span>
      <span aria-hidden="true" className={cn('text-ink-3', big ? 'text-[22px]' : 'text-[12px]')}>
        →
      </span>
      <span className={cn('font-display font-bold', TONE_TEXT[n.tone])}>{now}</span>
      <span className="sr-only">
        from {before} ({b.label}) to {now} ({n.label})
      </span>
    </span>
  );
}

export function BandDot({ score, className }) {
  return <span className={cn('inline-block size-2 rounded-full', TONE_DOT[bandFor(Number(score)).tone], className)} />;
}

/** "stripe_key" → "Stripe key". */
export const detectorLabel = (d) => {
  const text = String(d || 'secret').replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/* "arn:aws:iam::444455556666:root" -> "account 444455556666"; else the last part. */
export function shortRef(v) {
  const text = String(v);
  const root = text.match(/^arn:aws[a-z-]*:iam::(\d{12}):root$/);
  return root ? `account ${root[1]}` : text.split(/[:/]/).filter(Boolean).pop();
}

export function actorOf(details) {
  const by = details?.by || details?.actor || details?.changed_by;
  return by ? String(by).split(/[:/]/).filter(Boolean).pop() : '';
}
