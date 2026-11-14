import { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, Clock3, ShieldCheck } from 'lucide-react';
import { detectViewer, signIn } from '../../data/store';
import { PROVIDERS, SOURCE_PROVIDERS } from '../../data/world';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { AppLogo } from '../../components/Logo';
import { Avatar } from '../../components/bits';
import { BrandLockup } from '../../shell/Brand';

const TRUST_MARKS = [
  { icon: ShieldCheck, label: 'SOC 2 Type II Certified' },
  { icon: BadgeCheck, label: 'ISO 27001 Compliant' },
  { icon: Clock3, label: '24/7 Monitoring' },
];

/**
 * Sign-in. Where the page knows who is viewing, signing in is one press;
 * otherwise it asks for a name and work email.
 */
export default function SignInPage() {
  const [viewer, setViewer] = useState(undefined);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    detectViewer().then((v) => setViewer(v && v.name ? v : null));
  }, []);

  const go = async (event) => {
    event?.preventDefault();
    if (!viewer) {
      if (!name.trim()) return setError('Enter your name so teammates know who did what.');
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('That email address does not look complete.');
    }
    setBusy(true);
    await signIn({ viewer, name: name.trim(), email: email.trim() });
  };

  return (
    <div className="auth-canvas relative overflow-hidden">
      <main className="relative mx-auto grid min-h-[inherit] w-full max-w-[1900px] grid-cols-1 content-center items-start gap-x-[clamp(2rem,4vw,6rem)] gap-y-12 px-[clamp(1.25rem,5.9vw,7rem)] py-[clamp(2rem,3.6vh,3.5rem)] lg:grid-cols-[minmax(0,1fr)_clamp(23rem,32.7vw,38.75rem)]">
        <section>
          <p style={{ '--step': 1 }} className="animate-auth inline-flex w-fit items-center gap-2.5 rounded-full border border-line bg-[var(--t-auth-badge)] px-[clamp(0.9rem,1.1vw,1.35rem)] py-[clamp(0.4rem,0.55vw,0.65rem)] text-[clamp(10px,0.79vw,15px)] font-semibold tracking-[0.15em] text-[var(--t-auth-badge-ink)] uppercase">
            <span aria-hidden="true" className="size-[0.45em] rounded-full bg-[var(--t-auth-accent)]" />
            Enterprise Security Platform
          </p>
          <h1 style={{ '--step': 2 }} className="animate-auth mt-[clamp(1.5rem,2.6vw,3.25rem)] font-serif text-[clamp(42px,5vw,92px)] leading-[1.02] font-normal tracking-[-0.03em] text-[var(--t-auth-ink)]">
            Non-Human
            <br />
            Identity
            <br />
            <span className="text-[var(--t-auth-ink-2)] italic">Security</span>
          </h1>
          <p style={{ '--step': 3 }} className="animate-auth mt-[clamp(1.25rem,2vw,2.5rem)] max-w-[48ch] text-[clamp(14px,1.15vw,22px)] leading-[1.6] text-[var(--t-auth-ink-2)]">
            One inventory of every service account, workload, token and pipeline across your clouds, code and secrets manager. See what each can reach, catch leaks and misuse as they happen, and fix them with the team in Jira.
          </p>
          <ul style={{ '--step': 4 }} className="animate-auth mt-[clamp(1.5rem,2.4vw,3rem)] flex flex-wrap items-center gap-3">
            {SOURCE_PROVIDERS.map((p) => (
              <li key={p} className="flex items-center gap-2 rounded-[8px] border border-line bg-surface py-1.5 pr-3.5 pl-1.5 text-[clamp(12px,0.95vw,17px)] text-[var(--t-auth-ink)]">
                <AppLogo name={PROVIDERS[p].logo} size={26} />
                {PROVIDERS[p].short}
              </li>
            ))}
          </ul>
          <ul style={{ '--step': 5 }} className="animate-auth mt-[clamp(1.5rem,2.4vw,3rem)] flex flex-wrap items-center gap-x-[clamp(1.25rem,2vw,2.5rem)] gap-y-3">
            {TRUST_MARKS.map((mark) => (
              <li key={mark.label} className="flex items-center gap-2.5 text-[clamp(12.5px,1vw,19px)] text-[var(--t-auth-ink-2)]">
                <mark.icon aria-hidden="true" className="size-[1.15em] shrink-0 text-[var(--t-auth-accent)]" />
                {mark.label}
              </li>
            ))}
          </ul>
        </section>

        <section data-theme="light" style={{ '--step': 2 }} className="animate-auth-card rounded-[12px] border border-[var(--t-auth-card-line)] bg-[var(--t-auth-card)] p-[clamp(1.5rem,2.6vw,3.25rem)] text-ink">
          <BrandLockup variant="light" height={36} />
          <h2 className="mt-[clamp(1.25rem,2vw,2.25rem)] text-[clamp(20px,1.5vw,28px)] font-semibold tracking-[-0.02em]">Sign in to your workspace</h2>
          <p className="mt-1.5 text-[clamp(13px,0.95vw,17px)] text-ink-3">corvane.io · Production estate</p>

          {viewer === undefined && <div className="mt-8 h-24 animate-pulse rounded-xl bg-surface-3" />}

          {viewer && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 p-3.5">
                <Avatar person={{ ref: viewer.id, name: viewer.name, avatarUrl: viewer.avatarUrl, color: viewer.color }} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{viewer.name}</p>
                  <p className="text-[12.5px] text-ink-3">Verified by single sign-on</p>
                </div>
              </div>
              <Button variant="auth" size="auth" className="w-full" onClick={go} loading={busy} iconRight={ArrowRight}>
                Continue as {viewer.name.split(' ')[0]}
              </Button>
            </div>
          )}

          {viewer === null && (
            <form onSubmit={go} className="mt-8 space-y-4" noValidate>
              <Field label="Full name" htmlFor="si-name" required>
                <Input id="si-name" size="auth" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} autoComplete="name" autoFocus placeholder="Your full name" />
              </Field>
              <Field label="Work email" htmlFor="si-email" hint="Optional. Used to address mail sent to you.">
                <Input id="si-email" size="auth" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} autoComplete="email" placeholder="name@corvane.io" />
              </Field>
              {error && <p role="alert" className="text-[13px] font-medium text-critical">{error}</p>}
              <Button type="submit" variant="auth" size="auth" className="w-full" loading={busy} iconRight={ArrowRight}>
                Sign in
              </Button>
            </form>
          )}

          <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
            Everyone in this workspace sees the same estate. Changes you make, from Jira issues to comments, reach your teammates as they happen.
          </p>
        </section>
      </main>
    </div>
  );
}
