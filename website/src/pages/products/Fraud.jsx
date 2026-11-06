import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, Tabs } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import { Hero, Stats, Faq, Points, LINKS, ACC } from '../../components/ProductKit.jsx';
import { CapabilityPhone, MuleCheck, WebStepUp } from '../../components/viz/fraud.jsx';
import SessionJourney from '../../components/viz/journey.jsx';
import { FraudGate } from '../../components/viz/fraudgate.jsx';

/* Identity Fraud Prevention: one platform for mobile and internet banking, from
   login to payment. The page follows the platform's own logic: three questions
   in every session, the capabilities that answer them, and the explanation that
   comes with every decision. */

const p = PRODUCTS.fraud;
const A = ACC.adap;

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
          <p className="flex items-start gap-2.5 border-t border-line px-6 py-5 text-[15.5px] leading-snug text-ink-3 md:bg-[color-mix(in_oklab,var(--color-crit)_4%,var(--color-bg-1))]"><Icon name="X" size={15} weight="bold" className="mt-[3px] shrink-0 text-crit" />{them}</p>
          <p className="flex items-start gap-2.5 border-t border-line px-6 py-5 text-[15.5px] font-medium leading-snug text-ink md:bg-[color-mix(in_oklab,var(--color-adap)_7%,#fff)]"><Icon name="CheckCircle" size={17} weight="fill" className="mt-[2px] shrink-0" style={{ color: A }} />{us}</p>
        </Reveal>
      ))}
    </div>
  );
}

/* mobile banking: one phone, five capabilities */
const MOBILE = [
  { key: 'biometrics', tab: 'Behavioural biometrics', gap: 'A fraudster with the customer’s password and OTP looks exactly like the customer.',
    how: ['Our SDK measures how the customer types, taps, holds and moves the phone, never what they type.', 'It learns each customer’s own normal from their first sessions.', 'Every new session is compared with that profile, and a risk score from 0 to 100 comes back in real time, with the reasons.'],
    result: 'Account takeover is caught even when the password and OTP are correct, with no extra step for genuine customers.' },
  { key: 'totp', tab: 'Silent TOTP', gap: 'SMS OTPs are phished, forwarded by malware and stolen through SIM swaps.',
    how: ['The customer’s phone is registered and bound to the account once.', 'A one-time code is generated silently on that phone.', 'The platform verifies the code over an encrypted channel.'],
    result: 'No SMS to intercept, and nothing for the customer to type.' },
  { key: 'face', tab: 'Face verification', gap: 'High-risk actions need proof that the real customer is present.',
    how: ['Face verification runs only at high-risk moments, such as a new device or a large payment.', 'Every attempt is logged with the session.'],
    result: 'Strong proof of presence, only when it matters.' },
  { key: 'rasp', tab: 'Device security', gap: 'Fraudsters watch or control the customer’s phone through malware and remote-access apps.',
    how: ['The app checks the device continuously during the session.', 'It detects remote control (screen sharing, overlays), malware (banking trojans, SMS forwarders), tampering (rooting, hooking, cloned apps) and fake devices (emulators, failed attestation).', 'The bank’s policy decides the response: log, warn or block.'],
    result: 'The banking session runs only on a safe device.' },
  { key: 'scam', tab: 'Scam signals', gap: 'In a payment scam the real customer is paying, coached by a fraudster on the phone. Identity checks pass.',
    how: ['We collect evidence around the payment: behaviour (bursts of typing, long pauses), device (a call during the payment, a pasted account number), security (remote access, mule lists, SIM swap) and history (an unusual amount, a new payee).', 'Each piece adds points by how strongly it points to a scam, giving a scam risk score from 0 to 100.', 'The analyst sees the suspected scam type and why every point was added.'],
    result: 'Scams are stopped before the money leaves, with a clear reason for every hold.' },
];

