import client from './client';
import { ApiError, expectField } from './http';

/*
 * Credential exposure (NHI backend, admin only). The secret scanner writes its
 * findings into the tenant's schema and the API serves them here; a deep-scan
 * request is written to the tenant's deep-scan table for the scanner worker.
 *
 *   GET    /api/v1/credential-exposure/findings            ?limit (<=500) &offset | ?finding_id
 *   GET    /api/v1/credential-exposure/findings/review     the models are unsure: a person decides
 *   GET    /api/v1/credential-exposure/findings/repeated   one value copied to 3+ places in a commit
 *   GET    /api/v1/credential-exposure/findings/noise      recognised harmless values
 *   GET    /api/v1/credential-exposure/findings/flagged    findings the model marked false positive
 *   GET    /api/v1/credential-exposure/findings/summary
 *   POST   /api/v1/credential-exposure/decisions           { finding_id, decision }
 *   GET/POST/DELETE /api/v1/credential-exposure/allowlist  accept / list / restore
 *   GET    /api/v1/credential-exposure/deep-findings       deep-scan findings, one row per branch
 *   GET    /api/v1/credential-exposure/repositories        every repository the scanner knows, with branches
 *   GET    /api/v1/credential-exposure/branches            ?client_id &repository: the deep-scan dropdown
 *   POST   /api/v1/credential-exposure/deep-scan           { client_id, repository, platform?, branches? }
 *   GET    /api/v1/credential-exposure/deep-scan/status    ?client_id &repository [&platform] [&branch]
 *
 * Three platforms: codecommit, github, bitbucket.
 *
 * These answer bare JSON, not the { success, data } envelope.
 */
const CE = '/api/v1/credential-exposure';
const PAGE = 500;
const MAX_FINDINGS = 20000;

/* Every finding that is not marked safe is in exactly one of five lists. */
const LIST_PATHS = {
  live: `${CE}/findings`,
  review: `${CE}/findings/review`,
  repeated: `${CE}/findings/repeated`,
  noise: `${CE}/findings/noise`,
  flagged: `${CE}/findings/flagged`,
  /* Not one of the five lists: what deep scans found in the history. */
  history: `${CE}/deep-findings`,
};

/**
 * Every finding in one list (`live` is the main list). The API pages at most
 * 500 at a time and reports the full `count`, so every page is read: the
 * screens filter, count and group the whole set, and a partial set would
 * undercount.
 */
export async function fetchFindings(signal, { list = 'live', filters = {} } = {}) {
  const path = LIST_PATHS[list] ?? LIST_PATHS.live;
  const findings = [];
  let count = 0;
  for (let offset = 0; offset < MAX_FINDINGS; offset += PAGE) {
    const body = expectField(await client.get(path, { params: { ...filters, limit: PAGE, offset }, signal }), 'findings');
    if (!Array.isArray(body.findings)) {
      throw new ApiError({ message: 'The service answered with an unexpected response.' });
    }
    findings.push(...body.findings);
    count = Number.isFinite(body.count) ? body.count : findings.length;
    if (body.findings.length < PAGE || findings.length >= count) break;
  }
  return { findings, count };
}

/**
 * { total_findings, high_count, medium_count, low_count, affected_repositories,
 *   lists: { main, review, repeated, noise, ml_flagged }, by_platform,
 *   platforms: [...the platforms this workspace has tables for],
 *   deep_findings, deep_available }
 */
export async function fetchFindingsSummary(signal) {
  return expectField(await client.get(`${CE}/findings/summary`, { signal }), 'total_findings');
}

/** One finding (ids may contain slashes); `deep` for a deep-scan finding. */
export async function fetchFinding(findingId, signal, { deep = false } = {}) {
  const params = { finding_id: findingId };
  if (deep) params.deep = true;
  return expectField(await client.get(`${CE}/findings`, { params, signal }), 'finding_id');
}

/** The analyst's verdict; the API records who from the token. A deep-scan finding needs `deep`. */
export async function decideFinding({ findingId, decision, deep = false }) {
  const body = { finding_id: findingId, decision };
  if (deep) body.deep = true;
  const res = await client.post(`${CE}/decisions`, body);
  return res?.data ?? {};
}

/**
 * Every repository the scanner knows in this workspace - including ones
 * without a finding - with its branches (default first), when each was last
 * scanned, and each branch's latest deep scan.
 */
export async function fetchRepositories(signal) {
  const body = expectField(await client.get(`${CE}/repositories`, { signal }), 'repositories');
  return Array.isArray(body.repositories) ? body.repositories : [];
}

/** The deep-scan branch dropdown for one repository: `options` [{ value, label, kind }]. */
export async function fetchBranches({ clientId, repository, platform }, signal) {
  const params = { client_id: clientId, repository };
  if (platform) params.platform = platform;
  return expectField(await client.get(`${CE}/branches`, { params, signal }), 'options');
}

export async function fetchAllowlist(signal) {
  const body = expectField(await client.get(`${CE}/allowlist`, { signal }), 'entries');
  return Array.isArray(body.entries) ? body.entries : [];
}

/** Accept a finding. All four identifying fields are required; the API records who. */
export async function dismissFinding({ clientId, filePath, detector, redacted, reason }) {
  const res = await client.post(`${CE}/allowlist`, {
    client_id: clientId,
    file_path: filePath,
    detector,
    redacted,
    ...(reason ? { reason } : {}),
  });
  return res?.data ?? {};
}

/** Back into the live findings. */
export async function restoreFinding({ clientId, filePath, detector, redacted }) {
  const res = await client.delete(`${CE}/allowlist`, {
    data: { client_id: clientId, file_path: filePath, detector, redacted },
  });
  return res?.data ?? {};
}

/**
 * Start the full commit-by-commit history walk of one repository. 202 means
 * accepted, not finished - poll `fetchDeepScanStatus`; `already_running` says
 * an earlier request is still waiting. `repository` is a bare name for
 * CodeCommit, `owner/repo` for GitHub; `platform` is sent when known.
 */
export async function startDeepScan({ clientId, repository, platform, branches }) {
  const body = { client_id: clientId, repository };
  if (platform) body.platform = platform;
  /* "default" | "all" | [names]; left out, the default branch as before. */
  if (branches !== undefined && branches !== null) body.branches = branches;
  const res = await client.post(`${CE}/deep-scan`, body);
  return res?.data ?? {};
}

/** `not_started` | `running` | `complete` | `failed`, plus counts and times. */
export async function fetchDeepScanStatus({ clientId, repository, platform, branch }, signal) {
  const params = { client_id: clientId, repository };
  if (platform) params.platform = platform;
  if (branch) params.branch = branch;
  const res = await client.get(`${CE}/deep-scan/status`, { params, signal });
  return res?.data ?? {};
}
