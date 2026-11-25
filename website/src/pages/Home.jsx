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
import AgentMap from '../components/home/AgentMap.jsx';
import IdentityMosaic from '../components/home/IdentityMosaic.jsx';
import AttackPath from '../components/home/AttackPath.jsx';
import ThreatTabs from '../components/home/ThreatTabs.jsx';
import FilmModal, { CHAPTERS, FILM, openFilm } from '../components/home/FilmModal.jsx';

/* The home page follows the order enterprise security buyers read in
   (Cisco, SailPoint): one promise and its proof up top, then the threat, the
   attacks we stop, the operating model, the film, the newest surface (AI
   agents), the platform, the evidence and the call to action.
   1. Hero: discover every identity, shown as the brand film shows it.
   2. The threat: attackers sign in, they do not break in (the trust gap).
   3. Four AI-driven attacks, each with the product screen that stops it.
   4. Continuous AI Security Posture Management: the model and the console.
   5. The brand film.  6. Zenstra agent discovery.  7. Platform.  8. Proof.
   Every line is active voice: the platform is the subject, and it acts. */

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
  { key: 'zenstra', img: 'ai-at-work', secures: 'AI agents and AI use', line: 'Discovers every AI agent and MCP server, scopes its access to its task, and keeps secrets and personal data out of AI prompts.' },
  { key: 'adapid', img: 'employee', secures: 'human and machine identities', line: 'Scores every login, key and service account continuously, and stops the identity that starts behaving differently.' },
  { key: 'icms', img: 'office', secures: 'personal data for DPDPA', line: 'Finds personal data across your estate, checks purpose and consent on every access and produces DPDPA evidence on demand.' },
];

const Play = ({ size = 16 }) => <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

