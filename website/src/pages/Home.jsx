import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SOLUTIONS } from '../data/site.js';
import { POSTS } from '../data/posts.js';
import { Button, Heading, Icon, LearnMore, LineIcon, ProgressTabs, Reveal, Section, Accordion } from '../components/ui.jsx';
import { LogoBand, CtaPanel, PathArt, PostCard, CertRow } from '../components/blocks.jsx';
import HeroOrbit from '../components/visuals/HeroOrbit.jsx';
import ProductTour from '../components/visuals/ProductTour.jsx';
import StoryFilm from '../components/visuals/StoryFilm.jsx';
import IdentityDetail from '../components/visuals/IdentityDetail.jsx';

const PROBLEMS = [
  { icon: 'Robot', title: 'AI agents act with real access', body: 'Copilots and agents read data, call tools and move money with credentials nobody reviewed.' },
  { icon: 'Key', title: 'Machine identities outnumber people', body: 'Service accounts, roles and keys multiply with every deploy, and most are never rotated or owned.' },
  { icon: 'User', title: 'Stolen logins look legitimate', body: 'Attackers sign in rather than break in, so rules and alerts stay quiet.' },
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
  { title: 'Built for regulated industries', body: 'Deployed in your cloud or on-premises, with evidence mapped to DPDPA, RBI and SEBI expectations.' },
];

export default function Home() {
  return (
    <>
      <Seo path="/" description="Deep Algorithms discovers, secures and governs every human, non-human and AI agent identity, and stops fraud, bots and data misuse, from one platform." />

      <section className="overflow-hidden pt-14 md:pt-20">
        <div className="wrap text-center">
          <h1 className="t-h1 rise mx-auto max-w-[900px]">Identity Security for the AI Era</h1>
          <p className="t-lead rise mx-auto mt-6 max-w-[640px]" style={{ animationDelay: '80ms' }}>Discover, secure and govern every human, non-human and AI agent identity, from one platform.</p>
          <div className="rise mt-9 flex flex-wrap justify-center gap-3" style={{ animationDelay: '160ms' }}>
            <Button to="/request-demo">Book a demo</Button>
            <Button href="#platform" variant="outline">See it in action</Button>
          </div>
        </div>
        <div className="wrap mt-10 md:mt-6"><HeroOrbit /></div>
      </section>

      <LogoBand band title="Trusted by banks, government and enterprises across India" />

      <Section>
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <div>
            <Heading align="left" eyebrow="The identity problem" title="Most access in your company no longer belongs to a person" />
            <ul className="mt-10 space-y-7">
              {PROBLEMS.map((p, i) => (
                <Reveal as="li" key={p.title} delay={i * 80} className="flex gap-5">
                  <LineIcon name={p.icon} />
                  <div><h3 className="t-h3">{p.title}</h3><p className="mt-1.5 text-ink-2">{p.body}</p></div>
                </Reveal>
              ))}
            </ul>
          </div>
          <Reveal><StoryFilm /></Reveal>
        </div>
      </Section>

      <Section id="platform" tone="mist" className="scroll-mt-16">
        <Heading eyebrow="The platform" title="Four products. One identity security platform." lead="Each product covers one kind of identity risk. Together they share one inventory, one risk model and one record." />
        <Reveal className="mx-auto mt-14 max-w-[1040px]"><ProductTour /></Reveal>
        <div className="mx-auto mt-10 grid max-w-[1040px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[['Zenstra AI', 'AI agent security', '/agentic-ai/agentic-identity'], ['adapID AI', 'Human and machine identities', '/adapid-ai'], ['BotShield AI', 'Bots, exposure and DDoS', '/botshield-ai'], ['ICMS Compliance', 'DPDPA data protection', '/dpdpa-compliance']].map(([n, d, to]) => (
            <div key={n}><p className="font-medium text-ink">{n}</p><p className="mb-2 text-[14px] text-ink-3">{d}</p><LearnMore to={to} /></div>
          ))}
        </div>
      </Section>

      <Section>
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

      <section className="py-6">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="grid grid-cols-1 gap-12 overflow-hidden rounded-[40px] bg-navy px-6 py-16 md:px-16 md:py-24 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow mb-3 !text-cyan">Why Deep Algorithms</p>
              <h2 className="t-h2 text-white">Built for the identities attackers now target</h2>
              <div className="mt-10"><Accordion items={WHY} /></div>
              <div className="mt-10"><Button to="/platform" variant="white">Why Deep Algorithms</Button></div>
            </div>
            <PathArt className="hidden self-center lg:block" />
          </div>
        </div>
      </section>

      <Section>
        <Heading eyebrow="Industries" title="Built for organisations that cannot afford a breach" />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SOLUTIONS.map((s, i) => (
            <Reveal key={s.slug} delay={i * 70}>
              <Link to={`/solutions/${s.slug}`} className="group flex h-full flex-col rounded-[20px] border border-line bg-white p-7 transition-colors hover:border-brand">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-[12px] bg-sky text-brand"><Icon name={s.icon} size={24} weight="light" /></span>
                <h3 className="t-h3 mt-6 group-hover:text-brand">{s.name}</h3>
                <p className="mt-2 flex-1 text-[15px] text-ink-3">{s.desc}</p>
                <span className="mt-6 inline-flex items-center gap-1 text-[15px] font-medium text-brand">Learn more <Icon name="CaretRight" size={13} weight="bold" /></span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="mist">
        <Heading eyebrow="Trust" title="Independently certified" lead="Our own security programme is audited against the standards our customers are held to." />
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
