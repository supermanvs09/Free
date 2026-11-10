import { Children, isValidElement, useEffect, useRef, useState } from 'react';
import { cx, useIsoLayoutEffect } from '../lib/motion.js';

/* Motion primitives for the v3 design (docs/redesign-v3/PLAN.md §3).
   Rules: the prerendered HTML is the final state; effects arm only after
   hydration and only below the fold; reduced motion shows the final state. */

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Arms an element if it is below the fold, then fires once it enters. */
function useArm(ref, { threshold = 0.2, margin = '0px 0px -10% 0px', always = false, parent = false } = {}) {
  const [state, setState] = useState('idle'); // idle (SSR/final) | arm | go
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return undefined;
    const r = el.getBoundingClientRect();
    const above = r.top < window.innerHeight * 0.9;
    if (above && !always) return undefined;
    setState('arm');
    if (above) { const t = requestAnimationFrame(() => requestAnimationFrame(() => setState('go'))); return () => cancelAnimationFrame(t); }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setState('go'); io.disconnect(); } }, { threshold, rootMargin: margin });
    // a clipped element has no visible area, so watch its parent instead
    io.observe(parent ? el.parentElement : el);
    return () => io.disconnect();
  }, []);
  return state;
}

/* Kinetic headline (shots 3, 12, 22, 77): every word rises out of its own mask.
   Children may be a string or a mix of strings and inline elements. */
export function SplitTitle({ as: As = 'h2', children, className, delay = 0, always, ...rest }) {
  const ref = useRef(null);
  const state = useArm(ref, { always });
  let i = 0;
  const words = [];
  Children.toArray(children).forEach((ch, ci) => {
    if (typeof ch === 'string') {
      ch.split(/(\s+)/).forEach((w, wi) => {
        if (!w) return;
        if (/^\s+$/.test(w)) { words.push(' '); return; }
        words.push(<span key={`${ci}-${wi}`} className="w"><span style={{ '--i': i++ }}>{w}</span></span>);
      });
    } else if (isValidElement(ch)) {
      words.push(<span key={`e${ci}`} className="w"><span style={{ '--i': i++ }}>{ch}</span></span>);
    }
  });
  return (
    <As ref={ref} className={cx('split', state !== 'idle' && 'arm', state === 'go' && 'go', className)} style={{ '--d': `${delay}ms` }} {...rest}>
      {words}
    </As>
  );
}

/* Masked photograph (shots 4, 5, 57, 63): wipes up from a clip and settles from
   a slight zoom; `para` adds a gentle scroll parallax (CSS scroll timeline). */
export function MediaReveal({ src, alt = '', className, imgClass, ratio, para = true, brk = true, children, width = 1200, height = 800, priority }) {
  const ref = useRef(null);
  const state = useArm(ref, { threshold: 0.15, parent: true });
  return (
    <figure ref={ref} className={cx('media mreveal', brk && 'brk', para && 'para', state !== 'idle' && 'arm', state === 'go' && 'go', className)} style={ratio ? { aspectRatio: ratio } : undefined}>
      <img src={src} alt={alt} width={width} height={height} loading={priority ? 'eager' : 'lazy'} decoding="async" className={imgClass} />
      {children}
    </figure>
  );
}

/* Infinite marquee (shots 18, 54, 69): pauses on hover and keyboard focus. */
export function Marquee({ children, speed = 50, reverse, className, label, fade = true }) {
  return (
    <div className={cx('marquee-wrap overflow-hidden', fade && 'marquee-fade', className)} role={label ? 'region' : undefined} aria-label={label}>
      <div className={cx('marquee flex w-max', reverse && 'rev')} style={{ '--mq': `${speed}s` }}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}

/* Lazy ScrollTrigger, client only. */
let st;
async function scrollTrigger() {
  if (!st) {
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
    gsap.registerPlugin(ScrollTrigger);
    st = { gsap, ScrollTrigger };
  }
  return st;
}

/* Scroll-linked manifesto (shots 50, 57, 77): words light up as the reader scrolls. */
export function ScrollWords({ text, as: As = 'p', className }) {
  const ref = useRef(null);
  const words = text.split(' ');
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return undefined;
    const spans = [...el.querySelectorAll('.x')];
    spans.forEach((s) => s.classList.remove('on'));
    let trig; let dead = false;
    scrollTrigger().then(({ ScrollTrigger }) => {
      if (dead) return;
      trig = ScrollTrigger.create({
        trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true,
        onUpdate: (self) => { const n = Math.round(self.progress * spans.length); spans.forEach((s, k) => s.classList.toggle('on', k < n)); },
      });
    });
    return () => { dead = true; trig?.kill(); spans.forEach((s) => s.classList.add('on')); };
  }, [text]);
  return (
    <As ref={ref} className={cx('sw', className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{words.map((w, k) => <span key={k} className="x on">{w}{k < words.length - 1 ? ' ' : ''}</span>)}</span>
    </As>
  );
}

/* Sticky stacking cards (shots 26, 37, 57): each card pins under the header and
   recedes as the next one slides over it. Wrap each card in <StackCard>. */
export function Stack({ children, className }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || window.innerWidth < 1024) return undefined;
    const cards = [...el.querySelectorAll(':scope > .stack-card')];
    const trigs = []; let dead = false;
    scrollTrigger().then(({ gsap, ScrollTrigger }) => {
      if (dead) return;
      cards.forEach((c, k) => {
        const next = cards[k + 1];
        if (!next) return;
        const inner = c.firstElementChild;
        trigs.push(ScrollTrigger.create({
          trigger: next, start: 'top bottom', end: 'top 20%', scrub: true,
          animation: gsap.fromTo(inner, { scale: 1, filter: 'brightness(1)' }, { scale: 0.94, filter: 'brightness(.55)', ease: 'none' }),
        }));
      });
    });
    return () => { dead = true; trigs.forEach((t) => { t.animation?.revert(); t.kill(); }); };
  }, []);
  return <div ref={ref} className={cx('relative', className)}>{children}</div>;
}
export function StackCard({ k = 0, children, className }) {
  return <div className="stack-card lg:pb-8" style={{ '--k': k }}><div className={cx('will-change-transform', className)}>{children}</div></div>;
}

/* Perspective frame that flattens as it scrolls into place (shots 10, 17, 19). */
export function TiltFrame({ children, className }) {
  return <div className={cx('tilt', className)}><div className="tilt-in">{children}</div></div>;
}

/* One delegated pointer listener drives every `.spot` card (shots 54, 68, 80). */
export function useSpotlight() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return undefined;
    const move = (e) => {
      const el = e.target.closest?.('.spot');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => document.removeEventListener('pointermove', move);
  }, []);
}

/* Section index label in mono ("/ 02  Products"). */
export function Index({ n, children, className }) {
  return (
    <p className={cx('flex items-center gap-3 font-mono text-[12px] uppercase tracking-[.14em] text-ink-3', className)}>
      {n && <span className="text-brand">{n}</span>}<span className="h-px w-8 bg-line-2" aria-hidden="true" />{children}
    </p>
  );
}
