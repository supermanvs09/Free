import { useEffect, useRef, useState } from 'react';
import { ICONS, ITEMS } from './radarData.js';

/* The home hero picture: a shallow horizon of three arcs (people, machine
   identities, AI agents) with our mark on the horizon line. One beam scans
   from left to right; each identity lights up as it is found and the count
   rises. Then the beam fades, rests and scans again. Discovery only: no
   labels inside the picture (names are on hover). Arcs share one shape and
   even spacing so they never pinch. One still frame, fully discovered, for
   reduced motion; a pause button for everyone else. */

const RX = [136, 264, 392], RY = [90, 174, 258], TOTAL = 1284;
const fmt = (v) => Math.round(v).toLocaleString('en-IN');
const Pause = () => <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" /></svg>;
const PlayI = () => <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;

export default function HeroRadar() {
  const beam = useRef(null), nodes = useRef([]), count = useRef(null), pausedRef = useRef(false), box = useRef(null), stage = useRef(null);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  pausedRef.current = paused;

  // narrow screens: the whole picture scales down as one, so spacing stays true
  useEffect(() => {
    const fit = () => {
      const w = box.current?.clientWidth || 800, k = Math.min(1, w / 800), st = stage.current;
      if (!st) return;
      st.style.transform = k < 1 ? `scale(${k})` : '';
      st.style.marginTop = k < 1 ? `${-(1 - k) * 290}px` : '';
    };
    fit();
    const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = nodes.current;
    if (reduce) { setStill(true); els.forEach((e) => e?.classList.add('seen')); if (count.current) count.current.textContent = fmt(TOTAL); return undefined; }
    const found = new Array(ITEMS.length).fill(false);
    let ang = -180, n = 0, shown = 0, rest = 0, last = performance.now(), raf = 0, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    if (beam.current) io.observe(beam.current);
    const reset = () => { found.fill(false); n = 0; els.forEach((e) => e && (e.className = 'rd-node')); };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!beam.current || !count.current) return;   // unmounting: refs are gone before the cleanup runs
      if (pausedRef.current || !visible || document.hidden) return;
      if (rest > 0) {
        rest -= dt;
        if (rest <= 0) { ang = -180; beam.current.style.opacity = 1; }
      } else {
        const prev = ang; ang += dt * 26;
        ITEMS.forEach((it, i) => {
          if (!found[i] && it.a > prev && it.a <= ang) {
            found[i] = true; n++;
            const el = els[i]; el.classList.add('on'); setTimeout(() => { el.classList.remove('on'); el.classList.add('seen'); }, 1000);
          }
        });
        if (ang >= 0) { ang = 0; beam.current.style.opacity = 0; rest = 1.6; if (n === ITEMS.length) setTimeout(reset, 5200); }
      }
      beam.current.style.transform = `rotate(${ang + 90}deg)`;
      const goal = (TOTAL * n) / ITEMS.length;
      shown += (goal - shown) * Math.min(1, dt * 4); if (Math.abs(goal - shown) < 1) shown = goal;
      count.current.textContent = fmt(shown);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  return (
    <div ref={box} className="rd">
      <div ref={stage} className="rd-stage" aria-hidden="true">
        <div className="rd-clip">
          <div className="rd-arc a2" /><div className="rd-arc a1" /><div className="rd-arc a0" />
          <div className="rd-sweep"><div ref={beam} className="rd-beam" style={still ? { display: 'none' } : undefined} /></div>
        </div>
        <div className="rd-horizon" />
        <div className="rd-core"><img src="/brand/mark.webp" alt="" width="40" height="40" /></div>
        {ITEMS.map((it, i) => {
          const a = (it.a * Math.PI) / 180;
          return (
            <span key={it.k} ref={(e) => { nodes.current[i] = e; }} className="rd-node" title={it.t}
              style={{ left: `calc(50% + ${(Math.cos(a) * RX[it.ring]).toFixed(1)}px)`, top: `calc(100% + ${(Math.sin(a) * RY[it.ring]).toFixed(1)}px)` }}
              dangerouslySetInnerHTML={{ __html: ICONS[it.k] }} />
          );
        })}
      </div>
      <p className="rd-status" aria-live="off">
        <i aria-hidden="true" /><span><b ref={count}>{fmt(TOTAL)}</b> identities discovered</span>
        {!still && <button type="button" onClick={() => setPaused((v) => !v)} aria-label={paused ? 'Play animation' : 'Pause animation'}>{paused ? <PlayI /> : <Pause />}</button>}
      </p>
    </div>
  );
}
