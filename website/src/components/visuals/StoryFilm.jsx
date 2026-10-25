import { useEffect, useRef, useState } from 'react';
import { useScript, SvgLogo, cx } from './kit.jsx';

/* "Every action starts with an identity": a short film in the site's cover
   language (flat navy, big type, brand marks, coral for risk). One idea per
   scene. ~22 s loop, plays only while in view. */
const SCENES = [
  { dur: 2800, head: ['Every action starts', 'with an identity.'] },
  { dur: 3000, head: ['One person.'] },
  { dur: 3800, head: ['creates keys, roles', 'and tokens.'] },
  { dur: 3800, head: ['that power hundreds', 'of AI agents.'] },
  { dur: 6000, head: ['Deep Algorithms checks', 'every one, continuously.'] },
  { dur: 3000, head: [] },
  { dur: 3400, head: [] },
];

// Deterministic jitter so prerender and hydration agree.
const rnd = (i, k) => { const x = Math.sin(i * 97.13 + k * 13.7) * 43758.5453; return x - Math.floor(x); };
const MARK = { x: 800, y: 462 };
const PERSON = { x: 230, y: 462 };
const KEYS = [['okta', 'OAuth app'], ['aws', 'IAM role'], ['github', 'Access token'], ['snowflake', 'Service account'], ['gitlab', 'Deploy key'], ['atlassian', 'API key']];
const LOGOS = ['claude', 'copilot', 'cursor', 'gemini', 'n8n', 'zapier', 'langgraph', 'mcp', 'kubernetes', 'gitlab', 'github', 'terraform', 'jira', 'okta', 'snowflake', 'databricks', 'aws', 'google', 'atlassian', 'cloudflare'];
const RISKS = { 2: 'Over-privileged', 7: 'No owner', 11: 'Exposed key', 15: 'Stale token' };
const AGENTS = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
  const i = r * 6 + c, x = 500 + c * 128 + (rnd(i, 1) - 0.5) * 18, y = 312 + r * 106 + (rnd(i, 2) - 0.5) * 12;
  if (Math.hypot(x - MARK.x, y - MARK.y) > 95) AGENTS.push({ n: AGENTS.length, logo: LOGOS[i % LOGOS.length], x, y });
}

const tr = (x, y, s = 1) => ({ transform: `translate(${x}px, ${y}px) scale(${s})` });
const fade = (on, extra) => ({ opacity: on ? 1 : 0, transition: 'opacity .8s ease, transform 1.1s cubic-bezier(.65,0,.35,1)', ...extra });

function Spark({ x, y, s = 1, c = '#ff8d77' }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} fill={c} d="M0 -22 C2 -9 9 -2 22 0 C9 2 2 9 0 22 C-2 9 -9 2 -22 0 C-9 -2 -2 -9 0 -22Z" />;
}
function GlassTile({ logo, size = 76, ring }) {
  const h = size / 2;
  return (
    <g filter="url(#film-shadow)">
      <rect x={-h} y={-h} width={size} height={size} rx={size * 0.26} fill="#fff" stroke={ring || 'none'} strokeWidth="5" />
      <SvgLogo name={logo} x={-size * 0.29} y={-size * 0.29} size={size * 0.58} />
    </g>
  );
}

/* One agent: idle -> (risky only) alert with a label -> checked. The scan
   reaches each one after a delay proportional to its distance from the mark. */
