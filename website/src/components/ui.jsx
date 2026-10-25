import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight, ArrowUpRight, CaretDown, CaretRight, Bank, FirstAidKit, Buildings, Browsers, Sparkle, Fingerprint, ShieldCheck,
  Scales, Robot, Key, User, Eye, Lightning, ClipboardText, Graph, Plug, Clock, LockKey, Database, Globe, Target, Crosshair,
  MagnifyingGlass, Gauge, TreeStructure, Wallet, Broadcast, Handshake, FileText, Warning, CheckCircle, EnvelopeSimple, Phone,
  MapPin, LinkedinLogo, List, X, Cloud, HardDrives, Detective, Path, Users, Siren, CloudCheck, Certificate, Stack,
} from '@phosphor-icons/react/dist/ssr';
import { useReducedMotion, useInView, cx } from './visuals/kit.jsx';

export { cx };

const ICONS = {
  ArrowRight, ArrowUpRight, CaretDown, CaretRight, Bank, FirstAidKit, Buildings, Browsers, Sparkle, Fingerprint, ShieldCheck,
  Scales, Robot, Key, User, Eye, Lightning, ClipboardText, Graph, Plug, Clock, LockKey, Database, Globe, Target, Crosshair,
  MagnifyingGlass, Gauge, TreeStructure, Wallet, Broadcast, Handshake, FileText, Warning, CheckCircle, EnvelopeSimple, Phone,
  MapPin, LinkedinLogo, List, X, Cloud, HardDrives, Detective, Path, Users, Siren, CloudCheck, Certificate, Stack,
};
export function Icon({ name, size = 20, weight = 'regular', className }) {
  const C = ICONS[name];
  return C ? <C size={size} weight={weight} className={className} aria-hidden="true" /> : null;
}

/* Pill buttons, as on astrix.security: filled navy, outlined, and the
   inverse pair used on blue/navy panels. */
const BTN = {
  primary: 'bg-navy text-white hover:bg-navy-2',
  outline: 'border border-navy text-navy hover:bg-navy hover:text-white',
  white: 'bg-white text-navy hover:bg-sky',
  ghostWhite: 'border border-white/70 text-white hover:bg-white hover:text-navy',
  brand: 'bg-brand text-white hover:bg-brand-2',
};
export function Button({ to, href, variant = 'primary', className, children, arrow, ...rest }) {
  const cls = cx('group inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-[16px] font-medium transition-colors duration-200', BTN[variant], className);
  const inner = <>{children}{arrow && <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}</>;
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <button className={cls} {...rest}>{inner}</button>;
}

export function LearnMore({ to, children = 'Learn more' }) {
  return <Link to={to} className="group inline-flex items-center gap-1 text-[15px] font-medium text-brand hover:text-navy">{children}<CaretRight size={13} weight="bold" className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></Link>;
}

/* Fade-up on scroll. Reveal state lives in React (not in a document-level
   observer) so classes never change on server HTML before it hydrates. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
export function Reveal({ as: As = 'div', delay = 0, className, children, ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    document.documentElement.classList.add('io');
    if (!el || el.getBoundingClientRect().top < window.innerHeight * 0.95) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <As ref={ref} className={cx('reveal', seen && 'in', className)} style={{ '--d': `${delay}ms` }} {...rest}>{children}</As>;
}

export function Section({ id, className, children, tone }) {
  return (
    <section id={id} className={cx('py-20 md:py-28', tone === 'mist' && 'bg-mist', className)}>
      <div className="wrap">{children}</div>
    </section>
  );
}

/* Centred eyebrow + light H2, the Astrix section header. */
export function Heading({ eyebrow, title, lead, align = 'center', as: H = 'h2', className }) {
  return (
    <Reveal className={cx(align === 'center' ? 'mx-auto max-w-[860px] text-center' : 'max-w-[720px]', className)}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <H className="t-h2">{title}</H>
      {lead && <p className={cx('t-lead mt-5', align === 'center' && 'mx-auto max-w-[680px]')}>{lead}</p>}
    </Reveal>
  );
}

