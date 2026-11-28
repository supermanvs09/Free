import { AdminSprawl, Benefits } from '../../components/showcase.jsx';
import { FixClick } from '../../lib/nullmotion.jsx';
import { ItdrFlow } from '../../components/viz/refs.jsx';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, Check3 } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import { AdDetections } from '../../components/dashboards.jsx';
import { Zoom } from '../../components/Dash.jsx';
import { Hero, PhotoFeature, Rollout, Faq, LINKS, ACC } from '../../components/ProductKit.jsx';
import { AdWorkbench } from '../../components/viz/workbench.jsx';
import { Gl } from '../../components/viz/kit.jsx';

const p = PRODUCTS.ad;
const A = ACC.adap;

const TECH = [
  ['Kerberoasting', 'Service account tickets requested for offline cracking', 'Password rotated'],
  ['Pass-the-hash', 'A stolen hash used to sign in as someone else', 'Sessions revoked'],
  ['DCSync attempt', 'A workstation asks a domain controller for password data', 'Host isolated'],
  ['AS-REP roasting', 'Accounts without pre-authentication targeted', 'Pre-auth enforced'],
  ['Golden ticket', 'Forged tickets that grant domain-wide access', 'Escalated to the SOC with evidence'],
];

const FAQ = [
  { title: 'What does the assessment need from us?', body: 'Read access to the directory. Users, groups, computers, service accounts, GPOs and trusts are mapped, and the paths to high-value identities ranked.' },
  { title: 'Do you only report, or also respond?', body: 'Both. Weak access is removed at the source, and live abuse such as Kerberoasting or pass-the-hash is contained automatically by policy.' },
  { title: 'Does it work with hybrid identity?', body: 'Yes. Active Directory is mapped alongside Microsoft 365, so paths that cross from the cloud into the domain are visible.' },
  { title: 'Does it help with RBI and CERT-In expectations on privileged access?', body: 'Yes. Tier 0 membership, every privileged change and every containment action are logged with their evidence, ready for the auditor and for incident reporting.' },
  { title: 'How is the fix list ranked?', body: 'By how many paths a single change closes. The first item on the list is the one change that removes the most routes to Domain Admins.' },
  { title: 'Does it help with SOC 2 and ISO 27001 audits?', body: 'Yes. Privileged group membership, stale admin accounts, password and Kerberos settings and every change are reported with evidence, mapped to the access-control requirements auditors check.' },
  { title: 'Does it find dormant and unused accounts?', body: 'Yes. Accounts with no sign-in for 90 days, disabled accounts still in privileged groups and service accounts nobody uses are flagged, ranked by the access they still hold.' },
  { title: 'How does it find over-privileged accounts?', body: 'By mapping effective rights, including nested groups, delegations, ACLs and GPO links, so an account that can reach Domain Admins through three hops is shown, not hidden.' },
];

export default function AdSecurity() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'Active Directory Security', path: p.path }]} />
      <Hero glance={[['Protects', 'Active Directory: users, groups, service accounts and trusts'], ['Stops', 'Paths to Domain Admins, Kerberoasting and DCSync'], ['Deploys', 'Read-only to map; scoped rights only for the responses you enable'], ['Shows', 'The one change that closes the most paths']]} layout="stack" acc="adap" crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: 'Active Directory Security' }]} eyebrow="adapID AI · Active Directory Security"
        title={<>Cut every route to Domain Admins. Stop anyone already on one.</>}
        lead="adapID maps every path to Tier 0, names the one change that closes the most, and contains live attacks while they run.">
      </Hero>

      {/* how it sits: between your identities and Tier 0 */}
      <section className="sec" aria-labelledby="how-h">
        <div className="wrap">
          <div className="island tone-d px-4 py-14 md:px-10 md:py-20">
            <SectionHead id="how-h" eyebrow="How it works" title="One layer between your users and your domain controllers." lead="Map the paths. Remove the weak access. Contain live abuse." />
            <Reveal up className="mx-auto mt-14 max-w-[1120px]"><ItdrFlow /></Reveal>
  </div>
        </div>
      </section>

      <PhotoFeature id="pf-h" acc="adap" eyebrow="Tier 0, protected" title="Your domain controllers, watched while attacks run." lead="Kerberos, NTLM and LDAP baselined for every identity." img="/img/photos/p-servers.webp" panel={<Zoom><AdDetections /></Zoom>} points={[
          ['Graph', 'Attack paths ranked', 'The fix that closes the most.'],
          ['Lightning', 'Live containment', 'DCSync, Kerberoasting, pass-the-hash.'],
          ['FileText', 'Evidence kept', 'Every action logged.'],
        ]} />
      <AdminSprawl />


      <section className="sec" aria-labelledby="tech-h">
        <div className="wrap">
          <SectionHead id="tech-h" acc={A} eyebrow="Live detection" title="Directory attacks, stopped while they run." lead="Baselined across Kerberos, NTLM and LDAP. Responses run automatically." />
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {TECH.map(([t, d, r], i) => (
              <Reveal key={t} delay={i * 70} className="card flex flex-col p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-crit/10 text-crit"><Icon name="Crosshair" size={20} /></span>
                <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.015em]">{t}</h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-2">{d}</p>
                <p className="mt-5 inline-flex items-center gap-2 text-[14px] font-medium text-ok"><Icon name="CheckCircle" size={16} weight="fill" />{r}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="stage sec" aria-labelledby="fix-h">
        <div className="wrap">
          <SectionHead id="fix-h" acc={A} eyebrow="Two ways to act" title="Fix what is exposed. Contain what is active." lead="One map for posture and detection. Every fix closes a real path." />
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
          <SectionHead id="as-h" acc={A} eyebrow="Attack path assessment" title="Your attack paths, ranked, in a single assessment." lead="Read-only mapping, then a fix list ranked by the paths each change closes." />
          <Reveal up className="mx-auto mt-12 max-w-[920px]"><AdWorkbench /></Reveal>
        </div>
      </section>
      <Benefits title="Fewer paths, faster fixes" lead="Built for the teams who own Active Directory day to day." items={[
          ['watch', 'Identity-focused analysis', 'Every user, group, computer and service account linked to the paths they open, not just a list of settings.'],
          ['route', 'Fixes ranked by impact', 'The one change that closes the most paths first, checked for business impact before you touch anything.'],
          ['hub', 'Faster security outcomes', 'Posture and live detection on one map, so each alert shows the path it was on and each fix is measured.'],
        ]} />
      <Rollout acc="adap" lead="Read-only to map. Containment only for the responses you choose to enable." steps={[
          { when: 'Day 1', h: 'Map the directory', p: 'Read-only. Nothing installed on domain controllers.' },
          { when: 'Week 1', h: 'A ranked fix list', p: 'Every path to Tier 0, ranked by reach.' },
          { when: 'Week 2 onwards', h: 'Contain live abuse', p: 'Kerberoasting, DCSync and pass-the-hash contained by policy.' },
        ]} />
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} />
      <CtaBand related={[LINKS.cirm, LINKS.nhi, LINKS.icms]} accent="adap" title={p.cta.title} body={p.cta.body} primary={{ label: 'Book an assessment', to: '/request-demo' }} />
    </>
  );
}
