import { Seo } from '../lib/head.jsx';
import { Accordion, Breadcrumb, Button, Heading, IconTile, LearnMore, Reveal, Section } from '../components/ui.jsx';
import { CtaPanel, LogoBand, ProductCard, ResearchRow, WhatsNew } from '../components/blocks.jsx';
import Thumb from '../components/visuals/Thumb.jsx';

const GROUPS = [
  { id: 'agents', title: 'Secure AI agents', lead: 'Know every agent and MCP server, scope its access to its task, and check each action before it runs.', keys: ['zenstra'] },
  { id: 'identities', title: 'Secure human and machine identities', lead: 'Score every person, role, key and service account, stop fraud at the payee and close the paths attackers take through Active Directory.', keys: ['adapid', 'nhi', 'fraud', 'ad'] },
  { id: 'exposure', title: 'Protect applications and availability', lead: 'Find what is actually exploitable, stop bots by intent and keep services online under attack.', keys: ['botshield', 'ddos'] },
  { id: 'compliance', title: 'Prove compliance', lead: 'Check every access to personal data against purpose and consent, with audit evidence assembled as it happens.', keys: ['icms'] },
];

const CAN_DO = [
  { icon: 'MagnifyingGlass', title: 'Discover every identity', body: 'People, roles, keys, service accounts and AI agents in one inventory.', to: '/adapid-ai/nhi-security' },
  { icon: 'Gauge', title: 'Score risk with reasons', body: 'Posture, access and behaviour combined, explained in plain language.', to: '/adapid-ai' },
  { icon: 'ShieldCheck', title: 'Enforce at runtime', body: 'Allow, block, contain or ask before an agent action runs.', to: '/agentic-ai/agentic-identity' },
  { icon: 'Wallet', title: 'Stop fraud early', body: 'Every login, payee and payment scored before it clears.', to: '/adapid-ai/fraud-prevention' },
  { icon: 'TreeStructure', title: 'Close attack paths', body: 'Every route to Domain Admins mapped and ranked.', to: '/ad-security' },
  { icon: 'ClipboardText', title: 'Prove it to auditors', body: 'DPDPA, RBI and SEBI evidence without the scramble.', to: '/dpdpa-compliance' },
];

export const FAQ = [
  { title: 'How do Zenstra AI and adapID AI differ?', body: 'Zenstra AI secures AI agents: it finds every agent and MCP server, scopes its access and checks each action before it runs. adapID AI secures human and machine identities and stops identity fraud. They share one inventory and one risk model, so a risky agent using an over-privileged role shows up as one story.' },
  { title: 'Can we start with one product?', body: 'Yes. Each product works on its own, so you can start with the risk that worries you most, such as machine identities in AWS or AI agents. They share one inventory and one risk model, so adding another later does not mean starting over.' },
  { title: 'Does NHI Security for AWS install anything in our accounts?', body: 'No. It is agentless: you create one read-only IAM role per AWS account, three connection checks verify access, and discovery starts on the first sync. Nothing is installed on workloads and nothing is written to your accounts.' },
  { title: 'Where do the products run?', body: 'Connectors are read-only and run against your identity sources. The Zenstra AI gateway sits inside your own VPC, so prompts and payloads stay in your cloud. Deployment options differ by product, so tell us what your estate looks like and we will say what fits.' },
  { title: 'Which regulations do the products help with?', body: 'The ICMS Compliance Suite is built around DPDPA 2023, with evidence mapped to RBI and SEBI expectations. Our own programme is certified to ISO 27001, SOC 2 Type II, ISO 42001 and ISO 27701.' },
  { title: 'How do we get a demo?', body: 'Book a 30-minute session from the demo page. We reply within one business day to confirm a time, and the 30-minute live session is built around your environment.' },
];

