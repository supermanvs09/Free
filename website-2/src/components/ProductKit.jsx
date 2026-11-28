import { CERTS } from '../data/site.js';
import CertSeal from './CertSeal.jsx';
import { useEffect, useId, useRef, useState } from 'react';
import { Brand } from './Dash.jsx';
import { useInView, useReducedMotion } from '../lib/motion.js';
import { loadGsap } from '../lib/nullmotion.jsx';
import { scrollToY } from '../lib/smooth.js';
import { Link } from 'react-router';
import { Accordion, Button, CountUp, Icon, Reveal, SectionHead, cx } from './ui.jsx';
import { TrustedRow } from './blocks.jsx';
import ProductMark from './ProductMark.jsx';
import { Proof, StatCard, StoryCard } from './Story.jsx';

/* Accents are tokens, so the same accent reads well on a dark band and a light sheet. */
export const ACC = { zen: 'var(--color-zen)', adap: 'var(--color-adap)', icms: 'var(--color-icms)', brand: 'var(--color-sky)' };

/* The product's own mark with its name, then what this page is about:
   "Zenstra AI · Security for AI agents" becomes the mark, the name, the topic. */

/* The hero's own action: take the reader into the page, rather than repeat the
   header's "Book a demo". Scrolls to the section after the hero. */
export function Explore({ label = 'See how it works', target, size = 'lg', variant }) {
  const go = (e) => {
    const el = target ? document.querySelector(target) : e.currentTarget.closest('section')?.nextElementSibling;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollToY(el.getBoundingClientRect().top + window.scrollY - 96, { instant: reduce });
  };
  return <Button type="button" size={size} variant={variant} onClick={go}>{label}<Icon name="ArrowDown" size={16} weight="bold" className="transition-transform duration-300 group-hover:translate-y-0.5" /></Button>;
}

/* The base of every hero: who trusts us, before the first scroll. A row on
   desktop, a rolling strip on phones and tablets. */
/* Product hero frame: ribbons tinted by the product, crumbs, and two layouts:
   `split` (copy left, picture right) and `stack` (copy centred, picture below). */
