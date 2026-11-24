import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import '../../styles.css';
import '../../components/viz/viz.css';
import Film, { LENGTH, FPS } from './Film.jsx';

/* window.__film(t): render the frame at t seconds, wait for its footage frames and
   settle CSS animations to the same clock. */
const root = createRoot(document.getElementById('root'));
const born = new WeakMap();
window.__LENGTH = LENGTH; window.__FPS = FPS;
window.__film = async (t) => {
  flushSync(() => root.render(<Film t={t} />));
  await new Promise((r) => requestAnimationFrame(() => r()));
  for (const a of document.getAnimations()) {
    if (!born.has(a)) born.set(a, t);
    a.pause();
    a.currentTime = Math.max(0, (t - born.get(a)) * 1000);
  }
  await document.fonts.ready;
  await Promise.all([...document.images].map((im) => (im.complete && im.naturalWidth ? null : im.decode().catch(() => null))));
  return true;
};
const q = new URLSearchParams(location.search);
window.__film(+(q.get('t') || 0));
