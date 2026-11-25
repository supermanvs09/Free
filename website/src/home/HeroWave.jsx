import { useEffect, useRef } from 'react';

/* The hero background: a slow wave of fine light strands, drawn live on a
   canvas with additive blending, so crossings glow like silk or optical
   fibre (the cisco.com hero idea, made ours). Signals travel along a few
   strands: white-blue for identities moving through the network, and now and
   then an amber one, flagged and stopped. Pauses off screen, on the pause
   button and in background tabs; one still frame for reduced motion. */

const TAU = Math.PI * 2;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// a cheap deterministic random, so the server and every reload draw the same wave
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

export default function HeroWave({ paused }) {
  const ref = useRef(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return undefined;
    const ctx = cv.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = rng(7);
    let W = 0, H = 0, dpr = 1, raf = 0, visible = true, last = performance.now(), t = 18;

    // strands: one ribbon made of many lines that fan out and pinch together
    let strands = [];
    const build = () => {
      const n = W < 700 ? 70 : 150;
      strands = Array.from({ length: n }, (_, i) => {
        const rib = i % 3 === 2 ? 1 : 0;              // two ribbons that weave through each other
        const u = r();
        const roll = r();
        const tone = roll < 0.05 ? 'amber' : roll < 0.28 ? 'blue' : roll < 0.4 ? 'cyan' : 'white';
        return { u, rib, tone, a: 0.06 + Math.pow(r(), 2) * 0.27, w: 0.5 + r() * 0.9, ph: r() * TAU };
      });
    };
    const signals = Array.from({ length: 9 }, (_, i) => ({ s: Math.floor(r() * 140), p: r(), v: 0.035 + r() * 0.03, flag: i === 3 }));
    const dust = Array.from({ length: 36 }, () => ({ x: r(), y: r() * 0.75, z: 0.3 + r() * 0.7, ph: r() * TAU }));

    const resize = () => {
      const b = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      W = b.width; H = b.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    // the y of strand u at x, time t
    const yAt = (u, x, time, ph, rib = 0) => {
      const nx = x / W;
      const T = time + rib * 7.3;
      const centre = H * (0.84 - 0.32 * smooth(0.05, 1, nx)) + rib * H * 0.05;     // rises to the right
      const amp = H * (0.06 + 0.15 * smooth(0.15, 1, nx));                           // calmer on the left
      const fan = H * (0.04 + (0.26 - rib * 0.1) * Math.pow(Math.sin(nx * 2.8 + T * 0.09 + 0.6), 2)); // the ribbon pinches and fans
      const k = x * 0.0042;
      const fold = Math.sin(k * 1.6 + T * 0.27 + u * 3.1) * Math.sin(nx * 3.2 + T * 0.05);  // silk folding over itself
      const wave = Math.sin(k + T * 0.32 + u * 2.2 + ph * 0.05) * 0.6
        + Math.sin(k * 2.27 - T * 0.23 + u * 4.6) * 0.26
        + Math.sin(k * 0.58 + T * 0.17 + u * 1.4) * 0.55
        + fold * 0.35 * u
        + Math.sin(k * 4.1 + T * 0.41 + u * 9) * 0.06 * u;
      return centre + wave * amp * (rib ? -0.85 : 1) + (u - 0.5) * fan;
    };

    const colour = { white: '226,234,255', blue: '64,150,255', cyan: '96,214,255', amber: '255,178,92' };

    const draw = () => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      // a faint blue bloom under the wave
      const g = ctx.createRadialGradient(W * 0.78, H * 0.82, 0, W * 0.78, H * 0.82, Math.max(W, H) * 0.6);
      g.addColorStop(0, 'rgba(40,110,230,0.26)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'lighter';
      const step = W < 700 ? 14 : 10;
      for (const s of strands) {
        const grad = ctx.createLinearGradient(W * 0.12, 0, W, 0);
        const c = colour[s.tone];
        const a = s.tone === 'amber' ? s.a * 0.55 : s.a;
        grad.addColorStop(0, `rgba(${c},0)`);
        grad.addColorStop(0.35, `rgba(${c},${a * 0.6})`);
        grad.addColorStop(0.75, `rgba(${c},${a})`);
        grad.addColorStop(1, `rgba(${c},${a * 0.8})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = s.w;
        ctx.beginPath();
        for (let x = W * 0.1; x <= W + step; x += step) {
          const y = yAt(s.u, x, t, s.ph, s.rib);
          if (x === W * 0.1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // signals travelling along strands
      for (const sg of signals) {
        const s = strands[sg.s % strands.length];
        const x = W * (0.22 + sg.p * 0.82);
        const y = yAt(s.u, x, t, s.ph, s.rib);
        const fade = smooth(0, 0.12, sg.p) * (1 - smooth(0.85, 1, sg.p));
        const rad = sg.flag ? 22 : 16;
        const rg = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const c = sg.flag ? '255,170,80' : '190,225,255';
        rg.addColorStop(0, `rgba(${c},${0.95 * fade})`); rg.addColorStop(0.25, `rgba(${c},${0.35 * fade})`); rg.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
        // a short comet tail behind the signal
        ctx.strokeStyle = `rgba(${c},${0.35 * fade})`; ctx.lineWidth = 1.4; ctx.beginPath();
        for (let k = 0; k < 9; k++) { const xx = x - k * 9; const yy = yAt(s.u, xx, t, s.ph, s.rib); if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
        ctx.stroke();
      }

      // drifting specks
      for (const d of dust) {
        const tw = 0.35 + 0.65 * Math.pow(Math.sin(t * 0.8 * d.z + d.ph), 2);
        const x = ((d.x + t * 0.004 * d.z) % 1) * W;
        const y = H * d.y + Math.sin(t * 0.3 + d.ph) * 6;
        const vis = smooth(0.3, 0.7, x / W);
        ctx.fillStyle = `rgba(220,235,255,${0.5 * tw * vis * d.z})`;
        ctx.beginPath(); ctx.arc(x, y, 0.6 + d.z * 1.1, 0, TAU); ctx.fill();
      }
    };

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (pausedRef.current || !visible || document.hidden) return;
      t += dt;
      for (const sg of signals) {
        sg.p += sg.v * dt;
        if (sg.p > 1) { sg.p = 0; sg.s = Math.floor(Math.random() * strands.length); }
      }
      draw();
    };

    resize();
    draw();
    const ro = new ResizeObserver(() => { resize(); draw(); });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(cv);
    if (!reduce) raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  return <canvas ref={ref} className="dx-hero-cv" aria-hidden="true" />;
}
