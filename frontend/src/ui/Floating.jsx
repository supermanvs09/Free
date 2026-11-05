import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

const GAP = 6; // px between the trigger and the panel
const EDGE = 8; // px the panel keeps from the window's edges
const MIN_USABLE = 140; // below this, opening upward is always better

/**
 * A panel anchored to a trigger, drawn in a layer above the page (a portal
 * with fixed position) so that no container can clip it.
 *
 * Toolbar popovers used to be absolutely positioned inside the record panel,
 * whose `overflow: hidden` (for its rounded corners) cut them off: on a short
 * or empty list the Table settings panel showed only its first line. Here the
 * panel opens below the trigger, or above it when there is more room there,
 * keeps to the window, follows the trigger while the page scrolls and closes
 * on an outside click or Escape.
 */
export function FloatingPanel({ anchorRef, open, onClose, align = 'end', className, children, ...rest }) {
  const panelRef = useRef(null);
  const [box, setBox] = useState(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const viewportH = window.visualViewport?.height ?? window.innerHeight;
    const width = panel.offsetWidth;
    let left = align === 'end' ? anchor.right - width : anchor.left;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE));
    const below = viewportH - anchor.bottom - GAP - EDGE;
    const above = anchor.top - GAP - EDGE;
    const natural = panel.scrollHeight;
    if (natural <= below || below >= MIN_USABLE || below >= above) {
      setBox({ left, top: anchor.bottom + GAP, maxHeight: Math.max(MIN_USABLE, below) });
    } else {
      const h = Math.min(natural, above);
      setBox({ left, top: anchor.top - GAP - h, maxHeight: above });
    }
  }, [anchorRef, align]);

  useLayoutEffect(() => {
    if (open) place();
    else setBox(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose?.();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
        anchorRef.current?.focus?.();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, onClose, place, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      {...rest}
      style={box ? { top: box.top, left: box.left, maxHeight: box.maxHeight } : { top: 0, left: 0, visibility: 'hidden' }}
      className={cn(
        'animate-pop fixed z-[80] flex flex-col overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-lg',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
