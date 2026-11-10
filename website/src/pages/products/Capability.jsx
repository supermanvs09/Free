import { Link } from 'react-router';
import { Seo } from '../../lib/head.jsx';
import { ZCAPS } from '../../data/zenstra.js';
import { PLATFORMS, trail } from '../../data/ia.js';
import { Button, Icon, Reveal, SectionHead, cx } from '../../components/ui.jsx';
import { ArrowLink, CtaBand, FeatureCard, PageHero, ProductLabel, ResearchCards, Section, SampleNote } from '../../components/ds.jsx';
import ZenConsole from '../../components/demos/ZenConsole.jsx';
import { McpPanel, DetectPanel } from '../../components/demos/ZenPanels.jsx';

/* The six Zenstra capabilities share one layout; each gets its own focused,
   interactive view of the console. */
const VIEW = {
  discovery: { V: () => <ZenConsole mode="discovery" />, hint: 'Run the discovery scan. A shadow agent appears with no owner; assign one.' },
  identity: { V: () => <ZenConsole mode="identity" initial="support" />, hint: 'Pick an agent to see its owner, declared task and the grant that expires with the task.' },
  enforce: { V: () => <ZenConsole mode="enforce" />, hint: 'Fire a tool call. Watch each check, then the decision: allow, hold for an approver or block.' },
  mcp: { V: McpPanel, hint: 'A tool changed after it was approved. Review the difference and decide.' },
  detect: { V: DetectPanel, hint: 'An agent with valid access reads far more than usual. Contain it.' },
  record: { V: () => <ZenConsole mode="record" />, hint: 'Fire a few tool calls, then verify the chain of decisions.' },
};
const Z = PLATFORMS[1];

export default function Capability({ id }) {
  const c = ZCAPS[id];
  const { V, hint } = VIEW[c.kind];
  const me = Z.items.find((x) => x.path === c.path);
  return (
    <>
      <Seo title={c.seoTitle.replace(/ \| Zenstra AI$/, '')} description={c.description} path={c.path} crumbs={[{ name: 'Zenstra AI', path: c.parent }, { name: c.name, path: c.path }]} />
      <PageHero crumbs={trail(c.path)} mark={<ProductLabel p="zenstra" name={c.name} sub="Zenstra AI capability" />}
        title={`${c.hero.lead} ${c.hero.accent}.`} lead={c.hero.sub}
        actions={<><Button to="/request-demo?product=zenstra" size="lg" arrow>Book a demo</Button><Button to={c.parent} variant="secondary" size="lg">Zenstra AI overview</Button></>} />

      <Section id="view" labelledby="view-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead id="view-h" eyebrow="Try it" title={me?.desc || c.short} lead={hint} />
        </div>
        <Reveal className="mt-10"><V /><SampleNote /></Reveal>
      </Section>

      <Section id="how" labelledby="how-h" tone="subtle">
        <SectionHead id="how-h" eyebrow="How it works" title="Three steps. No agent rewritten." />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {c.steps.map(([h, p], i) => (
            <Reveal as="li" key={h} delay={i * 50} className="card p-6"><span className="num text-[13px] font-semibold text-brand">0{i + 1}</span><p className="mt-2 t-h4">{h}</p><p className="mt-1.5 t-small !text-ink-2">{p}</p></Reveal>
          ))}
        </ol>
        <h3 className="mt-14 t-h3">What changes</h3>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {c.gains.map(([h, p], i) => <FeatureCard key={h} icon={['CheckCircle', 'Eye', 'Users'][i]} acc="var(--color-zen)" title={h}>{p}</FeatureCard>)}
        </div>
      </Section>

      <Section id="all" labelledby="all-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="all-h" className="t-h3">All six Zenstra AI capabilities</h2>
          <ArrowLink to={c.parent}>How they work together</ArrowLink>
        </div>
        <nav aria-label="Zenstra capabilities" className="mt-6">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Z.items.map((it) => {
              const on = it.path === c.path;
              return (
                <li key={it.key}>
                  <Link to={it.path} aria-current={on ? 'page' : undefined} className={cx('card card-link flex items-center gap-3 p-4', on && '!border-zen bg-[color-mix(in_oklab,var(--color-zen)_5%,transparent)]')}>
                    <span className="ptile ptile-sm" style={{ '--acc': 'var(--color-zen)' }}><Icon name={it.icon} size={16} /></span>
                    <span className="min-w-0"><span className="block text-[14.5px] font-semibold text-ink">{it.name}</span><span className="block truncate t-caption">{on ? 'You are here' : it.desc}</span></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Section>

      <ResearchCards slugs={c.research} title="Research on AI agent security" />
      <CtaBand title="Run it against your own agents." body={`A 30-minute session on Zenstra ${c.name}, with your platforms and your questions.`} primary={{ label: 'Book a demo', to: '/request-demo?product=zenstra' }} />
    </>
  );
}
