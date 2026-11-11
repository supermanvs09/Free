export function timeAgo(value) {
  if (!value) return 'Never';
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  if (seconds < 2592000) {
    const d = Math.round(seconds / 86400);
    return d === 1 ? 'Yesterday' : `${d} days ago`;
  }
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const plural = (n, one, many = `${one}s`) => `${Number(n || 0).toLocaleString()} ${n === 1 ? one : many}`;

export const SEVERITY_TONE = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };

export const DETECTOR_LABEL = {
  private_key: 'Private key',
  aws_secret_access_key: 'AWS secret access key',
  aws_access_key_id: 'AWS access key ID',
  github_token: 'GitHub token',
  github_fine_grained_token: 'GitHub fine-grained token',
  stripe_live_key: 'Stripe live key',
  slack_token: 'Slack token',
  slack_webhook: 'Slack webhook URL',
  google_api_key: 'Google API key',
  jwt: 'JSON Web Token',
  password_assignment: 'Hard-coded password or key',
};

export const SOURCE_LABEL = { github: 'GitHub', bitbucket: 'Bitbucket', jenkins: 'Jenkins' };
