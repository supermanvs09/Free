import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Gl } from '../components/viz/kit.jsx';
import LAND from '../components/scenes/land.json';
import { loadGsap } from '../lib/nullmotion.jsx';

/* Continuous AI-SPM as one security-posture screen, laid out from the
   reference (Dribbble 'Cyntra', measured at 949 x 693): a dotted globe with a
   glowing rim, orbits and network lines, a bright security core at its centre,
   four figures around it, the posture score beneath and a traffic pill.
   Drawn on a 2D canvas with no shadowBlur in the frame loop: glows are
   pre-rendered sprites and everything that does not move (globe body, rim,
   core) is drawn once to off-screen layers, so each frame is cheap and
   smooth. Attacks arrive and are stopped at the globe's edge. The entrance
   and the figure swaps run on Null Motion's GSAP timings (blur reveal,
   power3 / back eases); the score counts up. Figures are illustrative.
   Pauses off screen; one still frame for reduced motion. */


/* icons drawn to match the reference */
const I = {
  car: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15.5v-3.2l1.8-4.1A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.8 1.2l1.8 4.1v3.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><path d="M4.5 12h15" /><circle cx="8" cy="14" r=".6" fill="currentColor" /><circle cx="16" cy="14" r=".6" fill="currentColor" /></svg>,
  gear: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.3 2.6h3.4l.5 2.6 1.6.7 2.2-1.5 2.4 2.4-1.5 2.2.7 1.6 2.6.5v3.4l-2.6.5-.7 1.6 1.5 2.2-2.4 2.4-2.2-1.5-1.6.7-.5 2.6h-3.4l-.5-2.6-1.6-.7-2.2 1.5-2.4-2.4 1.5-2.2-.7-1.6-2.6-.5v-3.4l2.6-.5.7-1.6-1.5-2.2 2.4-2.4 2.2 1.5 1.6-.7Z" /><circle cx="12" cy="12" r="3.2" fill="#0a1426" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  risk: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 4.5 5.4v5.8c0 4.6 3.1 8.6 7.5 10.3 4.4-1.7 7.5-5.7 7.5-10.3V5.4Z" /><path d="M12 7.5v5.2" stroke="#0a1426" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="16" r="1.25" fill="#0a1426" /></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3 5 5.7v5.5c0 4.3 2.9 8 7 9.6 4.1-1.6 7-5.3 7-9.6V5.7Z" /><circle cx="12" cy="11.5" r="2.2" fill="currentColor" stroke="none" /></svg>,
};

/* the four figures, as in the reference; each also names what it covers */
const SIDES = [
  { pos: 'l1', ic: 'car', v: '1,284', l: 'Assets', g: 'user', h: 'People', p: 'Employees, contractors and customers', to: '/adapid-ai' },
  { pos: 'l2', ic: 'gear', v: '18', l: 'Active Threats', g: 'key', h: 'Machine identities', p: 'Service accounts, cloud roles and keys', to: '/adapid-ai/nhi-security' },
  { pos: 'r1', ic: 'check', v: '97%', l: 'Protected', g: 'bot', h: 'AI agents', p: 'Agents, copilots and MCP servers', to: '/agentic-ai/agentic-identity' },
  { pos: 'r2', ic: 'risk', v: '1,284', l: 'High-Risk', g: 'db', h: 'Personal data', p: 'PII under the DPDP Act', to: '/dpdpa-compliance' },
];