export default function Home() {
  const menu = Object.fromEntries(PRODUCT_MENU.map((l) => [l.key, l]));
  return (
    <>
      <Seo path="/" description="Deep Algorithms discovers every human, machine and AI agent identity in your enterprise and protects each one from AI-driven threats with Continuous AI Security Posture Management. ISO 27001, SOC 2 Type II, ISO 42001." />

      {/* 1 · HERO: the discovery promise, and the picture of it */}
      <section className="hm-hero band-brand hero-under relative overflow-hidden" aria-labelledby="hero-h">
        <div aria-hidden="true" className="hm-hero-grid" />
        <div className="wrap relative grid items-center gap-12 pb-14 pt-10 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] lg:gap-14 lg:pb-20 lg:pt-20">
          <div className="max-lg:text-center">
            <Link to="/agentic-ai/agent-discovery" className="hm-pill rise" style={{ '--d': '0ms' }}>
              <span className="hm-pill-new">New</span>Zenstra AI agent discovery<Icon name="ArrowRight" size={13} weight="bold" />
            </Link>
            <h1 id="hero-h" className="hm-h1 rise mt-7 max-lg:mx-auto" style={{ '--d': '60ms' }}>Discover every human, machine and AI agent identity.</h1>
            <p className="t-lead rise mt-6 max-w-[560px] max-lg:mx-auto" style={{ '--d': '130ms' }}>Deep Algorithms finds every employee, customer, workload and AI agent across your cloud, SaaS and AI tools, and shows you who owns each one, what it can reach and how risky it is right now.</p>
            <div className="rise mt-9 flex flex-wrap gap-3 max-lg:justify-center max-sm:flex-col max-sm:[&>*]:w-full" style={{ '--d': '190ms' }}>
              <Button to="/request-demo" size="lg" arrow>Book a demo</Button>
              <Button type="button" variant="ghost" size="lg" onClick={() => openFilm(0)}>
                <span className="hm-play-dot"><Play size={11} /></span>Watch the film <span className="text-ink-3">{FILM.length}</span>
              </Button>
            </div>
            <ul className="hm-certs rise mt-10 max-lg:justify-center" style={{ '--d': '250ms' }} aria-label="Certifications">
              {CERTS.map((c) => <li key={c.code}><Icon name="SealCheck" size={16} weight="fill" />{c.name}</li>)}
            </ul>
          </div>
          <div className="rise min-w-0" style={{ '--d': '200ms' }}><IdentityMosaic /></div>
        </div>
        <TrustedRow />
      </section>

      {/* 2 · THE THREAT: attackers sign in */}
      <section id="threat" className="sec scroll-mt-20" aria-labelledby="threat-h">
        <div className="wrap">
          <SectionHead id="threat-h" eyebrow="Why identity is the new perimeter" title="Attackers don’t break in. They sign in." lead="AI gives attackers convincing phishing, cloned voices and stolen session tokens at scale. They pass your login checks with valid credentials, and once a session is trusted, most security tools stop watching. That trust gap is where breaches happen." />
          <Reveal up className="mt-12 min-w-0"><AttackPath /></Reveal>
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

      {/* 3 · WHAT WE PROTECT YOU FROM */}
      <section id="protect" className="sec wash scroll-mt-20" aria-labelledby="protect-h">
        <div className="wrap">
          <SectionHead id="protect-h" eyebrow="What we protect you from" title="Four ways AI-driven attacks reach your data. One platform stops all four." lead="Each attack gets past a control that said yes: a valid login, a granted permission, a correct OTP, an approved AI tool. Deep Algorithms checks what happens next." />
          <Reveal up className="mt-12 min-w-0"><ThreatTabs /></Reveal>
        </div>
      </section>

      {/* 4 · CONTINUOUS AI SECURITY POSTURE MANAGEMENT */}
      <section id="aispm" className="sec scroll-mt-20" aria-labelledby="aispm-h">
        <div className="wrap">
          <Reveal className="mx-auto max-w-[900px] text-center">
            <p className="eyebrow mb-6 justify-center">The platform</p>
            <h2 id="aispm-h" className="t-h2">Continuous AI Security Posture Management</h2>
            <p className="hm-sub mx-auto mt-4">Securing your identities and digital ecosystem from AI-driven threats.</p>
            <p className="t-lead mx-auto mt-6 max-w-[760px]">Quarterly access reviews show you a snapshot. Attackers work in the minutes between them. Deep Algorithms runs your identity posture as a live system: it discovers, assesses, enforces and proves, for every identity, every hour of the day.</p>
          </Reveal>
          <Reveal up delay={80} className="mx-auto mt-12 max-w-[1120px] min-w-0"><PostureConsole /></Reveal>
          <ol className="hm-loop mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {LOOP.map((s, i) => (
              <Reveal as="li" key={s.k} delay={i * 80} className="hm-step">
                <span className="hm-step-ico"><Icon name={s.icon} size={20} /></span>
                <p className="mt-5 text-[12.5px] font-semibold uppercase tracking-[.12em] text-cyan-2">{s.n} · {s.k}</p>
                <h3 className="mt-2 text-[20px] font-semibold leading-snug tracking-[-0.02em]">{s.h}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">{s.p}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* 5 · THE FILM */}
      <section id="film" className="hm-film sec scroll-mt-20" aria-labelledby="film-h">
        <div className="wrap">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.45fr)] lg:gap-14">
            <Reveal className="max-lg:text-center">
              <p className="eyebrow mb-6">Watch the film · {FILM.length}</p>
              <h2 id="film-h" className="t-h2">One working day. Every identity protected.</h2>
              <p className="t-lead mt-5">Follow an employee, a workload, a customer and an engineer using AI through one working day, and see Deep Algorithms protect each of them.</p>
              <ol className="hm-chap mt-8 max-lg:mx-auto max-lg:max-w-[460px]">
                {CHAPTERS.map(([at, t, l]) => (
                  <li key={at}><button type="button" onClick={() => openFilm(at)}><span className="mono">{t}</span>{l}<Play size={12} /></button></li>
                ))}
              </ol>
            </Reveal>
            <Reveal up delay={100} className="min-w-0">
              <button type="button" className="hm-poster group" onClick={() => openFilm(0)} aria-label={`Play the Deep Algorithms film, ${FILM.length}`}>
                <img src="/img/film/poster.webp" alt="" width="1600" height="900" loading="lazy" decoding="async" />
                <span className="hm-poster-play"><Play size={26} /></span>
                <span className="hm-poster-len">{FILM.length}</span>
              </button>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 6 · ZENSTRA: AI agent discovery */}
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

      {/* 7 · THE PLATFORM */}
      <section id="platform" className="sec scroll-mt-20" aria-labelledby="platform-h">
        <div className="wrap">
          <SectionHead id="platform-h" eyebrow="The platform" title="Three products. One posture across every identity." lead="Start with the risk that costs you most. Each product deploys on its own and reports into the same posture, so your security team works from one view." />
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {PLATFORM.map((x, i) => {
              const L = menu[x.key];
              return (
                <Reveal key={x.key} delay={i * 90} className="hm-prod card flex flex-col overflow-hidden" style={{ '--acc': L.acc }}>
                  <div className="hm-prod-img"><img src={`/img/film/${x.img}.webp`} alt="" width="1100" height="619" loading="lazy" decoding="async" /></div>
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

      {/* 8 · PROOF: certified, and it runs where your data lives */}
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
      <FilmModal />
    </>
  );
}

