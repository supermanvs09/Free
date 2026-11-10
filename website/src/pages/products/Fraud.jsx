import { useState } from 'react';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { trail } from '../../data/ia.js';
import { Button, Icon, Reveal, SectionHead, Tabs } from '../../components/ui.jsx';
import { Badge, CtaBand, Faq, FeatureCard, PageHero, ProductLabel, ResearchCards, Section, StatTile, SubNav, SampleNote } from '../../components/ds.jsx';
import FraudJourney from '../../components/demos/FraudJourney.jsx';

const p = PRODUCTS.fraud;

const MOBILE = [
  { tab: 'Behavioural biometrics', icon: 'Fingerprint', gap: 'A fraudster with the customer’s password and OTP looks exactly like the customer.',
    how: ['The SDK measures how the customer types, taps, holds and moves the phone, never what they type.', 'It learns each customer’s own normal from their first sessions.', 'Every new session is compared with that profile, and a 0 to 100 risk score comes back in real time, with the reasons.'],
    result: 'Account takeover is caught even when the password and OTP are correct, with no extra step for genuine customers.' },
  { tab: 'Silent TOTP', icon: 'Key', gap: 'SMS OTPs are phished, forwarded by malware and stolen through SIM swaps.',
    how: ['The customer’s phone is registered and bound to the account once.', 'A one-time code is generated silently on that phone.', 'The platform verifies the code over an encrypted channel.'],
    result: 'No SMS to intercept, and nothing for the customer to type.' },
  { tab: 'Face verification', icon: 'UserCircle', gap: 'High-risk actions need proof that the real customer is present.',
    how: ['Face verification runs only at high-risk moments, such as a new device or a large payment.', 'Every attempt is logged with the session.'],
    result: 'Strong proof of presence, only when it matters.' },
  { tab: 'Device security', icon: 'DeviceMobile', gap: 'Fraudsters watch or control the customer’s phone through malware and remote-access apps.',
    how: ['The app checks the device continuously during the session.', 'It detects remote control (screen sharing, overlays), malware (banking trojans, SMS forwarders), tampering (rooting, hooking, cloned apps) and fake devices (emulators, failed attestation).', 'The bank’s policy decides the response: log, warn or block.'],
    result: 'The banking session runs only on a safe device.' },
  { tab: 'Scam signals', icon: 'Phone', gap: 'In a payment scam the real customer is paying, coached by a fraudster on the phone. Identity checks pass.',
    how: ['Evidence is collected around the payment: behaviour (bursts of typing, long pauses), device (a call during the payment, a pasted account number), security (remote access, mule lists, SIM swap) and history (an unusual amount, a new payee).', 'Each piece adds points by how strongly it points to a scam, giving a scam risk score from 0 to 100.', 'The analyst sees the suspected scam type and why every point was added.'],
    result: 'Scams are stopped before the money leaves, with a clear reason for every hold.' },
];
function Capabilities() {
  const [i, setI] = useState(0);
  const m = MOBILE[i];
  return (
    <div>
      <Tabs variant="u" items={MOBILE.map((x) => x.tab)} value={i} onChange={setI} label="Capabilities" ids={MOBILE.map((_, k) => `cap-t${k}`)} />
      <div key={i} role="tabpanel" aria-labelledby={`cap-t${i}`} className="fadein mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="card-flat p-6">
          <span className="ptile" style={{ '--acc': 'var(--color-adap)' }}><Icon name={m.icon} size={20} /></span>
          <p className="mt-5 app-label">The gap</p>
          <p className="mt-2 t-h4">{m.gap}</p>
        </div>
        <div className="card p-6">
          <p className="app-label">How it works</p>
          <ol className="mt-3 space-y-3">{m.how.map((h, k) => <li key={h} className="flex gap-3 t-body"><span className="num mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand">{k + 1}</span>{h}</li>)}</ol>
          <p className="mt-5 flex gap-2 border-t border-line pt-4 text-[15px] font-semibold text-ink"><Icon name="CheckCircle" size={18} weight="fill" className="mt-0.5 shrink-0 text-ok" />{m.result}</p>
        </div>
      </div>
    </div>
  );
}

