/* Deep Algorithms Solutions · 120 s brand film (v2).
   Live action carries the story; product screens arrive at the moments that need them;
   motion graphics (Null Motion vocabulary, GSAP timelines seeked per frame) connect them. */
const SH = {}; window.EDL.shots.forEach((s) => (SH[s.id] = s));

/* ---------- footage ---------- */
function setFoot(im, id, lt, len, extra = '') {
  const s = SH[id]; const n = Math.max(1, Math.round(s.dur * FPS) - 1);
  const f = clamp(Math.floor(lt * FPS) + 1, 1, n);
  const src = `shots/${id}/f${String(f).padStart(4, '0')}.jpg`;
  if (im.__s !== src) { im.__s = src; im.src = src; }
  const p = s.push || [1, 1], k = E.inOutSine(clamp(lt / len)), fo = s.focus || [0.5, 0.5];
  S(im, { transformOrigin: `${fo[0] * 100}% ${fo[1] * 100}%`, transform: `scale(${lerp(p[0], p[1], k).toFixed(4)}) ${extra}` });
}
/* entrance: a hair-line of light wipes the new picture in (the film's connective device) */
function entrance(root, line, t, at, o) {
  if (o.in === 'wipe') {
    const p = E.inOutCubic(seg(t, at, at + (o.inD || 0.5)));
    S(root, { clipPath: p < 1 ? `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)` : 'none' });
    S(line, { display: p > 0 && p < 1 ? 'block' : 'none', left: px(p * FW - 2) });
  } else if (o.in === 'fade') {
    S(root, { opacity: E.inOutSine(seg(t, at, at + (o.inD || 0.5))).toFixed(3) });
  }
}
function shot(id, at, len, o = {}) {
  if (o.in === 'wipe') sfx(at, 'wipe');
  return layer(at, at + len, (root) => {
    const im = img(`shots/${id}/f0001.jpg`, root, 'foot');
    const line = el('div', 'wipe-line', root); S(line, { display: 'none' });
    const kids = o.build ? o.build(root) : null;
    return (t) => { setFoot(im, id, t - at, len); entrance(root, line, t, at, o); if (kids) kids(t); };
  });
}

