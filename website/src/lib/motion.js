import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export const cx = (...a) => a.filter(Boolean).join(' ');
export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return r;
}

export function useInView(ref, { margin = '0px', threshold = 0.2, once = false } = {}) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => {
      setV(e.isIntersecting);
      if (once && e.isIntersecting) io.disconnect();
    }, { rootMargin: margin, threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, threshold, once]);
  return v;
}

/* Plays a picture as a sequence of steps while it is on screen.
   The prerendered HTML (and reduced motion) shows the last step, so nothing
   is hidden without JavaScript. When the picture enters the view it rewinds
   to step 0 and advances through `durations` (ms per step), then holds the
   last step for `hold` ms and starts again if `loop` is set. */
export function useSteps(ref, durations, { loop = true, hold = 2600, speed = 1 } = {}) {
  const last = durations.length;
  const [k, setK] = useState(last);
  const reduce = useReducedMotion();
  const inView = useInView(ref, { threshold: 0.3 });
  const started = useRef(false);
  // callers pass the durations inline; key on their values so a parent re-render never restarts a step
  const times = durations.join(',');
  useEffect(() => {
    if (reduce) { setK(last); return undefined; }
    if (!inView) { started.current = false; return undefined; }
    if (!started.current) {
      started.current = true;
      // rewind; if already at step 0 (the picture left and came straight back), carry on from here,
      // since setting the same step would not re-render and the sequence would never start again
      if (k !== 0) { setK(0); return undefined; }
    }
    if (k < last) {
      const t = setTimeout(() => setK((n) => n + 1), +times.split(',')[k] / speed);
      return () => clearTimeout(t);
    }
    if (!loop) return undefined;
    const t = setTimeout(() => setK(0), hold);
    return () => clearTimeout(t);
  }, [k, inView, reduce, last, loop, hold, speed, times]);
  return k;
}

/* Gentle pointer tilt for a 3D stage (desktop pointers only). Writes --rx/--ry. */
export function useTilt(ref, { base = [6, -14], range = [5, 7] } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const set = (x, y) => { el.style.setProperty('--rx', `${(base[0] - y * range[0]).toFixed(2)}deg`); el.style.setProperty('--ry', `${(base[1] + x * range[1]).toFixed(2)}deg`); };
    set(0, 0);
    if (!fine || reduce) return undefined;
    let raf = 0;
    const move = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        set(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)), Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2)));
      });
    };
    const leave = () => set(0, 0);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, [ref, base[0], base[1], range[0], range[1]]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* Scroll progress (0 to 1) of a tall element through the viewport, for pinned scenes. */
export function useScrollProgress(ref) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        setP(total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0);
      });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, [ref]);
  return p;
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
/* maps p from [a, b] to [0, 1] */
export const seg = (p, a, b) => clamp01((p - a) / (b - a));
export const ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const lerp = (a, b, t) => a + (b - a) * t;