function MobileCaps() {
  const [i, setI] = useState(0);
  const m = MOBILE[i];
  return (
    <div>
      <Tabs items={MOBILE.map((x) => x.tab)} value={i} onChange={setI} acc={A} label="Mobile banking capabilities" />
      <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
        <div key={m.key} className="fadein">
          <p className="text-[13px] font-semibold uppercase tracking-[.08em] text-adap">The gap</p>
          <p className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.02em] md:text-[24px]">{m.gap}</p>
          <p className="mt-7 text-[13px] font-semibold uppercase tracking-[.08em] text-ink-3">How we solve it</p>
          <ol className="mt-3 space-y-3">{m.how.map((h, k) => <li key={k} className="flex gap-3 text-[15.5px] leading-relaxed text-ink-2"><span className="num mt-[2px] grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-2 text-[12px] font-semibold">{k + 1}</span>{h}</li>)}</ol>
          <p className="mt-7 flex items-start gap-3 rounded-[16px] border border-line p-4 text-[15.5px] leading-relaxed"><Icon name="CheckCircle" size={20} className="mt-[2px] shrink-0 text-ok" /><span><span className="font-semibold">Result. </span><span className="text-ink-2">{m.result}</span></span></p>
        </div>
        <div className="mx-auto w-full max-w-[560px]"><CapabilityPhone cap={m.key} /></div>
      </div>
    </div>
  );
}

const WEB = [
  { icon: 'CursorClick', h: 'Behavioural biometrics on the web', p: 'Internet banking credentials are the most phished in banking. Our web SDK learns each customer’s typing and mouse behaviour and scores every login against it, so stolen credentials alone are not enough.' },
  { icon: 'Gauge', h: 'Risk-based step-up and trusted devices', p: 'Below the bank’s threshold the customer continues with no OTP; above it, a step-up check, logged for review. The bank sets the thresholds for desktop and mobile web, the extra factors and each customer’s trusted devices.' },
  { icon: 'Key', h: 'Passwordless login', p: 'Device-based authentication replaces the password. No password to phish, reuse or forget.' },
];

const TXN = [
  { icon: 'Pulse', h: 'Anomaly detection', p: 'Each payment compared with the customer’s own past, with similar customers, and with everyone paying the same payee.' },
  { icon: 'Bank', h: 'Beneficiary profiling', p: 'Every receiving account profiled, and likely mules flagged before the money arrives.' },
  { icon: 'ChatCircleText', h: 'Remark analysis', p: 'The payment note read for scam purposes such as “KYC update” or “refund”.' },
  { icon: 'UserCircle', h: 'New-customer scoring', p: 'Customers with little history protected by comparing them with their peers.' },
];

const CASE = [
  ['Alert', 'A held payment or a risky login'],
  ['Case created', 'With the score and every reason attached'],
  ['Analyst reviews', 'Calls the customer, decides, records why'],
];

function CaseFlow() {
  return (
    <ol className="relative space-y-3">
      {CASE.map(([h, s], i) => (
        <Reveal as="li" key={h} delay={i * 70} className="card flex items-center gap-4 p-4">
          <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-full text-[14px] font-semibold" style={{ background: `color-mix(in oklab, ${A} 14%, transparent)`, color: A }}>{i + 1}</span>
          <span><span className="block text-[16px] font-semibold">{h}</span><span className="block text-[14px] text-ink-3">{s}</span></span>
        </Reveal>
      ))}
      <Reveal as="li" delay={220} className="grid gap-3 sm:grid-cols-2">
        <span className="card flex items-start gap-3 p-4"><Icon name="CheckCircle" size={20} className="mt-[2px] shrink-0 text-ok" /><span><span className="block text-[15px] font-semibold">Resolved in time</span><span className="block text-[13.5px] text-ink-3">Closed with the decision on record</span></span></span>
        <span className="card flex items-start gap-3 p-4"><Icon name="ArrowUpRight" size={20} className="mt-[2px] shrink-0 text-warn" /><span><span className="block text-[15px] font-semibold">Not resolved in time</span><span className="block text-[13.5px] text-ink-3">Escalated to L2, then L3, then closed</span></span></span>
      </Reveal>
      <Reveal as="li" delay={280} className="card flex items-center gap-4 p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2" style={{ background: 'color-mix(in oklab, var(--color-fg) 6%, transparent)' }}><Icon name="FileText" size={18} /></span>
        <span><span className="block text-[16px] font-semibold">Reports</span><span className="block text-[14px] text-ink-3">Every alert with an owner, a decision and a record</span></span>
      </Reveal>
    </ol>
  );
}

