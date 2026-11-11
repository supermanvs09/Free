import { Link } from 'react-router';
import { Icon, cx } from '../ui.jsx';
import { AppFrame, Badge, DecisionCard } from '../ds.jsx';
import ProductMark from '../ProductMark.jsx';
import { useSteps } from '../../lib/useSteps.js';

/* Home hero: one identity of each kind, each ending in an explained decision.
   Sample data; the products and their decisions are as the product pages describe. */
export const SCENARIOS = [
  {
    key: 'person', tab: 'Employee', icon: 'User', product: 'adapid', productName: 'adapID CIRM', to: '/adapid-ai/continuous-identity-risk-management',
    who: 'Kavya Reddy', what: 'Treasury analyst · Okta, Microsoft 365', score: [18, 18, 64, 81],
    events: [
      ['09:12', 'Signed in from Mumbai on her managed laptop', 'Matches her baseline', 0],
      ['02:14', 'Sign-in from Lagos, new device, MFA passed', 'Location and device never seen', 46],
      ['02:16', 'Mail rule forwarding to an outside address', 'First rule in 3 years', 17],
    ],
    decision: { d: 'hold', label: 'Session held', reasons: [['New country and device at 02:14', '+46'], ['Forwarding rule to outside domain', '+17']], policy: 'Score ≥ 80: hold, step-up, notify SOC', id: 'DEC-7F2A91' },
  },
  {
    key: 'workload', tab: 'Cloud role', icon: 'Cloud', product: 'adapid', productName: 'adapID NHI Security', to: '/adapid-ai/nhi-security',
    who: 'ecs-notify-svc', what: 'IAM role · AWS prod-payments', score: [22, 22, 48, 63],
    events: [
      ['Day 0', 'Found in the first scan: no owner on record', 'Created by a 2023 deploy', 0],
      ['90 days', '214 permissions granted, 9 used (CloudTrail)', '205 never exercised', 26],
      ['Today', 's3:GetObject on prod-customer-exports', 'Outside its usual buckets', 15],
    ],
    decision: { d: 'review', label: 'Least privilege proposed', reasons: [['205 unused permissions', '+26'], ['Read outside usual buckets', '+15']], policy: 'Right-size with owner approval', id: 'NHI-0C41D7' },
  },
  {
    key: 'agent', tab: 'AI agent', icon: 'Robot', product: 'zenstra', productName: 'Zenstra AI', to: '/agentic-ai/agentic-identity',
    who: 'invoice-agent', what: 'Copilot Studio · owner: Finance ops', score: null,
    events: [
      ['10:02:11', 'invoices.read INV-2291', 'In task and grant', 'allow'],
      ['10:02:13', 'payments.create ₹48,000 to a known vendor', 'In task, within limit', 'allow'],
      ['10:02:15', 'vendors.export to an outside email address', 'Not part of its task', 'block'],
    ],
    decision: { d: 'block', label: 'Blocked', reasons: ['Export is outside the declared task (invoice processing)', 'Destination is outside the company domain'], policy: 'invoice-processing · task scope', id: 'ZEN-3B9E02' },
  },
  {
    key: 'payment', tab: 'Payment', icon: 'CreditCard', product: 'adapid', productName: 'adapID Fraud Prevention', to: '/adapid-ai/fraud-prevention',
    who: 'Anita S. · Savings ••4821', what: 'Mobile banking · UPI', score: [4, 4, 41, 88],
    events: [
      ['11:40', 'MPIN entered; typing and grip match her', 'Genuine customer', 0],
      ['11:43', 'New payee “KYC Update Desk”, account 9 days old', 'Mule risk at the payee', 37],
      ['11:44', '₹48,000 typed while a call is in progress', 'Coached-payment pattern', 47],
    ],
    decision: { d: 'hold', label: 'Payment held', reasons: [['Payee account opened 9 days ago', '+37'], ['Active call for 6 minutes during payment', '+47']], policy: 'Scam signals: hold and call back', id: 'FRD-91C0A4' },
  },
];

const PER = 4; // three events, then the decision

