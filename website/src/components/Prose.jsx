/* Renders article and legal block arrays: p, h2, h3, list, quote, table, sources, links. */
export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function Prose({ blocks }) {
  return (
    <div className="prose-da">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2': return <h2 key={i} id={slugify(b.text)} className="scroll-mt-24 font-display">{b.text}</h2>;
          case 'h3': return <h3 key={i}>{b.text}</h3>;
          case 'list': return <ul key={i}>{b.items.map((t, k) => <li key={k}>{t}</li>)}</ul>;
          case 'links': return <ul key={i}>{b.items.map(([t, href]) => <li key={href}><a href={href} target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">{t}</a></li>)}</ul>;
          case 'quote': return <blockquote key={i} className="border-l-2 border-coral pl-6">{b.text}</blockquote>;
          case 'sources': return <p key={i} className="border-t border-line pt-6 text-[14px] leading-relaxed text-ink-3"><span className="font-medium text-ink-2">Sources: </span>{b.text}</p>;
          case 'table': {
            const [head, ...rows] = b.rows;
            return (
              <div key={i} tabIndex={0} role="region" aria-label="Table, scroll sideways for more" className="overflow-x-auto rounded-[14px] border border-line">
                <table className="w-full min-w-[560px] text-left text-[14px] leading-snug">
                  <thead className="bg-navy text-white"><tr>{head.map((h, k) => <th key={k} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{rows.map((r, k) => <tr key={k} className="border-t border-line align-top">{r.map((c, j) => <td key={j} className="px-4 py-3">{c}</td>)}</tr>)}</tbody>
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
