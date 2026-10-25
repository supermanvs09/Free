import { Seo } from '../lib/head.jsx';
import { Accordion, Breadcrumb, Button, Heading, IconTile, ProgressTabs, Reveal, Section } from '../components/ui.jsx';
import { CertRow, CtaPanel, LogoBand, PathArt, RelatedCards } from '../components/blocks.jsx';
import ProductTour from '../components/visuals/ProductTour.jsx';
import ProductVisual from '../components/visuals/ProductVisual.jsx';
import IdentityDetail from '../components/visuals/IdentityDetail.jsx';

const STEPS = [
  { tab: 'Discover', title: 'Every identity, in one inventory', body: 'People from your IdP and directory, machine identities from your cloud accounts and AI agents from your workflows, devices and gateways. Each one with an owner, a type and what it can reach.', visual: <ProductVisual v={{ type: 'panel', product: 'adapid', cap: 0, title: 'Identity Inventory' }} /> },
  { tab: 'Secure', title: 'Risk explained, then fixed', body: 'Posture, access and behaviour combine into one score per identity, with the reasons attached and the change that brings it down.', visual: <IdentityDetail variant="agent" /> },
  { tab: 'Prove', title: 'Evidence your auditor can read', body: 'Every decision, finding and remediation is recorded and mapped to DPDPA, RBI and SEBI obligations, ready when the examiner asks.', visual: <ProductVisual v={{ type: 'panel', product: 'icms', cap: 3, title: 'Audit Evidence' }} /> },
];

const WHY = [
  { title: 'Every identity type, one risk model', body: 'Point tools see either people, cloud roles or agents. Attackers move between all three. We score them together, so a risky agent using an over-privileged role shows up as one story.' },
  { title: 'Behaviour as well as posture', body: 'Configuration checks show what an identity could do. Baselines show when it starts doing something new, which is how misuse of legitimate access is caught.' },
  { title: 'Deployed where your data lives', body: 'Read-only connectors, an agentless AWS role and an in-VPC gateway for agents. Sensitive payloads stay in your environment.' },
  { title: 'Built in India for regulated industries', body: 'Designed around DPDPA 2023, RBI and SEBI expectations from the start, with teams in Hyderabad, Bengaluru and Maryland.' },
];

const DEPLOY = [
  { icon: 'Cloud', title: 'Your cloud', body: 'Connectors and gateways run inside your own cloud account.' },
  { icon: 'HardDrives', title: 'On-premises', body: 'For estates that cannot leave your data centre.' },
  { icon: 'Globe', title: 'Hybrid and edge', body: 'Across data centres, cloud and the network edge.' },
];

export default function Platform() {
  return (
    <>
      <Seo title="Why Deep Algorithms: One Platform for Every Identity" path="/platform" crumbs={[{ name: 'Why Deep Algorithms', path: '/platform' }]}
        description="Why security teams choose Deep Algorithms: one platform that discovers, scores and governs human, machine and AI agent identities, with evidence built in." />

      <section className="pt-3 md:pt-5">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="overflow-hidden rounded-[40px] bg-brand px-5 pb-6 pt-10 md:px-10 md:pb-10 md:pt-14">
            <div className="text-center">
              <div className="flex justify-center"><Breadcrumb light items={[{ name: 'Why Deep Algorithms' }]} /></div>
              <h1 className="t-h1 rise mx-auto mt-8 max-w-[920px] text-white">One platform for every human, machine and AI identity</h1>
              <p className="rise mx-auto mt-6 max-w-[660px] text-[17px] leading-relaxed text-white/90 md:text-[19px]" style={{ animationDelay: '80ms' }}>Attackers no longer break in. They log in, with a person’s password, a forgotten key or an agent’s token. We secure all three from one place.</p>
              <div className="rise mt-8 flex flex-wrap justify-center gap-3" style={{ animationDelay: '160ms' }}>
                <Button to="/request-demo" variant="white">Book a demo</Button>
                <Button href="#how" variant="ghostWhite">How it works</Button>
              </div>
            </div>
            <div className="rise mx-auto mt-12 max-w-[1040px]" style={{ animationDelay: '240ms' }}><ProductTour /></div>
          </div>
        </div>
      </section>

      <LogoBand title="Trusted by banks, government and enterprises across India" />

      <Section id="how" className="scroll-mt-16">
        <Heading eyebrow="How it works" title="Discover. Secure. Prove." />
        <div className="mt-12 md:mt-16">
          <ProgressTabs items={STEPS.map((s) => s.tab)} interval={11000} render={(i) => (
            <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[.8fr_1.4fr] lg:gap-14">
              <div>
                <h3 className="font-display text-[28px] font-light leading-tight tracking-[-0.02em] text-ink md:text-[34px]">{STEPS[i].title}</h3>
                <p className="mt-4 text-[17px] text-ink-2">{STEPS[i].body}</p>
              </div>
              {STEPS[i].visual}
            </div>
          )} />
        </div>
      </Section>

      <section className="py-6">
        <div className="mx-auto w-full max-w-[1400px] px-3 md:px-5">
          <div className="grid grid-cols-1 gap-12 rounded-[40px] bg-navy px-6 py-16 md:px-16 md:py-24 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow mb-3 !text-cyan">What makes us different</p>
              <h2 className="t-h2 text-white">Identity is the attack surface now</h2>
              <div className="mt-10"><Accordion items={WHY} /></div>
            </div>
            <PathArt className="hidden self-center lg:block" />
          </div>
        </div>
      </section>

      <RelatedCards keys={['zenstra', 'adapid', 'nhi', 'fraud', 'ad', 'botshield', 'ddos', 'icms']} eyebrow="Products" title="Everything on the platform" />

      <Section tone="mist">
        <Heading eyebrow="Deployment" title="Runs where your data lives" />
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {DEPLOY.map((d, i) => (
            <Reveal key={d.title} delay={i * 80} className="text-center">
              <IconTile name={d.icon} />
              <h3 className="t-h3 mt-5">{d.title}</h3>
              <p className="mt-2 text-ink-2">{d.body}</p>
            </Reveal>
          ))}
        </div>
        <div className="mt-16"><CertRow /></div>
      </Section>

      <CtaPanel />
    </>
  );
}
