import { Seo } from '../lib/head.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { Breadcrumb, Icon, Reveal } from '../components/ui.jsx';
import { FormTrust, LogoMarquee } from '../components/blocks.jsx';
import { Field, Honeypot, SubmitRow, Sent, useLeadForm, EMAIL_RE } from '../components/Form.jsx';

// Values match what the lead endpoint already receives.
const OPTIONS = [
  ['all', 'All products', ['Which identities carry the most risk for you', 'How the products fit your environment', 'A plan for a first deployment']],
  ['zenstra', 'Zenstra AI (AI agent security)', ['Discovering the agents and MCP servers you run', 'A live allow, hold or block on a real tool call', 'The decision record your auditors would see']],
  ['adapid', 'adapID AI (identity risk and fraud)', ['A risk score rising, with its reasons', 'Step-up, hold and block by policy', 'Fraud decisions at the payee, in milliseconds']],
  ['nhi', 'NHI Security for AWS', ['Connecting a sandbox account with one read-only role', 'Granted versus used permissions', 'Behavioural baselines and leaked secrets']],
  ['dpdpa', 'ICMS Compliance Suite (DPDPA)', ['Personal data found across your stores', 'Access checked against purpose and consent', 'An audit package generated in minutes']],
];

const MARK = { zenstra: 'zenstra', adapid: 'adapid', nhi: 'adapid', dpdpa: 'icms' };

const validate = (v) => {
  const e = {};
  if (!v.name.trim()) e.name = 'Please enter your name.';
  if (!v.company.trim()) e.company = 'Please enter your company name.';
  if (!v.product) e.product = 'Please choose a product.';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Please enter a valid work email.';
  if (v.mobile.replace(/\D/g, '').length < 8) e.mobile = 'Please enter a valid phone number.';
  return e;
};
const toPayload = (v) => ({ name: v.name.trim(), request_type: 'demo', company_name: v.company.trim(), email_id: v.email.trim(), mobile_number: v.mobile.trim(), products: v.product });

export default function Demo() {
  const { values, errors, status, bind, onSubmit } = useLeadForm({ name: '', company: '', product: '', email: '', mobile: '' }, validate, toPayload);
  const pick = OPTIONS.find((o) => o[0] === values.product) || OPTIONS[0];
  return (
    <>
      <Seo title="Book a Demo" path="/request-demo" crumbs={[{ name: 'Book a demo', path: '/request-demo' }]}
        description="See Deep Algorithms on your own environment. Book a 30-minute live demo of Zenstra AI, adapID AI or ICMS." />
      <section className="stage band-brand hero-under relative overflow-hidden">
        <div className="wrap relative grid grid-cols-1 gap-12 pb-20 pt-10 md:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div>
            <Breadcrumb items={[{ name: 'Book a demo' }]} className="rise" />
            <p className="eyebrow rise mt-8">30 minutes · live · your environment</p>
            <h1 className="t-h1 rise mt-6" style={{ '--d': '80ms' }}>See it on your own identities.</h1>
            <p className="t-lead rise mt-5 max-w-[520px]" style={{ '--d': '160ms' }}>Tell us a little about your team and an engineer will set up a session around the risks you care about.</p>
            <div className="rise card mt-10 p-6 md:p-7" style={{ '--d': '240ms' }} aria-live="polite">
              <div className="flex items-center gap-3">
                {MARK[pick[0]] ? <ProductMark key={pick[0]} p={MARK[pick[0]]} size={40} className="fadein" /> : <span className="flex -space-x-2">{['zenstra', 'adapid', 'icms'].map((k) => <ProductMark key={k} p={k} size={30} />)}</span>}
                <span>
                  <span className="block text-[12.5px] font-semibold uppercase tracking-[.1em] text-cyan-2">Your session will cover</span>
                  <span className="mt-0.5 block text-[15px] text-ink-3">{pick[1]}</span>
                </span>
              </div>
              <ul className="mt-5 space-y-3">{pick[2].map((t) => <li key={t} className="flex gap-3 text-[16px] text-ink"><Icon name="CheckCircle" size={20} weight="fill" className="mt-[2px] shrink-0 text-cyan-2" />{t}</li>)}</ul>
            </div>
            {/* the 30 minutes, minute by minute */}
            <ol className="rise mt-8 grid gap-3 sm:grid-cols-3" style={{ '--d': '300ms' }} aria-label="The 30-minute agenda">
              {[['0–5 min', 'Your risks', 'What worries you most, in your words'], ['5–20 min', 'Live, on your stack', 'The product on identities like yours'], ['20–30 min', 'A plan', 'A first deployment, sized and scoped']].map(([t, h, p], i) => (
                <li key={t} className="relative rounded-[16px] border border-[#0a5ea3]/12 bg-white p-4 shadow-[0_18px_40px_-28px_rgb(10_94_163/.5)]">
                  <span className="mono text-[11.5px] font-semibold text-[#0a6dbb]">{t}</span>
                  <span className="mt-1.5 block text-[15px] font-semibold text-ink">{h}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-ink-2">{p}</span>
                  {i < 2 && <span aria-hidden="true" className="absolute -right-[10px] top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-[#0a6dbb] text-white sm:grid"><Icon name="CaretRight" size={11} weight="bold" /></span>}
                </li>
              ))}
            </ol>
          </div>
          <Reveal className="tone-l glass relative self-start rounded-[26px] p-6 shadow-[0_40px_100px_-40px_rgba(0,0,0,.6)] md:p-10">
            {status === 'sent' ? <Sent title="Thank you" body="Your request is in. We will reply within one business day to confirm a time." /> : (
              <form noValidate onSubmit={onSubmit} className="space-y-5">
                <Honeypot />
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Full name" name="name" autoComplete="name" required error={errors.name} {...bind('name')} />
                  <Field label="Company" name="company" autoComplete="organization" required error={errors.company} {...bind('company')} />
                </div>
                <Field label="Product of interest" name="product" as="select" required error={errors.product} {...bind('product')}>
                  <option value="" disabled>Select a product</option>
                  {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Field>
                <Field label="Work email" name="email" type="email" autoComplete="email" required error={errors.email} {...bind('email')} />
                <Field label="Mobile number" name="mobile" type="tel" autoComplete="tel" required error={errors.mobile} {...bind('mobile')} />
                <SubmitRow status={status} label="Book my demo" />
                <p className="text-[13px] text-ink-3">By submitting, you agree to our <a href="/privacy-policy" className="underline underline-offset-2 hover:text-ink">privacy policy</a>. We use your details only to arrange the demo.</p>
              </form>
            )}
            <FormTrust />
          </Reveal>
        </div>
      </section>
      <LogoMarquee />
      <div className="h-10" />
    </>
  );
}
