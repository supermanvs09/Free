import { useRef, useState } from 'react';
import { KineticPill, Hud, useToastStack } from '../lib/nullmotion.jsx';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { DEPLOY } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import { Button, CountUp, Icon, Reveal, SectionHead, cx } from '../components/ui.jsx';
import { CtaBand, TrustedRow } from '../components/blocks.jsx';
import { HeroActivity } from '../components/viz/home.jsx';
import ProductMark from '../components/ProductMark.jsx';
import CirmPipeline, { STAGES } from '../components/CirmPipeline.jsx';
import Workforce from '../components/Workforce.jsx';
import { PlatformOrbit } from '../components/viz/refs.jsx';
import RoleCards from '../components/RoleCards.jsx';
import { Logo, logoTitle } from '../components/viz/kit.jsx';
import PerimeterStory from '../components/PerimeterStory.jsx';
import { Explore, Faq } from '../components/ProductKit.jsx';
import { HeistBanner } from '../components/challenge/Heist.jsx';

/* The home page reads the way a security buyer scans a vendor: what it is,
   who trusts it, what the platform covers, why it matters now, how it works,
   who it is for, how it deploys, and the questions people ask before a call. */


/* one line per product: what it does, in the buyer's words */
const PITCH = {
  adapid: 'Scores every login and every key, and stops the identity that starts behaving differently.',
  zenstra: 'Checks every AI agent action against its task before it runs, and records each decision.',
  icms: 'Turns every access to personal data into DPDPA evidence, ready before the auditor asks.',
};

const SHARED = [
  { icon: 'Lightning', h: 'Decides before damage', p: 'Inline, before the action, login, payment or request completes.' },
  { icon: 'ChatCircleText', h: 'Explains every decision', p: 'Reasons in plain language that analysts and auditors can follow.' },
  { icon: 'Cloud', h: 'Runs where your data is', p: 'Read-only connectors, agentless roles and a gateway in your VPC.' },
  { icon: 'Scales', h: 'Built for Indian regulation', p: 'Evidence mapped to DPDPA 2023, RBI and SEBI from the start.' },
];

/* Why now: the workforce changed. People are the smallest part of it; keys,
   service accounts and AI agents act on your systems around the clock. Every
   figure is sourced. */
const ADAPT = [
  { icon: 'Pulse', h: 'Catch risk as it starts.', p: 'Every identity is watched for the change in behaviour that comes before misuse, not the alert that comes after it.' },
  { icon: 'LockKey', h: 'Change access in the moment.', p: 'Ask for proof, narrow a permission or hold a session, decided by risk and context while it happens.' },
  { icon: 'Users', h: 'Cover every kind of identity.', p: 'Employees, customers, partners, keys, service accounts and AI agents, on-premises and in the cloud.' },
];
const NOW_STATS = [
  { v: '₹25.5 Cr', l: 'average cost of a data breach in India, the highest on record', s: 'IBM Cost of a Data Breach Report, 2026' },
  { v: '72 hrs', l: 'to report a personal data breach in full to the Data Protection Board', s: 'DPDP Rules, 2025' },
];

