import { Benefits } from '../../components/showcase.jsx';
import AgenticSecurity from '../../components/AgenticSecurity.jsx';
import { HubSpokes } from '../../lib/nullmotion.jsx';
import { AgentConsole, AgentAccess } from '../../components/viz/refs.jsx';
import { Seo } from '../../lib/head.jsx';
import { PRODUCTS } from '../../data/products.js';
import { Button, Icon, Reveal, SectionHead } from '../../components/ui.jsx';
import { CtaBand, ResearchRow } from '../../components/blocks.jsx';
import { Hero, Integrations, Faq, Compare, Explorer, Explore, LINKS } from '../../components/ProductKit.jsx';
import { ZenGateway, ZenInventory, ZenGrant, ZenMcp, ZenDetect, ZenRecord } from '../../components/viz/zenstra.jsx';
import { Logo, logoTitle } from '../../components/viz/kit.jsx';

const p = PRODUCTS.zenstra;

const CAPS = [
  { tab: 'Discover', anchor: 'cap-discover', icon: 'MagnifyingGlass', h: 'Every agent, including the shadow ones', p: 'Every agent, built or bought, in one inventory with an owner.', points: ['Copilot Studio, Claude, Cursor, n8n, LangGraph and more', 'Agents with no owner flagged for assignment', 'Ranked by what they can reach'], steps: [['Connect', 'Read-only connections to Copilot Studio, Claude, Cursor, n8n, LangGraph and your cloud accounts.'], ['Scan', 'Agents are found by what they are and what they touch, not by who registered them.'], ['Assign', 'Agents with no owner are flagged, assigned and ranked by access and behaviour.']], V: ZenInventory },
  { tab: 'Scope', anchor: 'cap-scope', icon: 'Fingerprint', h: 'An owner, a job and access that expires', p: 'The narrowest grant for each task. When the task ends, so does the access.', points: ['Wildcard roles replaced with task-sized grants', 'Standing keys removed', 'Risk explained in plain language'], steps: [['Declare', 'The owner states what the agent is for and which systems it may use.'], ['Grant', 'Zenstra issues the narrowest access for that task and no more.'], ['Expire', 'Access ends with the task. Renewal needs the owner, not the agent.']], V: ZenGrant },
  { tab: 'Enforce', anchor: 'cap-enforce', icon: 'ShieldCheck', h: 'Allow, hold or block, before the call runs', p: 'A gateway in your VPC checks each tool call against task, grant and policy in milliseconds.', points: ['No agent rewrite', 'Payloads never leave your cloud', 'Human approval where it counts'], steps: [['Intercept', 'Tool calls pass through the gateway. Agents are not rewritten.'], ['Decide', 'Each call is checked against the task, the grant and your policy.'], ['Act', 'Allow, block, contain the agent or send the call to a named approver.']], V: ZenGateway, props: { compact: true } },
  { tab: 'MCP', anchor: 'cap-mcp', icon: 'PlugsConnected', h: 'Trust MCP servers on purpose', p: 'Approved servers and tools per agent. Any changed tool definition is held.', points: ['Per-agent tool scope', 'Changed tools held with the difference shown', 'Unofficial servers kept out by default'], steps: [['Inventory', 'Every MCP server in use is listed with its source and the agents that call it.'], ['Approve', 'Owners allow-list servers and tools per agent. Everything else is blocked.'], ['Watch', 'A changed tool definition is held for review before any agent calls it.']], V: ZenMcp },
  { tab: 'Detect', anchor: 'cap-detect', icon: 'Pulse', h: 'Misuse of legitimate access, caught', p: 'A baseline per agent. Step outside the task, even with valid credentials, and it is contained.', points: ['Beyond what an access check allows', 'Containment by policy', 'Evidence attached'], steps: [['Learn', 'A behaviour baseline per agent: tools, volumes, destinations and timing.'], ['Spot', 'Departures from the baseline and from the declared task are scored and explained.'], ['Contain', 'Tokens are revoked or the agent paused, and the owner gets the evidence.']], V: ZenDetect },
  { tab: 'Prove', anchor: 'cap-prove', icon: 'ClipboardText', h: 'A record an auditor can read', p: 'Agent, task, policy and outcome on one tamper-evident line. Ready for SOC 2, ISO/IEC 42001 and DPDPA.', points: ['Tamper-evident chain', 'Policy version on every decision', 'PDF and CSV export'], steps: [['Record', 'Each decision is written as it happens, with the policy that produced it.'], ['Chain', 'Entries are linked so any edit or gap is visible.'], ['Export', 'Package evidence for auditors and regulators in one step.']], V: ZenRecord },
];

