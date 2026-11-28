import { Benefits } from '../../components/showcase.jsx';
import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, Tabs } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import FraudPhone from './FraudPhone.jsx';
import { FraudQueue } from '../../components/dashboards.jsx';
import { Zoom } from '../../components/Dash.jsx';
import { Hero, PhotoFeature, Integrations, Rollout, Faq, Points, LINKS, ACC } from '../../components/ProductKit.jsx';

/* Identity Fraud Prevention: one platform for mobile and internet banking, from
   login to payment. The page follows the platform's own logic: three questions
   in every session, the capabilities that answer them, and the explanation that
   comes with every decision. */

const p = PRODUCTS.fraud;
const A = ACC.adap;

/* the hero picture: the bank in the customer's hand, with the decisions it
   makes floating in, one after another */
function HeroPhoto() {
  return (
    <div className="fh" aria-hidden="true">
      <div className="fh-img"><img src="/img/photos/fraud-hero.webp" alt="" width="612" height="369" fetchPriority="high" decoding="async" /></div>
      <div className="fh-chip c1"><i className="ok" /><span><b>Session verified</b><em>Behaviour matches · 63 ms</em></span></div>
      <div className="fh-chip c2"><i className="warn" /><span><b>Payment held</b><em>Call in progress · new payee</em></span></div>
      <div className="fh-chip c3"><i className="ok" /><span><b>₹ 3.8 Cr protected</b><em>Today, mobile and UPI</em></span></div>
    </div>
  );
}

/* how we differ from the fraud tools a bank already runs: four things a buyer
   checks, side by side */
const VERSUS = [
  ['What it judges', 'The payment, against fixed rules', 'The customer, their device and the payment, together', 'Fingerprint'],
  ['When it decides', 'After the transaction, in a review queue', 'Before the money moves, in under 80 ms', 'Lightning'],
  ['A scam where the real customer pays', 'Passes: right person, right OTP', 'Caught: a call in progress, a pasted account, a new payee', 'Phone'],
  ['Why a payment was stopped', 'A score, with no reason', 'Every decision in plain words, for the analyst and the auditor', 'ChatCircleText'],
];

function Versus() {
  return (
    <div className="grid gap-x-4 md:grid-cols-[.8fr_1fr_1.15fr]">
      <span className="hidden md:block" />
      <p className="chg-without hidden px-6 py-4 text-[13px] font-semibold uppercase tracking-[.1em] text-crit md:block" style={{ borderRadius: '18px 18px 0 0' }}>Typical fraud tools</p>
      <p className="chg-with hidden px-6 py-4 text-[13px] font-semibold uppercase tracking-[.1em] md:block" style={{ '--acc': A, color: A, borderRadius: '18px 18px 0 0', boxShadow: 'none' }}>adapID AI</p>
      {VERSUS.map(([q, them, us, icon], i) => (
        <Reveal key={q} delay={i * 60} className="contents">
          <p className="flex items-center gap-3 border-t border-line py-5 text-[16px] font-semibold text-ink max-md:pt-6 md:pr-4"><span className="ico grid h-9 w-9 shrink-0 place-items-center rounded-[11px]" style={{ '--acc': A }}><Icon name={icon} size={18} /></span>{q}</p>
          <p className="flex items-start gap-2.5 border-t border-line px-6 py-5 text-[16px] leading-snug text-ink-3 md:bg-[color-mix(in_oklab,var(--color-crit)_4%,var(--color-bg-1))]"><Icon name="X" size={15} weight="bold" className="mt-[3px] shrink-0 text-crit" />{them}</p>
          <p className="flex items-start gap-2.5 border-t border-line px-6 py-5 text-[16px] font-medium leading-snug text-ink md:bg-[color-mix(in_oklab,var(--color-adap)_10%,var(--color-bg-1))]"><Icon name="CheckCircle" size={17} weight="fill" className="mt-[2px] shrink-0" style={{ color: A }} />{us}</p>
        </Reveal>
      ))}
    </div>
  );
}

