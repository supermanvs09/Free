import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Gl } from '../components/viz/kit.jsx';
import LAND from '../components/scenes/land.json';

/* Continuous AI-SPM as one security-posture screen, laid out from the
   reference (Dribbble 'Cyntra', measured at 949 x 693): a dotted globe with a
   glowing rim, orbits and network lines, a bright security core at its centre,
   four figures around it, the posture score beneath, a traffic pill and three
   map controls. Drawn on a 2D canvas, no library. Attacks arrive and are
   stopped at the globe's edge. The four figures turn, now and then, into the
   kinds of identity they stand for. Figures are illustrative. Pauses off
   screen; one still frame for reduced motion. */

const THREATS = ['Stolen credentials', 'Phishing', 'MFA fatigue', 'Compromised session', 'Deepfake voice', 'Prompt injection', 'Hijacked AI agent', 'Credential stuffing'];

/* icons drawn to match the reference */
const I = {
  car: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15.5v-3.2l1.8-4.1A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.8 1.2l1.8 4.1v3.2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><path d="M4.5 12h15" /><circle cx="8" cy="14" r=".6" fill="currentColor" /><circle cx="16" cy="14" r=".6" fill="currentColor" /></svg>,
  gear: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.3 2.6h3.4l.5 2.6 1.6.7 2.2-1.5 2.4 2.4-1.5 2.2.7 1.6 2.6.5v3.4l-2.6.5-.7 1.6 1.5 2.2-2.4 2.4-2.2-1.5-1.6.7-.5 2.6h-3.4l-.5-2.6-1.6-.7-2.2 1.5-2.4-2.4 1.5-2.2-.7-1.6-2.6-.5v-3.4l2.6-.5.7-1.6-1.5-2.2 2.4-2.4 2.2 1.5 1.6-.7Z" /><circle cx="12" cy="12" r="3.2" fill="#0a1426" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  risk: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5 4.5 5.4v5.8c0 4.6 3.1 8.6 7.5 10.3 4.4-1.7 7.5-5.7 7.5-10.3V5.4Z" /><path d="M12 7.5v5.2" stroke="#0a1426" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="16" r="1.25" fill="#0a1426" /></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3 5 5.7v5.5c0 4.3 2.9 8 7 9.6 4.1-1.6 7-5.3 7-9.6V5.7Z" /><circle cx="12" cy="11.5" r="2.2" fill="currentColor" stroke="none" /></svg>,
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>,
  minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 12h12" /></svg>,
  scan: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" /><circle cx="12" cy="12" r="2.6" /></svg>,
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
// network lines sweeping out of the globe (in globe radii): start, two controls, end
const TENDRILS = [
  [[-0.55, -0.12], [-0.82, -0.16], [-0.86, -0.6], [-1.18, -0.56]],
  [[-0.62, 0.2], [-0.98, 0.26], [-1.1, -0.04], [-1.42, 0.04]],
  [[-0.5, 0.4], [-0.82, 0.3], [-0.86, 0.72], [-1.17, 0.62]],
  [[0.5, -0.06], [0.82, -0.04], [0.82, -0.66], [1.08, -0.64]],
  [[0.56, 0.3], [0.88, 0.36], [0.86, 0.06], [1.24, 0.16]],
  [[0.46, 0.44], [0.78, 0.36], [0.86, 0.76], [1.12, 0.63]],
];
// lines across the face of the globe, quadratic: from, via, to
const ARCS = [
  [[-0.88, -0.3], [-0.5, -0.62], [0.0, -0.98]],
  [[-0.9, 0.36], [-0.45, 0.62], [0.1, 0.58]],
  [[0.2, -0.86], [0.66, -0.55], [0.86, -0.32]],
  [[0.36, 0.42], [0.72, 0.5], [0.96, 0.22]],
  [[-0.62, -0.32], [-0.3, -0.2], [-0.35, 0.36]],
];
// nodes on the rim (degrees from east, clockwise) and amber risk nodes (globe radii)
const RIM = [-90, -128, -52, -18, 14, 44, 64, 86, 104, 122, 150, 196, 216];
const GOLD = [[-0.65, -0.31, 0], [0.24, 0.37, 1.4], [0.52, 0.57, 2.6], [0.38, 0.36, 3.7]];
const bez = (p, t) => { const u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; };

function startGlobe(cv, { onHit, still }) {
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R0 = 0, R = 0;
  const size = () => {
    const b = cv.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wide = W / H > 1.2;
    cx = W / 2; cy = H * (wide ? 0.49 : 0.5); R0 = wide ? H * 0.27 : Math.min(W, H) * 0.31;
  };
  const TILT = 0.32, ct = Math.cos(TILT), st = Math.sin(TILT);
  const proj = (lat, lon, rot) => {
    const x = Math.cos(lat) * Math.sin(lon + rot), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon + rot);
    return [x, y * ct - z * st, y * st + z * ct];
  };
  // a glowing node: soft halo, bright centre
  const node = (x, y, r, rgb, a = 1, core = '240,250,255') => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.2);
    g.addColorStop(0, `rgba(${rgb},${0.9 * a})`); g.addColorStop(0.25, `rgba(${rgb},${0.35 * a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4.2, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(${core},${a})`; ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, TAU); ctx.fill();
  };
  const ring = (r, w, c, blur = 0) => { ctx.shadowColor = c; ctx.shadowBlur = blur; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0; };
  const BLUE = '40,140,255', CYAN = '90,210,255', GOLDC = '255,170,30';
  const attacks = [], ripples = [];
  let T = 0, rot = -0.4, nextAtk = 1.4, ti = 0, zoom = 1, zoomTo = 1, scan = -1;

  const draw = () => {
    R = R0 * zoom;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    // light around the globe
    let g = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.75);
    g.addColorStop(0, 'rgba(8,123,255,.32)'); g.addColorStop(0.4, 'rgba(8,123,255,.1)'); g.addColorStop(1, 'rgba(8,123,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // the sphere: near black in the middle, electric blue at the rim
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, '#020713'); g.addColorStop(0.55, '#030f2a'); g.addColorStop(0.8, '#051f58'); g.addColorStop(0.94, '#0a44b4'); g.addColorStop(1, '#1670f0');
    ctx.shadowColor = '#087bff'; ctx.shadowBlur = R * 0.2; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = 'lighter';
    // continents: a pixel grid, brighter towards the rim where the light is
    const ds = Math.max(1, R * 0.0072);
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = ['rgba(80,160,255,.62)', 'rgba(90,170,255,.7)', 'rgba(140,205,255,.9)'][b];
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
    // lines across the face
    ctx.lineWidth = 1;
    for (const [a, v, c] of ARCS) {
      ctx.strokeStyle = 'rgba(90,170,255,.38)'; ctx.beginPath(); ctx.moveTo(cx + a[0] * R, cy + a[1] * R); ctx.quadraticCurveTo(cx + v[0] * R, cy + v[1] * R, cx + c[0] * R, cy + c[1] * R); ctx.stroke();
    }
    // the rim
    ctx.globalCompositeOperation = 'source-over';
    ring(R, Math.max(1.6, R * 0.009), '#3d9dff', R * 0.09);
    ring(R * 0.985, 1, 'rgba(0,207,255,.35)');
    ctx.globalCompositeOperation = 'lighter';
    // orbits: wide tilted ellipses through the globe, and an outer ring
    const ORB = [[1.4, 0.5, 0.14, 0.55, 0.11], [1.3, 0.64, -0.3, 0.42, -0.08], [1.12, 1.12, 0, 0.18, 0.04]];
    ORB.forEach(([rx, ry, a, al, sp], k) => {
      ctx.strokeStyle = `rgba(${BLUE},${al})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, cy, R * rx, R * ry, a, 0, TAU); ctx.stroke();
      const at = (t) => { const ex = Math.cos(t) * R * rx, ey = Math.sin(t) * R * ry; return [cx + ex * Math.cos(a) - ey * Math.sin(a), cy + ex * Math.sin(a) + ey * Math.cos(a)]; };
      const n = k === 2 ? 8 : 5;
      for (let i = 0; i < n; i++) { const [x, y] = at((i / n) * TAU + T * sp + k); node(x, y, R * 0.012, CYAN, k === 2 ? 0.55 : 0.85); }
    });
    // network lines sweeping out, a light running along each
    TENDRILS.forEach((p, i) => {
      const P = p.map(([x, y]) => [cx + x * R, cy + y * R]);
      const lg = ctx.createLinearGradient(P[0][0], P[0][1], P[3][0], P[3][1]);
      lg.addColorStop(0, 'rgba(90,170,255,.1)'); lg.addColorStop(0.45, 'rgba(120,190,255,.75)'); lg.addColorStop(1, 'rgba(180,225,255,.95)');
      ctx.strokeStyle = lg; ctx.lineWidth = Math.max(1.2, R * 0.0075); ctx.beginPath(); ctx.moveTo(...P[0]); ctx.bezierCurveTo(...P[1], ...P[2], ...P[3]); ctx.stroke();
      node(P[3][0], P[3][1], R * 0.02, CYAN);
      const t = (T * 0.2 + i * 0.19) % 1; const [px, py] = bez(P, t);
      node(px, py, R * 0.01, '200,235,255', Math.sin(t * Math.PI));
    });
    // nodes on the rim
    RIM.forEach((d, i) => node(cx + Math.cos(d * RAD) * R, cy + Math.sin(d * RAD) * R, R * (i % 3 ? 0.015 : 0.02), CYAN, 0.75 + 0.25 * Math.sin(T * 1.6 + i)));
    // amber: activity under watch
    for (const [x, y, ph] of GOLD) node(cx + x * R, cy + y * R, R * 0.022, GOLDC, 0.75 + 0.25 * Math.abs(Math.sin(T * 1.1 + ph)), '255,226,150');

    // the security core
    ctx.globalCompositeOperation = 'source-over';
    g = ctx.createRadialGradient(cx, cy, R * 0.28, cx, cy, R * 0.66);
    g.addColorStop(0, 'rgba(2,10,32,.95)'); g.addColorStop(0.6, 'rgba(3,16,48,.75)'); g.addColorStop(1, 'rgba(3,16,48,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.66, 0, TAU); ctx.fill();
    ring(R * 0.62, 1, 'rgba(90,170,255,.4)');
    ring(R * 0.47, Math.max(1.4, R * 0.008), '#2f8cff', R * 0.1);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2 + T * 0.12; node(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.012, CYAN, 0.8); }
    // two short arcs turning on the middle ring
    ctx.strokeStyle = 'rgba(150,225,255,.9)'; ctx.lineWidth = Math.max(2, R * 0.012); ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) { const a = T * 0.5 + k * Math.PI; ctx.beginPath(); ctx.arc(cx, cy, R * 0.47, a, a + 0.5); ctx.stroke(); }
    ctx.lineCap = 'butt';
    // a pulse leaving the core
    const pr = (T * 0.32) % 1; ctx.strokeStyle = `rgba(${CYAN},${0.55 * (1 - pr)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R * (0.34 + pr * 0.3), 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ring(R * 0.4, 1, 'rgba(90,190,255,.35)');
    ring(R * 0.33, Math.max(2.4, R * 0.022), '#22b0ff', R * 0.16);
    g = ctx.createRadialGradient(cx, cy - R * 0.04, 0, cx, cy, R * 0.27);
    g.addColorStop(0, '#0f63e6'); g.addColorStop(0.7, '#0a3c9e'); g.addColorStop(1, '#072a74');
    ctx.shadowColor = '#087bff'; ctx.shadowBlur = R * 0.14; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.27, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    ring(R * 0.27, Math.max(1.4, R * 0.009), '#7fd0ff', R * 0.05);
    ring(R * 0.205, 1.2, 'rgba(170,225,255,.55)');
    // the shield, with a dot inside
    const s = R * 0.0036;
    ctx.save(); ctx.translate(cx, cy + R * 0.005); ctx.scale(s, s);
    ctx.shadowColor = '#cfeaff'; ctx.shadowBlur = 16; ctx.strokeStyle = '#f5f9ff'; ctx.lineWidth = 4.2; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-24, -21); ctx.lineTo(-24, -2); ctx.bezierCurveTo(-24, 15, -12, 26, 0, 31); ctx.bezierCurveTo(12, 26, 24, 15, 24, -2); ctx.lineTo(24, -21); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#f5f9ff'; ctx.beginPath(); ctx.arc(0, -1, 7, 0, TAU); ctx.fill();
    ctx.restore(); ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = 'lighter';
    // a scan sweep, when asked for
    if (scan >= 0 && ctx.createConicGradient) {
      const a0 = -Math.PI / 2 + scan * TAU;
      const cg = ctx.createConicGradient(a0 - 0.9, cx, cy);
      cg.addColorStop(0, 'rgba(0,207,255,0)'); cg.addColorStop(0.143, 'rgba(0,207,255,.28)'); cg.addColorStop(0.144, 'rgba(0,207,255,0)'); cg.addColorStop(1, 'rgba(0,207,255,0)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, TAU); ctx.fill();
    }
    // attacks, stopped at the edge
    for (const a of attacks) {
      const r = R * (1.95 - 0.83 * a.t), x = cx + Math.cos(a.ang) * r, y = cy + Math.sin(a.ang) * r;
      const tr = Math.min(R * 2.1, r + R * 0.32), tx = cx + Math.cos(a.ang) * tr, ty = cy + Math.sin(a.ang) * tr;
      const lg = ctx.createLinearGradient(tx, ty, x, y); lg.addColorStop(0, 'rgba(255,120,90,0)'); lg.addColorStop(1, 'rgba(255,120,90,.85)');
      ctx.strokeStyle = lg; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      node(x, y, R * 0.013, '255,120,90', Math.min(1, a.t * 4));
    }
    for (const rp of ripples) {
      ctx.strokeStyle = `rgba(${CYAN},${0.9 * (1 - rp.t)})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, R * (0.02 + rp.t * 0.16), 0, TAU); ctx.stroke();
      node(rp.x, rp.y, R * 0.018, CYAN, 1 - rp.t);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const step = (dt) => {
    T += dt; rot += dt * 0.06;
    zoom += (zoomTo - zoom) * Math.min(1, dt * 6);
    if (scan >= 0) { scan += dt * 0.5; if (scan >= 1) scan = -1; }
    nextAtk -= dt;
    if (nextAtk <= 0) { attacks.push({ ang: Math.random() * TAU, t: 0, sp: 0.45 + Math.random() * 0.2, name: THREATS[ti++ % THREATS.length] }); nextAtk = 2.4 + Math.random() * 1.6; }
    for (let i = attacks.length - 1; i >= 0; i--) {
      const a = attacks[i]; a.t += dt * a.sp;
      if (a.t >= 1) { ripples.push({ x: cx + Math.cos(a.ang) * R * 1.12, y: cy + Math.sin(a.ang) * R * 1.12, t: 0 }); attacks.splice(i, 1); onHit?.(a.name); }
    }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt * 1.2; if (ripples[i].t >= 1) ripples.splice(i, 1); }
  };

  size();
  let raf = 0, last = 0, on = false;
  const frame = (now) => { raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; step(dt); draw(); };
  const ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(cv);
  draw();
  const settle = () => { if (still || !on) { zoom = zoomTo; draw(); } };
  return {
    start() { if (!on && !still) { on = true; last = 0; raf = requestAnimationFrame(frame); } },
    stop() { on = false; cancelAnimationFrame(raf); },
    zoom(d) { zoomTo = Math.min(1.25, Math.max(0.8, zoomTo + d)); settle(); },
    scan() { if (still) return; scan = 0; zoomTo = 1; },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

/* ---------------------------------------------------------- the panel */
function Side({ x, alt }) {
  return (
    <Link to={x.to} className={`gx-m gx-${x.pos}`}>
      <span className="gx-flip">
        <span className={`gx-ct gx-num${alt ? '' : ' on'}`} aria-hidden={alt || undefined}><b>{x.v}</b><small>{x.l}</small></span>
        <span className={`gx-ct${alt ? ' on' : ''}`} aria-hidden={!alt || undefined}><b>{x.h}</b><small>{x.p}</small></span>
      </span>
      <span className="gx-ic">
        <span className={`gx-ig${alt ? '' : ' on'}`}>{I[x.ic]}</span>
        <span className={`gx-ig${alt ? ' on' : ''}`}><Gl g={x.g} /></span>
      </span>
    </Link>
  );
}

export default function AispmGlobe() {
  const stage = useRef(null), canvas = useRef(null), api = useRef(null), pill = useRef(null);
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    const el = stage.current; if (!el) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // each blocked attack makes the traffic pill blink once
    const onHit = () => { const p = pill.current; if (!p) return; p.classList.remove('hit'); void p.offsetWidth; p.classList.add('hit'); };
    const g = startGlobe(canvas.current, { onHit, still });
    api.current = g;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? g.start() : g.stop()), { threshold: 0.05 });
    io.observe(el);
    // the figures turn, now and then, into the identities they stand for
    const t = still ? 0 : setInterval(() => setAlt((v) => !v), 5200);
    return () => { io.disconnect(); clearInterval(t); g.destroy(); };
  }, []);

  return (
    <figure ref={stage} className="gx" aria-label="Security posture of a sample environment: a globe with a security core at its centre. Attacks such as stolen credentials, phishing, MFA fatigue, compromised sessions, deepfake voices, prompt injection and hijacked AI agents arrive and are blocked at its edge. 1,284 assets, 18 active threats, 97% protected, 1,284 high-risk, posture score 92 out of 100, strong.">
      <canvas ref={canvas} className="gx-cv" aria-hidden="true" />
      <div className="gx-head" aria-hidden="true">
        <span className="gx-emb">{I.shield}</span>
        <span><b>Security Posture</b><small>Real-Time Visibility Across Your Global Environment</small></span>
      </div>
      <span className="gx-live" aria-hidden="true"><i />Live Environment</span>
      {SIDES.map((x) => <Side key={x.pos} x={x} alt={alt} />)}
      <div className="gx-score" aria-hidden="true"><p><b>92</b><span>/100</span></p><small>Strong</small></div>
      <span ref={pill} className="gx-pill" aria-hidden="true">Suspicious Traffic<em>EU-West-2</em></span>
      <div className="gx-ctl">
        <button type="button" aria-label="Zoom in" onClick={() => api.current?.zoom(0.12)}>{I.plus}</button>
        <button type="button" aria-label="Zoom out" onClick={() => api.current?.zoom(-0.12)}>{I.minus}</button>
        <button type="button" aria-label="Scan the environment" onClick={() => api.current?.scan()}>{I.scan}</button>
      </div>
    </figure>
  );
}
