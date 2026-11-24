import Scene from './Scene.jsx';
import { TAU, seg, ease, lerp, hash, glow, ring, text, rgba, clamp, drawIcon, preload, qb } from './engine.js';

/* The money trail behind one payee. Rupees stream in from strangers and leave
   again within minutes; adapID profiles the account, a wall goes up in front
   of it, and Anita's ₹2,40,000 stops at the wall instead of leaving her bank.
   Positions are in flow space: a runs with the money (left to right on a wide
   screen, top to bottom on a phone), b runs across it. */
const GOLD = '#ffc566', RED = '#ff6b5d', OUT = '#ff9b6b', WALL = '#3fd98f';
const T = { in: 0.6, out: 1.7, scan: 5.8, wall: 7.6, anita: 7.9, held: 9.3 }, LOOP = 14;
const PAYERS = Array.from({ length: 13 }, (_, i) => ({ a: 0.07 + hash(i, 41) * 0.05, b: 0.1 + (i / 12) * 0.8, per: 1.1 + hash(i, 42) * 0.8, off: hash(i, 43) * 1.2, dur: 1.15 + hash(i, 44) * 0.4 }));
const ANITA = 6;
const M = { a: 0.55, b: 0.5 }, WALL_A = 0.37;
const OUTS = [['••2291', 'bank'], ['Wallet', 'phone'], ['••0318', 'bank'], ['ATM · cash', 'cash']].map(([n, g], i) => ({ n, g, a: 0.86, b: 0.18 + i * 0.213 }));
preload([['user', '#9fdcff'], ['user', '#ffffff'], ['bank', GOLD], ['bank', RED], ['bank', '#ffb9a3'], ['phone', '#ffb9a3'], ['cash', '#ffb9a3']]);

const inr = (n) => { const s = String(Math.round(n)); if (s.length <= 3) return s; const last = s.slice(-3); return `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last}`; };

