import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight, ArrowUpRight, ArrowLeft, ArrowDown, CaretDown, CaretRight, CaretLeft, Bank, FirstAidKit, Buildings, Browsers, Sparkle, Fingerprint, ShieldCheck,
  Scales, Robot, Key, User, Eye, Lightning, ClipboardText, Graph, Plug, Clock, LockKey, Database, Globe, Target, Crosshair,
  MagnifyingGlass, Gauge, TreeStructure, Wallet, Broadcast, Handshake, FileText, Warning, CheckCircle, EnvelopeSimple, Phone,
  MapPin, LinkedinLogo, List, X, Cloud, HardDrives, Detective, Path, Users, Siren, CloudCheck, Certificate, Stack, Play, LinkSimple, Pause,
  PlugsConnected, Pulse, SpeakerHigh, SpeakerSlash, ClosedCaptioning, CornersOut, Funnel, BookOpen, Newspaper, Briefcase, Medal, Buildings as Office,
  ArrowsClockwise, FlowArrow, Lock, ShieldWarning, Code, Laptop, ChatCircleText, Calendar, Check, Circle, Hourglass, Infinity as Loop,
  UserCircle, IdentificationCard, CreditCard, DeviceMobile, Bug, Cpu, WebhooksLogo, TreeView, Export, SealCheck, Barcode, CursorClick, ListChecks,
  Copy, TerminalWindow, Prohibit, ArrowsLeftRight, EyeSlash, ChartBar, Desktop, Sliders, Tag, Trash, Gift, Trophy, LockOpen, PaperPlaneTilt, Timer, Flag, ArrowUp,
} from '@phosphor-icons/react/dist/ssr';
import { cx, useIsoLayoutEffect } from '../lib/motion.js';
import { BlurWords } from '../lib/nullmotion.jsx';

export { cx };

const ICONS = {
  ArrowRight, ArrowUpRight, ArrowLeft, ArrowDown, CaretDown, CaretRight, CaretLeft, Bank, FirstAidKit, Buildings, Browsers, Sparkle, Fingerprint, ShieldCheck,
  Scales, Robot, Key, User, Eye, Lightning, ClipboardText, Graph, Plug, Clock, LockKey, Database, Globe, Target, Crosshair,
  MagnifyingGlass, Gauge, TreeStructure, Wallet, Broadcast, Handshake, FileText, Warning, CheckCircle, EnvelopeSimple, Phone,
  MapPin, LinkedinLogo, List, X, Cloud, HardDrives, Detective, Path, Users, Siren, CloudCheck, Certificate, Stack, Play, LinkSimple, Pause,
  PlugsConnected, Pulse, SpeakerHigh, SpeakerSlash, ClosedCaptioning, CornersOut, Funnel, BookOpen, Newspaper, Briefcase, Medal, Office,
  ArrowsClockwise, FlowArrow, Lock, ShieldWarning, Code, Laptop, ChatCircleText, Calendar, Check, Circle, Hourglass, Loop,
  UserCircle, IdentificationCard, CreditCard, DeviceMobile, Bug, Cpu, WebhooksLogo, TreeView, Export, SealCheck, Barcode, CursorClick, ListChecks,
  Copy, TerminalWindow, Prohibit, ArrowsLeftRight, EyeSlash, ChartBar, Desktop, Sliders, Tag, Trash, Gift, Trophy, LockOpen, PaperPlaneTilt, Timer, Flag, ArrowUp,
};
export function Icon({ name, size = 20, weight = 'regular', className, style }) {
  const C = ICONS[name];
  return C ? <C size={size} weight={weight} className={className} style={style} aria-hidden="true" /> : null;
}

