/* Zenstra AI · AI security (64.3 - 83.0 s)
   A normal request to an AI assistant, with secrets pasted in. Zenstra stops the prompt before it is sent. */
const T_Z = { a: 64.3, b: 83.0 };
scene(T_Z.a, T_Z.b, (root) => {
  S(root, { background: 'radial-gradient(80% 70% at 50% 42%, #10132c 0%, #070816 55%, #04050b 100%)' });
  const grid = el('div', 'fill', root);
  S(grid, { backgroundImage: 'linear-gradient(rgba(147,162,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(147,162,255,.05) 1px, transparent 1px)', backgroundSize: '64px 64px', maskImage: 'radial-gradient(60% 55% at 50% 50%, #000 20%, transparent 75%)', webkitMaskImage: 'radial-gradient(60% 55% at 50% 50%, #000 20%, transparent 75%)' });
  const beam = el('div', 'abs', root);
  const persp = el('div', 'fill', root); S(persp, { perspective: '1900px' });
  const win_ = el('div', 'abs', persp);
  S(win_, { left: '330px', top: '170px', width: '1260px', height: '720px', borderRadius: '22px', overflow: 'hidden', background: '#f7f7f5', color: '#1f1e1b', boxShadow: '0 80px 160px -40px rgba(0,0,0,.95), 0 0 0 1px rgba(255,255,255,.06)', transformOrigin: '50% 72%' });
  win_.innerHTML = `
    <div style="height:50px;background:#ecebe7;display:flex;align-items:center;gap:9px;padding:0 18px;border-bottom:1px solid #dedcd6">
      <i style="width:13px;height:13px;border-radius:50%;background:#e2675d"></i><i style="width:13px;height:13px;border-radius:50%;background:#e8b84d"></i><i style="width:13px;height:13px;border-radius:50%;background:#62c554"></i>
      <div style="margin-left:24px;flex:1;max-width:520px;height:32px;border-radius:9px;background:#fff;display:flex;align-items:center;padding:0 14px;font-size:15px;color:#6b6a65">AI assistant</div></div>
    <div style="display:flex;height:670px">
      <div style="width:236px;background:#efeee9;border-right:1px solid #e1dfd8;padding:20px 16px">
        <div style="height:38px;border-radius:10px;background:#fff;border:1px solid #dedcd6;display:flex;align-items:center;padding:0 12px;font-size:15px;font-weight:600">+ New chat</div>
        <div style="margin-top:26px;font-size:12px;font-weight:700;letter-spacing:.08em;color:#9a988f">RECENT</div>
        ${[150, 120, 170, 96, 140].map((w) => `<div style="height:10px;width:${w}px;border-radius:6px;background:#dddbd3;margin-top:18px"></div>`).join('')}</div>
      <div style="flex:1;position:relative">
        <div class="z-hello" style="position:absolute;left:0;right:0;top:150px;text-align:center;font-family:var(--disp);font-size:44px;font-weight:500;letter-spacing:-.03em;color:#2c2b27">How can I help you today?</div>
        <div class="z-box" style="position:absolute;left:60px;right:60px;bottom:56px;border-radius:24px;background:#fff;border:1.5px solid #dcdad3;box-shadow:0 10px 30px -14px rgba(0,0,0,.25);padding:22px 24px 74px">
          <div class="z-scan" style="position:absolute;left:0;right:0;height:90px;pointer-events:none"></div>
          <div class="z-txt" style="font-size:22px;line-height:1.5;color:#1f1e1b;min-height:33px"></div>
          <div class="z-code" style="font-family:var(--mono);font-size:19px;line-height:1.75;color:#33322e;margin-top:10px;white-space:pre"></div>
          <div style="position:absolute;left:22px;bottom:18px;display:flex;align-items:center;gap:10px"><span style="width:38px;height:38px;border-radius:50%;border:1.5px solid #dcdad3;display:grid;place-items:center;font-size:22px;color:#6b6a65">+</span></div>
          <div class="z-send" style="position:absolute;right:20px;bottom:16px;width:46px;height:46px;border-radius:14px;display:grid;place-items:center"></div>
        </div>
        <div class="z-ghost" style="position:absolute;left:60px;right:60px;bottom:56px;height:120px;border-radius:24px;border:2px solid rgba(91,108,240,.7);background:rgba(91,108,240,.08)"></div>
        <div class="z-wall" style="position:absolute;left:30px;right:30px;height:3px;border-radius:3px"></div>
        <div class="z-stat" style="position:absolute;left:60px;bottom:18px;font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px"></div>
      </div></div>
    <div class="z-ban" style="position:absolute;left:256px;right:20px;top:66px;border-radius:16px;background:#14162b;color:#fff;display:flex;align-items:center;gap:18px;padding:18px 22px;border-left:5px solid #ef5a5f;box-shadow:0 30px 60px -20px rgba(20,22,43,.7)">
      <img src="assets/zen-mark.png" style="width:44px;height:40px;object-fit:contain">
      <div style="flex:1"><div style="font-size:21px;font-weight:700">Blocked! This prompt contains credentials, API keys and tokens.</div><div style="font-size:17px;color:#b9bfe6;margin-top:4px">It was not sent.</div></div>
      <div style="text-align:right;font-size:14px;color:#9aa2d6;line-height:1.5">Policy<br><b style="color:#fff;font-size:16px">Sensitive credential protection</b></div></div>`;
  const q = (s) => win_.querySelector(s);
  const zTxt = q('.z-txt'), zCode = q('.z-code'), zSend = q('.z-send'), zScan = q('.z-scan'), zGhost = q('.z-ghost'), zWall = q('.z-wall'), zStat = q('.z-stat'), zBan = q('.z-ban'), zBox = q('.z-box'), zHello = q('.z-hello');
  const ask = typer('Our payments service fails on deploy. Here’s the config, can you spot the bug?', 64.95, 27, 31);
  const CODE = [['region', 'ap-south-1', 0], ['AWS_ACCESS_KEY_ID', 'AKIAIOSFODNN7EXAMPLE', 'AWS access key'], ['AWS_SECRET_ACCESS_KEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', 'AWS secret key'], ['DATABASE_PASSWORD', 'Tr1dent#2026', 'Database password'], ['timeout_ms', '3000', 0]];
  const cursor = el('div', 'cursor', root); cursor.innerHTML = CURSOR_SVG;
  sfx(64.35, 'streak'); sfx(68.55, 'paste'); sfx(68.7, 'pushIn', { d: 1.8 }); sfx(70.55, 'heart'); sfx(71.0, 'heart'); sfx(71.45, 'click');
  sfx(71.5, 'zenScan'); sfx(71.62, 'block'); sfx(72.4, 'banner'); [71.75, 71.9, 72.05].forEach((tt) => sfx(tt, 'flag'));
  /* console */
  const con = el('div', 'abs', root);
  S(con, { left: '930px', top: '150px', width: '890px', borderRadius: '22px', background: 'linear-gradient(180deg,#121531,#0b0d20)', border: '1px solid rgba(147,162,255,.22)', boxShadow: '0 60px 140px -40px rgba(0,0,0,.95), inset 0 1px 0 rgba(255,255,255,.06)', overflow: 'hidden' });
  const F = [['Application', 'AI assistant (Claude)'], ['Detection', 'Exposed API credentials · 3 secrets'], ['Risk level', '<span style="color:var(--red)">High</span>'], ['Action', '<span style="color:var(--zen)">Blocked · prompt not sent</span>'], ['Policy', 'Sensitive credential protection'], ['Device', 'laptop-208 · Engineering']];
  con.innerHTML = `<div class="row" style="padding:18px 24px;border-bottom:1px solid rgba(147,162,255,.14)"><img src="assets/zen-mark.png" style="width:30px;height:28px;object-fit:contain"><img src="assets/zen-wordmark-light.png" style="height:17px;margin-left:4px">
      <div class="row" style="margin-left:auto;gap:22px;font-size:15px;color:#8e95c4"><span>Overview</span><span style="color:#fff;font-weight:600;border-bottom:2px solid var(--zen);padding-bottom:4px">Detections</span><span>Decision record</span></div></div>
    <div style="padding:24px 28px 26px">
      <div class="zc row" style="justify-content:space-between"><div><div class="mono" style="font-size:15px;color:#8e95c4">DET-2318 · 21:47:12 IST</div><div style="font-size:28px;font-weight:650;letter-spacing:-.02em;margin-top:6px">Secrets in an AI prompt</div></div><span class="pill p-high"><i></i>High</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 30px;margin-top:14px">${F.map(([k, v]) => `<div class="zc" style="padding:13px 0;border-bottom:1px solid rgba(147,162,255,.12)"><div class="lbl" style="color:#7279a8">${k}</div><div style="font-size:19px;font-weight:600;margin-top:5px">${v}</div></div>`).join('')}</div>
      <div class="zc row" style="margin-top:22px;gap:0">${['Prompt typed', 'Secrets found', 'Blocked', 'Recorded'].map((s, i) => `<div class="zs row" style="gap:10px;flex:1"><span style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:700;border:1.5px solid rgba(147,162,255,.4)">${i + 1}</span><span style="font-size:16px">${s}</span>${i < 3 ? '<span style="flex:1;height:1.5px;background:rgba(147,162,255,.25);margin:0 12px"></span>' : ''}</div>`).join('')}</div>
      <div class="zc" style="margin-top:20px;font-size:15px;color:#8e95c4">Recorded with the policy that decided it.</div></div>`;
  const zc = [...con.querySelectorAll('.zc')], zs = [...con.querySelectorAll('.zs')];
  sfx(74.75, 'uiIn'); [75.6, 75.95, 76.3, 76.65].forEach((tt) => sfx(tt, 'tick'));
  /* end card */
  const endDim = el('div', 'fill', root); S(endDim, { background: 'radial-gradient(80% 70% at 50% 45%, rgba(6,7,18,.88), rgba(6,7,18,.97))' });
  const endW = el('div', 'endcard', root); S(endW, { top: '330px' });
  const endK = new Kin(endW, 'Let AI move your business forward.\nNot your *sensitive data* outside.', { cls: 'zen', style: { position: 'relative', fontSize: '74px', display: 'inline-block' }, stagger: 0.06 });
  const endS = el('div', '', endW); S(endS, { marginTop: '40px' });
  endS.innerHTML = `<div style="display:inline-flex;align-items:center;gap:16px"><img src="assets/zen-mark.png" style="width:50px;height:46px;object-fit:contain"><img src="assets/zen-wordmark-light.png" style="height:28px"></div>
    <div style="margin-top:18px;font-size:21px;color:var(--t2)">AI Security · zenstra.ai · <span style="color:var(--t1)">A Deep Algorithms Solutions product</span></div>`;
  sfx(78.25, 'hit');

  return (t) => {
    S(root, { opacity: (E.inOutSine(seg(t, 64.3, 64.7)) * (1 - E.inOutSine(seg(t, 82.2, 83.0)))).toFixed(3) });
    // the information from the last scene travels into the prompt
    const bm = seg(t, 64.3, 65.0);
    S(beam, { display: bm > 0 && bm < 1 ? 'block' : 'none', left: px(lerp(-200, 900, E.inOutCubic(bm))), top: '760px', width: '420px', height: '3px', borderRadius: '3px', opacity: Math.sin(bm * Math.PI).toFixed(3),
      background: 'linear-gradient(90deg, transparent, rgba(147,162,255,.9), #fff)', boxShadow: '0 0 24px 4px rgba(147,162,255,.6)' });
    // tilted type-in settles flat; then the camera leans into the prompt
    const wIn = E.outExpo(seg(t, 64.55, 65.4)), flat = E.inOutCubic(seg(t, 65.0, 68.3));
    const push = E.inOutCubic(seg(t, 68.6, 70.4)), rel = E.inOutCubic(seg(t, 71.95, 73.0)), aside = E.inOutCubic(seg(t, 74.5, 75.4));
    const sc = lerp(1, 1.42, push) * lerp(1, 0.83, rel * 1) * lerp(1, 0.78, aside) * lerp(0.92, 1, wIn);
    const tx = lerp(0, -40, push) * (1 - rel) + lerp(0, -330, aside), ty = lerp(0, -170, push) * (1 - rel) + lerp(0, 40, rel) * (1 - aside) + lerp(0, 10, aside);
    S(win_, { opacity: (wIn * lerp(1, 0.4, aside) * (1 - E.inOutSine(seg(t, 77.6, 78.2)))).toFixed(3),
      transform: `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) rotateX(${lerp(20, 0, flat).toFixed(2)}deg) rotateY(${lerp(-22, 0, flat).toFixed(2)}deg) rotateZ(${lerp(3, 0, flat).toFixed(2)}deg) scale(${sc.toFixed(4)})` });
    S(zHello, { opacity: (1 - seg(t, 68.3, 68.7)).toFixed(2) });
    const n = ask.n(t);
    htm(zTxt, ask.str.slice(0, n) + (t > 64.9 && t < 68.5 ? '<span style="display:inline-block;width:2px;height:26px;background:#1f1e1b;vertical-align:-5px;margin-left:1px"></span>' : ''));
    // the pasted config, and Zenstra's reading of it
    const pasted = t > 68.55, flash = 1 - seg(t, 68.55, 69.2);
    const scanY = seg(t, 71.5, 72.1);
    const lineFlag = (i) => E.outCubic(seg(t, 71.6 + i * 0.15, 71.9 + i * 0.15));
    htm(zCode, pasted ? CODE.map(([k, v, tag], i) => {
      const f = tag ? lineFlag(i) : 0;
      return `<div><span style="color:#6b6a65">${k}=</span><span style="border-radius:5px;padding:1px 3px;${f > 0 ? `background:rgba(239,90,95,${(0.16 * f).toFixed(3)});box-shadow:0 0 0 ${(1.6 * f).toFixed(1)}px rgba(239,90,95,${(0.85 * f).toFixed(2)});color:#b4232a` : ''}">${v}</span>${tag && f > 0 ? `<span style="font-family:var(--sans);font-size:13px;font-weight:700;color:#fff;background:#d6454b;border-radius:6px;padding:3px 8px;margin-left:12px;vertical-align:2px;opacity:${f.toFixed(2)}">${tag}</span>` : ''}</div>`;
    }).join('') : '');
    S(zCode, { background: `rgba(91,108,240,${(0.1 * flash * (pasted ? 1 : 0)).toFixed(3)})`, borderRadius: '10px', filter: scanY > 0 && scanY < 1 ? 'none' : 'none' });
    S(zScan, { display: scanY > 0 && scanY < 1 ? 'block' : 'none', top: `${(lerp(-40, zBox.offsetHeight - 40, scanY)).toFixed(0)}px`, background: 'linear-gradient(180deg, transparent, rgba(91,108,240,.18) 45%, rgba(91,108,240,.75) 50%, rgba(91,108,240,.18) 55%, transparent)' });
    S(zBox, { borderColor: t > 71.55 ? '#5b6cf0' : '#dcdad3', boxShadow: t > 71.55 ? '0 0 0 4px rgba(91,108,240,.18), 0 10px 30px -14px rgba(0,0,0,.25)' : '0 10px 30px -14px rgba(0,0,0,.25)' });
    // send -> lock
    const ready = n > 3;
    const locked = t > 71.62;
    htm(zSend, locked ? '<svg width="22" height="22" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#fff"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="#fff" stroke-width="2.2"/></svg>'
      : '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    S(zSend, { background: locked ? '#5b6cf0' : ready ? '#2c2b27' : '#c9c7bf', transform: `scale(${t > 71.42 && t < 71.56 ? 0.88 : 1})`, boxShadow: locked ? '0 0 0 6px rgba(91,108,240,.2)' : 'none' });
    // the message starts to leave, and meets the wall
    const lift = E.outCubic(seg(t, 71.45, 71.62)), drop = E.inOutCubic(seg(t, 71.75, 72.2));
    S(zGhost, { display: t > 71.45 && t < 72.25 ? 'block' : 'none', height: px(zBox.offsetHeight), transform: `translateY(${(-lift * 70 + drop * 70).toFixed(1)}px)`, opacity: (lift * (1 - drop)).toFixed(3) });
    const wall = Math.sin(clamp(seg(t, 71.58, 72.3)) * Math.PI);
    S(zWall, { display: wall > 0 ? 'block' : 'none', bottom: px(56 + zBox.offsetHeight + 74), background: `linear-gradient(90deg, transparent, rgba(91,108,240,${wall.toFixed(2)}) 20%, rgba(170,180,255,${wall.toFixed(2)}) 50%, rgba(91,108,240,${wall.toFixed(2)}) 80%, transparent)`, boxShadow: `0 0 ${(30 * wall).toFixed(0)}px ${(6 * wall).toFixed(0)}px rgba(91,108,240,${(0.6 * wall).toFixed(2)})` });
    const bn = E.outExpo(seg(t, 72.35, 73.0));
    S(zBan, { opacity: bn.toFixed(3), transform: `translateY(${((1 - bn) * -40).toFixed(1)}px)` });
    htm(zStat, t > 72.75 ? '<span style="width:9px;height:9px;border-radius:50%;background:#5b6cf0"></span><span style="color:#3d4196">Not sent · recorded by Zenstra AI</span>' : '');
    // cursor
    const cp = E.inOutCubic(seg(t, 70.2, 71.25));
    const sendR = zSend.getBoundingClientRect();
    S(cursor, { display: t > 69.9 && t < 72.6 ? 'block' : 'none', left: px(lerp(1700, sendR.left + sendR.width * 0.45, cp)), top: px(lerp(980, sendR.top + sendR.height * 0.5, cp)), opacity: (seg(t, 69.9, 70.2) * (1 - seg(t, 72.3, 72.6))).toFixed(2), transform: `scale(${t > 71.42 && t < 71.56 ? 0.85 : 1})` });
    // console
    const cin = E.outExpo(seg(t, 74.75, 75.5));
    S(con, { display: t > 74.7 && t < 78.3 ? 'block' : 'none', opacity: (cin * (1 - seg(t, 77.7, 78.2))).toFixed(3), transform: `translateX(${((1 - cin) * 80).toFixed(1)}px)` });
    zc.forEach((c, i) => reveal(c, E.outCubic(seg(t, 74.95 + i * 0.07, 75.4 + i * 0.07)), 10, 6));
    zs.forEach((s, i) => { const on = seg(t, 75.6 + i * 0.35, 75.75 + i * 0.35) > 0.5; const dot = s.firstElementChild; S(dot, { background: on ? (i === 2 ? 'var(--red)' : 'var(--zen)') : 'transparent', borderColor: on ? 'transparent' : 'rgba(147,162,255,.4)', color: on ? '#fff' : '#8e95c4' }); });
    S(endDim, { opacity: E.inOutSine(seg(t, 77.8, 78.3)).toFixed(3) });
    endK.update(t, 78.25, 82.2);
    S(endW, { display: t > 78.2 && t < 82.3 ? 'block' : 'none' });
    reveal(endS, E.outCubic(seg(t, 79.0, 79.8)) * (1 - E.inOutSine(seg(t, 81.7, 82.2))), 16, 8);
  };
});
