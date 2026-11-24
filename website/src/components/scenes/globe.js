import LAND from './land.json';
import { TAU, rot, sph, rgba, clamp } from './engine.js';

/* A dotted globe: Natural Earth land sampled into dots (see tools/scenes/gen-land.mjs). */
const DOTS = [];
for (let i = 0; i < LAND.length; i += 2) DOTS.push(sph(LAND[i] / 10, LAND[i + 1] / 10));

/* a view that brings (lat0, lon0) to the centre of the disc */
export function view(lat0, lon0) {
  const a = (lon0 * Math.PI) / 180, b = (lat0 * Math.PI) / 180;
  return (p) => rot(rot(p, 0, -a, 0), -b, 0, 0);
}

/* project a point on (or above) the sphere to the screen */
export const onScreen = (g, p) => { const q = g.v(p); return { x: g.cx + q[0] * g.R, y: g.cy + q[1] * g.R, z: q[2] }; };
export const city = (g, lat, lon, lift = 1) => onScreen(g, sph(lat, lon).map((c) => c * lift));

export function drawGlobe(ctx, g, alpha = 1, tint = '#3cc8f6') {
  const { cx, cy, R } = g;
  // atmosphere
  const at = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.22);
  at.addColorStop(0, rgba(tint, 0.28 * alpha)); at.addColorStop(0.35, rgba(tint, 0.08 * alpha)); at.addColorStop(1, rgba(tint, 0));
  ctx.fillStyle = at; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, TAU); ctx.fill();
  // body
  const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R);
  body.addColorStop(0, rgba('#173246', 0.95 * alpha)); body.addColorStop(0.6, rgba('#0c1822', 0.95 * alpha)); body.addColorStop(1, rgba('#070b10', 0.98 * alpha));
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  // land, darker towards the limb, in a few alpha bands for speed
  const s = Math.max(1.1, R / 210);
  const bands = [[], [], [], [], []];
  for (const p of DOTS) {
    const q = g.v(p);
    if (q[2] <= 0.02) continue;
    bands[Math.min(4, Math.floor(q[2] * 5))].push(cx + q[0] * R, cy + q[1] * R);
  }
  bands.forEach((b, i) => {
    ctx.fillStyle = rgba('#8fd8ff', (0.2 + i * 0.15) * alpha);
    for (let j = 0; j < b.length; j += 2) ctx.fillRect(b[j] - s / 2, b[j + 1] - s / 2, s, s);
  });
  // rim
  ctx.strokeStyle = rgba(tint, 0.35 * alpha); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
}

/* a great-circle arc lifted off the surface; returns screen points with depth */
export function arc(g, a, b, lift = 0.25, n = 48) {
  const p1 = sph(...a), p2 = sph(...b);
  const dot = clamp(p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2], -1, 1);
  const w = Math.acos(dot), sw = Math.sin(w) || 1;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, k1 = Math.sin((1 - u) * w) / sw, k2 = Math.sin(u * w) / sw, h = 1 + lift * Math.sin(Math.PI * u);
    pts.push(onScreen(g, [0, 1, 2].map((j) => (k1 * p1[j] + k2 * p2[j]) * h)));
  }
  return pts;
}
/* stroke an arc up to fraction `to` (0..1), hiding what is behind the globe */
export function strokeArc(ctx, pts, color, alpha, to = 1, w = 2, from = 0) {
  const n = pts.length - 1, a = Math.floor(from * n), b = Math.ceil(to * n);
  ctx.lineWidth = w; ctx.lineCap = 'round';
  for (let i = a; i < b; i++) {
    const p = pts[i], q = pts[i + 1];
    const vis = clamp((Math.min(p.z, q.z) + 0.15) * 4);
    if (vis <= 0) continue;
    ctx.strokeStyle = rgba(color, alpha * vis);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
}
export const along = (pts, u) => { const f = clamp(u) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), r = f - i; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * r, y: pts[i].y + (pts[i + 1].y - pts[i].y) * r, z: pts[i].z }; };
