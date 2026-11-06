import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { PLATFORMS, trail } from '../../data/ia.js';
import { Button, Icon, Reveal, SectionHead } from '../../components/ui.jsx';
import { ArrowLink, CtaBand, DecisionCard, Faq, PageHero, ProductLabel, ResearchCards, Section, SubNav, SampleNote } from '../../components/ds.jsx';
import IdentityInventory from '../../components/demos/IdentityInventory.jsx';
import { Logo } from '../../components/viz/kit.jsx';

const p = PRODUCTS.adapid;
const A = PLATFORMS[0];

const PREVIEW = {
  cirm: { subject: 'Kavya Reddy · Treasury', d: 'hold', label: 'Session held', reasons: [['New country and device at 02:14', '+46'], ['Forwarding rule to outside domain', '+17']] },
  nhi: { subject: 'ecs-notify-svc · IAM role', d: 'review', label: 'Right-size proposed', reasons: [['214 granted, 9 used in 90 days', '+26'], ['Read outside usual buckets', '+15']] },
  fraud: { subject: 'Payment ₹48,000 · new payee', d: 'hold', label: 'Payment held', reasons: [['Payee account 9 days old', '+37'], ['Active call during payment', '+47']] },
  ad: { subject: 'svc-backup → Domain Admins', d: 'critical', label: '4-hop path', reasons: ['Kerberoastable service account', 'GenericAll on Tier 1 admins group'] },
};
const PROBLEM = {
  cirm: 'A stolen password and an approved MFA prompt look exactly like your employee.',
  nhi: 'Roles, keys and workload identities hold broad access nobody has reviewed.',
  fraud: 'Scam payments are made by the real customer, on their own phone.',
  ad: 'One compromised account is often a few hops from Domain Admins.',
};
const CAPS = {
  cirm: ['Behaviour baseline for every person', 'Live risk score with its reasons', 'Step-up, hold or contain through your IdP'],
  nhi: ['Inventory of roles, users, keys and workloads', 'Granted versus used, from 90 days of CloudTrail', 'Least-privilege fixes with owner approval'],
  fraud: ['Behavioural biometrics and device signals', 'Scam-call and mule-account detection', 'Decisions in under 80 ms, with reasons'],
  ad: ['Attack paths to Tier 0, ranked', 'Kerberoasting, DCSync and more detected live', 'Fixes verified by a re-check'],
};

const ENGINE = [
  ['Signals', 'Plug', ['Identity providers', 'Cloud and IAM', 'HR and lifecycle', 'SaaS and app logs', 'Banking app SDK', 'Active Directory']],
  ['Baseline', 'Fingerprint', ['Usual hours and places', 'Devices and networks', 'Apps, volumes, sequences', 'Peer group']],
  ['Score', 'Gauge', ['0 to 100, continuously', 'Every point has a reason', 'Starts on day one']],
  ['Act', 'ShieldCheck', ['Allow, step-up, hold, contain', 'Through your IdP and SOC', 'Recorded as evidence']],
];

const COMPARE = [
  ['When it acts', 'After an alert fires', 'After an attack is detected', 'Continuously, before misuse'],
  ['Learns each identity’s normal', 'No', 'Partly', 'Yes, from day one'],
  ['Explains the score', 'No', 'Partly', 'In plain language, point by point'],
  ['Responds', 'Opens a ticket', 'Raises an alert', 'Step-up, hold or contain, by your policy'],
  ['Machine identities and customers', 'No', 'Limited', 'NHI Security and Fraud Prevention'],
];
const CONNECT = [['okta', 'Okta'], ['entra', 'Microsoft Entra ID'], ['ad', 'Active Directory'], ['google', 'Google Workspace'], ['m365', 'Microsoft 365'], ['aws', 'AWS'], ['salesforce', 'Salesforce'], ['slack', 'Slack'], ['github', 'GitHub'], ['android', 'Android SDK'], ['apple', 'iOS SDK'], ['splunk', 'Splunk']];

const FAQ = [
  { title: 'Is adapID AI one product or four?', body: 'One platform with four products that share a risk engine: Continuous Identity Risk Management for people, NHI Security for AWS, Identity Fraud Prevention for banking customers and Active Directory Security. Each can be deployed on its own.' },
  { title: 'How is this different from ITDR?', body: 'Identity threat detection tells you an attack happened. adapID scores every identity continuously and acts when behaviour changes, before a stolen login is used for anything that matters.' },
  { title: 'What does it connect to?', body: 'Read-only connectors to your identity provider, IAM, HR systems, SaaS and application logs; one read-only role per AWS account; an SDK in your banking apps for fraud prevention.' },
  { title: 'How long before it is useful?', body: 'Scoring starts on day one. Transfer learning means there is no long baselining period before detection begins.' },
];

