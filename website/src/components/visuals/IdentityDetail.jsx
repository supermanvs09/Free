import { useRef } from 'react';
import { Warning, Sparkle, GearSix } from '@phosphor-icons/react/dist/ssr';
import { Frame, UITabs, Risk, Usage, Person, Tile, Logo, Chip, Cursor, useScript, cx } from './kit.jsx';

/* Identity detail: graph -> risk analysis -> remediate. Sample data. */
const VARIANTS = {
  agent: {
    icon: 'copilot', name: 'invoice-agent', tags: ['Copilot Studio', 'Internal', 'agt-7f3c91'], risk: 'High',
    owner: 'Rahul Menon', ownerRole: 'Finance', center: { icon: 'copilot', title: 'invoice-agent', sub: 'AI agent | Internal', tag: 'Agent' },
    alert: 'Sends files outside the company',
    mids: [{ icon: 'aws', title: 'svc-invoice-export', sub: 'IAM role', risk: 'High' }, { icon: 'snowflake', title: 'finance-reader', sub: 'Service account', risk: 'Medium' }],
    perms: ['s3:PutObject', 's3:*', 'SELECT customers', 'EXPORT'],
    summary: 'This agent can export customer invoices to external email and holds wildcard S3 access through svc-invoice-export.',
    findings: [['Permission risk', 'svc-invoice-export', 's3:* on the finance bucket'], ['Behaviour risk', 'crm.export', 'Destination outside the declared task']],
  },
  nhi: {
    icon: 'aws', name: 'svc-payments-recon', tags: ['IAM role', 'prod-payments', 'ap-south-1'], risk: 'High',
    owner: 'Rahul Menon', ownerRole: 'Payments', center: { icon: 'aws', title: 'svc-payments-recon', sub: 'IAM role | 3% of permissions used', tag: 'NHI' },
    alert: 'Trusted by an external AWS account',
    mids: [{ icon: 'aws', title: 'AKIA••••7Q2F', sub: 'Access key · 412 days', risk: 'Critical' }, { icon: 'github', title: 'payments-api', sub: 'Secret found in repo', risk: 'High' }],
    perms: ['iam:PassRole', 'AdministratorAccess', 's3:GetObject', 'kms:Decrypt'],
    summary: 'This role holds AdministratorAccess but used 3% of it in 90 days. Its access key is 412 days old and appears in the payments-api repository.',
    findings: [['Permission risk', 'AdministratorAccess', '97% of granted actions never used'], ['Credential risk', 'AKIA••••7Q2F', 'Never rotated, exposed in GitHub']],
  },
  human: {
    icon: 'okta', name: 'Kavya Reddy', tags: ['Treasury', 'Okta', 'Full-time'], risk: 'High', person: true,
    owner: 'Meera Pillai', ownerRole: 'Manager', center: { icon: 'okta', title: 'Kavya Reddy', sub: 'Treasury analyst | Okta', tag: 'User' },
    alert: 'Sign-in from unmanaged device at 23:47',
    mids: [{ icon: 'ad', title: 'Treasury-Approvers', sub: 'AD group', risk: 'High' }, { icon: 'okta', title: 'SAP Treasury', sub: 'SSO app', risk: 'Medium' }],
    perms: ['Approve payments', 'Export reports', 'Read ledgers', 'Admin console'],
    summary: 'Kavya exported 3 treasury reports in 90 seconds from a device never seen before, outside her usual 09:00 to 19:00 pattern.',
    findings: [['Behaviour risk', 'Okta session', 'Unmanaged device, off-hours'], ['Access risk', 'Treasury-Approvers', 'Payment approval rights during anomaly']],
  },
};

const STEPS = [
  { tab: 0, done: false, cur: 'center', dur: 2600 },
  { tab: 0, done: false, cur: 'tab-1', dur: 900 },
  { tab: 1, done: false, cur: 'tab-1', click: true, dur: 2400 },
  { tab: 1, done: false, cur: 'fix', dur: 1000 },
  { tab: 1, done: true, cur: 'fix', click: true, dur: 2800 },
];

