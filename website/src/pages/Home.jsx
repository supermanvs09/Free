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
import TrustGap from '../components/home/TrustGap.jsx';
import ThreatShield from '../components/home/ThreatShield.jsx';
import ProtectAccordion from '../components/home/ProtectAccordion.jsx';
import FilmModal, { FILM, openFilm } from '../components/home/FilmModal.jsx';

/* The home page takes cisco.com as its template: a cinematic full-bleed
   hero that is one sentence and two pill buttons, a logo wall, a dark
   product stage, an accordion beside a photograph, a dark proof band, and
   the film in a white lightbox. SailPoint sets the order: promise, the new
   attack surface, threats, platform, how we help, products, proof, contact.
   1. Hero: discover every human, machine and AI agent identity.
   2. Logos.  3. Zenstra AI (its own tagline and "three ways in"), the hero's promise carried on.
   4. AI-driven threats (the Cisco film's argument: they log in), as a picture
      of every named threat stopped at the identity it targets.
   5. Continuous AI Security Posture Management: can vs should, and the console.
   6. How we help.  7. Products.  8. Proof.  9. Book a demo.
   Photographs: Unsplash and Pexels licences, credited in README.md. */

const STATS = [
  { v: '82:1', l: 'machine identities for every human identity in the average organisation.', s: 'CyberArk Identity Security Landscape, 2025' },
  { v: '97%', l: 'of organisations hit by an AI-related breach had no AI access controls in place.', s: 'IBM Cost of a Data Breach Report, 2025' },
  { v: '63%', l: 'of organisations have no AI governance policy to stop shadow AI.', s: 'IBM Cost of a Data Breach Report, 2025' },
  { v: '$670K', l: 'added to the average breach where shadow AI runs at high levels.', s: 'IBM Cost of a Data Breach Report, 2025' },
];

const LOOP = [
  { n: '01', k: 'Discover', h: 'Inventory every identity.', p: 'Connects read-only to your identity providers, clouds, SaaS and AI tools, and builds one inventory of people, workloads and AI agents, each with an owner.', icon: 'MagnifyingGlass' },
  { n: '02', k: 'Assess', h: 'Score posture continuously.', p: 'Baselines how every identity behaves, rescores it the moment something changes and ranks findings by blast radius.', icon: 'Gauge' },
  { n: '03', k: 'Enforce', h: 'Stop the unsafe action.', p: 'Steps up a login, revokes unused privilege or blocks an agent’s action inline, before it executes.', icon: 'ShieldCheck' },
  { n: '04', k: 'Prove', h: 'Record the evidence.', p: 'Records every decision with its reason, mapped to ISO/IEC 42001, the DPDP Act 2023 and RBI and SEBI expectations.', icon: 'SealCheck' },
];

/* Zenstra's own structure and wording (zenstra.ai, "One platform. Three ways in."); see docs/reference/zenstra-ai */
const ZEN_WAYS = [
  { k: 'Workflow Security', icon: 'FlowArrow', p: 'Every hop in every agent workflow, checked against its task before the next step runs.', on: 'n8n · Zapier · LangGraph · Copilot Studio', to: '/agentic-ai/runtime-enforcement' },
  { k: 'Cloud Security', icon: 'Cloud', p: 'A gateway inside your cloud, in front of every MCP server, model and API your agents call.', on: 'AWS · Azure · Google Cloud · Kubernetes', to: '/agentic-ai/mcp-security' },
  { k: 'Zenstra AI Discovery', icon: 'Laptop', p: 'Every agent on staff devices: prompt, tool call and device seen together, contained in seconds.', on: 'Windows · macOS · Intune · Jamf', to: '/agentic-ai/agent-discovery' },
];

/* the three product lines, Zenstra first: it carries the AI agent story */
const PLATFORM = [
  { key: 'zenstra', img: 'photos/developer-night', secures: 'AI agents and AI use', line: 'Discovers every AI agent and MCP server, scopes its access to its task, and keeps secrets and personal data out of AI prompts.' },
  { key: 'adapid', img: 'photos/contactless-pay', secures: 'human and machine identities', line: 'Scores every login, key and service account continuously, and stops the identity that starts behaving differently.' },
  { key: 'icms', img: 'photos/government', secures: 'personal data for DPDPA', line: 'Finds personal data across your estate, checks purpose and consent on every access and produces DPDPA evidence on demand.' },
];

