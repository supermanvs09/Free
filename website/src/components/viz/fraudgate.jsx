import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';

/* Three checks, one decision, as a single dial. Each ring is one check and
   sweeps as it reads its signals: a clean check closes its ring, a check that
   finds something stops where it found it. The middle holds the decision. Four
   real sessions take turns and can be picked. Values are illustrative; the
   times match the live decisions in the hero. */

const RINGS = [
  { k: 'id', name: 'Identity', asks: 'Is this the real customer?' },
  { k: 'pr', name: 'Protection', asks: 'Is the customer safe and acting freely?' },
  { k: 'pay', name: 'Payment', asks: 'Is this payment normal?' },
];

// per session, per ring: [state, what the check found, how far round it got]
const SESSIONS = [
  {
    k: 'genuine', tab: 'Genuine customer', who: 'Anita', ctx: 'Mobile banking · ₹3,200',
    reads: [['ok', 'Her typing, her phone', 1], ['ok', 'No call, no remote access', 1], ['ok', 'A payee she pays often', 1]],
    verdict: 'Allow', tone: 'ok', ms: 34, why: 'Everything matches how Anita normally pays. No OTP, no step-up, no friction.',
  },
  {
    k: 'ato', tab: 'Account takeover', who: 'Rohan', ctx: 'Internet banking · login',
    reads: [['crit', 'Right password, wrong hands', 0.42], ['idle', 'Not reached', 0], ['idle', 'Not reached', 0]],
    verdict: 'Step up', tone: 'warn', ms: 41, why: 'The password is correct, but the typing and the device are not his. A face check before anything moves.',
  },
  {
    k: 'scam', tab: 'Payment scam', who: 'Anita', ctx: 'Mobile banking · ₹2,40,000',
    reads: [['ok', 'Her typing, her phone', 1], ['crit', 'On a call for six minutes', 0.55], ['warn', 'New payee, 18× her usual', 0.78]],
    verdict: 'Hold', tone: 'hold', ms: 63, why: 'It is really her, and that is the point: she is being talked through it. An analyst calls her before the money moves.',
  },
  {
    k: 'mule', tab: 'Mule payment', who: 'Imran', ctx: 'UPI · ₹45,000',
    reads: [['ok', 'His typing, his phone', 1], ['ok', 'No call, no remote access', 1], ['crit', 'Payee is a known mule account', 0.88]],
    verdict: 'Block', tone: 'crit', ms: 38, why: 'The payee is flagged as a mule in shared fraud intelligence. The money never leaves the account.',
  },
];

const TONE = { ok: 'var(--color-ok)', warn: 'var(--color-warn)', hold: 'var(--color-hold)', crit: 'var(--color-crit)', idle: 'var(--color-line-2)' };
const R = [168, 132, 96];
const C = R.map((r) => 2 * Math.PI * r);
const SWEEP = 1150; // one ring, ms
const STEP = 820; // one ring starts after the one outside it, ms

export function FraudGate() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [s, setS] = useState(2); // without scripts, the payment scam, decided
  const [k, setK] = useState(9);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (reduce || !seen || held) return undefined;
    setK(0);
    const at = [60, STEP, STEP * 2, STEP * 3, STEP * 3 + SWEEP, STEP * 3 + SWEEP + 4200];
    const ids = at.map((ms, i) => setTimeout(() => (i === 5 ? (setS((v) => (v + 1) % SESSIONS.length), setK(0)) : setK(i + 1)), ms));
    return () => ids.forEach(clearTimeout);
  }, [seen, reduce, held, s]);
  const pick = (i) => { setHeld(true); setS(i); setK(9); };
  const S = SESSIONS[s];
  const decided = k >= 5;

  return (
    <figure ref={ref} className="fg" aria-label={`Illustration: three checks on one dial. ${SESSIONS.map((x) => `${x.tab}: ${x.reads.map((r, i) => `${RINGS[i].name}, ${r[1]}`).join('; ')}. ${x.verdict} in ${x.ms} milliseconds. ${x.why}`).join(' ')}`}>
      {/* the sessions, as words rather than buttons in boxes */}
      <div className="fg-pick" role="tablist" aria-label="Example sessions">
        {SESSIONS.map((x, i) => (
          <button key={x.k} type="button" role="tab" aria-selected={i === s} onClick={() => pick(i)} className={cx('fg-tab', i === s && 'on')}>{x.tab}</button>
        ))}
      </div>

      <div className="fg-stage" key={S.k}>
        <div className="fg-left">
        <div className="fg-dial" aria-hidden="true">
          <svg viewBox="0 0 440 440">
            <defs>
              <filter id="fg-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
            </defs>
            {RINGS.map((ring, i) => {
              const [state, , frac] = S.reads[i];
              const live = k >= i + 1;
              const go = live ? frac : 0;
              const col = state === 'idle' ? TONE.idle : TONE[state];
              return (
                <g key={ring.k}>
                  <circle className="fg-track" cx="220" cy="220" r={R[i]} />
                  <circle className="fg-arc" cx="220" cy="220" r={R[i]} stroke={col}
                    strokeDasharray={C[i]} strokeDashoffset={C[i] * (1 - go)}
                    style={{ transitionDuration: `${SWEEP}ms`, opacity: live ? 1 : 0.0001 }} />
                  {/* the reading head: it rides the end of the arc */}
                  <g className="fg-head" style={{ transitionDuration: `${SWEEP}ms`, transform: `rotate(${go * 360}deg)`, opacity: live && go > 0 && go < 1 ? 1 : 0 }}>
                    <circle cx="220" cy={220 - R[i]} r="9" fill={col} filter="url(#fg-soft)" opacity=".5" />
                    <circle cx="220" cy={220 - R[i]} r="4.5" fill={col} />
                  </g>
                </g>
              );
            })}
          </svg>
          <div className={cx('fg-mid', decided && 'on')}>
            <span className="fg-who">{S.who}</span>
            {decided
              ? <strong className="fg-verdict" style={{ color: TONE[S.tone] }}>{S.verdict}</strong>
              : <span className="fg-wait"><i /><i /><i /></span>}
            <span className="fg-ms">{decided ? `${S.ms} ms` : 'reading'}</span>
          </div>
        </div>
        <p className="fg-ctx">{S.ctx}</p>
        </div>

        {/* what each check found: three lines, no boxes */}
        <ol className="fg-reads">
          {RINGS.map((ring, i) => {
            const [state, read] = S.reads[i];
            const on = k >= i + 2 || decided;
            return (
              <li key={ring.k} className={cx('fg-read', on && 'on', state === 'idle' && 'idle')} style={{ '--c': TONE[state] }}>
                <span className="fg-dot" />
                <span className="fg-name">{ring.name}</span>
                <span className="fg-ask">{ring.asks}</span>
                <span className="fg-found">{read}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className={cx('fg-why', decided && 'on')}>{S.why}</p>
    </figure>
  );
}
