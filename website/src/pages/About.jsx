import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { LINES, SITE } from '../data/site.js';
import { LEADERS, ADVISORS, RECOGNITION, TEAM_PHOTOS, BELIEFS } from '../data/company.js';
import { Breadcrumb, Button, Heading, Icon, Reveal, Section, cx } from '../components/ui.jsx';
import { CtaPanel, LogoBand } from '../components/blocks.jsx';
import { useInView, useReducedMotion } from '../components/visuals/kit.jsx';

const Linked = ({ p }) => (
  <a href={p.linkedin} target="_blank" rel="noreferrer" aria-label={`${p.name} on LinkedIn`} className="shrink-0 text-ink-3 hover:text-brand"><Icon name="LinkedinLogo" size={20} /></a>
);

function Leader({ p }) {
  return (
    <div className="flex gap-5 rounded-[20px] border border-line bg-white p-5">
      <img src={`/img/people/${p.img}.webp`} alt={`${p.name}, ${p.role}`} width="112" height="112" loading="lazy" decoding="async" className="h-[104px] w-[104px] shrink-0 rounded-[16px] bg-frame object-cover object-top sm:h-[112px] sm:w-[112px]" />
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div><h3 className="font-display text-[20px] font-normal leading-tight tracking-[-0.01em] text-ink">{p.name}</h3><p className="mt-0.5 text-[14px] font-medium text-brand">{p.role}</p></div>
          <Linked p={p} />
        </div>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{p.bio}</p>
      </div>
    </div>
  );
}

function Advisor({ p }) {
  return (
    <div className="rounded-[16px] border border-line bg-white p-4">
      <div className="flex items-center gap-3">
        <img src={`/img/people/${p.img}.webp`} alt={`${p.name}, ${p.role}`} width="56" height="56" loading="lazy" decoding="async" className="h-14 w-14 shrink-0 rounded-full bg-frame object-cover" />
        <div className="min-w-0 flex-1"><h3 className="text-[16px] font-medium leading-tight text-ink">{p.name}</h3><p className="mt-0.5 text-[13px] text-brand">{p.role}</p></div>
        <Linked p={p} />
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-3">{p.bio}</p>
    </div>
  );
}

/* Recognition: one featured photo beside a 2 x 2 of smaller ones, then the rest in a row. */
function Recognition({ items }) {
  const [first, ...rest] = items;
  const small = rest.slice(0, 4), last = rest.slice(4);
  const photo = 'h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]';
  return (
    <div className="mx-auto mt-12 grid max-w-[1040px] grid-cols-2 gap-5 lg:grid-cols-4">
      <Reveal as="figure" className="group col-span-2 lg:row-span-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-frame shadow-[0_18px_40px_-26px_rgba(6,47,87,.5)] lg:aspect-auto lg:h-[calc(100%-4px)] lg:min-h-[400px]">
          <img src={`/img/events/${first.img}.webp`} alt={`${first.title}, ${first.where}, ${first.year}`} width="800" height="600" loading="lazy" decoding="async" className={photo} />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#06182f]/85 via-[#06182f]/40 to-transparent p-5 pt-16 text-white">
            <p className="text-[12.5px] font-medium uppercase tracking-[.12em] text-cyan">{first.where} · {first.year}</p>
            <p className="mt-1 font-display text-[22px] font-light leading-snug">{first.title}</p>
          </div>
        </div>
      </Reveal>
      {small.map((r, i) => (
        <Reveal as="figure" key={r.title} delay={(i + 1) * 70} className="group">
          <div className="aspect-[4/3] overflow-hidden rounded-[18px] bg-frame transition-shadow duration-500 group-hover:shadow-[0_18px_36px_-22px_rgba(6,47,87,.55)]">
            <img src={`/img/events/${r.img}.webp`} alt={`${r.title}, ${r.where}, ${r.year}`} width="400" height="300" loading="lazy" decoding="async" className={photo} />
          </div>
          <figcaption className="mt-3 text-[14.5px] font-medium leading-snug text-ink">{r.title}<span className="mt-0.5 block text-[13px] font-normal text-ink-3">{r.where} · {r.year}</span></figcaption>
        </Reveal>
      ))}
      {last.map((r, i) => (
        <Reveal as="figure" key={r.title} delay={(i + 5) * 70} className="group">
          <div className="aspect-[4/3] overflow-hidden rounded-[18px] bg-frame transition-shadow duration-500 group-hover:shadow-[0_18px_36px_-22px_rgba(6,47,87,.55)]">
            <img src={`/img/events/${r.img}.webp`} alt={`${r.title}, ${r.where}, ${r.year}`} width="400" height="300" loading="lazy" decoding="async" className={photo} />
          </div>
          <figcaption className="mt-3 text-[14.5px] font-medium leading-snug text-ink">{r.title}<span className="mt-0.5 block text-[13px] font-normal text-ink-3">{r.where} · {r.year}</span></figcaption>
        </Reveal>
      ))}
      <Reveal delay={600} className="col-span-2 flex flex-col justify-center rounded-[18px] bg-navy p-7 text-white">
        <p className="font-display text-[22px] font-light leading-snug">More from the field</p>
        <p className="mt-1.5 text-[14.5px] text-white/75">Talks, awards and conferences, as they happen.</p>
        <a href={SITE.linkedin} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-[15px] font-medium text-cyan hover:text-white"><Icon name="LinkedinLogo" size={20} />Follow us on LinkedIn<Icon name="ArrowUpRight" size={14} /></a>
      </Reveal>
    </div>
  );
}

