import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { PLATFORMS, NEEDS } from '../data/ia.js';
import { Icon, Reveal, SectionHead, cx } from '../components/ui.jsx';
import { ArrowLink, CtaBand, PageHero, Section } from '../components/ds.jsx';
import ProductMark from '../components/ProductMark.jsx';

const BUNDLES = [
  ['Banks and fintechs', ['Identity Fraud Prevention', 'Continuous Identity Risk Management', 'ICMS Compliance Suite'], 'Stop mules at the payee and stolen logins at the door, and keep DPDPA and RBI evidence ready.', '/solutions/bfsi'],
  ['An AI rollout', ['Zenstra AI', 'NHI Security for AWS'], 'Govern the agents you deploy and the cloud keys they run on.', '/agentic-ai/agentic-identity'],
  ['A public service', ['Active Directory Security', 'ICMS Compliance Suite'], 'Keep the domain closed to attackers and citizen PII protected.', '/solutions/government'],
];

export default function Products() {
  const [need, setNeed] = useState('all');
  const match = (it) => need === 'all' || it.need?.includes(need);
  const count = PLATFORMS.reduce((a, p) => a + p.items.filter(match).length, 0);
  return (
    <>
      <Seo title="Products: Identity, AI Agent, Fraud and Data Security" path="/products" crumbs={[{ name: 'Products', path: '/products' }]}
        description="adapID AI for human and machine identities, Zenstra AI for AI agents and ICMS for personal data and DPDPA compliance. Find the product for the risk you face." />
      <PageHero crumbs={[{ name: 'Products' }]} size="h1" overline="Products"
        title="Products for every identity you run on."
        lead="Two platforms and a compliance suite. adapID AI secures people, machine identities and customers; Zenstra AI secures AI agents; ICMS protects personal data. Each runs on its own." />

      {/* numbered big-type list of needs over a giant background word (shots 0, 9, 21, 39, 41, 58, 59, 87, 94) */}
      <section className="sec-sm relative overflow-hidden" aria-labelledby="needs-h">
        <p aria-hidden="true" className="pointer-events-none absolute -bottom-6 left-1/2 -translate-x-1/2 select-none whitespace-nowrap font-display text-[22vw] font-semibold leading-none tracking-[-0.06em] text-bg-1">IDENTITY</p>
        <div className="container relative">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="needs-h" className="t-h2">Six risks. <span className="hl">Pick yours.</span></h2>
            <p className="t-small max-w-[360px]">Choose what you need to protect and the products below narrow to fit.</p>
          </div>
          <ol className="mt-10 border-t border-line">
            {NEEDS.map(([k, l], i) => (
              <li key={k}>
                <a href="#all" onClick={() => setNeed(k)} className={cx('group grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4 border-b border-line py-5 transition-colors md:grid-cols-[80px_minmax(0,1fr)_auto] md:py-6', need === k && 'text-brand')}>
                  <span className="font-mono text-[13px] text-ink-3 transition-colors group-hover:text-brand">{String(i + 1).padStart(2, '0')}.</span>
                  <span className={cx('font-display text-[26px] font-semibold tracking-[-0.025em] transition-all duration-500 group-hover:translate-x-3 group-hover:text-brand md:text-[44px]', need === k ? 'text-brand' : 'text-ink')}>{l}</span>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-2 text-ink-3 transition-all duration-500 group-hover:-rotate-45 group-hover:border-brand group-hover:bg-brand group-hover:text-white"><Icon name="ArrowRight" size={18} /></span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Section id="all" labelledby="all-h" tone="subtle">
        <h2 id="all-h" className="sr-only">All products</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] font-semibold text-ink">What do you need to protect?</span>
          <div className="seg" role="group" aria-label="Filter products by need">
            {[['all', 'Everything'], ...NEEDS].map(([k, l]) => <button key={k} type="button" aria-pressed={need === k} onClick={() => setNeed(k)} className="seg-btn">{l}</button>)}
          </div>
          <span className="t-caption" aria-live="polite">{count} {count === 1 ? 'match' : 'matches'}</span>
        </div>
        <div className="mt-10 space-y-6">
          {PLATFORMS.map((p) => (
            <Reveal key={p.key} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-bg-1 px-6 py-5">
                <div className="flex items-center gap-3">
                  <ProductMark p={p.key} size={40} />
                  <div><p className="t-h3">{p.name}</p><p className="t-small">{p.kind} · {p.tagline}</p></div>
                </div>
                <ArrowLink to={p.path}>{p.key === 'icms' ? 'Explore ICMS' : `${p.name} overview`}</ArrowLink>
              </div>
              <ul className={cx('grid divide-line sm:grid-cols-2', p.items.length > 4 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
                {p.items.map((it) => {
                  const on = match(it);
                  return (
                    <li key={it.key} className={cx('border-b border-line transition-opacity sm:border-r', !on && 'opacity-35')}>
                      <Link to={it.path} tabIndex={on ? undefined : -1} aria-hidden={on ? undefined : true} className="group flex h-full flex-col p-6 hover:bg-bg-1">
                        <span className="ptile" style={{ '--acc': p.acc }}><Icon name={it.icon} size={20} /></span>
                        <span className="mt-4 t-h4 group-hover:text-brand">{it.name}</span>
                        <span className="mt-1.5 t-small">{it.desc}</span>
                        <span className="mt-auto pt-4 text-[13px] font-semibold text-brand">{p.key === 'zenstra' ? 'Capability' : p.key === 'icms' ? 'Module' : 'Product'} →</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="bundles" labelledby="b-h">
        <SectionHead id="b-h" eyebrow="Better together" title="Use one, or combine them where the risk is." lead="Each product runs on its own. These combinations cover risks that usually arrive together." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {BUNDLES.map(([h, prods, t, to], i) => (
            <Reveal key={h} delay={i * 50}>
              <Link to={to} className="card card-link group flex h-full flex-col p-6">
                <p className="t-h4 group-hover:text-brand">{h}</p>
                <p className="mt-2 t-small !text-ink-2">{t}</p>
                <ul className="mt-4 flex flex-wrap gap-1.5">{prods.map((x) => <li key={x} className="badge">{x}</li>)}</ul>
                <span className="alink mt-auto pt-5 text-[14px]">See how<Icon name="ArrowRight" size={13} weight="bold" className="arr" /></span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>
      <CtaBand title="Not sure which fits? Book a demo." body="Tell us which identities worry you most and we will show you the product that fits, on your own environment." />
    </>
  );
}
