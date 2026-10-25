import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { LINES, SOLUTIONS, CARD, SITE } from '../data/site.js';
import { SOLUTION_PAGES } from '../data/solutions.js';
import { POSTS } from '../data/posts.js';
import { Button, Icon, cx } from './ui.jsx';
import Thumb from './visuals/Thumb.jsx';
import CoverArt from './visuals/CoverArt.jsx';

export function Logo({ className = 'h-[34px]', inverse }) {
  return <img src={inverse ? '/brand/logo-lockup-inverse.webp' : '/brand/logo-lockup.webp'} alt="Deep Algorithms" width="153" height="34" className={cx('w-auto', className)} />;
}

/* Two-pane mega menu, after cisco.com: a category list on the left, and for
   the active category its links, related research and one promo card. */
function Pane({ label, children }) {
  return <div key={label} className="fadein grid min-h-[340px] grid-cols-[272px_1fr] border-x border-transparent">{children}</div>;
}
const ListItem = ({ active, onSelect, to, children, sub }) => {
  const cls = cx('relative block w-full py-2.5 pl-5 pr-4 text-left text-[15px] transition-colors', active ? 'font-medium text-ink' : 'text-ink-2 hover:text-ink');
  const bar = active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand" />;
  return to ? (
    <Link to={to} className={cx(cls, '!text-brand')}>{children}</Link>
  ) : (
    <button type="button" onMouseEnter={onSelect} onFocus={onSelect} onClick={onSelect} aria-pressed={active} className={cls}>{bar}{children}{sub && <span className="block text-[12.5px] font-normal text-ink-3">{sub}</span>}</button>
  );
};
const Col = ({ title, children }) => (
  <div className="min-w-0">
    <h3 className="font-sans text-[15px] font-medium text-ink-3">{title}</h3>
    <ul className="mt-3 space-y-3">{children}</ul>
  </div>
);
const postsFor = (match) => POSTS.filter(match).slice(0, 3);
const ResearchLinks = ({ posts }) => posts.map((p) => (
  <li key={p.slug}><Link to={`/blogs/${p.slug}`} className="line-clamp-2 text-[14.5px] leading-snug text-ink hover:text-brand">{p.title}</Link></li>
));

function ProductsMenu() {
  const [i, setI] = useState(0);
  const l = LINES[i];
  const paths = l.modules.map((m) => m.path);
  const posts = postsFor((p) => paths.includes(p.product.path) || p.product.path.startsWith(l.path));
  const promoTo = l.promo.to || l.path;
  return (
    <Pane label={l.key}>
      <div className="border-r border-line py-1 pr-4">
        <ListItem to="/products">All products</ListItem>
        <div className="mt-1">{LINES.map((x, k) => <ListItem key={x.key} active={k === i} onSelect={() => setI(k)} sub={x.summary}>{x.name}</ListItem>)}</div>
      </div>
      <div className="grid grid-cols-[1.1fr_1fr_.9fr] gap-10 pl-12">
        <Col title="Products">
          {l.modules.map((m) => (
            <li key={m.path + m.name}>
              <Link to={m.path} className="group block">
                <span className="flex items-center gap-2 text-[15px] text-ink group-hover:text-brand">{m.name}</span>
                <span className="block text-[13px] leading-snug text-ink-3">{m.desc}</span>
              </Link>
            </li>
          ))}
          <li><Link to={l.path} className="inline-flex items-center gap-1 pt-1 text-[14.5px] font-medium text-brand hover:text-navy">Explore {l.name}<Icon name="CaretRight" size={12} weight="bold" /></Link></li>
        </Col>
        <Col title="Related research"><ResearchLinks posts={posts} /></Col>
        <Link to={promoTo} className="group block">
          <span className="block overflow-hidden rounded-[12px]"><Thumb k={l.promo.thumb} className="transition-transform duration-500 group-hover:scale-[1.03]" /></span>
          <span className="mt-3 flex items-center gap-2 font-display text-[18px] leading-snug text-ink group-hover:text-brand">{l.promo.title}</span>
          <span className="mt-1 block text-[13.5px] leading-snug text-ink-3">{l.promo.body}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-[14px] font-medium text-brand">{l.promo.cta}<Icon name="CaretRight" size={12} weight="bold" /></span>
        </Link>
      </div>
    </Pane>
  );
}

