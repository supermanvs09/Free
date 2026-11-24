import { useEffect, useRef } from 'react';
import { cx } from '../lib/motion.js';

/* Glowing fibre ribbons, after the light strands in the reference film:
   hundreds of fine strands gather into one bright knot and fan out again.
   `drawRibbons` is pure (time in, picture out) so the product film can render
   the same light frame by frame. Shapes are in 0..1 page units. */

// Catmull-Rom through points -> sample at s in [0,1]
function spline(pts, s) {
  const n = pts.length - 1;
  const x = Math.min(n - 1e-6, Math.max(0, s * n));
  const i = Math.floor(x), t = x - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

const rnd = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

export const PRESETS = {
  // home hero: a "<" sweep whose bright vertex sits between the headline and the product
  hero: {
    bundles: [
      { pts: [[1.22, -0.12], [0.9, 0.1], [0.66, 0.28], [0.53, 0.44], [0.5, 0.53], [0.53, 0.62], [0.66, 0.78], [0.9, 0.94], [1.22, 1.14]], pinch: 0.5, n: 96, spread: [0.008, 0.21], hue: [196, 210] },
      { pts: [[1.22, 0.16], [0.92, 0.28], [0.68, 0.42], [0.555, 0.5], [0.525, 0.54], [0.57, 0.6], [0.72, 0.68], [0.95, 0.78], [1.22, 0.88]], pinch: 0.5, n: 40, spread: [0.006, 0.12], hue: [205, 224], alpha: 0.65 },
    ],
    knot: 0.5,
  },
  // centred home hero: a wide, low arc of light behind the product, under the headline
  heroCenter: {
    bundles: [
      { pts: [[-0.2, 0.86], [0.12, 0.7], [0.32, 0.6], [0.5, 0.56], [0.68, 0.6], [0.88, 0.7], [1.2, 0.86]], pinch: 0.5, n: 90, spread: [0.01, 0.2], hue: [200, 212] },
      { pts: [[-0.2, 0.64], [0.15, 0.6], [0.35, 0.58], [0.5, 0.57], [0.66, 0.59], [0.85, 0.63], [1.2, 0.7]], pinch: 0.5, n: 36, spread: [0.006, 0.1], hue: [205, 222], alpha: 0.6 },
    ],
  },
  heroMobile: {
    bundles: [
      { pts: [[1.25, 0.42], [0.92, 0.56], [0.68, 0.68], [0.55, 0.77], [0.53, 0.82], [0.58, 0.87], [0.74, 0.93], [1.0, 1.0], [1.3, 1.1]], pinch: 0.5, n: 64, spread: [0.008, 0.18], hue: [196, 210] },
    ],
  },
  // product pages: one arc behind the hero picture, tinted by the product accent
  product: {
    bundles: [
      { pts: [[-0.15, 1.05], [0.25, 0.86], [0.55, 0.62], [0.72, 0.5], [0.9, 0.36], [1.2, 0.12]], pinch: 0.55, n: 56, spread: [0.008, 0.16] },
      { pts: [[-0.2, 0.7], [0.2, 0.74], [0.55, 0.6], [0.74, 0.5], [0.95, 0.44], [1.25, 0.46]], pinch: 0.55, n: 26, spread: [0.004, 0.09], alpha: 0.6 },
    ],
  },
  // a horizontal band of light (closing call to action, the brand moment)
  band: {
    bundles: [
      { pts: [[-0.2, 0.62], [0.2, 0.5], [0.5, 0.52], [0.8, 0.46], [1.2, 0.36]], pinch: 0.5, n: 60, spread: [0.02, 0.22] },
      { pts: [[-0.2, 0.3], [0.25, 0.42], [0.5, 0.52], [0.78, 0.6], [1.2, 0.74]], pinch: 0.5, n: 30, spread: [0.01, 0.12], alpha: 0.55 },
    ],
  },
};

/* hue pairs: brand blues by default; product accents tint the far ends */
const ACCENTS = { brand: [198, 208], zen: [228, 238], adap: [194, 200], bot: [168, 178], icms: [40, 48] };

export function buildScene(preset, accent = 'brand', seed = 7) {
  const r = rnd(seed);
  const hue = ACCENTS[accent] || ACCENTS.brand;
  return preset.bundles.map((b) => ({
    ...b,
    hue: accent === 'brand' ? (b.hue || hue) : hue,
    strands: Array.from({ length: b.n }, () => ({
      o: (r() * 2 - 1) * (0.35 + 0.65 * r()),
      rr: 0.25 + 0.75 * Math.sqrt(r()),
      th: r() * Math.PI * 2,
      w: 0.45 + r() * 1.1,
      a: 0.08 + Math.pow(r(), 2) * 0.42,
      f: 0.12 + r() * 0.3,
      k: 2 + r() * 5,
      ph: r() * Math.PI * 2,
      amp: 0.18 + r() * 0.55,
    })),
    sparks: Array.from({ length: Math.round(b.n / 6) }, () => ({ j: Math.floor(r() * b.n), v: 0.03 + r() * 0.06, s0: r() })),
  }));
}

const M = 64; // samples per strand
export function drawRibbons(ctx, W, H, t, scene, { intensity = 1, pointer = [0, 0], sat = 100 } = {}) {
  ctx.clearRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const S = Math.min(W, H) * 0.9 + Math.max(W, H) * 0.1;
  for (const b of scene) {
    const pts = b.pts.map(([x, y]) => [(x + pointer[0] * 0.015) * W, (y + pointer[1] * 0.02) * H]);
    // centre line, normals and width envelope
    const C = [], N = [], Wd = [];
    for (let i = 0; i <= M; i++) {
      const s = i / M;
      const p = spline(pts, s), q = spline(pts, Math.min(1, s + 0.004));
      let dx = q[0] - p[0], dy = q[1] - p[1];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      C.push(p); N.push([-dy, dx]);
      const d = Math.abs(s - b.pinch) / Math.max(b.pinch, 1 - b.pinch);
      Wd.push((b.spread[0] + (b.spread[1] - b.spread[0]) * Math.pow(d, 1.25)) * S);
    }
    const [h0, h1] = b.hue;
    const grad = ctx.createLinearGradient(C[0][0], C[0][1], C[M][0], C[M][1]);
    grad.addColorStop(0, `hsla(${h1}, ${sat}%, 45%, 0)`);
    grad.addColorStop(Math.max(0.05, b.pinch - 0.32), `hsla(${h1}, ${sat}%, 52%, 1)`);
    grad.addColorStop(b.pinch, `hsla(${h0}, ${sat}%, 88%, 1)`);
    grad.addColorStop(Math.min(0.95, b.pinch + 0.32), `hsla(${h0}, ${sat}%, 55%, 1)`);
    grad.addColorStop(1, `hsla(${h1}, ${sat}%, 45%, 0)`);
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    const amul = (b.alpha ?? 1) * intensity;

    // soft glow under the bundle
    ctx.globalAlpha = 0.05 * amul;
    for (const lw of [Wd[0] * 0.5, Wd[0] * 0.25]) {
      ctx.lineWidth = Math.max(6, lw);
      ctx.beginPath();
      C.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }

    // strands
    const pos = (st, i) => {
      const s = i / M;
      const wob = Math.sin(t * st.f + s * st.k + st.ph) * st.amp;
      const twist = st.rr * Math.cos(st.th + s * 7.5 + t * 0.22);
      const off = (st.o * 0.45 + twist * 0.55 + wob * 0.3) * Wd[i];
      return [C[i][0] + N[i][0] * off, C[i][1] + N[i][1] * off];
    };
    for (const st of b.strands) {
      ctx.globalAlpha = st.a * amul;
      ctx.lineWidth = st.w * (W > 900 ? 1 : 0.8);
      ctx.beginPath();
      for (let i = 0; i <= M; i++) { const p = pos(st, i); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.stroke();
    }

    // light running along the fibres
    for (const sp of b.sparks) {
      const st = b.strands[sp.j];
      const u = (sp.s0 + t * sp.v) % 1;
      const i = Math.min(M, Math.round(u * M));
      const p = pos(st, i);
      const fade = Math.sin(u * Math.PI);
      // a short bright trail behind the spark
      ctx.globalAlpha = 0.7 * fade * amul;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let q = Math.max(0, i - 4); q <= i; q++) { const pq = pos(st, q); if (q === Math.max(0, i - 4)) ctx.moveTo(pq[0], pq[1]); else ctx.lineTo(pq[0], pq[1]); }
      ctx.stroke();
      const rr = 1.4 + 2.6 * fade;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr * 2.6);
      g.addColorStop(0, `hsla(${h0}, ${sat}%, 95%, ${0.95 * fade * amul})`);
      g.addColorStop(1, `hsla(${h0}, ${sat}%, 70%, 0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p[0], p[1], rr * 2.6, 0, Math.PI * 2); ctx.fill();
    }

    // the bright knot
    const k = C[Math.round(b.pinch * M)];
    const kr = S * 0.16;
    const kg = ctx.createRadialGradient(k[0], k[1], 0, k[0], k[1], kr);
    kg.addColorStop(0, `hsla(${h0}, ${sat}%, 90%, ${0.42 * amul})`);
    kg.addColorStop(0.25, `hsla(${h0}, ${sat}%, 65%, ${0.16 * amul})`);
    kg.addColorStop(1, `hsla(${h1}, ${sat}%, 50%, 0)`);
    ctx.globalAlpha = 1;
    ctx.fillStyle = kg;
    ctx.beginPath(); ctx.arc(k[0], k[1], kr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* On the site the ribbons are fine silver strands with only a trace of the
   brand blue, at a fraction of their strength: texture, not decoration.
   (The product film draws them in full colour.) */
const DIM = 0.5;
const SAT = 28;

export default function FlowRibbons({ preset = 'hero', mobilePreset, accent = 'brand', intensity: level = 1, className, fade = true }) {
  const intensity = level * DIM;
  const host = useRef(null);
  const cv = useRef(null);
  useEffect(() => {
    const el = host.current, c = cv.current;
    if (!el || !c) return undefined;
    const ctx = c.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    let W = 0, H = 0, scene = null, raf = 0, visible = true, last = 0, t = 0;
    const pointer = [0, 0], target = [0, 0];
    const size = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, r.width < 700 ? 1.25 : 1.5);
      W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
      c.width = W; c.height = H;
      const p = r.width < 760 && mobilePreset ? mobilePreset : preset;
      scene = buildScene(PRESETS[p], accent);
      drawRibbons(ctx, W, H, t, scene, { intensity, sat: SAT });
    };
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      if (now - last < 1000 / 48) return; // ~48 fps is plenty for slow light
      last = now; t += dt * 1.0;
      pointer[0] += (target[0] - pointer[0]) * 0.04; pointer[1] += (target[1] - pointer[1]) * 0.04;
      drawRibbons(ctx, W, H, t, scene, { intensity, pointer, sat: SAT });
    };
    const ro = new ResizeObserver(size); ro.observe(el);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }); io.observe(el);
    const move = (e) => { target[0] = e.clientX / window.innerWidth - 0.5; target[1] = e.clientY / window.innerHeight - 0.5; };
    size();
    if (!reduce) {
      raf = requestAnimationFrame(frame);
      if (fine) window.addEventListener('pointermove', move, { passive: true });
    }
    c.style.opacity = '1';
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); window.removeEventListener('pointermove', move); };
  }, [preset, mobilePreset, accent, intensity]);
  return (
    <div ref={host} aria-hidden="true" className={cx('flow', fade && 'flow-fade', className)}>
      <canvas ref={cv} style={{ opacity: 0, transition: 'opacity 1.2s ease' }} />
    </div>
  );
}
