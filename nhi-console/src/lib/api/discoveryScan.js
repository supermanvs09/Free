import client from './client';

/*
 * The discovery scan behind "Sync now":
 *
 *   POST /scan-api/api/v1/scan/start      { account_ids: [...] }
 *   GET  /scan-api/api/v1/scan/status?scan_id=...
 *
 * Answers are read by their body, not their HTTP code:
 *
 *   started   { success: true, data: { scan_id, schema, accounts, status: "STARTED" } }
 *   running   { success: false, scan_id, started_at, elapsed, message }
 *   cooldown  { success: false, retry_after_minutes, message }
 */
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const any = { validateStatus: () => true };

export async function startDiscoveryScan(accountIds = []) {
  let response;
  try {
    response = await client.post('/scan-api/api/v1/scan/start', { account_ids: accountIds }, any);
  } catch {
    return { kind: 'error', unreachable: true, message: 'The scan service could not be reached.' };
  }
  const body = object(response.data);
  const data = object(body.data);
  if (body.success === true && data.scan_id) {
    return {
      kind: 'started',
      scanId: String(data.scan_id),
      schema: data.schema ? String(data.schema) : '',
      accounts: Array.isArray(data.accounts) ? data.accounts.map(String) : accountIds,
    };
  }
  if (body.success === false && body.scan_id) {
    return { kind: 'running', scanId: String(body.scan_id), startedAt: body.started_at ?? null, elapsed: body.elapsed ?? '', message: body.message ?? '' };
  }
  if (Number.isFinite(Number(body.retry_after_minutes))) {
    return { kind: 'cooldown', retryAfterMinutes: Math.max(1, Math.ceil(Number(body.retry_after_minutes))), message: body.message ?? '' };
  }
  return { kind: 'error', unreachable: false, message: body.message || `The scan service answered ${response.status}.` };
}

const FAILED = new Set(['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED', 'ABORTED', 'TIMEOUT', 'TIMED_OUT']);

export async function fetchDiscoveryScanStatus(scanId) {
  const response = await client.get('/scan-api/api/v1/scan/status', { params: { scan_id: scanId }, ...any });
  const body = object(response.data);
  const d = Object.keys(object(body.data)).length > 0 ? object(body.data) : body;
  const status = String(d.status || '').toUpperCase();
  const num = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value));
  const state = status === 'COMPLETED' ? 'completed' : FAILED.has(status) ? 'failed' : 'running';
  return {
    state,
    status,
    identities: num(d.total_identities),
    credentials: num(d.total_credentials),
    changes: num(d.total_changes),
    scanEnd: d.scan_end ?? null,
    message: typeof d.message === 'string' ? d.message : typeof d.error === 'string' ? d.error : '',
  };
}
