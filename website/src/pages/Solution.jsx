import { useParams } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SOLUTION_PAGES } from '../data/solutions.js';
import { Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { Link } from 'react-router';
import { CERTS, CUSTOMERS } from '../data/site.js';
import { INDUSTRY_PROOF } from '../data/industryProof.js';
import CertSeal from '../components/CertSeal.jsx';
import { Brand } from '../components/Dash.jsx';
import { CtaBand, ResearchRow } from '../components/blocks.jsx';
import Stage3D from '../components/Stage3D.jsx';
import { Hero, Stats, LINKS } from '../components/ProductKit.jsx';
import { KeyLineage } from '../components/viz/refs.jsx';
import ProductMark from '../components/ProductMark.jsx';
import NotFound from './NotFound.jsx';

/* Each industry opens on a real photograph of the people it protects, with
   the number that matters most to it; the scene that shows the risk follows. */
const SCENE = { 'digital-platforms': KeyLineage };
const SEE = {
  'digital-platforms': 'One leaked key, traced from commit to customer data.',
};
const TEAM = { bfsi: 'banks and fintechs', healthcare: 'hospitals and health platforms', government: 'public-sector teams', 'digital-platforms': 'digital platforms' };
const KEY = { fraud: 'fraud', nhi: 'nhi', zenstra: 'zenstra', icms: 'icms', adapid: 'cirm', ad: 'ad' };

export default function Solution() {
  const { slug } = useParams();
  const s = SOLUTION_PAGES[slug];
  if (!s) return <NotFound />;
  const V = SCENE[slug];
  const path = `/solutions/${slug}`;
  const products = s.products.map((k) => LINKS[KEY[k]]).filter(Boolean);
  const pr = INDUSTRY_PROOF[slug] || {};
  const names = Object.fromEntries(CUSTOMERS);
  return (
    <>
      <Seo title={s.seoTitle} description={s.description} path={path} crumbs={[{ name: s.name, path }]} />
      <Hero layout="split" crumbs={[{ name: 'Solutions' }, { name: s.name }]} eyebrow={`Solutions · ${s.name}`} title={s.title} lead={s.sub}>
        <figure className="relative ml-auto w-full max-w-[620px]">
          <img src={`/img/photos/${pr.hero?.img || slug}.webp`} alt={pr.hero?.alt || ''} style={{ objectPosition: pr.hero?.pos }} width="1200" height="800" className="aspect-[4/3] w-full rounded-[24px] border border-white/15 object-cover shadow-[0_40px_90px_-40px_rgba(0,0,0,.8)]" fetchPriority="high" decoding="async" />
          <figcaption className="absolute bottom-[6%] left-[-4%] w-[64%] min-w-[240px] rounded-[16px] bg-white p-4 text-left text-[#0e1116] shadow-[0_28px_60px_-22px_rgba(0,0,0,.7)] max-sm:relative max-sm:inset-auto max-sm:mt-3 max-sm:w-full max-sm:min-w-0">
            <span className="block text-[26px] font-medium leading-none tracking-[-0.015em] text-[#1a58d0] num">{s.stats[0].v}</span>
            <span className="mt-1.5 block text-[14px] leading-snug text-[#3f4a5a]">{s.stats[0].l}</span>
            <span className="mt-3 flex items-center gap-2 border-t border-[#e3e8ee] pt-3 text-[14px] text-[#5c6777]">Protected by{[...new Set(products.map((x) => x.line))].map((l) => <ProductMark key={l} p={l} size={22} alt />)}</span>
          </figcaption>
        </figure>
      </Hero>

      {V && <section className="stage sec" aria-labelledby="see-h">
        <div className="wrap">
          <SectionHead id="see-h" eyebrow="What it looks like" title={SEE[slug]} />
          <Reveal className="mx-auto mt-12 max-w-[980px]"><Stage3D tilt={[6, -13]}><V /></Stage3D></Reveal>
        </div>
      </section>}

      <Stats items={s.stats} title="Why it matters now" />

      <section className="sec" aria-labelledby="help-h">
        <div className="wrap">
          <SectionHead align="left" id="help-h" eyebrow="How we help" title={s.helpTitle} />
          <ol className="mt-12 grid gap-4 md:grid-cols-2">
            {s.help.map((h, i) => (
              <Reveal as="li" key={h.title} delay={i * 70} className="card flex gap-5 p-6 md:p-8">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-2 text-[16px] font-semibold text-cyan-2 num">{i + 1}</span>
                <span><span className="block text-[20px] font-semibold tracking-[-0.02em]">{h.title}</span><span className="mt-2 block text-[16px] leading-relaxed text-ink-2">{h.body}</span></span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>
      {/* the products that apply to this industry */}
      <section className="sec" aria-labelledby="prod-h">
        <div className="wrap">
          <SectionHead align="left" id="prod-h" eyebrow="Products for this industry" title={`The products ${TEAM[slug] || 'teams'} run with us.`} />
          <ul className="ind-prods mt-12">
            {products.map((x, i) => (
              <Reveal as="li" key={x.to} delay={i * 60}>
                <Link to={x.to} className="ind-prod" style={{ '--acc': x.acc }}>
                  <span className="ind-prod-k"><ProductMark p={x.line} size={24} />{x.line}</span>
                  <span className="ind-prod-t">{x.name}</span>
                  <span className="ind-prod-b">{x.body}</span>
                  <span className="ind-prod-go">Explore<Icon name="ArrowRight" size={15} weight="bold" /></span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* proof: who already runs it, what we are audited against */}
      {pr.customers && (
        <section className="sec" aria-labelledby="proof-h">
          <div className="wrap">
            <div className="ind-proof">
              <div>
                <p className="kicker">Trusted in {s.short === 'BFSI' ? 'banking and finance' : s.short.toLowerCase()}</p>
                <h2 id="proof-h" className="t-h2 mt-5">Organisations that already rely on Deep Algorithms.</h2>
                <ul className="ind-logos" aria-label="Customers">
                  {pr.customers.map((k) => <li key={k}><img src={`/img/logos/${k}-white.webp`} alt={names[k] || k} loading="lazy" decoding="async" /></li>)}
                </ul>
              </div>
              <div className="ind-certs">
                <p className="kicker">Independently audited</p>
                <ul>
                  {CERTS.map((c) => <li key={c.code}><CertSeal code={c.code} size={44} title={c.name} /><span><b>{c.name}</b><small>{c.desc}</small></span></li>)}
                </ul>
              </div>
            </div>
            {pr.quote && (
              <figure className="ind-quote">
                <blockquote>“{pr.quote.text}”</blockquote>
                <figcaption><b>{pr.quote.name}</b>, {pr.quote.role}, {pr.quote.org}</figcaption>
              </figure>
            )}
          </div>
        </section>
      )}

      {/* in the field: our own photographs, from events we were at */}
      {pr.field && (
        <section className="sec" aria-labelledby="field-h">
          <div className="wrap">
            <SectionHead align="left" id="field-h" eyebrow="In the field" title="Where we work with the people who run it." />
            <ul className="ind-field mt-12">
              {pr.field.map((f, i) => {
                const body = (<>
                  <span className="ind-field-img"><img src={`/img/events/${f.img}.webp`} alt="" loading="lazy" decoding="async" /></span>
                  <span className="ind-field-when">{f.when}</span>
                  <span className="ind-field-t">{f.title}</span>
                  <span className="ind-field-b">{f.body}</span>
                </>);
                return (
                  <Reveal as="li" key={f.title} delay={i * 70}>
                    {f.href ? <a href={f.href} target="_blank" rel="noreferrer" className="ind-field-card">{body}<span className="ind-field-go">See the post<Icon name="ArrowUpRight" size={14} weight="bold" /></span></a> : <div className="ind-field-card">{body}</div>}
                  </Reveal>
                );
              })}
            </ul>
            {pr.notes && <ul className="ind-notes">{pr.notes.map((n) => <li key={n}><Icon name="CheckCircle" size={18} weight="fill" />{n}</li>)}</ul>}
          </div>
        </section>
      )}

      {/* partners and the systems it works with */}
      {pr.works && (
        <section className="sec-tight" aria-labelledby="eco-h">
          <div className="wrap">
            <div className="ind-eco">
              <h2 id="eco-h" className="kicker">{pr.partners ? 'Partners and the systems we work with' : 'Works with the systems you already run'}</h2>
              {pr.partners && <ul className="ind-partners">{pr.partners.map((p) => <li key={p.name}><b>{p.name}</b><span>{p.what}</span></li>)}</ul>}
              <ul className="ig-row">{pr.works.map(([k, t]) => <li key={t}><Brand k={k} s={22} /><span>{t}</span></li>)}</ul>
            </div>
          </div>
        </section>
      )}

      <ResearchRow slugs={s.research} />
      <CtaBand related={products.slice(0, 3)} relatedTitle="Products to start with" title={s.cta.title} body={s.cta.body} />
    </>
  );
}
