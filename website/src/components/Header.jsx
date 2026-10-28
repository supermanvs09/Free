import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { LINES, SOLUTIONS } from '../data/site.js';
import { Button, Icon, cx } from './ui.jsx';
import Thumb from './visuals/Thumb.jsx';
import CoverArt from './visuals/CoverArt.jsx';
import CapVisual from './visuals/CapVisuals.jsx';

export function Logo({ className = 'h-[34px]', inverse }) {
  return <img src={inverse ? '/brand/logo-lockup-inverse.webp' : '/brand/logo-lockup.webp'} alt="Deep Algorithms" width="153" height="34" className={cx('w-auto', className)} />;
}

/* Visual mega menus, after astrix.security: picture cards with a few words each.
   Product previews are the real product pictures (or a scaled capability view). */
const Panel = ({ label, children }) => <div key={label} className="fadein">{children}</div>;
const CARD_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-x-5 gap-y-6';

function Preview({ m }) {
  return (
    <span className="relative block aspect-[16/10] overflow-hidden rounded-[14px] bg-frame ring-1 ring-line transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-18px_rgba(6,47,87,.55)] group-hover:ring-brand/50">
      {m.cap
        ? <span aria-hidden="true" className="pointer-events-none absolute left-0 top-0 block w-[560px] origin-top-left scale-[.35]"><CapVisual kind={m.cap} /></span>
        : <Thumb k={m.thumb} eager className="transition-transform duration-500 group-hover:scale-[1.04]" />}
    </span>
  );
}
const Label = ({ name, desc }) => (
  <span className="mt-3 block"><span className="block text-[15.5px] font-medium text-ink group-hover:text-brand">{name}</span><span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{desc}</span></span>
);
const SeeAll = ({ to, children }) => <Link to={to} className="inline-flex items-center gap-1 text-[14.5px] font-medium text-brand hover:text-navy">{children}<Icon name="CaretRight" size={12} weight="bold" /></Link>;

function ProductsMenu() {
  const [i, setI] = useState(0);
  const l = LINES[i];
  return (
    <Panel label={l.key}>
      <div className="grid grid-cols-[240px_1fr] gap-10">
        <div className="border-r border-line pr-4">
          {LINES.map((x, k) => (
            <button key={x.key} type="button" onMouseEnter={() => setI(k)} onFocus={() => setI(k)} onClick={() => setI(k)} aria-pressed={k === i}
              className={cx('relative flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-colors', k === i ? 'bg-sky text-ink' : 'text-ink-2 hover:bg-mist')}>
              <span className={cx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]', k === i ? 'bg-brand text-white' : 'bg-mist text-brand')}><Icon name={x.icon} size={20} weight="light" /></span>
              <span><span className="block text-[15.5px] font-medium">{x.name}</span><span className="block text-[12.5px] text-ink-3">{x.summary}</span></span>
            </button>
          ))}
          <div className="mt-3 px-3"><SeeAll to="/products">All products</SeeAll></div>
        </div>
        <div>
          <div className={CARD_GRID}>
            {l.modules.map((m) => <Link key={m.path} to={m.path} className="group block"><Preview m={m} /><Label name={m.name} desc={m.desc} /></Link>)}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SolutionsMenu() {
  return (
    <Panel label="solutions">
      <div className={cx(CARD_GRID, '!grid-cols-4')}>
        {SOLUTIONS.map((s) => (
          <Link key={s.slug} to={`/solutions/${s.slug}`} className="group block">
            <span className="block overflow-hidden rounded-[14px] ring-1 ring-line transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-18px_rgba(6,47,87,.55)] group-hover:ring-brand/50"><CoverArt eager slug={s.slug} className="aspect-[16/10]" /></span>
            <Label name={s.name} desc={s.desc} />
          </Link>
        ))}
      </div>
    </Panel>
  );
}

const COMPANY = [
  { name: 'About us', desc: 'Who we are and who leads us', path: '/about-us', img: 'office-inauguration' },
  { name: 'Careers', desc: 'Work on hard security problems', path: '/about-us#careers', img: 'nec-globis-thub' },
  { name: 'Contact', desc: 'Offices, phone and email', path: '/contact', img: 'bharat-mandapam' },
];
function CompanyMenu() {
  return (
    <Panel label="company">
      <div className={cx(CARD_GRID, '!grid-cols-4')}>
        {COMPANY.map((c) => (
          <Link key={c.path} to={c.path} className="group block">
            <span className="block aspect-[16/10] overflow-hidden rounded-[14px] bg-frame ring-1 ring-line transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-18px_rgba(6,47,87,.55)] group-hover:ring-brand/50">
              <img src={`/img/events/${c.img}.webp`} alt="" width="400" height="250" loading="eager" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
            </span>
            <Label name={c.name} desc={c.desc} />
          </Link>
        ))}
        <Link to="/request-demo" className="group flex aspect-[16/10] flex-col justify-between self-start rounded-[14px] bg-navy p-5 text-white">
          <span className="font-display text-[22px] leading-snug">See it on your own identities</span>
          <span className="inline-flex h-10 w-fit items-center rounded-full bg-white px-5 text-[14px] font-medium text-navy group-hover:bg-sky">Book a demo</span>
        </Link>
      </div>
    </Panel>
  );
}

const NAV = [
  { label: 'Products', menu: ProductsMenu },
  { label: 'Solutions', menu: SolutionsMenu },
  { label: 'Why Deep Algorithms', to: '/platform' },
  { label: 'Research', to: '/blogs' },
  { label: 'Company', menu: CompanyMenu },
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
  const leave = () => { timer.current = setTimeout(() => setOpen(null), 180); };
  const Menu = NAV.find((n) => n.label === open)?.menu;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line" onMouseLeave={leave}>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-navy focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
        {/* blur lives on its own layer: backdrop-filter on the header would trap the fixed mobile drawer inside it */}
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-white/95 backdrop-blur-md" />
        <div className="wrap flex h-[72px] items-center gap-6">
          <Link to="/" aria-label="Deep Algorithms home" className="shrink-0"><Logo /></Link>
          <nav aria-label="Primary" className="hidden flex-1 lg:block">
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
          <div id="mega" onMouseEnter={() => enter(open)} className="absolute inset-x-0 top-full hidden border-b border-line bg-white shadow-[0_28px_56px_-28px_rgba(11,18,32,.3)] lg:block">
            <div className="wrap py-8"><Menu /></div>
          </div>
        )}

        {mobile && (
          <div className="fixed inset-x-0 bottom-0 top-[73px] z-40 overflow-y-auto bg-white lg:hidden">
            <nav aria-label="Mobile" className="wrap py-4">
              <details className="group border-b border-line py-1" open>
                <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[18px]">Products<Icon name="CaretDown" size={16} className="transition-transform group-open:rotate-180" /></summary>
                <div className="space-y-5 pb-5">
                  <Link to="/products" className="block font-medium text-brand">All products</Link>
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
              <Link to="/platform" className="block border-b border-line py-4 text-[18px]">Why Deep Algorithms</Link>
              <Link to="/blogs" className="block border-b border-line py-4 text-[18px]">Research</Link>
              <details className="group border-b border-line py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-[18px]">Company<Icon name="CaretDown" size={16} className="transition-transform group-open:rotate-180" /></summary>
                <ul className="space-y-3 pb-5">{COMPANY.map((c) => <li key={c.path}><Link to={c.path} className="text-[15px] text-ink-2">{c.name}</Link></li>)}</ul>
              </details>
              <Button to="/request-demo" className="mt-6 w-full">Book a demo</Button>
            </nav>
          </div>
        )}
      </header>
    </>
  );
}
