import { useEffect } from 'react';

/* One looping anime.js timeline per picture. anime.js loads in the browser
   only, the first time a picture comes on screen; the timeline pauses when it
   leaves and resumes when it returns. The server HTML (and reduced motion) is
   the picture's finished frame, so nothing is ever blank. */

let animeP;
export const loadAnime = () => (animeP ||= import('animejs'));

export function useScene(ref, build, { threshold = 0.3 } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let tl, cancelled = false, started = false;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!started) {
          started = true;
          loadAnime().then((a) => {
            if (cancelled) return;
            el.classList.add('is-live');
            tl = build(a, el, (sel) => el.querySelectorAll(sel));
          });
        } else tl?.play?.();
      } else tl?.pause?.();
    }, { threshold });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); tl?.revert?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/* count a number inside an element, keeping thousands separators */
export const counter = (a, el, from, to, opts = {}) => {
  const o = { v: from };
  const fmt = opts.fmt || ((v) => Math.round(v).toLocaleString('en-IN'));
  return a.animate(o, { v: to, duration: opts.duration || 1200, ease: opts.ease || 'outExpo', onUpdate: () => { el.textContent = fmt(o.v); } });
};
