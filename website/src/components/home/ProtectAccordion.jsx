import { useState } from 'react';
import { Link } from 'react-router';
import { cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* "What we protect you from": the threats in an accordion beside a
   photograph, the way SailPoint ("How we help") and Cisco ("Powering
   outcomes") lay out use cases. One item is open at a time; the picture
   and its floating product card change with it. Pictures are concept
   renders in cisco.com's style (each depicts its idea, no stock people).
   Sample data on the cards. */

const ITEMS = [
  {
    key: 'ato', icon: 'Key', t: 'Stolen credentials and account takeover',
    p: 'Phishing, MFA fatigue and infostealers hand attackers valid passwords. adapID scores every session against how that person normally works, and steps up verification the moment the behaviour changes.',
    link: ['Continuous Identity Risk Management', '/adapid-ai'],
    img: 'concept/credentials', alt: 'A glowing fingerprint on a scanner',
    card: { k: 'Session risk', v: '14 → 62', tone: 'risk', rows: ['New device, first seen today', 'Public network, outside usual hours'], act: 'Step-up verification enforced' },
  },
  {
    key: 'nhi', icon: 'Cloud', t: 'Over-privileged machine identities',
    p: 'Service accounts, keys and workload roles outnumber your people and hold standing access nobody reviews. adapID maps what each one can reach, compares it with what it uses, and proposes least privilege.',
    link: ['NHI Security for AWS', '/adapid-ai/nhi-security'],
    img: 'concept/machine-cube', alt: 'A glowing data cube suspended in infrastructure',
    card: { k: 'payment-service-prod', mono: true, v: 's3:* on *', tone: 'crit', rows: ['Granted: every bucket', 'Used in 90 days: 2 actions'], act: 'Least privilege proposed' },
  },
  {
    key: 'fraud', icon: 'CreditCard', t: 'Fraud with valid credentials',
    p: 'The password and OTP are right; the behaviour is not. adapID tells the real customer from a fraudster on the same account, and holds the payment before the money moves.',
    link: ['Identity Fraud Prevention', '/adapid-ai/fraud-prevention'],
    img: 'concept/payment-cards', alt: 'Payment cards floating in the dark',
    card: { k: 'Transfer · ₹85,000', v: '88', tone: 'crit', rows: ['Device first seen 4 min ago', 'Typing pattern: 18% match'], act: 'Payment held for verification' },
  },
  {
    key: 'ai', icon: 'Robot', t: 'Shadow AI agents and leaked secrets',
    p: 'Teams launch copilots, agents and MCP servers faster than security can review them, and paste secrets into AI tools. Zenstra discovers every agent, scopes it to its task and keeps secrets out of prompts.',
    link: ['Zenstra AI', '/agentic-ai/agentic-identity'],
    img: 'concept/ai-processor', alt: 'A glowing AI processor on a circuit board',
    card: { k: 'Prompt to AI assistant', v: '3 secrets', tone: 'crit', rows: ['AWS access key, secret key', 'Production database password'], act: 'Blocked before it was sent' },
  },
  {
    key: 'audit', icon: 'Scales', t: 'Audit gaps and regulatory exposure',
    p: 'Auditors and regulators ask who accessed what, and why. Deep Algorithms records every decision with its reason, mapped to ISO/IEC 42001, the DPDP Act 2023 and RBI and SEBI expectations.',
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
