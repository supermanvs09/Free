import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Logo } from './kit.jsx';

/* NHI Security for AWS, at a glance: one AWS account, the services its
   machine identities reach, and the one finding that matters. The lines draw,
   a key travels along each, the over-privileged role is flagged with what to
   do, the fix is applied and the card turns green. Then it plays again.
   Names and numbers are illustrative. */

const TILES = [
  { k: 'lambda', x: 16, y: 20, label: 'Lambda' },
  { k: 's3', x: 82, y: 17, label: 'S3' },
  { k: 'github', x: 86, y: 47, label: 'GitHub' },
  { k: 'rds', x: 15, y: 79, label: 'RDS' },
];
const C = { x: 46, y: 50 }; // the AWS account, in % of the picture
const W = 500, H = 400;
const px = (p) => [(p.x / 100) * W, (p.y / 100) * H];
const curve = (a, b) => { const [x1, y1] = px(a), [x2, y2] = px(b); return `M${x1} ${y1} C${x1} ${y2}, ${x1} ${y2}, ${x2} ${y2}`; };
const STEPS = [700, 900, 900, 1300, 900, 3200];

export function NhiMap() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [k, setK] = useState(5);
  useEffect(() => {
    if (reduce || !seen) { setK(5); return undefined; }
    let i = 0, t;
    const next = () => { setK(i); t = setTimeout(() => { i = (i + 1) % STEPS.length; next(); }, STEPS[i]); };
    next();
    return () => clearTimeout(t);
  }, [seen, reduce]);
  const fixed = k >= 5;
  return (
    <figure ref={ref} className="nm relative mx-auto aspect-[5/4] w-full max-w-[560px]" aria-label="Illustration: an AWS account in the centre, with lines to Lambda, S3, RDS and GitHub. One IAM role, ecs-notify-svc, is flagged: it can use 214 permissions but has used 9 in 90 days. Remove unused access is pressed and 205 permissions are removed.">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        {TILES.map((t, i) => (
          <g key={t.k}>
            <path id={`nm-p${i}`} d={curve(C, t)} pathLength="1" fill="none" stroke="rgb(190 215 255 / .55)" strokeWidth="1.6" className={cx('nhm-line', k >= 1 && 'on')} style={{ transitionDelay: `${i * 120}ms` }} />
            {k >= 2 && !reduce && <circle r="4" fill="#7fdcff"><animateMotion dur="2.4s" repeatCount="indefinite" begin={`${i * 0.3}s`}><mpath href={`#nm-p${i}`} /></animateMotion></circle>}
          </g>
        ))}
        {/* the line to the finding */}
        <path d={`M${(C.x / 100) * W} ${(C.y / 100) * H} V ${0.66 * H} Q ${(C.x / 100) * W} ${0.7 * H} ${(C.x / 100) * W + 20} ${0.7 * H} H ${0.56 * W}`} fill="none" stroke={fixed ? '#4be29a' : '#ff8b7e'} strokeWidth="1.8" strokeDasharray="5 4" className={cx('nhm-dash', k >= 3 && 'on')} />
      </svg>

      {/* key glyphs on the lines, as access the identities hold */}
      {[[31, 24], [64, 18], [70, 47], [30, 76]].map(([x, y], i) => (
        <span key={i} aria-hidden="true" className={cx('nhm-key absolute grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-[#0b2a5c] text-[#bfe6ff]', k >= 1 && 'on')} style={{ left: `${x}%`, top: `${y}%`, transitionDelay: `${300 + i * 120}ms` }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="5" cy="8" r="2.6" /><path d="M7.6 8H14M12 8v2.2M14 8v1.6" /></svg>
        </span>
      ))}

      {TILES.map((t, i) => (
        <span key={t.k} className={cx('nhm-tile absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center', k >= 0 && 'on')} style={{ left: `${t.x}%`, top: `${t.y}%`, transitionDelay: `${i * 90}ms` }}>
          <span className="grid h-[52px] w-[52px] place-items-center rounded-[14px] bg-white text-[#12171f] shadow-[0_14px_30px_-12px_rgba(0,0,0,.6)] max-sm:h-11 max-sm:w-11"><Logo k={t.k} size="58%" /></span>
          <span className="mt-1.5 text-[12px] font-medium text-white/80">{t.label}</span>
        </span>
      ))}

      <span className="absolute grid h-[84px] w-[84px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[22px] bg-white text-[#12171f] shadow-[0_22px_50px_-16px_rgba(0,0,0,.7)] max-sm:h-16 max-sm:w-16" style={{ left: `${C.x}%`, top: `${C.y}%` }}>
        <Logo k="aws" size="62%" />
      </span>

      {/* the finding, then the fix */}
      <div className={cx('nhm-card absolute bottom-[3%] right-0 w-[48%] min-w-[220px] rounded-[16px] p-4 text-white shadow-[0_24px_50px_-18px_rgba(0,0,0,.75)] transition-colors duration-500', k >= 3 && 'on', fixed ? 'bg-[#14a06a]' : 'bg-[#f0644d]')}>
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">{fixed ? <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" /> : <><path d="M10 3 18 17H2L10 3z" /><path d="M10 8.5v3.5M10 14.6v.1" strokeLinecap="round" /></>}</svg>
          {fixed ? 'Unused access removed' : 'IAM role · ecs-notify-svc'}
        </p>
        <p className="mt-1.5 text-[13.5px] leading-snug text-white/90">{fixed ? '205 permissions it never used are gone. Nothing it needs was touched.' : 'Can use 214 permissions. Used 9 in the last 90 days.'}</p>
        <span className={cx('mt-3 block rounded-[9px] bg-white px-3 py-2 text-center text-[13.5px] font-semibold transition-transform', fixed ? 'text-[#14a06a]' : 'text-[#d9442c]', k === 4 && 'scale-95')}>{fixed ? 'Evidence saved from CloudTrail' : 'Remove 205 unused permissions'}</span>
      </div>
    </figure>
  );
}
