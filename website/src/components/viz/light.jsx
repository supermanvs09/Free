import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import LAND from '../scenes/land.json';

/* Light product pictures for the home story, in the style identity vendors use
   on a light page: white cards, thin rules, one accent, red only for risk.
   Numbers and names are illustrative. */

/* how far a picture has played: 0 → n while on screen, the last frame for the
   server render and reduced motion */
export function useBeat(ref, n, ms = 650, hold = 4200, once = false) {
  const seen = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [k, setK] = useState(n);
  const done = useRef(false);
  useEffect(() => {
    if (reduce) { setK(n); return undefined; }
    if (!seen && !done.current) { if (once) setK(0); return undefined; } // wait at the start, so it never collapses in view
    if (once && done.current) return undefined; // played once: stays fully drawn, even when scrolled away and back
    let i = 0, t;
    const next = () => {
      setK(i);
      if (once && i >= n) { done.current = true; return; }
      t = setTimeout(() => { i = i >= n ? 0 : i + 1; next(); }, i >= n ? hold : ms);
    };
    next();
    return () => clearTimeout(t);
  }, [seen, reduce, n, ms, hold, once]);
  return k;
}

const Chip = ({ tone = 'crit', children }) => (
  <span className={cx('lp-chip', `t-${tone}`)}>{children}</span>
);

/* Machine identities: the inventory, with what matters floating over it */
const NHI_ROWS = [
  ['svc-payments-prod', 'Service account', '2 min ago', ['Critical', 'crit']],
  ['AKIA••••7Q2F', 'AWS access key', '94 days ago', ['Unused', 'warn']],
  ['invoice-agent', 'AI agent', 'now', ['High', 'crit']],
  ['github-deploy', 'Pipeline token', '1 h ago', ['Low', 'ok']],
  ['glue-ledger-etl', 'Cloud role', '6 h ago', ['Medium', 'warn']],
];
export function NhiInventory() {
  const ref = useRef(null);
  const k = useBeat(ref, 4);
  return (
    <figure ref={ref} className="lp relative" aria-label="Illustration: an inventory of machine identities, with cards over it: identities by type (service accounts, access keys, cloud roles, AI agents), the identities most at risk, and how many keys have not been used in 90 days.">
      <div aria-hidden="true" className="relative" style={{ aspectRatio: '1.45 / 1' }}>
        <div className="lp-card absolute left-[3%] top-[15%] w-[74%]">
          <div className="lp-bar"><b>Machine identities</b><span>14,284 found · 4 sources</span></div>
          <div className="lp-row lp-head"><span>Identity</span><span>Type</span><span>Last used</span><span>Risk</span></div>
          {NHI_ROWS.map(([n, t, u, [r, tone]], i) => (
            <div key={n} className={cx('lp-row', i === 0 && k >= 3 && 'hot')}>
              <span className="lp-mono">{n}</span><span>{t}</span><span>{u}</span><span><Chip tone={tone}>{r}</Chip></span>
            </div>
          ))}
        </div>
        <div className={cx('lp-card lp-float absolute right-[3%] top-[3%] w-[36%]', k >= 1 && 'on')}>
          <p className="lp-h">Identities by type</p>
          {[['Access keys', '11,020'], ['Service accounts', '2,340'], ['Cloud roles', '860'], ['AI agents', '64']].map(([a, b]) => <p key={a} className="lp-kv"><span>{a}</span><b>{b}</b></p>)}
        </div>
        <div className={cx('lp-card lp-float absolute bottom-[3%] right-[6%] w-[40%]', k >= 2 && 'on')}>
          <p className="lp-h">Top identities at risk</p>
          {[['svc-payments-prod', 'Wildcard on payments'], ['invoice-agent', 'Reads customer data'], ['AKIA••••7Q2F', 'Key in a public repo']].map(([a, b]) => (
            <p key={a} className="lp-risk"><span><b className="lp-mono">{a}</b><span>{b}</span></span><Chip>Critical</Chip></p>
          ))}
        </div>
        <div className={cx('lp-card lp-float absolute bottom-[8%] left-[1%] w-[30%]', k >= 3 && 'on')}>
          <p className="lp-h">Unused in 90 days</p>
          <p className="lp-big">1,318</p>
          <p className="lp-sub">keys and roles you can remove today</p>
        </div>
      </div>
    </figure>
  );
}