/* A slow, endless row of team photos. Hover or the button pauses it; reduced motion gets a plain scrolling row. */
function PhotoRow({ items }) {
  const [paused, setPaused] = useState(false);
  const card = (t, k, hidden) => (
    <li key={`${k}${t.title}`} className="w-[270px] shrink-0 sm:w-[310px]" aria-hidden={hidden || undefined}>
      <figure className="group">
        <div className="aspect-[4/3] overflow-hidden rounded-[20px] bg-frame shadow-[0_14px_34px_-24px_rgba(6,47,87,.5)]">
          <img src={`/img/events/${t.img}.webp`} alt="" width="400" height="300" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]" />
        </div>
        <figcaption className="mt-3 text-[14px] leading-snug text-ink-3">{t.title}</figcaption>
      </figure>
    </li>
  );
  return (
    <div className="relative mt-12">
      <div className="marquee-wrap overflow-hidden motion-reduce:overflow-x-auto" style={{ WebkitMaskImage: 'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)', maskImage: 'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)' }}>
        <ul className="marquee flex w-max gap-5 pr-5" style={{ animationDuration: '55s', animationPlayState: paused ? 'paused' : undefined }}>
          {items.map((t) => card(t, 'a', false))}
          {items.map((t) => card(t, 'b', true))}
        </ul>
      </div>
      <div className="mt-6 flex justify-center">
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-[14px] text-ink-2 transition-colors hover:border-brand hover:text-brand motion-reduce:hidden">
          <Icon name={paused ? 'Play' : 'Pause'} size={14} weight="fill" />{paused ? 'Play the photo row' : 'Pause the photo row'}
        </button>
      </div>
    </div>
  );
}

const FACTS = [['Founded', '2022'], ['Headquarters', 'Hyderabad, India'], ['Offices', 'Hyderabad · Bengaluru · Maryland'], ['Focus', 'Identity security for the AI era']];

