import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { CERTS, DEPLOY } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import { ZCAPS } from '../data/zenstra.js';
import { Button, CountUp, Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { CtaBand, TrustedRow } from '../components/blocks.jsx';
import CertSeal from '../components/CertSeal.jsx';
import ProductMark from '../components/ProductMark.jsx';
import PostureConsole from '../components/home/PostureConsole.jsx';
import OverviewFilm from '../components/home/OverviewFilm.jsx';
import AgentMap from '../components/home/AgentMap.jsx';

/* The home page states one position and proves it, in the order a security
   buyer evaluates a vendor:
   1. what we do (hero: discover every identity; Continuous AI Security
      Posture Management) and the product doing it;
   2. why it matters now (the AI threat landscape, sourced);
   3. how it works, in 49 seconds (the overview);
   4. the operating model (discover, assess, enforce, prove);
   5. the newest attack surface, AI agents (Zenstra agent discovery);
   6. the platform behind it; 7. the proof; 8. the call to action.
   Every line is active voice: the platform is the subject, and it acts. */

const THREATS = [
  { v: '82:1', l: 'machine identities for every human identity in the average organisation.', s: 'CyberArk Identity Security Landscape, 2025' },
  { v: '97%', l: 'of organisations that suffered an AI-related breach had no AI access controls in place.', s: 'IBM Cost of a Data Breach Report, 2025' },
  { v: '63%', l: 'of organisations have no AI governance policy to stop shadow AI.', s: 'IBM Cost of a Data Breach Report, 2025' },
  { v: '$670K', l: 'added to the average breach where shadow AI runs at high levels.', s: 'IBM Cost of a Data Breach Report, 2025' },
];

const LOOP = [
  { n: '01', k: 'Discover', h: 'Inventory every identity.', p: 'Deep Algorithms connects read-only to your identity providers, clouds, SaaS and agent platforms, and builds one inventory of people, machine identities and AI agents, each with an accountable owner.', out: 'Identity inventory · owner · reach', icon: 'MagnifyingGlass' },
  { n: '02', k: 'Assess', h: 'Score posture continuously.', p: 'It baselines how each identity behaves, rescores its risk the moment something changes and ranks every finding by blast radius, not by alert volume.', out: 'Posture score · ranked findings', icon: 'Gauge' },
  { n: '03', k: 'Enforce', h: 'Stop the unsafe action.', p: 'It enforces least privilege inline: it steps up a login, revokes an unused privilege or blocks an agent’s tool call before the action executes.', out: 'Inline decision in milliseconds', icon: 'ShieldCheck' },
  { n: '04', k: 'Prove', h: 'Record audit-ready evidence.', p: 'It records every decision with its reason and maps it to ISO/IEC 42001, the DPDP Act 2023 and RBI and SEBI expectations.', out: 'Tamper-evident decision record', icon: 'SealCheck' },
];

const ZEN_POINTS = [
  'Discovers sanctioned and shadow agents across Copilot Studio, Claude, Cursor, n8n, Zapier, LangGraph and MCP servers.',
  'Flags agents that hold standing write access, non-expiring tokens or no accountable owner.',
  'Checks every tool call against the agent’s declared task before it runs.',
  'Records each decision as evidence your auditors can read.',
];

/* the three product lines, Zenstra first: it carries the AI agent story */
const PLATFORM = [
  { key: 'zenstra', secures: 'AI agents', line: 'Discovers every AI agent and MCP server, scopes its access to its task and checks every action before it runs.' },
  { key: 'adapid', secures: 'human and machine identities', line: 'Scores every login, key and service account continuously, and stops the identity that starts behaving differently.' },
  { key: 'icms', secures: 'personal data for DPDPA', line: 'Finds personal data across your estate, checks purpose and consent on every access and produces DPDPA evidence on demand.' },
];

const playOverview = () => {
  const el = document.getElementById('overview');
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: reduce ? 'auto' : 'smooth' });
  setTimeout(() => window.dispatchEvent(new Event('da:play-overview')), reduce ? 0 : 650);
};

