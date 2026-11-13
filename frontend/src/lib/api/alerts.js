import client from './client';
import { unwrapMain } from './http';

/*
 * Alerts (nhi-backend internal/modules/alerts), scoped to the signed-in user:
 *
 *   GET /api/v1/alerts                     score drops at the latest sync + exposed credentials
 *   GET /api/v1/alerts/summary             the counts behind the navigation badge
 *   GET /api/v1/alerts/identities/{id}     why one identity's score dropped
 */
const BASE = '/api/v1/alerts';

export async function fetchAlerts(signal) {
  return unwrapMain(await client.get(BASE, { signal }));
}

export async function fetchAlertsSummary(signal) {
  return unwrapMain(await client.get(`${BASE}/summary`, { signal }));
}

export async function fetchIdentityAlert(id, signal) {
  return unwrapMain(await client.get(`${BASE}/identities/${encodeURIComponent(id)}`, { signal }));
}
