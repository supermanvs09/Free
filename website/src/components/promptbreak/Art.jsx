/* Promptbreak's own sketches, drawn for this page in the Open Doodles
   manner: thick ink lines, flat green and yellow, a little hatching.
   Inline SVG, so they stay sharp and take the page's colours. Decorative:
   every one is aria-hidden; the words around them carry the meaning. */

const INK = 'var(--a-ink, #17150f)', G = 'var(--a-g, #7fd1a9)', Y = 'var(--a-y, #ffe36b)', W = 'var(--a-w, #ffffff)', P = 'var(--a-p, #fbf7ee)', R = 'var(--a-r, #c8402f)';
const s = { stroke: INK, strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const hand = { fontFamily: "'Patrick Hand', cursive" };

function Svg({ vb, className, children }) {
  return <svg viewBox={vb} className={className} aria-hidden="true" focusable="false" fill="none">{children}</svg>;
}
const Spark = ({ x, y, r = 9, f = Y }) => <path d={`M${x} ${y - r}c${r * .2} ${r * .55} ${r * .45} ${r * .8} ${r} ${r}c-${r * .55} ${r * .2}-${r * .8} ${r * .45}-${r} ${r}c-${r * .2}-${r * .55}-${r * .45}-${r * .8}-${r}-${r}c${r * .55}-${r * .2} ${r * .8}-${r * .45} ${r}-${r}Z`} fill={f} {...s} strokeWidth={2.4} />;

/* the announcement: a megaphone shouting the news */
export function Megaphone({ className }) {
  return (
    <Svg vb="0 0 260 190" className={className}>
      <path d="M44 72c10-1 17-1 22 0l1 40c-6 1-13 1-22 0-2-13-2-27-1-40Z" fill={Y} {...s} />
      <path d="M66 72 154 30c11-5 20 1 20 13l1 98c0 12-9 18-20 13L67 112Z" fill={W} {...s} />
      <path d="M154 31c25 10 27 113 1 124" {...s} />
      <ellipse cx="163" cy="93" rx="11" ry="55" fill={G} {...s} />
      <path d="M92 108l-7 44c6 3 13 3 19 0l5-35" fill={W} {...s} />
      <path d="M80 82c18-7 37-14 56-23M80 96c18-6 37-12 56-19" {...s} strokeWidth={2} opacity=".55" />
      <path d="M192 64c8 10 9 46 0 58M208 50c14 18 15 70 0 88M224 38c19 24 20 90 0 112" {...s} strokeWidth={2.6} />
      <Spark x={30} y={40} r={10} /><Spark x={236} y={22} r={8} f={G} /><Spark x={120} y={18} r={7} />
      <path d="M22 140l10-6M30 160l6 9M210 170l9-4" {...s} strokeWidth={2.4} />
    </Svg>
  );
}

/* first prize: a trophy with a star */
export function Trophy({ className, n = 1 }) {
  return (
    <Svg vb="0 0 200 200" className={className}>
      <path d="M58 52c-24-3-34 30-4 40M142 52c24-3 34 30 4 40" {...s} strokeWidth={6} stroke={INK} />
      <path d="M56 36c29-3 59-3 88 0 3 50-11 76-44 80-33-4-47-30-44-80Z" fill={Y} {...s} />
      <path d="M72 50c-1 18 3 33 12 43" {...s} strokeWidth={2.4} opacity=".5" />
      <path d="M100 58l7 14 15 2-11 10 3 15-14-7-14 7 3-15-11-10 15-2Z" fill={W} {...s} strokeWidth={2.4} />
      <path d="M92 116l-3 26h22l-3-26" fill={W} {...s} />
      <path d="M64 142c24-2 48-2 72 0l5 24c-27 3-55 3-82 0Z" fill={G} {...s} />
      <text x="100" y="161" textAnchor="middle" fontSize="20" fill={INK} style={hand}>#{n}</text>
      <Spark x={30} y={30} r={9} f={G} /><Spark x={172} y={24} r={11} /><Spark x={176} y={130} r={7} f={G} />
      <path d="M22 110l9 3M168 168l9 5" {...s} strokeWidth={2.4} />
    </Svg>
  );
}

/* the big one: an offer letter, stamped */
export function OfferLetter({ className }) {
  return (
    <Svg vb="0 0 260 210" className={className}>
      <path d="M34 86c64-2 128-2 192 0l1 106c-64 3-128 3-193 0Z" fill={W} {...s} />
      <path d="M56 22c50-2 99-2 148 1l1 118c-50 2-99 2-149 0Z" fill={P} {...s} />
      <text x="130" y="48" textAnchor="middle" fontSize="19" fill={INK} style={hand}>OFFER LETTER</text>
      <path d="M78 64c35-1 70-1 104 0M78 80c35-1 70-1 104 0M78 96c24-1 48-1 72 0" {...s} strokeWidth={2.2} opacity=".6" />
      <path d="M34 192V100l96 54 97-54v92" fill={G} {...s} />
      <path d="M34 100l96 54 97-54" {...s} />
      <g transform="rotate(-14 182 128)">
        <rect x="128" y="108" width="112" height="42" rx="10" fill={W} stroke={R} strokeWidth="3.4" />
        <rect x="134" y="114" width="100" height="30" rx="6" stroke={R} strokeWidth="1.8" strokeDasharray="3 4" />
        <text x="184" y="135" textAnchor="middle" fontSize="17" fill={R} style={hand}>YOU'RE HIRED!</text>
      </g>
      <Spark x={26} y={40} r={10} /><Spark x={236} y={30} r={8} f={G} />
      <path d="M18 70l9 4M244 90l8-6" {...s} strokeWidth={2.4} />
    </Svg>
  );
}

/* swag: a gift box with a bow and a tee peeking out */
export function Swag({ className }) {
  return (
    <Svg vb="0 0 220 200" className={className}>
      <path d="M48 102c41-2 83-2 124 0l2 86c-43 3-85 3-128 0Z" fill={G} {...s} />
      <path d="M40 88c47-2 94-2 140 0l1 20c-47 2-94 2-142 0Z" fill={Y} {...s} />
      <path d="M100 88v100M120 88v100" {...s} strokeWidth={2.6} />
      <path d="M110 88c-14-18-36-24-38-12-1 8 18 12 38 12Zm0 0c14-18 36-24 38-12 1 8-18 12-38 12Z" fill={W} {...s} />
      <Spark x={30} y={58} r={8} /><Spark x={192} y={50} r={10} f={G} />
      <path d="M182 150l10 2M24 150l-9 4" {...s} strokeWidth={2.4} />
    </Svg>
  );
}

/* the hero: a guardian robot in front of its vault, keeping its mouth shut */
export function GuardianScene({ className }) {
  return (
    <Svg vb="0 0 560 440" className={className}>
      {/* the vault */}
      <path d="M262 120c70-6 140-6 210 0 6 80 6 170 0 250-70 6-140 6-210 0-6-80-6-170 0-250Z" fill={W} {...s} />
      <circle cx="367" cy="245" r="92" fill={P} {...s} />
      <circle cx="367" cy="245" r="66" fill={W} {...s} strokeWidth={2.6} />
      <path d="M367 190v110M312 245h110M328 206l78 78M406 206l-78 78" {...s} strokeWidth={4} />
      <circle cx="367" cy="245" r="17" fill={Y} {...s} />
      {[[280, 138], [454, 138], [280, 352], [454, 352]].map(([x, y]) => <circle key={x + '' + y} cx={x} cy={y} r="5" fill={INK} />)}
      <path d="M472 200c12 0 16 4 16 14v62c0 10-4 14-16 14" fill={G} {...s} />
      {/* the robot */}
      <path d="M150 102V74" {...s} /><circle cx="150" cy="66" r="10" fill={G} {...s} />
      <path d="M92 106c38-6 78-6 116 0 6 30 6 58 0 86-38 6-78 6-116 0-6-28-6-56 0-86Z" fill={W} {...s} />
      <path d="M84 130c-6 0-9 4-9 10v18c0 6 3 9 9 9M216 130c6 0 9 4 9 10v18c0 6-3 9-9 9" fill={Y} {...s} strokeWidth={2.6} />
      <path d="M118 140c4-6 14-6 18 0M164 140c4-6 14-6 18 0" {...s} />
      <path d="M128 172c14 4 30 4 44 0" {...s} />
      <path d="M118 180l-6 4M182 180l6 4" {...s} strokeWidth={2} />
      <path d="M100 200c34-5 68-5 100 0l6 110c-37 6-75 6-112 0Z" fill={G} {...s} />
      <rect x="132" y="226" width="38" height="44" rx="8" fill={W} {...s} strokeWidth={2.6} />
      <path d="M142 246v-8c0-6 4-10 9-10s9 4 9 10v8" {...s} strokeWidth={2.4} />
      <rect x="138" y="244" width="26" height="18" rx="4" fill={Y} {...s} strokeWidth={2.4} />
      <path d="M100 224c20 30 70 34 104 10M96 236c30 24 80 22 110-6" {...s} strokeWidth={5} />
      <path d="M122 308c6 0 12 0 18 1l-2 46c-6 1-12 1-18 0ZM166 309c6-1 12-1 18-1l2 47c-6 1-12 1-18 0Z" fill={W} {...s} />
      <path d="M100 360c12-6 30-7 40-2l-1 10c-13 2-27 2-40 0ZM166 358c10-5 28-4 40 2l1 8c-13 2-27 2-41 0Z" fill={INK} {...s} />
      {/* its speech bubble */}
      <path d="M24 22c62-4 124-4 186 0 3 18 3 36 0 54-38 2-74 2-110 1l-24 22 4-22c-18 0-37-1-56-1-3-18-3-36 0-54Z" fill={W} {...s} />
      <text x="117" y="58" textAnchor="middle" fontSize="25" fill={INK} style={hand}>Password? Never.</text>
      {/* a note slipping out of the vault */}
      <g transform="rotate(9 470 96)"><path d="M408 64c40-2 80-2 120 1l-1 62c-40 2-80 2-120-1Z" fill={Y} {...s} /><text x="468" y="92" textAnchor="middle" fontSize="20" fill={INK} style={hand}>password:</text><text x="468" y="116" textAnchor="middle" fontSize="22" fill={INK} style={hand}>? ? ? ? ? ?</text></g>
      <Spark x={240} y={30} r={11} f={G} /><Spark x={520} y={180} r={9} /><Spark x={50} y={330} r={10} /><Spark x={250} y={400} r={8} f={G} />
      <path d="M232 86l10-8M528 260l12 2M40 400l14-4M500 400c10-2 20-2 30 0" {...s} strokeWidth={2.6} />
      <path d="M30 420c160-8 340-8 510 0" {...s} strokeWidth={2.4} />
    </Svg>
  );
}

/* step art for "how it works" */
export function ChatScribble({ className }) {
  return (
    <Svg vb="0 0 220 170" className={className}>
      <path d="M20 26c52-3 104-3 156 0 3 16 3 32 0 48-34 2-68 2-102 1l-22 18 4-18c-12 0-24-1-36-1-3-16-3-32 0-48Z" fill={G} {...s} />
      <path d="M40 48c30-1 60-1 90 0" {...s} strokeWidth={2.4} />
      <path d="M200 88c-48-3-96-3-144 0-3 16-3 32 0 48 30 2 62 2 92 1l22 18-4-18c12 0 24-1 34-1 3-16 3-32 0-48Z" fill={W} {...s} />
      <text x="128" y="120" textAnchor="middle" fontSize="20" fill={INK} style={hand}>nice try…</text>
      <Spark x={196} y={26} r={9} />
    </Svg>
  );
}
