import { useEffect, useRef, useState } from 'react';
import ProductMark from '../components/ProductMark.jsx';
import { cx } from './motion.js';

/* Motion graphics ported from Null Motion's templates (github.com/blixvip/NullMotion,
   MIT), driven by GSAP the same way: one timeline per element, eases and timings
   taken from the templates (kinetic headline, icon stack rise, blur reveal,
   notification stack, integrations grid, cinematic HUD). GSAP loads only in the
   browser, after first paint; nothing runs for reduced motion, and the server
   render is always the finished state. */

let gsapP;
export const loadGsap = () => (gsapP ||= import('gsap').then((m) => m.gsap || m.default));
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* run `play(gsap, el)` once, the first time `el` is well inside the viewport */
export function useOnView(ref, play, { threshold = 0.25, rootMargin = '0px 0px -8% 0px' } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return undefined;
    let tl, done = false;
    // below the fold: hide the starting state now, so nothing flashes before it plays
    if (el.getBoundingClientRect().top > window.innerHeight * 0.92) el.classList.add('nm-pre');
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || done) return;
      done = true; io.disconnect();
      loadGsap().then((gsap) => { el.classList.remove('nm-pre'); tl = play(gsap, el); }); // unhide first: a from() tween reads its end state from what is on screen now
    }, { threshold, rootMargin });
    io.observe(el);
    return () => { io.disconnect(); tl?.kill?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/* 22-kinetic-headline: a word pill that squashes in, settles with a back ease and a
   light sheen, then swaps to the next word */
export function KineticPill({ words, lead, tail, className, style }) {
  const [i, setI] = useState(0);
  const pill = useRef(null), sheen = useRef(null);
  useEffect(() => {
    if (reduced()) return undefined;
    let tl, gs, stop = false;
    const cycle = () => {
      if (stop || !pill.current) return;
      tl = gs.timeline({ onComplete: () => { if (stop) return; setI((n) => (n + 1) % words.length); requestAnimationFrame(() => requestAnimationFrame(enter)); } });
      tl.to(pill.current, { y: -14, opacity: 0, filter: 'blur(6px)', scaleX: .94, duration: .32, ease: 'power3.in' }, 2.2);
    };
    const enter = () => {
      if (stop || !pill.current) return;
      gs.timeline({ onComplete: cycle })
        .fromTo(pill.current, { scaleX: .93, scaleY: 1.06, y: 12, opacity: 0, filter: 'blur(6px)' }, { scaleX: 1.08, scaleY: .95, y: -4, opacity: 1, filter: 'blur(0px)', duration: .43, ease: 'power3.out' })
        .to(pill.current, { scaleX: 1, scaleY: 1, y: 0, duration: .34, ease: 'back.out(1.55)' })
        .fromTo(sheen.current, { left: '-40%', opacity: 0 }, { left: '118%', opacity: .85, duration: .76, ease: 'power3.inOut' }, '-=.2')
        .to(sheen.current, { opacity: 0, duration: .18 });
    };
    loadGsap().then((g) => { gs = g; cycle(); });
    return () => { stop = true; tl?.kill(); };
  }, [words.length]);
  return (
    <p className={cx('nm-kinetic', className)} style={style}>
      <span className="sr-only">{lead} {words.join(', ')} {tail}</span>
      <span aria-hidden="true">{lead} <span ref={pill} className="nm-pill"><span ref={sheen} className="nm-sheen" />{words[i]}</span> {tail}</span>
    </p>
  );
}

/* 12-blur-reveal + 22's word entrance: a heading's words sharpen into place */
export function BlurWords({ text, as: As = 'span', className }) {
  const ref = useRef(null);
  useOnView(ref, (gsap, el) => gsap.fromTo(el.querySelectorAll('.nm-w'),
    { opacity: 0, y: 18, filter: 'blur(8px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: .7, ease: 'power4.out', stagger: .045 }), { threshold: .4 });
  const words = String(text).split(' ');
  return (
    <As ref={ref} className={className}>
      {words.map((w, k) => <span key={k} className="nm-w">{w}{k < words.length - 1 ? ' ' : ''}</span>)}
    </As>
  );
}

/* 27-icon-stack-rise: the product marks rise as a 3D stack, settle with a
   back ease and fan out, with a guide line and a glint */
const LINE = ['adapid', 'zenstra', 'icms'];
export function IconStack({ className }) {
  const ref = useRef(null);
  useOnView(ref, (gsap, el) => {
    const cards = el.querySelectorAll('.nm-card'), line = el.querySelector('.nm-line'), glint = el.querySelector('.nm-glint');
    const fan = [-1.5, -.5, .5, 1.5];
    gsap.set(cards, { y: 160, opacity: 0, rotationX: 12, transformPerspective: 1400, x: 0, rotationZ: (k) => [-6, -2, 2, 6][k] });
    return gsap.timeline({ defaults: { ease: 'power4.out' } })
      .to(cards, { opacity: 1, y: -12, rotationX: -2, duration: .9, stagger: .07 }, 0)
      .to(cards, { y: 0, rotationX: 0, duration: .3, ease: 'back.out(1.28)', stagger: .07 }, .8)
      .to(cards, { x: (k) => fan[k] * 132, rotationZ: (k) => fan[k] * 2.2, duration: .72, ease: 'back.out(1.38)', stagger: .04 }, 1.05)
      .fromTo(line, { opacity: 0, scaleX: .06 }, { opacity: .7, scaleX: 1, duration: .5 }, 1.1)
      .fromTo(glint, { opacity: 0, scale: .7 }, { opacity: .55, scale: 1.1, duration: .5 }, 1.1)
      .to([line, glint], { opacity: .18, duration: .6 }, 1.9);
  }, { threshold: .35 });
  return (
    <div ref={ref} className={cx('nm-stack', className)} aria-hidden="true">
      <span className="nm-glint" /><span className="nm-line" />
      {LINE.map((p, k) => <span key={p} className="nm-card" style={{ zIndex: 4 - Math.abs(k - 1.5) }}><ProductMark p={p} size={54} /></span>)}
    </div>
  );
}

/* 06-notification: the items of a list drop in one after another, like a stack of toasts */
export function useToastStack(ref, selector = ':scope > li') {
  useOnView(ref, (gsap, el) => gsap.from(el.querySelectorAll(selector), { y: -40, opacity: 0, scale: .96, duration: .7, ease: 'back.out(1.4)', stagger: .12 }), { threshold: .15 });
}

/* 17-integrations-grid: tiles pop in from the centre outwards */
export function useGridPop(ref, selector) {
  useOnView(ref, (gsap, el) => gsap.from(el.querySelectorAll(selector), { opacity: 0, scale: .7, y: 12, duration: .5, ease: 'back.out(1.7)', stagger: { each: .05, from: 'center' } }), { threshold: .3 });
}

/* 27-cinematic-hud-overlay: corner brackets, a scan line and a live tag over a picture */
export function Hud({ label = 'Live', children, className }) {
  const ref = useRef(null);
  useOnView(ref, (gsap, el) => gsap.timeline()
    .from(el.querySelectorAll('.nm-corner'), { opacity: 0, scale: 1.4, duration: .6, ease: 'power3.out', stagger: .06 })
    .fromTo(el.querySelector('.nm-scan'), { top: '0%', opacity: 0 }, { top: '100%', opacity: .9, duration: 1.4, ease: 'power2.inOut' }, .2)
    .to(el.querySelector('.nm-scan'), { opacity: 0, duration: .3 })
    .from(el.querySelector('.nm-tag'), { opacity: 0, x: -10, duration: .4, ease: 'power2.out' }, .3), { threshold: .3 });
  return (
    <div ref={ref} className={cx('nm-hud', className)}>
      {children}
      <span aria-hidden="true" className="nm-corner tl" /><span aria-hidden="true" className="nm-corner tr" /><span aria-hidden="true" className="nm-corner bl" /><span aria-hidden="true" className="nm-corner br" />
      <span aria-hidden="true" className="nm-scan" />
      <span aria-hidden="true" className="nm-tag"><i />{label}</span>
    </div>
  );
}

/* ── per-product signature moves ─────────────────────────────────────────── */

/* 18-cta-click (AD Security): a cursor clicks the fix, and the paths to Tier 0 drop */
export function FixClick() {
  const ref = useRef(null);
  const [n, setN] = useState(16);
  useOnView(ref, (gsap, el) => {
    const cur = el.querySelector('.nm-cursor'), btn = el.querySelector('.nm-fixbtn'), chip = el.querySelector('.nm-fixchip'), rip = el.querySelector('.nm-rip');
    const o = { v: 57 }; setN(57);
    gsap.set(cur, { x: 220, y: 120, opacity: 0 }); gsap.set(chip, { opacity: 0, scale: .8 });
    return gsap.timeline({ delay: .3 })
      .to(cur, { opacity: 1, duration: .2 })
      .to(cur, { x: 0, y: 0, duration: .9, ease: 'power3.inOut' })
      .to(btn, { scale: .95, duration: .1, ease: 'power2.out' })
      .fromTo(rip, { scale: .2, opacity: .7 }, { scale: 2.4, opacity: 0, duration: .6, ease: 'power2.out' }, '<')
      .to(btn, { scale: 1, duration: .3, ease: 'back.out(2)' })
      .to(o, { v: 16, duration: 1.2, ease: 'power3.out', onUpdate: () => setN(Math.round(o.v)) }, '-=.1')
      .to(chip, { opacity: 1, scale: 1, duration: .5, ease: 'back.out(1.7)' }, '-=.6')
      .to(cur, { x: 60, y: 40, opacity: 0, duration: .6, ease: 'power2.in' }, '-=.3');
  }, { threshold: .4 });
  return (
    <div ref={ref} className="nm-fix" aria-label="Illustration: removing GenericAll on Server Admins closes 41 of the 57 paths to Tier 0, leaving 16.">
      <div aria-hidden="true">
        <div className="flex items-end justify-between gap-6">
          <div><p className="nm-fixk">Paths to Tier 0</p><p className="nm-fixn"><b>{n}</b><span>of 57</span></p></div>
          <span className="nm-fixchip">✓ 41 paths closed by one change</span>
        </div>
        <div className="nm-fixrow">
          <span><b>GenericAll on Server Admins</b><small>Shared by 41 of 57 paths · fix with the highest reach</small></span>
          <span className="nm-fixbtn">Remove<span className="nm-rip" /></span>
          <svg className="nm-cursor" viewBox="0 0 22 24" width="22" height="24"><path d="M2 2 L20 9.5 L11.5 12 L8 21 Z" fill="#fff" stroke="#12171f" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        </div>
      </div>
    </div>
  );
}

/* 09-grid-network (Zenstra): the gateway at the centre, every kind of agent around it */
const SPOKES = [['Copilots', 0], ['Claude agents', 60], ['n8n flows', 120], ['MCP servers', 180], ['Cursor', 240], ['Custom agents', 300]];
export function HubSpokes() {
  const ref = useRef(null);
  useOnView(ref, (gsap, el) => gsap.timeline()
    .from(el.querySelector('.nm-hub'), { scale: .5, opacity: 0, duration: .7, ease: 'back.out(1.6)' })
    .from(el.querySelectorAll('.nm-spoke'), { strokeDashoffset: 1, duration: .6, ease: 'power3.out', stagger: .07 }, '-=.3')
    .from(el.querySelectorAll('.nm-node'), { opacity: 0, scale: .6, duration: .5, ease: 'back.out(1.7)', stagger: .07 }, '-=.5'), { threshold: .35 });
  return (
    <div ref={ref} className="nm-hubwrap" aria-label="Illustration: the Zenstra gateway at the centre, connected to copilots, Claude agents, n8n flows, MCP servers, Cursor and custom agents.">
      <svg viewBox="0 0 420 300" aria-hidden="true" className="block h-auto w-full">
        <defs><radialGradient id="nm-hubg"><stop offset="0" stopColor="#4f7bff" /><stop offset="1" stopColor="#2a3fc4" /></radialGradient></defs>
        {SPOKES.map(([n, d]) => { const a = (d * Math.PI) / 180, x = 210 + Math.cos(a) * 150, y = 150 + Math.sin(a) * 105; return <line key={n} x1="210" y1="150" x2={x} y2={y} className="nm-spoke" pathLength="1" />; })}
        {SPOKES.map(([n, d], i) => { const a = (d * Math.PI) / 180, x = 210 + Math.cos(a) * 150, y = 150 + Math.sin(a) * 105; return <circle key={`p${n}`} r="3" className="nm-pulse" style={{ offsetPath: `path('M210 150 L${x} ${y}')`, animationDelay: `${i * .4}s` }} />; })}
        <circle cx="210" cy="150" r="58" className="nm-ring" />
        <g className="nm-hub"><circle cx="210" cy="150" r="40" fill="url(#nm-hubg)" /><text x="210" y="146" textAnchor="middle" className="nm-hubt">Zenstra</text><text x="210" y="162" textAnchor="middle" className="nm-hubs">gateway</text></g>
        {SPOKES.map(([n, d]) => { const a = (d * Math.PI) / 180, x = 210 + Math.cos(a) * 150, y = 150 + Math.sin(a) * 105; return <g key={`n${n}`} className="nm-node"><rect x={x - 52} y={y - 14} width="104" height="28" rx="14" /><text x={x} y={y + 4} textAnchor="middle">{n}</text></g>; })}
      </svg>
    </div>
  );
}


/* 20-search-typing (ICMS): the question types itself, the answers stack in */
const Q = 'who opened patient records last night?';
const ANSWERS = [['reports-svc', 'Read 4,210 records', 'Purpose: monthly report', 'ok'], ['dr.kapoor', 'Opened 3 records', 'Purpose: treatment', 'ok'], ['m.sharma', 'Exported 18,400 phone numbers', 'No consent for marketing · held', 'crit']];
export function SearchType() {
  const ref = useRef(null);
  const [q, setQ] = useState(Q);
  useOnView(ref, (gsap, el) => {
    const o = { i: 0 }; setQ('');
    gsap.set(el.querySelectorAll('.nm-ans'), { opacity: 0, y: -14 });
    return gsap.timeline({ delay: .2 })
      .to(o, { i: Q.length, duration: 1.6, ease: 'none', onUpdate: () => setQ(Q.slice(0, Math.round(o.i))) })
      .to(el.querySelectorAll('.nm-ans'), { opacity: 1, y: 0, duration: .55, ease: 'back.out(1.4)', stagger: .18 }, '+=.25');
  }, { threshold: .35 });
  return (
    <div ref={ref} className="nm-search" aria-label="Illustration: asking who opened patient records last night returns three accesses with their purposes; one export without consent is held.">
      <div aria-hidden="true">
        <div className="nm-sbar"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg><span>{q}<i className="nm-caret" /></span><kbd>Ask ICMS</kbd></div>
        <ul className="mt-3 grid gap-2">
          {ANSWERS.map(([who, what, why, tone]) => (
            <li key={who} className={cx('nm-ans', tone === 'crit' && 'crit')}><b className="font-mono">{who}</b><span>{what}</span><small>{why}</small></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* 24-showreel-notify (Fraud): the bank's notification drops onto the phone stage */
export function PhoneNotify({ title = 'Payment held', body = 'Your bank will call you in a moment.', time = 'now' }) {
  const ref = useRef(null);
  useOnView(ref, (gsap, el) => gsap.timeline({ repeat: -1, repeatDelay: 2.6, delay: .6 })
    .fromTo(el, { y: -60, opacity: 0, scale: .95 }, { y: 0, opacity: 1, scale: 1, duration: .7, ease: 'back.out(1.4)' })
    .to(el, { y: -40, opacity: 0, duration: .4, ease: 'power3.in' }, '+=3'), { threshold: .3 });
  return (
    <div ref={ref} className="nm-notify" aria-hidden="true">
      <span className="nm-nico">YB</span>
      <span className="min-w-0"><b>{title}</b><small>{body}</small></span>
      <em>{time}</em>
    </div>
  );
}
