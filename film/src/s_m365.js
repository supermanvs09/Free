/* adapID AI · CIRM for Microsoft 365 (10.8 - 25.2 s)
   A successful sign-in, then the same identity's context changes signal by signal. */
const T_M = { a: 10.8, b: 25.3 };
const CURSOR_SVG = '<svg viewBox="0 0 28 28" width="28" height="28"><path d="M5 3l17 10.5-7.3 1.6-3.6 7.4z" fill="#fff" stroke="#0b0f18" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const APPS365 = [['Outlook', '#1a73d9', 'O'], ['Teams', '#5b5fc7', 'T'], ['SharePoint', '#0b8a8f', 'S'], ['OneDrive', '#2b88d8', 'D']];

scene(T_M.a, T_M.b, (root) => {
  S(root, { background: 'radial-gradient(90% 80% at 50% 40%, #0c1830 0%, #060a14 60%, #04060b 100%)' });
  const grid = el('div', 'fill', root);
  S(grid, { backgroundImage: 'radial-gradient(rgba(140,180,255,.10) 1px, transparent 1.4px)', backgroundSize: '36px 36px', maskImage: 'radial-gradient(70% 60% at 50% 50%, #000 30%, transparent 80%)', webkitMaskImage: 'radial-gradient(70% 60% at 50% 50%, #000 30%, transparent 80%)' });
  const tint = el('div', 'fill', root);

  /* ---- sign-in card ---- */
  const card = el('div', 'abs', root);
  S(card, { left: '680px', top: '214px', width: '560px', borderRadius: '22px', background: '#fff', color: '#121826', padding: '44px 48px 40px', boxShadow: '0 60px 140px -40px rgba(30,120,255,.35), 0 30px 80px -30px rgba(0,0,0,.9)', transformOrigin: '50% 40%' });
  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;font-weight:650;font-size:20px;color:#1d2433">
      <div style="width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#2b6fd6,#173f86);display:grid;place-items:center;color:#fff;font-size:17px;font-weight:700">C</div>company.com</div>
    <div style="font-size:34px;font-weight:650;letter-spacing:-.02em;margin:30px 0 22px">Sign in</div>
    <div style="font-size:15px;color:#5a6577;margin-bottom:8px">Work account</div>
    <div class="f-email" style="height:54px;border:1.5px solid #cdd5e1;border-radius:12px;padding:0 18px;display:flex;align-items:center;font-size:20px"></div>
    <div style="font-size:15px;color:#5a6577;margin:18px 0 8px">Password</div>
    <div class="f-pass" style="height:54px;border:1.5px solid #cdd5e1;border-radius:12px;padding:0 18px;display:flex;align-items:center;font-size:24px;letter-spacing:.12em"></div>
    <div class="f-btn" style="margin-top:26px;height:56px;border-radius:12px;background:#1f6feb;color:#fff;display:grid;place-items:center;font-size:19px;font-weight:650">Sign in</div>
    <div class="f-mfa" style="margin-top:20px;display:flex;align-items:center;gap:12px;font-size:17px;color:#2a3242"></div>
    <div class="f-ok" style="position:absolute;inset:0;border-radius:22px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px">
      <div style="width:84px;height:84px;border-radius:50%;background:#e7f8ef;display:grid;place-items:center"><svg width="44" height="44" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#14a05c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div style="font-size:32px;font-weight:650;letter-spacing:-.02em">Signed in</div>
      <div style="font-size:18px;color:#5a6577">alex.morgan@company.com</div></div>`;
  const fEmail = card.querySelector('.f-email'), fPass = card.querySelector('.f-pass'), fBtn = card.querySelector('.f-btn'), fMfa = card.querySelector('.f-mfa'), fOk = card.querySelector('.f-ok');
  const caret = '<span style="display:inline-block;width:2px;height:24px;background:#1f6feb;margin-left:2px;vertical-align:middle"></span>';
  const email = typer('alex.morgan@company.com', 11.75, 21, 3);
  const pass = typer('••••••••••', 12.95, 16, 4, { vol: 0.8 });
  const cursor = el('div', 'cursor', root); cursor.innerHTML = CURSOR_SVG;
  sfx(10.95, 'uiIn'); sfx(13.62, 'click'); sfx(13.95, 'ping'); sfx(14.35, 'success');

  const ctx = el('div', 'abs', root); S(ctx, { left: '0', right: '0', top: '836px', display: 'flex', justifyContent: 'center', gap: '14px' });
  const CTX = [['Device', 'Registered Windows laptop'], ['Location', 'Hyderabad, IN'], ['MFA', 'Passed'], ['Risk', '<span style="color:var(--green);font-weight:700">LOW</span>']];
  const ctxEls = CTX.map(([k, v]) => { const c = el('div', 'chip', ctx); S(c, { position: 'relative' }); c.innerHTML = `<small>${k}</small>${v}`; return c; });

  /* ---- timeline ---- */
  const tl = el('div', 'fill', root);
  const X0 = 430, X1 = 1770, Y = 640;
  const svg = el('div', 'fill', tl);
  const head = el('div', 'abs', tl);
  S(head, { left: '120px', top: '585px', display: 'flex', alignItems: 'center', gap: '14px' });
  head.innerHTML = `<div style="width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,#2a7fd4,#1b4a8a);display:grid;place-items:center;font-weight:700;font-size:20px;box-shadow:0 0 0 6px rgba(60,200,246,.12),0 0 40px rgba(60,200,246,.35)">AM</div>
    <div><div style="font-size:19px;font-weight:650">alex.morgan</div><div class="h-risk" style="font-size:14px;color:var(--t2);margin-top:3px">Session active</div></div>`;
  const apps = el('div', 'abs', tl); S(apps, { left: X0 + 'px', top: '196px' });
  apps.innerHTML = `<div class="lbl" style="margin-bottom:14px">Microsoft 365 session</div><div style="display:flex;gap:12px">${APPS365.map(([n, c, l]) => `<div class="chip" style="position:relative;padding:10px 16px 10px 10px"><span style="width:30px;height:30px;border-radius:8px;background:${c};display:grid;place-items:center;font-weight:700;font-size:15px">${l}</span>${n}</div>`).join('')}</div>`;
  const bandLbl = el('div', 'abs lbl', tl); S(bandLbl, { left: (X0 + 10) + 'px', top: (Y - 62) + 'px' }); bandLbl.textContent = 'Usual behaviour for this identity';
  const EV = [
    { t: 15.75, x: 560, side: 1, c: 'var(--t3)', time: '09:14', app: 'Teams', txt: 'Usual activity', v: 12 },
    { t: 16.45, x: 880, side: -1, c: 'var(--amber)', time: '11:02', app: 'Sign-in', txt: 'A device never seen for this identity', v: 41 },
    { t: 17.15, x: 1110, side: 1, c: 'var(--amber)', time: '11:03', app: 'Network', txt: 'Hosting provider, outside India', v: 58 },
    { t: 17.85, x: 1350, side: -1, c: 'var(--red)', time: '11:05', app: 'Outlook', txt: 'Inbox rule forwards mail outside', v: 79 },
    { t: 18.55, x: 1580, side: 1, c: 'var(--red)', time: '11:06', app: 'SharePoint', txt: '1,240 files in 3 min · 30× usual', v: 91 },
  ];
  EV.forEach((e, i) => sfx(e.t, i === 0 ? 'tick' : i < 3 ? 'alert' : 'alertHi'));
  sfx(18.6, 'impact');
  const evEls = EV.map((e) => {
    const d = el('div', 'abs', tl);
    S(d, { left: (e.x - 30) + 'px', top: (e.side < 0 ? Y - 238 : Y + 112) + 'px', width: '300px' });
    d.innerHTML = `<div class="pan" style="position:relative;padding:16px 18px;border-radius:16px"><div class="row" style="gap:10px"><i style="width:10px;height:10px;border-radius:50%;background:${e.c};box-shadow:0 0 14px ${e.c}"></i><span class="mono" style="font-size:15px;color:var(--t2)">${e.time}</span><span style="font-size:15px;font-weight:650">${e.app}</span></div><div style="font-size:19px;margin-top:8px;line-height:1.3">${e.txt}</div></div>`;
    return d;
  });
  /* risk gauge */
  const gauge = el('div', 'abs', tl); S(gauge, { left: '1490px', top: '150px', width: '300px', textAlign: 'center' });
  gauge.innerHTML = `<svg width="300" height="190" viewBox="0 0 300 190"><path d="M30 170 A120 120 0 1 1 270 170" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="14" stroke-linecap="round"/><path class="g-arc" d="M30 170 A120 120 0 1 1 270 170" fill="none" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/></svg>
    <div style="position:absolute;left:0;right:0;top:88px"><div class="g-num num" style="font-family:var(--disp);font-size:78px;font-weight:600;letter-spacing:-.04em;line-height:1">12</div><div class="lbl" style="margin-top:8px">Identity risk</div></div><div class="g-pill pill p-low" style="margin-top:4px"><i></i><span>Low</span></div>`;
  const gArc = gauge.querySelector('.g-arc'), gNum = gauge.querySelector('.g-num'), gPill = gauge.querySelector('.g-pill');
  const same = new Kin(root, 'Same identity. Same password. *Different behaviour.*', { style: { left: '0', right: '0', top: '912px', textAlign: 'center', fontSize: '46px' } });

  /* ---- adapID moment ---- */
  const dim = el('div', 'fill', root); S(dim, { background: 'rgba(4,6,11,.72)' });
  const pan = el('div', 'pan', root); S(pan, { left: '540px', top: '250px', width: '840px' });
  panelHead(pan, 'adapid', 'Continuous Identity Risk Management', 'Microsoft 365');
  const body = el('div', '', pan); S(body, { padding: '22px 26px 24px' });
  body.innerHTML = `
    <div class="row" style="justify-content:space-between">
      <div class="row"><div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#2a7fd4,#1b4a8a);display:grid;place-items:center;font-weight:700">AM</div>
      <div><div style="font-size:20px;font-weight:650">alex.morgan@company.com</div><div style="font-size:15px;color:var(--t2);margin-top:3px">Session active · 11:06</div></div></div>
      <div class="row" style="gap:16px"><div class="num" style="font-family:var(--disp);font-size:56px;font-weight:600;letter-spacing:-.04em;line-height:1">91<span style="font-size:22px;color:var(--t3);letter-spacing:0">/100</span></div><div class="pill p-high"><i></i>High</div></div>
    </div>
    <div class="lbl" style="margin:24px 0 10px">Why the score changed</div>
    ${[['+29', 'A new device on a hosting-provider network at 11:02', 0.32], ['+21', 'Inbox rule forwarding mail to an external domain', 0.23], ['+29', 'SharePoint downloads at 30× this identity’s usual volume', 0.32]].map(([p, d, w]) => `
      <div class="rsn row" style="padding:13px 0;border-top:1px solid var(--line)"><span class="num mono" style="width:56px;color:var(--red);font-size:18px;font-weight:600">${p}</span><span style="flex:1;font-size:18px">${d}</span><span style="width:120px;height:6px;border-radius:9px;background:rgba(255,255,255,.07);overflow:hidden"><span style="display:block;height:100%;width:${w * 300}%;max-width:100%;background:var(--red);border-radius:9px"></span></span></div>`).join('')}
    <div class="dec row" style="margin-top:16px;padding:16px 18px;border-radius:14px;background:rgba(60,200,246,.08);border:1px solid rgba(60,200,246,.25)">
      <svg width="26" height="26" viewBox="0 0 24 24"><path d="M12 2.5l8 3.2v6.1c0 4.9-3.4 8.6-8 9.7-4.6-1.1-8-4.8-8-9.7V5.7z" fill="none" stroke="#3cc8f6" stroke-width="1.8"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8" fill="none" stroke="#3cc8f6" stroke-width="1.8" stroke-linecap="round"/></svg>
      <div style="flex:1"><div style="font-size:18px;font-weight:600">Your policy: step-up verification before the next sensitive action</div><div style="font-size:15px;color:var(--t2);margin-top:3px">Identity owner and SOC notified, with the reasons</div></div>
      <div class="dec-st pill" style="color:var(--cyan);background:rgba(60,200,246,.12)"><i></i>Requested</div></div>`;
  const rsn = [...body.querySelectorAll('.rsn')], dec = body.querySelector('.dec'), decSt = body.querySelector('.dec-st');
  sfx(19.85, 'uiIn'); sfx(20.4, 'tick'); sfx(20.8, 'tick'); sfx(21.2, 'tick'); sfx(21.75, 'confirm');
  const endDim = el('div', 'fill', root); S(endDim, { background: 'radial-gradient(80% 70% at 50% 45%, rgba(4,6,11,.86), rgba(4,6,11,.97))' });
  const end = new EndCard(root, 'Identity risk doesn’t stop at login.', 'adapid', 'Continuous Identity Risk Management for Microsoft 365', { y: 432 });
  sfx(22.75, 'hit');

  return (t) => {
    S(root, { opacity: (E.inOutSine(seg(t, 10.8, 11.25)) * (1 - E.inOutSine(seg(t, 24.75, 25.3)))).toFixed(3) });
    // card: born from the identity's light, then folds into the timeline's head
    const cin = E.outExpo(seg(t, 10.9, 11.7)), fold = E.inOutCubic(seg(t, 14.95, 15.75));
    const cs = lerp(0.55, 1, cin) * lerp(1, 0.86, fold);
    S(card, { display: fold >= 1 ? 'none' : 'block', opacity: (cin * (1 - fold)).toFixed(3), filter: cin < 1 || fold > 0 ? `blur(${((1 - cin) * 16 + fold * 18).toFixed(1)}px)` : 'none',
      transform: `scale(${cs.toFixed(4)})` });
    const ne = email.n(t); htm(fEmail, email.str.slice(0, ne) + (t > 11.6 && t < 12.85 ? caret : ''));
    const np = pass.n(t); htm(fPass, pass.str.slice(0, np) + (t >= 12.85 && t < 13.5 ? caret : ''));
    S(fEmail, { borderColor: t > 11.6 && t < 12.85 ? '#1f6feb' : '#cdd5e1' }); S(fPass, { borderColor: t >= 12.85 && t < 13.5 ? '#1f6feb' : '#cdd5e1' });
    S(fBtn, { transform: `scale(${t > 13.6 && t < 13.75 ? 0.97 : 1})`, background: t > 13.45 && t < 13.9 ? '#195ccc' : '#1f6feb' });
    htm(fMfa, t > 13.85 ? '<svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e7f8ef"/><path d="M7.5 12.3l3 3 6-6.2" fill="none" stroke="#14a05c" stroke-width="2.2" stroke-linecap="round"/></svg>Approved on your registered device' : '');
    const ok = E.outCubic(seg(t, 14.25, 14.6)); S(fOk, { opacity: ok.toFixed(3), transform: `scale(${lerp(0.97, 1, ok).toFixed(3)})` });
    // cursor glides to the button
    const cp = E.inOutCubic(seg(t, 12.9, 13.55));
    S(cursor, { display: t > 12.6 && t < 14.3 ? 'block' : 'none', left: px(lerp(1420, 960, cp)), top: px(lerp(820, 600, cp)), opacity: (seg(t, 12.6, 12.9) * (1 - seg(t, 14.0, 14.3))).toFixed(2), transform: `scale(${t > 13.6 && t < 13.72 ? 0.86 : 1})` });
    ctxEls.forEach((c, i) => reveal(c, win(t, 14.5 + i * 0.12, 15.3, 0.4, 0.3), 14, 6));

    // timeline
    const tlOn = seg(t, 15.2, 15.7);
    S(tl, { opacity: (tlOn * (1 - 0.78 * E.inOutSine(seg(t, 19.6, 20.1)))).toFixed(3), transform: `translateY(${(-E.inOutCubic(seg(t, 19.55, 20.2)) * 40).toFixed(1)}px)` });
    const ph = lerp(X0, X1 - 10, E.inOutSine(seg(t, 15.5, 19.3)));
    // activity path: inside the band, then away from it after 11:02
    const yAt = (x) => { const w = Math.sin(x / 41) * 9 + Math.sin(x / 17) * 4; const dev = E.inOutCubic(clamp((x - 860) / 820)) * 210; return Y + w - dev; };
    let d = `M${X0} ${yAt(X0).toFixed(1)}`; for (let x = X0 + 8; x <= ph; x += 8) d += ` L${x} ${yAt(x).toFixed(1)}`;
    let band = `M${X0} ${Y - 30}`; for (let x = X0; x <= X1; x += 20) band += ` L${x} ${(Y - 30 + Math.sin(x / 90) * 6).toFixed(1)}`;
    for (let x = X1; x >= X0; x -= 20) band += ` L${x} ${(Y + 30 + Math.sin(x / 90) * 6).toFixed(1)}`;
    const ticks = ['09:00', '10:00', '11:00', '11:03', '11:06'].map((l, i) => { const x = lerp(X0, X1, [0, 0.22, 0.4, 0.68, 0.9][i]); return `<text x="${x}" y="${Y + 76}" fill="#4f5b6e" font-family="JetBrains Mono" font-size="15">${l}</text>`; }).join('');
    htm(svg, `<svg width="1920" height="1080" style="position:absolute;inset:0"><defs><linearGradient id="lg" x1="${X0}" x2="${X1}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3cc8f6"/><stop offset=".38" stop-color="#3cc8f6"/><stop offset=".62" stop-color="#f3b23e"/><stop offset="1" stop-color="#ef5a5f"/></linearGradient><filter id="gl"><feGaussianBlur stdDeviation="6"/></filter></defs>
      <path d="${band}" fill="rgba(160,190,230,.07)" stroke="rgba(160,190,230,.12)" stroke-dasharray="4 6"/>
      <line x1="${X0}" y1="${Y + 50}" x2="${X1}" y2="${Y + 50}" stroke="rgba(255,255,255,.08)"/>${ticks}
      ${APPS365.map((a, i) => `<path d="M178 ${585} C 178 360, ${X0 + 60 + i * 168} 380, ${X0 + 60 + i * 168} 300" fill="none" stroke="rgba(60,200,246,${(0.18 * tlOn).toFixed(3)})" stroke-width="1.5"/>`).join('')}
      <path d="M178 614 L ${X0} ${yAt(X0).toFixed(1)}" stroke="rgba(60,200,246,.5)" stroke-width="2"/>
      <path d="${d}" fill="none" stroke="url(#lg)" stroke-width="7" opacity=".35" filter="url(#gl)"/>
      <path d="${d}" fill="none" stroke="url(#lg)" stroke-width="3" stroke-linecap="round"/>
      <line x1="${ph}" y1="${Y - 300}" x2="${ph}" y2="${Y + 56}" stroke="rgba(255,255,255,.22)"/><circle cx="${ph}" cy="${yAt(ph).toFixed(1)}" r="7" fill="#fff"/>
      ${EV.map((e) => { const p = E.outCubic(seg(t, e.t, e.t + 0.35)); const y = yAt(e.x); return p > 0 ? `<line x1="${e.x}" y1="${y.toFixed(1)}" x2="${e.x}" y2="${(e.side < 0 ? Y - 140 : Y + 112)}" stroke="${e.c.replace('var(--amber)', '#f3b23e').replace('var(--red)', '#ef5a5f').replace('var(--t3)', '#6c788b')}" stroke-opacity="${(p * 0.7).toFixed(2)}" stroke-dasharray="3 4"/><circle cx="${e.x}" cy="${y.toFixed(1)}" r="${(6 + 18 * (1 - p)).toFixed(1)}" fill="none" stroke="${e.c.replace('var(--amber)', '#f3b23e').replace('var(--red)', '#ef5a5f').replace('var(--t3)', '#6c788b')}" stroke-opacity="${(1 - p * 0.4).toFixed(2)}" stroke-width="2"/>` : ''; }).join('')}
      </svg>`);
    reveal(head, E.outCubic(seg(t, 15.35, 15.9)), 0, 8);
    reveal(apps, E.outCubic(seg(t, 15.4, 16.0)), 12, 6);
    reveal(bandLbl, E.outCubic(seg(t, 15.6, 16.1)), 8, 4);
    evEls.forEach((e, i) => reveal(e, E.outBack(seg(t, EV[i].t, EV[i].t + 0.45)), EV[i].side * -18, 8));
    // risk climbs with each signal
    let v = 12; EV.forEach((e, i) => { if (i) v = lerp(v, e.v, E.outCubic(seg(t, e.t, e.t + 0.5))); });
    const col = v < 40 ? '#3fd99b' : v < 70 ? '#f3b23e' : '#ef5a5f';
    S(gArc, { strokeDasharray: `${(v * 0.98).toFixed(1)} 100`, stroke: col, filter: `drop-shadow(0 0 10px ${col})` }); txt(gNum, String(Math.round(v)));
    const st = v < 40 ? ['p-low', 'Low'] : v < 70 ? ['p-mid', 'Elevated'] : ['p-high', 'High'];
    if (gPill.__st !== st[1]) { gPill.__st = st[1]; gPill.className = 'g-pill pill ' + st[0]; gPill.querySelector('span').textContent = st[1]; }
    reveal(gauge, E.outCubic(seg(t, 15.5, 16.1)), 10, 6);
    htm(head.querySelector('.h-risk'), `Session active · risk <b style="color:${col}">${Math.round(v)}</b>`);
    S(tint, { background: `radial-gradient(70% 60% at 75% 40%, rgba(239,90,95,${(clamp((v - 45) / 46) * 0.16).toFixed(3)}), transparent 70%)` });
    same.update(t, 18.95, 20.0, 0.4);
    // adapID panel
    S(dim, { opacity: (E.inOutSine(seg(t, 19.6, 20.1)) * 0.0).toFixed(3) });
    const pin = E.outExpo(seg(t, 19.85, 20.6));
    S(pan, { display: t > 19.8 && t < 23.2 ? 'block' : 'none', opacity: (pin * (1 - seg(t, 22.5, 22.95))).toFixed(3), transform: `translateY(${((1 - pin) * 60).toFixed(1)}px) scale(${lerp(0.96, 1, pin).toFixed(4)})` });
    rsn.forEach((r, i) => reveal(r, E.outCubic(seg(t, 20.4 + i * 0.4, 20.85 + i * 0.4)), 10, 6));
    reveal(dec, E.outCubic(seg(t, 21.7, 22.15)), 12, 6);
    S(endDim, { opacity: E.inOutSine(seg(t, 22.45, 23.0)).toFixed(3) });
    end.update(t, 22.75, 25.1);
  };
});
