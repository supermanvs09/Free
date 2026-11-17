import { ownerName } from './meta';

/** The Owner column: the owner's name, as recorded on the identity. */
export function OwnerCell({ owner }) {
  if (!owner) return <span className="block truncate text-[12.5px] text-ink-3 italic">No owner</span>;
  return (
    <span className="block truncate text-[12.5px] text-ink-2" title={owner}>
      {ownerName(owner)}
    </span>
  );
}
