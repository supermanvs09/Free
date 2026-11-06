import { useState } from 'react';
import { Link } from 'react-router';
import { Icon, cx } from '../ui.jsx';
import { AppFrame, Badge, Decision } from '../ds.jsx';

/* adapID overview: one inventory across every kind of identity, each scored
   by the product that covers it. Sample data. */
const ROWS = [
  { id: 'kavya', name: 'Kavya Reddy', type: 'Person', icon: 'User', src: 'Okta · Microsoft 365', score: 81, trend: '+63 today', d: 'hold', product: 'CIRM', to: '/adapid-ai/continuous-identity-risk-management',
    reasons: ['Sign-in from Lagos at 02:14 on a new device (+46)', 'Mail rule forwarding to an outside address (+17)'], action: 'Session held; step-up through Okta failed; SOC notified.' },
  { id: 'ecs', name: 'ecs-notify-svc', type: 'IAM role', icon: 'Cloud', src: 'AWS · prod-payments', score: 63, trend: '+15 this week', d: 'review', product: 'NHI Security', to: '/adapid-ai/nhi-security',
    reasons: ['214 permissions granted, 9 used in 90 days (+26)', 'Read from prod-customer-exports, outside its usual buckets (+15)'], action: 'Least-privilege policy proposed to the owner for approval.' },
  { id: 'svc-backup', name: 'svc-backup', type: 'Service account', icon: 'Key', src: 'Active Directory', score: 72, trend: 'stable', d: 'review', product: 'AD Security', to: '/adapid-ai/active-directory-security',
    reasons: ['Kerberoastable: SPN set with a weak, 6-year-old password (+30)', 'Member of a group with a path to Domain Admins (+28)'], action: 'Rotate to a managed account; remove the path to Tier 0.' },
  { id: 'anita', name: 'Anita S. · ••4821', type: 'Customer', icon: 'CreditCard', src: 'Mobile banking SDK', score: 88, trend: '+84 in 4 min', d: 'hold', product: 'Fraud Prevention', to: '/adapid-ai/fraud-prevention',
    reasons: ['New payee account opened 9 days ago (+37)', 'Active phone call during the payment (+47)'], action: 'Payment held; customer called back before release.' },
  { id: 'akia', name: 'AKIA…7Q2N (access key)', type: 'Access key', icon: 'Key', src: 'AWS · GitHub', score: 92, trend: 'new', d: 'critical', product: 'NHI Security', to: '/adapid-ai/nhi-security',
    reasons: ['Committed to a public repository 3 hours ago (+55)', 'First use from a new region (+30)'], action: 'Key disabled; owner and repository maintainer notified.' },
  { id: 'rahul', name: 'Rahul Menon', type: 'Person', icon: 'User', src: 'Entra ID · Salesforce', score: 12, trend: 'stable', d: 'allow', product: 'CIRM', to: '/adapid-ai/continuous-identity-risk-management',
    reasons: ['Activity matches his baseline: hours, devices, apps'], action: 'No action. Work continues.' },
];
const tone = (v) => (v >= 80 ? 'text-crit' : v >= 60 ? 'text-hold' : v >= 40 ? 'text-warn' : 'text-ok');

export default function IdentityInventory() {
  const [sel, setSel] = useState('kavya');
  const [type, setType] = useState('All');
  const types = ['All', 'Person', 'IAM role', 'Service account', 'Access key', 'Customer'];
  const rows = ROWS.filter((r) => type === 'All' || r.type === type);
  const r = ROWS.find((x) => x.id === sel);
  return (
    <AppFrame product="adapid" title="adapID AI" crumb="Identity inventory" status={<Badge tone="brand">6 of 48,210 identities</Badge>}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2.5">
        <div className="seg" role="group" aria-label="Filter by identity type">
          {types.map((t) => <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className="seg-btn !h-7 !text-[12.5px]">{t}</button>)}
        </div>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto bg-white lg:border-r lg:border-line">
          <table className="dt min-w-[520px]">
            <caption className="sr-only">Identities and their risk. Select a row to see the reasons.</caption>
            <thead><tr><th>Identity</th><th>Type</th><th className="!text-right">Risk</th><th>Decision</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} data-click className={cx(sel === x.id && 'is-sel')} onClick={() => setSel(x.id)}>
                  <td>
                    <button type="button" onClick={() => setSel(x.id)} aria-pressed={sel === x.id} className="flex items-center gap-2.5 text-left">
                      <Icon name={x.icon} size={16} className="shrink-0 text-ink-3" />
                      <span><span className="block font-semibold text-ink">{x.name}</span><span className="block t-caption">{x.src}</span></span>
                    </button>
                  </td>
                  <td className="whitespace-nowrap">{x.type}</td>
                  <td className="!text-right"><span className={cx('num text-[15px] font-semibold', tone(x.score))}>{x.score}</span></td>
                  <td><Decision d={x.d} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div key={r.id} className="fadein p-4 md:p-5" aria-live="polite">
          <p className="app-label">Selected identity</p>
          <p className="mt-2 text-[16px] font-semibold text-ink">{r.name}</p>
          <p className="t-caption">{r.type} · {r.src}</p>
          <div className="mt-4 flex items-end gap-3">
            <span className={cx('num text-[40px] font-semibold leading-none', tone(r.score))}>{r.score}</span>
            <span className="pb-1 t-caption">risk · {r.trend}</span>
          </div>
          <div className="meter mt-3"><i style={{ width: `${r.score}%`, background: r.score >= 80 ? 'var(--color-crit)' : r.score >= 60 ? 'var(--color-hold)' : r.score >= 40 ? 'var(--color-warn)' : 'var(--color-ok)' }} /></div>
          <p className="mt-5 app-label">Why</p>
          <ul className="mt-2 space-y-1.5">{r.reasons.map((x) => <li key={x} className="flex gap-2 text-[13.5px] leading-snug text-ink-2"><Icon name="CaretRight" size={12} weight="bold" className="mt-1 shrink-0 text-ink-4" />{x}</li>)}</ul>
          <p className="mt-5 app-label">Response</p>
          <p className="mt-2 text-[13.5px] leading-snug text-ink-2">{r.action}</p>
          <Link to={r.to} className="alink mt-5 text-[13.5px]">Scored by {r.product}<Icon name="ArrowRight" size={13} weight="bold" className="arr" /></Link>
        </div>
      </div>
    </AppFrame>
  );
}
