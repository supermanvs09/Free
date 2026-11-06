import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  EyeOff,
  FileText,
  Info,
  Link2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { downloadText } from '../../lib/csv';
import { fetchAwsIntegration, verifyAwsConnection } from '../../lib/api/integrations';
import { Button } from '../../ui/Button';
import { CopyButton } from '../../ui/Copyable';
import { Field, Input } from '../../ui/Field';
import { InlineError } from '../../ui/States';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import {
  AWS_CONSOLE,
  FORWARD_POLICY_NAME,
  MANUAL_STEPS,
  SETUP_STEPS,
  accountOfRoleArn,
  codeCommitReadPolicyJson,
  eventPatternJson,
  exampleRoleArn,
  forwardRoleCli,
  forwardRolePolicyJson,
  forwardRoleTrustJson,
  isWatching,
  roleArnProblem,
  ruleCli,
  ruleRegions,
  setupGuideMarkdown,
  trailReadPolicyJson,
  trustPolicyJson,
} from './awsSetup';
import { ApprovalWait, EventsWatch, VerifyResult } from './CheckList';
import { RegionPicker } from './RegionPicker';
import { CodeBlock, CopyChip, Disclosure, Instructions, copyText } from './parts';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* How often the page reads the account while the events check watches, and
   while a connection waits for approval. */
const WATCH_POLL_MS = 4000;
const APPROVAL_POLL_MS = 10000;

/* Which steps the admin has marked done, and the options chosen, per
   workspace. A convenience only: the API's checks decide what is connected. */
function readProgress(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (Array.isArray(raw)) return { done: new Set(raw.filter((n) => MANUAL_STEPS.includes(n))), codeScanning: true };
    if (raw && Array.isArray(raw.done)) {
      return { done: new Set(raw.done.filter((n) => MANUAL_STEPS.includes(n))), codeScanning: raw.codeScanning !== false };
    }
  } catch {
    /* unreadable storage: start from the fallback */
  }
  return { done: new Set(fallback), codeScanning: true };
}

function writeProgress(key, progress) {
  try {
    localStorage.setItem(key, JSON.stringify({ done: [...progress.done], codeScanning: progress.codeScanning }));
  } catch {
    /* private window: progress lasts for this page */
  }
}

export function clearSetupProgress(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing kept */
  }
}

/* Where a run stands, from an account as the API returns it. */
function phaseOf(account) {
  if (!account) return 'idle';
  if (isWatching(account.checks)) return 'watching';
  if (account.status === 'pending_approval') return 'awaiting';
  if (account.status === 'rejected') return 'rejected';
  if (account.status === 'connected') return 'connected';
  return account.checks?.length ? 'failed' : 'idle';
}

const runOf = (account) =>
  account
    ? {
        phase: phaseOf(account),
        accountId: account.accountId,
        status: account.status,
        checks: account.checks,
        verifiedAt: account.lastVerifiedAt,
        approval: account.approval,
      }
    : { phase: 'idle' };

/**
 * "Connect an AWS account" as a guided timeline: four steps in the AWS
 * console (CloudTrail, the read-only role, the forwarding role, the rule in
 * each region), then Verify - beside a panel holding everything to copy,
 * what is being granted, and the whole setup as a document for whoever owns
 * the AWS account.
 *
 * Verify runs the role checks at once and then watches for events from each
 * region for up to `setup.eventWaitMinutes`, reporting as they arrive. A first
 * connection that passes everything waits for adapID's approval; the page
 * follows it on its own and opens the console once approved.
 *
 * `previous` is the account last checked and not connected: its ARN, regions
 * and run are restored so a reload does not lose where the admin got to.
 */
