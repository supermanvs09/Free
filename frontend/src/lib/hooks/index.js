import { useEffect, useRef, useState } from 'react';

export { useQuery, useMutation } from './useQuery';
export { usePopover } from './usePopover';
export { useContainedScroll } from './useContainedScroll';

export function useDebouncedValue(value, delay = 320) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/* How many overlays hold the scroll lock right now. A counter, not a saved
   value: with a confirmation dialog open over a drawer, each one used to save
   and restore `overflow`, and closing them in the "wrong" order restored
   `hidden` - leaving the page under them unable to scroll once both were gone.
   It also clears on navigation, so a drawer left open by a route change can
   never strand the next screen. */
let scrollLocks = 0;

function applyScrollLock() {
  document.body.style.overflow = scrollLocks > 0 ? 'hidden' : '';
}

/** Locks scroll while a modal/drawer owns the viewport. */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    scrollLocks += 1;
    applyScrollLock();
    return () => {
      scrollLocks = Math.max(0, scrollLocks - 1);
      applyScrollLock();
    };
  }, [active]);
}

export function useEventListener(target, type, handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const node = typeof target === 'function' ? target() : target;
    if (!node) return undefined;
    const listener = (event) => handlerRef.current(event);
    node.addEventListener(type, listener);
    return () => node.removeEventListener(type, listener);
  }, [target, type]);
}

/** Traps Tab inside a container and restores focus on unmount. */
export function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active) return undefined;
    const previouslyFocused = document.activeElement;
    const container = containerRef.current;
    if (!container) return undefined;

    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusables = () => Array.from(container.querySelectorAll(selector)).filter((el) => el.offsetParent !== null);
    const first = focusables()[0];
    (first || container).focus?.();

    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [containerRef, active]);
}

