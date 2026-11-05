/* Finale (82.4 - 96 s): every story was one identity among many. The constellation returns,
   the five stories link up, the campaign line lands and the nodes resolve into the company mark. */
const T_F = { a: 82.4, b: 96.01 };
window.MARK_READY = loadImage('assets/mark.png').then((im) => {
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 160, 160);
  const d = g.getImageData(0, 0, 160, 160).data, pts = [];
  for (let y = 2; y < 160; y += 7) for (let x = 2; x < 160; x += 7) { const i = (y * 160 + x) * 4; if (d[i + 3] > 140 && d[i + 2] > 90) pts.push([x, y]); }
  window.MARK_PTS = pts;
});
scene(T_F.a, T_F.b, (root) => {
  S(root, { background: 'radial-gradient(90% 80% at 50% 45%, #0a1528 0%, #04070d 70%)' });
  const cv = el('canvas', 'full', root); cv.width = FW; cv.height = FH; const g = cv.getContext('2d');
  const scrim = el('div', 'fill', root);
  const STORY = { human: 'Microsoft 365 session', priv: 'Directory privilege', svc: 'Service account', work: 'AWS workload', cust: 'Banking customer', ai: 'AI prompt' };
  const tags = Object.keys(STORY).map((k) => { const d = el('div', 'chip', root); S(d, { fontSize: '16px', padding: '8px 13px' }); d.innerHTML = `<i style="background:rgb(${KIND[k].rgb});box-shadow:0 0 10px rgb(${KIND[k].rgb})"></i>${STORY[k]}`; return { k, d }; });
  const k1 = new Kin(root, 'Every identity tells a story.', { style: { left: '0', right: '0', top: '410px', textAlign: 'center', fontSize: '72px' } });
  const k2 = new Kin(root, 'Every interaction creates risk.', { style: { left: '0', right: '0', top: '500px', textAlign: 'center', fontSize: '72px' } });
  const k3 = new Kin(root, 'Every connection needs *intelligence.*', { style: { left: '0', right: '0', top: '455px', textAlign: 'center', fontSize: '76px' } });
  k3.e.querySelectorAll('.acc').forEach((x) => (x.style.color = '#4fb6ff'));
  const mark = img('assets/mark.png', root, 'abs'); S(mark, { width: '300px', height: '300px', left: '810px', top: '320px' });
  const lock = img('assets/logo-lockup-inverse.png', root, 'abs'); S(lock, { width: '760px', left: '580px', top: '316px' });
  const tag = el('div', 'abs', root); S(tag, { left: '0', right: '0', top: '512px', textAlign: 'center', fontSize: '26px', color: 'var(--t2)', letterSpacing: '-.01em' }); tag.textContent = 'Identity security for the AI era.';
  const fam = el('div', 'abs', root); S(fam, { left: '0', right: '0', top: '600px', display: 'flex', justifyContent: 'center', gap: '18px' });
  fam.innerHTML = `<div class="pan" style="position:relative;padding:22px 26px;width:640px"><div class="row"><div class="tile"><img src="assets/adapid.png"></div><b style="font-size:22px">adapID AI</b><span style="color:var(--t3);font-size:15px;margin-left:auto">Identity security</span></div>
      <div style="margin-top:14px;font-size:17px;line-height:1.75;color:var(--t2)">Continuous Identity Risk Management · Microsoft 365 &amp; Active Directory<br>Non-Human Identity Security for AWS<br>Identity Fraud Prevention · Mobile &amp; Internet Banking</div></div>
    <div class="pan" style="position:relative;padding:22px 26px;width:420px"><div class="row"><img src="assets/zen-mark.png" style="width:40px;height:37px;object-fit:contain"><b style="font-size:22px">Zenstra AI</b><span style="color:var(--t3);font-size:15px;margin-left:auto">AI security</span></div>
      <div style="margin-top:14px;font-size:17px;line-height:1.75;color:var(--t2)">Sensitive data kept out of AI prompts,<br>every AI agent action checked before it runs</div></div>`;
  const famCards = [...fam.children];
  const cta = el('div', 'abs', root); S(cta, { left: '0', right: '0', top: '836px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '22px' });
  cta.innerHTML = '<span style="padding:15px 28px;border-radius:14px;background:var(--brand);font-size:20px;font-weight:650;box-shadow:0 14px 40px -12px rgba(21,151,229,.7)">Book a demo</span><span style="font-size:24px;font-weight:600">deepalgorithms.io</span>';
  const certs = el('div', 'abs', root); S(certs, { left: '0', right: '0', top: '930px', textAlign: 'center', fontSize: '16px', color: 'var(--t3)', letterSpacing: '.04em' });
  certs.textContent = 'ISO/IEC 27001  ·  SOC 2 Type II  ·  ISO/IEC 42001  ·  ISO/IEC 27701  ·  Built in India';
  sfx(82.5, 'reveal'); sfx(83.4, 'link'); sfx(87.55, 'swell'); sfx(88.9, 'converge'); sfx(90.45, 'logo'); sfx(92.35, 'uiIn');
  const cam = makeCam({});
  let targets = null;
  return (t) => {
    if (!targets && window.MARK_PTS) {
      const pts = window.MARK_PTS, N = CONS.N; targets = [];
      const order = N.map((n, i) => i).sort((a, b) => ((a * 7919) % 97) - ((b * 7919) % 97));
      order.forEach((ni, j) => { if (j < pts.length) { const [x, y] = pts[j]; targets[ni] = { x: 810 + x * 300 / 160, y: 320 + y * 300 / 160, d: (j % 17) / 17 }; } });
    }
    const out = E.inOutCubic(seg(t, 82.4, 85.4));
    const ai = CONS.story.ai.p;
    cam.tx = lerp(ai[0], 0, out); cam.ty = lerp(ai[1], 0, out); cam.tz = lerp(ai[2], 0, out);
    cam.dist = lerp(110, 2500, out); cam.yaw = lerp(0.25, 0.95, out) + 0.04 * seg(t, 85.4, 90); cam.pitch = lerp(0.05, 0.16, out);
    g.clearRect(0, 0, FW, FH);
    const conv = seg(t, 88.85, 90.55), pf = 1 - E.inOutSine(seg(t, 90.4, 90.9));
    CONS.draw(g, cam, { t, alpha: pf, story: E.inOutSine(seg(t, 83.3, 84.3)) * (1 - seg(t, 88.6, 89.2)), wave: seg(t, 87.55, 89.3), conv, targets });
    S(scrim, { background: `radial-gradient(48% 30% at 50% 46%, rgba(4,7,13,${(0.72 * win(t, 82.9, 89.4, 0.5, 0.6)).toFixed(3)}), transparent 100%)` });
    tags.forEach(({ k, d }, i) => {
      const a = win(t, 83.6 + i * 0.12, 88.4, 0.4, 0.5); S(d, { display: a > 0 ? 'inline-flex' : 'none' }); if (a <= 0) return;
      const p = project(CONS.story[k].p, cam); if (!p) return;
      S(d, { left: px(p.x + 22), top: px(p.y - 18), opacity: a.toFixed(3) });
    });
    k1.update(t, 83.0, 86.9); k2.update(t, 84.95, 86.9); k3.update(t, 87.45, 89.25, 0.45);
    // the mark appears where the nodes gathered, then takes its place in the lockup
    const mk = E.inOutSine(seg(t, 90.25, 90.8)), mv = E.inOutCubic(seg(t, 91.0, 91.8)), lk = E.inOutSine(seg(t, 91.62, 92.0));
    const ms = lerp(300, 168.6, mv), mx = lerp(960, 664.3, mv), my = lerp(470, 387, mv);
    S(mark, { display: mk > 0 && lk < 1 ? 'block' : 'none', width: px(ms), height: px(ms), left: px(mx - ms / 2), top: px(my - ms / 2), opacity: (mk * (1 - lk)).toFixed(3), filter: `drop-shadow(0 0 ${(40 * (1 - mv)).toFixed(0)}px rgba(40,160,240,.7))` });
    S(lock, { display: t > 91.55 ? 'block' : 'none', opacity: lk.toFixed(3), top: '316px', clipPath: `inset(0 ${(100 - 100 * E.inOutCubic(seg(t, 91.55, 92.2))).toFixed(1)}% 0 0)` });
    reveal(tag, E.outCubic(seg(t, 91.9, 92.5)), 10, 6);
    famCards.forEach((c, i) => reveal(c, E.outCubic(seg(t, 92.35 + i * 0.15, 92.95 + i * 0.15)), 18, 8));
    reveal(cta, E.outCubic(seg(t, 93.1, 93.7)), 12, 6);
    reveal(certs, E.outCubic(seg(t, 93.5, 94.1)), 8, 4);
    S(root, { opacity: E.inOutSine(seg(t, 82.4, 82.9)).toFixed(3) });
  };
});
