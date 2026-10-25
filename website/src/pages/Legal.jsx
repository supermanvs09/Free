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
      <article className="wrap max-w-[860px] py-14 md:py-20">
        <Breadcrumb items={[{ name: l.title }]} />
        <p className="eyebrow mt-10">Legal</p>
        <h1 className="t-h1 mt-3">{l.title}</h1>
        <p className="mt-4 text-[15px] text-ink-3">Last updated: {l.updated}</p>
        <div className="mt-12 border-t border-line pt-4"><Prose blocks={l.blocks} /></div>
      </article>
    </>
  );
}
