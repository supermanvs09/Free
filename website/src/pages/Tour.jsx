import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { Button, Icon, cx } from '../components/ui.jsx';
import ProductMark from '../components/ProductMark.jsx';
import HomeConsole from '../components/demos/HomeConsole.jsx';
import CirmWorkflow from '../components/demos/CirmWorkflow.jsx';
import NhiExplorer from '../components/demos/NhiExplorer.jsx';
import AdPathExplorer from '../components/demos/AdPathExplorer.jsx';
import FraudJourney from '../components/demos/FraudJourney.jsx';
import ZenConsole from '../components/demos/ZenConsole.jsx';
import { IcmsMap } from '../components/demos/IcmsMap.jsx';

/* A clickable product tour beside "Book a demo": the same interactive product
   views as the product pages, one at a time, each with what it shows and what
   to look for. No backend; every step has its own link (#step-3). Sample data. */

const STEPS = [
  { p: 'adapid', ch: 'Every identity', V: HomeConsole, to: '/products',
    h: 'One decision feed for every kind of identity.',
    body: 'An employee sign-in, a cloud role, an AI agent and a customer payment, each scored against its own normal and each ending in a decision with its reasons.',
    look: 'Switch tabs: each decision names the product that made it and the policy it applied.' },
  { p: 'adapid', ch: 'Continuous Identity Risk Management', V: CirmWorkflow, to: '/adapid-ai/continuous-identity-risk-management',
    h: 'Seven stages, from discovery to evidence.',
    body: 'Kavya’s password works from Lagos at 02:14. Her score climbs from 18 to 81, a step-up through Okta is denied, and her sessions are revoked across systems.',
    look: 'At Explain, every point of risk carries its reason; at Evidence, generate the package an auditor would read.' },
  { p: 'adapid', ch: 'NHI Security for AWS', V: NhiExplorer, to: '/adapid-ai/nhi-security',
    h: 'Every machine identity, right-sized.',
    body: 'ecs-notify-svc has 214 permissions and used 9 in 90 days, can read every secret and has no owner.',
    look: 'Open Recommendation and propose the least-privilege policy to the owner. Nothing changes without approval.' },
  { p: 'adapid', ch: 'Active Directory Security', V: AdPathExplorer, to: '/adapid-ai/active-directory-security',
    h: 'Attack paths to Domain Admins, closed first.',
    body: 'From a phished user, four hops reach a domain admin. The weakest link is one over-broad right on a Tier 1 group.',
    look: 'Apply the fix and watch the path close, then the count of paths to Tier 0 drop.' },
  { p: 'adapid', ch: 'Identity Fraud Prevention', V: FraudJourney, to: '/adapid-ai/fraud-prevention',
    h: 'A scam caught before the money moves.',
    body: 'Anita is the real customer, on her own phone. But she is on a call, paying a payee whose account is 9 days old.',
    look: 'Switch to the genuine customer: same app, no extra step.' },
  { p: 'zenstra', ch: 'Zenstra AI', V: ZenConsole, to: '/agentic-ai/agentic-identity',
    h: 'Every agent action checked before it runs.',
    body: 'invoice-agent may read invoices and pay known vendors under ₹50,000. Fire its tool calls and see each one checked against its task and grant.',
    look: 'The ₹4,80,000 payment waits for a named approver; the vendor export is blocked; verify the decision chain.' },
  { p: 'icms', ch: 'ICMS Compliance Suite', V: IcmsMap, to: '/dpdpa-compliance',
    h: 'Personal data, and every access to it.',
    body: 'Each store’s personal data, and every read checked against its purpose and the principal’s consent.',
    look: 'Open the shared drives: a public link exposes PAN numbers, and it is flagged to the owner.' },
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
      <section className="border-b border-line bg-bg-1" aria-labelledby="tour-h">
        <div className="container-wide pb-16 pt-8 md:pt-12">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-[720px]">
              <p className="eyebrow">Product tour · about 3 minutes</p>
              <h1 id="tour-h" className="t-h1 mt-4">See the platform stop an attack, step by step.</h1>
              <p className="t-lead mt-4">The product views, one at a time, each one interactive. Use the buttons, your arrow keys, or jump to any product.</p>
            </div>
            <Button to="/request-demo" variant="secondary" size="lg">Book a demo</Button>
          </div>

          <div className="mt-10 grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
            <nav aria-label="Tour chapters" className="tour-side no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 xl:mx-0 xl:block xl:space-y-1 xl:overflow-visible xl:px-0">
              {STEPS.map((c, n) => {
                const active = n === i;
                return (
                  <button key={c.ch} type="button" onClick={() => go(n)} aria-current={active ? 'step' : undefined}
                    className={cx('flex w-full shrink-0 items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px] transition-colors max-xl:w-auto', active ? 'bg-white font-semibold text-ink shadow-[var(--e-1)]' : 'text-ink-2 hover:bg-white/70 hover:text-ink')}>
                    <span className={cx('num inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold', n < i ? 'bg-ok-50 text-ok' : active ? 'bg-brand text-white' : 'bg-bg-2 text-ink-3')}>{n < i ? '✓' : n + 1}</span>
                    <span className="whitespace-nowrap xl:whitespace-normal">{c.ch}</span>
                  </button>
                );
              })}
              <button type="button" onClick={() => go(LAST)} className={cx('flex shrink-0 items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14px]', i === LAST ? 'bg-white font-semibold text-ink shadow-[var(--e-1)]' : 'text-ink-2 hover:bg-white/70')}>
                <Icon name="Target" size={20} className="shrink-0 text-brand" /><span className="whitespace-nowrap">Your next step</span>
              </button>
            </nav>

            <div ref={stage} className="min-w-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="meter flex-1 !h-1.5"><i style={{ width: `${((i + 1) / (LAST + 1)) * 100}%`, background: 'var(--color-brand)' }} /></div>
                <span className="shrink-0 t-caption num" aria-live="polite">{i < LAST ? `Step ${i + 1} of ${LAST}` : 'Done'}</span>
              </div>
              {S ? (
                <div key={i} className="fadein">
                  <div className="card mb-5 grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-6">
                    <div>
                      <p className="flex items-center gap-2 app-label"><ProductMark p={S.p} size={18} />{S.ch}</p>
                      <h2 className="mt-2 t-h3">{S.h}</h2>
                      <p className="mt-2 t-body measure">{S.body}</p>
                      <p className="mt-3 flex gap-2.5 t-body measure !text-ink"><Icon name="Eye" size={18} className="mt-1 shrink-0 text-brand" /><span><span className="font-semibold">Look for: </span>{S.look}</span></p>
                      <Link to={S.to} className="alink mt-3 text-[14.5px]">More on this product<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></Link>
                    </div>
                    <div className="flex gap-2 md:flex-col md:items-stretch">
                      <button type="button" onClick={() => go(i + 1)} className="btn btn-primary flex-1 justify-center">Next<Icon name="ArrowRight" size={16} weight="bold" /></button>
                      <button type="button" onClick={() => go(i - 1)} disabled={i === 0} className="btn btn-secondary flex-1 justify-center">Back</button>
                    </div>
                  </div>
                  <S.V />
                  <p className="mt-3 t-caption">Sample data. Names, places and values are illustrative.</p>
                </div>
              ) : (
                <div key="end" className="card fadein grid place-items-center px-6 py-16 text-center md:py-24">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-ok-50 text-ok"><Icon name="CheckCircle" size={30} weight="fill" /></span>
                  <h2 className="t-h2 mt-6 max-w-[22ch]">Now see it on your own identities.</h2>
                  <p className="t-lead mx-auto mt-4 max-w-[560px]">A 30-minute session with a Deep Algorithms engineer, on your environment where you want it, with your own questions.</p>
                  <div className="mt-8 flex flex-wrap justify-center gap-3"><Button to="/request-demo" size="lg" arrow>Book a demo</Button></div>
                  <button type="button" onClick={() => go(0)} className="mt-6 inline-flex items-center gap-2 text-[14.5px] text-ink-3 hover:text-brand"><Icon name="ArrowsClockwise" size={15} />Start the tour again</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
