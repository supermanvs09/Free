import { useState } from 'react';
import { Link } from 'react-router';
import { cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* "What we protect you from": the threats in an accordion beside a
   photograph, the way SailPoint ("How we help") and Cisco ("Powering
   outcomes") lay out use cases. One item is open at a time; the picture
   and its floating product card change with it. Pictures are concept
   renders, graded to one brand blue and framed with HUD corners, the way
   CrowdStrike and Idira present their use cases (each depicts its idea).
   Sample data on the cards. */

const ITEMS = [
  {
    key: 'ato', icon: 'Key', t: 'Stop account takeover',
    p: 'adapID scores every session against how that person normally works. When behaviour shifts, it asks for proof instead of locking everyone out, so an attacker with a valid password gets no further than sign-in.',
    link: ['Continuous Identity Risk Management', '/adapid-ai'],
    img: 'concept/credentials', alt: 'A glowing fingerprint on a scanner',
    card: { k: 'Session risk', v: '14 → 62', tone: 'risk', rows: ['New device, first seen today', 'Public network, outside usual hours'], act: 'Step-up verification enforced' },
  },
  {
    key: 'nhi', icon: 'Cloud', t: 'Cut machine access to what it uses',
    p: 'Service accounts, keys and workload roles hold standing access that nobody reviews. adapID compares what each one can reach with what it actually uses, and removes the rest with your approval.',
    link: ['NHI Security for AWS', '/adapid-ai/nhi-security'],
    img: 'concept/machine-cube', alt: 'A glowing data cube suspended in infrastructure',
    card: { k: 'payment-service-prod', mono: true, v: 's3:* on *', tone: 'crit', rows: ['Granted: every bucket', 'Used in 90 days: 2 actions'], act: 'Least privilege proposed' },
  },
  {
    key: 'fraud', icon: 'CreditCard', t: 'Stop fraud that passes login',
    p: 'The password and OTP are right; the behaviour is not. adapID tells the real customer from a fraudster on the same account and holds the payment before money moves, without adding friction for genuine customers.',
    link: ['Identity Fraud Prevention', '/adapid-ai/fraud-prevention'],
    img: 'concept/payment-cards', alt: 'Payment cards floating in the dark',
    card: { k: 'Transfer · ₹85,000', v: '88', tone: 'crit', rows: ['Device first seen 4 min ago', 'Typing pattern: 18% match'], act: 'Payment held for verification' },
  },
  {
    key: 'ai', icon: 'Robot', t: 'Adopt AI without leaking data',
    p: 'Let teams build copilots and agents. Zenstra finds every one, scopes it to its task and keeps secrets and customer data out of prompts, so security can approve AI instead of blocking it.',
    link: ['Zenstra AI', '/agentic-ai/agentic-identity'],
    img: 'concept/ai-agents', alt: 'A wireframe brain made of light, for AI agents',
    card: { k: 'Prompt to AI assistant', v: '3 secrets', tone: 'crit', rows: ['AWS access key, secret key', 'Production database password'], act: 'Blocked before it was sent' },
  },
  {
    key: 'audit', icon: 'Scales', t: 'Answer auditors with evidence, not effort',
    p: 'Who accessed what, and why? Every decision is kept with its reason and mapped to ISO/IEC 42001, the DPDP Act 2023 and RBI and SEBI expectations, ready before the auditor asks.',
    link: ['ICMS Compliance Suite', '/dpdpa-compliance'],
    img: 'concept/evidence-blocks', alt: 'Blocks of structured data with one glowing record',
    card: { k: 'Decision record', v: 'Recorded', tone: 'ok', rows: ['Every access, with its reason', 'Mapped to DPDP Act 2023'], act: 'Evidence ready for audit' },
  },
];

export default function ProtectAccordion() {
  const [open, setOpen] = useState(0);
  const x = ITEMS[open];
  return (
    <div className="pa">
      <ul className="pa-list">
        {ITEMS.map((it, i) => {
          const on = i === open;
          return (
            <li key={it.key} className={cx('pa-item', on && 'on')}>
              <h3>
                <button type="button" aria-expanded={on} aria-controls={`pa-${it.key}`} id={`pa-b-${it.key}`} onClick={() => setOpen(i)}>
                  <span className="pa-ico"><Icon name={it.icon} size={20} /></span>
                  <span className="pa-t">{it.t}</span>
                  <Icon name={on ? 'CaretDown' : 'CaretRight'} size={16} className="pa-car" />
                </button>
              </h3>
              <div id={`pa-${it.key}`} role="region" aria-labelledby={`pa-b-${it.key}`} className="pa-body" hidden={!on}>
                <p>{it.p}</p>
                <Link to={it.link[1]} className="link mt-4 text-[15px]">{it.link[0]}<Icon name="ArrowRight" size={14} weight="bold" /></Link>
              </div>
            </li>
          );
        })}
      </ul>
      <figure className="pa-fig" key={x.key}>
        <img src={`/img/${x.img}.webp`} alt={x.alt} loading="lazy" decoding="async" />
        <figcaption className={cx('pa-card', x.card.tone)} aria-hidden="true">
          <span className="pa-card-k">{x.card.k}</span>
          <b className={cx('pa-card-v', x.card.mono && 'mono')}>{x.card.v}</b>
          <ul>{x.card.rows.map((r) => <li key={r}>{r}</li>)}</ul>
          <span className="pa-card-act"><Icon name="ShieldCheck" size={15} weight="fill" />{x.card.act}</span>
        </figcaption>
      </figure>
    </div>
  );
}
