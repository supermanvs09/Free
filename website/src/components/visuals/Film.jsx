import { useRef, useState } from 'react';
import { Bank, Brain, Browsers, Buildings, Cloud, Cpu, Database, GearSix, HardDrives, Key, MagnifyingGlass, Pause, Play, Plugs, Robot, ShieldCheck, Sparkle, SpeakerHigh, SpeakerSlash, Terminal, User, Wrench } from '@phosphor-icons/react/dist/ssr';
import { cx } from './kit.jsx';
import { VO } from '../../data/voiceover.js';
import { useClock, P, ss, eo, eb, f2, clamp, BLUE, NAVY, CORAL, Defs, MarkTile } from './Flows.jsx';

/* "The Identity Shift", version 3: an isometric 3D pitch film.
   A glass platform holds your company. Identities rise onto it (few people,
   many keys, service accounts and AI agents), an attacker's key lands unseen,
   our mark scans the platform, three product cards pop up one at a time, and
   the platform ends as a layered stack with banks, government and enterprises
   linked in. Everything is a pure function of the clock t and is timed to the
   measured voice-over cues. All names and numbers are illustrative. */

const SEG = Object.fromEntries(VO.segments.map((s) => [s.id, s]));
export const FILM_DURATION = VO.duration;
const FW = 760, FH = 650, U = 38;
const FD = SEG.find.end - SEG.find.start;
const T = { sh: SEG.shift.start, at: SEG.attack.start, dis: SEG.find.start, und: SEG.find.start + FD * 0.31, fix: SEG.find.start + FD * 0.62, tr: SEG.trust.start, cl: SEG.close.start };
export const STEPS = [
  { t: T.sh - 0.1, name: 'The shift', title: 'Most access no longer belongs to a person.', body: 'Keys, service accounts and AI agents hold it now.' },
  { t: T.at - 0.1, name: 'The attack', title: 'Attackers log in. They do not break in.', body: 'A key nobody owns opens the door, and no alert is raised.' },
  { t: T.dis, name: 'Discover', title: 'We find every identity.', body: 'People, service accounts, keys and AI agents in one inventory, each with an owner and what it can reach.' },
  { t: T.und, name: 'Understand', title: 'We show you the risk, and why.', body: 'A score with the reasons behind it, in plain language your team can act on.' },
  { t: T.fix, name: 'Fix', title: 'We fix it before it is used.', body: 'The exact change to make, and for AI agents a check on every action before it runs.' },
  { t: T.tr, name: 'Trusted', title: 'Built in India. Trusted by banks, government and enterprises.', body: 'One platform for every human, machine and AI agent identity.' },
];
const stepAt = (t) => { let i = -1; STEPS.forEach((s, k) => { if (t >= s.t) i = k; }); return i; };
const captionAt = (t) => { for (const seg of VO.segments) for (const s of seg.sentences) if (t >= s.start - 0.1 && t <= s.end + 0.5) return s.text; return ''; };
const DISPLAY = { fontFamily: '"Hanken Grotesk Variable","Inter Variable",sans-serif' };
const INK = '#0b1220', INK3 = '#5c6777';

/* ---------- colour ---------- */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, k) => { const A = hex(a), B = hex(b); return `#${A.map((v, i) => Math.round(v + (B[i] - v) * clamp(k)).toString(16).padStart(2, '0')).join('')}`; };
const WHITE = ['#ffffff', '#cfe2f3', '#a8c8e6'], RED = ['#ff8d77', '#e5654d', '#c64a33'], BLU = ['#5cc2ff', '#2f9ad8', '#1f7fbd'];
const tone = (base, to, k) => base.map((c, i) => mix(c, to[i], k));

/* ---------- the platform's identities ---------- */
const ID = [];
[[2, 2], [3, 2], [2, 3], [3, 3]].forEach(([gx, gy], i) => ID.push({ gx, gy, kind: 0, i, Icon: User, h: 14, t0: 0.55 + i * 0.2, risky: i === 0 }));
[[-3, -1], [-3, 1], [-2, 3], [3, -1], [2, -3], [1, 3], [-1, 3]].forEach(([gx, gy], i) => ID.push({ gx, gy, kind: 1, i, Icon: [Key, Cloud, Database, GearSix, Plugs, HardDrives, Terminal][i], h: 28, t0: 1.25 + i * 0.16, risky: i === 0 || i === 3 }));
[[-3, -3], [-2, -3], [-1, -3], [0, -3], [1, -3], [-3, -2], [-2, -2], [3, 0]].forEach(([gx, gy], i) => ID.push({ gx, gy, kind: 2, i, Icon: [Robot, Sparkle, Robot, Brain, Robot, Sparkle, Cpu, Robot][i], h: 42, t0: 2.0 + i * 0.12, risky: i === 0 || i === 3 || i === 6 }));
const RISKY = ID.filter((b) => b.risky);
ID.sort((a, b) => a.gx + a.gy - (b.gx + b.gy));

