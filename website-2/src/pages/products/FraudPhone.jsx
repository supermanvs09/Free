/* The mobile-banking picture: one light phone, in the manner of a fintech
   app shot (flat white handset, navy interface, floating white cards with
   long soft shadows). Each capability tab shows the screen it protects and
   the evidence it reads, and the cards float in one after another. */

const Bars = ({ v }) => <span className="fp-bars">{v.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</span>;
const Check = ({ bad }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">{bad
    ? <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    : <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}</svg>
);

const SCREENS = {
  biometrics: {
    screen: (
      <>
        <p className="fp-hi">Good evening, Priya</p>
        <div className="fp-bal"><span>Savings ·· 4821</span><b>₹ 1,84,250.00</b><em>Available balance</em></div>
        <div className="fp-row"><span>Transfer</span><span>Pay bills</span><span>UPI</span></div>
        <div className="fp-list"><p><b>Swiggy</b><span>− ₹ 486</span></p><p><b>Salary · Infosys</b><span className="up">+ ₹ 92,000</span></p><p><b>Airtel postpaid</b><span>− ₹ 799</span></p></div>
      </>
    ),
    cards: [
      { cls: 'c1', body: <><p className="fp-k">Typing rhythm</p><Bars v={[40, 72, 55, 90, 62, 78, 48, 84, 66, 58]} /><p className="fp-m"><b>96%</b> match with Priya's profile</p></> },
      { cls: 'c2', body: <><p className="fp-k">Session risk</p><p className="fp-big ok">08<small>/100</small></p><p className="fp-m">Allowed · no extra step</p></> },
    ],
  },
  totp: {
    screen: (
      <>
        <p className="fp-hi">Signing in</p>
        <div className="fp-center"><span className="fp-lock"><svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" fill="none" /><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor" /></svg></span><p>Verifying this phone</p><span className="fp-dots"><i /><i /><i /></span></div>
        <div className="fp-list"><p><b>Device</b><span>Bound 14 Mar</span></p><p><b>SIM</b><span>Unchanged</span></p></div>
      </>
    ),
    cards: [
      { cls: 'c1', body: <><p className="fp-k">Silent code</p><p className="fp-code">●●● ●●●</p><p className="fp-m ok"><Check /> Verified over an encrypted channel</p></> },
      { cls: 'c2', body: <><p className="fp-k">SMS sent</p><p className="fp-big">0</p><p className="fp-m">Nothing to intercept or type</p></> },
    ],
  },
  face: {
    screen: (
      <>
        <p className="fp-hi">Confirm it's you</p>
        <div className="fp-face"><span className="fp-oval"><svg viewBox="0 0 100 120" aria-hidden="true"><circle cx="50" cy="46" r="20" fill="#c9d3e6" /><path d="M18 116c4-24 18-34 32-34s28 10 32 34" fill="#c9d3e6" /></svg><i className="fp-scan" /></span></div>
        <p className="fp-sub">Hold still for a moment</p>
      </>
    ),
    cards: [
      { cls: 'c1', body: <><p className="fp-k">Why now</p><p className="fp-m"><b>New device</b> and a <b>₹ 2,40,000</b> transfer</p></> },
      { cls: 'c2', body: <><p className="fp-k">Presence</p><p className="fp-m ok"><Check /> Live face matched</p></> },
    ],
  },
  rasp: {
    screen: (
      <>
        <p className="fp-hi">Device check</p>
        <div className="fp-checks">
          {[['Screen sharing', 1], ['Overlay on screen', 0], ['Rooted or hooked', 0], ['Emulator', 0], ['Cloned app', 0]].map(([t, bad]) => (
            <p key={t} className={bad ? 'bad' : ''}><span>{t}</span><em><Check bad={bad} />{bad ? 'Detected' : 'Clear'}</em></p>
          ))}
        </div>
      </>
    ),
    cards: [
      { cls: 'c1 warn', body: <><p className="fp-k">Session paused</p><p className="fp-m"><b>AnyDesk</b> is sharing this screen</p></> },
      { cls: 'c2', body: <><p className="fp-k">Bank policy</p><p className="fp-m">Warn the customer, block payments</p></> },
    ],
  },
  scam: {
    screen: (
      <>
        <p className="fp-hi">Send money</p>
        <div className="fp-pay"><span>To <b>R. Kumar</b> · new payee</span><b>₹ 95,000</b><em>Note: KYC update refund</em></div>
        <div className="fp-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" stroke="#e6ebf3" strokeWidth="10" fill="none" /><circle className="fp-arc" cx="60" cy="60" r="50" stroke="#e8820c" strokeWidth="10" fill="none" strokeLinecap="round" pathLength="100" strokeDasharray="72 100" transform="rotate(-90 60 60)" /></svg><p><b>72</b><span>Scam risk</span></p></div>
        <p className="fp-hold">Payment on hold</p>
      </>
    ),
    cards: [
      { cls: 'c1', body: <><p className="fp-k">Evidence</p><p className="fp-ev"><span>Call in progress</span><b>+9</b></p><p className="fp-ev"><span>Account number pasted</span><b>+6</b></p><p className="fp-ev"><span>New payee, large amount</span><b>+5</b></p></> },
      { cls: 'c2', body: <><p className="fp-k">Decided in</p><p className="fp-big">63<small> ms</small></p></> },
    ],
  },
};

export default function FraudPhone({ k }) {
  const s = SCREENS[k] || SCREENS.biometrics;
  return (
    <div className="fp" aria-hidden="true">
      <div className="fp-glow" />
      <div className="fp-phone"><div key={k} className="fp-screen"><span className="fp-notch" />{s.screen}</div></div>
      {s.cards.map((c, i) => <div key={k + i} className={`fp-card ${c.cls}`} style={{ animationDelay: `${180 + i * 160}ms` }}>{c.body}</div>)}
    </div>
  );
}
