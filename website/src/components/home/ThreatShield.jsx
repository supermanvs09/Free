import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* AI-driven threats, stopped at the perimeter of every identity.
   The estate sits in the middle: people, customers, service accounts, keys,
   AI agents and MCP servers, around the Deep Algorithms core. The threats
   wait outside the posture ring. One at a time a threat fires at the
   identity it targets; it meets the ring, the ring answers with a pulse,
   the threat turns to "Stopped" and the decision lands in the log.
   Server render and reduced motion: every threat already stopped.
   Sample decisions, illustrative timings. */

const W = 1000, H = 620, CX = 500, CY = 310;
const RING = 196; // the posture ring

const IDS = [
  { k: 'emp', icon: 'User', l: 'Employee' },
  { k: 'cus', icon: 'UserCircle', l: 'Customer' },
  { k: 'svc', icon: 'HardDrives', l: 'Service account' },
  { k: 'key', icon: 'Key', l: 'API key' },
  { k: 'agt', icon: 'Robot', l: 'AI agent' },
  { k: 'mcp', icon: 'Plug', l: 'MCP server' },
];

/* angle (deg, 0 = right, clockwise), target identity, decision */
const THREATS = [
  { k: 'AI-generated phishing', a: 200, to: 'emp', d: 'Leaked credential flagged', by: 'adapID AI' },
  { k: 'Deepfake voice and video', a: 235, to: 'emp', d: 'Help-desk reset held for verification', by: 'adapID AI' },
  { k: 'MFA fatigue', a: 160, to: 'cus', d: 'Push flood detected, step-up enforced', by: 'adapID AI' },
  { k: 'Session hijacking', a: 125, to: 'cus', d: 'Hijacked session ended', by: 'adapID AI' },
  { k: 'Token and key theft', a: 55, to: 'key', d: 'Stolen key revoked', by: 'adapID AI' },
  { k: 'Privilege escalation', a: 20, to: 'svc', d: 'Unused privilege removed', by: 'adapID AI' },
  { k: 'Prompt injection', a: 340, to: 'agt', d: 'Injected instruction blocked', by: 'Zenstra AI' },
  { k: 'Agent hijacking', a: 305, to: 'mcp', d: 'Out-of-task tool call denied', by: 'Zenstra AI' },
];

const rad = (d) => (d * Math.PI) / 180;
const pt = (deg, r, ry = r) => [CX + Math.cos(rad(deg)) * r, CY + Math.sin(rad(deg)) * ry];
/* identity nodes sit on an inner ellipse, evenly spaced */
const idPos = Object.fromEntries(IDS.map((x, i) => [x.k, pt(i * 60 - 90 + 30, 118, 104)]));
/* threats sit on an outer ellipse */
const thPos = (t) => pt(t.a, 410, 262);

const FIRE_MS = 950, HOLD_MS = 1300;