export function AwsConnectWizard({ setup, previous, storageKey, title = 'Connect an AWS account', onVerified, onCancel }) {
  const [progress, setProgress] = useState(() => readProgress(storageKey, previous ? MANUAL_STEPS : []));
  const { done, codeScanning } = progress;
  const [openStep, setOpenStep] = useState(() => (previous ? null : (MANUAL_STEPS.find((n) => !progress.done.has(n)) ?? null)));
  const [roleArn, setRoleArn] = useState(previous?.roleArn ?? '');
  /* With a single region on offer there is nothing to choose. */
  const [regions, setRegions] = useState(() => previous?.regions ?? (setup.regions.length === 1 ? [setup.regions[0].code] : []));
  const [regionsError, setRegionsError] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverProblem, setServerProblem] = useState('');
  const [requestError, setRequestError] = useState(null);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(() => runOf(previous));
  const stepRefs = useRef({});
  const inputRef = useRef(null);
  const regionsRef = useRef(null);
  const verifyRegionsRef = useRef(null);
  const resultRef = useRef(null);

  const save = (next) => {
    setProgress(next);
    writeProgress(storageKey, next);
  };

  const scrollTo = (node, block = 'start') => node?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block });
  const scrollToStep = (number) => scrollTo(stepRefs.current[number]);

  const showStep = (number) => {
    setOpenStep(number === 5 ? null : number);
    scrollToStep(number);
  };

  const setStepDone = (number, value) => {
    const next = new Set(done);
    if (value) next.add(number);
    else next.delete(number);
    save({ ...progress, done: next });
    if (value) {
      const following = MANUAL_STEPS.find((n) => n > number && !next.has(n)) ?? MANUAL_STEPS.find((n) => !next.has(n));
      setOpenStep(following ?? null);
      scrollToStep(following ?? 5);
      if (!following) inputRef.current?.focus({ preventScroll: true });
    }
  };

  /* ── Following a run: the events watch, then the approval ─────────────── */

  const onVerifiedRef = useRef(onVerified);
  useEffect(() => {
    onVerifiedRef.current = onVerified;
  });
  const reported = useRef('');
  const report = useCallback((next) => {
    const key = `${next.accountId}:${next.phase}`;
    if (reported.current === key) return;
    reported.current = key;
    onVerifiedRef.current?.({ status: next.status, accountId: next.accountId, saved: true, phase: next.phase });
  }, []);

  const [checkingNow, setCheckingNow] = useState(false);
  const readAccount = useCallback(
    async (accountId) => {
      const data = await fetchAwsIntegration();
      const account = data.accounts.find((entry) => entry.accountId === accountId);
      if (!account) return null;
      const next = runOf(account);
      setRun(next);
      if (next.phase !== 'watching') report(next);
      return next;
    },
    [report],
  );

  const following = run.phase === 'watching' || run.phase === 'awaiting';
  useEffect(() => {
    if (!following || !run.accountId) return undefined;
    let stopped = false;
    let timer = null;
    const delay = run.phase === 'watching' ? WATCH_POLL_MS : APPROVAL_POLL_MS;
    const tick = async () => {
      try {
        /* A hidden tab reads less often; it catches up when shown. */
        if (document.visibilityState !== 'hidden' || run.phase === 'watching') await readAccount(run.accountId);
      } catch {
        /* a failed read is retried on the next tick */
      }
      if (!stopped) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    const onVisible = () => {
      if (document.visibilityState === 'visible') readAccount(run.accountId).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [following, run.phase, run.accountId, readAccount]);

  const checkNow = async () => {
    setCheckingNow(true);
    try {
      await readAccount(run.accountId);
    } catch (error) {
      setRequestError(error);
    } finally {
      setCheckingNow(false);
    }
  };

  /* ── Verify ───────────────────────────────────────────────────────────── */

  const localProblem = roleArnProblem(roleArn, setup.accountId);
  const fieldError = serverProblem || (touched ? localProblem : '');
  const detectedAccount = !localProblem ? accountOfRoleArn(roleArn) : '';
  const verified = run.phase === 'connected' || run.phase === 'awaiting';
  const completed = done.size + (verified ? 1 : 0);
  const minutesLeft = SETUP_STEPS.filter((step) => (step.number === 5 ? !verified : !done.has(step.number))).reduce(
    (sum, step) => sum + step.minutes,
    0,
  );

  const verify = async (event) => {
    event?.preventDefault();
    setTouched(true);
    if (localProblem) {
      inputRef.current?.focus();
      return;
    }
    if (regions.length === 0) {
      setRegionsError('Choose the regions you use.');
      scrollTo(verifyRegionsRef.current, 'center');
      return;
    }
    setRunning(true);
    setServerProblem('');
    setRegionsError('');
    setRequestError(null);
    reported.current = '';
    try {
      const outcome = await verifyAwsConnection({ roleArn: roleArn.trim(), regions });
      const next = {
        phase: outcome.watching ? 'watching' : phaseOf({ status: outcome.status, checks: outcome.checks }),
        accountId: outcome.accountId,
        status: outcome.status,
        checks: outcome.checks,
        verifiedAt: outcome.verifiedAt,
        approval: null,
      };
      setRun(next);
      onVerifiedRef.current?.({ ...outcome, phase: next.phase });
      requestAnimationFrame(() => scrollTo(resultRef.current, 'nearest'));
    } catch (error) {
      /* A 400 is about the input itself, so it belongs under that field. */
      if (error?.status === 400 && error?.code === 'INVALID_REGIONS') setRegionsError(error.message);
      else if (error?.status === 400) setServerProblem(error.message);
      else setRequestError(error);
    } finally {
      setRunning(false);
    }
  };

  const startOver = () => {
    setRun({ phase: 'idle' });
    reported.current = '';
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  };

  const cancel = () => {
    clearSetupProgress(storageKey);
    onCancel?.();
  };

  const firstOpen = MANUAL_STEPS.find((n) => !done.has(n));
  const stateOf = (number) => {
    if (number === 5) return verified ? 'done' : firstOpen ? 'todo' : 'current';
    if (done.has(number)) return 'done';
    return firstOpen === number ? 'current' : 'todo';
  };
  const stepProps = (number, extra) => ({
    step: SETUP_STEPS[number - 1],
    state: stateOf(number),
    open: openStep === number,
    onToggle: () => setOpenStep(openStep === number ? null : number),
    stepRef: (node) => {
      stepRefs.current[number] = node;
    },
    onDone: (value) => setStepDone(number, value),
    ...extra,
  });
  /* While a run is under way or decided, the inputs give way to what was checked. */
  const locked = running || ['watching', 'awaiting', 'connected', 'rejected'].includes(run.phase);
  const ruleList = ruleRegions(regions);

  return (
    <div className="grid items-start gap-5 @min-[56rem]:grid-cols-[minmax(0,1fr)_288px] @min-[80rem]:grid-cols-[minmax(0,1fr)_336px]">
      <section aria-labelledby="aws-setup-title" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h2 id="aws-setup-title" className="text-[17px] font-bold tracking-[-0.012em] text-ink">
              {title}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-ink-3">Four read-only changes in your AWS console, then one check from here.</p>
          </div>
          <div className="flex min-w-[240px] flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="font-medium text-ink-2" data-numeric="">
                {completed} of 5 complete
              </span>
              <span className="text-ink-3">{verified ? 'Done' : `About ${minutesLeft} min left`}</span>
            </div>
            <div className="grid grid-cols-5 gap-1" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className={cn(
                    'h-1.5 rounded-full transition-colors duration-300',
                    stateOf(n) === 'done' ? 'bg-low' : stateOf(n) === 'current' ? 'bg-brand' : 'bg-surface-3',
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <ol className="flex flex-col">
          <TimelineStep
            {...stepProps(1, {
              summary: `A multi-region trail with Read and Write management events`,
              consoleLink: { href: AWS_CONSOLE.cloudTrail, label: 'Open CloudTrail console' },
            })}
          >
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
              CloudTrail records the API activity that EventBridge forwards to us. <b className="font-semibold text-ink">Reuse a trail you already have</b>{' '}
              if it is multi-region and logs both Read and Write management events - an organization trail counts too. The first copy of management
              events per region is free; a second trail logging the same events is charged.
            </p>
            <Disclosure label="No qualifying trail? Create one">
              <Instructions
                items={[
                  <>
                    Go to <b>Trails</b> and choose <b>Create trail</b>. Trail name <CopyChip value={setup.trailName} label="trail name" />
                  </>,
                  <>
                    Storage location: <b>Create new S3 bucket</b> (accept the suggested name). Log file validation: <b>Enabled</b>. SSE-KMS
                    encryption is optional. Choose <b>Next</b>.
                  </>,
                  <>
                    Event type: <b>Management events</b>. API activity: tick both <b>Read</b> and <b>Write</b>.
                  </>,
                  <>
                    Leave data events and Insights off. <b>Next</b>, then <b>Create trail</b>.
                  </>,
                  <>
                    Open the trail and confirm <b>Multi-region trail: Yes</b>.
                  </>,
                ]}
              />
            </Disclosure>
          </TimelineStep>

          <TimelineStep
            {...stepProps(2, {
              summary: `${setup.roleName} · ${setup.managedPolicies.join(' + ')}`,
              consoleLink: { href: AWS_CONSOLE.iamRoles, label: 'Open IAM console' },
            })}
          >
            <Instructions
              items={[
                <>
                  Go to <b>Roles</b>, choose <b>Create role</b>, then <b>Custom trust policy</b>, and paste this trust policy. <b>Next</b>.
                  <CodeBlock code={trustPolicyJson(setup)} copyLabel="Copy trust policy" />
                </>,
                <>
                  Tick{' '}
                  {setup.managedPolicies.map((policy, index) => (
                    <span key={policy}>
                      {index > 0 && ' and '}
                      <CopyChip value={policy} />
                    </span>
                  ))}
                  . <b>Next</b>.
                </>,
                <>
                  Role name <CopyChip value={setup.roleName} label="role name" />, then <b>Create role</b>.
                </>,
                <>
                  Open the role and copy its <b>ARN</b> - you paste it in step 5.
                </>,
              ]}
            />
            <OptionalPolicies codeScanning={codeScanning} />
          </TimelineStep>

          <TimelineStep
            {...stepProps(3, {
              summary: `${setup.forwardRoleName} · ${FORWARD_POLICY_NAME}`,
              consoleLink: { href: AWS_CONSOLE.iamRoles, label: 'Open IAM console' },
            })}
          >
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
              This role lets EventBridge send your events to our bus. Create it once - the rule in every region uses it.
            </p>
            <Instructions
              items={[
                <>
                  <b>Roles</b> → <b>Create role</b> → <b>Custom trust policy</b>, and paste this
                  {detectedAccount ? (
                    <> (filled in for account {detectedAccount})</>
                  ) : (
                    <>
                      , with your account ID in place of <code className="font-mono text-[12px]">&lt;CLIENT_ACCOUNT_ID&gt;</code>
                    </>
                  )}
                  .
                  <CodeBlock code={forwardRoleTrustJson(detectedAccount)} copyLabel="Copy trust policy" />
                </>,
                <>
                  <b>Next</b>, skip attaching policies, <b>Next</b>. Role name <CopyChip value={setup.forwardRoleName} label="role name" />, then{' '}
                  <b>Create role</b>.
                </>,
                <>
                  Open the role → <b>Add permissions</b> → <b>Create inline policy</b> → <b>JSON</b>, paste this and name it{' '}
                  <CopyChip value={FORWARD_POLICY_NAME} label="policy name" />
                  <CodeBlock code={forwardRolePolicyJson(setup)} copyLabel="Copy policy" />
                </>,
              ]}
            />
            <Disclosure label="Prefer the AWS CLI?">
              <CodeBlock code={forwardRoleCli(setup)} copyLabel="Copy commands" />
            </Disclosure>
          </TimelineStep>

          <TimelineStep
            {...stepProps(4, {
              summary: `Rule ${setup.ruleName} in ${ruleList.length} region${ruleList.length === 1 ? '' : 's'} → our event bus`,
              consoleLink: { href: AWS_CONSOLE.eventBridgeRules, label: 'Open EventBridge console' },
            })}
          >
            <div ref={regionsRef} className="mb-3.5 scroll-mt-24">
              <RegionPicker
                label="Regions you use"
                hint="We read these, and you create the rule in each of them."
                catalogue={setup.regions}
                value={regions}
                onChange={(next) => {
                  setRegions(next);
                  setRegionsError('');
                }}
                error={regionsError || undefined}
              />
            </div>
            <p className="mb-3.5 flex items-start gap-2 rounded-[var(--radius-control)] bg-info-soft px-3 py-2 text-[12px] leading-relaxed text-ink-2">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-info" />
              <span>
                Create the rule in{' '}
                <span className="font-mono text-ink">{ruleList.join(', ')}</span>
                {regions.includes('us-east-1') ? '' : ' - us-east-1 too, even if you do not use it: IAM and STS deliver their global events there'}.
              </span>
            </p>
            <Instructions
              items={[
                <>
                  Switch the console to the region, then <b>Rules</b> → <b>Create rule</b>.
                </>,
                <>
                  Name <CopyChip value={setup.ruleName} label="rule name" />, event bus <b>default</b>. <b>Next</b>.
                </>,
                <>
                  Event source <b>AWS events</b>, creation method <b>Custom pattern (JSON editor)</b>, and paste
                  <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--t-brand)]"
                      checked={codeScanning}
                      onChange={(event) => save({ ...progress, codeScanning: event.target.checked })}
                    />
                    I will use code scanning (keeps <span className="font-mono">aws.codecommit</span> in the pattern)
                  </label>
                  <CodeBlock code={eventPatternJson(setup, { codeScanning })} copyLabel="Copy event pattern" />
                </>,
                <>
                  <b>Next</b>. Target type <b>EventBridge event bus</b> → <b>Event bus in a different account or Region</b>, and paste{' '}
                  <CopyChip value={setup.eventBusArn} label="event bus ARN" />
                </>,
                <>
                  Execution role: <b>Use existing role</b> → <CopyChip value={setup.forwardRoleName} label="role name" />. <b>Next</b>, then{' '}
                  <b>Create rule</b>.
                </>,
                <>Repeat in each region above.</>,
              ]}
            />
            <Disclosure label="Prefer the AWS CLI? Every region in one go">
              <CodeBlock code={ruleCli(setup, regions, { codeScanning })} copyLabel="Copy commands" />
            </Disclosure>
          </TimelineStep>

          <TimelineStep step={SETUP_STEPS[4]} state={stateOf(5)} open last stepRef={(node) => {
              stepRefs.current[5] = node;
            }}>
            {locked ? (
              <div className="flex flex-col gap-3">
                <dl className="grid gap-x-6 gap-y-2 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3.5 py-3 text-[12.5px] @min-[40rem]:grid-cols-[auto_1fr]">
                  <dt className="text-ink-3">Role</dt>
                  <dd className="min-w-0 font-mono break-all text-ink">{roleArn.trim()}</dd>
                  <dt className="text-ink-3">Regions</dt>
                  <dd className="font-mono text-ink">
                    {regions.join(', ')}
                    <span className="ml-2 font-sans text-ink-3">+ us-east-1 for IAM and STS</span>
                  </dd>
                </dl>
                {onCancel && run.phase !== 'watching' && !running && (
                  <div>
                    <Button variant="ghost" size="sm" onClick={cancel}>
                      Close
                    </Button>
                  </div>
                )}
              </div>
            ) : (
            <form onSubmit={verify} noValidate className="flex flex-col gap-2">
              <Field label="Role ARN" htmlFor="aws-role-arn" error={fieldError || undefined}>
                <Input
                  ref={inputRef}
                  id="aws-role-arn"
                  name="role_arn"
                  size="lg"
                  icon={Link2}
                  autoComplete="off"
                  spellCheck={false}
                  value={roleArn}
                  placeholder={exampleRoleArn(setup)}
                  onChange={(event) => {
                    setRoleArn(event.target.value);
                    setServerProblem('');
                  }}
                  onBlur={() => roleArn.trim() && setTouched(true)}
                  invalid={Boolean(fieldError)}
                  className="font-mono text-[13px]"
                />
              </Field>
              <div className="flex min-h-7 flex-wrap items-center gap-2 text-[12px]">
                {detectedAccount ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-low-soft px-2.5 py-1 font-medium text-low">
                    <CheckCircle2 aria-hidden="true" className="size-3.5" />
                    AWS account <span className="font-mono">{detectedAccount}</span>
                  </span>
                ) : (
                  !fieldError && <span className="text-ink-3">The ARN of {setup.roleName}, from step 2.</span>
                )}
              </div>
              <div ref={verifyRegionsRef} className="mb-2 scroll-mt-24">
                <RegionPicker
                  label="Regions you use"
                  hint="The same regions as the rule in step 4."
                  catalogue={setup.regions}
                  value={regions}
                  onChange={(next) => {
                    setRegions(next);
                    setRegionsError('');
                  }}
                  error={regionsError || undefined}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant="primary" size="lg" icon={ShieldCheck} loading={running}>
                  {running ? 'Checking…' : run.phase === 'idle' ? 'Verify connection' : 'Verify again'}
                </Button>
                {onCancel && (
                  <Button variant="ghost" size="lg" onClick={cancel} disabled={running}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
            )}

            {requestError && (
              <div className="mt-3">
                <InlineError error={requestError} label="Could not verify" />
              </div>
            )}

            <div ref={resultRef} className="scroll-mt-24">
              {(running || run.phase === 'failed' || run.phase === 'watching') && (
                <div className="mt-4 flex flex-col gap-3">
                  <VerifyResult running={running} result={running ? null : run} setup={setup} onShowStep={showStep} />
                  {!running && run.phase === 'watching' && <EventsWatch checks={run.checks} setup={setup} regions={regions} />}
                </div>
              )}
              {(run.phase === 'awaiting' || run.phase === 'rejected' || run.phase === 'connected') && (
                <div className="mt-4">
                  <ApprovalWait
                    run={run}
                    checkingNow={checkingNow}
                    onCheckNow={checkNow}
                    onRetry={() => {
                      startOver();
                      showStep(firstOpen ?? 2);
                    }}
                  />
                </div>
              )}
            </div>
          </TimelineStep>
        </ol>
      </section>

      <SetupAside setup={setup} regions={regions} codeScanning={codeScanning} />
    </div>
  );
}

/* The two optional inline policies of the read-only role, filled in as the admin types. */
function OptionalPolicies({ codeScanning }) {
  const [bucket, setBucket] = useState('');
  const [encrypted, setEncrypted] = useState(false);
  const [kmsKeyArn, setKmsKeyArn] = useState('');
  const [customerKey, setCustomerKey] = useState(false);
  const bucketRegion = /^arn:aws:kms:([a-z0-9-]+):/.exec(kmsKeyArn.trim())?.[1] ?? '';
  return (
    <div className="mt-4 border-t border-line pt-3.5">
      <p className="mb-2 text-[12.5px] font-semibold text-ink">Optional inline policies</p>
      <p className="mb-2 text-[12px] leading-relaxed text-ink-3">
        On the role: <b className="font-medium text-ink-2">Add permissions</b> → <b className="font-medium text-ink-2">Create inline policy</b> →{' '}
        <b className="font-medium text-ink-2">JSON</b>, paste, and use the name shown. Repeat for each one you need.
      </p>
      <div className="flex flex-col gap-1">
        <Disclosure label="NHIPlatformTrailRead - read CloudTrail log history from S3">
          <div className="grid gap-2 @min-[40rem]:grid-cols-2">
            <Field label="Trail bucket name" htmlFor="trail-bucket">
              <Input id="trail-bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} placeholder="aws-cloudtrail-logs-123456789012-…" spellCheck={false} />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
                <input type="checkbox" className="size-4 accent-[var(--t-brand)]" checked={encrypted} onChange={(e) => setEncrypted(e.target.checked)} />
                The trail is encrypted with SSE-KMS
              </label>
            </div>
            {encrypted && (
              <Field label="Trail KMS key ARN" htmlFor="trail-kms" className="@min-[40rem]:col-span-2">
                <Input id="trail-kms" value={kmsKeyArn} onChange={(e) => setKmsKeyArn(e.target.value)} placeholder="arn:aws:kms:<region>:<account>:key/<id>" spellCheck={false} />
              </Field>
            )}
          </div>
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            Policy name <CopyChip value="NHIPlatformTrailRead" label="policy name" />
          </div>
          <CodeBlock code={trailReadPolicyJson({ bucket, encrypted, kmsKeyArn, region: bucketRegion })} copyLabel="Copy policy" />
        </Disclosure>
        <Disclosure label="NHIPlatformCodeCommitRead - scan CodeCommit repositories for secrets" defaultOpen={false}>
          {!codeScanning && <p className="mb-2 text-[12px] text-medium">You chose not to use code scanning in step 4; skip this one.</p>}
          <label className="mb-1 flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
            <input type="checkbox" className="size-4 accent-[var(--t-brand)]" checked={customerKey} onChange={(e) => setCustomerKey(e.target.checked)} />
            Repositories use a customer managed KMS key
          </label>
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            Policy name <CopyChip value="NHIPlatformCodeCommitRead" label="policy name" />
          </div>
          <CodeBlock code={codeCommitReadPolicyJson({ customerKey })} copyLabel="Copy policy" />
        </Disclosure>
      </div>
      <p className="mt-1 text-[11.5px] text-ink-3">Skip both if you do not need log history or code scanning - you can add them later.</p>
    </div>
  );
}

const STATE_TAG = {
  done: { tone: 'low', label: 'Done' },
  current: { tone: 'brand', label: 'Next' },
  todo: { tone: 'neutral', label: 'To do' },
};

/** One step on the timeline: a node on the rail, and a card that opens. */
function TimelineStep({ step, state, open, onToggle, last = false, stepRef, summary, consoleLink, onDone, children }) {
  const panelId = useId();
  const collapsible = Boolean(onToggle);
  const tag = STATE_TAG[state];

  const header = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[14px] font-semibold text-ink">{step.title}</span>
          <Tag tone={tag.tone} size="sm">
            {tag.label}
          </Tag>
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-ink-3">
          {open || !summary ? `${step.where} · about ${step.minutes} min` : summary}
        </span>
      </span>
      {collapsible && (
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 shrink-0 text-ink-3 transition-transform duration-200', open ? 'rotate-180' : 'rotate-0')}
        />
      )}
    </>
  );

  return (
    <li ref={stepRef} className={cn('relative scroll-mt-32 pl-11', !last && 'pb-4')}>
      {/* The rail turns green below a finished step, so progress reads down the page. */}
      {!last && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-11 bottom-0 left-[15px] w-0.5 rounded-full transition-colors duration-300',
            state === 'done' ? 'bg-low/60' : 'bg-line',
          )}
        />
      )}
      <span
        aria-hidden="true"
        data-numeric=""
        className={cn(
          'absolute top-3 left-0 grid size-8 place-items-center rounded-full text-[13px] font-semibold transition-colors duration-300',
          state === 'done'
            ? 'bg-low text-white'
            : state === 'current'
              ? 'bg-surface text-brand shadow-[0_0_0_2px_var(--t-brand),0_0_0_6px_color-mix(in_srgb,var(--t-brand)_14%,transparent)]'
              : 'border border-line-strong bg-surface text-ink-3',
        )}
      >
        {state === 'done' ? <Check className="size-4" strokeWidth={3} /> : step.number}
      </span>

      <div
        className={cn(
          'rounded-[var(--radius-panel)] border bg-surface transition-[border-color,box-shadow] duration-200',
          open ? 'border-line-strong shadow-[var(--t-shadow-md)]' : 'border-line shadow-[var(--t-shadow-sm)] hover:border-line-strong',
        )}
      >
        <h3>
          {collapsible ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={panelId}
              className="flex w-full items-center gap-3 rounded-[var(--radius-panel)] px-4 py-3.5 text-left"
            >
              {header}
            </button>
          ) : (
            <span className="flex w-full items-center gap-3 px-4 pt-3.5">{header}</span>
          )}
        </h3>

        {open && (
          <div id={panelId} className="animate-fade">
            <div className={cn('px-4 pb-4', collapsible ? 'border-t border-line pt-3.5' : 'pt-3')}>
              {consoleLink && (
                <Button
                  as="a"
                  href={consoleLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="secondary"
                  size="sm"
                  iconRight={ExternalLink}
                  className="mb-3.5"
                >
                  {consoleLink.label}
                  <span className="sr-only">(opens in a new tab)</span>
                </Button>
              )}
              {children}
              {onDone && (
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
                  <span className="text-[12px] text-ink-3">{state === 'done' ? 'Marked as done.' : 'Finished in the console?'}</span>
                  {state === 'done' ? (
                    <Button variant="ghost" size="sm" onClick={() => onDone(false)}>
                      Mark as not done
                    </Button>
                  ) : (
                    <Button variant="primary" size="sm" icon={Check} onClick={() => onDone(true)}>
                      Mark as done
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

/* ── Side panel ──────────────────────────────────────────────────────────── */

/**
 * Everything the admin reaches for while working in the other tab: the
 * values, what is being granted (the questions a security reviewer asks
 * first), and the setup as a document for whoever owns the AWS account.
 */
function SetupAside({ setup, regions, codeScanning }) {
  const { notify } = useToast();
  const guide = () => setupGuideMarkdown(setup, regions, { codeScanning });
  return (
    <aside
      aria-label="Connection details"
      className="flex flex-col gap-4 @min-[56rem]:sticky @min-[56rem]:top-20 @min-[56rem]:max-h-[calc(100dvh-6rem)] @min-[56rem]:overflow-y-auto @min-[56rem]:overscroll-contain @min-[56rem]:pb-1"
    >
      <AsideCard title="Values to copy">
        <dl className="-my-1 divide-y divide-line">
          <ValueRow label="adapID AWS account ID" value={setup.accountId} />
          <ValueRow label="Your External ID" value={setup.externalId} note="Unique to your workspace" />
          <ValueRow label="adapID event bus ARN" value={setup.eventBusArn} />
          <ValueRow label="adapID AWS Region" value={setup.region} />
        </dl>
      </AsideCard>

      <AsideCard title="What you are granting">
        <ul className="flex flex-col gap-2">
          {setup.managedPolicies.map((policy) => (
            <li key={policy} className="flex items-center justify-between gap-2">
              <span className="font-mono text-[12.5px] text-ink">{policy}</span>
              <span className="text-[11px] text-ink-3">AWS managed · read-only</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-2">
            <span className="font-mono text-[12.5px] text-ink">{FORWARD_POLICY_NAME}</span>
            <span className="text-[11px] text-ink-3">events:PutEvents to our bus</span>
          </li>
        </ul>
        <div className="mt-3 border-t border-line pt-3">
          <p className="text-[12px] text-ink-2">
            Events from <span className="font-semibold text-ink">{setup.eventSources.filter((s) => codeScanning || s !== 'aws.codecommit').length} services</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {setup.eventSources
              .filter((source) => codeScanning || source !== 'aws.codecommit')
              .map((source) => (
                <span key={source} className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
                  {source.replace(/^aws\./, '')}
                </span>
              ))}
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
          <EyeOff aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          No write access, no secret values, no object contents. Revoke any time by deleting the two roles.
        </p>
      </AsideCard>

      <AsideCard title="Not the AWS admin?" icon={Users}>
        <p className="text-[12px] leading-relaxed text-ink-3">
          Send the setup, with your values filled in, to whoever manages the account.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={FileText}
            onClick={async () => {
              const ok = await copyText(guide());
              notify(
                ok
                  ? { variant: 'success', title: 'Setup guide copied', description: 'Paste it into an email, chat or ticket.' }
                  : { variant: 'error', title: 'Could not copy', description: 'Download it instead.' },
              );
            }}
          >
            Copy guide
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={Download}
            onClick={() => downloadText(guide(), 'aws-connection-setup.md', 'text/markdown')}
          >
            Download
          </Button>
        </div>
      </AsideCard>
    </aside>
  );
}

function AsideCard({ title, icon: Icon, children }) {
  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-[var(--t-shadow-sm)]">
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
        {Icon && <Icon aria-hidden="true" className="size-4 text-ink-3" />}
        {title}
      </h3>
      {children}
    </section>
  );
}

function ValueRow({ label, value, note }) {
  return (
    <div className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <dt className="text-[11.5px] text-ink-3">
          {label}
          {note && <span className="ml-1 text-[11px] text-medium">· {note}</span>}
        </dt>
        <dd className="mt-0.5 font-mono text-[12.5px] break-all text-ink">{value}</dd>
      </div>
      <CopyButton value={value} label={`Copy ${label}`} className="mt-1" />
    </div>
  );
}
