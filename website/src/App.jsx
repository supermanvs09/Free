import { lazy, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import Header from './components/Header.jsx';
import MobileBar from './components/MobileBar.jsx';
import Footer from './components/Footer.jsx';
import CommandLauncher from './components/CommandLauncher.jsx';
import HeistLauncher from './components/heist-lab/HeistLauncher.jsx';
import { useSpotlight } from './components/fx.jsx';
import { PRODUCTS } from './data/products.js';
import { ZCAPS } from './data/zenstra.js';
import { INDUSTRIES } from './data/ia.js';
import { POSTS } from './data/posts.js';
import { LEGAL } from './data/legal.js';

const Home = lazy(() => import('./pages/Home.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Solution = lazy(() => import('./pages/Solution.jsx'));
const Why = lazy(() => import('./pages/Why.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Careers = lazy(() => import('./pages/Careers.jsx'));
const Blog = lazy(() => import('./pages/Blog.jsx'));
const Article = lazy(() => import('./pages/Article.jsx'));
const Demo = lazy(() => import('./pages/Demo.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const Legal = lazy(() => import('./pages/Legal.jsx'));
const Sitemap = lazy(() => import('./pages/Sitemap.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Capability = lazy(() => import('./pages/products/Capability.jsx'));
const Heist = lazy(() => import('./pages/Heist.jsx'));
const HeistPlay = lazy(() => import('./pages/HeistPlay.jsx'));

/* Every product has its own page; the six Zenstra capabilities share one. */
const PRODUCT_PAGES = {
  zenstra: lazy(() => import('./pages/products/Zenstra.jsx')),
  adapid: lazy(() => import('./pages/products/Adapid.jsx')),
  cirm: lazy(() => import('./pages/products/Cirm.jsx')),
  nhi: lazy(() => import('./pages/products/Nhi.jsx')),
  fraud: lazy(() => import('./pages/products/Fraud.jsx')),
  ad: lazy(() => import('./pages/products/AdSecurity.jsx')),
  icms: lazy(() => import('./pages/products/Icms.jsx')),
};

/* Every public URL; scripts/prerender.mjs renders these and lists them in sitemap.xml. */
export const PATHS = [
  '/', '/products',
  ...Object.values(PRODUCTS).map((p) => p.path),
  ...INDUSTRIES.map((s) => s.path),
  '/about-us', '/why-deep-algorithms', '/careers', '/blogs', ...POSTS.map((p) => `/blogs/${p.slug}`),
  '/request-demo', '/contact', '/sitemap', '/prompt-heist', '/prompt-heist/play', ...Object.keys(LEGAL).map((k) => `/${k}`),
];

/* Scroll to top on navigation, or to the #hash target. */
function PageEffects() {
  const { pathname, hash } = useLocation();
  useSpotlight();
  // marks the page as hydrated (motion styles and the e2e suite key off it)
  useEffect(() => { document.documentElement.classList.add('io'); }, []);
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView(), 60);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return undefined;
  }, [pathname, hash]);
  // anything that scrolls sideways (the swipe rails on a phone, wide code) can
  // be reached and scrolled with the keyboard too
  useEffect(() => {
    const mark = () => document.querySelectorAll('main .m-rail, main pre, main .overflow-x-auto, main .vz-exact').forEach((el) => {
      const scrolls = el.scrollWidth > el.clientWidth + 1;
      if (scrolls && el.classList.contains('vz-exact') && !el.dataset.kb) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; // wide diagrams open on their centre
      if (scrolls && !el.hasAttribute('tabindex')) { el.tabIndex = 0; el.dataset.kb = '1'; if (!el.getAttribute('aria-label')) { if (!/^(UL|OL)$/.test(el.tagName) && !el.getAttribute('role')) el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Scrolls sideways'); } }
      else if (!scrolls && el.dataset.kb) { el.removeAttribute('tabindex'); delete el.dataset.kb; }
    });
    const t = setTimeout(mark, 900);
    window.addEventListener('resize', mark);
    return () => { clearTimeout(t); window.removeEventListener('resize', mark); };
  }, [pathname]);
  return null;
}

/* Each page is keyed by its path, so a new page fades up once; the first
   page (prerendered) shows at once. Children are the page's bands: .stage
   bands stay dark, the rest are the light sheets of the mixed theme. */
function Page({ children }) {
  const { pathname } = useLocation();
  const seen = useRef({ path: pathname, moved: false });
  if (seen.current.path !== pathname) seen.current = { path: pathname, moved: true };
  return <div key={pathname} className={seen.current.moved ? 'page page-in' : 'page'}>{children}</div>;
}

export default function App() {
  return (
    <>
      <Header />
      <CommandLauncher />
      <main id="main" tabIndex={-1} className="pt-[var(--hdr)] outline-none">
        <PageEffects />
        <Suspense fallback={<div className="page"><div className="min-h-screen" /></div>}>
          <Page>
          <Routes>
            <Route path="/" element={<Home />} />
            {/* moved pages (also redirected with a 301 in nginx, vercel.json and _redirects) */}
            <Route path="/platform" element={<Navigate to="/products" replace />} />
            <Route path="/ad-security" element={<Navigate to="/adapid-ai/active-directory-security" replace />} />
            <Route path="/botshield-ai/*" element={<Navigate to="/products" replace />} />
            <Route path="/botshield-ai" element={<Navigate to="/products" replace />} />
            <Route path="/products" element={<Products />} />
            {Object.entries(PRODUCT_PAGES).map(([k, P]) => <Route key={k} path={PRODUCTS[k].path} element={<P />} />)}
            {Object.entries(ZCAPS).map(([k, c]) => <Route key={k} path={c.path} element={<Capability id={k} />} />)}
            <Route path="/solutions/:slug" element={<Solution />} />
            <Route path="/about-us" element={<About />} />
            <Route path="/why-deep-algorithms" element={<Why />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/blogs" element={<Blog />} />
            <Route path="/blogs/:slug" element={<Article />} />
            <Route path="/product-tour" element={<Navigate to="/products" replace />} />
            <Route path="/prompt-heist" element={<Heist />} />
            <Route path="/prompt-heist/play" element={<HeistPlay />} />
            <Route path="/request-demo" element={<Demo />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/sitemap" element={<Sitemap />} />
            {Object.keys(LEGAL).map((k) => <Route key={k} path={`/${k}`} element={<Legal id={k} />} />)}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Page>
        </Suspense>
      </main>
      <Footer />
      <MobileBar />
      {/* after the quick-action bar: its CSS keys off the bar's state */}
      <HeistLauncher />
      <div className="grain noprint" aria-hidden="true" />
    </>
  );
}
