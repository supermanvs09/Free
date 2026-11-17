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
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el && el.getBoundingClientRect().height > 0) return el;
    await sleep(120);
  }
  return null;
}

function hideSpot() {
  if (spot) spot.style.opacity = '0';
}

/** Back to the whole page. */
export async function release({ quick = false } = {}) {
  ensureLayer();
  hideSpot();
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

/**
 * Moves the camera in on one element: the page pulls back, the element is
 * brought to the middle, then the camera pushes in until it fills the frame
 * (never more than `max`), with the rest of the page dimmed around it.
 */
export async function focus(selector, { max = 1.55, spotlight = true } = {}) {
  ensureLayer();
  const target = await find(selector);
  if (!target) return false;
  await release();
  target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  await sleep(60);
  const el = root();
  /* A drawer or dialog lives outside the app: hold the camera, light it where it is. */
  if (!el.contains(target)) {
    const r = target.getBoundingClientRect();
    if (spotlight) {
      Object.assign(spot.style, { left: `${r.left - 10}px`, top: `${r.top - 10}px`, width: `${r.width + 20}px`, height: `${r.height + 20}px` });
      await sleep(reduced() ? 0 : 200);
      spot.style.opacity = '1';
    }
    return true;
  }
  const r = target.getBoundingClientRect();
  const rr = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.max(1, Math.min(max, (vw * 0.84) / r.width, (vh * 0.72) / r.height));
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  document.documentElement.style.overflow = 'hidden';
  el.style.transformOrigin = `${cx - rr.left}px ${cy - rr.top}px`;
  el.style.transition = reduced() ? 'none' : 'transform .95s cubic-bezier(.22,1,.36,1)';
  el.style.transform = `translate(${vw / 2 - cx}px, ${vh / 2 - cy}px) scale(${scale})`;
  zoomed = true;
  if (spotlight) {
    const w = r.width * scale + 20;
    const h = r.height * scale + 20;
    Object.assign(spot.style, { left: `${vw / 2 - w / 2}px`, top: `${vh / 2 - h / 2}px`, width: `${w}px`, height: `${h}px` });
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