export default function ThreatShield() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  // i: active threat; ph: 'aim' (projectile at start), 'fly', 'hit'
  const [i, setI] = useState(-1);
  const [ph, setPh] = useState('hit');
  const [done, setDone] = useState(() => new Set(THREATS.map((_, n) => n)));
  const [log, setLog] = useState([5, 6, 7]);
  const began = useRef(false);

  useEffect(() => {
    if (reduce || !inView) return undefined;
    if (!began.current) { began.current = true; setDone(new Set()); setLog([]); setI(0); setPh('aim'); return undefined; }
    if (i < 0) return undefined;
    let t;
    if (ph === 'aim') t = setTimeout(() => setPh('fly'), 60);
    else if (ph === 'fly') t = setTimeout(() => {
      setPh('hit');
      setDone((s) => new Set(s).add(i));
      setLog((l) => [i, ...l].slice(0, 3));
    }, FIRE_MS);
    else t = setTimeout(() => {
      const n = (i + 1) % THREATS.length;
      if (n === 0) setDone(new Set());
      setI(n); setPh('aim');
    }, HOLD_MS);
    return () => clearTimeout(t);
  }, [i, ph, inView, reduce]);

  const cur = i >= 0 ? THREATS[i] : null;
  const start = cur ? thPos(cur) : [CX, CY];
  // impact point: where the threat's path towards the core crosses the posture ring
  const vx = start[0] - CX, vy = start[1] - CY, len = Math.hypot(vx, vy) || 1;
  const hit = [CX + (vx / len) * RING, CY + (vy / len) * RING];
  const at = ph === 'aim' ? start : hit;

  return (
    <figure ref={ref} className="ts tone-d" aria-label="Deep Algorithms protects every identity from AI-driven threats: AI-generated phishing, deepfake voice and video, MFA fatigue, session hijacking, token and key theft, privilege escalation, prompt injection and agent hijacking are each stopped before they reach an employee, customer, service account, API key, AI agent or MCP server.">
      <div className="ts-stage">
        <svg viewBox={`0 0 ${W} ${H}`} className="ts-svg" aria-hidden="true">
          <defs>
            <radialGradient id="ts-core" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#1b8fe0" stopOpacity=".55" /><stop offset="1" stopColor="#1b8fe0" stopOpacity="0" /></radialGradient>
            <linearGradient id="ts-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7fd6ff" /><stop offset="1" stopColor="#1f6fe0" /></linearGradient>
          </defs>
          <circle cx={CX} cy={CY} r={RING + 60} fill="url(#ts-core)" opacity=".5" />
          {/* spokes from core to identities */}
          {IDS.map((x) => <line key={x.k} x1={CX} y1={CY} x2={idPos[x.k][0]} y2={idPos[x.k][1]} className={cx('ts-spoke', cur && cur.to === x.k && ph !== 'aim' && 'on')} />)}
          {/* the posture ring: a slow dashed orbit and a solid shield */}
          <circle cx={CX} cy={CY} r={RING} className="ts-ring" />
          <circle cx={CX} cy={CY} r={RING + 14} className="ts-orbit" />
          {/* threat paths */}
          {THREATS.map((t, n) => {
            const [x, y] = thPos(t); const vx2 = x - CX, vy2 = y - CY, l2 = Math.hypot(vx2, vy2);
            return <line key={t.k} x1={x} y1={y} x2={CX + (vx2 / l2) * (RING + 4)} y2={CY + (vy2 / l2) * (RING + 4)} className={cx('ts-path', n === i && ph !== 'hit' && 'on', done.has(n) && 'done')} />;
          })}
          {/* the projectile */}
          {cur && ph !== 'hit' && (
            <g className={cx('ts-shot', ph === 'fly' && 'fly')} style={{ transform: `translate(${at[0]}px, ${at[1]}px)`, transitionDuration: `${FIRE_MS}ms` }}>
              <circle r="16" className="ts-shot-glow" /><circle r="6" className="ts-shot-dot" />
            </g>
          )}
          {/* the impact */}
          {cur && ph === 'hit' && (
            <g key={`hit-${i}`} transform={`translate(${hit[0]} ${hit[1]})`}>
              <circle r="10" className="ts-pulse" /><circle r="10" className="ts-pulse two" />
            </g>
          )}
        </svg>

        <div className="ts-core" aria-hidden="true">
          <img src="/brand/mark.webp" alt="" width="44" height="44" />
          <small>Continuous AI Security Posture</small>
        </div>

        {IDS.map((x) => {
          const [px, py] = idPos[x.k];
          return (
            <span key={x.k} className={cx('ts-id', cur && cur.to === x.k && ph === 'hit' && 'safe')} style={{ left: `${(px / W) * 100}%`, top: `${(py / H) * 100}%` }} aria-hidden="true">
              <Icon name={x.icon} size={18} /><small>{x.l}</small>
            </span>
          );
        })}

        {THREATS.map((t, n) => {
          const [px, py] = thPos(t);
          const st = done.has(n) ? 'done' : n === i ? 'live' : 'idle';
          return (
            <span key={t.k} className={cx('ts-th', st, px < CX ? 'l' : 'r')} style={{ left: `${(px / W) * 100}%`, top: `${(py / H) * 100}%` }} aria-hidden="true">
              <i>{st === 'done' ? <Icon name="ShieldCheck" size={13} weight="fill" /> : <Icon name="Warning" size={13} weight="fill" />}</i>
              {t.k}
            </span>
          );
        })}
      </div>

      <figcaption className="ts-log" aria-hidden="true">
        <p className="ts-log-h"><span className="ts-live" />Decision log<small>Sample data</small></p>
        <ol>
          {log.map((n) => {
            const t = THREATS[n];
            return (
              <li key={`${n}-${t.k}`}>
                <b>{t.k}</b>
                <span>{t.d}</span>
                <em>{t.by}</em>
              </li>
            );
          })}
        </ol>
      </figcaption>

      <ul className="ts-list" aria-hidden="true">
        {THREATS.map((t, n) => <li key={t.k} className={cx(done.has(n) && 'done', n === i && !done.has(n) && 'live')}><Icon name={done.has(n) ? 'ShieldCheck' : 'Warning'} size={14} weight="fill" />{t.k}</li>)}
      </ul>
    </figure>
  );
}
