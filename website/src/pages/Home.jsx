import { Seo } from '../lib/head.jsx';
import { SOLUTIONS } from '../data/site.js';
import { POSTS } from '../data/posts.js';
import { Button, Heading, Icon, LearnMore, ProgressTabs, Reveal, Section, Accordion } from '../components/ui.jsx';
import { LogoBand, CtaPanel, PostCard, CertRow, IndustryCard, WhatsNew, WhyNow } from '../components/blocks.jsx';
import { FILM_DURATION, IdentityFilm, OrbitHero, OrbitMini } from '../components/visuals/Flows.jsx';
import ProductTour from '../components/visuals/ProductTour.jsx';
import { AgentScenario, MachineScenario, LoginScenario } from '../components/visuals/Scenarios.jsx';
import IdentityDetail from '../components/visuals/IdentityDetail.jsx';

const PROBLEMS = [
  { Scene: AgentScenario, title: 'AI agents act with real access', body: 'Copilots and agents read data, call tools and move money with credentials nobody reviewed. One request can reach far beyond its task.' },
  { Scene: MachineScenario, title: 'Machine identities outnumber people', body: 'Service accounts, roles and keys multiply with every deploy, and most are never rotated or owned.' },
  { Scene: LoginScenario, title: 'Stolen logins look legitimate', body: 'Attackers sign in rather than break in, so rules and alerts stay quiet while the damage is done.' },
];


const TYPES = [
  { tab: 'AI agents', variant: 'agent', title: 'Every agent with an owner, a purpose and limits', body: 'Zenstra AI finds every agent and MCP server, scopes its access to the task and checks each action before it runs.', to: '/agentic-ai/agentic-identity', cta: 'Explore Zenstra AI' },
  { tab: 'Machine identities', variant: 'nhi', title: 'Every role, key and workload identity scored', body: 'adapID NHI Security discovers machine identities across AWS, compares what they can do with what they use, and learns how each one behaves.', to: '/adapid-ai/nhi-security', cta: 'Explore NHI Security' },
  { tab: 'People', variant: 'human', title: 'A live risk score for every person', body: 'adapID AI baselines how each user works and acts the moment behaviour changes, before a stolen login becomes a breach.', to: '/adapid-ai', cta: 'Explore adapID AI' },
];

const WHY = [
  { title: 'One platform for every identity', body: 'People, machine identities and AI agents share one inventory, one risk model and one record, so nothing falls between tools.' },
  { title: 'Behaviour, not just configuration', body: 'Posture tells you what an identity could do. Behavioural baselines tell you when it starts doing something new.' },
  { title: 'Explainable decisions', body: 'Every score and every block comes with the reasons behind it, in plain language your analysts and auditors can read.' },
  { title: 'Built for regulated industries', body: 'Read-only connectors, an agentless AWS role and a gateway inside your VPC, with evidence mapped to DPDPA, RBI and SEBI expectations.' },
];

