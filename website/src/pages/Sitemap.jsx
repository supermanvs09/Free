import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { LINES, SOLUTIONS } from '../data/site.js';
import { POSTS } from '../data/posts.js';
import { LEGAL } from '../data/legal.js';
import { Breadcrumb } from '../components/ui.jsx';

const GROUPS = [
  { title: 'Company', links: [['Home', '/'], ['Why Deep Algorithms', '/platform'], ['About us', '/about-us'], ['Careers', '/about-us#careers'], ['Contact', '/contact'], ['Book a demo', '/request-demo']] },
  { title: 'Products', links: [['All products', '/products'], ...LINES.flatMap((l) => [[l.name, l.path], ...l.modules.filter((m) => m.path !== l.path).map((m) => [m.name, m.path])])] },
  { title: 'Solutions', links: SOLUTIONS.map((s) => [s.name, `/solutions/${s.slug}`]) },
  { title: 'Research', links: [['All research', '/blogs'], ...POSTS.map((p) => [p.title, `/blogs/${p.slug}`])] },
  { title: 'Legal and accessibility', links: Object.entries(LEGAL).map(([k, l]) => [l.title, `/${k}`]) },
];

export default function Sitemap() {
  return (
    <>
      <Seo title="Sitemap" path="/sitemap" description="Every page on the Deep Algorithms website, grouped by company, products, solutions, research and legal." crumbs={[{ name: 'Sitemap', path: '/sitemap' }]} />
      <div className="wrap py-14 md:py-20">
        <Breadcrumb items={[{ name: 'Sitemap' }]} />
        <h1 className="t-h1 mt-10">Sitemap</h1>
        <p className="t-lead mt-4 max-w-[560px]">Every page on this site, in one place.</p>
        <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h2 className="t-h3">{g.title}</h2>
              <ul className="mt-4 space-y-2.5 border-t border-line pt-4">
                {g.links.map(([n, to]) => <li key={to + n}><Link to={to} className="text-[15.5px] text-ink-2 hover:text-brand">{n}</Link></li>)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
