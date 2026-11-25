import { useState } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/motion.js';
import { Seo } from '../lib/head.jsx';
import { CERTS, CUSTOMERS } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import { Button, CountUp, Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { CtaBand } from '../components/blocks.jsx';
import CertSeal from '../components/CertSeal.jsx';
import ProductMark from '../components/ProductMark.jsx';
import PostureConsole from '../components/home/PostureConsole.jsx';
import ThreatTimeline from '../components/home/ThreatTimeline.jsx';
import ZenstraCore from '../components/home/ZenstraCore.jsx';
import ProtectAccordion from '../components/home/ProtectAccordion.jsx';
import FilmModal, { FILM, openFilm } from '../components/home/FilmModal.jsx';

/* Home. Typography and restraint after cisco.com (Inter, medium-weight
   headings); information architecture after Microsoft Security (position,
   how it works, outcomes, products, proof); identity framing after Okta and
   CrowdStrike (human, machine and AI identities); threat visualisation after
   Palo Alto Networks and CrowdStrike (signals, MITRE mapping, time to
   detect). See docs/reference/benchmarks.md. Each section says one thing the
   others do not:
   1. Hero: discover every human, machine and AI agent identity.
   2. Customers.
   3. The platform: Continuous AI Security Posture Management, the live
      posture and the four things it does.
   4. Threat detection: how weak signals become a detected attack.
   5. Zenstra AI: the newest identities, AI agents.
   6. Outcomes: what changes for the business.
   7. Products.  8. Trust.  9. Book a demo. */

const STATS = [
  { v: '82:1', l: 'machine identities for every human identity in the average organisation.', s: 'CyberArk Identity Security Landscape, 2025' },
  { v: '97%', l: 'of organisations hit by an AI-related breach had no AI access controls in place.', s: 'IBM Cost of a Data Breach Report, 2025' },
  { v: '63%', l: 'of organisations have no AI governance policy to stop shadow AI.', s: 'IBM Cost of a Data Breach Report, 2025' },
  { v: '₹250 Cr', l: 'maximum penalty for failing to protect personal data under India’s DPDP Act.', s: 'Digital Personal Data Protection Act 2023, Schedule' },
];

const LOOP = [
  { k: 'Discover', h: 'Every identity, owned.', p: 'One inventory of people, workloads, keys and AI agents from your identity providers, clouds, SaaS and agent platforms, each with an accountable owner.', icon: 'MagnifyingGlass' },
  { k: 'Assess', h: 'Risk, scored continuously.', p: 'A behavioural baseline for every identity, rescored on every change and ranked by what that identity can reach.', icon: 'Gauge' },
  { k: 'Enforce', h: 'Action before impact.', p: 'Step up, revoke or block inline, in proportion to the risk, without interrupting legitimate work.', icon: 'ShieldCheck' },
  { k: 'Prove', h: 'Evidence on demand.', p: 'Every decision kept with its reason, mapped to ISO/IEC 42001, the DPDP Act 2023 and RBI and SEBI expectations.', icon: 'SealCheck' },
];

/* Zenstra's own structure and wording (zenstra.ai, "One platform. Three ways in."); see docs/reference/zenstra-ai */
const ZEN_WAYS = [
  { k: 'Workflow Security', icon: 'FlowArrow', p: 'Every hop in every agent workflow, checked against its task before the next step runs.', on: 'n8n · Zapier · LangGraph · Copilot Studio', to: '/agentic-ai/runtime-enforcement' },
  { k: 'Cloud Security', icon: 'Cloud', p: 'A gateway inside your cloud, in front of every MCP server, model and API your agents call.', on: 'AWS · Azure · Google Cloud · Kubernetes', to: '/agentic-ai/mcp-security' },
  { k: 'Zenstra AI Discovery', icon: 'Laptop', p: 'Every agent on staff devices: prompt, tool call and device seen together, contained in seconds.', on: 'Windows · macOS · Intune · Jamf', to: '/agentic-ai/agent-discovery' },
];

/* the three product lines, Zenstra first: it carries the AI agent story */
const PLATFORM = [
  { key: 'adapid', secures: 'Human and machine identities', line: 'A live risk score for every login, key and service account, with the response decided the moment behaviour changes.' },
  { key: 'zenstra', secures: 'AI agents and AI use', line: 'Every AI agent and MCP server found, owned and scoped to its task, with every action checked before it runs.' },
  { key: 'icms', secures: 'Personal data under the DPDP Act', line: 'Personal data located across your estate, every access checked for purpose and consent, and evidence produced on demand.' },
];

const Play = ({ size = 16 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

const PROOF = [
  ['Read-only by default', 'Connectors read from your identity providers, clouds and SaaS. Enforcement is switched on per policy, by you.'],
  ['Runs in your environment', 'Deploys in your cloud or data centre. Identity data and prompts stay under your control.'],
  ['Built for Indian regulation', 'Evidence maps to the DPDP Act 2023, the DPDP Rules 2025 and RBI and SEBI expectations.'],
];

export default function Home() {
  const menu = Object.fromEntries(PRODUCT_MENU.map((l) => [l.key, l]));
  const [heroPaused, setHeroPaused] = useState(false);
  const names = Object.fromEntries(CUSTOMERS);
  const logos = ['meity', 'canara-bank', 'karnataka-bank', 'dcb-bank', 'ncrtc', 'iit-kanpur', 'iit-mandi', 'iiit-hyderabad', 'bhaktivedanta', 'ccoe', 'inmorphis', 'silda'];
  return (
    <>
      <Seo path="/" description="Deep Algorithms discovers every human, machine and AI agent identity in your enterprise and protects each one from AI-driven threats with Continuous AI Security Posture Management. ISO 27001, SOC 2 Type II, ISO 42001." />

      {/* 1 · HERO (cisco.com): one sentence, two actions, a moving picture with a pause control */}
      <section className={cx('dark hm-hx', heroPaused && 'paused')} aria-labelledby="hero-h">
        <img className="hm-hx-bg" src="/img/photos/hero-wave.webp" alt="" width="2400" height="1350" fetchpriority="high" decoding="async" />
        <div className="hm-hx-shade" aria-hidden="true" />
        <button type="button" className="hm-hx-pause" onClick={() => setHeroPaused((v) => !v)} aria-label={heroPaused ? 'Play background animation' : 'Pause background animation'}>
          <Icon name={heroPaused ? 'Play' : 'Pause'} size={14} weight="fill" />
        </button>
        <div className="wrap relative">
          <div className="hm-hx-copy">
            <h1 id="hero-h" className="hm-hx-h rise" style={{ '--d': '40ms' }}>Discover every human, machine and AI agent identity.</h1>
            <div className="hm-hx-cta rise" style={{ '--d': '140ms' }}>
              <Link to="/request-demo" className="hm-pillbtn solid">Book a demo</Link>
              <button type="button" className="hm-pillbtn" onClick={() => openFilm(0)}><Play size={12} />Watch video ({FILM.length.padStart(5, '0')})</button>
            </div>
          </div>
        </div>
      </section>

      {/* 2 · TRUSTED BY (Cisco's logo wall) */}
      <section className="hm-logos" aria-labelledby="logos-h">
        <div className="wrap">
          <h2 id="logos-h" className="hm-logos-h">Trusted by banks, government and enterprises across India</h2>
          <ul className="hm-logos-g">
            {logos.map((k) => <li key={k}><img src={`/img/logos/${k}.webp`} alt={names[k]} loading="lazy" decoding="async" /></li>)}
          </ul>
        </div>
      </section>

      {/* 3 · THE PLATFORM: Continuous AI Security Posture Management */}
      <section id="aispm" className="sec scroll-mt-20" aria-labelledby="aispm-h">
        <div className="wrap">
          <Reveal className="mx-auto max-w-[880px] text-center">
            <p className="eyebrow mb-6 justify-center">The platform</p>
            <h2 id="aispm-h" className="t-h2">Continuous AI Security Posture Management</h2>
            <p className="hm-sub mx-auto mt-4">Securing your identities and digital ecosystem from AI-driven threats.</p>
            <p className="t-lead mx-auto mt-6 max-w-[740px]">Identity risk changes by the minute: a new device, a leaked key, an agent given one more tool. Deep Algorithms keeps a live posture for every human, machine and AI identity across the systems you already run, and acts on it.</p>
          </Reveal>
          <Reveal up delay={80} className="hm-show mx-auto mt-12 max-w-[1180px] min-w-0">
            <PostureConsole />
          </Reveal>
          <ol className="hm-four mt-14">
            {LOOP.map((x, i) => (
              <Reveal as="li" key={x.k} delay={i * 70}>
                <span className="hm-four-i"><Icon name={x.icon} size={20} /></span>
                <p className="hm-four-k">{x.k}</p>
                <h3 className="hm-four-h">{x.h}</h3>
                <p className="hm-four-p">{x.p}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 4 · THREAT DETECTION: how weak signals become a detected attack */}
      <section id="threat" className="sec wash scroll-mt-20" aria-labelledby="threat-h">
        <div className="wrap">
          <SectionHead id="threat-h" eyebrow="Threat detection" title="One signal is noise. A pattern is an attack." lead="With AI, attackers arrive with valid passwords, approved MFA and trusted agents, and every step looks normal on its own. Deep Algorithms learns how each identity behaves, links weak signals across identity, session, access and data, and responds before the attacker’s next move." />
          <Reveal up delay={80} className="mt-12 min-w-0"><ThreatTimeline /></Reveal>
          <p className="hm-why mt-16">Why identity is the target</p>
          <ul className="mt-5 grid gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            {STATS.map((x, i) => (
              <Reveal as="li" key={x.v} delay={i * 70} className="hm-stat bg-bg-1 p-7">
                <p className="hm-stat-v"><CountUp value={x.v} /></p>
                <p className="mt-4 text-[15.5px] leading-snug text-ink">{x.l}</p>
                <p className="mt-5 text-[12.5px] text-ink-3">Source: {x.s}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* 5 · ZENSTRA AI: the newest identities, AI agents, in Zenstra's own words */}
      <section id="agents" className="sec scroll-mt-20" aria-labelledby="zen-h" style={{ '--acc': 'var(--color-zen)' }}>
        <div className="wrap">
          <div className="hm-zen tone-d">
            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:gap-14">
              <div className="max-lg:text-center">
                <p className="hm-zen-k"><ProductMark p="zenstra" size={22} />Zenstra AI</p>
                <h2 id="zen-h" className="hm-zen-h">Secure every agent. <span>Verify every intent.</span></h2>
                <p className="hm-zen-p">Every AI agent is a new identity with real access. Zenstra checks every action before it runs, and records why.</p>
                <div className="mt-8 flex flex-wrap gap-3 max-lg:justify-center max-sm:flex-col max-sm:[&>*]:w-full">
                  <Link to="/agentic-ai/agentic-identity" className="hm-pillbtn solid">Explore Zenstra AI</Link>
                  <Link to="/agentic-ai/agent-discovery" className="hm-pillbtn">Agent discovery</Link>
                </div>
              </div>
              <div className="min-w-0"><ZenstraCore /></div>
            </div>
            <ul className="hm-zen-ways" aria-label="Three ways in">
              {ZEN_WAYS.map((w) => (
                <li key={w.k}>
                  <Link to={w.to} className="group">
                    <span className="hm-zen-wi"><Icon name={w.icon} size={18} /></span>
                    <b>{w.k}<Icon name="ArrowRight" size={14} weight="bold" className="transition-transform group-hover:translate-x-0.5" /></b>
                    <span className="hm-zen-wp">{w.p}</span>
                    <small>{w.on}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 6 · OUTCOMES: what changes for the business */}
      <section id="protect" className="sec wash scroll-mt-20" aria-labelledby="protect-h">
        <div className="wrap">
          <Reveal className="max-w-[760px] max-lg:mx-auto max-lg:text-center">
            <p className="eyebrow mb-6">Outcomes</p>
            <h2 id="protect-h" className="t-h2">What changes when every identity is governed.</h2>
          </Reveal>
          <Reveal up delay={80} className="mt-12 min-w-0"><ProtectAccordion /></Reveal>
        </div>
      </section>

      {/* 7 · PRODUCTS */}
      <section id="platform" className="sec scroll-mt-20" aria-labelledby="platform-h">
        <div className="wrap">
          <SectionHead id="platform-h" eyebrow="Products" title="Start where your risk is highest." lead="Three products share one inventory, one posture engine and one evidence record. Deploy one now and add the others when you are ready." />
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PLATFORM.map((x, i) => {
              const L = menu[x.key];
              return (
                <Reveal key={x.key} delay={i * 90} className="hm-prod card flex flex-col overflow-hidden" style={{ '--acc': L.acc }}>
                  <div className="flex flex-1 flex-col p-7 xl:p-8">
                  <ProductMark p={x.key} size={48} />
                  <p className="mt-6 text-[13px] font-semibold uppercase tracking-[.08em]" style={{ color: L.acc }}>{x.secures}</p>
                  <h3 className="mt-2 text-[24px] font-medium leading-tight">{L.name}</h3>
                  <p className="mt-5 text-[15.5px] leading-relaxed text-ink-2">{x.line}</p>
                  <ul className="mt-6 flex-1 divide-y divide-line border-y border-line">
                    {L.items.slice(0, 4).map((m) => (
                      <li key={m.name}><Link to={m.path} className="group flex items-center gap-2.5 py-2.5 text-[14.5px] text-ink hover:text-cyan-2">
                        <Icon name="Check" size={14} weight="bold" style={{ color: L.acc }} /><span className="flex-1">{m.name}</span>
                        <Icon name="ArrowRight" size={13} className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link></li>
                    ))}
                  </ul>
                  <Link to={L.path} className="link mt-6 text-[15px]" style={{ '--acc': L.acc }}>Explore {L.name}<Icon name="ArrowRight" size={14} weight="bold" /></Link>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8 · TRUST */}
      <section className="sec wash" aria-labelledby="proof-h">
        <div className="wrap">
          <SectionHead id="proof-h" eyebrow="Trust" title="Built for regulated enterprises." lead="Independently certified, deployed inside your environment and mapped to the regulations you report against." />
          <ul className="hm-certs2 mt-12">
            {CERTS.map((c, i) => (
              <Reveal as="li" key={c.code} delay={i * 70}>
                <CertSeal code={c.code} size={64} />
                <b>{c.name}</b>
                <small>{c.desc}</small>
              </Reveal>
            ))}
          </ul>
          <ul className="hm-facts mt-12">
            {PROOF.map(([h, p2]) => <li key={h}><b>{h}</b><span>{p2}</span></li>)}
          </ul>
        </div>
      </section>

      <CtaBand />
      <FilmModal />
    </>
  );
}

