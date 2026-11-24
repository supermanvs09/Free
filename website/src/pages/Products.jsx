import { useState } from 'react';
import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { Icon, Reveal, SectionHead, cx } from '../components/ui.jsx';
import { CtaBand } from '../components/blocks.jsx';
import { Hero, ACC } from '../components/ProductKit.jsx';
import ProductMark from '../components/ProductMark.jsx';

const NEEDS = ['Everything', 'AI agents', 'People', 'Machine identities', 'Payments', 'Active Directory', 'Personal data'];

const ALL = [
  { line: 'Zenstra AI', acc: ACC.zen, name: 'Zenstra AI', ico: 'Robot', kind: 'Platform', body: 'Discover every AI agent and MCP server, give each one an owner and scoped access, and decide every tool call before it runs.', needs: ['AI agents'], to: '/agentic-ai/agentic-identity', points: ['Agent discovery', 'Runtime enforcement', 'Decision record'] },
  { line: 'adapID AI', acc: ACC.adap, name: 'Continuous Identity Risk Management', ico: 'UserCircle', kind: 'Product', body: 'A live, explainable risk score for every person, acted on the moment behaviour changes.', needs: ['People'], to: '/adapid-ai', points: ['Behaviour baselines', 'Step-up, hold or block', 'Day-one detection'] },
  { line: 'adapID AI', acc: ACC.adap, name: 'NHI Security for AWS', ico: 'Key', kind: 'Product', body: 'Every IAM role, key and workload identity found, scored for posture and watched for new behaviour.', needs: ['Machine identities'], to: '/adapid-ai/nhi-security', points: ['Agentless, one read-only role', 'Granted vs used', 'Leaked secrets'] },
  { line: 'adapID AI', acc: ACC.adap, name: 'Identity Fraud Prevention', ico: 'CreditCard', kind: 'Product', body: 'Mobile and internet banking protected from login to payment: account takeover, scams and mule accounts.', needs: ['Payments', 'People'], to: '/adapid-ai/fraud-prevention', points: ['Behavioural biometrics', 'Scam signals', 'Mule accounts at the payee'] },
  { line: 'adapID AI', acc: ACC.adap, name: 'Active Directory Security', ico: 'TreeStructure', kind: 'Product', body: 'Paths to Domain Admins mapped and cut, and live abuse contained in seconds.', needs: ['Active Directory'], to: '/ad-security', points: ['Attack path ranking', 'Kerberoasting to DCSync', 'Automatic containment'] },
  { line: 'ICMS Compliance Suite', acc: ACC.icms, name: 'ICMS Compliance Suite', ico: 'Fingerprint', kind: 'Platform', body: 'Personal data discovered, every access checked against purpose and consent, and audit evidence generated as it happens.', needs: ['Personal data'], to: '/dpdpa-compliance', points: ['DPDPA, RBI and SEBI', 'Consent ledger', '72-hour breach response'] },
];

