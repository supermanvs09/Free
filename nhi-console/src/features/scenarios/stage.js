/*
 * The stage a replay is filmed on: a camera that moves in on the element a
 * beat is about, a spotlight around it, and a pointer that travels to a button
 * and clicks it for real. Everything is drawn in a layer outside the app
 * (#nhi-stage), so the camera can scale the app without scaling itself.
 */

const reduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let zoomed = false;
let layer = null;
let spot = null;
let pointer = null;

function ensureLayer() {
  if (layer && document.body.contains(layer)) return;
  layer = document.createElement('div');
  layer.id = 'nhi-stage';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:300;';
  spot = document.createElement('div');
  spot.style.cssText =
    'position:fixed;left:50%;top:50%;width:0;height:0;border-radius:18px;opacity:0;' +
    'box-shadow:0 0 0 4px color-mix(in oklab, var(--t-brand) 55%, transparent), 0 0 0 200vmax rgba(8,14,26,.38);' +
    'transition:opacity .45s ease, left .5s cubic-bezier(.22,1,.36,1), top .5s cubic-bezier(.22,1,.36,1), width .5s cubic-bezier(.22,1,.36,1), height .5s cubic-bezier(.22,1,.36,1);';
  pointer = document.createElement('div');
  pointer.style.cssText =
    'position:fixed;left:62vw;top:78vh;width:28px;height:28px;opacity:0;transform:translate(-4px,-3px);' +
    'transition:left .8s cubic-bezier(.65,0,.35,1), top .8s cubic-bezier(.65,0,.35,1), opacity .3s ease;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35));';
  pointer.innerHTML =
    '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2.5l15.5 9.2-6.9 1.5 3.9 7.3-2.9 1.5-3.9-7.3L4.9 19z" fill="#fff" stroke="#0b1220" stroke-width="1.4" stroke-linejoin="round"/></svg>' +
    '<span data-ring style="position:absolute;left:-14px;top:-14px;width:32px;height:32px;border-radius:999px;border:2px solid var(--t-brand);opacity:0;transform:scale(.4)"></span>';
  layer.append(spot, pointer);
  document.body.append(layer);
}

const root = () => document.getElementById('root');

/** Waits until something on the page matches, for a while. */
export async function find(selector, timeout = 5000) {
  const start = Date.now();
  let found = null;
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el && el.getBoundingClientRect().height > 0) {
      found = el;
      /* Settled: the card has its content, and the page around it is not
         still drawing placeholders that would shift it once they fill in.
         Filming a skeleton is worse than arriving a beat late. */
      if (!el.querySelector('.skeleton') && !document.querySelector('#root main .skeleton')) {
        await sleep(160);
        return document.querySelector(selector) ?? el;
      }
    }
    await sleep(120);
  }
  return found;
}

function hideSpot() {
  if (spot) spot.style.opacity = '0';
}

let follow = null; // { observer, target } while the camera holds on an element

/** Back to the whole page. */
export async function release({ quick = false } = {}) {
  ensureLayer();
  hideSpot();
  follow?.observer.disconnect();
  follow = null;
  const el = root();
  if (!el || !zoomed) return;
  el.style.transition = `transform ${quick || reduced() ? 0 : 0.45}s cubic-bezier(.22,1,.36,1)`;
  el.style.transform = 'translate(0px, 0px) scale(1)';
  await sleep(quick || reduced() ? 0 : 470);
  el.style.transition = '';
  el.style.transform = '';
  el.style.transformOrigin = '';
  document.documentElement.style.overflow = '';
  zoomed = false;
}

/*
 * Points the camera at an element. Works whether or not the app is already
 * scaled: the element's place is read back to the app's own (unscaled)
 * coordinates first, so re-aiming while zoomed moves smoothly from where the
 * camera is to where it should be.
 */