function Node({ x, y, w = 24, tag, tagTone = 'grey', children, coral, curKey }) {
  return (
    <div data-cur={curKey} className={cx('absolute rounded-[10px] border bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(11,18,32,.06)]', coral ? 'border-coral' : 'border-line-2')}
      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%` }}>
      {tag && <span className={cx('absolute -top-2.5 left-2 rounded-[4px] px-1.5 text-[9px] font-medium leading-4', tagTone === 'coral' ? 'bg-coral-2 text-white' : tagTone === 'blue' ? 'bg-brand text-white' : 'bg-line text-ink-2')}>{tag}</span>}
      {children}
    </div>
  );
}

export default function IdentityDetail({ variant = 'agent', className }) {
  const box = useRef(null);
  const { step, reduce } = useScript(STEPS, box, 0);
  const v = VARIANTS[variant];
  const wire = (d) => <path d={d} fill="none" stroke="#cfd6df" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />;

  return (
    <Frame className={className}>
      <div ref={box} className="relative" role="img" aria-label={`Illustration: risk profile of ${v.name}, with identity graph, risk analysis and one-click remediation.`}>
        <div className="flex items-start gap-3 rounded-[12px] bg-white p-3">
          <Tile name={v.icon} size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-ink">{v.name}</div>
            <div className="mt-1 flex flex-wrap gap-1">{v.tags.map((t) => <Chip key={t}>{t}</Chip>)}</div>
            <div className="mt-2 flex items-center gap-3"><Risk level={v.risk} /><span className="flex items-center gap-1.5 text-[10.5px] text-ink-3">USAGE <Usage n={2} /></span></div>
          </div>
          <span className={cx('rounded-[6px] px-2 py-1 text-[11px] font-medium transition-colors duration-500', step.done ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn')}>
            {step.done ? 'Remediated' : 'Pending review'}
          </span>
        </div>

        <div className="mt-3"><UITabs tabs={['Identity Graph', 'Risk Analysis', 'Remediation', 'Lifecycle']} active={step.tab} /></div>

        <div className="relative mt-3 aspect-[4/3] overflow-hidden rounded-[12px] bg-white md:aspect-[16/8.4]">
          {step.tab === 0 ? (
            <div key="graph" className="fadein absolute inset-0">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {wire('M24 22 C 28 22, 27 47, 31 47')}
                {wire('M24 80 C 28 80, 27 53, 31 53')}
                {wire('M56 46 C 59 46, 58 26, 61 26')}
                {wire('M56 54 C 59 54, 58 74, 61 74')}
                {wire('M85 24 C 86 24, 85.5 14, 86.5 14')}{wire('M85 28 C 86 28, 85.5 36, 86.5 36')}
                {wire('M85 72 C 86 72, 85.5 64, 86.5 64')}{wire('M85 76 C 86 76, 85.5 86, 86.5 86')}
              </svg>
              <Node x={3} y={12} w={21} tag="Owner" tagTone="blue"><Person name={v.owner} small /><div className="mt-1 text-[9.5px] text-ink-3">{v.ownerRole}</div></Node>
              <Node x={3} y={66} w={21}>
                <span className="absolute -left-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-crit text-white"><Warning size={10} weight="bold" /></span>
                <span className="block text-[10px] font-medium leading-snug text-ink">{v.alert}</span>
              </Node>
              <Node x={31} y={34} w={25} tag={v.center.tag} tagTone="coral" coral curKey="center">
                <div className="flex items-center gap-2"><Logo name={v.center.icon} size={18} /><span className="truncate text-[12px] font-semibold text-ink">{v.center.title}</span></div>
                <div className="mt-0.5 truncate text-[9.5px] text-coral-2">{v.center.sub}</div>
                <div className="mt-1.5"><Risk level={v.risk} /></div>
              </Node>
              {v.mids.map((m, k) => (
                <Node key={m.title} x={61} y={k ? 62 : 14} w={24} tag="Uses">
                  <div className="flex items-center gap-1.5"><Logo name={m.icon} size={14} /><span className="truncate text-[11px] font-semibold text-ink">{m.title}</span></div>
                  <div className="truncate text-[9.5px] text-ink-3">{m.sub}</div>
                  <div className="mt-1"><Risk level={m.risk} /></div>
                </Node>
              ))}
              {v.perms.map((p, k) => (
                <div key={p} className="absolute flex items-center gap-1 truncate rounded-[6px] border border-line-2 bg-white px-1.5 py-1 text-[9.5px] text-ink-2" style={{ left: '86.5%', top: `${[10, 32, 60, 82][k]}%`, width: '13%' }}>
                  <GearSix size={10} className="shrink-0 text-ink-3" /><span className="truncate">{p}</span>
                </div>
              ))}
            </div>
          ) : (
            <div key="analysis" className="fadein absolute inset-0 p-3 md:p-4">
              <div className="flex gap-3 rounded-[10px] bg-sky p-3">
                <Sparkle size={22} weight="fill" className="shrink-0 text-brand" />
                <div><div className="text-[13px] font-semibold text-ink">Summary</div><p className="mt-0.5 text-[12px] leading-snug text-ink-2">{v.summary}</p></div>
              </div>
              <div className="mt-3 text-[12px] font-medium text-ink">Supporting findings</div>
              <ul className="mt-2 space-y-2 border-t border-line pt-2">
                {v.findings.map(([k, a, b]) => (
                  <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span className="w-[92px] text-ink-2">{k}</span><Risk level="High" />
                    <span className="font-medium text-ink">{a}</span><span className="text-ink-3">{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-end">
                <span data-cur="fix" className={cx('rounded-[8px] px-4 py-1.5 text-[12px] font-medium transition-colors duration-300', step.done ? 'bg-ok text-white' : 'border border-brand text-brand')}>
                  {step.done ? 'Remediation applied' : 'Remediate'}
                </span>
              </div>
            </div>
          )}
        </div>
        {!reduce && <div className="hidden md:block"><Cursor box={box} target={step.cur} click={step.click} /></div>}
      </div>
    </Frame>
  );
}