/* public incidents, as reported by the organisations and researchers named */
const INCIDENTS = [
  { d: 'Feb 2024', h: 'Change Healthcare · one password, no MFA', p: 'Attackers signed in to a remote-access portal with stolen credentials; the portal had no multi-factor authentication. Ransomware followed nine days later, disrupting claims across US healthcare. About 190 million people were affected.', ctl: 'A valid login scored on behaviour, then held', to: '/adapid-ai', s: 'UnitedHealth Group testimony to the US Senate, May 2024; HHS, Jan 2025' },
  { d: 'Sep 2023', h: 'MGM Resorts · a call to the help desk', p: 'An attacker called the IT help desk posing as an employee and had credentials reset. Hotel and casino systems were disrupted for days; MGM put the hit to its quarterly results at about $100 million.', ctl: 'A reset followed by unusual access is held', to: '/ad-security', s: 'MGM Resorts International, Form 8-K, Oct 2023' },
  { d: 'Jan 2024', h: 'Microsoft · a forgotten test account', p: 'A password spray reached a legacy, non-production test account without MFA. The attacker then used an OAuth application to read the email of senior leadership and security staff.', ctl: 'Dormant accounts and OAuth apps found and scoped', to: '/adapid-ai/nhi-security', s: 'Microsoft Security Response Center, Jan 2024' },
  { d: 'Apr–Jun 2024', h: 'Snowflake customer accounts · stolen by malware', p: 'Credentials taken from employee laptops by infostealer malware were used to sign in to customer accounts that had no MFA. About 165 organisations were notified.', ctl: 'Credentials used from new infrastructure flagged', to: '/adapid-ai', s: 'Mandiant (Google Cloud), UNC5537, Jun 2024' },
  { d: 'Aug 2025', h: 'Salesloft Drift · an AI integration’s tokens', p: 'OAuth tokens held by an AI chat integration were used to export Salesforce data from customer instances between 8 and 18 August, and to search it for further credentials.', ctl: 'Scoped, expiring grants per agent', to: '/agentic-ai/agentic-identity', s: 'Google Threat Intelligence Group, Aug 2025' },
  { d: '2024', h: 'India · “digital arrest” scams', p: 'Victims are held on video calls by people posing as police or regulators and pressured to transfer money themselves, through their own banking apps. Indians lost ₹120.3 crore this way in January to April 2024.', ctl: 'A coached payment held before it leaves', to: '/adapid-ai/fraud-prevention', s: 'Indian Cyber Crime Coordination Centre (I4C), MHA, 2024' },
];

const FAQ = [
  { title: 'What does Deep Algorithms do?', body: 'We secure the identities attackers use to get in: people, machine identities and AI agents. adapID AI covers people, keys, service accounts and fraud. Zenstra AI covers AI agents. ICMS covers PII and DPDPA compliance.' },
  { title: 'Which product should we start with?', body: 'Start with the risk that costs you most today; each product runs on its own. Agents acting on your systems: Zenstra. Logins, cloud keys, Active Directory or fraud: adapID. Personal data and DPDPA: ICMS.' },
  { title: 'Do we have to move our data?', body: 'No. adapID uses read-only connectors and one read-only role per AWS account, Zenstra runs as a gateway inside your VPC, and ICMS connects to the stores that already hold personal data.' },
  { title: 'Which certifications do you hold?', body: 'ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001 for AI management and ISO/IEC 27701 for privacy. Compliance documentation is available on request.' },
  { title: 'Do you map to Indian regulation?', body: 'Yes. Evidence is mapped to the DPDP Act 2023 and the DPDP Rules 2025, and to RBI and SEBI expectations, from the start rather than added for an audit.' },
  { title: 'What happens in a demo?', body: 'A 30-minute session with a Deep Algorithms engineer, on your own environment where you want it, with your own questions. For AWS, you can connect a sandbox account with a read-only role and walk through the results together.' },
];