const SCAN = [T.dis + 0.05, T.dis + 1.5];
const KEY = { a: T.at + 1.5, b: T.at + 3.3 };

/* ---------- camera ---------- */
function camAt(t) {
  const w1 = ss(P(t, T.dis - 0.5, T.dis + 0.3)), w2 = ss(P(t, T.tr - 0.2, T.tr + 0.6));
  const sb = 1 + 0.06 * ss(P(t, T.at, T.at + 3)) * (1 - ss(P(t, T.dis - 0.6, T.dis)));
  const lerp = (a, b, k) => a + (b - a) * k;
  return { x: 380, y: lerp(lerp(430, 548, w1), 484, w2), s: lerp(lerp(sb, 0.7, w1), 0.9, w2) };
}

const poly = (...p) => p.map((q) => `${f2(q[0])},${f2(q[1])}`).join(' ');

function Blk({ pj, s, gx, gy, w, h, c, Icon, ic = '#0a3d6f', o = 1, ring = 0 }) {
  const a = w / 2;
  const A = pj(gx - a, gy - a, h), B = pj(gx + a, gy - a, h), C = pj(gx + a, gy + a, h), D = pj(gx - a, gy + a, h);
  const C0 = pj(gx + a, gy + a, 0), B0 = pj(gx + a, gy - a, 0), D0 = pj(gx - a, gy + a, 0);
  const m = pj(gx, gy, h);
  return (
    <g opacity={f2(o)}>
      <polygon points={poly(D, C, C0, D0)} fill={c[1]} />
      <polygon points={poly(B, C, C0, B0)} fill={c[2]} />
      <polygon points={poly(A, B, C, D)} fill={c[0]} stroke={ring > 0.01 ? '#5cc2ff' : 'none'} strokeWidth="3" strokeOpacity={f2(ring)} />
      {Icon && <g transform={`matrix(${f2(0.866 * s)} ${f2(0.5 * s)} ${f2(-0.866 * s)} ${f2(0.5 * s)} ${f2(m[0])} ${f2(m[1])})`}><g transform="translate(-10 -10)"><Icon size="20" color={ic} weight="fill" /></g></g>}
    </g>
  );
}

