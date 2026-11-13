import {
  Activity,
  Dna,
  Waypoints,
  FileWarning,
  Fingerprint,
  Gauge,
  // History, - reinstate with the Scans nav item
  Plug,
  ScrollText,
  UsersRound,
  ShieldCheck,
  Wrench,
} from 'lucide-react';

/**
 * Information architecture: two short lists, no folders. Overview is every
 * screen that reads the estate, in the order an operator works through it:
 * how exposed (Dashboard, Posture, Remediation), what exists (Discovery: its
 * identities and credentials as tabs), what leaked (Credential exposure, with
 * the findings marked safe inside it), what it could do (Access graph), what
 * it did (NHI Genome, Activity). Settings is the one place that changes how
 * the estate is collected. Users & roles and the audit log live in the
 * profile menu, not here.
 *
 * `match` lists the paths an item stands for when it is more than its own
 * (Discovery is /identities and /credentials).
 */
export const NAV_GROUPS = [
  {
    key: 'overview',
    label: 'Overview',
    items: [
      { to: '/overview', label: 'Dashboard', icon: Gauge, end: true },
      { to: '/posture', label: 'Posture', icon: ShieldCheck },
      { to: '/remediation', label: 'Remediation', icon: Wrench },
      { to: '/identities', label: 'Discovery', icon: Fingerprint, match: ['/identities', '/credentials', '/discovery'] },
      /* Shown once a code source is switched on (`feature: 'exposure'`). */
      { to: '/exposure', label: 'Credential exposure', icon: FileWarning, permission: 'exposure.view', feature: 'exposure' },
      /* Separate from the genome on purpose: the genome is what an identity
         has done, the graph what it could do. */
      { to: '/access-graph', label: 'Access graph', icon: Waypoints },
      { to: '/genome', label: 'NHI Genome', icon: Dna },
      { to: '/activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [{ to: '/integrations', label: 'Integrations', icon: Plug }],
  },
];

/* Reached from the profile menu, not the rail; listed for search and breadcrumbs. */
export const PROFILE_ITEMS = [
  { to: '/settings/users', label: 'Users & roles', icon: UsersRound, permission: 'users.manage' },
  { to: '/audit-log', label: 'Audit log', icon: ScrollText },
];

/** Whether item stands for the screen at pathname. */
export function isActiveItem(item, pathname) {
  const paths = item.match ?? [item.to];
  return paths.some((p) => pathname === p || (!item.end && pathname.startsWith(`${p}/`)));
}

/**
 * The navigation a role can use: items it lacks the permission for, items
 * whose feature the workspace has not switched on, and groups left empty,
 * removed. `features` is `{ exposure: boolean }`.
 */
export function navGroupsFor(can, role, features = {}) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => (!item.permission || can(item.permission)) && (!item.feature || features[item.feature]))
      .map((item) => ({ ...item, label: item.roleLabels?.[role] ?? item.label })),
  })).filter((group) => group.items.length > 0);
}

export const ALL_NAV_ITEMS = [
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label || 'Overview' }))),
  ...PROFILE_ITEMS.map((item) => ({ ...item, group: 'Settings' })),
];

/**
 * Breadcrumb trail per route. A console is a place people get lost in, so
 * every screen states where it sits. Kept as data rather than derived from the
 * path so the labels match the navigation exactly.
 */
export const BREADCRUMBS = {
  '/overview': ['Overview', 'Dashboard'],
  '/posture': ['Overview', 'Posture'],
  '/remediation': ['Overview', 'Remediation'],
  '/identities': ['Overview', 'Discovery', 'Identities'],
  '/credentials': ['Overview', 'Discovery', 'Credentials'],
  '/exposure': ['Overview', 'Credential exposure'],
  '/exposure/dismissed': ['Overview', 'Credential exposure', 'Marked safe'],
  '/access-graph': ['Overview', 'Access graph'],
  '/genome': ['Overview', 'NHI Genome'],
  '/activity': ['Overview', 'Activity'],
  '/integrations': ['Settings', 'Integrations'],
  '/settings/users': ['Settings', 'Users & roles'],
  '/audit-log': ['Settings', 'Audit log'],
};

/**
 * Breadcrumbs for routes with a parameter. Matched by prefix after the exact
 * table misses, so a record screen still says where it sits.
 */
export const BREADCRUMB_PREFIXES = [
  { prefix: '/posture/', trail: ['Overview', 'Posture', 'Identity'] },
  { prefix: '/scans/', trail: ['Overview', 'Dashboard', 'Scan changes'] },
  { prefix: '/identities/', trail: ['Overview', 'Discovery', 'Identity'] },
  { prefix: '/access-graph/', trail: ['Overview', 'Access graph', 'Identity'] },
  { prefix: '/genome/', trail: ['Overview', 'NHI Genome', 'Identity'] },
  { prefix: '/remediation/findings/', trail: ['Overview', 'Remediation', 'Finding'] },
  { prefix: '/remediation/plans/', trail: ['Overview', 'Remediation', 'Plan'] },
];