const FAQ = [
  { title: 'Do we have to rewrite our agents?', body: 'No. Tool calls pass through the Zenstra gateway, and discovery uses read-only connections to the platforms your teams already build on. Agents keep working as they are.' },
  { title: 'Where does Zenstra run?', body: 'The gateway runs inside your own VPC. Prompts and payloads stay in your cloud; Zenstra decides on the call and records the decision.' },
  { title: 'Which agents and platforms does it cover?', body: 'Copilots, cloud agents, workflow automations such as n8n and Zapier, coding agents such as Cursor and Claude, and the MCP servers they connect to.' },
  { title: 'Will it slow our agents down?', body: 'Decisions are made inline in milliseconds. Only the actions your policy marks as high-impact wait for a person.' },
  { title: 'What do auditors get?', body: 'A tamper-evident decision record with the agent, its task, the policy version and the outcome for every action, exported as PDF or CSV.' },
  { title: 'Why can’t traditional IAM handle AI agents?', body: 'Agents act on their own, at machine speed, across many tools, often with a person’s or a shared credential. Login-time checks and static roles do not see what an agent does after it starts, so Zenstra checks each tool call at runtime.' },
  { title: 'Can Zenstra find shadow AI agents?', body: 'Yes. It discovers agents and MCP servers across your cloud platforms, automation tools and staff devices, including the ones built without IT, and asks for an owner for each.' },
  { title: 'How does it help against prompt injection and excessive agency?', body: 'It does not trust what the agent was told. Each tool call is compared with the agent’s declared task and grant, so an injected instruction to export data or call an unapproved tool is blocked, whatever the prompt said.' },
];

/* Three ways in, as zenstra.ai sets them out: an SDK for agents your teams
   build, a gateway in your own cloud, and an app that finds the AI on staff
   devices. Each card says where it runs and what it runs on. */
