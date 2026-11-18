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
    mfa: { enabled: n(d.mfa?.enabled), disabled: n(d.mfa?.disabled), unknown: n(d.mfa?.unknown) },
    inactiveOver90: n(d.inactive_over_90_days),
    neverUsed: n(d.never_used),
    consoleWithoutMfa: n(d.console_access_without_mfa),
    privileged: n(d.privileged_count),
    unlinked: n(d.unlinked_count),
  };
}

/** query: { page, pageSize, source, humanType, status, mfa ('true'|'false'|''), search, sortBy, sortOrder } */
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
