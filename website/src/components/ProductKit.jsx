import { useEffect, useId, useRef, useState } from 'react';
import { useInView, useReducedMotion } from '../lib/motion.js';
import { loadGsap } from '../lib/nullmotion.jsx';
import { Link } from 'react-router';
import { Accordion, Breadcrumb, Button, CountUp, Icon, Reveal, cx } from './ui.jsx';
import { TrustedRow } from './blocks.jsx';
import ProductMark from './ProductMark.jsx';
import { Proof, StatCard, StoryCard } from './Story.jsx';

/* Accents are tokens, so the same accent reads well on a dark band and a light sheet. */
export const ACC = { zen: 'var(--color-zen)', adap: 'var(--color-adap)', bot: 'var(--color-bot)', icms: 'var(--color-icms)', brand: 'var(--color-sky)' };

/* The product's own mark with its name, then what this page is about:
   "Zenstra AI · Security for AI agents" becomes the mark, the name, the topic. */
function ProductLockup({ p, text, center }) {
  const [name, ...rest] = text.split(' · ');
  return (
    <div className={cx('rise flex items-center gap-3.5 max-md:justify-center', center && 'justify-center')}>
      <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[15px] border border-line-2 bg-white shadow-sm" style={{ boxShadow: '0 0 34px -10px var(--acc)' }}><ProductMark p={p} size={36} /></span>
      <span className="text-left">
        <span className="block text-[16.5px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
        {rest.length > 0 && <span className="block text-[14px] text-ink-2">{rest.join(' · ')}</span>}
      </span>
    </div>
  );
}

/* The hero's own action: take the reader into the page, rather than repeat the
   header's "Book a demo". Scrolls to the section after the hero. */
export function Explore({ label = 'See how it works', target, size = 'lg', variant }) {
  const go = (e) => {
    const el = target ? document.querySelector(target) : e.currentTarget.closest('section')?.nextElementSibling;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96, behavior: reduce ? 'auto' : 'smooth' });
  };
  return <Button type="button" size={size} variant={variant} onClick={go}>{label}<Icon name="ArrowDown" size={16} weight="bold" className="transition-transform duration-300 group-hover:translate-y-0.5" /></Button>;
}

/* The base of every hero: who trusts us, before the first scroll. A row on
   desktop, a rolling strip on phones and tablets. */
/* Product hero frame: ribbons tinted by the product, crumbs, and two layouts:
   `split` (copy left, picture right) and `stack` (copy centred, picture below). */
