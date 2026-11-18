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

export const MFA_OPTIONS = [
  { value: '', label: 'Any MFA' },
  { value: 'true', label: 'MFA on' },
  { value: 'false', label: 'MFA off' },
];

export const SORT_OPTIONS = [
  { value: 'last_activity_at:desc', label: 'Sort: Last active' },
  { value: 'name:asc', label: 'Sort: Name' },
  { value: 'email:asc', label: 'Sort: Email' },
  { value: 'status:asc', label: 'Sort: Status' },
  { value: 'mfa:asc', label: 'Sort: MFA' },
  { value: 'created_at:desc', label: 'Sort: Newest account' },
];

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
