import { useId, useState } from 'react';
import { SITE } from '../data/site.js';
import { Button, Icon, cx } from './ui.jsx';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Field({ label, name, error, as = 'input', children, className, ...rest }) {
  const id = useId();
  const As = as;
  const cls = cx('mt-2 w-full rounded-[12px] border bg-bg-1 px-4 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-cyan focus:ring-2 focus:ring-cyan/25',
    error ? 'border-crit' : 'border-line-2', as === 'textarea' ? 'min-h-[140px] py-3' : 'h-12', as === 'select' && 'appearance-none pr-11');
  const control = <As id={id} name={name} className={cls} aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} {...rest}>{children}</As>;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-[14px] font-medium text-ink-2">{label}</label>
      {as === 'select' ? <div className="relative">{control}<Icon name="CaretDown" size={14} className="pointer-events-none absolute right-4 top-[calc(50%+4px)] -translate-y-1/2 text-ink-3" /></div> : control}
      {error && <p id={`${id}-e`} className="mt-1.5 text-[13px] text-crit">{error}</p>}
    </div>
  );
}

/* Posts JSON to the lead endpoint. `website` is a honeypot: people never see
   it, simple bots fill it, and those submissions are dropped silently. */
export function useLeadForm(initial, validate, toPayload) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const bind = (k) => ({ value: values[k], onChange: (e) => setValues((v) => ({ ...v, [k]: e.target.value })) });

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      e.currentTarget.elements[Object.keys(errs)[0]]?.focus(); // error keys are field names
      return;
    }
    if (e.currentTarget.website.value) { setStatus('sent'); return; }
    setStatus('sending');
    try {
      const res = await fetch(SITE.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toPayload(values)) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('sent');
      if (window.gtag) window.gtag('event', 'generate_lead', { form: toPayload(values).request_type });
    } catch {
      setStatus('error');
    }
  };
  return { values, errors, status, bind, onSubmit };
}

export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
    </div>
  );
}

export function SubmitRow({ status, label }) {
  return (
    <>
      {status === 'error' && (
        <p role="alert" className="flex items-start gap-2 rounded-[12px] border border-crit/40 bg-crit/10 p-4 text-[14px] text-crit">
          <Icon name="Warning" size={18} className="mt-0.5 shrink-0" />
          <span>We could not send this. Please try again, or email us at <a href={`mailto:${SITE.email}`} className="underline">{SITE.email}</a>.</span>
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={status === 'sending'} aria-busy={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : label}
      </Button>
    </>
  );
}

export function Sent({ title, body }) {
  return (
    <div role="status" className="flex min-h-[420px] flex-col items-center justify-center text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-ok/15 text-ok"><Icon name="CheckCircle" size={34} weight="fill" /></span>
      <h2 className="mt-6 text-[30px] font-semibold tracking-[-0.03em] text-ink">{title}</h2>
      <p className="mt-3 max-w-[380px] text-ink-2">{body}</p>
    </div>
  );
}
