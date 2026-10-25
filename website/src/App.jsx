import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { PRODUCTS } from './data/products.js';
import { SOLUTIONS } from './data/site.js';
import { POSTS } from './data/posts.js';
import { LEGAL } from './data/legal.js';

const Home = lazy(() => import('./pages/Home.jsx'));
const Platform = lazy(() => import('./pages/Platform.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Product = lazy(() => import('./pages/Product.jsx'));
const Solution = lazy(() => import('./pages/Solution.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Blog = lazy(() => import('./pages/Blog.jsx'));
const Article = lazy(() => import('./pages/Article.jsx'));
const Demo = lazy(() => import('./pages/Demo.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const Legal = lazy(() => import('./pages/Legal.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

/* Every public URL; scripts/prerender.mjs renders these and lists them in sitemap.xml. */
export const PATHS = [
  '/', '/platform', '/products',
  ...Object.values(PRODUCTS).map((p) => p.path),
  ...SOLUTIONS.map((s) => `/solutions/${s.slug}`),
  '/about-us', '/blogs', ...POSTS.map((p) => `/blogs/${p.slug}`),
  '/request-demo', '/contact', ...Object.keys(LEGAL).map((k) => `/${k}`),
];

/* Scroll to top on navigation, or to the #hash target. */
function PageEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <Header />
      <main id="main">
        <PageEffects />
        <Suspense fallback={<div className="min-h-screen" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/platform" element={<Platform />} />
            <Route path="/products" element={<Products />} />
            {Object.entries(PRODUCTS).map(([k, p]) => <Route key={k} path={p.path} element={<Product id={k} />} />)}
            <Route path="/solutions/:slug" element={<Solution />} />
            <Route path="/about-us" element={<About />} />
            <Route path="/blogs" element={<Blog />} />
            <Route path="/blogs/:slug" element={<Article />} />
            <Route path="/request-demo" element={<Demo />} />
            <Route path="/contact" element={<Contact />} />
            {Object.keys(LEGAL).map((k) => <Route key={k} path={`/${k}`} element={<Legal id={k} />} />)}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