/* Copies a value (an email, a phone number, a link) and says so, to sighted and screen-reader users alike. */
export function CopyButton({ value, label, className }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1800); }).catch(() => {});
  };
  return (
    <button type="button" onClick={copy} aria-label={label} title={done ? 'Copied' : label}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-3 transition-colors hover:border-line-2 hover:text-ink', done && '!text-[#3fd98f]', className)}>
      {done ? <Check size={14} weight="bold" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span role="status" className="sr-only">{done ? 'Copied' : ''}</span>
    </button>
  );
}

const VARIANT = { primary: 'btn-primary', ghost: 'btn-ghost', white: 'btn-white' };
export function Button({ to, href, variant = 'primary', size, className, children, arrow, ...rest }) {
  const cls = cx('btn group', VARIANT[variant], size && `btn-${size}`, className);
  const inner = <>{children}{arrow && <ArrowRight size={16} weight="bold" className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />}</>;
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{inner}</a>;
  return <button className={cls} {...rest}>{inner}</button>;
}

/* A figure that rolls up from zero the first time it comes into view
   ("₹25.5 Cr", "82:1", "< 80 ms"). The server HTML and reduced motion show the
   final value; screen readers always get the final value. Values whose prefix
   is a word ("L3 to L7") or that are zero stay as they are. */
export function CountUp({ value, className, style, ms = 1400 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const m = /^([^\dA-Za-z]*)([\d,]*\.?\d+)(.*)$/.exec(value);
    const el = ref.current;
    if (!m || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const target = parseFloat(m[2].replace(/,/g, ''));
    if (!target) return undefined;
    const dec = (m[2].split('.')[1] || '').length;
    const grouped = m[2].includes(',');
    const fmt = (n) => m[1] + (grouped ? n.toLocaleString('en-IN', { maximumFractionDigits: dec, minimumFractionDigits: dec }) : n.toFixed(dec)) + m[3];
    let raf = 0;
    setShown(fmt(0));
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        setShown(p < 1 ? fmt(target * (1 - Math.pow(1 - p, 3))) : value);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [value, ms]);
  return <span ref={ref} className={cx('num', className)} style={style}><span className="sr-only">{value}</span><span aria-hidden="true">{shown}</span></span>;
}

/* Fade-up on scroll. Reveal state lives in React so server HTML never changes
   class before it hydrates; content is visible without JavaScript. */
export function Reveal({ as: As = 'div', delay = 0, up, className, children, style, ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    document.documentElement.classList.add('io');
    if (!el || el.getBoundingClientRect().top < window.innerHeight * 0.92) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <As ref={ref} className={cx(up ? 'reveal-up' : 'reveal', seen && 'in', className)} style={{ '--d': `${delay}ms`, ...style }} {...rest}>{children}</As>;
}

export function Eyebrow({ children, className, acc }) {
  return <p className={cx('eyebrow', className)} style={acc ? { '--acc': acc } : undefined}>{children}</p>;
}

/* Section heading: status pill, headline, supporting line. */
export function SectionHead({ eyebrow, title, lead, align = 'center', as: H = 'h2', className, acc, id, children }) {
  const center = align === 'center';
  return (
    <Reveal className={cx('blur-in', center ? 'mx-auto max-w-[880px] text-center' : 'max-w-[760px] max-md:mx-auto max-md:text-center', className)}>
      {eyebrow && <Eyebrow acc={acc} className="mb-6">{eyebrow}</Eyebrow>}
      <H id={id} className="t-h2">{typeof title === 'string' ? <BlurWords text={title} /> : title}</H>
      {lead && <p className={cx('t-lead mt-5', center ? 'mx-auto max-w-[660px]' : 'max-md:mx-auto max-md:max-w-[560px]')}>{lead}</p>}
      {children}
    </Reveal>
  );
}

export function Breadcrumb({ items, className }) {
  return (
    <nav aria-label="Breadcrumb" className={cx('text-[14px] text-ink-3', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        <li><Link to="/" className="hover:text-ink">Home</Link></li>
        {items.map((it) => (
          <li key={it.name} className="flex items-center gap-1.5">
            <CaretRight size={11} aria-hidden="true" />
            {it.path ? <Link to={it.path} className="hover:text-ink">{it.name}</Link> : <span aria-current="page" className="text-ink-2">{it.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Accordion({ items, defaultOpen = 0 }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((it, k) => (
        <li key={it.title}>
          <h3>
            <button type="button" aria-expanded={open === k} aria-controls={`${id}-${k}`} onClick={() => setOpen(open === k ? -1 : k)}
              className="flex w-full items-center justify-between gap-6 py-5 text-left text-[18px] font-semibold tracking-[-0.015em] text-ink md:text-[20px]">
              {it.title}
              <span className={cx('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-2 transition-transform duration-300', open === k && 'rotate-45 border-cyan/60 text-cyan')}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </span>
            </button>
          </h3>
          <div id={`${id}-${k}`} hidden={open !== k} className="max-w-[760px] pb-6 text-[16.5px] leading-relaxed text-ink-2">{it.body}</div>
        </li>
      ))}
    </ul>
  );
}

/* Segmented tabs (accessible tablist) with a sliding highlight. */
export function Tabs({ items, value, onChange, className, acc, label = 'Views' }) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className={cx('no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-fg/[.03] p-1', className)}>
      {items.map((t, k) => (
        <button key={t} id={`${id}-${k}`} role="tab" type="button" aria-selected={value === k} onClick={() => onChange(k)}
          onKeyDown={(e) => { if (e.key === 'ArrowRight') onChange((value + 1) % items.length); if (e.key === 'ArrowLeft') onChange((value - 1 + items.length) % items.length); }}
          className={cx('h-10 shrink-0 rounded-full px-4 text-[14.5px] font-medium transition-colors', value === k ? 'bg-fg text-bg' : 'text-ink-2 hover:text-ink')}
          style={value === k && acc ? { background: acc, color: 'var(--color-on-acc)' } : undefined}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function Check3({ children, acc }) {
  return (
    <li className="flex gap-3 text-[16px] leading-relaxed text-ink-2">
      <span className="mt-[5px] inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${acc || 'var(--color-cyan)'} 22%, transparent)`, color: acc || 'var(--color-cyan)' }}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <span>{children}</span>
    </li>
  );
}