function draw(ctx, w, h, t, { narrow }) {
  const out = {};
  const fade = 1 - seg(t, LOOP - 0.7, LOOP);
  const P = (a, b) => (narrow ? [b * w, a * h] : [a * w, b * h]);
  const unit = narrow ? w : h;
  const m = P(M.a, M.b), mr = unit * 0.075;
  const wallUp = ease(seg(t, T.wall, T.wall + 0.6));
  const red = ease(seg(t, T.wall - 0.2, T.wall + 0.4));
  const appear = ease(seg(t, 0, 0.8)) * fade;

  // curves
  const inC = PAYERS.map((p) => { const a = P(p.a, p.b), b = m, c = P(0.33, lerp(p.b, M.b, 0.55)); return { a, b, c }; });
  const outC = OUTS.map((o) => { const b = P(o.a - 0.035, o.b), c = P(0.74, lerp(M.b, o.b, 0.6)); return { a: m, b, c }; });
  // where each incoming curve crosses the wall
  const uw = inC.map(({ a, b, c }) => { for (let k = 0; k <= 60; k++) { const q = qb(a, c, b, k / 60); if ((narrow ? q[1] : q[0]) >= (narrow ? WALL_A * h : WALL_A * w)) return k / 60; } return 0.5; });

  // faint channels
  ctx.lineWidth = 1;
  for (const [i, { a, b, c }] of inC.entries()) { if (narrow && i % 2) continue; ctx.strokeStyle = rgba(GOLD, 0.1 * appear); ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(...c, ...b); ctx.stroke(); }
  for (const { a, b, c } of outC) { ctx.strokeStyle = rgba(OUT, 0.12 * appear * (1 - 0.6 * wallUp)); ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(...c, ...b); ctx.stroke(); }

  ctx.globalCompositeOperation = 'lighter';
  // money in
  PAYERS.forEach((p, i) => {
    if (narrow && i % 2) return;
    const C = inC[i];
    for (let j = 0; j < 14; j++) {
      const e = T.in + p.off + j * p.per;
      if (i === ANITA) break;
      if (e > T.wall + 3) break;
      const u = (t - e) / p.dur;
      if (u < 0) break;
      const crossAt = e + uw[i] * p.dur;
      const blocked = crossAt >= T.wall + 0.3;
      if (!blocked && u >= 1) continue;
      if (blocked && u >= uw[i]) {
        const b = (t - crossAt) / 0.45;
        if (b < 1) { const q = qb(C.a, C.c, C.b, uw[i]); glow(ctx, q[0], q[1], 14 * (1 - b) + 4, WALL, (1 - b) * 0.9 * fade); }
        continue;
      }
      const q = qb(C.a, C.c, C.b, u), q0 = qb(C.a, C.c, C.b, Math.max(0, u - 0.07));
      const g = ctx.createLinearGradient(q0[0], q0[1], q[0], q[1]); g.addColorStop(0, rgba(GOLD, 0)); g.addColorStop(1, rgba(GOLD, 0.9 * fade));
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      glow(ctx, q[0], q[1], 8, GOLD, 0.9 * fade);
    }
  });
  // money out, minutes later
  OUTS.forEach((o, i) => {
    const C = outC[i];
    for (let j = 0; j < 20; j++) {
      const e = T.out + hash(i, 51) * 0.6 + j * (0.55 + hash(i, 52) * 0.3);
      if (e > T.wall) break;
      const u = (t - e) / 0.9;
      if (u < 0) break;
      if (u >= 1) continue;
      const q = qb(C.a, C.c, C.b, u), q0 = qb(C.a, C.c, C.b, Math.max(0, u - 0.09));
      const g = ctx.createLinearGradient(q0[0], q0[1], q[0], q[1]); g.addColorStop(0, rgba(OUT, 0)); g.addColorStop(1, rgba(OUT, 0.9 * fade));
      ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      glow(ctx, q[0], q[1], 7, OUT, 0.85 * fade);
    }
  });

  // the wall
  if (wallUp > 0) {
    const pu = (t % 1.6) / 1.6;
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * 0.006;
      const [x0, y0] = P(WALL_A + off, 0.5 - 0.46 * wallUp), [x1, y1] = P(WALL_A + off, 0.5 + 0.46 * wallUp);
      const g = narrow ? ctx.createLinearGradient(x0, y0, x1, y0) : ctx.createLinearGradient(x0, y0, x0, y1);
      g.addColorStop(0, rgba(WALL, 0)); g.addColorStop(0.5, rgba(WALL, (k === 1 ? 0.9 : 0.25) * fade)); g.addColorStop(1, rgba(WALL, 0));
      ctx.strokeStyle = g; ctx.lineWidth = k === 1 ? 2 : 8;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(narrow ? x1 : x0, narrow ? y0 : y1); ctx.stroke();
    }
    const [sx, sy] = P(WALL_A, lerp(0.1, 0.9, pu));
    glow(ctx, sx, sy, 22, WALL, 0.5 * wallUp * fade);
  }

  // Anita's payment: the one that matters to her
  const C = inC[ANITA], ae = T.anita, ad = 1.0;
  const au = clamp((t - ae) / ad, 0, uw[ANITA]);
  let ax = null;
  if (t >= ae) {
    const q = qb(C.a, C.c, C.b, au);
    ax = q;
    const stopped = au >= uw[ANITA];
    glow(ctx, q[0], q[1], stopped ? 26 + Math.sin(t * 5) * 3 : 18, stopped ? WALL : GOLD, 0.95 * fade);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (ax) { ctx.fillStyle = rgba('#fff4dc', fade); ctx.beginPath(); ctx.arc(ax[0], ax[1], 7, 0, TAU); ctx.fill(); text(ctx, '₹', ax[0], ax[1] + 0.5, { size: 10, weight: 700, color: '#6b4a00', alpha: fade }); }

  // payers
  PAYERS.forEach((p, i) => {
    if (narrow && i % 2) return;
    const [x, y] = P(p.a, p.b), s = unit * (i === ANITA ? 0.042 : 0.03);
    ctx.fillStyle = rgba('#141922', appear); ctx.strokeStyle = rgba(i === ANITA ? '#ffffff' : '#7fd3ff', (i === ANITA ? 0.8 : 0.4) * appear); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); ctx.stroke();
    drawIcon(ctx, 'user', x, y, s * 1.1, i === ANITA ? '#ffffff' : '#9fdcff', appear);
  });
  // outflow accounts
  OUTS.forEach((o) => {
    const [x, y] = P(o.a, o.b), s = unit * 0.034;
    ctx.fillStyle = rgba('#1a1414', appear); ctx.strokeStyle = rgba('#ff9b90', 0.45 * appear * (1 - 0.5 * wallUp)); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill(); ctx.stroke();
    drawIcon(ctx, o.g, x, y, s * 1.1, '#ffb9a3', appear * (1 - 0.4 * wallUp));
    text(ctx, o.n, narrow ? x : x + s + 8, narrow ? y + s + 11 : y, { size: narrow ? 10.5 : 12, align: narrow ? 'center' : 'left', color: '#d9b3ab', alpha: appear * (1 - 0.4 * wallUp), mono: o.n.startsWith('••') });
  });

  // the payee
  const col = red > 0 ? RED : GOLD;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, m[0], m[1], mr * 3.2, col, (0.45 + 0.25 * red) * appear);
  ctx.globalCompositeOperation = 'source-over';
  if (t > T.scan && t < T.wall) { const a0 = (t - T.scan) * 4; ctx.strokeStyle = rgba('#7fd3ff', 0.9 * fade); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(m[0], m[1], mr * 1.35, a0, a0 + 1.3); ctx.stroke(); }
  if (red > 0) { const pu = ((t - T.wall) % 1.3) / 1.3; ring(ctx, m[0], m[1], mr * (1.1 + pu * 1.2), RED, (1 - pu) * 0.6 * red * fade, 1.6); }
  ctx.fillStyle = rgba('#1a1612', appear); ctx.strokeStyle = rgba(col, 0.9 * appear); ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(m[0], m[1], mr, 0, TAU); ctx.fill(); ctx.stroke();
  drawIcon(ctx, 'bank', m[0], m[1], mr * 1.05, red > 0 ? RED : GOLD, appear);

  // amount received, ticking up
  const rupees = Math.round((3860000 * seg(t, T.in + 0.9, T.wall)) / 1000) * 1000;
  text(ctx, `₹${inr(rupees)}`, m[0], m[1] - mr - (narrow ? 16 : 22), { size: narrow ? 17 : 21, weight: 650, color: red > 0 ? '#ffb1a8' : '#ffe0a3', alpha: ease(seg(t, T.in + 0.6, T.in + 1.2)) * fade });
  text(ctx, 'received today', m[0], m[1] - mr - (narrow ? 2 : 5), { size: narrow ? 10.5 : 12, color: '#a4a7ad', alpha: ease(seg(t, T.in + 0.6, T.in + 1.2)) * fade });

  const ev = (k) => ease(seg(t, T.scan + 0.2 + k * 0.4, T.scan + 0.6 + k * 0.4)) * fade;
  const off = mr * 1.25;
  if (narrow) {
    // on a phone the evidence takes the payee card's place, two by two
    out.payee = { x: m[0], y: m[1] + mr + 10, o: appear * (1 - seg(t, T.scan, T.scan + 0.3)), ay: 0 };
    const y0 = m[1] + mr + 10;
    out.e0 = { x: m[0] - 4, y: y0, o: ev(0), ax: -100, ay: 0 };
    out.e1 = { x: m[0] + 4, y: y0, o: ev(1), ax: 0, ay: 0 };
    out.e2 = { x: m[0] - 4, y: y0 + 30, o: ev(2), ax: -100, ay: 0 };
    out.e3 = { x: m[0] + 4, y: y0 + 30, o: ev(3), ax: 0, ay: 0 };
  } else {
    out.payee = { x: m[0], y: m[1] + mr + 10, o: appear, ay: 0 };
    out.e0 = { x: m[0] - off * 0.2, y: m[1] - off * 2.1, o: ev(0), ax: -100, ay: -100 };
    out.e1 = { x: m[0] + off * 0.2, y: m[1] - off * 2.1, o: ev(1), ax: 0, ay: -100 };
    out.e2 = { x: m[0] - off * 0.2, y: m[1] + off * 2.3, o: ev(2), ax: -100, ay: 0 };
    out.e3 = { x: m[0] + off * 0.2, y: m[1] + off * 2.3, o: ev(3), ax: 0, ay: 0 };
  }
  out.mule = { x: m[0] + mr * 1.35, y: m[1], o: red * fade, ax: 0, ay: -50 };
  if (ax) {
    const stopped = au >= uw[ANITA];
    out.anita = { x: ax[0], y: ax[1] - 16, o: (1 - seg(t, T.held - 0.2, T.held + 0.2)) * fade, ay: -100 };
    out.held = { x: ax[0] + (narrow ? 18 : -18), y: ax[1], o: (stopped ? ease(seg(t, T.held, T.held + 0.4)) : 0) * fade, ax: narrow ? 0 : -100, ay: -50 };
  }
  out.verdict = { x: w / 2, y: h - (narrow ? 12 : 18), o: ease(seg(t, T.held + 0.5, T.held + 1)) * fade, ay: -100 };
  return out;
}

