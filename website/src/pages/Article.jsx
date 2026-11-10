import { Suspense, use, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { POSTS, formatDate, authorOf } from '../data/posts.js';
import { Breadcrumb, Button, Icon, cx } from '../components/ui.jsx';
import { CtaBand, ResearchCards } from '../components/ds.jsx';
import Cover, { TOPIC } from '../components/Cover.jsx';
import ProductMark from '../components/ProductMark.jsx';
import Prose, { HeadingLink, slugify } from '../components/Prose.jsx';
import NotFound from './NotFound.jsx';

// One chunk per article body; prerender waits for it, the browser loads it on demand.
const BODIES = import.meta.glob('../content/posts/*.json', { import: 'default' });
const cache = {};
const load = (slug) => (cache[slug] ??= BODIES[`../content/posts/${slug}.json`]());

const hueOf = (c) => (TOPIC[c] || { hue: 200 }).hue;

function useReadProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const el = document.documentElement; setP(Math.min(1, Math.max(0, el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)))); }); };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);
  return p;
}

/* The reading bar and the TOC percentage own the scroll state, so scrolling
   re-renders two small components, not the whole article. */
function ReadBar({ h }) {
  const progress = useReadProgress();
  return <div aria-hidden="true" className="noprint fixed inset-x-0 z-[61] h-[2px]" style={{ top: 'var(--hdr-now, var(--hdr))' }}><div className="h-full origin-left" style={{ transform: `scaleX(${progress.toFixed(3)})`, background: `linear-gradient(90deg, hsl(${h} 100% 60%), hsl(${h} 100% 80%))` }} /></div>;
}
function ReadPct() {
  return <span className="num">{Math.round(useReadProgress() * 100)}%</span>;
}

const isPunch = (b, prev) => b.type === 'p' && prev?.type === 'p' && b.text.length <= 64 && !/[:,]$/.test(b.text);

function ProductCallout({ post }) {
  const h = hueOf(post.category);
  return (
    <aside className="my-10 overflow-hidden rounded-[22px] border border-line p-7 md:p-8" style={{ background: `radial-gradient(90% 140% at 100% 0%, hsl(${h} 90% 50% / .14), transparent 60%), color-mix(in oklab, var(--color-fg) 3%, transparent)` }}>
      <p className="text-[12.5px] font-semibold uppercase tracking-[.1em]" style={{ color: `hsl(${h} 100% var(--hl))` }}>Related product</p>
      <p className="mt-3 flex items-center gap-3 text-[24px] font-semibold tracking-[-0.02em]"><ProductMark p={post.product.name} size={40} />{post.product.name}</p>
      <p className="mt-1 text-[15.5px] text-ink-2">See how Deep Algorithms handles this in practice, on your own environment.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button to={post.product.path} size="sm" arrow>See how {post.product.name} works</Button>
      </div>
    </aside>
  );
}

