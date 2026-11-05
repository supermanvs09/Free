/* adapID AI · CIRM for Active Directory (24.8 - 35.8 s)
   The single identity becomes one node in the directory; one quiet group change opens a path to Tier 0. */
const T_AD = { a: 24.8, b: 35.8 };
const AD = (() => {
  const r = rng(21), N = [], Ed = [];
  const add = (o) => { o.i = N.length; N.push(o); return o; };
  const link = (a, b, k, o = {}) => Ed.push({ a: a.i, b: b.i, k, ...o });
  const dom = add({ p: [0, -470, 0], t: 'domain', name: 'corp.local' });
  const OUS = ['Finance', 'Engineering', 'IT Operations', 'Servers', 'Workstations'];
  const ou = OUS.map((n, i) => { const a = -Math.PI / 2 + i * (Math.PI * 2 / 5) + 0.35; return add({ p: [Math.cos(a) * 620, -210, Math.sin(a) * 620], t: 'ou', name: n }); });
  ou.forEach((o) => link(dom, o, 'contain'));
  const around = (o, rad, y) => { const a = r() * 6.283, d = rad * (0.35 + r() * 0.65); return [o.p[0] + Math.cos(a) * d, y + (r() - 0.5) * 70, o.p[2] + Math.sin(a) * d]; };
  const named = {};
  const put = (o, name, t, off) => { const n = add({ p: [o.p[0] + off[0], off[1], o.p[2] + off[2]], t, name }); link(o, n, 'contain'); named[name] = n; return n; };
  put(ou[0], 'alex.morgan', 'user', [-60, 60, 70]); put(ou[0], 'priya.n', 'user', [120, 90, -40]); put(ou[0], 'rahul.k', 'user', [-150, 120, -110]);
  put(ou[1], 'svc-build', 'svc', [90, 80, 120]); put(ou[1], 'dev.ananya', 'user', [-110, 110, 30]);
  put(ou[2], 'it-admin.sam', 'priv', [-170, 70, -40]); put(ou[2], 'svc-backup', 'svc', [190, 110, 130]);
  put(ou[2], 'Helpdesk', 'group', [40, 180, -190]); put(ou[2], 'Server Admins', 'group', [260, 220, -60]);
  put(ou[3], 'SRV-DB01', 'pc', [-140, 90, 120]); put(ou[3], 'SRV-FILE02', 'pc', [140, 120, 40]);
  put(ou[4], 'WS-0412', 'pc', [-90, 90, 60]); put(ou[4], 'WS-0388', 'pc', [130, 120, -80]);
  // Tier 0 sits apart: the directory's crown
  const t0 = add({ p: [60, -330, -60], t: 'group', name: 'Domain Admins', tier0: 1 }); named['Domain Admins'] = t0; link(dom, t0, 'contain');
  const dc = add({ p: [-180, -340, 120], t: 'pc', name: 'DC01', tier0: 1 }); named.DC01 = dc; link(dom, dc, 'contain');
  ou.forEach((o, i) => { const n = [16, 18, 8, 9, 16][i]; for (let k = 0; k < n; k++) { const d = add({ p: around(o, 300, 130), t: i === 3 ? 'pcdot' : i === 4 ? 'pcdot' : 'dot' }); link(o, d, 'contain'); } });
  link(named['it-admin.sam'], t0, 'member'); link(t0, dc, 'admin'); link(named['Server Admins'], named['SRV-DB01'], 'admin');
  link(named['SRV-DB01'], named['it-admin.sam'], 'session'); link(named['Helpdesk'], named['WS-0412'], 'admin');
  const NEW = Ed.length; link(named['svc-backup'], named['Server Admins'], 'member', { fresh: 1 });
  const PATH = [['svc-backup', 'Server Admins'], ['Server Admins', 'SRV-DB01'], ['SRV-DB01', 'it-admin.sam'], ['it-admin.sam', 'Domain Admins']]
    .map(([a, b]) => Ed.findIndex((e) => (e.a === named[a].i && e.b === named[b].i) || (e.b === named[a].i && e.a === named[b].i)));
  return { N, Ed, named, NEW, PATH };
})();