export default function Products() {
  const schema = [{
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.title, acceptedAnswer: { '@type': 'Answer', text: f.body } })),
  }];
  return (
    <>
      <Seo title="Products: Identity, AI Agent, Fraud and Compliance Security" path="/products" crumbs={[{ name: 'Products', path: '/products' }]} schema={schema}
        description="Every Deep Algorithms product in one place: Zenstra AI for AI agents, adapID AI for human and machine identities, BotShield AI for exposure and bots, and ICMS for DPDPA compliance." />

      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="grid grid-cols-1 items-center gap-12 overflow-hidden rounded-[40px] bg-navy px-6 py-14 md:px-14 md:py-20 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <Breadcrumb light items={[{ name: 'Products' }]} />
              <p className="rise mt-8 text-[15px] font-medium text-cyan">Deep Algorithms platform</p>
              <h1 className="t-h1 rise mt-3 text-white">Everything that secures an <em className="accent">identity</em></h1>
              <p className="rise mt-6 max-w-[540px] text-[17px] leading-relaxed text-white/90 md:text-[19px]" style={{ animationDelay: '80ms' }}>Four product lines on one platform. Start with the risk that worries you most and add the rest when you are ready.</p>
              <div className="rise mt-8 flex flex-wrap gap-3" style={{ animationDelay: '160ms' }}>
                <Button to="/request-demo" variant="white">Book a demo</Button>
                <Button href="#groups" variant="ghostWhite">Browse by need</Button>
              </div>
            </div>
            <div className="rise relative mx-auto grid w-full max-w-[560px] grid-cols-2 gap-4" style={{ animationDelay: '240ms' }} aria-hidden="true">
              {['zenstra', 'nhi', 'botshield', 'icms'].map((k, i) => (
                <div key={k} className={`overflow-hidden rounded-[16px] shadow-[0_24px_50px_-20px_rgba(0,0,0,.6)] ring-1 ring-white/15 ${i % 2 ? 'translate-y-6' : ''}`}><Thumb k={k} /></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <WhatsNew />

      <Section tone="mist">
        <Heading eyebrow="What you can do" title="Start from the outcome you need" />
        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {CAN_DO.map((c, i) => (
            <Reveal key={c.title} delay={(i % 3) * 70}>
              <IconTile name={c.icon} size={48} />
              <h3 className="t-h3 mt-5">{c.title}</h3>
              <p className="mt-2 max-w-[340px] text-ink-2">{c.body}</p>
              <div className="mt-3"><LearnMore to={c.to} /></div>
            </Reveal>
          ))}
        </div>
      </Section>

      <div id="groups" className="scroll-mt-20">
        {GROUPS.map((g, gi) => (
          <Section key={g.id} id={g.id} className="!py-14 md:!py-20">
            {g.keys.length <= 2 ? (
              <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
                <div><h2 className="t-h2">{g.title}</h2><p className="t-lead mt-5">{g.lead}</p></div>
                <div className={`grid gap-5 ${g.keys.length === 2 ? 'sm:grid-cols-2' : 'max-w-[440px]'}`}>
                  {g.keys.map((k, i) => <Reveal key={k} delay={i * 70}><ProductCard k={k} /></Reveal>)}
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-[1fr_1.4fr] md:gap-16">
                  <h2 className="t-h2">{g.title}</h2>
                  <p className="t-lead md:pt-2">{g.lead}</p>
                </div>
                <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {g.keys.map((k, i) => <Reveal key={k} delay={i * 70}><ProductCard k={k} /></Reveal>)}
                </div>
              </>
            )}
            {gi < GROUPS.length - 1 && <hr className="mt-14 border-line md:mt-20" />}
          </Section>
        ))}
      </div>

      <LogoBand band title="Trusted by banks, government and enterprises across India" />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-20">
          <Heading align="left" eyebrow="FAQ" title="Questions we hear first" />
          <Reveal><Accordion dark={false} items={FAQ} /></Reveal>
        </div>
      </Section>

      <ResearchRow slugs={['ai-agent-governance', 'identity-security', 'india-mule-account-crisis']} />
      <CtaPanel title="Start with the risk that worries you most." body="Tell us where your identity risk sits today and we will show you how it looks in our platform." />
    </>
  );
}
