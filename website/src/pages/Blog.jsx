import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { POSTS, formatDate, authorOf } from '../data/posts.js';
import { Breadcrumb, Icon, Reveal, cx } from '../components/ui.jsx';
import { Cover, CtaPanel, PostCard } from '../components/blocks.jsx';

const CATS = ['All', ...new Set(POSTS.map((p) => p.category))];

export default function Blog() {
  const [cat, setCat] = useState('All');
  const [lead, ...rest] = POSTS;
  const list = cat === 'All' ? rest : POSTS.filter((p) => p.category === cat);

  return (
    <>
      <Seo title="Research: Identity, AI Agent and Fraud Security" path="/blogs" crumbs={[{ name: 'Research', path: '/blogs' }]}
        description="Research from Deep Algorithms on identity security, AI agent governance, financial crime, bot defence and DPDPA compliance." />

      <section className="wrap pt-12 md:pt-16">
        <Breadcrumb items={[{ name: 'Research' }]} />
        <h1 className="t-h1 mt-8">Research</h1>
        <p className="t-lead mt-4 max-w-[640px]">Field notes and analysis on identity, AI agents, fraud and the regulation that shapes them.</p>

        {cat === 'All' && (
          <Link to={`/blogs/${lead.slug}`} className="group mt-12 grid items-center gap-8 rounded-[24px] bg-mist p-4 md:grid-cols-[1.15fr_1fr] md:gap-12 md:p-5">
            <Cover big post={lead} className="aspect-[16/10] rounded-[18px]" />
            <div className="p-2 md:pr-8">
              <p className="text-[14px] font-medium text-brand">Latest · {lead.category}</p>
              <h2 className="mt-3 font-display text-[28px] font-light leading-tight tracking-[-0.02em] text-ink group-hover:text-brand md:text-[38px]">{lead.title}</h2>
              <p className="mt-4 text-ink-2">{lead.excerpt}</p>
              <p className="mt-6 text-[14px] text-ink-3">{authorOf(lead)} · {formatDate(lead)} · {lead.read} min read</p>
            </div>
          </Link>
        )}
      </section>

      <section className="wrap py-14 md:py-20">
        <div role="group" aria-label="Filter by topic" className="flex flex-wrap gap-2">
          {CATS.map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
              className={cx('h-10 rounded-full border px-4 text-[14px] transition-colors', cat === c ? 'border-navy bg-navy text-white' : 'border-line-2 text-ink-2 hover:border-navy hover:text-navy')}>
              {c}
            </button>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">{list.length} articles</p>
        <div className="mt-10 grid gap-x-8 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
          {list.map((p, i) => <Reveal key={p.slug} delay={(i % 3) * 70}><PostCard post={p} /></Reveal>)}
        </div>
        {list.length === 0 && <p className="mt-10 flex items-center gap-2 text-ink-3"><Icon name="MagnifyingGlass" size={18} />No articles in this topic yet.</p>}
      </section>

      <CtaPanel />
    </>
  );
}
