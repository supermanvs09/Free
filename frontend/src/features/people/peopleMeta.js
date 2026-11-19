/** Shared words and rules for the People screens. */

export const SOURCE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'iam', label: 'AWS IAM' },
  { value: 'sso', label: 'Single sign-on' },
];

// The API filter takes source=sso, but rows carry the stored value identity_center.
export const SOURCE_LABEL = { iam: 'AWS IAM', sso: 'Single sign-on', identity_center: 'Single sign-on' };

export const HUMAN_TYPE_LABEL = {
  ROOT_USER: 'Root user',
  IAM_CONSOLE_HUMAN: 'Console user',
  IAM_USER_HUMAN: 'IAM user, no console',
  SSO_HUMAN: 'SSO user',
};
export const humanTypeLabel = (t) => HUMAN_TYPE_LABEL[t] ?? String(t || '').replace(/_/g, ' ').toLowerCase();

export const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'disabled', label: 'Disabled' },
];

/* The list's risk= values (the backend's shared risk rules), worst first. */
export const RISK_OPTIONS = [
  { value: 'console_no_mfa', label: 'Console access without MFA' },
  { value: 'admin', label: 'Admin-level access' },
  { value: 'escalation', label: 'Privilege escalation risk' },
  { value: 'virtual_mfa_admin', label: 'Admin with only virtual MFA' },
  { value: 'login_without_mfa', label: 'Signed in without MFA (90 days)' },
  { value: 'failed_login', label: 'Failed sign-in (7 days)' },
  { value: 'old_access_key', label: 'Access key older than 90 days' },
  { value: 'unused_access_key', label: 'Access key never used' },
  { value: 'two_active_keys', label: 'Two active access keys' },
  { value: 'old_password', label: 'Password older than 90 days' },
  { value: 'password_never_changed', label: 'Password never changed' },
  { value: 'inactive_90d', label: 'Inactive 90+ days' },
  { value: 'never_used', label: 'Never signed in' },
];

/** "PT8H" / "PT1H30M" -> "8h" / "1h 30m"; anything else as given. */
export function sessionLength(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(String(iso ?? '').trim());
  if (!m || (!m[1] && !m[2])) return iso;
  return [m[1] && `${m[1]}h`, m[2] && `${m[2]}m`].filter(Boolean).join(' ');
}

export const MFA_OPTIONS = [
  { value: '', label: 'Any MFA' },
  { value: 'true', label: 'MFA on' },
  { value: 'false', label: 'MFA off' },
];

/* What the API sorts by; `dir` is the direction a field starts in. Score sorts
   lowest first: the people who need attention come first. */
export const SORT_FIELDS = [
  { value: 'last_activity_at', label: 'Last active', dir: 'desc' },
  { value: 'name', label: 'Name', dir: 'asc' },
  { value: 'email', label: 'Email', dir: 'asc' },
  { value: 'status', label: 'Status', dir: 'asc' },
  { value: 'mfa', label: 'MFA', dir: 'asc' },
  { value: 'score', label: 'Security score', dir: 'asc' },
  { value: 'created_at', label: 'Newest account', dir: 'desc' },
];
export const DEFAULT_SORT = 'last_activity_at:desc';

/** "field:dir" from the address, or the default when it is not one the API takes. */
export function readSort(raw) {
  const [field, dir] = String(raw ?? '').split(':');
  return SORT_FIELDS.some((f) => f.value === field) && (dir === 'asc' || dir === 'desc') ? raw : DEFAULT_SORT;
}

/** Column key -> API sort field, for the sortable headers. */
export const COLUMN_SORT = { person: 'name', status: 'status', mfa: 'mfa', score: 'score', last: 'last_activity_at' };

export function statusMeta(status) {
  switch (String(status ?? '').toLowerCase()) {
    case 'active':
      return { label: 'Active', tone: 'low' };
    case 'inactive':
      return { label: 'Inactive', tone: 'medium' };
    case 'suspended':
      return { label: 'Suspended', tone: 'high' };
    case 'disabled':
      return { label: 'Disabled', tone: 'neutral' };
    default:
      return { label: status ? String(status) : 'Unknown', tone: 'neutral' };
  }
}

/** The name a person goes by: display name, then user name, then email. */
export function personName(row) {
  return row.display_name || row.user_name || row.email || 'Unnamed';
}

export function initialsOf(name) {
  const parts = String(name ?? '')
    .replace(/@.*$/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** A stable hue per person, so the same person always has the same avatar. */
export function avatarHue(seed) {
  let h = 0;
  for (const ch of String(seed ?? '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Whole days since a date, or null when there is none. */
export function daysSince(value) {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null;
}
