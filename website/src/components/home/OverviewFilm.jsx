import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion, cx } from '../../lib/motion.js';

/* The overview: a 49-second animated explainer, told the way enterprise
   identity films are (Cisco Identity Intelligence, for one): the threat, the
   gap it exploits, then the platform closing it step by step, and the outcome.
   It is drawn in code, so it is sharp at any size, weighs nothing and always
   matches the product. Poster first; plays on request; chapters, captions and
   keyboard control; reduced motion steps through still scenes. */

export const SCENES = [
  { key: 'threat', ch: 'The threat', cap: 'Attackers no longer break in. They sign in, with stolen credentials, phished sessions and leaked keys.' },
  { key: 'gap', ch: 'The trust gap', cap: 'Authentication proves who signed in. It does not prove what that identity does next.' },
  { key: 'agents', ch: 'AI agents', cap: 'AI agents now hold that same trust, and they act thousands of times a day without a human watching.' },
  { key: 'discover', ch: 'Discover', cap: 'Deep Algorithms discovers every human, machine and AI agent identity, and maps what each one can reach.' },
  { key: 'assess', ch: 'Assess', cap: 'It scores the posture of every identity continuously, and surfaces the one that starts to drift.' },
  { key: 'enforce', ch: 'Enforce', cap: 'It enforces policy before the action executes, and stops the unsafe one in milliseconds.' },
  { key: 'prove', ch: 'Prove', cap: 'It records every decision as evidence your auditors and regulators accept.' },
];
const SCENE_S = 7;
const TOTAL = SCENES.length * SCENE_S;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ---------- scenes: each is a pure function of its local progress p (0..1) ---------- */
const on = (p, at) => (p >= at ? 'on' : '');

function Threat({ p }) {
  const vectors = ['Stolen credentials', 'Phishing', 'MFA fatigue', 'Leaked API keys', 'Prompt injection', 'Shadow AI'];
  return (
    <div className="of-scene of-threat">
      <div className={cx('of-login', on(p, 0.55))}>
        <span className="of-login-h">Sign in</span>
        <span className="of-field">r.mehta@acme.in</span>
        <span className="of-field">••••••••••••</span>
        <span className="of-ok">✓ Authenticated</span>
      </div>
      {vectors.map((v, i) => {
        const a = ((i * 60 - 150) * Math.PI) / 180;
        return <span key={v} className={cx('of-vec', on(p, 0.06 + i * 0.07))} style={{ left: `${50 + Math.cos(a) * 33}%`, top: `${50 + Math.sin(a) * 34}%` }}>{v}</span>;
      })}
    </div>
  );
}

function Gap({ p }) {
  return (
    <div className="of-scene of-gap">
      <div className="of-node"><span className="of-circ">✓</span><b>Authentication</b><small>Who signed in</small></div>
      <div className={cx('of-bridge', on(p, 0.2))}>
        <span className={cx('of-blind', on(p, 0.35))}>Blind trust</span>
        <span className={cx('of-q', on(p, 0.6))}>What happens next?</span>
      </div>
      <div className="of-node"><span className="of-circ of-circ-w">→</span><b>Access</b><small>What it does</small></div>
    </div>
  );
}

function Agents({ p }) {
  const acts = [['support-triage', 'read ticket #4821', 'ok'], ['invoice-bot', 'pay approved invoice', 'ok'], ['code-assist', 'push to main', 'ok'], ['support-triage', 'export customers.csv', 'bad'], ['sales-copilot', 'email 2,400 contacts', 'warn']];
  return (
    <div className="of-scene of-agents">
      <div className="of-feed">
        <p className="of-feed-h"><span>Agent actions</span><span className="of-rate">{Math.round(1200 + p * 2600).toLocaleString('en-US')} / hour</span></p>
        {acts.map(([a, x, s], i) => (
          <p key={i} className={cx('of-act', on(p, 0.08 + i * 0.14), s)}><span className="of-ag">{a}</span><span>{x}</span><span className="of-st">{s === 'bad' ? 'Unreviewed' : s === 'warn' ? 'Unreviewed' : 'Allowed'}</span></p>
        ))}
      </div>
    </div>
  );
}

