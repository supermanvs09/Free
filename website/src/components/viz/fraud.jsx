import { Viz, Win, Chip, Gl, cx } from './kit.jsx';
import ProductMark from '../ProductMark.jsx';
import { RhythmLines } from './journey.jsx';
import { useRef } from 'react';
import { useOnView } from '../../lib/nullmotion.jsx';

/* Identity Fraud Prevention, for mobile and internet banking. The phone runs the
   bank's own app (light, as banking apps are); next to it is what the bank sees.
   Every name, amount and score is sample data. */

const ADAP = '#3cc8f6';

/* ---------- the phone and its screens ---------- */
export function Phone({ children, call, time = '9:41', className, style }) {
  return (
    <div className={cx('mb-phone', className)} style={style}>
      <div className="mb-screen">
        <span className="mb-island" aria-hidden="true" />
        <div className="mb-status">
          {call ? <span className="mb-call"><Gl g="phone" style={{ width: '1em', height: '1em' }} />{call}</span> : <span>{time}</span>}
          <span className="mb-sys"><svg viewBox="0 0 18 12" style={{ width: '1.2em' }} aria-hidden="true"><path d="M1 11h2V8H1zM5 11h2V6H5zM9 11h2V3H9zM13 11h2V1h-2z" fill="currentColor" /></svg><i /></span>
        </div>
        <div className="mb-app relative">{children}</div>
      </div>
    </div>
  );
}

const Bank = ({ right }) => (
  <div className="mb-top"><span className="mb-logo">YB</span><span>Your Bank</span>{right && <span className="ml-auto">{right}</span>}</div>
);

function LoginScreen({ filled = 0, hot }) {
  return (
    <>
      <Bank />
      <div className="mt-[1.6em] text-center">
        <span className="mx-auto grid h-[3.4em] w-[3.4em] place-items-center rounded-full text-[1.1em] font-bold" style={{ background: '#e0e7ff', color: '#1e40af' }}>AD</span>
        <p className="mb-h mt-[.6em]">Good evening, Anita</p>
        <p className="mb-sub mt-[.2em]">Enter your 4-digit MPIN</p>
        <div className="mt-[1em] flex justify-center gap-[.7em]">{[0, 1, 2, 3].map((i) => <span key={i} className={cx('mb-dot', i < filled && 'on')} />)}</div>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-[.45em]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((n, i) => n ? <span key={i} className={cx('mb-key', hot === n && 'on')}>{n}</span> : <span key={i} />)}
      </div>
    </>
  );
}

function PayScreen({ stage, pressed }) {
  // stage 0: payee chosen, 1: account pasted, 2: amount and remark, 3: ready
  return (
    <>
      <Bank right={<span className="mb-sub">Send money</span>} />
      <p className="mb-h mt-[1em]">Pay a new payee</p>
      <div className="mb-card mt-[.8em] flex items-center gap-[.7em]">
        <span className="grid h-[2.4em] w-[2.4em] shrink-0 place-items-center rounded-full text-[max(var(--vz-min),.85em)] font-bold" style={{ background: '#fde7d9', color: '#b4531f' }}>KU</span>
        <span className="min-w-0"><span className="block mb-val truncate">KYC Update Desk</span><span className="block mb-sub">Added 2 minutes ago</span></span>
      </div>
      <div className="mt-[.6em] space-y-[.5em]">
        <div className="mb-field"><span className="block mb-label">Account number</span><span className="block mb-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 'max(var(--vz-min), .85em)' }}>{stage >= 1 ? '5021 0044 7310 4410' : ' '}</span></div>
        <div className="mb-field"><span className="block mb-label">Amount</span><span className="block mb-val text-[1.15em]">{stage >= 2 ? '₹2,40,000' : '₹'}</span></div>
        <div className="mb-field"><span className="block mb-label">Remark</span><span className="block mb-val">{stage >= 2 ? 'KYC update' : ' '}</span></div>
      </div>
      {stage === 1 && <span className="mb-toast">Pasted from clipboard</span>}
      <div className={cx('mb-btn mt-auto', pressed && 'pressed')} style={{ opacity: stage >= 2 ? 1 : 0.45 }}>Pay ₹2,40,000</div>
    </>
  );
}

