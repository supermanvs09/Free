import { Link } from 'react-router';
import { CUSTOMERS, CERTS } from '../data/site.js';
import { POSTS, formatDate, authorOf } from '../data/posts.js';
import { CARD } from '../data/products.js';
import { Button, Heading, Icon, LearnMore, Reveal, Section, cx } from './ui.jsx';
import { Tile } from './visuals/kit.jsx';

/* Customer logos. `band` = white logos in a brand-blue rounded band (home);
   otherwise full-colour logos on white (inner pages). One marquee per page. */
export function LogoBand({ band, title }) {
  const items = [...CUSTOMERS, ...CUSTOMERS];
  const row = (
    <div className="marquee-wrap relative overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
      <ul className="marquee flex w-max items-center gap-14 pr-14">
        {items.map(([k, n], i) => (
          <li key={i} aria-hidden={i >= CUSTOMERS.length} className="shrink-0">
            <img src={`/img/logos/${k}${band ? '-white' : ''}.webp`} alt={i < CUSTOMERS.length ? n : ''} loading="lazy" decoding="async"
              className={cx('h-9 w-auto max-w-[150px] object-contain md:h-10', !band && 'opacity-90')} />
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section aria-label="Customers" className="py-6">
      <div className="wrap">
        {title && <p className="mb-6 text-center text-[15px] text-ink-3">{title}</p>}
        {band ? <div className="rounded-[20px] bg-brand py-6">{row}</div> : row}
      </div>
    </section>
  );
}

/* Animated vertical-bar waveform for the closing CTA. */
function Waveform() {
  const bars = Array.from({ length: 96 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i / 9) * Math.cos(i / 23)));
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[42%] items-end justify-between gap-[3px] px-6 opacity-70">
      {bars.map((h, i) => (
        <span key={i} className="wave-bar w-px rounded-full bg-gradient-to-t from-white/45 to-white/5" style={{ height: `${h * 100}%`, animationDelay: `${-(i % 24) * 0.15}s` }} />
      ))}
    </div>
  );
}

export function CtaPanel({ title = 'Secure every identity, starting this quarter', body = 'See how Deep Algorithms discovers, scores and protects human, non-human and AI agent identities in your own environment.' }) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
        <Reveal className="relative overflow-hidden rounded-[40px] bg-navy px-6 pb-36 pt-20 text-center md:pb-44 md:pt-24">
          <h2 className="t-h2 relative mx-auto max-w-[880px] text-white">{title}</h2>
          <p className="relative mx-auto mt-5 max-w-[620px] text-[17px] text-white/80">{body}</p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <Button to="/request-demo" variant="white">Book a demo</Button>
            <Button to="/contact" variant="ghostWhite">Talk to us</Button>
          </div>
          <Waveform />
        </Reveal>
      </div>
    </section>
  );
}

/* Line-path art for navy panels: an identity's journey drawn as a thin line
   with key, account and agent nodes; a light pulse travels along it. */
export function PathArt({ className }) {
  const d = 'M0 60 H 210 Q 240 60 240 90 V 300 Q 240 330 270 330 H 420';
  return (
    <svg viewBox="0 0 420 360" className={cx('h-auto w-full', className)} aria-hidden="true">
      <path d={d} fill="none" stroke="#5c86b3" strokeOpacity=".5" strokeWidth="1.4" />
      <path d={d} fill="none" stroke="#00aeef" strokeWidth="2" strokeDasharray="40 560" className="path-pulse" />
      <g fill="none" strokeWidth="1.6">
        <g stroke="#f0644d" transform="translate(70 60)"><circle r="7" cx="10" /><path d="M-14 0h17M-10 0v5M-6 0v4" /></g>
        <rect x="128" y="51" width="18" height="18" rx="4" stroke="#cfe0f0" />
        <g stroke="#00aeef" transform="translate(240 160)"><rect x="-11" y="-9" width="22" height="18" rx="5" fill="#062f57" /><path d="M-5 0h.01M5 0h.01M0 -9v-5" /></g>
        <g stroke="#f0644d" transform="translate(240 240)"><circle r="7" fill="#062f57" /><path d="M-2 -18v11" /></g>
        <g stroke="#00aeef" transform="translate(340 330)"><rect x="-11" y="-9" width="22" height="18" rx="5" fill="#062f57" /><path d="M-5 0h.01M5 0h.01M0 -9v-5" /></g>
      </g>
    </svg>
  );
}

/* Navy hero illustration for solution pages: real app tiles joined by thin
   lines, with one coral finding card (Astrix use-case style). */
