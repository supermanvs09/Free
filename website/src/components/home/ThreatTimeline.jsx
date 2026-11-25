import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';

/* How Deep Algorithms detects an identity attack, shown the way a detection
   engine sees it. Four layers (identity, session, access, data) over an
   eight-minute window. Faint ticks are the identity's learned normal
   activity. Attack signals arrive in time, each mapped to MITRE ATT&CK (or
   MITRE ATLAS for AI agents) with the reason it is abnormal. No single
   signal crosses the response threshold; correlated, the risk does, the
   response fires, and the attacker's next steps never happen.
   A cursor sweeps the window while the figure is on screen; the scenario
   tabs switch attack patterns. Reduced motion and the server render show the
   finished picture. Sample scenarios, sample identities. */

const LANES = ['Identity', 'Session', 'Access', 'Data'];
const SPAN = 8; // minutes shown
const THRESHOLD = 70;
const BASE = 12;

const SCENARIOS = [
  {
    key: 'ato', tab: 'Account takeover', by: 'adapID AI', start: [9, 41],
    who: 'r.mehta', kind: 'Finance analyst · Entra ID',
    events: [
      { m: 0.9, lane: 0, t: 'Sign-in from a new network', id: 'T1078', w: 14, why: 'Valid password from a network never seen for this user' },
      { m: 2.0, lane: 0, t: '11 MFA pushes in 90 seconds', id: 'T1621', w: 18, why: 'Baseline is one push a day; the 11th was approved' },
      { m: 2.8, lane: 1, t: 'Session cookie on a new device', id: 'T1539', w: 16, why: 'The same session, replayed from an unmanaged laptop' },
      { m: 3.6, lane: 3, t: 'Mail forwarding to an outside address', id: 'T1114.003', w: 22, why: 'No mail rule created in 18 months' },
    ],
    act: { m: 3.75, lane: 1, t: 'Session revoked, step-up required' },
    prevented: [{ m: 5.2, lane: 3, t: 'Payroll files exported', id: 'T1530' }, { m: 6.6, lane: 2, t: 'Bank details changed', id: 'T1657' }],
  },
  {
    key: 'agent', tab: 'AI agent hijack', by: 'Zenstra AI', start: [14, 6],
    who: 'support-triage', kind: 'AI agent · Copilot Studio',
    events: [
      { m: 1.0, lane: 3, t: 'Hidden instruction in a customer email', id: 'AML.T0051', w: 20, why: 'Retrieved content addresses the agent directly' },
      { m: 2.1, lane: 1, t: 'Plan departs from its declared task', id: 'intent', w: 16, why: 'Task is ticket triage; the plan is a bulk export' },
      { m: 2.9, lane: 1, t: 'Tool calls at 14× its normal rate', id: 'rate', w: 14, why: 'Baseline is six tool calls an hour' },
      { m: 3.5, lane: 2, t: 'crm.export to an external address', id: 'AML.T0057', w: 24, why: 'Its grant is read-only and internal' },
    ],
    act: { m: 3.65, lane: 2, t: 'Tool call denied before it ran' },
    prevented: [{ m: 5.0, lane: 3, t: '4,812 customer records sent out', id: 'AML.T0057' }, { m: 6.5, lane: 0, t: 'Agent token reused elsewhere', id: 'T1550' }],
  },
  {
    key: 'nhi', tab: 'Machine identity abuse', by: 'adapID AI', start: [3, 10],
    who: 'svc-payments-prod', kind: 'Workload role · AWS IAM',
    events: [
      { m: 0.8, lane: 0, t: 'Access key used from an unfamiliar network', id: 'T1078.004', w: 18, why: 'Ninety days of use, always from one VPC' },
      { m: 1.9, lane: 1, t: 'API activity at 03:12', id: 'time', w: 12, why: 'Baseline is business hours and four APIs' },
      { m: 2.8, lane: 2, t: 'Listed 214 storage buckets', id: 'T1619', w: 18, why: 'It has only ever read one bucket' },
      { m: 3.7, lane: 2, t: 'Tried to attach an admin policy', id: 'T1098', w: 22, why: 'A workload role changing its own permissions' },
    ],
    act: { m: 3.85, lane: 0, t: 'Key revoked, unused privilege removed' },
    prevented: [{ m: 5.4, lane: 3, t: 'Payments ledger copied', id: 'T1530' }],
  },
];

/* geometry (SVG units) */
const W = 760, H = 590, X0 = 92, X1 = 744, LANE_Y = [78, 158, 238, 318], LANE_H = 58, RY0 = 556, RY1 = 404;
const xOf = (m) => X0 + (m / SPAN) * (X1 - X0);
const yOf = (r) => RY0 - (Math.min(100, r) / 100) * (RY0 - RY1);