function HoldScreen() {
  return (
    <>
      <Bank />
      <div className="mt-[1.4em] text-center">
        <span className="mx-auto grid h-[3.4em] w-[3.4em] place-items-center rounded-full" style={{ background: '#fff4e0', color: '#b45309' }}><Gl g="shield" style={{ width: '1.8em', height: '1.8em' }} /></span>
        <p className="mb-h mt-[.7em]">We’ve paused this payment</p>
        <p className="mb-sub mt-[.5em]">Your bank will never ask you to send money to update your KYC.</p>
        <p className="mt-[.8em] text-[max(var(--vz-min),.9em)] font-semibold" style={{ color: '#0b0d12' }}>Is someone on a call asking you to pay?</p>
      </div>
      <div className="mt-auto space-y-[.5em]">
        <div className="mb-btn">Yes, someone asked me</div>
        <div className="mb-btn ghost">No, call me back</div>
        <p className="text-center mb-sub" style={{ fontSize: 'max(var(--vz-min), .72em)' }}>We’ll call your registered number in 2 minutes.</p>
      </div>
    </>
  );
}

function TotpScreen() {
  return (
    <>
      <Bank />
      <div className="my-auto text-center">
        <span className="mx-auto grid h-[3.6em] w-[3.6em] place-items-center rounded-full" style={{ background: '#dcfce7', color: '#15803d' }}><Gl g="check" style={{ width: '1.8em', height: '1.8em' }} /></span>
        <p className="mb-h mt-[.7em]">This phone is verified</p>
        <p className="mb-sub mt-[.4em]">Signed in securely. No SMS code needed.</p>
      </div>
      <div className="mb-card flex items-center gap-[.6em]"><Gl g="phone" style={{ width: '1.3em', height: '1.3em', color: '#1e40af' }} /><span className="mb-sub">Registered to your account since 12 Mar</span></div>
    </>
  );
}

function FaceScreen() {
  return (
    <>
      <Bank />
      <p className="mb-h mt-[1em] text-center">Confirm it’s you</p>
      <p className="mb-sub mt-[.3em] text-center">A large payment to a new payee</p>
      <div className="relative mx-auto mt-[1.2em] w-[70%] overflow-hidden" style={{ aspectRatio: '3 / 3.8', borderRadius: '50%', border: '3px solid #3b82f6', background: 'radial-gradient(circle at 50% 40%, #d7dce4, #b6bdc8)' }}>
        <svg viewBox="0 0 100 120" className="absolute inset-0 h-full w-full" aria-hidden="true"><circle cx="50" cy="48" r="20" fill="#9aa3b0" /><path d="M14 120c4-26 18-38 36-38s32 12 36 38" fill="#9aa3b0" /></svg>
        <span className="mb-scan" />
      </div>
      <p className="mt-auto text-center mb-sub">Hold your phone at eye level</p>
    </>
  );
}

function RaspScreen() {
  return (
    <>
      <Bank />
      <div className="my-auto text-center">
        <span className="mx-auto grid h-[3.4em] w-[3.4em] place-items-center rounded-full" style={{ background: '#fee2e2', color: '#b91c1c' }}><Gl g="eye" style={{ width: '1.7em', height: '1.7em' }} /></span>
        <p className="mb-h mt-[.7em]">Your screen is being shared</p>
        <p className="mb-sub mt-[.4em]">Another app can see and control this screen. Banking is paused until it is closed.</p>
      </div>
      <div className="space-y-[.5em]"><div className="mb-btn">Close screen sharing</div><div className="mb-btn ghost">Why am I seeing this?</div></div>
    </>
  );
}

/* ---------- what the bank sees ---------- */
const BANDS = [['Low', 0, 29, '#3fd98f', 'Allow'], ['Medium', 30, 54, '#f6b955', 'Review'], ['High', 55, 74, '#ff9a5c', 'Check before paying'], ['Critical', 75, 100, '#ff6b5d', 'Hold and call the customer']];
const band = (v) => BANDS.find(([, a, b]) => v >= a && v <= b);

