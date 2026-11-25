import { useState } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/motion.js';
import { Seo } from '../lib/head.jsx';
import { CERTS, CUSTOMERS } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import { CountUp, Icon, Reveal } from '../components/ui.jsx';
import { CtaBand } from '../components/blocks.jsx';
import CertSeal from '../components/CertSeal.jsx';
import ProductMark from '../components/ProductMark.jsx';
import PostureConsole from '../components/home/PostureConsole.jsx';
import { AgentScanCard, DetectionCard, InventoryCard, RecordCard } from '../components/home/AppCards.jsx';
import FilmModal, { FILM, openFilm } from '../components/home/FilmModal.jsx';

/* Home, on zenstra.ai's design system: a white page; every product picture
   is the same object (a white app window on a pale dotted stage); rows of
   text beside a window, alternating; large centred statements between
   blocks; one dark moment (the hero). Type follows the Cisco scale.
   Positioning follows the AI-SPM category (Wiz, Palo Alto Prisma AIRS,
   Microsoft Defender) and says what is different: they secure AI systems;
   Deep Algorithms secures every identity, AI agents included, against
   attacks that use AI. See docs/reference/benchmarks.md. */

/* the platform, as four rows: what it does, shown in the product */
const ROWS = [
  {
    k: 'Discover', h: 'Every identity, found and owned.',
    p: 'One inventory of every person, workload, key and AI agent, built from your identity providers, clouds, SaaS and agent platforms. Each gets an owner and a live risk score.',
    on: 'Entra ID · Okta · AWS · Azure · Google Cloud · SaaS', to: '/adapid-ai', Card: InventoryCard,
  },
  {
    k: 'Detect', h: 'Threats caught in the session, not the audit.',
    p: 'Every session is compared with how that identity normally behaves. Weak signals are linked into one detection, mapped to MITRE ATT&CK and answered inline.',
    on: 'adapID AI · Continuous identity risk', to: '/adapid-ai', Card: DetectionCard,
  },
  {
    k: 'Secure AI agents', h: 'Every agent your teams run, under control.',
    p: 'Zenstra AI scans agent platforms and staff devices, finds every agent and MCP server, gives each an owner and checks every action against its task.',
    on: 'Claude · Cursor · Copilot · n8n · Zapier · MCP', to: '/agentic-ai/agent-discovery', Card: AgentScanCard,
  },
  {
    k: 'Prove', h: 'Every decision, on the record.',
    p: 'Each decision is kept with its reason on a tamper-evident record, mapped to the DPDP Act 2023, ISO/IEC 42001 and RBI and SEBI expectations.',
    on: 'ICMS Compliance Suite · Decision record', to: '/dpdpa-compliance', Card: RecordCard,
  },
];

const STATS = [
  { v: '82:1', l: 'machine identities for every human identity', s: 'CyberArk, 2025' },
  { v: '97%', l: 'of AI-related breaches hit organisations with no AI access controls', s: 'IBM, 2025' },
  { v: '63%', l: 'of organisations have no policy to govern shadow AI', s: 'IBM, 2025' },
  { v: '₹250 Cr', l: 'maximum penalty per breach under India’s DPDP Act', s: 'DPDP Act 2023' },
];

const PRODUCTS = [
  { key: 'adapid', secures: 'Human and machine identities', line: 'A live risk score for every login, key and service account, with the response decided the moment behaviour changes.' },
  { key: 'zenstra', secures: 'AI agents', line: 'Every AI agent and MCP server found, owned and scoped to its task, with every action checked before it runs.' },
  { key: 'icms', secures: 'Personal data under the DPDP Act', line: 'Personal data located across your estate, every access checked for purpose and consent, evidence on demand.' },
];