export function LogoNet({ alert = { title: 'API Key', body: 'Over-privileged access', action: 'Remediate' }, logos = ['aws', 'snowflake', 'github', 'okta', 'gitlab'] }) {
  const pos = [[52, 18], [16, 46], [86, 6], [30, 82], [58, 62]];
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[460px]" aria-hidden="true">
      <svg viewBox="0 0 100 80" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {['M52 18 C 30 18, 30 46, 16 46', 'M52 18 H 86', 'M16 46 C 16 70, 30 70, 30 82', 'M52 18 C 60 30, 58 50, 58 62'].map((d) => (
          <path key={d} d={d} fill="none" stroke="#cfe0f0" strokeOpacity=".7" strokeWidth=".35" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {logos.map((l, i) => (
        <span key={l} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-[14px] shadow-lg" style={{ left: `${pos[i][0]}%`, top: `${(pos[i][1] / 80) * 100}%` }}>
          <Tile name={l} size={i === 0 ? 64 : 48} />
        </span>
      ))}
      <div className="absolute bottom-[4%] right-0 w-[56%] rounded-[16px] bg-coral-2 p-4 text-white shadow-xl">
        <div className="flex items-center gap-2 font-medium"><Icon name="Warning" size={18} />{alert.title}</div>
        <div className="mt-1 text-[15px] text-white/90">{alert.body}</div>
        <div className="mt-3 rounded-[8px] bg-white py-1.5 text-center text-[14px] font-medium text-coral-2">{alert.action}</div>
      </div>
    </div>
  );
}

/* Branded flat covers for research posts: one colour family per topic, a big
   topic word and a line icon. No photography, no textures. */
const COVERS = {
  'AI Agent Security': ['bg-brand', 'Robot'],
  'Identity Security': ['bg-navy', 'Fingerprint'],
  'Threat Intelligence': ['bg-navy', 'Crosshair'],
  'Financial Crime': ['bg-coral', 'Wallet'],
  'Bot Defence': ['bg-brand', 'ShieldCheck'],
  Compliance: ['bg-navy', 'Scales'],
  'Field Notes': ['bg-coral', 'Detective'],
};
export function Cover({ category, className, big }) {
  const [bg, icon] = COVERS[category] || COVERS['Identity Security'];
  return (
    <div className={cx('relative overflow-hidden text-white', bg, className)} aria-hidden="true">
      <img src="/brand/logo-lockup-inverse.webp" alt="" className={cx('absolute left-5 top-5 w-auto brightness-0 invert', big ? 'h-7' : 'h-5')} />
      <span className={cx('absolute bottom-5 left-5 max-w-[60%] font-display font-light leading-[1.05] tracking-[-0.02em]', big ? 'text-[44px]' : 'text-[28px]')}>{category}</span>
      <span className={cx('absolute right-5 top-1/2 -translate-y-1/2 opacity-90', big ? '' : '')}>
        <Icon name={icon} size={big ? 140 : 84} weight="thin" />
      </span>
    </div>
  );
}

export function PostCard({ post }) {
  return (
    <Link to={`/blogs/${post.slug}`} className="group block">
      <Cover category={post.category} className="aspect-[370/220] rounded-[20px] transition-transform duration-500 group-hover:-translate-y-1" />
      <h3 className="mt-5 font-display text-[19px] font-normal leading-snug tracking-[-0.01em] text-ink group-hover:text-brand">{post.title}</h3>
      <div className="mt-3 flex items-center gap-2.5 text-[13px] text-ink-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky"><img src="/brand/mark.webp" alt="" className="h-3.5 w-3.5" /></span>
        <span><span className="block text-ink-2">{authorOf(post)}</span>{formatDate(post)} · {post.read} min read</span>
      </div>
    </Link>
  );
}

export function CertRow({ dark }) {
  return (
    <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {CERTS.map((c, i) => (
        <Reveal as="li" key={c.code} delay={i * 70} className={cx('flex flex-col items-center rounded-[20px] p-6 text-center', dark ? 'bg-white/8 ring-1 ring-white/15' : 'border border-line bg-white')}>
          <span className={cx('flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full border-2 text-[11px] font-semibold leading-tight', dark ? 'border-white/60 text-white' : 'border-brand text-brand')}>
            {c.code.split(' ').map((p) => <span key={p}>{p}</span>)}
          </span>
          <span className={cx('mt-4 font-medium', dark ? 'text-white' : 'text-ink')}>{c.name}</span>
          <span className={cx('text-[13px]', dark ? 'text-white/70' : 'text-ink-3')}>{c.desc}</span>
        </Reveal>
      ))}
    </ul>
  );
}

/* Product link card (icon tile, name, one line, Learn more). */
export function ProductCard({ k }) {
  const c = CARD[k];
  return (
    <Link to={c.path} className="group flex h-full flex-col rounded-[20px] border border-line bg-white p-7 transition-colors hover:border-brand">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-[12px] bg-sky text-brand"><Icon name={c.icon} size={24} weight="light" /></span>
      <h3 className="t-h3 mt-6 group-hover:text-brand">{c.name}</h3>
      <p className="mt-2 flex-1 text-[15px] text-ink-3">{c.body}</p>
      <span className="mt-6 inline-flex items-center gap-1 text-[15px] font-medium text-brand">Learn more <Icon name="CaretRight" size={13} weight="bold" /></span>
    </Link>
  );
}

export function RelatedCards({ keys, title, eyebrow }) {
  const cols = { 1: 'max-w-[380px]', 2: 'max-w-[780px] sm:grid-cols-2', 3: 'max-w-[1100px] sm:grid-cols-2 lg:grid-cols-3' }[keys.length] || 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <Section>
      <Heading eyebrow={eyebrow} title={title} />
      <div className={cx('mx-auto mt-12 grid gap-5', cols)}>
        {keys.map((k, i) => <Reveal key={k} delay={i * 70}><ProductCard k={k} /></Reveal>)}
      </div>
    </Section>
  );
}

export function ResearchRow({ slugs, tone = 'mist' }) {
  const posts = slugs.map((s) => POSTS.find((p) => p.slug === s)).filter(Boolean);
  return (
    <Section tone={tone}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Heading align="left" eyebrow="Research" title="Learn more" className="!max-w-none" />
        <LearnMore to="/blogs">All research</LearnMore>
      </div>
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {posts.map((p, i) => <Reveal key={p.slug} delay={i * 70}><PostCard post={p} /></Reveal>)}
      </div>
    </Section>
  );
}
