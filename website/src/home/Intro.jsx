import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* The opening is the end of our film: on its light field the light stroke
   slides in, the D sweeps round it, a sheen crosses the mark, the mark steps
   left as the wordmark wipes in, and the two lines settle underneath. Then
   the panel lifts away like a curtain onto the page.
   Once per visit (session), never for reduced motion, and any click or key
   skips it. The page renders underneath all along, so nothing waits on it. */

const SEEN = 'da-intro';

export default function Intro() {
  const [on, setOn] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN) === '1'; } catch { /* private mode */ }
    // automated browsers (tests, crawlers) get the page at once; ?intro forces it for previews
    const forced = new URLSearchParams(window.location.search).has('intro');
    const drop = () => document.documentElement.classList.remove('intro-pre');
    if (!forced && (seen || navigator.webdriver)) { drop(); return undefined; }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { drop(); return undefined; }
    try { sessionStorage.setItem(SEEN, '1'); } catch { /* private mode */ }
    setOn(true);
    document.documentElement.classList.remove('intro-pre');
    document.documentElement.classList.add('intro-on');
    const html = document.documentElement, prev = html.style.overflow;
    html.style.overflow = 'hidden';
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const el = ref.current; if (el) el.classList.add('out');
      html.style.overflow = prev;
      html.classList.remove('intro-on');
      window.dispatchEvent(new Event('da:intro-done'));
      setTimeout(() => setOn(false), 1100);
    };
    const t = setTimeout(finish, 4700);
    const skip = () => finish();
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });
    window.addEventListener('wheel', skip, { once: true, passive: true });
    return () => { clearTimeout(t); window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); window.removeEventListener('wheel', skip); html.style.overflow = prev; html.classList.remove('intro-on'); };
  }, []);

  if (!on) return null;
  // straight onto <body>, above the fixed header and outside any page layer
  return createPortal(
    <div ref={ref} className="intro" aria-hidden="true">
      <div className="intro-lock">
        <span className="il-mark">
          <img className="il-bowl" src="/brand/mark-bowl.webp" alt="" />
          <img className="il-stroke" src="/brand/mark-stroke.webp" alt="" />
          <i className="il-sheen" />
        </span>
        <span className="il-word"><img src="/brand/wordmark.webp" alt="" /></span>
      </div>
      <p className="intro-line"><b>Deep Algorithms Solutions</b><span>Securing identity and AI in the connected world.</span></p>
    </div>,
    document.body,
  );
}
