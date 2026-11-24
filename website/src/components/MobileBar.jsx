import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { SITE } from '../data/site.js';
import { Icon, cx } from './ui.jsx';

/* Phones get their controls where the thumb is: menu, search and the one
   "Book a demo" of the page, in a bar at the bottom. The demo button steps
   aside while the page's own closing invitation (or the demo page itself) is
   on screen, so it is never offered twice at once. */
export default function MobileBar() {
  const { pathname } = useLocation();
  const [quiet, setQuiet] = useState(false);
  const [menu, setMenu] = useState(false);

  // the menu sheet carries its own controls; the bar steps down while it is open
  useEffect(() => {
    const on = (e) => setMenu(!!e.detail);
    window.addEventListener('da:menu-state', on);
    return () => window.removeEventListener('da:menu-state', on);
  }, []);

  useEffect(() => {
    setQuiet(false);
    const seen = new Set();
    const io = new IntersectionObserver((es) => {
      for (const e of es) (e.isIntersecting ? seen.add(e.target) : seen.delete(e.target));
      setQuiet(seen.size > 0);
    }, { threshold: 0.15 });
    // the page renders after navigation; look for the closing band once it has
    const t = setTimeout(() => document.querySelectorAll('[data-cta], footer').forEach((el) => io.observe(el)), 300);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [pathname]);

  const onDemo = pathname === '/request-demo';
  const btn = 'flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-[14px] text-[11.5px] font-medium text-ink-2 active:bg-fg/[.06]';
  return (
    <nav aria-label="Quick actions" aria-hidden={menu || undefined} className={cx('mbar noprint md:hidden', menu && 'is-down')}>
      <button type="button" className={btn} onClick={() => window.dispatchEvent(new CustomEvent('da:menu'))}><Icon name="List" size={21} />Menu</button>
      <button type="button" className={btn} onClick={() => window.dispatchEvent(new CustomEvent('da:command', { detail: 'search' }))}><Icon name="MagnifyingGlass" size={21} />Search</button>
      <a href={SITE.phoneHref} className={btn}><Icon name="Phone" size={21} />Call</a>
      <Link to="/request-demo" aria-hidden={quiet || onDemo} tabIndex={quiet || onDemo ? -1 : undefined}
        className={cx('mbar-cta inline-flex h-12 items-center justify-center rounded-[14px] bg-[#0a6dbb] px-5 text-[15px] font-semibold text-white transition-all duration-300', (quiet || onDemo) && 'is-away')}>
        Book a demo
      </Link>
    </nav>
  );
}