function aim(target, { max, spotlight, base, smooth = true }) {
  const el = root();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rr = el.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  const current = zoomed ? Number(/scale\(([\d.]+)\)/.exec(el.style.transform)?.[1] ?? 1) : 1;
  /* Unscaled position, relative to the app's own top-left. */
  const ux = (r.left - rr.left) / current;
  const uy = (r.top - rr.top) / current;
  const uw = r.width / current;
  const uh = r.height / current;
  const scale = Math.max(1, Math.min(max, (vw * 0.84) / uw, (vh * 0.72) / uh));
  /* Origin fixed at the app's top-left, so a re-aim animates the transform
     alone: point p of the app lands at base + t + scale * p. */
  const tx = vw / 2 - base.x - scale * (ux + uw / 2);
  const ty = vh / 2 - base.y - scale * (uy + uh / 2);
  el.style.transformOrigin = '0px 0px';
  el.style.transition = reduced() || !smooth ? 'none' : 'transform .95s cubic-bezier(.22,1,.36,1)';
  el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  zoomed = true;
  if (spotlight) {
    const w = Math.min(vw - 16, uw * scale + 20);
    const h = Math.min(vh - 16, uh * scale + 20);
    Object.assign(spot.style, { left: `${vw / 2 - w / 2}px`, top: `${vh / 2 - h / 2}px`, width: `${w}px`, height: `${h}px` });
  }
}

/**
 * Moves the camera in on one element: the element is brought to the middle
 * and the camera pushes in until it fills the frame (never more than `max`),
 * with the rest of the page dimmed around it. If the element grows or
 * shrinks while the camera holds on it (its content arriving), the camera
 * follows rather than filming half a card.
 */
export async function focus(selector, { max = 1.55, spotlight = true } = {}) {
  ensureLayer();
  /* Pull back first: holding the last shot while the next page loads would
     film the old spotlight over new content. */
  await release();
  const target = await find(selector);
  if (!target) return false;
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  await sleep(60);
  const el = root();
  /* A drawer or dialog lives outside the app: hold the camera, light it where it is. */
  if (!el.contains(target)) {
    const place = () => {
      const r = target.getBoundingClientRect();
      Object.assign(spot.style, { left: `${r.left - 10}px`, top: `${r.top - 10}px`, width: `${r.width + 20}px`, height: `${r.height + 20}px` });
    };
    if (spotlight) {
      place();
      await sleep(reduced() ? 0 : 200);
      spot.style.opacity = '1';
      const observer = new ResizeObserver(() => place());
      observer.observe(target);
      follow = { observer, target };
    }
    return true;
  }
  const r0 = el.getBoundingClientRect();
  const base = { x: r0.left, y: r0.top };
  document.documentElement.style.overflow = 'hidden';
  aim(target, { max, spotlight, base });
  let pending = null;
  let size = `${Math.round(target.offsetWidth)}x${Math.round(target.offsetHeight)}`;
  const observer = new ResizeObserver(() => {
    const next = `${Math.round(target.offsetWidth)}x${Math.round(target.offsetHeight)}`;
    if (next === size) return;
    size = next;
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (follow?.target === target && target.isConnected) aim(target, { max, spotlight, base });
    }, 120);
  });
  observer.observe(target);
  follow = { observer, target };
  if (spotlight) {
    await sleep(reduced() ? 0 : 650);
    spot.style.opacity = '1';
  }
  return true;
}

/** The pointer travels to a control, presses it, and clicks it for real. */
export async function click(selector) {
  ensureLayer();
  const el = await find(selector, 6000);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  pointer.style.opacity = '1';
  pointer.style.left = `${r.left + r.width / 2}px`;
  pointer.style.top = `${r.top + r.height / 2}px`;
  await sleep(reduced() ? 50 : 900);
  const ring = pointer.querySelector('[data-ring]');
  ring.animate?.([{ opacity: 0.9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.6)' }], { duration: 520, easing: 'ease-out' });
  pointer.animate?.([{ transform: 'translate(-4px,-3px) scale(1)' }, { transform: 'translate(-4px,-3px) scale(.82)' }, { transform: 'translate(-4px,-3px) scale(1)' }], { duration: 220 });
  await sleep(140);
  el.click();
  await sleep(380);
  return true;
}

export function hidePointer() {
  if (pointer) pointer.style.opacity = '0';
}

/** Everything off: camera, spotlight, pointer. */
export async function clearStage() {
  hidePointer();
  await release({ quick: true });
}