const WAYS = [
  { icon: 'Code', h: 'SDK', p: 'For agents your teams build: identity, task and every tool call checked inline.', code: 'zenstra.check(agent, task, call)' },
  { icon: 'Cloud', h: 'Gateway', p: 'In your VPC or Kubernetes cluster, deployed with Helm or Terraform on AWS, Azure or Google Cloud.', logos: ['aws', 'azure', 'gcp', 'kubernetes', 'terraform'] },
  { icon: 'Laptop', h: 'AI Discovery app', p: 'On Windows and macOS, deployed through Intune, Jamf or Kandji, to find the AI tools staff already use.', logos: ['windows', 'apple'] },
];
function Deployment() {
  return (
    <ol className="space-y-3">
      {WAYS.map((w, i) => (
        <Reveal as="li" key={w.h} delay={i * 90} className="card card-hover flex gap-4 p-5 md:p-6">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]" style={{ background: 'color-mix(in oklab, var(--color-zen) 16%, transparent)', color: 'var(--color-zen)' }}><Icon name={w.icon} size={22} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold tracking-[-0.01em]">{w.h}</span>
            <span className="mt-1 block text-[16px] leading-relaxed text-ink-2">{w.p}</span>
            {w.logos && (
              <span className="mt-3 flex flex-wrap gap-2">
                {w.logos.map((k) => <span key={k} title={logoTitle(k)} className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-white text-[#12171f]"><Logo k={k} size={19} color={k === 'azure' ? '#0078d4' : undefined} /><span className="sr-only">{logoTitle(k)}</span></span>)}
              </span>
            )}
            {w.code && <code className="mono mt-3 inline-block rounded-[8px] border border-line bg-fg/[.04] px-2.5 py-1.5 text-[13px] text-ink-2">{w.code}</code>}
          </span>
        </Reveal>
      ))}
    </ol>
  );
}


/* The platform at a glance, from the Zenstra AI product sheet: three pillars,
   twelve capabilities, the stacks it covers, and the technical snapshot. */
const PILLARS = [
  ['Eye', 'Identity Vector', 'Observability', 'See every agent, every action, in real time.'],
  ['LockKey', 'Khetaka Vault', 'Governance', 'Institutional memory of intent and behaviour.'],
  ['ShieldCheck', 'Zero Standing Privilege', 'Security', 'Access granted only when needed, verified continuously.'],
];
const CAPLIST = [
  ['MagnifyingGlass', 'Agent and shadow agent discovery'], ['Target', 'Intent verification'], ['LockKey', 'Zero standing privilege'],
  ['EyeSlash', 'PII and sensitive data protection'], ['ChartBar', 'Behavioural drift detection'], ['Desktop', 'Shadow LLM detection'],
  ['UserCircle', 'Dynamic contextual identity'], ['Sliders', 'Policy-driven governance'], ['Pulse', 'Runtime anomaly detection'],
  ['Lightning', 'Deterministic acceleration'], ['FileText', 'Cryptographic audit trail'], ['Stack', 'Vendor-neutral by design'],
];
const STACK = [['copilotstudio', 'Copilot Studio'], ['n8n', 'n8n'], [null, 'crewAI'], ['langchain', 'LangChain'], [null, 'ChatGPT'], ['m365', 'Microsoft Copilot'], ['claude', 'Claude'], [null, 'Codex'], ['aws', 'AWS Bedrock']];
const SNAPSHOT = [['Identity', 'S-stream context-based identity, recomputed for every action'], ['Authorisation', 'Zero standing privilege, action-scoped tokens'], ['Compliance', 'DPDPA · HIPAA · GDPR · SOC 2 Type II']];

export default function Zenstra() {
  return (
    <>
      <Seo title={p.seoTitle} description={p.description} path={p.path} crumbs={[{ name: 'Zenstra AI', path: p.path }]} />
      <Hero layout="stack" glance={[['Protects', 'AI agents you build and the ones you buy'], ['Stops', 'Any action outside an agent’s task, before it runs'], ['Deploys', 'A gateway inside your VPC'], ['Shows', 'A tamper-evident record of every decision']]} acc="zen" crumbs={[{ name: 'Zenstra AI' }]} eyebrow="Zenstra AI · Security for AI agents"
        title={<>Let AI agents act. Check every action first.</>}
        lead="Find every AI agent, give it an owner and a scope, and check every tool call before it runs."
        ctas={<><Explore label="See it check an agent" /><Button href="https://www.zenstra.ai" target="_blank" rel="noopener" variant="ghost" size="lg">Visit zenstra.ai<Icon name="ArrowUpRight" size={16} /></Button></>}
        note="One platform for copilots, cloud agents, workflow automations, coding agents and MCP servers.">
      </Hero>

      {/* controlled access: every agent tied to a person, every grant scoped */}
      <section className="sec" aria-labelledby="where-h">
        <div className="wrap">
          <div className="island tone-d px-4 py-14 md:px-10 md:py-20">
            <SectionHead id="where-h" eyebrow="Controlled access" title="Agent security starts with an owner and a scope." lead="Every agent tied to its owner, with access narrowed to its task." />
            <ul className="mx-auto mt-8 grid max-w-[880px] gap-3 text-[16px] text-white/85 md:grid-cols-3">
              {['Every agent has a named owner who answers for it.', 'Every credential is mapped to the systems it reaches.', 'Every grant is scoped to the task and expires on its own.'].map((t) => <li key={t} className="flex gap-2.5"><Icon name="CheckCircle" size={18} weight="fill" className="mt-0.5 shrink-0 text-[#5b8ff5]" />{t}</li>)}
            </ul>
            <Reveal up className="mx-auto mt-12 max-w-[1040px]"><AgentAccess /></Reveal>
          </div>
        </div>
      </section>

      <AgenticSecurity head={false} />
      <Integrations title="Finds agents built on" items={[['microsoft', 'Copilot Studio'], ['claude', 'Claude'], ['chatgpt', 'ChatGPT'], ['githubcopilot', 'GitHub Copilot'], ['cursor', 'Cursor'], ['n8n', 'n8n'], ['langchain', 'LangGraph']]} />


      {/* the console: every agent with an identity, an owner and a scope */}
      <section className="sec pt-0" aria-labelledby="con-h">
        <div className="wrap">
          <SectionHead id="con-h" acc="var(--color-zen)" eyebrow="The agent console" title="Treat every AI agent like the employee it acts as." lead="Identity, owner, scope and record, from creation to retirement." />
          <Reveal up className="mx-auto mt-14 max-w-[1080px]"><AgentConsole /></Reveal>
        </div>
      </section>

      <section className="stage sec" aria-labelledby="caps-h">
        <div className="wrap">
          <SectionHead align="left" id="caps-h" acc="var(--color-zen)" eyebrow="What Zenstra does" title="From the first agent to the last audit." lead="Six capabilities that work on their own and get stronger together. Pick one to see it work." />
          <div className="mt-12"><Explorer items={CAPS} acc="zen" label="Zenstra capabilities" /></div>
        </div>
      </section>

      <section className="sec" aria-labelledby="glance-h">
        <div className="wrap">
          <SectionHead align="left" id="glance-h" acc="var(--color-zen)" eyebrow="The platform at a glance" title="Real-time visibility. Continuous intent verification." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {PILLARS.map(([ic, k, h, p], i) => (
              <Reveal key={h} delay={i * 80} className="island island-blue tone-d relative overflow-hidden p-7">
                <span className="relative grid h-12 w-12 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/25"><Icon name={ic} size={22} /></span>
                <p className="relative mt-6 text-[11.5px] font-semibold uppercase tracking-[.14em] text-white/60">{k}</p>
                <h3 className="relative mt-1 text-[24px] font-semibold tracking-[-0.02em] text-white">{h}</h3>
                <p className="relative mt-2 text-[16px] leading-relaxed text-white/80">{p}</p>
              </Reveal>
            ))}
          </div>
          <p className="kicker mt-14" style={{ '--acc': 'var(--color-zen)' }}>Capabilities</p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPLIST.map(([ic, t], i) => (
              <Reveal as="li" key={t} delay={(i % 3) * 50} className="card flex items-center gap-3.5 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#1b2a6b] text-white"><Icon name={ic} size={18} /></span>
                <span className="text-[16px] font-medium text-ink">{t}</span>
              </Reveal>
            ))}
          </ul>
          <div className="mt-14 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="kicker" style={{ '--acc': 'var(--color-zen)' }}>Works with your stack</p>
              <p className="mt-3 text-[16px] text-ink-2">Native coverage for agent and automation frameworks, plus vendor-agnostic monitoring for conversational LLMs.</p>
              <ul className="mt-5 flex flex-wrap gap-2.5">
                {STACK.map(([k, n]) => <li key={n} className="inline-flex items-center gap-2 rounded-full border border-line-2 bg-white px-3.5 py-2 text-[14px] font-medium text-[#0f172a] shadow-[0_6px_16px_-12px_rgb(11_42_82/.4)]">{k ? <Logo k={k} size="16px" /> : <Icon name="Robot" size={15} className="text-[#64748b]" />}{n}</li>)}
                <li className="inline-flex items-center rounded-full border border-dashed border-line-2 px-3.5 py-2 text-[14px] text-ink-3">and more</li>
              </ul>
            </div>
            <div>
              <p className="kicker" style={{ '--acc': 'var(--color-zen)' }}>Technical snapshot</p>
              <dl className="mt-5 divide-y divide-line border-y border-line">
                {SNAPSHOT.map(([k, v]) => <div key={k} className="grid grid-cols-[140px_1fr] gap-4 py-4"><dt className="text-[12.5px] font-semibold uppercase tracking-[.1em] text-ink">{k}</dt><dd className="text-[16px] text-ink-2">{v}</dd></div>)}
              </dl>
            </div>
          </div>
        </div>
      </section>


      <section className="sec" aria-labelledby="dep-h">
        <div className="wrap grid items-center gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <p className="eyebrow" style={{ '--acc': 'var(--color-zen)' }}>Deployment</p>
            <h2 id="dep-h" className="t-h2 mt-6">Deploys the way your stack already works.</h2>
            <p className="t-lead mt-5">No agent rewrite. Prompts and payloads are evaluated inside your environment; only decisions and redacted evidence reach the Zenstra control plane.</p>
            <HubSpokes />
          </Reveal>
          <Deployment />
        </div>
      </section>

      <section className="sec" aria-labelledby="cmp-h">
        <div className="wrap">
          <SectionHead id="cmp-h" acc="var(--color-zen)" eyebrow="Why it is different" title="Built to decide, not only to watch." />
          <Reveal className="mt-12">
            <Compare acc="zen" caption="How Zenstra compares with logging and identity tools for AI agents" cols={['Logs and SIEM', 'Identity tools', 'Zenstra AI']} rows={[
              ['Finds agents nobody registered', false, 'Some', true],
              ['Knows each agent’s task', false, false, true],
              ['Decides before the tool runs', false, 'At sign-in only', true],
              ['Catches misuse of valid access', 'After the fact', false, true],
              ['Evidence an auditor can verify', 'Raw logs', 'Access reviews', 'Tamper-evident record'],
            ]} />
          </Reveal>
        </div>
      </section>
      <Benefits title="Let AI agents act, safely" lead="What changes when every agent has an owner, a scope and a record." items={[
          ['watch', 'Every agent, accounted for', 'Built, bought and shadow agents in one inventory, each tied to the person it acts for.'],
          ['route', 'Checked before it runs', 'Every tool call compared with the agent’s task and your policy, and held or blocked before it executes.'],
          ['hub', 'Evidence on demand', 'A tamper-evident record of every decision, ready for SOC 2, ISO/IEC 42001 and DPDPA reviews.'],
        ]} />
      <Faq items={FAQ} />
      <ResearchRow slugs={p.research} title="Blogs on AI agent security" />
      <CtaBand related={[LINKS.cirm, LINKS.nhi, LINKS.icms]} accent="zen" title={p.cta.title} body={p.cta.body} />
    </>
  );
}
