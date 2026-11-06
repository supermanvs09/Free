/* Core: timing helpers, easing, deterministic randomness, DOM helpers, kinetic type,
   the sound-event list and the scene registry. */
const FW = 1920, FH = 1080, FPS = 30, DURATION = 120;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const seg = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const E = {
  lin: (x) => x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inCubic: (x) => x * x * x,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
};
const ease = (t, a, b, f = E.outCubic) => f(seg(t, a, b));
/* visible window: fades in over fi after a, out over fo before b */
const win = (t, a, b, fi = 0.4, fo = 0.4) => Math.min(E.inOutSine(seg(t, a, a + fi)), 1 - E.inOutSine(seg(t, b - fo, b)));
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function el(tag, cls, parent, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  (parent || document.body).appendChild(e);
  return e;
}
/* cached style setter: only touches the DOM when a value changes */
function S(e, props) {
  const c = e.__c || (e.__c = {});
  for (const k in props) { const v = props[k]; if (c[k] !== v) { c[k] = v; e.style[k] = v; } }
}
function txt(e, v) { if (e.__t !== v) { e.__t = v; e.textContent = v; } }
function htm(e, v) { if (e.__h !== v) { e.__h = v; e.innerHTML = v; } }
const px = (v) => v.toFixed(2) + 'px';
/* common reveal: opacity + rise + blur */
function reveal(e, p, rise = 24, blur = 10, extra = '') {
  S(e, { opacity: p.toFixed(3), transform: `translate3d(0,${((1 - p) * rise).toFixed(2)}px,0) ${extra}`, filter: p >= 0.999 ? 'none' : `blur(${((1 - p) * blur).toFixed(2)}px)` });
}

/* sound events, collected while the scenes build; the mix reads them */
const EVENTS = [];
function sfx(t, type, o = {}) { EVENTS.push({ t: +t.toFixed(3), type, ...o }); }

/* human typing: per-character times with natural variation */
function typer(str, t0, cps, seed, o = {}) {
  const r = rng(seed); const times = []; let t = t0;
  for (let i = 0; i < str.length; i++) {
    times.push(t);
    const ch = str[i];
    let d = (1 / cps) * (0.55 + r() * 0.9);
    if (ch === ' ') d *= 1.2;
    if (',.?:'.includes(ch)) d *= 2.4;
    if (r() < 0.04) d *= 3;
    t += d;
  }
  if (!o.silent) times.forEach((tt, i) => sfx(tt, str[i] === ' ' ? 'space' : 'key', { v: o.vol || 1, s: Math.floor(r() * 1e6) }));
  return { str, times, end: t, n(tt) { let n = 0; while (n < times.length && times[n] <= tt) n++; return n; } };
}

/* kinetic headline: words rise out of a blur, one after another. *word* = accent */
class Kin {
  constructor(parent, text, { cls = '', style = {}, stagger = 0.075, dur = 0.7 } = {}) {
    this.e = el('div', 'kin ' + cls, parent);
    Object.assign(this.e.style, style);
    this.words = [];
    text.split('\n').forEach((line, li) => {
      if (li) el('br', '', this.e);
      line.split(' ').forEach((w, wi) => {
        const acc = /^\*.*\*[.,]?$/.test(w);
        const s = el('span', 'w' + (acc ? ' acc' : ''), this.e);
        s.textContent = w.replace(/\*/g, '') + ' ';
        this.words.push(s);
      });
    });
    this.stagger = stagger; this.dur = dur;
  }
  update(t, a, b, fo = 0.5) {
    const out = b == null ? 1 : 1 - E.inOutSine(seg(t, b - fo, b));
    S(this.e, { display: t < a - 0.05 || (b != null && t > b) ? 'none' : 'block' });
    this.words.forEach((w, i) => {
      const p = E.outCubic(seg(t, a + i * this.stagger, a + i * this.stagger + this.dur));
      const o = p * out;
      S(w, { opacity: o.toFixed(3), transform: `translate3d(0,${((1 - p) * 0.42).toFixed(3)}em,0)`,
        filter: o >= 0.999 ? 'none' : `blur(${((1 - p) * 14 + (1 - out) * 10).toFixed(2)}px)` });
    });
  }
}

/* shared product header + end card markup */
const PRODUCT = {
  adapid: { img: 'assets/adapid.png', name: 'adapID AI' },
  zenstra: { img: 'assets/zenstra.png', name: 'Zenstra AI' },
};
/* a scene is a layer with its own window; layers later in the list draw on top */
function layer(a, b, build, o = {}) {
  const root = el('div', 'scene', document.getElementById('stage'));
  const s = { a, b, root, ...o };
  s.update = build(root, s) || (() => {});
  SCENES.push(s);
  return s;
}
function panelHead(parent, product, module, tag) {
  const h = el('div', 'ph', parent);
  h.innerHTML = `<div class="tile"><img src="${PRODUCT[product].img}"></div><div><b>${PRODUCT[product].name}</b><br><span>${module}</span></div>${tag ? `<div class="tag">${tag}</div>` : ''}`;
  return h;
}
class EndCard {
  constructor(parent, headline, product, line, { y = 400, cls = '' } = {}) {
    this.e = el('div', 'endcard ' + cls, parent);
    S(this.e, { top: y + 'px' });
    this.k = new Kin(this.e, headline, { style: { position: 'relative', fontSize: '76px', display: 'inline-block' }, stagger: 0.06 });
    this.sub = el('div', 'sub', this.e);
    this.sub.innerHTML = `<div class="tile"><img src="${PRODUCT[product].img}"></div><b>${PRODUCT[product].name}</b><span class="dot"></span><span>${line}</span>`;
    el('div', '', this.e).style.height = '0';
  }
  update(t, a, b) {
    this.k.update(t, a, b);
    S(this.e, { display: t < a - 0.05 || t > b ? 'none' : 'block' });
    const p = E.outCubic(seg(t, a + 0.55, a + 1.25)) * (1 - E.inOutSine(seg(t, b - 0.5, b)));
    reveal(this.sub, p, 16, 8);
  }
}

/* scenes */
const SCENES = [];
function scene(a, b, build) {
  const root = el('div', 'scene', document.getElementById('stage'));
  const s = { a, b, root };
  s.update = build(root, s) || (() => {});
  SCENES.push(s);
  return s;
}

/* images that must be decoded before a frame is captured */
const PENDING = new Set();
function img(src, parent, cls) {
  const i = el('img', cls || '', parent); i.src = src; i.decoding = 'sync';
  return i;
}
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }

/* vector helpers for the 3D scenes */
function makeCam(o) { return Object.assign({ tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, dist: 1000, f: 1100, cx: FW / 2, cy: FH / 2 }, o); }
function project(p, c) {
  let x = p[0] - c.tx, y = p[1] - c.ty, z = p[2] - c.tz;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  let x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  let y1 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  const zz = z2 + c.dist;
  if (zz < 20) return null;
  const k = c.f / zz;
  return { x: c.cx + x1 * k, y: c.cy + y1 * k, k, z: zz };
}
function glowSprite(rgb, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.18, `rgba(${rgb},.55)`); gr.addColorStop(0.45, `rgba(${rgb},.12)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
