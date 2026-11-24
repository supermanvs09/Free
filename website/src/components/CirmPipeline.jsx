import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../lib/motion.js';
import { Logo } from './viz/kit.jsx';
import { useGridPop } from '../lib/nullmotion.jsx';

/* adapID CIRM as one platform view, the way identity platforms draw their
   console: who is covered on the left, what happens to every identity in the
   middle (seven stages, one after another), what it connects to on the right.
   The stages are what CIRM does, nothing borrowed. Numbers are illustrative. */

export const STAGES = [
  { n: 'Discover', d: 'Finds every person, key, service account and AI agent across your identity provider, cloud and SaaS.' },
  { n: 'Baseline', d: 'Learns how each identity normally works: when, where, from which device, touching which data.' },
  { n: 'Score', d: 'Scores every session from 0 to 100 while it happens, not in a nightly report.' },
  { n: 'Explain', d: 'Every point of the score carries its reason, in words an analyst or auditor can follow.' },
  { n: 'Step up · Hold', d: 'Your policy asks for proof, or holds the session, through the identity provider you already run.' },
  { n: 'Contain', d: 'Revokes sessions, removes rogue rules and disables keys across every connected system.' },
  { n: 'Record', d: 'Keeps each decision with its reason, ready for the SOC, the auditor and the regulator.' },
];
const COVER = [
  ['person', '3,412', 'People'],
  ['machine', '12,708', 'Machine identities'],
  ['agent', '64', 'AI agents'],
];
const SOURCES = [
  ['Identity providers', [['okta', 'Okta'], ['entra', 'Microsoft Entra ID'], ['ad', 'Active Directory'], ['google', 'Google Workspace']]],
  ['Cloud', [['aws', 'AWS'], ['azure', 'Microsoft Azure'], ['gcp', 'Google Cloud']]],
  ['Apps', [['m365', 'Microsoft 365'], ['salesforce', 'Salesforce'], ['github', 'GitHub'], ['slack', 'Slack']]],
];
const KPI = [['48,210', 'sessions scored today'], ['38 ms', 'median decision'], ['23', 'sessions held, all explained']];

