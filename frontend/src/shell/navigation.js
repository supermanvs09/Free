import {
  Activity,
  BellRing,
  FileWarning,
  Fingerprint,
  Gauge,
  Inbox,
  KeyRound,
  ListChecks,
  Plug,
  ScrollText,
  ShieldCheck,
  UsersRound,
  Waypoints,
  Workflow,
  Wrench,
} from 'lucide-react';

/**
 * Information architecture, in the order an operator works: see the estate,
 * investigate what is wrong, respond, and configure what feeds it. `badge`
 * names a live count shown on the item.
 */
export const NAV_GROUPS = [
  {
    key: 'overview',
    label: 'Overview',
    items: [{ to: '/overview', label: 'Dashboard', icon: Gauge, end: true }],
  },
  {
    key: 'investigate',
    label: 'Investigate',
    items: [
      { to: '/detections', label: 'Detections', icon: BellRing, badge: 'detections' },
      { to: '/findings', label: 'Posture findings', icon: ShieldCheck },
      { to: '/exposure', label: 'Leaked secrets', icon: FileWarning, badge: 'exposure' },
      { to: '/access-graph', label: 'Attack paths', icon: Waypoints },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    items: [
      { to: '/identities', label: 'Identities', icon: Fingerprint },
      { to: '/credentials', label: 'Credentials', icon: KeyRound },
    ],
  },
  {
    key: 'respond',
    label: 'Respond',
    items: [
      { to: '/remediation', label: 'Remediation', icon: Wrench, badge: 'approvals' },
      { to: '/tickets', label: 'Jira issues', icon: ListChecks, badge: 'tickets' },
      { to: '/inbox', label: 'Inbox', icon: Inbox, badge: 'mail' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [
      { to: '/integrations', label: 'Integrations', icon: Plug },
      { to: '/automations', label: 'Automations', icon: Workflow },
      { to: '/settings/team', label: 'Team', icon: UsersRound },
      { to: '/audit-log', label: 'Audit log', icon: ScrollText },
    ],
  },
];

export const ACTIVITY_ICON = Activity;

export function isActiveItem(item, pathname) {
  const paths = item.match ?? [item.to];
  return paths.some((p) => pathname === p || (!item.end && pathname.startsWith(`${p}/`)));
}

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));

export const BREADCRUMBS = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.to, [g.label, i.label]])));

export const BREADCRUMB_PREFIXES = [
  { prefix: '/identities/', trail: ['Inventory', 'Identities', 'Identity'] },
  { prefix: '/access-graph/', trail: ['Investigate', 'Attack paths', 'Identity'] },
];
