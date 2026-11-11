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

/* The hero visual: a field of red particles rolling like a wave in
   perspective (the Quantra hero image, made live). Canvas only; it pauses
   off screen and draws a single still frame under reduced motion. */
export function ParticleWave({ className }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return undefined;
    const ctx = c.getContext('2d');
    let w = 0; let h = 0; let raf = 0; let on = true; let t = 0;
    const size = () => {
      const r = c.getBoundingClientRect(); const d = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height; c.width = w * d; c.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    const COLS = 90; const ROWS = 46;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let j = 0; j < ROWS; j++) {
        const z = j / ROWS;                       // 0 far .. 1 near
        const p = 0.25 + z * z * 1.6;             // perspective scale
        const y0 = h * 0.34 + z * z * h * 0.62;
        for (let i = 0; i < COLS; i++) {
          const x0 = (i / (COLS - 1) - 0.5) * 2;  // -1 .. 1
          const wave = Math.sin(x0 * 3.2 + t * 0.9 + j * 0.22) * 0.5 + Math.sin(x0 * 7.1 - t * 0.6 + j * 0.11) * 0.25 + Math.sin(j * 0.35 + t * 0.5) * 0.35;
          const x = w * 0.5 + x0 * w * 0.62 * p;
          const y = y0 - wave * h * 0.07 * p;
          const a = Math.max(0, Math.min(1, 0.3 + (wave + 1) * 0.5)) * (0.35 + z * 0.65);
          const r = (0.7 + (wave + 1) * 0.7) * p;
          ctx.fillStyle = `rgba(${90 + (wave + 1) * 40 | 0}, ${100 + (wave + 1) * 50 | 0}, 255, ${a})`;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    };
    const loop = () => { if (on) { t += 0.016; draw(); } raf = requestAnimationFrame(loop); };
    size(); draw();
    const still = reduced();
    const io = new IntersectionObserver(([e]) => { on = e.isIntersecting; });
    io.observe(c);
    const onR = () => { size(); draw(); };
    window.addEventListener('resize', onR);
    if (!still) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener('resize', onR); };
  }, []);
  return (
    <div className={cx('relative overflow-hidden bg-[radial-gradient(70%_70%_at_50%_70%,rgb(99_88_255/.35),transparent_70%)]', className)} aria-hidden="true">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,var(--color-bg)_0%,transparent_30%,transparent_80%,var(--color-bg)_100%)]" />
    </div>
  );
}
