import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* The gap the Cisco film names, drawn as a card over a photograph:
   authentication checks once, access follows on blind trust. Authentication
   answers "can this identity get in?"; Deep Algorithms asks "should it be
   doing this, right now?" and closes the gap. It plays once per visit to the
   view; the server render and reduced motion show the closed gap. */

const STEPS = [
  { k: 'gap', mid: 'Blind trust', sub: 'Most organisations stop checking here' },
  { k: 'can', mid: 'Can', sub: 'it sign in?' },
  { k: 'should', mid: 'Should', sub: 'it be doing this, right now?' },
  { k: 'closed', mid: 'Continuous posture', sub: 'Every identity, every action, checked' },
];

export default function TrustGap() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.4 });
  const reduce = useReducedMotion();
  const [s, setS] = useState(STEPS.length - 1);
  const began = useRef(false);

  useEffect(() => {
    if (reduce || !inView) return undefined;
    if (!began.current) { began.current = true; setS(0); return undefined; }
    if (s >= STEPS.length - 1) return undefined;
    const t = setTimeout(() => setS((n) => n + 1), s === 0 ? 2200 : 1800);
    return () => clearTimeout(t);
  }, [s, inView, reduce]);

  const st = STEPS[s];
  const closed = st.k === 'closed';
  return (
    <div ref={ref} className={cx('tg', `tg-${st.k}`)} role="img" aria-label="Authentication checks an identity once. Without continuous posture, access follows on blind trust. Authentication answers whether an identity can sign in; Deep Algorithms asks whether it should be doing what it is doing, and checks every action.">
      <div className="tg-row" aria-hidden="true">
        <span className="tg-node"><span className="tg-ring"><Icon name="CheckCircle" size={22} /></span><small>Authentication</small></span>
        <span className="tg-mid">
          <span className="tg-line" />
          <span className="tg-word" key={st.k}><b>{st.mid}</b><small>{st.sub}</small></span>
        </span>
        <span className="tg-node"><span className="tg-ring"><Icon name="Database" size={22} /></span><small>Access</small></span>
      </div>
      <p className="tg-foot" aria-hidden="true">
        {closed
          ? <><Icon name="ShieldCheck" size={16} weight="fill" />Deep Algorithms closes the gap</>
          : <><Icon name="Warning" size={16} weight="fill" />Valid credentials, unchecked actions</>}
      </p>
    </div>
  );
}
