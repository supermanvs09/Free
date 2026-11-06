import { Seo } from '../lib/head.jsx';
import { CERTS } from '../data/site.js';
import { BELIEFS } from '../data/company.js';
import { Icon, Reveal, SectionHead } from '../components/ui.jsx';
import { ArrowLink, CtaBand, FeatureCard, PageHero, Section } from '../components/ds.jsx';
import Architecture from '../components/demos/Architecture.jsx';

const ROWS = [
  ['Catches valid logins used by the wrong person', 'No', 'No', 'Yes'],
  ['Covers machine identities and AI agents', 'Rarely', 'Partly', 'Yes'],
  ['Acts before the action completes', 'Sometimes', 'No', 'Yes'],
  ['Explains each decision', 'No', 'In a report', 'In plain language'],
  ['Evidence for regulators', 'Raw logs', 'Point in time', 'Continuous'],
];

export default function Why() {
  return (
    <>
      <Seo title="Why Deep Algorithms: Continuous, Explainable Identity Security" path="/why-deep-algorithms" crumbs={[{ name: 'Why Deep Algorithms', path: '/why-deep-algorithms' }]}
        description="Why Deep Algorithms: continuous over periodic, behaviour over signatures, decisions before the action completes, explained in plain language, deployed in your environment." />
      <PageHero crumbs={[{ name: 'Company' }, { name: 'Why Deep Algorithms' }]} overline="Why Deep Algorithms" size="h1"
        title="The defence has to be as intelligent as the attack."
        lead="Attackers now log in with valid credentials, use machine identities nobody reviews and direct AI agents with real access. Our products are built on a few hard constraints that follow from that." />

      <Section id="approach" labelledby="ap-h">
        <SectionHead id="ap-h" eyebrow="Our approach" title="Not values on a wall. Constraints on every line of code." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BELIEFS.map((b, i) => <Reveal key={b.title} delay={i * 40}><FeatureCard icon={b.icon} title={b.title}>{b.body}</FeatureCard></Reveal>)}
        </div>
      </Section>

      <Section id="different" labelledby="df-h" tone="subtle">
        <SectionHead id="df-h" eyebrow="How it is different" title="Built for the attack that looks legitimate." />
        <Reveal className="card mt-10 overflow-x-auto">
          <table className="dt min-w-[720px]">
            <caption className="sr-only">Deep Algorithms compared with rule-based tools and periodic reviews</caption>
            <thead><tr><th className="w-[34%]">Question</th><th>Rule-based tools</th><th>Periodic reviews</th><th className="!bg-brand-50 !text-brand">Deep Algorithms</th></tr></thead>
            <tbody>{ROWS.map(([q, a, b, c]) => <tr key={q}><td className="py-3 font-semibold !text-ink">{q}</td><td>{a}</td><td>{b}</td><td className="font-semibold !text-ink">{c}</td></tr>)}</tbody>
          </table>
        </Reveal>
      </Section>

      <Section id="deploy" labelledby="dp-h">
        <SectionHead id="dp-h" eyebrow="How it deploys" title="In your environment, through the tools you already run." lead="Read-only connectors for identity sources, one read-only role per AWS account, a Zenstra gateway inside your VPC and an SDK in your banking apps. Responses go through your identity provider, SOC and ticketing." />
        <Reveal className="mt-10"><Architecture /></Reveal>
      </Section>

      <Section id="trust" labelledby="tr-h" tone="subtle">
        <SectionHead id="tr-h" eyebrow="Security and trust" title="What your risk committee will ask." />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <p className="t-h4">Data handling</p>
            <ul className="mt-3 space-y-2.5">
              {['Read-only connectors; nothing is written to your identity providers or cloud accounts without approval', 'Agent prompts and payloads are evaluated inside your VPC; only decisions and redacted evidence leave it', 'The banking SDK measures how the device is used, never the characters customers type', 'Every decision is recorded with the policy that produced it'].map((x) => <li key={x} className="flex gap-2.5 t-body"><Icon name="CheckCircle" size={18} weight="fill" className="mt-1 shrink-0 text-ok" />{x}</li>)}
            </ul>
          </div>
          <div className="card p-6">
            <p className="t-h4">Certifications and regulation</p>
            <ul className="mt-3 divide-y divide-line">{CERTS.map((c) => <li key={c.code} className="flex justify-between gap-4 py-2.5"><span className="font-semibold text-ink">{c.name}</span><span className="t-small">{c.desc}</span></li>)}</ul>
            <p className="mt-3 t-small">Certificates and compliance documentation are available on request. Evidence is mapped to the DPDP Act 2023, the DPDP Rules 2025, RBI and SEBI.</p>
            <ArrowLink to="/contact" className="mt-4 text-[14.5px]">Request documentation</ArrowLink>
          </div>
        </div>
      </Section>
      <CtaBand title="See the difference on your own identities." />
    </>
  );
}
