import CirmPipeline from '../../components/CirmPipeline.jsx';
import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Icon, Reveal, SectionHead, cx } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import Stage3D from '../../components/Stage3D.jsx';
import { Hero, Stats, Faq, Compare, Points, LINKS, ACC } from '../../components/ProductKit.jsx';
import { AdapRiskTimeline, Connectors, IdentityGraph, RiskScoreCard } from '../../components/viz/adapid.jsx';
import { NhiWorkbench, AdWorkbench } from '../../components/viz/workbench.jsx';
import { ScamCatch } from '../../components/viz/fraud.jsx';
import { IdentityTimelines } from '../../components/Changes.jsx';
import { STORIES } from '../../data/stories.js';

const p = PRODUCTS.adapid;

const FAMILY = [
  { name: 'Continuous Identity Risk Management', tag: 'You are here', body: 'A live, explainable risk score for every person, acted on the moment behaviour changes.', to: null, V: RiskScoreCard },
  { name: 'NHI Security for AWS', body: 'Every IAM role, key and workload identity found, scored for posture and watched for new behaviour.', to: '/adapid-ai/nhi-security', V: NhiWorkbench },
  { name: 'Identity Fraud Prevention', body: 'Mobile and internet banking protected from login to payment: takeover, scams and mules.', to: '/adapid-ai/fraud-prevention', V: ScamCatch },
  { name: 'Active Directory Security', body: 'Paths to Domain Admins mapped and cut, and live abuse contained in seconds.', to: '/ad-security', V: AdWorkbench },
];

const SIGNALS = [
  { icon: 'Pulse', h: 'Behaviour baseline', p: 'When, where and how each person usually works: hours, apps, volumes and sequences.' },
  { icon: 'TreeStructure', h: 'Access and privilege', p: 'What each identity can reach, what it actually uses, and new privilege it has gained.' },
  { icon: 'DeviceMobile', h: 'Device and location', p: 'First-seen devices, impossible travel and sessions that change hands.' },
  { icon: 'IdentificationCard', h: 'HR and lifecycle', p: 'Context from your HR systems, such as joiners, movers and leavers, so access is read against role.' },
  { icon: 'ChatCircleText', h: 'Explained in plain language', p: 'A 0 to 100 score where every point of risk carries its reason, for analysts and auditors alike.' },
  { icon: 'Lightning', h: 'Day-one detection', p: 'Transfer learning means scoring starts on day one, without a long learning period.' },
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
          <p className="mt-1 text-[56px] font-semibold leading-none tracking-[-0.05em] num" style={{ color: z.tone }}>{v}</p>
        </div>
        <div className="max-w-[420px] text-right">
          <p className="text-[22px] font-semibold tracking-[-0.02em]" style={{ color: z.tone }}>{z.label}</p>
          <p className="mt-1 text-[15px] text-ink-2">{z.act}</p>
        </div>
      </div>
      <div className="relative mt-8">
        <div className="flex h-3 overflow-hidden rounded-full">
          {ZONES.map((x, i) => <span key={x.label} style={{ flex: (x.to - (i ? ZONES[i - 1].to : 0)), background: x.tone, opacity: x === z ? 1 : 0.35 }} />)}
        </div>
        <input type="range" min="0" max="100" value={v} onChange={(e) => setV(+e.target.value)} aria-label="Drag to set a risk score" className="absolute inset-x-0 -top-2 h-7 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-[#0f141b] [&::-webkit-slider-thumb]:bg-white [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white" />
        <div className="mt-4 grid grid-cols-4 text-[12.5px] text-ink-3">{ZONES.map((x) => <span key={x.label}>{x.label}</span>)}</div>
      </div>
      <p className="mt-6 text-[13.5px] text-ink-3">Drag the score. Thresholds and responses are your policy; these are an example.</p>
    </div>
  );
}

