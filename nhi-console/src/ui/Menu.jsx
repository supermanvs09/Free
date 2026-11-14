import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from './cn';

const GAP = 4; // px between the button and the menu
const EDGE = 8; // px the menu keeps from the window's edges

/**
 * Small anchored action menu for table rows. The list is drawn in a layer on
 * top of the page (a portal with fixed position), so a panel that clips its
 * content (rounded corners, a horizontally scrolling table) can never hide it:
 * a lone row or the last row used to open a menu nobody could see. It opens
 * below the button, or above it when there is no room below.
 *
 * Closes on outside click, Escape, Tab, scroll and resize, and on selection.
 * Arrow keys, Home and End move between items; Escape returns focus to the
 * button. Items are plain buttons so keyboard users get them for free.
 */
export function Menu({ items, label = 'Row actions', icon: Icon = MoreHorizontal, align = 'end', outlined = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const id = useId();

  const close = (returnFocus = false) => {
    setOpen(false);
    setPosition(null);
    if (returnFocus) buttonRef.current?.focus();
  };

  /* Measured after render, before paint: the list is drawn hidden first, then
     placed against the button and the window. */
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = buttonRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    const { offsetWidth: width, offsetHeight: height } = menu;
    let left = align === 'end' ? anchor.right - width : anchor.left;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE));
    let top = anchor.bottom + GAP;
    if (top + height > window.innerHeight - EDGE && anchor.top - GAP - height >= EDGE) {
      top = anchor.top - GAP - height;
    }
    setPosition({ top, left });
  }, [open, align]);

  /* Once placed, the first item takes focus so the keyboard can carry on. */
  useEffect(() => {
    if (!open || !position) return;
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }, [open, position]);

  useEffect(() => {
    if (!open) return undefined;
    const inside = (target) => buttonRef.current?.contains(target) || menuRef.current?.contains(target);
    const onPointerDown = (event) => {
      if (!inside(event.target)) close();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close(true);
    };
    /* A fixed list would float away from its row on scroll, so it closes. */
    const onScroll = (event) => {
      if (!menuRef.current?.contains(event.target)) close();
    };
    const onResize = () => close();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  const onMenuKeyDown = (event) => {
    const buttons = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') ?? [])];
    if (buttons.length === 0) return;
    const at = buttons.indexOf(document.activeElement);
    const go = (index) => {
      event.preventDefault();
      buttons[(index + buttons.length) % buttons.length].focus();
    };
    if (event.key === 'ArrowDown') go(at + 1);
    else if (event.key === 'ArrowUp') go(at - 1);
    else if (event.key === 'Home') go(0);
    else if (event.key === 'End') go(buttons.length - 1);
    else if (event.key === 'Tab') close();
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (open) close();
          else setOpen(true);
        }}
        className={cn(
          'grid size-8 place-items-center rounded-md text-ink-3 transition-colors',
          outlined && 'border border-line bg-surface shadow-xs',
          open ? 'bg-surface-3 text-ink' : 'hover:bg-surface-3 hover:text-ink-2',
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onMenuKeyDown}
            /* Clicks inside still bubble to React parents through the portal
               (a table row would open its record); stop them here. */
            onClick={(event) => event.stopPropagation()}
            style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: 'hidden' }}
            className="animate-pop fixed z-[90] min-w-52 overflow-hidden rounded-[var(--radius-control)] border border-line bg-surface p-1 shadow-lg"
          >
            {visible.map((item) => (
              <button
                key={item.key || item.label}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  close();
                  item.onSelect?.();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors outline-none focus-visible:bg-surface-3 focus-visible:text-ink',
                  item.tone === 'critical' ? 'text-critical' : 'text-ink-2',
                  item.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-surface-3 hover:text-ink',
                )}
              >
                {item.icon && <item.icon aria-hidden="true" className="size-4 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
