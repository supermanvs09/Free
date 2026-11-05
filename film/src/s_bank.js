/* adapID AI · Identity Fraud Prevention (47.6 - 64.9 s)
   Correct credentials, the wrong person: behaviour, device and context against the customer's own normal. */
const T_B = { a: 47.6, b: 64.9 };
scene(T_B.a, T_B.b, (root) => {
  S(root, { background: 'radial-gradient(80% 70% at 40% 45%, #17110c 0%, #0a0907 55%, #050505 100%)' });
  // warm bokeh: an evening at home, abstracted
  const bok = el('div', 'fill', root);
  const r = rng(5);
  bok.innerHTML = Array.from({ length: 14 }, () => { const s = 60 + r() * 220, c = r() < 0.6 ? '255,170,90' : '90,200,190'; return `<span style="position:absolute;left:${(r() * 100).toFixed(1)}%;top:${(r() * 100).toFixed(1)}%;width:${s}px;height:${s}px;border-radius:50%;background:radial-gradient(circle, rgba(${c},.16), rgba(${c},.05) 60%, transparent 70%);filter:blur(${(6 + r() * 14).toFixed(0)}px)"></span>`; }).join('');
  const outline = el('div', 'fill', root);
  const stage3d = el('div', 'fill', root); S(stage3d, { perspective: '2200px' });
  const phone = el('div', 'abs', stage3d);
  S(phone, { width: '410px', height: '840px', borderRadius: '66px', padding: '14px', background: 'linear-gradient(145deg,#3a3f48 0%,#15181e 40%,#0b0d11 100%)',
    boxShadow: '0 80px 120px -40px rgba(0,0,0,.95), 0 0 0 1.5px rgba(255,255,255,.08), inset 0 0 0 1.5px rgba(255,255,255,.06), 0 0 120px -20px rgba(255,170,90,.15)', transformStyle: 'preserve-3d' });
  const scr = el('div', '', phone);
  S(scr, { position: 'relative', width: '382px', height: '812px', borderRadius: '53px', overflow: 'hidden', background: '#f5f7fa', color: '#101828', fontFamily: 'var(--sans)' });
  const gloss = el('div', '', phone); S(gloss, { position: 'absolute', inset: '0', borderRadius: '66px', background: 'linear-gradient(115deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 70%, rgba(255,255,255,.05) 100%)', pointerEvents: 'none' });
  const TEAL = '#0b6e5b';
  const status = '<div style="height:54px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 34px 8px;font-size:15px;font-weight:650"><span>21:44</span><span style="display:flex;gap:6px;align-items:center"><svg width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#101828"/><rect x="5" y="5" width="3" height="7" rx="1" fill="#101828"/><rect x="10" y="2" width="3" height="10" rx="1" fill="#101828"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#101828"/></svg><svg width="24" height="12"><rect x=".5" y=".5" width="20" height="11" rx="3" fill="none" stroke="#101828"/><rect x="2" y="2" width="14" height="8" rx="2" fill="#101828"/></svg></span></div>';
  const island = '<div style="position:absolute;left:50%;top:12px;width:112px;height:32px;margin-left:-56px;border-radius:20px;background:#000;z-index:5"></div>';
  const logo = (s) => `<div style="width:${s}px;height:${s}px;border-radius:${s * 0.3}px;background:linear-gradient(135deg,#14967c,${TEAL});display:grid;place-items:center;color:#fff;font-weight:800;font-size:${s * 0.48}px">Y</div>`;
  const vA = el('div', 'fill', scr), vB = el('div', 'fill', scr), vC = el('div', 'fill', scr);
  [vA, vB, vC].forEach((v) => S(v, { width: '382px', height: '812px' }));
  vA.innerHTML = island + status + `<div style="padding:40px 30px 0">
    <div style="display:flex;align-items:center;gap:12px">${logo(44)}<b style="font-size:22px;letter-spacing:-.01em">Your Bank</b></div>
    <div style="font-size:30px;font-weight:700;letter-spacing:-.02em;margin:44px 0 6px">Welcome back</div><div style="font-size:16px;color:#5a6577;margin-bottom:30px">Log in to continue</div>
    <div style="font-size:14px;color:#5a6577;margin-bottom:7px">Customer ID</div><div class="b-id" style="height:54px;border-radius:14px;border:1.5px solid #d6dde7;background:#fff;display:flex;align-items:center;padding:0 16px;font-size:19px;letter-spacing:.06em"></div>
    <div style="font-size:14px;color:#5a6577;margin:18px 0 7px">Password</div><div class="b-pw" style="height:54px;border-radius:14px;border:1.5px solid #d6dde7;background:#fff;display:flex;align-items:center;padding:0 16px;font-size:22px;letter-spacing:.14em"></div>
    <div class="b-login" style="margin-top:26px;height:56px;border-radius:14px;background:${TEAL};color:#fff;display:grid;place-items:center;font-size:18px;font-weight:650">Log in</div>
    <div class="b-otp" style="margin-top:26px"><div style="font-size:14px;color:#5a6577;margin-bottom:9px">One-time password</div><div class="b-otpb" style="display:flex;gap:8px"></div></div>
    </div><div class="b-ok" style="position:absolute;inset:0;background:#f5f7fa;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
    <div style="width:86px;height:86px;border-radius:50%;background:#dcf5ec;display:grid;place-items:center"><svg width="44" height="44" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="${TEAL}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div style="font-size:23px;font-weight:700">Authentication successful</div></div>`;
  vB.innerHTML = island + status + `<div style="padding:18px 24px 0">
    <div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:15px;color:#5a6577">Good evening,</div><div style="font-size:25px;font-weight:700;letter-spacing:-.02em">Ananya</div></div>${logo(42)}</div>
    <div style="margin-top:20px;border-radius:22px;padding:22px;color:#fff;background:linear-gradient(135deg,#14967c,#0a5345);box-shadow:0 20px 40px -20px rgba(11,110,91,.7)">
      <div style="font-size:14px;opacity:.8">Savings · ••4821</div><div style="font-size:14px;opacity:.8;margin-top:18px">Available balance</div><div style="font-size:32px;font-weight:700;letter-spacing:-.02em;margin-top:4px">₹ 3,42,180.55</div></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:22px;text-align:center;font-size:13px;color:#2a3242">
      ${['Send money', 'UPI', 'Cards', 'Bills'].map((n, i) => `<div><div style="width:58px;height:58px;margin:0 auto 8px;border-radius:18px;background:#fff;box-shadow:0 6px 16px -8px rgba(16,24,40,.25);display:grid;place-items:center"><span style="width:22px;height:22px;border-radius:${i === 1 ? '50%' : '6px'};border:2.4px solid ${TEAL}"></span></div>${n}</div>`).join('')}</div>
    <div style="font-size:16px;font-weight:700;margin:26px 0 10px">Recent</div>
    ${[['Grocery store', '−₹1,240'], ['Electricity bill', '−₹2,860'], ['Salary credit', '+₹1,12,000']].map(([n, v]) => `<div style="display:flex;justify-content:space-between;padding:13px 2px;border-bottom:1px solid #e6ebf1;font-size:16px"><span>${n}</span><b style="color:${v[0] === '+' ? TEAL : '#101828'}">${v}</b></div>`).join('')}</div>`;
  vC.innerHTML = island + status + `<div style="padding:18px 24px 0">
    <div style="font-size:25px;font-weight:700;letter-spacing:-.02em;margin-bottom:22px">Send money</div>
    <div style="border-radius:18px;background:#fff;padding:18px;box-shadow:0 8px 24px -14px rgba(16,24,40,.3)"><div style="font-size:13px;color:#5a6577">To</div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:8px"><div style="width:44px;height:44px;border-radius:50%;background:#e9eef5;display:grid;place-items:center;font-weight:700;color:#3b4658">RS</div><div><b style="font-size:17px">R. Sharma</b><div style="font-size:14px;color:#5a6577">A/c ••••7730</div></div></div>
      <div style="margin-top:12px;display:inline-block;font-size:12.5px;font-weight:700;color:#9a5b00;background:#fff3dc;border-radius:8px;padding:5px 9px">New beneficiary · added 3 min ago</div></div>
    <div style="font-size:13px;color:#5a6577;margin:24px 0 6px">Amount</div><div class="b-amt" style="font-size:46px;font-weight:700;letter-spacing:-.03em;height:58px"></div>
    <div style="height:1.5px;background:#d6dde7;margin:6px 0 24px"></div>
    <div class="b-conf" style="height:58px;border-radius:14px;background:${TEAL};color:#fff;display:grid;place-items:center;font-size:18px;font-weight:650">Confirm transfer</div>
    <div class="b-chk" style="margin-top:16px;text-align:center;font-size:15px;color:#5a6577"></div></div>
    <div class="b-sheet" style="position:absolute;left:0;right:0;bottom:0;height:390px;border-radius:30px 30px 0 0;background:#fff;box-shadow:0 -20px 50px -20px rgba(16,24,40,.4);padding:26px 28px;text-align:center">
      <div style="width:44px;height:5px;border-radius:9px;background:#d6dde7;margin:0 auto 22px"></div>
      <svg width="96" height="96" viewBox="0 0 96 96"><path d="M14 30V18a4 4 0 014-4h12M66 14h12a4 4 0 014 4v12M82 66v12a4 4 0 01-4 4H66M30 82H18a4 4 0 01-4-4V66" fill="none" stroke="${TEAL}" stroke-width="4" stroke-linecap="round"/><circle cx="48" cy="42" r="13" fill="none" stroke="#3b4658" stroke-width="3"/><path d="M27 72c4-11 12-15 21-15s17 4 21 15" fill="none" stroke="#3b4658" stroke-width="3" stroke-linecap="round"/><line class="b-scan" x1="20" x2="76" y1="30" y2="30" stroke="${TEAL}" stroke-width="2.5" opacity=".7"/></svg>
      <div style="font-size:23px;font-weight:700;margin-top:14px">Verify it’s you</div><div style="font-size:15.5px;color:#5a6577;margin-top:8px;line-height:1.45">Your Bank needs a quick face check<br>before this transfer.</div>
      <div style="margin-top:20px;height:54px;border-radius:14px;background:${TEAL};color:#fff;display:grid;place-items:center;font-size:17px;font-weight:650">Continue</div></div>`;
  const q = (v, s) => v.querySelector(s);
  const bId = q(vA, '.b-id'), bPw = q(vA, '.b-pw'), bLogin = q(vA, '.b-login'), bOtp = q(vA, '.b-otp'), bOtpb = q(vA, '.b-otpb'), bOk = q(vA, '.b-ok');
  const bAmt = q(vC, '.b-amt'), bConf = q(vC, '.b-conf'), bChk = q(vC, '.b-chk'), bSheet = q(vC, '.b-sheet'), bScan = q(vC, '.b-scan');
  const taps = el('div', 'fill', scr); S(taps, { pointerEvents: 'none' });
  const tapEl = el('div', '', taps); S(tapEl, { position: 'absolute', width: '56px', height: '56px', marginLeft: '-28px', marginTop: '-28px', borderRadius: '50%', border: '2px solid rgba(16,24,40,.35)', background: 'rgba(16,24,40,.10)' });
  const TAPS = [[49.15, 190, 238], [50.2, 190, 330], [50.75, 190, 450], [58.55, 190, 476]];
  TAPS.forEach(([tt]) => sfx(tt, 'tap'));
  const cid = typer('4821', 49.3, 9, 8, { vol: 0.5 }), pw = typer('••••••••', 50.3, 13, 9, { vol: 0.5 }), amt = typer('85,000', 57.4, 8, 10, { vol: 0.5 });
  sfx(51.3, 'success'); sfx(51.9, 'swipe'); sfx(56.85, 'swipe');

  /* comparison */
  const cmp = el('div', 'pan', root); S(cmp, { left: '880px', top: '128px', width: '930px' });
  const bars = (vals, col) => `<svg width="300" height="54">${vals.map((v, i) => `<rect x="${i * 15}" y="${54 - v}" width="9" height="${v}" rx="3" fill="${col}"/>`).join('')}</svg>`;
  const reg = Array.from({ length: 20 }, (_, i) => 22 + Math.round(Math.sin(i * 1.7) * 4));
  const irr = [18, 44, 12, 50, 9, 6, 52, 30, 8, 46, 15, 54, 10, 7, 40, 22, 53, 9, 34, 48];
  const dots = (cx, cy, spread, col, n, seed) => { const rr = rng(seed); return Array.from({ length: n }, () => `<circle cx="${(cx + (rr() - 0.5) * spread * 2).toFixed(1)}" cy="${(cy + (rr() - 0.5) * spread * 1.4).toFixed(1)}" r="${(3 + rr() * 3).toFixed(1)}" fill="${col}" opacity=".75"/>`).join(''); };
  const phoneIcon = (inner) => `<svg width="300" height="70" viewBox="0 0 300 70"><rect x="2" y="2" width="296" height="66" rx="12" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.08)"/>${inner}</svg>`;
  const ROWS = [
    ['Device', '<span style="color:var(--green)">●</span> Registered phone, bound to the account', '<span style="color:var(--amber)">●</span> First seen 4 minutes ago'],
    ['Typing rhythm', bars(reg, 'rgba(60,200,246,.85)'), bars(irr, 'rgba(243,178,62,.9)')],
    ['Touch and hold', phoneIcon(dots(220, 40, 26, '#3cc8f6', 22, 3)), phoneIcon(dots(90, 30, 34, '#f3b23e', 22, 4) + '<text x="292" y="62" text-anchor="end" fill="#f3b23e" font-size="12" font-family="Inter">harder presses</text>')],
    ['Network', '<span style="color:var(--green)">●</span> Home broadband · Pune', '<span style="color:var(--amber)">●</span> New network · 1,200 km away'],
  ];
  cmp.innerHTML = `<div style="padding:24px 28px 8px"><div style="font-size:30px;font-weight:650;letter-spacing:-.02em">Same credentials. Different behaviour.</div></div>
    <div style="display:grid;grid-template-columns:170px 1fr 1fr;gap:0 24px;padding:6px 28px 0"><span></span><span class="lbl">Usual for this customer · 90 days</span><span class="lbl" style="color:var(--amber)">This session</span></div>
    ${ROWS.map(([k, a, b]) => `<div class="cr" style="display:grid;grid-template-columns:170px 1fr 1fr;gap:0 24px;align-items:center;padding:16px 28px;border-top:1px solid var(--line);margin-top:10px;font-size:18px"><span class="lbl">${k}</span><span>${a}</span><span>${b}</span></div>`).join('')}
    <div class="cr" style="padding:18px 28px 24px;border-top:1px solid var(--line)"><div class="row" style="justify-content:space-between;font-size:18px"><span>Behavioural match</span><span class="m-val num" style="font-weight:700"></span></div>
      <div style="position:relative;height:10px;border-radius:9px;margin-top:12px;background:linear-gradient(90deg,#ef5a5f,#f3b23e 45%,#3fd99b)"><div class="m-k" style="position:absolute;top:-7px;width:24px;height:24px;margin-left:-12px;border-radius:50%;background:#fff;box-shadow:0 0 0 5px rgba(255,255,255,.15)"></div></div></div>`;
  const crs = [...cmp.querySelectorAll('.cr')], mVal = cmp.querySelector('.m-val'), mK = cmp.querySelector('.m-k');
  const mismatch = new Kin(root, 'Behavioural identity *mismatch* detected.', { style: { left: '880px', width: '930px', top: '934px', textAlign: 'center', fontSize: '40px' } });
  mismatch.e.querySelectorAll('.acc').forEach((x) => (x.style.color = 'var(--amber)'));
  [53.4, 53.8, 54.2, 54.6].forEach((tt) => sfx(tt, 'tick')); sfx(55.3, 'alert');
  /* signals converge */
  const SIG = ['Device · unrecognised', 'Behavioural match · low', 'Beneficiary · new', 'Session · 4 minutes old', 'Amount · above usual'];
  const sigs = SIG.map((s) => { const c = el('div', 'chip', root); c.innerHTML = `<i style="background:var(--amber);box-shadow:0 0 10px var(--amber)"></i>${s}`; return c; });
  const badge = el('div', 'abs', root); S(badge, { left: '760px', top: '470px', width: '400px', textAlign: 'center' });
  badge.innerHTML = '<div class="lbl">Identity risk</div><div style="font-family:var(--disp);font-size:84px;font-weight:600;letter-spacing:-.04em;color:var(--red);line-height:1.05">High</div><div style="font-size:20px;color:var(--t2);margin-top:6px">Elevated identity risk detected</div>';
  sfx(58.9, 'converge'); sfx(59.6, 'impact');
  /* adapID panel */
  const pan = el('div', 'pan', root); S(pan, { left: '930px', top: '150px', width: '860px' });
  panelHead(pan, 'adapid', 'Identity Fraud Prevention', 'Mobile banking');
  const pb = el('div', '', pan); S(pb, { padding: '10px 26px 24px' });
  const F = [['Channel', 'Mobile banking'], ['Customer', '<span class="mono">*******4821</span>'], ['Device', '<span style="color:var(--amber)">Unrecognised</span>'], ['Behavioural match', '<span style="color:var(--amber)">Low</span>'], ['Transaction context', '<span style="color:var(--amber)">Elevated risk</span>'], ['Threat', 'Potential account takeover']];
  pb.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 30px">${F.map(([k, v]) => `<div class="fr" style="padding:13px 0;border-bottom:1px solid var(--line)"><div class="lbl">${k}</div><div style="font-size:19px;margin-top:5px;font-weight:600">${v}</div></div>`).join('')}</div>
    <div class="fr row" style="justify-content:space-between;margin-top:16px"><div><div class="lbl">Identity risk</div><div class="row" style="gap:12px;margin-top:4px"><span class="num" style="font-family:var(--disp);font-size:52px;font-weight:600;letter-spacing:-.04em;line-height:1">88</span><span class="pill p-high"><i></i>High</span></div></div>
      <div style="max-width:430px;padding:15px 18px;border-radius:14px;background:rgba(60,200,246,.08);border:1px solid rgba(60,200,246,.25)"><div style="font-size:17px;font-weight:600">Bank policy: verify the customer before this transfer</div><div class="row" style="gap:8px;margin-top:6px;font-size:15px;color:var(--cyan)"><i style="width:8px;height:8px;border-radius:50%;background:var(--cyan)"></i>Face verification requested</div></div></div>
    <div class="fr row" style="justify-content:space-between;margin-top:18px;font-size:15px;color:var(--t2)"><span>Every decision with its reasons, for the analyst and the auditor</span><span class="row" style="gap:8px"><span class="chip" style="position:relative;font-size:14px;padding:6px 11px">Mobile banking</span><span class="chip" style="position:relative;font-size:14px;padding:6px 11px">Internet banking</span></span></div>`;
  const frs = [...pb.querySelectorAll('.fr')];
  sfx(60.0, 'uiIn'); sfx(60.85, 'confirm');
  const endDim = el('div', 'fill', root); S(endDim, { background: 'radial-gradient(80% 70% at 50% 45%, rgba(5,5,5,.86), rgba(5,5,5,.97))' });
  const end = new EndCard(root, 'Recognize the person.\nNot just the password.', 'adapid', 'Identity Fraud Prevention for Mobile & Internet Banking', { y: 380 });
  sfx(62.15, 'hit');

  return (t) => {
    S(root, { opacity: (E.inOutSine(seg(t, 47.6, 48.0)) * (1 - E.inOutSine(seg(t, 64.3, 64.9)))).toFixed(3) });
    // the phone is drawn by a single line, then filled
    const draw = E.inOutCubic(seg(t, 47.65, 48.6)), body = E.outCubic(seg(t, 48.3, 48.9));
    const shift = E.inOutCubic(seg(t, 52.5, 53.3)), back = E.inOutCubic(seg(t, 59.7, 60.4));
    const X = lerp(lerp(755, 330, shift), 290, back), Y = 120;
    const ry = lerp(-14, -8, shift) + Math.sin(t * 0.5) * 1.5, rx = 5 + Math.sin(t * 0.37) * 1;
    S(phone, { left: px(X), top: px(Y), opacity: body.toFixed(3), transform: `rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) scale(${lerp(0.94, 1, body).toFixed(3)})` });
    htm(outline, draw > 0 && body < 1 ? `<svg width="1920" height="1080" style="position:absolute;inset:0"><rect x="${X + 4}" y="${Y + 4}" width="402" height="832" rx="64" fill="none" stroke="#3cc8f6" stroke-width="2.5" pathLength="1" stroke-dasharray="${draw.toFixed(3)} 1" opacity="${(1 - body).toFixed(3)}" style="filter:drop-shadow(0 0 8px #3cc8f6)"/></svg>` : '');
    // screens
    const toB = E.inOutCubic(seg(t, 51.85, 52.3)), toC = E.inOutCubic(seg(t, 56.8, 57.25));
    S(vA, { transform: `translateX(${(-toB * 100).toFixed(2)}%)` });
    S(vB, { transform: `translateX(${((1 - toB) * 100 - toC * 100).toFixed(2)}%)` });
    S(vC, { transform: `translateX(${((1 - toC) * 100).toFixed(2)}%)` });
    htm(bId, '*'.repeat(Math.min(7, Math.floor(seg(t, 49.2, 49.3) * 7))) + cid.str.slice(0, cid.n(t)));
    htm(bPw, pw.str.slice(0, pw.n(t)));
    S(bId, { borderColor: t > 49.15 && t < 50.2 ? '#0b6e5b' : '#d6dde7' }); S(bPw, { borderColor: t > 50.2 && t < 50.75 ? '#0b6e5b' : '#d6dde7' });
    S(bLogin, { transform: `scale(${t > 50.75 && t < 50.9 ? 0.97 : 1})` });
    const ot = seg(t, 50.85, 51.15);
    S(bOtp, { opacity: seg(t, 50.8, 50.95).toFixed(2) });
    htm(bOtpb, [7, 3, 9, 0, 4, 6].map((d, i) => `<div style="flex:1;height:52px;border-radius:12px;border:1.5px solid ${ot * 6 > i ? '#0b6e5b' : '#d6dde7'};background:#fff;display:grid;place-items:center;font-size:22px;font-weight:700">${ot * 6 > i ? d : ''}</div>`).join(''));
    S(bOk, { opacity: E.outCubic(seg(t, 51.25, 51.55)).toFixed(3) });
    htm(bAmt, amt.n(t) ? '₹' + amt.str.slice(0, amt.n(t)) : '<span style="color:#b6bfcc">₹0</span>');
    S(bConf, { transform: `scale(${t > 58.55 && t < 58.7 ? 0.97 : 1})`, opacity: t > 58.7 ? 0.55 : 1 });
    htm(bChk, t > 58.7 && t < 60.75 ? 'Checking…' : '');
    const sh = E.outExpo(seg(t, 60.75, 61.3)); S(bSheet, { transform: `translateY(${((1 - sh) * 100).toFixed(2)}%)` });
    S(bScan, { transform: `translateY(${(Math.abs(((t * 0.8) % 2) - 1) * 40).toFixed(1)}px)` });
    // taps
    const tp = TAPS.find(([tt]) => t >= tt && t < tt + 0.45);
    S(tapEl, { display: tp ? 'block' : 'none' });
    if (tp) { const u = seg(t, tp[0], tp[0] + 0.45); S(tapEl, { left: tp[1] + 'px', top: tp[2] + 'px', opacity: (1 - u).toFixed(2), transform: `scale(${lerp(0.5, 1.5, E.outCubic(u)).toFixed(3)})` }); }
    // comparison
    const cv = win(t, 52.9, 58.55, 0.6, 0.45);
    S(cmp, { display: cv > 0 ? 'block' : 'none' }); reveal(cmp, cv, 20, 10);
    crs.forEach((c, i) => reveal(c, E.outCubic(seg(t, 53.3 + i * 0.4, 53.75 + i * 0.4)), 10, 6));
    const m = lerp(92, 18, E.inOutCubic(seg(t, 55.0, 56.0)));
    txt(mVal, Math.round(m) + '% · ' + (m > 60 ? 'High' : m > 35 ? 'Medium' : 'Low')); S(mVal, { color: m > 60 ? 'var(--green)' : m > 35 ? 'var(--amber)' : 'var(--red)' });
    S(mK, { left: m.toFixed(1) + '%' });
    mismatch.update(t, 55.35, 58.5);
    // signals converge into one assessment
    const phoneCx = X + 205, phoneCy = Y + 420;
    sigs.forEach((c, i) => {
      const a0 = -1.0 + i * 0.5, rad = 330;
      const sx = phoneCx + 120 + Math.cos(a0) * rad + 140, sy = phoneCy + Math.sin(a0) * rad;
      const ap = E.outBack(seg(t, 58.1 + i * 0.1, 58.55 + i * 0.1)), cvg = E.inOutCubic(seg(t, 58.85, 59.55));
      const tx = 960, ty = 420 + i * 0;
      const vis = ap * (1 - seg(t, 59.4, 59.6));
      S(c, { display: vis > 0 ? 'inline-flex' : 'none', left: px(lerp(sx, tx - 120, cvg)), top: px(lerp(sy, ty, cvg)), opacity: vis.toFixed(3), transform: `scale(${lerp(1, 0.6, cvg).toFixed(3)})` });
    });
    const bv = win(t, 59.45, 60.25, 0.3, 0.35);
    S(badge, { display: bv > 0 ? 'block' : 'none', opacity: bv.toFixed(3), transform: `scale(${lerp(0.9, 1, E.outBack(seg(t, 59.45, 59.9))).toFixed(3)})` });
    const pin = E.outExpo(seg(t, 60.0, 60.7));
    S(pan, { display: t > 59.95 && t < 62.4 ? 'block' : 'none', opacity: (pin * (1 - seg(t, 61.85, 62.25))).toFixed(3), transform: `translateX(${((1 - pin) * 60).toFixed(1)}px)` });
    frs.forEach((f, i) => reveal(f, E.outCubic(seg(t, 60.2 + i * 0.09, 60.6 + i * 0.09)), 10, 6));
    S(endDim, { opacity: E.inOutSine(seg(t, 61.9, 62.4)).toFixed(3) });
    end.update(t, 62.15, 64.4);
  };
});
