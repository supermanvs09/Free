import { useState } from 'react';
import { Proof, StatCard, StoryCard } from './Story.jsx';
import { cx } from './ui.jsx';

/* "Who we help" on the home page: a tab per role, then the coloured story
   panels (Story.jsx) for that role. */

const ROLES = [
  {
    products: ['adapid', 'zenstra', 'icms'],
    id: 'ciso', tab: 'CISO', h: 'One view of identity risk, and evidence the board can read.',
    points: ['People, machine identities and AI agents, ranked by risk', 'Every decision explained, for the board and regulators', 'One vendor for identity, agents and DPDPA'],
    photo: '/img/photos/hero-person.webp', pos: '62% 20%', chips: ['Finance analyst', 'Hyderabad office', 'Usual laptop'],
    apps: [['m365', 1], ['salesforce', 1], ['slack', 1], ['aws', 0]],
    to: '/why-deep-algorithms', cta: 'Why Deep Algorithms',
    stat: { v: '₹25.5 Cr', l: 'average cost of a data breach in India in 2026, the highest on record.', s: 'IBM Cost of a Data Breach Report, 2026' },
    proof: 'certs',
  },
  {
    products: ['adapid', 'zenstra'],
    id: 'soc', tab: 'Security operations', h: 'Fewer alerts, each with a reason and an action already taken.',
    points: ['Risk scores with the signals that raised them', 'Step-up, hold or block by policy, in seconds', 'Every AI agent action recorded with its task and outcome'],
    photo: '/img/roles/soc.webp', pos: '30% 30%', chips: ['Developer', 'Bengaluru', 'New phone, 02:14'], alert: 2,
    apps: [['github', 1], ['okta', 1], ['aws', 0], ['slack', 1]],
    to: '/adapid-ai', cta: 'See adapID AI',
    stat: { v: '22%', l: 'of breaches began with stolen or misused credentials, the most common way in.', s: 'Verizon Data Breach Investigations Report, 2025' },
    proof: 'award',
  },
  {
    products: ['adapid'],
    id: 'iam', tab: 'Identity and cloud', h: 'Every role, key and service account, with what it can reach and what it uses.',
    points: ['Unused access found and ready to remove', 'Leaked secrets in GitHub and CodeCommit triaged', 'Active Directory attack paths closed before they are taken'],
    photo: '/img/roles/iam.webp', pos: '60% 30%', chips: ['Platform engineer', 'Owns 14 service accounts', '3 keys unused for 90 days'], alert: 2,
    apps: [['aws', 1], ['github', 1], ['entra', 1], ['ad', 0]],
    to: '/adapid-ai/nhi-security', cta: 'See NHI Security for AWS',
    stat: { v: '82:1', l: 'machine identities for every person in the average organisation.', s: 'CyberArk Identity Security Landscape, 2025' },
    proof: 'deploy',
  },
  {
    products: ['icms'],
    id: 'dpo', tab: 'Compliance and DPO', h: 'DPDPA evidence made as data is used, not gathered before an audit.',
    points: ['Personal data found across your stores', 'Each access checked against purpose and consent', 'An audit package for DPDPA, RBI and SEBI in minutes'],
    photo: '/img/roles/dpo.webp', pos: '55% 30%', chips: ['Data protection officer', 'Access matched to purpose', 'Audit pack ready'],
    apps: [['m365', 1], ['google', 1], ['salesforce', 1]],
    to: '/dpdpa-compliance', cta: 'See ICMS',
    stat: { v: '₹250 Cr', l: 'maximum penalty for failing to protect personal data with reasonable safeguards.', s: 'Digital Personal Data Protection Act, 2023' },
    proof: 'regs',
  },
  {
    products: ['adapid'],
    id: 'fraud', tab: 'Fraud and digital banking', h: 'Account takeover, scams and mule accounts, stopped at login and at payment.',
    points: ['A risk decision at every login and payment, in under 80 ms', 'Mule accounts and payment scams flagged with reasons', 'Genuine customers never see an extra step'],
    photo: '/img/photos/bfsi.webp', pos: '40% 50%', chips: ['Bank customer', 'New payee, new phone', 'Payment paused, customer called'], alert: 1,
    apps: [['upi', 1]],
    to: '/adapid-ai/fraud-prevention', cta: 'See Identity Fraud Prevention',
    stat: { v: '₹36,014 Cr', l: 'involved in bank frauds reported in India in 2024–25.', s: 'RBI Annual Report, 2024–25' },
    proof: 'customers',
  },
];

export default function RoleCards() {
  const [on, setOn] = useState(0);
  const R = ROLES[on];
  const key = (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (on + d + ROLES.length) % ROLES.length;
    setOn(n);
    document.getElementById(`role-${ROLES[n].id}`)?.focus();
  };
  return (
    <div className="mt-10">
      <div role="tablist" aria-label="Roles" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:justify-center md:px-0" onKeyDown={key}>
        {ROLES.map((r, i) => (
          <button key={r.id} id={`role-${r.id}`} type="button" role="tab" aria-selected={i === on} aria-controls="role-panel" tabIndex={i === on ? 0 : -1} onClick={() => setOn(i)}
            className={cx('shrink-0 rounded-full border px-4 py-2.5 text-[15px] font-medium transition-colors', i === on ? 'border-transparent bg-[#2f6fe4] text-white' : 'border-line-2 text-ink-2 hover:text-ink')}>
            {r.tab}
          </button>
        ))}
      </div>

      <div id="role-panel" role="tabpanel" aria-labelledby={`role-${R.id}`} key={R.id} className="rc fadein mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <StoryCard story={R} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[auto_1fr]">
          <StatCard items={[R.stat]} />
          <div className="rc-proof rounded-[22px] p-7"><Proof kind={R.proof} /></div>
        </div>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3">People shown are models. Names, places and access are illustrations.</p>
    </div>
  );
}