const CASE = [['Alert', 'A held payment or a risky login, with its score and reasons'], ['Case', 'Created automatically, owner assigned by queue'], ['Review', 'The analyst calls the customer and records the decision and why'], ['Resolve', 'Released, blocked or escalated to L2 and L3, with a deadline'], ['Report', 'Every alert has an owner, a decision and a record']];
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
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: p.name, path: p.path }]} />
      <PageHero crumbs={trail(p.path)} mark={<ProductLabel p="adapid" name="Identity Fraud Prevention" sub="adapID AI · for mobile and internet banking" />}
        title="Stop fraud before the money moves."
        lead="adapID recognises the customer, not just the password: how they type, tap and hold the phone, the device they use and what surrounds each payment. Account takeover, payment scams and mule accounts are stopped at the payee, with a reason for every decision."
        actions={<><Button to="/request-demo?product=adapid" size="lg" arrow>Book a fraud signals session</Button><Button href="#journey" variant="secondary" size="lg">Watch a payment</Button></>}
        media={(
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile v="₹36,014 Cr" l="involved in bank frauds reported in India in 2024–25" s="RBI Annual Report, 2024–25" />
            <StatTile {...p.stats[0]} />
            <div className="card flex items-center gap-4 p-5 sm:col-span-2">
              <span className="ptile"><Icon name="Lightning" size={20} /></span>
              <p className="t-body"><span className="font-semibold text-ink">Decisions in under 80 ms</span> at every login, payee and payment (Deep Algorithms benchmark).</p>
            </div>
          </div>
        )} />
      <SubNav title="Fraud Prevention" items={[['journey', 'A payment'], ['capabilities', 'Capabilities'], ['web', 'Internet banking'], ['mules', 'Mule accounts'], ['cases', 'Case management'], ['faq', 'FAQ']]} />

      <Section id="journey" labelledby="jr-h">
        <SectionHead id="jr-h" eyebrow="A payment, step by step" title="The same customer. The same app. Two very different payments." lead="Switch between a genuine payment and a payment made during a scam call, and watch what adapID reads at each step, before the customer taps Pay." />
        <Reveal className="mt-10"><FraudJourney /><SampleNote /></Reveal>
      </Section>

      <Section id="capabilities" labelledby="cap-h" tone="subtle">
        <SectionHead id="cap-h" eyebrow="Inside the app" title="Five capabilities in one SDK." lead="From the first tap to the last payment, in your mobile app." />
        <Reveal className="mt-10"><Capabilities /></Reveal>
      </Section>

      <Section id="web" labelledby="web-h">
        <SectionHead id="web-h" eyebrow="Internet banking" title="Stolen credentials alone are not enough." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <FeatureCard icon="CursorClick" acc="var(--color-adap)" title="Behavioural biometrics on the web">Internet banking credentials are the most phished in banking. The web SDK learns each customer’s typing and mouse behaviour and scores every login against it.</FeatureCard>
          <FeatureCard icon="ShieldCheck" acc="var(--color-adap)" title="Risk-based step-up">Below the bank’s threshold the customer continues with no OTP; above it, a step-up check, logged for review. The bank sets the thresholds.</FeatureCard>
          <FeatureCard icon="Desktop" acc="var(--color-adap)" title="Trusted devices">Device-based authentication replaces the password. There is no password to phish, reuse or forget.</FeatureCard>
        </div>
      </Section>

      <Section id="mules" labelledby="mule-h" tone="subtle">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16">
          <div>
            <SectionHead id="mule-h" eyebrow="India’s mule account crisis" title="Stop the mule at the payee, not after the money is gone." lead="Each payment can look normal; the pattern does not. Payees are scored on account age, inbound senders and how fast money leaves, and fraudulent payments are flagged with the reason why." />
            <div className="mt-8 grid gap-4 sm:grid-cols-2"><StatTile {...p.stats[0]} /><StatTile {...p.stats[1]} /></div>
          </div>
          <Reveal className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3"><p className="text-[14.5px] font-semibold text-ink">Payee check · R K TRADERS ••4410</p><Badge tone="crit" dot>Mule risk 91</Badge></div>
            <ul className="divide-y divide-line">
              {[['Account opened', '9 days ago', 'crit'], ['Inbound senders today', '13, from 6 banks', 'crit'], ['Money out', '92% within 30 minutes, to 4 accounts and a wallet', 'crit'], ['Remarks on inbound payments', '“KYC fee”, “refund”, “verification”', 'hold'], ['Payer’s history with payee', 'None', 'warn']].map(([k, v, t]) => (
                <li key={k} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"><span className="w-full shrink-0 text-[13.5px] text-ink-3 sm:w-[170px]">{k}</span><span className="flex-1 text-[13.5px] font-medium text-ink">{v}</span><Badge tone={t} dot>{t === 'crit' ? 'Risk' : t === 'hold' ? 'High' : 'Unusual'}</Badge></li>
              ))}
            </ul>
            <p className="border-t border-line bg-bg-1 px-4 py-2.5 t-caption">Sample data</p>
          </Reveal>
        </div>
      </Section>

      <Section id="cases" labelledby="case-h">
        <SectionHead id="case-h" eyebrow="Case management" title="Every alert has an owner, a decision and a record." />
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CASE.map(([t, b], i) => <Reveal as="li" key={t} delay={i * 40} className="card p-5"><span className="num text-[13px] font-semibold text-brand">0{i + 1}</span><p className="mt-2 t-h4">{t}</p><p className="mt-1.5 t-small">{b}</p></Reveal>)}
        </ol>
      </Section>

      <Faq items={FAQ} title="Questions about Fraud Prevention" />
      <ResearchCards slugs={p.research} title="Research on financial crime" />
      <CtaBand title={p.cta.title} body={p.cta.body} primary={{ label: 'Book a fraud signals session', to: '/request-demo?product=adapid' }} />
    </>
  );
}
