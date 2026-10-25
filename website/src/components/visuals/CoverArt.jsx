import { createContext, useContext, useId } from 'react';
import { Bank, FirstAidKit, Buildings, Browsers } from '@phosphor-icons/react/dist/ssr';
import { SvgLogo, cx } from './kit.jsx';

/* Research covers, in the style of astrix.security's "Learn more" cards:
   a flat brand-colour field, one bold subject taken from the story (a real
   brand mark, a glossy chip, our own agent mascot), two lines of big type,
   thin rings and four-point sparkles. Text is drawn inside the SVG so the
   card scales as one piece; the card is decorative, the title sits below it. */
const Ids = createContext('');
const BG = {
  navy: ['#10408a', '#0a2a5e'],
  ink: ['#0c2447', '#06132b'],
  blue: ['#2a82e6', '#1666c8'],
  coral: ['#d9553a', '#a8341d'],
};
const FONT = { fontFamily: '"Hanken Grotesk Variable", "Inter Variable", sans-serif' };
const ACCENT = '#ff8d77';

const Sparkle = ({ x, y, s = 1, c = '#ff8d77', o = 1 }) => (
  <path transform={`translate(${x} ${y}) scale(${s})`} opacity={o} fill={c} d="M0 -22 C2 -9 9 -2 22 0 C9 2 2 9 0 22 C-2 9 -9 2 -22 0 C-9 -2 -2 -9 0 -22Z" />
);
const Rings = ({ cx: x = 400, cy: y = 250, o = 0.12 }) => (
  <g fill="none" stroke="#fff" strokeOpacity={o}>{[150, 235, 330].map((r) => <circle key={r} cx={x} cy={y} r={r} />)}</g>
);
const Lines = ({ a, b, y: y0 = 300, size: sz = 56, bColor = ACCENT, bSize }) => {
  const y = +y0, size = +sz;
  return (
  <g textAnchor="middle" style={FONT}>
    <text x="400" y={y} fontSize={size} fill="#fff" fontWeight="400" letterSpacing="-1.2">{a}</text>
    {b && <text x="400" y={y + size * 1.12} fontSize={bSize || size} fill={bColor} fontWeight="400" letterSpacing="-1.2">{b}</text>}
  </g>
  );
};
const Tile = ({ name, x, y, size = 110, ghost }) => {
  const id = useContext(Ids);
  return (
  <g filter={`url(#cv-shadow${id})`}>
    <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={size * 0.26} fill="#fff" fillOpacity={ghost ? 0.9 : 1} />
    <SvgLogo name={name} x={x - size * 0.3} y={y - size * 0.3} size={size * 0.6} />
  </g>
  );
};
const Ghost = ({ name, x, y, size, o = 0.16 }) => <SvgLogo name={name} x={x - size / 2} y={y - size / 2} size={size} fill="#fff" opacity={o} />;
const Chip = ({ text, x: x0 = 400, y: y0 = 200, w: w0 = 360, h: h0 = 108, size: sz }) => {
  const id = useContext(Ids);
  const x = +x0, y = +y0, w = +w0, h = +h0, size = sz && +sz;
  return (
  <g filter={`url(#cv-shadow${id})`}>
    <rect x={x - w / 2} y={y - h / 2 + 12} width={w} height={h} rx={h / 2} fill="#1b4fa3" />
    <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2} fill={`url(#cv-chip${id})`} />
    <text x={x} y={y + (size || h * 0.5) * 0.34} textAnchor="middle" fontSize={size || h * 0.5} fill="#0f56b8" fontWeight="500" letterSpacing="-1.5" style={FONT}>{text}</text>
  </g>
  );
};
const XMark = ({ x, y, s = 1 }) => <path transform={`translate(${x} ${y}) scale(${s})`} d="M-26 -26 L26 26 M26 -26 L-26 26" stroke="#ff5a43" strokeWidth="11" strokeLinecap="round" />;
const Check = ({ x, y }) => <g transform={`translate(${x} ${y})`}><circle r="22" fill="#3fc58a" stroke="#fff" strokeWidth="5" /><path d="M-9 1 l6 7 13 -15" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>;

