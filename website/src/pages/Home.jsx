import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SITE, CERTS } from '../data/site.js';
import { PLATFORMS, INDUSTRIES } from '../data/ia.js';
import { NEWS } from '../data/company.js';
import { Button, Icon, Reveal, SectionHead, CountUp, cx } from '../components/ui.jsx';
import { ArrowLink, CtaBand, Faq, LogoWall, LogoMarquee, ResearchCards, Section } from '../components/ds.jsx';
import { SplitTitle, ScrollWords, Stack, StackCard, MediaReveal } from '../components/fx.jsx';
import ProductMark from '../components/ProductMark.jsx';
import HomeConsole from '../components/demos/HomeConsole.jsx';
import Architecture from '../components/demos/Architecture.jsx';

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

/* Sticky scroll (shots 26, 54, 70): the step list scrolls, the panel stays and follows it. */
function HowItWorks() {
  const [on, setOn] = useState(0);
  const refs = useRef([]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) setOn(Number(e.target.dataset.k)); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const [t, b, ic] = HOW[on];
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
      <div className="hidden lg:block">
        <div className="card brk sticky top-[calc(var(--hdr-now,var(--hdr))+48px)] overflow-hidden p-10" aria-hidden="true">
          <div className="aurora -right-24 -top-24 h-72 w-72 opacity-40" />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] text-brand">{String(on + 1).padStart(2, '0')} / {String(HOW.length).padStart(2, '0')}</span>
            <span className="flex gap-1.5">{HOW.map((h, k) => <i key={h[0]} className={cx('h-[3px] w-8 transition-colors duration-500', k <= on ? 'bg-brand shadow-[0_0_10px_var(--color-brand)]' : 'bg-bg-3')} />)}</span>
          </div>
          <div key={t} className="fadein">
            <span className="ptile mt-16 !h-20 !w-20"><Icon name={ic} size={38} /></span>
            <p className="mt-10 font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">{t}</p>
            <p className="mt-5 t-lead">{b}</p>
          </div>
        </div>
      </div>
      <ol className="space-y-6 lg:space-y-0">
        {HOW.map(([title, body, icon], k) => (
          <li key={title} ref={(el) => { refs.current[k] = el; }} data-k={k}
            className={cx('border-l pl-6 transition-colors duration-500 lg:flex lg:min-h-[62vh] lg:flex-col lg:justify-center lg:pl-10', k === on ? 'border-brand' : 'border-line')}>
            <span className="font-mono text-[12px] text-brand">Step {String(k + 1).padStart(2, '0')}</span>
            <h3 className={cx('mt-3 font-display text-[28px] font-semibold leading-tight tracking-[-0.025em] transition-colors duration-500 md:text-[36px]', k === on ? 'text-ink' : 'text-ink-3')}>{title}</h3>
            <p className="mt-3 max-w-[48ch] t-body">{body}</p>
            <span className="ptile mt-5 lg:hidden"><Icon name={icon} size={20} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const HIGHLIGHTS = [
  { kind: 'Recognition', title: 'Cybersecurity Excellence', meta: 'Data Security Council of India, 2025', to: '/about-us#recognition' },
  { kind: 'Recognition', title: 'Business Excellence Award', meta: 'Best Cybersecurity Solutions Provider, 2025', to: '/about-us#recognition' },
  { kind: 'Patent', title: 'Multi-domain fraud detection', meta: 'Patent No. 602726, granted October 2026', href: NEWS.find((n) => n.kind === 'Patent')?.href },
  { kind: 'Funding', title: '₹16 crore pre-Series A', meta: 'Led by Unicorn India Ventures, April 2026', href: NEWS.find((n) => n.kind === 'Funding')?.href },
];

const FACTS = [['Built for', 'Banks, government and enterprises'], ['Deploys', 'Read-only, or inside your VPC'], ['Maps to', 'DPDPA, RBI and SEBI']];

export default function Home() {
  return (
    <>
      <Seo path="/" description={SITE.description} />

      {/* 1. Hero: centred statement over the live decision console (shots 18, 54, 70) */}
      <section className="hero-bg relative">
        <div aria-hidden="true" className="aurora left-1/2 top-[-180px] h-[520px] w-[980px] -translate-x-1/2 opacity-45" />
        <div className="container pt-10 text-center md:pt-16">
          <Link to="/prompt-heist" className="rise group mx-auto inline-flex items-center gap-3 rounded-full border border-line-2 bg-bg-1/70 py-1.5 pl-1.5 pr-4 text-[13.5px] text-ink-2 backdrop-blur transition-colors hover:border-brand/50">
            <span className="badge badge-brand badge-dot !rounded-full">Live</span>Prompt Heist: trick our AI, win a job offer
            <Icon name="ArrowRight" size={13} weight="bold" className="arr text-brand transition-transform group-hover:translate-x-1" />
          </Link>
          <SplitTitle as="h1" always className="t-display mx-auto mt-8 max-w-[1180px]">Stop the attack that logs in.</SplitTitle>
          <p className="t-lead rise mx-auto mt-7 max-w-[700px]" style={{ '--d': '240ms' }}>
            Deep Algorithms secures the people, machine identities and AI agents your business runs on. Every identity is scored continuously, every risky action is decided before it completes, and every decision is explained.
          </p>
          <div className="rise mt-9 flex flex-wrap justify-center gap-3" style={{ '--d': '320ms' }}>
            <Button to="/request-demo" size="lg" arrow>Book a demo</Button>
            <Button to="/products" variant="secondary" size="lg">Explore products</Button>
          </div>
          <ul className="rise mx-auto mt-10 flex max-w-[900px] flex-wrap justify-center gap-x-10 gap-y-3" style={{ '--d': '380ms' }}>
            {FACTS.map(([k, v]) => (
              <li key={k} className="flex items-baseline gap-2.5 text-left"><span className="font-mono text-[11.5px] uppercase tracking-[.12em] text-ink-4">{k}</span><span className="text-[14.5px] font-medium text-ink">{v}</span></li>
            ))}
          </ul>
        </div>
        <div className="container-wide relative mt-14 md:mt-16">
          <div aria-hidden="true" className="absolute inset-x-[8%] top-[10%] h-[70%] rounded-full bg-[radial-gradient(closest-side,rgb(29_106_224/.45),transparent)] blur-3xl" />
          <div className="rise brk relative mx-auto max-w-[1180px] text-left" style={{ '--d': '300ms' }}><HomeConsole /></div>
        </div>
        <div className="container pb-6 pt-16 md:pt-20">
          <p className="mb-6 text-center font-mono text-[11.5px] uppercase tracking-[.14em] text-ink-4">Organisations we work with</p>
          <LogoMarquee />
        </div>
      </section>

      {/* 2. Manifesto, lit word by word as you scroll (shots 50, 57) */}
      <section className="sec border-y border-line" aria-label="What we believe">
        <div className="container">
          <p className="eyebrow mb-8">Why it matters</p>
          <ScrollWords className="max-w-[1180px] font-display text-[30px] font-semibold leading-[1.18] tracking-[-0.028em] text-ink md:text-[48px] xl:text-[60px]"
            text="Attackers don’t break in. They log in. A phished password and an approved MFA prompt pass every login check. What changes is behaviour, and behaviour is what we score." />
        </div>
      </section>

      {/* 3. Platforms bento (shots 24, 53, 69) */}
      <Section id="platforms" labelledby="platforms-h">
        <SectionHead id="platforms-h" eyebrow="Products" title="Three platforms. Every identity covered." lead="Each platform runs on its own and starts with the risk that costs you most. Together they share one view of identity risk." />
        <div className="mt-14 grid gap-4 lg:grid-cols-12">
          {PLATFORMS.map((p, i) => (
            <Reveal key={p.key} delay={i * 80} className={cx('card spot group relative flex flex-col overflow-hidden p-7 md:p-8', i === 1 ? 'lg:col-span-5' : 'lg:col-span-7', i === 2 && 'lg:order-4')} style={{ '--acc': p.acc }}>
              <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-25 blur-3xl transition-opacity duration-500 group-hover:opacity-45" style={{ background: p.acc }} />
              <div className="relative flex items-center gap-4">
                <ProductMark p={p.key} size={44} />
                <div><p className="font-display text-[24px] font-semibold tracking-[-0.02em] text-ink">{p.name}</p><p className="font-mono text-[11.5px] uppercase tracking-[.12em] text-ink-3">{p.kind}</p></div>
              </div>
              <p className="relative mt-5 t-body max-w-[46ch]">{p.tagline}.</p>
              <ul className={cx('relative mt-6 divide-y divide-line border-y border-line', i !== 1 && 'xl:grid xl:grid-cols-2 xl:gap-x-8 xl:divide-y-0')}>
                {(p.key === 'zenstra' ? p.items.slice(0, 4) : p.items).map((it) => (
                  <li key={it.key} className={cx(i !== 1 && 'xl:border-b xl:border-line')}>
                    <Link to={it.path} className="group/i flex items-center gap-3 py-3.5">
                      <span className="ptile ptile-sm"><Icon name={it.icon} size={16} /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-medium text-ink transition-colors group-hover/i:text-brand">{it.name}</span><span className="block truncate t-caption">{it.desc}</span></span>
                      <Icon name="ArrowUpRight" size={15} className="shrink-0 text-ink-4 transition-all group-hover/i:-translate-y-0.5 group-hover/i:translate-x-0.5 group-hover/i:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
              <ArrowLink to={p.path} className="relative mt-auto pt-6 text-[15px]">{p.key === 'zenstra' ? 'All six capabilities' : `Explore ${p.name}`}</ArrowLink>
            </Reveal>
          ))}
          <Reveal delay={160} className="lg:order-3 lg:col-span-5">
            <Link to="/product-tour" className="card card-link group relative flex h-full min-h-[340px] flex-col justify-end overflow-hidden">
              <MediaReveal src="/img/photos/engineering.webp" width={900} height={700} brk={false} className="!absolute inset-0 h-full w-full" />
              <span className="relative z-10 block p-7 md:p-8">
                <span className="badge badge-brand"><Icon name="Play" size={11} weight="fill" />Product tour</span>
                <span className="mt-4 block font-display text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">See an attack stopped, step by step.</span>
                <span className="alink mt-4 text-[14.5px]">Take the tour<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></span>
              </span>
            </Link>
          </Reveal>
        </div>
        <Reveal className="card mt-4 hidden overflow-hidden p-8 md:block">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><h3 className="t-h3">How they fit into your environment</h3><p className="mt-2 t-small">Read from the sources you already run. Decide in the middle. Act through the tools you already use.</p></div>
            <span className="font-mono text-[11.5px] uppercase tracking-[.12em] text-ink-4">Reference architecture</span>
          </div>
          <div className="mt-8"><Architecture compact /></div>
        </Reveal>
      </Section>

      {/* 4. Problems: sticky stacking cards (shots 26, 37, 57) */}
      <Section id="problems" labelledby="problems-h" tone="subtle">
        <SectionHead id="problems-h" eyebrow="The risk" title="Four ways identity gets abused. One product for each." lead="Most breaches now start with an identity that looks legitimate. Each of these has a product built to catch it." />
        <Stack className="mt-14">
          {PROBLEMS.map((p, i) => (
            <StackCard key={p.title} k={i}>
              <div className="card grid gap-8 overflow-hidden bg-bg p-7 md:p-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14">
                <div className="flex flex-col">
                  <div className="flex items-center gap-4"><span className="ptile"><Icon name={p.icon} size={20} /></span><span className="font-mono text-[12px] text-ink-4">{String(i + 1).padStart(2, '0')} / {String(PROBLEMS.length).padStart(2, '0')}</span></div>
                  <h3 className="mt-7 t-h2 !text-[28px] md:!text-[36px]">{p.title}</h3>
                  <p className="mt-4 t-body max-w-[52ch]">{p.body}</p>
                  <ArrowLink to={p.to} className="mt-auto pt-8 text-[15px]">{p.p}</ArrowLink>
                </div>
                <div className="flex flex-col justify-between rounded-[6px] border border-line bg-bg-1 p-7 md:p-8">
                  <p className="font-display text-[56px] font-semibold leading-none tracking-[-0.045em] text-ink md:text-[76px]"><CountUp value={p.v} /></p>
                  <div>
                    <p className="mt-6 text-[15px] leading-snug text-ink-2">{p.l}</p>
                    <p className="mt-4 border-t border-line pt-3 font-mono text-[11.5px] text-ink-3">Source: {p.s}</p>
                  </div>
                </div>
              </div>
            </StackCard>
          ))}
        </Stack>
      </Section>

      {/* 5. How it works: sticky scroll */}
      <Section id="how" labelledby="how-h">
        <SectionHead id="how-h" eyebrow="How it works" title="Continuous, explainable, before the action completes." lead="The same four steps run for an employee’s session, a cloud role, a customer’s payment and an AI agent’s tool call." />
        <div className="mt-14 lg:mt-20"><HowItWorks /></div>
      </Section>

      {/* 6. Industries: masked, parallax photography (shots 4, 5, 57) */}
      <Section id="industries" labelledby="industries-h" tone="subtle">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead id="industries-h" eyebrow="Industries" title="Built for organisations that cannot afford a breach." />
          <ArrowLink to="/products">Find a product by need</ArrowLink>
        </div>
        <div className="no-scrollbar m-rail -mx-5 mt-14 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-4">
          {INDUSTRIES.map((x, i) => (
            <Link key={x.slug} to={x.path} className="group relative block w-[78vw] shrink-0 snap-start md:w-auto">
              <MediaReveal src={`/img/photos/${x.slug}.webp`} width={600} height={800} ratio="3 / 4" className="rounded-[6px]" />
              <div className="absolute inset-x-0 bottom-0 z-10 p-6">
                <span className="font-mono text-[11.5px] text-brand">{String(i + 1).padStart(2, '0')}</span>
                <span className="mt-2 block font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">{x.name}</span>
                <span className="mt-2 block text-[14px] leading-snug text-ink-2">{x.desc}</span>
                <span className="alink mt-4 text-[14px]">See the solution<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* 7. Evidence */}
      <Section id="evidence" labelledby="evidence-h">
        <SectionHead id="evidence-h" eyebrow="Recognition" title="Recognised by the people who regulate and fund this work." />
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map((h, i) => {
            const inner = (
              <>
                <span className="flex items-center justify-between"><span className="app-label">{h.kind}</span><Icon name={h.href ? 'ArrowUpRight' : 'ArrowRight'} size={15} className="text-ink-4 transition-colors group-hover:text-brand" /></span>
                <span className="mt-10 block font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{h.title}</span>
                <span className="mt-2 block t-small">{h.meta}</span>
              </>
            );
            return (
              <Reveal key={h.title} delay={i * 60} className="h-full">
                {h.href
                  ? <a href={h.href} target="_blank" rel="noreferrer" className="card card-link spot group block h-full p-6">{inner}<span className="sr-only"> (opens in a new tab)</span></a>
                  : <Link to={h.to} className="card card-link spot group block h-full p-6">{inner}</Link>}
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-20"><LogoWall lead="Banks, public institutions, hospitals, research institutes and technology companies across India." /></Reveal>
      </Section>

      {/* 8. Security and compliance bento */}
      <Section id="trust" labelledby="trust-h" tone="subtle">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-16">
          <SectionHead id="trust-h" eyebrow="Security and compliance" title="Built to be approved by your risk committee." lead="Your data stays where it is, every decision carries its reasons, and the evidence is ready before anyone asks for it." />
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['LockKey', 'Your data stays put', 'Read-only connectors; the Zenstra gateway runs inside your VPC. Prompts and payloads do not leave your cloud.'],
              ['ClipboardText', 'Every decision explained', 'Each score and each allow, hold or block is recorded with the policy that produced it.'],
              ['Scales', 'Indian regulation first', 'Evidence mapped to the DPDP Act 2023, the DPDP Rules 2025, RBI and SEBI.'],
              ['Certificate', 'Certifications', `${CERTS.map((c) => c.name).join(', ')}. Certificates available on request.`],
            ].map(([ic, t, b], i) => (
              <Reveal key={t} delay={i * 60} className="card spot p-6 md:p-7">
                <span className="ptile"><Icon name={ic} size={19} /></span>
                <p className="mt-8 text-[17px] font-semibold text-ink">{t}</p>
                <p className="mt-2 t-small">{b}</p>
              </Reveal>
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
