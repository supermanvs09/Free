import client from './client';
import { unwrapMain } from './http';
import { refreshEverywhere } from '../local/state';

/*
 * Response actions and live scenarios (lib/local/routes/response.js). Every
 * change lands in the shared workspace, so the effect shows for everyone.
 */
const enc = encodeURIComponent;

/* Same-browser screens refresh at once; other browsers follow over the live stream. */
const changed = () => {
  window.dispatchEvent(new CustomEvent('response:changed'));
  refreshEverywhere();
};
const act = async (promise) => {
  const data = unwrapMain(await promise);
  changed();
  return data;
};

export const fetchInsights = async (id, signal) => unwrapMain(await client.get(`/api/v1/response/identities/${enc(id)}`, { signal }));
export const fetchLeastPrivilege = async (id, signal) => unwrapMain(await client.get(`/api/v1/response/identities/${enc(id)}/least-privilege`, { signal }));
export const rightSize = (id) => act(client.post(`/api/v1/response/identities/${enc(id)}/right-size`, {}));
export const deactivateKey = (credentialId) => act(client.post(`/api/v1/response/keys/${enc(credentialId)}/deactivate`, {}));
export const breakLink = (linkId) => act(client.post('/api/v1/response/links/break', { link_id: linkId }));
export const fetchCredentialStanding = async (id, signal) => unwrapMain(await client.get(`/api/v1/response/credentials/${enc(id)}`, { signal }));
export const deleteRole = (id) => act(client.post(`/api/v1/response/credentials/${enc(id)}/delete`, {}));
export const fetchScenarios = async (signal) => unwrapMain(await client.get('/api/v1/scenarios', { signal }))?.scenarios ?? [];
export const runScenario = (key) => act(client.post(`/api/v1/scenarios/${enc(key)}/run`, {}));
export const setPresenting = async (seconds) => unwrapMain(await client.post('/api/v1/scenarios/presenting', { seconds }));
export const resetScenario = (key = 'all') => act(client.post(`/api/v1/scenarios/${enc(key)}/reset`, {}));

/** Refetch when a response happened in this browser. */
export function onResponseChange(fn) {
  window.addEventListener('response:changed', fn);
  return () => window.removeEventListener('response:changed', fn);
}
