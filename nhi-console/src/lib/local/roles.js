export const ROLE_CAPS = {
  admin: ['read', 'export', 'write', 'operate', 'approve', 'policies', 'integrations', 'exposure', 'users', 'audit.all'],
  operator: ['read', 'export', 'approve', 'policies', 'audit.all'],
  analyst: ['read', 'export', 'write', 'operate'],
  viewer: ['read', 'export'],
};

export const ROLE_LIST = [
  { key: 'admin', label: 'Admin', summary: 'Everything, including integrations, exposed credentials and managing users.', capabilities: ROLE_CAPS.admin },
  { key: 'operator', label: 'Operator', summary: 'Reads everything, gives the second approval and maintains policies.', capabilities: ROLE_CAPS.operator },
  { key: 'analyst', label: 'Analyst', summary: 'Investigates and works findings, anomalies and remediation plans.', capabilities: ROLE_CAPS.analyst },
  { key: 'viewer', label: 'Viewer', summary: 'Read-only across posture, inventory, access and activity.', capabilities: ROLE_CAPS.viewer },
];

export const can = (user, cap) => (ROLE_CAPS[user?.role] ?? []).includes(cap);
