import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { trail } from '../../data/ia.js';
import { Button, Icon, Reveal, SectionHead } from '../../components/ui.jsx';
import { Badge, CtaBand, Faq, FeatureCard, PageHero, ProductLabel, ResearchCards, Section, StatTile, SubNav, SampleNote } from '../../components/ds.jsx';
import AdPathExplorer from '../../components/demos/AdPathExplorer.jsx';

const p = PRODUCTS.ad;

const TECH = [
  ['Kerberoasting', 'Service account tickets requested for offline cracking', 'Password rotated'],
  ['Pass-the-hash', 'A stolen hash used to sign in as someone else', 'Sessions revoked'],
  ['DCSync attempt', 'A workstation asks a domain controller for password data', 'Host isolated'],
  ['AS-REP roasting', 'Accounts without pre-authentication targeted', 'Pre-authentication enforced'],
  ['Golden ticket', 'Forged tickets that grant domain-wide access', 'Covered'],
];
const FAQ = [
  { title: 'What does the assessment need from us?', body: 'Read access to the directory. Users, groups, computers, service accounts, GPOs and trusts are mapped, and the paths to high-value identities ranked.' },
  { title: 'Do you only report, or also respond?', body: 'Both. Weak access is removed at the source, and live abuse such as Kerberoasting or pass-the-hash is contained automatically by policy.' },
  { title: 'Does it work with hybrid identity?', body: 'Yes. Active Directory is mapped alongside Microsoft 365, so paths that cross from the cloud into the domain are visible.' },
  { title: 'How is the fix list ranked?', body: 'By how many paths a single change closes. The first item on the list is the one change that removes the most routes to Domain Admins.' },
];

export default function AdSecurity() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: p.name, path: p.path }]} />
      <PageHero crumbs={trail(p.path)} mark={<ProductLabel p="adapid" name="Active Directory Security" sub="adapID AI" />}
        title="Close the path to Domain Admins before anyone takes it."
        lead="adapID maps every account, group, privilege and trust in your directory, ranks the paths an attacker would take to Tier 0, closes the weakest links first and catches the accounts being abused while it happens."
        actions={<><Button to="/request-demo?product=adapid" size="lg" arrow>Book an attack path assessment</Button><Button href="#paths" variant="secondary" size="lg">Close a path</Button></>}
        media={(
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile {...p.stats[0]} />
            <StatTile {...p.stats[1]} />
            <div className="card flex items-center gap-4 p-5 sm:col-span-2"><span className="ptile"><Icon name="ListChecks" size={20} /></span><p className="t-body">The fix list is ranked by how many paths one change closes, and every fix is checked again.</p></div>
          </div>
        )} />
      <SubNav title="AD Security" items={[['paths', 'Attack paths'], ['detect', 'Live detection'], ['assess', 'Assessment'], ['faq', 'FAQ']]} />

      <Section id="paths" labelledby="paths-h">
        <SectionHead id="paths-h" eyebrow="Attack paths" title="Between every identity and Tier 0." lead="Choose where an attacker starts. See the path, the weakest link and the one fix that closes it. Apply the fix and the path is checked again." />
        <Reveal className="mt-10"><AdPathExplorer /><SampleNote /></Reveal>
      </Section>

      <Section id="detect" labelledby="det-h" tone="subtle">
        <SectionHead id="det-h" eyebrow="Live detection" title="Caught mid-attack, not in the post-mortem." lead="The core Active Directory techniques are watched as they happen, and the response runs by your policy." />
        <Reveal className="card mt-10 overflow-x-auto">
          <table className="dt min-w-[680px]">
            <caption className="sr-only">Active Directory techniques, what they look like and the response</caption>
            <thead><tr><th>Technique</th><th>What it looks like</th><th>Response by policy</th></tr></thead>
            <tbody>{TECH.map(([t, w, r]) => <tr key={t}><td className="font-semibold !text-ink">{t}</td><td>{w}</td><td><Badge tone="ok" dot>{r}</Badge></td></tr>)}</tbody>
          </table>
        </Reveal>
        <p className="mt-3 t-caption">Five of the ten core techniques covered are shown.</p>
      </Section>

      <Section id="assess" labelledby="as-h">
        <SectionHead id="as-h" eyebrow="Assessment" title="Understand your directory in a day." />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <FeatureCard icon="TreeStructure" acc="var(--color-adap)" title="Map">Users, groups, computers, service accounts, GPOs and trusts, with read access only.</FeatureCard>
          <FeatureCard icon="ListChecks" acc="var(--color-adap)" title="Rank">Every path to a high-value identity, ranked by how many paths each fix closes.</FeatureCard>
          <FeatureCard icon="ShieldCheck" acc="var(--color-adap)" title="Close and verify">Weak access removed at the source, and each fix checked again so you know it held.</FeatureCard>
        </div>
      </Section>

      <Faq items={FAQ} title="Questions about AD Security" />
      <ResearchCards slugs={p.research} />
      <CtaBand title={p.cta.title} body={p.cta.body} primary={{ label: 'Book an attack path assessment', to: '/request-demo?product=adapid' }} />
    </>
  );
}
