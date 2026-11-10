import { useState } from 'react';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { trail } from '../../data/ia.js';
import { Button, Icon, Reveal, SectionHead, cx } from '../../components/ui.jsx';
import { CtaBand, DecisionCard, Faq, FeatureCard, PageHero, ProductLabel, ResearchCards, Section, StatTile, SubNav } from '../../components/ds.jsx';
import CirmWorkflow from '../../components/demos/CirmWorkflow.jsx';

const p = PRODUCTS.cirm;

const ZONES = [
  { to: 40, label: 'Allow', tone: 'var(--color-ok)', act: 'Work continues. Nothing is interrupted.' },
  { to: 60, label: 'Watch', tone: 'var(--color-warn)', act: 'Scored more often; the owner sees the reasons.' },
  { to: 80, label: 'Step-up', tone: 'var(--color-hold)', act: 'A stronger check through your identity provider before the next sensitive action.' },
  { to: 101, label: 'Hold and contain', tone: 'var(--color-crit)', act: 'Sessions held or revoked, the SOC notified with the evidence attached.' },
];
function PolicySlider() {
  const [v, setV] = useState(81);
  const z = ZONES.find((x) => v < x.to);
  return (
    <div className="card p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <label htmlFor="risk-v" className="app-label">Risk score</label>
          <p className="num mt-1 text-[56px] font-semibold leading-none" style={{ color: z.tone }}>{v}</p>
        </div>
        <div className="max-w-[440px] sm:text-right" aria-live="polite">
          <p className="t-h3" style={{ color: z.tone }}>{z.label}</p>
          <p className="mt-1 t-body">{z.act}</p>
        </div>
      </div>
      <div className="mt-8">
        <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
          {ZONES.map((x, i) => <span key={x.label} style={{ flex: x.to - (i ? ZONES[i - 1].to : 0), background: x.tone, opacity: x === z ? 1 : 0.28 }} />)}
        </div>
        <input id="risk-v" type="range" min="0" max="100" value={v} onChange={(e) => setV(+e.target.value)} aria-valuetext={`${v}: ${z.label}`}
          className="mt-3 w-full accent-[var(--color-brand)]" />
        <div className="mt-1 grid grid-cols-4 t-caption">{ZONES.map((x) => <span key={x.label}>{x.label}</span>)}</div>
      </div>
      <p className="mt-6 t-caption">Move the score. Thresholds and responses are your policy; these are an example.</p>
    </div>
  );
}

const SIGNALS = [
  ['Pulse', 'Behaviour baseline', 'When, where and how each person usually works: hours, apps, volumes and sequences.'],
  ['TreeStructure', 'Access and privilege', 'What each identity can reach, what it actually uses, and privilege it has newly gained.'],
  ['DeviceMobile', 'Device and location', 'First-seen devices, impossible travel and sessions that change hands.'],
  ['IdentificationCard', 'HR and lifecycle', 'Joiners, movers and leavers from your HR systems, so access is read against role.'],
  ['ChatCircleText', 'Explained in plain language', 'A 0 to 100 score where every point of risk carries its reason.'],
  ['Lightning', 'Day-one detection', 'Transfer learning means scoring starts on day one, without a long learning period.'],
];

const WITHOUT = [['Day 0, 02:14', 'Login from a new device. Password and MFA both pass.'], ['Day 3', 'A mailbox rule starts forwarding invoices outside.'], ['Day 12', 'Three years of finance files are exported.'], ['Day 47', 'Found during an audit. The data is long gone.']];
const WITH = [['02:14:07', 'The same login. Risk jumps to 64: new country and device.'], ['02:16:31', 'Forwarding rule created. Risk 81.'], ['02:16:52', 'Step-up denied by Kavya on her own phone.'], ['02:17:04', 'Sessions revoked, rule removed, SOC case opened.']];

const FAQ = [
  { title: 'How is this different from ITDR?', body: 'Identity threat detection tells you an attack happened. CIRM scores every identity continuously and acts when behaviour changes, before the stolen login is used for anything that matters.' },
  { title: 'How long before it is useful?', body: 'Scoring starts on day one. Transfer learning means there is no long baselining period before detection begins.' },
  { title: 'What does it connect to?', body: 'Read-only connectors to your identity provider, IAM, HR systems, SaaS and application logs. Responses go through your identity provider and SOC tooling.' },
  { title: 'Can my analysts see why a score changed?', body: 'Yes. Every point of risk comes with its reason in plain language, and every action is logged for review and audit.' },
  { title: 'Does it cover machine identities too?', body: 'People are scored here. Machine identities in AWS are covered by NHI Security for AWS, part of the same adapID AI platform.' },
];

