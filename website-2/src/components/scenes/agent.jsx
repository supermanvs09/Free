import Scene from './Scene.jsx';
import { Logo } from '../viz/kit.jsx';
import { TAU, seg, ease, lerp, hash, glow, ring, rgba, clamp, drawIcon, preload, orb } from './engine.js';

/* An AI agent asked to summarise one contract reaches for three systems. Its
   task is a boundary drawn around it: the call inside the boundary goes
   through; the two that reach beyond it break on the boundary, which is where
   Zenstra decides, before the call runs. */
const ZEN = '#9aa8ff', OK = '#3fd98f', RED = '#ff6b5d';
const T = { c1: 1.2, c2: 3.7, c3: 6.1, verdict: 8.5 }, LOOP = 12.5;
const DUST = Array.from({ length: 70 }, (_, i) => [hash(i, 61), hash(i, 62), hash(i, 63)]);
preload([['bot', '#eef0ff', 1.7], ['doc', '#d8ffe9', 1.7]]);

function layout(w, h, narrow) {
  const P = (x, y) => [x * w, y * h];
  return narrow
    ? { agent: P(0.46, 0.53), apps: [P(0.2, 0.27), P(0.82, 0.2), P(0.82, 0.74)], ell: { c: P(0.34, 0.41), rx: w * 0.31, ry: h * 0.25, rot: -0.75 } }
    : { agent: P(0.44, 0.55), apps: [P(0.2, 0.3), P(0.84, 0.26), P(0.8, 0.8)], ell: { c: P(0.33, 0.43), rx: w * 0.24, ry: h * 0.3, rot: -0.55 } };
}
const inside = (e, [x, y]) => { const c = Math.cos(-e.rot), s = Math.sin(-e.rot), dx = x - e.c[0], dy = y - e.c[1]; const u = dx * c - dy * s, v = dx * s + dy * c; return (u / e.rx) ** 2 + (v / e.ry) ** 2 < 1; };

function beam(ctx, a, b, u0, u1, color, alpha, w = 2) {
  const p0 = [lerp(a[0], b[0], u0), lerp(a[1], b[1], u0)], p1 = [lerp(a[0], b[0], u1), lerp(a[1], b[1], u1)];
  const g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
  g.addColorStop(0, rgba(color, 0)); g.addColorStop(1, rgba(color, alpha));
  ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...p0); ctx.lineTo(...p1); ctx.stroke();
  return p1;
}

