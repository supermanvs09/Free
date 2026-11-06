import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { SITE } from '../data/site.js';
import { PLATFORMS, INDUSTRIES, BY_NEED, RESOURCES, COMPANY } from '../data/ia.js';
import { LANGS, getLang, setLang } from '../lib/translate.js';
import { Button, Icon, cx } from './ui.jsx';
import ProductMark from './ProductMark.jsx';

/* `inverse` is the white lockup for dark surfaces (footer, Prompt Heist). */
export function Logo({ className = 'h-[30px]', inverse }) {
  return <img src={inverse ? '/brand/logo-lockup-inverse.webp' : '/brand/logo-lockup.webp'} alt="Deep Algorithms" width="153" height="34" className={cx('w-auto', className)} />;
}

export const topicSlug = (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/* ---------- menu items ---------- */
const Tile = ({ name, acc }) => <span className="ptile ptile-sm mt-0.5" style={acc ? { '--acc': acc } : undefined}><Icon name={name} size={17} /></span>;
function Item({ to, name, desc, icon, acc, lead, onNav }) {
  return (
    <Link to={to} onClick={onNav} className="mm-item">
      {lead || (icon && <Tile name={icon} acc={acc} />)}
      <span className="min-w-0">
        <span className="mm-name block text-[14.5px] font-semibold leading-snug text-ink transition-colors">{name}</span>
        {desc && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{desc}</span>}
      </span>
    </Link>
  );
}
const Label = ({ children }) => <p className="mm-label">{children}</p>;

function ProductsMenu({ onNav }) {
  const [adap, zen, icms] = PLATFORMS;
  const zi = Object.fromEntries(zen.items.map((i) => [i.key, i]));
  return (
    <div className="grid grid-cols-[230px_minmax(0,1fr)_minmax(0,1fr)_260px] gap-10 py-8">
      <div>
        <p className="t-h4">Products</p>
        <p className="mt-2 t-small">Security for the people, machine identities and AI agents your business runs on.</p>
        <Link to="/products" onClick={onNav} className="alink mt-5 text-[14px]">All products<Icon name="ArrowRight" size={14} weight="bold" className="arr" /></Link>
      </div>
      <div>
        <Label>adapID AI · identity security</Label>
        <Item to={adap.path} onNav={onNav} name="adapID AI overview" desc={adap.tagline} lead={<ProductMark p="adapid" size={32} className="mt-0.5" />} />
        {adap.items.map((i) => <Item key={i.key} to={i.path} onNav={onNav} name={i.name} desc={i.desc} icon={i.icon} acc={adap.acc} />)}
      </div>
      <div>
        <Label>Zenstra AI · AI agent security</Label>
        <Item to={zen.path} onNav={onNav} name="Zenstra AI overview" desc={zen.tagline} lead={<ProductMark p="zenstra" size={32} className="mt-0.5" />} />
        <div className="mt-2 grid grid-cols-2 gap-x-6">
          {zen.groups.map((g) => (
            <div key={g.name}>
              <p className="mb-1 mt-2 text-[12px] font-semibold text-ink-3">{g.name}</p>
              {g.items.map((k) => <Item key={k} to={zi[k].path} onNav={onNav} name={zi[k].name} />)}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Link to={icms.path} onClick={onNav} className="card card-link block p-5">
          <span className="flex items-center gap-3"><ProductMark p="icms" size={32} /><span className="font-semibold text-ink">{icms.name}</span></span>
          <span className="mt-3 block t-small">{icms.tagline}: PII discovery, consent checks, 72-hour breach response and audit evidence.</span>
        </Link>
        <Link to="/product-tour" onClick={onNav} className="card-flat block p-5 transition-colors hover:bg-bg-2">
          <span className="flex items-center gap-2 font-semibold text-ink"><Icon name="Play" size={16} weight="fill" className="text-brand" />Product tour</span>
          <span className="mt-1 block t-small">See an attack stopped, step by step. No call needed.</span>
        </Link>
      </div>
    </div>
  );
}

function SolutionsMenu({ onNav }) {
  return (
    <div className="grid grid-cols-[230px_minmax(0,1fr)_minmax(0,1.3fr)] gap-10 py-8">
      <div>
        <p className="t-h4">Solutions</p>
        <p className="mt-2 t-small">The products combined for the risks of your industry.</p>
      </div>
      <div>
        <Label>By industry</Label>
        {INDUSTRIES.map((x) => <Item key={x.slug} to={x.path} onNav={onNav} name={x.name} desc={x.desc} icon={x.icon} />)}
      </div>
      <div>
        <Label>By need</Label>
        <div className="grid grid-cols-2 gap-x-6">{BY_NEED.map((x) => <Item key={x.name} to={x.path} onNav={onNav} name={x.name} desc={x.desc} icon={x.icon} />)}</div>
      </div>
    </div>
  );
}

function ResourcesMenu({ onNav }) {
  return (
    <div className="grid grid-cols-[230px_minmax(0,1fr)_minmax(0,1fr)] gap-10 py-8">
      <div>
        <p className="t-h4">Resources</p>
        <p className="mt-2 t-small">Research on how identities get attacked, and how to stop it.</p>
      </div>
      <div><Label>Learn</Label>{RESOURCES.learn.map((x) => <Item key={x.path} to={x.path} onNav={onNav} name={x.name} desc={x.desc} icon={x.icon} />)}</div>
      <div><Label>Explore</Label>{RESOURCES.explore.map((x) => <Item key={x.path} to={x.path} onNav={onNav} name={x.name} desc={x.desc} icon={x.icon} />)}</div>
    </div>
  );
}

function CompanyMenu({ onNav }) {
  return (
    <div className="grid grid-cols-[230px_minmax(0,2fr)_minmax(0,1fr)] gap-10 py-8">
      <div>
        <p className="t-h4">Company</p>
        <p className="mt-2 t-small">Built in Hyderabad since {SITE.founded}, with offices in Bengaluru and Texas.</p>
      </div>
      <div><Label>Deep Algorithms</Label><div className="grid grid-cols-2 gap-x-6">{COMPANY.map((x) => <Item key={x.path} to={x.path} onNav={onNav} name={x.name} desc={x.desc} icon={x.icon} />)}</div></div>
      <div>
        <Label>Talk to us</Label>
        <ul className="space-y-2 text-[14px]">
          <li><a href={`mailto:${SITE.email}`} className="inline-flex items-center gap-2 text-ink-2 hover:text-brand"><Icon name="EnvelopeSimple" size={16} />{SITE.email}</a></li>
          <li><a href={SITE.phoneHref} className="inline-flex items-center gap-2 text-ink-2 hover:text-brand"><Icon name="Phone" size={16} />{SITE.phone}</a></li>
        </ul>
      </div>
    </div>
  );
}

const NAV = [
  { label: 'Products', menu: ProductsMenu, match: ['/products', '/adapid-ai', '/agentic-ai', '/dpdpa-compliance'] },
  { label: 'Solutions', menu: SolutionsMenu, match: ['/solutions'] },
  { label: 'Resources', menu: ResourcesMenu, match: ['/blogs', '/product-tour', '/prompt-heist'] },
  { label: 'Company', menu: CompanyMenu, match: ['/about-us', '/why-deep-algorithms', '/careers', '/contact'] },
];

/* ---------- language ---------- */
export function LanguageMenu({ className, up, tabIndex }) {
  const [open, setOpen] = useState(false);
  const [lang, setL] = useState('en');
  const ref = useRef(null);
  useEffect(() => { setL(getLang()); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const out = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', out);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', key); };
  }, [open]);
  const cur = LANGS.find(([c]) => c === lang);
  return (
    <div ref={ref} className={cx('relative notranslate', className)} translate="no">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox" aria-label={`Language: ${cur[2]}`} tabIndex={tabIndex} className="inline-flex items-center gap-1.5 hover:text-ink">
        <Icon name="Globe" size={14} />{cur[1]}<Icon name="CaretDown" size={10} weight="bold" className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul role="listbox" aria-label="Language" className={cx('slide-in absolute right-0 z-10 max-h-[340px] w-[210px] overflow-y-auto rounded-[10px] border border-line bg-white p-1.5 shadow-[var(--e-3)]', up ? 'bottom-full mb-2' : 'top-full mt-2')}>
          {LANGS.map(([c, n, en]) => (
            <li key={c}>
              <button type="button" role="option" aria-selected={c === lang} onClick={() => { setOpen(false); setLang(c); }}
                className={cx('flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-[14px] hover:bg-bg-1', c === lang ? 'font-semibold text-ink' : 'text-ink-2')}>
                <span>{n}</span>{c !== 'en' && <span className="text-[12.5px] text-ink-3">{en}</span>}{c === lang && c === 'en' && <Icon name="Check" size={14} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const openSearch = () => window.dispatchEvent(new CustomEvent('da:command', { detail: 'search' }));

/* ---------- mobile drawer ---------- */
function Group({ title, children, open, onToggle }) {
  return (
    <div className="border-b border-line">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between py-4 text-left text-[17px] font-semibold text-ink">
        {title}<Icon name="CaretDown" size={16} className={cx('text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="slide-in pb-4">{children}</div>}
    </div>
  );
}
function Drawer({ onClose }) {
  const [g, setG] = useState('Products');
  const t = (k) => setG(g === k ? null : k);
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector('button')?.focus(); }, []);
  return (
    <div ref={ref} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" className="drawer lg:hidden">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
        <Logo className="h-[28px]" />
        <button type="button" onClick={onClose} aria-label="Close menu" className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] text-ink hover:bg-bg-1"><Icon name="X" size={24} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-6">
        <button type="button" onClick={() => { onClose(); openSearch(); }} className="mt-4 flex h-11 w-full items-center gap-2 rounded-[8px] border border-line-2 px-3.5 text-left text-[15px] text-ink-3"><Icon name="MagnifyingGlass" size={17} />Search products, solutions and research</button>
        <nav aria-label="Mobile" className="mt-2">
          <Group title="Products" open={g === 'Products'} onToggle={() => t('Products')}>
            {PLATFORMS.map((p) => (
              <div key={p.key} className="mb-4">
                <Link to={p.path} onClick={onClose} className="flex items-center gap-3 py-2"><ProductMark p={p.key} size={28} /><span className="font-semibold text-ink">{p.name}</span><span className="t-caption">{p.kind}</span></Link>
                {p.key !== 'icms' && <ul className="ml-[40px] border-l border-line pl-3">{p.items.map((i) => <li key={i.key}><Link to={i.path} onClick={onClose} className="block py-1.5 text-[15px] text-ink-2">{i.name}</Link></li>)}</ul>}
              </div>
            ))}
            <Link to="/products" onClick={onClose} className="alink text-[15px]">All products<Icon name="ArrowRight" size={14} weight="bold" /></Link>
          </Group>
          <Group title="Solutions" open={g === 'Solutions'} onToggle={() => t('Solutions')}>
            <p className="app-label mb-1">By industry</p>
            {INDUSTRIES.map((x) => <Link key={x.slug} to={x.path} onClick={onClose} className="block py-2 text-[15px] text-ink-2">{x.name}</Link>)}
            <p className="app-label mb-1 mt-4">By need</p>
            {BY_NEED.map((x) => <Link key={x.name} to={x.path} onClick={onClose} className="block py-2 text-[15px] text-ink-2">{x.name}</Link>)}
          </Group>
          <Group title="Resources" open={g === 'Resources'} onToggle={() => t('Resources')}>
            {[...RESOURCES.learn, ...RESOURCES.explore].map((x) => <Link key={x.path} to={x.path} onClick={onClose} className="block py-2 text-[15px] text-ink-2">{x.name}</Link>)}
          </Group>
          <Group title="Company" open={g === 'Company'} onToggle={() => t('Company')}>
            {COMPANY.map((x) => <Link key={x.path} to={x.path} onClick={onClose} className="block py-2 text-[15px] text-ink-2">{x.name}</Link>)}
          </Group>
        </nav>
        <div className="mt-6 flex items-center justify-between text-[14.5px] text-ink-2">
          <a href={SITE.phoneHref} className="inline-flex items-center gap-2"><Icon name="Phone" size={16} />{SITE.phone}</a>
          <LanguageMenu up />
        </div>
      </div>
      <div className="shrink-0 border-t border-line p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <Button to="/request-demo" onClick={onClose} size="lg" className="w-full">Book a demo</Button>
      </div>
    </div>
  );
}

/* ---------- header ---------- */
export default function Header() {
  const [open, setOpen] = useState(null);
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const timer = useRef();
  const triggers = useRef({});
  const { pathname, search, hash } = useLocation();

  useEffect(() => { setOpen(null); setMobile(false); }, [pathname, search, hash]);
  useEffect(() => {
    const on = () => setMobile(true);
    window.addEventListener('da:menu', on);
    return () => window.removeEventListener('da:menu', on);
  }, []);
  useEffect(() => {
    const onScroll = () => {
      const s = window.scrollY > 24;
      setScrolled(s);
      document.documentElement.style.setProperty('--hdr-now', s && window.innerWidth >= 1024 ? '64px' : '');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  useEffect(() => {
    if (!open && !mobile) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (open) triggers.current[open]?.focus();
      setOpen(null); setMobile(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mobile]);
  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
    window.dispatchEvent(new CustomEvent('da:menu-state', { detail: mobile }));
  }, [mobile]);

  const enter = (l) => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(l), open ? 0 : 120); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(null), 220); };
  const cur = NAV.find((n) => n.label === open);
  const Menu = cur?.menu;
  const close = () => setOpen(null);
  const t = scrolled ? -1 : undefined;

  return (
    <>
      <a href="#main" className="skip btn btn-primary btn-sm">Skip to content</a>
      <header className={cx('site-hdr noprint', scrolled && 'scrolled')} onMouseLeave={leave}>
        <div className="ubar hidden border-b border-line bg-bg-1 lg:block" aria-hidden={scrolled || undefined}>
          <div className="container flex h-10 items-center justify-between gap-6 text-[13px] text-ink-3">
            <p className="truncate">
              <span className="badge badge-brand mr-2 !h-5 !text-[11px] uppercase tracking-[.06em]">New</span>
              <span className="font-semibold text-ink-2">Prompt Heist</span>: crack five AI vaults with words, win internships and goodies.
              <Link to="/prompt-heist" tabIndex={t} className="ml-2 font-semibold text-brand hover:underline">Take the challenge</Link>
            </p>
            <ul className="flex shrink-0 items-center gap-6">
              <li><Link to="/contact" tabIndex={t} className="hover:text-ink">Contact</Link></li>
              <li><a href={SITE.phoneHref} tabIndex={t} className="inline-flex items-center gap-1.5 hover:text-ink"><Icon name="Phone" size={13} />{SITE.phone}</a></li>
              <li><LanguageMenu tabIndex={t} /></li>
            </ul>
          </div>
        </div>
        <div className="relative">
          <div className="container flex h-16 items-center gap-6">
            <Link to="/" aria-label="Deep Algorithms home" className="shrink-0"><Logo className="h-[30px] lg:h-[32px]" /></Link>
            <nav aria-label="Primary" className="hidden flex-1 lg:block">
              <ul className="flex items-center gap-1">
                {NAV.map((n) => {
                  const active = n.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
                  return (
                    <li key={n.label}>
                      <button type="button" ref={(el) => { triggers.current[n.label] = el; }} aria-expanded={open === n.label} aria-controls="mega" onMouseEnter={() => enter(n.label)}
                        onClick={() => setOpen(open === n.label ? null : n.label)} className={cx('nav-btn', active && 'is-cur')}>
                        {n.label}<Icon name="CaretDown" size={12} weight="bold" className="car" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={openSearch} aria-label="Search the site" title="Search (Ctrl K or ⌘ K)" className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] text-ink-2 transition-colors hover:bg-bg-1 hover:text-ink">
                <Icon name="MagnifyingGlass" size={19} />
              </button>
              <Button to="/request-demo" size="sm" className="max-sm:hidden">Book a demo</Button>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] text-ink hover:bg-bg-1 lg:hidden" aria-label="Open menu" aria-expanded={mobile} aria-controls="mobile-menu" onClick={() => setMobile(true)}>
                <Icon name="List" size={26} />
              </button>
            </div>
          </div>
          {Menu && (
            <div id="mega" className="mega hidden lg:block" onMouseEnter={() => clearTimeout(timer.current)}>
              <div key={open} className="container fadein"><Menu onNav={close} /></div>
            </div>
          )}
        </div>
      </header>
      {Menu && <div aria-hidden="true" className="scrim hidden lg:block" style={{ top: 'var(--hdr-now, var(--hdr))' }} onClick={close} onMouseEnter={leave} />}
      {mobile && <Drawer onClose={() => setMobile(false)} />}
    </>
  );
}
