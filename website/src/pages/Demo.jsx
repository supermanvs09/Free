import { Seo } from '../lib/head.jsx';
import { Breadcrumb, Icon } from '../components/ui.jsx';
import { LogoBand } from '../components/blocks.jsx';
import { Field, Honeypot, SubmitRow, Sent, useLeadForm, EMAIL_RE } from '../components/Form.jsx';

// Values match what the lead endpoint already receives (all, adapid, botshield, dpdpa).
const OPTIONS = [
  ['all', 'All products'], ['zenstra', 'Zenstra AI (AI agent security)'], ['adapid', 'adapID AI (identity risk and fraud)'],
  ['nhi', 'NHI Security for AWS'], ['botshield', 'BotShield AI (bots, CTEM, DDoS)'], ['dpdpa', 'ICMS Compliance Suite (DPDPA)'],
];

const EXPECT = [
  ['Clock', 'A 30-minute live demo', 'Focused on the risks you care about.'],
  ['Target', 'Built around your environment', 'We focus on the identities, agents and data you actually run.'],
  ['EnvelopeSimple', 'A reply within one business day', 'To confirm a time that suits your team.'],
];

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
  const { errors, status, bind, onSubmit } = useLeadForm({ name: '', company: '', product: '', email: '', mobile: '' }, validate, toPayload);
  return (
    <>
      <Seo title="Book a Demo" path="/request-demo" crumbs={[{ name: 'Book a demo', path: '/request-demo' }]}
        description="See Deep Algorithms on your own environment. Book a 30-minute live demo of Zenstra AI, adapID AI, BotShield AI or ICMS." />
      <section className="wrap grid grid-cols-1 gap-12 py-12 md:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div>
          <Breadcrumb items={[{ name: 'Book a demo' }]} />
          <h1 className="t-h1 mt-8">See it on your own identities</h1>
          <p className="t-lead mt-5 max-w-[520px]">Tell us a little about your team and we will set up a session around the risks you care about.</p>
          <ul className="mt-10 space-y-6">
            {EXPECT.map(([icon, t, b]) => (
              <li key={t} className="flex gap-4">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-sky text-brand"><Icon name={icon} size={22} weight="light" /></span>
                <span><span className="block font-medium text-ink">{t}</span><span className="text-ink-2">{b}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative rounded-[24px] border border-line bg-white p-6 shadow-[0_24px_60px_-30px_rgba(11,18,32,.25)] md:p-10">
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
              <p className="text-[13px] text-ink-3">By submitting, you agree to our <a href="/privacy-policy" className="underline">privacy policy</a>. We use your details only to arrange the demo.</p>
            </form>
          )}
        </div>
      </section>
      <LogoBand title="Trusted by banks, government and enterprises across India" />
      <div className="h-10" />
    </>
  );
}
