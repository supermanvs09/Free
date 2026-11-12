import client from './client';

/*
 * GitHub and Bitbucket for the whole company (nhi-backend internal/modules/codesources):
 *
 *   GET    /api/v1/integrations/code-sources                 status of both
 *   POST   /api/v1/integrations/code-sources/github          { org }  verify the App, switch on
 *   DELETE /api/v1/integrations/code-sources/github          switch off
 *   POST   /api/v1/integrations/code-sources/bitbucket       { base_url, token, token_expires_at, ca_cert_pem }
 *   POST   /api/v1/integrations/code-sources/bitbucket/test  re-test
 *   DELETE /api/v1/integrations/code-sources/bitbucket       switch off
 *
 * Writes resolve to { ok, message, data } instead of throwing, so a failed
 * check can show what failed.
 */
const BASE = '/api/v1/integrations/code-sources';

export async function fetchCodeSources(signal) {
  const res = await client.get(BASE, { signal });
  return res.data?.data ?? {};
}

async function write(method, path, body) {
  const res = await client.request({ method, url: `${BASE}${path}`, data: body, timeout: 60000, validateStatus: () => true });
  const payload = res.data && typeof res.data === 'object' ? res.data : {};
  return {
    ok: res.status >= 200 && res.status < 300 && payload.success !== false,
    message: payload.message || `The service answered ${res.status}.`,
    code: payload.error || '',
    data: payload.data ?? {},
  };
}

export const verifyGitHub = (org) => write('post', '/github', { org });
export const disconnectGitHub = () => write('delete', '/github');
export const saveBitbucket = (input) => write('post', '/bitbucket', input);
export const testBitbucket = () => write('post', '/bitbucket/test');
export const disconnectBitbucket = () => write('delete', '/bitbucket');
