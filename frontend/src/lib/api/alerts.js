import client from './client';
import { unwrapMain } from './http';

/*
 * Alerts inbox (nhi-backend internal/modules/alerts), scoped to the signed-in user:
 *
 *   GET  /api/v1/alerts                     posture, genome and exposure alerts with triage
 *   GET  /api/v1/alerts/summary             counts behind the navigation badge
 *   POST /api/v1/alerts/triage              { keys, status?, note? }
 *   GET  /api/v1/alerts/activity?key=       history and comments of one alert
 *   GET  /api/v1/alerts/identities/{id}     why one identity's score dropped
 */
const BASE = '/api/v1/alerts';

export const fetchAlerts = async (signal) => unwrapMain(await client.get(BASE, { signal }));
export const fetchAlertsSummary = async (signal) => unwrapMain(await client.get(`${BASE}/summary`, { signal }));
export const fetchIdentityAlert = async (id, signal) => unwrapMain(await client.get(`${BASE}/identities/${encodeURIComponent(id)}`, { signal }));
export const fetchAlertActivity = async (key, signal) => unwrapMain(await client.get(`${BASE}/activity`, { params: { key }, signal })) ?? [];

/** Move or comment on alerts. */
export async function triageAlerts({ keys, status, note }) {
  const body = { keys };
  if (status !== undefined) body.status = status;
  if (note) body.note = note;
  return unwrapMain(await client.post(`${BASE}/triage`, body));
}
