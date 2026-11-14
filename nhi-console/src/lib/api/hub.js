import client from './client';
import { unwrapMain } from './http';

/*
 * The application hub: which applications are connected and switched on,
 * their connections, and the notification channels.
 *
 *   GET  /api/v1/integrations                         every application with its state
 *   PUT  /api/v1/integrations/{app}                   { enabled } and/or { settings }
 *   GET  /api/v1/integrations/{azure|jenkins|vault}/connections
 *   POST /api/v1/integrations/{azure|jenkins|vault}/verify
 *   POST /api/v1/integrations/{app}/connections/{id}/sync
 *   DEL  /api/v1/integrations/{app}/connections/{id}
 *   POST /api/v1/integrations/{github|bitbucket}/verify
 *   GET  /api/v1/notifications/deliveries?channel=
 */
const enc = encodeURIComponent;

export async function fetchApps(signal) {
  return unwrapMain(await client.get('/api/v1/integrations', { signal }));
}
export async function setAppEnabled(key, enabled) {
  return unwrapMain(await client.put(`/api/v1/integrations/${enc(key)}`, { enabled }));
}
export async function saveAppSettings(key, settings) {
  return unwrapMain(await client.put(`/api/v1/integrations/${enc(key)}`, { settings }));
}
export async function fetchConnections(key, signal) {
  return unwrapMain(await client.get(`/api/v1/integrations/${enc(key)}/connections`, { signal }));
}
export async function verifyConnection(key, body) {
  return unwrapMain(await client.post(`/api/v1/integrations/${enc(key)}/verify`, body));
}
export async function syncConnection(key, id) {
  return unwrapMain(await client.post(`/api/v1/integrations/${enc(key)}/connections/${enc(id)}/sync`));
}
export async function removeConnection(key, id) {
  return unwrapMain(await client.delete(`/api/v1/integrations/${enc(key)}/connections/${enc(id)}`));
}
export async function verifyCodeSource(key, body) {
  return unwrapMain(await client.post(`/api/v1/integrations/${enc(key)}/verify`, body));
}
export async function fetchDeliveries(channel, signal) {
  return unwrapMain(await client.get('/api/v1/notifications/deliveries', { params: channel ? { channel } : {}, signal })).deliveries ?? [];
}
export async function fetchJiraCredentials(signal) {
  return unwrapMain(await client.get('/api/v1/integrations/jira/credentials', { signal }));
}