/* Our agent mascot: a friendly coral bot, the same character every cover can reuse. */
const Mascot = ({ x = 400, y = 160, s = 1, shades }) => {
  const id = useContext(Ids);
  const bot = `url(#cv-bot${id})`;
  return (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cy="86" rx="62" ry="10" fill="#000" opacity=".22" />
    <path d="M0 -62 V-84" stroke="#ff8d77" strokeWidth="5" strokeLinecap="round" /><circle cy="-88" r="9" fill="#ffc2b6" />
    <ellipse cx="-70" cy="14" rx="17" ry="22" fill={bot} /><ellipse cx="70" cy="14" rx="17" ry="22" fill={bot} />
    <rect x="-64" y="-62" width="128" height="140" rx="62" fill={bot} />
    <rect x="-34" y="76" width="22" height="16" rx="8" fill="#e5533b" /><rect x="12" y="76" width="22" height="16" rx="8" fill="#e5533b" />
    {shades ? <path d="M-46 -14 H46 a6 6 0 0 1 0 12 H34 a22 22 0 0 1 -44 0 h-2 a22 22 0 0 1 -44 0 h-2 a6 6 0 0 1 0 -12Z" fill="#0a1f3d" /> : <><ellipse cx="-24" cy="-8" rx="9" ry="12" fill="#0a1f3d" /><ellipse cx="24" cy="-8" rx="9" ry="12" fill="#0a1f3d" /></>}
    <path d="M-16 28 Q0 40 16 28" stroke="#0a1f3d" strokeWidth="5" fill="none" strokeLinecap="round" />
    <ellipse cx="-30" cy="-40" rx="22" ry="12" fill="#fff" opacity=".28" transform="rotate(-24 -30 -40)" />
  </g>
  );
};

const Shield = () => {
  const id = useContext(Ids);
  return (
    <g transform="translate(400 112) scale(.9)" filter={`url(#cv-shadow${id})`}><path d="M0 -72 L64 -50 V10 C64 46 30 66 0 78 C-30 66 -64 46 -64 10 V-50Z" fill="#fff" /><path d="M-26 4 l16 18 36 -42" fill="none" stroke="#1a63c8" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" /></g>
  );
};
const Terminal = () => {
  const id = useContext(Ids);
  return (
    <g filter={`url(#cv-shadow${id})`}>
      <rect x="230" y="50" width="340" height="150" rx="18" fill="#0a1830" stroke="#27456f" strokeWidth="2" />
      <circle cx="256" cy="76" r="6" fill="#ff5a43" /><circle cx="278" cy="76" r="6" fill="#f2b04a" /><circle cx="300" cy="76" r="6" fill="#3fc58a" />
      <g style={{ fontFamily: 'ui-monospace, Menlo, monospace' }} fontSize="22"><text x="256" y="124" fill="#7fb8ff">$ whoami</text><text x="256" y="156" fill="#fff">trusted-user</text><text x="256" y="188" fill={ACCENT}>$ _</text></g>
    </g>
  );
};

const IconTile = ({ Icon, x = 400, y = 125, size = 132, color = '#0f56b8' }) => {
  const id = useContext(Ids);
  return (
    <g filter={`url(#cv-shadow${id})`}>
      <rect x={x - size / 2} y={y - size / 2} width={size} height={size} rx={size * 0.26} fill="#fff" />
      <Icon x={x - size * 0.31} y={y - size * 0.31} size={size * 0.62} color={color} weight="duotone" />
    </g>
  );
};

