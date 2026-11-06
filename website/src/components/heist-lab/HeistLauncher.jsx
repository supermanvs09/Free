import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Icon, cx } from '../ui.jsx';
import HeistMark from './HeistMark.jsx';
import { OPEN_EVENT, PROGRESS_EVENT } from './events.js';
import { readProgress } from './store.js';
import './lab.css';

const LabPanel = lazy(() => import('./LabPanel.jsx'));
const loadPanel = () => import('./LabPanel.jsx');

/* The Prompt Heist launcher: a small pill at the bottom right of every page
   (above the quick-action bar on a phone) that opens the practice lab in place.

   Restraint, by design:
   - it appears once the page has settled, and fades in once per visit;
   - its text alternates "PROMPT HEIST" / "Win exciting prizes" a few times a
     visit, then rests (never under reduced motion, never while hovered);
   - it steps aside while the footer is on screen, and on a phone whenever the
     quick-action bar does (forms, closing invitations, the open menu);
   - three levels of "not now": Minimise keeps the panel's place, Close shrinks
     the launcher to a quiet icon for the visit, and the launcher's own ×
     hides it for 14 days. Opening the lab from the Careers card brings it back.
   It never opens by itself. */

const DISMISS_KEY = 'ph-launcher-dismissed';
const DISMISS_DAYS = 14;
const QUIET_KEY = 'ph-launcher-quiet'; // session: closed once, so stay small
const SWAPS_KEY = 'ph-launcher-swaps'; // session: how many text swaps have run
const MAX_SWAPS = 6;
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const isDismissed = () => {
  const at = Number(ls.get(DISMISS_KEY) || 0);
  return at > 0 && Date.now() - at < DISMISS_DAYS * 864e5;
};