scene(T_AD.a, T_AD.b, (root) => {
  S(root, { background: 'radial-gradient(90% 80% at 50% 45%, #0b1426 0%, #05080f 70%)' });
  const cv = el('canvas', 'full', root); cv.width = FW; cv.height = FH; const g = cv.getContext('2d');
  const spr = { user: glowSprite('86,204,242', 96), priv: glowSprite('230,238,255', 96), svc: glowSprite('157,140,255', 96), group: glowSprite('110,170,255', 96), pc: glowSprite('150,170,200', 96), amber: glowSprite('243,178,62', 128), red: glowSprite('239,90,95', 128) };
  const COL = { domain: '#dbe7f7', ou: '#8aa0bd', user: '#56ccf2', priv: '#eef3ff', svc: '#9d8cff', group: '#7fb0ff', pc: '#9fb0c6', dot: '#56ccf2', pcdot: '#8193ab' };
  const legend = el('div', 'abs', root); S(legend, { left: '96px', top: '86px', display: 'flex', gap: '10px' });
  legend.innerHTML = [['#56ccf2', 'Users'], ['#eef3ff', 'Privileged accounts'], ['#9d8cff', 'Service accounts'], ['#7fb0ff', 'Groups'], ['#9fb0c6', 'Computers'], ['#8aa0bd', 'OUs']]
    .map(([c, l]) => `<div class="chip" style="position:relative;font-size:16px;padding:8px 13px"><i style="background:${c};box-shadow:0 0 10px ${c}"></i>${l}</div>`).join('');
  const evt = el('div', 'pan', root); S(evt, { width: '380px', padding: '16px 18px', borderRadius: '16px' });
  evt.innerHTML = `<div class="row" style="gap:10px"><i style="width:10px;height:10px;border-radius:50%;background:var(--amber);box-shadow:0 0 14px var(--amber)"></i><span class="mono" style="font-size:15px;color:var(--t2)">02:14</span><span style="font-size:15px;font-weight:650">Group membership changed</span></div>
    <div style="font-size:19px;margin-top:8px;line-height:1.3"><b>svc-backup</b> added to <b>Server Admins</b></div><div style="font-size:15px;color:var(--t2);margin-top:6px">No linked change request</div>`;
  const hop = el('div', 'chip', root); S(hop, { fontWeight: '600' });
  const pan = el('div', 'pan', root); S(pan, { left: '96px', top: '286px', width: '700px' });
  panelHead(pan, 'adapid', 'Continuous Identity Risk Management', 'Active Directory');
  const pb = el('div', '', pan); S(pb, { padding: '8px 26px 24px' });
  const chipP = (n, c) => `<span style="display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid var(--line);font-size:15px"><i style="width:8px;height:8px;border-radius:50%;background:${c}"></i>${n}</span>`;
  const arr = '<span style="color:var(--t3);margin:0 6px">→</span>';
  pb.innerHTML = [
    ['Change', '<b>svc-backup</b> added to <b>Server Admins</b> at 02:14'],
    ['Effect', `New path to <b>Domain Admins</b> · 4 hops<div style="margin-top:10px;line-height:2.1">${chipP('svc-backup', '#9d8cff')}${arr}${chipP('Server Admins', '#7fb0ff')}${arr}${chipP('SRV-DB01', '#9fb0c6')}${arr}${chipP('it-admin.sam', '#eef3ff')}${arr}${chipP('Domain Admins', '#f3b23e')}</div>`],
    ['Context', 'This service account has never changed membership before'],
  ].map(([k, v]) => `<div class="adr" style="display:grid;grid-template-columns:110px 1fr;gap:12px;padding:15px 0;border-bottom:1px solid var(--line);font-size:18px;line-height:1.35"><span class="lbl" style="padding-top:3px">${k}</span><span>${v}</span></div>`).join('')
    + `<div class="adr row" style="justify-content:space-between;margin-top:18px"><div class="pill p-mid"><i></i>Flagged for review</div>
       <div class="row" style="gap:10px"><span style="padding:11px 18px;border-radius:11px;border:1px solid var(--line2);font-size:16px;font-weight:600">Approve change</span><span style="padding:11px 18px;border-radius:11px;background:var(--brand);font-size:16px;font-weight:650">Remove membership</span></div></div>`;
  const rows = [...pb.querySelectorAll('.adr')];
  const endDim = el('div', 'fill', root); S(endDim, { background: 'radial-gradient(80% 70% at 50% 45%, rgba(4,6,11,.86), rgba(4,6,11,.97))' });
  const end = new EndCard(root, 'Understand the identities\nbehind your enterprise.', 'adapid', 'Continuous Identity Risk Management for Active Directory', { y: 380 });
  sfx(25.0, 'reveal'); sfx(29.3, 'alert'); sfx(30.35, 'step'); sfx(30.75, 'step'); sfx(31.15, 'step'); sfx(31.55, 'stepHi'); sfx(31.75, 'uiIn'); sfx(33.5, 'hit');

  const cam = makeCam({ f: 1150 });
  const alex = AD.named['alex.morgan'].p, svc = AD.named['svc-backup'].p, da = AD.named['Domain Admins'].p, mid = [(svc[0] + da[0]) / 2, (svc[1] + da[1]) / 2 + 30, (svc[2] + da[2]) / 2];
  const vlerp = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  return (t) => {
    S(root, { opacity: (E.inOutSine(seg(t, 24.8, 25.3)) * (1 - E.inOutSine(seg(t, 35.2, 35.8)))).toFixed(3) });
    const pull = E.inOutCubic(seg(t, 24.9, 27.6)), toSvc = E.inOutCubic(seg(t, 28.2, 29.6)), toPath = E.inOutCubic(seg(t, 30.0, 31.6)), rise = E.inOutCubic(seg(t, 34.6, 35.8));
    let tg = vlerp(alex, [0, -120, 0], pull); tg = vlerp(tg, svc, toSvc); tg = vlerp(tg, mid, toPath);
    cam.tx = tg[0]; cam.ty = tg[1]; cam.tz = tg[2];
    cam.dist = lerp(lerp(lerp(lerp(520, 1550, pull), 950, toSvc), 1150, toPath), 2400, rise);
    cam.yaw = lerp(-0.2, 0.55, pull) + 0.22 * seg(t, 27.2, 29.0) + lerp(0, 0.35, toSvc) + 0.12 * seg(t, 31.6, 35.8);
    cam.pitch = lerp(0.05, 0.38, pull) + lerp(0, 0.7, rise);
    cam.cx = lerp(FW / 2, FW / 2 + 300, E.inOutCubic(seg(t, 31.4, 32.2)));
    g.clearRect(0, 0, FW, FH);
    const P = AD.N.map((n) => project(n.p, cam));
    const pathOn = AD.PATH.map((ei, k) => E.outCubic(seg(t, 30.35 + k * 0.4, 30.75 + k * 0.4)));
    const fresh = E.inOutCubic(seg(t, 29.3, 29.9));
    // tier 0 halo
    const t0 = P[AD.named['Domain Admins'].i], dcp = P[AD.named.DC01.i];
    if (t0 && dcp) {
      const cx = (t0.x + dcp.x) / 2, cy = (t0.y + dcp.y) / 2, rr = 260 * t0.k;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr); const hot = pathOn[3];
      gr.addColorStop(0, `rgba(${hot > 0 ? '243,178,62' : '200,215,240'},${(0.10 + 0.12 * hot).toFixed(3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(cx - rr, cy - rr, rr * 2, rr * 2);
      g.font = `600 ${Math.max(11, 15 * t0.k * 1.4).toFixed(0)}px Inter`; g.fillStyle = 'rgba(220,230,245,.55)'; g.textAlign = 'center';
      g.fillText('TIER 0', cx, cy - rr * 0.62);
    }
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    AD.Ed.forEach((e, ei) => {
      const a = P[e.a], b = P[e.b]; if (!a || !b) return;
      let al = 0.14, col = '150,180,230', lw = 1;
      if (e.k === 'member') { al = 0.32; col = '127,176,255'; }
      if (e.k === 'admin') { al = 0.3; col = '170,190,220'; }
      if (e.k === 'session') { al = 0.28; col = '230,238,255'; }
      if (e.fresh) { if (fresh <= 0) return; al = 0.9; col = '243,178,62'; lw = 2.4; }
      const pi = AD.PATH.indexOf(ei);
      if (pi >= 0 && pathOn[pi] > 0) { col = pi === 3 ? '239,90,95' : '243,178,62'; al = lerp(al, 0.95, pathOn[pi]); lw = lerp(lw, 3, pathOn[pi]); }
      g.strokeStyle = `rgba(${col},${al})`; g.lineWidth = lw * Math.max(0.7, Math.min(1.8, Math.sqrt(a.k * b.k) * 1.4));
      if (e.k === 'member' || e.k === 'session') g.setLineDash([6, 6]); else g.setLineDash([]);
      g.beginPath(); g.moveTo(a.x, a.y);
      const ex = e.fresh ? lerp(a.x, b.x, fresh) : b.x, ey = e.fresh ? lerp(a.y, b.y, fresh) : b.y;
      g.lineTo(ex, ey); g.stroke();
      if (pi >= 0 && pathOn[pi] > 0 && pathOn[pi] < 1) { const s = 60; g.drawImage(spr.amber, lerp(a.x, b.x, pathOn[pi]) - s / 2, lerp(a.y, b.y, pathOn[pi]) - s / 2, s, s); }
    });
    g.setLineDash([]); g.restore();
    const order = AD.N.map((n, i) => i).filter((i) => P[i]).sort((x, y) => P[y].z - P[x].z);
    for (const i of order) {
      const n = AD.N[i], p = P[i];
      const near = clamp((p.z - 40) / 200);
      if (n.t === 'dot' || n.t === 'pcdot') {
        g.globalAlpha = 0.75 * near; g.fillStyle = COL[n.t]; g.beginPath(); g.arc(p.x, p.y, Math.max(1.2, 5 * p.k), 0, 6.283); g.fill(); g.globalAlpha = 1; continue;
      }
      const sc = Math.max(0.55, Math.min(2.2, p.k * 1.25));
      const onPath = AD.PATH.some((ei, k) => pathOn[k] > 0.5 && (AD.Ed[ei].a === i || AD.Ed[ei].b === i));
      const isSvc = n.name === 'svc-backup' && t > 29.3;
      if (spr[n.t]) { const s = 120 * sc; g.globalAlpha = near * 0.8; g.globalCompositeOperation = 'lighter'; g.drawImage(onPath || isSvc ? spr.amber : spr[n.t], p.x - s / 2, p.y - s / 2, s, s); g.globalCompositeOperation = 'source-over'; }
      g.globalAlpha = near;
      const fs = 17 * sc; g.font = `${n.t === 'domain' || n.t === 'ou' ? 600 : 500} ${fs.toFixed(1)}px Inter`;
      const label = n.t === 'domain' ? n.name : n.name;
      const tw = g.measureText(label).width, ih = 26 * sc, w = tw + ih + 22 * sc, h = 38 * sc;
      const x = p.x - h / 2, y = p.y - h / 2;
      g.fillStyle = n.t === 'ou' || n.t === 'domain' ? 'rgba(20,28,44,.92)' : 'rgba(13,19,31,.94)';
      rrect(g, x, y, w, h, h / 2); g.fill();
      g.strokeStyle = onPath || isSvc ? 'rgba(243,178,62,.9)' : n.tier0 ? 'rgba(230,238,255,.45)' : 'rgba(255,255,255,.14)'; g.lineWidth = onPath || isSvc ? 2 : 1; g.stroke();
      // icon
      const icx = x + h / 2, icy = p.y, ir = 9 * sc; g.fillStyle = COL[n.t];
      if (n.t === 'user' || n.t === 'priv') { g.beginPath(); g.arc(icx, icy - ir * 0.35, ir * 0.42, 0, 6.283); g.fill(); g.beginPath(); g.ellipse(icx, icy + ir * 0.62, ir * 0.72, ir * 0.42, 0, Math.PI, 0); g.fill(); if (n.t === 'priv') { g.strokeStyle = COL.priv; g.lineWidth = 1.4; g.beginPath(); g.arc(icx, icy, ir * 1.25, 0, 6.283); g.stroke(); } }
      else if (n.t === 'svc') { rrect(g, icx - ir * 0.75, icy - ir * 0.75, ir * 1.5, ir * 1.5, ir * 0.35); g.fill(); g.fillStyle = '#0d131f'; g.beginPath(); g.arc(icx, icy, ir * 0.32, 0, 6.283); g.fill(); }
      else if (n.t === 'group') { [-0.55, 0, 0.55].forEach((dx, j) => { g.beginPath(); g.arc(icx + dx * ir, icy + (j === 1 ? -0.25 : 0.12) * ir, ir * 0.38, 0, 6.283); g.fill(); }); }
      else if (n.t === 'pc') { rrect(g, icx - ir * 0.8, icy - ir * 0.75, ir * 1.6, ir * 0.62, 2); g.fill(); rrect(g, icx - ir * 0.8, icy + ir * 0.05, ir * 1.6, ir * 0.62, 2); g.fill(); }
      else { rrect(g, icx - ir * 0.85, icy - ir * 0.6, ir * 1.7, ir * 1.2, 3); g.fill(); }
      g.fillStyle = n.t === 'ou' ? '#c4d0e0' : '#eef3fa'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(label, x + ih + 14 * sc, p.y + 1); g.textBaseline = 'alphabetic';
      g.globalAlpha = 1;
    }
    // the alex node, carried over from Microsoft 365
    const ap = P[AD.named['alex.morgan'].i];
    if (ap && t < 27) { const s = 220 * ap.k * (1 - seg(t, 25.6, 27)); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.8; g.drawImage(spr.user, ap.x - s / 2, ap.y - s / 2, s, s); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    reveal(legend, win(t, 25.9, 29.0, 0.6, 0.5), 12, 6);
    const sp = P[AD.named['svc-backup'].i];
    const ev = win(t, 29.35, 31.3, 0.45, 0.4);
    S(evt, { display: ev > 0 && sp ? 'block' : 'none' });
    if (ev > 0 && sp) { S(evt, { left: px(sp.x + 70), top: px(sp.y - 150) }); reveal(evt, ev, 14, 8); }
    // hop counter rides the path
    const hk = AD.PATH.reduce((s, ei, k) => s + (pathOn[k] > 0.5 ? 1 : 0), 0);
    const hv = win(t, 30.4, 31.9, 0.3, 0.35);
    const tip = AD.Ed[AD.PATH[Math.max(0, hk - 1)]], tp = tip && P[tip.b];
    S(hop, { display: hv > 0 && tp ? 'inline-flex' : 'none' });
    if (hv > 0 && tp) { htm(hop, `<i style="background:${hk === 4 ? 'var(--red)' : 'var(--amber)'}"></i>${hk === 4 ? 'Domain Admins reached · 4 hops' : 'Hop ' + Math.max(1, hk)}`); S(hop, { left: px(tp.x + 40), top: px(tp.y + 26), opacity: hv.toFixed(3) }); }
    const pin = E.outExpo(seg(t, 31.75, 32.5));
    S(pan, { display: t > 31.7 && t < 33.9 ? 'block' : 'none', opacity: (pin * (1 - seg(t, 33.2, 33.6))).toFixed(3), transform: `translateX(${((1 - pin) * -50).toFixed(1)}px)` });
    rows.forEach((rw, i) => reveal(rw, E.outCubic(seg(t, 32.0 + i * 0.25, 32.45 + i * 0.25)), 10, 6));
    S(endDim, { opacity: E.inOutSine(seg(t, 33.3, 33.8)).toFixed(3) });
    end.update(t, 33.5, 35.4);
  };
});
