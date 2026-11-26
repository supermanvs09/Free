import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Gl } from '../components/viz/kit.jsx';
import LAND from '../components/scenes/land.json';

/* Continuous AI-SPM, as one living picture (2D canvas, no library): the
   digital ecosystem as a dim, dotted globe with a bright security core,
   network lines reaching out from it, and attacks that are stopped at its
   edge. The four sides alternate between the kinds of identity we secure and
   what a protected environment looks like (sample figures), so the reader
   sees both what is covered and that it is covered. Pauses off screen; one
   still frame for reduced motion. */

const THREATS = ['Stolen credentials', 'Phishing', 'MFA fatigue', 'Compromised session', 'Deepfake voice', 'Prompt injection', 'Hijacked AI agent', 'Credential stuffing'];
const SIDES = [
  { g: 'user', h: 'People', p: 'Employees, contractors and customers', by: 'adapID AI', to: '/adapid-ai', v: '58,432', l: 'Identities monitored' },
  { g: 'key', h: 'Machine identities', p: 'Service accounts, cloud roles and keys', by: 'adapID AI', to: '/adapid-ai/nhi-security', v: 'live', l: 'Threats blocked today' },
  { g: 'bot', h: 'AI agents', p: 'Agents, copilots and MCP servers', by: 'Zenstra AI', to: '/agentic-ai/agentic-identity', v: '97%', l: 'Protected' },
  { g: 'db', h: 'Personal data', p: 'PII under the DPDP Act', by: 'ICMS', to: '/dpdpa-compliance', v: '1,104', l: 'AI agents governed' },
];
const Check = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const START_BLOCKED = 18;

/* ---------------------------------------------------------- the drawing */
const TAU = Math.PI * 2;
const PTS = (() => { const a = []; for (let i = 0; i < LAND.length; i += 2) a.push([(LAND[i] / 10) * Math.PI / 180, (LAND[i + 1] / 10) * Math.PI / 180]); return a; })();
// surface nodes that turn with the globe [lat, lon, orange]
const SURF = [[38, -20, 0], [10, 25, 1], [-18, 10, 0], [28, 70, 0], [-30, 55, 1], [52, 40, 0], [-5, -60, 0], [20, 120, 0], [-40, -20, 0], [45, -90, 1]].map(([a, b, o]) => [a * Math.PI / 180, b * Math.PI / 180, o]);
// network lines that sweep out of the globe, in globe radii from the centre: start, two controls, end
const TENDRILS = [
  [[-0.38, -0.22], [-0.78, -0.05], [-0.92, -0.62], [-1.26, -0.6]],
  [[0.32, -0.28], [0.72, -0.12], [0.98, -0.78], [1.24, -0.74]],
  [[-0.42, 0.3], [-0.82, 0.1], [-0.98, 0.62], [-1.26, 0.66]],
  [[0.38, 0.28], [0.82, 0.16], [1.0, 0.62], [1.28, 0.64]],
  [[-0.12, -0.58], [-0.45, -0.78], [-0.72, -0.95], [-0.92, -0.86]],
  [[0.18, 0.6], [0.55, 0.72], [0.82, 0.55], [1.02, 0.36]],
];
const bez = (p, t) => { const u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; };