/* ---------------------------------------------------------- the drawing */
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
// land dots, four per source point so the continents read as a fine pixel grid
const PTS = (() => {
  const a = [];
  for (let i = 0; i < LAND.length; i += 2) {
    const la = LAND[i] / 10, lo = LAND[i + 1] / 10;
    for (const [da, db] of [[-0.45, -0.45], [-0.45, 0.45], [0.45, -0.45], [0.45, 0.45]]) a.push([(la + da) * RAD, (lo + db) * RAD]);
  }
  return a;
})();
// network lines sweeping out of the globe, two each side (in globe radii): start, two controls, end
const TENDRILS = [
  [[-0.55, -0.1], [-0.84, -0.14], [-0.88, -0.6], [-1.2, -0.56]],
  [[-0.5, 0.38], [-0.84, 0.3], [-0.88, 0.72], [-1.2, 0.62]],
  [[0.5, -0.06], [0.82, -0.04], [0.84, -0.66], [1.14, -0.64]],
  [[0.46, 0.42], [0.8, 0.34], [0.88, 0.76], [1.16, 0.63]],
];
// nodes on the rim (degrees from east, clockwise) and amber risk nodes (globe radii)
const RIM = [-90, -140, -40, 0, 50, 90, 130, 180, 220];
const GOLD = [[-0.62, -0.3, 0], [0.26, 0.37, 1.6], [0.5, 0.56, 3.1]];
const bez = (p, t) => { const u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; };
const easeIn = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const layer = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function startGlobe(cv, { onHit, still }) {
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  let body, core;                       // static layers, redrawn only on resize
  const sprites = {};                   // glow sprites, one per colour
  const sprite = (rgb, core = '240,250,255') => {
    const key = rgb + core;
    if (sprites[key]) return sprites[key];
    const s = 64, c = layer(s, s), g = c.getContext('2d');
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, `rgba(${rgb},.85)`); gr.addColorStop(0.2, `rgba(${rgb},.32)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.fillStyle = `rgb(${core})`; g.beginPath(); g.arc(s / 2, s / 2, s * 0.11, 0, TAU); g.fill();
    return (sprites[key] = c);
  };
  // a glowing node: one drawImage of a pre-rendered sprite
  const node = (x, y, r, rgb, a = 1, coreC) => {
    const d = r * 6; ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.drawImage(sprite(rgb, coreC), x - d / 2, y - d / 2, d, d); ctx.globalAlpha = 1;
  };

  const paintBody = () => {
    const P = Math.ceil(R * 2.6), c = layer(P * dpr, P * dpr), g = c.getContext('2d'), o = P / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    let gr = g.createRadialGradient(o, o, R * 0.9, o, o, R * 1.3);
    gr.addColorStop(0, 'rgba(8,123,255,.14)'); gr.addColorStop(1, 'rgba(8,123,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, P, P);
    gr = g.createRadialGradient(o, o, 0, o, o, R);
    gr.addColorStop(0, '#020713'); gr.addColorStop(0.6, '#030e26'); gr.addColorStop(0.84, '#051c50'); gr.addColorStop(0.96, '#0a3c9e'); gr.addColorStop(1, '#1258cc');
    g.fillStyle = gr; g.beginPath(); g.arc(o, o, R, 0, TAU); g.fill();
    g.shadowColor = '#087bff'; g.shadowBlur = R * 0.05; g.strokeStyle = '#3a8fff'; g.lineWidth = Math.max(1.4, R * 0.007);
    g.beginPath(); g.arc(o, o, R, 0, TAU); g.stroke();
    body = { c, P };
  };
  const paintCore = () => {
    const P = Math.ceil(R * 1.2), c = layer(P * dpr, P * dpr), g = c.getContext('2d'), o = P / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ring = (r, w, col, blur = 0) => { g.shadowColor = col; g.shadowBlur = blur; g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(o, o, r, 0, TAU); g.stroke(); g.shadowBlur = 0; };
    let gr = g.createRadialGradient(o, o, R * 0.26, o, o, R * 0.56);
    gr.addColorStop(0, 'rgba(2,10,32,.92)'); gr.addColorStop(1, 'rgba(2,10,32,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(o, o, R * 0.56, 0, TAU); g.fill();
    ring(R * 0.47, Math.max(1.2, R * 0.006), 'rgba(80,160,255,.75)', R * 0.03);                       // faint outer ring
    ring(R * 0.33, Math.max(2, R * 0.016), '#2aa8ff', R * 0.06);        // the bright ring
    gr = g.createRadialGradient(o, o - R * 0.04, 0, o, o, R * 0.26);
    gr.addColorStop(0, '#0d58d0'); gr.addColorStop(0.75, '#0a3890'); gr.addColorStop(1, '#072866');
    g.fillStyle = gr; g.beginPath(); g.arc(o, o, R * 0.26, 0, TAU); g.fill();
    ring(R * 0.26, Math.max(1.2, R * 0.007), 'rgba(140,210,255,.85)');  // the disc's edge
    const s = R * 0.0034;
    g.save(); g.translate(o, o + R * 0.005); g.scale(s, s);
    g.shadowColor = 'rgba(200,230,255,.8)'; g.shadowBlur = 8; g.strokeStyle = '#f5f9ff'; g.lineWidth = 4.2; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(0, -30); g.lineTo(-24, -21); g.lineTo(-24, -2); g.bezierCurveTo(-24, 15, -12, 26, 0, 31); g.bezierCurveTo(12, 26, 24, 15, 24, -2); g.lineTo(24, -21); g.closePath(); g.stroke();
    g.fillStyle = '#f5f9ff'; g.beginPath(); g.arc(0, -1, 7, 0, TAU); g.fill();
    g.restore();
    core = { c, P };
  };
  const size = () => {
    const b = cv.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = W / H > 1.2;
    cx = W / 2; cy = H * (wide ? 0.49 : 0.5); R = wide ? H * 0.27 : Math.min(W, H) * 0.31;
    if (R > 2) { paintBody(); paintCore(); }
  };
  const TILT = 0.32, ct = Math.cos(TILT), st = Math.sin(TILT);
  const proj = (lat, lon, rot) => {
    const x = Math.cos(lat) * Math.sin(lon + rot), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon + rot);
    return [x, y * ct - z * st, y * st + z * ct];
  };
  const BLUE = '40,140,255', CYAN = '90,200,255', GOLDC = '255,170,30';
  const attacks = [], ripples = [];
  const intro = { v: still ? 1 : 0 };   // 0..1, tweened by GSAP on entrance
  let T = 0, rot = -0.4, nextAtk = 2.2;

  const draw = () => {
    if (!body || R <= 2) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    const k = intro.v, sc = 0.9 + 0.1 * k;
    ctx.save(); ctx.globalAlpha = k;
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    ctx.drawImage(body.c, cx - body.P / 2, cy - body.P / 2, body.P, body.P);
    ctx.globalCompositeOperation = 'lighter';
    // continents: a pixel grid, brighter towards the rim
    const ds = Math.max(1, R * 0.0072);
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = ['rgba(70,150,255,.5)', 'rgba(85,160,255,.62)', 'rgba(120,190,255,.75)'][b];
      ctx.beginPath();
      for (const [la, lo] of PTS) {
        const [x, y, z] = proj(la, lo, rot);
        if (z < 0.04) continue;
        const band = z > 0.75 ? 0 : z > 0.4 ? 1 : 2;
        if (band !== b) continue;
        const w = ds * (0.5 + 0.5 * z);
        ctx.rect(cx + x * R - w / 2, cy - y * R - ds / 2, w, ds);
      }
      ctx.fill();
    }
    // two orbits, nodes gliding along them
    [[1.4, 0.5, 0.14, 0.55, 0.06], [1.3, 0.62, -0.3, 0.42, -0.045]].forEach(([rx, ry, a, al, sp], j) => {
      ctx.strokeStyle = `rgba(${BLUE},${al})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(cx, cy, R * rx, R * ry, a, 0, TAU); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const t = (i / 4) * TAU + T * sp + j, ex = Math.cos(t) * R * rx, ey = Math.sin(t) * R * ry;
        node(cx + ex * Math.cos(a) - ey * Math.sin(a), cy + ex * Math.sin(a) + ey * Math.cos(a), R * 0.018, CYAN, 0.9);
      }
    });
    // network lines, a light running along each
    TENDRILS.forEach((p, i) => {
      const Pp = p.map(([x, y]) => [cx + x * R, cy + y * R]);
      const lg = ctx.createLinearGradient(Pp[0][0], Pp[0][1], Pp[3][0], Pp[3][1]);
      lg.addColorStop(0, 'rgba(90,170,255,.05)'); lg.addColorStop(0.5, 'rgba(110,185,255,.75)'); lg.addColorStop(1, 'rgba(170,220,255,.95)');
      ctx.strokeStyle = lg; ctx.lineWidth = Math.max(1.2, R * 0.007); ctx.beginPath(); ctx.moveTo(...Pp[0]); ctx.bezierCurveTo(...Pp[1], ...Pp[2], ...Pp[3]); ctx.stroke();
      node(Pp[3][0], Pp[3][1], R * 0.026, CYAN, 1);
      const t = (T * 0.16 + i * 0.25) % 1, [px, py] = bez(Pp, easeOut(t));
      node(px, py, R * 0.009, '200,235,255', Math.sin(t * Math.PI));
    });
    RIM.forEach((d, i) => node(cx + Math.cos(d * RAD) * R, cy + Math.sin(d * RAD) * R, R * 0.022, CYAN, 0.85 + 0.15 * Math.sin(T * 1.2 + i)));
    ctx.globalCompositeOperation = 'source-over';   // amber stays amber: not washed out by additive light
    for (const [x, y, ph] of GOLD) node(cx + x * R, cy + y * R, R * 0.026, GOLDC, 0.8 + 0.2 * Math.sin(T * 1.4 + ph), '255,200,90');
    // the core: static layer, plus two arcs turning on its outer ring
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(core.c, cx - core.P / 2, cy - core.P / 2, core.P, core.P);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(140,215,255,.75)'; ctx.lineWidth = Math.max(1.6, R * 0.009); ctx.lineCap = 'round';
    for (let j = 0; j < 2; j++) { const a = T * 0.35 + j * Math.PI; ctx.beginPath(); ctx.arc(cx, cy, R * 0.47, a, a + 0.42); ctx.stroke(); }
    ctx.lineCap = 'butt';
    // attacks: they accelerate in, and are stopped at the rim
    for (const a of attacks) {
      const e = easeIn(a.t), r = R * (1.9 - 0.86 * e), x = cx + Math.cos(a.ang) * r, y = cy + Math.sin(a.ang) * r;
      const tr = r + R * (0.08 + 0.3 * e), tx = cx + Math.cos(a.ang) * tr, ty = cy + Math.sin(a.ang) * tr;
      const lg = ctx.createLinearGradient(tx, ty, x, y); lg.addColorStop(0, 'rgba(255,120,90,0)'); lg.addColorStop(1, 'rgba(255,120,90,.8)');
      ctx.strokeStyle = lg; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      node(x, y, R * 0.011, '255,120,90', Math.min(1, a.t * 5));
    }
    for (const rp of ripples) {
      const e = easeOut(rp.t);
      ctx.strokeStyle = `rgba(${CYAN},${0.8 * (1 - e)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, R * (0.02 + e * 0.12), 0, TAU); ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  };

  const step = (dt) => {
    T += dt; rot += dt * 0.05;
    nextAtk -= dt;
    if (nextAtk <= 0) { attacks.push({ ang: Math.random() * TAU, t: 0, sp: 0.5 + Math.random() * 0.15 }); nextAtk = 2.8 + Math.random() * 1.8; }
    for (let i = attacks.length - 1; i >= 0; i--) {
      const a = attacks[i]; a.t += dt * a.sp;
      if (a.t >= 1) { ripples.push({ x: cx + Math.cos(a.ang) * R * 1.04, y: cy + Math.sin(a.ang) * R * 1.04, t: 0 }); attacks.splice(i, 1); onHit?.(); }
    }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt * 0.9; if (ripples[i].t >= 1) ripples.splice(i, 1); }
  };

  size();
  let raf = 0, last = 0, on = false;
  const frame = (now) => { raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; step(dt); draw(); };
  const ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(cv);
  draw();
  return {
    intro,
    start() { if (!on && !still) { on = true; last = 0; raf = requestAnimationFrame(frame); } },
    stop() { on = false; cancelAnimationFrame(raf); },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

/* ---------------------------------------------------------- the panel */
function Side({ x }) {
  return (
    <Link to={x.to} className={`gx-m gx-${x.pos}`}>
      <span className="gx-flip">
        <span className="gx-ct gx-num on"><b>{x.v}</b><small>{x.l}</small></span>
        <span className="gx-ct" aria-hidden="true"><b>{x.h}</b><small>{x.p}</small></span>
      </span>
      <span className="gx-ic">
        <span className="gx-ig on">{I[x.ic]}</span>
        <span className="gx-ig"><Gl g={x.g} /></span>
      </span>
    </Link>
  );
}

export default function AispmGlobe() {
  const root = useRef(null), canvas = useRef(null), pill = useRef(null), score = useRef(null);
  useEffect(() => {
    const el = root.current; if (!el) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // below the fold: hold the text back now, so nothing flashes before the entrance plays
    if (!still && el.getBoundingClientRect().top > window.innerHeight * 0.9) el.classList.add('nm-pre');
    // each blocked attack makes the traffic pill glow once
    const onHit = () => { const p = pill.current; if (!p) return; p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); };
    const g = startGlobe(canvas.current, { onHit, still });
    let gsap, swap, intro, played = false, alt = false, killed = false;

    // Null Motion: the figures swap with a blur-out (power3.in) and a blur-in that settles (power3.out, back.out)
    const flip = () => {
      if (killed) return;
      const faces = [...el.querySelectorAll('.gx-flip')].map((f) => f.children);
      const icons = [...el.querySelectorAll('.gx-ic')].map((f) => f.children);
      const from = alt ? 1 : 0, to = alt ? 0 : 1;
      alt = !alt;
      swap = gsap.timeline({ onComplete: () => { swap = gsap.delayedCall(5.2, flip); } });
      swap.to(faces.map((f) => f[from]), { opacity: 0, y: -10, filter: 'blur(6px)', duration: 0.34, ease: 'power3.in', stagger: 0.06 })
        .to(icons.map((f) => f[from]), { opacity: 0, scale: 0.7, duration: 0.3, ease: 'power3.in', stagger: 0.06 }, 0)
        .fromTo(faces.map((f) => f[to]), { opacity: 0, y: 12, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out', stagger: 0.06 }, 0.36)
        .fromTo(icons.map((f) => f[to]), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.7)', stagger: 0.06 }, 0.36);
      faces.forEach((f) => { f[from].setAttribute('aria-hidden', 'true'); f[to].removeAttribute('aria-hidden'); });
    };
    // Null Motion entrance: the globe grows in, the screen's text sharpens into place, the score counts up
    const enter = () => {
      if (played || killed) return; played = true;
      const n = { v: 0 };
      el.classList.remove('nm-pre');
      intro = gsap.timeline()
        .to(g.intro, { v: 1, duration: 1.4, ease: 'power3.out' }, 0)
        .fromTo(el.querySelectorAll('.gx-head, .gx-live, .gx-m, .gx-score, .gx-pill'), { opacity: 0, y: 14, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'power4.out', stagger: 0.07, clearProps: 'filter,transform' }, 0.25)
        .to(n, { v: 92, duration: 1.6, ease: 'power3.out', onUpdate: () => { if (score.current) score.current.textContent = Math.round(n.v); } }, 0.5);
      swap = gsap.delayedCall(5.5, flip);
    };
    let io;
    if (still) g.start();
    else {
      g.intro.v = 0;
      io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { g.start(); if (gsap) enter(); else loadGsap().then((m) => { gsap = m; enter(); }); } else g.stop();
      }, { threshold: 0.15 });
      io.observe(el);
    }
    return () => { killed = true; io?.disconnect(); intro?.kill(); swap?.kill(); g.destroy(); };
  }, []);

  return (
    <figure ref={root} className="gx" aria-label="Security posture of a sample environment: a globe with a security core at its centre. Attacks such as stolen credentials, phishing, MFA fatigue, compromised sessions, deepfake voices, prompt injection and hijacked AI agents arrive and are blocked at its edge. 1,284 assets, 18 active threats, 97% protected, 1,284 high-risk, posture score 92 out of 100, strong.">
      <canvas ref={canvas} className="gx-cv" aria-hidden="true" />
      <div className="gx-head" aria-hidden="true">
        <span className="gx-emb">{I.shield}</span>
        <span><b>Security Posture</b><small>Real-Time Visibility Across Your Global Environment</small></span>
      </div>
      <span className="gx-live" aria-hidden="true"><i />Live Environment</span>
      {SIDES.map((x) => <Side key={x.pos} x={x} />)}
      <div className="gx-score" aria-hidden="true"><p><b ref={score}>92</b><span>/100</span></p><small>Strong</small></div>
      <span ref={pill} className="gx-pill" aria-hidden="true">Suspicious Traffic<em>US-East-1</em></span>
    </figure>
  );
}
