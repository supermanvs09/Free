import { useEffect, useRef, useState } from 'react';
import { useScript, cx } from './kit.jsx';

/* "Every action starts with an identity" - a minimal motion story.
   Flat navy stage, white and coral tokens, one cyan scan. ~22 s loop. */
const SCENES = [
  { dur: 2600, cap: '' },
  { dur: 3000, cap: 'One person' },
  { dur: 3400, cap: 'creates keys, roles and tokens' },
  { dur: 3800, cap: 'that power hundreds of AI agents' },
  { dur: 4200, cap: 'Deep Algorithms checks every one, continuously' },
  { dur: 3000, cap: '' },
  { dur: 3600, cap: '' },
];

// Deterministic pseudo-random so prerender and hydration match.
const rnd = (i, k) => { const x = Math.sin(i * 97.13 + k * 13.7) * 43758.5453; return x - Math.floor(x); };
const KEYS = ['API key', 'IAM role', 'OAuth app', 'Secret', 'Service account', 'Token'];
const MARK = { x: 880, y: 345 };
// Jittered 7 x 4 grid across the right of the stage, clear of the mark.
const AGENTS = Array.from({ length: 28 }, (_, i) => ({
  x: 610 + (i % 7) * 92 + (rnd(i, 1) - 0.5) * 50, y: 130 + Math.floor(i / 7) * 128 + (rnd(i, 2) - 0.5) * 60,
  risky: [1, 5, 9, 12, 18, 23, 26].includes(i), s: 0.85 + rnd(i, 3) * 0.35,
})).filter((a) => Math.hypot(a.x - MARK.x, a.y - MARK.y) > 100);

const tr = (x, y, s = 1) => ({ transform: `translate(${x}px, ${y}px) scale(${s})` });

function Person() {
  return (
    <g>
      <circle r="46" fill="#fff" />
      <circle cy="-10" r="14" fill="#f0644d" />
      <path d="M-24 26c3-16 13-24 24-24s21 8 24 24" fill="#f0644d" />
    </g>
  );
}
function KeyTile({ label }) {
  const w = 26 + label.length * 8.2;
  return (
    <g>
      <rect x={-w / 2} y="-17" width={w} height="34" rx="9" fill="#0d4175" stroke="#5c86b3" strokeOpacity=".6" />
      <text x="0" y="5.5" textAnchor="middle" fontSize="15" fill="#dbe7f4">{label}</text>
    </g>
  );
}
function Agent({ risky, checked }) {
  const body = checked ? '#e6f3fb' : risky ? '#f0644d' : '#fff';
  return (
    <g>
      <line x1="0" y1="-24" x2="0" y2="-16" stroke={body} strokeWidth="2.5" style={{ transition: 'stroke .5s' }} />
      <circle cy="-26" r="3.5" fill={body} style={{ transition: 'fill .5s' }} />
      <rect x="-18" y="-16" width="36" height="30" rx="8" fill={body} style={{ transition: 'fill .5s' }} />
      <circle cx="-7" cy="-2" r="3" fill="#062f57" /><circle cx="7" cy="-2" r="3" fill="#062f57" />
      {checked && (
        <g transform="translate(16 -18)"><circle r="8" fill="#00aeef" /><path d="M-3.5 0l2.3 2.4 4.2-4.6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" /></g>
      )}
    </g>
  );
}

