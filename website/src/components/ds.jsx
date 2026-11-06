import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Breadcrumb, Button, Icon, Reveal, Accordion, cx } from './ui.jsx';
import ProductMark from './ProductMark.jsx';
import { CUSTOMERS } from '../data/site.js';
import { POSTS, formatDate } from '../data/posts.js';

/* Building blocks of the design system (docs/redesign/DESIGN_SYSTEM.md §6). */

export const ACC = { adap: 'var(--color-adap)', zen: 'var(--color-zen)', icms: 'var(--color-icms)', brand: 'var(--color-brand)' };

export function ArrowLink({ to, href, children, className, ...rest }) {
  const inner = <>{children}<Icon name="ArrowRight" size={15} weight="bold" className="arr" /></>;
  if (href) return <a href={href} className={cx('alink', className)} {...rest}>{inner}</a>;
  return <Link to={to} className={cx('alink', className)} {...rest}>{inner}</Link>;
}

export function Badge({ tone = 'neutral', dot, children, className }) {
  return <span className={cx('badge', tone !== 'neutral' && `badge-${tone}`, dot && 'badge-dot', className)}>{children}</span>;
}
export const DECISION = {
  allow: ['ok', 'Allowed'], approved: ['ok', 'Approved'], pass: ['ok', 'Passed'], fixed: ['ok', 'Fixed'],
  stepup: ['hold', 'Step-up'], hold: ['hold', 'Held'], review: ['warn', 'Review'], elevated: ['warn', 'Elevated'],
  block: ['crit', 'Blocked'], contain: ['crit', 'Contained'], critical: ['crit', 'Critical'],
};
export function Decision({ d, children }) {
  const [tone, label] = DECISION[d] || ['neutral', d];
  return <Badge tone={tone} dot>{children || label}</Badge>;
}

export function Section({ id, tone, className, children, labelledby, size }) {
  return (
    <section id={id} aria-labelledby={labelledby} className={cx(size === 'sm' ? 'sec-sm' : 'sec', tone === 'subtle' && 'bg-subtle', tone === 'line' && 'bd-t', className)}>
      <div className="container">{children}</div>
    </section>
  );
}

