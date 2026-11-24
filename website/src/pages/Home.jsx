import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SOLUTIONS } from '../data/site.js';
import { Button, CountUp, Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { CertStrip, TrustedRow } from '../components/blocks.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { WatchButton } from '../components/VideoModal.jsx';
import { Faq } from '../components/ProductKit.jsx';
import IdentityScan from '../components/home/IdentityScan.jsx';
import Core from '../components/home/Core.jsx';
import '../components/home/home.css';

/* The home page, in the order enterprise security buyers expect it:
   1. the hero: one headline, one sentence, two actions, and a picture that
      performs the headline (discovery of every identity);
   2. why now: three sourced figures;
   3. the core: what we protect you from, layer by layer;
   4. the three product lines;
   5. proof: certifications and the industries we serve;
   6. the questions asked before a first call;
   7. the next step. */

const WHY = [
  { v: '22%', l: 'of breaches begin with stolen or misused credentials, the most common way in.', s: 'Verizon Data Breach Investigations Report, 2025' },
  { v: '82:1', l: 'machine identities for every human identity in the average organisation.', s: 'CyberArk Identity Security Landscape, 2025' },
  { v: '40%+', l: 'of agentic AI projects will be cancelled by the end of 2027, weak risk controls among the reasons.', s: 'Gartner, June 2025' },
];

const LINES = [
  { key: 'adapid', name: 'adapID AI', acc: '#3cc8f6', who: 'People and machine identities', p: 'Scores every sign-in, key and service account against its own behaviour, and stops the identity that starts acting differently.',
    pts: ['Continuous identity risk management', 'NHI security for AWS', 'Identity fraud prevention for banking', 'Active Directory security'], to: '/adapid-ai' },
  { key: 'zenstra', name: 'Zenstra AI', acc: '#93a2ff', who: 'AI agents and MCP servers', p: 'Discovers every AI agent, gives each one an owner and a scoped grant, and checks every action against its task before it runs.',
    pts: ['Agent and shadow AI discovery', 'Runtime enforcement in your VPC', 'MCP security', 'Tamper-evident decision record'], to: '/agentic-ai/agentic-identity' },
  { key: 'icms', name: 'ICMS Compliance Suite', acc: '#f4c76c', who: 'Personal data and DPDPA', p: 'Finds the personal data you hold, masks it where no one should see it and checks every access against purpose and consent.',
    pts: ['PII discovery and classification', 'Purpose and consent checks', 'Breach response within 72 hours', 'Evidence for DPDPA, RBI and SEBI'], to: '/dpdpa-compliance' },
];

const FAQ = [
  { title: 'What is Continuous AI Security Posture Management?', body: 'A live inventory of every identity that can act on your systems, people, machine identities and AI agents, with the posture of each one scored all the time rather than once a quarter, the risky action stopped before it completes, and the evidence kept. Deep Algorithms delivers it across adapID AI, Zenstra AI and ICMS.' },
  { title: 'How do you find AI agents we do not know about?', body: 'Zenstra AI connects read-only to the platforms where agents are built and run, such as Microsoft Copilot Studio, n8n, Zapier, LangGraph and Cursor, and to MCP servers. It lists every agent with its owner, its credentials and the data it reaches, and flags the ones no one has reviewed.' },
  { title: 'Do we have to move our data?', body: 'No. adapID AI uses read-only connectors and one read-only role per AWS account, Zenstra AI runs as a gateway inside your VPC, and ICMS connects to the stores that already hold personal data.' },
  { title: 'Which certifications do you hold?', body: 'ISO/IEC 27001, SOC 2 Type II, ISO/IEC 42001 for AI management and ISO/IEC 27701 for privacy. We share compliance documentation on request.' },
];

const NEXT = [
  { icon: 'Calendar', h: 'Book a demo', p: 'A 30-minute session with an engineer, on your own environment.', to: '/request-demo' },
  { icon: 'ChatCircleText', h: 'Talk to an engineer', p: 'Bring a question about your identities, agents or DPDPA.', to: '/contact' },
  { icon: 'BookOpen', h: 'Read the research', p: 'How identity attacks work, from the team that stops them.', to: '/blogs' },
];

export default function Home() {
  return (
    <>
      <Seo path="/" description="Deep Algorithms delivers Continuous AI Security Posture Management: it discovers every human, machine and AI agent identity and secures your identities and digital ecosystem from AI-driven threats." />

      {/* 1. hero */}
      <section className="stage dark hero-under home-hero relative overflow-hidden" aria-labelledby="hero-h">
        <div className="wrap relative pt-14 text-center md:pt-20">
          <p className="hh-eyebrow rise text-[13px] font-semibold uppercase tracking-[.16em]">Continuous AI Security Posture Management</p>
          <h1 id="hero-h" className="t-hero rise mt-6" style={{ '--d': '60ms' }}>Discover every human, machine and AI agent identity.</h1>
          <p className="hh-sub rise mx-auto mt-6 max-w-[640px] text-[clamp(17px,1.5vw,20px)] leading-relaxed" style={{ '--d': '120ms' }}>Then secure your identities and your digital ecosystem from AI-driven threats, continuously.</p>
          <div className="rise mt-9 flex flex-wrap justify-center gap-3 max-md:flex-col max-md:[&>*]:w-full max-md:[&>*]:justify-center" style={{ '--d': '180ms' }}>
            <Button to="/request-demo" size="lg" arrow>Book a demo</Button>
            <WatchButton className="hh-watch" label="Watch the overview" />
          </div>
        </div>
        <div className="wrap relative mt-6 md:mt-4"><IdentityScan /></div>
        <TrustedRow />
      </section>

      {/* 2. why now */}
      <section className="sec" aria-labelledby="why-h">
        <div className="wrap">
          <SectionHead align="left" id="why-h" eyebrow="Why now" title="Attackers don’t break in anymore. They log in, now at AI speed." lead="Stolen credentials, unmanaged machine identities and unreviewed AI agents are how attacks begin today. Each one is an identity your controls already trust." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {WHY.map((w, i) => (
              <Reveal key={w.v} delay={i * 80} className="why-stat card p-7">
                <p className="font-semibold tracking-[-0.04em] text-ink" style={{ fontSize: 'clamp(40px, 4vw, 56px)', lineHeight: 1 }}><CountUp value={w.v} /></p>
                <p className="mt-4 text-[15.5px] leading-relaxed text-ink-2">{w.l}</p>
                <p className="mt-4 text-[12.5px] text-ink-3">Source: {w.s}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 3. the core */}
      <Core />

      {/* 4. the product lines */}
      <section className="sec" aria-labelledby="lines-h">
        <div className="wrap">
          <SectionHead id="lines-h" eyebrow="The platform" title="One platform for every identity, human, machine and AI." lead="Start with the risk that costs you most. Each product line deploys on its own and reports into one posture view." />
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {LINES.map((l, i) => (
              <Reveal key={l.key} delay={i * 80} className="h-full">
                <Link to={l.to} className="pl-card group h-full" style={{ '--acc': l.acc }}>
                  <span className="flex items-center gap-3"><ProductMark p={l.key} size={44} /><span><span className="block text-[19px] font-semibold tracking-[-0.015em] text-white">{l.name}</span><span className="block text-[13.5px]" style={{ color: l.acc }}>{l.who}</span></span></span>
                  <p className="mt-6 text-[15.5px] leading-relaxed text-[#c9d2de]">{l.p}</p>
                  <ul className="mt-6 flex-1">{l.pts.map((x) => <li key={x}><Icon name="Check" size={16} weight="bold" className="mt-0.5 shrink-0" style={{ color: l.acc }} />{x}</li>)}</ul>
                  <span className="mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-white">Explore {l.name}<Icon name="ArrowRight" size={15} weight="bold" className="transition-transform duration-300 group-hover:translate-x-1" /></span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5. proof */}
      <section className="sec" aria-labelledby="proof-h">
        <div className="wrap">
          <SectionHead align="left" id="proof-h" eyebrow="Built for regulated industries" title="Certified to the standards your auditors use." lead="Built in India for banks, government and healthcare, and mapped to DPDPA 2023, RBI and SEBI from the first day." />
          <CertStrip className="mt-10" />
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SOLUTIONS.map((s) => (
              <li key={s.slug}>
                <Link to={`/solutions/${s.slug}`} className="card group flex h-full items-center gap-4 p-5 transition-colors hover:border-fg/25">
                  <Icon name={s.icon} size={22} className="shrink-0 text-cyan-2" />
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{s.name}</span><span className="block text-[13px] text-ink-3">{s.desc}</span></span>
                  <Icon name="ArrowRight" size={15} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6. questions */}
      <div className="alt"><Faq items={FAQ} title="What security teams ask before a first call" /></div>

      {/* 7. next step */}
      <section className="stage dark sec home-hero" aria-labelledby="next-h">
        <div className="wrap">
          <h2 id="next-h" className="t-h2 max-w-[18ch] text-white">See your AI security posture in 30 minutes.</h2>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {NEXT.map((n) => (
              <li key={n.h}>
                <Link to={n.to} className="group flex h-full flex-col rounded-[18px] border border-white/10 bg-white/[.04] p-6 transition-colors hover:border-white/30 hover:bg-white/[.07]">
                  <Icon name={n.icon} size={24} className="text-[#7fd6ff]" />
                  <span className="mt-5 flex items-center justify-between text-[18px] font-semibold text-white">{n.h}<Icon name="ArrowRight" size={16} className="transition-transform group-hover:translate-x-1" /></span>
                  <span className="mt-2 text-[14.5px] leading-relaxed text-white/65">{n.p}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