/* Icon tile (Astrix stat/feature tiles: solid blue or coral square). */
export function IconTile({ name, tone = 'blue', size = 56 }) {
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-[14px] text-white', tone === 'coral' ? 'bg-coral' : tone === 'navy' ? 'bg-navy' : 'bg-brand')} style={{ width: size, height: size }}>
      <Icon name={name} size={Math.round(size * 0.48)} weight="light" />
    </span>
  );
}

/* Line icon with a coral accent dot, for problem lists. */
export function LineIcon({ name }) {
  return (
    <span className="relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border border-line-2 text-ink">
      <Icon name={name} size={28} weight="light" />
      <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-coral" />
    </span>
  );
}

/* Progress tabs (Astrix "Discover / Secure / Deploy"): a thin track with a
   filling bar under the active label; auto-advances while visible. */
export function ProgressTabs({ items, render, interval = 9000 }) {
  const [i, setI] = useState(0);
  const [run, setRun] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  const id = useId();
  useEffect(() => {
    if (reduce || !inView) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % items.length), interval);
    return () => clearTimeout(t);
  }, [i, run, inView, reduce, interval, items.length]);
  const go = (k) => { setI(k); setRun((r) => r + 1); };
  return (
    <div ref={ref}>
      <div role="tablist" aria-label="Steps" className="mx-auto flex max-w-[720px] justify-center gap-2 md:gap-6">
        {items.map((it, k) => (
          <button key={it} id={`${id}-t${k}`} role="tab" type="button" aria-selected={k === i} aria-controls={`${id}-p`} onClick={() => go(k)} className="group flex-1 text-left md:flex-none">
            <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-line md:w-[180px]">
              {k === i && <span key={run} className={cx('absolute inset-y-0 left-0 rounded-full bg-brand', reduce ? 'w-full' : 'tab-fill')} style={{ animationDuration: `${interval}ms` }} />}
              {k < i && <span className="absolute inset-0 bg-brand/35" />}
            </span>
            <span className={cx('mt-3 block text-[15px] md:text-[16px]', k === i ? 'font-medium text-ink' : 'text-ink-3 group-hover:text-ink')}>{it}</span>
          </button>
        ))}
      </div>
      <div id={`${id}-p`} role="tabpanel" aria-labelledby={`${id}-t${i}`} className="mt-12 md:mt-16">
        <div key={i} className="fadein">{render(i)}</div>
      </div>
    </div>
  );
}

/* Navy accordion panel ("Why Astrix"). */
export function Accordion({ items, dark = true }) {
  const [open, setOpen] = useState(0);
  const id = useId();
  return (
    <ul className={cx('divide-y', dark ? 'divide-white/15' : 'divide-line')}>
      {items.map((it, k) => (
        <li key={it.title} className="py-5 first:pt-0">
          <h3>
            <button type="button" aria-expanded={open === k} aria-controls={`${id}-${k}`} onClick={() => setOpen(open === k ? -1 : k)}
              className={cx('flex w-full items-center justify-between gap-4 text-left font-display text-[21px] font-normal tracking-[-0.015em] md:text-[24px]', dark ? 'text-white' : 'text-ink')}>
              {it.title}
              <CaretDown size={18} className={cx('shrink-0 text-coral transition-transform duration-300', open === k && 'rotate-180')} aria-hidden="true" />
            </button>
          </h3>
          <div id={`${id}-${k}`} hidden={open !== k} className={cx('pt-3 text-[16px] leading-relaxed', dark ? 'text-white/80' : 'text-ink-2')}>{it.body}</div>
        </li>
      ))}
    </ul>
  );
}

export function Breadcrumb({ items, light }) {
  return (
    <nav aria-label="Breadcrumb" className={cx('text-[14px]', light ? 'text-white/90' : 'text-ink-3')}>
      <ol className="flex flex-wrap items-center gap-1.5">
        <li><Link to="/" className="hover:underline">Home</Link></li>
        {items.map((it) => (
          <li key={it.name} className="flex items-center gap-1.5">
            <CaretRight size={11} aria-hidden="true" />
            {it.path ? <Link to={it.path} className="hover:underline">{it.name}</Link> : <span aria-current="page" className={light ? 'text-white' : 'text-ink-2'}>{it.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