function draw(ctx, w, h, t, { narrow, mx, my }) {
  const out = {};
  const fade = 1 - seg(t, LOOP - 0.7, LOOP);
  const L = layout(w, h, narrow), e = L.ell, A = L.agent;
  const appear = ease(seg(t, 0, 0.8)) * fade;
  const unit = Math.min(w, h);

  for (const [x, y, s] of DUST) { ctx.fillStyle = rgba('#c9d0ff', (0.12 + 0.3 * s) * fade); ctx.fillRect(x * w + mx * 6 * s, y * h + my * 6 * s, 1.2, 1.2); }

  // the task boundary
  const breathe = 1 + Math.sin(t * 1.4) * 0.008;
  ctx.save(); ctx.translate(...e.c); ctx.rotate(e.rot); ctx.scale(breathe, breathe);
  const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, e.rx);
  bg.addColorStop(0, rgba(ZEN, 0.1 * appear)); bg.addColorStop(0.85, rgba(ZEN, 0.05 * appear)); bg.addColorStop(1, rgba(ZEN, 0.16 * appear));
  ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, e.rx, e.ry, 0, 0, TAU); ctx.fill();
  ctx.setLineDash([6, 7]); ctx.lineDashOffset = -t * 18;
  ctx.strokeStyle = rgba(ZEN, 0.75 * appear); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 0, e.rx, e.ry, 0, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // three calls
  const calls = [[T.c1, 0, true], [T.c2, 1, false], [T.c3, 2, false]];
  ctx.globalCompositeOperation = 'lighter';
  for (const [t0, i, allowed] of calls) {
    if (t < t0) continue;
    const B = L.apps[i];
    let uHit = 1;
    if (!allowed) for (let k = 0; k <= 80; k++) { if (!inside(e, [lerp(A[0], B[0], k / 80), lerp(A[1], B[1], k / 80)])) { uHit = k / 80; break; } }
    const fly = 0.75, u = seg(t, t0, t0 + fly) * uHit;
    const col = allowed ? OK : t >= t0 + fly ? RED : ZEN;
    if (t < t0 + fly + (allowed ? 1.2 : 0.2)) {
      const head = beam(ctx, A, B, Math.max(0, u - 0.35), u, col, 0.95 * fade, 2.2);
      glow(ctx, head[0], head[1], 12, col, 0.9 * fade);
    } else {
      // what stays: a faint trace of the call
      ctx.strokeStyle = rgba(allowed ? OK : RED, (allowed ? 0.55 : 0.28) * fade); ctx.lineWidth = allowed ? 1.6 : 1.2; ctx.setLineDash(allowed ? [2, 9] : [3, 6]); ctx.lineDashOffset = allowed ? t * 26 : 0;
      ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(lerp(A[0], B[0], uHit), lerp(A[1], B[1], uHit)); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      if (!allowed) { const P = [lerp(A[0], B[0], uHit), lerp(A[1], B[1], uHit)]; glow(ctx, P[0], P[1], 22 + Math.sin(t * 3 + i) * 4, RED, 0.55 * fade); }
    }
    if (allowed && t > t0 + fly) {
      // the file comes back
      const r = seg(t, t0 + fly + 0.1, t0 + fly + 1.0);
      if (r > 0 && r < 1) { const q = [lerp(B[0], A[0], ease(r)), lerp(B[1], A[1], ease(r))]; glow(ctx, q[0], q[1], 16, OK, 0.8 * fade); ctx.globalCompositeOperation = 'source-over'; drawIcon(ctx, 'doc', q[0], q[1], 14, '#d8ffe9', fade, 1.7); ctx.globalCompositeOperation = 'lighter'; }
    }
    if (!allowed && t >= t0 + fly) {
      const P = [lerp(A[0], B[0], uHit), lerp(A[1], B[1], uHit)];
      const b = seg(t, t0 + fly, t0 + fly + 0.8);
      glow(ctx, P[0], P[1], 40 * (1 - b) + 14, RED, (0.9 - 0.5 * b) * fade);
      ring(ctx, P[0], P[1], 8 + b * 34, RED, (1 - b) * 0.8 * fade, 1.6);
      for (let k = 0; k < 9; k++) { const a = hash(i * 9 + k, 71) * TAU, r = b * (18 + hash(k, 72) * 22); ctx.fillStyle = rgba('#ffc3ba', (1 - b) * fade); ctx.fillRect(P[0] + Math.cos(a) * r, P[1] + Math.sin(a) * r, 2, 2); }
      const r = unit * 0.062;
      out[`c${i + 1}`] = i === 1 ? { x: B[0], y: B[1] + r + unit * 0.07, o: ease(seg(t, t0 + fly, t0 + fly + 0.4)) * fade, ay: 0 }
        : { x: B[0], y: B[1] - r - 10, o: ease(seg(t, t0 + fly, t0 + fly + 0.4)) * fade, ay: -100 };
    }
    if (allowed) out.c1 = { x: B[0], y: B[1] + unit * 0.085, o: ease(seg(t, t0 + fly + 0.2, t0 + fly + 0.6)) * fade, ay: 0 };
  }
  ctx.globalCompositeOperation = 'source-over';

  // the apps
  L.apps.forEach((B, i) => {
    const blocked = (i === 1 && t >= T.c2 + 0.75) || (i === 2 && t >= T.c3 + 0.75);
    const r = unit * 0.062;
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, B[0], B[1], r * 2.6, i === 0 ? OK : blocked ? RED : '#8fb6ff', 0.35 * appear); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba('#14171d', appear); ctx.strokeStyle = rgba(i === 0 ? OK : blocked ? RED : '#9fb4cf', 0.55 * appear); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(B[0], B[1], r, 0, TAU); ctx.fill(); ctx.stroke();
    out[`a${i}`] = { x: B[0], y: B[1], o: appear };
  });

  // the agent
  const ar = unit * 0.085;
  const pu = (t % 2) / 2;
  ctx.globalCompositeOperation = 'lighter'; glow(ctx, A[0], A[1], ar * 3.4, ZEN, 0.55 * appear); ctx.globalCompositeOperation = 'source-over';
  ring(ctx, A[0], A[1], ar * (1.15 + pu * 0.8), ZEN, (1 - pu) * 0.5 * appear, 1.3);
  orb(ctx, A[0], A[1], ar, ZEN, appear, 0.9);
  drawIcon(ctx, 'bot', A[0], A[1], ar * 1.05, '#eef0ff', appear, 1.7);

  if (narrow) {
    out.agentTag = { x: A[0], y: A[1] + ar + 10, o: appear, ay: 0 };
    out.task = { x: w / 2, y: 12, o: appear, ay: 0 };
  } else out.agent = { x: A[0], y: A[1] + ar + 12, o: appear, ay: 0 };
  const top = [e.c[0] + Math.cos(e.rot - Math.PI / 2) * e.ry, e.c[1] + Math.sin(e.rot - Math.PI / 2) * e.ry];
  out.boundary = { x: top[0], y: top[1], o: appear };
  out.verdict = { x: w / 2, y: h - (narrow ? 12 : 18), o: ease(seg(t, T.verdict, T.verdict + 0.5)) * fade, ay: -100 };
  return out;
}

