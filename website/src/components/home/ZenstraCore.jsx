import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* The Zenstra core, after the signature picture on zenstra.ai ("Inside the
   Zenstra core"): the Zenstra star inside mechanical rings that turn at
   different speeds. The three ways in (Workflow Security, Cloud Security,
   Zenstra AI Discovery) sit on the outer ring; in turn each sends an agent
   action down a beam into the core, and the decision appears beneath, in
   Zenstra's own wording. Reduced motion: still rings, one decision shown. */

const C = 300;
const WAYS = [
  { k: 'Workflow Security', icon: 'FlowArrow', a: -90, d: ['BLOCK', 'hop 7 · crm.export → outside email · not in task', 'bad'] },
  { k: 'Cloud Security', icon: 'Cloud', a: 30, d: ['ALLOW', 'loan-servicing · loan.read · grant expires in 15 min', 'good'] },
  { k: 'Zenstra AI Discovery', icon: 'Laptop', a: 150, d: ['CONTAIN', 'laptop-114 · cursor read ~/.aws · session contained', 'bad'] },
];
const R_NODE = 262;
const pos = (a, r) => [C + Math.cos((a * Math.PI) / 180) * r, C + Math.sin((a * Math.PI) / 180) * r];

/* the four-point Zenstra star, concave sides */
const STAR = 'M0 -1 C0.16 -0.16 0.16 -0.16 1 0 C0.16 0.16 0.16 0.16 0 1 C-0.16 0.16 -0.16 0.16 -1 0 C-0.16 -0.16 -0.16 -0.16 0 -1 Z';

export default function ZenstraCore() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.25 });
  const reduce = useReducedMotion();
  const [k, setK] = useState(0);
  const run = inView && !reduce;

  useEffect(() => {
    if (!run) return undefined;
    const t = setTimeout(() => setK((n) => (n + 1) % WAYS.length), 2800);
    return () => clearTimeout(t);
  }, [k, run]);

  const w = WAYS[k];
  return (
    <figure ref={ref} className={cx('zc', run && 'run')} aria-label="The Zenstra core: Workflow Security, Cloud Security and Zenstra AI Discovery send every agent action to one policy engine, which allows, blocks or contains it before it runs, and records the decision.">
      <div className="zc-stage" aria-hidden="true">
        <svg viewBox="0 0 600 600" className="zc-svg">
          <defs>
            <radialGradient id="zc-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#2f9bff" stopOpacity=".55" /><stop offset=".45" stopColor="#1360c9" stopOpacity=".18" /><stop offset="1" stopColor="#0b2a6b" stopOpacity="0" /></radialGradient>
            <radialGradient id="zc-disc" cx="50%" cy="45%" r="55%"><stop offset="0" stopColor="#123f86" /><stop offset="1" stopColor="#06142f" /></radialGradient>
            <linearGradient id="zc-star" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e6f6ff" /><stop offset=".45" stopColor="#6cc7ff" /><stop offset="1" stopColor="#1f6fe0" /></linearGradient>
            <filter id="zc-bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            <filter id="zc-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" /></filter>
          </defs>

          <circle cx={C} cy={C} r="300" fill="url(#zc-glow)" />

          {/* outer ring with ticks */}
          <g className="zc-r zc-r1">
            <circle cx={C} cy={C} r="282" className="zc-line" />
            {Array.from({ length: 120 }, (_, i) => {
              const [x1, y1] = pos(i * 3, i % 10 === 0 ? 266 : 273); const [x2, y2] = pos(i * 3, 282);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i % 10 === 0 ? 'zc-tick big' : 'zc-tick'} />;
            })}
          </g>
          {/* mechanical segmented ring */}
          <g className="zc-r zc-r2">
            <circle cx={C} cy={C} r="232" className="zc-seg" />
            <circle cx={C} cy={C} r="232" className="zc-seg-edge" />
          </g>
          {/* fine dashed ring */}
          <g className="zc-r zc-r3"><circle cx={C} cy={C} r="196" className="zc-dash" /></g>
          {/* bright arcs */}
          <g className="zc-r zc-r4"><circle cx={C} cy={C} r="160" className="zc-arc" /><circle cx={C} cy={C} r="160" className="zc-arc blur" filter="url(#zc-soft)" /></g>

          {/* beams from each way in to the core */}
          {WAYS.map((x, i) => {
            const [x1, y1] = pos(x.a, R_NODE - 26); const [x2, y2] = pos(x.a, 112);
            return (
              <g key={x.k}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="zc-beam-track" />
                <line x1={x1} y1={y1} x2={x2} y2={y2} className={cx('zc-beam', i === k && run && 'fire', x.d[2])} key={`${x.k}-${i === k ? k : 'x'}`} />
              </g>
            );
          })}

          {/* the core */}
          <circle cx={C} cy={C} r="112" fill="url(#zc-disc)" className="zc-disc" />
          <circle cx={C} cy={C} r="112" className="zc-disc-edge" />
          <g className="zc-star" transform={`translate(${C} ${C})`}>
            <path d={STAR} transform="scale(78)" fill="url(#zc-star)" filter="url(#zc-bloom)" />
            <path d={STAR} transform="scale(30)" fill="#ffffff" opacity=".9" />
          </g>
          <circle cx={C} cy={C} r="112" className={cx('zc-pulse', run && 'on', w.d[2])} key={`p${k}`} />
        </svg>

        {WAYS.map((x, i) => {
          const [px, py] = pos(x.a, R_NODE);
          return (
            <span key={x.k} className={cx('zc-node', i === k && 'on')} style={{ left: `${(px / 600) * 100}%`, top: `${(py / 600) * 100}%` }}>
              <Icon name={x.icon} size={16} /><b>{x.k}</b>
            </span>
          );
        })}
      </div>

      <figcaption className="zc-dec" aria-hidden="true" key={`d${k}`}>
        <span className={cx('zc-dec-v', w.d[2])}>{w.d[0]}</span>
        <span className="zc-dec-t">{w.d[1]}</span>
        <span className="zc-dec-m">Decided inline · recorded</span>
      </figcaption>
    </figure>
  );
}
