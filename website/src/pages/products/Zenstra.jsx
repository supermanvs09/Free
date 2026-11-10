import { Link } from 'react-router';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { PLATFORMS, trail } from '../../data/ia.js';
import { Button, Icon, Reveal, SectionHead } from '../../components/ui.jsx';
import { CtaBand, DecisionCard, Faq, PageHero, ProductLabel, ResearchCards, Section, StatTile, SubNav, SampleNote } from '../../components/ds.jsx';
import ZenConsole from '../../components/demos/ZenConsole.jsx';
import { Logo } from '../../components/viz/kit.jsx';

const p = PRODUCTS.zenstra;
const Z = PLATFORMS[1];

const WAYS = [
  { icon: 'Code', h: 'SDK', p: 'For agents your teams build: identity, task and every tool call checked inline.', code: 'zenstra.check(agent, task, call)' },
  { icon: 'Cloud', h: 'Gateway', p: 'In your VPC or Kubernetes cluster, deployed with Helm or Terraform on AWS, Azure or Google Cloud.', logos: ['aws', 'azure', 'gcp', 'kubernetes', 'terraform'] },
  { icon: 'Laptop', h: 'AI Discovery app', p: 'On Windows and macOS, deployed through Intune, Jamf or Kandji, to find the AI tools staff already use.', logos: ['windows', 'apple'] },
];
const CHANGES = [
  ['Discover', 'Agents found after an incident, one platform at a time', 'One inventory of every agent, each with a named owner'],
  ['Access', 'Standing keys and service accounts with broad scope', 'Grants scoped to the task that expire on their own'],
  ['Act', 'Logs that show what happened, after it happened', 'Every action decided inline, before it runs'],
  ['Stop', 'A separate switch in every vendor to stop one agent', 'One revocation stops an agent everywhere, in seconds'],
  ['Prove', 'Evidence pulled together by hand for every exam', 'A tamper-evident record, exported as evidence'],
];
const PLATS = [['copilotstudio', 'Copilot Studio'], ['copilot', 'Microsoft Copilot'], ['claude', 'Claude'], ['cursor', 'Cursor'], ['n8n', 'n8n'], ['langchain', 'LangChain'], ['langgraph', 'LangGraph'], ['mcp', 'MCP servers']];
const FAQ = [
  { title: 'Do we have to rewrite our agents?', body: 'No. Tool calls pass through the Zenstra gateway, and discovery uses read-only connections to the platforms your teams already build on. Agents keep working as they are.' },
  { title: 'Where does Zenstra run?', body: 'The gateway runs inside your own VPC. Prompts and payloads stay in your cloud; Zenstra decides on the call and records the decision.' },
  { title: 'Which agents and platforms does it cover?', body: 'Copilots, cloud agents, workflow automations such as n8n and Zapier, coding agents such as Cursor and Claude, and the MCP servers they connect to.' },
  { title: 'Will it slow our agents down?', body: 'Decisions are made inline in milliseconds. Only the actions your policy marks as high-impact wait for a person.' },
  { title: 'What do auditors get?', body: 'A tamper-evident decision record with the agent, its task, the policy version and the outcome for every action, exported as PDF or CSV.' },
];