/* ---------- product lockup (Null Motion: guide line, squash-settle mark, masked name, blur-in words, sheen) ---------- */
function lockup(a, b, product, desc) {
  sfx(a + 0.25, 'lockup');
  return layer(a, b, (root) => {
    const scrim = el('div', 'scrim-bl', root);
    const w = el('div', 'lock', root);
    const isZen = product === 'zenstra';
    w.innerHTML = `<div class="eyebrow"><i></i>A Deep Algorithms Solutions product</div><div class="guide"></div>
      <div class="row"><div class="mk ${isZen ? 'dark' : ''}"><img src="${isZen ? 'assets/zen-mark.png' : 'assets/adapid.png'}"></div>
      <div class="name"><span>${isZen ? 'Zenstra AI' : 'adapID AI'}</span><i class="sheen"></i></div></div>
      <div class="desc">${desc.split(' ').map((x) => `<span class="w">${x} </span>`).join('')}</div>`;
    const q = (s) => w.querySelector(s), words = [...w.querySelectorAll('.desc .w')];
    const D = b - a;
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 0)
      .fromTo(q('.guide'), { scaleX: 0 }, { scaleX: 1, duration: 0.75, ease: 'power3.inOut' }, 0.05)
      .fromTo(q('.eyebrow'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.12)
      .fromTo(q('.mk'), { scaleX: 0.9, scaleY: 1.08, y: 18, opacity: 0, filter: 'blur(6px)' }, { scaleX: 1.06, scaleY: 0.95, y: -3, opacity: 1, filter: 'blur(0px)', duration: 0.42, ease: 'power3.out' }, 0.22)
      .to(q('.mk'), { scaleX: 1, scaleY: 1, y: 0, duration: 0.36, ease: 'back.out(1.55)' }, 0.64)
      .fromTo(q('.name span'), { yPercent: 108 }, { yPercent: 0, duration: 0.85, ease: 'power4.out' }, 0.3)
      .fromTo(words, { opacity: 0, y: 18, filter: 'blur(10px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, stagger: 0.06, ease: 'power3.out' }, 0.7)
      .fromTo(q('.sheen'), { left: '-30%', opacity: 0 }, { left: '118%', opacity: 0.85, duration: 0.85, ease: 'power3.inOut' }, 1.2)
      .to(q('.sheen'), { opacity: 0, duration: 0.2 }, 1.9)
      .to(w, { opacity: 0, y: -12, filter: 'blur(10px)', duration: 0.5, ease: 'power2.in' }, D - 0.55)
      .to(scrim, { opacity: 0, duration: 0.5 }, D - 0.5);
    return (t) => tl.seek(clamp(t - a, 0, D), false);
  });
}

/* ---------- the connection grid: four people, one network ---------- */
const GTAGS = [['Employee · signing in', '#3cc8f6'], ['Workload · calling a service', '#9d8cff'], ['Customer · moving money', '#3fd99b'], ['Professional · working with AI', '#93a2ff']];
function grid(a, b, ids, thesis, mode) {
  return layer(a, b, (root) => {
    S(root, { background: '#05080e' });
    const M = 28, G = 18, TW = (FW - 2 * M - G) / 2, TH = (FH - 2 * M - G) / 2;
    const R = [[M, M], [M + TW + G, M], [M, M + TH + G], [M + TW + G, M + TH + G]];
    const tiles = ids.map((id, i) => {
      const d = el('div', 'tile2', root); const im = img(`shots/${id}/f0001.jpg`, d);
      const tg = el('div', 'tag', d); tg.style.setProperty('--c', GTAGS[i][1]); tg.innerHTML = `<i></i>${GTAGS[i][0]}`;
      return { d, im, id, tg };
    });
    const svg = el('div', 'fill', root);
    const pill = el('div', 'thesis', root);
    pill.innerHTML = thesis.split(' ').map((x) => `<span class="w">${x} </span>`).join('');
    const words = [...pill.querySelectorAll('.w')];
    const C = R.map(([x, y]) => [x + TW / 2, y + TH / 2]);
    const loop = [0, 1, 3, 2, 0];
    sfx(a + 0.05, 'gridIn'); sfx(a + 0.55, 'link');
    return (t) => {
      const lt = t - a, D = b - a;
      tiles.forEach((T, i) => {
        const p = E.outBack(seg(lt, 0.0 + i * 0.07, 0.55 + i * 0.07));
        let [x, y] = R[i], w = TW, h = TH, op = clamp(p * 1.4);
        if (mode === 'zoomA' && i === 0) { // the first person becomes the next shot
          const z = E.inOutCubic(seg(lt, D - 0.55, D)); x = lerp(x, 0, z); y = lerp(y, 0, z); w = lerp(TW, FW, z); h = lerp(TH, FH, z);
        }
        if (mode === 'zoomA' && i > 0) op *= 1 - E.inOutSine(seg(lt, D - 0.55, D - 0.2));
        if (mode === 'collapse') { const z = E.inOutCubic(seg(lt, D - 0.7, D)); x = lerp(x, FW / 2 - w * 0.06, z); y = lerp(y, FH / 2 - h * 0.06, z); w *= lerp(1, 0.12, z); h *= lerp(1, 0.12, z); op *= 1 - z; }
        S(T.d, { left: px(x), top: px(y), width: px(w), height: px(h), opacity: op.toFixed(3), transform: `scale(${lerp(1.08, 1, clamp(p)).toFixed(4)})`, borderRadius: mode === 'zoomA' && i === 0 ? px(lerp(14, 0, E.inOutCubic(seg(lt, D - 0.55, D)))) : '14px' });
        setFoot(T.im, T.id, lt, D);
        S(T.tg, { opacity: (clamp(seg(lt, 0.45 + i * 0.08, 0.8 + i * 0.08)) * (1 - seg(lt, D - 0.6, D - 0.35))).toFixed(3) });
      });
      // the link: a line through all four people, with light travelling along it
      const dr = E.inOutCubic(seg(lt, 0.45, 1.25)) * (1 - seg(lt, D - 0.5, D - 0.2));
      let d = ''; loop.forEach((k, j) => (d += (j ? 'L' : 'M') + C[k][0] + ' ' + C[k][1] + ' '));
      const u = ((Math.max(0, lt - 0.5) * 0.55) % 1), segs = 4, si = Math.min(3, Math.floor(u * segs)), sf = u * segs - si;
      const pA = C[loop[si]], pB = C[loop[si + 1]], sx = lerp(pA[0], pB[0], sf), sy = lerp(pA[1], pB[1], sf);
      htm(svg, `<svg width="1920" height="1080" style="position:absolute;inset:0"><path d="${d}" fill="none" stroke="rgba(150,210,255,.85)" stroke-width="2" pathLength="1" stroke-dasharray="${dr.toFixed(3)} 1" style="filter:drop-shadow(0 0 8px rgba(60,180,255,.9))"/>
        ${C.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${(7 * dr).toFixed(1)}" fill="#fff" style="filter:drop-shadow(0 0 10px #3cb4ff)"/>`).join('')}
        ${dr > 0.9 ? `<circle cx="${sx}" cy="${sy}" r="6" fill="#fff6df" style="filter:drop-shadow(0 0 14px rgba(255,214,140,.95))"/>` : ''}</svg>`);
      const pin = E.outCubic(seg(lt, 0.55, 1.0)), pout = 1 - E.inOutSine(seg(lt, D - 0.6, D - 0.3));
      S(pill, { opacity: (pin * pout).toFixed(3), transform: `translate(-50%,-50%) scaleX(${lerp(0.93, 1, E.outBack(seg(lt, 0.55, 1.0))).toFixed(4)})` });
      words.forEach((wd, i) => { const p = E.outCubic(seg(lt, 0.7 + i * 0.06, 1.2 + i * 0.06)); S(wd, { opacity: p.toFixed(3), filter: p < 1 ? `blur(${((1 - p) * 8).toFixed(1)}px)` : 'none', transform: `translateY(${((1 - p) * 14).toFixed(1)}px)` }); });
    };
  });
}

/* ---------- brand ---------- */
function brand(a, b) {
  sfx(a + 0.35, 'logo');
  return layer(a, b, (root) => {
    S(root, { background: '#04070c' });
    const bg = img('shots/s25/f0001.jpg', root, 'foot');
    const veil = el('div', 'fill', root); S(veil, { background: 'radial-gradient(70% 70% at 50% 48%, rgba(4,7,12,.72), rgba(4,7,12,.95))' });
    const w = el('div', 'brand', root);
    w.innerHTML = `<img class="bm" src="assets/mark.png"><div class="bn">DEEP ALGORITHMS SOLUTIONS</div>
      <div class="bt">Securing identity and AI in the connected world.</div><div class="bl"></div>
      <div class="bp"><div><span class="tile" style="width:46px;height:46px;border-radius:12px"><img src="assets/adapid.png"></span><b>adapID AI</b><em>|</em>Identity Security</div>
      <div><img src="assets/zen-mark.png" style="width:44px;height:40px;object-fit:contain"><img src="assets/zen-wordmark-light.png" style="height:21px"><em>|</em>Secure AI Interactions</div></div>
      <div class="bu">DEEPALGORITHMS.IO</div>`;
    const q = (s) => w.querySelector(s);
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0)
      .fromTo(q('.bm'), { y: 40, scale: 0.86, opacity: 0, filter: 'blur(16px)' }, { y: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.9, ease: 'power4.out' }, 0.2)
      .fromTo(q('.bn'), { letterSpacing: '.42em', opacity: 0, filter: 'blur(10px)' }, { letterSpacing: '.16em', opacity: 1, filter: 'blur(0px)', duration: 1.1, ease: 'power3.out' }, 0.55)
      .fromTo(q('.bt'), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 1.05)
      .fromTo(q('.bl'), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power3.inOut' }, 1.3)
      .fromTo([...w.querySelectorAll('.bp > div')], { opacity: 0, y: 18, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, stagger: 0.14, ease: 'power3.out' }, 1.55)
      .fromTo(q('.bu'), { opacity: 0 }, { opacity: 1, duration: 0.6 }, 2.1);
    return (t) => {
      tl.seek(clamp(t - a, 0, b - a), false);
      setFoot(bg, 's25', t - 113.0, 7.0, '');
      S(bg, { filter: 'blur(14px) brightness(.55) saturate(.7)' });
    };
  });
}

/* ---------- the edit ---------- */
// 1 · The world runs on identities
shot('s01', 0.0, 2.9);
shot('s02', 2.9, 2.3); shot('s03', 5.2, 2.1); shot('s04', 7.3, 2.2); shot('s05', 9.5, 1.9); shot('s06', 11.4, 1.8);
grid(12.9, 15.5, ['g1a', 'g1b', 'g1c', 'g1d'], 'Every connection carries trust.', 'zoomA');
// 2 · adapID AI · Continuous Identity Risk Management
shot('s07', 15.45, 3.35); shot('s08', 18.8, 3.6);
UI.portal(22.1, 24.6); UI.cirm(24.5, 31.1);
shot('s09', 31.0, 2.4, { in: 'wipe' }); shot('s10', 33.3, 6.0);
lockup(33.5, 38.9, 'adapid', 'Continuous Identity Risk Management');
// 3 · adapID AI · Non-Human Identity Security for AWS
shot('s11', 39.3, 3.0, { in: 'fade', inD: 0.35 }); shot('s12', 42.3, 2.4); shot('s13', 44.7, 2.6);
UI.nhi(47.1, 54.6);
shot('s14', 54.5, 2.6, { in: 'wipe' }); shot('s15', 57.1, 6.1);
lockup(57.2, 62.9, 'adapid', 'Non-Human Identity Security for AWS');
// 4 · adapID AI · Identity Fraud Prevention
shot('s16', 63.2, 3.1, { in: 'fade', inD: 0.35 });
UI.bank(66.1, 69.2);
shot('s17', 69.1, 2.2, { in: 'wipe' }); shot('s18', 71.3, 3.1);
UI.fraud(74.3, 81.1);
shot('s19', 80.9, 5.6, { in: 'wipe' });
lockup(81.4, 86.1, 'adapid', 'Identity Fraud Prevention');
// 5 · Zenstra AI · Secure AI Interactions
shot('s20', 86.4, 3.5, { in: 'fade', inD: 0.35 });
UI.ai(89.7, 101.0);
shot('s21', 100.8, 7.6, { in: 'wipe', build: UI.zenRecord });
lockup(102.9, 108.1, 'zenstra', 'Secure AI Interactions');
// 6 · The company
shot('s22', 108.3, 2.1, { in: 'fade', inD: 0.3 }); shot('s23', 110.4, 1.7); shot('s24', 112.1, 1.4);
grid(113.3, 115.25, ['g2a', 'g2b', 'g2c', 'g2d'], 'Every identity deserves protection.', 'collapse');
brand(114.75, 120.01);
