/**
 * Remediation as data: how each plan status reads, which buttons it offers to
 * whom (FRONTEND_REMEDIATION_API.md §2 and §6), and readable fix names.
 */

export const PLAN_STATUS = {
  DRAFT: { label: 'Blocked by a pre-check', tone: 'medium', group: 'open' },
  READY: { label: 'Ready', tone: 'info', group: 'open' },
  WAITING_EXTERNAL: { label: 'Waiting for the vendor', tone: 'medium', group: 'open' },
  PENDING_APPROVAL: { label: 'Waiting for approval', tone: 'brand', group: 'open' },
  APPROVED: { label: 'Approved', tone: 'brand', group: 'open' },
  SCHEDULED: { label: 'Scheduled', tone: 'brand', group: 'running' },
  EXECUTING: { label: 'Running', tone: 'brand', group: 'running' },
  EXECUTED: { label: 'Applied - waiting for the scan', tone: 'low', group: 'applied' },
  VERIFIED: { label: 'Applied and verified', tone: 'low', group: 'applied' },
  MANUALLY_DONE: { label: 'Done by hand - waiting for the scan', tone: 'low', group: 'applied' },
  RESOLVED: { label: 'Fixed', tone: 'low', group: 'closed' },
  FAILED: { label: 'Failed', tone: 'critical', group: 'closed' },
  REJECTED: { label: 'Rejected', tone: 'critical', group: 'closed' },
  EXPIRED: { label: 'Expired', tone: 'neutral', group: 'closed' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', group: 'closed' },
  SUPERSEDED: { label: 'Replaced by a newer plan', tone: 'neutral', group: 'closed' },
  ROLLED_BACK: { label: 'Rolled back', tone: 'medium', group: 'closed' },
  DRY_RUN: { label: 'Dry run (engine)', tone: 'neutral', group: 'closed' },
  SKIPPED: { label: 'Skipped (engine)', tone: 'neutral', group: 'closed' },
};

export const statusMeta = (status) => PLAN_STATUS[status] ?? { label: status || 'Unknown', tone: 'neutral', group: 'closed' };

export const RISK = {
  LOW: { label: 'Low risk', tone: 'low' },
  MEDIUM: { label: 'Medium risk', tone: 'medium' },
  HIGH: { label: 'High risk', tone: 'high' },
  CRITICAL: { label: 'Critical risk', tone: 'critical' },
};
export const riskMeta = (risk) => RISK[String(risk || '').toUpperCase()] ?? { label: risk ? `${risk} risk` : 'Risk not rated', tone: 'neutral' };

export const MODE_LABEL = { GUIDED: 'Guided', ONE_CLICK: 'One-click' };

/* For now remediation is guided only: the console shows the steps and tracks
   the plan, and nothing is changed in AWS from here. One-click (plans the
   backend applies, their approvals and the per-account setup) stays in the
   API; set this to true to bring its screens back. */
export const ONE_CLICK_ENABLED = false;

export const EXEC_STATUS = {
  QUEUED: { label: 'Queued', tone: 'info' },
  RUNNING: { label: 'Running', tone: 'brand' },
  SUCCEEDED: { label: 'Succeeded', tone: 'low' },
  FAILED: { label: 'Failed', tone: 'critical' },
  ROLLED_BACK: { label: 'Rolled back', tone: 'medium' },
  ROLLBACK_FAILED: { label: 'Rollback failed', tone: 'critical' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const PRECHECK_TONE = { PASS: 'low', WARN: 'medium', BLOCK: 'critical' };

/** The status filters of the plans list, by what a person is looking for. */
export const STATUS_FILTERS = [
  { value: '', label: 'Any status' },
  { value: 'PENDING_APPROVAL', label: 'Waiting for approval' },
  { value: 'READY', label: 'Ready (Guided to do)' },
  { value: 'DRAFT', label: 'Blocked by a pre-check' },
  { value: 'WAITING_EXTERNAL', label: 'Waiting for the vendor' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'EXECUTING', label: 'Running' },
  { value: 'VERIFIED', label: 'Applied and verified' },
  { value: 'EXECUTED', label: 'Applied' },
  { value: 'MANUALLY_DONE', label: 'Done by hand' },
  { value: 'RESOLVED', label: 'Fixed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'ROLLED_BACK', label: 'Rolled back' },
];

/** The signed-in person is the plan's creator: they may not approve or reject it. */
export function isCreator(plan, user) {
  const me = String(user?.email || user?.user || '').toLowerCase();
  return Boolean(me) && String(plan?.createdBy || '').toLowerCase() === me;
}

/**
 * The buttons a plan offers this person, in display order (§6). `can` is
 * useAccess().can. Engine plans only take approve, reject and cancel.
 *
 * Each item: { key, label, tone: primary|secondary|danger|ghost, needs?: comment|reason|note }
 */
export function planActions(plan, { can, user, executeRun, stalled = false }) {
  if (!plan) return [];
  const s = plan.status;
  const out = [];
  const write = can('remediation.plan');
  const approve = can('remediation.approve') && !isCreator(plan, user);
  const guided = plan.mode === 'GUIDED';
  const engine = plan.byEngine;
  /* Guided only: an older One-click plan can still be read and cancelled,
     but nothing that changes AWS is offered. */
  if (!ONE_CLICK_ENABLED && !guided) {
    return write && ['DRAFT', 'READY', 'WAITING_EXTERNAL', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'].includes(s)
      ? [{ key: 'cancel', label: s === 'PENDING_APPROVAL' ? 'Withdraw' : 'Cancel plan', tone: 'ghost' }]
      : [];
  }

  if (s === 'PENDING_APPROVAL' && approve) {
    out.push({ key: 'approve', label: 'Approve', tone: 'primary' });
    out.push({ key: 'reject', label: 'Reject', tone: 'danger' });
  }
  if (!engine && write) {
    if (guided && ['DRAFT', 'READY', 'WAITING_EXTERNAL'].includes(s)) out.push({ key: 'markDone', label: 'Mark as done', tone: 'primary' });
    if (s === 'WAITING_EXTERNAL') out.push({ key: 'confirmExternal', label: 'Confirm ExternalId is set', tone: 'secondary' });
    if (!guided && s === 'READY') out.push({ key: 'submit', label: 'Submit for approval', tone: 'primary' });
    if (s === 'APPROVED' && (plan.statusReason || stalled) && can('remediation.execute')) {
      out.push({ key: 'execute', label: plan.statusReason ? 'Retry the run' : 'Start the run', tone: 'primary' });
    }
    if (['EXECUTED', 'VERIFIED'].includes(s) && executeRun && can('remediation.execute')) {
      out.push({ key: 'rollback', label: 'Roll back', tone: 'danger' });
    }
  }
  if (write && ['DRAFT', 'READY', 'WAITING_EXTERNAL', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'].includes(s)) {
    out.push({ key: 'cancel', label: s === 'PENDING_APPROVAL' ? 'Withdraw' : 'Cancel plan', tone: 'ghost' });
  }
  return out;
}

/** Why a person sees no Approve button on a plan waiting for approval. */
export function approvalBlockedReason(plan, { can, user }) {
  if (plan?.status !== 'PENDING_APPROVAL') return '';
  if (!can('remediation.approve')) return 'An approver (operator or admin) must approve this plan.';
  if (isCreator(plan, user)) return 'You made this plan, so someone else must approve it.';
  return '';
}

/* An approved plan normally starts within seconds; one with no run after this long has not been picked up. */
const STALL_MS = 90000;
export function isStalled(plan, executions) {
  if (plan?.status !== 'APPROVED' || plan.byEngine || (executions ?? []).length) return false;
  const at = Date.parse(plan.updatedAt || plan.createdAt || '');
  return Number.isFinite(at) && Date.now() - at > STALL_MS;
}

/** The EXECUTE run that a rollback undoes: the latest one that succeeded. */
export function executeRunOf(executions) {
  return (executions ?? []).find((e) => e.kind === 'EXECUTE' && e.status === 'SUCCEEDED') ?? null;
}

/** "deactivate_key" -> catalog title, or a readable fallback. */
export function fixName(actionType, catalog) {
  const hit = (catalog ?? []).find((a) => a.action_type === actionType);
  if (hit?.title) return hit.title;
  const text = String(actionType || '').replace(/_/g, ' ');
  return text ? text[0].toUpperCase() + text.slice(1) : 'Fix';
}

/** The last part of an ARN, for a compact target label. */
export function targetLabel(arn) {
  const s = String(arn || '');
  const tail = s.split(/[:/]/).filter(Boolean).pop();
  return tail || s || '-';
}

export const AUDIT_EVENT = {
  PLAN_CREATED: 'Plan created',
  SUBMITTED: 'Submitted for approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXECUTION_QUEUED: 'Run queued',
  EXECUTION_STARTED: 'Run started',
  AWS_CALL: 'AWS call',
  VERIFIED: 'Verified in AWS',
  FAILED: 'Failed',
  ROLLED_BACK: 'Rolled back',
  MARKED_DONE: 'Marked as done',
  CANCELLED: 'Cancelled',
  RESOLVED: 'Finding resolved by a scan',
  PLAN_SUPERSEDED: 'Replaced by a newer plan',
  EMAIL_SENT: 'E-mail sent',
};