/* deterministic "normal activity" ticks per lane */
function baseline(seed, lane) {
  const out = []; let s = (seed * 31 + lane * 17) % 997;
  for (let i = 0; i < 16; i++) { s = (s * 73 + 41) % 997; out.push((s / 997) * SPAN); }
  return out;
}

function riskAt(sc, m) {
  let r = BASE + Math.sin(m * 3.1) * 1.2;
  for (const e of sc.events) if (m >= e.m) r += e.w * Math.min(1, (m - e.m) / 0.22);
  if (m >= sc.act.m) r = Math.max(BASE + 4, r - (m - sc.act.m) * 26);
  return r;
}

function detection(sc) {
  let r = BASE;
  for (const e of sc.events) { r += e.w; if (r >= THRESHOLD) return e.m + 0.12; }
  return sc.act.m;
}

const clock = ([h, mi], m) => {
  const s = Math.round(m * 60); const tm = h * 3600 + mi * 60 + s;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(tm / 3600) % 24)}:${p(Math.floor(tm / 60) % 60)}:${p(tm % 60)}`;
};

const SWEEP_MS = 11000, HOLD_MS = 4200;

export default function ThreatTimeline() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [k, setK] = useState(0);
  const [m, setM] = useState(SPAN); // cursor, in minutes
  const [auto, setAuto] = useState(true);
  const raf = useRef(0);

  useEffect(() => {
    if (reduce || !inView) { if (reduce) setM(SPAN); return undefined; }
    let t0 = performance.now();
    let held = false;
    const tick = (now) => {
      const el = now - t0;
      if (el < SWEEP_MS) setM((el / SWEEP_MS) * SPAN);
      else {
        if (!held) { setM(SPAN); held = true; }
        if (el > SWEEP_MS + HOLD_MS && auto) { setK((n) => (n + 1) % SCENARIOS.length); return; }
      }
      raf.current = requestAnimationFrame(tick);
    };
    setM(0); t0 = performance.now();
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [k, inView, reduce, auto]);

  const sc = SCENARIOS[k];
  const det = detection(sc);
  const seen = sc.events.filter((e) => m >= e.m);
  const risk = riskAt(sc, Math.min(m, SPAN));
  const detected = m >= det;
  const acted = m >= sc.act.m;
  const status = acted ? 'Contained' : detected ? 'Attack pattern detected' : seen.length ? `${seen.length} signal${seen.length > 1 ? 's' : ''}, below threshold` : 'Within learned baseline';
  const ttd = Math.round((det - sc.events[0].m) * 60);

  // risk path up to the cursor
  const pts = [];
  for (let x = 0; x <= Math.min(m, SPAN) + 1e-6; x += 0.04) pts.push(`${xOf(x).toFixed(1)},${yOf(riskAt(sc, x)).toFixed(1)}`);
  const path = pts.length ? `M${pts.join(' L')}` : '';
  const area = pts.length ? `${path} L${xOf(Math.min(m, SPAN)).toFixed(1)},${RY0} L${X0},${RY0} Z` : '';
  const chain = seen.map((e) => [xOf(e.m), LANE_Y[e.lane]]);

  const pick = (i) => { setAuto(false); setK(i); };

  return (
    <figure ref={ref} className={cx('tl', detected && 'det')} aria-label={`Detection timeline, ${sc.tab}: ${sc.events.map((e) => e.t).join('; ')}. Correlated, the risk crosses the response threshold and Deep Algorithms responds: ${sc.act.t}. Prevented: ${sc.prevented.map((p) => p.t).join('; ')}.`}>
      <div className="tl-top">
        <div className="tl-tabs" role="group" aria-label="Attack pattern">
          {SCENARIOS.map((s, i) => <button key={s.key} type="button" aria-pressed={i === k} className={cx(i === k && 'on')} onClick={() => pick(i)}>{s.tab}</button>)}
        </div>
        <span className="tl-sample">Sample scenario</span>
      </div>

      <div className="tl-body">
        <div className="tl-chart" aria-hidden="true">
          <svg viewBox={`0 0 ${W} ${H}`} className="tl-svg">
            {/* time axis */}
            {Array.from({ length: SPAN + 1 }, (_, i) => (
              <g key={i}>
                <line x1={xOf(i)} y1="40" x2={xOf(i)} y2={RY0} className="tl-grid" />
                {i % 2 === 0 && <text x={xOf(i)} y="26" className="tl-time" textAnchor="middle">{clock(sc.start, i).slice(0, 5)}</text>}
              </g>
            ))}
            {/* lanes and learned baseline */}
            {LANES.map((l, i) => (
              <g key={l}>
                <rect x={X0} y={LANE_Y[i] - LANE_H / 2} width={X1 - X0} height={LANE_H} rx="6" className="tl-lane" />
                <text x={X0 - 14} y={LANE_Y[i] + 4} className="tl-lab" textAnchor="end">{l}</text>
                {baseline(k + 1, i).map((x, j) => <line key={j} x1={xOf(x)} y1={LANE_Y[i] - 8} x2={xOf(x)} y2={LANE_Y[i] + 8} className={cx('tl-tick', x <= m && 'on')} />)}
              </g>
            ))}
            {/* correlation chain */}
            {chain.length > 1 && <path d={`M${chain.map((p) => p.join(',')).join(' L')}`} className="tl-chain" />}
            {/* detection line */}
            {detected && <g className="tl-detline"><line x1={xOf(det)} y1="44" x2={xOf(det)} y2={RY0} /><text x={xOf(det) + 8} y="52">Detected +{Math.floor(ttd / 60)}m {String(ttd % 60).padStart(2, '0')}s</text></g>}
            {/* attack signals */}
            {sc.events.map((e, i) => m >= e.m && (
              <g key={`${sc.key}-${i}`} className="tl-ev" transform={`translate(${xOf(e.m)} ${LANE_Y[e.lane]})`}>
                <circle r="16" className="tl-ev-halo" /><circle r="11" className="tl-ev-dot" />
                <text y="4" className="tl-ev-n" textAnchor="middle">{i + 1}</text>
                <text y="30" className="tl-ev-id" textAnchor="middle">{/^(T|AML)/.test(e.id) ? e.id : 'Behavioural'}</text>
              </g>
            ))}
            {/* response */}
            {acted && (
              <g className="tl-act" transform={`translate(${xOf(sc.act.m)} ${LANE_Y[sc.act.lane]})`}>
                <rect x="-7" y="-7" width="14" height="14" rx="3" />
                <text x="14" y="4">{sc.act.t}</text>
              </g>
            )}
            {/* prevented steps */}
            {sc.prevented.map((p, i) => acted && m >= p.m && (
              <g key={`${sc.key}-p${i}`} className="tl-prev" transform={`translate(${xOf(p.m)} ${LANE_Y[p.lane]})`}>
                <circle r="7" />
                <text x={p.m > 5.8 ? -14 : 14} y="-3" className="tl-prev-t" textAnchor={p.m > 5.8 ? 'end' : 'start'}>{p.t}</text>
                <text x={p.m > 5.8 ? -14 : 14} y="13" className="tl-ev-id" textAnchor={p.m > 5.8 ? 'end' : 'start'}>Prevented · {p.id}</text>
              </g>
            ))}
            {/* risk */}
            <text x={X0 - 14} y={RY1 + 4} className="tl-lab" textAnchor="end">Risk</text>
            <line x1={X0} y1={yOf(THRESHOLD)} x2={X1} y2={yOf(THRESHOLD)} className="tl-thr" />
            <text x={X1} y={yOf(THRESHOLD) - 7} className="tl-thr-t" textAnchor="end">Response threshold · {THRESHOLD}</text>
            <line x1={X0} y1={RY0} x2={X1} y2={RY0} className="tl-axis" />
            {area && <path d={area} className="tl-area" />}
            {path && <path d={path} className="tl-risk" />}
            {/* cursor */}
            {m < SPAN && (
              <g className="tl-cur"><line x1={xOf(m)} y1="40" x2={xOf(m)} y2={RY0} /><circle cx={xOf(m)} cy={yOf(risk)} r="4.5" /></g>
            )}
          </svg>
        </div>

        <aside className="tl-panel" aria-hidden="true">
          <p className="tl-p-k"><span>{sc.tab}</span><b>{sc.by}</b></p>
          <p className="tl-p-who mono">{sc.who}</p>
          <p className="tl-p-kind">{sc.kind}</p>
          <div className="tl-p-risk">
            <span className={cx('tl-p-score', detected && 'hi')}>{Math.round(risk)}</span>
            <span className="tl-p-status"><i className={cx(acted ? 'ok' : detected ? 'bad' : seen.length ? 'warn' : '')} />{status}</span>
          </div>
          <ol className="tl-p-sig">
            {sc.events.map((e, i) => (
              <li key={i} className={cx(m >= e.m && 'on')}>
                <span className="tl-p-n">{i + 1}</span>
                <span><b>{e.t}</b><small>{e.why}</small></span>
                <span className="tl-p-w mono">+{e.w}</span>
              </li>
            ))}
          </ol>
          <div className={cx('tl-p-out', acted && 'on')}>
            <p><span>Response</span>{sc.act.t}</p>
            <p><span>Prevented</span>{sc.prevented.map((x) => x.t).join(' · ')}</p>
            <p><span>Detected</span>{Math.floor(ttd / 60)}m {String(ttd % 60).padStart(2, '0')}s after the first signal</p>
          </div>
        </aside>
      </div>
      <figcaption className="tl-cap">Signals mapped to MITRE ATT&amp;CK and, for AI agents, MITRE ATLAS. Identities and times are illustrative.</figcaption>
    </figure>
  );
}