const SCENES = {
  bfsi: { bg: 'navy', el: (<><Sparkle x="150" y="110" /><Sparkle x="660" y="100" s="0.8" c="#7fb8ff" /><Sparkle x="700" y="230" s="0.7" /><IconTile Icon={Bank} /><Lines a="Mules stopped" b="at the payee." y="300" size="56" /></>) },
  healthcare: { bg: 'blue', el: (<><Sparkle x="150" y="110" c="#fff" /><Sparkle x="660" y="100" s="0.8" c="#fff" o=".85" /><Sparkle x="700" y="230" s="0.7" c="#fff" o=".8" /><IconTile Icon={FirstAidKit} /><Lines a="Know who opened" b="every patient record." y="300" size="52" bColor="#fff" /></>) },
  government: { bg: 'ink', el: (<><Sparkle x="150" y="110" /><Sparkle x="660" y="100" s="0.8" c="#7fb8ff" /><Sparkle x="700" y="230" s="0.7" /><IconTile Icon={Buildings} /><Lines a="Citizen services" b="that stay online." y="300" size="54" /></>) },
  'digital-platforms': { bg: 'navy', el: (<><Sparkle x="150" y="110" /><Sparkle x="660" y="100" s="0.8" c="#7fb8ff" /><Sparkle x="700" y="230" s="0.7" /><IconTile Icon={Browsers} /><Lines a="Bots stopped." b="Agents governed." y="300" size="56" /></>) },
  'identity-security': { bg: 'navy', el: (<>
    <Sparkle x="170" y="110" s="0.9" /><Sparkle x="640" y="90" s="0.7" c="#7fb8ff" /><Sparkle x="690" y="210" s="1" /><Sparkle x="110" y="250" s="0.6" c="#7fb8ff" />
    <Tile name="okta" x="400" y="125" size="132" /><Check x="466" y="69" />
    <Lines a="0 alerts raised." b="They just logged in." y="300" size="56" />
  </>) },
  'ai-security-intelligence': { bg: 'blue', el: (<>
    <Ghost name="claude" x="400" y="150" size="270" o=".2" /><Ghost name="copilot" x="150" y="400" size="120" o=".16" /><Ghost name="gemini" x="650" y="390" size="130" o=".16" />
    <Sparkle x="140" y="120" s="1" c="#fff" /><Sparkle x="670" y="130" s="0.7" c="#fff" o=".8" /><Sparkle x="690" y="300" s="0.9" c="#fff" o=".9" />
    <Chip text="Authority" y="290" w="430" h="120" size="64" />
  </>) },
  'threat-intelligence': { bg: 'ink', el: (<>
    <path d="M40 70 C 220 20 360 100 520 50 S 700 40 770 90" fill="none" stroke="#ff8d77" strokeWidth="3" strokeDasharray="10 10" opacity=".55" />
    <Sparkle x="130" y="110" s="0.8" /><Sparkle x="680" y="120" s="1" c="#7fb8ff" />
    <Chip text="Aflac Japan breach" y="120" w="430" h="68" size="32" />
    <g textAnchor="middle" style={FONT}><text x="400" y="290" fontSize="108" fill="#fff" letterSpacing="-3">15 days</text><text x="400" y="355" fontSize="46" fill={ACCENT} letterSpacing="-1">before containment.</text></g>
  </>) },
  'ai-agent-governance': { bg: 'navy', el: (<>
    <Sparkle x="140" y="100" s="0.9" /><Sparkle x="670" y="100" s="0.7" c="#7fb8ff" /><Sparkle x="700" y="230" s="0.9" />
    <Tile name="m365" x="320" y="125" size="118" /><Tile name="copilot" x="480" y="125" size="118" />
    <path d="M382 125 H418" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity=".7" />
    <Lines a="12 seconds." b="Three years of data." y="300" size="56" />
  </>) },
  'ai-security': { bg: 'blue', el: (<>
    <Rings o=".2" /><Sparkle x="150" y="110" c="#fff" /><Sparkle x="660" y="100" s="0.7" c="#fff" /><Sparkle x="700" y="260" s="0.9" c="#fff" o=".85" /><Sparkle x="110" y="260" s="0.6" c="#fff" o=".8" />
    <Mascot x="400" y="128" s="0.95" />
    <Lines a="Beyond access." b="A new security boundary." y="305" size="56" bColor="#fff" bSize="36" />
  </>) },
  'india-mule-account-crisis': { bg: 'coral', el: (<>
    <Sparkle x="130" y="110" c="#fff" o=".9" /><Sparkle x="680" y="100" s="0.7" c="#fff" o=".9" />
    <path d="M250 145 L360 215 M400 140 V205 M550 145 L440 215" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".5" strokeDasharray="2 10" />
    <Tile name="phonepe" x="230" y="95" size="92" /><Tile name="paytm" x="400" y="85" size="92" /><Tile name="razorpay" x="570" y="95" size="92" />
    <Chip text="26.5 lakh" y="260" w="430" h="108" size="62" />
    <g textAnchor="middle" style={FONT}><text x="400" y="378" fontSize="40" fill="#fff" letterSpacing="-0.6">mule accounts identified</text></g>
  </>) },
  'mythos-ai-banking-threat': { bg: 'ink', el: (<>
    <Sparkle x="130" y="120" /><Sparkle x="680" y="110" s="0.8" c="#7fb8ff" /><Sparkle x="700" y="260" s="0.6" />
    <Chip text="Mythos-class AI" y="100" w="470" h="78" size="38" />
    <path transform="translate(400 200) scale(1.6)" d="M10 -34 L-18 6 H0 L-10 34 L20 -8 H2 Z" fill="#ff8d77" />
    <Lines a="Faster than any" b="human attacker." y="318" size="50" />
  </>) },
  'confessions-entry-01': { bg: 'ink', el: (<>
    <Sparkle x="120" y="120" s="0.7" /><Sparkle x="690" y="110" s="0.9" c="#7fb8ff" />
    <Terminal />
    <Lines a="47 days." b="Inside. Undetected." y="290" size="62" />
  </>) },
  'ctem-dpdpa-india-2026': { bg: 'blue', el: (<>
    <Rings o=".18" /><Sparkle x="140" y="110" c="#fff" /><Sparkle x="670" y="110" s="0.7" c="#fff" o=".8" /><Sparkle x="700" y="290" s="0.8" c="#fff" o=".85" />
    <Shield />
    <Chip text="DPDPA" y="270" w="360" h="96" size="58" />
    <g textAnchor="middle" style={FONT}><text x="400" y="385" fontSize="32" fill="#fff" letterSpacing="-0.6">meets continuous exposure management</text></g>
  </>) },
  'ctem-bot-defence-fintech': { bg: 'navy', el: (<>
    <Rings o=".1" /><Sparkle x="130" y="120" /><Sparkle x="680" y="110" s="0.8" c="#7fb8ff" />
    <Tile name="phonepe" x="190" y="130" size="100" /><Tile name="paytm" x="610" y="130" size="100" />
    <Mascot x="400" y="118" s="0.9" shades /><XMark x="400" y="128" s="2.1" />
    <Lines a="Bots adapt" b="in hours." y="318" size="58" />
  </>) },
  'ddos-mitigation-strategy-2026': { bg: 'navy', el: (<>
    <path d="M0 440 C100 440 150 428 220 414 C300 396 330 330 400 322 C470 330 500 396 580 414 C650 428 700 440 800 440" fill="rgba(255,141,119,.18)" stroke="#ff8d77" strokeWidth="3" />
    <path d="M0 440 C250 440 550 440 800 440" fill="none" stroke="#5cc2ff" strokeWidth="4" />
    <Sparkle x="130" y="110" /><Sparkle x="690" y="120" s="0.8" c="#7fb8ff" />
    <Chip text="Layer 7" y="105" w="330" h="92" size="54" />
    <Lines a="Floods that look" b="like real users." y="262" size="52" />
  </>) },
};
const FALLBACK = { bg: 'navy', el: (<><Rings /><Sparkle x="140" y="110" /><Sparkle x="670" y="110" s="0.8" c="#7fb8ff" /><Mascot y="190" /></>) };

