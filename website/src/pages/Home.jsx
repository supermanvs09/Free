import { useEffect, useRef, useState } from 'react';
import { useToastStack } from '../lib/nullmotion.jsx';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { DEPLOY } from '../data/site.js';
import { PRODUCT_MENU } from '../data/nav.js';
import { Button, CountUp, Icon, Reveal, SectionHead, cx } from '../components/ui.jsx';
import { CtaBand, TrustedRow } from '../components/blocks.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { Logo, logoTitle } from '../components/viz/kit.jsx';
import { PostureConsole } from '../components/viz/posture.jsx';
import { ZenInventory } from '../components/viz/zenstra.jsx';
import { WatchButton } from '../components/VideoModal.jsx';
import { Faq } from '../components/ProductKit.jsx';

/* The home page reads the way a security buyer scans an enterprise vendor:
   the category and the promise (Continuous AI Security Posture Management),
   who trusts it, how the control loop works and what evidence it produces,
   the AI agent problem in depth (Zenstra AI), the threats it answers, the
   product lines, the questions asked before a call, and the next step. */

/* one line per product: what it does, in the buyer's words */
const PITCH = {
  adapid: 'Scores every login, key and service account continuously, and stops the identity that starts behaving differently.',
  zenstra: 'Discovers every AI agent and MCP server, checks each action against its task before it runs and records the decision.',
  icms: 'Turns every access to personal data into DPDPA evidence, ready before the auditor asks.',
};

const SHARED = [
  { icon: 'Lightning', h: 'Blocks before the action completes', p: 'Decides inline, before a login, payment or agent request finishes.' },
  { icon: 'ChatCircleText', h: 'States the reason for every decision', p: 'Writes each reason in plain language that analysts and auditors follow.' },
  { icon: 'Cloud', h: 'Runs where your data lives', p: 'Connects read-only, without endpoint agents, and runs its gateway in your VPC.' },
  { icon: 'Scales', h: 'Maps to Indian regulation', p: 'Maps evidence to DPDPA 2023, RBI and SEBI from the first day.' },
];

/* the control loop: what Deep Algorithms does at each stage, and the
   artifact that stage leaves behind for the security team and the auditor */
const LOOP = [
  { n: '01', icon: 'MagnifyingGlass', h: 'Discover', v: 'Inventories every identity',
    p: 'Connects to your identity providers, clouds, SaaS and AI platforms, and lists every person, key, service account, AI agent and MCP server with its owner.',
    out: 'Identity and AI agent inventory, each entry with an owner', by: ['adapid', 'zenstra'] },
  { n: '02', icon: 'Gauge', h: 'Assess', v: 'Scores posture continuously',
    p: 'Learns how each identity normally behaves, ranks standing privileges, misconfigurations and shadow agents by severity, and states why.',
    out: 'Posture score and findings ranked by severity', by: ['adapid', 'zenstra'] },
  { n: '03', icon: 'ShieldCheck', h: 'Enforce', v: 'Stops the risky action',
    p: 'Steps up, holds or blocks a login, a key or an agent action inline, through the identity provider and gateway you already run.',
    out: 'One logged decision per action, with its policy', by: ['adapid', 'zenstra'] },
  { n: '04', icon: 'SealCheck', h: 'Prove', v: 'Produces audit evidence',
    p: 'Signs every decision into a tamper-evident record and maps it to DPDPA 2023, RBI and SEBI directions and ISO/IEC 42001.',
    out: 'Signed evidence record your auditors accept', by: ['zenstra', 'icms'] },
];

const NAMES = { adapid: 'adapID AI', zenstra: 'Zenstra AI', icms: 'ICMS' };

/* what Zenstra AI discovers, by where agents are built */
const AGENT_SOURCES = ['copilotstudio', 'copilot', 'claude', 'cursor', 'n8n', 'zapier', 'langgraph', 'mcp'];
const AGENT_POINTS = [
  'Discovers sanctioned and shadow agents across copilots, workflow automations, cloud and coding agents, and MCP servers',
  'Maps each agent to an owner, a credential, a declared task and the data it reaches',
  'Flags agents with no owner, standing keys, broad scopes or changed MCP tool definitions',
  'Checks every agent action against its task before it runs, from a gateway inside your VPC',
];

/* public figures, each with its source */
const THREAT_STATS = [
  { v: '₹25.5 Cr', l: 'average cost of a data breach in India, the highest on record', s: 'IBM Cost of a Data Breach Report, 2026' },
  { v: '72 hrs', l: 'to report a personal data breach in full to the Data Protection Board', s: 'DPDP Rules, 2025' },
];

/* public incidents, as reported by the organisations and researchers named;
   the AI integration first, since that is where attacks are moving */