function Explanation() {
  return (
    <div className="overflow-hidden rounded-[24px] border border-line bg-bg-1 p-7 shadow-[0_40px_80px_-60px_rgb(11_42_82/.4)] md:p-9">
      <p className="text-[12.5px] font-semibold uppercase tracking-[.1em] text-ink-3">One reason, as the analyst sees it</p>
      <div className="mt-6 flex items-start justify-between gap-6">
        <p className="text-[22px] font-semibold leading-snug tracking-[-0.02em] text-ink md:text-[26px]">Phone call during the payment</p>
        <span className="shrink-0 rounded-full px-3 py-1 text-[16px] font-semibold num" style={{ background: '#fff4e0', color: '#a86400' }}>+9 points</span>
      </div>
      <p className="mt-4 text-[16px] leading-relaxed text-ink-2">Seen about 7.5× more often in scams than in genuine sessions.</p>
      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-line pt-6 text-[15px]">
        <span className="text-ink-3">Score</span><span className="num font-semibold text-ink">26</span><Icon name="ArrowRight" size={14} className="text-ink-3" /><span className="num font-semibold" style={{ color: '#a86400' }}>35</span>
        <span className="ml-2 rounded-full border border-line-2 px-2.5 py-0.5 text-[13px] text-ink-2">Low → Medium</span>
      </div>
      <p className="mt-6 text-[14.5px] leading-relaxed text-ink-3">The bank can explain every decision to the customer, to management and to regulators.</p>
    </div>
  );
}


const FAQ = [
  { title: 'Where does it sit in the banking journey?', body: 'From login to payment. The SDK in your mobile app and internet banking scores each session as it happens, and your channel applies the decision: allow, step-up or hold.' },
  { title: 'Do you read what customers type?', body: 'No. The SDK measures how the device is used, such as timing, pressure and movement, never the characters typed.' },
  { title: 'Will genuine customers feel it?', body: 'Less than today. Genuine customers see fewer OTPs; step-up and holds appear only where the risk is real.' },
  { title: 'How are scams caught when the real customer is paying?', body: 'Scam signals look at what surrounds the payment: a call in progress, a pasted account number, hesitation, a new payee, an unusual amount, a remark like “KYC update”. Each adds points to a scam risk score, with the reason shown to the analyst.' },
  { title: 'Can we try it before it affects customers?', body: 'Yes. Transaction intelligence can run in shadow mode, scoring payments alongside your current controls before any decision goes live.' },
  { title: 'Is it aligned with RBI expectations?', body: 'It supports RBI digital payment security and authentication expectations, and every decision is explainable and logged for audit.' },
];

