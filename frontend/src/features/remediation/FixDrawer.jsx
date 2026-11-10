import { useState } from 'react';
import { AlertTriangle, ArrowRight, BookOpen, ClipboardCopy, Hand, Info, Link2, Wand2, Zap } from 'lucide-react';
import { useAccess } from '../../app/useAccess';
import { createPlan, fetchActions, fetchFindingFix, fetchFindingPlans, fetchRemediationAccount, oneClickProblem } from '../../lib/api/remediation';
import { useQuery } from '../../lib/hooks';
import { formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Field, Input, Select } from '../../ui/Field';
import { Drawer, Modal } from '../../ui/Overlay';
import { SectionLabel } from '../../ui/Panel';
import { Skeleton } from '../../ui/Skeleton';
import { ErrorState, InlineError } from '../../ui/States';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { copyText } from '../integrations/parts';
import { MODE_LABEL, fixName, riskMeta, statusMeta, ONE_CLICK_ENABLED } from './meta';
import { Steps } from './PlanDrawer';

const TARGET_NEEDED = /target could not be derived|target_arn/i;

/**
 * "Fix this finding": the fix, and the two ways to apply it (§4.1).
 *
 *   Guided     the console shows the steps; a person applies them in AWS and
 *              marks the plan done. The console changes nothing.
 *   One-click  the backend applies the fix in AWS, after an approval when the
 *              fix is risky or the finding Critical.
 *
 * `finding` is { finding_id, title, rule_id?, account_id?, severity?, status? }.
 * A plan made here opens in the plan drawer (`onOpenPlan(id, follow)`).
 */
export function FixDrawer({ finding, onClose, onOpenPlan }) {
  if (!finding) return null;
  return <FixDrawerBody key={finding.finding_id} finding={finding} onClose={onClose} onOpenPlan={onOpenPlan} />;
}

