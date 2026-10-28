import { useEffect, useRef } from 'react';

/* Site-wide touches, all progressive: a reading-progress line, ribbons that lean
   toward the pointer, and cards marked data-tilt that tip toward it.
   Nothing runs under reduced motion or on touch screens. */
export default function Interactions() {
  const bar = useRef(null);
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = root.scrollHeight - window.innerHeight;
        if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
      });
    };
    let hot = null;
    const reset = (el) => { if (el) el.style.transform = ''; };
    const onMove = (e) => {
      root.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      const el = e.target.closest && e.target.closest('[data-tilt]');
      if (hot && hot !== el) reset(hot);
      hot = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-4px)`;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    if (fine) window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf); reset(hot);
    };
  }, []);
  return <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]"><div ref={bar} className="h-full origin-left scale-x-0 bg-gradient-to-r from-cyan to-brand" /></div>;
}
