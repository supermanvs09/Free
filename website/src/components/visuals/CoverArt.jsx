import { cx } from './kit.jsx';

/* Research and industry covers, in the style of astrix.security's "Learn more" cards:
   a soft 3D-rendered subject on a flat brand-colour field (glossy brand tiles, our own
   agent mascot, a lifted chip), with the headline set in crisp type on top.
   The renders live in /public/img/covers (made offline, see tools/covers/README.md);
   the card is decorative, the article title sits below it. */
const FONT = { fontFamily: '"Hanken Grotesk Variable", "Inter Variable", sans-serif' };
const ACCENT = '#ff8d77';

const Lines = ({ a, b, y = 300, size = 56, bColor = ACCENT, bSize }) => (
  <g textAnchor="middle" style={FONT}>
    <text x="400" y={y} fontSize={size} fill="#fff" fontWeight="400" letterSpacing="-1.2">{a}</text>
    {b && <text x="400" y={y + size * 1.12} fontSize={bSize || size} fill={bColor} fontWeight="400" letterSpacing="-1.2">{b}</text>}
  </g>
);

const TEXT = {
  bfsi: <Lines a="Mules stopped" b="at the payee." size={56} />,
  healthcare: <Lines a="Know who opened" b="every patient record." size={52} bColor="#fff" />,
  government: <Lines a="Citizen services" b="that stay online." size={54} />,
  'digital-platforms': <Lines a="Bots stopped." b="Agents governed." size={56} />,
  'identity-security': <Lines a="0 alerts raised." b="They just logged in." size={56} />,
  'ai-security-intelligence': <Lines a="More control" b="than they should have." y={348} size={42} />,
  'threat-intelligence': <g textAnchor="middle" style={FONT}><text x="400" y="290" fontSize="108" fill="#fff" letterSpacing="-3">15 days</text><text x="400" y="355" fontSize="46" fill={ACCENT} letterSpacing="-1">before containment.</text></g>,
  'ai-agent-governance': <Lines a="12 seconds." b="Three years of data." size={56} />,
  'ai-security': <Lines a="Beyond access." b="A new security boundary." y={305} size={56} bColor="#fff" bSize={36} />,
  'india-mule-account-crisis': <g textAnchor="middle" style={FONT}><text x="400" y="378" fontSize="40" fill="#fff" letterSpacing="-0.6">mule accounts identified</text></g>,
  'mythos-ai-banking-threat': <Lines a="Faster than any" b="human attacker." y={318} size={50} />,
  'confessions-entry-01': <Lines a="47 days." b="Inside. Undetected." y={290} size={62} />,
  'ctem-dpdpa-india-2026': <g textAnchor="middle" style={FONT}><text x="400" y="385" fontSize="32" fill="#fff" letterSpacing="-0.6">meets continuous exposure management</text></g>,
  'ctem-bot-defence-fintech': <Lines a="Bots adapt" b="in hours." y={318} size={58} />,
  'ddos-mitigation-strategy-2026': <Lines a="Floods that look" b="like real users." y={262} size={52} />,
};

export default function CoverArt({ slug, className, eager }) {
  const known = slug in TEXT || ['bfsi', 'healthcare', 'government', 'digital-platforms'].includes(slug);
  return (
    <div className={cx('relative overflow-hidden bg-navy', className)} aria-hidden="true">
      <img src={`/img/covers/${known ? slug : 'default'}.webp`} alt="" width="1280" height="800" loading={eager ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">{TEXT[slug]}</svg>
    </div>
  );
}