const Play = ({ size = 16 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

const PROOF = [
  ['Read-only connectors', 'Connects to your identity providers, clouds and SaaS without write access.'],
  ['Runs where your data lives', 'Deploys in your cloud or data centre; your data never leaves your control.'],
  ['Evidence regulators accept', 'Maps every decision to the DPDP Act 2023, RBI and SEBI expectations.'],
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

      {/* 3 · ZENSTRA AI: the hero's promise carried on to AI agents, in Zenstra's own words */}
      <section id="agents" className="sec scroll-mt-20" aria-labelledby="zen-h" style={{ '--acc': 'var(--color-zen)' }}>
        <div className="wrap">
          <div className="hm-zen tone-d">
            <img className="hm-zen-bg" src="/img/zenstra/agent.webp" alt="" loading="lazy" decoding="async" />
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
              <figure className="hm-zen-shot min-w-0">
                <img src="/img/zenstra/console-overview.webp" alt="The Zenstra AI security overview: agents governed, open detections, actions blocked, decisions per second and the highest-risk agents." width="1600" height="1000" loading="lazy" decoding="async" />
              </figure>
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

      {/* 4 · AI-DRIVEN THREATS: the Cisco film's argument, and the threats we stop, as a picture */}
      <section id="threat" className="sec wash scroll-mt-20" aria-labelledby="threat-h">
        <div className="wrap">
          <SectionHead id="threat-h" eyebrow="AI-driven threats" title="Attackers don’t break in anymore. They log in." lead="AI hands attackers convincing phishing, cloned voices and stolen tokens at scale, and AI agents add identities nobody reviews. Deep Algorithms stops each threat at the identity it targets, before it executes." />
          <Reveal up delay={80} className="mt-12 min-w-0"><ThreatShield /></Reveal>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
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

      {/* 5 · CONTINUOUS AI SECURITY POSTURE MANAGEMENT: how the gap closes */}
      <section id="aispm" className="sec scroll-mt-20" aria-labelledby="aispm-h">
        <div className="wrap">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
            <Reveal className="max-lg:text-center">
              <p className="eyebrow mb-6">The Deep Algorithms platform</p>
              <h2 id="aispm-h" className="t-h2">Continuous AI Security Posture Management</h2>
              <p className="hm-sub mt-4 max-lg:mx-auto">Securing your identities and digital ecosystem from AI-driven threats.</p>
              <p className="t-lead mt-5">Authentication answers whether an identity can get in. Deep Algorithms asks whether it should be doing what it is doing, right now, for every human, machine and AI agent, across the identity systems you already run.</p>
              <ol className="hm-loopl mt-8 text-left max-lg:mx-auto max-lg:max-w-[520px]">
                {LOOP.map((x) => (
                  <li key={x.k}>
                    <span className="hm-loopl-ico"><Icon name={x.icon} size={18} /></span>
                    <span><b>{x.k}.</b> {x.p}</span>
                  </li>
                ))}
              </ol>
            </Reveal>
            <Reveal up delay={100} className="min-w-0">
              <figure className="hm-photo-card">
                <img src="/img/concept/glass-cube.webp" alt="" width="1400" height="1154" loading="lazy" decoding="async" />
                <figcaption className="hm-photo-over"><TrustGap /></figcaption>
              </figure>
            </Reveal>
          </div>
          <Reveal up delay={80} className="hm-show mx-auto mt-16 max-w-[1180px] min-w-0">
            <PostureConsole />
          </Reveal>
        </div>
      </section>

      {/* 6 · HOW WE HELP (SailPoint): accordion beside a photograph */}
      <section id="protect" className="sec wash scroll-mt-20" aria-labelledby="protect-h">
        <div className="wrap">
          <Reveal className="max-w-[760px] max-lg:mx-auto max-lg:text-center">
            <p className="eyebrow mb-6">How we help</p>
            <h2 id="protect-h" className="t-h2">Every attack that starts with a trusted identity.</h2>
          </Reveal>
          <Reveal up delay={80} className="mt-12 min-w-0"><ProtectAccordion /></Reveal>
        </div>
      </section>

      {/* 7 · PRODUCTS */}
      <section id="platform" className="sec scroll-mt-20" aria-labelledby="platform-h">
        <div className="wrap">
          <SectionHead id="platform-h" eyebrow="Products" title="Three products. One posture across every identity." lead="Start with the risk that costs you most. Each product deploys on its own and reports into the same posture, so your security team works from one view." />
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PLATFORM.map((x, i) => {
              const L = menu[x.key];
              return (
                <Reveal key={x.key} delay={i * 90} className="hm-prod card flex flex-col overflow-hidden" style={{ '--acc': L.acc }}>
                  <div className="hm-prod-img"><img src={`/img/${x.img}.webp`} alt="" width="1100" height="619" loading="lazy" decoding="async" /></div>
                  <div className="flex flex-1 flex-col p-7 xl:p-8">
                  <div className="flex items-center gap-3.5">
                    <ProductMark p={x.key} size={40} />
                    <span><span className="block text-[19px] font-semibold tracking-[-0.015em]">{L.name}</span><span className="block text-[13.5px] font-medium" style={{ color: L.acc }}>Secures {x.secures}</span></span>
                  </div>
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

      {/* 8 · PROOF: a dark band over a photograph (Cisco's "Global scale") */}
      <section className="dark hm-proof" aria-labelledby="proof-h">
        <img className="hm-proof-bg" src="/img/photos/tower-dusk.webp" alt="" loading="lazy" decoding="async" />
        <div className="wrap relative">
          <Reveal className="mx-auto max-w-[820px] text-center">
            <p className="eyebrow mb-6 justify-center">Built for regulated enterprises</p>
            <h2 id="proof-h" className="t-h2">Evidence your board, auditors and regulators accept.</h2>
          </Reveal>
          <ul className="hm-certg mt-12">
            {CERTS.map((c, i) => (
              <Reveal as="li" key={c.code} delay={i * 70}>
                <CertSeal code={c.code} size={52} />
                <b>{c.name}</b>
                <small>{c.desc}</small>
              </Reveal>
            ))}
          </ul>
          <ul className="hm-prooff mt-12">
            {PROOF.map(([h, p2]) => <li key={h}><b>{h}</b><span>{p2}</span></li>)}
          </ul>
        </div>
      </section>

      <CtaBand />
      <FilmModal />
    </>
  );
}

