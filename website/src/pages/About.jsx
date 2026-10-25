import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { LEADERS, ADVISORS, RECOGNITION, TEAM_PHOTOS, BELIEFS } from '../data/company.js';
import { Breadcrumb, Button, Heading, Icon, IconTile, Reveal, Section, cx } from '../components/ui.jsx';
import { CtaPanel, LogoBand } from '../components/blocks.jsx';

function PersonCard({ p, big }) {
  return (
    <div>
      <img src={`/img/people/${p.img}.webp`} alt={`${p.name}, ${p.role}`} width="480" height="480" loading="lazy" decoding="async"
        className="aspect-square w-full rounded-[20px] bg-frame object-cover" />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className={cx('font-display font-normal tracking-[-0.01em] text-ink', big ? 'text-[22px]' : 'text-[18px]')}>{p.name}</h3>
          <p className="text-[14px] font-medium text-brand">{p.role}</p>
        </div>
        <a href={p.linkedin} target="_blank" rel="noreferrer" aria-label={`${p.name} on LinkedIn`} className="mt-1 text-ink-3 hover:text-brand"><Icon name="LinkedinLogo" size={22} /></a>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">{p.bio}</p>
    </div>
  );
}

const FACTS = [['Founded', '2022'], ['Headquarters', 'Hyderabad, India'], ['Offices', 'Hyderabad · Bengaluru · Maryland'], ['Focus', 'Identity security for the AI era']];

export default function About() {
  return (
    <>
      <Seo title="About Us: The Team Behind Deep Algorithms" path="/about-us" crumbs={[{ name: 'About us', path: '/about-us' }]}
        description="Deep Algorithms is an AI-native cybersecurity company headquartered in Hyderabad, founded in 2022. Meet the leaders and advisors building identity security for the AI era." />

      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="rounded-[40px] bg-navy px-6 py-16 text-center md:px-14 md:py-24">
            <div className="flex justify-center"><Breadcrumb light items={[{ name: 'About us' }]} /></div>
            <p className="rise mt-8 text-[15px] font-medium text-cyan">About Deep Algorithms</p>
            <h1 className="t-h1 rise mx-auto mt-3 max-w-[860px] text-white">Proactive defence for a digital-first world</h1>
            <p className="rise mx-auto mt-6 max-w-[680px] text-[17px] leading-relaxed text-white/85 md:text-[19px]" style={{ animationDelay: '80ms' }}>
              We are an AI-native cybersecurity company headquartered in Hyderabad. We build platforms that learn continuously, respond autonomously and get smarter with every threat they see.
            </p>
          </div>
        </div>
      </section>

      <Section>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
          <div>
            <Heading align="left" eyebrow="Our story" title="The defence must be as intelligent as the attack" />
            <Reveal className="mt-8 space-y-5 text-[17px] leading-relaxed text-ink-2">
              <p>Deep Algorithms was founded on one observation: the threat landscape changed fundamentally when attackers adopted AI. Bots that mimic people. Identity compromises that drift unseen for months. Data access that looks exactly like legitimate work. Tools built for a rule-based world cannot keep pace.</p>
              <p>So we set out to build a new class of security intelligence: one that learns your environment, understands what normal looks like in your context, and detects the deviation before it becomes a breach.</p>
              <p>Today that work spans Zenstra AI for AI agents, adapID AI for human and machine identities, BotShield AI for bots and exposure, and the ICMS Compliance Suite for data protection.</p>
            </Reveal>
          </div>
          <Reveal className="self-start rounded-[20px] bg-mist p-8">
            <dl className="divide-y divide-line">
              {FACTS.map(([k, v]) => (
                <div key={k} className="py-4 first:pt-0 last:pb-0"><dt className="text-[13px] text-ink-3">{k}</dt><dd className="mt-1 text-[17px] text-ink">{v}</dd></div>
              ))}
            </dl>
            <blockquote className="mt-8 border-l-2 border-coral pl-5 font-display text-[22px] font-light leading-snug text-ink">“We don’t sell security products. We build defence that thinks.”</blockquote>
          </Reveal>
        </div>
      </Section>

      <LogoBand band title="Trusted by those who can’t afford to get it wrong" />

      <Section>
        <Heading eyebrow="Leadership" title="The people building it" />
        <div className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
          {LEADERS.map((p, i) => <Reveal key={p.name} delay={i * 70}><PersonCard p={p} big /></Reveal>)}
        </div>
        <h2 className="t-h3 mt-20 text-center">Advisors and mentors</h2>
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          {ADVISORS.map((p, i) => <Reveal key={p.name} delay={(i % 4) * 70}><PersonCard p={p} /></Reveal>)}
        </div>
      </Section>

      <Section tone="mist">
        <Heading eyebrow="Our beliefs" title="The principles we build to" lead="Not values on a wall. Constraints on every line of code." />
        <div className="mt-14 grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {BELIEFS.map((b, i) => (
            <Reveal key={b.title} delay={(i % 3) * 70}>
              <IconTile name={b.icon} size={48} tone={i % 3 === 1 ? 'coral' : 'blue'} />
              <h3 className="t-h3 mt-5">{b.title}</h3>
              <p className="mt-2 text-ink-2">{b.body}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <Heading eyebrow="Recognition" title="Built to win. Recognised for it." />
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {RECOGNITION.map((r, i) => (
            <Reveal key={r.title} delay={(i % 4) * 70} className={cx(i === 0 && 'sm:col-span-2 sm:row-span-2')}>
              <img src={`/img/events/${r.img}.webp`} alt={`${r.title}, ${r.where}, ${r.year}`} loading="lazy" decoding="async"
                className={cx('w-full rounded-[20px] bg-frame object-cover', i === 0 ? 'aspect-[4/3] sm:aspect-auto sm:h-[calc(100%-64px)]' : 'aspect-[4/3]')} />
              <h3 className="mt-3 font-medium text-ink">{r.title}</h3>
              <p className="text-[14px] text-ink-3">{r.where} · {r.year}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section tone="mist">
        <Heading eyebrow="The team" title="Outside the build" lead="At conferences, on stage and in the room where problems get solved." />
        <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
          {TEAM_PHOTOS.map((t, i) => (
            <Reveal as="figure" key={t.title} delay={(i % 3) * 70}>
              <img src={`/img/events/${t.img}.webp`} alt={t.title} loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-[20px] bg-frame object-cover" />
              <figcaption className="mt-3 text-[14px] text-ink-3">{t.title}</figcaption>
            </Reveal>
          ))}
        </div>
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