const INCIDENTS = [
  { d: 'Aug 2025', h: 'Salesloft Drift · an AI integration’s tokens', p: 'Attackers used OAuth tokens held by an AI chat integration to export Salesforce data from customer instances between 8 and 18 August, then searched that data for further credentials.', ctl: 'Zenstra AI: scoped, expiring grants per agent', to: '/agentic-ai/agentic-identity', s: 'Google Threat Intelligence Group, Aug 2025' },
  { d: 'Jan 2024', h: 'Microsoft · a forgotten test account', p: 'A password spray reached a legacy, non-production test account without MFA. The attacker then used an OAuth application to read the email of senior leadership and security staff.', ctl: 'adapID AI: dormant accounts and OAuth apps found and scoped', to: '/adapid-ai/nhi-security', s: 'Microsoft Security Response Center, Jan 2024' },
  { d: 'Apr–Jun 2024', h: 'Snowflake customer accounts · stolen by malware', p: 'Attackers took credentials from employee laptops with infostealer malware and signed in to customer accounts that had no MFA. Snowflake customers notified about 165 organisations.', ctl: 'adapID AI: credentials used from new infrastructure flagged', to: '/adapid-ai', s: 'Mandiant (Google Cloud), UNC5537, Jun 2024' },
  { d: 'Feb 2024', h: 'Change Healthcare · one password, no MFA', p: 'Attackers signed in to a remote-access portal with stolen credentials; the portal had no multi-factor authentication. Ransomware followed nine days later and disrupted claims across US healthcare, affecting about 190 million people.', ctl: 'adapID AI: a valid login scored on behaviour, then held', to: '/adapid-ai', s: 'UnitedHealth Group testimony to the US Senate, May 2024; HHS, Jan 2025' },
];

const FAQ = [
  { title: 'What is Continuous AI Security Posture Management?', body: 'It is the practice of keeping a live inventory of every identity that can act on your systems, people, machine identities and AI agents, scoring each one’s posture all the time rather than once a quarter, stopping the action that breaks policy, and keeping the evidence. Deep Algorithms delivers it across three product lines: adapID AI for people and machine identities, Zenstra AI for AI agents and ICMS for personal data and DPDPA.' },
  { title: 'How does Zenstra AI find agents we do not know about?', body: 'Zenstra AI connects read-only to the platforms where agents are built and run, such as Microsoft Copilot Studio, n8n, Zapier, LangGraph and Cursor, and to MCP servers. It lists every agent with its owner, credentials and the data it reaches, and flags those no one has reviewed.' },
  { title: 'Do we have to move our data?', body: 'No. adapID AI uses read-only connectors and one read-only role per AWS account, Zenstra AI runs as a gateway inside your VPC, and ICMS connects to the stores that already hold personal data.' },
  { title: 'Which certifications do you hold?', body: 'ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001 for AI management and ISO/IEC 27701 for privacy. We share compliance documentation on request.' },
  { title: 'What happens in a demo?', body: 'A Deep Algorithms engineer runs a 30-minute session on your own environment where you want it, and answers your own questions. For AWS, you can connect a sandbox account with a read-only role and review the findings together.' },
];

/* The loop, as an audit-style table: stage, what we do, what evidence it
   leaves. The active stage steps forward on its own while on screen, and
   any stage can be picked. */
