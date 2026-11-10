import { useState } from 'react';
import { Icon, cx } from '../ui.jsx';
import { Badge, DecisionCard, DemoControls, Stepper } from '../ds.jsx';
import { useSteps } from '../../lib/useSteps.js';

/* Identity Fraud Prevention: a payment journey in a mobile banking app, with the
   signals adapID reads at each step. Two scenarios; sample data throughout. */
const STEPS = ['Sign in', 'Add payee', 'Enter amount', 'Review', 'Outcome'];

const SC = {
  genuine: {
    label: 'Genuine customer', payee: 'Mehta Interiors', acct: '•••• 6620 · HDFC0001234', amount: '22,000', note: 'Kitchen work, 2nd instalment',
    risk: [4, 5, 6, 9, 9],
    sig: [
      ['Typing rhythm', ['Matches her baseline (94%)', 'Matches', 'Matches', 'Matches', 'Matches'], 'ok'],
      ['Device and SIM', ['Registered phone · SIM unchanged'], 'ok'],
      ['Phone call', ['No call in progress'], 'ok'],
      ['Payee', [null, 'Account 6 years old · no mule reports', '', '', ''], 'ok'],
      ['Amount', [null, null, 'Within her usual range', '', ''], 'ok'],
    ],
    decision: { d: 'approved', label: 'Approved', reasons: ['Typing, grip and device match Anita', 'Established payee with no mule signals', 'Amount within her usual range'], policy: 'No extra step for the genuine customer', id: 'FRD-2E81C7' },
  },
  scam: {
    label: 'Scam call in progress', payee: 'KYC Update Desk', acct: '•••• 4410 · YESB0000771', amount: '48,000', note: 'KYC verification fee',
    risk: [4, 41, 71, 88, 88],
    sig: [
      ['Typing rhythm', ['Matches her baseline (93%)', 'Long pauses between fields', 'Hesitant, copying digits', 'Hesitant', 'Hesitant'], ['ok', 'warn', 'warn', 'warn', 'warn']],
      ['Device and SIM', ['Registered phone · SIM unchanged'], 'ok'],
      ['Phone call', ['No call in progress', 'Active call · unknown number · 4 min', 'Active call · 5 min', 'Active call · 6 min', 'Active call · 6 min'], ['ok', 'crit', 'crit', 'crit', 'crit']],
      ['Payee', [null, 'Account opened 9 days ago · 13 senders today', '', '', ''], 'crit'],
      ['Amount', [null, null, '3.2× her largest payment', '', ''], 'hold'],
    ],
    decision: { d: 'hold', label: 'Payment held', reasons: [['Active call during payment: coached-payment pattern', '+47'], ['Payee account 9 days old, 13 senders today', '+37'], ['Amount 3.2× her largest payment', '+12']], policy: 'Scam signals: hold, call the customer back', id: 'FRD-91C0A4' },
  },
};

function Phone({ children, call }) {
  return (
    <div className="mx-auto w-[288px] shrink-0 rounded-[44px] bg-[#0f1726] p-[10px] shadow-[var(--e-3)]" role="img" aria-label="Mobile banking app">
      <div className="relative h-[560px] overflow-hidden rounded-[35px] bg-white">
        <div className="flex h-9 items-center justify-between px-6 pt-1 text-[12px] font-semibold text-ink">
          <span className="num">11:4{call ? '4' : '0'}</span>
          <span className="absolute left-1/2 top-2 h-5 w-[86px] -translate-x-1/2 rounded-full bg-[#0f1726]" />
          <span className="flex items-center gap-1"><Icon name="Broadcast" size={12} /><span className="inline-block h-2.5 w-5 rounded-[3px] border border-ink"><span className="block h-full w-3/4 bg-ink" /></span></span>
        </div>
        {call && <div className="mx-3 flex items-center gap-2 rounded-full bg-ok px-3 py-1 text-[12px] font-semibold text-white"><Icon name="Phone" size={12} weight="fill" />On a call · +91 70•• ••91 · {call}</div>}
        {children}
      </div>
    </div>
  );
}
const Field = ({ l, v, mono }) => <div className="rounded-[10px] border border-line px-3 py-2"><p className="text-[12px] font-medium text-ink-3">{l}</p><p className={cx('text-[13.5px] font-semibold text-ink', mono && 'num')}>{v}</p></div>;

