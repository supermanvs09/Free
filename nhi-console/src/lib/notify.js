/*
 * The one thing that leaves the browser: notifications. Email goes to the
 * notification relay that runs beside the console (server/notify-relay.mjs),
 * which sends it through Amazon SES with the role of the service it runs in;
 * Jira issues go through the same relay, because Jira Cloud does not accept
 * calls from a browser on another site.
 *
 *   POST {RELAY}/email        { to[], subject, text, html }
 *   POST {RELAY}/jira/test    { site_url, email, api_token, project_key }
 *   POST {RELAY}/jira/issue   { site_url, email, api_token, project_key, issue_type, summary, description, priority, labels }
 *   GET  {RELAY}/health       { ok, from, region, jira_server_token }
 */
const RELAY = (import.meta.env.VITE_NOTIFY_API || '/notify-api').replace(/\/+$/, '');

async function call(path, body, { method = 'POST', timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${RELAY}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      signal: controller.signal,
      credentials: 'same-origin',
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text.slice(0, 200) };
    }
    if (!res.ok || data.ok === false) {
      const unreachable = res.status === 502 || res.status === 503 || res.status === 504 || (res.status === 404 && !data.error);
      return {
        ok: false,
        status: res.status,
        unreachable,
        message: unreachable ? 'The notification relay is not running next to the console.' : data.message || `The relay answered ${res.status}.`,
        code: data.error || '',
      };
    }
    return { ok: true, status: res.status, ...data };
  } catch (error) {
    return { ok: false, status: null, unreachable: true, message: error?.name === 'AbortError' ? 'The notification relay did not answer in time.' : 'The notification relay could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}

export const relayHealth = () => call('/health', null, { method: 'GET', timeout: 6000 });
export const sendEmail = (message) => call('/email', message);
export const testJira = (config) => call('/jira/test', config);
export const createJiraIssue = (issue) => call('/jira/issue', issue);