function ScoreBar({ v }) {
  const [name, , , , act] = band(v);
  const col = { Low: 'var(--vz-green)', Medium: 'var(--vz-amber)', High: 'var(--vz-coral)', Critical: 'var(--vz-red)' }[name]; // text tones that hold contrast on light and dark
  return (
    <div>
      <div className="flex items-end justify-between">
        <span><span className="block vz-m">Scam risk</span><span className="block text-[1.9em] font-semibold leading-none tracking-[-0.03em]" style={{ color: col, transition: 'color .4s' }}>{name}</span></span>
        <span className="text-right"><span className="block vz-m">What happens</span><span className="mt-[.3em] block vz-t" style={{ fontSize: 'max(var(--vz-min), .92em)' }}>{act}</span></span>
      </div>
      <div className="relative mt-[.7em] flex h-[.55em] gap-[2px] overflow-hidden rounded-full">
        {BANDS.map(([n, a, b, c]) => <i key={n} style={{ flex: b - a + 1, background: c, opacity: v >= a ? 0.9 : 0.18, transition: 'opacity .5s' }} />)}
      </div>
      <div className="relative h-[.9em]"><span className="absolute top-[.15em] h-0 w-0 -translate-x-1/2" style={{ left: `${v}%`, borderLeft: '.35em solid transparent', borderRight: '.35em solid transparent', borderBottom: '.45em solid #fff', transition: 'left 1s cubic-bezier(.16,1,.3,1)' }} /></div>
    </div>
  );
}

const Q = [['1', 'Is it Anita?'], ['2', 'Acting freely?'], ['3', 'Normal payment?']];
function Questions({ state }) {
  // state: per question, null (watching) | 'ok' | 'crit'
  return (
    <div className="grid grid-cols-3 gap-[.4em]">
      {Q.map(([n, q], i) => {
        const s = state[i];
        const col = s === 'ok' ? 'var(--vz-green)' : s === 'crit' ? 'var(--vz-red)' : undefined;
        return (
          <span key={n} className="rounded-[.6em] px-[.55em] py-[.45em]" style={{ background: s ? `${s === 'ok' ? 'rgb(63 217 143 / .1)' : 'rgb(255 107 93 / .12)'}` : 'rgb(255 255 255 / .04)', border: `1px solid ${s === 'ok' ? 'rgb(63 217 143 / .3)' : s === 'crit' ? 'rgb(255 107 93 / .4)' : 'rgb(255 255 255 / .08)'}`, transition: 'all .5s' }}>
            <span className="flex items-center gap-[.3em] text-[max(var(--vz-min),.72em)] font-semibold" style={{ color: col }}>{s === 'ok' ? '✓' : s === 'crit' ? '!' : n}<span className="vz-m">{q}</span></span>
          </span>
        );
      })}
    </div>
  );
}

/* the evidence that adds up, step by step (sample session) */
const EVIDENCE = [
  [2, 'She is on a phone call while paying', 'Seen on her phone', 9, 'phone'],
  [3, 'The account number was pasted, not typed', 'Seen on her phone', 8, 'copy'],
  [3, 'A new payee, added 2 minutes ago', 'Her account history', 7, 'user'],
  [4, '9 times more than she usually sends', 'Her account history', 14, 'chart'],
  [4, 'The remark says “KYC update”', 'A common scam script', 10, 'warn'],
  [5, 'The payee is on a mule account list', 'Shared fraud intelligence', 18, 'shield'],
];
const BASE = 12;

/* Hero: a scam caught mid-payment. The customer is real and logged in normally;
   she is being coached on a call. Evidence adds points until the score is
   Critical, and the app holds the payment with a calm question. */
