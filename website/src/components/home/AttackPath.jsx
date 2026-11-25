import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* How an AI-driven identity attack runs, told twice on one path.
   "Without continuous posture": the attacker passes sign-in with valid
   credentials and, because the session is trusted from then on, reaches the
   data. "With Deep Algorithms": every step is scored, and the session is
   stopped at the first change in behaviour. It alternates on its own while on
   screen; the two buttons pick a version. The server render and reduced
   motion show the protected path. */

const STAGES = [
  { icon: 'Detective', k: 'Credential theft', a: 'AI-written phishing and a cloned voice capture a password and OTP.', b: 'Flags the leaked credential and raises the identity’s risk.', bs: 'ok' },
  { icon: 'LockOpen', k: 'Sign-in', a: 'Valid password. MFA passed. Access granted.', b: 'Scores the sign-in against 90 days of behaviour: risk 49.', bs: 'warn' },
  { icon: 'Eye', k: 'Trusted session', a: 'New device, new network, finance reports opened for the first time in 90 days.', b: 'Rescores to 88 mid-session and enforces step-up verification.', bs: 'stop' },
  { icon: 'Key', k: 'Privilege abuse', a: 'Borrows a service account that holds s3:* on every bucket.', b: 'Never reached. Unused privilege was already revoked.', bs: 'idle' },
  { icon: 'Export', k: 'Exfiltration', a: 'Exports 4,812 customer records and pastes secrets into an AI tool.', b: 'Never reached. Data stays inside.', bs: 'idle' },
];

/* frames: [phase, stages reached] */
const FRAMES = [['a', 1], ['a', 2], ['a', 3], ['a', 4], ['a', 5], ['a', 5], ['b', 1], ['b', 2], ['b', 3], ['b', 3]];
const DUR = [1300, 1300, 1300, 1300, 1300, 3200, 1300, 1300, 1300, 3600];
const START = { a: 0, b: 6 };

export default function AttackPath() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [f, setF] = useState(FRAMES.length - 1);
  const began = useRef(false);

  useEffect(() => {
    if (reduce || !inView) return undefined;
    if (!began.current) { began.current = true; setF(0); return undefined; }
    const t = setTimeout(() => setF((n) => (n + 1) % FRAMES.length), DUR[f]);
    return () => clearTimeout(t);
  }, [f, inView, reduce]);

  const [ph, n] = FRAMES[f];
  const safe = ph === 'b';

  return (
    <figure ref={ref} className={cx('ap', safe ? 'safe' : 'open')}>
      <div className="ap-top">
        <div className="ap-sw" role="group" aria-label="Choose a version of the attack path">
          <button type="button" aria-pressed={!safe} onClick={() => setF(reduce ? 5 : START.a)}>Without continuous posture</button>
          <button type="button" aria-pressed={safe} onClick={() => setF(reduce ? 9 : START.b)}>With Deep Algorithms</button>
        </div>
        <p className="ap-verdict">
          {safe
            ? (n >= 3 ? <><Icon name="ShieldCheck" size={16} weight="fill" />Stopped at step 3. No data left.</> : <><span className="ap-live" />Scoring every step…</>)
            : (n >= 5 ? <><Icon name="Warning" size={16} weight="fill" />Breach. Every control said yes.</> : <><span className="ap-live" />Attack in progress…</>)}
        </p>
      </div>

      <ol className="ap-path">
        {STAGES.map((s, i) => {
          const reached = i < n;
          const st = safe ? (reached ? s.bs : (i >= 3 ? 'idle' : 'wait')) : (reached ? 'hit' : 'wait');
          return (
            <li key={s.k} className={cx('ap-st', st, reached && 'in')}>
              <span className="ap-ico"><Icon name={s.icon} size={20} /></span>
              <span className="ap-n">Step {i + 1}</span>
              <b className="ap-k">{s.k}</b>
              <span className="ap-what">{safe ? s.b : s.a}</span>
            </li>
          );
        })}
      </ol>

      <div className="ap-gap" aria-hidden="true">
        <span className="ap-gap-l">Authentication checks here, once</span>
        <span className="ap-gap-r">{safe ? 'Deep Algorithms keeps checking every action' : 'Blind trust: most tools stop watching after sign-in'}</span>
      </div>
      <figcaption className="sr-only">An identity attack in five steps: credential theft, sign-in, trusted session, privilege abuse and exfiltration. Without continuous posture, the attacker passes sign-in with valid credentials and reaches the data. With Deep Algorithms, the session is rescored at step 3 and stopped with step-up verification before any data leaves.</figcaption>
    </figure>
  );
}
