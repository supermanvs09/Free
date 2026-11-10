import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { POSTS, formatDate } from '../data/posts.js';
import { Icon, cx } from '../components/ui.jsx';
import { PostCard, CtaBand, PageHero } from '../components/ds.jsx';
import { NEWS } from '../data/company.js';
import Cover, { TOPIC } from '../components/Cover.jsx';
import { topicSlug } from '../components/Header.jsx';

const TOPICS = [...new Set(POSTS.map((p) => p.category))];
const PRODUCTS = [...new Set(POSTS.map((p) => p.product.name.split(' ')[0]))];
const hueOf = (c) => `hsl(${(TOPIC[c] || { hue: 200 }).hue} 100% var(--hl))`;

export default function Blog() {
  const [params, setParams] = useSearchParams();
  const topic = params.get('topic') || '';
  const product = params.get('product') || '';
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'new';
  const set = (k, v) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); setParams(n, { replace: true, preventScrollReset: true }); };

  const list = useMemo(() => POSTS.filter((p) => (!topic || topicSlug(p.category) === topic)
    && (!product || p.product.name.startsWith(product))
    && (!q || `${p.title} ${p.excerpt} ${p.category}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (sort === 'short' ? a.read - b.read : sort === 'old' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))), [topic, product, q, sort]);
  const feat = POSTS[0];
  const filtering = topic || product || q;

  return (
    <>
      <Seo title="Blogs: Identity, AI Agent and Fraud Security" path="/blogs" description="Field notes and analysis from Deep Algorithms on identity attacks, AI agent security, financial crime and DPDPA compliance." crumbs={[{ name: 'Research', path: '/blogs' }]} />

      <PageHero crumbs={[{ name: 'Resources' }, { name: 'Blog and research' }]} overline="Blog and research" size="h1"
        title="How identities get attacked, and how to stop it."
        lead={`Field notes and analysis on identity attacks, AI agents, financial crime and the regulation that shapes them. ${POSTS.length} articles.`} />

      <section className="sec pt-12 md:pt-14" aria-labelledby="all-h">
        <div className="wrap">
          {/* featured: the newest post, large, until the reader filters */}
          {!filtering && sort === "new" && feat && (
            <Link to={`/blogs/${feat.slug}`} className="card card-hover group mb-14 grid overflow-hidden md:grid-cols-[1.15fr_1fr]">
              <Cover post={feat} className="aspect-[16/10] md:aspect-auto md:min-h-[320px]" />
              <span className="flex flex-col justify-center p-7 md:p-10">
                <span className="text-[12.5px] font-semibold uppercase tracking-[.1em]" style={{ color: hueOf(feat.category) }}>Featured · {feat.category}</span>
                <span className="mt-3 text-[clamp(24px,2.4vw,32px)] font-semibold leading-tight tracking-[-0.025em]">{feat.title}</span>
                <span className="mt-4 text-[16px] leading-relaxed text-ink-2">{feat.excerpt}</span>
                <span className="mt-6 text-[13.5px] text-ink-3">{formatDate(feat)} · {feat.read} min read</span>
                <span className="link mt-5">Read the blog<Icon name="ArrowRight" size={14} weight="bold" /></span>
              </span>
            </Link>
          )}
          <div className="grid gap-10 lg:grid-cols-[250px_1fr] lg:gap-12">
            {/* filters: a sidebar on desktop, chip rows on phones */}
            <aside className="lg:sticky lg:top-[calc(var(--hdr-now,var(--hdr))+24px)] lg:self-start" aria-label="Filter blogs">
              <label htmlFor="rs" className="mb-2 block text-[13px] font-medium text-ink-3">Search the blogs</label>
              <div className="flex h-11 items-center gap-2.5 rounded-[12px] border border-line-2 bg-white px-3.5 focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--color-brand-100)]">
                <Icon name="MagnifyingGlass" size={17} className="text-ink-3" />
                <input id="rs" type="search" value={q} onChange={(e) => set('q', e.target.value)} placeholder="Mule accounts, MCP, AI agents…" className="h-full w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3" />
              </div>
              {[['Topic', 'topic', [['', 'All topics', POSTS.length], ...TOPICS.map((t) => [topicSlug(t), t, POSTS.filter((p) => p.category === t).length])], topic],
                ['Product', 'product', [['', 'All products', POSTS.length], ...PRODUCTS.map((v) => [v, v, POSTS.filter((p) => p.product.name.startsWith(v)).length])], product]].map(([title, key, opts, cur]) => (
                <fieldset key={key} className="mt-7">
                  <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">{title}</legend>
                  <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5" role="group" aria-label={`Filter by ${key}`}>
                    {opts.map(([v, label, n]) => (
                      <button key={label} type="button" aria-pressed={cur === v} onClick={() => set(key, v)}
                        className={cx('flex items-center justify-between gap-3 rounded-full border px-3.5 py-1.5 text-left text-[14px] transition-colors lg:rounded-[10px] lg:border-transparent lg:px-3 lg:py-2',
                          cur === v ? 'border-transparent bg-brand font-medium text-white lg:bg-brand-50 lg:text-brand' : 'border-line-2 text-ink-2 hover:bg-bg-1 hover:text-ink')}>
                        <span className="flex items-center gap-2.5"><span aria-hidden="true" className={cx('hidden h-4 w-4 shrink-0 place-items-center rounded-[5px] border lg:grid', cur === v ? 'border-[#0a6dbb] bg-[#0a6dbb] text-white' : 'border-line-2 bg-white')}>{cur === v && <Icon name="Check" size={11} weight="bold" />}</span>{label}</span>
                        <span className="text-[12px] opacity-60 num">{n}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
              {filtering && <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true, preventScrollReset: true })} className="mt-6 text-[14px] font-medium text-brand hover:text-ink">Clear filters</button>}
            </aside>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <h2 id="all-h" className="text-[22px] font-semibold tracking-[-0.02em]">{filtering ? `${list.length} ${list.length === 1 ? 'result' : 'results'}` : <span className="inline-flex items-center gap-3 font-display">Recent research<Icon name="ArrowRight" size={22} className="rotate-45 text-brand" /></span>}</h2>
                <label className="flex items-center gap-2 text-[13.5px] text-ink-3">Sort by
                  <select value={sort} onChange={(e) => set('sort', e.target.value === 'new' ? '' : e.target.value)} className="h-10 rounded-[10px] border border-line-2 bg-white px-3 text-[14px] text-ink">
                    <option value="new">Most recent</option><option value="old">Oldest first</option><option value="short">Quickest read</option>
                  </select>
                </label>
              </div>
              <p className="mt-3 text-[13px] text-ink-3" aria-live="polite">Showing {list.length} of {POSTS.length} blogs</p>
              {list.length ? (
                <div className="mt-8 grid gap-x-7 gap-y-12 md:grid-cols-2">
                  {(filtering || sort !== "new" ? list : list.filter((p) => p !== feat)).map((p) => <div key={p.slug} className="fadein"><PostCard post={p} /></div>)}
                </div>
              ) : (
                <div className="mt-10 rounded-[22px] border border-dashed border-line-2 p-12 text-center">
                  <p className="text-[20px] font-semibold">Nothing matches that yet.</p>
                  <p className="mt-2 text-ink-2">Try another word, or clear the filters to see all {POSTS.length} blogs.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="sec-sm bd-t" aria-labelledby="news-h">
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="news-h" className="t-h2">In the news</h2>
            <Link to="/about-us#news" className="alink">All news<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></Link>
          </div>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {NEWS.slice(0, 3).map((n) => (
              <li key={n.title}><a href={n.href} target="_blank" rel="noreferrer" className="card card-link group flex h-full flex-col p-6"><p className="flex items-center gap-2 t-caption"><span className="badge badge-brand">{n.kind}</span>{n.date}</p><p className="mt-3 t-h4 group-hover:text-brand">{n.title}</p><span className="mt-auto pt-4 text-[13.5px] font-semibold text-brand">{n.cta} ↗<span className="sr-only"> (opens in a new tab)</span></span></a></li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand title="Put what you read to work." body="See how what we write about looks in your own environment, with a Deep Algorithms engineer." />
    </>
  );
}