export default function Products() {
  const [n, setN] = useState(0);
  const need = NEEDS[n];
  const list = n === 0 ? ALL : ALL.filter((x) => x.needs.includes(need));
  return (
    <>
      <Seo title="Products: AI Agent, Identity, Fraud and Compliance Security" path="/products" description="Every Deep Algorithms product: Zenstra AI for AI agents, the four adapID AI products for human and machine identities, and the ICMS Compliance Suite for PII and DPDPA." crumbs={[{ name: 'Products', path: '/products' }]} />
      <Hero layout="stack" ribbons="band" crumbs={[{ name: 'Products' }]} eyebrow="Products" explore="Find the right product"
        title="A product for every way attackers get in."
        lead="AI agents, people, machine identities, payments, apps and personal data. Each product stops one kind of attack and runs on its own; start with the one you worry about most." />

      <section className="pb-24 pt-12" aria-labelledby="dir-h">
        <div className="wrap">
          <h2 id="dir-h" className="sr-only">Find a product</h2>
          <Reveal className="flex flex-col items-start gap-4 md:flex-row md:items-center">
            <p className="shrink-0 text-[15px] text-ink-2">What do you need to protect?</p>
            <div role="group" aria-label="What do you need to protect?" className="flex flex-wrap gap-2">
              {NEEDS.map((x, i) => (
                <button key={x} type="button" aria-pressed={n === i} onClick={() => setN(i)}
                  className={cx('h-10 rounded-full border px-4 text-[14.5px] font-medium transition-colors', n === i ? 'border-transparent bg-fg text-bg' : 'border-line-2 text-ink-2 hover:border-fg/30 hover:text-ink')}>{x}</button>
              ))}
            </div>
          </Reveal>
          <p className="sr-only" aria-live="polite">{list.length} products</p>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {list.map((x) => (
              <Link key={x.to} to={x.to} className="card card-hover fadein group flex flex-col overflow-hidden" style={{ '--acc': x.acc }}>
                {/* thumbnail: the product's mark, lit in its own colour */}
                <span className="relative grid h-[132px] place-items-center overflow-hidden" style={{ background: `radial-gradient(70% 90% at 50% 100%, color-mix(in oklab, ${x.acc} 30%, transparent), transparent 70%), linear-gradient(180deg, #f6f9fd, color-mix(in oklab, ${x.acc} 10%, #f6f9fd))` }}>
                  <span aria-hidden="true" className="absolute h-[150px] w-[150px] rounded-full border opacity-60 transition-transform duration-700 group-hover:scale-110" style={{ borderColor: `color-mix(in oklab, ${x.acc} 25%, transparent)` }} />
                  <span aria-hidden="true" className="absolute h-[100px] w-[100px] rounded-full border opacity-80 transition-transform duration-700 group-hover:scale-110" style={{ borderColor: `color-mix(in oklab, ${x.acc} 35%, transparent)` }} />
                  <ProductMark p={x.line} size={60} className="relative transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105" style={{ filter: `drop-shadow(0 14px 22px color-mix(in oklab, ${x.acc} 45%, transparent))` }} />
                  <span className="absolute left-1/2 top-1/2 ml-[18px] mt-[14px] grid h-8 w-8 place-items-center rounded-full bg-white shadow-[0_6px_16px_-6px_rgb(10_94_163/.6)]" style={{ color: x.acc }}><Icon name={x.ico} size={16} weight="bold" /></span>
                  <span className="absolute right-3 top-3 rounded-full bg-white/85 px-2 py-0.5 text-[11.5px] text-ink-2 shadow-sm backdrop-blur">{x.kind}</span>
                </span>
                <span className="flex flex-1 flex-col p-6 md:p-7">
                {x.line !== x.name && <span className="text-[12.5px] font-semibold uppercase tracking-[.08em]" style={{ color: x.acc }}>{x.line}</span>}
                <h3 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.025em]">{x.name}</h3>
                <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-2">{x.body}</p>
                <ul className="mt-6 space-y-2 border-t border-line pt-5">
                  {x.points.map((t) => <li key={t} className="flex items-center gap-2 text-[14px] text-ink-2"><Icon name="Check" size={14} weight="bold" style={{ color: x.acc }} />{t}</li>)}
                </ul>
                <span className="link mt-6 text-[14.5px]">Explore<Icon name="ArrowRight" size={14} weight="bold" /></span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="tog-h">
        <div className="wrap">
          <SectionHead id="tog-h" eyebrow="Better together" title="Use one. Or combine them where the risk is." lead="Products run independently. These combinations cover risks that usually arrive together." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              ['Banks and fintechs', ['Identity Fraud Prevention', 'Continuous Identity Risk Management', 'ICMS Compliance Suite'], 'Stop mules at the payee and stolen logins at the door, and keep DPDPA and RBI evidence ready.', '/solutions/bfsi'],
              ['An AI rollout', ['Zenstra AI', 'NHI Security for AWS'], 'Govern the agents you deploy and the cloud keys they run on.', '/agentic-ai/agentic-identity'],
              ['A public service', ['Active Directory Security', 'ICMS Compliance Suite'], 'Keep the domain closed to attackers and citizen PII protected.', '/solutions/government'],
            ].map(([h, prods, t, to], i) => (
              <Reveal key={h} delay={i * 80}>
                <Link to={to} className="card card-hover block h-full p-7">
                  <p className="text-[19px] font-semibold tracking-[-0.015em]">{h}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">{prods.map((x) => <li key={x} className="rounded-full border border-line-2 px-3 py-1 text-[13px] text-ink-2">{x}</li>)}</ul>
                  <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{t}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Not sure which fits? Book a demo." body="Tell us which identities worry you most and we will show you the product that fits, on your own environment." primary={{ label: 'Book a demo', to: '/request-demo' }} />
    </>
  );
}