export function ScamCatch({ k: fk, time = '9:41' } = {}) {
  return (
    <Viz k={fk} steps={[900, 1200, 1100, 1100, 1300, 1300]} hold={5200} label="Illustration: Anita logs in to her bank app normally, so she is the real customer. While on a phone call she pastes an account number for a new payee and enters 2,40,000 rupees with the remark KYC update. The bank sees each reason in plain words; when the payee turns out to be on a mule account list the risk is Critical, the app pauses the payment and asks whether someone is asking her to pay, and an analyst calls her.">
      {(k) => {
        const v = BASE + EVIDENCE.filter(([s]) => k >= s).reduce((a, [, , , p]) => a + p, 0);
        const qs = [k >= 1 ? 'ok' : null, k >= 3 ? 'crit' : null, k >= 5 ? 'crit' : null];
        const call = k >= 2 ? `04:${10 + k * 7}` : null; // she has been on the call for four minutes
        return (
          <div className="mb-grid mb-fit">
            <div className="mb-phone-wrap">
              <Phone call={call} time={time}>
                {k <= 1 ? <LoginScreen filled={k >= 1 ? 4 : 2} hot={k >= 1 ? null : '7'} />
                  : k <= 5 ? <PayScreen stage={k - 2} pressed={k === 5} />
                    : <HoldScreen />}
              </Phone>
            </div>
            <Win title={<span className="inline-flex items-center gap-[.5em]"><ProductMark p="adapid" size="1.3em" />Why this payment was paused</span>} right={<span className="vz-mono">Anita Desai · Android</span>} glow="rgb(0 174 239 / .35)">
              <Questions state={qs} />
              <div className="mt-[1em]"><ScoreBar v={k >= 1 ? v : 0} /></div>
              <div className="mt-[.4em] space-y-[.4em]">
                <div className={cx('flex items-center gap-[.6em] rounded-[.6em] px-[.7em] py-[.5em] s1')} style={{ background: 'rgb(63 217 143 / .07)' }}>
                  <Gl g="check" style={{ width: '1.1em', height: '1.1em', color: '#4be29a' }} />
                  <span className="min-w-0 flex-1 truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .9em)' }}>It is Anita: her phone, her typing, her usual login</span>
                </div>
                {EVIDENCE.map(([s, what, src, pts]) => (
                  <div key={what} className={cx('flex items-center gap-[.6em] rounded-[.6em] px-[.7em] py-[.45em]', `s${s}`)} style={{ background: 'rgb(255 255 255 / .035)' }}>
                    <span aria-hidden="true" className="h-[.55em] w-[.55em] shrink-0 rounded-full" style={{ background: pts >= 14 ? '#ff8b7e' : '#ffc566' }} />
                    <span className="min-w-0 flex-1"><span className="block truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .9em)' }}>{what}</span><span className="block vz-m" style={{ fontSize: 'max(var(--vz-min), .78em)' }}>{src}</span></span>
                  </div>
                ))}
              </div>
              <div className="s6 mt-[.7em] flex items-center gap-[.6em] rounded-[.7em] px-[.8em] py-[.6em]" style={{ background: 'rgb(255 107 93 / .1)', border: '1px solid rgb(255 107 93 / .35)' }}>
                <Chip tone="crit">Held</Chip><span className="min-w-0 flex-1 truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .9em)' }}>₹2,40,000 kept safe · Anita warned · an analyst is calling her</span>
              </div>
            </Win>
          </div>
        );
      }}
    </Viz>
  );
}

/* ---------- one phone, five capabilities ---------- */
const Note = ({ children, tone = 'info', style }) => (
  <div className="vz-pop" style={{ padding: '.8em 1em', '--glow': tone === 'crit' ? 'rgb(255 107 93 / .4)' : tone === 'ok' ? 'rgb(63 217 143 / .35)' : 'rgb(0 174 239 / .35)', ...style }}>{children}</div>
);

function Rhythm() {
  // her last 12 sessions and this one, key to key, in milliseconds
  return <RhythmLines labels={['1', '2', '3', '4', '5', '6', '7']} usual={[118, 96, 142, 104, 131, 99, 120]} now={[121, 92, 139, 108, 126, 101, 117]} seed={7} />;
}

