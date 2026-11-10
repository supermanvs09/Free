import client from './client';
import { ApiError } from './http';

/**
 * Remediation (FRONTEND_REMEDIATION_API.md). Base /api/v1/remediation.
 *
 *   GET  /findings/{id}/fix            the fix for a finding and its two modes
 *   GET  /findings/{id}                plans already made for a finding
 *   POST /plans                        { finding_ids, mode, action_type?, params? }
 *   GET  /plans/{id}                   { plan, approvals, executions, approvals_counted }
 *   GET  /plans                        status, mode, account_id, finding_id, limit, offset
 *   POST /plans/{id}/approve|reject    { comment }
 *   POST /plans/{id}/cancel            { reason }
 *   POST /plans/{id}/mark-done         { note }
 *   POST /plans/{id}/submit|execute|confirm-external   (rare)
 *   GET  /executions/{id}, POST /executions/{id}/rollback
 *   GET  /audit?plan_id=
 *   GET  /actions, GET /accounts[/{id}], PUT /accounts/{id},
 *   POST /accounts/{id}/validate, GET /accounts/{id}/setup
 *
 * Success is { data, ...extras }; errors { error: { code, message, field } }
 * (read by lib/api/http.js), so every failure arrives as an ApiError.
 */

const BASE = '/api/v1/remediation';
const enc = encodeURIComponent;

function body(response) {
  const b = response?.data;
  if (!b || typeof b !== 'object' || !('data' in b)) {
    throw new ApiError({ message: 'The remediation service answered with an unexpected response.', status: response?.status ?? null });
  }
  return b;
}
const data = (response) => body(response).data;

/** A route this backend does not have (an older deployment). */
export const isMissingRoute = (error) => error?.code === 'ROUTE_NOT_FOUND' || error?.status === 405;

/* ── Statuses ──────────────────────────────────────────────────────────── */