const FAQ = [
  { title: 'How is this different from ITDR?', body: 'Identity threat detection tells you an attack happened. adapID scores every identity continuously and acts when behaviour changes, before the stolen login is used for anything that matters.' },
  { title: 'How long before it is useful?', body: 'Scoring starts on day one. Transfer learning means there is no long baselining period before detection begins.' },
  { title: 'What does it connect to?', body: 'Read-only connectors to your identity provider, IAM, HR systems, SaaS and application logs.' },
  { title: 'Can my analysts see why a score changed?', body: 'Yes. Every point of risk comes with its reason in plain language, and every action is logged for review and audit.' },
  { title: 'Does it cover machine identities too?', body: 'People are scored here. Machine identities in AWS are covered by NHI Security for AWS, part of the same adapID family.' },
];

export default function Cirm() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: p.path }]} />
      <Hero glance={[['Protects', 'People and machine identities across your IdP, cloud and SaaS'], ['Stops', 'Account takeover, insider misuse and over-privileged keys'], ['Deploys', 'Read-only connectors; one read-only role per AWS account'], ['Shows', 'A live risk score with the reason for every point']]} layout="stack" acc="adap" crumbs={[{ name: 'Products', path: '/products' }, { name: 'adapID AI' }]} eyebrow="adapID AI · Continuous identity risk management"
        title={<>A live risk score for every identity. <span style={{ color: 'var(--acc)' }}>Acted on the moment it changes.</span></>}
        lead="adapID AI learns how each person normally works across your identity provider, cloud and SaaS, and acts when that changes, before a stolen login becomes a breach.">
        <Stage3D tilt={[12, 0]} range={[3, 5]} className="mx-auto max-w-[860px]"><AdapRiskTimeline /></Stage3D>
      </Hero>

      {/* the platform view: every stage CIRM runs on every identity */}
      <section className="sec" aria-labelledby="pipe-h">
        <div className="wrap">
          <div className="island tone-d px-4 py-14 md:px-10 md:py-20">
            <SectionHead id="pipe-h" eyebrow="One platform view" title="Seven stages. Every identity. Always on." lead="Pick a stage to see what adapID CIRM does there. It runs all seven on every person, key and agent, all the time." />
            <Reveal up className="mx-auto mt-12 max-w-[1120px]"><CirmPipeline /></Reveal>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="itdr-h">
        <div className="wrap">
          <SectionHead id="itdr-h" acc={ACC.adap} eyebrow="Continuous identity risk management" title="ITDR tells you what happened. CIRM stops what’s next." />
          <Reveal className="mt-12">
            <Compare acc="adap" caption="adapID CIRM compared with SIEM rules and ITDR" cols={['SIEM rules', 'ITDR', 'adapID CIRM']} rows={[
              ['When it acts', 'After an alert', 'After detection', 'Continuously, before misuse'],
              ['Learns each identity’s normal', false, 'Partly', 'From day one'],
              ['Explains the score', false, 'Partly', 'In plain language'],
              ['Responds', 'A ticket', 'An alert', 'Step-up, hold or block'],
              ['Machine identities', false, 'Limited', 'With NHI Security'],
            ]} />
          </Reveal>
        </div>
      </section>

      <section className="stage sec" aria-labelledby="blast-h">
        <div className="wrap">
          <SectionHead id="blast-h" acc={ACC.adap} eyebrow="Identity graph and blast radius" title="See what a stolen identity can reach, before the attacker does." lead="Every identity is mapped to the systems it opens and the data behind them. When one is compromised, adapID shows the blast radius, the paths to admin, and closes them in one move." />
          <Reveal up className="mx-auto mt-14 max-w-[1120px]"><IdentityGraph /></Reveal>
        </div>
      </section>

      <section className="sec" aria-labelledby="chg-h">
        <div className="wrap">
          <SectionHead align="left" id="chg-h" acc={ACC.adap} eyebrow="What changes" title="The same stolen password. Two endings." lead="One login that MFA lets through. What happens next depends on whether anyone is watching how the identity behaves." />
          <div className="mt-12"><IdentityTimelines /></div>
        </div>
      </section>

      <section className="sec" aria-labelledby="fam-h">
        <div className="wrap">
          <SectionHead id="fam-h" acc={ACC.adap} eyebrow="The adapID family" title="Four products for human and machine identities." lead="Each runs on its own. Together they cover people, machine identities, payments and the directory that holds it all." />
          <div className="m-rail mt-14 grid gap-5 md:grid-cols-2">
            {FAMILY.map((f, i) => {
              const inner = (
                <>
                  <div className="relative h-[260px] overflow-hidden rounded-[16px] border border-line md:h-[300px]" style={{ background: 'radial-gradient(70% 60% at 50% 0%, rgb(30 136 216 / .12), transparent 70%), linear-gradient(160deg, #f4f8fd, #e8f0f9)' }}>
                    {f.V ? <div className="pointer-events-none absolute left-1/2 top-4 w-[118%] -translate-x-1/2 md:w-[104%]"><f.V /></div>
                      : <div className="absolute inset-0 flex items-center justify-center"><span className="text-[64px] font-semibold tracking-[-0.05em] text-[#c4352a] num">94</span><span className="ml-3 text-[15px] text-ink-3">risk score,<br />with the reasons</span></div>}
                    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-24" style={{ background: 'linear-gradient(rgb(232 240 249 / 0), #e8f0f9)' }} />
                  </div>
                  <div className="mt-6 flex items-center gap-3"><h3 className="t-h3">{f.name}</h3>{f.tag && <span className="rounded-full border border-adap/40 px-2.5 py-0.5 text-[12px] font-medium text-adap">{f.tag}</span>}</div>
                  <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{f.body}</p>
                  {f.to && <span className="link mt-4 text-[14.5px]" style={{ '--acc': ACC.adap }}>Explore<Icon name="ArrowRight" size={14} weight="bold" /></span>}
                </>
              );
              return (
                <Reveal key={f.name} delay={i * 80}>
                  {f.to ? <Link to={f.to} className="card card-hover block h-full p-5 md:p-6">{inner}</Link> : <div className="card h-full p-5 md:p-6" style={{ borderColor: 'rgb(60 200 246 / .35)' }}>{inner}</div>}
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="sig-h">
        <div className="wrap">
          <SectionHead align="left" id="sig-h" acc={ACC.adap} eyebrow="How the score is built" title="A valid password proves nothing. Behaviour does." lead="A baseline for every person from your identity provider, IAM, HR and SaaS logs. Departures raise the score, with the reasons attached." />
          <div className="mt-12"><Points items={SIGNALS} acc="adap" /></div>
        </div>
      </section>

      <section className="sec" aria-labelledby="pol-h">
        <div className="wrap grid items-center gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow" style={{ '--acc': ACC.adap }}>From score to action</p>
            <h2 id="pol-h" className="t-h2 mt-6">Your policy decides what each score does.</h2>
            <p className="t-lead mt-5">Low risk passes silently. Rising risk asks for proof. High risk is held or blocked, by policy, in seconds.</p>
          </Reveal>
          <Reveal delay={100}><RiskPolicy /></Reveal>
        </div>
      </section>

      <section className="sec-tight" aria-labelledby="con-h">
        <div className="wrap">
          <Reveal><p className="kicker mb-6" id="con-h">Connects to your identity sources, read-only</p></Reveal>
          <Reveal delay={80}><Connectors keys={['okta', 'entra', 'ad', 'm365', 'google', 'aws', 'github', 'atlassian', 'salesforce', 'slack']} /></Reveal>
        </div>
      </section>

      <Stats acc="adap" items={p.stats} title="The cost of a login nobody questioned" {...STORIES.cirm} />
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} title="Blogs on identity attacks" />
      <CtaBand related={[LINKS.zenstra, LINKS.nhi, LINKS.icms]} relatedTitle="Other Deep Algorithms products" accent="adap" title={p.cta.title} body={p.cta.body} />
    </>
  );
}