export const AGENT = { draw, loop: LOOP, still: 10, ratio: 1.3, narrowRatio: 0.82 };

const App = ({ k, n }) => <span className="flex flex-col items-center gap-[.35em]" style={{ transform: 'translateY(.15em)' }}><Logo k={k} size="2em" /><span style={{ position: 'absolute', top: '120%', color: '#c9ccd2', fontSize: '.86em', whiteSpace: 'nowrap' }}>{n}</span></span>;
const Call = ({ fn, what, verdict, tone }) => (
  <span className="scn-card" style={{ borderColor: tone === 'ok' ? 'rgb(63 217 143 / .45)' : 'rgb(255 107 93 / .45)' }}>
    <b style={{ fontFamily: 'var(--font-mono)', fontSize: '.86em', color: tone === 'ok' ? '#9ff0c6' : '#ffb1a8' }}>{fn}</b>
    <span>{what}</span>
    <span style={{ color: tone === 'ok' ? '#4be29a' : '#ff8b7e', fontWeight: 600 }}>{verdict}</span>
  </span>
);

export function AgentBoundary({ t }) {
  return (
    <Scene scene={AGENT} t={t}
      label="Illustration: an AI agent, invoice-agent in Copilot Studio, is asked to summarise the Q3 vendor contract. Its task is drawn as a boundary around it. Reading the contract from SharePoint is inside the boundary and goes through. Searching three years of Outlook mail and exporting Salesforce data to an outside address reach beyond the task, break on the boundary and are blocked by Zenstra before they run."
      labels={{
        a0: <App k="sharepoint" n="SharePoint" />,
        a1: <App k="outlook" n="Outlook" />,
        a2: <App k="salesforce" n="Salesforce" />,
        agent: <span className="scn-card text-center"><b>invoice-agent</b><span>Task: summarise the Q3 vendor contract</span></span>,
        agentTag: <span className="scn-tag" style={{ color: '#c9d0ff' }}>invoice-agent</span>,
        task: <span className="scn-tag" style={{ color: '#e6e8ff' }}>Task: summarise the Q3 vendor contract</span>,
        boundary: <span className="scn-tag" style={{ color: '#b9c3ff' }}>The task boundary · Zenstra</span>,
        c1: <Call fn="files.read" what="vendor-q3.pdf" verdict="✓ Inside the task" tone="ok" />,
        c2: <Call fn="mail.search" what="3 years of mail" verdict="Blocked · beyond the task" />,
        c3: <Call fn="crm.export" what="to an outside address" verdict="Blocked in 4 ms" />,
        verdict: <span className="scn-card text-center" style={{ borderColor: 'rgb(154 168 255 / .45)' }}><b>One request. Three systems. One was the job.</b><span>Zenstra decided each call before it ran</span></span>,
      }} />
  );
}