const ICON = {
  person: 'M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6',
  machine: 'M4 5h16v6H4zM4 13h16v6H4zM8 8h.01M8 16h.01',
  agent: 'M5 7h14v11H5zM12 4v3M9.5 12h.01M14.5 12h.01',
};
const Ico = ({ k }) => <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d={ICON[k]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* chevron geometry, in svg units */
const W = 46, D = 36, H = 236, STEP = 70, FAN = 70;
const VBW = FAN * 2 + 6 * STEP + W + D; // seven stages
const chev = (x) => `${x},0 ${x + W},0 ${x + W + D},${H / 2} ${x + W},${H} ${x},${H} ${x + D},${H / 2}`;

export default function CirmPipeline({ caption = true }) {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.25 });
  const reduce = useReducedMotion();
  const [at, setAt] = useState(0);
  const [hold, setHold] = useState(false);
  const srcRef = useRef(null);
  useGridPop(srcRef, 'li');
  useEffect(() => {
    if (reduce || hold || !seen) return undefined;
    const t = setInterval(() => setAt((i) => (i + 1) % STAGES.length), 2200);
    return () => clearInterval(t);
  }, [reduce, hold, seen]);
  const pick = (i) => { setAt(i); setHold(true); };
  const x0 = FAN, xEnd = FAN + (STAGES.length - 1) * STEP + W + D;

  return (
    <figure ref={ref} className="pl" onMouseLeave={() => setHold(false)}>
      <div className="pl-bar">
        <span className="flex min-w-0 items-center gap-2.5"><img src="/brand/mark.webp" alt="" width="20" height="20" className="h-5 w-5" /><b>adapID CIRM</b><span className="max-sm:hidden">· Continuous identity risk management</span></span>
        <span className="flex items-center gap-3">
          <span className="pl-search max-md:hidden" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>Search identities</span>
          <span className="pl-status"><i />Operational</span>
        </span>
      </div>

      <div className="pl-body">
        {/* who is covered */}
        <ul className="pl-cover" aria-label="Identities covered">
          {COVER.map(([k, v, l]) => <li key={l}><span className="pl-ic"><Ico k={k} /></span><span><b>{v}</b><span>{l}</span></span></li>)}
        </ul>

        {/* what happens to every identity */}
        <div className="pl-mid">
          <div className="pl-head" aria-live="polite">
            <p className="pl-step mono">Stage {String(at + 1).padStart(2, '0')} of 07</p>
            <p className="pl-title">{STAGES[at].n}</p>
            <p className="pl-desc">{STAGES[at].d}</p>
          </div>

          <div className="pl-chev relative max-md:hidden">
            <svg viewBox={`0 0 ${VBW} ${H}`} className="block h-auto w-full" aria-hidden="true">
              <defs>
                <linearGradient id="pl-on" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1e88d8" /><stop offset="1" stopColor="#0a5ea3" /></linearGradient>
              </defs>
              {/* fans in and out */}
              
              
              {[0.16, 0.5, 0.84].map((f) => <path key={f} d={`M0 ${H * f} C${FAN * 0.6} ${H * f} ${FAN * 0.5} ${H / 2} ${x0 + D} ${H / 2}`} className="pl-fan" />)}
              {[0.16, 0.5, 0.84].map((f) => <path key={`r${f}`} d={`M${xEnd} ${H / 2} C${xEnd + FAN * 0.5} ${H / 2} ${xEnd + FAN * 0.4} ${H * f} ${VBW} ${H * f}`} className="pl-fan" />)}
              <line x1="0" y1={H / 2} x2={VBW} y2={H / 2} className="pl-axis" />
              {STAGES.map((s, i) => {
                const x = x0 + i * STEP, on = i === at, past = i < at;
                return (
                  <g key={s.n} className={cx('pl-c', on && 'on', past && 'past')}>
                    <polygon points={chev(x)} />
                    <text transform={`translate(${x + W / 2 + 3} 20) rotate(72.6)`} className="pl-cl">{s.n}</text>
                    <text x={x + W / 2 + D * 0.42} y={H - 16} textAnchor="middle" className="pl-cn">{String(i + 1).padStart(2, '0')}</text>
                  </g>
                );
              })}
              {!reduce && <circle r="4" cy={H / 2} cx="0" className="pl-pulse" style={{ '--to': `${VBW}px` }} />}
            </svg>
            {STAGES.map((s, i) => (
              <button key={s.n} type="button" onClick={() => pick(i)} onFocus={() => pick(i)} aria-pressed={i === at} aria-label={`Stage ${i + 1}: ${s.n}`}
                className="pl-hit" style={{ left: `${((x0 + i * STEP) / VBW) * 100}%`, width: `${((W + D) / VBW) * 100}%` }} />
            ))}
          </div>

          {/* phones: the same seven stages as a list */}
          <ol className="pl-list md:hidden">
            {STAGES.map((s, i) => (
              <li key={s.n}><button type="button" onClick={() => pick(i)} aria-pressed={i === at} className={cx(i === at && 'on')}><span>{String(i + 1).padStart(2, '0')}</span>{s.n}</button></li>
            ))}
          </ol>

          <dl className="pl-kpi">
            {KPI.map(([v, l]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>

        {/* what it connects to */}
        <div className="pl-src" ref={srcRef}>
          {SOURCES.map(([g, items]) => (
            <div key={g}>
              <p className="pl-g">{g}</p>
              <ul>{items.map(([k, n]) => <li key={k}><span className="pl-logo"><Logo k={k} size="15px" /></span>{n}<i aria-label="connected" /></li>)}</ul>
            </div>
          ))}
        </div>
      </div>
      {caption && <figcaption className="pl-cap">An adapID CIRM workspace. Names and numbers are examples.</figcaption>}
    </figure>
  );
}
