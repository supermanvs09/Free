/**
 * Console roles and what each one may do.
 *
 * The rules live on the server (nhi-backend internal/platform/authz): four
 * roles, each holding a set of capabilities, and every API route needing one
 * capability. `/me` returns the signed-in person's role and capabilities, and
 * the screens decide what to offer from those - so a button is shown exactly
 * when the API will allow it, and a change to the rules on the server needs no
 * change here.
 *
 * The console asks for permissions by name (`integrations.manage`); each name
 * maps onto the server capability that gates it. The static table below is a
 * fallback for a server that does not return capabilities yet, and it mirrors
 * the server's matrix.
 */

export const ROLES = {
  admin: {
    key: 'admin',
    label: 'Admin',
    rank: 4,
    summary: 'Everything, including connecting AWS accounts, exposed credentials and managing users.',
  },
  operator: {
    key: 'operator',
    label: 'Operator',
    rank: 3,
    summary: 'Reads everything, gives the second approval (remediation plans) and maintains policies. Does not change findings itself.',
  },
  analyst: {
    key: 'analyst',
    label: 'Analyst',
    rank: 2,
    summary: 'Investigates and works findings: posture, anomalies, remediation plans, scans. No integrations or user management.',
  },
  viewer: {
    key: 'viewer',
    label: 'Viewer',
    rank: 1,
    summary: 'Read-only: posture, inventory, access, behaviour and activity. Can export tables.',
  },
};

export const ROLE_ORDER = ['admin', 'operator', 'analyst', 'viewer'];

/** The server's capabilities, in words (for the Roles & permissions matrix). */
export const CAPABILITIES = [
  { key: 'read', label: 'View posture, inventory, access, behaviour and activity' },
  { key: 'export', label: 'Export tables to CSV' },
  { key: 'write', label: 'Work findings and anomalies, create and run remediation plans' },
  { key: 'operate', label: 'Run discovery and posture scans' },
  { key: 'approve', label: 'Approve or reject remediation plans (second review)' },
  { key: 'policies', label: 'Maintain allowlists and suppressions' },
  { key: 'exposure', label: 'See and review exposed credentials (secrets found in code)' },
  { key: 'integrations', label: 'Connect and remove AWS accounts, code scanning, remediation settings' },
  { key: 'users', label: 'Add people, change roles, reset passwords, deactivate accounts' },
  { key: 'audit.all', label: "Read everyone's actions in the audit log (others see their own)" },
];

/* Mirrors internal/platform/authz grants; used only when /me carries none. */
const STATIC_GRANTS = {
  admin: ['read', 'export', 'write', 'operate', 'approve', 'policies', 'integrations', 'exposure', 'users', 'audit.all'],
  operator: ['read', 'export', 'approve', 'policies', 'audit.all'],
  analyst: ['read', 'export', 'write', 'operate'],
  viewer: ['read', 'export'],
};

/** Console permission -> the server capability that gates it. */
const PERMISSION_CAPABILITY = {
  'data.view': 'read',
  'data.export': 'export',
  'alerts.view': 'read',
  'alerts.viewAll': 'read',
  'alerts.work': 'write',
  'alerts.take': 'write',
  'alerts.assign': 'write',
  'alerts.dismiss': 'write',
  'alerts.bulk': 'write',
  'anomalies.review': 'write',
  'exposure.view': 'exposure',
  'exposure.deepScan': 'exposure',
  'exposure.review': 'exposure',
  'posture.findings': 'write',
  'reports.generate': 'write',
  'reports.schedule': 'policies',
  'integrations.operate': 'integrations',
  'integrations.manage': 'integrations',
  'scan.run': 'operate',
  'users.manage': 'users',
  'audit.all': 'audit.all',
  'remediation.plan': 'write',
  'remediation.execute': 'write',
  'remediation.approve': 'approve',
  'remediation.settings': 'integrations',
};

/** The console role for a role name from the server (aliases folded in). */
export function consoleRole(serverRole) {
  switch (String(serverRole || '').trim().toLowerCase()) {
    case 'admin':
    case 'super_admin':
    case 'superadmin':
    case 'super admin':
    case 'owner':
    case 'administrator':
      return 'admin';
    case 'operator':
    case 'approver':
    case 'reviewer':
    case 'manager':
      return 'operator';
    case 'analyst':
    case 'security':
      return 'analyst';
    default:
      return 'viewer';
  }
}

export function roleMeta(role) {
  return ROLES[consoleRole(role)] ?? ROLES.viewer;
}

/** The capabilities a role holds without asking the server. */
export function staticCapabilities(role) {
  return STATIC_GRANTS[consoleRole(role)] ?? STATIC_GRANTS.viewer;
}

/**
 * Whether the person may do `permission`. `capabilities` is what /me
 * returned; without it the static table for the role decides. Unknown
 * permissions are refused.
 */
export function roleCan(role, permission, capabilities) {
  const capability = PERMISSION_CAPABILITY[permission];
  if (!capability) return false;
  const held = Array.isArray(capabilities) && capabilities.length > 0 ? capabilities : staticCapabilities(role);
  return held.includes(capability);
}

/** The least-privileged role that holds `permission`, for "needs X" hints. */
export function minimumRoleFor(permission) {
  const capability = PERMISSION_CAPABILITY[permission];
  return [...ROLE_ORDER].reverse().find((role) => STATIC_GRANTS[role].includes(capability)) ?? 'admin';
}

/** Where a role lands after signing in. */
export function homeFor() {
  return '/overview';
}

/** One sentence for a disabled control: why it is disabled and who can. */
export function deniedReason(permission) {
  const needed = minimumRoleFor(permission);
  if (needed === 'admin') return 'Only an admin can do this.';
  const holders = ROLE_ORDER.filter((role) => STATIC_GRANTS[role].includes(PERMISSION_CAPABILITY[permission])).map((role) => ROLES[role].label);
  return `Needs one of these roles: ${holders.join(', ')}.`;
}

/** A refusal shaped like the API's, so screens handle it as a 403. */
export function forbidden(permission) {
  const error = new Error(`Your role does not allow this. ${deniedReason(permission)}`);
  error.status = 403;
  error.code = 'FORBIDDEN';
  return error;
}
