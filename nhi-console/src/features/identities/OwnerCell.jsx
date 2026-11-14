import { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { FloatingPanel } from '../../ui/Floating';
import { ownerName } from './meta';

/**
 * The Owner column: the owner's name, and when the scanner inferred it rather
 * than reading an owner tag (it then sends owner_reason), a "Suggested" mark
 * with an info button that opens the full reason. The row behind opens the
 * identity, so the button keeps its click to itself.
 */
export function OwnerCell({ owner, reason }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  if (!owner) return <span className="block truncate text-[12.5px] text-ink-3 italic">No owner</span>;
  return (
    <span className="block min-w-0">
      <span className="block truncate text-[12.5px] text-ink-2" title={owner}>
        {ownerName(owner)}
      </span>
      {reason && (
        <span className="mt-0.5 flex items-center gap-1">
          <span className="rounded-full border border-info/30 bg-info-soft px-1.5 py-px text-[10.5px] font-medium text-brand">Suggested</span>
          <button
            ref={anchor}
            type="button"
            aria-label="Why this owner was suggested"
            aria-expanded={open}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((value) => !value);
            }}
            className="grid size-5 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <Info aria-hidden="true" className="size-3.5" />
          </button>
          <FloatingPanel anchorRef={anchor} open={open} onClose={() => setOpen(false)} align="start" role="dialog" aria-label="Why this owner was suggested" className="w-72">
            <div className="p-3" onClick={(event) => event.stopPropagation()}>
              <p className="text-[11.5px] font-semibold text-ink-2">Why this owner was suggested</p>
              <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-line text-ink">{reason}</p>
              <p className="mt-2 text-[11px] text-ink-3">No owner tag was found, so the scanner inferred this owner. Add an owner tag in AWS to make it definite.</p>
            </div>
          </FloatingPanel>
        </span>
      )}
    </span>
  );
}
