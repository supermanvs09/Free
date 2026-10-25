import { useEffect, useRef, useState } from 'react';
import { useScript, useReducedMotion, SvgLogo, cx } from './kit.jsx';

/* "See identity security in 25 seconds": one argument in five beats.
   1. The AI era runs on identity.   2. Most of it isn't human.
   3. They hold keys nobody owns.     4. Attackers log in, they don't break in.
   5. Deep Algorithms finds the risk and fixes it before it is used.
   Sample data. Plays only while in view; reduced motion shows the final frame. */
const SCENES = [
  { dur: 3000, head: ['The AI era runs', 'on identity.'] },
  { dur: 4200, head: ['Most of it', 'isn’t human.'] },
  { dur: 4200, head: ['They hold the keys.', 'Nobody owns them.'] },
  { dur: 4800, head: ['Attackers don’t break in.', 'They log in.'] },
  { dur: 4800, head: ['Deep Algorithms sees', 'every identity.'] },
  { dur: 5200, head: ['Finds the risk. Fixes it', 'before it’s used.'] },
  { dur: 3200, head: [] },
  { dur: 3800, head: [] },
];
const LAST = 5; // final meaningful frame, shown for reduced motion and prerender

const IDS = [
  ['aws', 'svc-payments'], ['github', 'deploy-bot'], ['copilot', 'invoice-agent'],
  ['cursor', 'release-agent'], ['langgraph', 'kyc-agent'], ['aws', 'kyc-sync-fn'],
  ['claude', 'hr-assistant'], ['n8n', 'support-triage'], ['snowflake', 'data-sync'],
  ['gitlab', 'ci-runner'], ['zapier', 'crm-export'], ['databricks', 'ledger-etl'],
];
// index -> [risk label, fix label]
const RISK = { 0: ['Admin access, 3% used', 'Least privilege applied'], 1: ['Key 412 days old', 'Key rotated'], 2: ['No owner', 'Owner assigned'], 10: ['Exposed in code', 'Secret removed'] };
const COLX = [595, 845, 1095], ROW0 = 300, ROWH = 98;
const pos = (i) => ({ x: COLX[i % 3], y: ROW0 + Math.floor(i / 3) * ROWH });
const MARK = { x: 250, y: 470 };
const PERSON_X = 250;

const fade = (on, extra) => ({ opacity: on ? 1 : 0, transition: 'opacity .7s ease, transform 1s cubic-bezier(.65,0,.35,1)', ...extra });
const tr = (x, y, s = 1) => ({ transform: `translate(${x}px, ${y}px) scale(${s})` });

function Spark({ x, y, s = 1, c = '#ff8d77' }) {
  return <path transform={`translate(${x} ${y}) scale(${s})`} fill={c} d="M0 -22 C2 -9 9 -2 22 0 C9 2 2 9 0 22 C-2 9 -9 2 -22 0 C-9 -2 -2 -9 0 -22Z" />;
}
function Tile({ logo, size = 44 }) {
  const h = size / 2;
  return (<g><rect x={-h} y={-h} width={size} height={size} rx={size * 0.26} fill="#fff" /><SvgLogo name={logo} x={-size * 0.3} y={-size * 0.3} size={size * 0.6} /></g>);
}

/* Time since the current scene began, in ms. Large when idle so a still frame
   (prerender, reduced motion) shows every effect completed. */
function useSceneClock(scene, reduce) {
  const [t, setT] = useState(99999);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    if (reduce) { setT(99999); return undefined; }
    setT(0);
    const start = performance.now();
    const id = setInterval(() => setT(performance.now() - start), 80);
    const stop = setTimeout(() => { clearInterval(id); setT(99999); }, 8000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [scene, reduce]);
  return t;
}