export const MONEY = { draw, loop: LOOP, still: 11, ratio: 1.55, narrowRatio: 0.78 };

const Ev = ({ children }) => <span className="scn-tag" style={{ color: '#ffb1a8' }}>{children}</span>;

export function MoneyTrail({ t }) {
  return (
    <Scene scene={MONEY} t={t}
      label="Illustration: thirty-one people who have never paid it before send money to the payee KYC Update Desk, an account opened nine days ago, and the money leaves again within four minutes to other accounts, a wallet and ATMs. adapID profiles the account: one phone shared with 23 accounts, first-time payers, money out in four minutes, remarks such as KYC update. It marks it as a likely mule and holds payments to it, so Anita's 2,40,000 rupees stop before they leave her bank."
      labels={{
        payee: <span className="scn-card text-center"><b>KYC Update Desk</b><span>a/c ••4410 · opened 9 days ago</span></span>,
        e0: <Ev>31 first-time payers</Ev>,
        e1: <Ev>Out again in 4 min</Ev>,
        e2: <Ev>One phone, 23 accounts</Ev>,
        e3: <Ev>Remark: “KYC update”</Ev>,
        mule: <span className="scn-tag" style={{ color: '#ff8b7e' }}>Likely mule · 91</span>,
        anita: <span className="scn-card"><b>Anita · ₹2,40,000</b></span>,
        held: <span className="scn-card" style={{ borderColor: 'rgb(63 217 143 / .5)' }}><b style={{ color: '#7fe8b4' }}>Held</b><span>Never left Anita’s account</span></span>,
        verdict: <span className="scn-card text-center" style={{ borderColor: 'rgb(63 217 143 / .4)' }}><b>Payments to this payee held, for every customer</b><span>Found from the pattern, before the next transfer</span></span>,
      }} />
  );
}
