import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, Clock3, Hourglass, Loader2, MailCheck, RotateCw, XCircle } from 'lucide-react';
import { formatDateTime, formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { AWS_CHECKS } from './awsSetup';
import { CodeBlock, CopyChip, Disclosure } from './parts';

const STATE = {
  pass: { icon: CheckCircle2, color: 'text-low', dot: 'bg-low', word: 'Passed' },
  fail: { icon: XCircle, color: 'text-critical', dot: 'bg-critical', word: 'Failed' },
  error: { icon: AlertTriangle, color: 'text-medium', dot: 'bg-medium', word: 'Not run' },
  skipped: { icon: CircleDashed, color: 'text-ink-3', dot: 'bg-surface-3', word: 'Waiting' },
  running: { icon: Loader2, color: 'text-brand', dot: 'bg-brand', word: 'Checking' },
  warn: { icon: AlertTriangle, color: 'text-medium', dot: 'bg-medium', word: 'Partly' },
};

const stateOf = (check) => (check && Object.hasOwn(STATE, check.state) ? check.state : 'skipped');

/** One dot per check, for a dense row. Hovering names each result. */
export function CheckDots({ checks, definitions = AWS_CHECKS }) {
  const byKey = new Map((checks ?? []).map((check) => [check.key, check]));
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={definitions.map((meta) => `${meta.label}: ${STATE[stateOf(byKey.get(meta.key))].word}`).join(', ')}
    >
      {definitions.map((meta) => {
        const state = stateOf(byKey.get(meta.key));
        return <span key={meta.key} title={`${meta.label}: ${STATE[state].word}`} className={cn('h-1.5 w-4 rounded-full', STATE[state].dot)} />;
      })}
    </span>
  );
}

