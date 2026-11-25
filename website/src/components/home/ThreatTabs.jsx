import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* The four AI-driven identity threats the platform stops, each shown with the
   product screen from the brand film that stops it. Tabs advance on their own
   while on screen (with a progress bar) until the visitor picks one. */

export const THREATS = [
  {
    key: 'session', icon: 'UserCircle', tab: 'Account takeover mid-session', img: 'ui-session',
    product: 'adapID AI · Continuous Identity Risk Management', path: '/adapid-ai',
    h: 'A trusted session changes hands. adapID notices in the same minute.',
    p: 'Mei signed in from the office on her managed laptop. By 14:05 the same session runs on public Wi-Fi, from a laptop never seen for her identity, and opens finance reports for the first time in 90 days. adapID rescores her identity from 14 to 62, states every reason, and your policy requests step-up verification before sensitive access.',
    out: ['Risk 14 → 62, with the reason for every point', 'Step-up verification, not a blanket lockout'],
  },
  {
    key: 'machine', icon: 'Cloud', tab: 'Over-privileged machine identities', img: 'ui-machine',
    product: 'adapID AI · NHI Security for AWS', path: '/adapid-ai/nhi-security',
    h: 'One workload can reach everything. adapID shows you what, and cuts it back.',
    p: 'The IAM role behind payment-service-prod holds s3:* on every bucket. CloudTrail shows it used two actions on one bucket in 90 days. adapID maps workload to role to everything it can reach, proposes the least-privilege policy and applies it only with your approval.',
    out: ['Granted vs. used, from 90 days of CloudTrail', 'Least privilege, applied with approval'],
  },
  {
    key: 'fraud', icon: 'CreditCard', tab: 'Fraud with valid credentials', img: 'ui-fraud',
    product: 'adapID AI · Identity Fraud Prevention', path: '/adapid-ai/fraud-prevention',
    h: 'The password and OTP are right. The behaviour is not.',
    p: 'Two sessions, one customer, both past login. Session B runs on a device first seen four minutes ago, typing and touch match her behaviour 18%, and the ₹85,000 transfer goes to a beneficiary added three minutes ago. adapID scores it 88 and the bank’s policy asks for a face check before money moves. The real customer sees no extra step.',
    out: ['Risk 88 on the fraudster, 8 on the customer', 'No added friction for genuine customers'],
  },
  {
    key: 'ai', icon: 'Robot', tab: 'Secrets leaking into AI', img: 'ui-prompt',
    product: 'Zenstra AI · Secure AI Interactions', path: '/agentic-ai/agentic-identity',
    h: 'An engineer pastes production secrets into an AI prompt. Zenstra keeps them inside.',
    p: 'A failed deploy, a quick question to an AI assistant, and a production .env file with an AWS access key, a secret key and a database password. Zenstra detects all three secrets on the device, blocks the prompt before it is sent, and records the decision with the policy that made it.',
    out: ['3 secrets found, prompt never sent', 'Decision recorded for the audit'],
  },
];

const AUTO_MS = 8000;

export default function ThreatTabs() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.35 });
  const reduce = useReducedMotion();
  const [k, setK] = useState(0);
  const [auto, setAuto] = useState(true);
  const tabs = useRef([]);

  useEffect(() => {
    if (!auto || reduce || !inView) return undefined;
    const t = setTimeout(() => setK((n) => (n + 1) % THREATS.length), AUTO_MS);
    return () => clearTimeout(t);
  }, [k, auto, inView, reduce]);

  const pick = (i) => { setAuto(false); setK(i); };
  const onKey = (e) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const i = e.key === 'Home' ? 0 : THREATS.length - 1;
      pick(i); tabs.current[i]?.focus();
      return;
    }
    if (!d) return;
    e.preventDefault();
    const i = (k + d + THREATS.length) % THREATS.length;
    pick(i); tabs.current[i]?.focus();
  };

  const x = THREATS[k];
  const running = auto && !reduce && inView;

  return (
    <div ref={ref} className="tt">
      <div className="tt-list" role="tablist" aria-label="AI-driven identity threats" onKeyDown={onKey}>
        {THREATS.map((t, i) => (
          <button key={t.key} ref={(el) => { tabs.current[i] = el; }} type="button" role="tab" id={`tt-tab-${t.key}`} aria-controls={`tt-panel-${t.key}`}
            aria-selected={i === k} tabIndex={i === k ? 0 : -1} className={cx('tt-tab', i === k && 'on')} onClick={() => pick(i)}>
            <span className="tt-ico"><Icon name={t.icon} size={20} /></span>
            <span className="tt-t">{t.tab}</span>
            <span className="tt-n">0{i + 1}</span>
            {i === k && <span className={cx('tt-prog', running && 'run')} style={{ '--ms': `${AUTO_MS}ms` }} key={`${k}-${running}`} aria-hidden="true" />}
          </button>
        ))}
      </div>

      <div className="tt-panel" role="tabpanel" id={`tt-panel-${x.key}`} aria-labelledby={`tt-tab-${x.key}`} key={x.key}>
        <div className="tt-shot">
          <img src={`/img/film/${x.img}.webp`} alt={`${x.product} screen from the Deep Algorithms film: ${x.out[0]}.`} width="1600" height="900" loading="lazy" decoding="async" />
        </div>
        <div className="tt-copy">
          <p className="tt-prod">{x.product}</p>
          <h3 className="tt-h">{x.h}</h3>
          <p className="tt-p">{x.p}</p>
          <ul className="tt-out">
            {x.out.map((o) => <li key={o}><Icon name="CheckCircle" size={18} weight="fill" />{o}</li>)}
          </ul>
          <Link to={x.path} className="link mt-6 text-[15px]">See how it works<Icon name="ArrowRight" size={14} weight="bold" /></Link>
        </div>
      </div>
    </div>
  );
}
