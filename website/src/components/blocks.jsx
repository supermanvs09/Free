import { Link } from 'react-router';
import { CUSTOMERS, CERTS } from '../data/site.js';
import { POSTS, formatDate, authorOf } from '../data/posts.js';
import { CARD } from '../data/site.js';
import { Button, Heading, Icon, LearnMore, Reveal, Section, cx } from './ui.jsx';
import { Tile } from './visuals/kit.jsx';
import CoverArt from './visuals/CoverArt.jsx';
import Thumb from './visuals/Thumb.jsx';

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
        <span key={i} className="wave-bar w-px rounded-full bg-gradient-to-t from-white/45 to-white/5" style={{ height: `${(h * 100).toFixed(1)}%`, animationDelay: `${(-(i % 24) * 0.15).toFixed(2)}s` }} />
      ))}
    </div>
  );
}

export function CtaPanel({ title = 'Secure the future of work. Start today.', body = 'See how Deep Algorithms discovers, scores and protects every human, machine and AI agent identity in your own environment.' }) {
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

/* Research cover: illustrated scene per topic with the article's headline figure. */
export function Cover({ post, big, className }) {
  return <CoverArt slug={post.slug} className={className} />;
}

export function PostCard({ post }) {
  return (
    <Link to={`/blogs/${post.slug}`} className="group block">
      <Cover post={post} className="aspect-[370/220] rounded-[20px] transition-transform duration-500 group-hover:-translate-y-1" />
      <p className="mt-5 text-[13px] font-medium text-brand">{post.category}</p>
      <h3 className="mt-1.5 font-display text-[19px] font-normal leading-snug tracking-[-0.01em] text-ink group-hover:text-brand">{post.title}</h3>
      <p className="mt-2 line-clamp-2 text-[14.5px] leading-relaxed text-ink-3">{post.excerpt}</p>
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

/* Product card: console thumbnail, name, one line, link (as on cisco.com product cards). */
export function ProductCard({ k }) {
  const c = CARD[k];
  return (
    <Link to={c.path} className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-line bg-white transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_18px_40px_-24px_rgba(6,47,87,.45)]">
      <span className="block overflow-hidden"><Thumb k={k} className="transition-transform duration-500 group-hover:scale-[1.04]" /></span>
      <span className="flex flex-1 flex-col p-6">
        <span className="flex items-center gap-2"><Icon name={c.icon} size={20} weight="light" className="text-brand" /><h3 className="t-h3 group-hover:text-brand">{c.name}</h3></span>
        <span className="mt-2 flex-1 text-[15px] text-ink-3">{c.body}</span>
        <span className="mt-5 inline-flex items-center gap-1 text-[15px] font-medium text-brand">Explore {c.name}<Icon name="CaretRight" size={13} weight="bold" /></span>
      </span>
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

/* Industry card: illustrated header, name, line, link. */
export function IndustryCard({ s }) {
  return (
    <Link to={`/solutions/${s.slug}`} className="group flex h-full flex-col overflow-hidden rounded-[20px] border border-line bg-white transition-all duration-300 hover:-translate-y-1 hover:border-brand hover:shadow-[0_18px_40px_-24px_rgba(6,47,87,.45)]">
      <CoverArt compact slug={s.slug} className="aspect-[320/200]" />
      <span className="flex flex-1 flex-col p-6">
        <h3 className="t-h3 group-hover:text-brand">{s.name}</h3>
        <span className="mt-2 flex-1 text-[15px] text-ink-3">{s.desc}</span>
        <span className="mt-5 inline-flex items-center gap-1 text-[15px] font-medium text-brand">Learn more<Icon name="CaretRight" size={13} weight="bold" /></span>
      </span>
    </Link>
  );
}

/* Featured row, after the "What's new" strip on cisco.com category pages. */
export function WhatsNew() {
  const p = POSTS[0];
  const items = [
    { thumb: 'nhi', title: 'NHI Security for AWS', body: 'Discover every IAM role, key and workload identity across your AWS accounts, with posture, access and behaviour for each.', to: '/adapid-ai/nhi-security', cta: 'Explore NHI Security' },
    { thumb: 'zenstra', title: 'Runtime security for AI agents', body: 'Zenstra AI checks each agent action against its task and keeps a decision record your auditor can read.', to: '/agentic-ai/agentic-identity', cta: 'Explore Zenstra AI' },
  ];
  return (
    <Section>
      <Heading eyebrow="Featured" title="Where to start" />
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {items.map((c, i) => (
          <Reveal key={c.title} delay={i * 70}>
            <Link to={c.to} className="group block">
              <span className="block overflow-hidden rounded-[20px]"><Thumb k={c.thumb} className="transition-transform duration-500 group-hover:scale-[1.04]" /></span>
              <span className="mt-5 flex items-center gap-2 font-display text-[22px] leading-snug text-ink group-hover:text-brand">{c.title}</span>
              <span className="mt-2 block text-[15px] text-ink-3">{c.body}</span>
              <span className="mt-3 inline-flex items-center gap-1 text-[15px] font-medium text-brand">{c.cta}<Icon name="CaretRight" size={13} weight="bold" /></span>
            </Link>
          </Reveal>
        ))}
        <Reveal delay={140}>
          <Link to={`/blogs/${p.slug}`} className="group block">
            <Cover post={p} className="aspect-[320/200] rounded-[20px] transition-transform duration-500 group-hover:-translate-y-1" />
            <span className="mt-5 block font-display text-[22px] leading-snug text-ink group-hover:text-brand">{p.title}</span>
            <span className="mt-2 block text-[15px] text-ink-3">{p.excerpt}</span>
            <span className="mt-3 inline-flex items-center gap-1 text-[15px] font-medium text-brand">Read the research<Icon name="CaretRight" size={13} weight="bold" /></span>
          </Link>
        </Reveal>
      </div>
    </Section>
  );
}

/* Manifesto plus sourced "why now" figures. Third-party figures carry their source. */
const NOW = [
  { v: '40%+', l: 'of agentic AI projects will be cancelled by the end of 2027, citing costs, unclear value or weak risk controls', s: 'Gartner, June 2025' },
  { v: '15:1', l: 'non-human to human identities in the average enterprise', s: 'Deep Algorithms Research' },
  { v: '$4.88M', l: 'average cost of a data breach in 2024, an all-time high', s: 'IBM Cost of a Data Breach, 2024' },
  { v: '₹250 Cr', l: 'maximum penalty for failing to safeguard personal data', s: 'DPDPA 2023' },
];
export function WhyNow() {
  return (
    <section className="py-6">
      <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
        <div className="relative overflow-hidden rounded-[40px] bg-navy px-6 py-16 md:px-16 md:py-24">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-100"><svg viewBox="0 0 1400 600" className="h-full w-full" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="#fff" strokeOpacity=".07">{[200, 340, 500].map((r) => <circle key={r} cx="700" cy="300" r={r} />)}</g></svg></div>
          <Reveal className="relative mx-auto max-w-[900px] text-center">
            <p className="eyebrow mb-4 !text-cyan">Why now</p>
            <blockquote className="font-display text-[30px] font-light leading-[1.2] tracking-[-0.02em] text-white md:text-[46px]">
              The future will not be defended by walls. It will be defended by knowing who, and what, is acting.
            </blockquote>
            <p className="mt-6 text-[17px] text-white/80">Secure it before it scales. Today.</p>
          </Reveal>
          <dl className="relative mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {NOW.map((n, i) => (
              <Reveal key={n.v} delay={i * 80} className="border-t border-white/20 pt-6">
                <dt className="font-display text-[48px] font-light leading-none tracking-[-0.03em] text-white md:text-[56px]">{n.v}</dt>
                <dd className="mt-4 text-[16px] leading-snug text-white/90">{n.l}</dd>
                <dd className="mt-3 text-[13px] text-white/70">Source: {n.s}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
