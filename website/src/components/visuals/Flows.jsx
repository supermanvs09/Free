import { useCallback, useEffect, useRef, useState } from 'react';
import { Bank, Brain, Browsers, Buildings, Cloud, Cpu, Database, GearSix, HardDrives, Key, Pause, Play, Plugs, Robot, Sparkle, SpeakerHigh, SpeakerSlash, Terminal, User } from '@phosphor-icons/react/dist/ssr';
import { cx, useInView, useReducedMotion } from './kit.jsx';
import { VO } from '../../data/voiceover.js';

/* One picture, two uses: the identity orbit.
   Our mark sits in the middle, large, and is the only brand colour. Around it,
   three rings carry people, machine identities and AI agents as plain
   monochrome icons (no third-party logos). Risk shows as a small coral dot,
   a fix as a small blue tick.
   - OrbitHero: a calm loop for the top of the home page.
   - IdentityFilm: "The Identity Shift", built up ring by ring in time with an
     English voice-over (the narration file's measured timings drive it).
   Everything is drawn from one clock, runs only while on screen, and holds a
   finished frame under reduced motion and in the prerendered HTML. All names
   and numbers are illustrative. */

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const P = (t, a, b) => clamp((t - a) / (b - a));
const ss = (x) => x * x * (3 - 2 * x);
const eo = (x) => 1 - (1 - x) ** 3;
const eb = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2);
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
const BLUE = '#0068ac', CYAN = '#00aeef', NAVY = '#0a2a5e', CORAL = '#f0644d', LINE = '#dbe3ec', INK2 = '#3f4a5a';

/* ---------- clock (optionally slaved to the voice-over audio) ---------- */

function useClock({ duration, still, startAt = still, audio }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref);
  const [t, setT] = useState(still);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(false);
  const cur = useRef(still);
  const started = useRef(false);
  const snd = useRef(false);
  snd.current = sound;

  useEffect(() => {
    const a = audio && audio.current;
    if (reduce) { cur.current = still; setT(still); started.current = false; if (a) a.pause(); setSound(false); return undefined; }
    if (paused || !inView) { if (a) a.pause(); return undefined; }
    if (!started.current) { started.current = true; cur.current = startAt; }
    if (snd.current && a && a.paused) a.play().catch(() => setSound(false));
    let raf = 0, last = performance.now(), acc = 0;
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (snd.current && a) {
        if (a.ended) { snd.current = false; setSound(false); cur.current = 0; }
        else if (!a.paused && a.readyState >= 3) cur.current = a.currentTime; // otherwise wait for the audio
      } else cur.current = (cur.current + dt) % duration;
      acc += dt;
      if (acc >= 1 / 30) { acc = 0; setT(cur.current); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, paused, inView, sound, duration, still, startAt, audio]);

  const seek = useCallback((s) => {
    cur.current = s; started.current = true; setT(s); setPaused(false);
    const a = audio && audio.current; if (a && snd.current) a.currentTime = s;
  }, [audio]);
  const setSoundOn = useCallback((on, from) => {
    const a = audio && audio.current; if (!a) return;
    if (!on) { a.pause(); setSound(false); return; }
    const s = from == null ? cur.current : from;
    cur.current = s; started.current = true; setT(s); setPaused(false);
    a.currentTime = s; snd.current = true; setSound(true);
    a.play().catch(() => { snd.current = false; setSound(false); });
  }, [audio]);
  return { ref, t, seek, paused, setPaused, sound, setSoundOn, reduce };
}

/* ---------- shared drawing ---------- */

const RINGS = [
  { label: 'People', icons: [User, User, User, User], risky: [0, 2] },
  { label: 'Machine identities', icons: [Key, Cloud, Database, GearSix, Plugs, HardDrives, Terminal], risky: [0, 3, 4] },
  { label: 'AI agents', icons: [Robot, Sparkle, Robot, Brain, Robot, Sparkle, Cpu, Robot], risky: [0, 3, 6] },
];
const angles = (n, gap = 56) => Array.from({ length: n }, (_, i) => ((-90 + gap / 2 + ((i + 0.5) * (360 - gap)) / n) * Math.PI) / 180);