function ControlLoop() {
  const [on, setOn] = useState(0);
  const [auto, setAuto] = useState(true);
  const ref = useRef(null);
  useEffect(() => {
    if (!auto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let t; let seen = false;
    const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    t = setInterval(() => { if (seen) setOn((i) => (i + 1) % LOOP.length); }, 3200);
    return () => { clearInterval(t); io.disconnect(); };
  }, [auto]);
  const pick = (i) => { setAuto(false); setOn(i); };
  return (
    <div ref={ref} className="mt-14">
      {/* progress rail */}
      <div aria-hidden="true" className="relative mb-6 hidden h-[3px] overflow-hidden rounded-full bg-line lg:block">
        <span className="absolute inset-y-0 left-0 rounded-full bg-[#0a6dbb] transition-[width] duration-700 ease-out" style={{ width: `${((on + 1) / LOOP.length) * 100}%` }} />
      </div>
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {LOOP.map((s, i) => (
          <li key={s.n}>
            <button type="button" onClick={() => pick(i)} aria-pressed={i === on} aria-label={`Stage ${s.n}: ${s.h}`}
              className={cx('loop-card card flex h-full w-full flex-col p-6 text-left transition-all duration-500', i === on ? 'is-on' : 'opacity-90 hover:opacity-100')}>
              <span className="flex items-center justify-between">
                <span className={cx('grid h-11 w-11 place-items-center rounded-[12px] transition-colors duration-500', i === on ? 'bg-[#0a6dbb] text-white' : 'bg-[#eef5fc] text-[#0a6dbb]')}><Icon name={s.icon} size={22} /></span>
                <span className="mono text-[12.5px] font-medium text-ink-3">{s.n} / 04</span>
              </span>
              <span className="mt-6 block text-[13px] font-semibold uppercase tracking-[.12em] text-[#0a6dbb]">{s.h}</span>
              <span className="mt-1.5 block text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink">{s.v}</span>
              <span className="mt-3 block flex-1 text-[15px] leading-relaxed text-ink-2">{s.p}</span>
              <span className="mt-6 block border-t border-line pt-4">
                <span className="block text-[11.5px] font-semibold uppercase tracking-[.12em] text-ink-3">Evidence produced</span>
                <span className="mt-1.5 flex items-start gap-2 text-[14.5px] font-medium leading-snug text-ink"><Icon name="FileText" size={17} className="mt-0.5 shrink-0 text-[#1f9d63]" />{s.out}</span>
              </span>
              <span className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">{s.by.map((p) => <span key={p} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3"><ProductMark p={p} size={20} />{NAMES[p]}</span>)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
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
  const [on, setOn] = useState(1); // opens on Zenstra AI, the agent story told above
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
        <details key={l.key} open={l.key === 'zenstra'} className="acc group border-b border-line last:border-0" style={{ '--acc': l.acc }}>
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
      <Seo path="/" description="Deep Algorithms delivers Continuous AI Security Posture Management: it discovers every human, machine and AI agent identity, scores its posture, stops the risky action and produces audit evidence mapped to DPDPA, RBI, SEBI and ISO/IEC 42001." />

      {/* hero: the category, the promise, two actions, and the console */}
      <section className="stage band-brand hero-under relative overflow-hidden" aria-labelledby="hero-h">
        <div className="wrap relative grid items-center gap-12 pb-14 pt-10 md:pt-16 lg:grid-cols-[minmax(0,.95fr)_minmax(0,1.15fr)] lg:gap-8 lg:pb-20 lg:pt-20">
          <div className="max-w-[620px] max-md:mx-auto max-md:text-center">
            <p className="rise inline-flex items-center gap-2.5 rounded-full border border-[#0a6dbb]/25 bg-[#0a6dbb]/[.07] py-1.5 pl-2 pr-4 text-[13.5px] font-semibold text-[#0a5ea3]">
              <span className="relative flex h-2 w-2 ml-1"><span className="absolute inset-0 animate-ping rounded-full bg-[#0a6dbb]/50" /><span className="relative h-2 w-2 rounded-full bg-[#0a6dbb]" /></span>
              Continuous AI Security Posture Management
            </p>
            <h1 id="hero-h" className="t-hero rise mt-6" style={{ '--d': '60ms' }}>Discover every human, machine and AI agent identity.</h1>
            <p className="rise mt-6 text-[clamp(19px,1.7vw,23px)] font-semibold leading-snug tracking-[-0.015em] text-ink" style={{ '--d': '100ms' }}>Securing your identities and digital ecosystem from AI-driven threats.</p>
            <p className="t-lead rise mt-4 max-w-[560px] max-md:mx-auto" style={{ '--d': '140ms' }}>Deep Algorithms inventories every identity across your cloud, SaaS and AI platforms, scores its posture continuously and blocks the risky action before it runs, with audit-ready evidence for every decision.</p>
            <div className="rise mt-9 flex flex-wrap gap-3 max-md:flex-col max-md:[&>*]:w-full max-md:[&>*]:justify-center" style={{ '--d': '180ms' }}>
              <Button to="/request-demo" size="lg" arrow>Book a demo</Button>
              <WatchButton />
            </div>
            <ul className="rise mt-9 flex flex-wrap gap-x-6 gap-y-2.5 text-[14px] font-medium text-ink-2 max-md:justify-center" style={{ '--d': '220ms' }}>
              {['Agentless, read-only connectors', 'Gateway inside your VPC', 'ISO 27001 · SOC 2 Type II · ISO 42001'].map((t) => (
                <li key={t} className="flex items-center gap-2"><Icon name="CheckCircle" size={17} weight="fill" className="text-[#1f9d63]" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="rise tone-d relative lg:-mr-6" style={{ '--d': '200ms' }}>
            <PostureConsole />
          </div>
        </div>
        <TrustedRow />
      </section>

      {/* how it works: the continuous loop, and the evidence each stage leaves */}
      <section id="how" className="sec scroll-mt-20" aria-labelledby="how-h">
        <div className="wrap">
          <SectionHead id="how-h" eyebrow="How Continuous AI-SPM works" title="Four controls. One continuous loop. Evidence at every step." lead="Deep Algorithms runs the same loop on every person, machine identity and AI agent, around the clock. Each stage produces an artifact your security team acts on and your auditors accept." />
          <ControlLoop />
        </div>
      </section>

      {/* Zenstra AI: AI agent discovery, the problem in depth */}
      <section id="agents" className="sec scroll-mt-20" aria-labelledby="agents-h">
        <div className="wrap">
          <div className="island tone-d px-5 py-14 md:px-12 md:py-20">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-12">
              <div>
                <p className="flex items-center gap-2.5 text-[13.5px] font-semibold text-[#b9c3ff]"><ProductMark p="zenstra" size={28} />Zenstra AI · AI agent discovery</p>
                <h2 id="agents-h" className="t-h2 mt-6 text-white">Find every AI agent before it acts on your data.</h2>
                <p className="t-lead mt-5 text-white/75">Employees build agents in Copilot Studio, n8n, Zapier and Cursor faster than security can review them, and each holds real credentials. Zenstra AI finds every one, assigns an owner and decides each action before it runs.</p>
                <ul className="mt-8 grid gap-4">
                  {AGENT_POINTS.map((t) => (
                    <li key={t} className="flex gap-3 text-[15.5px] leading-relaxed text-white/85"><Icon name="CheckCircle" size={20} weight="fill" className="mt-0.5 shrink-0 text-[#93a2ff]" />{t}</li>
                  ))}
                </ul>
                <div className="mt-10 flex flex-wrap gap-3 max-md:flex-col max-md:[&>*]:w-full">
                  <Button to="/agentic-ai/agent-discovery" size="lg" arrow className="cta-primary">Explore agent discovery</Button>
                  <Button to="/agentic-ai/agentic-identity" variant="ghost" size="lg" className="!border-white/35 !bg-transparent !text-white hover:!bg-white/10">See the Zenstra AI platform</Button>
                </div>
              </div>
              <div>
                <Reveal up><ZenInventory /></Reveal>
                <div className="mt-6 border-t border-white/10 pt-5">
                  <p className="text-[12px] font-semibold uppercase tracking-[.12em] text-white/55">Discovers agents built on</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {AGENT_SOURCES.map((k) => <li key={k} title={logoTitle(k)} className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/10 bg-white/[.06] text-white"><Logo k={k} size={20} /><span className="sr-only">{logoTitle(k)}</span></li>)}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* the threats: sourced figures and public incidents, each mapped to a control */}
      <section className="sec wash" aria-labelledby="inc-h">
        <div className="wrap">
          <SectionHead id="inc-h" eyebrow="AI-driven threats" title="Attackers no longer break in. They sign in with identities you trust." lead="Attackers now steal tokens from AI integrations, spray forgotten accounts and replay credentials taken by malware. Each public incident below began with a legitimate identity, and each maps to a Deep Algorithms control." />
          <div className="mx-auto mt-12 grid max-w-[1000px] gap-px overflow-hidden rounded-[18px] border border-line bg-line md:grid-cols-2">
            {THREAT_STATS.map((n) => (
              <div key={n.v} className="flex items-center gap-6 bg-bg-1 p-6 md:p-7">
                <p className="shrink-0 font-semibold tracking-[-0.04em] text-ink" style={{ fontSize: 'clamp(34px, 3.2vw, 46px)', lineHeight: 1 }}><CountUp value={n.v} /></p>
                <p><span className="block text-[15px] leading-snug text-ink-2">{n.l}</span><span className="mt-1.5 block text-[12.5px] text-ink-3">Source: {n.s}</span></p>
              </div>
            ))}
          </div>
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
          <p className="mx-auto mt-8 max-w-[1000px] text-[12.5px] text-ink-3">Public reports, summarised. Deep Algorithms was not involved in these incidents; each control shows how Deep Algorithms addresses that class of attack.</p>
        </div>
      </section>

      {/* the platform: three product lines, one posture */}
      <section id="platform" className="sec scroll-mt-20" aria-labelledby="platform-h">
        <div className="wrap">
          <SectionHead id="platform-h" eyebrow="The platform" title="Three product lines. One posture view." lead="Start with the risk that costs you most today. Each product deploys on its own, connects to the identity providers, clouds, apps and AI tools you already run, and reports into one posture view." />
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

      <div className="alt"><Faq items={FAQ} title="What security teams ask before a first call" /></div>

      <CtaBand title="See your AI security posture in 30 minutes." body="A Deep Algorithms engineer walks your team through every identity and AI agent the platform finds, on your own environment, with your own questions." />
    </>
  );
}