function Discover({ p }) {
  const nodes = [
    ['human', 20, 20, 'Employees · 11,640'], ['human', 12, 62, 'Partners · 840'], ['machine', 34, 84, 'Service accounts · 9,214'],
    ['machine', 66, 86, 'Cloud keys · 39,698'], ['agent', 86, 60, 'AI agents · 1,284'], ['agent', 82, 20, 'MCP servers · 57'], ['machine', 50, 10, 'Workloads · 2,906'],
  ];
  return (
    <div className="of-scene of-disc">
      <svg className="of-graph" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {nodes.map(([, x, y], i) => <line key={i} x1="50" y1="50" x2={x} y2={y} className={on(p, 0.1 + i * 0.08)} pathLength="1" />)}
      </svg>
      <span className="of-hub"><img src="/brand/mark.webp" alt="" width="34" height="34" /></span>
      {nodes.map(([k, x, y, l], i) => (
        <span key={l} className={cx('of-gn', `k-${k}`, on(p, 0.16 + i * 0.08))} style={{ left: `${x}%`, top: `${y}%` }}>{l}</span>
      ))}
      <span className={cx('of-count', on(p, 0.75))}>65,639 identities mapped</span>
    </div>
  );
}

function Assess({ p }) {
  const risk = Math.round(18 + Math.max(0, (p - 0.3) / 0.6) * 64);
  return (
    <div className="of-scene of-assess">
      <div className="of-rcard">
        <p className="of-rk">support-triage <small>AI agent · Copilot Studio</small></p>
        <div className="of-meter"><span style={{ width: `${Math.min(82, risk)}%`, background: risk > 60 ? '#c4321f' : risk > 40 ? '#d18b00' : '#1f9d63' }} /></div>
        <p className="of-rv"><b>{Math.min(82, risk)}</b> risk</p>
        <ul className="of-why">
          <li className={on(p, 0.35)}>Holds a token with write access to the CRM</li>
          <li className={on(p, 0.5)}>Reads 40× more records than its peers</li>
          <li className={on(p, 0.65)}>No accountable owner on record</li>
        </ul>
      </div>
    </div>
  );
}

function Enforce({ p }) {
  return (
    <div className="of-scene of-enforce">
      <div className="of-call">
        <p className="of-call-h">Tool call</p>
        <p className="of-code"><span>support-triage</span> → crm.export(<i>"customers"</i>, rows: 4812)</p>
        <div className="of-pol">
          <span className={on(p, 0.2)}>Task: answer support tickets</span>
          <span className={on(p, 0.32)}>Scope: read one ticket at a time</span>
          <span className={on(p, 0.44)}>Destination: external address</span>
        </div>
        <p className={cx('of-verdict', on(p, 0.58))}>Blocked · 4 ms</p>
        <p className={cx('of-notify', on(p, 0.72))}>Owner notified · token scoped to read-only</p>
      </div>
    </div>
  );
}

function Prove({ p }) {
  return (
    <div className="of-scene of-prove">
      <div className="of-rec">
        <p className="of-rec-h">Decision record <span>#DR-20481</span></p>
        <dl>
          <div className={on(p, 0.1)}><dt>Identity</dt><dd>support-triage · AI agent</dd></div>
          <div className={on(p, 0.2)}><dt>Action</dt><dd>crm.export · 4,812 rows</dd></div>
          <div className={on(p, 0.3)}><dt>Decision</dt><dd>Blocked by policy AG-07, in 4 ms</dd></div>
          <div className={on(p, 0.4)}><dt>Reason</dt><dd>Outside the agent’s declared task</dd></div>
          <div className={on(p, 0.5)}><dt>Mapped to</dt><dd>ISO/IEC 42001 · DPDP Act 2023</dd></div>
        </dl>
        <p className={cx('of-seal', on(p, 0.65))}>Tamper-evident · exported to your SIEM</p>
      </div>
      <p className={cx('of-end', on(p, 0.8))}>Continuous AI Security Posture Management</p>
    </div>
  );
}

const VIEWS = { threat: Threat, gap: Gap, agents: Agents, discover: Discover, assess: Assess, enforce: Enforce, prove: Prove };