function SolutionsMenu() {
  const [i, setI] = useState(0);
  const s = SOLUTIONS[i];
  const page = SOLUTION_PAGES[s.slug];
  const posts = page.research.map((slug) => POSTS.find((p) => p.slug === slug)).filter(Boolean);
  return (
    <Pane label={s.slug}>
      <div className="border-r border-line py-1 pr-4">
        {SOLUTIONS.map((x, k) => <ListItem key={x.slug} active={k === i} onSelect={() => setI(k)} sub={x.desc}>{x.name}</ListItem>)}
      </div>
      <div className="grid grid-cols-[1.1fr_1fr_.9fr] gap-10 pl-12">
        <Col title="Recommended products">
          {page.products.map((k) => <li key={k}><Link to={CARD[k].path} className="group block"><span className="block text-[15px] text-ink group-hover:text-brand">{CARD[k].name}</span><span className="block text-[13px] leading-snug text-ink-3">{CARD[k].body}</span></Link></li>)}
          <li><Link to={`/solutions/${s.slug}`} className="inline-flex items-center gap-1 pt-1 text-[14.5px] font-medium text-brand hover:text-navy">Explore {s.name}<Icon name="CaretRight" size={12} weight="bold" /></Link></li>
        </Col>
        <Col title="Related research"><ResearchLinks posts={posts} /></Col>
        <Link to={`/solutions/${s.slug}`} className="group block">
          <CoverArt compact slug={posts[0]?.slug} category={posts[0]?.category} className="aspect-[16/10] rounded-[12px]" />
          <span className="mt-3 block font-display text-[18px] leading-snug text-ink group-hover:text-brand">{page.title}</span>
          <span className="mt-2 inline-flex items-center gap-1 text-[14px] font-medium text-brand">Explore {s.short}<Icon name="CaretRight" size={12} weight="bold" /></span>
        </Link>
      </div>
    </Pane>
  );
}

const COMPANY = [
  { name: 'About us', desc: 'Our story, leadership and advisors', path: '/about-us' },
  { name: 'Careers', desc: 'Work on hard security problems', path: '/about-us#careers' },
  { name: 'Contact', desc: 'Offices, phone and email', path: '/contact' },
];
function CompanyMenu() {
  const p = POSTS[0];
  return (
    <Pane label="company">
      <div className="border-r border-line py-1 pr-4">{COMPANY.map((c) => <Link key={c.path} to={c.path} className="block py-2.5 pl-5 pr-4 text-[15px] text-ink-2 hover:text-ink">{c.name}<span className="block text-[12.5px] text-ink-3">{c.desc}</span></Link>)}</div>
      <div className="grid grid-cols-[1fr_1fr_.9fr] gap-10 pl-12">
        <Link to={`/blogs/${p.slug}`} className="group col-span-2 grid grid-cols-2 gap-6">
          <CoverArt compact slug={p.slug} category={p.category} className="aspect-[16/10] rounded-[12px]" />
          <span className="self-center"><span className="text-[14px] font-medium text-brand">Latest research</span><span className="mt-2 block font-display text-[20px] leading-snug text-ink group-hover:text-brand">{p.title}</span><span className="mt-3 inline-flex items-center gap-1 text-[14px] font-medium text-brand">Read<Icon name="ArrowRight" size={14} /></span></span>
        </Link>
        <Link to="/request-demo" className="group block self-start rounded-[16px] bg-navy p-6 text-white">
          <span className="font-display text-[22px] leading-snug">See it on your own identities</span>
          <span className="mt-2 block text-[14px] text-white/80">A 30-minute live demo.</span>
          <span className="mt-5 inline-flex h-10 items-center rounded-full bg-white px-5 text-[14px] font-medium text-navy group-hover:bg-sky">Book a demo</span>
        </Link>
      </div>
    </Pane>
  );
}

const NAV = [
  { label: 'Products', menu: ProductsMenu },
  { label: 'Solutions', menu: SolutionsMenu },
  { label: 'Why Deep Algorithms', to: '/platform' },
  { label: 'Research', to: '/blogs' },
  { label: 'Company', menu: CompanyMenu },
];

function UtilityBar() {
  return (
    <nav aria-label="Utility" className="hidden border-b border-line bg-mist lg:block">
      <div className="wrap flex h-9 items-center justify-end gap-6 text-[13px] text-ink-2">
        <Link to="/blogs" className="hover:text-brand">Research</Link>
        <Link to="/about-us#careers" className="hover:text-brand">Careers</Link>
        <Link to="/contact" className="hover:text-brand">Contact</Link>
        <a href={SITE.phoneHref} className="inline-flex items-center gap-1.5 hover:text-brand"><Icon name="Phone" size={14} />{SITE.phone}</a>
      </div>
    </nav>
  );
}

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
      <UtilityBar />
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