function Agent({ a, active, runs }) {
  const risk = RISKS[a.n];
  const [phase, setPhase] = useState(active ? 'ok' : 'idle');
  const d = Math.hypot(a.x - MARK.x, a.y - MARK.y);
  useEffect(() => {
    if (!active) { setPhase('idle'); return undefined; }
    if (!runs) return undefined;
    const t1 = setTimeout(() => setPhase(risk ? 'alert' : 'ok'), 700 + d * 3.2);
    const t2 = risk ? setTimeout(() => setPhase('ok'), 700 + d * 3.2 + 1500) : null;
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [active, runs, risk, d]);
  const w = risk ? 44 + risk.length * 8.6 : 0;
  return (
    <g>
      <GlassTile logo={a.logo} size={78} ring={risk && phase === 'alert' ? '#f0644d' : undefined} />
      {phase === 'ok' && active && <g transform="translate(34 -34)" style={{ animation: 'fadein .5s both' }}><circle r="15" fill="#3fc58a" stroke="#0a2a5e" strokeWidth="4" /><path d="M-6 0.5l4 4 8.5-9" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>}
      {risk && phase === 'alert' && (
        <g transform="translate(0 -68)" style={{ animation: 'fadein .35s both' }}>
          <rect x={-w / 2} y="-18" width={w} height="36" rx="18" fill="#f0644d" />
          <circle cx={-w / 2 + 20} r="5.5" fill="#fff" />
          <text x={-w / 2 + 34} y="6" fontSize="18" fontWeight="600" fill="#fff">{risk}</text>
        </g>
      )}
    </g>
  );
}

export default function StoryFilm({ className }) {
  const box = useRef(null);
  const { i: s, reduce } = useScript(SCENES, box, 4);
  const runs = useRef(0);
  const prev = useRef(s);
  if (s === 4 && prev.current !== 4) runs.current += 1;
  prev.current = s;

  const person = s === 1 ? tr(640, 440, 1.25) : s >= 2 && s <= 4 ? tr(PERSON.x, PERSON.y) : tr(640, 440, 0.7);
  return (
    <div ref={box} className={cx('relative overflow-hidden rounded-[28px] bg-navy', className)}>
      <svg viewBox="0 0 1280 720" className="block h-auto w-full" role="img"
        aria-label="Short animation: every action starts with an identity. One person creates keys, roles and tokens that power hundreds of AI agents. Deep Algorithms checks every one, continuously, and flags risks such as an over-privileged agent or an exposed key. Every identity known, every action verified.">
        <style>{'text{font-family:"Inter Variable",sans-serif} .disp{font-family:"Hanken Grotesk Variable",sans-serif;font-weight:300;letter-spacing:-1.5px}'}</style>
        <defs>
          <linearGradient id="film-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10408a" /><stop offset="1" stopColor="#0a2a5e" /></linearGradient>
          <filter id="film-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="12" floodColor="#020b1d" floodOpacity=".4" /></filter>
        </defs>
        <rect width="1280" height="720" fill="url(#film-bg)" />
        <g fill="none" stroke="#fff" strokeOpacity=".08">{[220, 360, 520].map((r) => <circle key={r} cx="640" cy="360" r={r} />)}</g>
        <Spark x="130" y="120" s="1.1" /><Spark x="1160" y="110" s="0.8" c="#7fb8ff" /><Spark x="1190" y="610" s="1" /><Spark x="90" y="600" s="0.7" c="#7fb8ff" />

        {/* Headlines: one per scene, top centre, second line in coral */}
        {SCENES.map((sc, k) => sc.head.length > 0 && (
          <g key={k} className="disp" textAnchor="middle" style={{ opacity: s === k ? 1 : 0, transition: 'opacity .7s ease, transform .9s cubic-bezier(.2,.7,.2,1)', transform: `translateY(${s === k ? 0 : 14}px)` }}>
            {k === 0 ? (
              <>
                <text x="640" y="470" fontSize="76" fill="#fff">{sc.head[0]}</text>
                <text x="640" y="560" fontSize="76" fill="#ff8d77">{sc.head[1]}</text>
              </>
            ) : sc.head.length === 1 ? (
              <text x="640" y="150" fontSize="84" fill="#fff">{sc.head[0]}</text>
            ) : (
              <>
                <text x="640" y="120" fontSize="64" fill="#fff">{sc.head[0]}</text>
                <text x="640" y="192" fontSize="64" fill="#ff8d77">{sc.head[1]}</text>
              </>
            )}
          </g>
        ))}

        {/* Scene 0: the mark */}
        <g style={fade(s === 0, tr(640, 290))}>
          <rect x="-62" y="-62" width="124" height="124" rx="32" fill="#fff" filter="url(#film-shadow)" />
          <image href="/brand/mark.png" x="-35" y="-37" width="70" height="74" />
        </g>

        {/* Person */}
        <g style={fade(s >= 1 && s <= 4, person)}>
          <g filter="url(#film-shadow)">
            <rect x="-150" y="-54" width="300" height="108" rx="30" fill="#fff" />
            <circle cx="-96" r="32" fill="#c4520a" /><text x="-96" y="9" textAnchor="middle" fontSize="23" fontWeight="600" fill="#fff">KR</text>
            <text x="-52" y="-4" fontSize="24" fontWeight="600" fill="#0b1220">Kavya Reddy</text>
            <text x="-52" y="26" fontSize="18" fill="#5c6777">Treasury analyst</text>
          </g>
        </g>

        {/* Scene 2: keys, roles and tokens drawn out of the person */}
        {KEYS.map(([logo, label], n) => {
          const y = 300 + n * 74, x = 600 + (n % 2) * 60;
          const on = s === 2;
          return (
            <g key={logo}>
              <path d={`M${PERSON.x + 150} ${PERSON.y} C ${PERSON.x + 290} ${PERSON.y} ${x - 190} ${y} ${x - 46} ${y}`} fill="none" stroke="#7fb8ff" strokeOpacity=".55" strokeWidth="2.5" pathLength="1" strokeDasharray="1" strokeDashoffset={on ? 0 : 1} style={{ transition: `stroke-dashoffset .9s ease ${n * 100}ms, opacity .5s`, opacity: on ? 1 : 0 }} />
              <g style={fade(on, { ...tr(x, y, on ? 1 : 0.4), transitionDelay: `${n * 100}ms` })}>
                <GlassTile logo={logo} size={64} />
                <text x="50" y="7" fontSize="21" fill="#e6f0fa">{label}</text>
              </g>
            </g>
          );
        })}

        {/* Scene 3+: the agents they power */}
        {AGENTS.map((a) => {
          const on = s >= 3 && s <= 4;
          return (
            <g key={a.n} style={fade(on, { ...tr(a.x, a.y + 16, on ? 1 : 0.3), transitionDelay: s === 3 ? `${a.n * 55}ms` : '0ms' })}>
              <g className={on ? 'story-float' : ''} style={{ animationDelay: `${-a.n * 0.41}s` }}><Agent a={a} active={s === 4} runs={runs.current} /></g>
            </g>
          );
        })}

        {/* Scene 4: Deep Algorithms scans outward from the mark */}
        <g style={fade(s === 4, tr(MARK.x, MARK.y + 16))}>
          {s === 4 && <circle r="560" fill="none" stroke="#5cc2ff" strokeWidth="4" className="story-ring" opacity="0" key={runs.current} />}
          <circle r="70" fill="rgba(92,194,255,.2)" />
          <rect x="-50" y="-50" width="100" height="100" rx="26" fill="#fff" filter="url(#film-shadow)" />
          <image href="/brand/mark.png" x="-28" y="-30" width="56" height="60" />
        </g>

        {/* Scene 5: message */}
        <g style={{ opacity: s === 5 ? 1 : 0, transition: 'opacity .6s' }}>
          <rect width="1280" height="720" fill="#c0402a" />
          <g fill="none" stroke="#fff" strokeOpacity=".14">{[220, 360, 520].map((r) => <circle key={r} cx="640" cy="360" r={r} />)}</g>
          <Spark x="170" y="150" c="#fff" /><Spark x="1120" y="570" s="1.2" c="#fff" /><Spark x="1100" y="150" s="0.7" c="#fff" />
          <text className="disp" x="640" y="340" textAnchor="middle" fontSize="84" fill="#fff">Every identity known.</text>
          <text className="disp" x="640" y="440" textAnchor="middle" fontSize="84" fill="#fff">Every action verified.</text>
        </g>

        {/* Scene 6: brand */}
        <g style={{ opacity: s === 6 ? 1 : 0, transition: 'opacity .6s' }}>
          <rect width="1280" height="720" fill="url(#film-bg)" />
          <image href="/brand/logo-lockup-inverse.png" x="410" y="250" width="460" height="102" style={{ filter: 'brightness(0) invert(1)' }} />
          <text className="disp" x="640" y="440" textAnchor="middle" fontSize="46" fill="#fff">Identity Security for the AI Era</text>
        </g>
      </svg>
      {reduce && <span className="sr-only">Animation paused because reduced motion is on.</span>}
    </div>
  );
}
