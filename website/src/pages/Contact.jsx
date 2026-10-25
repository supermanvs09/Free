import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { Breadcrumb, Icon } from '../components/ui.jsx';
import { Field, Honeypot, SubmitRow, Sent, useLeadForm, EMAIL_RE } from '../components/Form.jsx';

const validate = (v) => {
  const e = {};
  if (!v.name.trim()) e.name = 'Please enter your name.';
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Please enter a valid email.';
  if (!v.subject.trim()) e.subject = 'Please add a subject.';
  if (v.message.trim().length < 10) e.message = 'Please write a little more (10 characters or more).';
  return e;
};
const toPayload = (v) => ({ name: v.name.trim(), request_type: 'contact', email_id: v.email.trim(), subject: v.subject.trim(), message: v.message.trim() });

export default function Contact() {
  const { errors, status, bind, onSubmit } = useLeadForm({ name: '', email: '', subject: '', message: '' }, validate, toPayload);
  return (
    <>
      <Seo title="Contact Us" path="/contact" crumbs={[{ name: 'Contact', path: '/contact' }]}
        description="Contact Deep Algorithms in Hyderabad, Bengaluru or Maryland. Email info@deepalgorithms.in or call +91 77028 46856." />
      <section className="wrap grid grid-cols-1 gap-12 py-12 md:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
        <div>
          <Breadcrumb items={[{ name: 'Contact' }]} />
          <h1 className="t-h1 mt-8">Talk to us</h1>
          <p className="t-lead mt-5 max-w-[520px]">Questions about a product, a partnership or a press request. We read every message.</p>
          <ul className="mt-10 space-y-5 text-[16px]">
            <li className="flex items-center gap-3"><Icon name="EnvelopeSimple" size={22} weight="light" className="text-brand" /><a href={`mailto:${SITE.email}`} className="text-ink hover:text-brand">{SITE.email}</a></li>
            <li className="flex items-center gap-3"><Icon name="Phone" size={22} weight="light" className="text-brand" /><a href={SITE.phoneHref} className="text-ink hover:text-brand">{SITE.phone}</a></li>
            <li className="flex items-center gap-3"><Icon name="LinkedinLogo" size={22} weight="light" className="text-brand" /><a href={SITE.linkedin} target="_blank" rel="noreferrer" className="text-ink hover:text-brand">Deep Algorithms on LinkedIn</a></li>
          </ul>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {SITE.offices.map((o) => (
              <div key={o.city} className="rounded-[20px] bg-mist p-6">
                <h2 className="font-medium text-ink">{o.city}</h2>
                <p className="text-[13px] text-ink-3">{o.label}</p>
                <p className="mt-2 text-[15px] text-ink-2">{o.address}</p>
                {o.map && <a href={o.map} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium text-brand">Open in Maps<Icon name="ArrowUpRight" size={13} /></a>}
              </div>
            ))}
          </div>
        </div>
        <div className="relative self-start rounded-[24px] border border-line bg-white p-6 shadow-[0_24px_60px_-30px_rgba(11,18,32,.25)] md:p-10">
          {status === 'sent' ? <Sent title="Message sent" body="Thank you. We usually reply within one business day." /> : (
            <form noValidate onSubmit={onSubmit} className="space-y-5">
              <Honeypot />
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Name" name="name" autoComplete="name" required error={errors.name} {...bind('name')} />
                <Field label="Email" name="email" type="email" autoComplete="email" required error={errors.email} {...bind('email')} />
              </div>
              <Field label="Subject" name="subject" required error={errors.subject} {...bind('subject')} />
              <Field label="Message" name="message" as="textarea" required error={errors.message} {...bind('message')} />
              <SubmitRow status={status} label="Send message" />
              <p className="text-[13px] text-ink-3">We use your details only to reply. See our <a href="/privacy-policy" className="underline">privacy policy</a>.</p>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