export const OPEN_STATUSES = ['DRAFT', 'READY', 'WAITING_EXTERNAL', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'EXECUTING'];
export const END_STATUSES = ['VERIFIED', 'EXECUTED', 'FAILED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'SUPERSEDED', 'ROLLED_BACK', 'RESOLVED', 'MANUALLY_DONE', 'DRY_RUN', 'SKIPPED'];
/** Statuses that change on their own soon: the plan page polls while it shows one. */
export const MOVING_STATUSES = ['APPROVED', 'SCHEDULED', 'EXECUTING'];

/* ── Normalisers ───────────────────────────────────────────────────────── */

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function normalizePlan(p = {}) {
  return {
    ...p,
    id: p.plan_id,
    findingIds: arr(p.finding_ids),
    ruleIds: arr(p.rule_ids),
    actionType: p.action_type || '',
    accountId: p.account_id || '',
    region: p.region || '',
    targetArn: p.target_arn || '',
    targetType: p.target_type || '',
    mode: p.mode || '',
    status: p.status || '',
    statusReason: p.status_reason || '',
    riskLevel: p.risk_level || '',
    requiredApprovals: Number(p.required_approvals) || 0,
    params: obj(p.params),
    beforeState: obj(p.before_state),
    afterState: obj(p.after_state),
    diff: arr(p.diff),
    steps: arr(p.steps),
    prechecks: arr(p.prechecks),
    scoreCurrent: p.score_current ?? null,
    scoreGain: p.score_gain ?? null,
    scoreProjected: p.score_projected ?? null,
    validUntil: p.valid_until ?? null,
    createdBy: p.created_by || '',
    createdAt: p.created_at ?? null,
    updatedAt: p.updated_at ?? null,
    policyId: p.policy_id ?? null,
    /* Made by the rule engine's automatic remediation: only approve, reject and cancel apply. */
    byEngine: Boolean(p.policy_id) || String(p.created_by || '').startsWith('auto:'),
  };
}

function normalizeExecution(e = {}) {
  return {
    ...e,
    id: e.execution_id,
    kind: e.kind || '',
    status: e.status || '',
    steps: arr(e.steps),
    errorCode: e.error_code || '',
    errorMessage: e.error_message || '',
  };
}

/* ── Findings ──────────────────────────────────────────────────────────── */

/**
 * The fix view of a finding. `null` when this backend has no such route:
 * the panel then builds what it can from the catalog (see FixPanel).
 */
export async function fetchFindingFix(findingId, signal) {
  try {
    return data(await client.get(`${BASE}/findings/${enc(findingId)}/fix`, { signal }));
  } catch (error) {
    if (isMissingRoute(error)) return null;
    throw error;
  }
}

export async function fetchFindingPlans(findingId, signal) {
  return arr(data(await client.get(`${BASE}/findings/${enc(findingId)}`, { signal }))).map(normalizePlan);
}

/* ── Plans ─────────────────────────────────────────────────────────────── */

/**
 * Creates one plan. `mode` is always sent. Answers { plan, existing, message }:
 * `existing` when a One-click request found a plan already waiting (200).
 */
export async function createPlan({ findingIds, mode, actionType, params }) {
  const payload = { finding_ids: findingIds, mode };
  if (actionType) payload.action_type = actionType;
  if (params && Object.keys(params).length) payload.params = params;
  const b = body(await client.post(`${BASE}/plans`, payload, { timeout: 60000 }));
  return { plan: normalizePlan(b.data), existing: Boolean(b.existing_plan), message: b.message || '' };
}

export async function fetchPlan(planId, signal) {
  const d = data(await client.get(`${BASE}/plans/${enc(planId)}`, { signal }));
  return {
    plan: normalizePlan(d.plan),
    approvals: arr(d.approvals),
    executions: arr(d.executions).map(normalizeExecution),
    approvalsCounted: Number(d.approvals_counted) || 0,
  };
}

/** { plans, total, page, pageSize }. An older backend answers without pagination. */
export async function fetchPlans({ status, mode, accountId, findingId, targetArn } = {}, { page = 1, pageSize = 25 } = {}, signal) {
  const params = { limit: pageSize, offset: (page - 1) * pageSize };
  if (status) params.status = status;
  if (mode) params.mode = mode;
  if (accountId) params.account_id = accountId;
  if (findingId) params.finding_id = findingId;
  if (targetArn) params.target_arn = targetArn;
  const b = body(await client.get(`${BASE}/plans`, { params, signal }));
  const plans = arr(b.data).map(normalizePlan);
  const total = b.pagination ? Number(b.pagination.total_count) || 0 : (page - 1) * pageSize + plans.length + (plans.length === pageSize ? 1 : 0);
  return { plans, total, page, pageSize, exact: Boolean(b.pagination), readAt: new Date().toISOString() };
}

const act = async (planId, verb, payload) => normalizePlan(data(await client.post(`${BASE}/plans/${enc(planId)}/${verb}`, payload ?? {})));

export const approvePlan = (planId, comment) => act(planId, 'approve', comment ? { comment } : {});
export const rejectPlan = (planId, comment) => act(planId, 'reject', comment ? { comment } : {});
export const cancelPlan = (planId, reason) => act(planId, 'cancel', reason ? { reason } : {});
export const markPlanDone = (planId, note) => act(planId, 'mark-done', note ? { note } : {});
export const submitPlan = (planId) => act(planId, 'submit');
export const confirmExternal = (planId) => act(planId, 'confirm-external');
export async function executePlan(planId) {
  const b = body(await client.post(`${BASE}/plans/${enc(planId)}/execute`, {}));
  return { execution: normalizeExecution(b.data), statusUrl: b.status_url || '' };
}

/* ── Executions ────────────────────────────────────────────────────────── */

export async function fetchExecution(executionId, signal) {
  return normalizeExecution(data(await client.get(`${BASE}/executions/${enc(executionId)}`, { signal })));
}

export async function rollbackExecution(executionId) {
  const b = body(await client.post(`${BASE}/executions/${enc(executionId)}/rollback`, {}));
  return { execution: normalizeExecution(b.data), statusUrl: b.status_url || '' };
}

/* ── History, catalog, accounts ────────────────────────────────────────── */

export async function fetchPlanAudit(planId, signal) {
  return arr(data(await client.get(`${BASE}/audit`, { params: { plan_id: planId, limit: 200 }, signal })));
}

let actionsCache = null;
/** The fix catalog, read once per page load. Shared by every screen, so no
    one screen's abort signal may cancel it for the others. */
export async function fetchActions() {
  if (!actionsCache) {
    actionsCache = client
      .get(`${BASE}/actions`)
      .then((r) => arr(data(r)))
      .catch((error) => {
        actionsCache = null;
        throw error;
      });
  }
  return actionsCache;
}

function normalizeAccount(a = {}) {
  return {
    ...a,
    accountId: a.account_id || '',
    enabled: Boolean(a.remediation_enabled),
    roleArn: a.remediation_role_arn || '',
    hasExternalId: Boolean(a.has_external_id),
    autoEnabled: Boolean(a.auto_remediation_enabled),
    allowedActionTypes: arr(a.allowed_action_types),
    enabledRegions: arr(a.enabled_regions),
    accessStatus: a.access_status || '',
    accessDetail: a.access_detail || '',
    accessCheckedAt: a.access_checked_at ?? null,
  };
}

/** Whether One-click can run in an account, and why not. */
export function oneClickProblem(account) {
  if (!account) return 'One-click is not set up for this AWS account.';
  if (!account.enabled) return 'One-click is turned off for this AWS account.';
  if (!account.roleArn) return 'No remediation role is set for this AWS account.';
  if (account.accessStatus === 'CANNOT_ASSUME' || account.accessStatus === 'MISSING_PERMISSIONS') {
    return account.accessDetail || 'The remediation role cannot be used.';
  }
  return '';
}

export async function fetchRemediationAccounts(signal) {
  return arr(data(await client.get(`${BASE}/accounts`, { signal }))).map(normalizeAccount);
}

export async function fetchRemediationAccount(accountId, signal) {
  try {
    return normalizeAccount(data(await client.get(`${BASE}/accounts/${enc(accountId)}`, { signal })));
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export async function fetchAccountSetup(accountId, signal) {
  return data(await client.get(`${BASE}/accounts/${enc(accountId)}/setup`, { signal }));
}

export async function updateRemediationAccount(accountId, changes) {
  const payload = {
    remediation_enabled: Boolean(changes.enabled),
    remediation_role_arn: changes.roleArn ?? '',
    allowed_action_types: changes.allowedActionTypes ?? [],
    enabled_regions: changes.enabledRegions ?? [],
  };
  if (changes.graceDays) payload.grace_days = changes.graceDays;
  return normalizeAccount(data(await client.put(`${BASE}/accounts/${enc(accountId)}`, payload, { timeout: 60000 })));
}

export async function validateRemediationAccount(accountId) {
  return normalizeAccount(data(await client.post(`${BASE}/accounts/${enc(accountId)}/validate`, {}, { timeout: 60000 })));
}
