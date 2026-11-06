import Scene from './Scene.jsx';
import { TAU, seg, ease, inout, lerp, hash, glow, ring, rgba } from './engine.js';

/* One shot. A single blue point: one person. The camera pulls back and the
   dark fills with quiet points around it, the machines that can log in too.
   They light up kind by kind (service accounts, cloud keys, AI agents), one of
   each named as it does. Then, on the site, a slow amber wave runs through most
   of them: more access than they ever use. In the film (`film`), a few turn red
   instead, the ones attackers have found, and the words beside it carry the rest. */
const LOOP = 12;
const T = { pull: 0.9, pullEnd: 5.2, svc: 1.5, key: 2.5, agent: 3.5, wave: 5.6, waveEnd: 7.6 };
const KINDS = { svc: [169, 193, 222], key: [255, 210, 122], agent: [180, 191, 255] };
const COLS = 24, ROWS = 14; // a crowd, not a starfield: about 330 points
const DOTS = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const i = r * COLS + c;
  const x = -1.15 + (c + 0.5 + (hash(i, 1) - 0.5) * 0.9) * (2.3 / COLS);
  const y = -0.72 + (r + 0.5 + (hash(i, 2) - 0.5) * 0.9) * (1.44 / ROWS);
  const d = Math.hypot(x, y * 1.3);
  if (d < 0.05) continue; // a little room around the person
  const h = hash(i, 7);
  DOTS.push({ i, x, y, z: 0.85 + hash(i, 3) * 0.3, d, over: hash(i, 4) < 0.78, tw: hash(i, 5) * TAU, s: 0.7 + hash(i, 6) * 0.6, kind: h < 0.46 ? 'svc' : h < 0.82 ? 'key' : 'agent' });
}
// one named point of each kind, near the person; and the few attackers have found
// the nearest point of that kind is moved to the exact spot, so it is in frame at the zoom it is named at
const near = (kind, x, y) => {
  const p = DOTS.filter((q) => q.kind === kind).reduce((m, q) => (Math.hypot(q.x - x, q.y - y) < Math.hypot(m.x - x, m.y - y) ? q : m));
  Object.assign(p, { x, y, d: Math.hypot(x, y * 1.3) });
  return p;
};
// picked so each is on screen at the zoom it is named at
const NAMED = [['svc', near('svc', 0.079, -0.047), 'svc-payments'], ['key', near('key', -0.047, 0.044), 'AKIA••7Q2F'], ['agent', near('agent', 0.116, 0.042), 'invoice-agent']];
const FOUND = DOTS.filter((p) => p.d > 0.12 && p.d < 0.6 && hash(p.i, 9) < 0.08).slice(0, 7);
const BLUE = '#4fd2ff', WHITE = [223, 230, 239], AMBER = [246, 185, 85], RED = [255, 107, 93], REDHEX = '#ff6b5d';