/* The page hero. `media` sits beside the copy from 1024px; `below` spans the full width under it. */
export function PageHero({ crumbs, mark, overline, title, lead, actions, media, below, note, size = 'display', className, align = 'left', tone }) {
  return (
    <section className={cx('relative border-b border-line', tone === 'subtle' ? 'bg-subtle' : 'hero-bg', className)}>
      <div className="container pb-14 pt-8 md:pb-20 md:pt-10">
        {crumbs && <Breadcrumb items={crumbs} className="mb-8 md:mb-10" />}
        <div className={cx('grid items-center gap-10 lg:gap-14', media ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]' : align === 'center' ? 'mx-auto max-w-[900px] text-center' : 'max-w-[900px]')}>
          <div className={cx(media && 'max-w-[620px]')}>
            {mark && <div className={cx('mb-6 flex items-center gap-3', align === 'center' && 'justify-center')}>{mark}</div>}
            {overline && <p className="eyebrow rise mb-5">{overline}</p>}
            <h1 className={cx(size === 'display' ? 't-display' : 't-h1', 'rise')}>{title}</h1>
            {lead && <p className={cx('t-lead rise mt-5 measure', align === 'center' && 'mx-auto')} style={{ '--d': '60ms' }}>{lead}</p>}
            {actions && <div className={cx('rise mt-8 flex flex-wrap gap-3', align === 'center' && 'justify-center')} style={{ '--d': '120ms' }}>{actions}</div>}
            {note && <div className="rise mt-6 t-small" style={{ '--d': '160ms' }}>{note}</div>}
          </div>
          {media && <div className="rise min-w-0" style={{ '--d': '120ms' }}>{media}</div>}
        </div>
        {below && <div className="rise mt-12 md:mt-16" style={{ '--d': '160ms' }}>{below}</div>}
      </div>
    </section>
  );
}

/* Product mark with platform name, used in product heroes. */
export function ProductLabel({ p, name, sub }) {
  return (
    <span className="inline-flex items-center gap-3">
      <ProductMark p={p} size={36} />
      <span className="leading-tight"><span className="block text-[15px] font-semibold text-ink">{name}</span>{sub && <span className="block t-caption">{sub}</span>}</span>
    </span>
  );
}

/* Sticky in-page navigation for product pages; tracks the section in view. */
export function SubNav({ title, items, cta = null }) {
  const [on, setOn] = useState(items[0]?.[0]);
  useEffect(() => {
    document.documentElement.style.setProperty('--subnav', '53px');
    const els = items.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver((es) => {
      const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setOn(vis[0].target.id);
    }, { rootMargin: '-30% 0px -60% 0px' });
    els.forEach((e) => io.observe(e));
    return () => { io.disconnect(); document.documentElement.style.setProperty('--subnav', '0px'); };
  }, [items]);
  return (
    <nav aria-label={`${title} sections`} className="subnav noprint">
      <div className="container flex items-center gap-4">
        <span className="hidden shrink-0 text-[14px] font-semibold text-ink md:block">{title}</span>
        <span className="hidden h-5 w-px bg-line md:block" aria-hidden="true" />
        <div className="no-scrollbar -mx-3 flex min-w-0 flex-1 overflow-x-auto">
          {items.map(([id, label]) => <a key={id} href={`#${id}`} className={cx('sn-link', on === id && 'is-on')} aria-current={on === id ? 'location' : undefined}>{label}</a>)}
        </div>
        {cta && <Button to={cta.to} size="sm" variant="secondary" className="hidden shrink-0 xl:inline-flex">{cta.label}</Button>}
      </div>
    </nav>
  );
}

export function StatTile({ v, l, s, className }) {
  return (
    <div className={cx('card p-6', className)}>
      <p className="t-h2 num !text-brand">{v}</p>
      <p className="mt-2 t-body !text-ink">{l}</p>
      {s && <p className="mt-4 border-t border-line pt-3 t-caption">Source: {s}</p>}
    </div>
  );
}

/* The signature element: one explainable decision. */
export function DecisionCard({ subject, sub, d, label, reasons = [], policy, id, time, product, className, compact }) {
  return (
    <div className={cx('card overflow-hidden', className)} role="group" aria-label={`Decision: ${label || DECISION[d]?.[1] || d}`}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold text-ink">{subject}</p>
          {sub && <p className="truncate t-caption">{sub}</p>}
        </div>
        <Decision d={d}>{label}</Decision>
      </div>
      {reasons.length > 0 && (
        <ul className={cx('space-y-2 px-4', compact ? 'py-3' : 'py-4')}>
          {reasons.map((r) => {
            const [text, w] = Array.isArray(r) ? r : [r];
            return (
              <li key={text} className="flex items-start justify-between gap-3 text-[13.5px] leading-snug text-ink-2">
                <span className="flex gap-2"><Icon name="CaretRight" size={12} weight="bold" className="mt-[4px] shrink-0 text-ink-4" />{text}</span>
                {w && <span className={cx('num shrink-0 font-semibold', String(w).startsWith('+') ? 'text-crit' : 'text-ok')}>{w}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {(policy || id) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-bg-1 px-4 py-2.5">
          {policy && <span className="t-caption">Policy: <span className="text-ink-2">{policy}</span></span>}
          {(id || time) && <span className="mono text-ink-3">{[id, time].filter(Boolean).join(' · ')}</span>}
        </div>
      )}
      {product && <p className="sr-only">Decided by {product}</p>}
    </div>
  );
}

/* Product UI chrome. */
export function AppFrame({ product, title, crumb, status, children, className, bodyClass, toolbar }) {
  return (
    <div className={cx('app', className)}>
      <div className="app-bar">
        <span className="flex gap-1.5" aria-hidden="true"><i className="h-2.5 w-2.5 rounded-full bg-bg-3" /><i className="h-2.5 w-2.5 rounded-full bg-bg-3" /><i className="h-2.5 w-2.5 rounded-full bg-bg-3" /></span>
        {product && <ProductMark p={product} size={20} className="ml-2" />}
        <span className="truncate font-semibold text-ink">{title}</span>
        {crumb && <span className="hidden truncate text-ink-3 sm:inline">/ {crumb}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2">{toolbar}{status}</span>
      </div>
      <div className={cx('app-canvas', bodyClass)}>{children}</div>
    </div>
  );
}

/* Previous / Play / Next controls for a demo driven by useSteps. */
export function DemoControls({ s, n, label, className }) {
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <button type="button" onClick={s.prev} className="btn btn-secondary btn-sm !px-2.5" aria-label="Previous step"><Icon name="CaretLeft" size={16} /></button>
      <button type="button" onClick={s.playing ? s.pause : s.play} className="btn btn-secondary btn-sm" aria-label={s.playing ? 'Pause' : 'Play'}>
        <Icon name={s.playing ? 'Pause' : 'Play'} size={15} weight="fill" />{s.playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" onClick={s.next} className="btn btn-secondary btn-sm !px-2.5" aria-label="Next step"><Icon name="CaretRight" size={16} /></button>
      <span className="ml-1 t-caption num" aria-live="polite">{label || `Step ${s.i + 1} of ${n}`}</span>
    </div>
  );
}

/* A horizontal stepper bound to useSteps. */
export function Stepper({ steps, s, label = 'Steps', className, cols }) {
  return (
    <div role="tablist" aria-label={label} className={cx('grid gap-3', className)} style={{ gridTemplateColumns: `repeat(${cols || steps.length}, minmax(0, 1fr))` }}>
      {steps.map((t, k) => (
        <button key={t} type="button" role="tab" aria-selected={s.i === k} onClick={() => s.go(k)}
          className={cx('step-btn', k < s.i && 'is-done', k === s.i && 'is-cur')} style={k === s.i ? { '--p': s.playing ? s.progress : 1 } : undefined}>
          <span className="step-bar"><i /></span>
          <span className="step-n">{String(k + 1).padStart(2, '0')}</span>
          <span className="step-t">{t}</span>
        </button>
      ))}
    </div>
  );
}

export function FeatureCard({ icon, acc, title, children, to, cta, className }) {
  const body = (
    <>
      {icon && <span className="ptile" style={acc ? { '--acc': acc } : undefined}><Icon name={icon} size={20} /></span>}
      <h3 className={cx('t-h4', icon && 'mt-5')}>{title}</h3>
      <div className="mt-2 t-small !text-ink-2">{children}</div>
      {to && <span className="alink mt-4 text-[14.5px]">{cta || 'Learn more'}<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></span>}
    </>
  );
  if (to) return <Link to={to} className={cx('card card-link group flex flex-col p-6', className)}>{body}</Link>;
  return <div className={cx('card flex flex-col p-6', className)}>{body}</div>;
}

/* Organisations, grouped by kind so a ministry is not presented as a customer
   (audit C2). The relationship for each needs confirmation by the company. */
export const ORG_GROUPS = [
  ['Banking and financial services', ['canara-bank', 'karnataka-bank', 'dcb-bank']],
  ['Government and public sector', ['meity', 'ncrtc', 'ccoe']],
  ['Healthcare', ['bhaktivedanta', 'seizure-tracker']],
  ['Academia and research', ['iit-kanpur', 'iit-mandi', 'iiit-hyderabad']],
  ['Enterprise and technology', ['inmorphis', 'sdet', 'silda', 'corecys', 'fourthsquare', 'vibho']],
];
const ORG = Object.fromEntries(CUSTOMERS);
export function LogoWall({ title = 'Organisations we work with', lead, groups = ORG_GROUPS, id }) {
  return (
    <div>
      {title && <h2 id={id} className="t-h3">{title}</h2>}
      {lead && <p className="mt-2 t-small measure">{lead}</p>}
      <dl className="mt-8 divide-y divide-line border-y border-line">
        {groups.map(([g, keys]) => (
          <div key={g} className="grid gap-3 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:items-center md:gap-8">
            <dt className="app-label">{g}</dt>
            <dd className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
              {keys.map((k) => (
                <span key={k} className="flex h-14 items-center justify-center rounded-[10px] border border-line bg-white px-2 sm:h-16 sm:px-4">
                  <img src={`/img/logos/${k}.webp`} alt={ORG[k]} title={ORG[k]} loading="lazy" decoding="async" className="max-h-9 w-auto max-w-full object-contain opacity-80 grayscale transition duration-200 hover:opacity-100 hover:grayscale-0" />
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 t-caption">The nature of each relationship varies by organisation.</p>
    </div>
  );
}

export function Faq({ items, title = 'Frequently asked questions', id = 'faq', lead }) {
  return (
    <Section id={id} labelledby={`${id}-h`} tone="line">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-16">
        <div>
          <h2 id={`${id}-h`} className="t-h2">{title}</h2>
          <p className="mt-4 t-body">{lead || <>Something else on your mind? <Link to="/contact" className="ilink">Ask an engineer</Link>.</>}</p>
        </div>
        <Accordion items={items} />
      </div>
    </Section>
  );
}

/* One closing call to action per page. */
export function CtaBand({ title = 'See it on your own identities.', body = 'A 30-minute session with a Deep Algorithms engineer, on your own environment, with your own questions.', primary = { label: 'Book a demo', to: '/request-demo' }, secondary = { label: 'Take the product tour', to: '/product-tour' }, children }) {
  return (
    <section className="sec-sm bg-subtle" aria-labelledby="cta-h">
      <div className="container">
        <div className="card grid items-center gap-8 overflow-hidden p-8 md:p-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:p-14">
          <div>
            <h2 id="cta-h" className="t-h2 max-w-[760px]">{title}</h2>
            <p className="mt-4 t-lead max-w-[640px]">{body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button to={primary.to} size="lg" arrow>{primary.label}</Button>
              {secondary && <Button to={secondary.to} variant="secondary" size="lg">{secondary.label}</Button>}
            </div>
            {children}
          </div>
          <img src="/brand/mark.webp" alt="" aria-hidden="true" width="160" height="160" loading="lazy" className="hidden h-[148px] w-auto opacity-95 lg:block" />
        </div>
      </div>
    </section>
  );
}

export function PostCard({ post }) {
  return (
    <Link to={`/blogs/${post.slug}`} className="card card-link group flex h-full flex-col p-6">
      <p className="app-label !text-brand">{post.category}</p>
      <h3 className="mt-3 t-h4 group-hover:text-brand">{post.title}</h3>
      <p className="mt-2 line-clamp-3 t-small">{post.excerpt}</p>
      <p className="mt-auto pt-5 t-caption">{formatDate(post)}{post.read ? ` · ${post.read} min read` : ''}</p>
    </Link>
  );
}
export function ResearchCards({ slugs, title = 'Related research', id = 'research' }) {
  const posts = (slugs ? slugs.map((s) => POSTS.find((p) => p.slug === s)) : POSTS.slice(0, 3)).filter(Boolean).slice(0, 3);
  if (!posts.length) return null;
  return (
    <Section id={id} labelledby={`${id}-h`} tone="line">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id={`${id}-h`} className="t-h2">{title}</h2>
        <ArrowLink to="/blogs">All research</ArrowLink>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">{posts.map((p) => <PostCard key={p.slug} post={p} />)}</div>
    </Section>
  );
}

/* Small, labelled note under demos: sample data is never presented as real. */
export function SampleNote({ children = 'Sample data. Names, places and values are illustrative.' }) {
  return <p className="mt-3 flex items-center gap-1.5 t-caption"><Icon name="Info" size={14} />{children}</p>;
}

/* Fires once when the element is first on screen. */
export function useSeen(threshold = 0.3) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return undefined;
    setSeen(false);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen];
}

export { Reveal };