export function Hero({ acc = 'brand', eyebrow, title, lead, ctas, explore, children, art, proof = true }) {
  const color = ACC[acc] || ACC.brand;
  const mark = { zen: 'zenstra', adap: 'adapid', icms: 'icms' }[acc];
  const pic = children || art;
  const actions = ctas || <><Explore label={explore} /><Button to="/request-demo" variant="ghost" size="lg">Talk to an engineer</Button></>;
  // website 2: every product and industry page opens on one framed card on the
  // paper, the words on the left and our own product (or photograph) on the right.
  return (
    <section className={cx('stage hero-under hx-sec relative', mark ? 'hero-navy' : 'band-brand')} style={{ '--acc': color }} data-page-name={eyebrow ? eyebrow.split(' · ')[0] : undefined}>
      <div className="wrap relative pb-10 pt-6 md:pb-14 md:pt-10">
        <div className={cx('hx', !pic && 'hx-solo')}>
          <div className="hx-copy">
            {eyebrow && <p className="hx-k rise" style={{ '--d': '20ms' }}>{mark && <ProductMark p={mark} size={22} />}{eyebrow}</p>}
            <h1 className="t-h1 hero-h1 hx-h rise" style={{ '--d': '60ms' }}>{title}</h1>
            {lead && <p className="t-lead hx-lead rise" style={{ '--d': '140ms' }}>{lead}</p>}
            <div className="hx-ctas rise" style={{ '--d': '220ms' }}>{actions}</div>
          </div>
          {pic && <div className="hx-art hero-pic rise" style={{ '--d': '300ms' }}>{pic}</div>}
        </div>
      </div>
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
                <p className="rc-num font-semibold tracking-[-0.015em]" style={{ fontSize: 'clamp(40px, 4vw, 56px)', lineHeight: 1 }}><CountUp value={x.v} /></p>
                <p className="mt-4 max-w-[300px] text-[16px] leading-relaxed text-[var(--rc-ink)] max-md:mx-auto">{x.l}</p>
                {x.s && <p className="mt-4 text-[14px] text-[var(--rc-ink2)]">Source: {x.s}</p>}
              </Reveal>
            ))}
          </div>
        )}
        {story && <p className="mt-4 text-[14px] text-ink-3">{log ? 'People shown are models. The record is an example; names and numbers are illustrations.' : 'People shown are models. Names, places and access are illustrations.'}</p>}
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
          <p className="t-lead mt-5">Something else on your mind? <Link to="/request-demo" className="text-cyan-2 underline underline-offset-4 hover:text-fg">Ask an engineer</Link>.</p>
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
            {cols.map((c, i) => <th key={c} scope="col" className={cx('p-5 text-[16px] font-semibold', i === cols.length - 1 ? 'text-ink' : 'text-ink-2')} style={i === cols.length - 1 ? { background: `color-mix(in oklab, ${color} 12%, transparent)` } : undefined}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ...vals]) => (
            <tr key={label} className="border-b border-line last:border-0">
              <th scope="row" className="p-5 text-[16px] font-medium text-ink">{label}</th>
              {vals.map((v, i) => (
                <td key={i} className="p-5 align-top text-[14px] leading-snug text-ink-2" style={i === vals.length - 1 ? { background: `color-mix(in oklab, ${color} 7%, transparent)` } : undefined}>
                  {v === true ? <Icon name="CheckCircle" size={20} weight="fill" style={{ color }} /> : v === false ? <span className="text-ink-3">—</span> : i === vals.length - 1 ? <span className="flex gap-2.5 font-medium text-ink"><Icon name="CheckCircle" size={18} weight="fill" className="mt-px shrink-0" style={{ color }} />{v}</span> : v}
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
                <span className="mt-2 flex-1 text-[16px] leading-relaxed text-ink-2">{p.body}</span>
                <span className="link mt-5 text-[14px]">Learn more<Icon name="ArrowRight" size={14} weight="bold" /></span>
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
  // a link such as #cap-mcp opens that tab
  useEffect(() => {
    const pick = () => {
      const k = items.findIndex((x) => x.anchor && `#${x.anchor}` === window.location.hash);
      if (k < 0) return;
      setI(k);
      // bring the tabs into view once the page above has settled
      setTimeout(() => document.getElementById(items[k].anchor)?.closest('section')?.scrollIntoView({ block: 'start' }), 350);
    };
    pick(); window.addEventListener('hashchange', pick);
    return () => window.removeEventListener('hashchange', pick);
  }, [items]);
  const id = useId();
  const color = ACC[acc] || ACC.brand;
  const it = items[i];
  return (
    <div>
      <div role="tablist" aria-label={label} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
        {items.map((x, k) => (
          <button key={x.tab} id={x.anchor || `${id}-t${k}`} role="tab" type="button" aria-selected={k === i} aria-controls={`${id}-p`} onClick={() => setI(k)}
            className={cx('inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-colors', k === i ? 'border-transparent text-on-acc' : 'border-line-2 text-ink-2 hover:border-fg/30 hover:text-ink')}
            style={k === i ? { background: color } : undefined}>
            {x.icon && <Icon name={x.icon} size={16} />}{x.tab}
          </button>
        ))}
      </div>
      <div id={`${id}-p`} role="tabpanel" aria-labelledby={it.anchor || `${id}-t${i}`} key={i} className="fadein mt-10 grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr] lg:gap-16">
        <div>
          <h3 className="text-[28px] font-medium leading-tight tracking-[-0.015em] md:text-[34px]">{it.h}</h3>
          <p className="mt-4 text-[17px] leading-relaxed text-ink-2">{it.p}</p>
          {it.points && <ul className="mt-6 space-y-3">{it.points.map((t) => <li key={t} className="flex gap-3 text-[16px] text-ink-2"><Icon name="Check" size={18} weight="bold" className="mt-[3px] shrink-0" style={{ color }} />{t}</li>)}</ul>}
          {it.steps && (
            <ol className="mt-8 flex flex-col gap-4 border-t border-line pt-6" aria-label="How it works">
              {it.steps.map(([h, t], k) => <li key={h} className="flex gap-2"><span className="w-[28px] shrink-0 pt-[2px] text-[14px] font-semibold tabular-nums" style={{ color }}>{String(k + 1).padStart(2, '0')}</span><span><span className="block text-[16px] font-semibold">{h}</span><span className="mt-0.5 block text-[14px] leading-relaxed text-ink-3">{t}</span></span></li>)}
            </ol>
          )}
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
            {loop && i === items.length - 1 && <span className="inline-flex items-center gap-1.5 text-[14px] text-ink-3"><Icon name="ArrowsClockwise" size={14} />then again</span>}
          </span>
          <h3 className="t-h3 mt-5">{s.h}</h3>
          <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{s.p}</p>
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
            <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{x.p}</p>
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
        <div ref={pane} id={`${id}-p`} role="tabpanel" aria-labelledby={it.anchor || `${id}-t${i}`} className="pt-pane relative overflow-hidden rounded-[24px] border border-line bg-bg-1 p-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-[340px] w-[340px] rounded-full opacity-60 blur-3xl" style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${color} 30%, transparent), transparent)` }} />
          <div className="relative flex h-full flex-col">
            <span className="pt-ico relative inline-grid h-20 w-20 place-items-center rounded-[22px] text-white shadow-[0_18px_40px_-16px_var(--acc)]" style={{ background: `linear-gradient(140deg, color-mix(in oklab, ${color} 80%, white), ${color})` }}>
              <Icon name={it.icon || 'CheckCircle'} size={38} />
              <span aria-hidden="true" className="pt-ring absolute -inset-3 rounded-[28px] border" style={{ borderColor: `color-mix(in oklab, ${color} 30%, transparent)` }} />
            </span>
            <p className="pt-t mono mt-auto pt-10 text-[13px]" style={{ color }}>{String(i + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}</p>
            <h3 className="pt-t mt-3 text-[30px] font-medium leading-tight tracking-[-0.015em]">{it.h}</h3>
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
      <div className={cx('wrap', visual && 'grid items-center gap-12 lg:grid-cols-2 lg:gap-20')}>
        <Reveal className={cx(flip && 'lg:order-2', !visual && 'max-w-[760px]')}>
          {eyebrow && <p className="eyebrow" style={{ '--acc': color }}>{eyebrow}</p>}
          <h2 className="t-h2 mt-6">{title}</h2>
          {lead && <p className="t-lead mt-5">{lead}</p>}
          {children}
        </Reveal>
        {visual && (
          <Reveal delay={120} className="relative">
            <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-full opacity-25 blur-3xl" style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${color} 40%, transparent), transparent)` }} />
            {visual}
          </Reveal>
        )}
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