export default function HomeConsole() {
  const s = useSteps(SCENARIOS.length * PER, { ms: 1700, initial: PER - 1 });
  const sc = Math.floor(s.i / PER);
  const k = s.i % PER; // events shown
  const S = SCENARIOS[sc];
  const score = S.score ? S.score[k] : null;
  const tone = score == null ? null : score >= 80 ? 'crit' : score >= 40 ? 'hold' : 'ok';
  return (
    <div ref={s.ref} onPointerEnter={s.pause} onFocusCapture={s.pause}>
      <AppFrame title="Decision feed" crumb="All identities" status={<Badge tone="ok" dot>Live</Badge>}>
        <div role="tablist" aria-label="Identity types" className="flex gap-1 overflow-x-auto border-b border-line bg-bg-2 px-2 no-scrollbar">
          {SCENARIOS.map((x, j) => (
            <button key={x.key} type="button" role="tab" aria-selected={sc === j} aria-controls="hc-panel" onClick={() => s.go(j * PER + PER - 1)}
              className={cx('tab-u inline-flex shrink-0 items-center gap-2 !h-11 !text-[13.5px]')}>
              <Icon name={x.icon} size={16} />{x.tab}
            </button>
          ))}
        </div>
        <div id="hc-panel" role="tabpanel" aria-label={S.tab} className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bg-2 p-3">
              <span className="ptile ptile-sm" style={{ '--acc': S.product === 'zenstra' ? 'var(--color-zen)' : 'var(--color-adap)' }}><Icon name={S.icon} size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{S.who}</p>
                <p className="truncate t-caption">{S.what}</p>
              </div>
              {score != null && (
                <div className="text-right">
                  <p className="app-label">Risk</p>
                  <p className={cx('num text-[22px] font-semibold leading-none transition-colors', tone === 'crit' ? 'text-crit' : tone === 'hold' ? 'text-hold' : 'text-ok')}>{score}</p>
                </div>
              )}
            </div>
            <ol className="mt-3 space-y-2" aria-label="Events">
              {S.events.map(([t, e, why, w], j) => {
                const shown = j < k || k === PER - 1;
                const verdict = typeof w === 'string' ? w : null;
                return (
                  <li key={e} className={cx('rounded-[10px] border border-line bg-bg-2 p-3 transition-opacity duration-300', shown ? 'opacity-100' : 'opacity-35')}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[13.5px] font-medium leading-snug text-ink">{e}</p>
                      {verdict ? <Badge tone={verdict === 'block' ? 'crit' : 'ok'}>{verdict === 'block' ? 'Block' : 'Allow'}</Badge> : w > 0 ? <span className="num shrink-0 text-[13px] font-semibold text-crit">+{w}</span> : <span className="shrink-0 text-[13px] font-semibold text-ok">Normal</span>}
                    </div>
                    <p className="mt-1 flex items-center gap-2 t-caption"><span className="mono">{t}</span>· {why}</p>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="min-w-0">
            {k === PER - 1 ? (
              <div key={S.key} className="fadein">
                <DecisionCard subject={S.who} sub={`Decided by ${S.productName}`} {...S.decision} time="just now" />
                <Link to={S.to} className="alink mt-4 text-[14px]"><ProductMark p={S.product} size={18} />See how {S.productName} decides<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></Link>
              </div>
            ) : (
              <div className="card h-full p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[14.5px] font-semibold text-ink">Assessment in progress</p>
                  <span className="inline-flex items-center gap-1.5 t-caption"><span className="pulse-dot h-1.5 w-1.5 rounded-full bg-brand" />Scoring</span>
                </div>
                {score != null ? (
                  <>
                    <div className="mt-4 flex items-end justify-between"><span className="app-label">Identity risk</span><span className="num text-[13px] font-semibold text-ink">{score} / 100</span></div>
                    <div className="meter mt-2"><i style={{ width: `${score}%`, background: tone === 'crit' ? 'var(--color-crit)' : tone === 'hold' ? 'var(--color-hold)' : 'var(--color-ok)' }} /></div>
                    <div className="mt-1.5 flex justify-between t-caption"><span>Allow</span><span>Step-up 40</span><span>Hold 80</span></div>
                  </>
                ) : <p className="mt-4 app-label">Policy checks · invoice-processing</p>}
                <ul className="mt-4 space-y-2 border-t border-line pt-3">
                  {S.events.slice(0, k).map(([, e, why, w]) => (
                    <li key={e} className="slide-in flex items-start justify-between gap-3 text-[13px] leading-snug text-ink-2">
                      <span>{why}</span>
                      {typeof w === 'string' ? <span className={cx('shrink-0 font-semibold', w === 'block' ? 'text-crit' : 'text-ok')}>{w === 'block' ? 'Fail' : 'Pass'}</span> : <span className={cx('num shrink-0 font-semibold', w > 0 ? 'text-crit' : 'text-ok')}>{w > 0 ? `+${w}` : '0'}</span>}
                    </li>
                  ))}
                  {k === 0 && <li className="t-caption">Waiting for the first event…</li>}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line bg-bg-2 px-4 py-2.5">
          <p className="t-caption">Sample data</p>
          <button type="button" onClick={s.playing ? s.pause : s.play} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:text-brand">
            <Icon name={s.playing ? 'Pause' : 'Play'} size={13} weight="fill" />{s.playing ? 'Pause' : 'Play all'}
          </button>
        </div>
      </AppFrame>
      <p className="sr-only" aria-live="polite">{`${S.tab}: ${k === PER - 1 ? `${S.decision.label}. ${S.decision.reasons.map((r) => (Array.isArray(r) ? r[0] : r)).join('. ')}` : `event ${k + 1} of 3`}`}</p>
    </div>
  );
}