export default function Adapid() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'Products', path: '/products' }, { name: 'adapID AI', path: p.path }]} />
      <PageHero crumbs={trail(p.path)} mark={<ProductLabel p="adapid" name="adapID AI" sub="Identity security platform" />}
        title="Identity security for every human and machine identity."
        lead="adapID AI learns how each person, service account, cloud role and banking customer normally behaves, scores every session continuously with the reasons attached, and acts the moment behaviour changes."
        actions={<><Button to="/request-demo?product=adapid" size="lg" arrow>Book a demo</Button><Button href="#products" variant="secondary" size="lg">See the four products</Button></>}
        below={<><IdentityInventory /><SampleNote /></>} />
      <SubNav title="adapID AI" items={[['products', 'Products'], ['engine', 'Risk engine'], ['compare', 'How it’s different'], ['connect', 'Integrations'], ['faq', 'FAQ']]} />

      <Section id="products" labelledby="products-h">
        <SectionHead id="products-h" eyebrow="Four products" title="One risk engine. Four kinds of identity." lead="Each product answers one question about one kind of identity, and each runs on its own." />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {A.items.map((it, i) => (
            <Reveal key={it.key} delay={i * 50} className="card flex flex-col p-6 md:p-7">
              <div className="flex flex-col">
                <span className="ptile" style={{ '--acc': A.acc }}><Icon name={it.icon} size={20} /></span>
                <h3 className="mt-5 t-h3">{it.name}</h3>
                <p className="mt-2 t-small !text-ink-2">{PROBLEM[it.key]}</p>
                <ul className="mt-4 space-y-2">{CAPS[it.key].map((c) => <li key={c} className="flex gap-2 text-[14px] text-ink-2"><Icon name="Check" size={16} weight="bold" className="mt-0.5 shrink-0 text-brand" />{c}</li>)}</ul>
                <ArrowLink to={it.path} className="pt-6 text-[15px]">Explore {it.short || it.name.split(' ').slice(0, 2).join(' ')}</ArrowLink>
              </div>
              <div className="mt-6 rounded-[12px] bg-bg-1 p-3"><DecisionCard compact {...PREVIEW[it.key]} /></div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="engine" labelledby="engine-h" tone="subtle">
        <SectionHead id="engine-h" eyebrow="The risk engine" title="Signals in. Explained decisions out." lead="The same engine scores a treasury analyst, an IAM role, a banking customer and a domain administrator, each against its own normal." />
        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {ENGINE.map(([t, ic, items], i) => (
            <Reveal as="li" key={t} delay={i * 60} className="card relative p-6">
              <div className="flex items-center justify-between"><span className="ptile"><Icon name={ic} size={20} /></span><span className="num t-caption">0{i + 1}</span></div>
              <h3 className="mt-5 t-h4">{t}</h3>
              <ul className="mt-3 space-y-1.5">{items.map((x) => <li key={x} className="t-small !text-ink-2">{x}</li>)}</ul>
              {i < 3 && <Icon name="ArrowRight" size={18} className="absolute -right-[13px] top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-bg-1 text-ink-4 lg:block" />}
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section id="compare" labelledby="compare-h">
        <SectionHead id="compare-h" eyebrow="How it’s different" title="ITDR tells you what happened. adapID stops what’s next." />
        <Reveal className="card mt-10 overflow-x-auto">
          <table className="dt min-w-[720px]">
            <caption className="sr-only">adapID AI compared with SIEM rules and ITDR</caption>
            <thead><tr><th scope="col" className="w-[24%]">Question</th><th scope="col">SIEM rules</th><th scope="col">ITDR</th><th scope="col" className="!bg-brand-50 !text-brand">adapID AI</th></tr></thead>
            <tbody>{COMPARE.map(([q, a, b, c]) => <tr key={q}><th scope="row" className="!static !h-auto !bg-transparent py-3 !text-[13.5px] !normal-case !tracking-normal !text-ink">{q}</th><td>{a}</td><td>{b}</td><td className="font-semibold !text-ink">{c}</td></tr>)}</tbody>
          </table>
        </Reveal>
      </Section>

      <Section id="connect" labelledby="connect-h" tone="subtle">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16">
          <SectionHead id="connect-h" eyebrow="Integrations and deployment" title="Read-only, from the systems you already run." lead="Connectors to your identity providers, cloud, HR, SaaS and application logs; one read-only role per AWS account; an SDK in your banking apps. Responses go back through your IdP, SOC and ticketing." />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CONNECT.map(([k, n]) => <li key={k} className="card flex items-center gap-3 p-3.5 text-[14px] font-medium text-ink"><span className="inline-flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true"><Logo k={k} size="20px" /></span>{n}</li>)}
          </ul>
        </div>
      </Section>

      <Faq items={FAQ} title="Questions about adapID AI" />
      <ResearchCards slugs={p.research} title="Research on identity attacks" />
      <CtaBand title={p.cta.title} body={p.cta.body} primary={{ label: 'Book a demo', to: '/request-demo?product=adapid' }} />
    </>
  );
}
