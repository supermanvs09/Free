import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { trail } from '../../data/ia.js';
import { Button, Reveal, SectionHead } from '../../components/ui.jsx';
import { CtaBand, Faq, FeatureCard, PageHero, ProductLabel, ResearchCards, Section, StatTile, SubNav, SampleNote } from '../../components/ds.jsx';
import { IcmsMap, BreachTimeline } from '../../components/demos/IcmsMap.jsx';

const p = PRODUCTS.icms;

const DUTIES = [
  ['Know what personal data you hold', 'Discovers personal data across structured and unstructured stores, including the places it should not be.', 'Data inventory by store, category and owner'],
  ['Process only for a stated purpose', 'Links every access to an identity, human or machine, and checks it against the declared purpose.', 'Access log with purpose and identity'],
  ['Honour consent and its withdrawal', 'Tracks consent per data principal and purpose, and flags access that falls outside it.', 'Consent ledger with every change'],
  ['Protect data with reasonable safeguards', 'Watches who reads what, catches unusual reads and exports, and connects to identity risk.', 'Safeguard checks and exceptions raised'],
  ['Report a breach in time', 'Scopes affected records and data principals and drafts the report from evidence already held.', 'Breach file with timeline and scope'],
];
const FAQ = [
  { title: 'Which regulations does ICMS cover?', body: 'It is built around the Digital Personal Data Protection Act 2023 and the DPDP Rules 2025, with evidence mapped to RBI and SEBI expectations. The same evidence model supports GDPR obligations.' },
  { title: 'Does it include service accounts?', body: 'Yes. Every access is tied to an identity, human or machine, so service accounts and integrations are checked against purpose too.' },
  { title: 'How quickly can we produce an audit package?', body: 'Evidence is assembled continuously, so a package can be generated in minutes rather than collected over weeks.' },
];

export default function Icms() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'Products', path: '/products' }, { name: p.name, path: p.path }]} />
      <PageHero crumbs={trail(p.path)} mark={<ProductLabel p="icms" name="ICMS Compliance Suite" sub="Personal data protection and DPDPA compliance" />}
        title="Protect every piece of personal data. Prove DPDPA compliance."
        lead="ICMS finds the personal data your organisation holds, from Aadhaar and PAN to account numbers and health records, masks it where it should not be seen, checks every access against purpose and consent, and keeps the evidence an auditor asks for."
        actions={<><Button to="/request-demo?product=dpdpa" size="lg" arrow>Book a DPDPA gap analysis</Button><Button href="#pii-map" variant="secondary" size="lg">See the data map</Button></>}
        media={<div className="grid gap-4 sm:grid-cols-2">{p.stats.map((st) => <StatTile key={st.v} {...st} className={st.v === '< 5 min' ? 'sm:col-span-2' : ''} />)}</div>} />
      <SubNav title="ICMS" items={[['pii-map', 'Data map'], ['duties', 'DPDPA duties'], ['breach', 'Breach response'], ['evidence', 'Evidence'], ['faq', 'FAQ']]} />

      <Section id="pii-map" labelledby="map-h">
        <SectionHead id="map-h" eyebrow="Discovery, purpose and consent" title="Who touched what, and why." lead="Pick a store. See the personal data it holds, every identity that read it, and whether each read matched its purpose and the principal’s consent." />
        <Reveal className="mt-10"><IcmsMap /><SampleNote /></Reveal>
      </Section>

      <Section id="duties" labelledby="duty-h" tone="subtle">
        <SectionHead id="duty-h" eyebrow="DPDPA duties" title="Every duty, and the evidence that proves you met it." />
        <Reveal className="card mt-10 overflow-x-auto">
          <table className="dt min-w-[760px]">
            <caption className="sr-only">DPDPA duties, how ICMS meets them and the evidence produced</caption>
            <thead><tr><th className="w-[26%]">Duty</th><th>How ICMS meets it</th><th className="w-[26%]">Evidence kept</th></tr></thead>
            <tbody>{DUTIES.map(([d, h, e]) => <tr key={d}><td className="py-3 font-semibold !text-ink">{d}</td><td className="py-3">{h}</td><td className="py-3 font-medium !text-ink">{e}</td></tr>)}</tbody>
          </table>
        </Reveal>
      </Section>

      <Section id="breach" labelledby="br-h">
        <SectionHead id="br-h" eyebrow="Breach response" title="Inside the 72 hours, with evidence in hand." lead="When a breach happens, ICMS scopes the affected records and data principals and drafts the report from evidence it already holds." />
        <Reveal className="mt-10"><BreachTimeline /></Reveal>
      </Section>

      <Section id="evidence" labelledby="ev-h" tone="subtle">
        <SectionHead id="ev-h" eyebrow="Audit evidence" title="Audit packages in minutes, not one quarter." lead="Evidence assembled continuously and mapped to DPDPA, RBI and SEBI obligations." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard icon="ClipboardText" acc="var(--color-icms)" title="Records of processing">Purposes, categories and the systems that process them.</FeatureCard>
          <FeatureCard icon="ListChecks" acc="var(--color-icms)" title="Consent ledger">Every consent, withdrawal and change, per principal.</FeatureCard>
          <FeatureCard icon="Fingerprint" acc="var(--color-icms)" title="Identity-linked access">Who read what, when, and under which purpose.</FeatureCard>
          <FeatureCard icon="Timer" acc="var(--color-icms)" title="Breach file">Timeline, scope and notices, ready for the Board.</FeatureCard>
        </div>
      </Section>

      <Faq items={FAQ} title="Questions about ICMS" />
      <ResearchCards slugs={p.research} title="Research on data protection" />
      <CtaBand title={p.cta.title} body={p.cta.body} primary={{ label: 'Book a DPDPA gap analysis', to: '/request-demo?product=dpdpa' }} />
    </>
  );
}