function Body({ slug, post, onToc }) {
  const blocks = use(load(slug));
  const toc = blocks.filter((b) => b.type === 'h2');
  useEffect(() => { onToc(toc.map((h) => ({ id: slugify(h.text), text: h.text }))); }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const midH2 = toc.length >= 4 ? toc[Math.floor(toc.length / 2)] : null;
  const midIdx = midH2 ? blocks.indexOf(midH2) : blocks.findIndex((b, i) => i >= Math.floor(blocks.length * 0.5) && b.type === 'p');

  // a short "Key takeaways / Key findings" section becomes a summary card
  const kt = blocks.findIndex((b) => b.type === 'h2' && /^key (takeaways|findings)$/i.test(b.text));
  let ktEnd = kt;
  while (kt >= 0 && blocks[ktEnd + 1] && blocks[ktEnd + 1].type !== 'h2') ktEnd += 1;
  const summary = kt >= 0 && ktEnd - kt >= 2 && ktEnd - kt <= 10 && blocks.slice(kt + 1, ktEnd + 1).every((b) => b.type === 'p');
  const h = hueOf(post.category);

  const out = blocks.map((b, i) => {
    if (summary && i > kt && i <= ktEnd) return null;
    if (summary && i === kt) {
      return (
        <section key={i} id={slugify(b.text)} data-sec className="scroll-mt-28 rounded-[22px] border border-line p-7 md:p-9" style={{ background: `linear-gradient(180deg, hsl(${h} 80% 50% / .08), color-mix(in oklab, var(--color-fg) 2%, transparent))` }}>
          <h2 className="flex items-center gap-3 text-[22px] font-semibold tracking-[-0.02em] md:text-[26px]"><Icon name="ListChecks" size={24} style={{ color: `hsl(${h} 100% var(--hl))` }} />{b.text}</h2>
          <ul className="mt-6 space-y-4">
            {blocks.slice(kt + 1, ktEnd + 1).map((x, k) => (
              <li key={k} className="flex gap-4 text-[17px] leading-[1.65] text-ink">
                <span className="mt-[2px] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-on-acc num" style={{ background: `hsl(${h} 100% var(--hl))` }}>{k + 1}</span>{x.text}
              </li>
            ))}
          </ul>
        </section>
      );
    }
    const prev = blocks[i - 1];
    const card = i === midIdx ? <ProductCallout key={`c${i}`} post={post} /> : null;
    let el;
    if (b.type === 'h2') {
      el = <div key={i} className="group relative pt-8"><h2 id={slugify(b.text)} data-sec className="scroll-mt-28 text-[26px] font-semibold leading-[1.2] tracking-[-0.024em] text-ink md:text-[30px]">{b.text}</h2><HeadingLink id={slugify(b.text)} /></div>;
    } else if (b.type === 'h3') {
      el = <h3 key={i} className="pt-2 text-[21px] font-semibold leading-snug tracking-[-0.018em] text-ink">{b.text}</h3>;
    } else if (i === 0 && b.type === 'p') {
      el = <p key={i} className="text-[21px] leading-[1.65] text-ink md:text-[23px]">{b.text}</p>;
    } else if (isPunch(b, prev)) {
      el = <p key={i} className="my-1 text-[23px] font-semibold leading-snug tracking-[-0.02em] text-ink md:text-[26px]">{b.text}</p>;
    } else if (b.type === 'quote') {
      el = (
        <figure key={i} className="my-8 border-l-[3px] pl-6 md:pl-8" style={{ borderColor: `hsl(${h} 100% var(--hl))` }}>
          <blockquote className="text-[23px] font-medium leading-[1.45] tracking-[-0.018em] text-ink md:text-[28px]">{b.text}</blockquote>
        </figure>
      );
    } else if (b.type === 'p') {
      el = <p key={i} className="text-[18px] leading-[1.75] text-ink-2">{b.text}</p>;
    } else if (b.type === 'list') {
      el = <ul key={i} className="space-y-3">{b.items.map((t, k) => <li key={k} className="flex gap-3 text-[18px] leading-[1.7] text-ink-2"><span className="mt-[12px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `hsl(${h} 100% var(--hl))` }} />{t}</li>)}</ul>;
    } else {
      el = <Prose key={i} blocks={[b]} />;
    }
    return card ? [card, el] : el;
  });
  return <div className="flex flex-col gap-6">{out}</div>;
}

function Toc({ toc }) {
  const [active, setActive] = useState('');
  useEffect(() => {
    const els = toc.map((t) => document.getElementById(t.id)).filter(Boolean);
    if (!els.length) return undefined;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }), { rootMargin: '-20% 0px -70% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [toc]);
  if (toc.length < 3) return null;
  return (
    <nav aria-label="On this page">
      <p className="flex items-center justify-between text-[12.5px] font-semibold uppercase tracking-[.1em] text-ink-3">In this report<ReadPct /></p>
      <ul className="mt-4 space-y-0.5 border-l border-line text-[14px]">
        {toc.map((t) => {
          const on = active === t.id;
          return <li key={t.id}><a href={`#${t.id}`} aria-current={on ? 'true' : undefined} className={cx('-ml-px block border-l-2 py-1.5 pl-4 leading-snug transition-colors', on ? 'border-cyan font-medium text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>{t.text}</a></li>;
        })}
      </ul>
    </nav>
  );
}

function Share({ post, path }) {
  const [copied, setCopied] = useState(false);
  const url = SITE.url + path;
  const copy = () => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); };
  const btn = 'inline-flex h-10 items-center gap-2 rounded-full border border-line-2 px-4 text-[14px] text-ink-2 transition-colors hover:border-fg/30 hover:text-ink';
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copy} className={btn}><Icon name="LinkSimple" size={16} />{copied ? 'Link copied' : 'Copy link'}</button>
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" className={btn}><Icon name="LinkedinLogo" size={16} />LinkedIn</a>
      <a href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(url)}`} className={btn}><Icon name="EnvelopeSimple" size={16} />Email</a>
    </div>
  );
}

export default function Article() {
  const { slug } = useParams();
  const post = POSTS.find((p) => p.slug === slug);
  const [toc, setToc] = useState([]);
  if (!post) return <NotFound />;
  const path = `/blogs/${slug}`;
  const idx = POSTS.indexOf(post);
  const newer = POSTS[idx - 1], older = POSTS[idx + 1];
  const related = POSTS.filter((p) => p.slug !== slug && p.category === post.category).concat(POSTS.filter((p) => p.slug !== slug && p.category !== post.category)).slice(0, 3);
  const h = hueOf(post.category);
  const schema = [{
    '@type': 'BlogPosting', headline: post.title, description: post.excerpt, datePublished: post.date, url: SITE.url + path,
    image: `${SITE.url}/og/default.png`, articleSection: post.category,
    author: post.author ? { '@type': 'Person', name: post.author } : { '@type': 'Organization', name: authorOf(post) },
    publisher: { '@id': `${SITE.url}/#org` },
  }];

  return (
    <>
      <Seo title={post.title} description={post.excerpt} path={path} type="article" schema={schema} crumbs={[{ name: 'Blogs', path: '/blogs' }, { name: post.title, path }]} />
      <ReadBar h={h} />

      <article>
        <header className="wrap pt-10 md:pt-14">
          <Breadcrumb items={[{ name: 'Blogs', path: '/blogs' }, { name: post.category }]} className="rise" />
          <div className="mx-auto mt-10 max-w-[900px] text-center">
            <p className="rise inline-flex items-center gap-2 rounded-full border border-line-2 px-3.5 py-1.5 text-[13px] font-semibold" style={{ color: `hsl(${h} 100% var(--hl))` }}>{post.category}{post.fiction && <span className="font-normal text-ink-3">· Dramatised account</span>}</p>
            <h1 className="rise mt-6 font-semibold tracking-[-0.04em]" style={{ fontSize: 'clamp(32px, 4.4vw, 60px)', lineHeight: 1.06, '--d': '80ms' }}>{post.title}</h1>
            <p className="t-lead rise mx-auto mt-6 max-w-[700px]" style={{ '--d': '160ms' }}>{post.excerpt}</p>
            <div className="rise mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[14px] text-ink-3" style={{ '--d': '240ms' }}>
              <span className="inline-flex items-center gap-3"><span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-bg-2 p-1.5"><img src="/brand/mark.webp" alt="" className="h-full w-full" /></span><span className="font-medium text-ink-2">{authorOf(post)}</span></span>
              <span>{formatDate(post)}</span><span>{post.read} min read</span>
            </div>
            <p className="printonly mt-4 text-[13px]">{SITE.url.replace(/^https?:\/\//, '')}{path}</p>
          </div>
          <Cover post={post} className="noprint rise mx-auto mt-12 aspect-[16/9] max-w-[1180px] rounded-[26px] border border-line md:aspect-[21/9]" style={{ '--d': '300ms' }} />
        </header>

        <div className="calm mt-14">
          <div className="wrap grid grid-cols-1 gap-12 py-14 md:py-20 lg:grid-cols-[220px_minmax(0,720px)_220px] lg:justify-between xl:grid-cols-[250px_minmax(0,740px)_250px]">
            <aside className="noprint hidden lg:block"><div className="sticky top-28"><Toc toc={toc} /></div></aside>
            <div className="min-w-0">
              {toc.length > 2 && (
                <details className="noprint mb-10 rounded-[18px] border border-line bg-fg/[.03] p-5 lg:hidden">
                  <summary className="cursor-pointer text-[15px] font-semibold">In this report ({toc.length} sections)</summary>
                  <ol className="mt-4 space-y-2 text-[15px]">{toc.map((t, k) => <li key={t.id} className="flex gap-3"><span className="w-5 shrink-0 text-cyan-2 num">{k + 1}</span><a href={`#${t.id}`} className="text-ink-2 hover:text-ink">{t.text}</a></li>)}</ol>
                </details>
              )}
              <Suspense fallback={<div className="min-h-[60vh]" />}><Body slug={slug} post={post} onToc={setToc} /></Suspense>

              <div className="noprint mt-16 rounded-[22px] border border-line p-6 md:p-8">
                <div className="flex items-center gap-4">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-bg-2 p-2.5"><img src="/brand/mark.webp" alt="" className="h-full w-full" /></span>
                  <div><p className="text-[19px] font-semibold">{authorOf(post)}</p><p className="text-[14.5px] text-ink-3">Field notes and analysis on identity, AI agents, fraud and the regulation that shapes them.</p></div>
                </div>
                <div className="mt-6 border-t border-line pt-6"><p className="mb-3 text-[14px] text-ink-2">Share this report</p><Share post={post} path={path} /></div>
              </div>

              <nav aria-label="More blogs" className="noprint mt-10 grid gap-4 sm:grid-cols-2">
                {older && <Link to={`/blogs/${older.slug}`} className="card card-hover p-5"><span className="flex items-center gap-1.5 text-[13px] text-ink-3"><Icon name="ArrowLeft" size={13} />Previous</span><span className="mt-2 block text-[16px] font-semibold leading-snug">{older.title}</span></Link>}
                {newer && <Link to={`/blogs/${newer.slug}`} className="card card-hover p-5 sm:col-start-2 sm:text-right"><span className="flex items-center gap-1.5 text-[13px] text-ink-3 sm:justify-end">Next<Icon name="ArrowRight" size={13} /></span><span className="mt-2 block text-[16px] font-semibold leading-snug">{newer.title}</span></Link>}
              </nav>
            </div>
            <aside className="noprint hidden lg:block">
              <div className="sticky top-28 space-y-6">
                <div className="rounded-[18px] border border-line p-5">
                  <p className="text-[12px] font-semibold uppercase tracking-[.1em]" style={{ color: `hsl(${h} 100% var(--hl))` }}>Related product</p>
                  <p className="mt-3 flex items-center gap-2.5 text-[17px] font-semibold leading-snug"><ProductMark p={post.product.name} size={30} />{post.product.name}</p>
                  <Link to={post.product.path} className="link mt-3 text-[14px]">See how it works<Icon name="ArrowRight" size={13} weight="bold" /></Link>
                </div>
                <div><p className="mb-3 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">Share</p><Share post={post} path={path} /></div>
              </div>
            </aside>
          </div>
        </div>
      </article>

      <ResearchCards slugs={related.map((p) => p.slug)} title="Keep reading" />
      <CtaBand title={`Put ${post.product.name} to work in your environment.`} body="Book a demo and we will show you what this looks like where you work." />
    </>
  );
}
