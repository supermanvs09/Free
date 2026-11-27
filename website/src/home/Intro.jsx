import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* The opening is the end of our film, on the page's own black: the light
   stroke slides in, the D sweeps round it, a sheen crosses the mark, the mark
   steps left as the wordmark wipes in, and the two lines settle underneath.
   The line under it names who we protect, one word at a time, then the
   whole intro dissolves into a landing page that is already in place.
   Once per visit (session), never for reduced motion or automated browsers,
   and any click, key or wheel skips it. The page renders underneath all along. */

const SEEN = 'da-intro';
const WORDS = ['banking', 'healthcare', 'government', 'AI agents', 'every identity'];
let decision; // made once per page load, so a second mount (React dev mode) cannot strand it

function shouldPlay() {
  if (decision !== undefined) return decision;
  let seen = false;
  try { seen = sessionStorage.getItem(SEEN) === '1'; } catch { /* private mode */ }
  const forced = new URLSearchParams(window.location.search).has('intro');
  decision = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && (forced || (!seen && !navigator.webdriver));
  try { sessionStorage.setItem(SEEN, '1'); } catch { /* private mode */ }
  return decision;
}

export default function Intro() {
  const [on, setOn] = useState(false);
  const [out, setOut] = useState(false);
  const [w, setW] = useState(-1);
  const ref = useRef(null);

  // decide, once
  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('intro-pre');
    if (shouldPlay()) { setOn(true); html.classList.add('intro-on'); }
  }, []);

  // while it plays: lock scroll, close after the film's four seconds or on any input
  useEffect(() => {
    if (!on) return undefined;
    const html = document.documentElement, prev = html.style.overflow;
    html.style.overflow = 'hidden';
    let done = false, t2;
    const finish = () => {
      if (done) return; done = true;
      setOut(true);
      html.style.overflow = prev;
      html.classList.remove('intro-on');
      window.dispatchEvent(new Event('da:intro-done'));
      t2 = setTimeout(() => setOn(false), 700);
    };
    // after the lockup lands, the line names who we protect, one word at a time (as go.ai does)
    const ws = WORDS.map((_, i) => setTimeout(() => setW(i), 2950 + i * 420));
    const t = setTimeout(finish, 2950 + WORDS.length * 420 + 380);
    window.addEventListener('keydown', finish);
    window.addEventListener('pointerdown', finish);
    window.addEventListener('wheel', finish, { passive: true });
    return () => {
      clearTimeout(t); clearTimeout(t2); ws.forEach(clearTimeout);
      window.removeEventListener('keydown', finish); window.removeEventListener('pointerdown', finish); window.removeEventListener('wheel', finish);
      if (!done) { html.style.overflow = prev; html.classList.remove('intro-on'); }
    };
  }, [on]);

  if (!on) return null;
  // straight onto <body>, above the fixed header and outside any page layer
  return createPortal(
    <div ref={ref} className={`intro${out ? ' out' : ''}`} aria-hidden="true">
      <div className="intro-lock">
        <span className="il-mark">
          <img className="il-bowl" src="/brand/mark-bowl.webp" alt="" />
          <img className="il-stroke" src="/brand/mark-stroke.webp" alt="" />
          <i className="il-sheen" />
        </span>
        <span className="il-word"><img src="/brand/wordmark-inverse.webp" alt="" /></span>
      </div>
      <p className="intro-line">Securing identity for <span className="il-cycle"><b key={w}>{WORDS[Math.max(0, w)]}</b></span></p>
    </div>,
    document.body,
  );
}
