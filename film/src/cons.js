/* The identity constellation: people, privileged accounts, customers, service accounts,
   cloud workloads and AI agents, as one 3D field. Used by the opening and the finale. */
const KIND = {
  human: { rgb: '86,204,242', label: 'People', n: 46, c: [-700, -120, 260] },
  priv: { rgb: '226,236,255', label: 'Privileged accounts', n: 10, c: [-260, -520, -420] },
  cust: { rgb: '120,226,200', label: 'Customers', n: 42, c: [-640, 420, -380] },
  svc: { rgb: '157,140,255', label: 'Service accounts', n: 70, c: [620, -360, 160] },
  work: { rgb: '182,160,255', label: 'Cloud workloads', n: 82, c: [760, 300, -260] },
  ai: { rgb: '201,187,255', label: 'AI agents', n: 38, c: [80, 560, 520] },
};
const HUMANISH = { human: 1, priv: 1, cust: 1, app: 1 };

class Constellation {
  constructor(seed = 11) {
    const r = rng(seed), N = [];
    const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += r(); return (u - 2) / 0.58; };
    N.push({ p: [0, -160, 0], k: 'human', hub: 1, size: 9 });
    ['Mail', 'Chat', 'Docs', 'Files', 'Cloud', 'Code'].forEach((n, i) => N.push({ p: [(i - 2.5) * 200, 60, 0], k: 'app', app: n, size: 5 }));
    for (const k in KIND) {
      const K = KIND[k];
      for (let i = 0; i < K.n; i++) {
        const s = 250;
        N.push({ p: [K.c[0] + gauss() * s, K.c[1] + gauss() * s * 0.8, K.c[2] + gauss() * s], k, size: k === 'priv' ? 4.6 : 3.4 + r() * 1.4 });
      }
    }
    N.forEach((n, i) => { n.i = i; n.ph = r() * 6.28; n.tw = 0.6 + r() * 0.8; });
    const E = [], key = new Set();
    const add = (a, b, w = 1) => { const k = a < b ? a + '-' + b : b + '-' + a; if (a !== b && !key.has(k)) { key.add(k); E.push({ a, b, w }); } };
    const d2 = (a, b) => (a.p[0] - b.p[0]) ** 2 + (a.p[1] - b.p[1]) ** 2 + (a.p[2] - b.p[2]) ** 2;
    N.forEach((n) => {
      if (n.app || n.hub) return;
      const near = N.filter((m) => m !== n && m.k === n.k).sort((a, b) => d2(n, a) - d2(n, b)).slice(0, 2);
      near.forEach((m) => add(n.i, m.i));
    });
    for (let i = 0; i < 70; i++) { const a = N[7 + Math.floor(r() * (N.length - 7))], b = N[7 + Math.floor(r() * (N.length - 7))]; if (a.k !== b.k && d2(a, b) < 1100 ** 2) add(a.i, b.i, 0.7); }
    for (let i = 1; i <= 6; i++) add(0, i, 1.6);
    // the hub reaches into every kind: one ordinary sign-in touches all of them
    const pick = (k) => N.filter((n) => n.k === k).sort((a, b) => d2(a, { p: KIND[k].c }) - d2(b, { p: KIND[k].c }))[0];
    this.story = { human: N[0], priv: pick('priv'), svc: pick('svc'), work: pick('work'), cust: pick('cust'), ai: pick('ai') };
    ['svc', 'work', 'cust', 'ai', 'priv'].forEach((k, j) => add(j % 6 + 1, this.story[k].i, 1.2));
    this.storyEdges = [[0, this.story.priv.i], [this.story.priv.i, this.story.svc.i], [this.story.svc.i, this.story.work.i], [this.story.work.i, this.story.cust.i], [this.story.cust.i, this.story.ai.i], [this.story.ai.i, 0]];
    this.storyEdges.forEach(([a, b]) => add(a, b, 1.4));
    // a few connections turn risky in the opening
    this.threat = []; for (let i = 0; i < E.length && this.threat.length < 9; i += 1 + Math.floor(r() * 23)) if (E[i].a > 6) this.threat.push(i);
    this.N = N; this.E = E;
    this.spr = {}; for (const k in KIND) this.spr[k] = glowSprite(KIND[k].rgb);
    this.spr.app = glowSprite('120,182,255'); this.spr.amber = glowSprite('243,178,62'); this.spr.brand = glowSprite('40,160,240');
  }
  rgbOf(n) { return n.k === 'app' ? '120,182,255' : KIND[n.k].rgb; }
  /* o: alpha, near (fade for nodes close to camera), nonHuman, threat, story, wave, conv, targets, t */
  draw(g, cam, o) {
    const t = o.t || 0, A = o.alpha == null ? 1 : o.alpha;
    const P = this.N.map((n) => project(n.p, cam));
    const vis = (n, i) => {
      const p = P[i]; if (!p) return 0;
      let a = clamp((p.z - 60) / 260);                       // fade nodes passing the lens
      if (o.only && !o.only(n)) a *= o.othersAlpha == null ? 0 : o.othersAlpha;
      a *= clamp(1.25 - p.z / 9000);
      if (o.nonHuman != null) a *= HUMANISH[n.k] ? lerp(1, 0.32, o.nonHuman) : lerp(0.85, 1.15, o.nonHuman);
      return a;
    };
    const conv = o.conv || 0;
    const scr = (i) => {
      const p = P[i]; if (!p) return null;
      if (!conv || !o.targets) return p;
      const tg = o.targets[i]; if (!tg) return p;
      const k = E.inOutCubic(clamp(conv * 1.35 - tg.d * 0.35));
      return { x: lerp(p.x, tg.x, k), y: lerp(p.y, tg.y, k), k: lerp(p.k, 0.5, k), z: p.z, cv: k };
    };
    const S2 = this.N.map((n, i) => scr(i));
    g.save(); g.globalCompositeOperation = 'lighter';
    // edges
    g.lineCap = 'round';
    const thr = new Set(this.threat);
    this.E.forEach((e, ei) => {
      const a = S2[e.a], b = S2[e.b]; if (!a || !b) return;
      let al = Math.min(vis(this.N[e.a], e.a), vis(this.N[e.b], e.b)) * 0.16 * e.w * A * (1 - conv);
      if (al < 0.004) return;
      let col = '170,200,255';
      if (o.threat && thr.has(ei)) { col = '243,178,62'; al = lerp(al, 0.65 * A, o.threat); }
      const isStory = o.story && this.storyEdges.some(([x, y]) => (x === e.a && y === e.b) || (x === e.b && y === e.a));
      if (isStory) { col = '60,180,255'; al = lerp(al, 0.85 * A, o.story); }
      if (o.wave) { // brand-blue light travels outward from the centre
        const d = Math.hypot((a.x + b.x) / 2 - FW / 2, (a.y + b.y) / 2 - FH / 2) / 1100;
        const w = clamp(1 - Math.abs(o.wave * 1.3 - d) * 4) * (1 - conv);
        if (w > 0) { col = '40,160,240'; al = Math.max(al, w * 0.75 * A); }
      }
      g.strokeStyle = `rgba(${col},${al.toFixed(3)})`;
      g.lineWidth = Math.max(0.6, Math.min(2.4, 1.1 * Math.sqrt(a.k * b.k))) * (isStory && o.story ? 1.6 : 1);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      if (o.threat && thr.has(ei)) { // a pulse travelling along the risky link
        const u = ((t * 0.9 + ei * 0.37) % 1);
        const x = lerp(a.x, b.x, u), y = lerp(a.y, b.y, u), s = 26 * o.threat;
        g.globalAlpha = o.threat * A; g.drawImage(this.spr.amber, x - s / 2, y - s / 2, s, s); g.globalAlpha = 1;
      }
    });
    // nodes, far to near
    const order = this.N.map((n, i) => i).filter((i) => S2[i]).sort((x, y) => S2[y].z - S2[x].z);
    for (const i of order) {
      const n = this.N[i], p = S2[i];
      let a = vis(n, i) * A; if (a < 0.01) continue;
      const tw = 0.82 + 0.18 * Math.sin(t * n.tw * 2 + n.ph);
      let r = n.size * p.k * (n.hub ? 1 : 1) * tw;
      r = Math.max(1.2, Math.min(r, 90));
      let spr = this.spr[n.k];
      const isStory = o.story && Object.values(this.story).includes(n);
      if (isStory) { r *= lerp(1, 1.8, o.story); a = Math.max(a, o.story * A); }
      if (conv && p.cv != null) { r = lerp(r, 3.1, p.cv); spr = p.cv > 0.5 ? this.spr.brand : spr; }
      const gs = r * 7;
      g.globalAlpha = clamp(a * 0.9); g.drawImage(spr, p.x - gs / 2, p.y - gs / 2, gs, gs);
      g.globalAlpha = clamp(a);
      g.fillStyle = `rgba(${conv && p.cv > 0.5 ? '170,220,255' : this.rgbOf(n)},1)`;
      g.beginPath();
      if ((n.k === 'svc' || n.k === 'work') && r > 2.4) { const s = r * 0.9; rrect(g, p.x - s, p.y - s, s * 2, s * 2, s * 0.35); }
      else if (n.k === 'ai' && r > 2.4) { const s = r * 1.25; g.moveTo(p.x, p.y - s); g.quadraticCurveTo(p.x, p.y, p.x + s, p.y); g.quadraticCurveTo(p.x, p.y, p.x, p.y + s); g.quadraticCurveTo(p.x, p.y, p.x - s, p.y); g.quadraticCurveTo(p.x, p.y, p.x, p.y - s); }
      else g.arc(p.x, p.y, r, 0, 6.2832);
      g.fill();
      if (n.k === 'priv' && r > 2) { g.strokeStyle = `rgba(226,236,255,${(a * 0.7).toFixed(3)})`; g.lineWidth = 1.2; g.beginPath(); g.arc(p.x, p.y, r * 2.1, 0, 6.2832); g.stroke(); }
      if (o.threat && this.threatNodes && this.threatNodes.has(i)) {
        g.globalAlpha = o.threat * a; const s = r * 14; g.drawImage(this.spr.amber, p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    g.restore(); g.globalAlpha = 1;
    return S2;
  }
}
const CONS = new Constellation();
CONS.threatNodes = new Set(CONS.threat.slice(0, 5).map((ei) => CONS.E[ei].b));

/* paint the ordinary desktop the person is looking at */
function paintDesktop(g, a) {
  if (a <= 0) return;
  g.save(); g.globalAlpha = a;
  const bg = g.createLinearGradient(0, 0, 0, FH); bg.addColorStop(0, '#1a2f52'); bg.addColorStop(1, '#0f1d36');
  g.fillStyle = bg; g.fillRect(0, 0, FW, FH);
  g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, FW, 72);
  g.fillStyle = '#9fb0c6'; g.font = '500 26px Inter'; g.fillText('Workspace', 40, 46);
  g.textAlign = 'right'; g.fillText('21:42', FW - 120, 46);
  g.fillStyle = '#2a5f8f'; g.beginPath(); g.arc(FW - 62, 36, 22, 0, 6.28); g.fill();
  g.fillStyle = '#dbe9f7'; g.font = '600 18px Inter'; g.textAlign = 'center'; g.fillText('AM', FW - 62, 43);
  g.fillStyle = '#eef3fa'; g.font = '600 70px "Inter Display"'; g.fillText('Good evening, Alex', FW / 2, 356);
  g.fillStyle = '#a9b8cc'; g.font = '400 30px Inter'; g.fillText('Signed in as alex.morgan@company.com', FW / 2, 414);
  ['Mail', 'Chat', 'Docs', 'Files', 'Cloud', 'Code'].forEach((n, i) => {
    const x = FW / 2 + (i - 2.5) * 200 - 74, y = 526;
    g.fillStyle = 'rgba(255,255,255,.06)'; rrect(g, x, y, 148, 148, 34); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = ['#4aa3ff', '#7b83eb', '#4fc3f7', '#56ccf2', '#9d8cff', '#a8b3c7'][i];
    g.beginPath(); g.arc(x + 74, y + 64, 22, 0, 6.28); g.fill();
    g.fillStyle = '#c9d4e3'; g.font = '500 24px Inter'; g.fillText(n, x + 74, y + 128);
  });
  g.restore();
}

/* ---------------- OPENING (0 - 11.4 s) ---------------- */
const T_OPEN_END = 11.4;
scene(0, T_OPEN_END, (root) => {
  const RECTS = window.DESK_RECTS;
  const foot = el('div', 'fill', root); S(foot, { transformOrigin: '0 0' });
  const fimg = img('assets/desk/f000.jpg', foot, 'fill');
  const masked = el('div', 'fill', foot);
  const box1 = el('div', 'abs', masked); S(box1, { transformOrigin: '0 0', overflow: 'hidden' });
  const scrA = el('canvas', '', box1); scrA.width = FW; scrA.height = FH; S(scrA, { transformOrigin: '0 0', position: 'absolute' });
  const plain = el('div', 'fill', foot);
  const box2 = el('div', 'abs', plain); S(box2, { transformOrigin: '0 0', overflow: 'hidden' });
  const scrB = el('canvas', '', box2); scrB.width = FW; scrB.height = FH; S(scrB, { transformOrigin: '0 0', position: 'absolute' });
  const glowL = el('div', 'fill', foot); // the screen's light on the room
  const full = el('canvas', 'full', root); full.width = FW; full.height = FH;
  const off = document.createElement('canvas'); off.width = FW; off.height = FH; const og = off.getContext('2d');
  const stamp = el('div', 'abs mono', root); S(stamp, { left: '96px', bottom: '84px', fontSize: '19px', letterSpacing: '.12em', color: '#c3d0e0', textTransform: 'uppercase' });
  stamp.textContent = 'Hyderabad  ·  21:42 IST';
  const labels = Object.keys(KIND).map((k) => { const d = el('div', 'chip', root); d.innerHTML = `<i style="background:rgb(${KIND[k].rgb});box-shadow:0 0 12px rgb(${KIND[k].rgb})"></i>${KIND[k].label}`; return { k, d }; });
  const stat = el('div', 'abs', root); S(stat, { left: '0', right: '0', top: '770px', textAlign: 'center' });
  const statK = new Kin(stat, '*82* machine identities for every human.', { style: { position: 'relative', fontSize: '58px', display: 'inline-block' } });
  statK.e.querySelectorAll('.acc').forEach((x) => (x.style.color = 'var(--violet)'));
  const src = el('div', '', stat); S(src, { marginTop: '18px', fontSize: '17px', color: 'var(--t3)' }); src.textContent = 'Source: CyberArk Identity Security Landscape, 2025';

  sfx(0.0, 'room'); sfx(2.55, 'whooshIn', { d: 1.5 }); sfx(4.0, 'reveal'); sfx(8.9, 'tension'); sfx(10.25, 'dive');
  const cam = makeCam({});
  function camAt(t) {
    const pull = E.inOutCubic(seg(t, 4.0, 8.6)), dive = E.inCubic(seg(t, 9.9, 11.3));
    cam.dist = lerp(lerp(1100, 2700, pull), 120, dive);
    cam.yaw = lerp(0, 0.72, pull) + 0.03 * seg(t, 8.6, 10.4) - lerp(0, 0.6, E.inOutCubic(seg(t, 9.6, 11.25)));
    cam.pitch = lerp(0, 0.2, pull) * (1 - E.inOutCubic(seg(t, 9.8, 11.2)));
    const hub = CONS.N[0].p, d2 = E.inOutCubic(seg(t, 9.6, 11.0));
    cam.tx = lerp(0, hub[0], d2); cam.ty = lerp(0, hub[1], d2); cam.tz = lerp(0, hub[2], d2);
    return cam;
  }
  function paintScreen(g, t) {
    g.clearRect(0, 0, FW, FH);
    g.fillStyle = '#050911'; g.fillRect(0, 0, FW, FH);
    const cg = g.createRadialGradient(FW / 2, FH * 0.45, 50, FW / 2, FH / 2, 1300);
    cg.addColorStop(0, 'rgba(18,48,90,.55)'); cg.addColorStop(1, 'rgba(5,9,17,0)'); g.fillStyle = cg; g.fillRect(0, 0, FW, FH);
    const desk = 1 - E.inOutSine(seg(t, 2.85, 3.75));
    const consA = E.inOutSine(seg(t, 2.95, 3.9));
    if (consA > 0) {
      const c = camAt(t);
      const only = t < 4.6 ? (n) => n.hub || n.app : null;
      const oth = clamp(seg(t, 3.6, 5.6));
      CONS.draw(g, c, { t, alpha: consA * (1 - E.inExpo(seg(t, 10.85, 11.35))), only: oth < 1 ? (n) => n.hub || n.app : null, othersAlpha: oth,
        nonHuman: E.inOutSine(seg(t, 6.2, 6.9)) * (1 - E.inOutSine(seg(t, 8.6, 9.2))), threat: E.inOutSine(seg(t, 8.9, 9.5)) });
      // the hub: the identity we follow, with a halo that grows on the dive
      const hp = project(CONS.N[0].p, c);
      if (hp) {
        const hr = 26 * hp.k * (1 + 0.08 * Math.sin(t * 3));
        g.save(); g.globalCompositeOperation = 'lighter';
        g.globalAlpha = consA * 0.9; g.drawImage(CONS.spr.human, hp.x - hr * 4, hp.y - hr * 4, hr * 8, hr * 8);
        g.globalAlpha = consA * clamp(1 - seg(t, 5, 6)); g.strokeStyle = 'rgba(120,210,255,.55)'; g.lineWidth = 2;
        g.beginPath(); g.arc(hp.x, hp.y, hr * 1.5 + 16 * ((t * 0.7) % 1), 0, 6.28); g.stroke();
        g.restore();
        const lab = clamp(seg(t, 3.5, 4.2)) * (1 - seg(t, 5.2, 5.8));
        if (lab > 0) { g.globalAlpha = lab; g.fillStyle = '#cfe6fa'; g.font = '500 30px Inter'; g.textAlign = 'center'; g.fillText('alex.morgan', hp.x, hp.y - hr * 2 - 18); g.globalAlpha = 1; }
      }
    }
    paintDesktop(g, desk);
  }
  return (t) => {
    const fi = Math.min(RECTS.length - 1, Math.floor(t * FPS));
    const r = RECTS[fi]; const rw = r[2], rh = rw * 9 / 16;
    // camera: log-space zoom from the full frame into the monitor, about a fixed point
    const s1 = rw / FW;
    const k = 0.05 * E.inOutSine(seg(t, 0, 2.6)) + 0.95 * E.inCubic(seg(t, 2.55, 4.0));
    const s = Math.pow(s1, k);
    const Px = r[0] / (1 - s1), Py = r[1] / (1 - (rh / FH));
    const winX = Px + (0 - Px) * s, winY = Py + (0 - Py) * s, Z = 1 / s;
    const onFoot = t < 4.02;
    S(foot, { display: onFoot ? 'block' : 'none', transform: `scale(${Z.toFixed(5)}) translate(${(-winX).toFixed(2)}px,${(-winY).toFixed(2)}px)` });
    paintScreen(og, t);
    if (onFoot) {
      const pad = String(fi).padStart(3, '0');
      if (fimg.__src !== pad) { fimg.__src = pad; fimg.src = `assets/desk/f${pad}.jpg`; S(masked, { webkitMaskImage: `url(assets/desk/m${pad}.png)`, maskImage: `url(assets/desk/m${pad}.png)` }); }
      S(masked, { webkitMaskSize: '1920px 1080px', maskSize: '1920px 1080px', maskMode: 'luminance', webkitMaskRepeat: 'no-repeat' });
      for (const b of [box1, box2]) S(b, { left: px(r[0]), top: px(r[1]), width: px(rw), height: px(rh) });
      for (const c of [scrA, scrB]) S(c, { transform: `scale(${(rw / FW).toFixed(5)})` });
      scrA.getContext('2d').drawImage(off, 0, 0);
      const through = E.inOutSine(seg(t, 3.05, 3.85));
      S(plain, { opacity: through.toFixed(3) });
      if (through > 0) scrB.getContext('2d').drawImage(off, 0, 0);
      S(fimg, { filter: `blur(${(E.inCubic(seg(t, 2.9, 4.0)) * 9).toFixed(2)}px) brightness(${(1.38 + 0.3 * seg(t, 3.3, 4)).toFixed(3)}) contrast(1.06)` });
      S(masked, { filter: 'brightness(1.3)' });
      S(glowL, { background: `radial-gradient(40% 45% at ${(r[0] + rw / 2) / FW * 100}% ${(r[1] + rh / 2) / FH * 100}%, rgba(60,150,255,${(0.10 + 0.25 * seg(t, 2.6, 4)).toFixed(3)}), transparent 70%)`, mixBlendMode: 'screen' });
    }
    S(full, { display: onFoot ? 'none' : 'block' });
    if (!onFoot) { const g = full.getContext('2d'); g.clearRect(0, 0, FW, FH); g.drawImage(off, 0, 0); }
    reveal(stamp, win(t, 0.5, 2.7, 0.6, 0.5), 10, 6);
    // category labels beside each family
    const c = camAt(t);
    labels.forEach(({ k, d }, i) => {
      const a = win(t, 4.9 + i * 0.22, 8.3, 0.5, 0.45);
      S(d, { display: a > 0 ? 'inline-flex' : 'none' });
      if (a <= 0) return;
      const p = project(KIND[k].c, c); if (!p) return;
      S(d, { left: px(p.x + 26), top: px(p.y - 20), opacity: a.toFixed(3), transform: `translateY(${((1 - a) * 10).toFixed(1)}px)` });
    });
    statK.update(t, 6.45, 8.75); reveal(src, win(t, 6.9, 8.75, 0.5, 0.45), 8, 6);
  };
});