export default function OverviewFilm({ startSignal = 'da:play-overview' }) {
  const reduce = useReducedMotion();
  const [state, setState] = useState('poster'); // poster | playing | paused | ended
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const box = useRef(null);

  const play = useCallback((from) => {
    if (typeof from === 'number') { timeRef.current = from; setTime(from); }
    setState('playing');
    box.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const go = () => play(0);
    window.addEventListener(startSignal, go);
    return () => window.removeEventListener(startSignal, go);
  }, [play, startSignal]);

  useEffect(() => {
    if (state !== 'playing') return undefined;
    if (reduce) { // still scenes, one every SCENE_S seconds
      const id = setInterval(() => {
        const n = Math.floor(timeRef.current / SCENE_S) + 1;
        if (n >= SCENES.length) { setState('ended'); return; }
        timeRef.current = n * SCENE_S + SCENE_S - 0.01; setTime(timeRef.current);
      }, SCENE_S * 1000);
      timeRef.current = Math.floor(timeRef.current / SCENE_S) * SCENE_S + SCENE_S - 0.01; setTime(timeRef.current);
      return () => clearInterval(id);
    }
    let last = performance.now(), raf;
    const tick = (now) => {
      timeRef.current = Math.min(TOTAL, timeRef.current + Math.max(0, now - last) / 1000); // a frame stamp can precede `last`
      last = now;
      setTime(timeRef.current);
      if (timeRef.current >= TOTAL) { setState('ended'); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, reduce]);

  const idx = Math.max(0, Math.min(SCENES.length - 1, Math.floor(time / SCENE_S)));
  const local = Math.max(0, Math.min(1, (time - idx * SCENE_S) / SCENE_S));
  const S = SCENES[idx];
  const View = VIEWS[S.key];
  const seek = (i) => { timeRef.current = i * SCENE_S; setTime(i * SCENE_S); if (state !== 'playing') setState('playing'); };
  const toggle = () => (state === 'playing' ? setState('paused') : play(state === 'ended' ? 0 : undefined));
  const onKey = (e) => {
    if (state === 'poster') return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); seek(Math.min(SCENES.length - 1, idx + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); seek(Math.max(0, idx - 1)); }
  };

  return (
    <div className="of" ref={box} tabIndex={-1} onKeyDown={onKey} role="region" aria-label="Overview film">
      <div className="of-frame">
        <div className="of-bg" aria-hidden="true" />
        {state === 'poster' ? (
          <button type="button" className="of-poster" onClick={() => play(0)} aria-label={`Play the overview: how Deep Algorithms closes the AI trust gap, ${mmss(TOTAL)}`}>
            <span className="of-poster-prev" aria-hidden="true"><Discover p={1} /></span>
            <span className="of-poster-grid" aria-hidden="true" />
            <span className="of-poster-t">
              <span className="of-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg></span>
              <span>
                <span className="of-poster-k">Overview · {mmss(TOTAL)}</span>
                <span className="of-poster-h">Close the AI trust gap.</span>
              </span>
            </span>
          </button>
        ) : (
          <>
            <div key={S.key} className="of-stage" aria-hidden="true"><View p={reduce ? 1 : local} /></div>
            <p className="of-chip" aria-hidden="true">{String(idx + 1).padStart(2, '0')} / {String(SCENES.length).padStart(2, '0')} · {S.ch}</p>
            <p className="of-cap" aria-live="polite">{S.cap}</p>
            {state === 'ended' && (
              <button type="button" className="of-replay" onClick={() => play(0)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Watch again</button>
            )}
          </>
        )}
      </div>
      {state !== 'poster' && (
        <div className="of-ctl">
          <button type="button" onClick={toggle} className="of-btn" aria-label={state === 'playing' ? 'Pause' : 'Play'}>
            {state === 'playing'
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>}
          </button>
          <ol className="of-chapters" aria-label="Chapters">
            {SCENES.map((s, i) => (
              <li key={s.key}>
                <button type="button" onClick={() => seek(i)} aria-label={`Chapter ${i + 1}: ${s.ch}`} aria-current={i === idx ? 'step' : undefined} className={cx('of-seg', i < idx && 'done', i === idx && 'now')}>
                  <span className="of-seg-fill" style={{ width: i < idx ? '100%' : i === idx ? `${local * 100}%` : '0%' }} />
                </button>
              </li>
            ))}
          </ol>
          <span className="of-time">{mmss(time)} / {mmss(TOTAL)}</span>
        </div>
      )}
    </div>
  );
}
