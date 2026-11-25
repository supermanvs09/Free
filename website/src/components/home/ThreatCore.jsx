import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';

/* Inside the Deep Algorithms core: how AI-driven threats are stopped, told in
   six short steps, after the "Inside the Zenstra core" picture on zenstra.ai.
   A near-black stage; the core with three mechanical rings around it, one
   per kind of identity (people, machines, AI agents). The rings come apart
   in 3D, each lights up while a threat is stopped at its edge, and then they
   reassemble into one record. One card tells each step. It plays on its own
   while on screen; the step buttons jump to a step and stop the autoplay.
   Reduced motion: no movement, the record step is shown. Sample decisions. */

const STEPS = [
  {
    k: 'The exposure', view: 'face',
    h: 'AI attacks every identity at once.',
    p: 'AI writes the phishing, clones the voice, steals the token and hijacks the agent. The same attacks reach your people, your workloads and your AI agents.',
    tags: ['AI-generated phishing', 'Deepfake voice', 'Token theft', 'Prompt injection'],
  },
  {
    k: 'One posture engine', view: 'side',
    h: 'One engine checks every identity, continuously.',
    p: 'Every sign-in, key and agent action is checked against who it is, how it normally behaves and your policy, before it runs.',
    code: [['step-up', 'r.mehta', 'new device and location'], ['revoke', 'svc-payments', 'admin unused for 94 days'], ['deny', 'support-triage', 'tool call outside its task']],
    foot: 'Continuous · Inline · Every decision explained',
  },
  {
    k: 'Human identities', view: 'side', ring: 0, by: 'adapID AI',
    h: 'Every sign-in, scored against the person.',
    rows: [['Protects', 'Employees, partners and customers'], ['Checks', 'Device, location, behaviour and session'], ['Stops', 'AI phishing, MFA fatigue, deepfake resets, session hijacking']],
    block: 'r.mehta · new device and location · step-up enforced',
  },
  {
    k: 'Machine identities', view: 'side', ring: 1, by: 'adapID AI',
    h: 'Every key and workload, cut to what it uses.',
    rows: [['Protects', 'Service accounts, API keys and workloads'], ['Checks', 'Access granted against access used'], ['Stops', 'Token theft and privilege escalation']],
    block: 'payment-service-prod · s3:* unused · privilege removed',
  },
  {
    k: 'AI agents', view: 'side', ring: 2, by: 'Zenstra AI',
    h: 'Every agent action, checked against its task.',
    rows: [['Protects', 'Copilots, AI agents and MCP servers'], ['Checks', 'Intent, identity and scope of every tool call'], ['Stops', 'Prompt injection, tool poisoning, agent hijacking']],
    block: 'support-triage · injected instruction · tool call denied',
  },
  {
    k: 'The record', view: 'face', all: true,
    h: 'Every decision, on one record.',
    p: 'Each decision is chained to the one before it, with the reason and the policy that made it. Export it for your auditors and regulators.',
    chain: [['#48213', 'block', 'POL-114', '9f2c…a71e'], ['#48214', 'step-up', 'POL-021', 'c07a…3d12'], ['#48215', 'allow', 'POL-003', '4ba1…09c3']],
    foot: 'Tamper-evident · DPDP Act 2023 · ISO/IEC 42001',
  },
];

/* the three rings, outer to inner: people, machines, AI agents (index matches step.ring) */
const RINGS = [
  { k: 'Human identities', r: 236, n: 64, w: 30 },
  { k: 'Machine identities', r: 182, n: 52, w: 26 },
  { k: 'AI agents', r: 130, n: 40, w: 22 },
];

/* threats at the edge of the exposure step: angle (deg) and label */
const EDGE = [[218, 'Prompt injection'], [193, 'AI-generated phishing'], [167, 'Deepfake voice'], [142, 'Token theft']];

const STEP_MS = 4800;

function Ring({ r, n, w }) {
  const size = r * 2 + 40, c = size / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="dc-ring-svg" aria-hidden="true">
      <circle cx={c} cy={c} r={r + w / 2 + 6} className="dc-l1" />
      <circle cx={c} cy={c} r={r - w / 2 - 6} className="dc-l1" />
      <g className="dc-spin">
        {Array.from({ length: n }, (_, i) => (
          <rect key={i} x={c + r - w / 2} y={c - ((Math.PI * 2 * r) / n) * 0.36} width={w} height={((Math.PI * 2 * r) / n) * 0.72} rx="1.5"
            transform={`rotate(${(i / n) * 360} ${c} ${c})`} className="dc-block" />
        ))}
      </g>
      <circle cx={c} cy={c} r={r} className="dc-l2" />
    </svg>
  );
}

