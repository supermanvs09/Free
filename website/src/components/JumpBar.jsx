import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { cx } from './ui.jsx';

/* Long pages get a bar of their sections once the reader is past the hero,
   the way enterprise product pages carry one: what is on the page, where you
   are, one click to any part.
   Desktop: under the header, with the page's name.
   Phones: at the top, as swipeable chips (the header tucks away on scroll).
   Sections are read from the page itself (each h2 with an id), named by their
   eyebrow. */
const LONG = /^\/(adapid-ai|agentic-ai|dpdpa-compliance|ad-security|solutions|platform|about-us|trust)/;

export default function JumpBar() {
  const { pathname } = useLocation();
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [active, setActive] = useState(-1);
  const [on, setOn] = useState(false);
  const bar = useRef(null);

  useEffect(() => {
    setItems([]); setActive(-1); setOn(false);
    if (!LONG.test(pathname)) return undefined;
    let io, onScroll;
    const t = setTimeout(() => {
      const hs = [...document.querySelectorAll('main h2[id]')].filter((h) => !h.closest('[role=dialog], [data-cta]'));
      const list = hs.map((h) => {
        const eb = h.previousElementSibling?.classList.contains('eyebrow') ? h.previousElementSibling.textContent.trim() : '';
        const label = (eb || h.textContent.trim().split(/\s+/).slice(0, 3).join(' ')).replace(/[.,:]$/, '');
        return { id: h.id, label: label.length > 34 ? `${label.slice(0, 32)}…` : label, el: h };
      });
      if (list.length < 4) return;
      setName(document.querySelector('[data-page-name]')?.dataset.pageName || document.title.split(/[:|·]/)[0].trim());
      setItems(list.map(({ id, label }) => ({ id, label })));
      io = new IntersectionObserver((es) => {
        for (const e of es) if (e.isIntersecting) setActive(list.findIndex((x) => x.el === e.target));
      }, { rootMargin: '-30% 0px -60% 0px' });
      list.forEach((x) => io.observe(x.el));
      const first = list[0].el;
      onScroll = () => {
        setOn(first.getBoundingClientRect().top < window.innerHeight * 0.6);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }, 450);
    return () => { clearTimeout(t); io?.disconnect(); if (onScroll) window.removeEventListener('scroll', onScroll); };
  }, [pathname]);

  // keep the current item in view
  useEffect(() => {
    const el = bar.current?.querySelector(`[data-i="${active}"]`);
    if (!el) return;
    // scroll the strip only when the item is out of view, measured against the strip itself
    const box = el.parentElement, r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.left < b.left || r.right > b.right) box.scrollTo({ left: box.scrollLeft + r.left - b.left - 20, behavior: 'smooth' });
  }, [active]);

  if (!items.length) return null;
  const go = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const off = window.innerWidth >= 768 ? 140 : 70;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  return (
    <nav ref={bar} aria-label="On this page" className={cx('jumpbar tone-l noprint', on && 'on')}>
      <div className="jb-inner border-b border-line bg-[color-mix(in_oklab,var(--color-bg-1)_92%,transparent)] backdrop-blur-xl">
        <div className="wrap flex items-center max-md:px-0 md:gap-8">
          <span className="hidden shrink-0 text-[15px] font-semibold md:block">{name}</span>
          <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto px-4 py-2.5 md:gap-1 md:px-0 md:py-0">
            {items.map((x, i) => (
              <button key={x.id} type="button" data-i={i} onClick={() => go(x.id)} aria-current={i === active ? 'true' : undefined}
                className={cx('jb-item shrink-0 text-[13.5px] font-medium transition-colors', i === active ? 'is-on' : 'text-ink-2 hover:text-ink')}>
                {x.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
