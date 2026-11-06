import { Seo } from '../lib/head.jsx';
import { SITE } from '../data/site.js';
import { Breadcrumb, CopyButton, Icon, Reveal } from '../components/ui.jsx';
import { FormTrust } from '../components/blocks.jsx';
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
        description="Contact Deep Algorithms in Hyderabad, Bengaluru or Plano, Texas. Email info@deepalgorithms.in or call +91 77028 46856." />
      <section className="stage band-brand hero-under relative overflow-hidden">
        <div className="wrap relative grid grid-cols-1 gap-12 pb-20 pt-10 md:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div>
            <Breadcrumb items={[{ name: 'Contact' }]} className="rise" />
            <p className="eyebrow rise mt-8">Contact</p>
            <h1 className="t-h1 rise mt-6" style={{ '--d': '80ms' }}>Talk to the people who build it.</h1>
            <p className="t-lead rise mt-5 max-w-[520px]" style={{ '--d': '160ms' }}>Questions about a product, a partnership or a press request. We read every message and usually reply within one business day.</p>
            <ul className="rise mt-10 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3" style={{ '--d': '240ms' }}>
              {[['EnvelopeSimple', 'Email', SITE.email, `mailto:${SITE.email}`], ['Phone', 'Phone', SITE.phone, SITE.phoneHref], ['LinkedinLogo', 'LinkedIn', 'Deep Algorithms', SITE.linkedin]].map(([ic, k, v, href]) => (
                <li key={k} className="relative">
                  <a href={href} target={k === 'LinkedIn' ? '_blank' : undefined} rel="noreferrer" className="card card-hover block h-full p-5"><Icon name={ic} size={22} className="text-cyan-2" /><span className="mt-4 block text-[13px] text-ink-3">{k}</span><span className="mt-0.5 block break-words text-[15px] font-medium">{v}</span></a>
                  {k !== 'LinkedIn' && <CopyButton value={v} label={`Copy ${k.toLowerCase()}: ${v}`} className="absolute right-3 top-3" />}
                </li>
              ))}
            </ul>
            <div className="mt-10 space-y-3">
              {SITE.offices.map((o) => (
                <div key={o.city} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line pt-4">
                  <p className="text-[16px] font-semibold">{o.city} <span className="text-[13px] font-normal text-ink-3">· {o.label}</span></p>
                  <p className="max-w-[420px] text-[14.5px] text-ink-2">{o.address}{o.map && <> · <a href={o.map} target="_blank" rel="noreferrer" className="text-cyan-2 hover:text-fg">Maps</a></>}</p>
                </div>
              ))}
            </div>
          </div>
          <Reveal className="tone-l glass relative self-start rounded-[26px] p-6 shadow-[0_40px_100px_-40px_rgba(0,0,0,.6)] md:p-10">
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
                <p className="text-[13px] text-ink-3">We use your details only to reply. See our <a href="/privacy-policy" className="underline underline-offset-2 hover:text-ink">privacy policy</a>.</p>
              </form>
            )}
            <FormTrust />
          </Reveal>
        </div>
      </section>
    </>
  );
}