function Disc({ x, y, Icon, r = 26, o = 1, s = 1, dark, warn = 0, ok = 0, glow = 0, q = 0 }) {
  return (
    <g transform={`translate(${f2(x)} ${f2(y)}) scale(${f2(s)})`} opacity={f2(o)}>
      {glow > 0.01 && <circle r={r + 9} fill="none" stroke={dark ? '#5cc2ff' : BLUE} strokeOpacity={f2(glow * 0.85)} strokeWidth="2" />}
      <circle r={r} fill={dark ? 'rgba(255,255,255,.1)' : '#fff'} stroke={dark ? 'rgba(255,255,255,.4)' : LINE} strokeWidth="1.5" filter={dark ? undefined : 'url(#or-sh)'} />
      <g transform={`translate(${f2(-r * 0.5)} ${f2(-r * 0.5)})`}><Icon size={r} color={dark ? '#fff' : INK2} weight="regular" /></g>
      {warn > 0.01 && <circle cx={f2(r * 0.74)} cy={f2(-r * 0.74)} r={f2(Math.max(0.01, 7.5 * warn))} fill={CORAL} stroke={dark ? NAVY : '#fff'} strokeWidth="2.5" />}
      {q > 0.01 && <g transform={`translate(${f2(r * 0.74)} ${f2(-r * 0.74)}) scale(${f2(q)})`}><circle r="9" fill={dark ? '#fff' : '#8a97a8'} fillOpacity={dark ? 0.9 : 1} stroke={dark ? NAVY : '#fff'} strokeWidth="2.2" /><text y="4.5" textAnchor="middle" fontSize="12" fontWeight="700" fill={dark ? NAVY : '#fff'}>?</text></g>}
      {ok > 0.01 && <g transform={`translate(${f2(r * 0.74)} ${f2(-r * 0.74)}) scale(${f2(ok)})`}><circle r="10" fill={dark ? CYAN : BLUE} stroke={dark ? NAVY : '#fff'} strokeWidth="2.5" /><path d="M-4.5 0.5 l3 3.2 6-6.7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></g>}
    </g>
  );
}

function MarkTile({ cx, cy, half, s = 1, dark, halo = 0.5 }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={f2(half * 2.3 * s)} fill={dark ? 'url(#or-halo-d)' : 'url(#or-halo)'} opacity={f2(halo)} />
      <g transform={`scale(${f2(s)})`}>
        <g filter="url(#or-sh-lg)"><rect x={-half} y={-half} width={half * 2} height={half * 2} rx={half * 0.46} fill="#fff" stroke={dark ? 'none' : '#e3e8ee'} /></g>
        <image href="/brand/mark.webp" x={-half * 0.58} y={-half * 0.58} width={half * 1.16} height={half * 1.16} />
      </g>
    </g>
  );
}

const Defs = () => (
  <defs>
    <filter id="or-sh" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#062f57" floodOpacity=".12" /></filter>
    <filter id="or-sh-lg" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="12" stdDeviation="14" floodColor="#062f57" floodOpacity=".22" /></filter>
    <radialGradient id="or-halo"><stop offset="0" stopColor={CYAN} stopOpacity=".2" /><stop offset="1" stopColor={CYAN} stopOpacity="0" /></radialGradient>
    <radialGradient id="or-halo-d"><stop offset="0" stopColor="#5cc2ff" stopOpacity=".32" /><stop offset="1" stopColor="#5cc2ff" stopOpacity="0" /></radialGradient>
    <linearGradient id="or-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10408a" /><stop offset="1" stopColor="#0a2a5e" /></linearGradient>
  </defs>
);

/* ------------------------------------------------------------------ */
/* 1. Hero: a calm loop. A pulse leaves our mark every 5 seconds; each risk dot it reaches becomes a fix. */

const GEO = {
  wide: { W: 1200, H: 480, cx: 600, cy: 240, rings: [[200, 104], [350, 152], [495, 200]], r: 26, half: 68 },
  compact: { W: 560, H: 560, cx: 280, cy: 280, rings: [[105, 105], [175, 175], [245, 245]], r: 22, half: 52 },
  mini: { W: 480, H: 480, cx: 240, cy: 240, rings: [[92, 92], [150, 150], [208, 208]], r: 21, half: 44, n: [4, 6, 8] },
};
const HERO_CYCLE = 5, HERO_REACH = 2.2;

