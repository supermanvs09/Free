import { Suspense, use, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { POSTS, formatDate, authorOf } from '../data/posts.js';
import { Breadcrumb, Button, Icon, LearnMore } from '../components/ui.jsx';
import { Cover, CtaPanel, ResearchRow } from '../components/blocks.jsx';
import Prose, { slugify } from '../components/Prose.jsx';
import NotFound from './NotFound.jsx';

// One chunk per article body; prerender waits for it, the browser loads it on demand.
const BODIES = import.meta.glob('../content/posts/*.json', { import: 'default' });
const cache = {};
const load = (slug) => (cache[slug] ??= BODIES[`../content/posts/${slug}.json`]());

/* A thin bar under the header that fills as you read. */
function ReadingProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const on = () => { const el = document.documentElement; setP(Math.min(1, Math.max(0, el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)))); };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return <div aria-hidden="true" className="fixed inset-x-0 top-[73px] z-30 h-[3px] bg-transparent"><div className="h-full origin-left bg-brand" style={{ transform: `scaleX(${p.toFixed(3)})` }} /></div>;
}

const isPunch = (b, prev) => b.type === 'p' && prev?.type === 'p' && b.text.length <= 64 && !/[:,]$/.test(b.text);

function ProductCallout({ post }) {
  return (
    <aside className="my-12 flex flex-col gap-5 rounded-[24px] bg-navy p-7 text-white md:flex-row md:items-center md:p-8">
      <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-white"><img src="/brand/mark.webp" alt="" className="h-8 w-8" /></span>
      <div className="flex-1">
        <p className="text-[13px] font-medium uppercase tracking-[.12em] text-cyan">Related product</p>
        <p className="mt-1 font-display text-[26px] font-light leading-tight">{post.product.name}</p>
        <p className="mt-1 text-[15px] text-white/75">See how Deep Algorithms handles this in practice.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button to={post.product.path} variant="white">See how it works</Button>
        <Button to="/request-demo" variant="ghostWhite">Book a demo</Button>
      </div>
    </aside>
  );
}

