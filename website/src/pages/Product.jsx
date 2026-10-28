import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { PRODUCTS } from '../data/products.js';
import { CARD, SITE } from '../data/site.js';
import { Breadcrumb, Button, Heading, Icon, IconTile, LearnMore, ProgressTabs, Reveal, Section, cx } from '../components/ui.jsx';
import { LogoBand, CtaPanel, RelatedCards, ResearchRow } from '../components/blocks.jsx';
import ProductVisual from '../components/visuals/ProductVisual.jsx';
import CapVisual from '../components/visuals/CapVisuals.jsx';
import { Tile, useReducedMotion } from '../components/visuals/kit.jsx';

/* Product pages come in five layouts so no two products read alike:
   tour (centred hero + capability tabs), hub (capability map linking to
   sub-pages), split (side-by-side hero + numbered rows), ledger (sticky
   index + stacked cards) and capability (one Zenstra capability).
   Each page also sets its own display font through p.theme. */

/* Rotating keyword in the hero heading. The first word is what crawlers and
   screen readers get; the visible word cycles once through the list and then
   settles back on the first, so nothing moves for more than a few seconds. */
function Rotator({ words, tone = 'text-[#9ee3ff]', accent }) {
  const [i, setI] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return undefined;
    let n = 0;
    const t = setInterval(() => { n += 1; setI(n % words.length); if (n >= words.length) clearInterval(t); }, 2400);
    return () => clearInterval(t);
  }, [reduce, words.length]);
  return <span className={cx('block', tone, accent && 'accent')}><span key={i} className="rise inline-block">{words[i]}</span></span>;
}

