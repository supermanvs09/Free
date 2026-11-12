import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SITE, CERTS } from '../data/site.js';
import { PLATFORMS, INDUSTRIES } from '../data/ia.js';
import { NEWS, FOUNDER_QUOTE } from '../data/company.js';
import { Icon, Reveal, SectionHead, CountUp, cx } from '../components/ui.jsx';
import { ArrowLink, CtaBand, Faq, LogoMarquee, ResearchCards, Section } from '../components/ds.jsx';
import { SplitTitle, MediaReveal } from '../components/fx.jsx';
import ProductMark from '../components/ProductMark.jsx';
import HomeConsole from '../components/demos/HomeConsole.jsx';

/* Home, v6. Built on four reference interfaces chosen by the company:
   A Yapay (shots 20, 75): photo hero, cobalt blue, navy band of photo cards.
   B Payco (19, 90): headline left, stacked product cards right.
   D Caleo (64, 93): product screen in a browser frame, "what makes us different" cards.
   F Mindraft (5): full-bleed photograph with glass call-out cards.
   Copy follows the Quantra voice (26): short, declarative, confident. */

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

const HERO_DECISIONS = [
  { kind: 'Employee', icon: 'User', who: 'Kavya Reddy, treasury analyst', what: 'Sign-in from Lagos on a new device. MFA passed. Behaviour did not.', label: 'Session held', tone: 'hold', why: 'Score 81 / 100', time: '02:14' },
  { kind: 'Cloud role', icon: 'Cloud', who: 'ecs-notify-svc, AWS prod', what: '214 permissions granted, 9 ever used. Reading buckets it never touched.', label: 'Access trimmed', tone: 'warn', why: '205 unused', time: 'Today' },
  { kind: 'AI agent', icon: 'Robot', who: 'invoice-agent, Copilot Studio', what: 'Tried to export the vendor list to an outside email address.', label: 'Tool call blocked', tone: 'crit', why: 'Outside its task', time: '10:02:15' },
];

const PRESS = NEWS.filter((n) => ['Interview', 'Perspective', 'Press'].includes(n.kind));

function Press() {
  const [i, setI] = useState(0);
  const n = PRESS.length;
  const cur = PRESS[i];
  return (
    <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <figure className="flex flex-col justify-between rounded-[24px] bg-bg-1 p-8 md:p-12">
        <p className="eyebrow">{cur.kind} · {cur.meta}</p>
        <blockquote key={cur.title} className="fadein mt-8 text-[24px] font-medium leading-[1.3] tracking-[-0.025em] text-ink md:text-[32px]">“{cur.body}”</blockquote>
        <figcaption className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <span className="t-small">{cur.date}</span>
          <a href={cur.href} target="_blank" rel="noreferrer" className="alink text-[14.5px]">{cur.cta}<Icon name="ArrowUpRight" size={14} weight="bold" /><span className="sr-only"> (opens in a new tab)</span></a>
        </figcaption>
      </figure>
      <div className="flex flex-col gap-5">
        <figure className="flex flex-1 flex-col justify-between rounded-[24px] bg-navy p-8 text-white">
          <blockquote className="text-[19px] leading-[1.5] text-white">“{FOUNDER_QUOTE.text}”</blockquote>
          <figcaption className="mt-6 flex items-center gap-3">
            <img src={`/img/people/${FOUNDER_QUOTE.img}.webp`} alt="" width="48" height="48" loading="lazy" className="h-12 w-12 rounded-full object-cover" />
            <span><span className="block font-semibold">{FOUNDER_QUOTE.name}</span><span className="text-[13px] text-[#b9c3dd]">{FOUNDER_QUOTE.role} · {FOUNDER_QUOTE.source}</span></span>
          </figcaption>
        </figure>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[12.5px] text-ink-3" aria-live="polite">{String(i + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setI((i - 1 + n) % n)} aria-label="Previous quote" className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-ink transition hover:border-ink"><Icon name="ArrowLeft" size={17} /></button>
            <button type="button" onClick={() => setI((i + 1) % n)} aria-label="Next quote" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white transition hover:bg-brand"><Icon name="ArrowRight" size={17} /></button>
          </span>
        </div>
      </div>
    </div>
  );
}

const DIFFERENT = [
  ['Pulse', 'Always on', 'Every identity is scored on every event. There is no review cycle for an attacker to wait out.'],
  ['ClipboardText', 'Always explained', 'Every allow, hold or block carries its reasons and the policy behind it, in plain language.'],
  ['LockKey', 'Always yours', 'Read-only connectors and a gateway inside your VPC. Your data never leaves your cloud.'],
];