/* Before the FAQ: the buyer's last question, "how hard is this to roll out,
   and is it safe to let in?", answered as a timeline that fills as you scroll
   (three steps, each specific to the product) and a row of what we are
   audited against. Replaces the cost-of-the-problem figures. */
export function Rollout({ acc = 'brand', title = 'Live in weeks, not quarters.', lead, steps, note }) {
  const color = ACC[acc] || ACC.brand;
  return (
    <section className="sec" aria-labelledby="roll-h" style={{ '--acc': color }}>
      <div className="wrap">
        <SectionHead align="left" id="roll-h" acc={color} eyebrow="Typical rollout" title={title} lead={lead} />
        <ol className="ro-line mt-14 grid gap-5 md:grid-cols-3">
          <span aria-hidden="true" className="ro-track"><i /></span>
          {steps.map((s, i) => (
            <li key={s.h} className="ro-step">
              <span className="ro-dot" aria-hidden="true">{i + 1}</span>
              <p className="ro-when">{s.when}</p>
              <h3>{s.h}</h3>
              <p className="ro-p">{s.p}</p>
            </li>
          ))}
        </ol>
        <div className="ro-trust">
          <p>{note || 'Independently audited, every year'}</p>
          <ul>{CERTS.map((c) => <li key={c.code}><CertSeal code={c.code} size={34} /><span>{c.name}</span></li>)}</ul>
        </div>
      </div>
    </section>
  );
}

/* A real photograph of where the product works, with one panel of the
   product's own screen floating over it, close up. Copy on the other side:
   a short title, one line, and three facts with icons. */
export function PhotoFeature({ id, eyebrow, title, lead, points = [], img, pos = '50% 50%', panel, flip, acc = 'adap' }) {
  const color = ACC[acc] || ACC.brand;
  return (
    <section className="sec" aria-labelledby={id} style={{ '--acc': color }}>
      <div className={cx('wrap grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16', flip && 'lg:[&>*:first-child]:order-2')}>
        <div>
          <SectionHead align="left" id={id} acc={color} eyebrow={eyebrow} title={title} lead={lead} />
          {points.length > 0 && (
            <ul className="mt-9 grid gap-5">
              {points.map(([ic, h, t], i) => (
                <Reveal as="li" key={h} delay={i * 70} className="flex gap-4">
                  <span className="ico grid h-10 w-10 shrink-0 place-items-center rounded-[12px]" style={{ '--acc': color }}><Icon name={ic} size={19} /></span>
                  <span><span className="block text-[16px] font-semibold">{h}</span><span className="mt-0.5 block text-[16px] leading-relaxed text-ink-3">{t}</span></span>
                </Reveal>
              ))}
            </ul>
          )}
        </div>
        <Reveal className="pf">
          <div className="pf-img"><img src={img} alt="" width="1600" height="1000" loading="lazy" decoding="async" style={{ objectPosition: pos }} /></div>
          {panel && <div className="pf-panel">{panel}</div>}
        </Reveal>
      </div>
    </section>
  );
}

/* the tools a product connects to, as their own marks */
export function Integrations({ title = 'Works with the stack you already run', items }) {
  return (
    <section className="sec-tight" aria-label={title}>
      <div className="wrap">
        <p className="kicker mb-6 text-center">{title}</p>
        <ul className="ig-row">
          {items.map(([k, t]) => <li key={t}><Brand k={k} s={22} /><span>{t}</span></li>)}
        </ul>
      </div>
    </section>
  );
}