export default function Fraud() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'Identity Fraud Prevention', path: p.path }]} />
      <Hero glance={[['Protects', 'Mobile banking, internet banking and UPI'], ['Stops', 'Account takeover, payment scams and mule accounts'], ['Deploys', 'An SDK in your app and on your web channel'], ['Shows', 'Every decision in under 80 ms, with its reason']]} acc="adap" crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'Identity Fraud Prevention' }]} eyebrow="adapID AI · Identity Fraud Prevention"
        title={<>Stop fraud <span style={{ color: 'var(--acc)' }}>before the money moves.</span></>}
        layout="stack"
        lead="adapID reads how each customer types, taps, holds the phone and moves the mouse, from the moment they open the app to the moment they pay. When the session is not them, or not their decision, the money stays put."
        note="Mobile banking, internet banking and UPI. One SDK, decisions in under 80 ms.">
        <SessionJourney />
      </Hero>

      <section className="sec" aria-labelledby="q-h">
        <div className="wrap">
          <SectionHead id="q-h" acc={A} eyebrow="Unified fraud prevention" title="Three checks. One decision." lead="Every session is read three times over. A fraudster has to get past all three; a genuine customer never feels any of them." />
          <Reveal className="mx-auto mt-14 max-w-[840px]"><FraudGate /></Reveal>
        </div>
      </section>

      {/* the stakes, in figures (Anita's story is told just above; the mule figures come with the mule section) */}
      <Stats acc="adap" items={[{ v: '₹36,014 Cr', l: 'involved in bank frauds reported in India in 2024–25', s: 'RBI Annual Report, 2024–25' }, p.stats[2], { v: '1 in 1', l: 'decisions with a reason an analyst and an auditor can read', s: 'adapID AI' }]} />

      <section className="sec" aria-labelledby="gap-h">
        <div className="wrap">
          <SectionHead align="left" id="gap-h" acc={A} eyebrow="What is different" title="Where fraud tools stop, adapID keeps going." lead="Four things to compare with what you run today." />
          <div className="mt-12"><Versus /></div>
        </div>
      </section>

      <section className="stage sec" aria-labelledby="mob-h">
        <div className="wrap">
          <SectionHead align="left" id="mob-h" acc={A} eyebrow="Mobile banking" title="Inside the app, from the first tap to the last payment." lead="Five capabilities in one SDK. Pick one to see what the customer sees, and what the bank sees." />
          <div className="mt-12"><MobileCaps /></div>
        </div>
      </section>

      <section className="sec" aria-labelledby="web-h">
        <div className="wrap grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <div>
            <SectionHead align="left" id="web-h" acc={A} eyebrow="Internet banking" title="Stolen credentials alone are not enough." />
            <ul className="mt-10 space-y-6">
              {WEB.map((w, i) => (
                <Reveal as="li" key={w.h} delay={i * 70} className="flex gap-4">
                  <span className="ico grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ '--acc': A }}><Icon name={w.icon} size={20} /></span>
                  <span><span className="block text-[18px] font-semibold tracking-[-0.015em]">{w.h}</span><span className="mt-1 block text-[15.5px] leading-relaxed text-ink-2">{w.p}</span></span>
                </Reveal>
              ))}
            </ul>
          </div>
          <Reveal up className="mx-auto w-full max-w-[540px]"><WebStepUp /></Reveal>
        </div>
      </section>

      <section className="sec" aria-labelledby="txn-h">
        <div className="wrap">
          <SectionHead align="left" id="txn-h" acc={A} eyebrow="Transaction intelligence" title="Each payment looks normal. The pattern does not." lead="In mobile and internet banking, fraudulent payments and mule accounts hide in ordinary traffic. Each is flagged with the reason why, and the models can run in shadow mode before going live." />
          <div className="mt-12"><Points items={TXN} acc="adap" cols={4} /></div>
          <div className="mt-16 grid items-center gap-12 lg:grid-cols-[.78fr_1.22fr] lg:gap-16">
            <Reveal>
              <p className="eyebrow" style={{ '--acc': A }}>India’s mule account crisis</p>
              <h3 className="t-h2 mt-6">Stop the mule at the payee, not after the money is gone.</h3>
              <div className="mt-8 grid grid-cols-2 gap-4">
                {p.stats.slice(0, 2).map((s) => (
                  <div key={s.v} className="card p-5">
                    <p className="whitespace-nowrap text-[clamp(24px,6.4vw,32px)] font-semibold tracking-[-0.04em] text-[#0a6dbb] num">{s.v}</p>
                    <p className="mt-2 text-[14px] leading-snug text-ink-2">{s.l}</p>
                    <p className="mt-3 text-[12px] text-ink-3">Source: {s.s}</p>
                  </div>
                ))}
              </div>
              <Link to="/blogs/india-mule-account-crisis" className="link mt-8" style={{ '--acc': A }}>Read the blog<Icon name="ArrowRight" size={14} weight="bold" /></Link>
            </Reveal>
            <Reveal delay={120}><MuleCheck /><p className="mt-3 text-[12.5px] text-ink-3">An example payee check. Names and numbers are illustrations.</p></Reveal>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="case-h">
        <div className="wrap grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHead align="left" id="case-h" acc={A} eyebrow="Case management" title="Every alert has an owner, a decision and a record." />
            <div className="mt-10"><CaseFlow /></div>
          </div>
          <div>
            <SectionHead align="left" id="exp-h" acc={A} eyebrow="Explainable by design" title="Every score comes with its reasons." />
            <Reveal className="mt-10"><Explanation /></Reveal>
          </div>
        </div>
      </section>


      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} />
      <CtaBand related={[LINKS.cirm, LINKS.zenstra, LINKS.icms]} accent="adap" title={p.cta.title} body={p.cta.body} />
    </>
  );
}
