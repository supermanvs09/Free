import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useInView, useReducedMotion } from '../lib/motion.js';
import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { LEADERS, ADVISORS, RECOGNITION, TEAM_PHOTOS, BELIEFS, NEWS, FOUNDER_QUOTE } from '../data/company.js';
import { Breadcrumb, Button, Icon, Reveal, SectionHead, cx } from '../components/ui.jsx';
import { CertStrip, CtaBand, LogoMarquee, NewsCards } from '../components/blocks.jsx';
import { Compare } from '../components/ProductKit.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { loadGsap } from '../lib/nullmotion.jsx';

/* Why Deep Algorithms: the company and the case for it, on one page.
   What enterprise "why us" and company pages carry, in this order: the claim,
   the story, the difference, the people, the proof,
   then careers and offices. */

const img = (k) => `/img/events/${k}.webp`;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/* how far the reader is through an element, 0 at its top entering the lower
   part of the screen, 1 at its bottom leaving the upper part */
function useScrollProgress(ref, { start = 0.85, end = 0.25 } = {}) {
  const [p, setP] = useState(1);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setP(1); return undefined; }
    let raf = 0;
    const read = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect(), vh = window.innerHeight;
      setP(clamp((vh * start - r.top) / (r.height + vh * (start - end))));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [ref, reduce, start, end]);
  return p;
}

const LINEUP = [
  ['zenstra', 'Zenstra AI', 'AI agents', '#93a2ff', 'Agent’s CRM export blocked', '4 ms', '/agentic-ai/agentic-identity', 'Security for AI agents: every action checked against its task before it runs.'],
  ['adapid', 'adapID AI', 'People and machine identities', '#3cc8f6', 'Lagos sign-in held at risk 94', '1.4 s', '/adapid-ai', 'Security for people and machine identities: the one that starts behaving differently is stopped.'],
  ['icms', 'ICMS Compliance Suite', 'Personal data and DPDPA', '#f4c76c', 'Read without consent refused', 'now', '/dpdpa-compliance', 'DPDPA compliance: every access to personal data becomes evidence, ready before the auditor asks.'],
];

/* The products as a rolling showcase, the way watch and shoe stores show a
   range: the centre product pops forward, large and sharp, on a lit pedestal;
   its neighbours sit smaller and out of focus, so all of them are always in view.
   It rolls on by itself; click a neighbour to bring it forward. Positions are
   inline styles (the server render is already the finished layout) moved by CSS
   transitions; the centre pop and the words are GSAP, after Null Motion's
   icon-stack-rise and blur-reveal templates. Reduced motion: no rolling. */
