/* Renders article and legal block arrays: p, h2, h3, list, quote, table, sources, links. */
import { useState } from 'react';

export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* A link from a section heading to itself: hover or focus shows #, a click copies the address.
   Put it inside a heading that has the `group` class. */
export function HeadingLink({ id }) {
  const [done, setDone] = useState(false);
  const copy = (e) => {
    e.preventDefault();
    const url = `${location.origin}${location.pathname}#${id}`;
    history.replaceState(null, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    navigator.clipboard?.writeText(url).then(() => { setDone(true); setTimeout(() => setDone(false), 1800); }).catch(() => {});
  };
  return (
    <a href={`#${id}`} onClick={copy} aria-label="Copy a link to this section" className="hd-link ml-2 inline-block align-middle text-[.7em] font-medium text-ink-3 no-underline opacity-0 transition-opacity hover:text-cyan-2 focus-visible:opacity-100 group-hover:opacity-100">
      {done ? <span className="text-[.6em] tracking-normal text-[#3fd98f]">Link copied</span> : '#'}
    </a>
  );
}

function H2({ text }) {
  const id = slugify(text);
  return <h2 id={id} className="group relative scroll-mt-28">{text}<HeadingLink id={id} /></h2>;
}

export default function Prose({ blocks }) {
  return (
    <div className="prose-da">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2': return <H2 key={i} text={b.text} />;
          case 'h3': return <h3 key={i}>{b.text}</h3>;
          case 'list': return <ul key={i} className="list-disc space-y-2 pl-5 marker:text-cyan">{b.items.map((t, k) => <li key={k}>{t}</li>)}</ul>;
          case 'links': return <ul key={i} className="space-y-2">{b.items.map(([t, href]) => <li key={href}><a href={href} target="_blank" rel="noreferrer">{t}</a></li>)}</ul>;
          case 'quote': return <blockquote key={i} className="border-l-2 border-cyan pl-6 text-[22px] font-medium leading-snug text-ink">{b.text}</blockquote>;
          case 'sources': return <p key={i} className="rounded-[16px] border border-line bg-fg/[.02] p-5 text-[14px] leading-relaxed text-ink-3"><span className="font-semibold text-ink-2">Sources: </span>{b.text}</p>;
          case 'table': {
            const [head, ...rows] = b.rows;
            return (
              <div key={i} tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto rounded-[16px] border border-line">
                <table className="w-full min-w-[560px] text-left text-[14.5px] leading-snug">
                  <thead className="bg-fg/[.05]"><tr>{head.map((h, k) => <th key={k} scope="col" className="px-4 py-3 font-semibold text-ink">{h}</th>)}</tr></thead>
                  <tbody>{rows.map((r, k) => <tr key={k} className="border-t border-line align-top">{r.map((c, j) => <td key={j} className="px-4 py-3 text-ink-2">{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          }
          default: return <p key={i}>{b.text}</p>;
        }
      })}
    </div>
  );
}
