/**
 * The CSS zoom an element is drawn at (the console scales the whole page with
 * `zoom` on <html>). getBoundingClientRect() answers in screen pixels, but a
 * `top` / `left` / `max-height` written on a zoomed element is multiplied by
 * the zoom, so a popover placed from a measured rectangle must divide by it
 * or it lands short of its trigger.
 */
export function zoomOf(el) {
  if (!el) return 1;
  if (typeof el.currentCSSZoom === 'number' && el.currentCSSZoom > 0) return el.currentCSSZoom;
  /* Browsers without currentCSSZoom: compare drawn width to layout width. */
  const drawn = el.getBoundingClientRect().width;
  return el.offsetWidth > 0 && drawn > 0 ? drawn / el.offsetWidth : 1;
}