export default function Cirm() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: p.name, path: p.path }]} />
      <PageHero crumbs={trail(p.path)} mark={<ProductLabel p="adapid" name="Continuous Identity Risk Management" sub="adapID AI" />}
        title="A live risk score for every identity, acted on the moment it changes."
        lead="CIRM learns how each person normally works across your identity provider, cloud and SaaS, scores every session continuously with the reasons attached, and steps up, holds or contains the identity when behaviour changes."
        actions={<><Button to="/request-demo?product=adapid" size="lg" arrow>Book a demo</Button><Button href="#workflow" variant="secondary" size="lg">See the seven stages</Button></>}
        media={(
          <div className="relative mx-auto max-w-[520px]">
            <DecisionCard subject="Kavya Reddy · Treasury analyst" sub="Decided by adapID CIRM" d="hold" label="Session held" reasons={[['Sign-in from Lagos at 02:14, new device', '+46'], ['Forwarding rule to an outside domain', '+17'], 'Step-up through Okta denied; sessions revoked']} policy="Treasury · score ≥ 80" id="DEC-7F2A91" time="02:17" />
            <div className="card mt-4 grid grid-cols-3 divide-x divide-line p-0 text-center">
              {[['18', 'baseline'], ['81', 'at 02:16'], ['2 min', 'to contain']].map(([v, l]) => <div key={l} className="p-4"><p className="num text-[22px] font-semibold text-ink">{v}</p><p className="t-caption">{l}</p></div>)}
            </div>
            <p className="mt-2 t-caption">Sample data</p>
          </div>
        )} />
      <SubNav title="CIRM" items={[['workflow', 'How it works'], ['policy', 'Policy'], ['signals', 'Signals'], ['endings', 'Before and after'], ['faq', 'FAQ']]} />

      <Section id="workflow" labelledby="wf-h">
        <SectionHead id="wf-h" eyebrow="How it works" title="Seven stages. Every identity. Always on." lead="Follow one stolen login from discovery to evidence. Pick any stage, or let it play." />
        <Reveal className="mt-10"><CirmWorkflow /></Reveal>
      </Section>

      <Section id="policy" labelledby="policy-h" tone="subtle">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center lg:gap-16">
          <SectionHead id="policy-h" eyebrow="From score to action" title="Your policy decides what each score does." lead="adapID produces the score and the reasons. You decide the thresholds and the response, per group, application or action." />
          <Reveal><PolicySlider /></Reveal>
        </div>
      </Section>

      <Section id="signals" labelledby="signals-h">
        <SectionHead id="signals-h" eyebrow="What it watches" title="A valid password proves nothing. Behaviour does." />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SIGNALS.map(([ic, t, b], i) => <Reveal key={t} delay={i * 40}><FeatureCard icon={ic} acc="var(--color-adap)" title={t}>{b}</FeatureCard></Reveal>)}
        </div>
      </Section>

      <Section id="endings" labelledby="endings-h" tone="subtle">
        <SectionHead id="endings-h" eyebrow="Before and after" title="The same stolen password. Two endings." />
        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {[['Without CIRM', 'Found after 47 days, with no alerts', WITHOUT, 'crit'], ['With CIRM', 'Contained in under 3 minutes', WITH, 'ok']].map(([t, sub, rows, tone]) => (
            <Reveal key={t} className="card p-6 md:p-7">
              <div className="flex items-center justify-between gap-3"><h3 className="t-h4">{t}</h3><span className={cx('badge', `badge-${tone}`)}>{sub}</span></div>
              <ol className="mt-5 space-y-4 border-l-2 border-line pl-5">
                {rows.map(([when, what]) => (
                  <li key={when} className="relative">
                    <span className={cx('absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white', tone === 'ok' ? 'bg-ok' : 'bg-crit')} />
                    <p className="mono text-ink-3">{when}</p><p className="mt-0.5 t-body !text-ink">{what}</p>
                  </li>
                ))}
              </ol>
            </Reveal>
          ))}
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <StatTile {...p.stats[0]} />
          <div className="card flex flex-col justify-center p-6"><Icon name="Info" size={20} className="text-brand" /><p className="mt-3 t-body">The two timelines are an illustration of how a stolen-credential attack unfolds, not a customer case.</p></div>
        </div>
      </Section>

      <Faq items={FAQ} title="Questions about CIRM" />
      <ResearchCards slugs={p.research} title="Research on identity attacks" />
      <CtaBand title={p.cta.title} body={p.cta.body} primary={{ label: 'Book a demo', to: '/request-demo?product=adapid' }} />
    </>
  );
}