function Screen({ i, x, scam }) {
  if (i === 0) return (
    <div className="flex h-[500px] flex-col items-center px-6 pt-8 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-brand text-white"><Icon name="Bank" size={24} weight="fill" /></span>
      <p className="mt-4 text-[17px] font-semibold text-ink">Good morning, Anita</p>
      <p className="mt-1 text-[12.5px] text-ink-3">Enter your 4-digit MPIN</p>
      <div className="mt-5 flex gap-3">{[0, 1, 2, 3].map((d) => <span key={d} className="h-3 w-3 rounded-full bg-brand" />)}</div>
      <div className="mt-8 grid w-full grid-cols-3 gap-2">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, j) => <span key={j} className={cx('flex h-11 items-center justify-center rounded-[12px] text-[17px] font-semibold text-ink', k && 'bg-bg-1')}>{k}</span>)}</div>
    </div>
  );
  if (i === 1) return (
    <div className="px-5 pt-5">
      <p className="text-[16px] font-semibold text-ink">Add a payee</p>
      <div className="mt-4 space-y-2.5"><Field l="Payee name" v={x.payee} /><Field l="Account number · IFSC" v={x.acct} mono /><Field l="Nickname" v={scam ? 'KYC' : 'Mehta'} /></div>
      <p className="mt-3 rounded-[10px] bg-bg-1 p-2.5 text-[12px] leading-snug text-ink-3">Name at bank: <span className="font-semibold text-ink">{scam ? 'R K TRADERS' : 'MEHTA INTERIORS LLP'}</span></p>
      <span className="btn btn-primary mt-5 w-full !h-11">Save payee</span>
    </div>
  );
  if (i === 2) return (
    <div className="px-5 pt-5">
      <p className="text-[12.5px] text-ink-3">Paying</p>
      <p className="text-[16px] font-semibold text-ink">{x.payee}</p>
      <p className="num mt-6 text-center text-[38px] font-semibold tracking-[-0.02em] text-ink">₹{x.amount}</p>
      <p className="mt-1 text-center text-[12px] text-ink-3">From Savings •••• 4821 · Balance ₹1,84,230</p>
      <div className="mt-6"><Field l="Note" v={x.note} /></div>
      <span className="btn btn-primary mt-5 w-full !h-11">Continue</span>
    </div>
  );
  if (i === 3) return (
    <div className="px-5 pt-5">
      <p className="text-[16px] font-semibold text-ink">Review payment</p>
      <div className="mt-4 divide-y divide-line rounded-[12px] border border-line text-[13px]">
        {[['To', x.payee], ['Account', x.acct.split(' · ')[0]], ['Amount', `₹${x.amount}`], ['From', 'Savings •••• 4821'], ['Mode', 'IMPS']].map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-3 py-2.5"><span className="text-ink-3">{k}</span><span className="text-right font-semibold text-ink">{v}</span></div>)}
      </div>
      <span className="btn btn-primary mt-6 w-full !h-11">Pay ₹{x.amount}</span>
    </div>
  );
  return scam ? (
    <div className="flex h-[500px] flex-col items-center px-6 pt-10 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-hold-50 text-hold"><Icon name="Hourglass" size={28} /></span>
      <p className="mt-4 text-[17px] font-semibold text-ink">Payment on hold</p>
      <p className="mt-2 text-[13px] leading-snug text-ink-2">We noticed you are on a call while paying a new payee. Your bank will call you on your registered number within 10 minutes.</p>
      <p className="mt-4 rounded-[10px] bg-crit-50 p-3 text-[12.5px] font-medium leading-snug text-crit">Your bank will never ask you to pay a KYC fee. Do not share OTPs with anyone on a call.</p>
      <span className="btn btn-secondary mt-5 w-full !h-11">Cancel payment</span>
    </div>
  ) : (
    <div className="flex h-[500px] flex-col items-center px-6 pt-10 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ok-50 text-ok"><Icon name="CheckCircle" size={32} weight="fill" /></span>
      <p className="mt-4 text-[17px] font-semibold text-ink">₹{x.amount} sent</p>
      <p className="mt-1 text-[13px] text-ink-2">to {x.payee}</p>
      <p className="mono mt-4 text-ink-3">Ref 6120 4418 2290</p>
      <span className="btn btn-secondary mt-8 w-full !h-11">Done</span>
    </div>
  );
}

