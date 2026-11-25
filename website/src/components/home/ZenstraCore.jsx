import { useRef } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';

/* The Zenstra core, after the signature picture on zenstra.ai: the Zenstra
   star inside mechanical rings that turn slowly at different speeds.
   Nothing else: no labels, no ticker. Still under reduced motion. */

const C = 300;
const STAR = 'M0 -1 C0.16 -0.16 0.16 -0.16 1 0 C0.16 0.16 0.16 0.16 0 1 C-0.16 0.16 -0.16 0.16 -1 0 C-0.16 -0.16 -0.16 -0.16 0 -1 Z';
const pos = (a, r) => [C + Math.cos((a * Math.PI) / 180) * r, C + Math.sin((a * Math.PI) / 180) * r];

export default function ZenstraCore() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.2 });
  const reduce = useReducedMotion();
  return (
    <figure ref={ref} className={cx('zc', inView && !reduce && 'run')} aria-label="The Zenstra core: one policy engine at the centre of every agent action.">
      <svg viewBox="0 0 600 600" className="zc-svg" aria-hidden="true">
        <defs>
          <radialGradient id="zc-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#2f9bff" stopOpacity=".5" /><stop offset=".5" stopColor="#1360c9" stopOpacity=".12" /><stop offset="1" stopColor="#0b2a6b" stopOpacity="0" /></radialGradient>
          <radialGradient id="zc-disc" cx="50%" cy="42%" r="60%"><stop offset="0" stopColor="#103a80" /><stop offset="1" stopColor="#050f24" /></radialGradient>
          <linearGradient id="zc-star" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e6f6ff" /><stop offset=".45" stopColor="#6cc7ff" /><stop offset="1" stopColor="#1f6fe0" /></linearGradient>
          <filter id="zc-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle cx={C} cy={C} r="300" fill="url(#zc-glow)" />
        <g className="zc-r zc-r1">
          <circle cx={C} cy={C} r="272" className="zc-line" />
          {Array.from({ length: 90 }, (_, i) => {
            const [x1, y1] = pos(i * 4, i % 9 === 0 ? 256 : 264); const [x2, y2] = pos(i * 4, 272);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i % 9 === 0 ? 'zc-tick big' : 'zc-tick'} />;
          })}
        </g>
        <g className="zc-r zc-r2"><circle cx={C} cy={C} r="222" className="zc-seg" /><circle cx={C} cy={C} r="222" className="zc-seg-edge" /></g>
        <g className="zc-r zc-r3"><circle cx={C} cy={C} r="182" className="zc-dash" /></g>
        <g className="zc-r zc-r4"><circle cx={C} cy={C} r="150" className="zc-arc" /></g>
        <circle cx={C} cy={C} r="108" fill="url(#zc-disc)" />
        <circle cx={C} cy={C} r="108" className="zc-disc-edge" />
        <g transform={`translate(${C} ${C})`} className="zc-star">
          <path d={STAR} transform="scale(76)" fill="url(#zc-star)" filter="url(#zc-bloom)" />
          <path d={STAR} transform="scale(28)" fill="#ffffff" opacity=".92" />
        </g>
      </svg>
    </figure>
  );
}
