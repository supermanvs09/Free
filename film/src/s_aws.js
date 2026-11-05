/* adapID AI · NHI Security for AWS (35.4 - 48.2 s)
   An isometric production account: workload -> IAM role -> resources, and a role that can reach far more than it uses. */
const T_AWS = { a: 35.05, b: 48.2 };
scene(T_AWS.a, T_AWS.b, (root) => {
  S(root, { background: 'radial-gradient(90% 80% at 50% 40%, #0a1424 0%, #05080f 72%)' });
  const cv = el('canvas', 'full', root); cv.width = FW; cv.height = FH; const g = cv.getContext('2d');
  const amberS = glowSprite('243,178,62', 128), cyanS = glowSprite('60,200,246', 128), violS = glowSprite('157,140,255', 160);
  const cam = { s: 60, fx: 7, fy: 5, fz: 0, cx: FW / 2, cy: FH / 2 + 40 };
  const iso = (x, y, z) => [cam.cx + ((x - cam.fx) - (y - cam.fy)) * 0.866 * cam.s, cam.cy + ((x - cam.fx) + (y - cam.fy)) * 0.5 * cam.s - (z - cam.fz) * cam.s];
  const poly = (pts, fill, stroke, lw = 1) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } };
  function box(x, y, z, w, d, h, c) {
    const P = (a, b, cc) => iso(a, b, cc);
    poly([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], c.l, c.e, 1);
    poly([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], c.r, c.e, 1);
    poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], c.t, c.e2 || c.e, 1.2);
  }
  function cyl(x, y, z, r, h, c) {
    const [bx, by] = iso(x, y, z), [tx, ty] = iso(x, y, z + h);
    const rx = 1.2247 * r * cam.s, ry = 0.7071 * r * cam.s;
    const gr = g.createLinearGradient(bx - rx, 0, bx + rx, 0); gr.addColorStop(0, c.l); gr.addColorStop(1, c.r);
    g.beginPath(); g.ellipse(bx, by, rx, ry, 0, 0, Math.PI); g.lineTo(tx - rx, ty); g.ellipse(tx, ty, rx, ry, 0, Math.PI, 0, true); g.closePath();
    g.fillStyle = gr; g.fill(); g.strokeStyle = c.e; g.lineWidth = 1; g.stroke();
    if (c.bands) for (let k = 1; k < c.bands; k++) { const yy = lerp(by, ty, k / c.bands); g.beginPath(); g.ellipse(tx, yy, rx, ry, 0, 0, Math.PI); g.strokeStyle = c.e; g.stroke(); }
    g.beginPath(); g.ellipse(tx, ty, rx, ry, 0, 0, 6.283); g.fillStyle = c.t; g.fill(); g.strokeStyle = c.e2 || c.e; g.lineWidth = 1.3; g.stroke();
  }
  function shadow(x, y, r, a) { const [sx, sy] = iso(x, y, 0); const rx = 1.5 * r * cam.s, ry = 0.85 * r * cam.s; const gr = g.createRadialGradient(sx, sy, 0, sx, sy, rx); gr.addColorStop(0, `rgba(0,0,0,${0.55 * a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(sx, sy); g.scale(1, ry / rx); g.translate(-sx, -sy); g.fillStyle = gr; g.beginPath(); g.arc(sx, sy, rx, 0, 6.283); g.fill(); g.restore(); }
  function label(x, y, z, text, sub, a, col = '#eef3fa', hot) {
    if (a <= 0) return; const [lx, ly] = iso(x, y, z); const k = clamp(cam.s / 64, 0.75, 1.45);
    g.globalAlpha = a; g.font = `600 ${(17 * k).toFixed(1)}px Inter`; const w1 = g.measureText(text).width;
    g.font = `400 ${(14 * k).toFixed(1)}px Inter`; const w2 = sub ? g.measureText(sub).width : 0;
    const w = Math.max(w1, w2) + 28 * k, h = (sub ? 54 : 34) * k;
    g.fillStyle = 'rgba(11,16,27,.92)'; rrect(g, lx - w / 2, ly - h - 10 * k, w, h, 9 * k); g.fill();
    g.strokeStyle = hot || 'rgba(255,255,255,.14)'; g.lineWidth = hot ? 1.6 : 1; g.stroke();
    g.textAlign = 'center'; g.fillStyle = col; g.font = `600 ${(17 * k).toFixed(1)}px Inter`; g.fillText(text, lx, ly - h - 10 * k + 23 * k);
    if (sub) { g.fillStyle = '#8f9cb0'; g.font = `400 ${(14 * k).toFixed(1)}px Inter`; g.fillText(sub, lx, ly - h - 10 * k + 43 * k); }
    g.globalAlpha = 1;
  }
  const BUCKETS = [
    { n: 'payments-prod-settlements', x: 9.6, y: 2.4, used: 1 },
    { n: 'hr-exports', x: 12.4, y: 4.6 },
    { n: 'audit-logs', x: 10.6, y: 7.4 },
    { n: 'customer-kyc-archive', x: 13.4, y: 8.6 },
    { n: 'backups-2024', x: 8.2, y: 10.2 },
  ];
  const ROLE = [5.6, 4.2, 3.0], WL = [1.2, 3.6];
  const S3C = { l: '#1f6f63', r: '#11463f', t: '#2c8f7f', e: 'rgba(130,230,210,.35)', bands: 2 };
  // DOM overlays
  const idc = el('div', 'pan', root); S(idc, { width: '420px' });
  idc.innerHTML = `<div style="padding:18px 22px">${[['Identity', 'payment-service-prod'], ['Type', 'IAM role'], ['Environment', 'Production'], ['Provider', 'AWS']].map(([k, v]) => `<div style="display:grid;grid-template-columns:130px 1fr;padding:7px 0;font-size:19px"><span class="lbl" style="padding-top:3px">${k}</span><span class="${k === 'Identity' ? 'mono' : ''}" style="font-weight:600">${v}</span></div>`).join('')}</div>`;
  const flow = el('div', 'abs', root); S(flow, { left: '50%', top: '952px', marginLeft: '-330px', width: '660px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '18px', fontSize: '24px', fontWeight: '600', padding: '16px 26px', borderRadius: '16px', background: 'rgba(8,12,20,.9)', border: '1px solid var(--line2)' });
  const FL = ['Application workload', 'IAM role', 'Cloud resources'];
  flow.innerHTML = FL.map((f, i) => `<span class="fl">${f}</span>${i < 2 ? '<span class="fa" style="color:var(--t3)">→</span>' : ''}`).join('');
  const flEls = [...flow.querySelectorAll('.fl')];
  const pol = el('div', 'pan', root); S(pol, { width: '560px', fontFamily: 'var(--mono)' });
  pol.innerHTML = `<div class="row" style="padding:14px 20px;border-bottom:1px solid var(--line);font-family:var(--sans);font-size:15px;color:var(--t2)"><span style="width:11px;height:11px;border-radius:50%;background:#9d8cff"></span>payment-service-prod · permissions policy</div>
    <pre style="padding:20px 24px;font-size:25px;line-height:1.6;color:#c9d6ea;font-family:var(--mono)">{
  <span style="color:#8fb4ff">"Effect"</span>: <span style="color:#7fe0c4">"Allow"</span>,
  <span style="color:#8fb4ff">"Action"</span>: <span class="hl1" style="color:#ffd27d;border-radius:5px;padding:0 4px">"s3:*"</span>,
  <span style="color:#8fb4ff">"Resource"</span>: <span class="hl2" style="color:#ffd27d;border-radius:5px;padding:0 4px">"*"</span>
}</pre>`;
  const hl = [pol.querySelector('.hl1'), pol.querySelector('.hl2')];
  const warn = new Kin(root, 'Excessive permissions *detected.*', { style: { left: '0', right: '0', top: '936px', textAlign: 'center', fontSize: '54px' } });
  warn.e.querySelectorAll('.acc').forEach((x) => (x.style.color = 'var(--amber)'));
  const pan = el('div', 'pan', root); S(pan, { left: '1090px', top: '170px', width: '730px' });
  panelHead(pan, 'adapid', 'NHI Security for AWS', 'AWS · production');
  const pb = el('div', '', pan); S(pb, { padding: '18px 26px 24px' });
  pb.innerHTML = `
    <div class="nr row" style="justify-content:space-between"><div><div class="mono" style="font-size:21px;font-weight:600">payment-service-prod</div><div style="font-size:15px;color:var(--t2);margin-top:4px">IAM role · Production · used by payments-app</div></div><div class="pill p-high"><i></i>High</div></div>
    <div class="nr" style="margin-top:18px;padding:14px 0;border-top:1px solid var(--line);display:grid;grid-template-columns:130px 1fr;font-size:18px"><span class="lbl" style="padding-top:3px">Finding</span><b>Excessive permissions</b></div>
    <div class="nr" style="padding:14px 0;border-top:1px solid var(--line)">
      <div class="row" style="justify-content:space-between;font-size:17px"><span>Granted · <span class="mono">s3:*</span> on every bucket</span><span style="color:var(--t2)">5 of 5 buckets</span></div>
      <div style="height:9px;border-radius:9px;background:rgba(255,255,255,.06);margin:9px 0 16px"><div class="bar1" style="height:100%;border-radius:9px;background:var(--amber)"></div></div>
      <div class="row" style="justify-content:space-between;font-size:17px"><span>Used · last 90 days of CloudTrail</span><span style="color:var(--t2)">1 bucket · 2 actions</span></div>
      <div style="height:9px;border-radius:9px;background:rgba(255,255,255,.06);margin-top:9px"><div class="bar2" style="height:100%;border-radius:9px;background:var(--cyan)"></div></div></div>
    <div class="nr" style="margin-top:8px;padding:16px 18px;border-radius:14px;background:rgba(60,200,246,.08);border:1px solid rgba(60,200,246,.25)">
      <div class="row" style="justify-content:space-between"><b style="font-size:19px">Review permissions. Apply least privilege.</b><span class="pill" style="color:var(--cyan);background:rgba(60,200,246,.12);font-size:12px"><i></i>Proposed</span></div>
      <div class="mono" style="font-size:16px;color:#c9d6ea;margin-top:10px;line-height:1.65">Action: s3:GetObject, s3:PutObject<br>Resource: arn:aws:s3:::payments-prod-settlements/*</div>
      <div style="font-size:14px;color:var(--t2);margin-top:8px">Checked against CloudTrail · applied with approval</div></div>`;
  const nr = [...pb.querySelectorAll('.nr')], bar1 = pb.querySelector('.bar1'), bar2 = pb.querySelector('.bar2');
  const endDim = el('div', 'fill', root); S(endDim, { background: 'radial-gradient(80% 70% at 50% 45%, rgba(4,6,11,.86), rgba(4,6,11,.97))' });
  const end = new EndCard(root, 'Every workload has an identity.\nEvery identity needs protection.', 'adapid', 'Non-Human Identity Security for AWS', { y: 380 });
  [35.6, 35.85, 36.1, 36.35, 36.6, 36.85].forEach((tt) => sfx(tt, 'build'));
  sfx(37.7, 'token'); sfx(38.7, 'token'); sfx(39.75, 'uiIn'); sfx(40.4, 'alert'); [41.05, 41.3, 41.55, 41.8, 42.05].forEach((tt) => sfx(tt, 'spread')); sfx(41.3, 'impact');
  sfx(43.3, 'uiIn'); sfx(44.95, 'confirm'); sfx(45.85, 'hit');

  return (t) => {
    S(root, { opacity: (E.inOutSine(seg(t, 35.05, 35.6)) * (1 - E.inOutSine(seg(t, 47.6, 48.2)))).toFixed(3) });
    const k1 = E.inOutCubic(seg(t, 36.9, 38.0)), k2 = E.inOutCubic(seg(t, 39.4, 40.3)), k3 = E.inOutCubic(seg(t, 40.8, 41.8)), k4 = E.inOutCubic(seg(t, 43.0, 43.9));
    cam.s = lerp(lerp(lerp(lerp(lerp(44, 56, seg(t, 35.4, 37)), 82, k1), 92, k2), 58, k3), 54, k4);
    cam.fx = lerp(lerp(lerp(lerp(7.4, 3.6, k1), 5.2, k2), 9.6, k3), 9.0, k4); cam.fy = lerp(lerp(lerp(lerp(6, 4.2, k1), 4.2, k2), 6.2, k3), 6.2, k4);
    cam.fz = lerp(lerp(0, 1.2, k1), 0.6, k3); cam.cx = lerp(lerp(FW / 2, FW / 2 - 140, k2), FW / 2 - 330, k4) + lerp(0, 140, k3) * (1 - k4);
    cam.cy = FH / 2 + 40;
    g.clearRect(0, 0, FW, FH);
    const build = (i) => E.outBack(seg(t, 35.35 + i * 0.25, 36.05 + i * 0.25));
    // platform + grid
    const pa = E.outCubic(seg(t, 35.1, 35.9));
    g.globalAlpha = pa;
    box(-1, -1, -0.35, 16.5, 13, 0.35, { t: 'rgba(22,34,54,.95)', l: '#0d1828', r: '#0a1220', e: 'rgba(120,160,220,.16)', e2: 'rgba(120,170,240,.28)' });
    g.strokeStyle = 'rgba(120,170,240,.06)'; g.lineWidth = 1;
    for (let i = 0; i <= 16; i++) { const a = iso(-1 + i, -1, 0), b = iso(-1 + i, 12, 0); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    for (let j = 0; j <= 13; j++) { const a = iso(-1, -1 + j, 0), b = iso(15.5, -1 + j, 0); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    const [px0, py0] = iso(-0.6, 11.6, 0); g.font = '600 15px Inter'; g.fillStyle = 'rgba(160,190,230,.6)'; g.textAlign = 'left';
    g.save(); g.translate(px0, py0); g.transform(1, -0.577, 0, 1, 0, 0); g.fillText('AWS ACCOUNT · PRODUCTION · AP-SOUTH-1', 0, 0); g.restore();
    g.globalAlpha = 1;
    // network links (not IAM): workload to its database and worker
    const net = (a, b, al) => { const p1 = iso(a[0], a[1], 0.05), p2 = iso(b[0], b[1], 0.05); g.setLineDash([5, 7]); g.strokeStyle = `rgba(150,175,210,${al})`; g.lineWidth = 1.4; g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke(); g.setLineDash([]); };
    net([WL[0] + 1.2, WL[1] + 1.2], [5.6, 8.6], 0.3 * pa); net([WL[0] + 1.2, WL[1] + 1.2], [2.2, 8.6], 0.3 * pa);
    // reach: the role's permissions extend to every bucket, then the proposal narrows them to one
    const reach = BUCKETS.map((b, i) => E.outCubic(seg(t, 41.0 + i * 0.25, 41.6 + i * 0.25)));
    const narrow = E.inOutCubic(seg(t, 44.9, 45.6));
    const objs = [];
    objs.push({ d: WL[0] + WL[1] + 2, f: () => { const b = build(0); shadow(WL[0] + 1.2, WL[1] + 1.2, 1.6, b); box(WL[0], WL[1], 0, 2.4, 2.4, 1.3 * b, { t: '#1c4f74', l: '#123652', r: '#0c2539', e: 'rgba(60,200,246,.35)', e2: 'rgba(60,200,246,.8)' });
      for (let q = 0; q < 3; q++) box(WL[0] + 0.25 + q * 0.75, WL[1] + 0.8, 1.3 * b, 0.5, 0.8, 0.35 * b, { t: '#3cc8f6', l: '#1e86ad', r: '#16627f', e: 'rgba(160,230,255,.5)' }); } });
    objs.push({ d: 5.6 + 8.6, f: () => { const b = build(1); shadow(5.6, 8.6, 1, b); cyl(5.6, 8.6, 0, 0.95, 1.7 * b, { l: '#2e5aa8', r: '#1b366a', t: '#4f86e6', e: 'rgba(140,180,255,.4)', bands: 3 }); } });
    objs.push({ d: 2.2 + 8.6, f: () => { const b = build(2); shadow(2.2, 8.6, 1, b); box(1.4, 7.8, 0, 1.6, 1.6, 1.15 * b, { t: '#3a4a63', l: '#28354a', r: '#1c2636', e: 'rgba(170,190,220,.35)' }); } });
    BUCKETS.forEach((bk, i) => objs.push({ d: bk.x + bk.y, f: () => {
      const b = build(3 + Math.min(i, 2)); shadow(bk.x, bk.y, 1, b);
      const hot = reach[i] * (bk.used ? 1 - narrow : 1 - narrow * 0.0);
      cyl(bk.x, bk.y, 0, 0.9, 1.05 * b, S3C);
      if (hot > 0 && !(bk.used && narrow > 0.5)) { const [tx, ty] = iso(bk.x, bk.y, 1.05); g.globalCompositeOperation = 'lighter'; g.globalAlpha = hot * (bk.used ? 1 : 1 - narrow * 0.65); const s = 190 * cam.s / 60; g.drawImage(amberS, tx - s / 2, ty - s / 3, s, s * 0.66); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
      if (bk.used && narrow > 0) { const [tx, ty] = iso(bk.x, bk.y, 1.05); g.globalCompositeOperation = 'lighter'; g.globalAlpha = narrow; const s = 190 * cam.s / 60; g.drawImage(cyanS, tx - s / 2, ty - s / 3, s, s * 0.66); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
    } }));
    objs.sort((a, b) => a.d - b.d).forEach((o) => o.f());
    // workload -> role: the workload assumes the role and gets temporary credentials
    const rp = iso(ROLE[0], ROLE[1], ROLE[2]), wp = iso(WL[0] + 1.2, WL[1] + 1.2, 1.7);
    const lk = E.outCubic(seg(t, 36.6, 37.3));
    g.strokeStyle = `rgba(60,200,246,${0.75 * lk})`; g.lineWidth = 2.4; g.beginPath(); g.moveTo(wp[0], wp[1]); g.lineTo(lerp(wp[0], rp[0], lk), lerp(wp[1], rp[1], lk)); g.stroke();
    // permission lines from the role
    BUCKETS.forEach((bk, i) => {
      const bp = iso(bk.x, bk.y, 1.1);
      let a = reach[i], col = '243,178,62';
      if (bk.used) { a = Math.max(a, E.outCubic(seg(t, 37.0, 37.6))); col = narrow > 0.5 ? '60,200,246' : t < 41 ? '60,200,246' : '243,178,62'; }
      else a *= 1 - narrow;
      if (a <= 0) return;
      const ex = lerp(rp[0], bp[0], a), ey = lerp(rp[1], bp[1], a);
      g.strokeStyle = `rgba(${col},${0.22 * a})`; g.lineWidth = 9; g.beginPath(); g.moveTo(rp[0], rp[1]); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = `rgba(${col},${0.9 * a})`; g.lineWidth = 2.2; g.beginPath(); g.moveTo(rp[0], rp[1]); g.lineTo(ex, ey); g.stroke();
      if (!bk.used && a >= 1 && t < 44.9) { const u = (t * 0.7 + i * 0.21) % 1; const s = 44; g.globalCompositeOperation = 'lighter'; g.drawImage(amberS, lerp(rp[0], bp[0], u) - s / 2, lerp(rp[1], bp[1], u) - s / 2, s, s); g.globalCompositeOperation = 'source-over'; }
    });
    // temporary-credential token travelling to the role
    [37.6, 38.6].forEach((t0) => { const u = seg(t, t0, t0 + 0.8); if (u <= 0 || u >= 1) return; const x = lerp(wp[0], rp[0], E.inOutSine(u)), y = lerp(wp[1], rp[1], E.inOutSine(u));
      g.globalAlpha = Math.sin(u * Math.PI); g.fillStyle = 'rgba(11,16,27,.95)'; rrect(g, x - 34, y - 15, 68, 30, 8); g.fill(); g.strokeStyle = '#3cc8f6'; g.lineWidth = 1.5; g.stroke(); g.fillStyle = '#9fe4ff'; g.font = '600 14px "JetBrains Mono"'; g.textAlign = 'center'; g.fillText('STS', x, y + 5); g.globalAlpha = 1; });
    // the role: a floating identity badge
    const rb = E.outBack(seg(t, 36.3, 37.0));
    if (rb > 0) {
      const R = 46 * cam.s / 60 * rb; const [rx, ry] = rp;
      const risky = seg(t, 40.4, 40.9) * (1 - narrow * 0.6);
      g.globalCompositeOperation = 'lighter'; g.drawImage(risky > 0 ? amberS : violS, rx - R * 3, ry - R * 3, R * 6, R * 6); g.globalCompositeOperation = 'source-over';
      const hex = (r) => { g.beginPath(); for (let q = 0; q < 6; q++) { const a = Math.PI / 6 + q * Math.PI / 3; const x = rx + Math.cos(a) * r, y = ry + Math.sin(a) * r; q ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
      hex(R); const gr = g.createLinearGradient(rx, ry - R, rx, ry + R); gr.addColorStop(0, '#6c5ce7'); gr.addColorStop(1, '#3b2f9e'); g.fillStyle = gr; g.fill();
      g.strokeStyle = risky > 0 ? `rgba(243,178,62,${0.5 + 0.5 * risky})` : 'rgba(200,190,255,.8)'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = '#fff'; g.font = `700 ${(R * 0.42).toFixed(1)}px Inter`; g.textAlign = 'center'; g.fillText('IAM', rx, ry + R * 0.15);
      g.font = `500 ${(R * 0.26).toFixed(1)}px Inter`; g.fillStyle = '#d9d3ff'; g.fillText('role', rx, ry + R * 0.48);
    }
    // labels
    const la = E.outCubic(seg(t, 36.6, 37.2)) * (1 - E.inOutSine(seg(t, 45.4, 45.9)));
    label(WL[0] + 1.2, WL[1] + 1.2, 1.9, 'payments-app', 'Production workload', la);
    label(ROLE[0], ROLE[1], ROLE[2] + 1.0, 'payment-service-prod', 'IAM role', la, '#e4dcff', seg(t, 40.4, 40.9) > 0 && narrow < 0.5 ? 'rgba(243,178,62,.8)' : null);
    label(5.6, 8.6, 1.95, 'payments-db', 'Amazon RDS', la * 0.9);
    label(2.2, 8.6, 1.4, 'batch-worker', 'Amazon EC2', la * 0.9);
    BUCKETS.forEach((bk, i) => label(bk.x, bk.y, 1.3, bk.n, 'Amazon S3', la * 0.9, '#eef3fa', reach[i] > 0.5 && (!bk.used || narrow < 0.5) && !(bk.used && t < 41) ? 'rgba(243,178,62,.7)' : bk.used && narrow > 0.5 ? 'rgba(60,200,246,.8)' : null));
    if (narrow > 0) { const [bx, by] = iso(9.6, 2.4, 2.3); g.globalAlpha = narrow * (1 - seg(t, 45.4, 45.9)); g.fillStyle = '#9fe4ff'; g.font = '600 17px Inter'; g.textAlign = 'center'; g.fillText('PROPOSED SCOPE', bx, by - 40); g.globalAlpha = 1; }
    // overlays
    const iv = win(t, 37.5, 39.7, 0.45, 0.4);
    S(idc, { display: iv > 0 ? 'block' : 'none', left: px(rp[0] + 110), top: px(rp[1] - 190) }); reveal(idc, iv, 14, 8);
    flEls.forEach((f, i) => { const on = seg(t, 37.7 + i * 0.55, 38.1 + i * 0.55); S(f, { color: on > 0.5 ? (i === 1 ? '#c9bcff' : '#9fe4ff') : 'var(--t3)' }); });
    reveal(flow, win(t, 37.5, 40.3, 0.4, 0.4), 12, 6);
    const pv = win(t, 39.75, 42.8, 0.5, 0.45);
    S(pol, { display: pv > 0 ? 'block' : 'none', left: px(rp[0] + 120), top: px(rp[1] - 130) }); reveal(pol, pv, 16, 8);
    hl.forEach((h, i) => { const on = E.outCubic(seg(t, 40.35 + i * 0.25, 40.7 + i * 0.25)); S(h, { background: `rgba(243,178,62,${(0.22 * on).toFixed(3)})`, boxShadow: `0 0 0 ${(2 * on).toFixed(1)}px rgba(243,178,62,${(0.7 * on).toFixed(2)})` }); });
    warn.update(t, 41.25, 43.2);
    const pin = E.outExpo(seg(t, 43.3, 44.0));
    S(pan, { display: t > 43.25 && t < 46.0 ? 'block' : 'none', opacity: (pin * (1 - seg(t, 45.5, 45.9))).toFixed(3), transform: `translateX(${((1 - pin) * 60).toFixed(1)}px)` });
    nr.forEach((r, i) => reveal(r, E.outCubic(seg(t, 43.5 + i * 0.28, 43.95 + i * 0.28)), 10, 6));
    S(bar1, { width: (100 * E.outCubic(seg(t, 43.9, 44.5))).toFixed(1) + '%' }); S(bar2, { width: (4 * E.outCubic(seg(t, 44.2, 44.7))).toFixed(1) + '%' });
    S(endDim, { opacity: E.inOutSine(seg(t, 45.6, 46.1)).toFixed(3) });
    end.update(t, 45.85, 47.9);
  };
});
