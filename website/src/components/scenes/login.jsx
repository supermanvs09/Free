import Scene from './Scene.jsx';
import { TAU, seg, ease, lerp, hash, glow, ring, text, rgba, clamp } from './engine.js';
import { view, drawGlobe, city, arc, strokeArc, along } from './globe.js';

/* The same account signs in twice and passes MFA both times: Mumbai at 09:12,
   Lagos at 11:05. The arc between them is 7,620 km in 1 h 53 min, so the risk
   jumps from 12 to 94 and the session is held. */
const MUM = [19.08, 72.88], LAG = [6.52, 3.38];
const GREEN = '#3fd98f', RED = '#ff6b5d', AMBER = '#ffc566';
const T = { mum: 1.0, lag: 3.0, arc: 4.6, flag: 6.0, held: 7.4 }, LOOP = 12.5;
const STARS = Array.from({ length: 90 }, (_, i) => [hash(i, 11), hash(i, 12), hash(i, 13)]);

function ping(ctx, p, color, t0, t, a) {
  if (t < t0 || p.z < 0.05) return;
  const x = ease(seg(t, t0, t0 + 0.5));
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, p.x, p.y, 34, color, 0.85 * x * a);
  ctx.globalCompositeOperation = 'source-over';
  for (let k = 0; k < 2; k++) { const u = ((t - t0) * 0.7 + k * 0.5) % 1; ring(ctx, p.x, p.y, 6 + u * 30, color, (1 - u) * 0.75 * x * a, 1.4); }
  ctx.fillStyle = rgba('#ffffff', x * a); ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, TAU); ctx.fill();
}

function draw(ctx, w, h, t, { narrow, mx }) {
  const out = {};
  const fade = 1 - seg(t, LOOP - 0.7, LOOP);
  const R = narrow ? w * 0.74 : Math.min(w * 0.5, h * 0.64);
  const g = { cx: w / 2, cy: narrow ? h * 0.86 : h * 0.84, R, v: view(-10, 38 + Math.sin(t * 0.25) * 3 + mx * 4) };
  // stars
  for (const [x, y, s] of STARS) { ctx.fillStyle = rgba('#cfe8ff', (0.15 + 0.35 * s) * fade); ctx.fillRect(x * w, y * h * 0.7, 1.2, 1.2); }
  drawGlobe(ctx, g, ease(seg(t, 0, 0.8)) * fade);

  const m = city(g, ...MUM), l = city(g, ...LAG);
  const flag = ease(seg(t, T.flag, T.flag + 0.5));

  // the arc between the two sign-ins, and a traveller along it
  const pts = arc(g, MUM, LAG, 0.32);
  const ar = ease(seg(t, T.arc, T.arc + 1.2));
  if (ar > 0) {
    ctx.globalCompositeOperation = 'lighter';
    strokeArc(ctx, pts, flag > 0 ? RED : AMBER, 0.25 * fade, ar, 7);
    strokeArc(ctx, pts, flag > 0 ? '#ff8b7e' : AMBER, 0.95 * fade, ar, 2);
    const head = along(pts, ar < 1 ? ar : ((t - T.arc - 1.2) * 0.35) % 1);
    glow(ctx, head.x, head.y, 18, flag > 0 ? RED : AMBER, 0.9 * fade);
    ctx.globalCompositeOperation = 'source-over';
    const mid = along(pts, 0.5);
    out.dist = { x: mid.x, y: mid.y - 14, o: ease(seg(t, T.arc + 0.9, T.arc + 1.4)) * fade, ay: -100 };
  }

  ping(ctx, m, GREEN, T.mum, t, fade);
  ping(ctx, l, flag > 0 ? RED : GREEN, T.lag, t, fade);
  out.mum = { x: m.x, y: m.y - 22, o: ease(seg(t, T.mum + 0.2, T.mum + 0.7)) * fade, ay: -100 };
  out.lag = { x: l.x, y: l.y - 22, o: ease(seg(t, T.lag + 0.2, T.lag + 0.7)) * fade, ay: -100 };
  out.lagflag = { x: l.x, y: l.y + 18, o: flag * fade, ay: 0 };

  // the risk gauge
  const v = Math.round(lerp(12, 94, ease(seg(t, T.flag - 0.2, T.flag + 0.9))));
  const col = v >= 80 ? RED : v >= 50 ? AMBER : GREEN;
  const gx = narrow ? 44 : 58, gy = narrow ? 44 : 58, gr = narrow ? 26 : 32;
  const ga = ease(seg(t, 0.4, 1.0)) * fade;
  ctx.lineWidth = narrow ? 4 : 5; ctx.lineCap = 'round';
  ctx.strokeStyle = rgba('#ffffff', 0.1 * ga); ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TAU); ctx.stroke();
  ctx.strokeStyle = rgba(col, ga); ctx.beginPath(); ctx.arc(gx, gy, gr, -Math.PI / 2, -Math.PI / 2 + (v / 100) * TAU); ctx.stroke();
  text(ctx, String(v), gx, gy + 1, { size: narrow ? 17 : 21, weight: 650, color: col, alpha: ga });
  out.gauge = { x: gx + gr + 12, y: gy, o: ga, ax: 0, ay: -50 };
  out.held = { x: w / 2, y: narrow ? h * 0.93 : h * 0.92, o: ease(seg(t, T.held, T.held + 0.5)) * fade, ay: -100 };
  return out;
}

export const LOGIN = { draw, loop: LOOP, still: 9, ratio: 1.3, narrowRatio: 0.9 };

const Card = ({ time, place, dev, tone }) => (
  <span className="scn-card" style={{ borderColor: tone === 'red' ? 'rgb(255 107 93 / .45)' : 'rgb(63 217 143 / .35)' }}>
    <b>{place} <span style={{ display: 'inline', color: '#9ea2a8', fontWeight: 500 }}>· {time}</span></b>
    <span>{dev}</span>
    <span style={{ color: '#4be29a', fontWeight: 600, marginTop: '.2em' }}>✓ MFA passed</span>
  </span>
);

export function LoginGlobe({ t }) {
  return (
    <Scene scene={LOGIN} t={t}
      label="Illustration: Kavya Reddy signs in from Mumbai at 09:12 on her managed laptop and passes MFA. At 11:05 the same account signs in from Lagos on a new device and also passes MFA. The two places are 7,620 kilometres apart, 1 hour 53 minutes apart in time, so the behaviour risk rises from 12 to 94 and the session is held until Kavya confirms on her own phone."
      labels={{
        gauge: <span style={{ display: 'block', lineHeight: 1.25 }}><b style={{ display: 'block', color: '#f1f2f4', fontWeight: 600 }}>Kavya Reddy</b><span style={{ color: '#a4a7ad', fontSize: '.88em' }}>Behaviour risk</span></span>,
        mum: <Card place="Mumbai" time="09:12" dev="Managed laptop" />,
        lag: <Card place="Lagos" time="11:05" dev="New device" tone="red" />,
        lagflag: <span className="scn-tag" style={{ color: '#ff8b7e' }}>Impossible travel</span>,
        dist: <span className="scn-tag" style={{ color: '#ffd28a' }}>7,620 km in 1 h 53 min</span>,
        held: <span className="scn-card text-center" style={{ borderColor: 'rgb(60 200 246 / .45)' }}><b>Session held at risk 94</b><span>Kavya confirms on her own phone before anything else happens</span></span>,
      }} />
  );
}
