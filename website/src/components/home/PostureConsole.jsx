import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Logo } from '../viz/kit.jsx';

/* The hero picture: the AI Security Posture console. It shows the product
   doing the four things the headline promises, on one screen: an inventory of
   every identity, a posture score, and findings that turn into actions.
   Rows stream in while it is on screen; the server render and reduced motion
   show the finished state. Sample data, illustrative UI. */

const STEPS = ['Discover', 'Assess', 'Enforce', 'Prove'];

const INVENTORY = [
  { k: 'human', label: 'Human identities', v: 12480, sub: 'Employees, partners, customers', tone: '#1a58d0' },
  { k: 'machine', label: 'Machine identities', v: 51818, sub: 'Service accounts, keys, workloads', tone: '#4050c8' },
  { k: 'agent', label: 'AI agents', v: 1284, sub: '312 without an owner', tone: '#b45309', flag: true },
];

const FINDINGS = [
  { sev: 'Critical', id: 'support-triage', type: 'AI agent', src: 'copilotstudio', what: 'Tried to export 4,812 customer records', act: 'Blocked in 4 ms' },
  { sev: 'High', id: 'svc-payments-prod', type: 'Service account', src: 'aws', what: 'Admin privilege unused for 94 days', act: 'Privilege revoked' },
  { sev: 'High', id: 'r.mehta', type: 'Employee', src: 'entra', what: 'New device and location after MFA push', act: 'Step-up enforced' },
  { sev: 'Medium', id: 'mcp-files', type: 'MCP server', src: 'mcp', what: 'Unapproved server in 3 agent toolchains', act: 'Quarantined' },
];

const SEV = { Critical: '#c4321f', High: '#b9520f', Medium: '#8a5a00' };

function Ico({ k }) {
  const d = {
    human: 'M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6',
    machine: 'M5 4.5h14v6H5zM5 13.5h14v6H5zM8.5 7.5h.01M8.5 16.5h.01M12 7.5h4M12 16.5h4',
    agent: 'M6 8h12v10H6zM12 4.5V8M9.5 12.5h.01M14.5 12.5h.01M10 15.5h4M4 12v3M20 12v3',
  }[k];
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

export default function PostureConsole() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.2 });
  const reduce = useReducedMotion();
  // t: 0 → 1 over the opening; rows: how many findings are visible; acted: how many show their action
  const [t, setT] = useState(1);
  const [rows, setRows] = useState(FINDINGS.length);
  const [acted, setActed] = useState(FINDINGS.length);
  const [step, setStep] = useState(3);
  const started = useRef(false);

  useEffect(() => {
    if (reduce || !inView || started.current) return undefined;
    started.current = true;
    setT(0); setRows(0); setActed(0); setStep(0);
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / 1600);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timers = [];
    timers.push(setTimeout(() => setStep(1), 1500));
    FINDINGS.forEach((_, i) => {
      timers.push(setTimeout(() => setRows(i + 1), 1700 + i * 650));
      timers.push(setTimeout(() => { setActed(i + 1); setStep(2); }, 2500 + i * 650));
    });
    timers.push(setTimeout(() => setStep(3), 2500 + FINDINGS.length * 650 + 400));
    return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [inView, reduce]);

  const score = Math.round(41 + (78 - 41) * t);
  const R = 46, C = 2 * Math.PI * R;

  return (
    <figure ref={ref} className="pc" aria-label="AI Security Posture console with sample data: an inventory of human, machine and AI agent identities, a posture score of 78, and four findings with the action taken on each.">
      <div className="pc-bar">
        <span className="pc-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="pc-title">AI Security Posture</span>
        <ol className="pc-steps" aria-hidden="true">
          {STEPS.map((s, i) => <li key={s} className={cx(i <= step && 'on', i === step && 'now')}>{s}</li>)}
        </ol>
        <span className="pc-sample">Sample data</span>
        <span className="pc-live"><span className="pc-pulse" />Continuous</span>
      </div>

      <div className="pc-body" aria-hidden="true">
        {/* posture score */}
        <div className="pc-card pc-score">
          <p className="pc-k">Posture score</p>
          <div className="pc-ring">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={R} fill="none" className="pc-ring-track" strokeWidth="10" />
              <circle cx="60" cy="60" r={R} fill="none" stroke="url(#pcg)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - score / 100)} transform="rotate(-90 60 60)" />
              <defs><linearGradient id="pcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f6fec" /><stop offset="1" stopColor="#1a4cb4" /></linearGradient></defs>
            </svg>
            <span className="pc-ring-v"><b>{score}</b><small>/100</small></span>
          </div>
          <p className="pc-delta">▲ 37 since enforcement began</p>
        </div>

        {/* inventory */}
        <div className="pc-inv">
          {INVENTORY.map((x) => (
            <div key={x.k} className="pc-card pc-stat" style={{ '--tone': x.tone }}>
              <p className="pc-k"><span className="pc-ico"><Ico k={x.k} /></span>{x.label}</p>
              <p className="pc-v">{fmt(x.v * t)}</p>
              <p className={cx('pc-sub', x.flag && 'flag')}>{x.sub}</p>
            </div>
          ))}
        </div>

        {/* findings → actions */}
        <div className="pc-card pc-table">
          <div className="pc-th"><span>Severity</span><span>Identity</span><span className="pc-col-what">Finding</span><span>Action taken</span></div>
          <ul>
            {FINDINGS.map((f, i) => (
              <li key={f.id} className={cx('pc-tr', i < rows && 'in')}>
                <span className="pc-sev" style={{ '--sev': SEV[f.sev] }}>{f.sev}</span>
                <span className="pc-id"><span className="pc-src"><Logo k={f.src} size="14px" /></span><span><b>{f.id}</b><small>{f.type}</small></span></span>
                <span className="pc-col-what pc-what">{f.what}</span>
                <span className={cx('pc-act', i < acted && 'done')}>{i < acted ? f.act : 'Evaluating…'}</span>
              </li>
            ))}
          </ul>
          <p className="pc-foot"><span>4 of 4 findings resolved</span><span className="pc-ev">Evidence recorded · ISO/IEC 42001 · DPDP Act 2023</span></p>
        </div>
      </div>
    </figure>
  );
}
