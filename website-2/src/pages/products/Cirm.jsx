import { Benefits, CirmOverview, Feature, RiskEngine, ThreatResponses, Wide } from '../../components/showcase.jsx';
import CirmPipeline from '../../components/CirmPipeline.jsx';
import { useState } from 'react';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, cx } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import { Hero, Integrations, Rollout, Faq, Compare, Points, LINKS, ACC } from '../../components/ProductKit.jsx';
import { Connectors } from '../../components/viz/adapid.jsx';
import { CirmDash } from '../../components/dashboards.jsx';
import { IdentityTimelines } from '../../components/Changes.jsx';

const p = PRODUCTS.adapid;


const SIGNALS = [
  { icon: 'Pulse', h: 'Behaviour baseline', p: 'When, where and how each person usually works: hours, apps, volumes and sequences.' },
  { icon: 'TreeStructure', h: 'Access and privilege', p: 'What each identity can reach, what it actually uses, and new privilege it has gained.' },
  { icon: 'DeviceMobile', h: 'Device and location', p: 'First-seen devices, impossible travel and sessions that change hands.' },
  { icon: 'IdentificationCard', h: 'HR and lifecycle', p: 'Context from your HR systems, such as joiners, movers and leavers, so access is read against role.' },
];

const ZONES = [
  { to: 40, label: 'Allow', tone: 'var(--color-ok)', act: 'Normal work continues. Nothing is interrupted.' },
  { to: 70, label: 'Step-up', tone: 'var(--color-warn)', act: 'Ask for a stronger check before the next sensitive action.' },
  { to: 90, label: 'Hold session', tone: 'var(--color-hold)', act: 'Pause the session and notify the identity owner and the SOC.' },
  { to: 101, label: 'Block and revoke', tone: 'var(--color-crit)', act: 'End sessions, revoke tokens and open a case with the evidence attached.' },
];
function RiskPolicy() {
  const [v, setV] = useState(81);
  const z = ZONES.find((x) => v < x.to);
  return (
    <div className="card p-6 md:p-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[.08em] text-ink-3">Risk score</p>
          <p className="mt-1 text-[56px] font-medium leading-none tracking-[-0.015em] num" style={{ color: z.tone }}>{v}</p>
        </div>
        <div className="max-w-[420px] text-right">
          <p className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: z.tone }}>{z.label}</p>
          <p className="mt-1 text-[16px] text-ink-2">{z.act}</p>
        </div>
      </div>
      <div className="relative mt-8">
        <div className="flex h-3 overflow-hidden rounded-full">
          {ZONES.map((x, i) => <span key={x.label} style={{ flex: (x.to - (i ? ZONES[i - 1].to : 0)), background: x.tone, opacity: x === z ? 1 : 0.35 }} />)}
        </div>
        <input type="range" min="0" max="100" value={v} onChange={(e) => setV(+e.target.value)} aria-label="Drag to set a risk score" className="absolute inset-x-0 -top-2 h-7 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-[#0f141b] [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white" />
        <div className="mt-4 grid grid-cols-4 text-[14px] text-ink-3">{ZONES.map((x) => <span key={x.label}>{x.label}</span>)}</div>
      </div>
      <p className="mt-6 text-[14px] text-ink-3">Drag the score. Thresholds and responses are your policy; these are an example.</p>
    </div>
  );
}

const FAQ = [
  { title: 'How is this different from ITDR?', body: 'Identity threat detection tells you an attack happened. adapID scores every identity continuously and acts when behaviour changes, before the stolen login is used for anything that matters.' },
  { title: 'How long before it is useful?', body: 'Scoring starts on day one. Transfer learning means there is no long baselining period before detection begins.' },
  { title: 'What does it connect to?', body: 'Your identity provider, IAM, HR systems, SaaS and application logs. Assessment is read-only; adapID only gets the permissions needed for the responses you choose to enable.' },
  { title: 'Does it help with CERT-In reporting?', body: 'Yes. Every case carries a timeline and its evidence, which shortens the six-hour CERT-In incident report and the review that follows.' },
  { title: 'Can my analysts see why a score changed?', body: 'Yes. Every point of risk comes with its reason in plain language, and every action is logged for review and audit.' },
  { title: 'Does it cover machine identities too?', body: 'People and service accounts are scored here. For AWS roles, keys and workload identities in depth, NHI Security for AWS goes further, in the same adapID console.' },
  { title: 'Can it detect session hijacking and token theft?', body: 'Yes. adapID keeps scoring after sign-in. A session token replayed from a new device, network or location, or behaviour that no longer matches the identity, raises the risk and triggers your response, from step-up to revoking the session.' },
  { title: 'Does it use signals from our other security tools?', body: 'Yes. Alerts from your EDR, email security, device management and cloud logs feed the same risk score, so a compromised laptop or a phished user changes the risk of the identity, not just a ticket in another console.' },
  { title: 'Does it run around the clock?', body: 'Yes. Scoring and policy run continuously on every identity, so a risky change at 2 a.m. is answered by policy in seconds, without waiting for someone to read an alert.' },
];