function IdChip({ i, s, t }) {
  const [logo, name] = IDS[i];
  const { x, y } = pos(i);
  const risk = RISK[i];
  const shown = s === 1 ? t > 250 + i * 190 : s === 2 || s === 4 || s === 5;
  // dimming of non-risky chips while the story talks about the risky ones
  const dim = s === 2 && !risk;
  // scan wave: reaches a chip after a delay proportional to distance from the mark
  const wave = 400 + Math.hypot(x - MARK.x, y - MARK.y) * 2.4;
  const scanned = s === 4 ? t > wave : s === 5;
  const flagged = risk && ((s === 2 && t > 700 + i * 120) || (s === 4 && scanned) || (s === 5 && t < 900 + Object.keys(RISK).indexOf(String(i)) * 700));
  const fixed = risk && s === 5 && t >= 900 + Object.keys(RISK).indexOf(String(i)) * 700;
  const ring = fixed ? '#3fc58a' : flagged ? '#f0644d' : 'none';
  const w = 232;
  return (
    <g style={fade(shown, { ...tr(x, y, shown ? 1 : 0.85), opacity: shown ? (dim ? 0.38 : 1) : 0 })}>
      <g filter="url(#film-shadow)">
        <rect x={-w / 2} y="-30" width={w} height="60" rx="20" fill="#fff" stroke={ring} strokeWidth="4" style={{ transition: 'stroke .4s' }} />
        <g transform="translate(-78 0)"><Tile logo={logo} size={44} /></g>
        <text x="-46" y="7" fontSize="19" fontWeight="600" fill="#0b1220">{name}</text>
      </g>
      {scanned && !risk && s >= 4 && (<g transform="translate(106 -28)" style={{ animation: 'fadein .5s both' }}><circle r="12" fill="#3fc58a" stroke="#0a2a5e" strokeWidth="3.5" /><path d="M-5 0.5l3.2 3.2 7-7.4" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>)}
      {fixed && (<g transform="translate(106 -28)" style={{ animation: 'fadein .5s both' }}><circle r="12" fill="#3fc58a" stroke="#0a2a5e" strokeWidth="3.5" /><path d="M-5 0.5l3.2 3.2 7-7.4" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>)}
      {risk && (flagged || fixed) && (() => {
        const label = fixed ? risk[1] : risk[0];
        const lw = 52 + label.length * 8.6;
        return (
          <g transform="translate(0 52)" style={{ animation: 'fadein .4s both' }} key={fixed ? 'f' : 'r'}>
            <rect x={-lw / 2} y="-17" width={lw} height="34" rx="17" fill={fixed ? '#1f9d63' : '#f0644d'} />
            <circle cx={-lw / 2 + 19} r="5" fill="#fff" />
            <text x={-lw / 2 + 33} y="6" fontSize="17" fontWeight="600" fill="#fff">{label}</text>
          </g>
        );
      })()}
    </g>
  );
}

