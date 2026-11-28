import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { SITE, SOLUTIONS } from '../data/site.js';
import { PRODUCT_MENU, CHALLENGES, MENU_DETAIL } from '../data/nav.js';
import { REGIONS, getRegion, regionLabel, setRegion } from '../lib/translate.js';
import { Button, Icon, cx } from './ui.jsx';
import { useTheme } from '../lib/theme.js';
import ProductMark from './ProductMark.jsx';

/* `dual` stacks the dark-on-light lockup over the white one; CSS shows the
   one that suits the header's tone. */
export function Logo({ className = 'h-[30px]', dual }) {
  if (!dual) return <img src="/brand/logo-lockup-inverse.webp" alt="Deep Algorithms" width="153" height="34" className={cx('w-auto', className)} />;
  return (
    <span className="relative block">
      <img src="/brand/logo-lockup-inverse.webp" alt="Deep Algorithms" width="153" height="34" className={cx('hdr-logo on-d w-auto', className)} />
      <img src="/brand/logo-lockup.webp" alt="" aria-hidden="true" width="153" height="34" className={cx('hdr-logo on-l w-auto', className)} />
    </span>
  );
}

export const topicSlug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const WorksWith = lazy(() => import('./WorksWith.jsx'));
const ADAPID_ICON = { '/adapid-ai': 'Gauge', '/adapid-ai/nhi-security': 'Cloud', '/adapid-ai/fraud-prevention': 'CreditCard', '/ad-security': 'TreeStructure' };

/* Menus in the plain enterprise style: a group label, then a name and one
   grey line per item. Only Products and Solutions open a menu. */
const GroupLabel = ({ children }) => <p className="mb-2 border-b border-line pb-3 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">{children}</p>;
const Tile = ({ name }) => <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#1a58d0] text-white"><Icon name={name} size={17} /></span>;
const Item = ({ to, name, desc, lead, onPeek, on }) => (
  <Link to={to} onMouseEnter={onPeek} onFocus={onPeek} className="group -mx-3 flex items-start gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-fg/[.045] focus-visible:bg-fg/[.045]" data-on={on || undefined}>
    {lead}
    <span className="min-w-0">
      <span className="block text-[15px] font-medium leading-snug text-ink group-hover:text-cyan-2">{name}</span>
      {desc && <span className="mt-1 block text-[13.5px] leading-snug text-ink-3">{desc}</span>}
    </span>
  </Link>
);

function ProductsMenu() {
  const adapid = PRODUCT_MENU.find((l) => l.key === 'adapid');
  // the right panel follows the pointer: what the hovered product connects to, and what it does
  const [peek, setPeek] = useState(null);
  const all = [...PRODUCT_MENU.map((l) => ({ to: l.key === 'adapid' ? 'adapid' : l.path, name: l.name, mark: l.key })), ...adapid.items.map((m) => ({ to: m.path, name: m.name, mark: 'adapid' }))];
  const cur = all.find((x) => x.to === peek);
  const d = cur && MENU_DETAIL[cur.to];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px]">
      <div className="p-8" onMouseLeave={() => setPeek(null)}>
        <div className="mb-7 flex items-start justify-between gap-6">
          <div>
            <p className="text-[20px] font-semibold tracking-[-0.015em] text-ink">Products</p>
            <p className="mt-1 text-[14.5px] text-ink-2">Security for people, machine identities and AI agents.</p>
          </div>
        </div>
        <GroupLabel>Platforms</GroupLabel>
        <div className="grid grid-cols-2 gap-x-8">
          {PRODUCT_MENU.map((l) => <Item key={l.key} to={l.path} name={l.name} desc={l.blurb.replace(/, in one platform$/, '')} lead={<ProductMark p={l.key} size={32} className="shrink-0" />} onPeek={() => setPeek(l.key === 'adapid' ? 'adapid' : l.path)} on={peek === (l.key === 'adapid' ? 'adapid' : l.path)} />)}
        </div>
        <div className="mt-6"><GroupLabel>adapID AI products</GroupLabel></div>
        <div className="grid grid-cols-2 gap-x-8">
          {adapid.items.map((m) => <Item key={m.path} to={m.path} name={m.name} desc={m.desc} lead={<Tile name={ADAPID_ICON[m.path] || 'ShieldCheck'} />} onPeek={() => setPeek(m.path)} on={peek === m.path} />)}
        </div>
      </div>
      <div className="border-l border-line bg-fg/[.02] p-8" aria-live="polite">
        {d ? (
          <div key={cur.to} className="fadein">
            <p className="flex items-center gap-2.5 text-[17px] font-semibold text-ink"><ProductMark p={cur.mark} size={24} />{cur.name}</p>
            <p className="mt-5 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">Works with</p>
            <Suspense fallback={<div className="mt-5 h-[120px]" />}><WorksWith keys={d.works} /></Suspense>
            <p className="mt-6 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">Capabilities</p>
            <ul className="mt-3 space-y-2">
              {d.caps.map((c) => <li key={c} className="flex items-start gap-2 text-[14px] leading-snug text-ink-2"><Icon name="CheckCircle" size={16} weight="fill" className="mt-px shrink-0 text-[#1a58d0]" />{c}</li>)}
            </ul>
          </div>
        ) : (
          <>
            <p className="text-[17px] font-semibold text-ink">Works with</p>
            <p className="mt-1 text-[13.5px] leading-snug text-ink-3">The clouds, identity providers and AI tools our products connect to.</p>
            <Suspense fallback={<div className="mt-6 aspect-square" />}><WorksWith /></Suspense>
          </>
        )}
      </div>
    </div>
  );
}

