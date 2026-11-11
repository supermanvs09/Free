import { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth';
import { BrandLockup } from '../shell/Brand';
import { Button } from '../ui/Button';
import { Field, Input, PasswordInput } from '../ui/Field';
import { GitHubMark, BitbucketMark, JenkinsMark } from '../ui/Marks';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[400px]">
          <BrandLockup height={28} />
          <h1 className="mt-10 text-[26px] font-bold tracking-[-0.02em] text-ink">Sign in</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-3">Code &amp; CI/CD console, running inside your network.</p>
          <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
            <Field label="Work email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!error && !email} autoFocus />
            </Field>
            <Field label="Password" htmlFor="password" error={error}>
              <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!error} />
            </Field>
            <Button type="submit" variant="primary" size="lg" loading={busy} iconRight={ArrowRight} className="mt-1 w-full">
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-[12px] text-ink-3">Accounts are created by your console admin. Forgotten password? Ask an admin to reset it.</p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-[linear-gradient(150deg,var(--t-brand-deep)_0%,#0b2440_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-center">
        <div className="max-w-md">
          <div className="flex gap-2">
            <GitHubMark /> <BitbucketMark /> <JenkinsMark />
          </div>
          <h2 className="mt-6 text-[28px] leading-tight font-bold">Secrets in code and CI/CD credentials, in one place.</h2>
          <ul className="mt-6 flex flex-col gap-3 text-[14px] text-white/80">
            {[
              'Every repository scanned, then every push as it lands',
              'Jenkins credentials and the pipelines that use them',
              'Read-only access everywhere; values never stored',
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-white" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