export default function StoryFilm({ className }) {
  const box = useRef(null);
  const { i, reduce } = useScript(SCENES, box, 4);
  const s = i;
  const fade = (on) => ({ opacity: on ? 1 : 0, transition: 'opacity .7s ease, transform 1s cubic-bezier(.65,0,.35,1)' });

  const person = s === 1 ? tr(640, 330, 1.25) : s === 2 ? tr(300, 330, 1) : s >= 3 && s <= 4 ? tr(190, 330, 0.8) : tr(640, 330, 0.6);
  return (
    <div ref={box} className={cx('relative overflow-hidden rounded-[28px] bg-navy', className)}>
      <svg viewBox="0 0 1280 720" className="block h-auto w-full" role="img"
        aria-label="Short animation: every action starts with an identity. One person creates keys, roles and tokens that power hundreds of AI agents. Deep Algorithms checks every one, continuously. Every identity known, every action verified.">
        <style>{'text{font-family:"DM Sans Variable",sans-serif} .disp{font-family:"Hanken Grotesk Variable",sans-serif;font-weight:300}'}</style>

        {/* Scene 0: title */}
        <g style={{ ...fade(s === 0), ...tr(640, 360) }}>
          <text className="disp" textAnchor="middle" fontSize="58" fill="#fff">Every action starts with an identity</text>
          <path d="M505 -52l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#f0644d" />
        </g>

        {/* Ground line */}
        <line x1="60" x2="1220" y1="620" y2="620" stroke="#fff" strokeOpacity={s >= 1 && s <= 4 ? 0.35 : 0} style={{ transition: 'stroke-opacity .6s' }} />

        {/* Person */}
        <g style={{ ...fade(s >= 1 && s <= 4), ...person }}><Person /></g>

        {/* Connectors: the person creates each key */}
        {KEYS.map((k, n) => {
          const a = (n / KEYS.length) * Math.PI * 2 - Math.PI / 2;
          const p0 = s === 2 ? [300, 330] : [190, 330];
          const p1 = s === 2 ? [300 + Math.cos(a) * 190, 330 + Math.sin(a) * 150] : [430, 150 + n * 72];
          return <line key={`c${k}`} x1={p0[0]} y1={p0[1]} x2={p1[0]} y2={p1[1]} stroke="#5c86b3" strokeOpacity={s >= 2 && s <= 4 ? 0.45 : 0} strokeDasharray="3 5" style={{ transition: 'stroke-opacity .6s .3s' }} />;
        })}

        {/* Keys, roles, tokens */}
        {KEYS.map((k, n) => {
          const a = (n / KEYS.length) * Math.PI * 2 - Math.PI / 2;
          const pos = s === 2 ? tr(300 + Math.cos(a) * 190, 330 + Math.sin(a) * 150) : s >= 3 && s <= 4 ? tr(430, 150 + n * 72, 0.9) : tr(300, 330, 0.2);
          return <g key={k} style={{ ...fade(s >= 2 && s <= 4), ...pos, transitionDelay: `${n * 70}ms` }}><KeyTile label={k} /></g>;
        })}

        {/* Agents */}
        {AGENTS.map((g, n) => {
          const d = Math.hypot(g.x - MARK.x, g.y - MARK.y);
          const on = s >= 3 && s <= 4;
          const pos = on ? tr(g.x, g.y, g.s) : tr(430, 360, 0.1);
          return (
            <g key={n} style={{ ...fade(on), ...pos, transitionDelay: s === 3 ? `${n * 45}ms` : '0ms' }}>
              <g className={on ? 'story-float' : ''} style={{ animationDelay: `${-n * 0.37}s` }}>
                <AgentStateful risky={g.risky} checked={s === 4} delay={s === 4 ? 300 + d * 2.2 : 0} />
              </g>
            </g>
          );
        })}

        {/* Scan: mark + expanding ring */}
        <g style={{ ...fade(s === 4), ...tr(MARK.x, MARK.y) }}>
          <circle r="440" fill="none" stroke="#00aeef" strokeWidth="2" className={s === 4 ? 'story-ring' : ''} opacity="0" />
          <rect x="-44" y="-44" width="88" height="88" rx="22" fill="#fff" />
          <image href="/brand/mark.png" x="-25" y="-26" width="50" height="52" />
        </g>

        {/* Caption */}
        <text className="max-md:hidden" x="640" y="676" textAnchor="middle" fontSize="30" fill="#dbe7f4" style={{ opacity: SCENES[s].cap ? 1 : 0, transition: 'opacity .5s' }}>{SCENES[s].cap}</text>

        {/* Scene 5: message card */}
        <g style={{ opacity: s === 5 ? 1 : 0, transition: 'opacity .6s' }}>
          <rect width="1280" height="720" fill="#f0644d" />
          <text className="disp" x="640" y="340" textAnchor="middle" fontSize="54" fill="#fff">Every identity known.</text>
          <text className="disp" x="640" y="410" textAnchor="middle" fontSize="54" fill="#fff">Every action verified.</text>
        </g>

        {/* Scene 6: brand */}
        <g style={{ opacity: s === 6 ? 1 : 0, transition: 'opacity .6s' }}>
          <image href="/brand/logo-lockup-inverse.png" x="440" y="250" width="400" height="89" style={{ filter: "brightness(0) invert(1)" }} />
          <text className="disp" x="640" y="420" textAnchor="middle" fontSize="40" fill="#fff">Identity Security for the AI Era</text>
          <path d="M915 384l3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z" fill="#f0644d" />
        </g>
      </svg>
      {/* SVG captions shrink to ~8px on phones; show them as text instead. */}
      <p aria-hidden="true" className="min-h-[52px] px-5 pb-4 text-center text-[15px] leading-snug text-[#dbe7f4] md:hidden">{SCENES[s].cap}</p>
      {reduce && <span className="sr-only">Animation paused because reduced motion is on.</span>}
    </div>
  );
}

/* Agent whose "checked" state lands after a distance-based delay, so the
   scan reads as a wave moving out from the mark. */
function AgentStateful({ risky, checked, delay }) {
  const [c, setC] = useState(checked);
  useEffect(() => {
    if (!checked) { setC(false); return undefined; }
    const t = setTimeout(() => setC(true), delay);
    return () => clearTimeout(t);
  }, [checked, delay]);
  return <Agent risky={risky} checked={c} />;
}
