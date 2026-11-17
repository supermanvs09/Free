import { useWorkspace } from './WorkspaceContext';

/**
 * The "AWS account" filter group every filter rail leads with.
 *
 *   selected    account ids currently applied
 *   onToggle    (id) => add or remove one
 *   onSelectAll (ids) => replace the selection (an empty list clears it)
 *
 * The accounts are the workspace's connected AWS accounts. Null when there is
 * nothing to choose between yet, so a rail never shows an empty group.
 */
export function useAccountGroup({ selected, onToggle, onSelectAll }) {
  const { integration } = useWorkspace();
  const ids = [...new Set((integration?.accounts ?? []).filter((account) => account.isConnected).map((account) => account.accountId))];
  if (ids.length === 0) return null;
  return {
    key: 'accounts',
    label: 'AWS account',
    options: ids.map((id) => ({ value: id, label: id, active: selected.includes(id) })),
    onToggle,
    onSelectAll,
  };
}

/** Keeps only well-formed 12-digit ids from a comma list in the URL. */
export const accountIdsOf = (raw) =>
  String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^\d{12}$/.test(entry));
