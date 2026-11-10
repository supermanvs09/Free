import { Link, useParams } from 'react-router';
import { MediaReveal } from '../components/fx.jsx';
import { Seo } from '../lib/head.jsx';
import { SOLUTION_PAGES } from '../data/solutions.js';
import { PLATFORMS, INDUSTRIES } from '../data/ia.js';
import { Button, Icon, Reveal, SectionHead, cx } from '../components/ui.jsx';
import { AppFrame, CtaBand, Decision, DemoControls, PageHero, ResearchCards, Section, StatTile, Stepper } from '../components/ds.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { useSteps } from '../lib/useSteps.js';
import NotFound from './NotFound.jsx';

/* Each industry: its own risks, a workflow across the products that fit it,
   the product combination, sourced outcomes and its own call to action. */
const ITEMS = Object.fromEntries(PLATFORMS.flatMap((p) => [[p.key, { ...p, platform: p }], ...p.items.map((i) => [i.key, { ...i, platform: p }])]));
const HELP_PRODUCT = { bfsi: ['fraud', 'nhi', 'zenstra', 'icms'], healthcare: ['icms', 'cirm', 'ad', 'icms'], government: ['ad', 'cirm', 'icms', 'zenstra'], 'digital-platforms': ['fraud', 'nhi', 'nhi', 'zenstra'] };
const DEMO = { bfsi: 'adapid', healthcare: 'dpdpa', government: 'all', 'digital-platforms': 'nhi' };

function Workflow({ flow, name }) {
  const s = useSteps(flow.length, { ms: 3400 });
  const [t, what, d, label, k] = flow[s.i];
  const it = ITEMS[k];
  return (
    <div ref={s.ref} onPointerDown={s.pause}>
      <Stepper steps={flow.map((f) => f[0])} s={s} label={`${name} workflow`} className="max-sm:!grid-cols-3 max-sm:gap-y-4" />
      <AppFrame title="Deep Algorithms" crumb={`${name} · one incident, end to end`} className="mt-6" status={<Decision d={d}>{label}</Decision>}>
        <div key={s.i} className="fadein grid gap-5 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:p-6" aria-live="polite">
          <div>
            <p className="app-label">Step {s.i + 1} · {t}</p>
            <p className="mt-2 t-h4">{what}</p>
            <div className="mt-4 flex items-center gap-2"><Decision d={d}>{label}</Decision><span className="t-caption">decided before the action completed</span></div>
          </div>
          <Link to={it.path} className="card card-link flex items-center gap-3 self-start p-4">
            <ProductMark p={it.platform.key} size={30} />
            <span className="min-w-0"><span className="block t-caption">Decided by</span><span className="block text-[14.5px] font-semibold text-ink">{it.name}</span></span>
            <Icon name="ArrowRight" size={15} className="ml-auto shrink-0 text-ink-4" />
          </Link>
        </div>
      </AppFrame>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="t-caption">Sample incident. Names and values are illustrative.</p><DemoControls s={s} n={flow.length} label={`Step ${s.i + 1} of ${flow.length}`} /></div>
    </div>
  );
}