/* mobile banking: one phone, five capabilities */
const MOBILE = [
  { key: 'biometrics', tab: 'Behavioural biometrics', gap: 'A stolen password and OTP look exactly like the customer.',
    how: ['Learns how each customer types, taps and holds the phone, never what they type.', 'Scores every session against that profile, with the reasons.'],
    result: 'Takeover caught even when the password and OTP are right.' },
  { key: 'totp', tab: 'Silent TOTP', gap: 'SMS OTPs are phished, forwarded and stolen through SIM swaps.',
    how: ['The phone is bound to the account once.', 'A one-time code is generated and verified silently, over an encrypted channel.'],
    result: 'No SMS to intercept. Nothing for the customer to type.' },
  { key: 'face', tab: 'Face verification', gap: 'High-risk moments need proof the real customer is present.',
    how: ['Runs only when risk is high: a new device, a large payment.', 'Every attempt is logged with the session.'],
    result: 'Strong proof of presence, only when it matters.' },
  { key: 'rasp', tab: 'Device security', gap: 'Malware and remote-access apps let fraudsters drive the customer’s phone.',
    how: ['Checks for screen sharing, overlays, rooting, hooking and emulators, all session long.', 'Your policy decides: log, warn or block.'],
    result: 'Banking runs only on a safe device.' },
  { key: 'scam', tab: 'Scam signals', gap: 'In a scam, the real customer pays. Identity checks pass.',
    how: ['Reads the evidence around the payment: a live call, a pasted account, a new payee.', 'Each signal adds points, with the reason the analyst sees.'],
    result: 'The money stays until the customer is safe.' },
];

function MobileCaps() {
  const [i, setI] = useState(0);
  const m = MOBILE[i];
  return (
    <div>
      <Tabs items={MOBILE.map((x) => x.tab)} value={i} onChange={setI} acc={A} label="Mobile banking capabilities" />
      <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
        <div key={m.key} className="fadein">
          <p className="text-[13px] font-semibold uppercase tracking-[.08em] text-adap">The gap</p>
          <p className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.02em] md:text-[24px]">{m.gap}</p>
          <p className="mt-7 text-[13px] font-semibold uppercase tracking-[.08em] text-ink-3">How we solve it</p>
          <ol className="mt-3 space-y-3">{m.how.map((h, k) => <li key={k} className="flex gap-3 text-[16px] leading-relaxed text-ink-2"><span className="num mt-[2px] grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-2 text-[12px] font-semibold">{k + 1}</span>{h}</li>)}</ol>
          <p className="mt-7 flex items-start gap-3 rounded-[16px] border border-line p-4 text-[16px] leading-relaxed"><Icon name="CheckCircle" size={20} className="mt-[2px] shrink-0 text-ok" /><span><span className="font-semibold">Result. </span><span className="text-ink-2">{m.result}</span></span></p>
        </div>
        <FraudPhone k={m.key} />
      </div>
    </div>
  );
}

const WEB = [
  { icon: 'CursorClick', h: 'Behavioural biometrics on the web', p: 'Typing and mouse behaviour scored at every login. Stolen credentials alone no longer get in.' },
  { icon: 'Gauge', h: 'Risk-based step-up', p: 'Low risk: no OTP. High risk: a step-up, logged. Your thresholds, your trusted devices.' },
];

const TXN = [
  { icon: 'Pulse', h: 'Anomaly detection', p: 'Each payment compared with the customer’s own past, with similar customers, and with everyone paying the same payee.' },
  { icon: 'Bank', h: 'Beneficiary profiling', p: 'Every receiving account profiled, and likely mules flagged before the money arrives.' },
  { icon: 'ChatCircleText', h: 'Remark analysis', p: 'The payment note read for scam purposes such as “KYC update” or “refund”.' },
  { icon: 'UserCircle', h: 'New-customer scoring', p: 'Customers with little history protected by comparing them with their peers.' },
];

const CASE = [['Alert', 'Held payment or risky login'], ['Case', 'Score and reasons attached'], ['Decision', 'Recorded, escalated on SLA']];