export default function ThreatCore() {
  const ref = useRef(null);
  const stage = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [s, setS] = useState(5);
  const [auto, setAuto] = useState(true);
  const began = useRef(false);
  const run = auto && inView && !reduce;

  // fit the 3D scene to the stage width
  useEffect(() => {
    const el = stage.current; if (!el) return undefined;
    const fit = () => { const w = el.clientWidth; el.style.setProperty('--s', String(Math.min(1, w / (w < 640 ? 640 : 1200)))); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!run) return undefined;
    if (!began.current) { began.current = true; setS(0); return undefined; }
    const t = setTimeout(() => setS((n) => (n + 1) % STEPS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [s, run]);

  const st = STEPS[s];
  const go = (i) => { setAuto(false); setS(i); };

  return (
    <figure ref={ref} className={cx('dc', `v-${st.view}`, run && 'run')} aria-label="Inside the Deep Algorithms core: AI-driven threats such as AI-generated phishing, deepfake voice, token theft and prompt injection reach people, machines and AI agents. One posture engine checks every identity continuously; adapID AI protects human and machine identities, Zenstra AI protects AI agents, and every decision is kept on one tamper-evident record.">
      <div ref={stage} className="dc-stage">
        <div className="dc-scene" aria-hidden="true">
          <div className="dc-rig">
            {RINGS.map((g, i) => (
              <div key={g.k} className={cx('dc-ring', `ri-${i}`, (st.ring === i || st.all) && 'on', st.ring === i && 'hit')} style={{ '--r': `${g.r}px` }}>
                <Ring {...g} />
                {st.ring === i && <span className="dc-shot" key={`shot-${s}`} />}
              </div>
            ))}
            <div className={cx('dc-core', (s >= 1) && 'on')}>
              <span className="dc-core-glow" />
              <svg viewBox="0 0 200 200" className="dc-core-ticks">
                {Array.from({ length: 48 }, (_, i) => {
                  const a = (i / 48) * Math.PI * 2; const r1 = i % 4 === 0 ? 74 : 80;
                  return <line key={i} x1={100 + Math.cos(a) * r1} y1={100 + Math.sin(a) * r1} x2={100 + Math.cos(a) * 88} y2={100 + Math.sin(a) * 88} />;
                })}
                <circle cx="100" cy="100" r="66" />
              </svg>
              <img src="/brand/mark.webp" alt="" width="160" height="160" />
            </div>
          </div>
          {EDGE.map(([a, l], i) => (
            <span key={l} className={cx('dc-edge', st.view === 'face' && !st.all && 'show')} style={{ '--a': `${a}deg`, '--d': `${i * 180}ms` }}>
              <i /><b>{l}</b>
            </span>
          ))}
        </div>

        <div className="dc-card" key={s} aria-live="off">
          <p className="dc-k">{st.k}{st.by && <span>{st.by}</span>}</p>
          <h3 className="dc-h">{st.h}</h3>
          {st.p && <p className="dc-p">{st.p}</p>}
          {st.tags && <ul className="dc-tags">{st.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
          {st.code && <ul className="dc-code mono">{st.code.map(([v, w, why]) => <li key={w}><b className={v}>{v}</b><span>{w}</span><em>{why}</em></li>)}</ul>}
          {st.rows && <dl className="dc-rows">{st.rows.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>}
          {st.block && <p className="dc-block-line mono"><b>Block</b><span>{st.block}</span></p>}
          {st.chain && <ul className="dc-code mono">{st.chain.map(([id, v, pol, h]) => <li key={id}><span>{id}</span><b className={v.replace('-', '')}>{v}</b><span>{pol}</span><em>prev {h}</em></li>)}</ul>}
          {st.foot && <p className="dc-foot">{st.foot}</p>}
        </div>

        <div className="dc-nav">
          <span className="dc-count">{String(s + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}<b>{st.k}</b></span>
          <span className="dc-prog"><i key={`${s}-${run}`} className={cx(run && 'run')} style={{ '--ms': `${STEP_MS}ms` }} /></span>
          <span className="dc-dots">
            {STEPS.map((x, i) => <button key={x.k} type="button" aria-label={`Step ${i + 1}: ${x.k}`} aria-pressed={i === s} className={cx(i === s && 'on')} onClick={() => go(i)} />)}
          </span>
        </div>
      </div>
    </figure>
  );
}
