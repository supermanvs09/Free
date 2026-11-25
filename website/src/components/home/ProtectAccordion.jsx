import { useState } from 'react';
import { Link } from 'react-router';
import { cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* "What we protect you from": the threats in an accordion beside a
   photograph, the way SailPoint ("How we help") and Cisco ("Powering
   outcomes") lay out use cases. One item is open at a time and the picture
   changes with it. Pictures are dark cinematic concept renders, shown as
   they are, with nothing laid over them (the cisco.com pattern). */

const ITEMS = [
  {
    key: 'ato', icon: 'Key', t: 'Stolen credentials and account takeover',
    p: 'Phishing, MFA fatigue and infostealers hand attackers valid passwords. adapID scores every session against how that person normally works, and steps up verification the moment the behaviour changes.',
    link: ['Continuous Identity Risk Management', '/adapid-ai'],
    img: 'concept/credentials', alt: 'A glowing fingerprint on a scanner',
  },
  {
    key: 'nhi', icon: 'Cloud', t: 'Over-privileged machine identities',
    p: 'Service accounts, keys and workload roles outnumber your people and hold standing access nobody reviews. adapID maps what each one can reach, compares it with what it uses, and proposes least privilege.',
    link: ['NHI Security for AWS', '/adapid-ai/nhi-security'],
    img: 'concept/machine-cube', alt: 'A glowing data cube suspended in infrastructure',
  },
  {
    key: 'fraud', icon: 'CreditCard', t: 'Fraud with valid credentials',
    p: 'The password and OTP are right; the behaviour is not. adapID tells the real customer from a fraudster on the same account, and holds the payment before the money moves.',
    link: ['Identity Fraud Prevention', '/adapid-ai/fraud-prevention'],
    img: 'concept/payment-cards', alt: 'Payment cards floating in the dark',
  },
  {
    key: 'ai', icon: 'Robot', t: 'Shadow AI agents and leaked secrets',
    p: 'Teams launch copilots, agents and MCP servers faster than security can review them, and paste secrets into AI tools. Zenstra discovers every agent, scopes it to its task and keeps secrets out of prompts.',
    link: ['Zenstra AI', '/agentic-ai/agentic-identity'],
    img: 'concept/ai-agents', alt: 'A wireframe brain made of light, for AI agents',
  },
  {
    key: 'audit', icon: 'Scales', t: 'Audit gaps and regulatory exposure',
    p: 'Auditors and regulators ask who accessed what, and why. Deep Algorithms records every decision with its reason, mapped to ISO/IEC 42001, the DPDP Act 2023 and RBI and SEBI expectations.',
    link: ['ICMS Compliance Suite', '/dpdpa-compliance'],
    img: 'concept/evidence-blocks', alt: 'A sphere of glowing data blocks',
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
        <img src={`/img/${x.img}.webp`} alt={x.alt} width="1400" height="1120" loading="lazy" decoding="async" />
      </figure>
    </div>
  );
}