export default function Zenstra() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'Products', path: '/products' }, { name: 'Zenstra AI', path: p.path }]} />
      <PageHero crumbs={trail(p.path)} mark={<ProductLabel p="zenstra" name="Zenstra AI" sub="Security for AI agents" />}
        title="Let AI agents act. Check every action first."
        lead="Zenstra finds every AI agent and MCP server in your enterprise, gives each one an owner and access sized to its task, and decides every tool call before it runs, with a record your auditors can read."
        actions={<><Button to="/request-demo?product=zenstra" size="lg" arrow>Book a demo</Button><Button href="#console" variant="secondary" size="lg">Try the console</Button></>}
        media={(
          <div className="space-y-3">
            <DecisionCard subject="invoice-agent · vendors.export" sub="Copilot Studio · owner: Finance ops" d="block" reasons={['Not part of its declared task: invoice processing', 'Destination outside the company domain']} policy="invoice-processing v3" id="ZEN-3B9E02" time="10:02:15" />
            <DecisionCard compact subject="support-triage · refunds.issue ₹12,000" sub="Claude · owner: Support" d="hold" label="Held for approval" reasons={['Above the ₹5,000 refund limit in its grant']} />
            <p className="t-caption">Sample data</p>
          </div>
        )} />
      <SubNav title="Zenstra AI" items={[['console', 'Console'], ['capabilities', 'Capabilities'], ['deploy', 'Deployment'], ['changes', 'What changes'], ['faq', 'FAQ']]} />

      <Section id="console" labelledby="con-h">
        <SectionHead id="con-h" eyebrow="The agent console" title="Treat every AI agent like the employee it acts as." lead="Pick an agent and fire a tool call. The gateway checks it against the agent’s declared task, its grant and your policy, then allows it, holds it for a named approver or blocks it, and records why." />
        <Reveal className="mt-10"><ZenConsole /><SampleNote /></Reveal>
      </Section>

      <Section id="capabilities" labelledby="caps-h" tone="subtle">
        <SectionHead id="caps-h" eyebrow="Six capabilities" title="From the first agent to the last audit." lead="Each works on its own and gets stronger with the others." />
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          {Z.groups.map((g) => (
            <div key={g.name}>
              <h3 className="app-label">{g.name}</h3>
              <ul className="mt-3 space-y-3">
                {g.items.map((k) => {
                  const it = Z.items.find((x) => x.key === k);
                  return (
                    <li key={k}>
                      <Link to={it.path} className="card card-link group flex items-center gap-4 p-5">
                        <span className="ptile" style={{ '--acc': Z.acc }}><Icon name={it.icon} size={20} /></span>
                        <span className="min-w-0 flex-1"><span className="block t-h4 group-hover:text-brand">{it.name}</span><span className="block t-small">{it.desc}</span></span>
                        <Icon name="ArrowRight" size={16} className="shrink-0 text-ink-4 group-hover:text-brand" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section id="deploy" labelledby="dep-h">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
          <div>
            <SectionHead id="dep-h" eyebrow="Deployment" title="Deploys the way your stack already works." lead="No agent rewrite. Prompts and payloads are evaluated inside your environment; only decisions and redacted evidence reach the Zenstra console." />
            <p className="mt-8 app-label">Covers agents built on</p>
            <ul className="mt-3 flex flex-wrap gap-2">{PLATS.map(([k, n]) => <li key={k} className="inline-flex items-center gap-2 rounded-[8px] border border-line bg-bg-2 px-2.5 py-1.5 text-[13.5px] font-medium text-ink"><Logo k={k} size="15px" />{n}</li>)}</ul>
          </div>
          <ol className="space-y-3">
            {WAYS.map((w, i) => (
              <Reveal as="li" key={w.h} delay={i * 60} className="card flex gap-4 p-5">
                <span className="ptile" style={{ '--acc': 'var(--color-zen)' }}><Icon name={w.icon} size={20} /></span>
                <div className="min-w-0">
                  <p className="t-h4">{w.h}</p>
                  <p className="mt-1 t-small !text-ink-2">{w.p}</p>
                  {w.code && <code className="mt-3 inline-block rounded-[6px] bg-bg-2 px-2 py-1 font-mono text-[12.5px] text-ink">{w.code}</code>}
                  {w.logos && <span className="mt-3 flex gap-3">{w.logos.map((k) => <Logo key={k} k={k} size="20px" />)}</span>}
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </Section>

      <Section id="changes" labelledby="chg-h" tone="subtle">
        <SectionHead id="chg-h" eyebrow="What changes" title="Five moments in every agent’s life, before and after." />
        <Reveal className="card mt-10 overflow-x-auto">
          <table className="dt min-w-[720px]">
            <caption className="sr-only">Agent security without and with Zenstra AI</caption>
            <thead><tr><th className="w-[14%]">Moment</th><th>Without Zenstra</th><th className="!bg-brand-50 !text-brand">With Zenstra</th></tr></thead>
            <tbody>{CHANGES.map(([m, a, b]) => <tr key={m}><td className="font-semibold !text-ink">{m}</td><td>{a}</td><td className="font-medium !text-ink">{b}</td></tr>)}</tbody>
          </table>
        </Reveal>
        <div className="mt-8 grid gap-5 md:grid-cols-2">{p.stats.slice(0, 2).map((st) => <StatTile key={st.v} {...st} />)}</div>
      </Section>

      <Faq items={FAQ} title="Questions about Zenstra AI" />
      <ResearchCards slugs={p.research} title="Research on AI agent security" />
      <CtaBand title={p.cta.title} body={p.cta.body} primary={{ label: 'Book a demo', to: '/request-demo?product=zenstra' }} />
    </>
  );
}

