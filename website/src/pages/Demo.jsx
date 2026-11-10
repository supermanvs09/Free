import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Seo } from '../lib/head.jsx';
import ProductMark from '../components/ProductMark.jsx';
import { Breadcrumb, Icon } from '../components/ui.jsx';
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
  const [params] = useSearchParams();
  const pre = OPTIONS.some((o) => o[0] === params.get('product')) ? params.get('product') : '';
  const { values, errors, status, bind, onSubmit } = useLeadForm({ name: '', company: '', product: pre, email: '', mobile: '' }, validate, toPayload);
  const sel = bind('product');
  useEffect(() => { if (pre && !values.product) sel.onChange({ target: { value: pre } }); }, [pre]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = OPTIONS.find((o) => o[0] === values.product) || OPTIONS[0];
  return (
    <>
      <Seo title="Book a Demo" path="/request-demo" crumbs={[{ name: 'Book a demo', path: '/request-demo' }]}
        description="See Deep Algorithms on your own environment. Book a 30-minute live demo of Zenstra AI, adapID AI or ICMS." />
      <section className="border-b border-line bg-[linear-gradient(180deg,#f6f8fb_0%,#fff_60%)]">
        <div className="container grid gap-10 pb-16 pt-8 md:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:pb-24">
          <div className="lg:order-1">
            <Breadcrumb items={[{ name: 'Book a demo' }]} />
            <p className="eyebrow mt-8">30 minutes · live · your environment</p>
            <h1 className="t-h1 mt-4">See it on your own identities.</h1>
            <p className="t-lead mt-4 measure">Tell us a little about your team and an engineer will set up a session around the risks you care about.</p>
            <div className="card mt-8 p-6" aria-live="polite">
              <div className="flex items-center gap-3">
                {MARK[pick[0]] ? <ProductMark key={pick[0]} p={MARK[pick[0]]} size={36} className="fadein" /> : <span className="flex -space-x-2">{['zenstra', 'adapid', 'icms'].map((k) => <ProductMark key={k} p={k} size={28} />)}</span>}
                <span><span className="block app-label !text-brand">Your session will cover</span><span className="mt-0.5 block t-small">{pick[1]}</span></span>
              </div>
              <ul className="mt-5 space-y-2.5">{pick[2].map((t) => <li key={t} className="flex gap-3 t-body !text-ink"><Icon name="CheckCircle" size={20} weight="fill" className="mt-0.5 shrink-0 text-brand" />{t}</li>)}</ul>
            </div>
            <ol className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="The 30-minute agenda">
              {[['0–5 min', 'Your risks', 'What worries you most, in your words'], ['5–20 min', 'Live, on your stack', 'The product on identities like yours'], ['20–30 min', 'A plan', 'A first deployment, sized and scoped']].map(([t, h, p]) => (
                <li key={t} className="card p-4"><span className="mono font-semibold text-brand">{t}</span><span className="mt-1.5 block text-[15px] font-semibold text-ink">{h}</span><span className="mt-1 block t-caption">{p}</span></li>
              ))}
            </ol>
          </div>
          <div className="card self-start p-6 max-lg:order-first md:p-8 lg:order-2">
            {status === 'sent' ? <Sent title="Thank you" body="Your request is in. We will reply within one business day to confirm a time." /> : (
              <form noValidate onSubmit={onSubmit} className="space-y-5">
                <h2 className="t-h4">Book a demo</h2>
                <Honeypot />
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Full name" name="name" autoComplete="name" required error={errors.name} {...bind('name')} />
                  <Field label="Company" name="company" autoComplete="organization" required error={errors.company} {...bind('company')} />
                </div>
                <Field label="Product of interest" name="product" as="select" required error={errors.product} {...sel}>
                  <option value="" disabled>Select a product</option>
                  {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Field>
                <Field label="Work email" name="email" type="email" autoComplete="email" required error={errors.email} {...bind('email')} />
                <Field label="Mobile number" name="mobile" type="tel" autoComplete="tel" required error={errors.mobile} {...bind('mobile')} />
                <SubmitRow status={status} label="Book my demo" />
                <p className="t-caption">By submitting, you agree to our <a href="/privacy-policy" className="ilink">privacy policy</a>. We use your details only to arrange the demo.</p>
              </form>
            )}
            <p className="mt-5 flex items-center gap-2 border-t border-line pt-4 t-caption"><Icon name="Clock" size={15} />A reply within one business day</p>
          </div>
        </div>
      </section>
    </>
  );
}