export default function HeistLauncher() {
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [quiet, setQuiet] = useState(false); // closed once this visit: icon only
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [alt, setAlt] = useState(false); // showing the second line of text
  const [footer, setFooter] = useState(false);
  const [progress, setProgress] = useState(null);
  const [banner, setBanner] = useState(false); // the Careers banner is on screen
  const [compact, setCompact] = useState(false); // phone, scrolling down
  const btn = useRef(null);
  const returnTo = useRef(null);
  const hover = useRef(false);

  const onHeistPage = pathname.startsWith('/prompt-heist');

  // read stored state after hydration; appear once the page has settled
  useEffect(() => {
    setDismissed(isDismissed());
    setQuiet(ss.get(QUIET_KEY) === '1');
    setProgress(readProgress());
    const t = setTimeout(() => setReady(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const on = (e) => setProgress(e.detail || readProgress());
    window.addEventListener(PROGRESS_EVENT, on);
    return () => window.removeEventListener(PROGRESS_EVENT, on);
  }, []);

  const doOpen = useCallback((from) => {
    returnTo.current = from && from.isConnected ? from : null;
    ls.set(DISMISS_KEY, null);
    setDismissed(false);
    setLoaded(true);
    setOpen(true);
  }, []);

  // anything on the site can open the lab (the Careers card does)
  useEffect(() => {
    const on = (e) => doOpen(e.detail?.from);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, [doOpen]);

  // the footer is the end of the page: step aside so its links stay clear
  useEffect(() => {
    const f = document.querySelector('footer');
    if (!f || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(([e]) => setFooter(e.isIntersecting), { threshold: 0 });
    io.observe(f);
    return () => io.disconnect();
  }, []);

  // the Careers banner carries its own "Start the challenge": no need for both
  useEffect(() => {
    setBanner(false);
    if (!('IntersectionObserver' in window)) return undefined;
    const seen = new Set();
    const io = new IntersectionObserver((es) => {
      for (const e of es) (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target));
      setBanner(seen.size > 0);
    }, { threshold: 0.25 });
    const t = setTimeout(() => document.querySelectorAll('.phb').forEach((el) => io.observe(el)), 400);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [pathname]);

  // phones: shrink to the badge while scrolling down, grow back on scroll up
  useEffect(() => {
    let last = window.scrollY, raf = 0;
    const read = () => {
      raf = 0;
      const y = window.scrollY, d = y - last;
      if (Math.abs(d) < 24) return;
      setCompact(d > 0 && y > 120);
      last = y;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    window.addEventListener('scroll', on, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); };
  }, []);

  // the alternating text: a few calm swaps per visit, then rest
  const showing = ready && !dismissed && !onHeistPage && !open;
  useEffect(() => {
    if (!showing || quiet || progress?.started) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let n = Number(ss.get(SWAPS_KEY) || 0);
    if (n >= MAX_SWAPS) { setAlt(false); return undefined; }
    const id = setInterval(() => {
      if (hover.current || document.hidden) return;
      n += 1; ss.set(SWAPS_KEY, String(n));
      setAlt((a) => !a);
      if (n >= MAX_SWAPS) { clearInterval(id); setTimeout(() => setAlt(false), 0); }
    }, 3600);
    return () => clearInterval(id);
  }, [showing, quiet, progress?.started]);

  // leaving for the full challenge closes the panel
  useEffect(() => { if (onHeistPage) setOpen(false); }, [onHeistPage]);

  const restoreFocus = () => {
    const to = returnTo.current;
    requestAnimationFrame(() => { (to && to.isConnected ? to : btn.current)?.focus({ preventScroll: true }); });
  };
  const minimise = () => { setOpen(false); restoreFocus(); };
  const close = () => { setOpen(false); setQuiet(true); ss.set(QUIET_KEY, '1'); restoreFocus(); };
  const dismiss = () => { ls.set(DISMISS_KEY, String(Date.now())); setDismissed(true); };

  const resume = progress?.started && !progress.done;
  const label = resume ? `Resume Prompt Heist, challenge ${progress.at} of ${progress.of}` : open ? 'Minimise Prompt Heist' : 'Open Prompt Heist, an AI security challenge. Win exciting prizes.';

  return (
    <div className="phl-root noprint">
      {!dismissed && !onHeistPage && (
        <div className={cx('phl', ready && 'is-ready', (footer || banner) && !open && 'is-away', open && 'is-open', compact && !open && 'is-compact', quiet && !resume && !open && 'is-quiet')} data-testid="ph-launcher">
          <button ref={btn} type="button" className="phl-btn" aria-label={label} aria-expanded={open} aria-controls={loaded ? 'ph-lab' : undefined}
            onClick={() => (open ? minimise() : doOpen(null))}
            onPointerEnter={() => { hover.current = true; loadPanel(); }} onPointerLeave={() => { hover.current = false; }}
            onFocus={() => { hover.current = true; loadPanel(); }} onBlur={() => { hover.current = false; }}>
            <span className="phl-badge"><HeistMark size={22} detail={false} /></span>
            <span className="phl-text" aria-hidden="true">
              {open ? (
                <span className="phl-line is-on"><b>Minimise</b></span>
              ) : resume ? (
                <span className="phl-line is-on"><b>Resume</b><small>{progress.at} of {progress.of} · {progress.score} pts</small></span>
              ) : (
                <>
                  <span className={cx('phl-line', !alt && 'is-on')}><b>Prompt Heist</b></span>
                  <span className={cx('phl-line phl-alt', alt && 'is-on')}><b>Win exciting prizes</b></span>
                </>
              )}
            </span>
          </button>
          <button type="button" className="phl-x" aria-label="Hide the Prompt Heist launcher for 14 days" onClick={dismiss}>
            <Icon name="X" size={12} weight="bold" />
          </button>
        </div>
      )}
      {loaded && (
        <Suspense fallback={null}>
          <LabPanel open={open && !onHeistPage} onMinimise={minimise} onClose={close} />
        </Suspense>
      )}
    </div>
  );
}
