import { Link } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { LEGAL } from '../data/legal.js';
import { Breadcrumb } from '../components/ui.jsx';
import Prose from '../components/Prose.jsx';

export default function Legal({ id }) {
  const l = LEGAL[id];
  const path = `/${id}`;
  return (
    <>
      <Seo title={l.title} description={l.description} path={path} crumbs={[{ name: l.title, path }]} />
      <article className="calm">
        <div className="wrap grid gap-12 py-14 md:py-20 lg:grid-cols-[220px_minmax(0,760px)] lg:gap-20">
          <aside className="hidden lg:block">
            <nav aria-label="Legal pages" className="sticky top-28">
              <p className="text-[12.5px] font-semibold uppercase tracking-[.1em] text-ink-3">Legal</p>
              <ul className="mt-4 space-y-1 border-l border-line text-[14.5px]">
                {Object.entries(LEGAL).map(([k, x]) => <li key={k}><Link to={`/${k}`} aria-current={k === id ? 'page' : undefined} className={`-ml-px block border-l-2 py-1.5 pl-4 ${k === id ? 'border-cyan text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>{x.title}</Link></li>)}
              </ul>
            </nav>
          </aside>
          <div className="min-w-0">
            <Breadcrumb items={[{ name: l.title }]} />
            <h1 className="t-h1 mt-8">{l.title}</h1>
            <p className="mt-4 text-[15px] text-ink-3">Last updated: {l.updated}</p>
            <div className="mt-10 border-t border-line pt-4"><Prose blocks={l.blocks} /></div>
          </div>
        </div>
      </article>
    </>
  );
}
