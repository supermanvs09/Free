import client from './client';
import { unwrapMain } from './http';

/*
 * Alerts inbox (nhi-backend internal/modules/alerts), scoped to the signed-in user:
 *
 *   GET  /api/v1/alerts                     posture, genome and exposure alerts (read-only)
 *   GET  /api/v1/alerts/summary             counts behind the navigation badge
 *   GET  /api/v1/alerts/identities/{id}     why one identity's score dropped
 */
const BASE = '/api/v1/alerts';

export const fetchAlerts = async (signal) => unwrapMain(await client.get(BASE, { signal }));
export const fetchAlertsSummary = async (signal) => unwrapMain(await client.get(`${BASE}/summary`, { signal }));
export const fetchIdentityAlert = async (id, signal) => unwrapMain(await client.get(`${BASE}/identities/${encodeURIComponent(id)}`, { signal }));
