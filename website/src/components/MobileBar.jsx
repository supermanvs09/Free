import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Icon, cx } from './ui.jsx';

/* Phones and tablets: one bar in thumb reach, with the menu and the page's
   "Book a demo". It steps aside while the page's own closing invitation or the
   footer is on screen, and on the demo page itself. */
export default function MobileBar() {
  const { pathname } = useLocation();
  const [quiet, setQuiet] = useState(false);
  const [menu, setMenu] = useState(false);

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
    }, { threshold: 0.1 });
    const t = setTimeout(() => document.querySelectorAll('#cta-h, footer, main form').forEach((el) => io.observe(el)), 300);
    return () => { clearTimeout(t); io.disconnect(); };
  }, [pathname]);

  const hide = menu || quiet || pathname === '/request-demo' || pathname.startsWith('/prompt-heist/');
  return (
    <nav aria-label="Quick actions" aria-hidden={hide || undefined} className={cx('mbar noprint', hide && 'is-down')}>
      <button type="button" tabIndex={hide ? -1 : undefined} onClick={() => window.dispatchEvent(new CustomEvent('da:menu'))} className="btn btn-secondary flex-1 !shadow-none"><Icon name="List" size={18} />Menu</button>
      <Link to="/request-demo" tabIndex={hide ? -1 : undefined} className="btn btn-primary flex-[1.4]">Book a demo</Link>
    </nav>
  );
}