function startGlobe(cv, { onHit, still }) {
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, R = 0;
  const size = () => {
    const b = cv.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); cx = W / 2; cy = H / 2; R = Math.min(W, H) * (W < 520 ? 0.37 : 0.34);
  };
  const TILT = 0.38, ct = Math.cos(TILT), st = Math.sin(TILT);
  const proj = (lat, lon, rot) => {
    const x = Math.cos(lat) * Math.sin(lon + rot), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon + rot);
    return [x, y * ct - z * st, y * st + z * ct];
  };
  const glow = (c, b) => { ctx.shadowColor = c; ctx.shadowBlur = b; };
  const dot = (x, y, r, c, b = 10) => { glow(c, b); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const attacks = [], ripples = [];
  let T = 0, rot = -0.6, nextAtk = 1.2, ti = 0;

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    ctx.shadowBlur = 0;
    // soft halo behind
    let g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.7);
    g.addColorStop(0, 'rgba(30,90,220,.22)'); g.addColorStop(1, 'rgba(30,90,220,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // the sphere: navy, lit blue towards the rim
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, '#06112c'); g.addColorStop(0.62, '#0a1d4a'); g.addColorStop(0.9, '#123a8c'); g.addColorStop(1, '#1f5ad0');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    // continents, dotted, dim; brighter towards the edge
    const ds = Math.max(1.5, R / 118);
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = ['rgba(60,130,255,.62)', 'rgba(80,150,255,.78)', 'rgba(120,180,255,.9)'][b];
      for (const [la, lo] of PTS) {
        const [x, y, z] = proj(la, lo, rot);
        if (z < 0.02) continue;
        const band = z > 0.7 ? 0 : z > 0.35 ? 1 : 2;
        if (band !== b) continue;
        ctx.fillRect(cx + x * R - ds / 2, cy - y * R - ds / 2, ds, ds);
      }
    }
    // the rim: a bright edge and a thin ring just outside it, with nodes
    glow('#2f7dff', 22); ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(77,163,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, TAU); ctx.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + T * 0.05; dot(cx + Math.cos(a) * R * 1.08, cy + Math.sin(a) * R * 1.08, 2.4, '#bfe2ff', 12); }
    // two thin orbits
    ctx.shadowBlur = 0; ctx.lineWidth = 1;
    [[1.3, 0.38, -0.32, 0.5], [1.22, 0.3, 0.42, 0.38]].forEach(([rx, ry, a, al], k) => {
      ctx.strokeStyle = `rgba(63,134,255,${al})`; ctx.beginPath(); ctx.ellipse(cx, cy, R * rx, R * ry, a, 0, TAU); ctx.stroke();
      const t = T * (k ? -0.35 : 0.28) + k * 2;
      const ex = Math.cos(t) * R * rx, ey = Math.sin(t) * R * ry;
      dot(cx + ex * Math.cos(a) - ey * Math.sin(a), cy + ex * Math.sin(a) + ey * Math.cos(a), 2.6, k ? '#ffb347' : '#cfe8ff', 14);
    });
    // surface nodes, turning with the globe
    for (const [la, lo, o] of SURF) { const [x, y, z] = proj(la, lo, rot); if (z > 0.15) dot(cx + x * R, cy - y * R, 2.3 * (0.6 + z * 0.4), o ? '#ffb347' : '#9fd2ff', 12); }
    // network lines sweeping out, a light travelling along each
    TENDRILS.forEach((p, i) => {
      const P = p.map(([x, y]) => [cx + x * R, cy + y * R]);
      const lg = ctx.createLinearGradient(P[0][0], P[0][1], P[3][0], P[3][1]);
      lg.addColorStop(0, 'rgba(90,166,255,.15)'); lg.addColorStop(0.5, 'rgba(110,180,255,.85)'); lg.addColorStop(1, 'rgba(160,210,255,.95)');
      glow('#2f7dff', 10); ctx.strokeStyle = lg; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(...P[0]); ctx.bezierCurveTo(...P[1], ...P[2], ...P[3]); ctx.stroke();
      dot(P[3][0], P[3][1], 3.4, '#d6ecff', 16);
      const t = ((T * 0.22 + i * 0.17) % 1);
      const [px, py] = bez(P, t); dot(px, py, 2, '#ffffff', 12);
    });
    // the security core
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(90,166,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R * 0.64, 0, TAU); ctx.stroke();
    glow('#2f7dff', 16); ctx.strokeStyle = '#4da3ff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, TAU); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + i * Math.PI / 2; dot(cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, 2.4, '#cfe8ff', 12); }
    // a pulse leaving the core
    const pr = (T * 0.35) % 1; ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(90,166,255,${0.5 * (1 - pr)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R * (0.36 + pr * 0.4), 0, TAU); ctx.stroke();
    glow('#3b8cff', 26); ctx.strokeStyle = '#3d8fff'; ctx.lineWidth = R * 0.07; ctx.beginPath(); ctx.arc(cx, cy, R * 0.35, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(8,24,64,.85)'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.35, -2.2 + T * 0.4, -1.5 + T * 0.4); ctx.stroke();
    g = ctx.createRadialGradient(cx, cy - R * 0.05, 0, cx, cy, R * 0.26);
    g.addColorStop(0, '#0f2f72'); g.addColorStop(1, '#061433');
    glow('#4da3ff', 18); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.26, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8fd3ff'; ctx.lineWidth = 2; ctx.stroke();
    // the shield, with a dot inside
    const s = R * 0.0042;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
    glow('#bfe2ff', 14); ctx.strokeStyle = '#eaf6ff'; ctx.lineWidth = 3.4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-24, -20); ctx.lineTo(-24, -1); ctx.bezierCurveTo(-24, 16, -12, 27, 0, 32); ctx.bezierCurveTo(12, 27, 24, 16, 24, -1); ctx.lineTo(24, -20); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#eaf6ff'; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, TAU); ctx.fill();
    ctx.restore();
    // attacks, stopped at the edge
    for (let i = attacks.length - 1; i >= 0; i--) {
      const a = attacks[i];
      const r = R * (1.75 - 0.67 * a.t), x = cx + Math.cos(a.ang) * r, y = cy + Math.sin(a.ang) * r;
      const tx = cx + Math.cos(a.ang) * Math.min(R * 1.9, r + R * 0.35), ty = cy + Math.sin(a.ang) * Math.min(R * 1.9, r + R * 0.35);
      const lg = ctx.createLinearGradient(tx, ty, x, y); lg.addColorStop(0, 'rgba(255,91,110,0)'); lg.addColorStop(1, 'rgba(255,91,110,.95)');
      ctx.shadowBlur = 0; ctx.strokeStyle = lg; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      dot(x, y, 3.2, '#ff6b7d', 14);
    }
    for (const rp of ripples) {
      ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(143,211,255,${1 - rp.t})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rp.x, rp.y, 4 + rp.t * R * 0.22, 0, TAU); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  };

  const step = (dt) => {
    T += dt; rot += dt * 0.07;
    nextAtk -= dt;
    if (nextAtk <= 0) { attacks.push({ ang: Math.random() * TAU, t: 0, sp: 0.5 + Math.random() * 0.2, name: THREATS[ti++ % THREATS.length] }); nextAtk = 2.2 + Math.random() * 1.4; }
    for (let i = attacks.length - 1; i >= 0; i--) {
      const a = attacks[i]; a.t += dt * a.sp;
      if (a.t >= 1) {
        const x = cx + Math.cos(a.ang) * R * 1.08, y = cy + Math.sin(a.ang) * R * 1.08;
        ripples.push({ x, y, t: 0 }); attacks.splice(i, 1); onHit?.(a.name, x, y);
      }
    }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt * 1.4; if (ripples[i].t >= 1) ripples.splice(i, 1); }
  };

  size();
  let raf = 0, last = 0, on = false;
  const frame = (now) => { raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; step(dt); draw(); };
  const ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(cv);
  draw();
  return {
    start() { if (!on && !still) { on = true; last = 0; raf = requestAnimationFrame(frame); } },
    stop() { on = false; cancelAnimationFrame(raf); },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}

