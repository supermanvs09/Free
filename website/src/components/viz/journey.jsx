import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';

/* One banking session, read end to end, the way adapID reads it: from opening
   the app (or the bank's website) to sending money. Each step shows the screen
   the customer sees and what the bank's SDK measures underneath: keystroke
   rhythm (how long each key is held, the gap to the next), touch and grip,
   paste events, navigation, an active call, mouse movement. Risk builds with
   every signal and the decision lands before the money moves.
   Mobile: a real customer coached by a scammer. Internet banking: a fraudster
   with stolen credentials. Names, numbers and scores are sample data. */

const STEP_MS = 3800;

/* ── the two sessions ─────────────────────────────────────────────────────── */
const MOBILE = {
  who: 'Anita Sharma · Savings ••4821',
  verdict: ['Payment held', 'crit'],
  steps: [
    { k: 'open', label: 'Opens the app', risk: 4,
      focus: { kind: 'checks', title: 'Device and app, before the first tap', rows: [['Her registered phone, 14 months', true], ['App untampered, no screen overlay', true], ['Not rooted, no remote-access app', true], ['Pune, where she usually is', true]] },
      sig: [['Known device and app, baseline risk', 4, 'ok']] },
    { k: 'login', label: 'Enters MPIN', risk: 6,
      focus: { kind: 'keys', title: 'Keystroke rhythm · MPIN', keys: ['•', '•', '•', '•'], hold: [92, 88, 97, 90], holdP: [90, 86, 95, 92], gap: [210, 185, 240], gapP: [205, 190, 230], match: 94, note: 'Hold time and gaps match her last 212 logins. Thumb pressure and grip angle too.' },
      sig: [['Typing rhythm matches her', 0, 'ok'], ['Grip and touch pressure match', 2, 'ok']] },
    { k: 'nav', label: 'Goes to Pay', risk: 24, call: '04:12',
      focus: { kind: 'nav', title: 'Navigation', rows: [['Time on home screen', '6.4 s', 'usually 1.2 s'], ['Taps before Pay', '7', 'usually 2'], ['Phone call', 'active, 04:12', 'unknown number']] },
      sig: [['On a call with an unknown number', 12, 'warn'], ['Hesitating, searching the menu', 6, 'warn']] },
    { k: 'payee', label: 'Adds a payee', risk: 52, call: '05:03',
      focus: { kind: 'paste', title: 'Account number field', big: '16 digits, 1 event', sub: 'Pasted, not typed. Zero keystrokes. She types every payee she has added before.', extra: [['Payee', 'KYC Update Desk'], ['Account', 'New, 9 days old'], ['Mule list', 'Match, 3 reports']] },
      sig: [['Account number pasted', 14, 'crit'], ['Payee on a mule list', 14, 'crit']] },
    { k: 'amount', label: 'Types the amount', risk: 78, call: '05:41',
      focus: { kind: 'keys', title: 'Keystroke rhythm · amount', keys: ['2', '4', '0', '0', '0', '0'], hold: [96, 140, 88, 92, 94, 90], holdP: [90, 92, 86, 88, 90, 88], gap: [2800, 420, 190, 1900, 200], gapP: [220, 200, 190, 210, 200], match: 31, note: 'Long pauses mid-number: 2.8 s before “4”, 1.9 s before the last zeros. The pattern of someone being told what to type.' },
      sig: [['Pauses like dictation while typing', 16, 'crit'], ['Amount 6× her largest payment', 10, 'warn']] },
    { k: 'pay', label: 'Taps Pay', risk: 91, call: '06:02',
      focus: { kind: 'decision', title: 'Decision · 38 ms', tone: 'crit', head: 'Hold the payment and call Anita', rows: ['Risk 91, above the hold line of 80', 'Every reason listed, with its weight', 'Money never left the account', 'Case opened for the fraud desk'] },
      sig: [['Pay tapped mid-call, six minutes in', 13, 'crit']] },
  ],
};
const WEB = {
  who: 'Kiran Patil · Current ••7710',
  verdict: ['Session ended', 'crit'],
  steps: [
    { k: 'open', label: 'Opens net banking', risk: 18,
      focus: { kind: 'checks', title: 'Browser and network', rows: [['New browser, never seen for Kiran', false], ['Time zone says Asia/Dubai', false], ['Network: a hosting provider, not a home ISP', false], ['No screen-share tool running', true]] },
      sig: [['Unknown browser and network', 18, 'warn']] },
    { k: 'login', label: 'Logs in', risk: 46,
      focus: { kind: 'keys', title: 'Keystroke rhythm · customer ID', keys: ['k', 'p', 'a', 't', 'i', 'l'], hold: [62, 60, 61, 60, 62, 61], holdP: [104, 96, 110, 98, 102, 100], gap: [80, 79, 80, 81, 80], gapP: [180, 240, 160, 210, 190], match: 22, note: 'Every key held 60 ms, every gap 80 ms: machine-even. Kiran types slower and uneven. The password was pasted.' },
      sig: [['Typing unlike Kiran, machine-even', 16, 'crit'], ['Password pasted', 12, 'warn']] },
    { k: 'nav', label: 'Moves the mouse', risk: 64,
      focus: { kind: 'mouse', title: 'Mouse movement', note: 'Straight lines and jumps, no drift or overshoot. The signature of a script or a remote-control tool, not a hand.' },
      sig: [['Mouse moves in straight lines and jumps', 18, 'crit']] },
    { k: 'payee', label: 'Adds a beneficiary', risk: 76,
      focus: { kind: 'paste', title: 'Beneficiary account field', big: '38 s after login', sub: 'Beneficiary added within a minute of logging in, account number pasted. Kiran has never added one this fast.', extra: [['Beneficiary', 'R. Traders'], ['Account', 'New'], ['Limit', 'Set to maximum']] },
      sig: [['Beneficiary added 38 s after login', 12, 'crit']] },
    { k: 'amount', label: 'Enters the amount', risk: 84,
      focus: { kind: 'checks', title: 'Payment', rows: [['₹4,90,000: the full daily limit', false], ['Typed in 0.4 s, no corrections', false], ['First transfer to this beneficiary', false], ['Login and payment on the same new browser', false]] },
      sig: [['Full daily limit, typed in 0.4 s', 8, 'warn']] },
    { k: 'pay', label: 'Confirms', risk: 96,
      focus: { kind: 'decision', title: 'Decision · 41 ms', tone: 'crit', head: 'Step-up failed, session ended', rows: ['Risk 84 asked for a step-up on Kiran’s phone', 'Step-up not completed in 60 s', 'Session ended, beneficiary blocked', 'Kiran told by SMS and call'] },
      sig: [['Step-up failed, session ended', 12, 'crit']] },
  ],
};