/* Sticky section bar under the hero: where am I, jump around, book a demo. */
function SubNav({ name, items }) {
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
const NAV_STD = [['Capabilities', '#capabilities'], ['Why it matters', '#why'], ['Getting started', '#start'], ['Research', '#research']];

function Bullets({ list }) {
  return (
    <ul className="mt-6 space-y-3">
      {list.map((b) => <li key={b} className="flex gap-3 text-[16px] text-ink-2"><Icon name="CheckCircle" size={20} weight="fill" className="mt-0.5 shrink-0 text-brand" />{b}</li>)}
    </ul>
  );
}

function Item({ it }) {
  return (
    <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[.8fr_1.4fr] lg:gap-14">
      <div>
        <h3 className="font-display text-[28px] font-light leading-tight tracking-[-0.02em] text-ink md:text-[34px]">{it.heading}</h3>
        <p className="mt-4 text-[17px] text-ink-2">{it.body}</p>
        {it.bullets && <Bullets list={it.bullets} />}
        {it.link && <div className="mt-6"><LearnMore to={it.link}>Explore {it.label}</LearnMore></div>}
      </div>
      <ProductVisual v={it.visual} />
    </div>
  );
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function Stats({ p, dark }) {
  return (
    <dl className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
      {p.stats.map((s, i) => (
        <Reveal key={s.l} delay={i * 80} className={cx('border-t pt-6', dark ? 'border-white/20' : 'border-line-2')}>
          <dt className={cx('font-display text-[48px] font-light leading-none tracking-[-0.03em] md:text-[56px]', dark ? 'text-white' : 'text-ink')}>{s.v}</dt>
          <dd className={cx('mt-4 text-[16px]', dark ? 'text-white/85' : 'text-ink-2')}>{s.l}</dd>
          <dd className={cx('mt-3 text-[13px]', dark ? 'text-white/60' : 'text-ink-3')}>Source: {s.s}</dd>
        </Reveal>
      ))}
    </dl>
  );
}

function Onboarding({ p, list }) {
  return (
    <Section id="start" className="scroll-mt-32">
      <Heading eyebrow="Getting started" title={p.onboarding.title} />
      {list ? (
        <ol className="mx-auto mt-14 max-w-[820px] divide-y divide-line border-y border-line">
          {p.onboarding.items.map((it, i) => (
            <Reveal as="li" key={it.title} delay={i * 80} className="flex items-start gap-5 py-6">
              <span className="mono mt-1 text-[14px] text-brand">0{i + 1}</span>
              <div><h3 className="t-h3">{it.title}</h3><p className="mt-1 text-ink-2">{it.body}</p></div>
            </Reveal>
          ))}
        </ol>
      ) : (
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {p.onboarding.items.map((it, i) => (
            <Reveal key={it.title} delay={i * 80} className="text-center">
              <IconTile name={it.icon} />
              <h3 className="t-h3 mt-5">{it.title}</h3>
              <p className="mx-auto mt-2 max-w-[320px] text-ink-2">{it.body}</p>
            </Reveal>
          ))}
        </div>
      )}
      {p.onboarding.logos && (
        <Reveal as="ul" aria-label="Integrations" className="mx-auto mt-14 flex max-w-[860px] flex-wrap justify-center gap-3">
          {p.onboarding.logos.map((l) => <li key={l}><Tile name={l} size={56} mono /></li>)}
        </Reveal>
      )}
    </Section>
  );
}

/* ---------- tour: centred hero, capability tabs ---------- */
function Tour({ p, crumbs }) {
  const h = p.hero;
  return (
    <>
      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className={cx('overflow-hidden rounded-[40px] px-5 pb-6 pt-10 md:px-10 md:pb-10 md:pt-14', h.tone === 'brand' ? 'bg-brand' : 'bg-navy')}>
            <div className="wrap !px-0 text-center">
              <div className="flex justify-center"><Breadcrumb light items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : c))} /></div>
              <p className="rise mt-8 text-[15px] font-medium text-white/90">{p.line === p.name ? p.name : `${p.line} · ${p.name}`}</p>
              <h1 className="t-h1 rise mx-auto mt-3 max-w-[900px] text-white">{h.lead} <Rotator words={h.rotate} accent /></h1>
              <p className="rise mx-auto mt-6 max-w-[660px] text-[17px] leading-relaxed text-white/90 md:text-[19px]" style={{ animationDelay: '80ms' }}>{h.sub}</p>
              <div className="rise mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: '160ms' }}>
                <Button to="/request-demo" variant="white">Book a demo</Button>
                <Button href="#capabilities" variant="ghostWhite">See capabilities</Button>
              </div>
            </div>
            <div className="rise mx-auto mt-12 max-w-[1040px]" style={{ animationDelay: '240ms' }}><ProductVisual v={h.visual} /></div>
          </div>
        </div>
      </section>
      <SubNav name={p.name} items={NAV_STD} />
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
            <h2 className="t-h2 mx-auto max-w-[760px] text-center text-white">Why it <span className="accent">matters</span></h2>
            <Stats p={p} dark />
          </div>
        </div>
      </section>
      <Onboarding p={p} />
    </>
  );
}

