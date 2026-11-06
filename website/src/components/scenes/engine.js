/* A small 3D and particle kit for the story scenes. Every scene is a pure
   function of time, so the website plays it live and the product film renders
   the very same frames. Units: a scene draws in CSS pixels on a canvas that is
   already scaled for the device. */

export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const ease = (x) => 1 - Math.pow(1 - x, 3);
export const inout = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const lerp = (a, b, x) => a + (b - a) * x;
/* rises over [a, a+r], holds, falls over [b-r, b] */
export const win = (t, a, b, r = 0.4) => Math.min(seg(t, a, a + r), 1 - seg(t, b - r, b));

/* deterministic random numbers, so a frame at time t is always the same */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
/* a stable pseudo-random number for an integer index */
export const hash = (i, salt = 0) => { let x = Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 40503); x = Math.imul(x ^ (x >>> 15), 2246822507); x ^= x >>> 13; return ((x >>> 0) % 100000) / 100000; };

/* rotate a point about X, then Y, then Z (radians) */
export function rot([x, y, z], ax = 0, ay = 0, az = 0) {
  let c = Math.cos(ax), s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ay); s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(az); s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

/* A pinhole camera. World units: 1 = `unit` px at depth 0; +z comes towards the
   viewer. Returns screen x, y, a scale factor k and the depth z. */
export function camera(cx, cy, unit, dist = 4) {
  return ([x, y, z]) => { const k = dist / (dist - z); return { x: cx + x * unit * k, y: cy + y * unit * k, k, z }; };
}

/* latitude/longitude (degrees) to a point on a unit sphere, +z towards the viewer at lon0 */
export function sph(lat, lon) {
  const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180;
  return [Math.cos(a) * Math.sin(b), -Math.sin(a), Math.cos(a) * Math.cos(b)];
}

/* points along a quadratic bezier */
export const qb = (a, c, b, u) => [0, 1].map((i) => (1 - u) * (1 - u) * a[i] + 2 * (1 - u) * u * c[i] + u * u * b[i]);

/* ---------- light ---------- */
export function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.35, rgba(color, a * 0.35));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
export function orb(ctx, x, y, r, color, a = 1, ring = 0.55) {
  glow(ctx, x, y, r * 2.6, color, 0.5 * a);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, rgba('#ffffff', 0.22 * a));
  g.addColorStop(0.5, rgba(color, 0.2 * a));
  g.addColorStop(1, rgba(color, 0.08 * a));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(color, ring * a);
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.stroke();
}
export function ring(ctx, x, y, r, color, a, w = 1.5) {
  if (a <= 0) return;
  ctx.strokeStyle = rgba(color, a); ctx.lineWidth = w;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
}
export function line(ctx, a, b, color, alpha, w = 1) {
  if (alpha <= 0) return;
  ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}
export function text(ctx, s, x, y, { size = 12, weight = 500, color = '#e8eaee', alpha = 1, align = 'center', mono = false, base = 'middle' } = {}) {
  if (alpha <= 0) return;
  ctx.font = `${weight} ${size}px ${mono ? '"JetBrains Mono Variable", ui-monospace, monospace' : '"Inter Variable", Inter, system-ui, sans-serif'}`;
  ctx.textAlign = align; ctx.textBaseline = base;
  ctx.fillStyle = rgba(color, alpha);
  ctx.fillText(s, x, y);
}

const HEX = {};
export function rgba(c, a) {
  if (c.startsWith('rgb')) return c;
  let v = HEX[c];
  if (!v) { const n = parseInt(c.slice(1), 16); v = HEX[c] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  return `rgba(${v[0]},${v[1]},${v[2]},${clamp(a)})`;
}

/* ---------- icons, as images (stroke icons on a 24 grid) ---------- */
const PATHS = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 20 3M16 7l3 3M13.5 9.5l2 2"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13.5h.01M15 13.5h.01M9.5 17h5"/>',
  bank: '<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  shieldok: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  server2: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 7 8.5-7"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A4 4 0 0 1 17.5 18z"/>',
};
const IMG = {};
export function icon(name, color = '#ffffff', w = 1.8) {
  const k = `${name}|${color}|${w}`;
  if (!IMG[k] && typeof Image !== 'undefined') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    IMG[k] = img;
  }
  return IMG[k];
}
export function drawIcon(ctx, name, x, y, s, color, a = 1, w) {
  const img = icon(name, color, w);
  if (!img || !img.complete || a <= 0) return;
  ctx.globalAlpha = clamp(a);
  ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
  ctx.globalAlpha = 1;
}
/* warm the icons the scenes use, so the first frame already has them */
export function preload(list) { for (const [n, c, w] of list) icon(n, c, w); }