/* People: risky sign-ins by location, with one impossible journey */
const PROJ = (lat, lon) => [((lon + 180) / 360) * 100, ((80 - lat) / 138) * 100];
const DOTS = (() => { const out = []; for (let i = 0; i < LAND.length; i += 2) out.push(PROJ(LAND[i] / 10, LAND[i + 1] / 10)); return out; })();
const PLACES = [
  { n: 'Mumbai', lat: 19.1, lon: 72.9, home: true },
  { n: 'Lagos', lat: 6.5, lon: 3.4, c: 9 },
  { n: 'Frankfurt', lat: 50.1, lon: 8.7, c: 3 },
  { n: 'São Paulo', lat: -23.5, lon: -46.6, c: 2 },
  { n: 'Singapore', lat: 1.35, lon: 103.8, c: 6 },
  { n: 'Dallas', lat: 32.8, lon: -96.8, c: 3 },
];
export function RiskMap() {
  const ref = useRef(null);
  const k = useBeat(ref, 4, 800);
  const [mx, my] = PROJ(19.1, 72.9), [lx, ly] = PROJ(6.5, 3.4);
  return (
    <figure ref={ref} className="lp relative" aria-label="Illustration: a map of risky sign-ins by location. Kavya Reddy signs in from Mumbai at 09:12 and again from Lagos at 11:05, both with MFA; the second sign-in is impossible travel and her session is held.">
      <div aria-hidden="true" className="lp-card relative">
        <div className="lp-bar"><b>Risky sign-ins by location</b><span>Last 30 days · risk: high</span></div>
        <div className="lp-kpis">
          {[['Risky sign-ins', '23', 'crit'], ['Locations', '6', ''], ['Contained', '23', 'ok']].map(([a, b, t]) => <p key={a} className={cx('lp-kpi', t)}><span>{a}</span><b>{b}</b></p>)}
        </div>
        <div className="relative mx-3 mb-3" style={{ aspectRatio: '2.25 / 1' }}>
          <svg viewBox="0 0 100 44.4" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            {DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y * 0.444} r=".23" className="lp-land" />)}
            <path d={`M${mx} ${my * 0.444} Q${(mx + lx) / 2} ${Math.min(my, ly) * 0.444 - 9} ${lx} ${ly * 0.444}`} className={cx('lp-arc', k >= 2 && 'on')} pathLength="1" />
          </svg>
          {PLACES.map((p) => {
            const [x, y] = PROJ(p.lat, p.lon);
            const lagos = p.n === 'Lagos';
            return (
              <span key={p.n} className={cx('lp-pin', p.home ? 'home' : 'risk', lagos && k >= 2 && 'hit')} style={{ left: `${x}%`, top: `${y}%`, '--s': p.home ? 1 : 0.7 + (p.c || 0) / 9 }}>
                {!p.home && <b>{p.c}</b>}
              </span>
            );
          })}
          <div className={cx('lp-note below', k >= 1 && 'on')} style={{ left: `${mx}%`, top: `${my}%` }}><b>Mumbai · 09:12</b><span>Managed laptop · MFA</span></div>
          <div className={cx('lp-note crit', k >= 3 && 'on')} style={{ left: `${lx}%`, top: `${ly}%` }}><b>Lagos · 11:05</b><span>New phone · MFA passed</span></div>
        </div>
        <div className={cx('lp-verdict', k >= 4 && 'on')}>
          <span className="lp-dot" /><span><b>Impossible travel · Kavya Reddy</b> 7,000 km in 2 h. Session held, Okta sessions revoked, SOC told with the reason.</span>
        </div>
      </div>
    </figure>
  );
}
