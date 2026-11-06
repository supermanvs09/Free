import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SITE, CERTS } from '../data/site.js';
import { PLATFORMS, INDUSTRIES } from '../data/ia.js';
import { NEWS } from '../data/company.js';
import { Button, Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { ArrowLink, CtaBand, Faq, LogoWall, ResearchCards, Section, Stepper, DemoControls } from '../components/ds.jsx';
import ProductMark from '../components/ProductMark.jsx';
import HomeConsole from '../components/demos/HomeConsole.jsx';
import Architecture from '../components/demos/Architecture.jsx';
import { useSteps } from '../lib/useSteps.js';

const FAQ = [
  { title: 'What does Deep Algorithms do?', body: 'We secure the identities attackers use to get in: people, machine identities and AI agents. adapID AI covers people, cloud identities, Active Directory and banking fraud. Zenstra AI covers AI agents. ICMS covers personal data and DPDPA compliance.' },
  { title: 'Which product should we start with?', body: 'Start with the risk that costs you most today; each product runs on its own. Agents acting on your systems: Zenstra AI. Logins, cloud keys, Active Directory or fraud: adapID AI. Personal data and DPDPA: ICMS.' },
  { title: 'Do we have to move our data?', body: 'No. adapID AI uses read-only connectors and one read-only role per AWS account, Zenstra AI runs as a gateway inside your VPC, and ICMS connects to the stores that already hold personal data.' },
  { title: 'Do you map to Indian regulation?', body: 'Yes. Evidence is mapped to the DPDP Act 2023 and the DPDP Rules 2025, and to RBI and SEBI expectations, from the start rather than added for an audit.' },
  { title: 'What happens in a demo?', body: 'A 30-minute session with a Deep Algorithms engineer, on your own environment where you want it, with your own questions. For AWS, you can connect a sandbox account with a read-only role and walk through the results together.' },
];

const PROBLEMS = [
  { icon: 'Key', title: 'Stolen credentials look like your people', body: 'A phished password and an approved MFA prompt pass every login check. What changes is behaviour, and that is what we score.', v: '₹25.5 Cr', l: 'average cost of a data breach in India in 2026', s: 'IBM Cost of a Data Breach Report, 2026', to: '/adapid-ai/continuous-identity-risk-management', p: 'Continuous Identity Risk Management' },
  { icon: 'Cloud', title: 'Machine identities outnumber people', body: 'Service accounts, keys and cloud roles hold broad access that nobody reviews, and they never take a holiday.', v: '82:1', l: 'machine identities for every human identity', s: 'CyberArk Identity Security Landscape, 2025', to: '/adapid-ai/nhi-security', p: 'NHI Security for AWS' },
  { icon: 'Wallet', title: 'Money moves through mule accounts', body: 'Scam payments are made by the real customer, on their own phone, to accounts opened days earlier.', v: '26.5 lakh+', l: 'mule accounts identified by I4C as of December 2025', s: 'I4C, via Deep Algorithms research', to: '/adapid-ai/fraud-prevention', p: 'Identity Fraud Prevention' },
  { icon: 'Robot', title: 'AI agents act with real access', body: 'Agents read documents, call APIs and move data with valid tokens. A valid token is not a valid reason.', v: '40%+', l: 'of agentic AI projects expected to be cancelled by 2027, often for weak risk controls', s: 'Gartner, June 2025', to: '/agentic-ai/agentic-identity', p: 'Zenstra AI' },
];

const HOW = [
  ['Connect, read-only', 'Connectors to your identity providers, cloud, SaaS and apps. One read-only role per AWS account. Nothing to install on endpoints.', 'Plug'],
  ['Learn each normal', 'A behaviour baseline for every person, machine identity, customer and agent: where, when, how and what it usually touches.', 'Fingerprint'],
  ['Score every event', 'Each sign-in, API call, payment or tool call is scored against that baseline and your policy, in milliseconds, with the reasons attached.', 'Gauge'],
  ['Act and record', 'Allow, step up, hold or block through the tools you already run, and keep a record your auditors and regulators can read.', 'ClipboardText'],
];

function HowItWorks() {
  const s = useSteps(HOW.length, { ms: 3600 });
  const [t, b, ic] = HOW[s.i];
  return (
    <div ref={s.ref}>
      <Stepper steps={HOW.map((h) => h[0])} s={s} label="How it works" className="max-md:!grid-cols-2 max-md:gap-y-5" />
      <div className="mt-8 grid items-center gap-6 rounded-[14px] border border-line bg-white p-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:p-8" aria-live="polite">
        <span className="ptile !h-14 !w-14 !rounded-[14px]"><Icon name={ic} size={28} /></span>
        <div key={t} className="fadein">
          <p className="t-h3">{t}</p>
          <p className="mt-2 t-body measure">{b}</p>
        </div>
        <DemoControls s={s} n={HOW.length} label={`${s.i + 1} of ${HOW.length}`} />
      </div>
    </div>
  );
}

const HIGHLIGHTS = [
  { kind: 'Recognition', title: 'Cybersecurity Excellence', meta: 'Data Security Council of India, 2025', to: '/about-us#recognition' },
  { kind: 'Recognition', title: 'Business Excellence Award', meta: 'Best Cybersecurity Solutions Provider, 2025', to: '/about-us#recognition' },
  { kind: 'Patent', title: 'Multi-domain fraud detection', meta: 'Patent No. 602726, granted October 2026', href: NEWS.find((n) => n.kind === 'Patent')?.href },
  { kind: 'Funding', title: '₹16 crore pre-Series A', meta: 'Led by Unicorn India Ventures, April 2026', href: NEWS.find((n) => n.kind === 'Funding')?.href },
];

export default function Home() {
  return (
    <>
      <Seo path="/" description={SITE.description} />

      {/* 1. Hero */}
      <section className="relative overflow-hidden border-b border-line bg-[linear-gradient(180deg,#f6f8fb_0%,#fff_70%)]">
        <div className="container grid items-center gap-12 pb-16 pt-12 md:pb-20 md:pt-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)] lg:gap-14 lg:pb-24 lg:pt-20">
          <div className="max-w-[600px]">
            <p className="eyebrow rise">Identity security for the AI era</p>
            <h1 className="t-display rise mt-5">Stop the attack that logs in.</h1>
            <p className="t-lead rise mt-6" style={{ '--d': '60ms' }}>
              Deep Algorithms secures the people, machine identities and AI agents your business runs on. Every identity is scored continuously, every risky action is decided before it completes, and every decision is explained.
            </p>
            <div className="rise mt-8 flex flex-wrap gap-3" style={{ '--d': '120ms' }}>
              <Button to="/request-demo" size="lg" arrow>Book a demo</Button>
              <Button to="/products" variant="secondary" size="lg">Explore products</Button>
            </div>
            <ul className="rise mt-10 grid gap-x-6 gap-y-3 border-t border-line pt-6 sm:grid-cols-3" style={{ '--d': '160ms' }}>
              {[['Built for', 'Banks, government and enterprises'], ['Deploys', 'Read-only, or inside your VPC'], ['Maps to', 'DPDPA, RBI and SEBI']].map(([k, v]) => (
                <li key={k}><p className="t-caption">{k}</p><p className="mt-0.5 text-[14.5px] font-semibold leading-snug text-ink">{v}</p></li>
              ))}
            </ul>
          </div>
          <div className="rise min-w-0" style={{ '--d': '120ms' }}><HomeConsole /></div>
        </div>
      </section>

      {/* 2. Product ecosystem */}
      <Section id="platforms" labelledby="platforms-h">
        <SectionHead id="platforms-h" eyebrow="Products" title="Three platforms. Every identity covered." lead="Each platform runs on its own and starts with the risk that costs you most. Together they share one view of identity risk." />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLATFORMS.map((p, i) => (
            <Reveal key={p.key} delay={i * 60} className="card flex flex-col p-6 md:p-7">
              <div className="flex items-center gap-3">
                <ProductMark p={p.key} size={40} />
                <div><p className="t-h4">{p.name}</p><p className="t-caption">{p.kind}</p></div>
              </div>
              <p className="mt-4 t-body">{p.tagline}.</p>
              <ul className="mt-5 flex-1 divide-y divide-line border-y border-line">
                {(p.key === 'zenstra' ? p.items.slice(0, 4) : p.items).map((it) => (
                  <li key={it.key}>
                    <Link to={it.path} className="group flex items-center gap-3 py-3">
                      <span className="ptile ptile-sm" style={{ '--acc': p.acc }}><Icon name={it.icon} size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-ink group-hover:text-brand">{it.name}</span><span className="block truncate t-caption">{it.desc}</span></span>
                      <Icon name="CaretRight" size={14} className="shrink-0 text-ink-4 group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
              <ArrowLink to={p.path} className="mt-5 text-[15px]">{p.key === 'zenstra' ? 'All six capabilities' : `Explore ${p.name}`}</ArrowLink>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-14">
          <h3 className="t-h4">How they fit into your environment</h3>
          <p className="mt-1 t-small">Read from the sources you already run. Decide in the middle. Act through the tools you already use.</p>
          <div className="mt-6"><Architecture compact /></div>
        </Reveal>
      </Section>

      {/* 3. Problems */}
      <Section id="problems" labelledby="problems-h" tone="subtle">
        <SectionHead id="problems-h" eyebrow="Why it matters" title="Attackers don’t break in. They log in." lead="Most breaches now start with an identity that looks legitimate. Each of these has a product built to catch it." />
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {PROBLEMS.map((p, i) => (
            <Reveal key={p.title} delay={i * 50} className="card grid gap-6 p-6 md:p-7 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="flex flex-col">
                <span className="ptile"><Icon name={p.icon} size={20} /></span>
                <h3 className="mt-5 t-h4">{p.title}</h3>
                <p className="mt-2 t-small !text-ink-2">{p.body}</p>
                <ArrowLink to={p.to} className="mt-auto pt-5 text-[14.5px]">{p.p}</ArrowLink>
              </div>
              <div className="rounded-[10px] bg-bg-1 p-5">
                <p className="t-h2 num !text-brand">{p.v}</p>
                <p className="mt-2 text-[14px] leading-snug text-ink-2">{p.l}</p>
                <p className="mt-3 t-caption">Source: {p.s}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 4. How it works */}
      <Section id="how" labelledby="how-h">
        <SectionHead id="how-h" eyebrow="How it works" title="Continuous, explainable, before the action completes." lead="The same four steps run for an employee’s session, a cloud role, a customer’s payment and an AI agent’s tool call." />
        <div className="mt-12"><HowItWorks /></div>
      </Section>

      {/* 5. Industries */}
      <Section id="industries" labelledby="industries-h" tone="subtle">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead id="industries-h" eyebrow="Industries" title="Built for organisations that cannot afford a breach." />
          <ArrowLink to="/products">Find a product by need</ArrowLink>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRIES.map((x, i) => (
            <Reveal key={x.slug} delay={i * 50}>
              <Link to={x.path} className="card card-link group flex h-full flex-col overflow-hidden">
                <img src={`/img/photos/${x.slug}.webp`} alt="" loading="lazy" decoding="async" width="600" height="400" className="aspect-[3/2] w-full object-cover" />
                <span className="flex flex-1 flex-col p-5">
                  <span className="t-h4 group-hover:text-brand">{x.name}</span>
                  <span className="mt-1.5 t-small">{x.desc}</span>
                  <span className="alink mt-auto pt-4 text-[14px]">See the solution<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 6. Evidence */}
      <Section id="evidence" labelledby="evidence-h">
        <Reveal><LogoWall id="evidence-h" lead="Banks, public institutions, hospitals, research institutes and technology companies across India." /></Reveal>
        <div className="mt-14 grid gap-4 border-t border-line pt-10 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map((h) => {
            const inner = (
              <>
                <p className="app-label">{h.kind}</p>
                <p className="mt-2 t-h4">{h.title}</p>
                <p className="mt-1 t-small">{h.meta}</p>
              </>
            );
            return h.href
              ? <a key={h.title} href={h.href} target="_blank" rel="noreferrer" className="card card-link block p-5">{inner}<span className="sr-only"> (opens in a new tab)</span></a>
              : <Link key={h.title} to={h.to} className="card card-link block p-5">{inner}</Link>;
          })}
        </div>
      </Section>

      {/* 7. Security and compliance */}
      <Section id="trust" labelledby="trust-h" tone="subtle">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
          <SectionHead id="trust-h" eyebrow="Security and compliance" title="Built to be approved by your risk committee." lead="Your data stays where it is, every decision carries its reasons, and the evidence is ready before anyone asks for it." />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['LockKey', 'Your data stays put', 'Read-only connectors; the Zenstra gateway runs inside your VPC. Prompts and payloads do not leave your cloud.'],
              ['ClipboardText', 'Every decision explained', 'Each score and each allow, hold or block is recorded with the policy that produced it.'],
              ['Scales', 'Indian regulation first', 'Evidence mapped to the DPDP Act 2023, the DPDP Rules 2025, RBI and SEBI.'],
              ['Certificate', 'Certifications', `${CERTS.map((c) => c.name).join(', ')}. Certificates available on request.`],
            ].map(([ic, t, b]) => (
              <div key={t} className="card p-5">
                <span className="ptile ptile-sm"><Icon name={ic} size={17} /></span>
                <p className="mt-4 text-[15.5px] font-semibold text-ink">{t}</p>
                <p className="mt-1.5 t-small">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <ResearchCards title="Latest research" />
      <Faq items={FAQ} title="Questions teams ask before a first call" />
      <CtaBand title="Find your riskiest identity before an attacker does." />
    </>
  );
}

