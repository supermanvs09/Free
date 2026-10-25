import { useParams } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SOLUTION_PAGES } from '../data/solutions.js';
import { Accordion, Breadcrumb, Button, Heading, IconTile, Reveal, Section } from '../components/ui.jsx';
import { CtaPanel, LogoBand, LogoNet, RelatedCards, ResearchRow } from '../components/blocks.jsx';
import NotFound from './NotFound.jsx';

export default function Solution() {
  const { slug } = useParams();
  const s = SOLUTION_PAGES[slug];
  if (!s) return <NotFound />;
  const path = `/solutions/${slug}`;

  return (
    <>
      <Seo title={s.seoTitle} description={s.description} path={path} crumbs={[{ name: s.name, path }]} />

      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="grid grid-cols-1 items-center gap-12 overflow-hidden rounded-[40px] bg-navy px-6 py-14 md:px-14 md:py-20 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <Breadcrumb light items={[{ name: s.name }]} />
              <p className="rise mt-8 text-[15px] font-medium text-cyan">{s.name}</p>
              <h1 className="t-h1 rise mt-3 text-white">{s.title}</h1>
              <p className="rise mt-6 max-w-[560px] text-[17px] leading-relaxed text-white/85 md:text-[19px]" style={{ animationDelay: '80ms' }}>{s.sub}</p>
              <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '160ms' }}>
                <Button to="/request-demo" variant="white">Book a demo</Button>
                <Button href="#how" variant="ghostWhite">How we help</Button>
              </div>
            </div>
            <div className="rise" style={{ animationDelay: '240ms' }}><LogoNet alert={s.net.alert} logos={s.net.logos} /></div>
          </div>
        </div>
      </section>

      <LogoBand title="Trusted by banks, government and enterprises across India" />

      <Section>
        <Heading eyebrow="The challenge" title={`What ${s.short} security teams are up against`} />
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {s.stats.map((x, i) => (
            <Reveal key={x.l} delay={i * 80}>
              <IconTile name={x.icon} tone={i === 0 ? 'coral' : 'blue'} />
              <p className="mt-6 font-display text-[40px] font-light leading-none tracking-[-0.03em] text-ink">{x.v}</p>
              <p className="mt-3 text-ink-2">{x.l}</p>
              {x.s && <p className="mt-2 text-[13px] text-ink-3">Source: {x.s}</p>}
            </Reveal>
          ))}
        </div>
      </Section>

      <section id="how" className="scroll-mt-20 py-6">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="grid grid-cols-1 gap-12 rounded-[40px] bg-navy px-6 py-16 md:px-16 md:py-24 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <p className="eyebrow mb-3 !text-cyan">How we help</p>
              <h2 className="t-h2 text-white">One platform across every identity you run</h2>
            </div>
            <Accordion items={s.help} />
          </div>
        </div>
      </section>

      <RelatedCards keys={s.products} eyebrow="Products" title={`Recommended for ${s.short}`} />
      <ResearchRow slugs={s.research} />
      <CtaPanel />
    </>
  );
}