function draw(ctx, w, h, t, { narrow, mx, my, film }) {
  const out = {};
  const fade = 1 - seg(t, LOOP - 0.7, LOOP);
  const cx = w / 2, cy = h / 2;
  const unit = Math.max(w, h * 1.4) * 0.5;
  // the pull-back: from right beside the person to the whole field
  const zoom = lerp(9, 1, inout(seg(t, T.pull, T.pullEnd))) * (1 + 0.025 * Math.sin(t * 0.35));
  const px = mx * 10, py = my * 8;
  const size = (narrow ? 0.85 : film ? 1.9 : 1) * 1.2;
  const where = (p) => { const k = (unit * zoom) / p.z; return [cx + p.x * k + px * (1.1 - p.z), cy + p.y * k + py * (1.1 - p.z)]; };

  ctx.globalCompositeOperation = 'lighter';
  for (const p of DOTS) {
    const [x, y] = where(p);
    if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
    const at = T.pull + 0.2 + p.d * 2.6;
    const a = ease(seg(t, at, at + 0.6)) * fade * (0.55 + 0.45 * Math.sin(t * 1.3 + p.tw) ** 2);
    const edge = Math.min(1, Math.min(x, w - x, y, h - y) / (Math.min(w, h) * 0.16)); // the field fades out at its edges
    if (a * edge <= 0.01) continue;
    // each kind takes its colour as it is named, flares once, then settles
    const lit = ease(seg(t, T[p.kind], T[p.kind] + 0.5));
    const flash = lit * (1 - seg(t, T[p.kind] + 0.5, T[p.kind] + 1.4));
    let col = WHITE.map((v, j) => lerp(v, KINDS[p.kind][j], 0.75 * lit));
    const wv = !film && p.over ? ease(seg(t, T.wave + p.d * 1.6, T.wave + p.d * 1.6 + 0.5)) : 0;
    col = col.map((v, j) => Math.round(lerp(v, AMBER[j], wv)));
    const r = Math.max(0.7, Math.min(5, 1.15 * p.s * Math.sqrt(zoom))) * size * (1 + 0.35 * flash);
    if (wv > 0.02 || flash > 0.02) { ctx.fillStyle = `rgba(${col},${0.16 * Math.max(wv, flash) * a * edge})`; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = `rgba(${col},${Math.min(1, a * (1 + 0.6 * flash)) * edge})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // film: the few attackers have found turn red, one after another
  if (film) FOUND.forEach((p, k) => {
    const on = ease(seg(t, T.wave + k * 0.16, T.wave + k * 0.16 + 0.35)) * fade;
    if (on <= 0) return;
    const [x, y] = where(p);
    const r = Math.max(3, 1.6 * p.s * Math.sqrt(zoom)) * size;
    const pu = (Math.max(0, t - T.wave - k * 0.16) * 0.8) % 1;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, r * 7, REDHEX, 0.35 * on);
    ctx.globalCompositeOperation = 'source-over';
    ring(ctx, x, y, r * (2 + pu * 5), REDHEX, (1 - pu) * 0.6 * on, 1.4);
    ctx.fillStyle = `rgba(${RED},${on})`; ctx.beginPath(); ctx.arc(x, y, r * 1.25, 0, TAU); ctx.fill();
  });

  // the person
  const pa = ease(seg(t, 0.1, 0.8)) * fade;
  const pr = (narrow ? 5 : film ? 10 : 6.5) * Math.max(1, Math.sqrt(zoom) * 0.75);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, cx, cy, pr * 7, BLUE, 0.55 * pa);
  ctx.globalCompositeOperation = 'source-over';
  const pu = (t % 2.6) / 2.6;
  ring(ctx, cx, cy, pr * (1.6 + pu * 3), BLUE, (1 - pu) * 0.5 * pa, 1.4);
  ctx.fillStyle = rgba('#d9f6ff', pa); ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(BLUE, pa); ctx.lineWidth = 2; ctx.stroke();

  // one name per kind, shown while that kind lights up, joined to its point by a hairline
  NAMED.forEach(([kind, p], k) => {
    if (!p) return;
    const [x, y] = where(p);
    const o = Math.min(ease(seg(t, T[kind] + 0.1, T[kind] + 0.4)), 1 - seg(t, T[kind] + 1.5, T[kind] + 1.9)) * fade;
    const right = p.x > 0, dx = (right ? 1 : -1) * (narrow ? 14 : film ? 40 : 22), dy = -(narrow ? 12 : film ? 30 : 18);
    if (o > 0) {
      ctx.strokeStyle = `rgba(${KINDS[kind]},${0.6 * o})`; ctx.lineWidth = film ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    }
    out[`n${k}`] = { x: x + dx, y: y + dy, o, ax: right ? 0 : -100, ay: -50 };
  });

  // one caption at a time on the site: what the points are, then what the amber means
  const cap = film ? 0 : 1, by = h - (narrow ? 14 : 20), bx = narrow ? 14 : 22;
  out.person = { x: cx + pr + 12, y: cy, o: pa * cap * (1 - ease(seg(t, T.svc - 0.3, T.svc))), ax: 0, ay: -50 };
  out.crowd = { x: bx, y: by, o: cap * ease(seg(t, T.pullEnd - 0.6, T.pullEnd)) * (1 - ease(seg(t, T.wave + 0.2, T.wave + 0.6))) * fade, ax: 0, ay: -100 };
  out.over = { x: bx, y: by, o: cap * ease(seg(t, T.waveEnd - 0.5, T.waveEnd + 0.1)) * fade, ax: 0, ay: -100 };
  return out;
}

export const CROWD = { draw, loop: LOOP, still: 9.4, ratio: 1.3, narrowRatio: 0.92 };
const CROWD_FILM = { ...CROWD, draw: (ctx, w, h, t, o) => draw(ctx, w, h, t, { ...o, film: true }) };
export const CROWD_TIME = T;

const Name = ({ c, kind, children }) => (
  <span className="scn-tag" style={{ color: c }}><span style={{ fontFamily: 'var(--font-mono)' }}>{children}</span><span style={{ color: '#9da1a8' }}>{kind}</span></span>
);

export function MachineCrowd({ t, film, dpr }) {
  return (
    <Scene scene={film ? CROWD_FILM : CROWD} t={t} dpr={dpr} className={film ? 'scn-film' : undefined}
      label="Illustration: a single blue point, one person, alone in the dark. The view pulls back and hundreds of points appear around it: the service accounts, cloud keys and AI agents that can log in too, each kind lighting up in turn. A slow amber wave then marks most of them: machines with more access than they ever use."
      labels={{
        n0: <Name c="#c3d6ee" kind="service account">{NAMED[0][2]}</Name>,
        n1: <Name c="#ffd98f" kind="cloud key">{NAMED[1][2]}</Name>,
        n2: <Name c="#c9d0ff" kind="AI agent">{NAMED[2][2]}</Name>,
        person: <span className="scn-tag" style={{ color: '#7fdcff' }}>One person</span>,
        crowd: <span className="scn-tag" style={{ color: '#dfe6ef' }}>Each point: a service account, key or AI agent that can log in too</span>,
        over: <span className="scn-tag" style={{ color: '#ffcf85' }}><span style={{ width: '.5em', height: '.5em', borderRadius: '50%', background: 'currentColor' }} />Most hold more access than they ever use</span>,
      }} />
  );
}
