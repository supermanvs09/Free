import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SITE, CERTS } from '../data/site.js';
import { PLATFORMS, INDUSTRIES } from '../data/ia.js';
import { NEWS, RECOGNITION, FOUNDER_QUOTE, BELIEFS } from '../data/company.js';
import { Button, Icon, Reveal, SectionHead, CountUp, cx } from '../components/ui.jsx';
import { ArrowLink, CtaBand, Faq, LogoWall, LogoMarquee, ResearchCards, Section } from '../components/ds.jsx';
import { SplitTitle, ScrollWords, MediaReveal, TiltFrame } from '../components/fx.jsx';
import ProductMark from '../components/ProductMark.jsx';
import HomeConsole from '../components/demos/HomeConsole.jsx';
import { Logo as ToolLogo } from '../components/viz/kit.jsx';

/* Home, v4. Section framing follows the Quantra reference (shot 26):
   a statement hero, who we are, what we do, why us, how we work, proof,
   answers, insights, one closing call. Shot numbers in comments refer to
   docs/redesign-v4/SHOT_MAP.md. Every figure and quote is sourced. */

const FAQ = [
  { title: 'What does Deep Algorithms do?', body: 'We secure the identities attackers use to get in: people, machine identities and AI agents. adapID AI covers people, cloud identities, Active Directory and banking fraud. Zenstra AI covers AI agents. ICMS covers personal data and DPDPA compliance.' },
  { title: 'Which product should we start with?', body: 'Start with the risk that costs you most today; each product runs on its own. Agents acting on your systems: Zenstra AI. Logins, cloud keys, Active Directory or fraud: adapID AI. Personal data and DPDPA: ICMS.' },
  { title: 'Do we have to move our data?', body: 'No. adapID AI uses read-only connectors and one read-only role per AWS account, Zenstra AI runs as a gateway inside your VPC, and ICMS connects to the stores that already hold personal data.' },
  { title: 'Do you map to Indian regulation?', body: 'Yes. Evidence is mapped to the DPDP Act 2023 and the DPDP Rules 2025, and to RBI and SEBI expectations, from the start rather than added for an audit.' },
  { title: 'What happens in a demo?', body: 'A 30-minute session with a Deep Algorithms engineer, on your own environment where you want it, with your own questions. For AWS, you can connect a sandbox account with a read-only role and walk through the results together.' },
];

/* the four ways identity gets abused, each with its product and a sourced figure */
const THREATS = [
  { icon: 'Key', title: 'Stolen logins', body: 'A phished password and an approved MFA prompt pass every login check.', v: '₹25.5 Cr', l: 'average cost of a data breach in India, 2026', s: 'IBM Cost of a Data Breach Report, 2026', to: '/adapid-ai/continuous-identity-risk-management', p: 'Continuous Identity Risk Management' },
  { icon: 'Cloud', title: 'Machine identities', body: 'Service accounts, keys and cloud roles hold broad access nobody reviews.', v: '82:1', l: 'machine identities for every human identity', s: 'CyberArk Identity Security Landscape, 2025', to: '/adapid-ai/nhi-security', p: 'NHI Security for AWS' },
  { icon: 'Wallet', title: 'Mule accounts', body: 'Scam payments are made by the real customer, to accounts opened days earlier.', v: '26.5 lakh+', l: 'mule accounts identified by I4C, December 2025', s: 'I4C, via Deep Algorithms research', to: '/adapid-ai/fraud-prevention', p: 'Identity Fraud Prevention' },
  { icon: 'Robot', title: 'AI agents', body: 'Agents call APIs and move data with valid tokens. A valid token is not a valid reason.', v: '40%+', l: 'of agentic AI projects expected to be cancelled by 2027', s: 'Gartner, June 2025', to: '/agentic-ai/agentic-identity', p: 'Zenstra AI' },
];

const HOW = [
  ['Connect, read-only', 'Connectors to your identity providers, cloud, SaaS and apps. One read-only role per AWS account. Nothing to install on endpoints.', 'Plug'],
  ['Learn each normal', 'A behaviour baseline for every person, machine identity, customer and agent: where, when, how and what it usually touches.', 'Fingerprint'],
  ['Score every event', 'Each sign-in, API call, payment or tool call is scored against that baseline and your policy, with the reasons attached.', 'Gauge'],
  ['Act and record', 'Allow, step up, hold or block through the tools you already run, and keep a record your auditors and regulators can read.', 'ClipboardText'],
];

