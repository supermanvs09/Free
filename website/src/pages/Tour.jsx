import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { Button, Icon, cx } from '../components/ui.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { AdapRiskTimeline, RiskScoreCard, IdentityGraph } from '../components/viz/adapid.jsx';
import { AdWorkbench } from '../components/viz/workbench.jsx';
import { NhiMap } from '../components/viz/nhimap.jsx';
import { ScamCatch } from '../components/viz/fraud.jsx';
import { ZenInventory, ZenGateway, ZenRecord } from '../components/viz/zenstra.jsx';
import { IcmsEvidence } from '../components/viz/icms.jsx';

/* A clickable product tour, the way enterprise vendors offer one beside "Book
   a demo": the real product screens from each product page, one step at a
   time, each with what it shows and what to look for. No backend; every step
   has its own link (#step-3). */

const STEPS = [
  {
    p: 'adapid', ch: 'adapID AI · Identity risk', V: AdapRiskTimeline, to: '/adapid-ai',
    h: 'Every identity has a live risk score.',
    body: 'adapID AI learns how each person normally works. Here, Kavya’s sign-in from Lagos, a new mail-forwarding rule and a bulk export follow each other, and her score climbs from 12 to 94.',
    look: 'At the policy line her sessions are revoked, the rule is removed and the SOC is told on Slack.',
  },
  {
    p: 'adapid', ch: 'adapID AI · Identity risk', V: RiskScoreCard, to: '/adapid-ai',
    h: 'Every point comes with its reason.',
    body: 'Each unusual action adds points you can read, so an analyst confirms a decision instead of starting an investigation.',
    look: 'Above 80, policy holds the identity and contains it in seconds.',
  },
  {
    p: 'adapid', ch: 'adapID AI · Identity risk', V: IdentityGraph, to: '/adapid-ai', wide: true,
    h: 'See what a stolen identity can reach.',
    body: 'The blast radius maps every system and sensitive resource one identity opens: Okta, Microsoft 365, Salesforce, AWS, GitHub and Slack.',
    look: 'The two paths to admin access light up, then containment closes each system until the blast radius is zero.',
  },
  {
    p: 'adapid', ch: 'NHI Security for AWS', V: NhiMap, to: '/adapid-ai/nhi-security',
    h: 'Every machine identity in your AWS accounts.',
    body: 'One read-only role per account finds every role, key and service account, and compares 90 days of CloudTrail with what each is allowed.',
    look: 'ecs-notify-svc can use 214 permissions and used 9. One click removes the other 205, with the evidence kept.',
  },
  {
    p: 'adapid', ch: 'Active Directory Security', V: AdWorkbench, to: '/ad-security',
    h: 'Attack paths to Domain Admins, closed first.',
    body: 'Three ways in (a helpdesk user, a phished finance user, a contractor) all run through one service account that can be cracked offline and one over-broad right on Server Admins.',
    look: 'Open Risk analysis, then Remediation: removing that one right and rotating the password takes the paths from 57 to 16.',
  },
  {
    p: 'adapid', ch: 'Identity Fraud Prevention', V: ScamCatch, to: '/adapid-ai/fraud-prevention',
    h: 'A scam caught during the payment.',
    body: 'Anita logs in normally, so she is the real customer. But she is on a call, pasting a new payee’s account number and paying ₹2,40,000 with the remark “KYC update”.',
    look: 'The payee is on a mule list: the app pauses the payment, asks her if someone is telling her to pay, and an analyst calls.',
  },
  {
    p: 'zenstra', ch: 'Zenstra AI · AI agents', V: ZenInventory, to: '/agentic-ai/agentic-identity',
    h: 'Every AI agent, with an owner.',
    body: 'Agents from Copilot Studio, Cursor, n8n, Claude, Zapier and LangGraph in one inventory, each with its owner and its risk.',
    look: 'Two agents have no owner. That is where to start.',
  },
  {
    p: 'zenstra', ch: 'Zenstra AI · AI agents', V: ZenGateway, to: '/agentic-ai/agentic-identity',
    h: 'Every agent action checked before it runs.',
    body: 'The gateway allows routine calls, holds a large payment for a person to approve, and blocks a CRM export that is outside the agent’s task.',
    look: 'The block happens before the call reaches the CRM, not in a report afterwards.',
  },
  {
    p: 'zenstra', ch: 'Zenstra AI · AI agents', V: ZenRecord, to: '/agentic-ai/decision-record',
    h: 'A record nobody can quietly change.',
    body: 'Each decision is written to a hash-chained record and verified, so auditors can trust what they read.',
    look: 'When someone edits a blocked export to read “Allow”, the chain shows exactly which line was changed.',
  },
  {
    p: 'icms', ch: 'ICMS Compliance Suite', V: IcmsEvidence, to: '/dpdpa-compliance',
    h: 'DPDPA evidence, made as data is used.',
    body: 'Every access to personal data is checked against its purpose and the customer’s consent.',
    look: 'A marketing export without consent is flagged, and the audit package assembles itself.',
  },
];
const LAST = STEPS.length; // the closing step

