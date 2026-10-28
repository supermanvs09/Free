import { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Cloud, Cpu, Database, GearSix, HardDrives, Key, Plugs, Robot, Sparkle, Terminal, User } from '@phosphor-icons/react/dist/ssr';
import { cx, useInView, useReducedMotion } from './kit.jsx';

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

export { useClock, P, ss, eo, eb, f2, clamp, BLUE, CYAN, NAVY, CORAL, Defs, MarkTile };
