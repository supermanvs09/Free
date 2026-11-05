import { useEffect } from 'react';

/**
 * Keeps a wheel or trackpad scroll that starts over `ref`'s element inside it.
 *
 * `overscroll-behavior: contain` already stops the page scrolling once a
 * scrolling panel reaches its end, but only while the panel actually
 * overflows: a sidebar or filter rail short enough to fit has no scroll range,
 * so the browser hands the wheel straight to the page and the content beside
 * it moves. This listener closes that gap: a wheel over the element scrolls
 * the element (or its own inner scroller) and never the page behind it.
 *
 * `scroller` picks the element that scrolls when it is not the element itself
 * (a selector looked up inside it). Nested scrollers that can still move
 * (a long facet list inside the rail) are left to the browser.
 */
export function useContainedScroll(ref, { scroller, enabled = true } = {}) {
  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return undefined;

    const onWheel = (event) => {
      if (event.ctrlKey) return; // pinch-zoom on a trackpad
      const target = scroller ? root.querySelector(scroller) ?? root : root;
      const delta = event.deltaY;
      if (delta === 0) return;

      /* An inner element that can still scroll in this direction handles it. */
      for (let node = event.target; node && node !== target && node !== root; node = node.parentElement) {
        if (canScroll(node, delta)) return;
      }
      if (canScroll(target, delta)) return; // the browser scrolls it; contain stops the chain
      event.preventDefault();
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [ref, scroller, enabled]);
}

function canScroll(node, delta) {
  if (!(node instanceof HTMLElement)) return false;
  const style = getComputedStyle(node);
  if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
  if (node.scrollHeight - node.clientHeight <= 1) return false;
  return delta < 0 ? node.scrollTop > 0 : node.scrollTop + node.clientHeight < node.scrollHeight - 1;
}