const Play = ({ size = 16 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;
const Explore = ({ to, children = 'Explore', className }) => <Link to={to} className={cx('hm-explore', className)}>{children}<Icon name="ArrowRight" size={14} weight="bold" /></Link>;

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

      {/* 2 · CUSTOMERS */}
      <section className="hm-logos" aria-labelledby="logos-h">
        <div className="wrap">
          <h2 id="logos-h" className="hm-logos-h">Trusted by banks, government and enterprises across India</h2>
          <ul className="hm-logos-g">
            {logos.map((k) => <li key={k}><img src={`/img/logos/${k}.webp`} alt={names[k]} loading="lazy" decoding="async" /></li>)}
          </ul>
        </div>
      </section>

      {/* 3 · THE PLATFORM, in four rows */}
      <section id="aispm" className="zs-sec scroll-mt-20" aria-labelledby="aispm-h">
        <div className="wrap">
          <Reveal className="zs-head">
            <p className="zs-k">The platform</p>
            <h2 id="aispm-h" className="zs-h">Continuous AI Security Posture Management</h2>
            <p className="zs-sub">Securing your identities and digital ecosystem from AI-driven threats.</p>
            <p className="zs-lead">AI security tools secure your models and pipelines. Deep Algorithms secures the identities attacks actually use: every person, workload and AI agent, scored continuously and stopped before an unsafe action runs.</p>
          </Reveal>
          <div className="zs-rows">
            {ROWS.map(({ k, h, p, on, to, Card }, i) => (
              <div key={k} id={k === 'Secure AI agents' ? 'agents' : k === 'Detect' ? 'threat' : undefined} className={cx('zs-row scroll-mt-20', i % 2 && 'flip')}>
                <Reveal className="zs-text">
                  <p className="zs-rk">{String(i + 1).padStart(2, '0')} · {k}</p>
                  <h3 className="zs-rh">{h}</h3>
                  <p className="zs-rp">{p}</p>
                  <p className="zs-on">{on}</p>
                  <Explore to={to} />
                </Reveal>
                <Reveal up delay={80} className="zs-pic min-w-0"><Card /></Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 · STATEMENT */}
      <section className="zs-statement" aria-labelledby="why-h">
        <div className="wrap">
          <Reveal className="text-center">
            <p className="zs-k">Why Deep Algorithms</p>
            <h2 id="why-h" className="zs-big">Attacks now arrive with valid credentials. We watch what every identity does next.</h2>
            <Explore to="/why-deep-algorithms" className="mt-8">Why Deep Algorithms</Explore>
          </Reveal>
        </div>
      </section>

      {/* 5 · THE CONSOLE */}
      <section className="zs-sec" aria-labelledby="console-h">
        <div className="wrap">
          <Reveal className="zs-split">
            <div>
              <p className="zs-k">The console</p>
              <h2 id="console-h" className="zs-h">Your identity posture, on one screen.</h2>
            </div>
            <p className="zs-lead">Inventory, posture score and every finding with the action taken, where your security team already works.</p>
          </Reveal>
          <Reveal up delay={80} className="mt-12 min-w-0">
            <div className="ac-stage wide"><PostureConsole /></div>
          </Reveal>
          <ul className="zs-stats">
            {STATS.map((x) => (
              <li key={x.v}>
                <p className="zs-stat-v"><CountUp value={x.v} /></p>
                <p className="zs-stat-l">{x.l}</p>
                <p className="zs-stat-s">Source: {x.s}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6 · PRODUCTS */}
      <section id="platform" className="zs-sec tint scroll-mt-20" aria-labelledby="platform-h">
        <div className="wrap">
          <Reveal className="zs-split">
            <div>
              <p className="zs-k">Products</p>
              <h2 id="platform-h" className="zs-h">Start where your risk is highest.</h2>
            </div>
            <p className="zs-lead">Three products share one inventory, one posture engine and one decision record. Deploy one now and add the others when you are ready.</p>
          </Reveal>
          <div className="zs-prods">
            {PRODUCTS.map((x, i) => {
              const L = menu[x.key];
              return (
                <Reveal key={x.key} delay={i * 80} className="zs-prod hm-prod">
                  <ProductMark p={x.key} size={44} />
                  <p className="zs-prod-k">{x.secures}</p>
                  <h3 className="zs-prod-h">{L.name}</h3>
                  <p className="zs-prod-p">{x.line}</p>
                  <ul>
                    {L.items.slice(0, 4).map((m) => <li key={m.name}><Link to={m.path}>{m.name}</Link></li>)}
                  </ul>
                  <Explore to={L.path}>{`Explore ${L.name}`}</Explore>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7 · TRUST */}
      <section className="zs-sec" aria-labelledby="proof-h">
        <div className="wrap">
          <div className="zs-trust">
            <Reveal>
              <p className="zs-k">Trust</p>
              <h2 id="proof-h" className="zs-h">Audited the way you will audit us.</h2>
              <p className="zs-lead mt-5">Independent audits every year, deployment inside your own environment and evidence mapped to the regulations you report against.</p>
              <ul className="zs-facts">
                <li><Icon name="Check" size={16} weight="bold" />Read-only connectors; enforcement switched on by you, per policy</li>
                <li><Icon name="Check" size={16} weight="bold" />Runs in your cloud or data centre; identity data stays with you</li>
                <li><Icon name="Check" size={16} weight="bold" />Mapped to the DPDP Act 2023, the DPDP Rules 2025, RBI and SEBI</li>
              </ul>
            </Reveal>
            <ul className="zs-certs">
              {CERTS.map((c, i) => (
                <Reveal as="li" key={c.code} delay={i * 60}>
                  <CertSeal code={c.code} size={56} />
                  <b>{c.name}</b>
                  <small>{c.desc}</small>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <CtaBand />
      <FilmModal />
    </>
  );
}