function WhyNow() {
  return (
    <section className="sec wash relative" aria-labelledby="now-h">
      <div className="wrap relative">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
          <Reveal up><Workforce /></Reveal>
          <div>
            <p className="eyebrow">Why identity, why now</p>
            <h2 id="now-h" className="t-h2 mt-5">Your workforce has changed. Your identity security has to change with it.</h2>
            <p className="t-lead mt-5">People are now the smallest part of it. Keys, service accounts and AI agents act on your systems day and night, and most were never reviewed by anyone. Deep Algorithms finds, governs and protects every one of them, from one place.</p>
            <ul className="mt-9 grid gap-6">
              {ADAPT.map((a) => (
                <li key={a.h} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-[#eef5fc] text-[#0a6dbb]"><Icon name={a.icon} size={20} /></span>
                  <span><span className="block text-[16.5px] font-semibold tracking-[-0.01em] text-ink">{a.h}</span><span className="mt-1 block text-[15px] leading-relaxed text-ink-2">{a.p}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[18px] border border-line bg-line md:grid-cols-2">
          {NOW_STATS.map((n) => (
            <div key={n.v} className="flex items-center gap-6 bg-bg-1 p-6 md:p-7">
              <p className="shrink-0 font-semibold tracking-[-0.04em] text-ink" style={{ fontSize: 'clamp(34px, 3.2vw, 46px)', lineHeight: 1 }}><CountUp value={n.v} /></p>
              <p><span className="block text-[15px] leading-snug text-ink-2">{n.l}</span><span className="mt-1.5 block text-[12.5px] text-ink-3">Source: {n.s}</span></p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Desktop: the products as an explorer, the way enterprise platforms show
   theirs: pick one on the left, see what it does, what it covers and what it
   works with on the right. */
const WORKS = {
  adapid: { label: 'Connects to', logos: ['okta', 'entra', 'ad', 'aws', 'm365', 'google'] },
  zenstra: { label: 'Connects to', logos: ['copilotstudio', 'claude', 'cursor', 'n8n', 'langgraph', 'zapier'] },
};
function PlatformExplorer() {
  const [on, setOn] = useState(0);
  const L = PRODUCT_MENU[on];
  const dep = DEPLOY.find(([n]) => n === L.name)?.[2];
  const key = (e) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const from = PRODUCT_MENU.findIndex((l) => `px-${l.key}` === e.target.id); // move from the tab that has focus
    const n = ((from < 0 ? on : from) + d + PRODUCT_MENU.length) % PRODUCT_MENU.length;
    setOn(n);
    document.getElementById(`px-${PRODUCT_MENU[n].key}`)?.focus();
  };
  return (
    <div className="mt-12 grid gap-5 max-md:hidden lg:grid-cols-[340px_minmax(0,1fr)]">
      <div role="tablist" aria-label="Products" aria-orientation="vertical" onKeyDown={key} className="grid gap-2 md:grid-cols-2 lg:grid-cols-1">
        {PRODUCT_MENU.map((l, i) => (
          <button key={l.key} id={`px-${l.key}`} type="button" role="tab" aria-selected={i === on} aria-controls="px-panel" tabIndex={i === on ? 0 : -1} onClick={() => setOn(i)}
            className={cx('relative flex items-center gap-4 rounded-[16px] border p-4 text-left transition-all duration-300', i === on ? 'border-line-2 bg-bg-1 shadow-[0_18px_40px_-28px_rgba(6,25,55,.45)]' : 'border-transparent hover:bg-fg/[.03]')}
            style={{ '--acc': l.acc }}>
            <span aria-hidden="true" className={cx('absolute bottom-4 left-0 top-4 w-[3px] rounded-full transition-opacity', i === on ? 'opacity-100' : 'opacity-0')} style={{ background: l.acc }} />
            <ProductMark p={l.key} size={40} />
            <span className="min-w-0">
              <span className="block text-[16.5px] font-semibold tracking-[-0.01em]">{l.name}</span>
              <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-3">{l.blurb.replace(/, in one platform$/, '')}</span>
            </span>
          </button>
        ))}
      </div>
      <div id="px-panel" role="tabpanel" aria-labelledby={`px-${L.key}`} key={L.key} className="fadein card relative overflow-hidden p-8 xl:p-10" style={{ '--acc': L.acc }}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-[.14] blur-3xl" style={{ background: L.acc }} />
        <div className="relative grid gap-10 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div>
            <p className="text-[12.5px] font-semibold uppercase tracking-[.1em]" style={{ color: L.acc }}>{L.blurb.replace(/, in one platform$/, '')}</p>
            <h3 className="mt-3 text-[30px] font-semibold leading-tight tracking-[-0.025em]">{L.name}</h3>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{PITCH[L.key]}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to={L.path} arrow>Explore {L.name}</Button>
              <Button to="/request-demo" variant="ghost">Book a demo</Button>
            </div>
          </div>
          <div className="space-y-6">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">{L.kind === 'products' ? 'Products' : 'What it covers'}</p>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {L.items.slice(0, 4).map((m) => (
                  <li key={m.name}>
                    <Link to={m.path} className="group flex items-center gap-2.5 py-2.5 text-[15px] text-ink hover:text-cyan-2">
                      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0" style={{ color: L.acc }}><path d="m3 7.3 2.6 2.5L11 4.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span className="flex-1">{m.name}</span>
                      <Icon name="ArrowRight" size={13} className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {WORKS[L.key] ? (
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">{WORKS[L.key].label}</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {WORKS[L.key].logos.map((k) => <li key={k} title={logoTitle(k)} className="flex h-11 w-11 items-center justify-center rounded-[11px] border border-line bg-white text-[#12171f]"><Logo k={k} size={22} /><span className="sr-only">{logoTitle(k)}</span></li>)}
                </ul>
              </div>
            ) : (
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">Protects</p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{L.covers.replace(/^For /, '')}</p>
              </div>
            )}
            {dep && <p className="flex gap-2.5 rounded-[12px] bg-fg/[.035] p-3.5 text-[14px] leading-snug text-ink-2"><Icon name="HardDrives" size={18} className="mt-0.5 shrink-0 text-ink-3" />{dep}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Phones: the products as an accordion, the first one open, so the page
   stays short and each product is one tap from its detail. */
function PlatformAccordion() {
  return (
    <div className="mt-10 overflow-hidden rounded-[16px] border border-line bg-bg-1 md:hidden">
      {PRODUCT_MENU.map((l, i) => (
        <details key={l.key} open={i === 0} className="acc group border-b border-line last:border-0" style={{ '--acc': l.acc }}>
          <summary className="flex cursor-pointer list-none items-center gap-3.5 p-4 [&::-webkit-details-marker]:hidden">
            <ProductMark p={l.key} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block text-[16.5px] font-semibold">{l.name}</span>
              <span className="block truncate text-[13px] text-ink-3">{l.blurb.replace(/, in one platform$/, '')}</span>
            </span>
            <Icon name="CaretDown" size={16} className="shrink-0 text-ink-3 transition-transform duration-300 group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-5">
            <p className="text-[15px] leading-relaxed text-ink-2">{PITCH[l.key]}</p>
            <ul className="mt-3">
              {l.items.slice(0, 3).map((m) => (
                <li key={m.name}><Link to={m.path} className="flex items-center gap-2.5 py-2 text-[15px] text-ink"><Icon name="CheckCircle" size={17} weight="fill" style={{ color: l.acc }} />{m.name}</Link></li>
              ))}
            </ul>
            <Link to={l.path} className="link mt-3 text-[15px]">Explore {l.name}<Icon name="ArrowRight" size={14} weight="bold" /></Link>
          </div>
        </details>
      ))}
    </div>
  );
}

export default function Home() {
  const incRef = useRef(null);
  useToastStack(incRef);
  return (
    <>
      <Seo path="/" description="Deep Algorithms is an identity security platform for people, machine identities and AI agents: products that stop identity attacks, fraud and data misuse before they become a breach. ISO 27001, SOC 2 Type II. Built in India for regulated industries." />

      {/* hero: what we are, in one sentence, and the product picture beside it */}
      <section className="stage band-brand hero-under relative overflow-hidden" aria-labelledby="hero-h">
        <div className="wrap relative grid items-center gap-12 pb-14 pt-10 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-14 lg:pb-20 lg:pt-24">
          <div className="max-w-[620px] max-md:mx-auto max-md:text-center">
            <h1 id="hero-h" className="t-hero rise" style={{ '--d': '60ms' }}>Identity security for the AI era.</h1>
            <KineticPill className="rise mt-5" style={{ '--d': '100ms' }} lead="Verifies every" words={['person', 'service account', 'AI agent', 'cloud key', 'payment']} tail="before it acts." />
            <p className="t-lead rise mt-6 max-w-[540px] max-md:mx-auto" style={{ '--d': '120ms' }}>Discover every human, machine and AI agent identity. Learn how each one should behave, and stop the one that doesn’t, in milliseconds, with the reason why.</p>
            <div className="rise mt-9 flex flex-wrap gap-3 max-md:flex-col max-md:[&>*]:w-full" style={{ '--d': '180ms' }}>
              <Button to="/request-demo" size="lg" arrow>Book a demo</Button>
              <Explore label="See how it works" target="#how" variant="ghost" />
            </div>
            <p className="rise mt-5 text-[14px] text-ink-3 max-md:text-center" style={{ '--d': '220ms' }}>
              or <Link to="/product-tour" className="font-medium text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink">take the product tour</Link>, in ten steps
            </p>
          </div>
          <div className="rise relative" style={{ '--d': '220ms' }}>
            <Hud label="Live · Protected"><HeroActivity /></Hud>
          </div>
        </div>
        <TrustedRow />
      </section>

      {/* the Prompt Heist challenge, right under the hero */}
      <HeistBanner />

      {/* how it works: adapID CIRM as one platform view */}
      <section id="how" className="sec scroll-mt-20" aria-labelledby="how-h">
        <div className="wrap">
          <div className="island tone-d px-4 py-14 md:px-10 md:py-20">
            <SectionHead id="how-h" eyebrow="How it works" title="From first discovery to the auditor’s record. On every identity." lead="adapID CIRM finds every identity you have, learns how each one behaves, and acts the moment one changes, through the tools you already run." />
            <Reveal up className="mx-auto mt-12 max-w-[1120px] max-md:hidden"><CirmPipeline /></Reveal>
            {/* phones: the seven stages as a short numbered list, the way enterprise sites fold a console down */}
            <ol className="mt-8 divide-y divide-white/10 border-y border-white/10 md:hidden">
              {STAGES.map((st, i) => (
                <li key={st.n}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-4 py-4 text-left">
                      <span className="mono text-[12px] text-white/50">{String(i + 1).padStart(2, '0')}</span>
                      <span className="flex-1 text-[17px] font-semibold text-white">{st.n}</span>
                      <span aria-hidden="true" className="text-[20px] text-white/60 transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p className="pb-4 pl-9 text-[15px] leading-relaxed text-white/75">{st.d}</p>
                  </details>
                </li>
              ))}
            </ol>
            <p className="mt-8 text-center"><Link to="/adapid-ai" className="link">Explore adapID CIRM<Icon name="ArrowRight" size={14} weight="bold" /></Link></p>
          </div>
        </div>
      </section>

      <WhyNow />

      {/* the platform: three product lines, one standard */}
      <section id="platform" className="sec scroll-mt-20" aria-labelledby="platform-h">
        <div className="wrap">
          <SectionHead id="platform-h" eyebrow="The platform" title="One platform. Three product lines. Every identity, human or machine." lead="Start with the risk that costs you most today. Each product runs on its own, connects to the identity providers, clouds, apps and AI tools you already run, and explains every decision it makes." />
          <Reveal up className="mx-auto mt-6 max-w-[900px] md:mt-2"><PlatformOrbit /></Reveal>
          <PlatformAccordion />
          <PlatformExplorer />
          <Reveal className="mt-6 grid gap-px overflow-hidden rounded-[16px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            {SHARED.map((w) => (
              <div key={w.h} className="flex gap-4 bg-bg-1 p-5">
                <Icon name={w.icon} size={22} className="mt-0.5 shrink-0 text-cyan-2" />
                <span><span className="block text-[15px] font-semibold">{w.h}</span><span className="mt-1 block text-[14px] leading-snug text-ink-3">{w.p}</span></span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>


      {/* how attacks begin now: the three identities, told one at a time */}
      <section id="perimeter" className="sec scroll-mt-20" aria-labelledby="perimeter-h">
        <div className="wrap">
          <SectionHead align="left" id="perimeter-h" eyebrow="Where attacks begin now" title="Attackers don’t break in anymore. They log in." lead="Most access in your company no longer belongs to a person. Keys, service accounts and AI agents hold it now, and that is where attacks begin." />
          <div className="mt-14 lg:mt-6"><PerimeterStory /></div>
        </div>
      </section>

      {/* who it is for */}
      <section className="sec" aria-labelledby="roles-h">
        <div className="wrap">
          <SectionHead id="roles-h" eyebrow="Who we help" title="Built for the people who answer for a breach." lead="The same platform, seen by the teams who buy it, run it and report on it." />
          <RoleCards />
        </div>
      </section>

      {/* already happening: public incidents, and the control for each */}
      <section className="sec wash" aria-labelledby="inc-h">
        <div className="wrap">
          <SectionHead id="inc-h" eyebrow="Already happening" title="Every one of these began with an identity that looked legitimate." lead="Six public incidents, each with its source, and the Deep Algorithms control that applies to that kind of attack." />
          <ol ref={incRef} className="inc mx-auto mt-14 max-w-[1000px]">
            {INCIDENTS.map((x) => (
              <li key={x.h}>
                <span className="inc-date">{x.d}</span>
                <span className="inc-dot" aria-hidden="true" />
                <div>
                  <h3 className="inc-h">{x.h}</h3>
                  <p className="inc-p">{x.p}</p>
                  <p className="inc-meta">
                    <Link to={x.to} className="inc-ctl"><Icon name="ShieldCheck" size={14} weight="bold" />{x.ctl}</Link>
                    <span className="inc-src">Source: {x.s}</span>
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mx-auto mt-8 max-w-[1000px] text-[12.5px] text-ink-3">Public reports, summarised. Deep Algorithms was not involved in these incidents; each control shows how that class of attack is addressed.</p>
        </div>
      </section>

      <div className="alt"><Faq items={FAQ} title="What teams ask before a first call" /></div>

      <CtaBand />
    </>
  );
}
