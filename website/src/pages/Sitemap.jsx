import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { PLATFORMS, INDUSTRIES, COMPANY, RESOURCES } from '../data/ia.js';
import { POSTS } from '../data/posts.js';
import { LEGAL } from '../data/legal.js';
import { Breadcrumb } from '../components/ui.jsx';

/* Generated from the same IA as the menus and footer (src/data/ia.js). */
const GROUPS = [
  { title: 'Company', links: [['Home', '/'], ...COMPANY.map((c) => [c.name, c.path]), ['Book a demo', '/request-demo']] },
  { title: 'Products', links: [['All products', '/products'], ...PLATFORMS.flatMap((p) => [[`${p.name} overview`, p.path], ...(p.key === 'adapid' ? p.items.map((i) => [i.name, i.path]) : [])])] },
  { title: 'Zenstra AI capabilities', links: PLATFORMS[1].items.map((i) => [i.name, i.path]) },
  { title: 'Solutions', links: INDUSTRIES.map((s) => [s.name, s.path]) },
  { title: 'Resources', links: [...RESOURCES.explore.map((r) => [r.name, r.path]), ['All articles', '/blogs'], ...POSTS.map((p) => [p.title, `/blogs/${p.slug}`])] },
  { title: 'Legal and accessibility', links: Object.entries(LEGAL).map(([k, l]) => [l.title, `/${k}`]) },
];

export default function Sitemap() {
  return (
    <>
      <Seo title="Sitemap" path="/sitemap" description="Every page on the Deep Algorithms website, grouped by company, products, solutions, blogs and legal." crumbs={[{ name: 'Sitemap', path: '/sitemap' }]} />
      <div className="container py-10 md:py-14">
        <Breadcrumb items={[{ name: 'Sitemap' }]} />
        <h1 className="t-h1 mt-10">Sitemap</h1>
        <p className="t-lead mt-4 max-w-[560px]">Every page on this site, in one place.</p>
        <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h2 className="t-h3">{g.title}</h2>
              <ul className="mt-4 space-y-2.5 border-t border-line pt-4">
                {g.links.map(([n, to]) => <li key={to + n}><Link to={to} className="text-[15.5px] text-ink-2 hover:text-ink">{n}</Link></li>)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
