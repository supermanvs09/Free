import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { LEADERS, ADVISORS, RECOGNITION, TEAM_PHOTOS, NEWS, FOUNDER_QUOTE } from '../data/company.js';
import { Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { ArrowLink, CtaBand, PageHero, Section } from '../components/ds.jsx';

const YEARS = [
  ['2022', 'Founded in Hyderabad', 'Deep Algorithms starts from one observation: attackers had adopted AI, and the tools defending against them had not.', ['Company founded, Hyderabad']],
  ['2024', 'On the national stage', 'Work on identity and data security reaches government and industry forums across India.', ['Bharat Mandapam, Delhi', 'CCoE DSCI Chapter Meet, Hyderabad', 'Cybersecurity and Privacy conference, Telangana']],
  ['2025', 'Recognised for the work', 'Awards from the Data Security Council of India and industry bodies, and an international stage in Dubai.', ['Cybersecurity Excellence, DSCI', 'Business Excellence Award', 'GITEX GLOBAL × Expand North Star, Dubai']],
  ['2026', 'Growing the company', 'Pre-Series A funding, a patent granted, a new office and Zenstra AI shown in the United States.', ['₹16 crore pre-Series A, led by Unicorn India Ventures', 'Patent granted for multi-domain fraud detection', 'New office, Hyderabad', 'GoWest MAXX, Aurora, USA']],
];

function Person({ p, small }) {
  return (
    <li className="card flex h-full flex-col p-5">
      <img src={`/img/people/${p.img}.webp`} alt="" width="96" height="96" loading="lazy" className={small ? 'h-14 w-14 rounded-full object-cover' : 'h-20 w-20 rounded-full object-cover'} />
      <p className="mt-4 text-[16px] font-semibold text-ink">{p.name}</p>
      <p className="text-[13.5px] font-medium text-brand">{p.role}</p>
      <p className="mt-2 t-small">{p.bio}</p>
      <a href={p.linkedin} target="_blank" rel="noreferrer" className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-ink-3 hover:text-brand"><Icon name="LinkedinLogo" size={16} />LinkedIn<span className="sr-only"> profile of {p.name} (opens in a new tab)</span></a>
    </li>
  );
}

export default function About() {
  return (
    <>
      <Seo title="About Deep Algorithms: Our Story, Leadership and Recognition" path="/about-us" crumbs={[{ name: 'About', path: '/about-us' }]}
        description="Deep Algorithms builds identity security for the AI era, from Hyderabad since 2022. Our story, milestones, leadership, advisors, recognition and offices." />
      <PageHero crumbs={[{ name: 'Company' }, { name: 'About' }]} overline="About Deep Algorithms" size="h1"
        title="We secure the identities the connected world runs on."
        lead={`Deep Algorithms builds identity security, fraud prevention, AI agent security and DPDPA compliance products, in Hyderabad since ${SITE.founded}, for organisations that cannot afford a breach.`}
        media={(
          <figure className="card p-6 md:p-8">
            <blockquote className="t-h3 !font-medium">“{FOUNDER_QUOTE.text}”</blockquote>
            <figcaption className="mt-6 flex items-center gap-3">
              <img src={`/img/people/${FOUNDER_QUOTE.img}.webp`} alt="" width="48" height="48" className="h-12 w-12 rounded-full object-cover" />
              <span><span className="block text-[15px] font-semibold text-ink">{FOUNDER_QUOTE.name}</span><span className="block t-caption">{FOUNDER_QUOTE.role} · <a href={FOUNDER_QUOTE.href} target="_blank" rel="noreferrer" className="ilink">{FOUNDER_QUOTE.source}</a></span></span>
            </figcaption>
          </figure>
        )} />

      <Section id="story" labelledby="story-h">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
          <SectionHead id="story-h" eyebrow="Our story" title="We don’t sell security products. We build defence that thinks." />
          <div className="space-y-5 t-lead">
            <p>Attackers adopted AI. Bots that pass for people, stolen identities that drift unseen for months, data access that looks exactly like legitimate work.</p>
            <p>Tools built for a world of rules could not keep up. So we built defence that learns what normal looks like, and acts before the deviation becomes a breach.</p>
            <ArrowLink to="/why-deep-algorithms" className="!text-[16px]">Why our approach is different</ArrowLink>
          </div>
        </div>
      </Section>

      <Section id="milestones" labelledby="ms-h" tone="subtle">
        <SectionHead id="ms-h" eyebrow="Milestones" title="From one observation to products in production." />
        <ol className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {YEARS.map(([y, h, b, items], i) => (
            <Reveal as="li" key={y} delay={i * 50} className="card flex flex-col p-6">
              <p className="num text-[32px] font-semibold leading-none text-brand">{y}</p>
              <p className="mt-3 t-h4">{h}</p>
              <p className="mt-2 t-small !text-ink-2">{b}</p>
              <ul className="mt-4 space-y-1.5 border-t border-line pt-4">{items.map((x) => <li key={x} className="flex gap-2 text-[13.5px] text-ink-2"><Icon name="Check" size={14} weight="bold" className="mt-1 shrink-0 text-brand" />{x}</li>)}</ul>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section id="leadership" labelledby="lead-h">
        <SectionHead id="lead-h" eyebrow="Leadership" title="Decades in AI, banking and security, in one team." lead="Founders, operators and researchers from IIT, IIM, IIIT and Imperial College London." />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{LEADERS.map((p) => <Person key={p.name} p={p} />)}</ul>
        <h3 id="advisors" className="mt-16 t-h3">Advisors and mentors</h3>
        <p className="mt-2 t-small">Leaders from banking regulation, investment, technology and research who guide our work.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{ADVISORS.map((p) => <Person key={p.name} p={p} small />)}</ul>
      </Section>

      <Section id="recognition" labelledby="rec-h" tone="subtle">
        <SectionHead id="rec-h" eyebrow="Recognition" title="Awards, forums and stages." />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RECOGNITION.map((r) => (
            <li key={r.title} className="card overflow-hidden">
              <img src={`/img/events/${r.img}.webp`} alt="" loading="lazy" width="600" height="400" className="aspect-[3/2] w-full object-cover" />
              <div className="p-5"><p className="t-h4">{r.title}</p><p className="mt-1 t-small">{r.where} · {r.year}</p></div>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="news" labelledby="news-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead id="news-h" eyebrow="In the news" title="Patents, press, interviews and events." />
          <a href={SITE.linkedin} target="_blank" rel="noreferrer" className="alink">Follow on LinkedIn<Icon name="ArrowUpRight" size={15} weight="bold" /><span className="sr-only"> (opens in a new tab)</span></a>
        </div>
        <ul className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {NEWS.map((n) => (
            <li key={n.title}>
              <a href={n.href} target="_blank" rel="noreferrer" className="card card-link group flex h-full flex-col p-6">
                <p className="flex items-center gap-2 t-caption"><span className="badge badge-brand">{n.kind}</span>{n.date}</p>
                <p className="mt-3 t-h4 group-hover:text-brand">{n.title}</p>
                <p className="mt-2 line-clamp-3 t-small">{n.body}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13.5px] font-semibold text-brand">{n.cta}<Icon name="ArrowUpRight" size={13} weight="bold" /><span className="sr-only"> (opens in a new tab)</span></span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="life" labelledby="life-h" tone="subtle">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHead id="life-h" eyebrow="Life at Deep Algorithms" title="At conferences, on stage and in the room where problems get solved." />
          <ArrowLink to="/careers">Careers</ArrowLink>
        </div>
        <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
          {TEAM_PHOTOS.slice(0, 6).map((t) => (
            <li key={t.img}><figure><img src={`/img/events/${t.img}.webp`} alt={t.title} loading="lazy" width="600" height="400" className="aspect-[3/2] w-full rounded-[12px] object-cover" /><figcaption className="mt-2 t-caption">{t.title}</figcaption></figure></li>
          ))}
        </ul>
      </Section>

      <Section id="offices" labelledby="off-h">
        <SectionHead id="off-h" eyebrow="Offices" title="Where to find us." />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {SITE.offices.map((o) => (
            <li key={o.city} className="card p-6">
              <p className="app-label">{o.label}</p>
              <p className="mt-2 t-h4">{o.city}</p>
              <p className="mt-2 t-small">{o.address}</p>
              {o.map && <a href={o.map} target="_blank" rel="noreferrer" className="alink mt-4 text-[14px]">Open in Maps<Icon name="ArrowUpRight" size={13} weight="bold" /><span className="sr-only"> (opens in a new tab)</span></a>}
            </li>
          ))}
        </ul>
      </Section>
      <CtaBand title="See the difference on your own identities." />
    </>
  );
}
