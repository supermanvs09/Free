/* Product screens. Rebuilt from each product's documented workflow (no invented capabilities);
   all people, accounts and values are fictional. Each screen enters on the light-line wipe and
   drifts slowly, like a screen recording shot on a slider. */
const UI = {};
const CUR = '<svg viewBox="0 0 28 28" width="30" height="30"><path d="M5 3l17 10.5-7.3 1.6-3.6 7.4z" fill="#fff" stroke="#0b0f18" stroke-width="1.6" stroke-linejoin="round"/></svg>';
function uiLayer(a, b, build, o = { in: 'wipe' }) {
  if (o.in === 'wipe') sfx(a, 'wipe');
  return layer(a, b, (root) => {
    const cam = el('div', 'fill', root); S(cam, { transformOrigin: o.origin || '50% 50%' });
    const line = el('div', 'wipe-line', root); S(line, { display: 'none' });
    const upd = build(cam, root);
    return (t) => {
      const k = E.inOutSine(seg(t, a, b));
      S(cam, { transform: `scale(${lerp(o.z0 || 1.0, o.z1 || 1.045, k).toFixed(4)}) translate(${lerp(o.x0 || 0, o.x1 || -10, k).toFixed(1)}px, ${lerp(0, o.y1 || -6, k).toFixed(1)}px)` });
      entrance(root, line, t, a, o); upd(t);
    };
  });
}
/* adapID console chrome */
function adapChrome(parent, crumb, tag) {
  S(parent, { background: '#0a1120', fontFamily: 'var(--sans)', color: '#e6edf6' });
  const side = el('div', 'abs', parent); S(side, { left: '0', top: '0', width: '84px', height: '1080px', background: '#0d1527', borderRight: '1px solid rgba(255,255,255,.06)' });
  side.innerHTML = `<div style="margin:22px auto 30px;width:44px;height:44px;border-radius:12px;background:#fff;display:grid;place-items:center;overflow:hidden"><img src="assets/adapid.png" style="width:100%;height:100%;object-fit:contain"></div>` +
    ['M4 7h16M4 12h16M4 17h10', 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z', 'M5 19V9M12 19V5M19 19v-7', 'M4 6h16v12H4zM4 10h16'].map((d, i) => `<svg width="26" height="26" viewBox="0 0 24 24" style="display:block;margin:0 auto 28px;opacity:${i === 1 ? 1 : 0.45}"><path d="${d}" fill="none" stroke="${i === 1 ? '#3cc8f6' : '#9fb0c6'}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`).join('');
  const top = el('div', 'abs', parent); S(top, { left: '84px', right: '0', top: '0', height: '76px', borderBottom: '1px solid rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', padding: '0 40px', gap: '18px' });
  top.innerHTML = `<b style="font-size:21px;letter-spacing:-.01em">adapID AI</b><span style="color:#5d6d84">/</span><span style="font-size:18px;color:#a9b6c8">${crumb}</span>
    <span style="margin-left:auto;display:flex;align-items:center;gap:10px;font-size:15px;color:#a9b6c8"><i style="width:8px;height:8px;border-radius:50%;background:#3fd99b;box-shadow:0 0 10px #3fd99b"></i>${tag}</span>`;
  const Z = 1.17, main = el('div', 'abs', parent); S(main, { left: '84px', top: '76px', zoom: String(Z), width: px(1836 / Z), height: px(1004 / Z), padding: '30px 36px' });
  return main;
}
const card = (st = '') => `background:#101a2e;border:1px solid rgba(255,255,255,.07);border-radius:16px;${st}`;
const RISK = (v) => (v < 40 ? ['#3fd99b', 'Low'] : v < 70 ? ['#f3b23e', 'Elevated'] : ['#ef5a5f', 'High']);

/* ---- the employee opens a company application (on her own laptop, outdoors) ---- */
UI.portal = (a, b) => uiLayer(a, b, (cam) => {
  S(cam, { background: '#e9edf3' });
  const w = el('div', 'abs', cam); S(w, { left: '0', top: '0', width: '1280px', height: '720px', zoom: '1.5', background: '#f6f8fb', color: '#121a2a' });
  w.innerHTML = `<div style="height:64px;background:#fff;border-bottom:1px solid #e3e8ef;display:flex;align-items:center;gap:14px;padding:0 36px">
      <div style="width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#2b6fd6,#173f86);color:#fff;display:grid;place-items:center;font-weight:700">C</div><b style="font-size:19px">Company Workspace</b>
      <span style="margin-left:auto;display:flex;align-items:center;gap:10px;font-size:16px;color:#4a5568"><span style="width:34px;height:34px;border-radius:50%;background:#2a5f8f;color:#fff;display:grid;place-items:center;font-size:14px;font-weight:700">MC</span>Mei Chen</span></div>
    <div style="padding:46px 60px"><div style="font:600 40px/1.1 var(--disp);letter-spacing:-.02em">Good afternoon, Mei</div><div style="font-size:19px;color:#5a6577;margin-top:10px">Finance · Quarterly close</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:38px">${[['Finance reports', '12 files updated today'], ['Vendor payments', '3 approvals waiting'], ['Team calendar', 'Board review · Thu 10:00']].map(([h, s], i) => `<div class="pt" style="background:#fff;border:1px solid #e3e8ef;border-radius:16px;padding:26px 28px;box-shadow:0 10px 30px -18px rgba(16,24,40,.25)"><div style="width:42px;height:42px;border-radius:11px;background:${['#e7f0ff', '#e9f8f1', '#fff4e3'][i]};margin-bottom:18px"></div><div style="font-size:21px;font-weight:650">${h}</div><div style="font-size:16px;color:#5a6577;margin-top:6px">${s}</div></div>`).join('')}</div>
      <div class="pt" style="margin-top:26px;background:#fff;border:1px solid #e3e8ef;border-radius:16px;padding:8px 28px">${[['Q3 close · consolidated P&L.xlsx', 'Finance reports', '13:55'], ['Vendor master · October.csv', 'Vendor payments', '12:40'], ['Board pack · draft v4.pdf', 'Finance reports', '11:02']].map(([f, w, t2], i) => `<div style="display:grid;grid-template-columns:1fr 220px 80px;padding:15px 0;${i ? 'border-top:1px solid #eef1f5;' : ''}font-size:16px"><span style="font-weight:600">${f}</span><span style="color:#5a6577">${w}</span><span style="color:#8a94a6;text-align:right">${t2}</span></div>`).join('')}</div></div>
    <div class="ps" style="position:absolute;right:40px;top:88px;background:#101828;color:#fff;border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:12px;font-size:17px;box-shadow:0 20px 40px -16px rgba(16,24,40,.5)"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#14a05c"/><path d="M7.5 12.3l3 3 6-6.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>Signed in with SSO · MFA passed</div>`;
  const pts = [...w.querySelectorAll('.pt')], ps = w.querySelector('.ps');
  sfx(a + 0.7, 'success');
  return (t) => { pts.forEach((p, i) => reveal(p, E.outCubic(seg(t, a + 0.25 + i * 0.1, a + 0.75 + i * 0.1)), 16, 6)); reveal(ps, E.outBack(seg(t, a + 0.7, a + 1.1)), -14, 4); };
}, { in: 'wipe', z1: 1.06, x1: -20 });

/* ---- adapID CIRM: the same session, its context changing ---- */
UI.cirm = (a, b) => uiLayer(a, b, (cam) => {
  const m = adapChrome(cam, 'Identities / mei.chen@company.com', 'Session live');
  m.innerHTML = `<div style="display:grid;grid-template-columns:330px 1fr 380px;gap:24px;align-items:start">
    <div style="${card('padding:28px')}"><div style="width:76px;height:76px;border-radius:50%;background:linear-gradient(135deg,#2a7fd4,#1b4a8a);display:grid;place-items:center;font-weight:700;font-size:26px">MC</div>
      <div style="font-size:26px;font-weight:650;margin-top:18px">Mei Chen</div><div style="font-size:17px;color:#8a99ae;margin-top:4px">Finance Analyst · Hyderabad</div>
      <div class="lbl" style="margin:28px 0 12px">Usual pattern · 90 days</div>
      ${[['Location', 'Hyderabad office'], ['Device', 'Managed laptop'], ['Hours', '09:00 – 18:30'], ['Apps', 'Mail, Workspace, ERP']].map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:11px 0;border-top:1px solid rgba(255,255,255,.06);font-size:17px"><span style="color:#8a99ae">${k}</span><span>${v}</span></div>`).join('')}</div>
    <div style="${card('padding:28px;position:relative;height:640px')}"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:22px">Session timeline · today</b><span style="font-size:15px;color:#8a99ae">Signed in 09:12 · active</span></div>
      <div class="cv" style="position:absolute;left:28px;right:28px;top:90px;height:300px"></div>
      <div class="ev" style="position:absolute;left:28px;right:28px;top:420px;display:grid;gap:12px"></div></div>
    <div style="${card('padding:28px')}"><div class="lbl">Identity risk</div><div style="display:flex;align-items:center;gap:16px;margin-top:10px"><span class="rn num" style="font:600 92px/1 var(--disp);letter-spacing:-.04em">14</span><span class="rp pill p-low"><i></i><span>Low</span></span></div>
      <div class="lbl" style="margin:26px 0 8px">Why it changed</div><div class="rs"></div>
      <div class="dc" style="margin-top:22px;padding:18px;border-radius:14px;background:rgba(60,200,246,.08);border:1px solid rgba(60,200,246,.25)"><div style="font-size:15px;color:#9fdcf4;font-weight:600;letter-spacing:.06em;text-transform:uppercase">Your policy</div><div style="font-size:19px;margin-top:8px;line-height:1.35">Step-up verification before sensitive access</div><div style="display:flex;align-items:center;gap:8px;margin-top:10px;color:#3cc8f6;font-size:16px;font-weight:600"><i style="width:8px;height:8px;border-radius:50%;background:#3cc8f6"></i>Requested · not a confirmed compromise</div></div></div></div>`;
  const cv = m.querySelector('.cv'), ev = m.querySelector('.ev'), rn = m.querySelector('.rn'), rp = m.querySelector('.rp'), rs = m.querySelector('.rs'), dc = m.querySelector('.dc');
  const EV = [{ t: a + 0.7, x: 0.08, h: '09:12', s: 'Signed in · office network · managed laptop', v: 14, c: '#3fd99b' },
    { t: a + 1.6, x: 0.56, h: '13:58', s: 'New network · public Wi-Fi', v: 33, c: '#f3b23e' },
    { t: a + 2.5, x: 0.7, h: '14:02', s: 'Personal laptop · first seen for this identity', v: 49, c: '#f3b23e' },
    { t: a + 3.4, x: 0.84, h: '14:05', s: 'Finance reports · first access in 90 days', v: 62, c: '#f3b23e' }];
  ev.innerHTML = EV.map((e) => `<div class="e" style="display:flex;align-items:center;gap:14px;font-size:17px"><i style="width:10px;height:10px;border-radius:50%;background:${e.c};box-shadow:0 0 12px ${e.c}"></i><span class="mono" style="color:#8a99ae;width:56px">${e.h}</span>${e.s}</div>`).join('');
  rs.innerHTML = [['+19', 'Public network, outside usual pattern'], ['+16', 'Device first seen for this identity'], ['+13', 'Sensitive app, first access in 90 days']].map(([p, d]) => `<div class="r" style="display:flex;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.06);font-size:16px"><span class="mono" style="color:#f3b23e;width:40px">${p}</span>${d}</div>`).join('');
  const evs = [...ev.querySelectorAll('.e')], rr = [...rs.querySelectorAll('.r')];
  EV.slice(1).forEach((e) => sfx(e.t, 'alert')); sfx(a + 4.4, 'confirm');
  return (t) => {
    let v = 14; EV.forEach((e, i) => { if (i) v = lerp(v, e.v, E.outCubic(seg(t, e.t, e.t + 0.5))); });
    const [col, lab] = RISK(v); txt(rn, String(Math.round(v))); S(rn, { color: col });
    if (rp.__l !== lab) { rp.__l = lab; rp.className = 'rp pill ' + (v < 40 ? 'p-low' : v < 70 ? 'p-mid' : 'p-high'); rp.lastElementChild.textContent = lab; }
    const W = 640, H = 300, ph = clamp(seg(t, a + 0.4, a + 3.9));
    const pts = []; for (let i = 0; i <= 60; i++) { const x = i / 60; if (x > ph) break; let y = 14; EV.forEach((e, k) => { if (k && x >= e.x) y = e.v; }); pts.push([x * W, H - (y / 100) * H * 0.95]); }
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    htm(cv, `<svg width="${W}" height="${H}" style="width:100%;height:100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect x="0" y="${H - 0.4 * H * 0.95}" width="${W}" height="${0.4 * H * 0.95}" fill="rgba(63,217,155,.06)"/><text x="8" y="${H - 8}" fill="#5d6d84" font-size="13" font-family="JetBrains Mono">USUAL RANGE</text>
      ${[0.25, 0.5, 0.75].map((g) => `<line x1="0" x2="${W}" y1="${H * g}" y2="${H * g}" stroke="rgba(255,255,255,.05)"/>`).join('')}
      ${pts.length > 1 ? `<path d="${d} L${pts[pts.length - 1][0]} ${H} L0 ${H}Z" fill="${col}" opacity=".10"/><path d="${d}" fill="none" stroke="${col}" stroke-width="3"/>` : ''}
      ${EV.map((e) => (t >= e.t ? `<circle cx="${e.x * W}" cy="${H - (e.v / 100) * H * 0.95}" r="7" fill="${e.c}" stroke="#101a2e" stroke-width="3"/>` : '')).join('')}</svg>`);
    evs.forEach((e, i) => reveal(e, E.outCubic(seg(t, EV[i].t, EV[i].t + 0.4)), 10, 6));
    rr.forEach((r, i) => reveal(r, E.outCubic(seg(t, EV[i + 1].t + 0.2, EV[i + 1].t + 0.6)), 8, 4));
    reveal(dc, E.outCubic(seg(t, a + 4.4, a + 4.9)), 14, 6);
  };
}, { in: 'fade', inD: 0.3, z0: 1.06, z1: 1.11, x1: -8, origin: '46% 24%' });

/* ---- adapID NHI Security for AWS: one workload's identity and what it can reach ---- */
UI.nhi = (a, b) => uiLayer(a, b, (cam) => {
  const m = adapChrome(cam, 'NHI Security for AWS / prod account', 'Read-only role · synced 14:00');
  const ROWS = [['payment-service-prod', 'IAM role', 'High', '#ef5a5f'], ['batch-reports', 'IAM role', 'Medium', '#f3b23e'], ['ci-deploy', 'IAM user · 2 keys', 'Medium', '#f3b23e'], ['notify-lambda', 'Service role', 'Low', '#3fd99b'], ['ml-training', 'SageMaker role', 'Low', '#3fd99b']];
  m.innerHTML = `<div style="display:grid;grid-template-columns:470px 1fr;gap:26px;height:100%">
    <div style="${card('padding:24px')}"><b style="font-size:21px">Machine identities</b><div style="font-size:15px;color:#8a99ae;margin:6px 0 16px">Roles, users, keys and workload identities</div>
      ${ROWS.map(([n, k, r, c], i) => `<div class="ir" style="display:flex;align-items:center;justify-content:space-between;padding:15px 14px;border-radius:12px;margin-bottom:6px;${i === 0 ? 'background:rgba(60,200,246,.08);border:1px solid rgba(60,200,246,.3)' : 'border:1px solid transparent'}"><div><div class="mono" style="font-size:16px;font-weight:600">${n}</div><div style="font-size:14px;color:#8a99ae;margin-top:3px">${k}</div></div><span style="font-size:14px;font-weight:650;color:${c}">${r}</span></div>`).join('')}</div>
    <div style="display:grid;grid-template-rows:1fr auto;gap:22px"><div style="${card('position:relative;overflow:hidden')}" class="gw"><div style="position:absolute;left:26px;top:22px"><b style="font-size:21px" class="mono">payment-service-prod</b><div style="font-size:15px;color:#8a99ae;margin-top:4px">Access graph · who can reach what</div></div><div class="gr" style="position:absolute;inset:0"></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
        <div class="nb" style="${card('padding:22px')}"><div class="lbl">Granted vs used · 90 days of CloudTrail</div>
          <div style="display:flex;justify-content:space-between;font-size:16px;margin-top:14px"><span>Granted · <span class="mono">s3:*</span> on <span class="mono">*</span></span><span style="color:#8a99ae">all buckets</span></div><div style="height:8px;border-radius:9px;background:rgba(255,255,255,.06);margin:8px 0 14px"><div class="b1" style="height:100%;border-radius:9px;background:#f3b23e"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:16px"><span>Used · 2 actions</span><span style="color:#8a99ae">1 bucket</span></div><div style="height:8px;border-radius:9px;background:rgba(255,255,255,.06);margin-top:8px"><div class="b2" style="height:100%;border-radius:9px;background:#3cc8f6"></div></div></div>
        <div class="nr" style="${card('padding:22px;background:rgba(60,200,246,.07);border-color:rgba(60,200,246,.25)')}"><div style="display:flex;justify-content:space-between"><b style="font-size:19px">Review permissions. Apply least privilege.</b><span style="font-size:13px;font-weight:700;color:#3cc8f6">PROPOSED</span></div>
          <div class="mono" style="font-size:15px;color:#c9d6ea;margin-top:12px;line-height:1.7">s3:GetObject, s3:PutObject<br>arn:aws:s3:::payments-settlements/*</div><div style="font-size:14px;color:#8a99ae;margin-top:6px">Applied only with approval</div></div></div></div></div>`;
  const gr = m.querySelector('.gr'), irs = [...m.querySelectorAll('.ir')], nb = m.querySelector('.nb'), nr = m.querySelector('.nr'), b1 = m.querySelector('.b1'), b2 = m.querySelector('.b2');
  const N = { wl: [110, 300, 'payments-app', 'Workload · ECS', '#3cc8f6'], role: [380, 300, 'payment-service-prod', 'IAM role · STS', '#9d8cff'], perm: [650, 300, 's3:*  ·  Resource *', 'Permissions', '#f3b23e'] };
  const RES = ['payments-settlements', 'hr-exports', 'audit-logs', 'customer-kyc-archive', 'backups-2024'];
  const OTH = [['payments-db', 'Amazon RDS · network only'], ['batch-worker', 'Amazon EC2 · network only']];
  sfx(a + 1.0, 'build'); sfx(a + 2.3, 'alert'); [0, 1, 2, 3, 4].forEach((i) => sfx(a + 2.5 + i * 0.12, 'spread')); sfx(a + 5.0, 'confirm');
  return (t) => {
    const g1 = E.outCubic(seg(t, a + 0.6, a + 1.4)), g2 = E.outCubic(seg(t, a + 1.2, a + 2.0)), sp = seg(t, a + 2.4, a + 3.4), nar = E.inOutCubic(seg(t, a + 5.0, a + 5.8));
    const node = ([x, y, n, s, c], al) => `<g opacity="${al.toFixed(3)}"><rect x="${x - 112}" y="${y - 34}" width="224" height="68" rx="14" fill="#0b1323" stroke="${c}" stroke-opacity=".7"/><text x="${x}" y="${y - 4}" fill="#e6edf6" font-size="16" font-weight="600" text-anchor="middle" font-family="JetBrains Mono">${n}</text><text x="${x}" y="${y + 19}" fill="#8a99ae" font-size="13" text-anchor="middle" font-family="Inter">${s}</text></g>`;
    let s = '';
    const edge = (x1, y1, x2, y2, col, al, w = 2) => `<path d="M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}" fill="none" stroke="${col}" stroke-opacity="${al.toFixed(3)}" stroke-width="${w}"/>`;
    s += edge(222, 300, 268, 300, '#3cc8f6', g1) + edge(492, 300, 538, 300, '#9d8cff', g2);
    RES.forEach((r, i) => { const y = 110 + i * 92, k = clamp(sp * 5 - i), keep = i === 0; const col = keep && nar > 0.5 ? '#3cc8f6' : '#f3b23e'; const al = k * (keep ? 1 : 1 - nar * 0.85);
      s += edge(762, 300, 860, y, col, al * 0.9, keep && nar > 0.5 ? 3 : 2);
      s += `<g opacity="${(0.25 + 0.75 * clamp(k)) * (keep ? 1 : 1 - nar * 0.55)}"><rect x="862" y="${y - 26}" width="250" height="52" rx="12" fill="#0b1323" stroke="${k > 0.5 ? col : 'rgba(255,255,255,.15)'}" stroke-opacity=".75"/><text x="882" y="${y + 6}" fill="#e6edf6" font-size="15" font-family="JetBrains Mono">${r}</text></g>`; });
    OTH.forEach(([n, d], i) => { const y = 560 + i * 0; const x = 230 + i * 300; s += `<g opacity="${(g1 * 0.8).toFixed(3)}"><rect x="${x}" y="560" width="250" height="56" rx="12" fill="#0b1323" stroke="rgba(255,255,255,.12)"/><text x="${x + 18}" y="584" fill="#c9d6ea" font-size="15" font-family="JetBrains Mono">${n}</text><text x="${x + 18}" y="604" fill="#6c7a90" font-size="12" font-family="Inter">${d}</text></g>`; });
    s += node(N.wl, g1) + node(N.role, g2) + node(N.perm, clamp(sp * 3));
    if (sp > 0.6 && nar < 0.5) s += `<text x="650" y="372" fill="#f3b23e" font-size="15" font-weight="600" text-anchor="middle" font-family="Inter">Excessive permissions</text>`;
    if (nar > 0.5) s += `<text x="987" y="70" fill="#3cc8f6" font-size="13" font-weight="700" text-anchor="middle" font-family="Inter" letter-spacing="1.5">PROPOSED SCOPE</text>`;
    htm(gr, `<svg viewBox="0 0 1150 640" preserveAspectRatio="xMidYMid meet" style="position:absolute;left:12px;right:12px;top:64px;bottom:8px;width:calc(100% - 24px);height:calc(100% - 72px)">${s}</svg>`);
    irs.forEach((r, i) => reveal(r, E.outCubic(seg(t, a + 0.3 + i * 0.08, a + 0.7 + i * 0.08)), 10, 4));
    reveal(nb, E.outCubic(seg(t, a + 3.4, a + 3.9)), 12, 6); reveal(nr, E.outCubic(seg(t, a + 4.6, a + 5.1)), 12, 6);
    S(b1, { width: (100 * E.outCubic(seg(t, a + 3.6, a + 4.2))).toFixed(1) + '%' }); S(b2, { width: (5 * E.outCubic(seg(t, a + 3.9, a + 4.4))).toFixed(1) + '%' });
  };
}, { in: 'wipe', z1: 1.05, x1: -16 });

/* ---- the customer's own transfer: checked, then sent with no extra step ---- */
UI.bank = (a, b) => uiLayer(a, b, (cam) => {
  const bg = img('shots/s16/f0090.jpg', cam, 'foot'); S(bg, { filter: 'blur(18px) brightness(.55)', transform: 'scale(1.1)' });
  const ph = el('div', 'abs', cam);
  S(ph, { left: '760px', top: '40px', width: '410px', height: '1000px', borderRadius: '70px', padding: '15px', background: 'linear-gradient(145deg,#3a3f48 0%,#15181e 40%,#0b0d11 100%)', boxShadow: '0 80px 120px -40px rgba(0,0,0,.95), 0 0 0 1.5px rgba(255,255,255,.1)', transform: 'rotate(-3deg)' });
  const TEAL = '#0b6e5b';
  ph.innerHTML = `<div style="position:relative;width:380px;height:970px;border-radius:56px;overflow:hidden;background:#f5f7fa;color:#101828">
    <div style="position:absolute;left:50%;top:13px;width:112px;height:32px;margin-left:-56px;border-radius:20px;background:#000"></div>
    <div style="height:60px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 34px 8px;font-size:15px;font-weight:650"><span>16:21</span><span>5G</span></div>
    <div style="padding:22px 26px"><div style="font-size:27px;font-weight:700;letter-spacing:-.02em">Send money</div>
      <div style="margin-top:22px;border-radius:18px;background:#fff;padding:18px;box-shadow:0 8px 24px -14px rgba(16,24,40,.3);display:flex;gap:14px;align-items:center"><div style="width:48px;height:48px;border-radius:50%;background:#e2f3ee;color:${TEAL};display:grid;place-items:center;font-weight:700">A</div><div><b style="font-size:18px">Amma</b><div style="font-size:14px;color:#5a6577">Saved beneficiary · A/c ••••2210</div></div></div>
      <div style="font-size:14px;color:#5a6577;margin:30px 0 6px">Amount</div><div style="font-size:52px;font-weight:700;letter-spacing:-.03em">₹12,500</div><div style="height:1.5px;background:#d6dde7;margin:10px 0 30px"></div>
      <div class="bc" style="height:60px;border-radius:15px;background:${TEAL};color:#fff;display:grid;place-items:center;font-size:19px;font-weight:650">Confirm transfer</div></div>
    <div class="bk" style="position:absolute;left:0;right:0;top:640px;height:200px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
      <svg class="sp" width="64" height="64" viewBox="0 0 84 84"><circle cx="42" cy="42" r="34" fill="none" stroke="#dbe3ec" stroke-width="6"/><circle cx="42" cy="42" r="34" fill="none" stroke="${TEAL}" stroke-width="6" stroke-linecap="round" stroke-dasharray="60 214"/></svg><div class="bt" style="font-size:20px;font-weight:600;color:#3b4658">Checking…</div></div>
    <div class="bd" style="position:absolute;inset:0;background:#f5f7fa;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px"><div style="width:96px;height:96px;border-radius:50%;background:#dcf5ec;display:grid;place-items:center"><svg width="50" height="50" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="${TEAL}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div style="font-size:26px;font-weight:700">₹12,500 sent</div><div style="font-size:17px;color:#5a6577">to Amma · just now</div></div>
    <div class="tp" style="position:absolute;width:60px;height:60px;margin:-30px;border-radius:50%;border:2px solid rgba(16,24,40,.35);background:rgba(16,24,40,.1);left:190px;top:612px"></div></div>`;
  const bc = ph.querySelector('.bc'), bk = ph.querySelector('.bk'), sp = ph.querySelector('.sp'), bd = ph.querySelector('.bd'), tp = ph.querySelector('.tp');
  sfx(a + 0.75, 'tap'); sfx(a + 2.05, 'success');
  return (t) => {
    const tap = seg(t, a + 0.75, a + 1.15);
    S(tp, { opacity: tap > 0 && tap < 1 ? (1 - tap).toFixed(2) : '0', transform: `scale(${lerp(0.5, 1.4, tap).toFixed(3)})` });
    S(bc, { transform: `scale(${t > a + 0.75 && t < a + 0.9 ? 0.97 : 1})` });
    S(bk, { opacity: (E.outCubic(seg(t, a + 0.95, a + 1.1)) * (1 - seg(t, a + 1.95, a + 2.05))).toFixed(3) });
    S(sp, { transform: `rotate(${((t - a) * 420) % 360}deg)` });
    S(bd, { opacity: E.outCubic(seg(t, a + 2.0, a + 2.3)).toFixed(3) });
  };
}, { in: 'wipe', z0: 1.0, z1: 1.06, x1: 0, y1: -14 });

/* ---- adapID Identity Fraud Prevention: two sessions, one customer ---- */
UI.fraud = (a, b) => uiLayer(a, b, (cam) => {
  const m = adapChrome(cam, 'Identity Fraud Prevention / customer *******4821', 'Mobile & internet banking');
  const rowA = [['Device', 'Registered phone', '#3fd99b'], ['Credentials', 'Password ✓  OTP ✓', '#3fd99b'], ['Behavioural match', '94%', '#3fd99b'], ['Beneficiary', 'Saved · Amma', '#3fd99b'], ['Transaction', '₹12,500', '#c9d6ea']];
  const rowB = [['Device', 'New · first seen 4 min ago', '#f3b23e'], ['Credentials', 'Password ✓  OTP ✓', '#3fd99b'], ['Behavioural match', '18% · typing and touch differ', '#ef5a5f'], ['Beneficiary', 'New · added 3 min ago', '#f3b23e'], ['Transaction', '₹85,000', '#f3b23e']];
  const col = (rows, k) => rows.map(([l, v, c]) => `<div class="f${k}" style="display:flex;justify-content:space-between;padding:15px 0;border-top:1px solid rgba(255,255,255,.06);font-size:18px"><span style="color:#8a99ae">${l}</span><span style="color:${c};font-weight:600">${v}</span></div>`).join('');
  m.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:24px"><div><div style="font:600 34px/1.1 var(--disp);letter-spacing:-.02em">Two active sessions, one customer</div><div style="font-size:17px;color:#8a99ae;margin-top:8px">Both passed login. Behaviour, device and context tell them apart.</div></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:26px">
      <div class="ca" style="${card('padding:26px')}"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:22px">Session A · this phone</b><span class="pill p-low"><i></i>Allowed</span></div><div style="margin-top:14px">${col(rowA, 'a')}</div>
        <div class="fa" style="margin-top:16px;font-size:16px;color:#3fd99b">Identity risk 8 · no extra step for the customer</div></div>
      <div class="cb" style="${card('padding:26px;border-color:rgba(239,90,95,.35)')}"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:22px">Session B · new device</b><span class="pb pill p-high"><i></i>Held</span></div><div style="margin-top:14px">${col(rowB, 'b')}</div>
        <div class="fb2" style="margin-top:16px;display:flex;align-items:center;justify-content:space-between"><div><div class="lbl">Identity risk</div><div style="font:600 64px/1 var(--disp);letter-spacing:-.04em;color:#ef5a5f" class="rb num">0</div></div>
          <div style="max-width:380px;padding:16px 18px;border-radius:14px;background:rgba(60,200,246,.08);border:1px solid rgba(60,200,246,.25)"><div style="font-size:17px;font-weight:600">Bank policy: face verification before this transfer</div><div style="font-size:15px;color:#9fdcf4;margin-top:6px">Potential account takeover · not confirmed</div></div></div></div></div>`;
  const ca = m.querySelector('.ca'), cb = m.querySelector('.cb'), rb = m.querySelector('.rb'), fb2 = m.querySelector('.fb2');
  const listA = [...ca.querySelectorAll('div')].filter((d) => d.className === 'fa');
  const listB = [...cb.querySelectorAll('div')].filter((d) => d.className === 'fb');
  [a + 1.4, a + 1.7, a + 2.0, a + 2.3, a + 2.6].forEach((tt, i) => sfx(tt, i === 2 ? 'alertHi' : 'tick')); sfx(a + 3.2, 'impact'); sfx(a + 3.9, 'confirm');
  return (t) => {
    reveal(ca, E.outCubic(seg(t, a + 0.3, a + 0.8)), 16, 6); reveal(cb, E.outCubic(seg(t, a + 0.9, a + 1.4)), 16, 6);
    listA.forEach((r, i) => reveal(r, E.outCubic(seg(t, a + 0.5 + i * 0.08, a + 0.85 + i * 0.08)), 6, 3));
    listB.forEach((r, i) => reveal(r, E.outCubic(seg(t, a + 1.4 + i * 0.3, a + 1.75 + i * 0.3)), 6, 3));
    txt(rb, String(Math.round(88 * E.outCubic(seg(t, a + 2.9, a + 3.5)))));
    reveal(fb2, E.outCubic(seg(t, a + 2.9, a + 3.3)), 10, 6);
  };
}, { in: 'wipe', z1: 1.04, x1: -12 });

/* ---- the AI assistant, customer data, and Zenstra stepping in before anything leaves ---- */
UI.ai = (a, b) => uiLayer(a, b, (cam) => {
  S(cam, { background: 'radial-gradient(80% 70% at 50% 42%, #10132c 0%, #070816 60%)' });
  const w = el('div', 'abs', cam);
  S(w, { left: '250px', top: '90px', width: '1420px', height: '900px', borderRadius: '24px', overflow: 'hidden', background: '#f7f7f5', color: '#1f1e1b', boxShadow: '0 80px 160px -40px rgba(0,0,0,.95)', transformOrigin: '50% 80%' });
  w.innerHTML = `<div style="height:56px;background:#ecebe7;display:flex;align-items:center;gap:9px;padding:0 20px;border-bottom:1px solid #dedcd6"><i style="width:13px;height:13px;border-radius:50%;background:#e2675d"></i><i style="width:13px;height:13px;border-radius:50%;background:#e8b84d"></i><i style="width:13px;height:13px;border-radius:50%;background:#62c554"></i><div style="margin-left:24px;width:520px;height:34px;border-radius:9px;background:#fff;display:flex;align-items:center;padding:0 14px;font-size:16px;color:#6b6a65">AI assistant</div></div>
    <div style="position:relative;height:844px">
      <div class="hi" style="position:absolute;left:0;right:0;top:170px;text-align:center;font:500 46px/1.1 var(--disp);letter-spacing:-.03em;color:#2c2b27">What would you like to work on?</div>
      <div class="bx" style="position:absolute;left:150px;right:150px;bottom:70px;border-radius:26px;background:#fff;border:1.5px solid #dcdad3;box-shadow:0 10px 30px -14px rgba(0,0,0,.25);padding:26px 28px 84px">
        <div class="sc" style="position:absolute;left:0;right:0;height:100px;pointer-events:none"></div>
        <div class="tx" style="font-size:24px;line-height:1.5;min-height:36px"></div><div class="cd" style="margin-top:12px;font-size:20px;line-height:1.75;color:#33322e"></div>
        <div class="sd" style="position:absolute;right:22px;bottom:18px;width:50px;height:50px;border-radius:15px;display:grid;place-items:center"></div></div>
      <div class="gh" style="position:absolute;left:150px;right:150px;bottom:70px;border-radius:26px;border:2px solid rgba(91,108,240,.7);background:rgba(91,108,240,.08)"></div>
      <div class="wl" style="position:absolute;left:100px;right:100px;height:3px;border-radius:3px"></div>
      <div class="st" style="position:absolute;left:150px;bottom:26px;font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px"></div></div>
    <div class="bn" style="position:absolute;left:150px;right:150px;top:78px;border-radius:18px;background:#14162b;color:#fff;display:flex;align-items:center;gap:18px;padding:20px 24px;box-shadow:0 30px 60px -20px rgba(20,22,43,.7)">
      <img src="assets/zen-mark.png" style="width:46px;height:42px;object-fit:contain"><div style="flex:1"><div style="font-size:22px;font-weight:700">Blocked: this prompt contains customer personal data.</div><div style="font-size:18px;color:#b9bfe6;margin-top:4px">It was not sent.</div></div>
      <div style="text-align:right;font-size:15px;color:#9aa2d6;line-height:1.5">Policy<br><b style="color:#fff;font-size:17px">Customer data protection</b></div></div>`;
  const q = (s) => w.querySelector(s);
  const tx = q('.tx'), cd = q('.cd'), sd = q('.sd'), sc = q('.sc'), gh = q('.gh'), wl = q('.wl'), st = q('.st'), bn = q('.bn'), bx = q('.bx'), hi = q('.hi');
  const ask = typer('Summarise the Q3 renewal risks for the board:', a + 0.35, 25, 41);
  const ROWS = [['Asha Rao', '4418 2290 1173', '₹48,20,000'], ['Vikram Mehta', '5521 0841 9926', '₹36,75,000'], ['Lakshmi Iyer', '6034 7712 4458', '₹29,10,000']];
  const cursor = el('div', 'cursor', cam); cursor.innerHTML = CUR;
  const T0 = a + 3.1, CLICK = a + 6.6, BLOCK = CLICK + 0.05;
  sfx(T0, 'paste'); sfx(a + 4.9, 'heart'); sfx(a + 5.5, 'heart'); sfx(CLICK, 'click'); sfx(BLOCK, 'zenScan'); sfx(BLOCK + 0.12, 'block'); [0.25, 0.4, 0.55, 0.7, 0.85, 1.0].forEach((d) => sfx(BLOCK + d, 'flag')); sfx(BLOCK + 0.9, 'banner');
  return (t) => {
    const push = E.inOutCubic(seg(t, T0 + 0.1, T0 + 1.6)), rel = E.inOutCubic(seg(t, BLOCK + 0.55, BLOCK + 1.5));
    S(w, { transform: `translate(0px, ${(lerp(0, -230, push) * (1 - rel)).toFixed(1)}px) scale(${(lerp(1, 1.32, push) * lerp(1, 1 / 1.32, rel) * (rel > 0 ? 1 : 1)).toFixed(4)}) rotateX(${lerp(8, 0, E.outCubic(seg(t, a, a + 1.2))).toFixed(2)}deg)` });
    S(hi, { opacity: (1 - seg(t, T0 - 0.2, T0 + 0.2)).toFixed(2) });
    const n = ask.n(t); htm(tx, ask.str.slice(0, n) + (t < T0 ? '<span style="display:inline-block;width:2px;height:28px;background:#1f1e1b;vertical-align:-6px;margin-left:1px"></span>' : ''));
    const flagged = (i) => E.outCubic(seg(t, BLOCK + 0.25 + i * 0.15, BLOCK + 0.55 + i * 0.15));
    const hl = (v, f, tag) => `<span style="border-radius:5px;padding:1px 4px;${f > 0 ? `background:rgba(239,90,95,${(0.16 * f).toFixed(3)});box-shadow:0 0 0 ${(1.6 * f).toFixed(1)}px rgba(239,90,95,${(0.85 * f).toFixed(2)});color:#b4232a` : ''}">${v}</span>${tag && f > 0 ? `<span style="font-size:13px;font-weight:700;color:#fff;background:#d6454b;border-radius:6px;padding:3px 8px;margin-left:8px;vertical-align:2px;opacity:${f.toFixed(2)}">${tag}</span>` : ''}`;
    htm(cd, t >= T0 ? `<div style="display:grid;grid-template-columns:1.1fr 1.3fr .8fr;gap:4px 18px"><b style="font-size:16px;color:#8a877e">Customer</b><b style="font-size:16px;color:#8a877e">Account</b><b style="font-size:16px;color:#8a877e">Renewal</b>` +
      ROWS.map(([nm, ac, v], i) => `<span>${hl(nm, flagged(i * 2), i === 0 ? 'Customer name' : '')}</span><span class="mono" style="font-size:18px">${hl(ac, flagged(i * 2 + 1), i === 0 ? 'Account number' : '')}</span><span>${v}</span>`).join('') + '</div>' : '');
    S(cd, { background: `rgba(91,108,240,${(0.1 * (1 - seg(t, T0, T0 + 0.6)) * (t >= T0 ? 1 : 0)).toFixed(3)})`, borderRadius: '10px' });
    const sy = seg(t, BLOCK, BLOCK + 0.6);
    S(sc, { display: sy > 0 && sy < 1 ? 'block' : 'none', top: `${lerp(-50, bx.offsetHeight - 50, sy).toFixed(0)}px`, background: 'linear-gradient(180deg, transparent, rgba(91,108,240,.18) 45%, rgba(91,108,240,.75) 50%, rgba(91,108,240,.18) 55%, transparent)' });
    S(bx, { borderColor: t > BLOCK ? '#5b6cf0' : '#dcdad3', boxShadow: t > BLOCK ? '0 0 0 5px rgba(91,108,240,.18)' : '0 10px 30px -14px rgba(0,0,0,.25)' });
    const locked = t > BLOCK + 0.1;
    htm(sd, locked ? '<svg width="24" height="24" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#fff"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="#fff" stroke-width="2.2"/></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    S(sd, { background: locked ? '#5b6cf0' : n > 3 ? '#2c2b27' : '#c9c7bf', transform: `scale(${t > CLICK && t < CLICK + 0.12 ? 0.88 : 1})` });
    const lift = E.outCubic(seg(t, CLICK, CLICK + 0.17)), drop = E.inOutCubic(seg(t, CLICK + 0.3, CLICK + 0.75));
    S(gh, { display: t > CLICK && t < CLICK + 0.8 ? 'block' : 'none', height: px(bx.offsetHeight), transform: `translateY(${(-lift * 80 + drop * 80).toFixed(1)}px)`, opacity: (lift * (1 - drop)).toFixed(3) });
    const wall = Math.sin(clamp(seg(t, CLICK + 0.12, CLICK + 0.85)) * Math.PI);
    S(wl, { display: wall > 0 ? 'block' : 'none', bottom: px(70 + bx.offsetHeight + 84), background: `linear-gradient(90deg, transparent, rgba(91,108,240,${wall.toFixed(2)}) 20%, rgba(170,180,255,${wall.toFixed(2)}) 50%, rgba(91,108,240,${wall.toFixed(2)}) 80%, transparent)`, boxShadow: `0 0 ${(30 * wall).toFixed(0)}px ${(6 * wall).toFixed(0)}px rgba(91,108,240,${(0.6 * wall).toFixed(2)})` });
    const bnp = E.outExpo(seg(t, BLOCK + 0.9, BLOCK + 1.5)); S(bn, { opacity: bnp.toFixed(3), transform: `translateY(${((1 - bnp) * -40).toFixed(1)}px)` });
    htm(st, t > BLOCK + 1.4 ? '<span style="width:9px;height:9px;border-radius:50%;background:#5b6cf0"></span><span style="color:#3d4196">Not sent · decision recorded by Zenstra AI</span>' : '');
    const cp = E.inOutCubic(seg(t, a + 5.0, a + 6.3)); const r = sd.getBoundingClientRect();
    S(cursor, { display: t > a + 4.7 && t < BLOCK + 1.0 ? 'block' : 'none', left: px(lerp(1720, r.left + r.width * 0.45, cp)), top: px(lerp(1000, r.top + r.height * 0.5, cp)), opacity: (seg(t, a + 4.7, a + 5.0) * (1 - seg(t, BLOCK + 0.7, BLOCK + 1.0))).toFixed(2), transform: `scale(${t > CLICK && t < CLICK + 0.12 ? 0.85 : 1})` });
  };
}, { in: 'wipe', z1: 1.03, x1: 0, y1: 0 });

/* a quiet record over the live shot: the decision is on file */
UI.zenRecord = (root) => {
  const c = el('div', 'chipL', root); S(c, { right: '90px', bottom: '96px' });
  c.innerHTML = '<img src="assets/zen-mark.png" style="width:30px;height:28px;object-fit:contain"><div><small>Zenstra AI · decision record</small><div style="margin-top:6px">Prompt blocked · customer data stayed inside</div></div>';
  return (t) => reveal(c, win(t, 101.2, 103.0, 0.45, 0.4), 14, 8);
};