const stepOf = (hash) => {
  const m = /^#step-(\d+)$/.exec(hash || '');
  return m ? Math.min(LAST, Math.max(0, +m[1] - 1)) : 0;
};

export default function Tour() {
  // the step lives in the address (#step-3), so every step can be linked to
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const stage = useRef(null);
  useEffect(() => { setI(stepOf(hash)); }, [hash]);
  const go = useCallback((n) => {
    const v = Math.min(LAST, Math.max(0, n));
    setI(v);
    navigate(`#step-${v + 1}`, { replace: true, preventScrollReset: true });
  }, [navigate]);
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [i, go]);

  const S = STEPS[i];
  const chapters = [...new Map(STEPS.map((s, n) => [s.ch, { ch: s.ch, p: s.p, first: n }])).values()];
  return (
    <>
      <Seo title="Product tour" path="/product-tour" description="A clickable tour of the Deep Algorithms platform: live identity risk, machine identities in AWS, Active Directory attack paths, fraud at the point of payment, AI agent security, exposure management and DPDPA evidence. Eleven steps, about three minutes." crumbs={[{ name: 'Product tour', path: '/product-tour' }]} />
      <section className="stage band-brand hero-under relative overflow-hidden" aria-labelledby="tour-h">
        <div className="wrap relative pb-16 pt-8 md:pt-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[720px]">
              <p className="eyebrow">Product tour · about 3 minutes</p>
              <h1 id="tour-h" className="t-h1 mt-5">See the platform stop an attack, step by step.</h1>
              <p className="t-lead mt-4">The real product screens, one at a time. Use the arrows, your keyboard, or jump to any product.</p>
            </div>
            <Button to="/request-demo" variant="ghost" size="lg">Book a demo</Button>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
            {/* chapters */}
            <nav aria-label="Tour chapters" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
              {chapters.map((c) => {
                const steps = STEPS.map((s, n) => [s, n]).filter(([s]) => s.ch === c.ch);
                const active = S?.ch === c.ch;
                const done = steps.every(([, n]) => n < i);
                return (
                  <div key={c.ch} className="shrink-0">
                    <button type="button" onClick={() => go(c.first)} aria-current={active ? 'step' : undefined}
                      className={cx('flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14.5px] transition-colors', active ? 'bg-white/10 font-semibold text-white' : 'text-white/70 hover:bg-white/5 hover:text-white')}>
                      <ProductMark p={c.p} size={22} />
                      <span className="whitespace-nowrap lg:whitespace-normal">{c.ch}</span>
                      {done && <Icon name="CheckCircle" size={16} weight="fill" className="ml-auto shrink-0 text-[#4be29a] max-lg:hidden" />}
                    </button>
                    {active && steps.length > 1 && (
                      <ol className="ml-[46px] mt-1 space-y-1 max-lg:hidden">
                        {steps.map(([s, n]) => (
                          <li key={n}><button type="button" onClick={() => go(n)} className={cx('text-left text-[13px] leading-snug', n === i ? 'text-[#8cc4ff]' : 'text-white/55 hover:text-white')}>{s.h}</button></li>
                        ))}
                      </ol>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => go(LAST)} className={cx('flex shrink-0 items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14.5px]', i === LAST ? 'bg-white/10 font-semibold text-white' : 'text-white/70 hover:bg-white/5 hover:text-white')}>
                <Icon name="Target" size={20} className="shrink-0 text-[#8cc4ff]" /><span className="whitespace-nowrap">Your next step</span>
              </button>
            </nav>

            {/* the product, and the guide */}
            <div ref={stage} className="tour-frame overflow-hidden rounded-[22px] border border-white/12 bg-[#0f141b]/80 shadow-[0_50px_100px_-50px_rgba(0,0,0,.9)]">
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                <span className="flex gap-1.5" aria-hidden="true"><i className="h-2.5 w-2.5 rounded-full bg-white/20" /><i className="h-2.5 w-2.5 rounded-full bg-white/20" /><i className="h-2.5 w-2.5 rounded-full bg-white/20" /></span>
                <span className="truncate text-[13px] text-white/60">{S ? S.ch : 'Deep Algorithms'}</span>
                <span className="ml-auto shrink-0 text-[13px] tabular-nums text-white/60" aria-live="polite">{i < LAST ? `Step ${i + 1} of ${LAST}` : 'Done'}</span>
              </div>
              <div className="h-1 bg-white/5"><div className="h-full bg-[#2f8bff] transition-[width] duration-500" style={{ width: `${((i + 1) / (LAST + 1)) * 100}%` }} /></div>

              {S ? (
                <div key={i} className="fadein">
                  <div className="tour-view grid place-items-center px-4 py-8 md:px-10">
                    <div className={cx('w-full', S.wide ? 'max-w-[980px]' : 'max-w-[760px]')}><S.V /></div>
                  </div>
                  <div className="grid gap-6 border-t border-white/10 bg-[#12171f]/70 px-5 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:px-8">
                    <div>
                      <h2 className="text-[clamp(20px,1.8vw,26px)] font-semibold leading-tight tracking-[-0.02em] text-white">{S.h}</h2>
                      <p className="mt-3 max-w-[70ch] text-[15.5px] leading-relaxed text-white/75">{S.body}</p>
                      <p className="mt-3 flex max-w-[70ch] gap-2.5 text-[15px] leading-relaxed text-white"><Icon name="Eye" size={18} className="mt-0.5 shrink-0 text-[#8cc4ff]" /><span><span className="font-semibold">Look for: </span>{S.look}</span></p>
                      <Link to={S.to} className="link mt-4 text-[14.5px]">More on this product<Icon name="ArrowRight" size={14} weight="bold" /></Link>
                    </div>
                    <div className="flex gap-2 md:flex-col md:items-stretch">
                      <button type="button" onClick={() => go(i + 1)} className="btn btn-primary btn-lg flex-1 justify-center">Next<Icon name="ArrowRight" size={16} weight="bold" /></button>
                      <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className="btn btn-ghost btn-lg flex-1 justify-center disabled:opacity-40">Back</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key="end" className="fadein grid place-items-center px-6 py-16 text-center md:py-24">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-[#1f9d63]/20 text-[#4be29a]"><Icon name="CheckCircle" size={30} weight="fill" /></span>
                  <h2 className="t-h2 mt-6 max-w-[22ch] text-white">Now see it on your own identities.</h2>
                  <p className="t-lead mx-auto mt-4 max-w-[560px]">A 30-minute session with a Deep Algorithms engineer, on your environment where you want it, with your own questions.</p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <Button to="/request-demo" size="lg" arrow>Book a demo</Button>
                  </div>
                  <button type="button" onClick={() => go(0)} className="mt-6 inline-flex items-center gap-2 text-[14.5px] text-white/70 hover:text-white"><Icon name="ArrowsClockwise" size={15} />Start the tour again</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
