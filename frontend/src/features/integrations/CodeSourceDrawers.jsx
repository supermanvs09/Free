import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, PlugZap, RefreshCw, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { disconnectBitbucket, disconnectGitHub, saveBitbucket, testBitbucket, verifyGitHub } from '../../lib/api/codeSources';
import { formatDateTime, formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Field, Input, Textarea } from '../../ui/Field';
import { Drawer } from '../../ui/Overlay';
import { SectionLabel } from '../../ui/Panel';
import { Code } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { BitbucketMark, GitHubMark } from './parts';

/* ── Shared pieces ─────────────────────────────────────────────────────── */

function Steps({ steps }) {
  return (
    <ol className="flex flex-col gap-4">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-white">{i + 1}</span>
          <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">
            <p className="font-semibold text-ink">{step.title}</p>
            {step.body && <p className="mt-0.5">{step.body}</p>}
            {step.list && (
              <ul className="mt-1.5 flex flex-col gap-1">
                {step.list.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="mt-[8px] size-1 shrink-0 rounded-full bg-ink-3" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
            {step.note && <p className="mt-1.5 text-[12px] text-ink-3">{step.note}</p>}
            {step.children}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Checks({ checks }) {
  if (!checks?.length) return null;
  return (
    <ul className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-line bg-surface-2 p-3">
      {checks.map((c) => {
        const pass = c.ok === true || c.state === 'pass';
        return (
          <li key={c.key || c.name || c.label} className="flex items-start gap-2 text-[12.5px]">
            {pass ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" /> : <XCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-critical" />}
            <span>
              <span className="font-medium text-ink">{c.label || c.name || c.check || c.key}</span>
              {(c.message || c.detail || c.hint) && <span className="block text-ink-3">{c.message || c.detail || c.hint}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CopyValue({ label, value, secret }) {
  const { notify } = useToast();
  const [shown, setShown] = useState(!secret);
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1 flex items-center gap-2">
        <Code className="min-w-0 flex-1 truncate !py-1.5">{shown ? value : '•'.repeat(24)}</Code>
        {secret && (
          <Button size="sm" variant="ghost" onClick={() => setShown((v) => !v)}>
            {shown ? 'Hide' : 'Show'}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={Copy}
          onClick={() => navigator.clipboard?.writeText(value).then(() => notify({ variant: 'success', title: `${label} copied` }))}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}

function StatusLine({ tone, children }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-[12.5px] leading-relaxed',
        tone === 'low' ? 'border-low/30 bg-low-soft text-ink' : tone === 'medium' ? 'border-medium/35 bg-medium-soft text-ink' : 'border-line bg-surface-2 text-ink-2',
      )}
    >
      {tone === 'low' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" /> : <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-medium" />}
      <span>{children}</span>
    </p>
  );
}

/* ── GitHub ────────────────────────────────────────────────────────────── */

/** Install the GitHub App, then Verify: GitHub is switched on only when the App is found on the organisation. */
export function GitHubDrawer({ status, canManage, onClose, onChanged }) {
  const { notify } = useToast();
  const workspace = useWorkspace();
  const gh = status?.github ?? {};
  const [org, setOrg] = useState(gh.org || '');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);

  const verify = async (event) => {
    event?.preventDefault();
    setBusy('verify');
    const r = await verifyGitHub(org);
    setBusy('');
    setResult(r);
    if (r.ok) {
      notify({ variant: 'success', title: 'GitHub connected', description: `Repositories of ${r.data.org} are scanned. Findings appear under Exposed credentials.` });
      workspace.refresh?.();
      onChanged();
    }
  };
  const disconnect = async () => {
    setBusy('off');
    const r = await disconnectGitHub();
    setBusy('');
    notify(r.ok ? { variant: 'success', title: 'GitHub scanning switched off' } : { variant: 'error', title: 'Could not switch GitHub off', description: r.message });
    if (r.ok) {
      workspace.refresh?.();
      onChanged();
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Code repositories · GitHub App"
      title="Connect GitHub"
      subtitle="Read-only. No personal access tokens or passwords: the App reads code, and GitHub tells us about every push."
      footer={
        gh.active && canManage ? (
          <Button variant="ghost" icon={Trash2} className="mr-auto !text-critical" onClick={disconnect} loading={busy === 'off'}>
            Switch GitHub off
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <GitHubMark />
          {gh.active ? (
            <StatusLine tone="low">
              Connected to <b>{gh.org}</b>
              {gh.verified_at ? ` · checked ${formatRelative(gh.verified_at)}` : ''}. Findings appear under Exposed credentials.
            </StatusLine>
          ) : (
            <StatusLine>Not connected. Follow the steps below; scanning starts once the check passes.</StatusLine>
          )}
        </div>

        <div>
          <SectionLabel>What the App can read</SectionLabel>
          <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] text-ink-2">
            <li><b className="text-ink">Contents</b> read-only - to scan repository code</li>
            <li><b className="text-ink">Metadata</b> read-only - to list the repositories it can access</li>
            <li><b className="text-ink">Push events</b> - a scan of the changed files on every push</li>
          </ul>
          <p className="mt-1 text-[12px] text-ink-3">No write access to code, issues, pull requests or settings.</p>
        </div>

        <Steps
          steps={[
            {
              title: 'Install the GitHub App',
              body: 'Open the installation link. GitHub shows every permission above for an organisation owner to approve.',
              children: gh.install_url ? (
                <Button as="a" href={gh.install_url} target="_blank" rel="noreferrer" variant="secondary" size="sm" icon={ExternalLink} className="mt-2">
                  Open the installation page
                </Button>
              ) : (
                <p className="mt-1.5 text-[12px] text-ink-3">The installation link is not set up for this workspace yet. Contact support for it.</p>
              ),
            },
            {
              title: 'Choose the repositories',
              list: ['All repositories in the organisation, or', 'Only selected repositories'],
              note: 'You can change this at any time: GitHub → Organization settings → Installed GitHub Apps → Configure.',
            },
            {
              title: 'The webhook is registered for you',
              body: 'Once installed, the App receives every push as a signed event. Nothing to configure by hand.',
            },
            {
              title: 'Check the installation',
              body: 'Enter the organisation (or user) the App is installed on. GitHub scanning switches on when the App is found there.',
              children: canManage ? (
                <form onSubmit={verify} className="mt-2 flex flex-col gap-2">
                  <Field label="GitHub organisation" htmlFor="gh-org" error={result && !result.ok && result.code === 'INVALID_ORG' ? result.message : undefined}>
                    <Input id="gh-org" value={org} onChange={(e) => setOrg(e.target.value)} placeholder="your-organisation" autoComplete="off" spellCheck={false} className="font-mono" />
                  </Field>
                  <div>
                    <Button type="submit" variant="primary" icon={ShieldCheck} loading={busy === 'verify'} disabled={!org.trim()}>
                      {gh.active ? 'Check again' : 'Check and connect'}
                    </Button>
                  </div>
                  {result && (result.ok ? <Checks checks={result.data.checks} /> : result.data.checks ? <Checks checks={result.data.checks} /> : result.code !== 'INVALID_ORG' && <StatusLine tone="medium">{result.message}</StatusLine>)}
                </form>
              ) : (
                <p className="mt-1.5 text-[12px] text-ink-3">An admin connects GitHub.</p>
              ),
            },
          ]}
        />
        <p className="text-[12px] text-ink-3">Source code and full secret values are never stored.</p>
      </div>
    </Drawer>
  );
}

/* ── Bitbucket Data Center ─────────────────────────────────────────────── */

/** Token and URL are tested before anything is saved; only then is Bitbucket switched on and the webhook shown. */
export function BitbucketDrawer({ status, canManage, onClose, onChanged }) {
  const { notify } = useToast();
  const workspace = useWorkspace();
  const bb = status?.bitbucket ?? {};
  const [form, setForm] = useState({ base_url: bb.base_url || '', token: '', token_expires_at: '', ca_cert_pem: '' });
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const fields = result?.data?.fields ?? {};
  const webhook = result?.ok ? result.data.webhook : null;
  const checks = result?.data?.test?.checks ?? result?.data?.checks;

  const save = async (event) => {
    event.preventDefault();
    setBusy('save');
    const r = await saveBitbucket(form);
    setBusy('');
    setResult(r);
    if (r.ok) {
      setForm((f) => ({ ...f, token: '' }));
      notify({ variant: 'success', title: 'Bitbucket connected', description: 'Now add the webhook (step 3) so every push is scanned.' });
      workspace.refresh?.();
      onChanged();
    }
  };
  const retest = async () => {
    setBusy('test');
    const r = await testBitbucket();
    setBusy('');
    setResult(r);
    notify(r.ok ? { variant: 'success', title: 'Connection works' } : { variant: 'error', title: 'The connection test failed', description: r.message });
    onChanged();
  };
  const disconnect = async () => {
    setBusy('off');
    const r = await disconnectBitbucket();
    setBusy('');
    notify(r.ok ? { variant: 'success', title: 'Bitbucket scanning switched off', description: 'The saved connection is kept: save it again to switch back on.' } : { variant: 'error', title: 'Could not switch Bitbucket off', description: r.message });
    if (r.ok) {
      workspace.refresh?.();
      onChanged();
    }
  };

  const expiry = bb.token_expiry_status;
  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow="Code repositories · Bitbucket Data Center"
      title="Connect Bitbucket"
      subtitle="A read-only HTTP access token for your self-hosted Bitbucket, plus a push webhook so every change is scanned."
      footer={
        bb.active && canManage ? (
          <>
            <Button variant="ghost" icon={Trash2} className="mr-auto !text-critical" onClick={disconnect} loading={busy === 'off'}>
              Switch Bitbucket off
            </Button>
            <Button variant="secondary" icon={RefreshCw} onClick={retest} loading={busy === 'test'}>
              Test connection
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <BitbucketMark />
          {bb.active ? (
            <StatusLine tone={expiry === 'expired' || expiry === 'expiring_soon' ? 'medium' : 'low'}>
              Connected to <b>{bb.base_url}</b>
              {bb.projects?.length ? ` · projects ${bb.projects.join(', ')}` : ''}
              {bb.repositories?.length ? ` · ${bb.repositories.length} repositories` : ''}.{' '}
              {expiry === 'expired'
                ? 'The token has expired: create a new one and save it below.'
                : expiry === 'expiring_soon'
                  ? `The token expires in ${bb.token_days_left} days: create a new one and save it below.`
                  : bb.token_expires_at
                    ? `Token valid until ${bb.token_expires_at}.`
                    : ''}
              {bb.last_event_at ? ` Last push received ${formatRelative(bb.last_event_at)}.` : ' No push received yet.'}
            </StatusLine>
          ) : (
            <StatusLine>{bb.configured ? 'Switched off. Save the connection again to switch it back on.' : 'Not connected. Follow the steps below; scanning starts once the test passes.'}</StatusLine>
          )}
        </div>

        <div>
          <SectionLabel>Before you start</SectionLabel>
          <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] text-ink-2">
            <li>A Bitbucket Data Center licence (needed for project and repository tokens).</li>
            <li>Your Bitbucket reachable from the scanning service (public URL with an IP allowlist, VPN or private link).</li>
          </ul>
        </div>

        <Steps
          steps={[
            {
              title: 'Create a read-only HTTP access token',
              list: [
                'Project settings → HTTP access tokens (covers every repository of the project), or Repository settings → HTTP access tokens',
                'Create token, name it for this connection',
                'Permissions: Project read and Repository read only',
                'Expiry: per your security policy (30 days recommended)',
                'Copy the token straight away - Bitbucket shows it only once',
              ],
            },
            {
              title: 'Save and test the connection',
              body: 'The token and address are tested before anything is saved. The token is stored encrypted and never shown again.',
              children: canManage ? (
                <form onSubmit={save} className="mt-2 flex flex-col gap-3">
                  <Field label="Bitbucket address" htmlFor="bb-url" error={fields.base_url}>
                    <Input id="bb-url" value={form.base_url} onChange={set('base_url')} placeholder="https://bitbucket.example.com" autoComplete="off" spellCheck={false} />
                  </Field>
                  <Field label="HTTP access token" htmlFor="bb-token" error={fields.token}>
                    <Input id="bb-token" type="password" value={form.token} onChange={set('token')} autoComplete="off" spellCheck={false} placeholder={bb.configured ? 'Paste a new token to replace the saved one' : ''} />
                  </Field>
                  <Field label="Token expiry date" htmlFor="bb-exp" error={fields.token_expires_at} hint="Shown by Bitbucket when the token is created; we warn you before it runs out.">
                    <Input id="bb-exp" type="date" value={form.token_expires_at} onChange={set('token_expires_at')} />
                  </Field>
                  <Field label="CA certificate (optional)" htmlFor="bb-ca" hint="Only if your Bitbucket uses an internal or self-signed certificate.">
                    <Textarea id="bb-ca" rows={3} value={form.ca_cert_pem} onChange={set('ca_cert_pem')} placeholder="-----BEGIN CERTIFICATE-----" className="font-mono text-[12px]" />
                  </Field>
                  <div>
                    <Button type="submit" variant="primary" icon={PlugZap} loading={busy === 'save'} disabled={!form.base_url || !form.token || !form.token_expires_at}>
                      {bb.configured ? 'Save and test' : 'Test and connect'}
                    </Button>
                  </div>
                  {result && !result.ok && !Object.keys(fields).length && <StatusLine tone="medium">{result.message}</StatusLine>}
                  <Checks checks={checks} />
                </form>
              ) : (
                <p className="mt-1.5 text-[12px] text-ink-3">An admin connects Bitbucket.</p>
              ),
            },
            {
              title: 'Create the push webhook',
              list: [
                'Project settings → Webhooks → Create webhook (or per repository)',
                'URL and Secret: the values below',
                'Events: Repository → Push only',
                'Save',
              ],
              note: 'Bitbucket signs each push with the secret; unsigned or tampered payloads are refused.',
              children:
                webhook || bb.webhook_url ? (
                  <div className="mt-2 flex flex-col gap-2.5">
                    <CopyValue label="Webhook URL" value={webhook?.url || bb.webhook_url} />
                    {webhook?.secret ? (
                      <CopyValue label="Webhook secret" value={webhook.secret} secret />
                    ) : (
                      <p className="text-[12px] text-ink-3">The secret is shown once, when the connection is first saved. Lost it? Contact support for a new one.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[12px] text-ink-3">Shown here once step 2 passes.</p>
                ),
            },
          ]}
        />
        {bb.last_verified_at && <p className="text-[12px] text-ink-3">Last successful test {formatDateTime(bb.last_verified_at)}.</p>}
      </div>
    </Drawer>
  );
}