/** Compact list: label and state, plus the API's fix when a check failed. */
export function CheckList({ checks, definitions = AWS_CHECKS }) {
  const byKey = new Map((checks ?? []).map((check) => [check.key, check]));
  return (
    <ul className="flex flex-col">
      {definitions.map((meta) => {
        const check = byKey.get(meta.key);
        const state = stateOf(check);
        const { icon: Icon, color, word } = STATE[state];
        return (
          <li key={meta.key} className="flex items-start gap-2.5 border-b border-line py-1.5 last:border-b-0">
            <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', color)} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-ink">{check?.label || meta.label}</p>
              {check?.message && state !== 'pass' && <p className="mt-0.5 text-[12px] text-ink-3">{check.message}</p>}
              {state === 'fail' && check?.fix && (
                <p className="mt-0.5 text-[12px] text-ink-2">
                  <span className="font-semibold text-critical">Fix:</span> {check.fix}
                </p>
              )}
            </div>
            <span className={cn('shrink-0 text-[12px] font-medium', color)}>{word}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(id);
  }, []);
  return <span data-numeric="">{seconds}s</span>;
}

/**
 * The outcome of a check run, as a card.
 *
 * While the request runs, every check shows what it is about to prove and an
 * elapsed timer counts - the API answers for all of them at once, so nothing
 * pretends to know which one it is on. A failed check opens with the exact
 * place to fix it (`renderFix`), the values filled in.
 *
 *   definitions   [{ key, label, proves, step? }] in the order the API runs them
 *   ok            whether the run as a whole succeeded
 *   copy          { running, ok, okDetail } headline strings
 */
export function CheckResult({ running, checks, verifiedAt, ok, definitions, copy, renderFix, onShowStep }) {
  if (!running && !checks) return null;
  const byKey = new Map((checks ?? []).map((check) => [check.key, check]));
  const passed = (checks ?? []).filter((check) => check.state === 'pass').length;
  /* A check still running (the events watch) keeps the card in progress. */
  const watching = !running && (checks ?? []).some((check) => check.state === 'running');
  const success = !running && !watching && ok;
  const tone = running || watching ? 'running' : success ? 'success' : 'attention';
  const failing = definitions.length - passed;

  return (
    <div
      aria-live="polite"
      aria-busy={running || undefined}
      className={cn(
        'animate-rise overflow-hidden rounded-[var(--radius-panel)] border',
        tone === 'success' ? 'border-low/40' : tone === 'attention' ? 'border-medium/40' : 'border-line',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3',
          tone === 'success' ? 'bg-low-soft' : tone === 'attention' ? 'bg-medium-soft' : 'bg-surface-2',
        )}
      >
        {running || watching ? (
          <Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin text-brand" />
        ) : success ? (
          <CheckCircle2 aria-hidden="true" className="animate-pop size-5 shrink-0 text-low" />
        ) : (
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-medium" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">
            {running
              ? copy.running
              : watching
                ? copy.watching || `${passed} of ${definitions.length} checks passed - one still running`
                : success
                  ? copy.ok
                  : `${passed} of ${definitions.length} checks passed`}
          </p>
          <p className="text-[12px] text-ink-2">
            {running ? (
              <>
                Usually under 10 seconds · <Elapsed />
              </>
            ) : watching ? (
              copy.watchingDetail || 'This page updates on its own.'
            ) : success ? (
              copy.okDetail
            ) : (
              <>
                Fix the {failing === 1 ? 'item' : 'items'} below, then check again
                {verifiedAt ? ` · checked ${formatRelative(verifiedAt)}` : ''}.
              </>
            )}
          </p>
        </div>
      </div>

      <ol className="divide-y divide-line bg-surface">
        {definitions.map((meta) => {
          const check = byKey.get(meta.key);
          const state = running ? 'running' : stateOf(check);
          const { icon: Icon, color, word } = STATE[state];
          return (
            <li key={`${meta.key}-${running ? 'r' : 'd'}`} className="animate-fade px-4 py-3">
              <div className="flex items-start gap-3">
                <Icon aria-hidden="true" className={cn('mt-0.5 size-[18px] shrink-0', color, state === 'running' && 'animate-spin')} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{check?.label || meta.label}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{running || !check?.message ? meta.proves : check.message}</p>
                </div>
                <span className={cn('shrink-0 text-[12px] font-semibold', color)}>{word}</span>
              </div>
              {state === 'fail' && (check?.fix || renderFix) && (
                <div className="mt-2.5 ml-[30px] rounded-[var(--radius-control)] border border-critical/20 bg-critical-soft/50 px-3 py-2.5">
                  {check?.fix && <p className="text-[12.5px] font-semibold text-ink">{check.fix}</p>}
                  {renderFix && <div className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{renderFix(meta.key, check)}</div>}
                  {onShowStep && meta.step && (
                    <button
                      type="button"
                      onClick={() => onShowStep(meta.step)}
                      className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand hover:underline"
                    >
                      Open step {meta.step}
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The AWS connection checks' result, with the console steps that fix each failure. */
export function VerifyResult({ running, result, setup, onShowStep }) {
  return (
    <CheckResult
      running={running}
      checks={result?.checks}
      verifiedAt={result?.verifiedAt}
      ok={result?.status === 'connected' || result?.status === 'pending_approval'}
      definitions={AWS_CHECKS}
      copy={{
        running: 'Checking your role…',
        watching: 'Role works - now watching for your events',
        watchingDetail: 'The role checks passed. Events from each region are counted below as they arrive.',
        ok: 'Connection verified',
        okDetail: 'Read access works and your events are arriving.',
      }}
      renderFix={setup ? (key) => connectionFix(key, setup) : undefined}
      onShowStep={onShowStep}
    />
  );
}

function connectionFix(key, setup) {
  switch (key) {
    case 'assume_role':
      return (
        <>
          In IAM, open <b className="font-semibold text-ink">{setup.roleName}</b> → Trust relationships. It must trust{' '}
          <CopyChip value={setup.accountId} label="our account ID" /> and require External ID{' '}
          <CopyChip value={setup.externalId} label="External ID" />. Also check you pasted the role&rsquo;s ARN.
        </>
      );
    case 'read_access':
      return (
        <>
          Open the role → Permissions → Add permissions, and attach{' '}
          {setup.managedPolicies.map((policy, index) => (
            <span key={policy}>
              {index > 0 && ' and '}
              <CopyChip value={policy} />
            </span>
          ))}
          .
        </>
      );
    case 'events':
      return (
        <>
          In each region named above, open EventBridge rule <CopyChip value={setup.ruleName} label="rule name" /> on the default bus. Its
          target must be <CopyChip value={setup.eventBusArn} label="event bus ARN" /> with execution role{' '}
          <CopyChip value={setup.forwardRoleName} label="role name" />, and that role needs the PutEvents policy. Remember us-east-1 for IAM
          events. Quiet region? Send a test event (below), then verify again.
        </>
      );
    default:
      return null;
  }
}

/* ── The events watch ───────────────────────────────────────────────────── */

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function clock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Commands that cause one forwarded event in each region still waiting: a free SSM parameter written and removed, and an IAM tag for us-east-1. */
export function testEventCli(setup, regions) {
  return [
    `for REGION in ${regions.join(' ')}; do`,
    '  aws ssm put-parameter --region "$REGION" --name /adapid/connection-check \\',
    '    --type String --value "$(date +%s)" --overwrite >/dev/null',
    '  aws ssm delete-parameter --region "$REGION" --name /adapid/connection-check',
    'done',
    '# IAM is global: its events arrive through us-east-1.',
    `aws iam tag-role --role-name ${setup.forwardRoleName} --tags Key=adapid-check,Value=$(date +%s)`,
    `aws iam untag-role --role-name ${setup.forwardRoleName} --tag-keys adapid-check`,
  ].join('\n');
}

/**
 * The events check while it runs: one row per region we expect events from,
 * ticked as the first one arrives, with the time left before the check gives
 * up. us-east-1 is listed even when not chosen - IAM and STS report there.
 */
export function EventsWatch({ checks, setup }) {
  const now = useNow();
  const check = (checks ?? []).find((c) => c.key === 'events');
  if (!check) return null;
  const list = check.regions ?? [];
  const seen = list.filter((r) => r.seen).length;
  const deadline = check.deadline ? Date.parse(check.deadline) : NaN;
  const started = check.startedAt ? Date.parse(check.startedAt) : NaN;
  const left = Number.isFinite(deadline) ? deadline - now : NaN;
  const span = Number.isFinite(deadline) && Number.isFinite(started) ? deadline - started : NaN;
  const pct = Number.isFinite(span) && span > 0 ? Math.min(100, Math.max(0, ((now - started) / span) * 100)) : 0;
  const waiting = list.filter((r) => !r.seen).map((r) => r.region);
  return (
    <section aria-label="Events from your regions" className="rounded-[var(--radius-panel)] border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-[13px] font-semibold text-ink" aria-live="polite">
            Events from {seen} of {list.length} region{list.length === 1 ? '' : 's'}
          </p>
          <p className="text-[12px] text-ink-3">
            {check.scanned > 0 ? `${check.scanned} message${check.scanned === 1 ? '' : 's'} read so far` : 'Waiting for the first message'}
            {' · checked every few seconds'}
          </p>
        </div>
        {Number.isFinite(left) && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink-2" data-numeric="">
            <Hourglass aria-hidden="true" className="size-3.5" />
            {left > 0 ? `${clock(left)} left` : 'Finishing…'}
          </span>
        )}
      </div>
      {Number.isFinite(span) && (
        <div className="h-1 bg-surface-3" aria-hidden="true">
          <div className="h-1 bg-brand transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ul className="divide-y divide-line">
        {list.map((r) => (
          <li key={r.region} className="flex items-center gap-3 px-4 py-2.5">
            {r.seen ? (
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-low" />
            ) : (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-ink-3" />
            )}
            <span className="min-w-0 flex-1">
              <span className="font-mono text-[12.5px] text-ink">{r.region}</span>
              {r.global && <span className="ml-2 text-[11.5px] text-ink-3">IAM and STS (global) events</span>}
            </span>
            <span className={cn('shrink-0 text-[12px]', r.seen ? 'font-medium text-low' : 'text-ink-3')}>
              {r.seen ? `${r.events} event${r.events === 1 ? '' : 's'}${r.firstSeenAt ? ` · first ${formatRelative(r.firstSeenAt)}` : ''}` : 'Waiting'}
            </span>
          </li>
        ))}
      </ul>
      {waiting.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="text-[12px] leading-relaxed text-ink-3">
            Busy accounts send events within a minute or two. A quiet region may send none while we wait - cause one yourself:
          </p>
          <Disclosure label={`Send a test event to ${waiting.length === 1 ? waiting[0] : `the ${waiting.length} waiting regions`}`}>
            <CodeBlock code={testEventCli(setup, waiting)} copyLabel="Copy commands" />
            <p className="mt-1.5 text-[11.5px] text-ink-3">Creates and deletes a free SSM parameter, and tags then untags the forwarding role. Nothing is left behind.</p>
          </Disclosure>
        </div>
      )}
    </section>
  );
}

/* ── After the checks: approval ─────────────────────────────────────────── */

/**
 * Every check passed. A first connection is reviewed by adapID before
 * scanning starts; this card says so, follows the decision, and explains a
 * rejection. `run` is { phase: awaiting | rejected | connected, approval }.
 */
export function ApprovalWait({ run, checkingNow, onCheckNow, onRetry }) {
  const approval = run.approval ?? {};
  if (run.phase === 'rejected') {
    return (
      <div role="status" className="animate-rise overflow-hidden rounded-[var(--radius-panel)] border border-critical/30">
        <div className="flex items-start gap-3 bg-critical-soft px-4 py-3">
          <XCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-critical" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-ink">This connection was not approved</p>
            <p className="text-[12px] text-ink-2">
              {approval.decidedAt ? `Reviewed ${formatRelative(approval.decidedAt)}` : 'Reviewed by adapID'}. Nothing from this account is scanned.
            </p>
          </div>
        </div>
        <div className="bg-surface px-4 py-3">
          {approval.note ? (
            <blockquote className="border-l-2 border-critical/40 pl-3 text-[13px] text-ink">{approval.note}</blockquote>
          ) : (
            <p className="text-[12.5px] text-ink-3">No reason was given. Contact support if it is not clear what to change.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" icon={RotateCw} onClick={onRetry}>
              Fix the setup and verify again
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">Verifying again sends a new request for approval.</p>
        </div>
      </div>
    );
  }
  if (run.phase === 'connected') {
    return (
      <div role="status" className="animate-rise flex items-start gap-3 rounded-[var(--radius-panel)] border border-low/40 bg-low-soft px-4 py-3">
        <CheckCircle2 aria-hidden="true" className="animate-pop mt-0.5 size-5 shrink-0 text-low" />
        <div>
          <p className="text-[13.5px] font-semibold text-ink">Connected</p>
          <p className="text-[12px] text-ink-2">Every check passed and the connection is approved. The first scan is on its way.</p>
        </div>
      </div>
    );
  }
  const steps = [
    { label: 'Checks passed', detail: 'Role, read access and events from every region', state: 'done' },
    {
      label: 'Review by adapID',
      detail: approval.requestedAt ? `Requested ${formatRelative(approval.requestedAt)}${approval.requestedBy ? ` by ${approval.requestedBy}` : ''}` : 'Requested just now',
      state: 'current',
    },
    { label: 'Scanning starts', detail: 'Identities and activity appear within minutes of approval', state: 'todo' },
  ];
  return (
    <div role="status" aria-live="polite" className="animate-rise overflow-hidden rounded-[var(--radius-panel)] border border-info/30">
      <div className="flex items-start gap-3 bg-info-soft px-4 py-3">
        <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink">All checks passed - waiting for approval</p>
          <p className="text-[12px] leading-relaxed text-ink-2">
            adapID reviews every new connection before scanning starts. Our team has been notified; you do not need to do anything else. You can leave
            this page - the request is kept, and this page opens your dashboard once it is approved.
          </p>
        </div>
      </div>
      <ol className="flex flex-col gap-0 bg-surface px-4 py-3">
        {steps.map((step, index) => (
          <li key={step.label} className="relative flex gap-3 pb-3 last:pb-0">
            {index < steps.length - 1 && <span aria-hidden="true" className={cn('absolute top-6 bottom-0 left-[9px] w-0.5', step.state === 'done' ? 'bg-low/50' : 'bg-line')} />}
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 mt-0.5 grid size-5 shrink-0 place-items-center rounded-full',
                step.state === 'done' ? 'bg-low text-white' : step.state === 'current' ? 'bg-info text-white' : 'border border-line-strong bg-surface',
              )}
            >
              {step.state === 'done' ? <CheckCircle2 className="size-3.5" /> : step.state === 'current' ? <MailCheck className="size-3" /> : null}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-[13px] font-medium', step.state === 'todo' ? 'text-ink-3' : 'text-ink')}>
                {step.label}
                <span className="sr-only">{step.state === 'done' ? ' (done)' : step.state === 'current' ? ' (in progress)' : ' (next)'}</span>
              </span>
              <span className="block text-[12px] text-ink-3" title={step.state === 'current' && approval.requestedAt ? formatDateTime(approval.requestedAt) : undefined}>
                {step.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-2.5">
        <span className="text-[12px] text-ink-3">Checked automatically every 20 seconds.</span>
        <Button variant="secondary" size="sm" icon={RotateCw} loading={checkingNow} onClick={onCheckNow}>
          Check now
        </Button>
      </div>
    </div>
  );
}