export default function Home() {
  return (
    <>
      <Seo path="/" description={SITE.description} />

      {/* 1. Hero, after Yapay (shot 75): the photograph is the product at work.
          A customer pays with a phone; a glass frame over the phone shows the
          identity check Deep Algorithms makes at that moment. */}
      <section className="hero-photo pb-6">
        <div className="container-wide">
          <div className="relative isolate overflow-hidden rounded-[28px] bg-[#3a3631] max-lg:min-h-[760px] lg:aspect-[1360/780]">
            <img src="/img/photos/bfsi.webp" alt="A customer pays at a counter with a phone." width="1200" height="800" fetchPriority="high" decoding="async"
              className="absolute inset-0 -z-10 h-full w-full object-cover object-[64%_60%] brightness-[.82] lg:object-[50%_60%]" />
            <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(20_18_16/.78)_0%,rgb(20_18_16/.45)_34%,transparent_58%)]" />
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-[linear-gradient(0deg,rgb(20_18_16/.55),transparent)]" />

            {/* headline */}
            <div className="absolute left-6 right-6 top-[120px] md:left-12 lg:left-[5.5%] lg:right-auto lg:top-[22%] lg:w-[44%]">
              <SplitTitle as="h1" always className="text-[46px] font-medium leading-[1.02] tracking-[-0.04em] text-white md:text-[64px] xl:text-[80px]">Trust the person, not just the password.</SplitTitle>
            </div>

            {/* glass frame around the phone (desktop), with the live decision */}
            <div aria-hidden="true" className="rise absolute hidden rounded-[26px] border border-white/45 bg-white/[.08] shadow-[0_30px_60px_-20px_rgb(0_0_0/.5)] backdrop-blur-[1.5px] lg:block"
              style={{ left: '56.5%', top: '27%', width: '21%', height: '62%', '--d': '300ms' }}>
              <span className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand shadow-lg"><Icon name="Check" size={16} weight="bold" /></span>
            </div>
            <div role="group" aria-label="Decision: Payment approved" className="rise absolute left-6 right-6 top-[392px] rounded-[18px] md:left-12 md:right-auto md:w-[380px] bg-[linear-gradient(180deg,rgb(31_91_255/.88),rgb(21_70_214/.94))] p-4 text-white shadow-[0_24px_50px_-18px_rgb(31_91_255/.8)] backdrop-blur-md lg:left-[50%] lg:top-[73%] lg:w-[34%] xl:left-[53%] xl:w-[27%]" style={{ '--d': '480ms' }}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white/18"><Icon name="Fingerprint" size={20} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">It’s really Kavya</span>
                  <span className="block truncate text-[12.5px] text-white/75">₹48,000 to a new payee</span>
                </span>
                <span className="text-right"><span className="block text-[15px] font-semibold">Approved</span><span className="block text-[12px] text-white/75">in 40 ms</span></span>
              </div>
            </div>

            {/* bottom right: one line and the call (Yapay "Talk to Sales") */}
            <div className="absolute bottom-[112px] left-6 right-6 flex flex-col gap-5 md:left-12 lg:bottom-[10%] lg:left-[5.5%] lg:right-auto lg:w-[380px]">
              <p className="rise text-[15px] leading-relaxed text-white/85 lg:text-[16px]" style={{ '--d': '360ms' }}>From banks to ministries, we check that every login, payment and AI agent is who it claims to be, before it acts.</p>
              <div className="rise flex flex-wrap gap-3" style={{ '--d': '420ms' }}>
                <Link to="/request-demo" className="group inline-flex h-12 items-center gap-3 rounded-full bg-[#0c0e14] pl-5 pr-1.5 text-[15px] font-medium text-white transition hover:bg-black">Book a demo<span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand transition-transform group-hover:-rotate-45"><Icon name="ArrowRight" size={16} weight="bold" /></span></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Logos (A, D) */}
      <section className="py-12" aria-label="Organisations we work with">
        <p className="mb-7 text-center text-[14px] text-ink-3">Trusted by banks, ministries, hospitals and research leaders across India</p>
        <LogoMarquee />
      </section>

      {/* 3. Statement + stacked decisions (B Payco) */}
      <section className="sec bg-bg-1" aria-labelledby="proof-h">
        <div className="container grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
          <div>
            <p className="eyebrow">The problem</p>
            <SplitTitle id="proof-h" className="t-h1 mt-5">Attackers don’t break in anymore. They log in.</SplitTitle>
            <p className="mt-6 t-lead max-w-[520px]">A phished password and an approved MFA prompt pass every check you have. What gives them away is behaviour. That is what we watch.</p>
            <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-line pt-8">
              {THREATS.slice(0, 2).map((t) => (
                <div key={t.title}><dd className="text-[40px] font-semibold leading-none tracking-[-0.045em] text-ink md:text-[48px]"><CountUp value={t.v} /></dd><dt className="mt-3 text-[14px] leading-snug text-ink-2">{t.l}</dt><p className="mt-2 text-[12px] text-ink-4">{t.s}</p></div>
              ))}
            </dl>
          </div>
          <ul className="relative space-y-4">
            {HERO_DECISIONS.map((d, i) => (
              <Reveal as="li" key={d.label} delay={i * 120} role="group" aria-label={`Decision: ${d.label}`}
                className={cx('rounded-[20px] border border-line bg-white p-6 shadow-[0_24px_50px_-30px_rgb(12_14_20/.35)]', i === 1 && 'lg:ml-12', i === 2 && 'lg:ml-24')}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3"><span className="ptile ptile-sm"><Icon name={d.icon} size={16} /></span><span className="text-[13.5px] text-ink-3">{d.kind}</span></span>
                  <span className={`badge badge-${d.tone} badge-dot`}>{d.label}</span>
                </div>
                <p className="mt-4 text-[16px] font-semibold text-ink">{d.who}</p>
                <p className="mt-1 text-[14px] leading-snug text-ink-2">{d.what}</p>
                <p className="mt-4 flex items-center justify-between border-t border-line pt-3 font-mono text-[12px] text-ink-3"><span>{d.why}</span><span>{d.time}</span></p>
              </Reveal>
            ))}
            <li className="pt-1 text-[12.5px] text-ink-4 lg:ml-24">Sample decisions, as the products make them.</li>
          </ul>
        </div>
      </section>

      {/* 4. Products (A Yapay "all-in-one platform" cards) */}
      <Section id="platforms" labelledby="platforms-h">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHead id="platforms-h" eyebrow="The platform" title="One platform. Every identity you run on." lead="People and machines. AI agents. Personal data. Start with the risk that keeps you up at night." />
          <Link to="/products" className="btn btn-dark">All products</Link>
        </div>
        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {PLATFORMS.map((p, i) => (
            <Reveal key={p.key} delay={i * 90}>
              <Link to={p.path} className={cx('group flex h-full flex-col rounded-[24px] p-7 transition-transform duration-500 hover:-translate-y-1 md:p-8', i === 0 ? 'bg-brand text-white' : 'bg-bg-1')}>
                <span className="flex items-center justify-between"><ProductMark p={p.key} size={44} /><span className={cx('inline-flex h-10 w-10 items-center justify-center rounded-full transition', i === 0 ? 'bg-white/15' : 'bg-white')}><Icon name="ArrowUpRight" size={17} /></span></span>
                <span className={cx('mt-10 block text-[12.5px] font-medium', i === 0 ? 'text-white/70' : 'text-ink-3')}>{p.kind}</span>
                <span className={cx('mt-1 block text-[28px] font-semibold tracking-[-0.035em]', i === 0 ? 'text-white' : 'text-ink')}>{p.name}</span>
                <span className={cx('mt-2 block text-[15px] leading-relaxed', i === 0 ? 'text-white/80' : 'text-ink-2')}>{p.tagline}.</span>
                <ul className="mt-6 space-y-2">
                  {(p.key === 'zenstra' ? p.items.slice(0, 4) : p.items).map((it) => (
                    <li key={it.key} className={cx('flex items-center gap-2 text-[14px]', i === 0 ? 'text-white/90' : 'text-ink-2')}><Icon name="CheckCircle" size={15} weight="fill" className={i === 0 ? 'text-white' : 'text-brand'} />{it.name}</li>
                  ))}
                </ul>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* 5. Product screen (D Caleo): browser frame, then what makes us different */}
      <section className="sec bg-bg-1" aria-labelledby="live-h">
        <div className="container">
          <SectionHead id="live-h" align="center" eyebrow="See it work" title="Watch it decide. Live." lead="Four identities. Four decisions. Every one explained. Pick a tab and see why each move was allowed, held or blocked." />
          <Reveal className="mx-auto mt-14 max-w-[1120px] overflow-hidden rounded-[22px] border border-line bg-white shadow-[0_50px_100px_-50px_rgb(12_14_20/.45)]">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3"><i className="h-3 w-3 rounded-full bg-[#ff5f57]" /><i className="h-3 w-3 rounded-full bg-[#febc2e]" /><i className="h-3 w-3 rounded-full bg-[#28c840]" /><span className="mx-auto rounded-full bg-bg-1 px-4 py-1 text-[12.5px] text-ink-3">console.deepalgorithms.io</span></div>
            <HomeConsole />
          </Reveal>
          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {DIFFERENT.map(([ic, t, b], i) => (
              <Reveal key={t} delay={i * 80} className="rounded-[20px] bg-white p-7">
                <span className="ptile"><Icon name={ic} size={20} /></span>
                <h3 className="mt-6 text-[21px] font-semibold tracking-[-0.03em] text-ink">{t}</h3>
                <p className="mt-2 t-body">{b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 6. How it works: numbered steps */}
      <Section id="how" labelledby="how-h">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-20">
          <div className="lg:sticky lg:top-[calc(var(--hdr-now,var(--hdr))+40px)] lg:self-start">
            <SectionHead id="how-h" eyebrow="How it works" title="Four steps. No rip and replace." lead="The same four steps run for an employee’s session, a cloud role, a customer’s payment and an AI agent’s tool call." />
            <MediaReveal src="/img/photos/engineering.webp" width={1200} height={1800} ratio="4 / 3" className="mt-10 hidden rounded-[24px] lg:block" />
          </div>
          <ol className="divide-y divide-line border-y border-line">
            {HOW.map(([title, body, icon], k) => (
              <Reveal as="li" key={title} delay={k * 60} className="flex gap-6 py-8">
                <span className="font-mono text-[13px] text-brand">{String(k + 1).padStart(2, '0')}</span>
                <div className="flex-1">
                  <h3 className="text-[24px] font-semibold tracking-[-0.03em] text-ink md:text-[28px]">{title}</h3>
                  <p className="mt-2 max-w-[48ch] t-body">{body}</p>
                </div>
                <span className="ptile hidden sm:inline-flex"><Icon name={icon} size={20} /></span>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      {/* 7. Industries (A Yapay navy band with photo cards) */}
      <section className="band sec" aria-labelledby="industries-h">
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[720px]">
              <p className="eyebrow">Industries</p>
              <SplitTitle id="industries-h" className="t-h1 mt-5 !text-white">Built for the sectors attackers target first.</SplitTitle>
            </div>
            <ArrowLink to="/products" className="!text-[#9db8ff]">Find a product by need</ArrowLink>
          </div>
          <div className="no-scrollbar m-rail -mx-5 mt-14 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-4">
            {INDUSTRIES.map((x) => (
              <Link key={x.slug} to={x.path} className="group relative block w-[78vw] shrink-0 snap-start md:w-auto">
                <MediaReveal src={`/img/photos/${x.slug}.webp`} width={600} height={800} ratio="3 / 4" className="rounded-[20px]" />
                <div className="absolute inset-x-0 bottom-0 z-10 rounded-b-[20px] bg-[linear-gradient(0deg,rgb(8_10_18/.85),transparent)] p-6 pt-16 text-white">
                  <span className="block text-[21px] font-semibold leading-tight tracking-[-0.025em]">{x.name}</span>
                  <span className="mt-1.5 block text-[13.5px] leading-snug text-white/75">{x.desc}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 8. The numbers */}
      <Section id="numbers" labelledby="numbers-h">
        <SectionHead id="numbers-h" eyebrow="Why now" title="The numbers behind the risk." />
        <dl className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {THREATS.map((t, i) => (
            <Reveal key={t.title} delay={i * 70} className="rounded-[20px] bg-bg-1 p-7">
              <Link to={t.to} className="group block">
                <dd className="text-[44px] font-semibold leading-none tracking-[-0.05em] text-ink"><CountUp value={t.v} /></dd>
                <dt className="mt-4 text-[15px] leading-snug text-ink-2">{t.l}</dt>
                <p className="mt-6 flex items-center justify-between text-[13.5px] font-medium text-brand">{t.p}<Icon name="ArrowRight" size={14} className="transition-transform group-hover:translate-x-1" /></p>
                <p className="mt-3 text-[12px] text-ink-4">Source: {t.s}</p>
              </Link>
            </Reveal>
          ))}
        </dl>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          {CERTS.map((c) => <span key={c.code} className="badge !h-9 !px-4 !text-[13px]"><Icon name="SealCheck" size={15} weight="fill" className="text-brand" />{c.name}</span>)}
        </div>
      </Section>

      {/* 9. Press */}
      <Section id="press" labelledby="press-h">
        <SectionHead id="press-h" eyebrow="In the press" title="What the industry is saying." />
        <div className="mt-12"><Press /></div>
      </Section>

      <Faq items={FAQ} title="Got questions? We’ve got answers." />
      <ResearchCards title="Insights that keep you ahead." />
      <CtaBand title="Find your riskiest identity before an attacker does." />
    </>
  );
}
