import { useEffect, useState } from 'react';
import { Seo } from '../lib/head.jsx';
import { PRODUCTS } from '../data/products.js';
import { SITE } from '../data/site.js';
import { Breadcrumb, Button, Heading, Icon, IconTile, LearnMore, ProgressTabs, Reveal, Section, cx } from '../components/ui.jsx';
import { LogoBand, CtaPanel, RelatedCards, ResearchRow } from '../components/blocks.jsx';
import ProductVisual from '../components/visuals/ProductVisual.jsx';
import { Tile, useReducedMotion } from '../components/visuals/kit.jsx';

/* Rotating keyword in the hero heading. The first word is what crawlers and
   screen readers get; the visible word cycles once through the list and then
   settles back on the first, so nothing moves for more than a few seconds. */
function Rotator({ words }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return undefined;
    let n = 0;
    const t = setInterval(() => { n += 1; setI(n % words.length); if (n >= words.length) clearInterval(t); }, 2400);
    return () => clearInterval(t);
  }, [reduce, words.length]);
  return <span className="block text-[#9ee3ff]"><span key={i} className="rise inline-block">{words[i]}</span></span>;
}

/* Sticky section bar under the hero, as on cisco.com product pages: where am I, jump around, book a demo. */
function SubNav({ name }) {
  const items = [['Capabilities', '#capabilities'], ['Why it matters', '#why'], ['Getting started', '#start'], ['Research', '#research']];
  return (
    <div className="sticky top-[73px] z-30 border-b border-line bg-white/95 backdrop-blur-md">
      <div className="wrap flex h-14 items-center gap-4 md:gap-6">
        <span className="hidden shrink-0 font-display text-[18px] font-normal text-ink md:block">{name}</span>
        <nav aria-label={`${name} sections`} className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1">
          {items.map(([l, h]) => <a key={h} href={h} className="shrink-0 rounded-full px-3.5 py-2 text-[14.5px] text-ink-2 hover:bg-mist hover:text-brand">{l}</a>)}
        </nav>
        <Button to="/request-demo" className="h-10 shrink-0 px-5 text-[14px] lg:hidden">Book a demo</Button>
      </div>
    </div>
  );
}

function Item({ it }) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[.8fr_1.4fr] lg:gap-14">
      <div>
        <h3 className="font-display text-[28px] font-light leading-tight tracking-[-0.02em] text-ink md:text-[34px]">{it.heading}</h3>
        <p className="mt-4 text-[17px] text-ink-2">{it.body}</p>
        {it.bullets && (
          <ul className="mt-6 space-y-3">
            {it.bullets.map((b) => <li key={b} className="flex gap-3 text-[16px] text-ink-2"><Icon name="CheckCircle" size={20} weight="fill" className="mt-0.5 shrink-0 text-brand" />{b}</li>)}
          </ul>
        )}
        {it.link && <div className="mt-6"><LearnMore to={it.link}>Explore {it.label}</LearnMore></div>}
      </div>
      <ProductVisual v={it.visual} />
    </div>
  );
}

export default function Product({ id }) {
  const p = PRODUCTS[id];
  const parent = p.parent && Object.values(PRODUCTS).find((x) => x.path === p.parent);
  const crumbs = [...(parent ? [{ name: parent.name, path: parent.path }] : []), { name: p.name, path: p.path }];
  const schema = [{ '@type': 'SoftwareApplication', name: p.name, applicationCategory: 'SecurityApplication', operatingSystem: 'Web', description: p.description, url: SITE.url + p.path, provider: { '@id': `${SITE.url}/#org` } }];
  const h = p.hero;
  const related = p.modules || [];

  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={crumbs} schema={schema} />

      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className={cx('overflow-hidden rounded-[40px] px-5 pb-6 pt-10 md:px-10 md:pb-10 md:pt-14', h.tone === 'brand' ? 'bg-brand' : 'bg-navy')}>
            <div className="wrap !px-0 text-center">
              <div className="flex justify-center"><Breadcrumb light items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : c))} /></div>
              <p className="rise mt-8 text-[15px] font-medium text-white/90">{p.line === p.name ? p.name : `${p.line} · ${p.name}`}</p>
              <h1 className="t-h1 rise mx-auto mt-3 max-w-[900px] text-white">{h.lead} <Rotator words={h.rotate} /></h1>
              <p className="rise mx-auto mt-6 max-w-[660px] text-[17px] leading-relaxed text-white/90 md:text-[19px]" style={{ animationDelay: '80ms' }}>{h.sub}</p>
              <div className="rise mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: '160ms' }}>
                <Button to="/request-demo" variant="white">Book a demo</Button>
                {h.secondary
                  ? <Button href={h.secondary.href} target="_blank" rel="noreferrer" variant="ghostWhite">{h.secondary.label}<Icon name="ArrowUpRight" size={16} /></Button>
                  : <Button href="#capabilities" variant="ghostWhite">See capabilities</Button>}
              </div>
            </div>
            <div className="rise mx-auto mt-12 max-w-[1040px]" style={{ animationDelay: '240ms' }}><ProductVisual v={h.visual} /></div>
          </div>
        </div>
      </section>

      <SubNav name={p.name} />

      <LogoBand title="Trusted by banks, government and enterprises across India" />

      <div id="capabilities" className="scroll-mt-32">
        {p.sections.map((s, k) => (
          <Section key={s.title} tone={k % 2 ? 'mist' : undefined}>
            <Heading eyebrow={s.eyebrow} title={s.title} />
            <div className="mt-12 md:mt-16">
              {s.items.length > 1
                ? <ProgressTabs items={s.items.map((it) => it.label)} interval={10000} render={(i) => <Item it={s.items[i]} />} />
                : <Reveal><Item it={s.items[0]} /></Reveal>}
            </div>
          </Section>
        ))}
      </div>

      <section id="why" className="scroll-mt-32 py-6">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="rounded-[40px] bg-navy px-6 py-14 md:px-16 md:py-20">
            <h2 className="t-h2 mx-auto max-w-[760px] text-center text-white">Why it matters</h2>
            <dl className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {p.stats.map((s, i) => (
                <Reveal key={s.l} delay={i * 80} className="border-t border-white/20 pt-6">
                  <dt className="font-display text-[48px] font-light leading-none tracking-[-0.03em] text-white md:text-[56px]">{s.v}</dt>
                  <dd className="mt-4 text-[16px] text-white/85">{s.l}</dd>
                  <dd className="mt-3 text-[13px] text-white/60">Source: {s.s}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <Section id="start" className="scroll-mt-32">
        <Heading eyebrow="Getting started" title={p.onboarding.title} />
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {p.onboarding.items.map((it, i) => (
            <Reveal key={it.title} delay={i * 80} className="text-center">
              <IconTile name={it.icon} />
              <h3 className="t-h3 mt-5">{it.title}</h3>
              <p className="mx-auto mt-2 max-w-[320px] text-ink-2">{it.body}</p>
            </Reveal>
          ))}
        </div>
        {p.onboarding.logos && (
          <Reveal as="ul" aria-label="Integrations" className="mx-auto mt-14 flex max-w-[860px] flex-wrap justify-center gap-3">
            {p.onboarding.logos.map((l) => <li key={l}><Tile name={l} size={56} mono /></li>)}
          </Reveal>
        )}
      </Section>

      {related.length > 0 && <RelatedCards keys={related} title={p.parent ? `More from ${p.line}` : `Inside ${p.name}`} />}
      <div id="research" className="scroll-mt-32"><ResearchRow slugs={p.research} /></div>
      <CtaPanel title={p.cta.title} body={p.cta.body} />
    </>
  );
}