/* ---------- hub: capability map that links to sub-pages ---------- */
function Hub({ p, crumbs }) {
  const h = p.hero;
  const phases = [
    ['Discover', 'Know what exists', ['zdiscovery', 'zidentity']],
    ['Enforce', 'Control what it does', ['zenforce', 'zmcp']],
    ['Prove', 'Show what happened', ['zdetect', 'zrecord']],
  ];
  return (
    <>
      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="overflow-hidden rounded-[40px] bg-brand px-5 py-10 md:px-12 md:py-14">
            <div className="grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-14">
              <div>
                <Breadcrumb light items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : c))} />
                <p className="rise mt-8 text-[15px] font-medium text-white/90">{p.name}</p>
                <h1 className="t-h1 rise mt-3 text-white">{h.lead} <Rotator words={h.rotate} accent /></h1>
                <p className="rise mt-6 max-w-[520px] text-[17px] leading-relaxed text-white/90" style={{ animationDelay: '80ms' }}>{h.sub}</p>
                <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '160ms' }}>
                  <Button to="/request-demo" variant="white">Book a demo</Button>
                  <Button href="#capabilities" variant="ghostWhite">See six capabilities</Button>
                </div>
              </div>
              <div className="rise" style={{ animationDelay: '240ms' }}><ProductVisual v={h.visual} /></div>
            </div>
          </div>
        </div>
      </section>
      <SubNav name={p.name} items={[['Capabilities', '#capabilities'], ['Why it matters', '#why'], ['Getting started', '#start'], ['Research', '#research']]} />
      <Section id="capabilities" className="scroll-mt-32">
        <Heading eyebrow="One platform, six capabilities" title={<>From the first agent to the last <span className="accent">audit</span></>} lead="Each capability works alone and gets stronger with the others. Open one to see how it works." />
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {phases.map(([n, sub, keys], pi) => (
            <Reveal key={n} delay={pi * 90} className="rounded-[28px] border border-line bg-white/80 p-6 backdrop-blur md:p-8">
              <p className="mono text-[13px] text-brand">0{pi + 1}</p>
              <h3 className="mt-2 font-display text-[30px] font-light tracking-[-0.02em] text-ink">{n}</h3>
              <p className="text-ink-3">{sub}</p>
              <ul className="mt-6 space-y-3">
                {keys.map((k) => (
                  <li key={k}>
                    <Link to={CARD[k].path} className="group flex items-start gap-3 rounded-[16px] border border-line p-4 transition hover:-translate-y-0.5 hover:border-brand hover:shadow-[0_16px_34px_-22px_rgba(6,47,87,.5)]">
                      <IconTile name={CARD[k].icon} size={44} />
                      <span><span className="block text-[16px] font-medium text-ink group-hover:text-brand">{CARD[k].name}</span><span className="block text-[14px] leading-snug text-ink-3">{CARD[k].body}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </Section>
      <LogoBand title="Trusted by banks, government and enterprises across India" />
      <section id="why" className="scroll-mt-32 py-12">
        <div className="wrap"><Stats p={p} /></div>
      </section>
      <Onboarding p={p} list />
    </>
  );
}

/* ---------- split: side-by-side hero, numbered rows ---------- */
function Split({ p, crumbs }) {
  const h = p.hero;
  let n = 0;
  return (
    <>
      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="overflow-hidden rounded-[40px] border border-line bg-white/70 px-5 py-10 backdrop-blur md:px-12 md:py-14">
            <Breadcrumb items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : c))} />
            <div className="mt-8 grid items-center gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-14">
              <div>
                <p className="rise eyebrow">{p.line === p.name ? p.name : `${p.line} · ${p.name}`}</p>
                <h1 className="t-h1 rise mt-3">{h.lead} <Rotator words={h.rotate} tone="text-brand" accent /></h1>
                <p className="rise mt-6 max-w-[520px] text-[18px] leading-relaxed text-ink-2" style={{ animationDelay: '80ms' }}>{h.sub}</p>
                <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '160ms' }}>
                  <Button to="/request-demo">Book a demo</Button>
                  <Button href="#capabilities" variant="outline">See how it works</Button>
                </div>
              </div>
              <div className="rise" style={{ animationDelay: '240ms' }}><ProductVisual v={h.visual} /></div>
            </div>
          </div>
        </div>
      </section>
      <SubNav name={p.name} items={NAV_STD} />
      <div id="capabilities" className="scroll-mt-32">
        {p.sections.map((s) => (
          <Section key={s.title}>
            <Heading align="left" eyebrow={s.eyebrow} title={s.title} className="!max-w-[760px]" />
            <div className="mt-14 space-y-20 md:space-y-28">
              {s.items.map((it) => {
                n += 1;
                const flip = n % 2 === 0;
                return (
                  <Reveal key={it.label} className={cx('grid grid-cols-1 items-center gap-10 lg:gap-16', same(it.visual, h.visual) ? 'lg:max-w-[760px]' : flip ? 'lg:grid-cols-[1.3fr_.9fr]' : 'lg:grid-cols-[.9fr_1.3fr]')}>
                    <div className={flip ? 'lg:order-2' : ''}>
                      <p className="mono text-[13px] text-brand">{String(n).padStart(2, '0')} · {it.label}</p>
                      <h3 className="mt-3 font-display text-[28px] font-light leading-tight tracking-[-0.02em] text-ink md:text-[36px]">{it.heading}</h3>
                      <p className="mt-4 text-[17px] text-ink-2">{it.body}</p>
                      {it.bullets && <Bullets list={it.bullets} />}
                      {it.link && <div className="mt-6"><LearnMore to={it.link}>Explore {it.label}</LearnMore></div>}
                    </div>
                    {same(it.visual, h.visual) ? null : <div className={flip ? 'lg:order-1' : ''}><ProductVisual v={it.visual} /></div>}
                  </Reveal>
                );
              })}
            </div>
          </Section>
        ))}
      </div>
      <Section id="why" tone="mist" className="scroll-mt-32">
        <Heading align="left" eyebrow="Why it matters" title={<>The numbers behind the <span className="accent">risk</span></>} />
        <Stats p={p} />
      </Section>
      <Onboarding p={p} />
    </>
  );
}