function Explanation() {
  return (
    <div className="overflow-hidden rounded-[24px] border border-line bg-bg-1 p-7 shadow-[0_40px_80px_-60px_rgb(11_42_82/.4)] md:p-9">
      <p className="text-[12.5px] font-semibold uppercase tracking-[.1em] text-ink-3">One reason, as the analyst sees it</p>
      <div className="mt-6 flex items-start justify-between gap-6">
        <p className="text-[22px] font-medium leading-snug tracking-[-0.02em] text-ink md:text-[26px]">Phone call during the payment</p>
        <span className="shrink-0 rounded-full px-3 py-1 text-[16px] font-semibold num" style={{ background: '#fff4e0', color: '#a86400' }}>+9 points</span>
      </div>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-2">Seen about 7.5× more often in scams than in genuine sessions.</p>
      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-line pt-6 text-[16px]">
        <span className="text-ink-3">Score</span><span className="num font-semibold text-ink">26</span><Icon name="ArrowRight" size={14} className="text-ink-3" /><span className="num font-semibold" style={{ color: '#a86400' }}>35</span>
        <span className="ml-2 rounded-full border border-line-2 px-2.5 py-0.5 text-[14px] text-ink-2">Low → Medium</span>
      </div>
    </div>
  );
}


const FAQ = [
  { title: 'Where does it sit in the banking journey?', body: 'From login to payment. The SDK in your mobile app and internet banking scores each session as it happens, and your channel applies the decision: allow, step-up or hold.' },
  { title: 'Do you read what customers type?', body: 'No. The SDK measures how the device is used, such as timing, pressure and movement, never the characters typed.' },
  { title: 'Will genuine customers feel it?', body: 'Less than today. Genuine customers see fewer OTPs; step-up and holds appear only where the risk is real.' },
  { title: 'How are scams caught when the real customer is paying?', body: 'Scam signals look at what surrounds the payment: a call in progress, a pasted account number, hesitation, a new payee, an unusual amount, a remark like “KYC update”. Each adds points to a scam risk score, with the reason shown to the analyst.' },
  { title: 'Can we try it before it affects customers?', body: 'Yes. Transaction intelligence can run in shadow mode, scoring payments alongside your current controls before any decision goes live.' },
  { title: 'How does it fit RBI’s 2025 authentication directions?', body: 'The directions allow risk-based checks on user behaviour, device attributes and transaction history, and accept software tokens as a factor. Behavioural and device signals and silent TOTP are built for exactly that, and every decision is explained and logged for audit.' },
  { title: 'What data does the SDK collect?', body: 'How the device is used, such as timing, pressure and movement, plus device and session signals. Never the characters typed, so customer data stays minimal under the DPDP Act.' },
  { title: 'Is it phishing-resistant?', body: 'The silent TOTP is bound to the customer’s registered device and verified over an encrypted channel, so there is no code to phish, forward or intercept through a SIM swap.' },
];

