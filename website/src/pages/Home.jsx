import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { CERTS, CUSTOMERS } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import { ZCAPS } from '../data/zenstra.js';
import { Button, CountUp, Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { CtaBand } from '../components/blocks.jsx';
import CertSeal from '../components/CertSeal.jsx';
import ProductMark from '../components/ProductMark.jsx';
import PostureConsole from '../components/home/PostureConsole.jsx';
import AgentMap from '../components/home/AgentMap.jsx';
import TrustGap from '../components/home/TrustGap.jsx';
import ProtectAccordion from '../components/home/ProtectAccordion.jsx';
import FilmModal, { FILM, openFilm } from '../components/home/FilmModal.jsx';

/* The home page takes cisco.com as its template (a cinematic full-bleed
   hero with pill buttons, a logo wall, a showcase card, accordion beside a
   photograph, a dark proof band) and SailPoint's order (promise, platform,
   how we help, the new attack surface, products, proof, contact).
   The argument follows the Cisco Identity Intelligence film: attackers log
   in rather than break in; authentication checks once and access follows on
   blind trust; you cannot defend what you cannot see. So: discover every
   identity (hero), show the gap (threat), close it continuously (platform),
   then name what we stop (how we help) and prove it.
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

const ZEN_POINTS = [
  'Discovers sanctioned and shadow agents across Copilot Studio, Claude, Cursor, n8n, Zapier, LangGraph and MCP servers.',
  'Flags agents that hold standing write access, non-expiring tokens or no accountable owner.',
  'Checks every tool call against the agent’s declared task before it runs.',
  'Records each decision as evidence your auditors can read.',
];

/* the three product lines, Zenstra first: it carries the AI agent story */
const PLATFORM = [
  { key: 'zenstra', img: 'photos/developer-night', secures: 'AI agents and AI use', line: 'Discovers every AI agent and MCP server, scopes its access to its task, and keeps secrets and personal data out of AI prompts.' },
  { key: 'adapid', img: 'photos/contactless-pay', secures: 'human and machine identities', line: 'Scores every login, key and service account continuously, and stops the identity that starts behaving differently.' },
  { key: 'icms', img: 'photos/government', secures: 'personal data for DPDPA', line: 'Finds personal data across your estate, checks purpose and consent on every access and produces DPDPA evidence on demand.' },
];

const Play = ({ size = 16 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

const PROMOS = [
  { k: 'New', t: 'Zenstra AI discovers every AI agent in your enterprise, including the shadow ones.', cta: 'Explore agent discovery', to: '/agentic-ai/agent-discovery', icon: 'Robot' },
  { k: 'Film · ' + FILM.length, t: 'One working day: see an employee, a workload, a customer and AI use protected.', cta: 'Watch the film', film: true, icon: 'Play' },
  { k: 'DPDP Rules 2025', t: 'Find, govern and prove every access to personal data before the deadlines land.', cta: 'Get DPDPA-ready', to: '/dpdpa-compliance', icon: 'Scales' },
];

const METHODS = ['Stolen credentials', 'Phishing', 'MFA fatigue', 'Session hijacking', 'Human error', 'Over-privileged AI agents'];

const PROOF = [
  ['Read-only connectors', 'Connects to your identity providers, clouds and SaaS without write access.'],
  ['Runs where your data lives', 'Deploys in your cloud or data centre; your data never leaves your control.'],
  ['Evidence regulators accept', 'Maps every decision to the DPDP Act 2023, RBI and SEBI expectations.'],
];

export default function Home() {
  const menu = Object.fromEntries(PRODUCT_MENU.map((l) => [l.key, l]));
  const names = Object.fromEntries(CUSTOMERS);
  const logos = ['meity', 'canara-bank', 'karnataka-bank', 'dcb-bank', 'ncrtc', 'iit-kanpur', 'iit-mandi', 'iiit-hyderabad', 'bhaktivedanta', 'ccoe', 'inmorphis', 'silda'];
  return (
    <>
      <Seo path="/" description="Deep Algorithms discovers every human, machine and AI agent identity in your enterprise and protects each one from AI-driven threats with Continuous AI Security Posture Management. ISO 27001, SOC 2 Type II, ISO 42001." />

      {/* 1 · HERO: cinematic, full bleed (Cisco), one promise and two actions */}
      <section className="dark hm-hx" aria-labelledby="hero-h">
        <img className="hm-hx-bg" src="/img/photos/hero-wave.webp" alt="" width="2400" height="1350" fetchpriority="high" decoding="async" />
        <div className="hm-hx-shade" aria-hidden="true" />
        <div className="wrap relative">
          <div className="hm-hx-copy">
            <p className="hm-hx-k rise" style={{ '--d': '0ms' }}>Continuous AI Security Posture Management</p>
            <h1 id="hero-h" className="hm-hx-h rise" style={{ '--d': '60ms' }}>Discover every human, machine and AI agent identity.</h1>
            <p className="hm-hx-p rise" style={{ '--d': '130ms' }}>You can’t defend what you can’t see. Deep Algorithms finds every employee, workload and AI agent across your enterprise, and stops the one that acts out of line.</p>
            <div className="hm-hx-cta rise" style={{ '--d': '190ms' }}>
              <Link to="/request-demo" className="hm-pillbtn solid">Book a demo</Link>
              <button type="button" className="hm-pillbtn" onClick={() => openFilm(0)}><Play size={12} />Watch video ({FILM.length.padStart(5, '0')})</button>
            </div>
          </div>
        </div>
        <div className="hm-hx-promos">
          <ul className="wrap">
            {PROMOS.map((x) => (
              <li key={x.cta}>
                <span className="hm-promo-ico"><Icon name={x.icon} size={18} weight={x.film ? 'fill' : 'regular'} /></span>
                <span className="hm-promo-t"><small>{x.k}</small>{x.t}</span>
                {x.film
                  ? <button type="button" className="hm-promo-a" onClick={() => openFilm(0)}>{x.cta}<Icon name="ArrowRight" size={13} weight="bold" /></button>
                  : <Link to={x.to} className="hm-promo-a">{x.cta}<Icon name="ArrowRight" size={13} weight="bold" /></Link>}
              </li>
            ))}
          </ul>
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

      {/* 3 · THE THREAT: the Cisco film's argument */}
      <section id="threat" className="sec scroll-mt-20" aria-labelledby="threat-h">
        <div className="wrap">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
            <Reveal className="max-lg:text-center">
              <p className="eyebrow mb-6">Why identity is the new perimeter</p>
              <h2 id="threat-h" className="t-h2">Attackers don’t break in anymore. They log in.</h2>
              <p className="t-lead mt-5">Why hunt for a zero-day when a stolen password, a tired employee approving an MFA prompt or an over-privileged AI agent opens the door? Once an identity passes sign-in, most organisations trust everything it does next.</p>
              <ul className="hm-methods mt-7 max-lg:justify-center" aria-label="How identity attacks start">
                {METHODS.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </Reveal>
            <Reveal up delay={100} className="min-w-0">
              <figure className="hm-photo-card">
                <img src="/img/photos/signin-late.webp" alt="A man on a late-night phone call at his laptop, the moment an MFA prompt or a caller can be used against him" width="1600" height="900" loading="lazy" decoding="async" />
                <figcaption className="hm-photo-over"><TrustGap /></figcaption>
              </figure>
            </Reveal>
          </div>
          <ul className="mt-16 grid gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
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

      {/* 4 · THE PLATFORM: Continuous AI Security Posture Management */}
      <section id="aispm" className="sec wash scroll-mt-20" aria-labelledby="aispm-h">
        <div className="wrap">
          <Reveal className="mx-auto max-w-[900px] text-center">
            <p className="eyebrow mb-6 justify-center">The Deep Algorithms platform</p>
            <h2 id="aispm-h" className="t-h2">Continuous AI Security Posture Management</h2>
            <p className="hm-sub mx-auto mt-4">Securing your identities and digital ecosystem from AI-driven threats.</p>
            <p className="t-lead mx-auto mt-6 max-w-[760px]">Deep Algorithms reaches across the identity systems you already run, discovers every human, machine and AI agent identity, and keeps checking what each one does after sign-in. It responds in proportion: watch, step up, revoke or block.</p>
          </Reveal>
          <Reveal up delay={80} className="hm-show mx-auto mt-12 max-w-[1180px] min-w-0">
            <PostureConsole />
          </Reveal>
          <ol className="hm-loop mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {LOOP.map((x, i) => (
              <Reveal as="li" key={x.k} delay={i * 80} className="hm-step">
                <span className="hm-step-ico"><Icon name={x.icon} size={20} /></span>
                <p className="mt-5 text-[12.5px] font-semibold uppercase tracking-[.12em] text-cyan-2">{x.n} · {x.k}</p>
                <h3 className="mt-2 text-[20px] font-semibold leading-snug tracking-[-0.02em]">{x.h}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">{x.p}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 5 · HOW WE HELP: what we protect you from */}
      <section id="protect" className="sec scroll-mt-20" aria-labelledby="protect-h">
        <div className="wrap">
          <Reveal className="max-w-[760px] max-lg:mx-auto max-lg:text-center">
            <p className="eyebrow mb-6">What we protect you from</p>
            <h2 id="protect-h" className="t-h2">Every attack that starts with a trusted identity.</h2>
          </Reveal>
          <Reveal up delay={80} className="mt-12 min-w-0"><ProtectAccordion /></Reveal>
        </div>
      </section>

      {/* 6 · ZENSTRA: the newest attack surface, as a banner (SailPoint) */}
      <section id="agents" className="sec scroll-mt-20" aria-labelledby="zen-h" style={{ '--acc': 'var(--color-zen)' }}>
        <div className="wrap">
          <div className="hm-zen tone-d">
            <img className="hm-zen-bg" src="/img/zenstra/agent.webp" alt="" loading="lazy" decoding="async" />
            <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
              <div className="max-lg:text-center">
                <p className="hm-zen-k"><ProductMark p="zenstra" size={22} />Zenstra AI · Agent discovery</p>
                <h2 id="zen-h" className="hm-zen-h">Find every AI agent before it acts on your data.</h2>
                <p className="hm-zen-p">AI agents sign in with valid tokens, act thousands of times a day and answer to no one. Zenstra discovers every copilot, workflow agent, coding agent and MCP server, gives each an owner and checks every action against its task.</p>
                <ul className="hm-zen-l">
                  {ZEN_POINTS.map((t) => <li key={t}><Icon name="CheckCircle" size={18} weight="fill" />{t}</li>)}
                </ul>
                <div className="mt-8 flex flex-wrap gap-3 max-lg:justify-center max-sm:flex-col max-sm:[&>*]:w-full">
                  <Link to="/agentic-ai/agent-discovery" className="hm-pillbtn solid">Explore agent discovery</Link>
                  <Link to="/agentic-ai/agentic-identity" className="hm-pillbtn">See the Zenstra platform</Link>
                </div>
              </div>
              <div className="min-w-0"><AgentMap /></div>
            </div>
          </div>
          <Reveal className="mt-10">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.values(ZCAPS).map((c) => (
                <li key={c.path}>
                  <Link to={c.path} className="hm-cap group">
                    <Icon name={c.icon} size={20} style={{ color: 'var(--color-zen)' }} />
                    <span className="flex-1"><b>{c.name}</b><small>{c.short}</small></span>
                    <Icon name="ArrowRight" size={14} className="text-ink-3 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
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

