import { useParams } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SOLUTION_PAGES } from '../data/solutions.js';
import { Reveal, SectionHead } from '../components/ui.jsx';
import { CtaBand, ResearchRow } from '../components/blocks.jsx';
import Stage3D from '../components/Stage3D.jsx';
import { Hero, Stats, LINKS } from '../components/ProductKit.jsx';
import { MuleCheck } from '../components/viz/fraud.jsx';
import { AdTierGraph } from '../components/viz/adapid.jsx';
import { KeyLineage } from '../components/viz/refs.jsx';
import { PatientAccess } from '../components/viz/icms.jsx';
import ProductMark from '../components/ProductMark.jsx';
import NotFound from './NotFound.jsx';

/* Each industry opens on a real photograph of the people it protects, with
   the number that matters most to it; the scene that shows the risk follows. */
const SCENE = { bfsi: MuleCheck, healthcare: PatientAccess, government: AdTierGraph, 'digital-platforms': KeyLineage };
const FRAMED = new Set(['bfsi']);
const SEE = {
  bfsi: 'A stolen payment, followed to the mule.',
  healthcare: 'Every patient record opened, with the reason.',
  government: 'The paths to Domain Admins, mapped and closed.',
  'digital-platforms': 'One leaked key, traced from commit to customer data.',
};
const KEY = { fraud: 'fraud', nhi: 'nhi', zenstra: 'zenstra', icms: 'icms', adapid: 'cirm', ad: 'ad' };

export default function Solution() {
  const { slug } = useParams();
  const s = SOLUTION_PAGES[slug];
  if (!s) return <NotFound />;
  const V = SCENE[slug];
  const path = `/solutions/${slug}`;
  const products = s.products.map((k) => LINKS[KEY[k]]).filter(Boolean);
  return (
    <>
      <Seo title={s.seoTitle} description={s.description} path={path} crumbs={[{ name: s.name, path }]} />
      <Hero crumbs={[{ name: 'Solutions' }, { name: s.name }]} eyebrow={`Solutions · ${s.name}`} title={s.title} lead={s.sub}>
        <figure className="relative mx-auto w-full max-w-[600px]">
          <img src={`/img/photos/${slug}.webp`} alt="" width="1200" height="800" className="aspect-[4/3] w-full rounded-[24px] border border-white/15 object-cover shadow-[0_40px_90px_-40px_rgba(0,0,0,.8)]" fetchPriority="high" decoding="async" />
          <figcaption className="absolute bottom-[6%] left-[-4%] w-[64%] min-w-[240px] rounded-[16px] bg-white p-4 text-left text-[#0e1116] shadow-[0_28px_60px_-22px_rgba(0,0,0,.7)] max-sm:relative max-sm:inset-auto max-sm:mt-3 max-sm:w-full max-sm:min-w-0">
            <span className="block text-[26px] font-semibold leading-none tracking-[-0.03em] text-[#0a6dbb] num">{s.stats[0].v}</span>
            <span className="mt-1.5 block text-[14px] leading-snug text-[#3f4a5a]">{s.stats[0].l}</span>
            <span className="mt-3 flex items-center gap-2 border-t border-[#e3e8ee] pt-3 text-[12.5px] text-[#5c6777]">Protected by{[...new Set(products.map((x) => x.line))].map((l) => <ProductMark key={l} p={l} size={22} alt />)}</span>
          </figcaption>
        </figure>
      </Hero>

      <section className="stage sec" aria-labelledby="see-h">
        <div className="wrap">
          <SectionHead id="see-h" eyebrow="What it looks like" title={SEE[slug]} />
          <Reveal className="mx-auto mt-12 max-w-[980px]"><Stage3D tilt={FRAMED.has(slug) ? [4, -9] : [6, -13]}>{FRAMED.has(slug) ? <div className="scn-frame"><V /></div> : <V />}</Stage3D></Reveal>
        </div>
      </section>

      <Stats items={s.stats} title="Why it matters now" />

      <section className="sec" aria-labelledby="help-h">
        <div className="wrap">
          <SectionHead align="left" id="help-h" eyebrow="How we help" title={s.helpTitle} />
          <ol className="mt-12 grid gap-4 md:grid-cols-2">
            {s.help.map((h, i) => (
              <Reveal as="li" key={h.title} delay={i * 70} className="card flex gap-5 p-6 md:p-8">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-2 text-[15px] font-semibold text-cyan-2 num">{i + 1}</span>
                <span><span className="block text-[20px] font-semibold tracking-[-0.02em]">{h.title}</span><span className="mt-2 block text-[15.5px] leading-relaxed text-ink-2">{h.body}</span></span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>
      <ResearchRow slugs={s.research} />
      <CtaBand related={products.slice(0, 3)} relatedTitle="Products to start with" title={s.cta.title} body={s.cta.body} />
    </>
  );
}
