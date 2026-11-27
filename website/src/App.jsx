import { lazy, Suspense, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import { scrollToY } from './lib/smooth.js';
import Header from './components/Header.jsx';
import MobileBar from './components/MobileBar.jsx';
import JumpBar from './components/JumpBar.jsx';
import Footer from './components/Footer.jsx';
import Backdrop from './components/Backdrop.jsx';
import CommandLauncher from './components/CommandLauncher.jsx';
import { PRODUCTS } from './data/products.js';
import { SOLUTIONS } from './data/site.js';
import { POSTS } from './data/posts.js';
import { LEGAL } from './data/legal.js';

const Home = lazy(() => import('./pages/Home.jsx'));
const Solution = lazy(() => import('./pages/Solution.jsx'));
const Why = lazy(() => import('./pages/Why.jsx'));
const Blog = lazy(() => import('./pages/Blog.jsx'));
const Article = lazy(() => import('./pages/Article.jsx'));
const Demo = lazy(() => import('./pages/Demo.jsx'));
const Legal = lazy(() => import('./pages/Legal.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

/* Every product has its own page. */
const PRODUCT_PAGES = {
  zenstra: lazy(() => import('./pages/products/Zenstra.jsx')),
  adapid: lazy(() => import('./pages/products/Cirm.jsx')),
  nhi: lazy(() => import('./pages/products/Nhi.jsx')),
  fraud: lazy(() => import('./pages/products/Fraud.jsx')),
  ad: lazy(() => import('./pages/products/AdSecurity.jsx')),
  icms: lazy(() => import('./pages/products/Icms.jsx')),
};

/* The six Zenstra capability pages became tabs on the Zenstra page. */
const ZEN_OLD = [['/agentic-ai/agent-discovery', 'discover'], ['/agentic-ai/agent-access', 'scope'], ['/agentic-ai/runtime-enforcement', 'enforce'], ['/agentic-ai/mcp-security', 'mcp'], ['/agentic-ai/detection-response', 'detect'], ['/agentic-ai/decision-record', 'prove']];

/* Every public URL; scripts/prerender.mjs renders these and lists them in sitemap.xml. */
export const PATHS = [
  '/',
  ...Object.values(PRODUCTS).map((p) => p.path),
  ...SOLUTIONS.map((s) => `/solutions/${s.slug}`),
  '/why-deep-algorithms', '/blogs', ...POSTS.map((p) => `/blogs/${p.slug}`),
  '/request-demo', ...Object.keys(LEGAL).map((k) => `/${k}`),
];

/* Scroll to top on navigation, or to the #hash target. */
function PageEffects() {
  const { pathname, hash } = useLocation();
  // hydrated: scroll reveals may now hide what is below the fold (and tests wait on it)
  useEffect(() => { document.documentElement.classList.add('io'); }, []);
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView(), 60);
      return () => clearTimeout(t);
    }
    scrollToY(0, { instant: true });
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
      <Backdrop />
      <Header />
      <CommandLauncher />
      <main id="main" className="pt-[var(--hdr)]">
        <PageEffects />
        <Suspense fallback={<div className="page"><div className="min-h-screen" /></div>}>
          <Page>
          <Routes>
            <Route path="/" element={<Home />} />
            {/* the company page and the old Why page are now one page */}
            <Route path="/platform" element={<Navigate to="/why-deep-algorithms" replace />} />
            <Route path="/about-us" element={<Navigate to="/why-deep-algorithms" replace />} />
            {/* pages folded into others: the products card on home, the Zenstra tabs, the demo form */}
            <Route path="/products" element={<Navigate to="/" replace />} />
            <Route path="/contact" element={<Navigate to="/request-demo" replace />} />
            <Route path="/sitemap" element={<Navigate to="/" replace />} />
            {ZEN_OLD.map(([from, tab]) => <Route key={from} path={from} element={<Navigate to={`/agentic-ai/agentic-identity#cap-${tab}`} replace />} />)}
            {Object.entries(PRODUCT_PAGES).map(([k, P]) => <Route key={k} path={PRODUCTS[k].path} element={<P />} />)}
            <Route path="/solutions/:slug" element={<Solution />} />
            <Route path="/why-deep-algorithms" element={<Why />} />
            <Route path="/blogs" element={<Blog />} />
            <Route path="/blogs/:slug" element={<Article />} />
            <Route path="/request-demo" element={<Demo />} />
            {Object.keys(LEGAL).map((k) => <Route key={k} path={`/${k}`} element={<Legal id={k} />} />)}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Page>
        </Suspense>
      </main>
      <Footer />
      <JumpBar />
      <MobileBar />
    </>
  );
}