/* ---------- ledger: sticky index, stacked cards ---------- */
function Ledger({ p, crumbs }) {
  const h = p.hero;
  return (
    <>
      <section className="pt-10 md:pt-16">
        <div className="wrap">
          <Breadcrumb items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : c))} />
          <div className="mt-8 grid items-end gap-10 lg:grid-cols-[1.2fr_.8fr]">
            <div>
              <p className="rise eyebrow">{p.line} · {p.name}</p>
              <h1 className="t-h1 rise mt-3">{h.lead} <span className="accent text-brand">{h.rotate[0]}</span></h1>
            </div>
            <div className="rise" style={{ animationDelay: '80ms' }}>
              <p className="text-[18px] leading-relaxed text-ink-2">{h.sub}</p>
              <div className="mt-7 flex flex-wrap gap-3"><Button to="/request-demo">Book a demo</Button><Button href="#capabilities" variant="outline">Read the details</Button></div>
            </div>
          </div>
          <div className="rise mt-12" style={{ animationDelay: '160ms' }}><ProductVisual v={h.visual} /></div>
        </div>
      </section>
      <section id="capabilities" className="scroll-mt-32 py-20 md:py-28">
        <div className="wrap grid gap-12 lg:grid-cols-[260px_1fr] lg:gap-16">
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <p className="eyebrow">On this page</p>
            <ol className="mt-4 space-y-1 border-l border-line-2">
              {p.sections.flatMap((s) => s.items).map((it, i) => (
                <li key={it.label}><a href={`#c${i}`} className="-ml-px block border-l-2 border-transparent py-2 pl-4 text-[15px] text-ink-2 hover:border-brand hover:text-brand">{it.label}</a></li>
              ))}
              <li><a href="#why" className="-ml-px block border-l-2 border-transparent py-2 pl-4 text-[15px] text-ink-2 hover:border-brand hover:text-brand">Why it matters</a></li>
            </ol>
          </aside>
          <div className="space-y-12">
            {p.sections.flatMap((s) => s.items).map((it, i) => (
              <Reveal as="article" key={it.label} id={`c${i}`} className="scroll-mt-28 rounded-[32px] border border-line bg-white/85 p-5 backdrop-blur md:p-9">
                <h2 className="font-display text-[28px] font-light leading-tight tracking-[-0.02em] text-ink md:text-[36px]">{it.heading}</h2>
                <p className="mt-4 max-w-[680px] text-[17px] text-ink-2">{it.body}</p>
                {it.bullets && <Bullets list={it.bullets} />}
                {!same(it.visual, h.visual) && <div className="mt-8"><ProductVisual v={it.visual} /></div>}
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <section id="why" className="scroll-mt-32 py-6">
        <div className="wrap">
          <div className="rounded-[32px] bg-mist/80 px-6 py-12 md:px-14">
            <h2 className="t-h2">Why it <span className="accent text-brand">matters</span></h2>
            <Stats p={p} />
          </div>
        </div>
      </section>
      <Onboarding p={p} list />
    </>
  );
}

/* ---------- capability: one Zenstra capability ---------- */
function Capability({ p, crumbs }) {
  const h = p.hero;
  const others = Object.values(PRODUCTS).filter((x) => x.parent === p.parent && x.path !== p.path);
  const parent = Object.values(PRODUCTS).find((x) => x.path === p.parent);
  return (
    <>
      <section className="pt-8 md:pt-12">
        <div className="wrap">
          <Breadcrumb items={crumbs.map((c, i) => (i === crumbs.length - 1 ? { name: c.name } : c))} />
          <div className="mt-8 grid items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-white/80 px-3.5 py-1.5 text-[14px] font-medium text-brand backdrop-blur"><Icon name={p.icon} size={16} weight="light" />Zenstra AI · {p.name}</p>
              <h1 className="t-h1 rise mt-5">{h.lead} <span className="accent text-brand">{h.accent}</span></h1>
              <p className="rise mt-6 max-w-[520px] text-[18px] leading-relaxed text-ink-2" style={{ animationDelay: '80ms' }}>{h.sub}</p>
              <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '160ms' }}>
                <Button to="/request-demo">Book a demo</Button>
                <Button to={p.parent} variant="outline">All of Zenstra AI</Button>
              </div>
            </div>
            <div className="rise min-w-0" style={{ animationDelay: "240ms" }}><CapVisual kind={p.kind} /></div>
          </div>
        </div>
      </section>

      <Section>
        <Heading eyebrow="How it works" title="Three steps, no agent rewrite" />
        <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
          {p.steps.map(([t, b], i) => (
            <Reveal as="li" key={t} delay={i * 90} className="relative rounded-[24px] border border-line bg-white/85 p-7 backdrop-blur">
              <span className="mono text-[13px] text-brand">STEP 0{i + 1}</span>
              <h3 className="mt-3 font-display text-[26px] font-light tracking-[-0.02em] text-ink">{t}</h3>
              <p className="mt-2 text-[16px] text-ink-2">{b}</p>
            </Reveal>
          ))}
        </ol>
      </Section>

      <section className="py-6">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="rounded-[40px] bg-navy px-6 py-14 md:px-16 md:py-20">
            <h2 className="t-h2 mx-auto max-w-[760px] text-center text-white">What you <span className="accent">get</span></h2>
            <dl className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {p.gains.map(([t, b], i) => (
                <Reveal key={t} delay={i * 80} className="border-t border-white/20 pt-6">
                  <dt className="font-display text-[26px] font-light leading-snug text-white">{t}</dt>
                  <dd className="mt-3 text-[16px] text-white/80">{b}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <Section>
        <Heading eyebrow="Also in Zenstra AI" title="Five more capabilities, one platform" />
        <ul className="mx-auto mt-12 flex max-w-[1000px] flex-wrap justify-center gap-3">
          {others.map((o) => (
            <li key={o.path}>
              <Link to={o.path} className="group inline-flex items-center gap-2.5 rounded-full border border-line bg-white/85 py-2.5 pl-3 pr-5 text-[15px] text-ink backdrop-blur transition hover:-translate-y-0.5 hover:border-brand hover:text-brand">
                <IconTile name={o.icon} size={30} />{o.name}
              </Link>
            </li>
          ))}
        </ul>
        {parent && <div className="mt-8 text-center"><LearnMore to={parent.path}>Zenstra AI overview</LearnMore></div>}
      </Section>
    </>
  );
}

const LAYOUTS = { tour: Tour, hub: Hub, split: Split, ledger: Ledger, capability: Capability };

export default function Product({ id }) {
  const p = PRODUCTS[id];
  const parent = p.parent && Object.values(PRODUCTS).find((x) => x.path === p.parent);
  const crumbs = [...(parent ? [{ name: parent.name, path: parent.path }] : []), { name: p.name, path: p.path }];
  const schema = [{ '@type': 'SoftwareApplication', name: p.name, applicationCategory: 'SecurityApplication', operatingSystem: 'Web', description: p.description, url: SITE.url + p.path, provider: { '@id': `${SITE.url}/#org` } }];
  const Layout = LAYOUTS[p.layout] || Tour;
  const related = p.layout === 'capability' ? [] : (p.layout === 'hub' ? [] : p.modules || []);
  const cta = p.cta || { title: `See ${p.name} on your own agents`, body: 'Book a working session with a Deep Algorithms engineer.' };

  return (
    <div className={`font-theme-${p.theme}`}>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={crumbs} schema={schema} />
      <Layout p={p} crumbs={crumbs} />
      {related.length > 0 && <RelatedCards keys={related} title={p.parent ? `More from ${p.line}` : `Inside ${p.name}`} />}
      <div id="research" className="scroll-mt-32"><ResearchRow slugs={p.research} /></div>
      <CtaPanel title={cta.title} body={cta.body} />
    </div>
  );
}