function FixDrawerBody({ finding, onClose, onOpenPlan }) {
  const { can } = useAccess();
  const { notify } = useToast();
  const id = finding.finding_id;
  const fixQuery = useQuery((signal) => fetchFindingFix(id, signal), [id]);
  const plansQuery = useQuery((signal) => fetchFindingPlans(id, signal), [id]);
  const catalog = useQuery((signal) => fetchActions(signal), []);
  const fix = fixQuery.data; // null: this backend has no fix view
  const accountId = fix?.account_id || finding.account_id || finding.row?.account_id || '';
  /* Without the fix view, One-click availability comes from the account's settings. */
  const accountQuery = useQuery((signal) => (fix === null && accountId ? fetchRemediationAccount(accountId, signal) : Promise.resolve(undefined)), [fix === null, accountId]);

  const [actionType, setActionType] = useState('');
  const [creating, setCreating] = useState('');
  const [confirmOneClick, setConfirmOneClick] = useState(false);
  const [targetArn, setTargetArn] = useState('');
  const [needTarget, setNeedTarget] = useState(false);
  const [problem, setProblem] = useState(null);

  const canPlan = can('remediation.plan');
  const oneClick = fix?.modes?.one_click;
  const pending = oneClick?.pending_plan ?? null;
  const fallbackProblem =
    fix !== null ? '' : !accountId ? 'The finding does not say which AWS account it is in.' : accountQuery.data !== undefined ? oneClickProblem(accountQuery.data) : '';
  const oneClickAvailable = fix ? Boolean(oneClick?.available) && Boolean(fix.fix) : fix === null && Boolean(accountId) && accountQuery.data !== undefined && !fallbackProblem;
  const oneClickReason = fix ? (!fix.fix ? 'This rule has no automatic fix.' : oneClick?.reason || '') : fallbackProblem;
  const approvalRequired = fix ? Boolean(oneClick?.approval_required) : null;
  const chosen = actionType || fix?.fix?.action_type || '';
  const plans = plansQuery.data ?? [];

  const create = async (mode) => {
    setCreating(mode);
    setProblem(null);
    try {
      const params = targetArn.trim() ? { target_arn: targetArn.trim() } : undefined;
      const { plan, existing, message } = await createPlan({ findingIds: [id], mode, actionType: actionType || undefined, params });
      setConfirmOneClick(false);
      if (existing) {
        notify({ variant: 'info', title: 'A plan is already under way', description: message || 'Opening the plan that already exists for this finding.' });
      } else if (mode === 'GUIDED') {
        notify({ variant: 'success', title: 'Fix tracked', description: 'Apply the steps in AWS, then mark the plan as done.' });
      } else if (plan.status === 'PENDING_APPROVAL') {
        notify({ variant: 'success', title: 'Waiting for an approver', description: 'The approvers were e-mailed. It runs by itself once approved.' });
      } else if (plan.status === 'SCHEDULED') {
        notify({ variant: 'success', title: 'Fix is running', description: 'No approval was needed. The plan panel follows it.' });
      } else if (plan.status === 'DRAFT') {
        notify({ variant: 'error', title: 'Blocked by a pre-check', description: 'The plan shows what blocks it.' });
      }
      plansQuery.refetch();
      onOpenPlan(plan.id, mode === 'ONE_CLICK');
    } catch (error) {
      if (error?.status === 400 && TARGET_NEEDED.test(error.message || '')) {
        setNeedTarget(true);
        setProblem({ ...error, message: 'The finding does not say which AWS resource to change. Paste its ARN below and try again.' });
      } else {
        setProblem(error);
      }
      setConfirmOneClick(false);
    } finally {
      setCreating('');
    }
  };

  const loading = fixQuery.data === undefined && !fixQuery.isError;
  const title = finding.title || fix?.title || 'Finding';

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      eyebrow="Fix this finding"
      title={title}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          {(fix?.rule_id || finding.rule_id) && (
            <Tag size="sm" tone="neutral">
              {fix?.rule_id || finding.rule_id}
            </Tag>
          )}
          {(fix?.severity || finding.severity) && (
            <Tag size="sm" tone={{ critical: 'critical', high: 'high', medium: 'medium', low: 'low' }[String(fix?.severity || finding.severity).toLowerCase()] ?? 'neutral'}>
              {fix?.severity || finding.severity}
            </Tag>
          )}
          {accountId && <span className="font-mono">{accountId}</span>}
        </span>
      }
    >
      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5">
        {fixQuery.isError ? (
          <ErrorState error={fixQuery.error} onRetry={fixQuery.refetch} compact title="The fix could not be read" />
        ) : loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-48" />
              <Skeleton className="h-48" />
            </div>
          </div>
        ) : (
          <>
            {fix && <FixSummary fix={fix} catalog={catalog.data} />}

            {fix?.other_fixes?.length > 0 && (
              <Field label="Fix to use" htmlFor="fix-choice" hint="The rule's own fix is first. Another fix applies to both options below.">
                <Select
                  id="fix-choice"
                  value={chosen}
                  onChange={(e) => setActionType(e.target.value === fix.fix?.action_type ? '' : e.target.value)}
                  options={[
                    ...(fix.fix ? [{ value: fix.fix.action_type, label: `${fix.fix.title} (recommended)` }] : []),
                    ...fix.other_fixes.map((o) => ({ value: o.action_type, label: o.title || fixName(o.action_type, catalog.data) })),
                  ]}
                />
              </Field>
            )}

            {ONE_CLICK_ENABLED && pending && (
              <div role="status" className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-info/30 bg-info-soft px-3.5 py-3">
                <Info aria-hidden="true" className="size-4.5 shrink-0 text-info" />
                <p className="min-w-0 flex-1 text-[12.5px] text-ink">
                  A One-click plan for this finding is already <b>{statusMeta(pending.status).label.toLowerCase()}</b>
                  {pending.by_engine ? ', made by the rule engine' : pending.created_by ? `, made by ${pending.created_by}` : ''}.
                </p>
                <Button size="sm" variant="secondary" iconRight={ArrowRight} onClick={() => onOpenPlan(pending.plan_id)}>
                  Open plan
                </Button>
              </div>
            )}

            {needTarget && (
              <Field label="Target ARN" htmlFor="fix-target" hint="The ARN of the role, user, key or secret to change, from the finding's resource.">
                <Input id="fix-target" icon={Link2} value={targetArn} onChange={(e) => setTargetArn(e.target.value)} placeholder="arn:aws:iam::123456789012:role/name" className="font-mono text-[12.5px]" autoFocus />
              </Field>
            )}

            {problem && (
              <InlineError
                error={problem}
                label={problem.status === 422 ? 'No automatic fix' : problem.status === 409 ? 'Not possible right now' : 'Could not make the plan'}
              />
            )}

            <div className={ONE_CLICK_ENABLED ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'}>
              <ModeCard
                icon={Hand}
                title="Fix it yourself"
                badge="Guided"
                lines={[
                  fix?.modes?.guided?.flow || 'Apply the steps by hand in AWS, then mark the plan done. The console changes nothing.',
                  'No approval needed.',
                ]}
                action={
                  canPlan ? (
                    <Button variant="secondary" icon={BookOpen} loading={creating === 'GUIDED'} disabled={Boolean(creating)} onClick={() => create('GUIDED')}>
                      Track this fix
                    </Button>
                  ) : (
                    <p className="text-[12px] text-ink-3">An analyst or admin can track this fix.</p>
                  )
                }
              />
              {ONE_CLICK_ENABLED && <ModeCard
                icon={Zap}
                title="Fix it for me"
                badge="One-click"
                disabled={!oneClickAvailable || Boolean(pending)}
                lines={
                  oneClickAvailable
                    ? [
                        oneClick?.flow || 'The backend applies the fix in AWS.',
                        approvalRequired === null ? 'May need an approver first (risky fixes and Critical findings).' : approvalRequired ? 'An approver must approve it first.' : 'Runs straight away - no approval needed.',
                      ]
                    : [oneClickReason || 'Not available for this finding.', 'Use Guided instead, or ask an admin to set up One-click for this account (Remediation › One-click setup).']
                }
                action={
                  canPlan && oneClickAvailable && !pending ? (
                    <Button variant="primary" icon={Wand2} loading={creating === 'ONE_CLICK'} disabled={Boolean(creating)} onClick={() => setConfirmOneClick(true)}>
                      Create One-click plan
                    </Button>
                  ) : null
                }
              />}
            </div>

            {fix?.fix?.steps?.length > 0 && (
              <section>
                <SectionLabel>The steps</SectionLabel>
                <Steps steps={fix.fix.steps} />
              </section>
            )}
            {fix && !fix.fix && fix.how_to_fix && (
              <section>
                <SectionLabel>How to fix</SectionLabel>
                <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-ink-2">{fix.how_to_fix}</p>
              </section>
            )}
            {fix === null && (
              <p className="flex items-start gap-2 text-[12px] text-ink-3">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                The steps appear in the plan once it is made.
              </p>
            )}

            <section>
              <SectionLabel>Plans for this finding</SectionLabel>
              {plansQuery.isError ? (
                <InlineError error={plansQuery.error} onRetry={plansQuery.refetch} label="Could not read the plans" />
              ) : !plansQuery.data ? (
                <Skeleton className="mt-2 h-10 w-full" />
              ) : plans.length === 0 ? (
                <p className="mt-1 text-[12.5px] text-ink-3">None yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line rounded-[var(--radius-control)] border border-line">
                  {plans.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => onOpenPlan(p.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">{fixName(p.actionType, catalog.data)}</span>
                          <span className="block text-[11.5px] text-ink-3">
                            {MODE_LABEL[p.mode] ?? p.mode} · {p.createdBy || 'unknown'} · {formatRelative(p.createdAt)}
                          </span>
                        </span>
                        <Tag size="sm" tone={statusMeta(p.status).tone} dot>
                          {statusMeta(p.status).label}
                        </Tag>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <Modal
        open={confirmOneClick}
        onClose={() => !creating && setConfirmOneClick(false)}
        icon={AlertTriangle}
        tone="medium"
        title="This will change AWS"
        description={
          approvalRequired === true
            ? 'An approver must approve it first; it then runs by itself.'
            : approvalRequired === false
              ? 'No approval is needed: the change starts as soon as you confirm.'
              : 'It runs as soon as it is allowed: straight away for a safe fix, or after an approver approves a risky one.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOneClick(false)} disabled={Boolean(creating)}>
              Not now
            </Button>
            <Button variant="primary" icon={Wand2} loading={creating === 'ONE_CLICK'} onClick={() => create('ONE_CLICK')}>
              Create One-click plan
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5 text-[12.5px] text-ink-2">
          <p>
            <span className="font-medium text-ink">{fixName(chosen, catalog.data)}</span>
            {fix?.fix && !actionType && (
              <>
                {' · '}
                {riskMeta(fix.fix.risk_level).label}
                {fix.fix.reversible ? ' · can be rolled back' : ' · cannot be rolled back'}
              </>
            )}
          </p>
          {fix?.resource && <p className="font-mono text-[11.5px] break-all text-ink-3">{fix.resource}</p>}
        </div>
      </Modal>
    </Drawer>
  );
}

function FixSummary({ fix, catalog }) {
  const { notify } = useToast();
  const f = fix.fix;
  return (
    <section className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-ink">{f ? f.title || fixName(f.action_type, catalog) : 'No automatic fix for this rule'}</p>
          {fix.identity && <p className="mt-0.5 text-[12px] text-ink-3">On {fix.identity}</p>}
        </div>
        {f && (
          <span className="flex flex-wrap gap-1">
            <Tag size="sm" tone={riskMeta(f.risk_level).tone}>
              {riskMeta(f.risk_level).label}
            </Tag>
            <Tag size="sm" tone={f.reversible ? 'low' : 'medium'}>
              {f.reversible ? 'Can be rolled back' : 'Cannot be rolled back'}
            </Tag>
          </span>
        )}
      </div>
      {(f?.description || fix.description) && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{f?.description || fix.description}</p>}
      {fix.summary_text && (
        <Button
          size="sm"
          variant="ghost"
          icon={ClipboardCopy}
          className="mt-2 -ml-2"
          onClick={async () => {
            const ok = await copyText(fix.summary_text);
            notify(ok ? { variant: 'success', title: 'Copied', description: 'The finding and its fix, as text for a ticket or a chat.' } : { variant: 'error', title: 'Could not copy' });
          }}
        >
          Copy as text
        </Button>
      )}
    </section>
  );
}

function ModeCard({ icon: Icon, title, badge, lines, action, disabled = false }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-[var(--radius-panel)] border p-4', disabled ? 'border-line bg-surface-2' : 'border-line-strong bg-surface shadow-[var(--t-shadow-sm)]')}>
      <div className="flex items-center gap-2">
        <span className={cn('grid size-8 place-items-center rounded-full', disabled ? 'bg-surface-3 text-ink-3' : 'bg-info-soft text-brand')}>
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className={cn('text-[14px] font-semibold', disabled ? 'text-ink-3' : 'text-ink')}>{title}</span>
        <Tag size="sm" tone={disabled ? 'neutral' : 'brand'} className="ml-auto">
          {badge}
        </Tag>
      </div>
      <ul className="flex flex-1 flex-col gap-1">
        {lines.filter(Boolean).map((line) => (
          <li key={line} className={cn('text-[12.5px] leading-relaxed', disabled ? 'text-ink-3' : 'text-ink-2')}>
            {line}
          </li>
        ))}
      </ul>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
