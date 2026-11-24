import { FixClick } from '../../lib/nullmotion.jsx';
import { ItdrFlow } from '../../components/viz/refs.jsx';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, Check3 } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import { Hero, Stats, Faq, Steps, LINKS, ACC } from '../../components/ProductKit.jsx';
import { AdTierGraph } from '../../components/viz/adapid.jsx';
import { AdWorkbench } from '../../components/viz/workbench.jsx';
import Stage3D from '../../components/Stage3D.jsx';
import { Gl } from '../../components/viz/kit.jsx';
import { STORIES } from '../../data/stories.js';

const p = PRODUCTS.ad;
const A = ACC.adap;

const TECH = [
  ['Kerberoasting', 'Service account tickets requested for offline cracking', 'Password rotated'],
  ['Pass-the-hash', 'A stolen hash used to sign in as someone else', 'Sessions revoked'],
  ['DCSync attempt', 'A workstation asks a domain controller for password data', 'Host isolated'],
  ['AS-REP roasting', 'Accounts without pre-authentication targeted', 'Pre-auth enforced'],
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
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'Active Directory Security', path: p.path }]} />
      <Hero glance={[['Protects', 'Active Directory: users, groups, service accounts and trusts'], ['Stops', 'Paths to Domain Admins, Kerberoasting and DCSync'], ['Deploys', 'Read-only access to your directory'], ['Shows', 'The one change that closes the most paths']]} layout="stack" acc="adap" crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'Active Directory Security' }]} eyebrow="adapID AI · Active Directory Security"
        title={<>Close the path to Domain Admins <span style={{ color: 'var(--acc)' }}>before anyone takes it.</span></>}
        lead="See every account, privilege and path through Active Directory, cut the routes attackers would use, and catch the account that starts behaving unlike itself.">
        <Stage3D tilt={[10, 0]} range={[2, 4]} className="mx-auto max-w-[1060px]"><AdTierGraph /></Stage3D>
      </Hero>

      {/* how it sits: between your identities and Tier 0 */}
      <section className="sec" aria-labelledby="how-h">
        <div className="wrap">
          <div className="island tone-d px-4 py-14 md:px-10 md:py-20">
            <SectionHead id="how-h" eyebrow="How it works" title="Between every identity and Tier 0." lead="See every path an attacker could take, fix the weak access behind it, and contain live abuse before it reaches a domain controller." />
            <Reveal up className="mx-auto mt-14 max-w-[1120px]"><ItdrFlow /></Reveal>
  </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="tech-h">
        <div className="wrap">
          <SectionHead id="tech-h" acc={A} eyebrow="Live detection" title="Caught mid-attack, not in the post-mortem." lead="Baselines for every identity across Kerberos, NTLM and LDAP, with automatic containment. Ten core techniques are covered, including:" />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {TECH.map(([t, d, r], i) => (
              <Reveal key={t} delay={i * 70} className="card flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-crit/10 text-crit"><Icon name="Crosshair" size={20} /></span>
                <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.015em]">{t}</h3>
                <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-ink-2">{d}</p>
                <p className="mt-5 inline-flex items-center gap-2 text-[13.5px] font-medium text-ok"><Icon name="CheckCircle" size={16} weight="fill" />{r}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="stage sec" aria-labelledby="fix-h">
        <div className="wrap">
          <SectionHead id="fix-h" acc={A} eyebrow="Two ways to act" title="Remove weak access. Contain live abuse." />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            <Reveal className="card p-7 md:p-9">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-adap/12 text-adap"><Gl g="tree" className="h-6 w-6" /></span>
              <h3 className="mt-6 text-[24px] font-semibold tracking-[-0.02em]">Fix at the source</h3>
              <p className="mt-2 text-[16px] text-ink-2">Paths ranked by how far they reach, with the one change that closes the most.</p>
              <ul className="mt-6 space-y-3"><Check3 acc={A}>Nested privilege and delegation</Check3><Check3 acc={A}>Stale and orphaned accounts</Check3><Check3 acc={A}>GPO and trust weaknesses</Check3></ul>
            </Reveal>
            <Reveal delay={100} className="card p-7 md:p-9">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-ok/10 text-ok"><Gl g="shield" className="h-6 w-6" /></span>
              <h3 className="mt-6 text-[24px] font-semibold tracking-[-0.02em]">Contain in seconds</h3>
              <p className="mt-2 text-[16px] text-ink-2">Each identity is profiled by when, where and against what. Abuse is stopped by policy.</p>
              <ul className="mt-6 space-y-3"><Check3 acc="var(--color-ok)">Passwords rotated, sessions revoked</Check3><Check3 acc="var(--color-ok)">Hosts isolated when a domain controller is targeted</Check3><Check3 acc="var(--color-ok)">Every action logged with its evidence</Check3></ul>
            </Reveal>
          </div>
          <FixClick />
        </div>
      </section>

      <section className="sec" aria-labelledby="as-h">
        <div className="wrap">
          <SectionHead id="as-h" acc={A} eyebrow="Attack path assessment" title="Understand your directory in a day." lead="Every path to Tier 0, ranked by how far it reaches, with the one change that closes the most and the detections that catch anyone who tries it anyway." />
          <Reveal up className="mx-auto mt-12 max-w-[920px]"><AdWorkbench /></Reveal>
          <div className="mt-12"><Steps acc="adap" items={[{ h: 'Map the directory', p: 'Users, groups, computers, service accounts, GPOs and trusts, read-only.' }, { h: 'Rank every path', p: 'Each route to a high-value identity, ordered by how far it reaches.' }, { h: 'Get the fix list', p: 'The changes that close the most paths, first, with their business impact checked.' }]} /></div>
        </div>
      </section>

      <Stats acc="adap" items={p.stats} {...STORIES.ad} />
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} />
      <CtaBand related={[LINKS.cirm, LINKS.nhi, LINKS.icms]} accent="adap" title={p.cta.title} body={p.cta.body} primary={{ label: 'Book an assessment', to: '/request-demo' }} />
    </>
  );
}
