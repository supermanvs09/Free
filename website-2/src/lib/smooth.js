/* Smooth, eased wheel scrolling (Lenis), the way award-winning sites feel.
   Desktop pointers only: touch keeps its native momentum. Off for reduced
   motion. Stands aside whenever a dialog has locked the page (html or body
   overflow: hidden), inside dialogs and menus, and for any element that
   scrolls on its own (tab rows, code, tables). Everything that scrolls the
   page from code goes through scrollToY, so it glides the same way. */
let lenis = null;
const listeners = new Set();
/* call fn on every smooth-scroll frame (ScrollTrigger keeps in step); returns an unsubscribe */
export function onSmoothScroll(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function scrollToY(top, { instant = false } = {}) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (lenis) lenis.scrollTo(top, { immediate: instant || reduce, duration: 1.1 });
  else window.scrollTo({ top, left: 0, behavior: instant || reduce ? 'instant' : 'smooth' });
}

export async function bootSmooth() {
  if (lenis || typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(pointer: fine)').matches) return;
  const { default: Lenis } = await import('lenis');
  const locked = () => document.documentElement.style.overflow === 'hidden' || document.body.style.overflow === 'hidden';
  lenis = new Lenis({
    lerp: 0.1,
    smoothWheel: true,
    allowNestedScroll: true,
    prevent: (node) => !!node.closest?.('[role="dialog"], [aria-modal="true"], .mega, [data-lenis-prevent]'),
    virtualScroll: () => !locked(),
  });
  lenis.on('scroll', () => listeners.forEach((f) => f()));
  const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

/* Magnetic buttons: a primary button leans a few pixels towards the pointer,
   and settles back when it leaves. Desktop pointers only; off for reduced motion. */
export function bootMagnet() {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches) return;
  let cur = null;
  const settle = (el) => { if (el) el.style.translate = ''; };
  document.addEventListener('pointermove', (e) => {
    const b = e.target.closest?.('.dx-btn, .btn-primary, .btn-white');
    if (b !== cur) { settle(cur); cur = b; }
    if (!b) return;
    const r = b.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / r.width, y = (e.clientY - (r.top + r.height / 2)) / r.height;
    b.style.translate = `${(x * 8).toFixed(1)}px ${(y * 6).toFixed(1)}px`;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { settle(cur); cur = null; });
}