const ICONS = {
  open: 'M7 3h10v18H7zM11 18h2', login: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z', nav: 'M4 6h16M4 12h10M4 18h7',
  payee: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c.6-3 3-4.6 6-4.6M17 13v6M14 16h6', amount: 'M7 5h10M7 9h10M9 5c4 0 4 8 0 8H7l7 6', pay: 'M5 12l4 4 10-10',
};
const I = ({ d, s = 15 }) => <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const tone = (r) => (r >= 80 ? 'crit' : r >= 40 ? 'warn' : 'ok');

/* ── what the customer sees ───────────────────────────────────────────────── */
function PhoneScreen({ s, f, call }) {
  const typed = (str) => str.slice(0, Math.max(0, Math.round(f * (str.length + 1)) - 1) + 1);
  return (
    <div className="jy-phone">
      <div className="jy-ps">
        <div className="jy-status">{call ? <span className="jy-call">● {call}</span> : <span>9:41</span>}<span>▮▮▮</span></div>
        <div className="jy-app">
          {s === 0 && (
            <div className="jy-splash"><span className="jy-logo big">YB</span><b>Your Bank</b><i className="jy-spin" /></div>
          )}
          {s === 1 && (
            <>
              <div className="jy-top"><span className="jy-logo">YB</span>Your Bank</div>
              <div className="mt-[14%] text-center">
                <span className="jy-av">AS</span>
                <p className="jy-h mt-2">Good evening, Anita</p>
                <p className="jy-sub">Enter your 4-digit MPIN</p>
                <div className="mt-3 flex justify-center gap-2">{[0, 1, 2, 3].map((i) => <span key={i} className={cx('jy-dot', f > (i + 1) / 5 && 'on')} />)}</div>
              </div>
              <div className="jy-pad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((n, i) => <span key={i} className={cx(n && 'k', i === [6, 1, 8, 3][Math.floor(f * 5) - 1] && 'on')}>{n}</span>)}</div>
            </>
          )}
          {s === 2 && (
            <>
              <div className="jy-top"><span className="jy-logo">YB</span>Your Bank</div>
              <div className="jy-card mt-3"><span className="jy-sub">Savings ••4821</span><b className="block text-[1.35em] tracking-[-.02em]">₹3,12,480</b></div>
              <div className="mt-3 grid grid-cols-3 gap-2">{['Pay', 'Add payee', 'Cards', 'UPI', 'Loans', 'More'].map((n, i) => <span key={n} className={cx('jy-tile', i === Math.min(5, Math.floor(f * 7)) && 'tap', n === 'Pay' && f > 0.8 && 'tap')}>{n}</span>)}</div>
            </>
          )}
          {(s === 3 || s === 4 || s === 5) && (
            <>
              <div className="jy-top"><span className="jy-logo">YB</span>Send money</div>
              <p className="jy-h mt-3">Pay a new payee</p>
              <div className="jy-field mt-2"><span>Payee</span><b>KYC Update Desk</b></div>
              <div className={cx('jy-field', s === 3 && f > 0.35 && 'paste')}><span>Account number</span><b className="font-mono">{s > 3 || f > 0.35 ? '5021 0044 7310 4410' : ' '}</b>{s === 3 && f > 0.35 && <em>Pasted</em>}</div>
              <div className={cx('jy-field', s === 4 && 'typing')}><span>Amount</span><b>{s === 3 ? '₹' : s === 4 ? `₹${typed('2,40,000')}` : '₹2,40,000'}</b></div>
              <div className="jy-field"><span>Remark</span><b>{s >= 4 && f > 0.6 || s === 5 ? 'KYC update' : ' '}</b></div>
              {s === 5 && f > 0.35
                ? <div className="jy-held"><span>⛉</span><b>We’ve paused this payment</b><small>Your bank will call you in a moment.</small></div>
                : <span className={cx('jy-btn', s === 5 && 'press')}>Pay ₹2,40,000</span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function WebScreen({ s, f }) {
  const typed = (str) => str.slice(0, Math.round(f * str.length));
  return (
    <div className="jy-web">
      <div className="jy-url"><i /><i /><i /><span>🔒 netbanking.yourbank.in</span></div>
      <div className="jy-page">
        <div className="jy-top"><span className="jy-logo">YB</span>Your Bank · Net banking</div>
        {s === 0 && <div className="jy-splash small"><i className="jy-spin" /><span className="jy-sub">Loading secure login…</span></div>}
        {s === 1 && (
          <div className="jy-form">
            <div className="jy-field typing"><span>Customer ID</span><b>{typed('kpatil')}</b></div>
            <div className={cx('jy-field', f > 0.6 && 'paste')}><span>Password</span><b>{f > 0.6 ? '••••••••••' : ' '}</b>{f > 0.6 && <em>Pasted</em>}</div>
            <span className="jy-btn">Log in</span>
          </div>
        )}
        {s === 2 && (
          <div className="relative mt-2 h-[78%]">
            <div className="grid grid-cols-3 gap-2">{['Accounts', 'Transfers', 'Beneficiaries', 'Cards', 'Deposits', 'Statements'].map((n) => <span key={n} className={cx('jy-tile', n === 'Beneficiaries' && f > 0.7 && 'tap')}>{n}</span>)}</div>
            {/* the cursor moves in straight hops, the way a script does */}
            <svg viewBox="0 0 22 24" className="jy-cursor" style={{ left: `${[12, 12, 50, 50, 84][Math.min(4, Math.floor(f * 5))]}%`, top: `${[80, 80, 80, 22, 22][Math.min(4, Math.floor(f * 5))]}%` }} aria-hidden="true"><path d="M2 2 L20 9.5 L11.5 12 L8 21 Z" fill="#fff" stroke="#12171f" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </div>
        )}
        {(s === 3 || s === 4) && (
          <div className="jy-form">
            <div className="jy-field"><span>Beneficiary name</span><b>R. Traders</b></div>
            <div className={cx('jy-field', s === 3 && f > 0.3 && 'paste')}><span>Account number</span><b className="font-mono">{s === 4 || f > 0.3 ? '9100 2231 0087 1265' : ' '}</b>{s === 3 && f > 0.3 && <em>Pasted</em>}</div>
            <div className={cx('jy-field', s === 4 && 'typing')}><span>Amount</span><b>{s === 4 ? (f > 0.15 ? '₹4,90,000' : '₹') : '₹'}</b></div>
            <span className="jy-btn">Continue</span>
          </div>
        )}
        {s === 5 && (f < 0.4
          ? <div className="jy-form"><div className="jy-held amber"><span>⚿</span><b>Confirm it’s you</b><small>We sent a request to Kiran’s registered phone.</small></div></div>
          : <div className="jy-form"><div className="jy-held"><span>⛉</span><b>Session ended</b><small>The beneficiary is blocked and Kiran has been told.</small></div></div>)}
      </div>
    </div>
  );
}

/* ── what the bank sees ───────────────────────────────────────────────────── */
/* Typing rhythm as lines: the customer's last 12 sessions (faint), the range
   they usually stay in (band), and this session drawn over them. Square-root
   scale, so a 3-second pause and a 90 ms keystroke both stay readable. */
const seeded = (seed) => { let v = seed; return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; };
export function RhythmLines({ labels, usual, now, f = 1, title, unit = 'ms', n = 12, seed = 3 }) {
  const W = 300, H = 120, P = { l: 30, r: 10, t: 12, b: 22 };
  const r = seeded(seed);
  const past = Array.from({ length: n }, () => usual.map((u) => u * (0.86 + r() * 0.28)));
  const lo = usual.map((_, i) => Math.min(...past.map((p) => p[i]))), hi = usual.map((_, i) => Math.max(...past.map((p) => p[i])));
  const max = Math.max(...hi, ...now) * 1.08;
  const X = (i) => P.l + (i / Math.max(1, labels.length - 1)) * (W - P.l - P.r);
  const Y = (v) => H - P.b - Math.sqrt(v / max) * (H - P.t - P.b);
  const line = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const band = `${line(hi)}${lo.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('')}Z`;
  const shown = Math.max(1, Math.ceil(f * labels.length));
  const out = now.map((v, i) => v > hi[i] * 1.25 || v < lo[i] * 0.75);
  const fmt = (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)}`);
  const ticks = [100, 400, 1000, 3000].filter((t) => t < max);
  return (
    <div className="jy-rl">
      <p className="jy-rlt">{title}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={Y(t)} y2={Y(t)} className="jy-tick" /><text x={P.l - 4} y={Y(t) + 3} textAnchor="end" className="jy-tl">{fmt(t)}</text></g>)}
        <path d={band} className="jy-band2" />
        {past.map((p, k) => <path key={k} d={line(p)} className="jy-past" />)}
        <path d={line(now.slice(0, shown))} className="jy-now" />
        {now.slice(0, shown).map((v, i) => (
          <g key={i}>
            <circle cx={X(i)} cy={Y(v)} r={out[i] ? 3.6 : 2.6} className={out[i] ? 'jy-pt bad' : 'jy-pt'} />
            {out[i] && <text x={X(i)} y={Y(v) - 7} textAnchor="middle" className="jy-pv">{fmt(v)}</text>}
          </g>
        ))}
        {labels.map((l, i) => <text key={i} x={X(i)} y={H - 6} textAnchor="middle" className="jy-xl">{l}</text>)}
      </svg>
    </div>
  );
}

function Keys({ x, f }) {
  const gapLabels = x.keys.slice(1).map((k, i) => `${x.keys[i]}→${k}`);
  return (
    <div className="jy-keys2">
      <RhythmLines title="Hold time per key" labels={x.keys} usual={x.holdP} now={x.hold} f={f} seed={5} />
      <RhythmLines title="Gap to the next key" labels={gapLabels} usual={x.gapP} now={x.gap} f={f} seed={9} />
      <div className="jy-legend col-span-full"><i className="pl" />Her last 12 sessions<i className="bd" />Usual range<i className="nw" />This session<i className="x" />Out of range</div>
    </div>
  );
}

function Focus({ x, f }) {
  return (
    <div className="jy-focus" key={x.title}>
      <div className="jy-fh"><b>{x.title}</b>{x.kind === 'keys' && <span className={cx('jy-match', x.match < 60 && 'bad')}>{x.match}% match</span>}</div>
      {x.kind === 'keys' && <><Keys x={x} f={f} /><p className="jy-note">{x.note}</p></>}
      {x.kind === 'checks' && <ul className="jy-checks">{x.rows.map(([t, ok], i) => <li key={t} className={cx(f > (i + 0.3) / x.rows.length && 'on', ok ? 'ok' : 'bad')}><i>{ok ? '✓' : '!'}</i>{t}</li>)}</ul>}
      {x.kind === 'nav' && <ul className="jy-nav">{x.rows.map(([a, b, c], i) => <li key={a} className={cx(f > (i + 0.3) / x.rows.length && 'on')}><span>{a}</span><b>{b}</b><small>{c}</small></li>)}</ul>}
      {x.kind === 'paste' && (
        <div className="jy-paste">
          <p className="jy-big">{x.big}</p><p className="jy-note">{x.sub}</p>
          <dl>{x.extra.map(([a, b], i) => <div key={a} className={cx(f > 0.3 + i * 0.15 && 'on', /mule|New|maximum/i.test(b) && 'bad')}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
        </div>
      )}
      {x.kind === 'mouse' && (
        <div>
          <svg viewBox="0 0 320 130" className="jy-mouse">
            <path d="M14 112 C60 96 70 60 120 58 S190 92 214 60 S260 20 306 24" className="hum" />
            <path d="M14 112 L130 112 L130 34 L210 34 M246 70 L306 24" className="bot" pathLength="1" style={{ strokeDashoffset: 1 - f }} />
            <circle cx="210" cy="34" r="3" className="jump" /><circle cx="246" cy="70" r="3" className="jump" />
            <text x="14" y="18" className="lbl">Kiran’s hand: curves, drift</text>
            <text x="136" y="126" className="lbl red">This session: straight lines, a jump</text>
          </svg>
          <p className="jy-note">{x.note}</p>
        </div>
      )}
      {x.kind === 'decision' && (
        <div className={cx('jy-dec', x.tone)}>
          <p className="jy-dh">{x.head}</p>
          <ul>{x.rows.map((r, i) => <li key={r} className={cx(f > 0.15 + i * 0.15 && 'on')}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export default function SessionJourney() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.25 });
  const reduce = useReducedMotion();
  const [mode, setMode] = useState('mobile');
  const [step, setStep] = useState(5);
  const [f, setF] = useState(1);
  const [hold, setHold] = useState(false);
  const D = mode === 'mobile' ? MOBILE : WEB;

  useEffect(() => { if (!reduce) { setStep(0); setF(0); } }, [reduce, mode]);
  useEffect(() => {
    if (reduce || !seen) return undefined;
    let t0 = performance.now(), raf;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const p = Math.min(1, Math.max(0, (now - t0) / STEP_MS));
      setF(p);
      if (p >= 1 && !hold) { t0 = now; setStep((s) => (s + 1) % D.steps.length); setF(0); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, reduce, hold, mode, step, D.steps.length]);

  const S = D.steps[step];
  const prev = step ? D.steps[step - 1].risk : 0;
  const risk = Math.round(prev + (S.risk - prev) * Math.min(1, f * 1.6));
  const signals = D.steps.slice(0, step + 1).flatMap((x, i) => x.sig.map((g) => [...g, i])).filter((g) => g[3] < step || f > 0.35).reverse().slice(0, 6);
  const pick = (i) => { setStep(i); setF(0); setHold(true); };
  const status = step === 5 && f > 0.35 ? D.verdict : risk >= 40 ? ['Risk rising', 'warn'] : ['Watching', 'ok'];

  return (
    <figure ref={ref} className="jy" onMouseLeave={() => setHold(false)}
      aria-label={mode === 'mobile'
        ? 'Illustration: Anita opens her bank app, enters her MPIN, goes to Pay, adds a payee and types an amount while on a call. Her typing at login matches her profile, but she hesitates, pastes the account number of a payee on a mule list and pauses mid-number as if being dictated to. Risk climbs to 91 and the payment is held before the money moves.'
        : 'Illustration: someone logs in to Kiran’s internet banking from a new browser on a hosting network, typing with machine-even rhythm and pasting the password, moving the mouse in straight lines, adding a beneficiary 38 seconds after login and sending the full daily limit. Risk passes 84, the step-up on Kiran’s phone is not completed and the session is ended.'}>
      <div className="jy-bar">
        <div className="jy-seg" role="tablist" aria-label="Channel">
          {[['mobile', 'Mobile banking'], ['web', 'Internet banking']].map(([k, n]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} className={cx(mode === k && 'on')} onClick={() => { setMode(k); setHold(false); }}>{n}</button>
          ))}
        </div>
        <span className="jy-who" aria-hidden="true">Live session · {D.who}</span>
        <span className={cx('jy-status-pill', status[1])} aria-hidden="true"><i />{status[0]}</span>
      </div>

      <ol className="jy-steps">
        {D.steps.map((x, i) => (
          <li key={x.k}>
            <button type="button" onClick={() => pick(i)} aria-pressed={i === step} className={cx(i === step && 'on', i < step && 'past', `t-${tone(x.risk)}`)}>
              <span className="jy-si"><I d={ICONS[x.k]} /></span><span className="jy-sl">{x.label}</span>
              {i === step && <span className="jy-prog" style={{ transform: `scaleX(${f})` }} />}
            </button>
          </li>
        ))}
      </ol>

      <div className="jy-body" aria-hidden="true">
        <div className="jy-device">{mode === 'mobile' ? <PhoneScreen s={step} f={f} call={S.call} /> : <WebScreen s={step} f={f} />}</div>
        <div className="jy-panel">
          <div className="jy-risk">
            <div><span className="jy-rl">Session risk</span><b className={cx('jy-rv', `t-${tone(risk)}`)}>{risk}</b></div>
            <div className="jy-meter">
              <span className="jy-fill" style={{ width: `${risk}%` }} />
              <i style={{ left: '40%' }} /><i style={{ left: '80%' }} />
              <small style={{ left: '40%' }}>Step-up 40</small><small style={{ left: '80%' }}>Hold 80</small>
            </div>
          </div>
          <Focus x={S.focus} f={f} />
          <div className="jy-feed">
            <p className="jy-fl">Signals so far</p>
            <ul>{signals.map(([t, p, tn]) => <li key={t} className={`t-${tn}`}><i />{t}<b>{p ? `+${p}` : '0'}</b></li>)}</ul>
          </div>
        </div>
      </div>
      <figcaption className="jy-cap">Sample sessions. The SDK measures how a customer types, taps, holds the phone and moves the mouse, never what they type.</figcaption>
    </figure>
  );
}