export default function Cirm() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: p.path }]} />
      <Hero art={<CirmDash />} glance={[['Protects', 'People and machine identities across your IdP, cloud and SaaS'], ['Stops', 'Account takeover, insider misuse and over-privileged keys'], ['Deploys', 'Read-only to assess; scoped permissions only for the actions you enable'], ['Shows', 'A live risk score with the reason for every point']]} layout="stack" acc="adap" crumbs={[{ name: 'adapID AI' }]} eyebrow="adapID AI · Continuous identity risk management"
        title={<>Know the moment a trusted identity stops acting like itself.</>}
        lead="adapID learns how every person and service account normally works, and acts the moment behaviour shifts: step up, hold or revoke, in seconds.">
      </Hero>

      {/* the platform view: every stage CIRM runs on every identity */}
      <section className="sec" aria-labelledby="pipe-h">
        <div className="wrap">
          <div className="island tone-d px-4 py-14 md:px-10 md:py-20">
            <SectionHead id="pipe-h" eyebrow="One platform view" title="From first signal to contained session, on every identity." lead="Continuous, on every identity. Not a nightly report." />
            <Reveal up className="mx-auto mt-12 max-w-[1120px]"><CirmPipeline /></Reveal>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="itdr-h">
        <div className="wrap">
          <SectionHead id="itdr-h" acc={ACC.adap} eyebrow="Continuous identity risk management" title="Detection raises an alert. Risk management changes the outcome." lead="adapID acts on the session itself, through the controls you already run." />
          <Reveal className="mt-12">
            <Compare acc="adap" caption="adapID CIRM compared with SIEM rules and ITDR" cols={['SIEM rules', 'ITDR', 'adapID CIRM']} rows={[
              ['When it acts', 'After an alert', 'After detection', 'Continuously, before misuse'],
              ['What it tells you', 'A rule matched', 'An attack is under way', 'A 0 to 100 score with the reason for every point'],
              ['What it does', 'Opens a ticket', 'Raises an alert for the SOC', 'Steps up, holds or revokes the session, by your policy'],
              ['Ready from', 'Rules written by hand', 'After tuning', 'Day one, with transfer learning'],
              ['Machine identities', false, 'Limited', 'With NHI Security'],
            ]} />
          </Reveal>
        </div>
      </section>

      <Wide id="ov-h" eyebrow="Identity posture" title="See every identity risk in one place" lead="People, accounts, machine identities and admins across every source, scored and ranked, with the fixes that matter first.">
        <CirmOverview />
      </Wide>
      <Feature id="eng-h" title="Protection that never sleeps" lead="Session hijacking and token theft happen after a good login. adapID keeps watching behaviour, device health and context for the whole session, and re-scores risk the moment any of it changes.">
        <RiskEngine />
      </Feature>
      <Feature id="resp-h" flip title="Automated responses, in real time" lead="Policies act on changes in identity, device or context, as they happen:" bullets={['Step-up MFA, on demand', 'Session termination', 'Workflows, such as dropping to read-only access']}>
        <ThreatResponses />
      </Feature>
      <Benefits title="What you get" lead="adapID joins identity signals with what your security tools already see, so threats are found sooner and answered on their own." items={[
          ['watch', 'Always-on protection', 'Continuous monitoring and AI-driven detection throughout every session, not only at sign-in.'],
          ['route', 'Automated threat response', 'Flexible, adaptive controls that act in seconds to stop a threat in progress.'],
          ['hub', 'Connected intelligence', 'Signals from across your stack, joined up for better access decisions.'],
        ]} />


      <section className="sec" aria-labelledby="chg-h">
        <div className="wrap">
          <SectionHead align="left" id="chg-h" acc={ACC.adap} eyebrow="What changes" title="The same stolen password. Two endings." lead="Password and MFA both pass. One ending gives the attacker 47 days. The other, one second." />
          <div className="mt-12"><IdentityTimelines /></div>
        </div>
      </section>

      <section className="sec" aria-labelledby="sig-h">
        <div className="wrap">
          <SectionHead align="left" id="sig-h" acc={ACC.adap} eyebrow="How the score is built" title="Passing MFA is not proof. Behaviour is." lead="Every identity scored against its own normal. Every point shows its reason." />
          <div className="mt-12"><Points items={SIGNALS} acc="adap" /></div>
        </div>
      </section>

      <section className="sec" aria-labelledby="pol-h">
        <div className="wrap grid items-center gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow" style={{ '--acc': ACC.adap }}>From score to action</p>
            <h2 id="pol-h" className="t-h2 mt-6">Your thresholds. Your responses. Applied in seconds.</h2>
            <p className="t-lead mt-5">Low risk passes unnoticed. Rising risk asks for proof. High risk is held or revoked automatically, and every step is logged for the SOC and the auditor.</p>
          </Reveal>
          <Reveal delay={100}><RiskPolicy /></Reveal>
        </div>
      </section>

      <section className="sec-tight" aria-labelledby="con-h">
        <div className="wrap">
          <Reveal><p className="kicker mb-6" id="con-h">Works with the identity stack you already run</p></Reveal>
          <Reveal delay={80}><Connectors keys={['okta', 'entra', 'ad', 'm365', 'google', 'aws', 'github', 'atlassian', 'salesforce', 'slack']} /></Reveal>
        </div>
      </section>
      <Rollout acc="adap" lead="Connected on day one, enforcing by policy within weeks. Every step is reviewed with our engineers." steps={[
          { when: 'Day 1', h: 'Connect', p: 'IdP, cloud and SaaS, read-only. Scoring starts the same day.' },
          { when: 'Week 1', h: 'Review the riskiest', p: 'The riskiest identities reviewed with our engineers.' },
          { when: 'Week 2 onwards', h: 'Enforce by policy', p: 'Step-up, hold and revoke at your thresholds.' },
        ]} />
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} title="Blogs on identity attacks" />
      <CtaBand related={[LINKS.zenstra, LINKS.nhi, LINKS.icms]} relatedTitle="Other Deep Algorithms products" accent="adap" title={p.cta.title} body={p.cta.body} />
    </>
  );
}