const CAPS = {
  biometrics: {
    screen: <LoginScreen filled={3} hot="5" />,
    notes: [
      <Note key="a"><span className="block vz-h">How Anita types</span><div className="mt-[.6em]"><Rhythm /></div><span className="mt-[.3em] block vz-m">Faint: her last 12 sessions · blue: this one</span></Note>,
      <Note key="b" tone="ok"><span className="flex items-center justify-between gap-[1em]"><span className="vz-t">It is Anita</span><Chip tone="ok">Matches</Chip></span><span className="mt-[.3em] block vz-m">Timing, pressure and angle. Never the digits.</span></Note>,
    ],
  },
  totp: {
    screen: <TotpScreen />,
    notes: [
      <Note key="a" tone="ok"><span className="block vz-t">Code made on this phone</span><span className="mt-[.2em] block vz-m">Verified over an encrypted channel</span></Note>,
      <Note key="b"><span className="flex items-center justify-between gap-[1em]"><span className="vz-t">SMS sent</span><span className="text-[1.6em] font-semibold num">0</span></span><span className="block vz-m">Nothing to intercept, forward or swap</span></Note>,
    ],
  },
  face: {
    screen: <FaceScreen />,
    notes: [
      <Note key="a" tone="crit"><span className="block vz-h">Why now</span><span className="mt-[.3em] block vz-t">New device + ₹2,40,000 to a new payee</span></Note>,
      <Note key="b"><span className="block vz-t">Attempt logged</span><span className="block vz-mono">case-ready · 21:42:07</span></Note>,
    ],
  },
  rasp: {
    screen: <RaspScreen />,
    notes: [
      <Note key="a" tone="crit">
        <span className="block vz-h">Device checks, live</span>
        <div className="mt-[.5em] space-y-[.35em]">
          {[['Remote control', 'Detected', 'crit'], ['Malware', 'Clear', 'ok'], ['Tampering', 'Clear', 'ok'], ['Fake device', 'Clear', 'ok']].map(([n, s, t]) => (
            <div key={n} className="flex items-center justify-between gap-[1em]"><span className="vz-t" style={{ fontSize: 'max(var(--vz-min), .9em)' }}>{n}</span><Chip tone={t}>{s}</Chip></div>
          ))}
        </div>
      </Note>,
      <Note key="b"><span className="block vz-t">Bank policy: block</span><span className="block vz-m">Log, warn or block, set by the bank</span></Note>,
    ],
  },
  scam: {
    screen: <HoldScreen />,
    notes: [
      <Note key="a" tone="crit">
        <span className="block vz-h">Scam risk: Critical</span>
        <div className="mt-[.5em] space-y-[.3em]">
          {BANDS.map(([n, a, b, c, act]) => (
            <div key={n} className="flex items-center gap-[.6em]" style={{ opacity: n === 'Critical' ? 1 : 0.55 }}>
              <i className="h-[.6em] w-[.6em] rounded-full" style={{ background: c }} /><span className="w-[4.6em] vz-t" style={{ fontSize: 'max(var(--vz-min), .85em)' }}>{n}</span><span className="vz-m">{act}</span>
            </div>
          ))}
        </div>
      </Note>,
      <Note key="b"><span className="block vz-t">She is on a phone call while paying</span><span className="block vz-m">and five more reasons, each in plain words</span></Note>,
    ],
  },
};

/* what the bank's system decided, under the phone */
const VERDICT = {
  biometrics: ['ok', 'Risk 12 · allowed', 'Typing, taps and grip match Anita. No extra step.'],
  totp: ['ok', 'Device verified · no SMS sent', 'A silent code proved this is her registered phone.'],
  face: ['ok', 'Face matched · payment continues', 'A two-second check, only because the payee is new and the amount is large.'],
  rasp: ['warn', 'Screen sharing detected · banking paused', 'Banking resumes the moment the share ends.'],
  scam: ['crit', 'Scam risk critical · payment held', 'The bank calls Anita before any money moves.'],
};
export function CapabilityPhone({ cap }) {
  const c = CAPS[cap];
  const v = VERDICT[cap];
  return (
    <div className="mb-stage">
      <CapabilityPhoneInner cap={cap} c={c} />
      {v && (
        <p key={cap} className={cx('mb-verdict', `t-${v[0]}`)}>
          <i /><span><b>{v[1]}</b><span>{v[2]}</span></span>
        </p>
      )}
    </div>
  );
}
function CapabilityPhoneInner({ cap, c }) {
  return (
    <Viz key={cap} steps={[500, 600]} hold={8000} loop={false} label={`Illustration: the bank app on a phone, showing ${cap === 'biometrics' ? 'a login where typing rhythm matches the customer' : cap === 'totp' ? 'a phone verified by a silent code with no SMS' : cap === 'face' ? 'face verification for a large payment to a new payee' : cap === 'rasp' ? 'banking paused because the screen is being shared' : 'a payment paused because the scam risk is critical'}.`}>
      {() => (
        <div className="mb-grid wide mb-fit">
          <div className="mb-phone-wrap s1"><Phone time="9:41">{c.screen}</Phone></div>
          <div className="s2 space-y-[1em]">{c.notes}</div>
        </div>
      )}
    </Viz>
  );
}

