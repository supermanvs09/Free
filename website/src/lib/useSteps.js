import { useCallback, useEffect, useRef, useState } from 'react';

/* Drives a step-by-step product demo.
   - The server and reduced motion render the `initial` step (normally the last,
     so prerendered HTML shows the finished state); in the browser the demo
     rewinds to `start` and plays while it is on screen.
   - Any interaction (click, key, focus inside, pointer over) pauses it; the
     visitor can resume with play().
   - `progress` (0..1) is the time spent on the current step, for step bars. */
export function useSteps(n, { ms = 3200, initial = n - 1, start = 0, loop = true, auto = true } = {}) {
  const [i, setI] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1);
  const ref = useRef(null);
  const visible = useRef(false);
  const reduced = useRef(false);
  const t0 = useRef(0);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced.current || !auto) return undefined;
    setI(start); setProgress(0);
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => {
      visible.current = e.isIntersecting;
      setPlaying((p) => (e.isIntersecting ? p || !el.dataset.paused : false));
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [auto, start]);

  useEffect(() => {
    if (!playing) return undefined;
    let raf = 0;
    t0.current = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0.current) / ms);
      setProgress(p);
      if (p >= 1) {
        t0.current = now;
        setI((x) => {
          if (x + 1 < n) return x + 1;
          if (loop) return 0;
          setPlaying(false); return x;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, ms, n, loop, i]);

  const pause = useCallback(() => { if (ref.current) ref.current.dataset.paused = '1'; setPlaying(false); setProgress(1); }, []);
  const go = useCallback((k) => { pause(); setI(((k % n) + n) % n); }, [n, pause]);
  const play = useCallback(() => {
    if (reduced.current) return;
    if (ref.current) delete ref.current.dataset.paused;
    setI((x) => (x >= n - 1 && !loop ? 0 : x)); setProgress(0); setPlaying(true);
  }, [n, loop]);
  return { i, go, next: () => go(i + 1), prev: () => go(i - 1), playing, play, pause, progress, ref };
}
