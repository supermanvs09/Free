import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { LINES, SOLUTIONS } from '../data/site.js';
import { POSTS } from '../data/posts.js';
import { Button, Icon, cx } from './ui.jsx';

export function Logo({ className = 'h-[34px]', inverse }) {
  return <img src={inverse ? '/brand/logo-lockup-inverse.webp' : '/brand/logo-lockup.webp'} alt="Deep Algorithms" width="153" height="34" className={cx('w-auto', className)} />;
}

const COMPANY = [
  { name: 'About us', desc: 'Our story, leadership and advisors', path: '/about-us' },
  { name: 'Careers', desc: 'Work on hard security problems', path: '/about-us#careers' },
  { name: 'Contact', desc: 'Offices, phone and email', path: '/contact' },
];

function ProductsMenu() {
  return (
    <div className="grid grid-cols-4 gap-8">
      {LINES.map((l) => (
        <div key={l.key}>
          <Link to={l.path} className="group flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-sky text-brand"><Icon name={l.icon} size={19} /></span>
            <span>
              <span className="block font-medium text-ink group-hover:text-brand">{l.name}</span>
              <span className="block text-[13px] text-ink-3">{l.summary}</span>
            </span>
          </Link>
          <ul className="mt-4 space-y-3 border-l border-line pl-4">
            {l.modules.map((m) => (
              <li key={m.path + m.name}>
                <Link to={m.path} className="group block">
                  <span className="flex items-center gap-2 text-[14px] text-ink group-hover:text-brand">{m.name}{m.badge && <span className="rounded-full bg-coral-soft px-1.5 text-[10.5px] font-semibold text-coral-2">{m.badge}</span>}</span>
                  <span className="block text-[12.5px] leading-snug text-ink-3">{m.desc}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SolutionsMenu() {
  return (
    <div className="grid max-w-[760px] grid-cols-2 gap-3">
      {SOLUTIONS.map((s) => (
        <Link key={s.slug} to={`/solutions/${s.slug}`} className="group flex items-start gap-3 rounded-[14px] p-3 hover:bg-mist">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sky text-brand"><Icon name={s.icon} size={19} /></span>
          <span><span className="block font-medium text-ink group-hover:text-brand">{s.name}</span><span className="block text-[13px] text-ink-3">{s.desc}</span></span>
        </Link>
      ))}
    </div>
  );
}

function CompanyMenu() {
  const p = POSTS[0];
  return (
    <div className="grid max-w-[880px] grid-cols-[1fr_1.3fr] gap-8">
      <ul className="space-y-1">
        {COMPANY.map((c) => (
          <li key={c.path}><Link to={c.path} className="group block rounded-[12px] p-3 hover:bg-mist"><span className="block font-medium text-ink group-hover:text-brand">{c.name}</span><span className="block text-[13px] text-ink-3">{c.desc}</span></Link></li>
        ))}
      </ul>
      <Link to={`/blogs/${p.slug}`} className="group rounded-[20px] bg-mist p-6">
        <span className="text-[13px] font-medium text-brand">Latest research</span>
        <span className="mt-2 block font-display text-[19px] leading-snug text-ink group-hover:text-brand">{p.title}</span>
        <span className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-brand">Read <Icon name="ArrowRight" size={14} /></span>
      </Link>
    </div>
  );
}

const NAV = [
  { label: 'Why Deep Algorithms', to: '/platform' },
  { label: 'Products', menu: ProductsMenu },
  { label: 'Solutions', menu: SolutionsMenu },
  { label: 'Company', menu: CompanyMenu },
  { label: 'Research', to: '/blogs' },
];

export default function Header() {
  const [open, setOpen] = useState(null);
  const [mobile, setMobile] = useState(false);
  const timer = useRef();
  const { pathname, hash } = useLocation();

  useEffect(() => { setOpen(null); setMobile(false); }, [pathname, hash]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(null); setMobile(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { document.body.style.overflow = mobile ? 'hidden' : ''; }, [mobile]);

  const enter = (l) => { clearTimeout(timer.current); setOpen(l); };
  const leave = () => { timer.current = setTimeout(() => setOpen(null), 150); };
  const Menu = NAV.find((n) => n.label === open)?.menu;

  return (
    <header className="sticky top-0 z-40 border-b border-line" onMouseLeave={leave}>
      {/* blur lives on its own layer: backdrop-filter on the header would trap the fixed mobile drawer inside it */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-white/90 backdrop-blur-md" />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-navy focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <div className="wrap flex h-[76px] items-center gap-6">
        <Link to="/" aria-label="Deep Algorithms home" className="shrink-0"><Logo /></Link>
        <nav aria-label="Primary" className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {NAV.map((n) => (
              <li key={n.label}>
                {n.menu ? (
                  <button type="button" aria-expanded={open === n.label} aria-controls="mega" onMouseEnter={() => enter(n.label)} onClick={() => setOpen(open === n.label ? null : n.label)}
                    className={cx('inline-flex h-10 items-center gap-1 rounded-full px-3.5 text-[15px] transition-colors', open === n.label ? 'text-brand' : 'text-ink hover:text-brand')}>
                    {n.label}<Icon name="CaretDown" size={12} weight="bold" className={cx('transition-transform', open === n.label && 'rotate-180')} />
                  </button>
                ) : (
                  <Link to={n.to} onMouseEnter={() => setOpen(null)} className="inline-flex h-10 items-center rounded-full px-3.5 text-[15px] text-ink hover:text-brand">{n.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Button to="/request-demo" className="h-11 px-5 text-[15px] max-sm:hidden">Book a demo</Button>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink lg:hidden" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} onClick={() => setMobile(!mobile)}>
            <Icon name={mobile ? 'X' : 'List'} size={26} />
          </button>
        </div>
      </div>

      {Menu && (
        <div id="mega" onMouseEnter={() => enter(open)} className="absolute inset-x-0 top-full hidden border-b border-line bg-white shadow-[0_24px_48px_-24px_rgba(11,18,32,.25)] lg:block">
          <div className="wrap fadein py-9"><Menu /></div>
        </div>
      )}

      {mobile && (
        <div className="fixed inset-x-0 bottom-0 top-[77px] z-40 overflow-y-auto bg-white lg:hidden">
          <nav aria-label="Mobile" className="wrap py-4">
            <Link to="/platform" className="block border-b border-line py-4 text-[18px]">Why Deep Algorithms</Link>
            <details className="group border-b border-line py-1" open>
              <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[18px]">Products<Icon name="CaretDown" size={16} className="transition-transform group-open:rotate-180" /></summary>
              <div className="space-y-5 pb-5">
                {LINES.map((l) => (
                  <div key={l.key}>
                    <Link to={l.path} className="font-medium text-ink">{l.name}</Link>
                    {l.modules.length > 1 && <ul className="mt-2 space-y-2 border-l border-line pl-3">{l.modules.map((m) => <li key={m.path + m.name}><Link to={m.path} className="text-[15px] text-ink-2">{m.name}</Link></li>)}</ul>}
                  </div>
                ))}
              </div>
            </details>
            <details className="group border-b border-line py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[18px]">Solutions<Icon name="CaretDown" size={16} className="transition-transform group-open:rotate-180" /></summary>
              <ul className="space-y-3 pb-5">{SOLUTIONS.map((s) => <li key={s.slug}><Link to={`/solutions/${s.slug}`} className="text-[15px] text-ink-2">{s.name}</Link></li>)}</ul>
            </details>
            <details className="group border-b border-line py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[18px]">Company<Icon name="CaretDown" size={16} className="transition-transform group-open:rotate-180" /></summary>
              <ul className="space-y-3 pb-5">{COMPANY.map((c) => <li key={c.path}><Link to={c.path} className="text-[15px] text-ink-2">{c.name}</Link></li>)}</ul>
            </details>
            <Link to="/blogs" className="block border-b border-line py-4 text-[18px]">Research</Link>
            <Button to="/request-demo" className="mt-6 w-full">Book a demo</Button>
          </nav>
        </div>
      )}
    </header>
  );
}
