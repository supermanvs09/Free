import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* The brand film in a lightbox, the way enterprise sites play their hero film:
   the page stays where it is, the film opens over it with its own controls,
   Escape or the close button returns focus to the button that opened it.
   Any button can open it, at any chapter: openFilm(seconds). */

export const FILM = { src: '/video/deep-algorithms-film.mp4', poster: '/img/film/poster.webp', length: '1:30' };

export const CHAPTERS = [
  [0, '0:00', 'Every connection carries trust'],
  [13, '0:13', 'Continuous Identity Risk Management'],
  [29, '0:29', 'Non-Human Identity Security for AWS'],
  [41, '0:41', 'Identity Fraud Prevention'],
  [58, '0:58', 'Secure AI Interactions with Zenstra'],
];

export function openFilm(at = 0) {
  window.dispatchEvent(new CustomEvent('da:open-film', { detail: { at } }));
}

export default function FilmModal() {
  const [open, setOpen] = useState(false);
  const video = useRef(null);
  const close = useRef(null);
  const opener = useRef(null);
  const start = useRef(0);

  useEffect(() => {
    const on = (e) => {
      opener.current = document.activeElement;
      start.current = e.detail?.at || 0;
      setOpen(true);
    };
    window.addEventListener('da:open-film', on);
    return () => window.removeEventListener('da:open-film', on);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const v = video.current;
    if (v) {
      const go = () => { try { v.currentTime = start.current; } catch { /* not seekable yet */ } v.play().catch(() => {}); };
      if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
    }
    close.current?.focus();
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = 'hidden';
    const key = (e) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab') {
        // keep focus inside the dialog: the close button and the video controls
        const f = [close.current, video.current].filter(Boolean);
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      html.style.overflow = prev;
      video.current?.pause();
      opener.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  // portalled to <body> so no page stacking context (header, sheets) can sit above it
  return createPortal(
    <div className="fm" role="dialog" aria-modal="true" aria-label="Deep Algorithms brand film" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="fm-box">
        <button ref={close} type="button" className="fm-x" onClick={() => setOpen(false)} aria-label="Close the film">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the film has music and on-screen text only, no speech */}
        <video ref={video} className="fm-v" src={FILM.src} poster={FILM.poster} controls playsInline preload="metadata" />
      </div>
    </div>,
    document.body,
  );
}
