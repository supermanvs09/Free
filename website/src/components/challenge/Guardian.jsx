import { useEffect, useId, useRef } from 'react';
import { loadGsap } from '../../lib/nullmotion.jsx';
import { cx } from '../../lib/motion.js';

/* The Guardian: an eye that keeps the vault. It follows the pointer, blinks, opens
   wide when it is curious, narrows when it is suspicious, flinches red when a
   defence blocks you, and breaks apart when the vault is cracked. Everything is
   transforms on refs (GSAP and one rAF loop), so the page never re-renders for it.
   mood: idle | think | sus | block | won.  layers: how many defences this vault runs.
   hit: index of the defence that just fired.  look: 'down' while the player types. */
const OPEN = { idle: 1, think: 0.82, sus: 0.5, block: 0.36, won: 1.18 };
const ALMOND = 'M-150 0 C-90 -112 90 -112 150 0 C90 112 -90 112 -150 0 Z';

export default function Guardian({ mood = 'idle', layers = 1, hit = -1, look, broken, size, className, label = 'The Guardian' }) {
  const id = useId().replace(/:/g, '');
  const lid = useRef(null), clip = useRef(null), pupil = useRef(null), iris = useRef(null), root = useRef(null), shards = useRef(null);
  const gsapRef = useRef(null);
  const target = useRef({ x: 0, y: 0 }), cur = useRef({ x: 0, y: 0 });
  const lookRef = useRef(look);
  lookRef.current = look;

  // the pupil follows the pointer (or looks down at the command line while typing)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onMove = (e) => {
      const r = root.current?.getBoundingClientRect(); if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 420);
      target.current = { x: (dx / d) * 34 * k, y: (dy / d) * 26 * k };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    let raf;
    const tick = () => {
      const t = lookRef.current === 'down' ? { x: 0, y: 30 } : target.current;
      cur.current.x += (t.x - cur.current.x) * 0.12; cur.current.y += (t.y - cur.current.y) * 0.12;
      if (iris.current) iris.current.setAttribute('transform', `translate(${cur.current.x.toFixed(2)} ${cur.current.y.toFixed(2)})`);
      raf = requestAnimationFrame(tick);
    };
    if (!reduce) raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  // blinking, now and then
  useEffect(() => {
    let t, stop = false;
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    loadGsap().then((g) => {
      gsapRef.current = g;
      const blink = () => {
        if (stop) return;
        const o = OPEN[mood] ?? 1;
        if (!lid.current || !clip.current) return;
        g.timeline().to([lid.current, clip.current], { scaleY: 0.05, duration: 0.07, ease: 'power2.in', transformOrigin: '50% 50%' })
          .to([lid.current, clip.current], { scaleY: o, duration: 0.16, ease: 'power2.out' });
        t = setTimeout(blink, 2600 + Math.random() * 3800);
      };
      t = setTimeout(blink, 1800);
    });
    return () => { stop = true; clearTimeout(t); };
  }, [mood]);

  // mood: how open the eye is, how big the pupil, and a flinch when blocked
  useEffect(() => {
    loadGsap().then((g) => {
      if (!lid.current || !clip.current || !pupil.current || !root.current) return;
      const o = OPEN[mood] ?? 1;
      g.to([lid.current, clip.current], { scaleY: o, duration: 0.5, ease: 'back.out(1.6)', transformOrigin: '50% 50%' });
      g.to(pupil.current, { attr: { r: mood === 'think' ? 30 : mood === 'block' ? 12 : mood === 'won' ? 34 : 20 }, duration: 0.5, ease: 'power3.out' });
      if (mood === 'block') g.fromTo(root.current, { x: -10 }, { x: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.3)' });
    });
  }, [mood]);

  // broken: the iris splits into shards that fly out
  useEffect(() => {
    loadGsap().then((g) => {
      if (!shards.current || !iris.current) return;
      if (!broken) { g.set(shards.current, { opacity: 0 }); g.set(iris.current, { opacity: 1 }); return; }
      const parts = shards.current.querySelectorAll('.ph-shard');
      g.set(shards.current, { opacity: 1 });
      g.fromTo(parts, { x: 0, y: 0, rotate: 0, opacity: 1 }, {
        x: (i) => Math.cos((i / parts.length) * Math.PI * 2) * (220 + (i % 3) * 60),
        y: (i) => Math.sin((i / parts.length) * Math.PI * 2) * (220 + (i % 3) * 60),
        rotate: (i) => (i % 2 ? 1 : -1) * (90 + i * 20), opacity: 0, duration: 1.3, ease: 'power3.out',
      });
      g.to(iris.current, { opacity: 0, duration: 0.2 });
    });
  }, [broken]);

  const n = Math.max(1, layers), gap = 14;
  return (
    <div ref={root} className={cx('ph-eye', className)} style={size ? { width: size } : undefined} role="img" aria-label={label}>
      <svg viewBox="0 0 400 400">
        <defs>
          <radialGradient id={`ir-${id}`} cx="50%" cy="45%" r="55%">
            <stop offset="0" stopColor="#fff" stopOpacity=".95" />
            <stop offset=".18" stopColor="var(--mood)" />
            <stop offset=".7" stopColor="var(--mood)" stopOpacity=".55" />
            <stop offset="1" stopColor="#050507" />
          </radialGradient>
          <radialGradient id={`sc-${id}`} cx="50%" cy="50%" r="60%"><stop offset="0" stopColor="#121520" /><stop offset="1" stopColor="#06070b" /></radialGradient>
          <clipPath id={`cl-${id}`}><path ref={clip} d={ALMOND} transform="translate(200 200)" /></clipPath>
        </defs>
        <circle className="ph-ring ph-r1" cx="200" cy="200" r="192" />
        <circle className="ph-ring ph-r2" cx="200" cy="200" r="174" />
        {/* one rune per defence */}
        {Array.from({ length: n }, (_, i) => {
          const a0 = ((i / n) * 360 + gap / 2 - 90) * (Math.PI / 180), a1 = (((i + 1) / n) * 360 - gap / 2 - 90) * (Math.PI / 180), r = 156;
          return <path key={i} className={cx('ph-rune', mood !== 'won' && 'on', hit === i && 'hit')} d={`M${200 + r * Math.cos(a0)} ${200 + r * Math.sin(a0)} A${r} ${r} 0 ${n === 1 ? 1 : 0} 1 ${200 + r * Math.cos(a1)} ${200 + r * Math.sin(a1)}`} />;
        })}
        {/* the eye */}
        <g ref={lid} transform="translate(200 200)" style={{ transformOrigin: '200px 200px' }}>
          <path d={ALMOND} fill={`url(#sc-${id})`} stroke="var(--mood)" strokeOpacity=".7" strokeWidth="2" style={{ transition: 'stroke .6s' }} />
        </g>
        <g clipPath={`url(#cl-${id})`}>
          <g transform="translate(200 200)">
            <g ref={iris}>
              <circle className="ph-iris" r="64" fill={`url(#ir-${id})`} />
              <circle r="64" fill="none" stroke="#fff" strokeOpacity=".12" strokeDasharray="1 5" />
              <circle r="44" fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="6" />
              <circle ref={pupil} r="20" fill="#020203" />
              <circle cx="-14" cy="-18" r="7" fill="#fff" opacity=".85" />
            </g>
          </g>
        </g>
        <g ref={shards} transform="translate(200 200)" opacity="0">
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2, b = ((i + 1) / 14) * Math.PI * 2;
            return <path key={i} className="ph-shard" d={`M0 0 L${Math.cos(a) * 64} ${Math.sin(a) * 64} L${Math.cos(b) * 64} ${Math.sin(b) * 64} Z`} fill="var(--mood)" opacity=".9" />;
          })}
        </g>
      </svg>
    </div>
  );
}