function HeroScene({ t, compact, mini, dark }) {
  const g = mini ? GEO.mini : compact ? GEO.compact : GEO.wide, { W, H, cx, cy, r } = g, tau = t % HERO_CYCLE, s = tau / HERO_REACH, rx3 = g.rings[2][0], ry3 = g.rings[2][1], r0 = g.half * 1.1;
  const nodes = [];
  RINGS.forEach((ring, i) => {
    const [rx, ry] = g.rings[i], icons = g.n ? ring.icons.slice(0, g.n[i]) : ring.icons, ang = angles(icons.length), ratio = (rx - r0) / (rx3 - r0);
    icons.forEach((Icon, k) => {
      const x = cx + rx * Math.cos(ang[k]), y = cy + ry * Math.sin(ang[k]) + Math.sin(t * 0.9 + k * 1.7 + i) * 2.5;
      const risky = ring.risky.includes(k), flip = (ratio + 0.03 * k) * HERO_REACH, back = 3.5 + 0.12 * k;
      const okOn = risky && tau >= flip && tau < back;
      const warn = risky && !okOn ? (tau >= back ? eb(P(tau, back, back + 0.4)) : 1) : 0;
      const ok = okOn ? eb(P(tau, flip, flip + 0.4)) : 0;
      const glow = Math.sin(Math.PI * P(tau, flip - 0.2, flip + 0.55));
      nodes.push(<Disc key={`${i}${k}`} x={x} y={y} Icon={Icon} r={r} warn={warn} ok={ok} glow={glow} dark={dark} />);
    });
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full font-sans" role="img"
      aria-label="Animation: the Deep Algorithms mark at the centre of three rings that hold people, machine identities and AI agents. A pulse leaves the mark every few seconds, and each identity it reaches changes from a risk marker to a fix.">
      <Defs />
      {g.rings.map(([rx, ry], i) => (
        <g key={i}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={dark ? 'rgba(255,255,255,.22)' : LINE} strokeWidth="1.5" />
          {!mini && <text x={cx} y={cy - ry + 5} textAnchor="middle" fontSize={compact ? 13 : 14} fontWeight="500" fill="#5c6777" stroke="#fff" strokeWidth="7" paintOrder="stroke">{RINGS[i].label}</text>}
        </g>
      ))}
      {tau < HERO_REACH + 0.4 && <ellipse cx={cx} cy={cy} rx={f2(r0 + s * (rx3 - r0))} ry={f2(r0 + s * (ry3 - r0))} fill="none" stroke={dark ? '#5cc2ff' : BLUE} strokeWidth="2" strokeOpacity={f2(0.5 * (1 - ss(P(s, 0.9, 1.15))))} />}
      {nodes}
      <MarkTile cx={cx} cy={cy} half={g.half} s={1 + 0.015 * Math.sin(t * 1.3)} halo={0.9} dark={dark} />
    </svg>
  );
}

function useCompact() {
  const [c, setC] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 639px)');
    setC(m.matches);
    const on = () => setC(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return c;
}

export function OrbitHero({ className }) {
  const { ref, t } = useClock({ duration: HERO_CYCLE * 4, still: 4.4 });
  const compact = useCompact();
  return (
    <div ref={ref} className={cx('relative overflow-hidden', compact ? 'aspect-square' : 'aspect-[1200/480]', className)}>
      <HeroScene t={t} compact={compact} />
    </div>
  );
}

/* A smaller dark version of the same orbit for navy panels (replaces the line art). */
export function OrbitMini({ className }) {
  const { ref, t } = useClock({ duration: HERO_CYCLE * 4, still: 4.4 });
  return (
    <div ref={ref} className={cx('mx-auto aspect-square w-full max-w-[460px]', className)}>
      <HeroScene t={t} mini dark />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. The 20-second pitch film: the orbit builds up, an attacker logs in unseen,
   three product views show what we do, then the secured orbit. Everything is
   timed to the voice-over's measured cues. */

const SEG = Object.fromEntries(VO.segments.map((s) => [s.id, s]));
export const FILM_DURATION = VO.duration;
const FW = 760, FH = 650, FCX = 380, FCY = 292, FR = [100, 182, 258], FD = 26;
const FDUR = SEG.find.end - SEG.find.start;
const T = {
  sh: SEG.shift.start, at: SEG.attack.start, dis: SEG.find.start - 0.2, und: SEG.find.start + FDUR * 0.42, fix: SEG.find.start + FDUR * 0.68,
  win: SEG.trust.start + 0.3, tr: SEG.trust.start, cl: SEG.close.start,
};
const KEY = { from: [700, 48], ctl: [560, 120], to: [FCX, FCY], a: T.at + 1.7, b: T.at + 3.6 };
export const STEPS = [
  { t: T.sh - 0.1, name: 'The shift', title: 'Most access no longer belongs to a person.', body: 'Keys, service accounts and AI agents hold it now.' },
  { t: T.at - 0.1, name: 'The attack', title: 'Attackers log in. They do not break in.', body: 'A key nobody owns opens the door, and no alert is raised.' },
  { t: T.dis, name: 'Discover', title: 'We find every identity.', body: 'People, service accounts, keys and AI agents in one inventory, each with an owner and what it can reach.' },
  { t: T.und, name: 'Understand', title: 'We show you the risk, and why.', body: 'A score with the reasons behind it, in plain language your team can act on.' },
  { t: T.fix, name: 'Fix', title: 'We fix it before it is used.', body: 'The exact change to make, and for AI agents a check on every action before it runs.' },
  { t: T.win - 0.05, name: 'Trusted', title: 'Built in India. Trusted by banks, government and enterprises.', body: 'One platform for every human, machine and AI agent identity.' },
];
const stepAt = (t) => { let i = -1; STEPS.forEach((s, k) => { if (t >= s.t) i = k; }); return i; };
const captionAt = (t) => { for (const seg of VO.segments) for (const s of seg.sentences) if (t >= s.start - 0.1 && t <= s.end + 0.5) return s.text; return ''; };
const DISPLAY = { fontFamily: '"Hanken Grotesk Variable","Inter Variable",sans-serif' };
const INK = '#0b1220', INK3 = '#5c6777';
const win = (t, a, b) => ss(P(t, a - 0.05, a + 0.2)) * (1 - ss(P(t, b - 0.2, b - 0.02)));

/* ---- product views (SVG, same clock; local time runs faster than the clock so each view reads as a quick montage shot) ---- */

function Window({ title, chip, o, t, ph = 0, children }) {
  const fy = Math.sin(t * 1.15 + ph) * 4.5, rot = Math.sin(t * 0.7 + ph) * 0.4; // the card floats
  return (
    <g opacity={f2(o)} transform={`translate(40 ${f2(96 + (1 - o) * 10 + fy)}) rotate(${f2(rot)} 340 233)`}>
      <g filter="url(#or-sh-lg)"><rect width="680" height="466" rx="20" fill="#fff" /></g>
      <image href="/brand/mark.webp" x="22" y="14" width="28" height="28" />
      <text x="62" y="35" fontSize="19" fontWeight="600" fill={INK}>{title}</text>
      {chip && <g transform="translate(648 28)"><rect x={-chip.length * 8.4 - 22} y="-15" width={chip.length * 8.4 + 22} height="30" rx="15" fill="#e6f2fa" /><text x="-11" y="5.5" textAnchor="end" fontSize="15" fontWeight="600" fill="#06487a">{chip}</text></g>}
      <line x1="0" y1="56" x2="680" y2="56" stroke="#e3e8ee" />
      <g transform="translate(0 56)">{children}</g>
    </g>
  );
}
const Row = ({ y, o, icon: Icon, ini, color, cells, xs }) => (
  <g opacity={f2(o)} transform={`translate(${f2((1 - o) * 18)} ${y})`}>
    <line x1="32" y1="-24" x2="648" y2="-24" stroke="#eef1f5" />
    {ini ? <g transform="translate(48 0)"><circle r="16" fill={color} /><text y="5.5" textAnchor="middle" fontSize="13" fontWeight="600" fill="#fff">{ini}</text></g>
      : <g transform="translate(48 0)"><circle r="16" fill="#eef2f6" /><g transform="translate(-9 -9)"><Icon size="18" color={INK2} weight="regular" /></g></g>}
    {cells.map((c, i) => <text key={i} x={xs[i]} y="6" fontSize="17" fontWeight={i === 0 ? 600 : 400} fill={i === 0 ? INK : i === 3 ? INK3 : '#3f4a5a'}>{c}</text>)}
  </g>
);
const Gauge = ({ cx, cy, r, v, color, label, sub }) => (
  <g transform={`translate(${cx} ${cy})`}>
    <circle r={r} fill="none" stroke="#e9ecf0" strokeWidth="14" />
    <circle r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" pathLength="100" strokeDasharray={`${f2(Math.max(0.01, v))} 100`} transform="rotate(-90)" />
    <text y="14" textAnchor="middle" fontSize="46" fontWeight="300" fill={INK} style={DISPLAY}>{Math.round(v)}</text>
    <text y={r + 34} textAnchor="middle" fontSize="16" fill={INK3}>{label}</text>
    {sub}
  </g>
);


function DiscoverUI({ t }) {
  const a = T.dis, lt = (t - a) * 3.3, n = Math.round(1284 * eo(P(lt, 0.3, 2.2)));
  const bars = [['People', 312, '#0068ac'], ['Machine identities', 702, '#5aa9d6'], ['AI agents', 270, '#00aeef']];
  const rows = [
    ['KR', '#0068ac', ['Kavya Reddy', 'Person', 'Treasury', '12 apps']], [Key, null, ['svc-payments', 'Service account', 'Rahul Menon', 'AWS, 4 roles']],
    [Key, null, ['deploy-bot', 'CI/CD role', 'Arjun Nair', 'GitHub, AWS']], [Robot, null, ['invoice-agent', 'AI agent', 'Meera Pillai', 'Finance data']],
  ];
  const xs = [76, 262, 408, 528];
  return (
    <Window t={t} ph={0} title="Identity inventory" chip="All identities" o={win(t, a, T.und)}>
      <text x="32" y="82" fontSize="56" fontWeight="300" fill={INK} style={DISPLAY}>{n.toLocaleString('en-US')}</text>
      <text x="32" y="112" fontSize="17" fill={INK3}>identities found</text>
      {bars.map(([lab, v, col], i) => {
        const g = eo(P(lt, 0.5 + i * 0.25, 2.2 + i * 0.25)), y = 40 + i * 36;
        return <g key={lab} transform={`translate(260 ${y})`}><text y="14" fontSize="16" fill="#3f4a5a">{lab}</text><rect x="168" y="3" width="170" height="12" rx="6" fill="#eef1f5" /><rect x="168" y="3" width={f2(Math.max(0.01, 170 * (v / 702) * g))} height="12" rx="6" fill={col} /><text x="388" y="14" textAnchor="end" fontSize="16" fontWeight="600" fill={INK}>{Math.round(v * g)}</text></g>;
      })}
      <g transform="translate(0 150)">
        <g fontSize="13" fontWeight="600" fill={INK3} letterSpacing="1.1">{['IDENTITY', 'TYPE', 'OWNER', 'REACH'].map((h, i) => <text key={h} x={xs[i] === 76 ? 32 : xs[i]} y="0">{h}</text>)}</g>
        {rows.map(([ic, col, cells], i) => <Row key={i} y={42 + i * 52} o={eo(P(lt, 2.3 + i * 0.7, 2.9 + i * 0.7))} icon={typeof ic === 'string' ? null : ic} ini={typeof ic === 'string' ? ic : null} color={col} cells={cells} xs={xs} />)}
      </g>
    </Window>
  );
}

function UnderstandUI({ t }) {
  const a = T.und, lt = (t - a) * 3.4, v = 86 * eo(P(lt, 0.1, 1.5));
  const why = [['Admin access, 3% used', 'It holds far more access than its task needs.'], ['No owner assigned', 'No one is accountable for what it does.'], ['Can export customer data', 'One request could move records outside.']];
  return (
    <Window t={t} ph={1.3} title="Risk analysis" chip="invoice-agent" o={win(t, a, T.fix)}>
      <g transform="translate(34 30)"><circle r="26" fill="#eef2f6" /><g transform="translate(-14 -14)"><Robot size="28" color={INK2} weight="regular" /></g></g>
      <text x="76" y="30" fontSize="21" fontWeight="600" fill={INK}>invoice-agent</text>
      <text x="76" y="54" fontSize="15" fill={INK3}>AI agent · Finance</text>
      <Gauge cx={130} cy={200} r={70} v={v} color={CORAL} label="Risk score" />
      <g transform="translate(130 330)" opacity={f2(eo(P(lt, 1.4, 1.9)))}><rect x="-34" y="-15" width="68" height="30" rx="15" fill="#fde9e5" /><text y="5.5" textAnchor="middle" fontSize="15" fontWeight="600" fill="#b3361d">High</text></g>
      <text x="300" y="30" fontSize="13" fontWeight="600" fill={INK3} letterSpacing="1.1">WHY IT IS RISKY</text>
      {why.map(([h, b], i) => {
        const o = eo(P(lt, 1.0 + i * 0.8, 1.5 + i * 0.8));
        return <g key={h} opacity={f2(o)} transform={`translate(${f2(300 + (1 - o) * 14)} ${72 + i * 96})`}><circle cx="7" cy="6" r="7" fill={CORAL} /><text x="26" y="12" fontSize="20" fontWeight="600" fill={INK}>{h}</text><text x="26" y="40" fontSize="16" fill="#3f4a5a">{b}</text></g>;
      })}
    </Window>
  );
}

function FixUI({ t }) {
  const a = T.fix, lt = (t - a) * 3.2;
  const fixes = [['Reduce to least privilege', 'Remove access it never uses'], ['Assign an owner', 'Meera Pillai, Finance'], ['Limit export to its task', 'Block copies outside the company']];
  const at = (i) => 0.7 + i * 0.9;
  const done = fixes.map((_, i) => eb(P(lt, at(i), at(i) + 0.4)));
  const v = 86 - 74 * eo(P(lt, at(0), at(2) + 0.6));
  const card = eo(P(lt, 3.9, 4.6));
  return (
    <Window t={t} ph={2.1} title="Remediation" chip="invoice-agent" o={win(t, a, T.win)}>
      <Gauge cx={110} cy={118} r={54} v={v} color={v > 40 ? CORAL : BLUE} label="Risk score" />
      {fixes.map(([h, b], i) => (
        <g key={h} transform={`translate(240 ${24 + i * 64})`}>
          <g transform="translate(0 14)">{done[i] > 0.05 ? <g transform={`scale(${f2(done[i])})`}><circle r="11" fill={BLUE} /><path d="M-5 0.5 l3.4 3.6 6.8-7.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></g> : <circle r="9" fill={CORAL} />}</g>
          <text x="26" y="14" fontSize="19" fontWeight="600" fill={INK}>{h}</text>
          <text x="26" y="38" fontSize="15" fill={INK3}>{b}</text>
          <g transform="translate(330 4)"><rect x="0" y="0" width="104" height="32" rx="16" fill={done[i] > 0.5 ? BLUE : '#fff'} stroke={BLUE} strokeWidth="1.6" /><text x="52" y="21.5" textAnchor="middle" fontSize="15" fontWeight="600" fill={done[i] > 0.5 ? '#fff' : BLUE}>{done[i] > 0.5 ? 'Fixed' : 'Apply fix'}</text></g>
        </g>
      ))}
      <g opacity={f2(card)} transform={`translate(32 ${f2(236 + (1 - card) * 10)})`}>
        <rect width="616" height="116" rx="14" fill="#f4f7fa" stroke="#e3e8ee" />
        <text x="22" y="30" fontSize="13" fontWeight="600" fill={INK3} letterSpacing="1.1">RUNTIME CHECK</text>
        <text x="22" y="64" fontSize="19" fontWeight="500" fill={INK}>invoice-agent  →  crm.export  to an external address</text>
        <g transform="translate(22 76)"><rect width="206" height="28" rx="14" fill={NAVY} /><text x="103" y="19" textAnchor="middle" fontSize="15" fontWeight="600" fill="#fff">Blocked before it ran</text></g>
      </g>
    </Window>
  );
}

/* Small cards that float around the scene and appear as the voice-over reaches them. */
const SATS = [
  { a: T.dis + 0.65, b: T.und, x: 500, y: 92, text: 'Shadow agent found', tone: 'risk', ph: 0.4 },
  { a: T.dis + 1.1, b: T.und, x: 196, y: 550, text: 'Owner assigned', tone: 'fix', ph: 2.0 },
  { a: T.und + 0.3, b: T.fix, x: 520, y: 92, text: 'No owner', tone: 'risk', ph: 1.1 },
  { a: T.fix + 0.45, b: T.win, x: 520, y: 92, text: 'Least privilege applied', tone: 'fix', ph: 0.9 },
  { a: T.fix + 1.05, b: T.win, x: 210, y: 550, text: 'Risk score 86 to 12', tone: 'navy', ph: 2.6 },
  { a: SEG.trust.start + 2.3, b: FILM_DURATION, x: 138, y: 150, text: 'Banks', tone: 'ind', icon: Bank, ph: 0.3 },
  { a: SEG.trust.start + 3.0, b: FILM_DURATION, x: 622, y: 150, text: 'Government', tone: 'ind', icon: Buildings, ph: 1.4 },
  { a: SEG.trust.start + 3.7, b: FILM_DURATION, x: 380, y: 568, text: 'Enterprises', tone: 'ind', icon: Browsers, ph: 2.2 },
];
function Sats({ t }) {
  return SATS.map((c) => {
    const o = eb(P(t, c.a, c.a + 0.3)) * (1 - ss(P(t, c.b - 0.25, c.b - 0.05)));
    if (o <= 0.01) return null;
    const w = c.text.length * 9.4 + 58, dx = Math.sin(t * 0.9 + c.ph) * 5, dy = Math.sin(t * 1.3 + c.ph * 1.7) * 6, rot = Math.sin(t * 0.8 + c.ph) * 1.4;
    return (
      <g key={c.text} opacity={f2(clamp(o))} transform={`translate(${f2(c.x + dx)} ${f2(c.y + dy)}) rotate(${f2(rot)}) scale(${f2(0.9 + 0.1 * clamp(o))})`}>
        <g filter="url(#or-sh-lg)"><rect x={-w / 2} y="-21" width={w} height="42" rx="21" fill={c.tone === 'navy' ? NAVY : '#fff'} stroke={c.tone === 'navy' ? 'none' : '#e3e8ee'} /></g>
        {c.tone === 'fix' ? <g transform={`translate(${-w / 2 + 24} 0)`}><circle r="10" fill={BLUE} /><path d="M-4.5 0.5 l3 3.2 6-6.7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></g>
          : c.tone === 'ind' ? <g transform={`translate(${-w / 2 + 24} 0)`}><circle r="13" fill="#e6f2fa" /><g transform="translate(-9 -9)"><c.icon size="18" color={BLUE} weight="fill" /></g></g>
          : <circle cx={-w / 2 + 24} cy="0" r="7" fill={c.tone === 'risk' ? CORAL : '#fff'} />}
        <text x={-w / 2 + 44} y="6" fontSize="17" fontWeight="600" fill={c.tone === 'navy' ? '#fff' : INK}>{c.text}</text>
      </g>
    );
  });
}

function FilmScene({ t }) {
  const nodes = [], spokes = [];
  const fade = ss(P(t, 0, 0.2)) * (1 - ss(P(t, FILM_DURATION - 0.6, FILM_DURATION)));
  const closing = t >= T.win - 0.1;
  const stage = clamp(ss(P(t, 0.02, 0.3)) * (1 - ss(P(t, T.dis - 0.2, T.dis))) + ss(P(t, T.win - 0.1, T.win + 0.25)));
  const scan = (t - (closing ? T.win + 0.3 : 1e9)) / 2.0, scanR = scan * FR[2];
  RINGS.forEach((ring, i) => {
    const ang = angles(ring.icons.length, 48), t0 = [0.3, 1.1, 2.2][i], gap = [0.18, 0.2, 0.15][i], sp0 = [0.9, 2.2, 3.1][i];
    ring.icons.forEach((Icon, k) => {
      const ak = t0 + k * gap, idx = i * 4 + k;
      const p = closing ? eb(P(t, T.win + idx * 0.025, T.win + 0.45 + idx * 0.025)) : eb(P(t, ak, ak + 0.45));
      const m = closing ? 1 : eo(P(t, ak, ak + 0.55));
      const x = FCX + FR[i] * Math.cos(ang[k]) * m, y = FCY + FR[i] * Math.sin(ang[k]) * m + Math.sin(t * 0.9 + k * 1.7 + i) * 2.5;
      const risky = ring.risky.includes(k), ri = ring.risky.indexOf(k) + i * 3;
      const seen = closing ? Math.sin(Math.PI * P(scanR, FR[i] - 55, FR[i] + 55)) : 0;
      const okAt = T.win + 0.7 + ri * 0.12, ok = closing && risky ? eb(P(t, okAt, okAt + 0.35)) : 0;
      const qa = T.at + 0.5 + k * 0.08, q = !closing && i === 1 && t >= qa ? eb(P(t, qa, qa + 0.3)) : 0;
      const pulse = 1 + (ok ? 0.16 * Math.sin(Math.PI * P(t, okAt, okAt + 0.35)) : 0);
      if (p > 0.003) {
        nodes.push(<Disc key={`${i}${k}`} x={x} y={y} Icon={Icon} r={FD} s={p * pulse} o={clamp(p)} dark ok={ok} q={q} glow={seen} />);
        const sp = P(t, sp0 + k * 0.05, sp0 + k * 0.05 + 0.5);
        if (sp > 0 && !closing) spokes.push(<line key={`s${i}${k}`} x1={f2(FCX + (x - FCX) * 0.36)} y1={f2(FCY + (y - FCY) * 0.36)} x2={f2(FCX + (x - FCX) * (0.36 + 0.5 * eo(sp)))} y2={f2(FCY + (y - FCY) * (0.36 + 0.5 * eo(sp)))} stroke="#fff" strokeOpacity=".18" strokeWidth="1.5" />);
      }
    });
  });
  const kp = eo(P(t, KEY.a, KEY.b)), u = 1 - kp;
  const kx = u * u * KEY.from[0] + 2 * u * kp * KEY.ctl[0] + kp * kp * KEY.to[0], ky = u * u * KEY.from[1] + 2 * u * kp * KEY.ctl[1] + kp * kp * KEY.to[1];
  const keyS = eb(P(t, KEY.a - 0.5, KEY.a)) * (1 - ss(P(t, T.dis - 0.3, T.dis - 0.05)));
  const mark = eb(P(t, T.win, T.win + 0.5));
  const step = stepAt(t), act2 = t >= T.dis - 0.1 && t < T.win;
  const label = closing ? '' : step < 0 ? '' : STEPS[step].name;
  const burst = P(t, T.cl, T.cl + 1.4);
  return (
    <svg viewBox={`0 0 ${FW} ${FH}`} className="block h-full w-full font-sans" role="img"
      aria-label="Animation with voice-over, about 20 seconds. Three rings of icons fill up: people, then machine identities, then AI agents. An attacker logs in with a key nobody owns and no alert is raised. Then three product views: an inventory of every identity with its owner, a risk analysis that explains why an AI agent is risky, and the fixes with a runtime check that blocks a bad action. It ends with the Deep Algorithms mark at the centre of the secured orbit, with banks, government and enterprises around it.">
      <Defs />
      <g opacity={f2(fade)}>
        <g opacity={f2(stage)}>
          {FR.map((r, i) => {
            const a = closing ? T.win - 0.1 : [0.15, 0.95, 2.0][i], p = closing ? 1 : eo(P(t, a, a + 0.6)), c = 2 * Math.PI * r;
            return p > 0.002 ? <circle key={i} cx={FCX} cy={FCY} r={r} fill="none" stroke="#fff" strokeOpacity={f2(0.22 * p)} strokeWidth="1.5" strokeDasharray={f2(c)} strokeDashoffset={f2(c * (1 - p))} transform={`rotate(-90 ${FCX} ${FCY})`} /> : null;
          })}
          {spokes}
          <g opacity={f2(eb(P(t, 0.1, 0.5)) * (closing ? 0 : 1))}>
            <circle cx={FCX} cy={FCY} r="40" fill="rgba(255,255,255,.1)" stroke="rgba(255,255,255,.4)" strokeWidth="1.5" />
            <g transform={`translate(${FCX - 20} ${FCY - 20})`}><Buildings size="40" color="#fff" weight="regular" /></g>
            <text x={FCX} y={FCY + 66} textAnchor="middle" fontSize="16" fill="#fff" fillOpacity=".75">Your company</text>
          </g>
          {closing && scan > 0 && scan < 1.15 && <circle cx={FCX} cy={FCY} r={f2(Math.max(1, scanR))} fill="none" stroke="#5cc2ff" strokeWidth="2" strokeOpacity={f2(0.8 * (1 - ss(P(scan, 0.85, 1.15))))} />}
          {nodes}
          {keyS > 0.003 && (
            <g>
              {kp > 0 && <path d={`M${KEY.from[0]} ${KEY.from[1]} Q${KEY.ctl[0]} ${KEY.ctl[1]} ${f2(kx)} ${f2(ky)}`} fill="none" stroke={CORAL} strokeOpacity=".5" strokeWidth="2" strokeDasharray="4 7" />}
              <g transform={`translate(${f2(kp > 0 ? kx : KEY.from[0])} ${f2(kp > 0 ? ky : KEY.from[1])}) scale(${f2(keyS)})`}>
                <circle r="26" fill={CORAL} stroke={NAVY} strokeWidth="3" /><g transform="translate(-14 -14)"><Key size="28" color="#fff" weight="fill" /></g>
              </g>
            </g>
          )}
          {t >= KEY.b + 0.1 && t < T.dis && (
            <g opacity={f2(eb(P(t, KEY.b + 0.1, KEY.b + 0.4)) * (1 - ss(P(t, T.dis - 0.3, T.dis - 0.05))))} transform="translate(130 96)">
              <rect x="-96" y="-20" width="192" height="40" rx="20" fill="#fff" /><text y="6.5" textAnchor="middle" fontSize="19" fontWeight="600" fill={NAVY}>0 alerts raised</text>
            </g>
          )}
          {mark > 0.003 && <MarkTile cx={FCX} cy={FCY} half={56} dark s={mark * (1 + 0.03 * Math.sin(Math.PI * burst))} halo={mark} />}
          {burst > 0 && burst < 1 && Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2 + 0.3, r = 90 + 150 * eo(burst); return <g key={i} transform={`translate(${f2(FCX + Math.cos(a) * r * 1.1)} ${f2(FCY + Math.sin(a) * r)}) rotate(${f2(a * 57)}) scale(${f2(Math.max(0.01, 1.1 * Math.sin(Math.PI * burst)))})`}><path fill={i % 2 ? '#fff' : '#ff8d77'} d="M0 -14 C1 -6 6 -1 14 0 C6 1 1 6 0 14 C-1 6 -6 1 -14 0 C-6 -1 -1 -6 0 -14Z" /></g>; })}
        </g>

        {t >= T.dis - 0.1 && t < T.win && (
          <g>
            {t < T.und && <DiscoverUI t={t} />}
            {t >= T.und && t < T.fix && <UnderstandUI t={t} />}
            {t >= T.fix && <FixUI t={t} />}
          </g>
        )}
        <Sats t={t} />

        {label && <g opacity={f2(clamp(stage + (act2 ? 1 : 0)))}>
          {act2 && <g transform="translate(52 48)"><rect x="-22" y="-22" width="44" height="44" rx="12" fill="#fff" /><image href="/brand/mark.webp" x="-13" y="-13" width="26" height="26" /></g>}
          <text x={act2 ? 86 : 34} y="56" fontSize="25" fontWeight="300" fill="#fff" style={{ ...DISPLAY, letterSpacing: '-0.4px' }}>{label}</text>
        </g>}
        {closing && <image href="/brand/logo-lockup-inverse.webp" x="34" y="26" width="176" height="39" opacity={f2(ss(P(t, T.win + 0.2, T.win + 0.7)))} />}
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
          <div className="relative flex aspect-[4/5] items-center bg-gradient-to-b from-[#10408a] to-[#0a2a5e] sm:aspect-[760/650]">
            <div className="w-full"><div className="aspect-[760/650] w-full"><FilmScene t={t} /></div></div>
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