export default function Home() {
  return (
    <>
      <Seo path="/" description="Deep Algorithms discovers, secures and governs every human, non-human and AI agent identity, and stops fraud, bots and data misuse, from one platform." />

      <section className="overflow-hidden pt-14 md:pt-20">
        <div className="wrap text-center">
          <h1 className="t-h1 rise mx-auto max-w-[900px]">Identity Security for the AI Era</h1>
          <p className="t-lead rise mx-auto mt-6 max-w-[640px]" style={{ animationDelay: '80ms' }}>Autonomous agents are joining your workforce. Discover, secure and govern every human, non-human and AI agent identity, from one platform.</p>
          <div className="rise mt-9 flex flex-wrap justify-center gap-3" style={{ animationDelay: '160ms' }}>
            <Button to="/request-demo">Book a demo</Button>
            <Button href="#film" variant="outline"><Icon name="Play" size={16} weight="fill" />Watch the film ({Math.floor(FILM_DURATION / 60)}:{String(Math.floor(FILM_DURATION % 60)).padStart(2, '0')})</Button>
          </div>
          <ul className="rise mx-auto mt-8 flex max-w-[760px] flex-wrap justify-center gap-x-8 gap-y-2 text-[15px] text-ink-2" style={{ animationDelay: '240ms' }}>
            {['Discover every identity', 'Fix risk before it is used', 'Prove it to every auditor'].map((t) => (
              <li key={t} className="inline-flex items-center gap-2"><Icon name="CheckCircle" size={18} weight="fill" className="text-brand" />{t}</li>
            ))}
          </ul>
        </div>
        <div className="mx-auto mt-8 w-full max-w-[1240px] px-3 md:mt-10 md:px-5"><OrbitHero /></div>
      </section>

      <LogoBand band title="Trusted by banks, government and enterprises across India" />

      <Section>
        <Heading eyebrow="The new perimeter" title="Attackers no longer break in. They log in." lead="Most access in your company no longer belongs to a person. Keys, roles and AI agents hold it now, and that is where attackers are heading." />
        <div className="mt-14 grid grid-cols-1 gap-x-6 gap-y-14 lg:grid-cols-3">
          {PROBLEMS.map(({ Scene, title, body }, i) => (
            <Reveal key={title} delay={i * 80}>
              <Scene />
              <h3 className="t-h3 mt-6">{title}</h3>
              <p className="mt-2 text-ink-2">{body}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <WhyNow />

      <Section tone="mist" id="film" className="scroll-mt-16">
        <Heading eyebrow="The identity shift" title="Identity changed three times. Security has to catch up." lead="From people to cloud services to AI agents. Watch where the risk builds up, and how Deep Algorithms fixes it before it is used." />
        <Reveal className="mx-auto mt-14 max-w-[1180px]"><IdentityFilm /></Reveal>
        <div className="mt-10 flex justify-center"><Button to="/request-demo">Book a demo</Button></div>
      </Section>

      <Section id="platform" className="scroll-mt-16">
        <Heading eyebrow="The platform" title="One platform for every identity that acts in your enterprise." lead="People, machine identities and AI agents share one inventory, one risk model and one record. Four products, built to work as one." />
        <Reveal className="mx-auto mt-14 max-w-[1040px]"><ProductTour /></Reveal>
        <div className="mx-auto mt-10 grid max-w-[1040px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[['Zenstra AI', 'AI agent security', '/agentic-ai/agentic-identity'], ['adapID AI', 'Human and machine identities', '/adapid-ai'], ['BotShield AI', 'Bots, exposure and DDoS', '/botshield-ai'], ['ICMS Compliance', 'DPDPA data protection', '/dpdpa-compliance']].map(([n, d, to]) => (
            <div key={n}><p className="font-medium text-ink">{n}</p><p className="mb-2 text-[14px] text-ink-3">{d}</p><LearnMore to={to} /></div>
          ))}
        </div>
        <div className="mt-10 flex justify-center"><Button to="/products" variant="outline">Explore all products</Button></div>
      </Section>

      <Section tone="mist">
        <Heading eyebrow="Every identity type" title="See what each identity can do, and what it is doing" />
        <div className="mt-12">
          <ProgressTabs items={TYPES.map((t) => t.tab)} interval={11000} render={(i) => {
            const t = TYPES[i];
            return (
              <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[.8fr_1.4fr] lg:gap-14">
                <div>
                  <h3 className="font-display text-[28px] font-light leading-tight tracking-[-0.02em] text-ink md:text-[34px]">{t.title}</h3>
                  <p className="mt-4 text-[17px] text-ink-2">{t.body}</p>
                  <div className="mt-6"><LearnMore to={t.to}>{t.cta}</LearnMore></div>
                </div>
                <IdentityDetail variant={t.variant} />
              </div>
            );
          }} />
        </div>
      </Section>

      <WhatsNew />

      <section className="py-6">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="grid grid-cols-1 gap-12 overflow-hidden rounded-[40px] bg-navy px-6 py-16 md:px-16 md:py-24 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow mb-3 !text-cyan">Why Deep Algorithms</p>
              <h2 className="t-h2 text-white">Built for the identities of tomorrow. Securing them today.</h2>
              <div className="mt-10"><Accordion items={WHY} /></div>
              <div className="mt-10"><Button to="/platform" variant="white">Why Deep Algorithms</Button></div>
            </div>
            <OrbitMini className="hidden self-center lg:block" />
          </div>
        </div>
      </section>

      <Section>
        <Heading eyebrow="Industries" title="Built for organisations that cannot afford a breach" />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SOLUTIONS.map((s, i) => <Reveal key={s.slug} delay={i * 70}><IndustryCard s={s} /></Reveal>)}
        </div>
      </Section>

      <Section tone="mist">
        <Heading eyebrow="Trust" title="Our certifications" lead="ISO 27001, SOC 2 Type II, ISO 42001 and ISO 27701. Compliance documentation is available on request." />
        <div className="mt-12"><CertRow /></div>
      </Section>

      <Section>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Heading align="left" eyebrow="Research" title="Learn more" className="!max-w-none" />
          <LearnMore to="/blogs">All research</LearnMore>
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {POSTS.slice(0, 3).map((p, i) => <Reveal key={p.slug} delay={i * 70}><PostCard post={p} /></Reveal>)}
        </div>
      </Section>

      <CtaPanel />
    </>
  );
}