export default function Fraud() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'Identity Fraud Prevention', path: p.path }]} />
      <Hero glance={[['Protects', 'Mobile banking, internet banking and UPI'], ['Stops', 'Account takeover, payment scams and mule accounts'], ['Deploys', 'An SDK in your app and on your web channel'], ['Shows', 'Every decision in under 80 ms, with its reason']]} acc="adap" crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'Identity Fraud Prevention' }]} eyebrow="adapID AI · Identity Fraud Prevention"
        title={<>Stop takeover, scams and mule payments before money moves.</>}
        lead="One SDK reads the customer, the device and the payment together, and decides in under 80 ms, with a reason you can show the regulator."
        note="Mobile banking, internet banking and UPI. Built for RBI's 2025 authentication directions.">
        <HeroPhoto />
      </Hero>


      <section className="sec" aria-labelledby="gap-h">
        <div className="wrap">
          <SectionHead align="left" id="gap-h" acc={A} eyebrow="What is different" title="Rules judge the payment. adapID judges the person making it." lead="Four questions to ask of any fraud stack." />
          <div className="mt-12"><Versus /></div>
        </div>
      </section>

      <PhotoFeature id="pf-h" acc="adap" eyebrow="At the moment of payment" title="The customer pays. adapID checks who is really paying." lead="Behaviour, device and payee, judged together." img="/img/photos/p-payment.webp" panel={<Zoom><FraudQueue /></Zoom>} points={[
          ['Fingerprint', 'Behaviour, not passwords', 'Typing and touch, never content.'],
          ['Phone', 'Scam signals', 'A live call, a pasted account.'],
          ['Bank', 'Mule payees', 'Flagged before money lands.'],
        ]} />


      <section className="stage sec" aria-labelledby="mob-h">
        <div className="wrap">
          <SectionHead align="left" id="mob-h" acc={A} eyebrow="Mobile banking" title="Five layers of protection in one mobile SDK." lead="More protection. Less friction for genuine customers." />
          <div className="mt-12"><MobileCaps /></div>
        </div>
      </section>

      <section className="sec" aria-labelledby="web-h">
        <div className="wrap">
          <div>
            <SectionHead align="left" id="web-h" acc={A} eyebrow="Internet banking" title="Phished credentials stop working on internet banking." lead="A stolen password and OTP are no longer enough." />
            <ul className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {WEB.map((w, i) => (
                <Reveal as="li" key={w.h} delay={i * 70} className="flex gap-4">
                  <span className="ico grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ '--acc': A }}><Icon name={w.icon} size={20} /></span>
                  <span><span className="block text-[18px] font-semibold tracking-[-0.015em]">{w.h}</span><span className="mt-1 block text-[16px] leading-relaxed text-ink-2">{w.p}</span></span>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="txn-h">
        <div className="wrap">
          <SectionHead align="left" id="txn-h" acc={A} eyebrow="Transaction intelligence" title="Each payment looks normal. The pattern does not." lead="Every payment compared with the customer’s history, their peers and everyone paying the same payee." />
          <div className="mt-12"><Points items={TXN} acc="adap" cols={4} /></div>
          <div className="mt-16 max-w-[720px]">
            <Reveal>
              <p className="eyebrow" style={{ '--acc': A }}>Mule payees</p>
              <h3 className="t-h2 mt-6">Check the payee before the money lands.</h3>
              <p className="t-lead mt-5">Every receiving account profiled. A likely mule flagged at the moment of payment.</p>
              <Link to="/blogs/india-mule-account-crisis" className="link mt-8" style={{ '--acc': A }}>Read the blog<Icon name="ArrowRight" size={14} weight="bold" /></Link>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="case-h">
        <div className="wrap grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div>
            <SectionHead align="left" id="case-h" acc={A} eyebrow="Cases and explanations" title="Every hold arrives as a case, with its reasons." lead="Your analysts, the customer and the regulator see the same plain-words reason." />
            <ol className="mt-10 grid gap-3 sm:grid-cols-3">
              {CASE.map(([h, t], i) => (
                <Reveal as="li" key={h} delay={i * 80} className="border-t-2 pt-4" style={{ borderColor: i === 0 ? A : 'var(--color-line-2)' }}>
                  <span className="block text-[16px] font-semibold">{h}</span><span className="mt-1 block text-[14px] text-ink-3">{t}</span>
                </Reveal>
              ))}
            </ol>
          </div>
          <Reveal><Explanation /></Reveal>
        </div>
      </section>


      <Benefits title="Less friction for genuine customers" lead="Strong where risk is high, invisible where it is not." items={[
          ['watch', 'Risk-based step-up', 'Genuine customers pass without an extra step; a risky session or payment is asked for more.'],
          ['route', 'Phishing-resistant by design', 'A silent, device-bound factor replaces SMS OTPs that can be phished or forwarded.'],
          ['hub', 'Device and behaviour together', 'Device integrity, behaviour and the payment are judged together, in under 80 ms.'],
        ]} />
      <Rollout acc="adap" lead="Shadow mode first. No customer impact until you approve." steps={[
          { when: 'Weeks 1–2', h: 'Shadow mode', p: 'Every session scored beside your current controls.' },
          { when: 'Weeks 3–4', h: 'Tune', p: 'Thresholds set against your confirmed fraud.' },
          { when: 'Go live', h: 'Decide in the channel', p: 'Allow, step up or hold in under 80 ms.' },
        ]} />
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} />
      <CtaBand related={[LINKS.cirm, LINKS.zenstra, LINKS.icms]} accent="adap" title={p.cta.title} body={p.cta.body} />
    </>
  );
}