export function Hero({ acc = 'brand', crumbs, eyebrow, title, lead, ctas, explore, children, layout = 'split', ribbons = 'product', note, proof = true, glance }) {
  const color = ACC[acc] || ACC.brand;
  const stack = layout === 'stack';
  const mark = { zen: 'zenstra', adap: 'adapid', icms: 'icms' }[acc];
  return (
    <section className={cx('stage hero-under relative overflow-hidden', mark ? 'dark hero-navy' : 'band-brand')} style={{ '--acc': color }} data-page-name={eyebrow ? eyebrow.split(' · ')[0] : undefined}>
      <div className={cx('hero-drift wrap relative pb-12 pt-6 md:pb-24 md:pt-14', !stack && 'grid items-center gap-12 lg:min-h-[min(88svh,900px)] lg:grid-cols-[1fr_1.1fr] lg:gap-8')}>
        <div className={cx(stack ? 'mx-auto max-w-[900px] text-center' : 'max-w-[620px] max-md:mx-auto max-md:text-center')}>
          {crumbs && <Breadcrumb items={crumbs} className={cx('rise mb-8 max-md:hidden', stack && 'flex justify-center')} />}
          {eyebrow && (mark ? <ProductLockup p={mark} text={eyebrow} center={stack} /> : <p className="eyebrow rise" style={{ '--acc': color }}>{eyebrow}</p>)}
          <h1 className={cx('t-h1 rise mt-6', stack && 'mx-auto max-w-[20ch]')} style={{ '--d': '80ms' }}>{title}</h1>
          {lead && <p className={cx('t-lead rise mt-6', stack ? 'mx-auto max-w-[680px]' : 'max-w-[560px] max-md:mx-auto')} style={{ '--d': '160ms' }}>{lead}</p>}
          <div className={cx('rise mt-9 flex flex-wrap gap-3 max-md:flex-col max-md:[&>*]:w-full', stack && 'justify-center')} style={{ '--d': '240ms' }}>
            {ctas || <><Explore label={explore} /><Button to="/product-tour" variant="ghost" size="lg">Take the product tour</Button></>}
          </div>
          {note && <p className={cx('rise mt-7 text-[14px] text-ink-3 max-md:text-center', stack && 'text-center')} style={{ '--d': '300ms' }}>{note}</p>}
        </div>
        {children && <div className={cx('relative', mark && 'tone-l', stack ? 'mx-auto mt-16 max-w-[1080px]' : 'lg:-mr-6')}>{children}</div>}
      </div>
      {/* the product at a glance: what it protects, stops, needs and shows */}
      {glance && (
        <dl className="rise wrap relative grid grid-cols-2 gap-x-4 gap-y-1 overflow-hidden pb-10 lg:grid-cols-4 md:pb-14" style={{ '--d': '320ms' }}>
          {glance.map(([k, v]) => (
            <div key={k} className="border-t border-line pt-4 pb-3 lg:pr-6">
              <dt className="text-[12.5px] font-semibold uppercase tracking-[.1em]" style={{ color: mark ? 'color-mix(in oklab, var(--acc) 45%, white)' : 'color-mix(in oklab, var(--acc) 70%, #0b1220)' }}>{k}</dt>
              <dd className="mt-1.5 text-[14px] leading-snug text-ink-2 md:text-[15px]">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {proof && <TrustedRow />}
    </section>
  );
}

/* Figures with their sources; product figures say so. With a `story`, they
   sit beside a coloured panel that makes them concrete (Story.jsx): a person
   whose identity the product protects, what it knows and what it decided.
   Without one, each figure gets its own coloured card. */
export function Stats({ items, acc = 'brand', title, story, proof, log }) {
  const color = ACC[acc] || ACC.brand;
  return (
    <section className="sec-tight" aria-label={title || 'Key figures'}>
      <div className="wrap">
        {title && <Reveal><p className="kicker mb-8" style={{ '--acc': color }}>{title}</p></Reveal>}
        {story ? (
          <Reveal className="rc grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <StoryCard story={story} log={log} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-[1fr_auto]">
              <StatCard items={items} />
              {proof && <div className="rc-proof rounded-[22px] p-7"><Proof kind={proof} /></div>}
            </div>
          </Reveal>
        ) : (
          <div className="rc grid gap-4 md:grid-cols-3">
            {items.map((x, i) => (
              <Reveal key={x.l} delay={i * 80} className={cx('rounded-[22px] p-7 max-md:text-center md:p-8', ['rc-stat', 'rc-proof', 'rc-main'][i % 3])}>
                <p className="rc-num font-semibold tracking-[-0.04em]" style={{ fontSize: 'clamp(40px, 4vw, 56px)', lineHeight: 1 }}><CountUp value={x.v} /></p>
                <p className="mt-4 max-w-[300px] text-[15.5px] leading-relaxed text-[var(--rc-ink)] max-md:mx-auto">{x.l}</p>
                {x.s && <p className="mt-4 text-[12.5px] text-[var(--rc-ink2)]">Source: {x.s}</p>}
              </Reveal>
            ))}
          </div>
        )}
        {story && <p className="mt-4 text-[12.5px] text-ink-3">{log ? 'People shown are models. The record is an example; names and numbers are illustrations.' : 'People shown are models. Names, places and access are illustrations.'}</p>}
      </div>
    </section>
  );
}

export function Faq({ items, title = 'Questions teams ask us' }) {
  return (
    <section className="sec" aria-labelledby="faq-h">
      <div className="wrap grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
        <Reveal>
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-h" className="t-h2 mt-6">{title}</h2>
          <p className="t-lead mt-5">Something else on your mind? <Link to="/contact" className="text-cyan-2 underline underline-offset-4 hover:text-fg">Ask an engineer</Link>.</p>
        </Reveal>
        <Reveal delay={100}><Accordion items={items} /></Reveal>
      </div>
    </section>
  );
}

/* A comparison table: rows of claims, columns of approaches; the last column is ours. */
export function Compare({ cols, rows, acc = 'brand', caption }) {
  const color = ACC[acc] || ACC.brand;
  return (
    <div className="overflow-x-auto rounded-[22px] border border-line" role="region" tabIndex={0} aria-label={caption}>
      <table className="w-full min-w-[640px] text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="p-5 text-[13px] font-semibold uppercase tracking-[.08em] text-ink-3">&nbsp;</th>
            {cols.map((c, i) => <th key={c} scope="col" className={cx('p-5 text-[15px] font-semibold', i === cols.length - 1 ? 'text-ink' : 'text-ink-2')} style={i === cols.length - 1 ? { background: `color-mix(in oklab, ${color} 12%, transparent)` } : undefined}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ...vals]) => (
            <tr key={label} className="border-b border-line last:border-0">
              <th scope="row" className="p-5 text-[15px] font-medium text-ink">{label}</th>
              {vals.map((v, i) => (
                <td key={i} className="p-5 align-top text-[14.5px] leading-snug text-ink-2" style={i === vals.length - 1 ? { background: `color-mix(in oklab, ${color} 7%, transparent)` } : undefined}>
                  {v === true ? <Icon name="CheckCircle" size={20} weight="fill" style={{ color }} /> : v === false ? <span className="text-ink-3">—</span> : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Sibling products, as text cards. */
export function Related({ items, title = 'Works alongside' }) {
  return (
    <section className="sec-tight" aria-label={title}>
      <div className="wrap">
        <Reveal><p className="kicker mb-6">{title}</p></Reveal>
        <div className="m-rail grid gap-4 md:grid-cols-3">
          {items.map((p, i) => (
            <Reveal key={p.to} delay={i * 70}>
              <Link to={p.to} className="card card-hover group flex h-full flex-col p-6" style={{ '--acc': p.acc }}>
                <span className="flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[.08em]" style={{ color: p.acc }}><ProductMark p={p.line} size={26} />{p.line}</span>
                <span className="mt-3 text-[19px] font-semibold tracking-[-0.015em]">{p.name}</span>
                <span className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-2">{p.body}</span>
                <span className="link mt-5 text-[14.5px]">Learn more<Icon name="ArrowRight" size={14} weight="bold" /></span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Horizontal explorer: tabs on top, the picture and its copy below. */
export function Explorer({ items, acc = 'brand', label }) {
  const [i, setI] = useState(0);
  const id = useId();
  const color = ACC[acc] || ACC.brand;
  const it = items[i];
  return (
    <div>
      <div role="tablist" aria-label={label} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
        {items.map((x, k) => (
          <button key={x.tab} id={`${id}-t${k}`} role="tab" type="button" aria-selected={k === i} aria-controls={`${id}-p`} onClick={() => setI(k)}
            className={cx('inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14.5px] font-medium transition-colors', k === i ? 'border-transparent text-on-acc' : 'border-line-2 text-ink-2 hover:border-fg/30 hover:text-ink')}
            style={k === i ? { background: color } : undefined}>
            {x.icon && <Icon name={x.icon} size={16} />}{x.tab}
          </button>
        ))}
      </div>
      <div id={`${id}-p`} role="tabpanel" aria-labelledby={`${id}-t${i}`} key={i} className="fadein mt-10 grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-16">
        <div>
          <h3 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] md:text-[34px]">{it.h}</h3>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{it.p}</p>
          {it.points && <ul className="mt-6 space-y-3">{it.points.map((t) => <li key={t} className="flex gap-3 text-[15.5px] text-ink-2"><Icon name="Check" size={18} weight="bold" className="mt-[3px] shrink-0" style={{ color }} />{t}</li>)}</ul>}
          {it.to && <Link to={it.to} className="link mt-7" style={{ '--acc': color }}>{it.cta || 'Learn more'}<Icon name="ArrowRight" size={14} weight="bold" /></Link>}
        </div>
        <div className="relative">
          <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-full opacity-30 blur-3xl" style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${color} 40%, transparent), transparent)` }} />
          <it.V {...(it.props || {})} />
        </div>
      </div>
    </div>
  );
}

/* Numbered steps in a row (onboarding, a loop, a lifecycle). */
export function Steps({ items, acc = 'brand', loop }) {
  const color = ACC[acc] || ACC.brand;
  return (
    <ol className={cx('m-rail grid gap-4', items.length === 4 ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-3')}>
      {items.map((s, i) => (
        <Reveal as="li" key={s.h} delay={i * 80} className="card relative p-6 md:p-7">
          <span className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[14px] font-bold text-on-acc num" style={{ background: color }}>{i + 1}</span>
            {loop && i === items.length - 1 && <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3"><Icon name="ArrowsClockwise" size={14} />then again</span>}
          </span>
          <h3 className="t-h3 mt-5">{s.h}</h3>
          <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{s.p}</p>
        </Reveal>
      ))}
    </ol>
  );
}

/* Points: on phones, a stack of cards. On large screens, an explorer: the titles
   as a numbered list that moves on by itself (a progress line under the active
   one), the active point open beside it with its icon large. Pointer or focus
   holds it. The detail swap follows Null Motion's blur-reveal timing. */
const PT_HOLD = 5200;
export function Points({ items, acc = 'brand', cols = 3 }) {
  const color = ACC[acc] || ACC.brand;
  const ref = useRef(null), pane = useRef(null), mounted = useRef(false);
  const seen = useInView(ref, { threshold: 0.35 });
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!seen || reduce || held) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % items.length), PT_HOLD);
    return () => clearTimeout(t);
  }, [seen, reduce, held, i, items.length]);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return undefined; }
    const el = pane.current; if (!el || reduce) return undefined;
    let tl;
    loadGsap().then((g) => {
      tl = g.timeline()
        .fromTo(el.querySelector('.pt-ico'), { scale: 0.7, rotate: -8, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.7, ease: 'back.out(1.8)' })
        .fromTo(el.querySelectorAll('.pt-t'), { y: 16, opacity: 0, filter: 'blur(8px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 0.08);
    });
    return () => tl?.kill();
  }, [i, reduce]);
  const pick = (k) => { setHeld(true); setI(k); };
  const it = items[i];
  return (
    <div ref={ref}>
      {/* phones and tablets: cards */}
      <div className={cx('m-rail grid gap-4 lg:hidden', cols === 3 ? 'md:grid-cols-3' : 'sm:grid-cols-2')}>
        {items.map((x, k) => (
          <Reveal key={x.h} delay={k * 70} className="card p-6 md:p-7">
            {x.icon && <span className="ico inline-flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ '--acc': color }}><Icon name={x.icon} size={22} /></span>}
            <h3 className={cx('t-h3', x.icon && 'mt-5')}>{x.h}</h3>
            <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{x.p}</p>
          </Reveal>
        ))}
      </div>
      {/* large screens: explorer */}
      <div className="pt grid grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] items-stretch gap-10 max-lg:hidden" style={{ '--acc': color }} onMouseLeave={() => setHeld(false)}>
        <div role="tablist" aria-orientation="vertical" aria-label="Points" className="flex flex-col">
          {items.map((x, k) => (
            <button key={x.h} id={`${id}-t${k}`} role="tab" type="button" aria-selected={k === i} aria-controls={`${id}-p`} onClick={() => pick(k)} onMouseEnter={() => pick(k)} onFocus={() => pick(k)}
              className={cx('pt-tab group relative grid grid-cols-[44px_1fr] items-center gap-4 border-t border-line py-5 text-left transition-colors', k === i ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}>
              <span className="mono text-[13px] tabular-nums" style={k === i ? { color } : undefined}>{String(k + 1).padStart(2, '0')}</span>
              <span className="text-[19px] font-semibold tracking-[-0.02em]">{x.h}</span>
              <span aria-hidden="true" className="absolute -top-px left-0 h-[2px] w-full overflow-hidden">
                {k === i && <span className={cx('block h-full', !held && !reduce && seen ? 'ps-fill' : '')} style={{ background: color, width: held || reduce || !seen ? '100%' : undefined, animationDuration: `${PT_HOLD}ms` }} />}
              </span>
            </button>
          ))}
        </div>
        <div ref={pane} id={`${id}-p`} role="tabpanel" aria-labelledby={`${id}-t${i}`} className="pt-pane relative overflow-hidden rounded-[24px] border border-line bg-white p-10 shadow-[0_30px_70px_-50px_rgb(11_42_82/.35)]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[340px] w-[340px] rounded-full opacity-60 blur-3xl" style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${color} 30%, transparent), transparent)` }} />
          <div className="relative flex h-full flex-col">
            <span className="pt-ico relative inline-grid h-20 w-20 place-items-center rounded-[22px] text-white shadow-[0_18px_40px_-16px_var(--acc)]" style={{ background: `linear-gradient(140deg, color-mix(in oklab, ${color} 80%, white), ${color})` }}>
              <Icon name={it.icon || 'CheckCircle'} size={38} />
              <span aria-hidden="true" className="pt-ring absolute -inset-3 rounded-[28px] border" style={{ borderColor: `color-mix(in oklab, ${color} 30%, transparent)` }} />
            </span>
            <p className="pt-t mono mt-auto pt-10 text-[13px]" style={{ color }}>{String(i + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</p>
            <h3 className="pt-t mt-3 text-[30px] font-semibold leading-tight tracking-[-0.03em]">{it.h}</h3>
            <p className="pt-t mt-4 max-w-[46ch] text-[17px] leading-relaxed text-ink-2">{it.p}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Split({ eyebrow, title, lead, children, visual, flip, acc = 'brand', id, className }) {
  const color = ACC[acc] || ACC.brand;
  return (
    <section id={id} className={cx('sec scroll-mt-20', className)}>
      <div className={cx('wrap grid items-center gap-12 lg:grid-cols-2 lg:gap-20')}>
        <Reveal className={cx(flip && 'lg:order-2')}>
          {eyebrow && <p className="eyebrow" style={{ '--acc': color }}>{eyebrow}</p>}
          <h2 className="t-h2 mt-6">{title}</h2>
          {lead && <p className="t-lead mt-5">{lead}</p>}
          {children}
        </Reveal>
        <Reveal delay={120} className="relative">
          <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-full opacity-25 blur-3xl" style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${color} 40%, transparent), transparent)` }} />
          {visual}
        </Reveal>
      </div>
    </section>
  );
}

export const LINKS = {
  zenstra: { line: 'Zenstra AI', name: 'Security for AI agents', body: 'Discover every agent, scope its access and check every action before it runs.', to: '/agentic-ai/agentic-identity', acc: ACC.zen },
  cirm: { line: 'adapID AI', name: 'Continuous Identity Risk Management', body: 'A live, explainable risk score for every person, acted on when behaviour changes.', to: '/adapid-ai', acc: ACC.adap },
  nhi: { line: 'adapID AI', name: 'NHI Security for AWS', body: 'Every role, key and workload identity found, scored and baselined.', to: '/adapid-ai/nhi-security', acc: ACC.adap },
  fraud: { line: 'adapID AI', name: 'Identity Fraud Prevention', body: 'Account takeover, scams and mule accounts stopped before money moves.', to: '/adapid-ai/fraud-prevention', acc: ACC.adap },
  ad: { line: 'adapID AI', name: 'Active Directory Security', body: 'Attack paths to Domain Admins mapped and closed, live abuse contained.', to: '/ad-security', acc: ACC.adap },
  icms: { line: 'ICMS Compliance Suite', name: 'DPDPA compliance', body: 'Every access to personal data checked, and evidence ready for audit.', to: '/dpdpa-compliance', acc: ACC.icms },
};
