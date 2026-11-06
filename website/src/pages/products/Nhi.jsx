import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { trail } from '../../data/ia.js';
import { Button, Icon, Reveal, SectionHead } from '../../components/ui.jsx';
import { Badge, CtaBand, Faq, PageHero, ProductLabel, ResearchCards, Section, StatTile, SubNav, SampleNote } from '../../components/ds.jsx';
import NhiExplorer from '../../components/demos/NhiExplorer.jsx';
import { Logo } from '../../components/viz/kit.jsx';

const p = PRODUCTS.nhi;

const TRUST = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::<adapid-account>:root" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "sts:ExternalId": "<your-external-id>" } }
  }]
}`;
const BASELINES = [
  ['lambda-kyc-sync', 'lambda', 'GetSecretValue from eu-west-1', 'Established', 'Needs review', 'warn'],
  ['ecs-notify-svc', 'ecs', 'New S3 bucket read at 02:14', 'Established', 'Malicious', 'crit'],
  ['glue-ledger-etl', 'glue', 'Job ran at 3× usual volume', 'Established', 'Legitimate', 'ok'],
  ['sm-fraud-train', 'iam', 'Called iam:PassRole', 'Learning', 'Needs review', 'warn'],
];
const SECRETS = [
  ['AKIA••••7Q2F', 'payments-api/config.yml', '2 days ago', 'Real secret', 'crit'],
  ['ghp_••••x91', 'infra/deploy.sh', 'Today', 'Real secret', 'crit'],
  ['AKIA••••EXAMPLE', 'docs/setup.md', '1 week ago', 'Known harmless', 'ok'],
  ['db_password', '3 places in one commit (CodeCommit)', 'Yesterday', 'Repeated value', 'warn'],
];
const FAQ = [
  { title: 'What access does adapID need?', body: 'One read-only IAM role per AWS account, assumed with an external ID. Nothing is installed on workloads and nothing is written to your accounts.' },
  { title: 'Which identities are covered?', body: 'IAM roles, users, service-linked roles and workload identities across accounts and regions, with their credentials and trust relationships.' },
  { title: 'How do you know what is used?', body: 'Granted permissions are compared with 90 days of CloudTrail activity, so unused access stands out for removal.' },
  { title: 'Where do you look for leaked secrets?', body: 'GitHub and AWS CodeCommit, with model-based triage so analysts see real exposures first, and full-history deep scans on demand.' },
  { title: 'Will it change anything in our accounts?', body: 'No. Least-privilege policies are proposed to the identity’s owner for approval; the before and after are kept as evidence.' },
];

export default function Nhi() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'adapID AI', path: '/adapid-ai' }, { name: p.name, path: p.path }]} />
      <PageHero crumbs={trail(p.path)} mark={<ProductLabel p="adapid" name="NHI Security for AWS" sub="adapID AI" />}
        title="Every machine identity in your AWS accounts. Found, scored, right-sized."
        lead="adapID discovers every IAM role, user, access key and workload identity across your accounts, compares what each can do with what it actually does, and proposes the least privilege it needs."
        actions={<><Button to="/request-demo?product=nhi" size="lg" arrow>Connect a sandbox account</Button><Button href="#explorer" variant="secondary" size="lg">Explore the inventory</Button></>}
        media={(
          <div className="grid grid-cols-2 gap-4">
            {[['12,708', 'machine identities found', 'Key'], ['1,942', 'with no owner on record', 'Warning'], ['71%', 'of granted permissions unused in 90 days', 'ChartBar'], ['14', 'secrets exposed in code', 'GitBranch']].map(([v, l, ic]) => (
              <div key={l} className="card p-5"><Icon name={ic} size={20} className="text-adap" /><p className="num mt-3 text-[30px] font-semibold leading-none text-ink">{v}</p><p className="mt-2 t-small">{l}</p></div>
            ))}
            <p className="col-span-2 t-caption">A first scan of a sample estate of three accounts. Sample data.</p>
          </div>
        )} />
      <SubNav title="NHI Security for AWS" items={[['explorer', 'Explorer'], ['deploy', 'How it connects'], ['baselines', 'Baselines'], ['secrets', 'Secrets in code'], ['faq', 'FAQ']]} />

      <Section id="explorer" labelledby="ex-h">
        <SectionHead id="ex-h" eyebrow="Cloud identity explorer" title="What it is, what it reaches, why it is risky, and the fix." lead="Pick an identity. See who uses it, what it can reach, what it really uses, and the policy that would right-size it." />
        <Reveal className="mt-10"><NhiExplorer /><SampleNote /></Reveal>
      </Section>

      <Section id="deploy" labelledby="dep-h" tone="subtle">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHead id="dep-h" eyebrow="How it connects" title="One read-only role per account. Results in minutes." lead="adapID assumes a read-only role with an external ID, reads IAM configuration and 90 days of CloudTrail, and sends findings to the owners you name." />
            <ol className="mt-8 space-y-3">
              {[['iam', 'A read-only IAM role in each AWS account', 'No agents and nothing written to your accounts'], ['cloudtrail', '90 days of CloudTrail and current IAM configuration', 'Granted permissions compared with real use'], ['jira', 'Findings to owners in Jira or Slack', 'Fixes proposed, approved and verified']].map(([k, t, s], i) => (
                <li key={t} className="card flex items-center gap-4 p-4">
                  <span className="num w-5 text-[13px] font-semibold text-brand">{i + 1}</span>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-line bg-white" aria-hidden="true"><Logo k={k} size="20px" /></span>
                  <span><span className="block text-[14.5px] font-semibold text-ink">{t}</span><span className="t-caption">{s}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <Reveal className="self-center">
            <p className="app-label mb-2">Trust policy for the read-only role</p>
            <pre className="overflow-x-auto rounded-[12px] border border-line bg-white p-5 font-mono text-[13px] leading-6 text-ink" tabIndex={0} aria-label="Trust policy JSON"><code>{TRUST}</code></pre>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <StatTile {...p.stats[0]} className="!p-5" />
              <StatTile {...p.stats[1]} className="!p-5" />
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="baselines" labelledby="bl-h">
        <SectionHead id="bl-h" eyebrow="Behavioural baselines" title="Every workload has a normal. adapID notices when it changes." lead="Baselines for 26 AWS workload families, from Lambda to SageMaker. Each change is triaged, so analysts see what matters first." />
        <Reveal className="card mt-10 overflow-x-auto">
          <table className="dt min-w-[680px]">
            <caption className="sr-only">Workload behaviour changes and their triage</caption>
            <thead><tr><th>Workload</th><th>What changed</th><th>Baseline</th><th>Triage</th></tr></thead>
            <tbody>{BASELINES.map(([n, k, c, b, t, tone]) => <tr key={n}><td><span className="flex items-center gap-2.5"><Logo k={k} size="18px" /><span className="mono font-semibold text-ink">{n}</span></span></td><td>{c}</td><td>{b}</td><td><Badge tone={tone} dot>{t}</Badge></td></tr>)}</tbody>
          </table>
        </Reveal>
      </Section>

      <Section id="secrets" labelledby="sc-h" tone="subtle">
        <SectionHead id="sc-h" eyebrow="Secrets in code" title="Keys leaked into code, found and ranked by real risk." lead="GitHub and AWS CodeCommit are scanned, and each finding is triaged so a real production key is never buried under documentation examples." />
        <Reveal className="card mt-10 overflow-x-auto">
          <table className="dt min-w-[680px]">
            <caption className="sr-only">Secrets found in code repositories</caption>
            <thead><tr><th>Secret</th><th>Where</th><th>Committed</th><th>Triage</th></tr></thead>
            <tbody>{SECRETS.map(([n, w, c, t, tone]) => <tr key={n}><td className="mono font-semibold !text-ink">{n}</td><td>{w}</td><td>{c}</td><td><Badge tone={tone} dot>{t}</Badge></td></tr>)}</tbody>
          </table>
        </Reveal>
        <SampleNote />
      </Section>

      <Faq items={FAQ} title="Questions about NHI Security" />
      <ResearchCards slugs={p.research} />
      <CtaBand title={p.cta.title} body={p.cta.body} primary={{ label: 'Connect a sandbox account', to: '/request-demo?product=nhi' }} />
    </>
  );
}
