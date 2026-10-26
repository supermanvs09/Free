import { Suspense, use } from 'react';
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

function Body({ slug }) {
  const blocks = use(load(slug));
  const toc = blocks.filter((b) => b.type === 'h2');
  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-[220px_1fr] lg:gap-16">
      <aside className="hidden lg:block">
        {toc.length > 2 && (
          <nav aria-label="On this page" className="sticky top-28">
            <p className="text-[13px] font-medium text-ink">On this page</p>
            <ul className="mt-4 space-y-2.5 border-l border-line pl-4 text-[14px]">
              {toc.map((h) => <li key={h.text}><a href={`#${slugify(h.text)}`} className="text-ink-3 hover:text-brand">{h.text}</a></li>)}
            </ul>
          </nav>
        )}
      </aside>
      <div className="max-w-[740px]"><Prose blocks={blocks} /></div>
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

      <article>
        <header className="wrap pt-12 md:pt-16">
          <Breadcrumb items={[{ name: 'Research', path: '/blogs' }, { name: post.title }]} />
          <div className="mt-10 grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr] lg:gap-16">
            <div>
              <p className="text-[15px] font-medium text-brand">{post.category}{post.fiction && ' · Dramatised account'}</p>
              <h1 className="mt-3 font-display text-[34px] font-light leading-[1.1] tracking-[-0.025em] text-ink md:text-[48px]">{post.title}</h1>
              <p className="t-lead mt-5">{post.excerpt}</p>
              <div className="mt-8 flex items-center gap-3 text-[14px] text-ink-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky"><img src="/brand/mark.webp" alt="" className="h-5 w-5" /></span>
                <span><span className="block font-medium text-ink-2">{authorOf(post)}</span>{formatDate(post)} · {post.read} min read</span>
              </div>
            </div>
            <Cover big post={post} className="aspect-[8/5] rounded-[24px]" />
          </div>
        </header>

        <div className="wrap py-14 md:py-20">
          <Suspense fallback={<div className="min-h-[60vh]" />}><Body slug={slug} /></Suspense>
          <aside className="mt-16 flex flex-col gap-6 rounded-[24px] bg-mist p-8 md:ml-[276px] md:max-w-[740px] md:flex-row md:items-center lg:ml-[276px]">
            <div className="flex-1">
              <p className="text-[14px] font-medium text-brand">Related product</p>
              <p className="mt-1 font-display text-[24px] font-light text-ink">{post.product.name}</p>
              <div className="mt-2"><LearnMore to={post.product.path}>See how it works</LearnMore></div>
            </div>
            <Button to="/request-demo">Book a demo</Button>
          </aside>
          <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE.url + path)}`} target="_blank" rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 text-[15px] text-ink-3 hover:text-brand md:ml-[276px]"><Icon name="LinkedinLogo" size={20} />Share on LinkedIn</a>
        </div>
      </article>

      <ResearchRow slugs={related.map((p) => p.slug)} />
      <CtaPanel />
    </>
  );
}