const HOLD = 3400;
const SLOT = {           // offset from centre -> how far out, how big, how blurred
  0: { x: 0, s: 1, b: 0, o: 1 },
  1: { x: 132, s: 0.54, b: 3, o: 0.75 },
  2: { x: 190, s: 0.34, b: 6, o: 0 },
};
const words = (t) => t.split(' ').map((w, i) => <span key={i} className="ps-w inline-block">{w}{'\u00a0'}</span>);
function ProductPanel() {
  const ref = useRef(null);
  const copy = useRef(null);
  const seen = useInView(ref, { threshold: 0.3 });
  const reduce = useReducedMotion();
  const [on, setOn] = useState(0);
  const [held, setHeld] = useState(false);
  const first = useRef(true);
  const n = LINEUP.length;

  useEffect(() => {
    if (!seen || reduce || held) return undefined;
    const t = setTimeout(() => setOn((k) => (k + 1) % n), HOLD);
    return () => clearTimeout(t);
  }, [seen, reduce, held, on, n]);

  // the centre product pops once it has rolled in; its name resolves word by word
  useEffect(() => {
    if (first.current || reduce) { first.current = false; return undefined; }
    let tl;
    loadGsap().then((g) => {
      const root = ref.current;
      tl = g.timeline()
        .fromTo(root.querySelector(`[data-k="${on}"] .ps-pop`), { scale: 0.86 }, { scale: 1, duration: 0.9, ease: 'back.out(2.4)' }, 0.18)
        .fromTo(root.querySelector(`[data-k="${on}"] .ps-sheen`), { xPercent: -160, opacity: 0 }, { xPercent: 160, opacity: 1, duration: 0.9, ease: 'power2.inOut' }, 0.35)
        .fromTo(copy.current.querySelectorAll('.ps-w'), { y: 14, opacity: 0, filter: 'blur(8px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.6, stagger: 0.03, ease: 'power3.out' }, 0.15);
    });
    return () => tl?.kill();
  }, [on, reduce]);

  const pick = (k) => { setHeld(true); setOn(k); };
  const P = LINEUP[on];
  return (
    <div ref={ref} className="ps relative mx-auto grid w-full max-w-[560px] place-items-center py-6 text-center" style={{ '--pc': '#1e88d8' }}>
      {/* the backdrop: one light-blue field and a floor, the same for every product */}
      <div aria-hidden="true" className="ps-field absolute inset-x-[-6%] top-0 h-[300px] rounded-[40px] max-sm:h-[240px]" />

      <div className="relative h-[240px] w-full max-sm:h-[190px]" role="group" aria-roledescription="carousel" aria-label="Deep Algorithms products">
        <div aria-hidden="true" className="ps-floor absolute bottom-[14px] left-1/2 h-[26px] w-[190px] -translate-x-1/2 rounded-[50%] max-sm:w-[150px]" />
        <div aria-hidden="true" className="absolute left-1/2 top-[108px] -translate-x-1/2 -translate-y-1/2 max-sm:top-[86px]">
          <div className="ps-ring h-[230px] w-[230px] rounded-full max-sm:h-[178px] max-sm:w-[178px]" />
        </div>
        {LINEUP.map((L, k) => {
          let d = (k - on + n) % n; if (d > n / 2) d -= n;           // -1, 0, 1, 2
          const m = SLOT[Math.abs(d)], sx = Math.sign(d) || 1;
          const centre = d === 0;
          return (
            <button key={L[0]} data-k={k} type="button" onClick={() => (centre ? null : pick(k))} tabIndex={centre ? -1 : 0} aria-label={centre ? undefined : `Show ${L[1]}`} aria-hidden={centre || undefined}
              className={cx('ps-item absolute left-1/2 top-[108px] grid h-[170px] w-[170px] place-items-center max-sm:top-[86px] max-sm:h-[130px] max-sm:w-[130px]', centre ? 'cursor-default' : 'cursor-pointer')}
              style={{ transform: `translate(-50%, -50%) translateX(${sx * m.x}%) scale(${m.s})`, filter: m.b ? `blur(${m.b}px) saturate(.8)` : 'none', opacity: m.o, zIndex: 10 - Math.abs(d) }}>
              <span className="ps-pop relative grid place-items-center">
                <span className={cx('grid place-items-center', centre && 'ps-bob')}>
                  <ProductMark p={L[0]} size={136} className="max-sm:!h-[104px] max-sm:!w-[104px]" style={{ filter: centre ? 'drop-shadow(0 22px 34px rgb(30 136 216 / .45))' : 'none' }} />
                </span>
                {centre && <span aria-hidden="true" className="ps-sheen pointer-events-none absolute inset-0 opacity-0" />}
              </span>
            </button>
          );
        })}
      </div>

      <Link ref={copy} to={P[6]} key={on} className="relative mt-4 grid place-items-center" aria-label={`${P[1]}: ${P[7]}`} aria-live="polite">
        <span className="text-[clamp(28px,2.8vw,40px)] font-semibold tracking-[-0.03em] text-ink">{words(P[1])}</span>
        <span className="mt-3 block min-h-[5.1em] max-w-[32ch] text-[17px] leading-relaxed text-ink-2">{words(P[7])}</span>
      </Link>
      <div className="relative mt-4 flex gap-2" role="group" aria-label="Choose a product">
        {LINEUP.map(([k, name], i) => (
          <button key={k} type="button" onClick={() => pick(i)} aria-label={name} aria-current={i === on || undefined} className="group py-2">
            <span className="block h-[3px] w-10 overflow-hidden rounded-full bg-ink/10 transition-colors group-hover:bg-ink/20">
              <span className={cx('block h-full rounded-full', i === on && !held && !reduce && seen ? 'ps-fill' : '')} style={{ background: '#1e88d8', width: i === on && (held || reduce || !seen) ? '100%' : i === on ? undefined : '0%', animationDuration: `${HOLD}ms` }} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- our story: the statement lights up as you read, then the years ---------- */
const STATEMENT = ['Attackers adopted AI. Bots that pass for people, stolen identities that drift unseen for months, data access that looks exactly like legitimate work.', 'Tools built for a world of rules could not keep up. So we built defence that learns what normal looks like, and acts before the deviation becomes a breach.'];

function Statement() {
  const ref = useRef(null);
  const p = useScrollProgress(ref, { start: 0.9, end: 0.45 });
  const total = STATEMENT.join(' ').split(' ').length;
  let n = 0;
  return (
    <div ref={ref} className="space-y-8">
      {STATEMENT.map((para, k) => (
        <p key={k} className={cx('font-semibold leading-[1.2] tracking-[-0.025em]', k ? 'text-[clamp(26px,3.1vw,42px)] text-[#0a5ea3]' : 'text-[clamp(26px,3.1vw,42px)]')}>
          {para.split(' ').map((w, i, a) => {
            const on = clamp(p * total * 1.15 - n++);
            return <span key={i} style={{ opacity: 0.18 + 0.82 * on, transition: 'opacity .2s linear' }}>{w}{i < a.length - 1 ? ' ' : ''}</span>;
          })}
        </p>
      ))}
    </div>
  );
}

const YEARS = [
  { y: '2022', h: 'Founded in Hyderabad', p: 'Deep Algorithms starts from one observation: attackers had adopted AI, and the tools defending against them had not.', items: [['Company founded', 'Hyderabad, India']], photo: null },
  { y: '2024', h: 'On the national stage', p: 'Our work on identity and data security reaches government and industry forums across India.', items: [['Bharat Mandapam', 'Delhi'], ['CCoE DSCI Chapter Meet', 'Hyderabad'], ['Cybersecurity and Privacy conference', 'Telangana']], photo: 'bharat-mandapam' },
  { y: '2025', h: 'Recognised for the work', p: 'Awards from the Data Security Council of India and industry bodies, and an international stage in Dubai.', items: [['Cybersecurity Excellence', 'Data Security Council of India'], ['Business Excellence Award', 'Best Cybersecurity Solutions Provider'], ['GITEX GLOBAL × Expand North Star', 'Dubai']], photo: 'dsci-excellence' },
  { y: '2026', h: 'Growing the team', p: 'A new office, training with the Cyber Bureau in Hyderabad and the AI Summit in Delhi.', items: [['New office inauguration', 'Hyderabad'], ['Cyber Security Training', 'Cyber Bureau Hyderabad'], ['AI Summit', 'Delhi']], photo: 'office-inauguration' },
];

function Years() {
  const ref = useRef(null);
  const p = useScrollProgress(ref, { start: 0.7, end: 0.6 });
  return (
    <ol ref={ref} className="relative mt-16 space-y-14 md:space-y-20">
      <span aria-hidden="true" className="absolute bottom-2 left-[15px] top-2 w-px bg-line-2 md:left-1/2" />
      <span aria-hidden="true" className="absolute left-[15px] top-2 w-px origin-top bg-cyan-2 md:left-1/2" style={{ height: 'calc(100% - 16px)', transform: `scaleY(${p})` }} />
      {YEARS.map((y, i) => {
        const lit = p >= (i + 0.2) / YEARS.length;
        return (
          <li key={y.y} className="relative grid gap-6 pl-12 md:grid-cols-2 md:gap-16 md:pl-0">
            <span aria-hidden="true" className={cx('absolute left-[7px] top-1 h-[17px] w-[17px] rounded-full border-2 transition-colors duration-500 md:left-1/2 md:-translate-x-1/2', lit ? 'border-cyan-2 bg-cyan-2' : 'border-line-2 bg-bg')} />
            <Reveal className={cx(i % 2 ? 'md:order-2 md:pl-4' : 'md:pr-4 md:text-right')}>
              <p className="text-[56px] font-semibold leading-none tracking-[-0.05em] text-cyan-2 num md:text-[72px]">{y.y}</p>
              <h3 className="mt-3 text-[24px] font-semibold tracking-[-0.025em]">{y.h}</h3>
              <p className="mt-2 text-[16.5px] leading-relaxed text-ink-2">{y.p}</p>
              <ul className={cx('mt-4 flex flex-wrap gap-2', !(i % 2) && 'md:justify-end')}>
                {y.items.map(([t, w]) => <li key={t} className="rounded-full border border-line-2 px-3 py-1.5 text-[13px] text-ink-2"><span className="font-medium text-ink">{t}</span> · {w}</li>)}
              </ul>
            </Reveal>
            <Reveal delay={100} className={cx(i % 2 && 'md:order-1')}>
              <div className="relative aspect-[16/10] overflow-hidden rounded-[20px] border border-line bg-bg-1">
                {y.photo ? <img src={img(y.photo)} alt={y.items[0][0]} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  : <div className="flex h-full items-center justify-center" style={{ background: 'linear-gradient(140deg, #1b2430, #0e1218)' }}><span className="flex h-24 w-24 items-center justify-center rounded-[26px] bg-white p-5"><img src="/brand/mark.webp" alt="" className="h-full w-full" /></span></div>}
              </div>
            </Reveal>
          </li>
        );
      })}
    </ol>
  );
}

/* Leaders: a portrait, the role in one line and a short record. */
function Leader({ p }) {
  return (
    <div className="card card-hover group relative flex h-full flex-col p-5">
      <div className="flex items-center gap-4">
        <span className="block h-[84px] w-[84px] shrink-0 overflow-hidden rounded-[18px] bg-[#e3eef9] shadow-[0_10px_24px_-14px_rgb(10_94_163/.6)]">
          <img src={`/img/people/${p.img}.webp`} alt="" width="84" height="84" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" />
        </span>
        <span className="min-w-0 pr-8">
          <span className="block text-[17px] font-semibold leading-tight tracking-[-0.015em]">{p.name}</span>
          <span className="mt-1 block text-[13.5px] font-medium text-[#0a6dbb]">{p.role}</span>
        </span>
      </div>
      <p className="mt-4 flex-1 border-t border-line pt-4 text-[14px] leading-relaxed text-ink-2">{p.bio}</p>
      <a href={p.linkedin} target="_blank" rel="noreferrer" className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-[#0a66c2]/10 hover:text-[#0a66c2]" aria-label={`${p.name} on LinkedIn`}><Icon name="LinkedinLogo" size={18} /></a>
    </div>
  );
}

function Advisor({ p }) {
  return (
    <a href={p.linkedin} target="_blank" rel="noreferrer" className="group flex h-full items-start gap-3.5 rounded-[16px] border border-line p-4 transition-colors hover:border-line-2 hover:bg-fg/[.025]" aria-label={`${p.name}, ${p.role}, on LinkedIn`}>
      <img src={`/img/people/${p.img}.webp`} alt="" width="48" height="48" className="h-12 w-12 shrink-0 rounded-full bg-[#0f1115] object-cover" loading="lazy" decoding="async" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight">{p.name}<Icon name="LinkedinLogo" size={14} className="text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" /></span>
        <span className="mt-0.5 block text-[12.5px] font-medium text-cyan-2">{p.role}</span>
        <span className="mt-1.5 block text-[13px] leading-snug text-ink-3">{p.bio}</span>
      </span>
    </a>
  );
}

/* The team, rolling past: two rows in opposite directions, paused on hover. */
function TeamRoll() {
  const [paused, setPaused] = useState(false);
  const rowA = TEAM_PHOTOS.concat(RECOGNITION.slice(4).map((r) => ({ title: `${r.title}, ${r.where}`, img: r.img })));
  const rowB = [...rowA.slice(3), ...rowA.slice(0, 3)];
  // each row is its photos twice over, moved by exactly one set, so the loop has no seam
  const Row = ({ items, reverse }) => (
    <ul className={cx('marquee roll-team flex w-max', reverse && 'rev')}>
      {[...items, ...items].map((t, i) => {
        const copy = i >= items.length;
        return (
          <li key={t.img + i} className="w-[316px] shrink-0 pr-4 md:w-[396px]" aria-hidden={copy || undefined}>
            <figure>
              <img src={img(t.img)} alt={copy ? '' : t.title} className="aspect-[4/3] w-full rounded-[18px] border border-line object-cover" loading="lazy" decoding="async" />
              <figcaption className="mt-2.5 text-[13.5px] text-ink-3">{t.title}</figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
  return (
    <div className={cx('marquee-wrap relative mt-12 space-y-6 overflow-hidden', paused && 'paused')} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <Row items={rowA} />
      <Row items={rowB} reverse />
      <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} className="absolute bottom-0 right-5 inline-flex h-9 items-center gap-2 rounded-full border border-line-2 bg-bg/80 px-3.5 text-[13px] text-ink-2 backdrop-blur md:right-10">
        <Icon name={paused ? 'Play' : 'Pause'} size={13} weight="fill" />{paused ? 'Play' : 'Pause'}
      </button>
    </div>
  );
}

const TEAMS = [
  { name: 'AI engineering', icon: 'Cpu', work: 'Behaviour models that score people, machine identities and AI agents in milliseconds, and explain every score in plain language.' },
  { name: 'Security research', icon: 'Detective', work: 'Attack paths, mule networks and new identity attacks, studied in the field and written up as the reports on this site.' },
  { name: 'Product engineering', icon: 'Code', work: 'Gateways, connectors and consoles that run inside customers’ own clouds, built for banks, hospitals and government.' },
];

export default function Why() {
  return (
    <>
      <Seo title="Why Deep Algorithms: The Company and the Case for It" path="/why-deep-algorithms" description="Why banks, government and enterprises choose Deep Algorithms: one intelligence that sees every identity, learns what normal looks like and acts before damage is done. Founded in Hyderabad in 2022. Meet the team." crumbs={[{ name: 'Why Deep Algorithms', path: '/why-deep-algorithms' }]} />

      <section className="stage band-brand hero-under relative overflow-hidden" data-page-name="Why Deep Algorithms">
        <div className="wrap relative grid items-center gap-14 pb-20 pt-10 lg:min-h-[min(84svh,820px)] lg:grid-cols-[1.05fr_1fr] lg:gap-10">
          <div className="max-md:text-center">
            <Breadcrumb items={[{ name: 'Why Deep Algorithms' }]} className="rise mb-8 max-md:justify-center" />
            <p className="eyebrow rise">Why Deep Algorithms</p>
            <h1 className="t-hero rise mt-7" style={{ '--d': '80ms' }}>The defence has to be as intelligent as the attack.</h1>
            <p className="t-lead rise mt-7 max-w-[560px] max-md:mx-auto" style={{ '--d': '160ms' }}>Attackers adopted AI, automation and stolen identities. We build products that learn your environment, decide in the moment and explain every decision, for organisations that cannot afford a breach.</p>
            <dl className="rise mt-10 grid max-w-[320px] grid-cols-2 gap-x-8 max-md:mx-auto" style={{ '--d': '240ms' }}>
              {[['Founded', SITE.founded], ['Headquarters', 'Hyderabad']].map(([k, v]) => (
                <div key={k}><dt className="text-[13px] text-ink-3">{k}</dt><dd className="mt-1 text-[24px] font-semibold tracking-[-0.03em] num">{v}</dd></div>
              ))}
            </dl>
          </div>
          <ProductPanel />
        </div>
      </section>


      <section className="sec" aria-labelledby="story-h">
        <div className="wrap">
          <p className="eyebrow">Our story</p>
          <h2 id="story-h" className="t-h2 mt-6 max-w-[760px]">We don’t sell security products. We build defence that thinks.</h2>
          <div className="mt-12 max-w-[1040px]"><Statement /></div>
          <Years />
        </div>
      </section>

      <section className="sec" aria-labelledby="cmp-h">
        <div className="wrap">
          <SectionHead id="cmp-h" eyebrow="The difference" title="Built for the attack that looks legitimate." />
          <Reveal className="mt-12">
            <Compare caption="Deep Algorithms compared with rule-based and periodic security tools" cols={['Rule-based tools', 'Periodic reviews', 'Deep Algorithms']} rows={[
              ['Catches valid logins used by the wrong person', false, false, true],
              ['Covers machine identities and AI agents', 'Rarely', 'Partly', true],
              ['Acts before the action completes', 'Sometimes', false, true],
              ['Explains each decision', false, 'In a report', 'In plain language'],
              ['Evidence for regulators', 'Raw logs', 'Point in time', 'Continuous'],
            ]} />
          </Reveal>
        </div>
      </section>

      <section className="sec" aria-labelledby="bel-h">
        <div className="wrap">
          <SectionHead align="left" id="bel-h" eyebrow="What we believe" title="Not values on a wall. Constraints on every line of code." />
          <ol className="mt-12 grid gap-x-12 md:grid-cols-2 lg:grid-cols-3">
            {BELIEFS.map((b, i) => (
              <Reveal as="li" key={b.title} delay={(i % 3) * 70} className="border-t border-line py-7">
                <Icon name={b.icon} size={24} className="text-cyan-2" />
                <span className="mt-4 block text-[19px] font-semibold tracking-[-0.02em]">{b.title}</span>
                <span className="mt-2 block text-[15.5px] leading-relaxed text-ink-2">{b.body}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section id="leadership" className="sec scroll-mt-20" aria-labelledby="lead-h">
        <div className="wrap">
          <SectionHead align="left" id="lead-h" eyebrow="Leadership" title="Decades in AI, banking and security, in one team." lead="Founders, operators and researchers from IIT, IIM, IIIT and Imperial College London." />
          <div className="m-rail mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{LEADERS.map((p, i) => <Reveal key={p.name} delay={i * 70} className="h-full"><Leader p={p} /></Reveal>)}</div>
          <h3 className="mt-20 text-[24px] font-semibold tracking-[-0.02em]">Advisors and mentors</h3>
          <p className="mt-2 text-[16px] text-ink-2">Leaders from banking regulation, investment, technology and research who guide our work.</p>
          <div className="m-rail m-rail-sm mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{ADVISORS.map((p, i) => <Reveal key={p.name} delay={(i % 4) * 60} className="h-full"><Advisor p={p} /></Reveal>)}</div>
        </div>
      </section>

      {/* the founder, in his own published words */}
      <section className="sec-tight" aria-label="From our founder">
        <div className="wrap">
          <figure className="island island-blue tone-d relative grid items-center gap-8 overflow-hidden p-8 md:grid-cols-[auto_1fr] md:gap-12 md:p-14">
            <img src={`/img/people/${FOUNDER_QUOTE.img}.webp`} alt="" width="200" height="200" className="relative h-[150px] w-[150px] rounded-[28px] object-cover shadow-[0_24px_50px_-20px_rgb(0_0_0/.6)] ring-4 ring-white/15 md:h-[200px] md:w-[200px]" loading="lazy" decoding="async" />
            <div className="relative">
              <blockquote className="text-[clamp(22px,2.4vw,32px)] font-semibold leading-[1.25] tracking-[-0.02em] text-white">“{FOUNDER_QUOTE.text}”</blockquote>
              <figcaption className="mt-6 text-[15px] text-white/80"><b className="font-semibold text-white">{FOUNDER_QUOTE.name}</b>, {FOUNDER_QUOTE.role} · <a href={FOUNDER_QUOTE.href} target="_blank" rel="noreferrer" className="underline decoration-white/40 underline-offset-4 hover:text-white">{FOUNDER_QUOTE.source}</a></figcaption>
            </div>
          </figure>
        </div>
      </section>

      <section id="news" className="sec scroll-mt-20" aria-labelledby="news-h">
        <div className="wrap">
          <SectionHead align="left" id="news-h" eyebrow="In the news" title="Patented, published and in the room with banks." lead="What we have been doing lately, each with a link to where it was published. Backed by a ₹16 crore pre-Series A led by Unicorn India Ventures." />
          <div className="mt-12"><NewsCards items={NEWS} /></div>
        </div>
      </section>

      <section id="recognition" className="sec scroll-mt-20" aria-labelledby="rec-h">
        <div className="wrap">
          <SectionHead align="left" id="rec-h" eyebrow="Recognition" title="Recognised, certified and in production." />
          <div className="m-rail mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {RECOGNITION.slice(0, 4).map((r, i) => (
              <Reveal key={r.title} delay={(i % 4) * 60} className={cx('card group overflow-hidden', i === 0 && 'sm:col-span-2 lg:row-span-2')}>
                <div className={cx('overflow-hidden', i === 0 ? 'aspect-[4/3]' : 'aspect-[16/10]')}><img src={img(r.img)} alt={`${r.title}, ${r.where}`} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" decoding="async" /></div>
                <div className="p-5"><p className={cx('font-semibold tracking-[-0.015em]', i === 0 ? 'text-[22px]' : 'text-[16px]')}>{r.title}</p><p className="mt-1 text-[13.5px] text-ink-3">{r.where} · {r.year}</p></div>
              </Reveal>
            ))}
            <Reveal delay={240}>
              <a href={SITE.linkedin} target="_blank" rel="noreferrer" className="card card-hover group flex h-full min-h-[220px] flex-col justify-between p-6" style={{ background: 'linear-gradient(150deg, color-mix(in oklab, #0a66c2 12%, transparent), transparent 70%)' }}>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#0a66c2] text-white"><Icon name="LinkedinLogo" size={26} weight="fill" /></span>
                <span>
                  <span className="block text-[19px] font-semibold tracking-[-0.015em]">See more on LinkedIn</span>
                  <span className="mt-1.5 block text-[14px] leading-snug text-ink-3">Every award, event and team moment, as it happens.</span>
                  <span className="link mt-4 text-[14.5px]">Follow Deep Algorithms<Icon name="ArrowUpRight" size={14} weight="bold" /></span>
                </span>
              </a>
            </Reveal>
          </div>
          <Reveal className="mt-10"><CertStrip /></Reveal>
        </div>
      </section>

      <section className="stage sec overflow-hidden" aria-labelledby="life-h">
        <div className="wrap">
          <SectionHead align="left" id="life-h" eyebrow="The team" title="Life at Deep Algorithms." lead="At conferences, on stage and in the room where problems get solved." />
        </div>
        <TeamRoll />
      </section>

      <section id="careers" className="sec scroll-mt-20" aria-labelledby="car-h">
        <div className="wrap">
          <Reveal className="card overflow-hidden p-8 md:p-14">
            <div className="grid items-end gap-10 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <p className="eyebrow">Careers</p>
                <h2 id="car-h" className="t-h2 mt-6">Build the defence attackers have to think about.</h2>
                <p className="t-lead mt-5">We are looking for AI engineers, security researchers and product builders. Tell us what you want to work on.</p>
              </div>
              <div className="flex flex-col items-start gap-3 lg:items-end">
                <Button href={`mailto:${SITE.careersEmail}`} size="lg" arrow>Write to {SITE.careersEmail}</Button>
                <p className="text-[14px] text-ink-3">Hyderabad · Bengaluru · Plano, Texas</p>
              </div>
            </div>
            <ul className="m-rail mt-12 grid gap-4 md:grid-cols-3">
              {TEAMS.map((t) => (
                <li key={t.name} className="flex flex-col rounded-[18px] border border-line p-6">
                  <Icon name={t.icon} size={24} className="text-cyan-2" />
                  <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.015em]">{t.name}</h3>
                  <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-2">{t.work}</p>
                  <a href={`mailto:${SITE.careersEmail}?subject=${encodeURIComponent(`Careers: ${t.name}`)}`} className="link mt-5 text-[14.5px]">Write to us about this<Icon name="ArrowRight" size={13} weight="bold" /></a>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="sec pt-0" aria-labelledby="off-h">
        <div className="wrap">
          <SectionHead align="left" id="off-h" eyebrow="Offices" title="Where to find us." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {SITE.offices.map((o, i) => (
              <Reveal key={o.city} delay={i * 70} className="card flex flex-col p-7">
                <p className="text-[12.5px] font-semibold uppercase tracking-[.1em] text-cyan-2">{o.label}</p>
                <p className="mt-3 text-[24px] font-semibold tracking-[-0.025em]">{o.city}</p>
                <p className="mt-3 flex-1 text-[15.5px] leading-relaxed text-ink-2">{o.address}</p>
                {o.map && <a href={o.map} target="_blank" rel="noreferrer" className="link mt-5 text-[14.5px]">Open in Maps<Icon name="ArrowUpRight" size={14} weight="bold" /></a>}
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-[15px] text-ink-2">Evaluating a product? <Link to="/request-demo" className="link">Book a demo<Icon name="ArrowRight" size={13} weight="bold" /></Link></p>
        </div>
      </section>

      <LogoMarquee />
      <CtaBand title="See the difference on your own identities." />
    </>
  );
}