export default function StoryFilm({ className }) {
  const box = useRef(null);
  const reduce = useReducedMotion();
  const { i: s } = useScript(SCENES, box, LAST);
  const t = useSceneClock(s, reduce);
  const count = s === 1 ? Math.min(12, Math.max(0, Math.floor((t - 250) / 190) + 1)) : 12;
  const sweep = useRef(0);
  const prev = useRef(s);
  if (s === 4 && prev.current !== 4) sweep.current += 1;
  prev.current = s;

  return (
    <div ref={box} className={cx('relative overflow-hidden rounded-[28px] bg-navy', className)}>
      <svg viewBox="0 0 1280 720" className="block h-auto w-full" role="img"
        aria-label="Short animation. The AI era runs on identity. Most identities are not human: one person is surrounded by machine identities and AI agents. Some hold keys nobody owns. Attackers do not break in, they log in, and no alert is raised. Deep Algorithms sees every identity, finds the risk and fixes it before it is used: access reduced to least privilege, a key rotated, an owner assigned, a secret removed from code.">
        <style>{'text{font-family:"Inter Variable",sans-serif} .disp{font-family:"Hanken Grotesk Variable",sans-serif;font-weight:300;letter-spacing:-1.5px}'}</style>
        <defs>
          <linearGradient id="film-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#10408a" /><stop offset="1" stopColor="#0a2a5e" /></linearGradient>
          <filter id="film-shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="12" stdDeviation="12" floodColor="#020b1d" floodOpacity=".4" /></filter>
        </defs>
        <rect width="1280" height="720" fill="url(#film-bg)" />
        <g fill="none" stroke="#fff" strokeOpacity=".08">{[220, 360, 520].map((r) => <circle key={r} cx="640" cy="360" r={r} />)}</g>
        <Spark x="130" y="120" s="1.1" /><Spark x="1160" y="110" s="0.8" c="#7fb8ff" /><Spark x="1190" y="640" s="1" /><Spark x="90" y="630" s="0.7" c="#7fb8ff" />

        {/* Headlines: one per scene */}
        {SCENES.map((sc, k) => sc.head.length > 0 && (
          <g key={k} className="disp" textAnchor="middle" style={{ opacity: s === k ? 1 : 0, transition: 'opacity .6s ease, transform .8s cubic-bezier(.2,.7,.2,1)', transform: `translateY(${s === k ? 0 : 14}px)` }}>
            {k === 0 ? (
              <><text x="640" y="450" fontSize="84" fill="#fff">{sc.head[0]}</text><text x="640" y="548" fontSize="84" fill="#ff8d77">{sc.head[1]}</text></>
            ) : (
              <><text x="640" y="118" fontSize="68" fill="#fff">{sc.head[0]}</text><text x="640" y="196" fontSize="68" fill="#ff8d77">{sc.head[1]}</text></>
            )}
          </g>
        ))}

        {/* Beat 1: the mark */}
        <g style={fade(s === 0, tr(640, 280))}>
          <rect x="-62" y="-62" width="124" height="124" rx="32" fill="#fff" filter="url(#film-shadow)" />
          <image href="/brand/mark.png" x="-35" y="-37" width="70" height="74" />
        </g>

        {/* Beats 2-3: one person, many machine identities */}
        <g style={fade(s === 1 || s === 2, tr(PERSON_X, MARK.y, s === 2 ? 0.9 : 1))} opacity={s === 2 ? 0.55 : 1}>
          <g filter="url(#film-shadow)">
            <rect x="-150" y="-54" width="300" height="108" rx="30" fill="#fff" />
            <circle cx="-96" r="32" fill="#c4520a" /><text x="-96" y="9" textAnchor="middle" fontSize="23" fontWeight="600" fill="#fff">KR</text>
            <text x="-52" y="-4" fontSize="24" fontWeight="600" fill="#0b1220">Kavya Reddy</text>
            <text x="-52" y="26" fontSize="18" fill="#5c6777">Treasury analyst</text>
          </g>
          <text y="104" textAnchor="middle" fontSize="26" fill="#e6f0fa">1 person</text>
        </g>
        <g style={fade(s === 1 || s === 2, {})}>
          <text x="845" y="262" textAnchor="middle" fontSize="27" fill="#e6f0fa"><tspan fontWeight="700" fill="#ff8d77" fontSize="30">{count}</tspan> machine identities and AI agents</text>
        </g>
        {IDS.map((_, i) => <IdChip key={i} i={i} s={s} t={t} />)}

        {/* Beat 4: a login that raises no alert */}
        <g style={fade(s === 3, tr(0, 0))}>
          <g filter="url(#film-shadow)" transform="translate(180 270)">
            <rect width="620" height="330" rx="30" fill="#fff" />
            <g transform="translate(60 70)"><Tile logo="okta" size={56} /></g>
            <text x="108" y="64" fontSize="28" fontWeight="600" fill="#0b1220">Kavya Reddy signed in</text>
            <text x="108" y="94" fontSize="21" fill="#5c6777">Mumbai · managed laptop · 09:12</text>
            <rect x="460" y="46" width="112" height="38" rx="19" fill="#e4f4ea" /><text x="516" y="72" textAnchor="middle" fontSize="18" fontWeight="600" fill="#17703c">MFA passed</text>
            <line x1="40" x2="580" y1="140" y2="140" stroke="#e3e7ed" />
            <g style={{ opacity: s === 3 && t > 1300 ? 1 : 0, transition: 'opacity .6s' }}>
              <g transform="translate(60 214)"><Tile logo="okta" size={56} /></g>
              <text x="108" y="208" fontSize="28" fontWeight="600" fill="#0b1220">Kavya Reddy signed in</text>
              <text x="108" y="238" fontSize="21" fill="#5c6777">Lagos · new device · 09:14</text>
              <rect x="460" y="190" width="112" height="38" rx="19" fill="#e4f4ea" /><text x="516" y="216" textAnchor="middle" fontSize="18" fontWeight="600" fill="#17703c">MFA passed</text>
            </g>
          </g>
          <g style={{ opacity: s === 3 && t > 2400 ? 1 : 0, transition: 'opacity .7s, transform .8s', transform: s === 3 && t > 2400 ? 'none' : 'translateY(14px)' }}>
            <text x="1010" y="440" textAnchor="middle" className="disp" fontSize="150" fill="#fff">0</text>
            <text x="1010" y="500" textAnchor="middle" fontSize="30" fill="#ff8d77">alerts raised</text>
            <text x="1010" y="540" textAnchor="middle" fontSize="21" fill="#cfe0f5">The attacker simply logged in.</text>
          </g>
        </g>

        {/* Beats 5-6: Deep Algorithms scans, then fixes */}
        <g style={fade(s === 4 || s === 5, tr(MARK.x, MARK.y))}>
          {s === 4 && <circle r="900" fill="none" stroke="#5cc2ff" strokeWidth="4" className="story-ring" opacity="0" key={sweep.current} />}
          <circle r="86" fill="rgba(92,194,255,.2)" />
          <rect x="-62" y="-62" width="124" height="124" rx="32" fill="#fff" filter="url(#film-shadow)" />
          <image href="/brand/mark.png" x="-35" y="-37" width="70" height="74" />
          <text y="112" textAnchor="middle" fontSize="26" fill="#e6f0fa">Deep Algorithms</text>
        </g>

        {/* Message */}
        <g style={{ opacity: s === 6 ? 1 : 0, transition: 'opacity .6s' }}>
          <rect width="1280" height="720" fill="#c0402a" />
          <g fill="none" stroke="#fff" strokeOpacity=".14">{[220, 360, 520].map((r) => <circle key={r} cx="640" cy="360" r={r} />)}</g>
          <Spark x="170" y="150" c="#fff" /><Spark x="1120" y="570" s="1.2" c="#fff" /><Spark x="1100" y="150" s="0.7" c="#fff" />
          <text className="disp" x="640" y="330" textAnchor="middle" fontSize="88" fill="#fff">Every identity known.</text>
          <text className="disp" x="640" y="432" textAnchor="middle" fontSize="88" fill="#fff">Every action verified.</text>
        </g>

        {/* Brand */}
        <g style={{ opacity: s === 7 ? 1 : 0, transition: 'opacity .6s' }}>
          <rect width="1280" height="720" fill="url(#film-bg)" />
          <image href="/brand/logo-lockup-inverse.png" x="410" y="236" width="460" height="102" style={{ filter: 'brightness(0) invert(1)' }} />
          <text className="disp" x="640" y="430" textAnchor="middle" fontSize="52" fill="#fff">Identity Security for the AI Era</text>
          <text className="disp" x="640" y="500" textAnchor="middle" fontSize="40" fill="#ff8d77">Secure the future. Today.</text>
        </g>
      </svg>
      {reduce && <span className="sr-only">Animation paused because reduced motion is on.</span>}
    </div>
  );
}

