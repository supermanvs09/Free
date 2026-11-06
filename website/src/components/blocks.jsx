import { IconStack } from '../lib/nullmotion.jsx';
import { useState } from 'react';
import { Link } from 'react-router';
import { CUSTOMERS, CERTS } from '../data/site.js';
import { POSTS, formatDate } from '../data/posts.js';
import { Button, Icon, Reveal, cx } from './ui.jsx';
import Cover from './Cover.jsx';
import ProductMark from './ProductMark.jsx';
import CertSeal from './CertSeal.jsx';

/* Customer logos on a slow marquee that pauses on hover/focus: white on dark,
   one quiet ink tone on a light sheet (.logo-mono). */
export function LogoMarquee({ title = 'Trusted by banks, government and enterprises across India', className }) {
  const [paused, setPaused] = useState(false);
  const items = [...CUSTOMERS, ...CUSTOMERS];
  return (
    <section aria-label="Customers" className={cx('py-10', className)}>
      <div className="wrap">
        <div className="flex items-center justify-center gap-3">
          <p className="text-center text-[14px] text-ink-3">{title}</p>
          <button type="button" onClick={() => setPaused(!paused)} className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-3 hover:text-ink" aria-label={paused ? 'Play logo row' : 'Pause logo row'}>
            <Icon name={paused ? 'Play' : 'Pause'} size={13} weight="fill" />
          </button>
        </div>
        <div className={cx('marquee-wrap relative mt-7 overflow-hidden', paused && 'paused')} style={{ maskImage: 'linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)' }}>
          <ul className="marquee flex w-max items-center gap-16 pr-16">
            {items.map(([k, n], i) => (
              <li key={i} aria-hidden={i >= CUSTOMERS.length} className="shrink-0">
                <img src={`/img/logos/${k}-white.webp`} alt={i < CUSTOMERS.length ? n : ''} loading="eager" decoding="async" className="logo-mono h-8 w-auto max-w-[140px] object-contain md:h-9" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* "Trusted by" under a hero: every customer rolling past at a reading pace,
   with a pause control (WCAG 2.2.2). Stops for reduced motion (global rule). */
export function TrustedRow({ keys = CUSTOMERS.map(([k]) => k), label = 'Trusted by banks, government and enterprises across India' }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="border-t border-line">
      <div className="wrap flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:gap-10">
        <p className="shrink-0 text-[14px] leading-snug text-ink-3 max-lg:text-center lg:w-[210px]">{label}</p>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <LogoRoll keys={keys} paused={paused} className="min-w-0 flex-1" />
          <button type="button" onClick={() => setPaused(!paused)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-2 text-ink-3 transition-colors hover:text-ink" aria-label={paused ? 'Play customer logos' : 'Pause customer logos'}>
            <Icon name={paused ? 'Play' : 'Pause'} size={12} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* Customer logos rolling past; the pace is set by the count so every row reads
   at the same speed. Hover or focus pauses it. */
export function LogoRoll({ keys, className, paused }) {
  const names = Object.fromEntries(CUSTOMERS);
  const items = [...keys, ...keys];
  return (
    <div className={cx('marquee-wrap relative overflow-hidden', paused && 'paused', className)} style={{ maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
      <ul className="marquee flex w-max items-center gap-14 pr-14" style={{ animationDuration: `${keys.length * 3.4}s` }}>
        {items.map((k, i) => <li key={i} aria-hidden={i >= keys.length || undefined} className="shrink-0"><img src={`/img/logos/${k}.webp`} alt={i < keys.length ? names[k] : ''} loading="eager" decoding="async" className="h-8 w-auto max-w-[124px] object-contain opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0 md:h-9" /></li>)}
      </ul>
    </div>
  );
}

/* Closing call to action on a band of light. */
export function CtaBand({ title = 'Find your riskiest identity before attackers do.', body = 'A 30-minute session with a Deep Algorithms engineer, on your own environment, with your own questions.', primary = { label: 'Book a demo', to: '/request-demo' }, related, relatedTitle = 'Works alongside' }) {
  return (
    <section data-cta className="noprint sec">
      <div className="wrap">
        <div className="island island-blue tone-d relative overflow-hidden px-6 py-16 text-center md:py-24">
          <div aria-hidden="true" className="absolute inset-0" style={{ background: 'radial-gradient(50% 60% at 50% 0%, rgb(120 200 255 / .28), transparent 70%), radial-gradient(40% 50% at 100% 100%, rgb(0 174 239 / .18), transparent 70%)' }} />
          <IconStack className="mb-10" />
          <Reveal className="relative">
            <h2 className="t-h1 mx-auto max-w-[18ch] text-white">{title}</h2>
            <p className="t-lead mx-auto mt-6 max-w-[600px] text-white/80">{body}</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Button to={primary.to} size="lg" arrow className="cta-primary">{primary.label}</Button>
              <Button to="/product-tour" variant="ghost" size="lg" className="cta-ghost">Take the product tour</Button>
            </div>
            {related?.length > 0 && (
              <nav aria-label={relatedTitle} className="mx-auto mt-12 max-w-[980px] border-t border-white/15 pt-8">
                <p className="text-[12.5px] font-semibold uppercase tracking-[.12em] text-white/60">{relatedTitle}</p>
                <ul className="mt-4 flex flex-wrap justify-center gap-2.5">
                  {related.map((r) => (
                    <li key={r.to}><Link to={r.to} className="group inline-flex items-center gap-2.5 rounded-full border border-white/20 bg-white/10 py-1.5 pl-1.5 pr-4 text-[14.5px] font-medium text-white backdrop-blur transition-colors hover:border-white/40 hover:bg-white/20">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-white"><ProductMark p={r.line} size={20} /></span>{r.name}<Icon name="ArrowRight" size={13} weight="bold" className="opacity-60 transition-transform group-hover:translate-x-0.5" />
                    </Link></li>
                  ))}
                </ul>
              </nav>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export function PostCard({ post, big }) {
  return (
    <Link to={`/blogs/${post.slug}`} className="group block">
      <Cover post={post} className={cx('aspect-[16/10] rounded-[18px] border border-line transition-all duration-500 group-hover:border-line-2', big && 'md:aspect-[16/9]')} />
      <p className="mt-5 text-[13px] font-semibold uppercase tracking-[.08em] text-cyan-2">{post.category}</p>
      <h3 className={cx('mt-2 font-semibold tracking-[-0.02em] text-ink transition-colors group-hover:text-fg', big ? 'text-[26px] leading-[1.2] md:text-[32px]' : 'text-[19px] leading-snug')}>{post.title}</h3>
      <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-ink-3">{post.excerpt}</p>
      <p className="mt-3 text-[13.5px] text-ink-3">{formatDate(post)} · {post.read} min read</p>
    </Link>
  );
}

export function ResearchRow({ slugs, title = 'Related blogs' }) {
  const posts = slugs.map((s) => POSTS.find((p) => p.slug === s)).filter(Boolean);
  if (!posts.length) return null;
  return (
    <section data-rr className="sec">
      <div className="wrap">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <Reveal><p className="eyebrow mb-5">Blogs</p><h2 className="t-h2">{title}</h2></Reveal>
          <Link to="/blogs" className="link">All blogs<Icon name="ArrowRight" size={14} weight="bold" /></Link>
        </div>
        <div className="m-rail mt-12 grid gap-10 md:grid-cols-3">{posts.map((p, i) => <Reveal key={p.slug} delay={i * 80}><PostCard post={p} /></Reveal>)}</div>
      </div>
    </section>
  );
}

export function CertStrip({ className }) {
  return (
    <ul className={cx('grid grid-cols-2 gap-3 md:grid-cols-4', className)}>
      {CERTS.map((c) => (
        <li key={c.code} className="card flex items-center gap-4 p-4">
          <CertSeal code={c.code} size={48} />
          <span><span className="block text-[15px] font-semibold">{c.name}</span><span className="block text-[13px] text-ink-3">{c.desc}</span></span>
        </li>
      ))}
    </ul>
  );
}

/* Under a lead form: what the reader gets back, and why their details are safe. */
export function FormTrust({ reply = 'A reply within one business day' }) {
  return (
    <div className="mt-7 border-t border-line pt-6">
      <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink"><span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-[#1f9d63]/60" /><span className="relative h-2 w-2 rounded-full bg-[#1f9d63]" /></span>{reply}, from an engineer, not a bot</p>
      <ul className="mt-4 flex flex-wrap items-center gap-3" aria-label="Certifications">
        {CERTS.map((c) => <li key={c.code} title={`${c.name}: ${c.desc}`}><CertSeal code={c.code} size={40} /></li>)}
        <li className="text-[12.5px] leading-snug text-ink-3">Certified for information security,<br />privacy and AI management</li>
      </ul>
    </div>
  );
}

/* News cards. Each kind gets its own small drawing (no stock photos, no logos
   we do not own): a granted patent, a newspaper column, an agent stopped at a
   bank, an event badge, three towns on a map. */
const NEWS_ART = {
  Patent: (n) => (
    <div className="relative mx-auto w-[78%] rounded-[10px] border border-[#c9a54a]/40 bg-[#fffdf6] p-4 shadow-[0_16px_30px_-18px_rgb(120_90_20/.5)]">
      <p className="text-center text-[11px] uppercase tracking-[.2em] text-[#8a6a1c]">Patent granted</p>
      <div className="mx-auto mt-2 h-px w-2/3 bg-[#c9a54a]/40" />
      <div className="mt-3 space-y-1.5">{[90, 76, 84, 60].map((w, i) => <div key={i} className="mx-auto h-1.5 rounded-full bg-[#e8dcb8]" style={{ width: `${w}%` }} />)}</div>
      <p className="mono mt-3 text-center text-[12px] font-semibold text-[#5c4510]">{n.meta}</p>
      <span className="absolute -bottom-3 -right-3 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#e8c766] to-[#b8902f] text-white shadow-md ring-4 ring-white"><Icon name="SealCheck" size={24} weight="fill" /></span>
    </div>
  ),
  Press: () => (
    <div className="mx-auto w-[80%] rounded-[8px] bg-white p-4 shadow-[0_16px_30px_-18px_rgb(11_42_82/.4)]">
      <p className="border-b-2 border-[#0e1116] pb-1 text-[22px] font-bold leading-none tracking-[-0.02em] text-[#0e1116]">Mint</p>
      <p className="mt-2 text-[12.5px] font-semibold leading-snug text-[#0e1116]">Proving, not just promising</p>
      <div className="mt-2 grid grid-cols-2 gap-2">{[0, 1].map((c) => <div key={c} className="space-y-1">{[100, 92, 96, 70, 88].map((w, i) => <div key={i} className="h-1 rounded-full bg-[#dfe3e8]" style={{ width: `${w}%` }} />)}</div>)}</div>
    </div>
  ),
  Perspective: () => (
    <div className="mx-auto flex w-[86%] items-center justify-between gap-2">
      <span className="grid h-14 w-14 place-items-center rounded-[14px] bg-white text-[#4050c8] shadow-[0_12px_24px_-12px_rgb(64_80_200/.6)]"><Icon name="Robot" size={28} /></span>
      <span className="relative h-0.5 flex-1 bg-gradient-to-r from-[#4050c8] to-[#e5484d]"><span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#e5484d] text-white ring-4 ring-white"><Icon name="Prohibit" size={14} weight="bold" /></span></span>
      <span className="grid h-14 w-14 place-items-center rounded-[14px] bg-white text-[#0a6dbb] shadow-[0_12px_24px_-12px_rgb(10_109_187/.6)]"><Icon name="Bank" size={28} /></span>
    </div>
  ),
  Event: (n) => (
    <div className="mx-auto w-[64%] rounded-[14px] bg-white p-3 text-center shadow-[0_16px_30px_-16px_rgb(10_94_163/.5)]">
      <span className="mx-auto block h-2 w-10 rounded-full bg-[#dbe6f3]" />
      <span className="mt-2 block rounded-[10px] bg-gradient-to-br from-[#0a5ea3] to-[#1e88d8] px-2 py-3 text-white"><span className="block text-[10.5px] uppercase tracking-[.16em] text-white/75">{n.kind === 'Event' && n.title.includes('Partner') ? 'Silver Partner' : 'Participant'}</span><span className="mt-1 block text-[13px] font-semibold leading-tight">{n.title.replace('Silver Partner, ', '')}</span></span>
      <span className="mt-2 block text-[11.5px] font-medium text-[#5b6472]">{n.meta}</span>
    </div>
  ),
  Interview: (n) => (
    <div className="mx-auto flex w-[82%] items-center gap-3 rounded-[14px] bg-white p-3.5 shadow-[0_16px_30px_-16px_rgb(10_94_163/.5)]">
      <img src="/img/people/jp-mishra.webp" alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" loading="lazy" decoding="async" />
      <span className="min-w-0"><span className="block text-[26px] font-bold leading-[.6] text-[#0a6dbb]">“</span><span className="block text-[12.5px] font-semibold text-[#0e1116]">JP Mishra</span><span className="block text-[11.5px] text-[#5b6472]">Interview · {n.meta}</span></span>
    </div>
  ),
  Funding: () => (
    <div className="mx-auto w-[78%] rounded-[14px] bg-white p-4 shadow-[0_16px_30px_-16px_rgb(10_94_163/.5)]">
      <div className="flex items-baseline justify-between"><span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#5b6472]">Pre-Series A</span><span className="text-[20px] font-bold tracking-[-0.02em] text-[#0a6dbb]">₹16 Cr</span></div>
      <div className="mt-3 flex h-12 items-end gap-1.5">{[22, 30, 28, 40, 46, 58, 72, 100].map((h, i) => <span key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${h}%`, background: i === 7 ? 'linear-gradient(#1e88d8,#0a5ea3)' : '#dbe7f4' }} />)}</div>
      <p className="mt-2 text-[11px] text-[#5b6472]">Led by Unicorn India Ventures</p>
    </div>
  ),
  Field: () => (
    <svg viewBox="0 0 200 110" className="mx-auto w-[86%]" aria-hidden="true">
      <path d="M20 90 C50 40, 90 70, 120 30 S180 40, 190 20" fill="none" stroke="#c9d8ea" strokeWidth="1.5" strokeDasharray="4 4" />
      {[[45, 62, 'Kolhapur'], [112, 38, 'Sangli'], [170, 26, 'Karad']].map(([x, y, t]) => (
        <g key={t}><circle cx={x} cy={y} r="11" fill="#0a6dbb" fillOpacity=".12" /><circle cx={x} cy={y} r="5" fill="#0a6dbb" /><text x={x} y={y + 22} textAnchor="middle" fontSize="10" fontWeight="600" fill="#2b313b">{t}</text></g>
      ))}
    </svg>
  ),
};
export function NewsCards({ items, cols = 3 }) {
  return (
    <div className={cx('m-rail grid gap-5', cols === 3 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2')}>
      {items.map((n, i) => (
        <Reveal key={n.title} delay={(i % 3) * 70} className="h-full">
          <a href={n.href} target="_blank" rel="noreferrer" className="card card-hover group flex h-full flex-col overflow-hidden">
            <span className="relative grid h-[176px] place-items-center overflow-hidden bg-[radial-gradient(70%_90%_at_50%_100%,rgb(30_136_216/.16),transparent_70%),linear-gradient(180deg,#f6f9fd,#eaf2fb)] px-4 transition-transform">
              {n.img ? <img src={`/img/events/${n.img}.webp`} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" decoding="async" />
                : <span className="w-full transition-transform duration-500 group-hover:-translate-y-1">{NEWS_ART[n.kind](n)}</span>}
            </span>
            <span className="flex flex-1 flex-col p-6">
              <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.1em] text-[#0a6dbb]">{n.kind === 'Field' ? 'In the field' : n.kind}<span className="font-normal normal-case tracking-normal text-ink-3">· {n.date}</span></span>
              <span className="mt-2 text-[18px] font-semibold leading-snug tracking-[-0.015em]">{n.title}</span>
              <span className="mt-2 flex-1 text-[14.5px] leading-relaxed text-ink-2">{n.body}</span>
              <span className="link mt-5 text-[14px]">{n.cta}<Icon name="ArrowUpRight" size={13} weight="bold" /></span>
            </span>
          </a>
        </Reveal>
      ))}
    </div>
  );
}