export default function Solution() {
  const { slug } = useParams();
  const s = SOLUTION_PAGES[slug];
  if (!s) return <NotFound />;
  const ind = INDUSTRIES.find((x) => x.slug === slug);
  const path = ind.path;
  const products = HELP_PRODUCT[slug].map((k) => ITEMS[k]);
  const stats = s.stats.filter((x) => x.s && x.v !== 'Certified');
  const lead = stats[0] || s.stats[0];
  return (
    <>
      <Seo title={s.seoTitle} description={s.description} path={path} crumbs={[{ name: s.name, path }]} />
      <PageHero crumbs={[{ name: 'Solutions' }, { name: s.name }]} overline={`Solutions · ${s.name}`} title={s.title} lead={s.sub}
        actions={<><Button to={`/request-demo?product=${DEMO[slug]}`} size="lg" arrow>{slug === 'bfsi' ? 'Book a fraud signals session' : 'Book a demo'}</Button><Button href="#workflow" variant="secondary" size="lg">See it end to end</Button></>}
        media={(
          <figure className="relative">
            <MediaReveal src={`/img/photos/${slug}.webp`} width={1200} height={800} ratio="4 / 3" priority className="rounded-[24px] shadow-[var(--e-3)]" />
            <figcaption className="card absolute bottom-4 left-4 right-4 p-4 sm:right-auto sm:max-w-[320px]">
              <p className="num text-[24px] font-semibold leading-none text-brand">{lead.v}</p>
              <p className="mt-1.5 text-[13.5px] leading-snug text-ink-2">{lead.l}</p>
              {lead.s && <p className="mt-2 t-caption">Source: {lead.s}</p>}
            </figcaption>
          </figure>
        )} />

      <Section id="risks" labelledby="risk-h">
        <SectionHead id="risk-h" eyebrow="The risks" title={`What keeps ${s.short === 'BFSI' ? 'banks and fintechs' : s.short === 'Government' ? 'public-sector teams' : s.short === 'Healthcare' ? 'hospitals and health platforms' : 'platform teams'} up at night.`} />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {s.risks.map(([ic, t, b], i) => (
            <Reveal key={t} delay={i * 50} className="card p-6"><span className="ptile"><Icon name={ic} size={20} /></span><h3 className="mt-5 t-h4">{t}</h3><p className="mt-2 t-small !text-ink-2">{b}</p></Reveal>
          ))}
        </div>
      </Section>

      <Section id="workflow" labelledby="wf-h" tone="subtle">
        <SectionHead id="wf-h" eyebrow="How it works" title={s.helpTitle} lead="One incident, followed across the products that see it. Pick a step, or let it play." />
        <Reveal className="mt-10"><Workflow flow={s.flow} name={s.short} /></Reveal>
      </Section>

      <Section id="products" labelledby="pr-h">
        <SectionHead id="pr-h" eyebrow="Products to start with" title={`The combination for ${s.name.toLowerCase().replace('&', 'and')}.`} />
        <ol className="mt-10 grid gap-4 md:grid-cols-2">
          {s.help.map((h, i) => {
            const it = products[i];
            return (
              <Reveal as="li" key={h.title} delay={i * 40} className="card flex flex-col p-6">
                <div className="flex items-start gap-4">
                  <span className="num inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[13px] font-semibold text-brand">{i + 1}</span>
                  <div><h3 className="t-h4">{h.title}</h3><p className="mt-2 t-small !text-ink-2">{h.body}</p></div>
                </div>
                {it && <Link to={it.path} className="alink ml-12 mt-4 text-[14px]"><ProductMark p={it.platform.key} size={18} />{it.name}<Icon name="ArrowRight" size={13} weight="bold" className="arr" /></Link>}
              </Reveal>
            );
          })}
        </ol>
      </Section>

      <Section id="outcomes" labelledby="out-h" tone="subtle">
        {stats.length > 0 ? (
          <>
            <SectionHead id="out-h" eyebrow="Why it matters now" title="The numbers behind the risk." />
            <div className={cx('mt-10 grid gap-4', stats.length > 2 ? 'md:grid-cols-3' : stats.length === 2 ? 'md:grid-cols-2' : 'md:max-w-[420px]')}>{stats.map((st) => <StatTile key={st.v} {...st} />)}</div>
          </>
        ) : (
          <>
            <SectionHead id="out-h" eyebrow="Outcomes" title="What changes for your team." />
            <div className="mt-10 grid gap-4 md:grid-cols-2">{s.stats.filter((x) => x.v !== 'Certified').map((st) => <div key={st.v} className="card p-6"><p className="t-h3 !text-brand">{st.v}</p><p className="mt-2 t-body">{st.l}</p></div>)}</div>
          </>
        )}
        <nav aria-label="Other industries" className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-6 t-small">
          <span className="font-semibold text-ink">Other industries:</span>
          {INDUSTRIES.filter((x) => x.slug !== slug).map((x) => <Link key={x.slug} to={x.path} className="ilink">{x.name}</Link>)}
        </nav>
      </Section>

      <ResearchCards slugs={s.research} />
      <CtaBand title={s.cta.title} body={s.cta.body} primary={{ label: slug === 'bfsi' ? 'Book a fraud signals session' : 'Book a demo', to: `/request-demo?product=${DEMO[slug]}` }} />
    </>
  );
}