function Body({ slug, post }) {
  const blocks = use(load(slug));
  const toc = blocks.filter((b) => b.type === 'h2');
  const numbered = toc.length >= 5 && !post.fiction;
  const [active, setActive] = useState('');
  useEffect(() => {
    const els = [...document.querySelectorAll('[data-sec]')];
    if (!els.length) return undefined;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: '-15% 0px -75% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [blocks]);

  // where the product card goes: before the middle section, or halfway through a short article
  const midH2 = toc.length >= 4 ? toc[Math.floor(toc.length / 2)] : null;
  const midIdx = midH2 ? blocks.indexOf(midH2) : blocks.findIndex((b, i) => i >= Math.floor(blocks.length * 0.5) && b.type === 'p');
  let n = 0;

  // a short "Key takeaways / Key findings" section becomes a summary card
  const kt = blocks.findIndex((b) => b.type === 'h2' && /^key (takeaways|findings)$/i.test(b.text));
  let ktEnd = kt;
  while (kt >= 0 && blocks[ktEnd + 1] && blocks[ktEnd + 1].type !== 'h2') ktEnd += 1;
  const summary = kt >= 0 && ktEnd - kt >= 2 && ktEnd - kt <= 10 && blocks.slice(kt + 1, ktEnd + 1).every((b) => b.type === 'p');

  const out = blocks.map((b, i) => {
    if (summary && i > kt && i <= ktEnd) return null;
    if (summary && i === kt) {
      return (
        <section key={i} id={slugify(b.text)} data-sec className="scroll-mt-28 rounded-[24px] bg-mist p-7 md:p-9">
          <h2 className="font-display text-[26px] font-light tracking-[-0.015em] text-ink md:text-[30px]">{b.text}</h2>
          <ul className="mt-6 space-y-4">
            {blocks.slice(kt + 1, ktEnd + 1).map((x, k) => <li key={k} className="flex gap-3 text-[17.5px] leading-[1.65] text-ink"><Icon name="CheckCircle" size={24} weight="fill" className="mt-0.5 shrink-0 text-brand" />{x.text}</li>)}
          </ul>
        </section>
      );
    }
    const prev = blocks[i - 1];
    const card = i === midIdx ? <ProductCallout key={`c${i}`} post={post} /> : null;
    let el;
    if (b.type === 'h2') {
      n += 1;
      el = (
        <h2 key={i} id={slugify(b.text)} data-sec className="scroll-mt-28 border-t border-line pt-8 font-display text-[28px] font-light leading-[1.2] tracking-[-0.02em] text-ink md:text-[34px]">
          {numbered && <span className="mb-2 block text-[14px] font-medium tracking-[.12em] text-brand">{String(n).padStart(2, '0')}</span>}
          {b.text}
        </h2>
      );
    } else if (i === 0 && b.type === 'p') {
      el = <p key={i} className="text-[20px] leading-[1.65] text-ink md:text-[22px]">{b.text}</p>;
    } else if (isPunch(b, prev)) {
      el = <p key={i} className="my-2 font-display text-[24px] font-light leading-snug tracking-[-0.01em] text-ink md:text-[28px]">{b.text}</p>;
    } else if (b.type === 'quote') {
      el = (
        <figure key={i} className="my-10 border-l-[3px] border-coral pl-6 md:pl-8">
          <blockquote className="font-display text-[24px] font-light leading-[1.4] tracking-[-0.015em] text-ink md:text-[30px]">{b.text}</blockquote>
        </figure>
      );
    } else if (b.type === 'p') {
      el = <p key={i} className="text-[18px] leading-[1.8] text-ink-2 md:text-[19px]">{b.text}</p>;
    } else if (b.type === 'list') {
      el = <ul key={i} className="space-y-3">{b.items.map((t, k) => <li key={k} className="flex gap-3 text-[18px] leading-[1.7] text-ink-2"><Icon name="CheckCircle" size={22} weight="fill" className="mt-1 shrink-0 text-brand" />{t}</li>)}</ul>;
    } else {
      el = <Prose key={i} blocks={[b]} />;
    }
    return card ? [card, el] : el;
  });

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[230px_1fr] lg:gap-16">
      <aside className="hidden lg:block">
        {toc.length > 2 && (
          <nav aria-label="On this page" className="sticky top-32">
            <p className="text-[13px] font-semibold uppercase tracking-[.12em] text-ink-3">In this article</p>
            <ul className="mt-4 space-y-1 border-l border-line text-[14.5px]">
              {toc.map((h) => {
                const id = slugify(h.text), on = active === id;
                return <li key={h.text}><a href={`#${id}`} aria-current={on ? 'true' : undefined} className={`-ml-px block border-l-2 py-1.5 pl-4 leading-snug ${on ? 'border-brand font-medium text-brand' : 'border-transparent text-ink-3 hover:text-ink'}`}>{h.text}</a></li>;
              })}
            </ul>
          </nav>
        )}
      </aside>
      <div className="min-w-0 max-w-[740px]">
        {toc.length > 2 && (
          <nav aria-label="In this article" className="mb-10 rounded-[20px] bg-mist p-6 lg:hidden">
            <p className="text-[13px] font-semibold uppercase tracking-[.12em] text-ink-3">In this article</p>
            <ol className="mt-3 space-y-2 text-[15.5px]">
              {toc.map((h, k) => <li key={h.text} className="flex gap-3"><span className="w-5 shrink-0 text-brand">{k + 1}</span><a href={`#${slugify(h.text)}`} className="text-ink-2 hover:text-brand">{h.text}</a></li>)}
            </ol>
          </nav>
        )}
        <div className="flex flex-col gap-6">{out}</div>
      </div>
    </div>
  );
}

function ShareRow({ post, path }) {
  const [copied, setCopied] = useState(false);
  const url = SITE.url + path;
  const copy = () => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); };
  const btn = 'inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-[14.5px] text-ink-2 transition-colors hover:border-brand hover:text-brand';
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={copy} className={btn}><Icon name="LinkSimple" size={18} />{copied ? 'Link copied' : 'Copy link'}</button>
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className={btn}><Icon name="LinkedinLogo" size={18} />Share on LinkedIn</a>
      <a href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(url)}`} className={btn}><Icon name="EnvelopeSimple" size={18} />Email</a>
    </div>
  );
}

export default function Article() {
  const { slug } = useParams();
  const post = POSTS.find((p) => p.slug === slug);
  if (!post) return <NotFound />;
  const path = `/blogs/${slug}`;
  const related = POSTS.filter((p) => p.slug !== slug && p.category === post.category).concat(POSTS.filter((p) => p.slug !== slug && p.category !== post.category)).slice(0, 3);
  const schema = [{
    '@type': 'BlogPosting', headline: post.title, description: post.excerpt, datePublished: post.date, url: SITE.url + path,
    image: `${SITE.url}/og/default.png`, articleSection: post.category,
    author: post.author ? { '@type': 'Person', name: post.author } : { '@type': 'Organization', name: authorOf(post) },
    publisher: { '@id': `${SITE.url}/#org` },
  }];

  return (
    <>
      <Seo title={post.title} description={post.excerpt} path={path} type="article" schema={schema} crumbs={[{ name: 'Research', path: '/blogs' }, { name: post.title, path }]} />
      <ReadingProgress />

      <article>
        <header className="wrap pt-12 md:pt-16">
          <Breadcrumb items={[{ name: 'Research', path: '/blogs' }, { name: post.title }]} />
          <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr] lg:gap-16">
            <div>
              <p className="text-[15px] font-medium text-brand">{post.category}{post.fiction && ' · Dramatised account'}</p>
              <h1 className="mt-3 font-display text-[34px] font-light leading-[1.1] tracking-[-0.025em] text-ink md:text-[48px]">{post.title}</h1>
              <p className="t-lead mt-5">{post.excerpt}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-[14px] text-ink-3">
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky"><img src="/brand/mark.webp" alt="" className="h-5 w-5" /></span>
                  <span className="font-medium text-ink-2">{authorOf(post)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5"><Icon name="Clock" size={16} />{formatDate(post)} · {post.read} min read</span>
              </div>
            </div>
            <Cover big post={post} className="aspect-[8/5] rounded-[24px]" />
          </div>
        </header>

        <div className="wrap py-14 md:py-20">
          <Suspense fallback={<div className="min-h-[60vh]" />}><Body slug={slug} post={post} /></Suspense>

          <div className="mt-16 grid gap-10 border-t border-line pt-10 lg:grid-cols-[230px_1fr] lg:gap-16">
            <div className="hidden lg:block" />
            <div className="max-w-[740px]">
              <div className="flex items-center gap-4">
                <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky"><img src="/brand/mark.webp" alt="" className="h-7 w-7" /></span>
                <div>
                  <p className="font-display text-[22px] font-light text-ink">{authorOf(post)}</p>
                  <p className="text-[15px] text-ink-3">Field notes and analysis on identity, AI agents, fraud and the regulation that shapes them.</p>
                </div>
              </div>
              <div className="mt-8"><p className="mb-3 text-[14px] font-medium text-ink-2">Share this article</p><ShareRow post={post} path={path} /></div>
              <div className="mt-10"><LearnMore to="/blogs">Back to all research</LearnMore></div>
            </div>
          </div>
        </div>
      </article>

      <ResearchRow slugs={related.map((p) => p.slug)} />
      <CtaPanel title={`Put ${post.product.name} to work on your own identities.`} body="Book a demo and we will show you what this research looks like in your environment." />
    </>
  );
}
