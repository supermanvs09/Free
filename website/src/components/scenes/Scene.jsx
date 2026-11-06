import { useEffect, useLayoutEffect, useRef } from 'react';
import { cx, useReducedMotion } from '../../lib/motion.js';

/* Plays a scene: a canvas the scene draws on, plus HTML labels it positions.
   - On the site the scene runs while it is on screen and starts from the top
     each time it comes into view; reduced motion shows one still frame.
   - The film passes `t` and gets exactly that frame.
   - Below 560px of width the scene gets its own (taller) composition; the
     draw function is told `narrow` and lays itself out for it.
   `scene` = { draw(ctx, w, h, t, o) => { [labelId]: { x, y, o, s, ax, ay } }, loop, still, ratio, narrowRatio } */
export default function Scene({ scene, labels = {}, t: forced, label, className, style, dpr: fixedDpr }) {
  const box = useRef(null), cv = useRef(null), ov = useRef(null), ptr = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const reduce = useReducedMotion();

  const frame = (t) => {
    const el = box.current, c = cv.current;
    if (!el || !c) return;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const dpr = fixedDpr || Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = ptr.current;
    p.x += (p.tx - p.x) * 0.06; p.y += (p.ty - p.y) * 0.06;
    const pos = scene.draw(ctx, w, h, t, { narrow: w < 560, mx: p.x, my: p.y }) || {};
    const placed = [];
    for (const n of ov.current.children) {
      const q = pos[n.dataset.l];
      if (!q || (q.o ?? 1) <= 0.001) { n.style.opacity = '0'; n.style.visibility = 'hidden'; continue; }
      n.style.visibility = 'visible';
      n.style.opacity = String(q.o ?? 1);
      // anchor, then keep the label inside the frame
      const lw = n.offsetWidth, lh = n.offsetHeight, m = 8;
      const x = Math.min(Math.max(q.x + ((q.ax ?? -50) / 100) * lw, m), Math.max(m, w - lw - m));
      let y = Math.min(Math.max(q.y + ((q.ay ?? -50) / 100) * lh, m), Math.max(m, h - lh - m));
      // a label never sits on another one: move it down past any it would cover
      if ((q.o ?? 1) > 0.05) {
        for (let k = 0; k < 4; k++) {
          const hit = placed.find((r) => x < r.x + r.w && x + lw > r.x && y < r.y + r.h && y + lh > r.y);
          if (!hit) break;
          y = hit.y + hit.h + 4;
        }
        placed.push({ x, y, w: lw, h: lh });
      }
      n.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(q.s ?? 1).toFixed(3)})`;
    }
  };

  // the film: draw the frame it asks for
  useLayoutEffect(() => { if (forced !== undefined) frame(forced); });

  useEffect(() => {
    if (forced !== undefined) return undefined;
    const el = box.current;
    frame(scene.still);
    if (reduce) {
      const ro = new ResizeObserver(() => frame(scene.still));
      ro.observe(el);
      return () => ro.disconnect();
    }
    let raf = 0, start = null, on = false;
    const tick = (now) => {
      if (!on) return;
      if (start === null) start = now;
      frame(((now - start) / 1000) % scene.loop);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !on) { on = true; start = null; raf = requestAnimationFrame(tick); }
      if (!e.isIntersecting && on) { on = false; cancelAnimationFrame(raf); }
    }, { threshold: 0.12 });
    io.observe(el);
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const move = (e) => { const r = el.getBoundingClientRect(); ptr.current.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; ptr.current.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; };
    const leave = () => { ptr.current.tx = 0; ptr.current.ty = 0; };
    if (fine) { el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave); }
    return () => { on = false; cancelAnimationFrame(raf); io.disconnect(); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [scene, reduce, forced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cx('scn-w', className)} style={style}>
      <div ref={box} className="scn" style={{ '--r': scene.ratio, '--rn': scene.narrowRatio ?? scene.ratio }} role={label ? 'img' : undefined} aria-label={label}>
        <canvas ref={cv} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        <div ref={ov} className="vz scn-ov" aria-hidden="true">
          {Object.entries(labels).map(([id, node]) => <div key={id} data-l={id} className="scn-l">{node}</div>)}
        </div>
      </div>
    </div>
  );
}