/* ---------------------------------------------------------- the panel */
function Side({ x, alt, blocked, right }) {
  const v = x.v === 'live' ? blocked.toLocaleString('en-IN') : x.v;
  return (
    <Link to={x.to} className={`gx-card${right ? ' r' : ''}`}>
      <span className="gx-ic"><Gl g={x.g} /></span>
      <span className="gx-flip">
        <span className={`gx-ct${alt ? '' : ' on'}`} aria-hidden={alt || undefined}><b>{x.h}</b><small>{x.p}</small><em>{x.by}</em></span>
        <span className={`gx-ct gx-num${alt ? ' on' : ''}`} aria-hidden={!alt || undefined}><b>{v}</b><small>{x.l}</small></span>
      </span>
    </Link>
  );
}

export default function AispmGlobe() {
  const stage = useRef(null), canvas = useRef(null), labels = useRef(null), feed = useRef(null);
  const [alt, setAlt] = useState(false);
  const [blocked, setBlocked] = useState(START_BLOCKED);
  useEffect(() => {
    const el = stage.current; if (!el) return undefined;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const onHit = (name, x, y) => {
      setBlocked((n) => n + 1);
      const lab = document.createElement('span');
      lab.className = 'gx-hit'; lab.style.left = `${x}px`; lab.style.top = `${y}px`;
      lab.innerHTML = `<i></i>${name}<b>Blocked</b>`;
      labels.current.appendChild(lab); setTimeout(() => lab.remove(), 2400);
      const li = document.createElement('li'); li.innerHTML = `<i></i><span>${name}</span><b>Blocked</b>`;
      const f = feed.current; f.prepend(li); while (f.children.length > 3) f.lastChild.remove();
    };
    const g = startGlobe(canvas.current, { onHit, still });
    el.classList.add('live');
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? g.start() : g.stop()), { threshold: 0.05 });
    io.observe(el);
    // the sides turn between what we secure and how secure it is
    const t = still ? 0 : setInterval(() => setAlt((v) => !v), 4200);
    return () => { io.disconnect(); clearInterval(t); g.destroy(); };
  }, []);

  return (
    <figure className="gx" aria-label="Animation: your digital ecosystem as a globe with a security core at its centre. Attacks such as stolen credentials, phishing, MFA fatigue, compromised sessions, deepfake voices, prompt injection and hijacked AI agents arrive and are blocked at its edge.">
      <span className="gx-live gx-live-float"><i />Live environment</span>
      <div className="gx-body">
        <div className="gx-col">{SIDES.slice(0, 2).map((x) => <Side key={x.h} x={x} alt={alt} blocked={blocked} />)}</div>
        <div ref={stage} className="gx-stage">
          <canvas ref={canvas} className="gx-cv" aria-hidden="true" />
          <div ref={labels} className="gx-labels" aria-hidden="true" />
        </div>
        <div className="gx-col">{SIDES.slice(2).map((x) => <Side key={x.h} x={x} alt={alt} blocked={blocked} right />)}</div>
      </div>
      <div className="gx-score" aria-hidden="true"><b>92</b><span>/100</span><small><Check />Strong posture</small></div>
      <div className="gx-foot">
        <p>AI-driven threats, stopped at the edge · sample environment</p>
        <ul ref={feed} className="gx-feed" aria-hidden="true">
          <li><i /><span>Phishing</span><b>Blocked</b></li>
          <li><i /><span>MFA fatigue</span><b>Blocked</b></li>
          <li><i /><span>Prompt injection</span><b>Blocked</b></li>
        </ul>
      </div>
    </figure>
  );
}