/* Interactive photo deck: tap a card to bring it forward; advances by itself while in view and not hovered. */
const DECK = ['dsci-excellence', 'business-excellence-award', 'gitex-dubai', 'cyber-bureau-training'].map((k) => RECOGNITION.find((r) => r.img === k));
const SLOT = [
  'z-40 translate-x-0 translate-y-0 rotate-0 scale-100',
  'z-30 translate-x-[8%] -translate-y-[5%] rotate-[5deg] scale-[.93] opacity-90',
  'z-20 -translate-x-[8%] -translate-y-[8%] -rotate-[5deg] scale-[.88] opacity-80',
  'z-10 translate-y-[-12%] scale-[.83] opacity-0',
];
function PhotoDeck() {
  const [front, setFront] = useState(0);
  const [hold, setHold] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (hold || reduce || !inView) return undefined;
    const t = setInterval(() => setFront((f) => (f + 1) % DECK.length), 4200);
    return () => clearInterval(t);
  }, [hold, reduce, inView]);
  const cur = DECK[front];
  return (
    <div ref={ref} onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)} className="mx-auto w-full max-w-[520px]">
      <div className="relative aspect-[4/3] w-full [perspective:1400px]">
        {DECK.map((d, i) => (
          <button key={d.img} type="button" onClick={() => setFront(i)} aria-label={`${d.title}, ${d.where}, ${d.year}`} aria-pressed={i === front}
            className={cx('absolute inset-0 overflow-hidden rounded-[24px] bg-frame shadow-[0_30px_60px_-28px_rgba(6,47,87,.55)] ring-1 ring-black/5 transition-all duration-700 ease-[cubic-bezier(.2,.8,.2,1)]', SLOT[(i - front + DECK.length) % DECK.length])}>
            <img src={`/img/events/${d.img}.webp`} alt="" width="800" height="600" loading={i === 0 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p key={front} className="fadein min-w-0 text-[15px] text-ink-2"><span className="font-medium text-ink">{cur.title}</span><span className="block truncate text-ink-3">{cur.where}, {cur.year}</span></p>
        <div className="flex gap-2" role="group" aria-label="Choose photo">
          {DECK.map((d, i) => <button key={d.img} type="button" onClick={() => setFront(i)} aria-label={`Show ${d.title}`} aria-pressed={i === front} className="inline-flex h-6 w-6 items-center justify-center"><span className={cx('h-2 rounded-full transition-all', i === front ? 'w-6 bg-brand' : 'w-2 bg-line-2')} /></button>)}
        </div>
      </div>
    </div>
  );
}

export default function About() {
  return (
    <>
      <Seo title="About Us: The Team Behind Deep Algorithms" path="/about-us" crumbs={[{ name: 'About us', path: '/about-us' }]}
        description="Deep Algorithms is an AI-native cybersecurity company founded in 2022 and headquartered in Hyderabad. Meet the leaders and advisors building identity security for the AI era." />

      <section className="overflow-x-clip pb-6 pt-8 md:pt-14">
        <div className="wrap">
          <Breadcrumb items={[{ name: 'About us' }]} />
          <div className="mt-8 grid items-center gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <div>
              <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-white/80 px-3.5 py-1.5 text-[14px] font-medium text-brand backdrop-blur"><img src="/brand/mark.webp" alt="" width="16" height="16" className="h-4 w-4" />About Deep Algorithms</p>
              <h1 className="t-h1 rise mt-5">We build defence that <em className="accent text-brand">thinks.</em></h1>
              <p className="rise mt-6 max-w-[540px] text-[18px] leading-relaxed text-ink-2" style={{ animationDelay: '80ms' }}>
                An AI-native cybersecurity company, founded in Hyderabad in 2022. We secure every human, machine and AI agent identity, and stop the bots and data misuse that follow.
              </p>
              <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '160ms' }}>
                <Button to="/request-demo">Book a demo</Button>
                <Button href="#leadership" variant="outline">Meet the team</Button>
              </div>
            </div>
            <PhotoDeck />
          </div>
          <dl className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FACTS.map(([k, v], i) => (
              <Reveal key={k} delay={i * 70} data-tilt className="rounded-[20px] border border-line bg-white/85 p-6 backdrop-blur hover: hover:border-brand hover:shadow-[0_18px_40px_-24px_rgba(6,47,87,.45)]">
                <dt className="text-[13.5px] text-ink-3">{k}</dt><dd className="mt-1 font-display text-[22px] font-light leading-snug text-ink">{v}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      <Section>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <div>
            <Heading align="left" eyebrow="Our story" title="The defence must be as intelligent as the attack" />
            <blockquote className="mt-8 border-l-2 border-coral pl-5 font-display text-[22px] font-light leading-snug text-ink">“We don’t sell security products. We build defence that thinks.”</blockquote>
          </div>
          <Reveal className="space-y-5 text-[17px] leading-relaxed text-ink-2">
            <p>Deep Algorithms was founded on one observation: the threat landscape changed fundamentally when attackers adopted AI. Bots that mimic people. Identity compromises that drift unseen for months. Data access that looks exactly like legitimate work. Tools built for a rule-based world cannot keep pace.</p>
            <p>So we set out to build a new class of security intelligence: one that learns your environment, understands what normal looks like in your context, and detects the deviation before it becomes a breach.</p>
          </Reveal>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LINES.map((l, i) => (
            <Reveal key={l.key} delay={i * 60}>
              <Link to={l.path} className="group flex h-full flex-col rounded-[20px] border border-line p-6 transition-colors hover:border-brand">
                <Icon name={l.icon} size={26} weight="light" className="text-brand" />
                <h3 className="mt-4 font-display text-[20px] font-normal text-ink">{l.name}</h3>
                <p className="mt-1 text-[14.5px] text-ink-3">{l.summary}</p>
                <span className="mt-auto pt-5 text-[14px] font-medium text-brand group-hover:text-navy">Explore<Icon name="ArrowRight" size={14} className="ml-1 inline" /></span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <LogoBand band title="Trusted by those who can’t afford to get it wrong" />

      <Section id="leadership" className="scroll-mt-16">
        <Heading eyebrow="Leadership" title="The people building it" lead="Founders and operators with decades in AI, banking, cloud and cybersecurity." />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {LEADERS.map((p, i) => <Reveal key={p.name} delay={(i % 2) * 70}><Leader p={p} /></Reveal>)}
        </div>
        <h2 className="t-h3 mt-16 text-center">Advisors and mentors</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ADVISORS.map((p, i) => <Reveal key={p.name} delay={(i % 4) * 60}><Advisor p={p} /></Reveal>)}
        </div>
      </Section>

      <Section tone="mist">
        <Heading eyebrow="Our beliefs" title="The principles we build to" lead="Not values on a wall. Constraints on every line of code." />
        <div className="mx-auto mt-14 grid max-w-[1040px] gap-5 md:grid-cols-2 lg:grid-cols-3">
          {BELIEFS.map((b, i) => (
            <Reveal key={b.title} delay={(i % 3) * 80}>
              <div className="group h-full rounded-[22px] bg-white p-7 shadow-[0_1px_2px_rgba(11,18,32,.04)] ring-1 ring-line/70 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_22px_44px_-26px_rgba(6,47,87,.45)] hover:ring-brand/30">
                <span className={cx('inline-flex h-12 w-12 items-center justify-center rounded-[14px] text-white shadow-[0_8px_18px_-8px_rgba(0,104,172,.7)] transition-transform duration-500 group-hover:scale-105', i % 3 === 1 ? 'bg-gradient-to-br from-[#f47a64] to-coral shadow-[0_8px_18px_-8px_rgba(240,100,77,.7)]' : 'bg-gradient-to-br from-[#1a86cf] to-brand')}><Icon name={b.icon} size={23} weight="light" /></span>
                <h3 className="t-h3 mt-5">{b.title}</h3>
                <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{b.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <Heading eyebrow="Recognition" title="Built to win. Recognised for it." />
        <Recognition items={RECOGNITION} />
      </Section>

      <Section tone="mist">
        <Heading eyebrow="The team" title="Outside the build" lead="At conferences, on stage and in the room where problems get solved." />
        <PhotoRow items={TEAM_PHOTOS} />
      </Section>

      <Section id="careers" className="scroll-mt-16">
        <div className="grid grid-cols-1 items-center gap-10 rounded-[40px] border border-line p-8 md:p-14 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="eyebrow mb-3">Careers</p>
            <h2 className="t-h2">Work on the hardest problems in security</h2>
            <p className="t-lead mt-5">We are looking for AI engineers, security researchers and product builders. Tell us what you want to work on.</p>
          </div>
          <div className="lg:text-right">
            <Button href={`mailto:${SITE.careersEmail}`} arrow>{SITE.careersEmail}</Button>
          </div>
        </div>
      </Section>

      <Section tone="mist">
        <Heading eyebrow="Offices" title="Where to find us" />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {SITE.offices.map((o, i) => (
            <Reveal key={o.city} delay={i * 70} className="rounded-[20px] bg-white p-7">
              <Icon name="MapPin" size={26} weight="light" className="text-brand" />
              <h3 className="t-h3 mt-5">{o.city}</h3>
              <p className="text-[13px] font-medium text-ink-3">{o.label}</p>
              <p className="mt-3 text-ink-2">{o.address}</p>
              {o.map && <a href={o.map} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-[15px] font-medium text-brand hover:text-navy">Open in Maps<Icon name="ArrowUpRight" size={14} /></a>}
            </Reveal>
          ))}
        </div>
      </Section>

      <CtaPanel title="Talk to the team" body="Evaluating a platform, exploring a partnership, or curious how we approach security differently? We are easy to reach." />
    </>
  );
}