const WHY = [
  ['Pulse', 'Continuous, not quarterly', 'Every identity is scored on every event. There is no review cycle for an attacker to wait out.'],
  ['ClipboardText', 'Every decision explained', 'Each allow, hold or block carries its reasons and the policy that produced it, in plain language.'],
  ['LockKey', 'Your data stays put', 'Read-only connectors and a gateway inside your VPC. Prompts, payloads and personal data stay in your cloud.'],
];

const TOOLS = ['okta', 'm365', 'aws', 'google', 'github', 'copilotstudio', 'splunk', 'jira', 'kubernetes', 'zapier', 'n8n', 'mcp'];

const PRESS = NEWS.filter((n) => ['Interview', 'Perspective', 'Press'].includes(n.kind));

/* ---------- How it works: sticky visual, scrolling steps (shots 26, 70, 92) ---------- */
function HowItWorks() {
  const [on, setOn] = useState(0);
  const refs = useRef([]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setOn(Number(e.target.dataset.k)); }), { rootMargin: '-45% 0px -45% 0px' });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  const [t, b, ic] = HOW[on];
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
      <div className="hidden lg:block">
        <div className="sticky top-[calc(var(--hdr-now,var(--hdr))+40px)]" aria-hidden="true">
          <figure className="media relative aspect-[4/3.3] overflow-hidden rounded-[24px]">
            <img src="/img/photos/engineering.webp" alt="" width="900" height="740" loading="lazy" decoding="async" />
            <div className="absolute inset-0 bg-[linear-gradient(160deg,rgb(7_19_48/.15),rgb(7_19_48/.85))]" />
            <div className="absolute inset-x-6 bottom-6">
              <div key={t} className="glass fadein rounded-[18px] p-6">
                <div className="flex items-center justify-between">
                  <span className="gtile !h-12 !w-12 !rounded-[14px]"><Icon name={ic} size={22} /></span>
                  <span className="font-mono text-[12px] text-ink-3">Step {String(on + 1).padStart(2, '0')} / 04</span>
                </div>
                <p className="mt-5 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">{t}</p>
                <p className="mt-2 t-small !text-ink-2">{b}</p>
              </div>
            </div>
          </figure>
        </div>
      </div>
      <ol className="relative">
        <span aria-hidden="true" className="absolute bottom-6 left-[15px] top-6 w-px bg-line-2" />
        {HOW.map(([title, body, icon], k) => (
          <li key={title} ref={(el) => { refs.current[k] = el; }} data-k={k} className="relative flex gap-6 pb-12 lg:min-h-[48vh] lg:items-center lg:pb-0">
            <span className={cx('relative z-10 mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[12px] transition-all duration-500 lg:mt-0', k <= on ? 'border-brand bg-brand text-white shadow-[0_0_0_6px_var(--color-brand-50)]' : 'border-line-2 bg-white text-ink-3')}>{k + 1}</span>
            <div>
              <h3 className={cx('font-display text-[26px] font-semibold leading-tight tracking-[-0.022em] transition-colors duration-500 md:text-[34px]', k === on ? 'text-ink' : 'text-ink-3')}>{title}</h3>
              <p className="mt-3 max-w-[46ch] t-body">{body}</p>
              <span className="ptile mt-5 lg:hidden"><Icon name={icon} size={20} /></span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- Press quotes with arrows (shots 26, 34, 84) ---------- */
function Press() {
  const [i, setI] = useState(0);
  const n = PRESS.length;
  const cur = PRESS[i];
  return (
    <div className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <figure className="card relative flex flex-col justify-between overflow-hidden p-8 md:p-12">
        <div aria-hidden="true" className="blob -right-24 -top-24 h-64 w-64 bg-[#cfe6ff]" />
        <p className="eyebrow">{cur.kind} · {cur.meta}</p>
        <blockquote key={cur.title} className="fadein mt-8 font-display text-[24px] font-medium leading-[1.35] tracking-[-0.015em] text-ink md:text-[32px]">
          {cur.body}
        </blockquote>
        <figcaption className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <span><span className="block font-semibold text-ink">{cur.meta}</span><span className="t-small">{cur.kind}, {cur.date}</span></span>
          <a href={cur.href} target="_blank" rel="noreferrer" className="alink text-[14.5px]">{cur.cta}<Icon name="ArrowUpRight" size={14} weight="bold" /><span className="sr-only"> (opens in a new tab)</span></a>
        </figcaption>
      </figure>
      <div className="flex flex-col gap-4">
        <figure className="card flex flex-1 flex-col justify-between bg-[linear-gradient(160deg,#eef3ff,#fff)] p-8">
          <blockquote className="t-lead !text-ink">“{FOUNDER_QUOTE.text}”</blockquote>
          <figcaption className="mt-6 flex items-center gap-3">
            <img src={`/img/people/${FOUNDER_QUOTE.img}.webp`} alt="" width="48" height="48" loading="lazy" className="h-12 w-12 rounded-full object-cover" />
            <span><span className="block font-semibold text-ink">{FOUNDER_QUOTE.name}</span><span className="t-caption">{FOUNDER_QUOTE.role} · {FOUNDER_QUOTE.source}</span></span>
          </figcaption>
        </figure>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12.5px] text-ink-3" aria-live="polite">{String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setI((i - 1 + n) % n)} aria-label="Previous quote" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 bg-white text-ink transition hover:border-brand hover:text-brand"><Icon name="ArrowLeft" size={17} /></button>
            <button type="button" onClick={() => setI((i + 1) % n)} aria-label="Next quote" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-hover"><Icon name="ArrowRight" size={17} /></button>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Seo path="/" description={SITE.description} />

      {/* 1. Hero: sky gradient, pill note, highlighted word, device with floating cards (10, 17, 19, 31, 52, 90) */}
      <section className="sky relative overflow-hidden">
        <div aria-hidden="true" className="beam left-[6%] opacity-80" />
        <div aria-hidden="true" className="beam left-[70%] opacity-60" />
        <div className="container pt-12 text-center md:pt-16">
          <Link to="/prompt-heist" className="pill-note rise group mx-auto">
            <b>New</b>Prompt Heist: trick our AI guard, win a job offer
            <Icon name="ArrowRight" size={13} weight="bold" className="text-brand transition-transform group-hover:translate-x-1" />
          </Link>
          <SplitTitle as="h1" always className="t-display mx-auto mt-7 max-w-[1000px]">Stop the attack that <span className="hl-pill">logs in.</span></SplitTitle>
          <p className="t-lead rise mx-auto mt-6 max-w-[660px]" style={{ '--d': '240ms' }}>
            Attackers no longer break in. They sign in with a real password. We score every person, machine identity and AI agent in real time, and stop the risky action before it completes.
          </p>
          <div className="rise mt-9 flex flex-wrap justify-center gap-3" style={{ '--d': '320ms' }}>
            <Link to="/request-demo" className="btn btn-primary btn-lg group">Book a demo<span className="arr-dot"><Icon name="ArrowUpRight" size={15} weight="bold" /></span></Link>
            <Link to="/product-tour" className="btn btn-secondary btn-lg"><Icon name="Play" size={15} weight="fill" className="text-brand" />Watch it stop an attack</Link>
          </div>
          <p className="rise mt-8 text-[14px] text-ink-3" style={{ '--d': '380ms' }}>
            Built for <span className="font-semibold text-ink">Banks, government and enterprises</span> · Read-only, or inside your VPC · Mapped to DPDPA, RBI and SEBI
          </p>
        </div>
        <div className="container relative mt-12 pb-20 md:mt-14 md:pb-24">
          <div className="rise relative mx-auto max-w-[1120px] min-[1400px]:max-w-[1000px]" style={{ '--d': '300ms' }}>
            <div className="device"><div className="screen text-left"><HomeConsole /></div></div>
            {/* floating glass cards (19, 20, 66, 90) */}
            <div aria-hidden="true" className="glass float absolute -left-[178px] top-[22%] hidden w-[188px] rounded-[16px] p-4 text-left min-[1400px]:block" style={{ '--fd': '-2s' }}>
              <p className="flex items-center justify-between text-[12px] text-ink-3"><span>02:14 · Lagos</span><span className="badge badge-crit !h-5 !text-[11px]">Held</span></p>
              <p className="mt-2 text-[14px] font-semibold text-ink">New country, new device</p>
              <p className="text-[12.5px] text-ink-3">MFA passed. Behaviour did not.</p>
            </div>
            <div aria-hidden="true" className="glass float absolute -right-[178px] bottom-[18%] hidden w-[188px] rounded-[16px] p-4 text-left min-[1400px]:block">
              <p className="text-[12px] text-ink-3">Decision record</p>
              <p className="mt-1 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">Explained</p>
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ok"><Icon name="CheckCircle" size={14} weight="fill" />Policy, reasons, evidence</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Logo marquee (18, 53, 54, 69) */}
      <section className="border-y border-line bg-white py-10" aria-label="Organisations we work with">
        <p className="mb-6 text-center font-mono text-[11.5px] uppercase tracking-[.14em] text-ink-3">Working with banks, ministries, hospitals and research leaders across India</p>
        <LogoMarquee />
      </section>

      {/* 3. Who we are: mission and what we believe (26 "the quantum edge", 34, 48) */}
      <Section id="about" labelledby="about-h">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <SectionHead id="about-h" eyebrow="Who we are" title="The identity edge of cyber defence." lead={`Founded in Hyderabad in ${SITE.founded}, we build AI that watches how every identity behaves, so a stolen key cannot pass for its owner.`} />
          <ScrollWords className="font-display text-[26px] font-medium leading-[1.3] tracking-[-0.02em] text-ink md:text-[34px]" text="Signatures describe yesterday’s attacks. Behaviour catches the one that has never been seen before. That is the whole idea, applied to every login, key, payment and agent." />
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <Reveal className="card overflow-hidden p-8 md:p-10">
            <p className="eyebrow">Our mission</p>
            <p className="mt-5 font-display text-[24px] font-semibold leading-snug tracking-[-0.018em] text-ink md:text-[28px]">{FOUNDER_QUOTE.text.replace('Our mission is to', 'To')}</p>
            <p className="mt-5 t-small">{FOUNDER_QUOTE.name}, {FOUNDER_QUOTE.role}</p>
          </Reveal>
          <Reveal delay={80} className="card overflow-hidden p-8 md:p-10">
            <p className="eyebrow">What we believe</p>
            <ul className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {BELIEFS.slice(0, 4).map((b) => (
                <li key={b.title} className="flex gap-3"><span className="ptile ptile-sm"><Icon name={b.icon} size={16} /></span><span className="text-[15px] font-semibold leading-snug text-ink">{b.title}</span></li>
              ))}
            </ul>
            <ArrowLink to="/about-us" className="mt-7 text-[14.5px]">More about us</ArrowLink>
          </Reveal>
        </div>
        {/* key facts, counted up (13, 48, 55, 69) */}
        <dl className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[['2022', 'Founded, in Hyderabad'], ['3', 'Offices: Hyderabad, Bengaluru, Texas'], [String(CERTS.length), 'Security and privacy certifications'], ['₹16 Cr', 'Pre-Series A, Unicorn India Ventures']].map(([v, l], i) => (
            <Reveal key={l} delay={i * 60} className="card p-6">
              <dd className="font-display text-[40px] font-semibold leading-none tracking-[-0.04em] text-brand md:text-[48px]"><CountUp value={v} /></dd>
              <dt className="mt-3 text-[14px] leading-snug text-ink-2">{l}</dt>
            </Reveal>
          ))}
        </dl>
      </Section>

      {/* 4. What we do: product cards with gradient art (14, 60, 74, 84) */}
      <Section id="platforms" labelledby="platforms-h" tone="subtle">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead id="platforms-h" eyebrow="What we do" title={<>Smart identity defence, <span className="hl">built for every identity.</span></>} lead="Three platforms. Each one runs on its own and starts with the risk that costs you most." />
          <Button to="/products" variant="secondary">All products</Button>
        </div>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {PLATFORMS.map((p, i) => (
            <Reveal key={p.key} delay={i * 90} className="card card-link group flex flex-col overflow-hidden" style={{ '--acc': p.acc }}>
              <div className="relative h-[170px] overflow-hidden" style={{ background: `radial-gradient(80% 90% at 80% 0%, color-mix(in oklab, ${p.acc} 35%, #fff), transparent 70%), radial-gradient(70% 80% at 0% 100%, #e3f6ff, transparent 70%), #f7f9ff` }}>
                <div aria-hidden="true" className="absolute left-6 top-6 transition-transform duration-700 group-hover:-rotate-6 group-hover:scale-110"><ProductMark p={p.key} size={56} /></div>
                <div aria-hidden="true" className="glass absolute -right-6 bottom-5 w-[64%] rotate-[-6deg] rounded-[14px] p-3 transition-transform duration-700 group-hover:rotate-0">
                  {(p.key === 'zenstra' ? p.items.slice(0, 3) : p.items.slice(0, 3)).map((it) => <p key={it.key} className="flex items-center gap-2 py-1 text-[12px] text-ink-2"><Icon name={it.icon} size={13} className="text-brand" /><span className="truncate">{it.name}</span></p>)}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-7">
                <p className="font-mono text-[11.5px] uppercase tracking-[.12em] text-ink-3">{p.kind}</p>
                <h3 className="mt-2 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">{p.name}</h3>
                <p className="mt-2 t-body">{p.tagline}.</p>
                <ul className="mt-5 flex-1 space-y-2">
                  {(p.key === 'zenstra' ? p.items.slice(0, 4) : p.items).map((it) => (
                    <li key={it.key}><Link to={it.path} className="group/i flex items-center gap-2 text-[14.5px] text-ink-2 transition-colors hover:text-brand"><Icon name="CheckCircle" size={15} weight="fill" className="shrink-0 text-brand" />{it.name}</Link></li>
                  ))}
                </ul>
                <ArrowLink to={p.path} className="mt-6 text-[15px]">{p.key === 'zenstra' ? 'All six capabilities' : `Explore ${p.name}`}</ArrowLink>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 5. Why us: navy band, glossy icons (26 "Why Quantra? Because security can't wait.", 13, 75) */}
      <section className="band sec overflow-hidden" aria-labelledby="why-h">
        <div aria-hidden="true" className="beam left-[30%] opacity-40" />
        <div className="container">
          <SectionHead id="why-h" align="center" eyebrow="Why Deep Algorithms" title={<>Why us? Because a valid login <span className="hl">isn’t a safe one.</span></>} lead="Most breaches now start with an identity that looks legitimate. We built every product around that fact." />
          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {WHY.map(([ic, t, b], i) => (
              <Reveal key={t} delay={i * 90} className="card p-8 text-center">
                <span className="gtile mx-auto"><Icon name={ic} size={28} weight="duotone" /></span>
                <h3 className="mt-7 font-display text-[23px] font-semibold tracking-[-0.018em] text-ink">{t}</h3>
                <p className="mt-3 t-body">{b}</p>
              </Reveal>
            ))}
          </div>
          {/* the threats, as a horizontal rail of sourced figures (20, 75, 86) */}
          <div className="no-scrollbar m-rail -mx-5 mt-5 flex snap-x gap-5 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-4">
            {THREATS.map((t, i) => (
              <Reveal key={t.title} delay={i * 70} className="w-[80vw] shrink-0 snap-start md:w-auto">
                <Link to={t.to} className="card card-link group flex h-full flex-col p-7">
                  <span className="flex items-center justify-between"><span className="ptile"><Icon name={t.icon} size={19} /></span><Icon name="ArrowUpRight" size={17} className="text-ink-3 transition group-hover:text-brand" /></span>
                  <p className="mt-6 font-display text-[40px] font-semibold leading-none tracking-[-0.04em] text-white"><CountUp value={t.v} /></p>
                  <p className="mt-3 text-[14px] leading-snug text-ink-2">{t.l}</p>
                  <p className="mt-5 font-semibold text-ink">{t.title}</p>
                  <p className="mt-1 t-small">{t.body}</p>
                  <p className="mt-auto pt-5 font-mono text-[11px] text-ink-4">Source: {t.s}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 6. How we secure your business (26, 70, 92) */}
      <Section id="how" labelledby="how-h">
        <SectionHead id="how-h" eyebrow="How it works" title="How Deep Algorithms secures your business." lead="The same four steps run for an employee’s session, a cloud role, a customer’s payment and an AI agent’s tool call." />
        <div className="mt-14 lg:mt-16"><HowItWorks /></div>
      </Section>

      {/* 7. Integrations orbit (48, 64, 65, 86) */}
      <Section id="connect" labelledby="connect-h" tone="subtle">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <SectionHead id="connect-h" eyebrow="Integrations" title="Just connect. Nothing to rip out." lead="Read from the identity, cloud and agent platforms you already run. Act through them too: step-up in your IdP, cases in your SOC, approvals to named owners." />
            <ul className="mt-8 space-y-3">
              {['Read-only connectors, no endpoint agents', 'One read-only role per AWS account', 'Zenstra gateway inside your VPC'].map((x) => <li key={x} className="flex items-center gap-3 text-[15.5px] text-ink"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white"><Icon name="Check" size={13} weight="bold" /></span>{x}</li>)}
            </ul>
          </div>
          <div className="orbit-wrap relative mx-auto aspect-square w-full max-w-[520px]" aria-label="Okta, Microsoft 365, AWS, Google, GitHub, Copilot Studio, Splunk, Jira, Kubernetes, Zapier, n8n and MCP servers" role="img">
            <div aria-hidden="true" className="absolute inset-[6%] rounded-full border border-dashed border-line-2" />
            <div aria-hidden="true" className="absolute inset-[24%] rounded-full border border-line-2 bg-white/60" />
            <div aria-hidden="true" className="absolute inset-[38%] flex items-center justify-center rounded-full bg-white shadow-[var(--e-3)]">
              <img src="/brand/mark.webp" alt="" width="160" height="160" className="h-[48%] w-auto" />
            </div>
            <div aria-hidden="true" className="orbit absolute inset-[6%]">
              {TOOLS.map((k, i) => {
                const a = (i / TOOLS.length) * Math.PI * 2;
                return (
                  <span key={k} className="absolute" style={{ left: `${50 + Math.cos(a) * 50}%`, top: `${50 + Math.sin(a) * 50}%` }}>
                    <span className="-ml-6 -mt-6 flex h-12 w-12 items-center justify-center rounded-[14px] border border-line bg-white text-ink shadow-[var(--e-2)]"><ToolLogo k={k} size="24px" /></span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* 8. Industries: photographs with glass captions (4, 5, 20, 75) */}
      <Section id="industries" labelledby="industries-h">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead id="industries-h" eyebrow="Industries" title="Built for the sectors attackers target first." />
          <ArrowLink to="/products">Find a product by need</ArrowLink>
        </div>
        <div className="no-scrollbar m-rail -mx-5 mt-14 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-4">
          {INDUSTRIES.map((x, i) => (
            <Link key={x.slug} to={x.path} className="group relative block w-[78vw] shrink-0 snap-start md:w-auto">
              <MediaReveal src={`/img/photos/${x.slug}.webp`} width={600} height={800} ratio="3 / 4" className="rounded-[20px]" />
              <div className="glass absolute inset-x-3 bottom-3 z-10 rounded-[16px] p-5 transition-transform duration-500 group-hover:-translate-y-1">
                <span className="font-mono text-[11.5px] text-brand">{String(i + 1).padStart(2, '0')}</span>
                <span className="mt-1 block font-display text-[21px] font-semibold leading-tight tracking-[-0.018em] text-ink">{x.name}</span>
                <span className="mt-1.5 block text-[13.5px] leading-snug text-ink-2">{x.desc}</span>
                <span className="alink mt-3 text-[14px]">See the solution<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></span>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* 9. What the industry says (26 testimonials, 34, 84) */}
      <Section id="press" labelledby="press-h" tone="subtle">
        <SectionHead id="press-h" eyebrow="In the press" title="What the industry is saying." lead="Interviews, perspectives and coverage, quoted from where they were published." />
        <div className="mt-14"><Press /></div>
      </Section>

      {/* 10. Recognition: event photography rail (50, 57, 23) */}
      <Section id="evidence" labelledby="evidence-h">
        <SectionHead id="evidence-h" eyebrow="Recognition" title="Recognised by the people who regulate and fund this work." />
        <div className="no-scrollbar m-rail -mx-5 mt-14 flex snap-x gap-5 overflow-x-auto px-5 pb-2 md:mx-0 md:px-0">
          {RECOGNITION.slice(0, 5).map((r) => (
            <figure key={r.title} className="w-[78vw] shrink-0 snap-start sm:w-[320px]">
              <MediaReveal src={`/img/events/${r.img}.webp`} width={640} height={480} ratio="4 / 3" className="rounded-[18px]" />
              <figcaption className="mt-4"><span className="font-mono text-[12px] text-brand">{r.year}</span><span className="mt-1 block font-semibold text-ink">{r.title}</span><span className="t-small">{r.where}</span></figcaption>
            </figure>
          ))}
        </div>
        <Reveal className="mt-20"><LogoWall lead="Banks, public institutions, hospitals, research institutes and technology companies across India." /></Reveal>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          {CERTS.map((c) => <span key={c.code} className="badge !h-9 !px-4 !text-[13px]"><Icon name="SealCheck" size={15} weight="fill" className="text-brand" />{c.name}</span>)}
        </div>
      </Section>

      <Faq items={FAQ} title="Got questions? We’ve got answers." />
      <ResearchCards title="Insights that keep you ahead." />
      <CtaBand title="Ready to secure what matters most?" />
    </>
  );
}