/* ---------- internet banking: score first, step up only when it matters ---------- */
export function WebStepUp({ k: fk } = {}) {
  const rows = [
    { who: 'Kiran Patil', dev: 'Usual laptop · Chrome', v: 14, res: ['Continue, no OTP', 'ok'], why: 'Typing and mouse match their profile' },
    { who: 'Kiran Patil', dev: 'New browser · 02:14', v: 82, res: ['Step-up check', 'warn'], why: 'Typing unlike his · password just reset' },
  ];
  return (
    <Viz k={fk} steps={[500, 800, 900, 900, 900]} hold={4200} label="Illustration: two logins to internet banking with the same password. The genuine one scores 14, below the bank's threshold of 60, and continues with no OTP. The other scores 82 because the typing is unlike the customer's and the password was just reset, so it is stepped up and logged for review.">
      {(k) => (
        <Win title={<span className="inline-flex items-center gap-[.5em]"><Gl g="globe" style={{ width: '1.1em', height: '1.1em' }} />Internet banking · login risk</span>} right={<span className="vz-mono">threshold 60</span>} glow="rgb(0 174 239 / .35)">
          <div className="space-y-[.9em]">
            {rows.map((r, i) => {
              const on = k >= 1 + i * 2, done = k >= 2 + i * 2;
              const col = r.v >= 60 ? '#c2410c' : '#0c7546';
              return (
                <div key={i} className={cx('rounded-[.8em] p-[.9em]', `s${1 + i * 2}`)} style={{ background: 'rgb(14 17 22 / .025)', border: '1px solid rgb(14 17 22 / .08)' }}>
                  <div className="flex items-center gap-[.7em]">
                    <span className="vz-ic"><Gl g="laptop" /></span>
                    <span className="min-w-0 flex-1"><span className="block vz-t">{r.who}</span><span className="block vz-m">{r.dev}</span></span>
                    <span className="text-[1.7em] font-semibold num" style={{ color: col }}>{on ? r.v : '··'}</span>
                  </div>
                  <div className="relative mt-[.7em]">
                    <div className="vz-meter"><i style={{ '--w': `${on ? r.v : 0}%`, '--mc': col }} /></div>
                    <span className="absolute -top-[.3em] h-[1.05em] w-[2px] bg-[#12171f]/60" style={{ left: '60%' }} />
                  </div>
                  <div className={cx('mt-[.7em] flex items-center gap-[.6em]', `s${2 + i * 2}`)}>
                    <Chip tone={r.res[1]}>{r.res[0]}</Chip><span className="min-w-0 flex-1 truncate vz-m">{r.why}</span>
                    {done && r.v >= 60 && <span className="vz-mono">logged</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="s5 mt-[.9em] flex items-center gap-[.6em] vz-m"><Gl g="lock" style={{ width: '1.05em', height: '1.05em', color: ADAP }} />Same password, two outcomes. Only the risky login saw an extra step.</div>
        </Win>
      )}
    </Viz>
  );
}

/* Payee check: the mule story told the way an analyst reads it. A customer pays a
   new payee; adapID looks at the receiving account, not just the sender; the
   evidence lands one line at a time, the mule risk climbs, and the payment is
   held before the money can leave. Loops quietly; finished state on the server
   and for reduced motion. Names and numbers are illustrations. */
const MULE = [
  ['Account opened 9 days ago', 'New'],
  ['13 unrelated senders today · ₹8.96 lakh in', 'Fan-in'],
  ['Money out within 6 minutes · 2 accounts, a wallet, ATM', 'Fan-out'],
  ['Same device as 4 other flagged payees', 'Linked'],
];
export function MuleCheck() {
  const ref = useRef(null);
  useOnView(ref, (g, el) => {
    const score = el.querySelector('.mc-score'), o = { v: 0 };
    return g.timeline({ repeat: -1, repeatDelay: 3.5 })
      .from(el.querySelector('.mc-pay'), { y: 16, opacity: 0, duration: 0.6, ease: 'power3.out' })
      .from(el.querySelectorAll('.mc-in'), { x: -10, opacity: 0, duration: 0.35, stagger: 0.06, ease: 'power2.out' }, 0.3)
      .from(el.querySelector('.mc-acct'), { scale: 0.7, opacity: 0, duration: 0.5, ease: 'back.out(2)' }, 0.7)
      .from(el.querySelectorAll('.mc-out'), { x: -10, opacity: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out' }, 1.0)
      .from(el.querySelectorAll('.mc-row'), { opacity: 0, x: -14, filter: 'blur(4px)', duration: 0.5, stagger: 0.45, ease: 'power3.out' }, 1.3)
      .fromTo(el.querySelector('.mc-bar'), { scaleX: 0 }, { scaleX: 0.91, duration: 2.0, ease: 'power2.inOut' }, 1.4)
      .fromTo(o, { v: 0 }, { v: 91, duration: 2.0, ease: 'power2.inOut', onUpdate: () => { score.textContent = Math.round(o.v); } }, 1.4)
      .from(el.querySelector('.mc-verdict'), { y: 18, opacity: 0, scale: 0.94, duration: 0.6, ease: 'back.out(1.8)' }, 3.6)
      .to(el.querySelector('.mc-verdict'), { scaleX: 1.03, scaleY: 0.97, duration: 0.1, yoyo: true, repeat: 1 }, 4.15);
  });
  return (
    <div ref={ref} className="mc overflow-hidden rounded-[22px] border border-[#0a5ea3]/10 bg-white shadow-[0_40px_80px_-40px_rgb(10_94_163/.45)]" role="img"
      aria-label="Payee check: a customer pays ₹48,000 to a new payee. The receiving account is 9 days old, received money from 13 unrelated senders today and sends it out within minutes. Mule risk 91 of 100. The payment is held before it leaves and the customer is warned.">
      {/* the payment being made */}
      <div className="mc-pay flex items-center gap-3 border-b border-[#0e1116]/[.07] bg-[#f6f9fd] px-5 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e6f0fb] text-[#0a6dbb]"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 10 12 4l9 6M5 10v8M12 10v8M19 10v8M3 20h18" /></svg></span>
        <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-[#0e1116]">Paying ₹48,000 to a new payee</span><span className="block truncate text-[12.5px] text-[#5b6472]">“KYC Update Desk” · a/c ••4410</span></span>
        <span className="flex items-center gap-1.5 rounded-full bg-[#0a6dbb]/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#0a6dbb]"><ProductMark p="adapid" size={14} />Checking payee</span>
      </div>
      {/* where the money comes from and goes: labelled, small */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-5">
        <div className="flex flex-col items-end gap-1">
          <span className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8a909b]">In today</span>
          <div className="flex flex-wrap justify-end gap-1">{Array.from({ length: 13 }, (_, i) => <span key={i} className="mc-in h-3.5 w-3.5 rounded-full bg-[#f3c27a]" />)}</div>
          <span className="text-[12px] text-[#5b6472]">13 senders</span>
        </div>
        <div className="mc-acct grid place-items-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[#fdecec] text-[#c4352a] ring-4 ring-[#fdecec]/60"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 10 12 4l9 6M5 10v8M12 10v8M19 10v8M3 20h18" /></svg></span>
          <span className="mono mt-1.5 text-[11.5px] text-[#c4352a]">••4410</span>
        </div>
        <div className="flex flex-col items-start gap-1">
          <span className="mb-1 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8a909b]">Out in 6 min</span>
          {['a/c ••2291', 'a/c ••0318', 'Wallet', 'ATM cash'].map((t) => <span key={t} className="mc-out rounded-full bg-[#fdecec] px-2 py-0.5 text-[11.5px] font-medium text-[#c4352a]">→ {t}</span>)}
        </div>
      </div>
      {/* the evidence, then the score */}
      <ol className="border-t border-[#0e1116]/[.07] px-5">
        {MULE.map(([t, tag]) => (
          <li key={t} className="mc-row flex items-center gap-3 border-b border-[#0e1116]/[.06] py-2.5 text-[13.5px] text-[#2b313b] last:border-0">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#e5484d]" /><span className="min-w-0 flex-1">{t}</span>
            <span className="rounded-full bg-[#fdecec] px-2 py-0.5 text-[10.5px] font-semibold text-[#c4352a]">{tag}</span>
          </li>
        ))}
      </ol>
      <div className="px-5 pb-5 pt-3">
        <div className="flex items-baseline justify-between text-[12.5px] text-[#5b6472]"><span>Mule risk</span><span><b className="mc-score text-[22px] font-semibold tracking-[-0.02em] text-[#c4352a]">91</b> / 100</span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#eef1f5]"><div className="mc-bar h-full origin-left rounded-full bg-gradient-to-r from-[#f3c27a] via-[#ef7d57] to-[#e5484d]" style={{ transform: 'scaleX(.91)' }} /></div>
        <div className="mc-verdict mt-4 flex items-center gap-3 rounded-[14px] bg-gradient-to-r from-[#0a5ea3] to-[#1e88d8] px-4 py-3 text-white shadow-[0_16px_30px_-14px_rgb(10_94_163/.8)]">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>
          <span className="min-w-0"><span className="block text-[14.5px] font-semibold">Payment held before the money left</span><span className="block text-[12.5px] text-white/80">Customer warned · payee reported · reason on record</span></span>
        </div>
      </div>
    </div>
  );
}