export default function FraudJourney() {
  const [key, setKey] = useState('scam');
  const s = useSteps(STEPS.length, { ms: 2800 });
  const x = SC[key];
  const scam = key === 'scam';
  const risk = x.risk[s.i];
  const tone = risk >= 80 ? 'crit' : risk >= 40 ? 'hold' : 'ok';
  const call = scam && s.i >= 1 ? `${Math.min(6, 3 + s.i)} min` : null;
  return (
    <div ref={s.ref} onPointerDown={s.pause}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="seg" role="group" aria-label="Scenario">
          {Object.entries(SC).map(([k, v]) => <button key={k} type="button" aria-pressed={key === k} onClick={() => { setKey(k); s.go(0); }} className="seg-btn">{v.label}</button>)}
        </div>
        <DemoControls s={s} n={STEPS.length} label={`${STEPS[s.i]} · step ${s.i + 1} of ${STEPS.length}`} />
      </div>
      <Stepper steps={STEPS} s={s} label="Payment journey" className="mt-6" />
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-12">
        <Phone call={call}><div key={`${key}-${s.i}`} className="fadein"><Screen i={s.i} x={x} scam={scam} /></div></Phone>
        <div className="min-w-0">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[14.5px] font-semibold text-ink">Signals adapID reads</p>
              <span className="t-caption">Session · Anita S. · Savings ••4821</span>
            </div>
            <ul className="divide-y divide-line">
              {x.sig.map(([name, vals, tones]) => {
                const v = vals[Math.min(s.i, vals.length - 1)] || vals.slice(0, s.i + 1).filter(Boolean).pop();
                const t = Array.isArray(tones) ? tones[s.i] : tones;
                return (
                  <li key={name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="w-full shrink-0 text-[13.5px] text-ink-3 sm:w-[120px]">{name}</span>
                    <span className={cx('flex-1 text-[13.5px] font-medium', v ? 'text-ink' : 'text-ink-4')}>{v || 'Not yet'}</span>
                    {v && <Badge tone={t} dot>{t === 'ok' ? 'Normal' : t === 'warn' ? 'Unusual' : t === 'hold' ? 'High' : 'Risk'}</Badge>}
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line bg-bg-1 px-4 py-3">
              <div className="flex items-center justify-between"><span className="app-label">Session risk</span><span className={cx('num text-[18px] font-semibold', `text-${tone}`)}>{risk}</span></div>
              <div className="meter mt-2"><i style={{ width: `${risk}%`, background: `var(--color-${tone})` }} /></div>
              <div className="mt-1 flex justify-between t-caption"><span>Allow</span><span>Step-up 40</span><span>Hold 80</span></div>
            </div>
          </div>
          <div className="mt-4" aria-live="polite">
            {s.i >= 3 ? (
              <div key={key} className="fadein"><DecisionCard subject={`₹${x.amount} to ${x.payee}`} sub="Decided in 64 ms, before the money moved" {...x.decision} time="11:44:12" /></div>
            ) : <p className="rounded-[12px] border border-dashed border-line-2 p-4 t-small">The assessment is made at the review screen, before the customer taps Pay.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