function SolutionsMenu() {
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="p-8">
        <GroupLabel>By use case</GroupLabel>
        <div className="grid grid-cols-2 gap-x-8">{CHALLENGES.map((c) => <Item key={c.name} to={c.path} name={c.name} desc={c.desc} lead={<Tile name={c.icon} />} />)}</div>
      </div>
      <div className="border-l border-line p-8">
        <GroupLabel>By industry</GroupLabel>
        {SOLUTIONS.map((x) => <Item key={x.slug} to={`/solutions/${x.slug}`} name={x.name} desc={x.desc} lead={<Tile name={x.icon} />} />)}
      </div>
    </div>
  );
}

/* The language menu (src/lib/translate.js): English is the source. */
function LanguageMenu({ away, className, up }) {
  const [open, setOpen] = useState(false);
  const [region, setR] = useState(REGIONS[0]);
  const ref = useRef(null);
  useEffect(() => {
    const sync = () => setR(getRegion());
    sync(); window.addEventListener('da:region', sync);
    return () => window.removeEventListener('da:region', sync);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key); };
  }, [open]);
  // as on okta.com: the current region on the button, every other region in the panel
  const others = REGIONS.filter(([c]) => c !== region[0]);
  return (
    <div ref={ref} className={cx('relative notranslate', className)} translate="no">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="true" aria-label={`Region and language: ${regionLabel(region)}`} tabIndex={away ? -1 : undefined}
        className={cx('lm-btn inline-flex items-center gap-2', open && 'on')}>
        <Icon name="Globe" size={17} /><span className="lm-label">{regionLabel(region)}</span><Icon name="CaretDown" size={11} weight="bold" className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul aria-label="Choose your region" className={cx('lm-panel', up ? 'up' : '')}>
          {others.map(([c, n, l]) => (
            <li key={c}>
              <button type="button" onClick={() => { setOpen(false); setRegion(c); }} lang={l}>{n}{l === 'en' && ['ca'].includes(c) ? ' (EN)' : ''}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const NAV = [
  { label: 'Products', menu: ProductsMenu },
  { label: 'Solutions', menu: SolutionsMenu },
  { label: 'Blogs', to: '/blogs' },
  { label: 'Why Deep Algorithms', to: '/why-deep-algorithms' },
];

/* Phones and tablets: a sheet that rises from the bottom, products first as
   large tiles, then everything else one tap away, contact at the end. */
function MobileMenu({ onNav }) {
  const row = 'flex items-center justify-between border-b border-line py-3.5 text-[17px] font-medium';
  return (
    <nav aria-label="Mobile" className="px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-1">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">Products</p>
      <ul className="grid grid-cols-2 gap-2.5">
        {PRODUCT_MENU.map((l) => (
          <li key={l.key}>
            <Link to={l.path} onClick={onNav} className="flex h-full flex-col rounded-[18px] border border-line-2 p-3.5" style={{ background: `linear-gradient(160deg, color-mix(in oklab, ${l.acc} 14%, transparent), transparent 70%)` }}>
              <ProductMark p={l.key} size={34} />
              <span className="mt-3 text-[15.5px] font-semibold leading-tight">{l.name}</span>
              <span className="mt-1 text-[12.5px] leading-snug text-ink-3">{l.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
        {[['NHI Security for AWS', '/adapid-ai/nhi-security'], ['Fraud Prevention', '/adapid-ai/fraud-prevention'], ['Active Directory', '/ad-security']].map(([n, to]) => (
          <Link key={to} to={to} onClick={onNav} className="shrink-0 rounded-full border border-line-2 px-3.5 py-2 text-[14px] text-ink-2">{n}</Link>
        ))}
      </div>
      <p className="mb-2 mt-7 text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">Solutions</p>
      <div className="flex flex-wrap gap-2">
        {SOLUTIONS.map((x) => <Link key={x.slug} to={`/solutions/${x.slug}`} onClick={onNav} className="rounded-full border border-line-2 px-3.5 py-2 text-[14px] text-ink-2">{x.name}</Link>)}
      </div>
      <div className="mt-5">
        {[['Blogs', '/blogs'], ['Why Deep Algorithms', '/why-deep-algorithms'], ['Careers', '/why-deep-algorithms#careers']].map(([n, to]) => (
          <Link key={to} to={to} onClick={onNav} className={row}>{n}<Icon name="CaretRight" size={15} className="text-ink-3" /></Link>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between text-[14.5px] text-ink-2">
        <span>Language</span>
        <LanguageMenu up />
      </div>
      <Button to="/request-demo" onClick={onNav} className="mt-5 w-full">Book a demo</Button>
    </nav>
  );
}

export default function Header() {
  const [open, setOpen] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [overLight, setOverLight] = useState(false);
  const [tucked, setTucked] = useState(false);
  const lastY = useRef(0);
  const timer = useRef();
  const { pathname, search, hash } = useLocation();
  const [theme, toggleTheme] = useTheme();

  useEffect(() => { setOpen(null); setMobile(false); }, [pathname, search, hash]);
  useEffect(() => {
    const on = () => setMobile(true);
    window.addEventListener('da:menu', on);
    return () => window.removeEventListener('da:menu', on);
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(null); setMobile(false); } };
    // Light when a light sheet sits under the bar (mixed theme only; CSS ignores it in dark).
    let raf = 0;
    const measure = () => {
      raf = 0;
      const y = window.scrollY;
      setScrolled(y > 8);
      if (y < 140 || y < lastY.current - 2) setTucked(false);
      else if (y > lastY.current + 2) setTucked(true);
      lastY.current = y;
      // dark only when a dark band actually sits under the bar; product heroes
      // (navy, starting under a white strip) and pages that begin below the bar stay light
      let light = true;
      for (const el of document.querySelectorAll('.page > .dark:not(.hero-navy)')) {
        const r = el.getBoundingClientRect();
        if (r.top <= 40 && r.bottom >= 32) { light = false; break; }
      }
      setOverLight(light);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    // the page below may arrive after the bar (lazy routes): re-check when it does
    const ro = new ResizeObserver(onScroll); ro.observe(document.body);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  // re-measure once the next page has rendered
  useEffect(() => { const t = setTimeout(() => window.dispatchEvent(new Event('scroll')), 120); return () => clearTimeout(t); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
    window.dispatchEvent(new CustomEvent('da:menu-state', { detail: mobile }));
  }, [mobile]);

  const enter = (l) => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(l), open ? 0 : 90); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(null), 200); };
  const Menu = NAV.find((n) => n.label === open)?.menu;
  const solid = scrolled || open || mobile;
  const light = overLight || open || mobile;

  return (
    <header className={cx('noprint fixed inset-x-0 top-0 z-50 transition-transform duration-300', light && 'tone-l', pathname.startsWith('/promptbreak') && 'pb-hdr', tucked && !mobile && 'max-md:-translate-y-full')} onMouseLeave={leave}>
      <a href="#main" className="sr-only-focusable absolute left-4 top-3 z-50 rounded-full bg-white px-4 py-2 text-[#12171f]">Skip to content</a>
      <div aria-hidden="true" className={cx('hdr-bg absolute inset-0 -z-10 border-b', solid ? 'solid border-line bg-black/80 backdrop-blur-xl' : 'border-transparent bg-transparent')} />
      <div className="wrap flex h-[64px] items-center gap-6 lg:h-[72px]">
        <Link to="/" aria-label="Deep Algorithms home" className="shrink-0"><Logo dual className="h-[30px] lg:h-[36px]" /></Link>
        <nav aria-label="Primary" className="hidden flex-1 lg:block">
          <ul className="flex items-center justify-center gap-0.5 xl:gap-1.5">
            {NAV.map((n) => (
              <li key={n.label}>
                {n.menu ? (
                  <button type="button" aria-expanded={open === n.label} aria-controls="mega" onMouseEnter={() => enter(n.label)} onClick={() => setOpen(open === n.label ? null : n.label)}
                    className={cx('inline-flex h-10 items-center rounded-full px-3.5 text-[15px] font-medium xl:px-4 xl:text-[16px] transition-colors', open === n.label ? 'bg-fg/[.07] text-ink' : 'text-ink-2 hover:text-ink')}>
                    {n.label}
                  </button>
                ) : (
                  <Link to={n.to} onMouseEnter={() => { clearTimeout(timer.current); setOpen(null); }} aria-current={pathname === n.to ? 'page' : undefined}
                    className={cx('inline-flex h-10 items-center rounded-full px-3.5 text-[15px] font-medium xl:px-4 xl:text-[16px] transition-colors hover:text-ink', pathname === n.to ? 'text-ink' : 'text-ink-2')}>{n.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <button type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            className="theme-btn inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-2 text-ink-2 transition-colors hover:border-fg/30 hover:text-ink max-md:hidden">
            <Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size={18} />
          </button>
          <LanguageMenu className="hidden lg:inline-flex" />
          <Button to="/request-demo" size="sm" className="max-md:hidden lg:h-11 lg:px-6 lg:text-[15.5px]">Book a demo</Button>
          <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink max-md:hidden lg:hidden" aria-label={mobile ? 'Close menu' : 'Open menu'} aria-expanded={mobile} aria-controls="mobile-menu" onClick={() => setMobile(!mobile)}>
            <Icon name={mobile ? 'X' : 'List'} size={26} />
          </button>
        </div>
      </div>

      {Menu && (
        <>
          <div aria-hidden="true" className="mega-scrim fixed inset-0 -z-20 hidden bg-[#0b0e13]/30 lg:block" onMouseEnter={leave} onClick={() => setOpen(null)} />
          <div id="mega" onMouseEnter={() => clearTimeout(timer.current)} className="mega absolute inset-x-0 top-full hidden lg:block">
            <div className="wrap pt-2">
              <div key={open} className="fadein overflow-hidden rounded-[18px] border border-line bg-bg-1 shadow-[0_32px_80px_-28px_rgba(6,25,55,.45)]"><Menu /></div>
            </div>
          </div>
        </>
      )}
      {mobile && (
        <div className="lg:hidden">
          <button type="button" aria-label="Close menu" className="sheet-scrim fixed inset-0 z-[60] bg-black/55 backdrop-blur-[2px]" onClick={() => setMobile(false)} />
          <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" className="sheet fixed inset-x-0 bottom-0 z-[61] max-h-[88svh] overflow-y-auto rounded-t-[26px] border-t border-line-2 bg-bg shadow-[0_-30px_80px_-20px_rgba(0,0,0,.7)]">
            <div className="sticky top-0 z-[1] flex items-center justify-between bg-bg px-5 pb-2 pt-3">
              <span aria-hidden="true" className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-fg/20" />
              <span className="pt-3 text-[15px] font-semibold">Menu</span>
              <button type="button" onClick={() => setMobile(false)} aria-label="Close menu" className="mt-2 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line-2"><Icon name="X" size={18} /></button>
            </div>
            <MobileMenu onNav={() => setMobile(false)} />
          </div>
        </div>
      )}
    </header>
  );
}
