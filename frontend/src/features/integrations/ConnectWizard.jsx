import { useEffect, useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { actions, useView } from '../../data/store';
import { PROVIDERS } from '../../data/world';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Field';
import { Modal } from '../../ui/Overlay';
import { useToast } from '../../ui/Toast';
import { AppLogo } from '../../components/Logo';
import { cn } from '../../ui/cn';

const EXTERNAL_ID = 'corvane-7f3a91c2';
const AWS_REGIONS = ['us-east-1', 'us-east-2', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-south-1', 'ap-southeast-1'];

/* What each application needs, what we check before connecting, and how the result is named. */
const SPEC = {
  aws: {
    title: 'Connect an AWS account',
    setup: 'Deploy the read-only role with CloudFormation, then paste its ARN.',
    snippet: `aws cloudformation create-stack \\
  --stack-name corvane-nhi-readonly \\
  --template-url https://corvane-public.s3.amazonaws.com/nhi/readonly-role.yaml \\
  --parameters ParameterKey=ExternalId,ParameterValue=${EXTERNAL_ID} \\
  --capabilities CAPABILITY_NAMED_IAM`,
    fields: [
      { key: 'name', label: 'Account alias', placeholder: 'payments-staging', required: true },
      { key: 'locator', label: 'Account ID', placeholder: '123456789012', required: true, pattern: /^\d{12}$/, error: 'An AWS account ID is 12 digits.' },
      { key: 'roleArn', label: 'Role ARN', placeholder: 'arn:aws:iam::123456789012:role/CorvaneNHIReadOnly', required: true, pattern: /^arn:aws:iam::\d{12}:role\/.+/, error: 'Paste the role ARN from the stack outputs.' },
      { key: 'regions', label: 'Regions', type: 'regions' },
      { key: 'env', label: 'Environment', type: 'env' },
    ],
    checks: ['Assume role with the external ID', 'Read IAM (iam:GetAccountAuthorizationDetails)', 'Read CloudTrail for the selected regions', 'Create EventBridge rule for live changes'],
  },
  azure: {
    title: 'Connect an Azure subscription',
    setup: 'Grant admin consent to the Corvane enterprise app in your tenant, then pick the subscription.',
    consent: 'Grant admin consent in Entra ID',
    fields: [
      { key: 'tenant', label: 'Tenant', placeholder: 'contoso.onmicrosoft.com', required: true },
      { key: 'locator', label: 'Subscription ID', placeholder: '00000000-0000-0000-0000-000000000000', required: true, pattern: /^[0-9a-f-]{36}$/i, error: 'A subscription ID is a GUID.' },
      { key: 'name', label: 'Subscription name', placeholder: 'Production', required: true },
      { key: 'env', label: 'Environment', type: 'env' },
    ],
    checks: ['Admin consent granted (Application.Read.All, Directory.Read.All)', 'Reader role on the subscription', 'Sign-in logs export to Log Analytics', 'Read Key Vault metadata (no secret values)'],
  },
  github: {
    title: 'Install the GitHub App',
    setup: 'Install the Corvane NHI GitHub App on your organization. It reads the audit log and scans pushes for secrets.',
    consent: 'Install on GitHub',
    fields: [
      { key: 'name', label: 'Organization', placeholder: 'acme', required: true, pattern: /^[A-Za-z0-9-]+$/, error: 'Use the organization login, e.g. acme.' },
      { key: 'repos', label: 'Repository access', type: 'select', options: ['All repositories', 'Selected repositories'] },
      { key: 'env', label: 'Environment', type: 'env' },
    ],
    locator: (f) => `github.com/${f.name}`,
    checks: ['App installed on the organization', 'Read the audit log (Enterprise Cloud)', 'Secret scanning push protection webhook', 'List Actions OIDC trust in cloud accounts'],
  },
  bitbucket: {
    title: 'Connect a Bitbucket workspace',
    setup: 'Authorise the Corvane OAuth consumer for your workspace. Admin scope is only needed to list app passwords.',
    consent: 'Authorise on Bitbucket',
    fields: [
      { key: 'name', label: 'Workspace', placeholder: 'acme-legacy', required: true, pattern: /^[a-z0-9-_]+$/, error: 'Use the workspace slug in lower case.' },
      { key: 'env', label: 'Environment', type: 'env' },
    ],
    locator: (f) => `bitbucket.org/${f.name}`,
    checks: ['OAuth consumer authorised', 'Workspace admin: list tokens and app passwords', 'Read Pipelines variables (names only)', 'Push webhook for secret scanning'],
  },
  vault: {
    title: 'Connect a Vault cluster',
    setup: 'Create a read-only policy and a JWT role for Corvane, then point us at the cluster.',
    snippet: `vault policy write corvane-nhi - <<EOF
path "sys/auth"            { capabilities = ["read"] }
path "auth/+/role/*"       { capabilities = ["read", "list"] }
path "auth/token/accessors" { capabilities = ["list", "sudo"] }
path "sys/leases/lookup/*" { capabilities = ["list", "sudo"] }
EOF`,
    fields: [
      { key: 'locator', label: 'Address', placeholder: 'https://vault.example.internal:8200', required: true, pattern: /^https:\/\/.+/, error: 'Use the https address of the active node.' },
      { key: 'name', label: 'Cluster name', placeholder: 'vault-prod', required: true },
      { key: 'auth', label: 'Auth method', type: 'select', options: ['JWT (recommended)', 'AppRole', 'Kubernetes'] },
      { key: 'namespace', label: 'Namespace', placeholder: 'admin (Enterprise only)' },
      { key: 'env', label: 'Environment', type: 'env' },
    ],
    checks: ['Reach the cluster through the connector', 'Log in with the corvane-nhi role', 'List auth methods and roles', 'Audit device streaming to Corvane'],
  },
  jira: {
    title: 'Connect Jira',
    setup: 'Authorise the Corvane app for Jira Cloud and pick the project issues go to.',
    consent: 'Authorise on Atlassian',
    fields: [
      { key: 'name', label: 'Site', placeholder: 'acme.atlassian.net', required: true },
      { key: 'project', label: 'Project key', placeholder: 'SEC', required: true },
      { key: 'sync', label: 'Status sync', type: 'select', options: ['Two-way', 'Console to Jira only'] },
    ],
    locator: (f) => `https://${f.name}`,
    checks: ['App authorised for the site', 'Create issues in the project', 'Webhook for status changes'],
  },
  email: {
    title: 'Set up email',
    setup: 'Send alert and assignment mail from your own domain.',
    fields: [
      { key: 'name', label: 'Provider', type: 'select', options: ['Google Workspace', 'Microsoft 365', 'SMTP relay'] },
      { key: 'locator', label: 'From address', placeholder: 'nhi-alerts@acme.com', required: true, pattern: /.+@.+\..+/, error: 'Enter a full email address.' },
    ],
    checks: ['SPF and DKIM aligned for the domain', 'Send a test message'],
  },
};

export function ConnectWizard({ provider, onClose }) {
  const spec = SPEC[provider];
  const toast = useToast();
  const existing = useView((v) => v.connections.filter((c) => c.provider === provider));
  const [step, setStep] = useState(0);
  const [consented, setConsented] = useState(!spec.consent);
  const [form, setForm] = useState(() => {
    const init = { env: 'prod', regions: ['us-east-1'] };
    for (const f of spec.fields) if (f.type === 'select') init[f.key] = f.options[0];
    if (provider === 'jira' || provider === 'email') Object.assign(init, Object.fromEntries((existing[0] && [['name', existing[0].name], ['locator', existing[0].locator]]) || []));
    return init;
  });
  const [errors, setErrors] = useState({});
  const [checked, setChecked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const validate = () => {
    const e = {};
    for (const f of spec.fields) {
      const v = form[f.key];
      if (f.required && !String(v || '').trim()) e[f.key] = `${f.label} is required.`;
      else if (f.pattern && v && !f.pattern.test(String(v).trim())) e[f.key] = f.error;
    }
    if (provider === 'aws' && form.roleArn && form.locator && !form.roleArn.includes(form.locator)) e.roleArn = 'The role ARN is in a different account from the account ID.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  useEffect(() => {
    if (step !== 2) return undefined;
    setChecked(0);
    const timers = spec.checks.map((_, k) => setTimeout(() => setChecked(k + 1), 700 + k * 650));
    return () => timers.forEach(clearTimeout);
  }, [step, spec.checks]);

  const finish = async () => {
    setBusy(true);
    const isWorkflow = provider === 'jira' || provider === 'email';
    if (isWorkflow && existing[0]) {
      await actions.updateConnection(existing[0].id, { name: form.name, locator: spec.locator ? spec.locator(form) : form.locator }, { verb: 'reconfigured', text: PROVIDERS[provider].name });
    } else {
      await actions.connect(provider, { name: form.name.trim(), locator: spec.locator ? spec.locator(form) : form.locator.trim(), env: form.env, regions: provider === 'aws' ? form.regions : [], tenant: form.tenant, details: { roleArn: form.roleArn, auth: form.auth, namespace: form.namespace, repos: form.repos, project: form.project } });
    }
    setBusy(false);
    toast.notify({ variant: 'success', title: `${PROVIDERS[provider].short} ${form.name} connected`, description: isWorkflow ? 'Settings saved for the whole workspace.' : 'Its identities are in the inventory now. Findings follow after the first scoring pass.' });
    onClose();
  };

  const stepsLabel = ['Prepare', 'Details', 'Verify'];
  const allPassed = checked >= spec.checks.length;

  return (
    <Modal
      open
      onClose={onClose}
      title={spec.title}
      description={
        <span className="mt-2 flex items-center gap-2">
          {stepsLabel.map((s, k) => (
            <span key={s} className={cn('inline-flex items-center gap-1.5 text-[11.5px] font-semibold', k === step ? 'text-brand' : k < step ? 'text-low' : 'text-ink-3')}>
              <span className={cn('grid size-4.5 place-items-center rounded-full text-[10px]', k === step ? 'bg-brand text-white' : k < step ? 'bg-low text-white' : 'bg-surface-3')}>{k < step ? <Check aria-hidden="true" className="size-3" /> : k + 1}</span>
              {s}
              {k < 2 && <span className="mx-1 h-px w-4 bg-line-strong" />}
            </span>
          ))}
        </span>
      }
      icon={() => <AppLogo name={PROVIDERS[provider].logo} size={22} tile={false} />}
      footer={
        <>
          {step > 0 && step < 2 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {step === 0 && <Button variant="primary" disabled={!consented} onClick={() => setStep(1)}>Continue</Button>}
          {step === 1 && <Button variant="primary" onClick={() => validate() && setStep(2)}>Verify connection</Button>}
          {step === 2 && <Button variant="primary" loading={busy} disabled={!allPassed} onClick={finish}>Connect</Button>}
        </>
      }
    >
      {step === 0 && (
        <div className="space-y-3.5">
          <p className="text-[13px] leading-relaxed text-ink-2">{spec.setup}</p>
          {spec.snippet && (
            <div className="relative overflow-hidden rounded-[10px] border border-line bg-[#0d1117]">
              <pre className="overflow-x-auto p-3 font-mono text-[11.5px] leading-relaxed text-[#c9d1d9]">{spec.snippet}</pre>
              <button type="button" onClick={() => navigator.clipboard?.writeText(spec.snippet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {})} className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">
                {copied ? <Check aria-hidden="true" className="size-3" /> : <Copy aria-hidden="true" className="size-3" />}{copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {provider === 'aws' && <p className="text-[12px] text-ink-3">External ID: <code className="rounded bg-inset px-1 font-mono">{EXTERNAL_ID}</code>. For an AWS Organization, deploy the same template as a StackSet to every account.</p>}
          {spec.consent && (
            <button type="button" onClick={() => setConsented(true)} className={cn('flex w-full items-center gap-3 rounded-[12px] border p-3 text-left transition-colors', consented ? 'border-low/40 bg-low-soft' : 'border-line-strong hover:border-brand')}>
              <AppLogo name={PROVIDERS[provider].logo} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink">{spec.consent}</span>
                <span className="block text-[11.5px] text-ink-3">{consented ? 'Done. You can continue.' : 'Opens the consent screen for your administrator.'}</span>
              </span>
              {consented && <Check aria-hidden="true" className="size-5 text-low" />}
            </button>
          )}
        </div>
      )}
      {step === 1 && (
        <form className="space-y-3.5" onSubmit={(e) => { e.preventDefault(); if (validate()) setStep(2); }}>
          {spec.fields.map((f) => {
            const id = `cw-${provider}-${f.key}`;
            if (f.type === 'env') return (
              <Field key={f.key} label={f.label} htmlFor={id}>
                <Select id={id} value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} options={[{ value: 'prod', label: 'Production' }, { value: 'staging', label: 'Staging' }, { value: 'dev', label: 'Development' }]} />
              </Field>
            );
            if (f.type === 'select') return (
              <Field key={f.key} label={f.label} htmlFor={id}>
                <Select id={id} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} options={f.options.map((o) => ({ value: o, label: o }))} />
              </Field>
            );
            if (f.type === 'regions') return (
              <Field key={f.key} label={f.label} hint="CloudTrail is read in each region you pick.">
                <div className="flex flex-wrap gap-1.5">
                  {AWS_REGIONS.map((r) => {
                    const on = form.regions.includes(r);
                    return <button key={r} type="button" aria-pressed={on} onClick={() => setForm({ ...form, regions: on ? form.regions.filter((x) => x !== r) : [...form.regions, r] })} className={cn('rounded-full border px-2.5 py-1 font-mono text-[11.5px]', on ? 'border-brand bg-info-soft text-brand' : 'border-line text-ink-2 hover:border-line-strong')}>{r}</button>;
                  })}
                </div>
              </Field>
            );
            return (
              <Field key={f.key} label={f.label} htmlFor={id} required={f.required} error={errors[f.key]}>
                <Input id={id} value={form[f.key] || ''} invalid={Boolean(errors[f.key])} placeholder={f.placeholder} onChange={(e) => { setForm({ ...form, [f.key]: e.target.value }); setErrors({ ...errors, [f.key]: undefined }); }} />
              </Field>
            );
          })}
          <button type="submit" hidden />
        </form>
      )}
      {step === 2 && (
        <ul className="space-y-2.5">
          {spec.checks.map((c, k) => {
            const state = k < checked ? 'ok' : k === checked ? 'run' : 'wait';
            return (
              <li key={c} className="flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5">
                <span className={cn('grid size-6 place-items-center rounded-full', state === 'ok' ? 'bg-low text-white' : state === 'run' ? 'bg-info-soft text-info' : 'bg-surface-3 text-ink-3')}>
                  {state === 'ok' ? <Check aria-hidden="true" className="size-3.5" /> : state === 'run' ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
                </span>
                <span className={cn('text-[13px]', state === 'wait' ? 'text-ink-3' : 'text-ink')}>{c}</span>
              </li>
            );
          })}
          {allPassed && <p className="animate-fade pt-1 text-[12.5px] font-medium text-low">All checks passed. Connect to start collecting.</p>}
        </ul>
      )}
    </Modal>
  );
}