const Tick = ({ x, y, k }) => (k > 0.02 ? <g transform={`translate(${f2(x)} ${f2(y)}) scale(${f2(k)})`}><circle r="10" fill={BLUE} stroke="#fff" strokeWidth="2.5" /><path d="M-4.5 0.5 l3 3.2 6-6.7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></g> : null);

function Pill({ x, y, text, o, icon: Icon, dark, tone: tn }) {
  const w = text.length * 10.4 + (Icon ? 62 : 40);
  return (
    <g opacity={f2(clamp(o))} transform={`translate(${f2(x)} ${f2(y + (1 - clamp(o)) * 8)}) scale(${f2(0.92 + 0.08 * clamp(o))})`}>
      <g filter="url(#or-sh-lg)"><rect x={-w / 2} y="-22" width={w} height="44" rx="22" fill={dark ? NAVY : '#fff'} /></g>
      {Icon ? <g transform={`translate(${-w / 2 + 14} -11)`}><Icon size="22" color={BLUE} weight="fill" /></g> : tn && <circle cx={-w / 2 + 22} r="7" fill={tn} />}
      <text x={Icon ? -w / 2 + 46 : tn ? -w / 2 + 38 : 0} textAnchor={Icon || tn ? 'start' : 'middle'} y="6.5" fontSize="18" fontWeight="600" fill={dark ? '#fff' : INK}>{text}</text>
    </g>
  );
}

/* ---------- product cards ---------- */
const CW = 600, CS = 0.86, CX0 = (FW - CW * CS) / 2 - 8, CY0 = 82;
const pp = (lt, a, d = 0.4) => eb(P(lt, a, a + d));
const popG = (x, y, p, children, key) => (p > 0.01 ? <g key={key} opacity={f2(clamp(p))} transform={`translate(${f2(x)} ${f2(y)}) scale(${f2(Math.max(0.001, p))})`}>{children}</g> : null);

function Card({ t, a, next, ph, title, chip, children }) {
  const inn = clamp(eb(P(t, a, a + 0.5)));
  if (inn <= 0.01) return null;
  const age = next == null ? 0 : t - next;
  const g = ss(P(age, 0, 0.6)), gone = ss(P(age, 1.0, 1.5)), out = ss(P(t, T.tr - 0.1, T.tr + 0.45));
  const o = inn * (1 - 0.72 * g) * (1 - gone) * (1 - out);
  if (o < 0.01) return null;
  const fy = Math.sin(t * 1.1 + ph) * 4;
  const sc = CS * (1 - 0.08 * g) * (0.9 + 0.1 * inn);
  const x = CX0 + 38 * g, y = CY0 + (1 - inn) * 50 - 30 * g + fy - out * 26;
  return (
    <g opacity={f2(o)} transform={`translate(${f2(x)} ${f2(y)}) skewY(-3) rotate(${f2(Math.sin(t * 0.7 + ph) * 0.4)}) scale(${f2(sc)})`}>
      <g filter="url(#or-sh-lg)"><rect width={CW} height="400" rx="24" fill="#fff" /></g>
      <image href="/brand/mark.webp" x="24" y="16" width="30" height="30" />
      <text x="66" y="40" fontSize="23" fontWeight="600" fill={INK}>{title}</text>
      <g transform="translate(578 30)"><rect x={-chip.length * 9.4 - 24} y="-17" width={chip.length * 9.4 + 24} height="34" rx="17" fill="#e6f2fa" /><text x="-12" y="6" textAnchor="end" fontSize="17" fontWeight="600" fill="#06487a">{chip}</text></g>
      <line x1="0" y1="62" x2={CW} y2="62" stroke="#e3e8ee" />
      <g transform="translate(0 62)">{children}</g>
    </g>
  );
}

const Gauge = ({ cx, cy, r, v, color }) => (
  <g transform={`translate(${cx} ${cy})`}>
    <circle r={r} fill="none" stroke="#e9ecf0" strokeWidth="16" />
    <circle r={r} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" pathLength="100" strokeDasharray={`${f2(Math.max(0.01, v))} 100`} transform="rotate(-90)" />
    <text y={r * 0.22} textAnchor="middle" fontSize={r * 0.72} fontWeight="300" fill={INK} style={DISPLAY}>{Math.round(v)}</text>
    <text y={r + 38} textAnchor="middle" fontSize="19" fill={INK3}>Risk score</text>
  </g>
);

function InventoryCard({ t }) {
  const lt = t - (T.dis - 0.1);
  const n = Math.round(1284 * eo(P(lt, 0.3, 1.3)));
  const bars = [['People', 312, '#0068ac'], ['Machine identities', 702, '#5aa9d6'], ['AI agents', 270, '#00aeef']];
  return (
    <Card t={t} a={T.dis - 0.1} next={T.und - 0.1} ph={0} title="Identity inventory" chip="All identities">
      <text x="36" y="132" fontSize="96" fontWeight="300" fill={INK} style={DISPLAY}>{n.toLocaleString('en-US')}</text>
      <text x="38" y="172" fontSize="26" fill={INK3}>identities found</text>
      {bars.map(([lab, v, col], i) => {
        const g = eo(P(lt, 0.4 + i * 0.18, 1.4 + i * 0.18)), y = 46 + i * 70;
        return (
          <g key={lab} transform={`translate(330 ${y})`}>
            <text y="14" fontSize="21" fill="#3f4a5a">{lab}</text>
            <text x="244" y="14" textAnchor="end" fontSize="21" fontWeight="600" fill={INK}>{Math.round(v * g)}</text>
            <rect y="26" width="244" height="16" rx="8" fill="#eef1f5" /><rect y="26" width={f2(Math.max(0.01, 244 * (v / 702) * g))} height="16" rx="8" fill={col} filter="url(#or-sh)" />
          </g>
        );
      })}
      {popG(36, 250, pp(lt, 1.0), <g><g filter="url(#or-sh)"><rect width="276" height="54" rx="27" fill="#fde9e5" /></g><circle cx="28" cy="27" r="8" fill={CORAL} /><text x="48" y="35" fontSize="22" fontWeight="600" fill="#b3361d">142 with no owner</text></g>, 'a')}
      {popG(326, 250, pp(lt, 1.2), <g><g filter="url(#or-sh)"><rect width="240" height="54" rx="27" fill="#e6f2fa" /></g><text x="120" y="35" textAnchor="middle" fontSize="22" fontWeight="600" fill="#06487a">38 shadow agents</text></g>, 'b')}
    </Card>
  );
}

function RiskCard({ t }) {
  const lt = t - (T.und - 0.1);
  const v = 86 * eo(P(lt, 0.3, 1.2));
  const why = [['Admin access, 3% used', 'More access than its task needs'], ['No owner assigned', 'No one answers for what it does'], ['Can export customer data', 'One request moves records outside']];
  return (
    <Card t={t} a={T.und - 0.1} next={T.fix - 0.1} ph={1.3} title="Risk analysis" chip="invoice-agent">
      <circle cx="52" cy="48" r="28" fill="#eef2f6" /><g transform="translate(36 32)"><Robot size="32" color="#3f4a5a" weight="regular" /></g>
      <text x="96" y="46" fontSize="25" fontWeight="600" fill={INK}>invoice-agent</text><text x="96" y="74" fontSize="19" fill={INK3}>AI agent · Finance</text>
      <Gauge cx={130} cy={196} r={72} v={v} color={CORAL} />
      {popG(130, 318, pp(lt, 1.1), <g><rect x="-46" y="-20" width="92" height="40" rx="20" fill="#fde9e5" /><text y="7" textAnchor="middle" fontSize="20" fontWeight="600" fill="#b3361d">High</text></g>, 'h')}
      <text x="300" y="38" fontSize="16" fontWeight="600" fill={INK3} letterSpacing="1.4">WHY IT IS RISKY</text>
      {why.map(([h, b], i) => popG(300, 62 + i * 90, pp(lt, 0.45 + i * 0.28), <g filter="url(#or-sh)"><rect x="-2" y="-2" width="292" height="78" rx="16" fill="#fff" stroke="#eef1f5" /><circle cx="24" cy="26" r="8" fill={CORAL} /><text x="44" y="33" fontSize="22" fontWeight="600" fill={INK}>{h}</text><text x="44" y="60" fontSize="17" fill="#3f4a5a">{b}</text></g>, h))}
    </Card>
  );
}

function FixCard({ t }) {
  const lt = t - (T.fix - 0.1);
  const fixes = ['Reduce to least privilege', 'Assign an owner: Meera Pillai', 'Limit export to its task'];
  const at = (i) => 0.5 + i * 0.4;
  const done = fixes.map((_, i) => eb(P(lt, at(i), at(i) + 0.35)));
  const v = 86 - 74 * eo(P(lt, at(0), at(2) + 0.5));
  return (
    <Card t={t} a={T.fix - 0.1} next={null} ph={2.1} title="Remediation" chip="invoice-agent">
      <Gauge cx={112} cy={106} r={58} v={v} color={v > 40 ? CORAL : BLUE} />
      {fixes.map((h, i) => (
        <g key={h} transform={`translate(240 ${22 + i * 62})`}>
          <g transform="translate(0 22)">{done[i] > 0.05 ? <g transform={`scale(${f2(done[i])})`}><circle r="13" fill={BLUE} /><path d="M-6 0.5 l3.8 4 7.6-8.2" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></g> : <circle r="10" fill={CORAL} />}</g>
          <text x="32" y="30" fontSize="22" fontWeight="600" fill={INK}>{h}</text>
        </g>
      ))}
      {popG(36, 228, pp(lt, 1.55, 0.5), (
        <g filter="url(#or-sh)">
          <rect width="528" height="112" rx="18" fill="#f4f7fa" stroke="#e3e8ee" />
          <text x="24" y="34" fontSize="16" fontWeight="600" fill={INK3} letterSpacing="1.4">RUNTIME CHECK</text>
          <text x="24" y="66" fontSize="21" fontWeight="500" fill={INK}>invoice-agent → crm.export (external address)</text>
          <g transform="translate(24 76)"><rect width="250" height="30" rx="15" fill={NAVY} /><text x="125" y="21" textAnchor="middle" fontSize="17" fontWeight="600" fill="#fff">Blocked before it ran</text></g>
        </g>), 'rt')}
    </Card>
  );
}

/* ---------- the scene ---------- */
const PLANES = [{ z: 62, label: 'Discover', Icon: MagnifyingGlass, side: 1, a: T.tr + 0.2 }, { z: 116, label: 'Understand', Icon: ShieldCheck, side: 1, a: T.tr + 0.7 }, { z: 170, label: 'Fix', Icon: Wrench, side: 1, a: T.tr + 1.2 }];
const ISLES = [{ gx: -5.2, gy: 2.7, label: 'Banks', Icon: Bank, a: SEG.trust.start + 2.2 }, { gx: 5.7, gy: -3.2, label: 'Government', Icon: Buildings, a: SEG.trust.start + 2.9 }, { gx: 0.4, gy: 5.6, label: 'Enterprises', Icon: Browsers, a: SEG.trust.start + 3.6 }];

function Scene({ t }) {
  const cam = camAt(t);
  const pj = (gx, gy, z = 0) => [cam.x + (gx - gy) * U * 0.866 * cam.s, cam.y + (gx + gy) * U * 0.5 * cam.s - z * cam.s];
  const fade = ss(P(t, 0, 0.25)) * (1 - ss(P(t, FILM_DURATION - 0.5, FILM_DURATION)));
  const world = (1 - ss(P(t, T.cl - 0.1, T.cl + 0.7)));
  const slab = eo(P(t, 0.05, 0.9));
  const R = 3.7, sd = 16;
  const A = pj(-R, -R, -(1 - slab) * 90), B = pj(R, -R, -(1 - slab) * 90), C = pj(R, R, -(1 - slab) * 90), D = pj(-R, R, -(1 - slab) * 90);
  const down = (p) => [p[0], p[1] + sd * cam.s];
  const scanR = eo(P(t, SCAN[0], SCAN[1])) * 6.2;
  const scanning = t >= SCAN[0] && t < SCAN[1] + 0.5;
  const fixStart = T.fix + 0.4;
  const compCor = ss(P(t, KEY.b, KEY.b + 0.3)) * (1 - ss(P(t, fixStart, fixStart + 0.3)));
  const mp = (() => {
    const drop = eb(P(t, T.dis - 0.45, T.dis + 0.1)), w2 = ss(P(t, T.tr - 0.1, T.tr + 0.7)), wc = ss(P(t, T.cl - 0.05, T.cl + 0.9));
    const bob = Math.sin(t * 1.4) * 4;
    const [fx, fy] = pj(0, 0, 150 - (1 - drop) * 140 + 0), [tx, ty] = pj(0, 0, 262);
    const x = 380, y0 = fy + bob + (ty - fy) * w2;
    return { x, y: y0 + (250 - y0) * wc, half: (46 + 10 * w2 + 34 * wc) * (drop > 0 ? 1 : 0), s: drop, wc, fx, tx };
  })();
  const kp = eo(P(t, KEY.a, KEY.b)), u = 1 - kp;
  const kEnd = pj(0, 0, 50), kFrom = [690, 70], kCtl = [560, 150];
  const kx = u * u * kFrom[0] + 2 * u * kp * kCtl[0] + kp * kp * kEnd[0], ky = u * u * kFrom[1] + 2 * u * kp * kCtl[1] + kp * kp * kEnd[1];
  const keyS = eb(P(t, KEY.a - 0.4, KEY.a)) * (1 - ss(P(t, KEY.b, KEY.b + 0.35)));
  const step = stepAt(t);
  const label = t >= T.cl - 0.1 || step < 0 ? '' : STEPS[step].name;
  const burst = P(t, T.cl, T.cl + 1.4);

  const blocks = ID.map((b) => {
    const p = eb(P(t, b.t0, b.t0 + 0.55));
    if (p <= 0.003) return null;
    const d = Math.hypot(b.gx, b.gy);
    const seenK = Math.sin(Math.PI * clamp((scanR - d + 0.5) / 1.4));
    const ring = scanning ? Math.max(0, seenK) * 0.9 : 0;
    const red = b.risky ? ss(P(scanR, d, d + 0.6)) * (t < T.fix + 2 ? 1 : 1) : 0;
    const ri = RISKY.indexOf(b), fa = fixStart + Math.max(0, ri) * 0.17;
    const fx = b.risky ? eb(P(t, fa, fa + 0.35)) : 0;
    const base = tone(WHITE, RED, red * (1 - clamp(fx)));
    const col = fx > 0.01 ? tone(base, BLU, clamp(fx)) : base;
    const hot = red > 0.05 && fx < 0.5;
    const top = pj(b.gx, b.gy, b.h * clamp(p));
    const q = !scanning && t > T.at + 0.5 && t < T.dis && b.kind > 0 ? eb(P(t, T.at + 0.5 + b.i * 0.07, T.at + 0.8 + b.i * 0.07)) : 0;
    return (
      <g key={`${b.gx},${b.gy}`}>
        <Blk pj={pj} s={cam.s} gx={b.gx} gy={b.gy} w={0.8} h={b.h * p} c={col} Icon={b.Icon} ic={red > 0.4 || fx > 0.4 ? '#fff' : '#0a3d6f'} o={clamp(p)} ring={ring} />
        {q > 0.02 && <g transform={`translate(${f2(top[0] + 8 * cam.s)} ${f2(top[1] - 14)}) scale(${f2(q)})`}><circle r="10" fill="#fff" fillOpacity=".92" stroke={NAVY} strokeWidth="2.2" /><text y="5" textAnchor="middle" fontSize="13" fontWeight="700" fill={NAVY}>?</text></g>}
        {hot && <circle cx={f2(top[0] + 10 * cam.s)} cy={f2(top[1] - 12)} r={f2(5 + 2 * Math.sin(t * 5 + b.i))} fill={CORAL} stroke="#fff" strokeWidth="2" />}
        <Tick x={top[0] + 10 * cam.s} y={top[1] - 14} k={fx * (b.risky ? 1 : 0)} />
      </g>
    );
  });
  const cp = eb(P(t, 0.3, 0.9));
  const company = cp > 0.003 && (
    <g>
      <Blk pj={pj} s={cam.s} gx={0} gy={0} w={1.9} h={46 * cp} c={tone(WHITE, RED, compCor)} Icon={Buildings} ic={compCor > 0.4 ? '#fff' : '#0a3d6f'} o={clamp(cp)} />
    </g>
  );
  const compIdx = ID.findIndex((b) => b.gx + b.gy > 0);
  const front = blocks.slice(compIdx < 0 ? blocks.length : compIdx), back = blocks.slice(0, compIdx < 0 ? blocks.length : compIdx);

  return (
    <svg viewBox={`0 0 ${FW} ${FH}`} className="block h-full w-full font-sans" role="img"
      aria-label="Animation with voice-over, about 20 seconds. An isometric platform holds your company. A few people and many keys, service accounts and AI agents rise onto it. An attacker's key lands and no alert is raised. The Deep Algorithms mark scans the platform and three product cards appear: an inventory of every identity, a risk analysis that explains why an AI agent is risky, and the fixes with a runtime check that blocks a bad action. The platform ends as three layers with banks, government and enterprises linked in, and the Deep Algorithms mark on top.">
      <Defs />
      <defs><linearGradient id="fl-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor="#5cc2ff" stopOpacity="0" /></linearGradient></defs>
      <g opacity={f2(fade)}>
        <g opacity={f2(world)}>
          <g opacity={f2(slab)}>
            <polygon points={poly(D, C, down(C), down(D))} fill="rgba(255,255,255,.16)" />
            <polygon points={poly(B, C, down(C), down(B))} fill="rgba(255,255,255,.09)" />
            <polygon points={poly(A, B, C, D)} fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.5)" strokeWidth="1.6" />
          </g>
          {scanning && [0, 0.55].map((dl) => { const r = clamp(scanR - dl, 0.01, 7); const c = pj(0, 0, 0); return <ellipse key={dl} cx={f2(c[0])} cy={f2(c[1])} rx={f2(r * U * 1.2247 * cam.s)} ry={f2(r * U * 0.7071 * cam.s)} fill="none" stroke="#5cc2ff" strokeWidth="2.5" strokeOpacity={f2((1 - P(t, SCAN[1] - 0.3, SCAN[1] + 0.5)) * (dl ? 0.4 : 0.9))} />; })}
          {back}{company}{front}
          {ISLES.map((s, i) => {
            const p = eb(P(t, s.a, s.a + 0.5));
            if (p <= 0.003) return null;
            const c = pj(s.gx, s.gy, 0), e = pj(s.gx * 0.7, s.gy * 0.7, 0);
            return (
              <g key={s.label}>
                <line x1={f2(e[0])} y1={f2(e[1])} x2={f2(c[0])} y2={f2(c[1])} stroke="#5cc2ff" strokeOpacity=".7" strokeWidth="2.5" strokeDasharray="5 9" strokeDashoffset={f2(-t * 24)} />
                <Blk pj={pj} s={cam.s} gx={s.gx} gy={s.gy} w={2.2} h={7 * p} c={['rgba(255,255,255,.25)', 'rgba(255,255,255,.14)', 'rgba(255,255,255,.08)']} o={clamp(p)} />
                <Blk pj={pj} s={cam.s} gx={s.gx} gy={s.gy} w={1} h={7 + 54 * p} c={BLU.map((x, k) => mix(x, WHITE[k], 0.7))} Icon={s.Icon} ic={BLUE} o={clamp(p)} />
                <Pill x={c[0]} y={c[1] + 44 * cam.s} text={s.label} o={p} dark />
              </g>
            );
          })}
          {PLANES.map((pl) => {
            const p = eb(P(t, pl.a, pl.a + 0.6));
            if (p <= 0.003) return null;
            const z = pl.z * clamp(p), q = 2.3;
            const a = pj(-q, -q, z), b = pj(q, -q, z), c = pj(q, q, z), d = pj(-q, q, z);
            const lp = pl.side > 0 ? b : d;
            return (
              <g key={pl.label} opacity={f2(clamp(p))}>
                <polygon points={poly(a, b, c, d)} fill="rgba(92,194,255,.16)" stroke="rgba(255,255,255,.7)" strokeWidth="1.8" />
                <Pill x={lp[0] + pl.side * 74} y={lp[1]} text={pl.label} o={p} icon={pl.Icon} />
              </g>
            );
          })}
          {t >= T.tr && (() => {
            const p = ss(P(t, T.tr + 0.1, T.tr + 0.9)), a = pj(0, 0, 0), b = pj(0, 0, 262);
            return <rect x={f2(a[0] - 3)} y={f2(b[1])} width="6" height={f2(Math.max(0, a[1] - b[1]) * p)} fill="url(#fl-beam)" opacity={f2(0.9 * p)} transform={`translate(0 ${f2(a[1] - b[1]) * (1 - p) * 0})`} />;
          })()}
        </g>

        {keyS > 0.003 && (
          <g>
            {kp > 0 && <path d={`M${kFrom[0]} ${kFrom[1]} Q${kCtl[0]} ${kCtl[1]} ${f2(kx)} ${f2(ky)}`} fill="none" stroke={CORAL} strokeOpacity=".6" strokeWidth="2.5" strokeDasharray="4 8" />}
            <g transform={`translate(${f2(kp > 0 ? kx : kFrom[0])} ${f2(kp > 0 ? ky : kFrom[1])}) scale(${f2(keyS)})`}><circle r="28" fill={CORAL} stroke="#fff" strokeWidth="3" /><g transform="translate(-15 -15)"><Key size="30" color="#fff" weight="fill" /></g></g>
          </g>
        )}
        {t >= KEY.b + 0.15 && t < T.dis - 0.2 && <Pill x={176} y={150} text="0 alerts raised" o={eb(P(t, KEY.b + 0.15, KEY.b + 0.5)) * (1 - ss(P(t, T.dis - 0.5, T.dis - 0.2)))} />}

        {mp.half > 0 && <MarkTile cx={f2(mp.x)} cy={f2(mp.y)} half={mp.half} dark s={clamp(mp.s) * (1 + 0.04 * Math.sin(Math.PI * burst))} halo={clamp(mp.s)} />}
        {burst > 0 && burst < 1 && Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.3, r = 110 + 160 * eo(burst); return <g key={i} transform={`translate(${f2(380 + Math.cos(a) * r * 1.15)} ${f2(250 + Math.sin(a) * r)}) rotate(${f2(a * 57)}) scale(${f2(Math.max(0.01, 1.1 * Math.sin(Math.PI * burst)))})`}><path fill={i % 2 ? '#fff' : '#ff8d77'} d="M0 -14 C1 -6 6 -1 14 0 C6 1 1 6 0 14 C-1 6 -6 1 -14 0 C-6 -1 -1 -6 0 -14Z" /></g>; })}

        {t >= T.dis - 0.2 && t < T.tr + 0.6 && <g><InventoryCard t={t} /><RiskCard t={t} /><FixCard t={t} /></g>}

        {t >= T.cl && (
          <g opacity={f2(ss(P(t, T.cl + 0.5, T.cl + 1.1)))} transform={`translate(0 ${f2((1 - ss(P(t, T.cl + 0.5, T.cl + 1.1))) * 12)})`}>
            <text x="380" y="438" textAnchor="middle" fontSize="40" fontWeight="300" fill="#fff" style={{ ...DISPLAY, letterSpacing: '-0.6px' }}>Impact the future, today.</text>
          </g>
        )}
        {label && <text x="34" y="52" fontSize="26" fontWeight="300" fill="#fff" style={{ ...DISPLAY, letterSpacing: '-0.4px' }}>{label}</text>}
      </g>
    </svg>
  );
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function IdentityFilm({ className }) {
  const audio = useRef(null);
  const [cc, setCc] = useState(true);
  const { ref, t, seek, paused, setPaused, sound, setSoundOn, reduce } = useClock({ duration: FILM_DURATION, still: T.cl + 1.3, startAt: 0, audio });
  const step = stepAt(t);
  const stepEnd = step < 0 ? STEPS[0].t : step === STEPS.length - 1 ? FILM_DURATION : STEPS[step + 1].t;
  const showing = reduce || paused;
  const caption = cc && !reduce ? captionAt(t) : '';
  const drift = (k) => ({ transform: `translate(${f2(Math.sin(t * 0.32 + k) * 46)}px, ${f2(Math.cos(t * 0.27 + k) * 26)}px)` });
  return (
    <div ref={ref} className={cx('grid items-center gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-16', className)}>
      <div className="order-2 lg:order-1">
        <ol>
          {STEPS.map((e, i) => {
            const on = i === step;
            return (
              <li key={e.name} className="border-t border-line first:border-t-0">
                <button type="button" onClick={() => seek(e.t + 0.1)} aria-current={on ? 'true' : undefined} className="block w-full py-4 text-left">
                  <span className={cx('block text-[13px] font-semibold uppercase tracking-[.12em]', on ? 'text-brand' : 'text-ink-3')}>{String(i + 1).padStart(2, '0')} · {e.name}</span>
                  <span className={cx('mt-1 block font-display text-[22px] font-light leading-tight tracking-[-0.02em] md:text-[26px]', on ? 'text-ink' : 'text-ink-3')}>{e.title}</span>
                  {on && <span className="mt-2 block max-w-[440px] text-[16px] leading-relaxed text-ink-2">{e.body}</span>}
                  {on && !showing && <span className="mt-3 block h-[3px] w-full overflow-hidden rounded-full bg-line"><span className="block h-full bg-brand" style={{ width: `${f2(100 * clamp((t - e.t) / (stepEnd - e.t)))}%` }} /></span>}
                </button>
              </li>
            );
          })}
        </ol>
        <details className="mt-6 text-[15px] text-ink-2">
          <summary className="cursor-pointer font-medium text-brand">Read the transcript</summary>
          <p className="mt-3 leading-relaxed">{VO.segments.map((s) => s.sentences.map((x) => x.text).join(' ')).join(' ')}</p>
        </details>
      </div>

      <div className="order-1 lg:order-2">
        <div className="overflow-hidden rounded-[24px] shadow-[0_30px_80px_-30px_rgba(6,47,87,.55)] md:rounded-[32px]">
          <div className="relative flex aspect-[4/5] items-center overflow-hidden bg-gradient-to-b from-[#10408a] to-[#0a2a5e] sm:aspect-[760/650]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-80" style={{ filter: 'blur(26px)' }}>
              {[0, 2.1].map((k) => (
                <svg key={k} viewBox="0 0 760 650" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" style={drift(k)}>
                  <path d={k ? 'M-120 520 C 200 380 380 640 640 470 S 820 380 900 460' : 'M-120 160 C 160 40 340 300 580 170 S 800 80 900 200'} fill="none" stroke={k ? '#5cc2ff' : '#00aeef'} strokeOpacity=".42" strokeWidth="96" strokeLinecap="round" />
                </svg>
              ))}
            </div>
            <div className="relative w-full"><div className="aspect-[760/650] w-full"><Scene t={t} /></div></div>
            {caption && <p className="pointer-events-none absolute inset-x-3 bottom-3 text-center sm:bottom-4"><span className="inline-block rounded-lg bg-navy/80 px-3 py-1.5 text-[14px] leading-snug text-white sm:text-[16px]">{caption}</span></p>}
          </div>
          <div className="flex items-center gap-1.5 bg-brand px-3 py-2 text-white sm:gap-2.5 sm:px-4">
            <button type="button" onClick={() => setPaused((p) => !p)} aria-label={showing ? 'Play animation' : 'Pause animation'} className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {showing ? <Play size={18} weight="fill" /> : <Pause size={18} weight="fill" />}
            </button>
            <span className="w-[34px] text-[13px] tabular-nums">{mmss(t)}</span>
            <button type="button" onClick={() => setSoundOn(!sound, sound ? undefined : 0)} aria-pressed={sound} aria-label={sound ? 'Mute voice-over' : 'Play with voice-over'} className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {sound ? <SpeakerHigh size={20} weight="fill" /> : <SpeakerSlash size={20} weight="fill" />}<span className="hidden sm:inline">{sound ? 'Sound on' : 'Sound'}</span>
            </button>
            <input type="range" min="0" max={FILM_DURATION} step="0.1" value={f2(t)} onChange={(e) => seek(+e.target.value)} aria-label="Animation position" className="h-1 min-w-0 flex-1 cursor-pointer accent-white" />
            <button type="button" onClick={() => setCc((c) => !c)} aria-pressed={cc} aria-label="Captions" className={cx('inline-flex h-8 min-w-[2.25rem] items-center justify-center rounded-md border px-1.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white', cc ? 'border-white bg-white text-brand' : 'border-white/60 text-white')}>CC</button>
          </div>
        </div>
        <audio ref={audio} preload="none" src="/audio/identity-shift.mp3" />
      </div>
    </div>
  );
}
