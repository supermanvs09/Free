/* Deep Algorithms Solutions · brand advertisement (v3, light).
   Real people carry the story; product screens are light, Kario-style explainers;
   motion graphics follow Null Motion's vocabulary (GSAP timelines seeked per frame). */
const SH = {}; window.EDL.shots.forEach((s) => (SH[s.id] = s));
const BRAND = '#0068ac', INK = '#0f172a';

/* ---------- footage ---------- */
function setFoot(im, id, lt, len, extra = '') {
  const s = SH[id]; const n = Math.max(1, Math.round(s.dur * FPS) - 1);
  const f = clamp(Math.floor(lt * FPS) + 1, 1, n);
  const src = `shots/${id}/f${String(f).padStart(4, '0')}.jpg`;
  if (im.__s !== src) { im.__s = src; im.src = src; }
  const p = s.push || [1, 1], k = E.inOutSine(clamp(lt / len)), fo = s.focus || [0.5, 0.5];
  S(im, { transformOrigin: `${fo[0] * 100}% ${fo[1] * 100}%`, transform: `scale(${lerp(p[0], p[1], k).toFixed(4)}) ${extra}` });
}
function entrance(root, line, t, at, o) {
  if (o.in === 'wipe') {
    const p = E.inOutCubic(seg(t, at, at + (o.inD || 0.5)));
    S(root, { clipPath: p < 1 ? `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)` : 'none' });
    S(line, { display: p > 0 && p < 1 ? 'block' : 'none', left: px(p * FW - 2) });
  } else if (o.in === 'fade') S(root, { opacity: E.inOutSine(seg(t, at, at + (o.inD || 0.5))).toFixed(3) });
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

/* ---------- light lower-third naming a capability ---------- */
function lowerThird(a, b, text) {
  sfx(a + 0.1, 'lockup');
  return layer(a, b, (root) => {
    const w = el('div', 'abs', root);
    S(w, { left: '96px', bottom: '92px', display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 26px 14px 14px', borderRadius: '20px', background: 'rgba(255,255,255,.96)', boxShadow: '0 24px 50px -20px rgba(15,23,42,.45)' });
    w.innerHTML = `<span style="width:52px;height:52px;border-radius:14px;overflow:hidden;box-shadow:0 0 0 1px #e8edf3"><img src="assets/adapid.png" style="width:100%;height:100%;object-fit:contain"></span>
      <b style="font:700 26px/1 var(--disp);letter-spacing:-.02em;color:${INK}">adapID AI</b><i style="width:1.5px;height:30px;background:#cbd5e1"></i><span class="lt" style="font:500 25px/1 var(--sans);color:#334155;white-space:nowrap">${text}</span>`;
    const lt = w.querySelector('.lt');
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(w, { opacity: 0, y: 24, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.5)' }, 0)
      .fromTo(lt, { opacity: 0, x: -14, filter: 'blur(6px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.5, ease: 'power3.out' }, 0.25)
      .to(w, { opacity: 0, y: 12, duration: 0.35, ease: 'power2.in' }, b - a - 0.35);
    return (t) => tl.seek(clamp(t - a, 0, b - a), false);
  });
}

/* ---------- PhonePe-clear title card: framed live shot + two-weight headline + brand bar ---------- */
function titleCard(a, b, footId, o) {
  sfx(a + 0.05, 'gridIn'); sfx(a + 0.9, 'lockup');
  return layer(a, b, (root) => {
    S(root, { background: 'linear-gradient(120deg, #f7f9fd 0%, #eef3fa 60%, #e6eef9 100%)' });
    const blob = el('div', 'abs', root); S(blob, { right: '-200px', top: '-260px', width: '1000px', height: '1000px', borderRadius: '50%', background: `radial-gradient(circle, ${o.tint}22 0%, ${o.tint}00 65%)` });
    const fr = el('div', 'abs', root); S(fr, { left: '96px', top: '110px', width: '880px', height: '860px', borderRadius: '34px', overflow: 'hidden', boxShadow: '0 50px 90px -40px rgba(15,23,42,.45)' });
    const im = img(`shots/${footId}/f0001.jpg`, fr); S(im, { position: 'absolute', left: '-480px', top: '-110px', width: '1920px', height: '1080px', objectFit: 'cover' });
    const tx = el('div', 'abs', root); S(tx, { left: '1060px', top: '230px', width: '780px' });
    const heads = o.lines.map(([w, txt]) => `<div class="hl" style="overflow:hidden;padding-bottom:6px"><div style="font:${w} 84px/1.04 var(--disp);letter-spacing:-.04em;color:${INK}">${txt}</div></div>`).join('');
    tx.innerHTML = `<div class="ey" style="font:600 18px/1 var(--mono);letter-spacing:.22em;text-transform:uppercase;color:${o.tint};margin-bottom:26px">${o.eyebrow}</div>${heads}
      <div class="chips" style="display:flex;flex-direction:column;gap:12px;margin-top:34px">${(o.chips || []).map((c) => `<div class="ch" style="display:flex;align-items:center;gap:14px;font:500 26px/1.2 var(--sans);color:#334155"><i style="width:10px;height:10px;border-radius:50%;background:${o.tint}"></i>${c}</div>`).join('')}</div>`;
    const bar = el('div', 'abs', root); S(bar, { left: '1060px', right: '0', top: o.chips ? '760px' : '640px', height: '86px', borderRadius: '43px 0 0 43px', background: o.barBg, display: 'flex', alignItems: 'center', padding: '0 44px', gap: '18px', color: '#fff', font: '600 30px/1 var(--sans)', letterSpacing: '-.01em' });
    bar.innerHTML = o.bar;
    const lg = el('div', 'abs', root); S(lg, { right: '96px', bottom: '64px', display: 'flex', alignItems: 'center', gap: '14px' }); lg.innerHTML = o.logo;
    const q = (s) => [...root.querySelectorAll(s)];
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(fr, { clipPath: 'inset(8% 8% 8% 8% round 34px)', scale: 1.04 }, { clipPath: 'inset(0% 0% 0% 0% round 34px)', scale: 1, duration: 0.9, ease: 'power3.out' }, 0)
      .fromTo(q('.ey'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }, 0.25)
      .fromTo(q('.hl > div'), { yPercent: 110 }, { yPercent: 0, duration: 0.8, stagger: 0.12, ease: 'power4.out' }, 0.35)
      .fromTo(q('.ch'), { opacity: 0, x: -16, filter: 'blur(6px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.5, stagger: 0.18, ease: 'power3.out' }, 1.0)
      .fromTo(bar, { x: 860 }, { x: 0, duration: 0.75, ease: 'power4.out' }, 0.8)
      .fromTo(lg, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)' }, 1.3)
      .to([tx, bar, lg], { opacity: 0, duration: 0.4, ease: 'power2.in' }, b - a - 0.45)
      .to(fr, { scale: 1.02, opacity: 0, duration: 0.45, ease: 'power2.in' }, b - a - 0.45);
    return (t) => { tl.seek(clamp(t - a, 0, b - a), false); setFoot(im, footId, t - a, b - a); };
  });
}

/* ---------- the connection grid, light ---------- */
const GTAGS = [['Employee', '#0284c7'], ['Cloud workload', '#6d5ae6'], ['Customer', '#059669'], ['AI at work', '#4f46e5']];
function grid(a, b, ids, thesis, mode) {
  return layer(a, b, (root) => {
    S(root, { background: '#f3f6fb' });
    const M = 30, G = 20, TW = (FW - 2 * M - G) / 2, TH = (FH - 2 * M - G) / 2;
    const R = [[M, M], [M + TW + G, M], [M, M + TH + G], [M + TW + G, M + TH + G]];
    const tiles = ids.map((id, i) => {
      const d = el('div', 'tile2', root); S(d, { borderRadius: '20px', boxShadow: '0 30px 60px -36px rgba(15,23,42,.5)' });
      const im = img(`shots/${id}/f0001.jpg`, d);
      const tg = el('div', '', d); S(tg, { position: 'absolute', left: '22px', bottom: '20px', padding: '10px 16px', borderRadius: '12px', background: 'rgba(255,255,255,.94)', font: '600 18px/1 var(--sans)', color: INK, display: 'flex', alignItems: 'center', gap: '10px' });
      tg.innerHTML = `<i style="width:9px;height:9px;border-radius:50%;background:${GTAGS[i][1]}"></i>${GTAGS[i][0]}`;
      return { d, im, id, tg };
    });
    const svg = el('div', 'fill', root);
    const pill = el('div', 'thesis', root);
    S(pill, { background: '#ffffff', color: INK, border: '1px solid #e2e8f0', boxShadow: '0 30px 60px -24px rgba(15,23,42,.35)' });
    pill.innerHTML = thesis.split(' ').map((x) => `<span class="w">${x} </span>`).join('');
    const words = [...pill.querySelectorAll('.w')];
    const C = R.map(([x, y]) => [x + TW / 2, y + TH / 2]), loop = [0, 1, 3, 2, 0];
    sfx(a + 0.05, 'gridIn'); sfx(a + 0.55, 'link');
    return (t) => {
      const lt = t - a, D = b - a;
      tiles.forEach((T, i) => {
        const p = E.outBack(seg(lt, i * 0.07, 0.55 + i * 0.07));
        let [x, y] = R[i], w = TW, h = TH, op = clamp(p * 1.4);
        if (mode === 'zoomA' && i === 0) { const z = E.inOutCubic(seg(lt, D - 0.55, D)); x = lerp(x, 0, z); y = lerp(y, 0, z); w = lerp(TW, FW, z); h = lerp(TH, FH, z); }
        if (mode === 'zoomA' && i > 0) op *= 1 - E.inOutSine(seg(lt, D - 0.55, D - 0.2));
        if (mode === 'collapse') { const z = E.inOutCubic(seg(lt, D - 0.7, D)); x = lerp(x, FW / 2 - w * 0.06, z); y = lerp(y, FH / 2 - h * 0.06, z); w *= lerp(1, 0.12, z); h *= lerp(1, 0.12, z); op *= 1 - z; }
        S(T.d, { left: px(x), top: px(y), width: px(w), height: px(h), opacity: op.toFixed(3), transform: `scale(${lerp(1.08, 1, clamp(p)).toFixed(4)})` });
        setFoot(T.im, T.id, lt, D);
        S(T.tg, { opacity: (clamp(seg(lt, 0.45 + i * 0.08, 0.8 + i * 0.08)) * (1 - seg(lt, D - 0.6, D - 0.35))).toFixed(3) });
      });
      const dr = E.inOutCubic(seg(lt, 0.45, 1.25)) * (1 - seg(lt, D - 0.5, D - 0.2));
      let d = ''; loop.forEach((k, j) => (d += (j ? 'L' : 'M') + C[k][0] + ' ' + C[k][1] + ' '));
      const u = (Math.max(0, lt - 0.5) * 0.55) % 1, si = Math.min(3, Math.floor(u * 4)), sf = u * 4 - si;
      const pA = C[loop[si]], pB = C[loop[si + 1]];
      htm(svg, `<svg width="1920" height="1080" style="position:absolute;inset:0"><path d="${d}" fill="none" stroke="${BRAND}" stroke-width="3" pathLength="1" stroke-dasharray="${dr.toFixed(3)} 1" style="filter:drop-shadow(0 0 6px rgba(0,104,172,.45))"/>
        ${C.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${(8 * dr).toFixed(1)}" fill="#fff" stroke="${BRAND}" stroke-width="3"/>`).join('')}
        ${dr > 0.9 ? `<circle cx="${lerp(pA[0], pB[0], sf)}" cy="${lerp(pA[1], pB[1], sf)}" r="7" fill="${BRAND}" style="filter:drop-shadow(0 0 10px rgba(0,104,172,.8))"/>` : ''}</svg>`);
      const pin = E.outCubic(seg(lt, 0.55, 1.0)), pout = 1 - E.inOutSine(seg(lt, D - 0.6, D - 0.3));
      S(pill, { opacity: (pin * pout).toFixed(3), transform: `translate(-50%,-50%) scaleX(${lerp(0.93, 1, E.outBack(seg(lt, 0.55, 1.0))).toFixed(4)})` });
      words.forEach((wd, i) => { const p = E.outCubic(seg(lt, 0.7 + i * 0.06, 1.2 + i * 0.06)); S(wd, { opacity: p.toFixed(3), filter: p < 1 ? `blur(${((1 - p) * 8).toFixed(1)}px)` : 'none', transform: `translateY(${((1 - p) * 14).toFixed(1)}px)` }); });
    };
  });
}

/* ---------- logo: the D assembles itself, then opens into the full logo ---------- */
function logoReveal(a, b) {
  sfx(a + 0.35, 'logoA'); sfx(a + 1.75, 'logo');
  return layer(a, b, (root) => {
    S(root, { background: 'radial-gradient(70% 70% at 50% 42%, #ffffff 0%, #f1f5fa 60%, #e8eef6 100%)' });
    const D = 300, CX = 960, CY = 430;
    const st = el('div', 'abs', root); S(st, { left: px(CX - D / 2), top: px(CY - D / 2), width: px(D), height: px(D), transformOrigin: '50% 50%' });
    const bowl = img('assets/mark-bowl@4x.png', st, 'abs'), diag = img('assets/mark-diag@4x.png', st, 'abs');
    [bowl, diag].forEach((i) => S(i, { left: '0', top: '0', width: px(D), height: px(D) }));
    const sheen = el('div', 'abs', st); S(sheen, { inset: '0', background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,.85) 50%, transparent 65%)', mixBlendMode: 'screen', webkitMaskImage: 'url(assets/mark@4x.png)', maskImage: 'url(assets/mark@4x.png)', webkitMaskSize: '100% 100%', maskSize: '100% 100%' });
    const lockW = 860, lockH = lockW * 142 / 640, LX = CX - lockW / 2, LY = 330;
    const lock = img('assets/logo-lockup@2x.png', root, 'abs'); S(lock, { left: px(LX), top: px(LY), width: px(lockW), height: px(lockH) });
    const tx = el('div', 'abs', root); S(tx, { left: '0', right: '0', top: px(LY + lockH + 44), textAlign: 'center' });
    tx.innerHTML = `<div class="nm" style="font:600 40px/1 var(--disp);letter-spacing:-.02em;color:${INK}">Deep Algorithms Solutions</div>
      <div class="ps" style="font:400 28px/1.3 var(--sans);color:#475569;margin-top:16px">Securing identity and AI in the connected world.</div>
      <div class="rl" style="width:520px;height:1px;margin:40px auto 34px;background:linear-gradient(90deg,transparent,#cbd5e1,transparent)"></div>
      <div class="pr" style="display:flex;justify-content:center;gap:64px;align-items:center;font:500 24px/1 var(--sans);color:#334155">
        <span style="display:flex;align-items:center;gap:14px"><span style="width:46px;height:46px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px #e2e8f0"><img src="assets/adapid.png" style="width:100%;height:100%;object-fit:contain"></span><b style="color:${INK}">adapID AI</b><span style="color:#94a3b8">|</span>Identity Security</span>
        <span style="display:flex;align-items:center;gap:14px"><span style="width:46px;height:46px;border-radius:12px;background:#14162b;display:grid;place-items:center"><img src="assets/zen-mark.png" style="width:30px;height:27px;object-fit:contain"></span><img src="assets/zen-wordmark-dark.png" style="height:20px"><span style="color:#94a3b8">|</span>Secure AI Interactions</span></div>
      <div class="ur" style="margin-top:54px;font:600 18px/1 var(--mono);letter-spacing:.2em;color:#64748b">DEEPALGORITHMS.IO</div>`;
    const q = (s) => tx.querySelector(s);
    // where the D sits inside the lockup
    const mS = lockH / D, mX = LX + lockH / 2 - CX, mY = LY + lockH / 2 - CY;
    const tl = gsap.timeline({ paused: true });
    tl.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.35 }, 0)
      .fromTo(diag, { x: -170, y: -170, opacity: 0, filter: 'blur(10px)' }, { x: 0, y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.75, ease: 'power4.out' }, 0.25)
      .fromTo(bowl, { clipPath: 'inset(0 100% 0 0)', opacity: 0.0 }, { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.8, ease: 'power3.inOut' }, 0.55)
      .fromTo(st, { scale: 0.92 }, { scale: 1.05, duration: 0.5, ease: 'power3.out' }, 1.2).to(st, { scale: 1, duration: 0.45, ease: 'back.out(2)' }, 1.7)
      .fromTo(sheen, { backgroundPosition: '-300px 0', opacity: 0 }, { backgroundPosition: '300px 0', opacity: 1, duration: 0.8, ease: 'power2.inOut' }, 1.5).to(sheen, { opacity: 0, duration: 0.2 }, 2.3)
      .to(st, { x: mX, y: mY, scale: mS, duration: 0.85, ease: 'power3.inOut' }, 2.4)
      .fromTo(lock, { clipPath: `inset(0 100% 0 ${(lockH / lockW * 100).toFixed(2)}%)`, opacity: 0 }, { clipPath: 'inset(0 0% 0 0%)', opacity: 1, duration: 0.9, ease: 'power3.out' }, 3.05)
      .to(st, { opacity: 0, duration: 0.2 }, 3.3)
      .fromTo(q('.nm'), { opacity: 0, y: 16, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out' }, 3.5)
      .fromTo(q('.ps'), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, 3.9)
      .fromTo(q('.rl'), { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'power3.inOut' }, 4.3)
      .fromTo([...tx.querySelectorAll('.pr > span')], { opacity: 0, y: 14, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, stagger: 0.15, ease: 'power3.out' }, 4.6)
      .fromTo(q('.ur'), { opacity: 0 }, { opacity: 1, duration: 0.6 }, 5.2);
    return (t) => tl.seek(clamp(t - a, 0, b - a), false);
  });
}

/* ---------- the edit ---------- */
// Opening: the people, then the connection between them
shot('s01', 0.0, 2.8); shot('s02', 2.8, 1.8); shot('s03', 4.6, 1.9); shot('s04', 6.5, 1.7); shot('s05', 8.2, 2.2);
grid(10.2, 14.45, ['g1a', 'g1b', 'g1c', 'g1d'], 'Every connection carries trust.', 'zoomA');
// adapID AI, introduced once
titleCard(14.3, 19.8, 't1', { tint: '#0284c7', eyebrow: 'Identity security', lines: [[300, 'Every identity,'], [700, 'human and machine.']],
  chips: ['Continuous Identity Risk Management', 'Non-Human Identity Security for AWS', 'Identity Fraud Prevention'], barBg: 'linear-gradient(90deg,#0068ac,#0284c7)',
  bar: '<span style="width:52px;height:52px;border-radius:13px;background:#fff;overflow:hidden;display:grid;place-items:center"><img src="assets/adapid.png" style="width:100%;height:100%;object-fit:contain"></span>adapID AI', logo: '' });
// A · Continuous Identity Risk Management
shot('s07', 19.7, 3.6, { in: 'fade', inD: 0.3 }); lowerThird(19.9, 22.6, 'Continuous Identity Risk Management');
UI.cirm(22.7, 31.45);
shot('s08', 30.9, 2.4, { in: 'wipe' });
// B · Non-Human Identity Security for AWS
shot('s09', 33.2, 3.5); lowerThird(33.4, 36.0, 'Non-Human Identity Security for AWS');
UI.nhi(36.1, 45.05);
shot('s10', 44.5, 2.6, { in: 'wipe' });
// C · Identity Fraud Prevention: a real payment, then what the bank can see
shot('s11', 47.0, 2.5); lowerThird(47.2, 49.4, 'Identity Fraud Prevention');
shot('p1', 49.5, 3.6); shot('p2', 53.1, 3.2); shot('p3', 56.3, 4.1);
UI.fraud(59.8, 66.05);
// Zenstra AI · Secure AI Interactions
shot('s12', 65.5, 3.8, { in: 'wipe' });
UI.ai(68.7, 80.45);
UI.zenConsole(79.9, 84.3);
titleCard(84.2, 89.9, 't2', { tint: '#4f46e5', eyebrow: 'Secure AI interactions', lines: [[300, 'Use AI freely.'], [700, 'Keep secrets inside.']], barBg: 'linear-gradient(90deg,#14162b,#3b3f8f)',
  bar: '<img src="assets/zen-mark.png" style="width:44px;height:40px;object-fit:contain"><span style="font-weight:700">Zenstra AI</span><span style="opacity:.6">·</span><span style="font-weight:500">Secure AI Interactions</span>', logo: '' });
// The company
grid(89.8, 92.65, ['g2a', 'g2b', 'g2c', 'g2d'], 'Every identity deserves protection.', 'collapse');
logoReveal(92.45, 104.01);
