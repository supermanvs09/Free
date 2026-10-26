import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { LINES, SITE } from '../data/site.js';
import { LEADERS, ADVISORS, RECOGNITION, TEAM_PHOTOS, BELIEFS } from '../data/company.js';
import { Breadcrumb, Button, Heading, Icon, IconTile, Reveal, Section } from '../components/ui.jsx';
import { CtaPanel, LogoBand } from '../components/blocks.jsx';

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

/* Rows of equal, modest photos; a short last row is centred rather than left with a hole. */
function Gallery({ items }) {
  return (
    <div className="mt-12 flex flex-wrap justify-center gap-x-5 gap-y-8">
      {items.map((r, i) => (
        <Reveal as="figure" key={r.title} delay={(i % 4) * 60} className="w-full sm:w-[calc(50%-10px)] lg:w-[calc(25%-15px)]">
          <img src={`/img/events/${r.img}.webp`} alt={r.where ? `${r.title}, ${r.where}, ${r.year}` : r.title} width="400" height="300" loading="lazy" decoding="async" className="aspect-[4/3] w-full rounded-[16px] bg-frame object-cover" />
          <figcaption className="mt-3 text-[15px] font-medium leading-snug text-ink">{r.title}{r.where && <span className="mt-0.5 block text-[13.5px] font-normal text-ink-3">{r.where} · {r.year}</span>}</figcaption>
        </Reveal>
      ))}
    </div>
  );
}

const FACTS = [['Founded', '2022'], ['Headquarters', 'Hyderabad, India'], ['Offices', 'Hyderabad · Bengaluru · Maryland'], ['Focus', 'Identity security for the AI era']];

export default function About() {
  return (
    <>
      <Seo title="About Us: The Team Behind Deep Algorithms" path="/about-us" crumbs={[{ name: 'About us', path: '/about-us' }]}
        description="Deep Algorithms is an AI-native cybersecurity company founded in 2022 and headquartered in Hyderabad. Meet the leaders and advisors building identity security for the AI era." />

      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="grid items-center gap-10 rounded-[40px] bg-navy px-6 py-12 md:px-14 md:py-20 lg:grid-cols-[1.3fr_.7fr] lg:gap-16">
            <div>
              <Breadcrumb light items={[{ name: 'About us' }]} />
              <p className="rise mt-8 text-[15px] font-medium text-cyan">About Deep Algorithms</p>
              <h1 className="t-h1 rise mt-3 text-white">We build defence that thinks.</h1>
              <p className="rise mt-6 max-w-[600px] text-[17px] leading-relaxed text-white/85 md:text-[19px]" style={{ animationDelay: '80ms' }}>
                Deep Algorithms is an AI-native cybersecurity company, founded in Hyderabad in 2022. We secure every human, machine and AI agent identity, and stop the bots and data misuse that follow.
              </p>
              <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '160ms' }}>
                <Button to="/request-demo" variant="white">Book a demo</Button>
                <Button href="#leadership" variant="ghostWhite">Meet the team</Button>
              </div>
            </div>
            <div className="rise rounded-[24px] bg-white p-7 md:p-8" style={{ animationDelay: '200ms' }}>
              <img src="/brand/mark.webp" alt="" width="56" height="56" className="h-14 w-14" />
              <dl className="mt-6 divide-y divide-line">
                {FACTS.map(([k, v]) => (
                  <div key={k} className="py-3.5 first:pt-0 last:pb-0"><dt className="text-[13px] text-ink-3">{k}</dt><dd className="mt-0.5 text-[17px] text-ink">{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
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
        <div className="mt-14 grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {BELIEFS.map((b, i) => (
            <Reveal key={b.title} delay={(i % 3) * 70}>
              <IconTile name={b.icon} size={48} />
              <h3 className="t-h3 mt-5">{b.title}</h3>
              <p className="mt-2 text-ink-2">{b.body}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section>
        <Heading eyebrow="Recognition" title="Built to win. Recognised for it." />
        <Gallery items={RECOGNITION} />
      </Section>

      <Section tone="mist">
        <Heading eyebrow="The team" title="Outside the build" lead="At conferences, on stage and in the room where problems get solved." />
        <Gallery items={TEAM_PHOTOS} />
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