export default function Home() {
  const menu = Object.fromEntries(PRODUCT_MENU.map((l) => [l.key, l]));
  return (
    <>
      <Seo path="/" description="Deep Algorithms delivers Continuous AI Security Posture Management. It discovers every human, machine and AI agent identity, scores its risk continuously, stops unsafe access and agent actions before they execute, and records audit-ready evidence. ISO 27001, SOC 2 Type II, ISO 42001." />

      {/* 1 · HERO */}
      <section className="hm-hero band-brand hero-under relative overflow-hidden" aria-labelledby="hero-h">
        <div aria-hidden="true" className="hm-hero-grid" />
        <div className="wrap relative pb-10 pt-12 text-center md:pt-20 lg:pt-24">
          <h1 id="hero-h" className="hm-h1 rise mx-auto" style={{ '--d': '40ms' }}>Discover every human, machine and AI agent identity.</h1>
          <p className="hm-pos rise mx-auto" style={{ '--d': '110ms' }}>Continuous AI Security Posture Management</p>
          <p className="t-lead rise mx-auto mt-5 max-w-[720px]" style={{ '--d': '170ms' }}>Secure your identities and digital ecosystem from AI-driven threats. Deep Algorithms maps every identity, scores its risk around the clock and stops unsafe access before it executes.</p>
          <div className="rise mt-9 flex flex-wrap justify-center gap-3 max-sm:flex-col max-sm:[&>*]:w-full" style={{ '--d': '230ms' }}>
            <Button to="/request-demo" size="lg" arrow>Book a demo</Button>
            <Button type="button" variant="ghost" size="lg" onClick={playOverview}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
              Watch the overview <span className="text-ink-3">0:49</span>
            </Button>
          </div>
          <ul className="rise mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] font-medium text-ink-3" style={{ '--d': '280ms' }} aria-label="Certifications">
            {CERTS.map((c) => <li key={c.code} className="inline-flex items-center gap-2"><Icon name="SealCheck" size={16} className="text-[#0a6dbb]" />{c.name}</li>)}
          </ul>
        </div>
        <div className="wrap relative pb-14 md:pb-20">
          <div className="rise mx-auto max-w-[1120px]" style={{ '--d': '320ms' }}><PostureConsole /></div>
        </div>
        <TrustedRow />
      </section>

      {/* 2 · THE AI THREAT LANDSCAPE */}
      <section className="sec" aria-labelledby="threat-h">
        <div className="wrap">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16">
            <Reveal className="blur-in max-lg:text-center">
              <p className="eyebrow mb-6">The AI threat landscape</p>
              <h2 id="threat-h" className="t-h2">AI changed who acts inside your enterprise. Attackers adapted first.</h2>
            </Reveal>
            <Reveal delay={80} className="max-lg:text-center">
              <p className="t-lead">Machine identities and AI agents now outnumber your people. They hold standing access to your most sensitive systems and act without review, and most security programmes cannot see them.</p>
              <p className="mt-5 text-[16px] leading-relaxed text-ink-2">Deep Algorithms closes that gap. It gives your security team one continuous view of every identity’s posture, and the controls to act on it.</p>
            </Reveal>
          </div>
          <ul className="mt-14 grid gap-px overflow-hidden rounded-[20px] border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
            {THREATS.map((x, i) => (
              <Reveal as="li" key={x.v} delay={i * 70} className="hm-stat bg-bg-1 p-7">
                <p className="hm-stat-v"><CountUp value={x.v} /></p>
                <p className="mt-4 text-[15.5px] leading-snug text-ink">{x.l}</p>
                <p className="mt-5 text-[12.5px] text-ink-3">Source: {x.s}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* 3 · OVERVIEW FILM (dark band) */}
      <section id="overview" className="hm-ov sec scroll-mt-24" aria-labelledby="ov-h">
        <div className="wrap">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.4fr)] lg:gap-14">
            <Reveal className="max-lg:text-center">
              <p className="eyebrow mb-6">Overview</p>
              <h2 id="ov-h" className="t-h2">Close the trust gap between sign‑in and action.</h2>
              <p className="t-lead mt-5">Authentication tells you who signed in. Deep Algorithms tells you what every identity does next, and stops the action that breaks policy.</p>
              <ul className="mt-8 grid gap-3 text-left max-lg:mx-auto max-lg:max-w-[440px]">
                {['How attackers exploit trusted identities', 'Why AI agents widen the gap', 'How the platform discovers, assesses, enforces and proves'].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[15.5px] text-ink-2"><Icon name="CheckCircle" size={20} weight="fill" className="mt-0.5 shrink-0 text-[#0a6dbb]" />{t}</li>
                ))}
              </ul>
            </Reveal>
            <Reveal up delay={100} className="min-w-0"><OverviewFilm /></Reveal>
          </div>
        </div>
      </section>

      {/* 4 · HOW IT WORKS: the continuous loop */}
      <section id="how" className="sec wash scroll-mt-20" aria-labelledby="how-h">
        <div className="wrap">
          <SectionHead id="how-h" eyebrow="How it works" title="One continuous loop. Every identity, every action." lead="Point-in-time access reviews miss what changes between audits. Deep Algorithms runs four controls continuously, across your cloud, SaaS, on-premises and AI estate." />
          <ol className="hm-loop mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {LOOP.map((s, i) => (
              <Reveal as="li" key={s.k} delay={i * 90} className="hm-step card p-7">
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-[12px] bg-[#0a6dbb] text-white"><Icon name={s.icon} size={22} /></span>
                  <span className="mono text-[13px] font-medium text-ink-3">{s.n}</span>
                </div>
                <p className="mt-6 text-[13px] font-semibold uppercase tracking-[.12em] text-cyan-2">{s.k}</p>
                <h3 className="mt-2 text-[21px] font-semibold leading-snug tracking-[-0.02em]">{s.h}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{s.p}</p>
                <p className="hm-out mt-6"><span>Output</span>{s.out}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 5 · ZENSTRA: AI agent discovery */}
      <section id="agents" className="sec scroll-mt-20" aria-labelledby="zen-h" style={{ '--acc': 'var(--color-zen)' }}>
        <div className="wrap">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-16">
            <Reveal className="max-lg:text-center">
              <div className="inline-flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-[12px] border border-line-2 bg-white"><ProductMark p="zenstra" size={28} /></span>
                <span className="text-left"><span className="block text-[15px] font-semibold">Zenstra AI</span><span className="block text-[13.5px] text-ink-3">Agent discovery</span></span>
              </div>
              <h2 id="zen-h" className="t-h2 mt-7">Find every AI agent before it acts on your data.</h2>
              <p className="t-lead mt-5">Teams launch agents faster than security can review them. Zenstra discovers every copilot, cloud agent, workflow automation, coding agent and MCP server in your enterprise, and assigns each one an accountable owner.</p>
              <ul className="mt-8 grid gap-3.5 text-left max-lg:mx-auto max-lg:max-w-[560px]">
                {ZEN_POINTS.map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[15.5px] leading-relaxed text-ink-2"><Icon name="CheckCircle" size={20} weight="fill" className="mt-0.5 shrink-0" style={{ color: 'var(--color-zen)' }} />{t}</li>
                ))}
              </ul>
              <div className="mt-9 flex flex-wrap gap-3 max-lg:justify-center max-sm:flex-col max-sm:[&>*]:w-full">
                <Button to="/agentic-ai/agent-discovery" arrow>Explore agent discovery</Button>
                <Button to="/agentic-ai/agentic-identity" variant="ghost">See the Zenstra platform</Button>
              </div>
            </Reveal>
            <Reveal up delay={100} className="min-w-0"><AgentMap /></Reveal>
          </div>
          <Reveal className="mt-14">
            <p className="text-center text-[13px] font-semibold uppercase tracking-[.12em] text-ink-3">Zenstra secures the full agent lifecycle</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

      {/* 6 · THE PLATFORM */}
      <section id="platform" className="sec scroll-mt-20" aria-labelledby="platform-h">
        <div className="wrap">
          <SectionHead id="platform-h" eyebrow="The platform" title="One posture across human, machine and AI identities." lead="Start with the risk that costs you most. Each product deploys on its own and reports into the same posture, so your security team works from one view." />
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PLATFORM.map((x, i) => {
              const L = menu[x.key];
              return (
                <Reveal key={x.key} delay={i * 90} className="hm-prod card flex flex-col p-7 xl:p-8" style={{ '--acc': L.acc }}>
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
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7 · PROOF: certified, and it runs where your data lives */}
      <section className="sec wash" aria-labelledby="proof-h">
        <div className="wrap">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
            <Reveal className="max-lg:text-center">
              <p className="eyebrow mb-6">Built for regulated enterprises</p>
              <h2 id="proof-h" className="t-h2">Evidence your board, auditors and regulators accept.</h2>
              <p className="t-lead mt-5">Deep Algorithms holds the certifications regulated enterprises require. It deploys inside your environment with read-only connectors, so your data never leaves your control.</p>
              <ul className="mt-9 grid gap-3 text-left sm:grid-cols-2">
                {CERTS.map((c) => (
                  <li key={c.code} className="card flex items-center gap-3.5 p-4">
                    <CertSeal code={c.code} size={44} />
                    <span><span className="block text-[14.5px] font-semibold">{c.name}</span><span className="block text-[12.5px] leading-snug text-ink-3">{c.desc}</span></span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100}>
              <div className="card overflow-hidden">
                <p className="border-b border-line px-6 py-4 text-[13px] font-semibold uppercase tracking-[.12em] text-ink-3">Where each product runs</p>
                <ul className="divide-y divide-line">
                  {DEPLOY.map(([name, acc, where]) => (
                    <li key={name} className="flex gap-4 px-6 py-5">
                      <ProductMark p={name} size={30} />
                      <span><span className="block text-[16px] font-semibold">{name}</span><span className="mt-1 block text-[14.5px] leading-relaxed text-ink-2">{where}</span></span>
                    </li>
                  ))}
                  <li className="flex gap-4 px-6 py-5">
                    <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[#0a6dbb]/10 text-[#0a6dbb]"><Icon name="Scales" size={17} /></span>
                    <span><span className="block text-[16px] font-semibold">Mapped to Indian regulation</span><span className="mt-1 block text-[14.5px] leading-relaxed text-ink-2">Evidence maps to the DPDP Act 2023, the DPDP Rules 2025 and RBI and SEBI expectations from day one.</span></span>
                  </li>
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

