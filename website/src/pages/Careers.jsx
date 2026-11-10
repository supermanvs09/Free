import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { BELIEFS, TEAM_PHOTOS } from '../data/company.js';
import { Button, Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { FeatureCard, PageHero, Section } from '../components/ds.jsx';

const AREAS = [
  ['Cpu', 'AI engineering', 'Behaviour models that score people, machine identities and AI agents in milliseconds, and explain every score in plain language.'],
  ['Detective', 'Security research', 'Attack paths, mule networks and new identity attacks, studied in the field and written up as the research on this site.'],
  ['Code', 'Product engineering', 'Gateways, connectors and consoles that run inside customers’ own clouds, built for banks, hospitals and government.'],
];

export default function Careers() {
  const mail = `mailto:${SITE.careersEmail}?subject=${encodeURIComponent('Working at Deep Algorithms')}`;
  return (
    <>
      <Seo title="Careers at Deep Algorithms" path="/careers" crumbs={[{ name: 'Careers', path: '/careers' }]}
        description="Build identity security for the AI era. AI engineering, security research and product engineering in Hyderabad, Bengaluru and Texas." />
      <PageHero crumbs={[{ name: 'Company' }, { name: 'Careers' }]} overline="Careers" size="h1"
        title="Build the defence attackers have to think about."
        lead="We are looking for AI engineers, security researchers and product engineers who want to work on problems banks, hospitals and governments face today. Tell us what you want to work on."
        actions={<><Button href={mail} size="lg"><Icon name="EnvelopeSimple" size={18} />Write to {SITE.careersEmail}</Button><Button to="/prompt-heist" variant="secondary" size="lg">Try the Prompt Heist</Button></>}
        note="No open roles are listed here. Write to us with what you want to work on." />

      <Section id="work" labelledby="w-h">
        <SectionHead id="w-h" eyebrow="What we work on" title="Three kinds of work, one product." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {AREAS.map(([ic, t, b], i) => <Reveal key={t} delay={i * 50}><FeatureCard icon={ic} title={t} to={mail} cta="Write to us about this">{b}</FeatureCard></Reveal>)}
        </div>
      </Section>

      <Section id="how" labelledby="h-h" tone="subtle">
        <SectionHead id="h-h" eyebrow="How we work" title="The constraints behind every product." />
        <ul className="mt-10 grid gap-x-10 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
          {BELIEFS.map((b) => <li key={b.title}><p className="flex items-center gap-2 t-h4"><Icon name={b.icon} size={18} className="text-brand" />{b.title}</p><p className="mt-1.5 t-small !text-ink-2">{b.body}</p></li>)}
        </ul>
      </Section>

      <Section id="life" labelledby="l-h">
        <SectionHead id="l-h" eyebrow="Life at Deep Algorithms" title="Offices in Hyderabad, Bengaluru and Texas." />
        <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3">
          {TEAM_PHOTOS.slice(2, 8).map((t) => <li key={t.img}><figure><img src={`/img/events/${t.img}.webp`} alt={t.title} loading="lazy" width="600" height="400" className="aspect-[3/2] w-full rounded-[12px] object-cover" /><figcaption className="mt-2 t-caption">{t.title}</figcaption></figure></li>)}
        </ul>
      </Section>

      <Section id="apply" labelledby="a-h" tone="subtle">
        <div className="card grid gap-8 p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-12">
          <div>
            <h2 id="a-h" className="t-h2">How to apply</h2>
            <p className="mt-3 t-lead">Send a short note on what you want to work on, with a CV or a link to your work. Students: crack the <Link to="/prompt-heist" className="ilink">Prompt Heist</Link> vaults and tell us how.</p>
          </div>
          <Button href={mail} size="lg"><Icon name="EnvelopeSimple" size={18} />{SITE.careersEmail}</Button>
        </div>
      </Section>
    </>
  );
}
