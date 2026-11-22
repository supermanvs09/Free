import client from './client';
import { params, unwrapMain } from './http';

/*
 * Human identities: the people who sign in to AWS (IAM users, and SSO users
 * through IAM Identity Center), as opposed to the workloads in Discovery.
 *
 *   GET /api/v1/human-identities/overview?source=all|iam|sso   counts for the tiles
 *   GET /api/v1/human-identities                               page, page_size (max 100),
 *                                                              source, status, mfa, search,
 *                                                              sort_by, sort_order
 *   GET /api/v1/human-identities/{id}                          profile, access, groups, risk signals
 *   GET /api/v1/human-identities/{id}/posture                  posture score card and checks
 *
 * Responses are { success, message, data }; the list's data is { data: rows, pagination }.
 */
const BASE = '/api/v1/human-identities';

const n = (value) => Number(value) || 0;

export async function fetchHumanOverview({ source } = {}, signal) {
  const d = unwrapMain(await client.get(`${BASE}/overview`, { signal, params: params({ source: source && source !== 'all' ? source : undefined }) })) ?? {};
  return {
    total: n(d.total_identities),
    bySource: { iam: n(d.by_source?.iam), sso: n(d.by_source?.sso), both: n(d.by_source?.both) },
    byStatus: { active: n(d.by_status?.active), inactive: n(d.by_status?.inactive), suspended: n(d.by_status?.suspended), disabled: n(d.by_status?.disabled) },
    byHumanType: Object.fromEntries(Object.entries(d.by_human_type ?? {}).map(([k, v]) => [k, n(v)])),
    rootAccounts: n(d.root_accounts),
    /* Counts per risk rule, keyed by the list's risk= values. */
    risks: {
      console_no_mfa: n(d.console_access_without_mfa),
      inactive_90d: n(d.inactive_over_90_days),
      never_used: n(d.never_used),
      admin: n(d.privileged_count),
      escalation: n(d.escalation_count),
      virtual_mfa_admin: n(d.admins_virtual_mfa_only),
      old_access_key: n(d.access_keys?.older_than_90_days),
      unused_access_key: n(d.access_keys?.never_used),
      two_active_keys: n(d.access_keys?.two_active_keys),
      old_password: n(d.passwords?.older_than_90_days),
      password_never_changed: n(d.passwords?.never_changed),
      login_without_mfa: n(d.sign_ins?.login_without_mfa_90_days),
      failed_login: n(d.sign_ins?.failed_login_7_days),
    },
    mfa: { enabled: n(d.mfa?.enabled), disabled: n(d.mfa?.disabled), unknown: n(d.mfa?.unknown) },
    inactiveOver90: n(d.inactive_over_90_days),
    neverUsed: n(d.never_used),
    consoleWithoutMfa: n(d.console_access_without_mfa),
    privileged: n(d.privileged_count),
    unlinked: n(d.unlinked_count),
    accessKeys: { withActiveKey: n(d.access_keys?.users_with_active_key) },
  };
}

/** query: { page, pageSize, source, humanType, status, mfa ('true'|'false'|''), risk, search, sortBy, sortOrder } */
export async function fetchHumanIdentities(query = {}, signal) {
  const d = unwrapMain(
    await client.get(BASE, {
      signal,
      params: params({
        page: query.page,
        page_size: query.pageSize,
        source: query.source && query.source !== 'all' ? query.source : undefined,
        human_type: query.humanType,
        status: query.status,
        mfa: query.mfa,
        risk: query.risk,
        search: query.search?.trim(),
        sort_by: query.sortBy,
        sort_order: query.sortOrder,
      }),
    }),
  );
  const p = d?.pagination ?? {};
  return {
    rows: Array.isArray(d?.data) ? d.data : [],
    total: n(p.total_count),
    page: n(p.page) || 1,
    pageSize: n(p.page_size) || 25,
    totalPages: n(p.total_pages),
  };
}

export async function fetchHumanIdentity(id, signal) {
  return unwrapMain(await client.get(`${BASE}/${encodeURIComponent(id)}`, { signal }));
}

/** The person's posture score card and checks: { scored, posture, checks }. */
export async function fetchHumanPosture(id, { window = '30d' } = {}, signal) {
  const d = unwrapMain(await client.get(`${BASE}/${encodeURIComponent(id)}/posture`, { params: { window }, signal }));
  return { scored: Boolean(d?.scored), postureId: d?.posture_identity_id ?? null, posture: d?.posture ?? null, checks: Array.isArray(d?.checks) ? d.checks : [] };
}