export default function CoverArt({ slug, category, big, compact, className }) {
  const id = useId().replace(/:/g, '');
  const sc = SCENES[slug] || FALLBACK;
  const [c1, c2] = BG[sc.bg];
  return (
    <div className={cx('relative overflow-hidden', className)} aria-hidden="true">
      <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
          <linearGradient id={`cv-chip${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d6e6ff" /></linearGradient>
          <radialGradient id={`cv-bot${id}`} cx=".35" cy=".25" r=".9"><stop offset="0" stopColor="#ffb4a3" /><stop offset=".55" stopColor="#f0644d" /><stop offset="1" stopColor="#d64a33" /></radialGradient>
          <filter id={`cv-shadow${id}`} x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#020b1d" floodOpacity=".35" /></filter>
        </defs>
        <rect width="800" height="500" fill={`url(#b${id})`} />
        <Rings />
        <Ids.Provider value={id}>{sc.el}</Ids.Provider>
      </svg>
      {!compact && category && (
        <span className={cx('absolute rounded-full bg-white font-medium uppercase tracking-wide text-ink shadow-sm', big ? 'bottom-6 left-6 px-5 py-2 text-[13px]' : 'bottom-3.5 left-3.5 px-3 py-1.5 text-[10.5px] sm:text-[11px]')}>{category}</span>
      )}
    </div>
  );
}
