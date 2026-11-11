/* Page heading: what this page answers, in one line, with its actions. */
export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* A plain table that scrolls sideways on a phone instead of squeezing. */
export function Table({ columns, children, minWidth = '44rem' }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" style={{ minWidth }}>
        <thead className="border-b border-line bg-surface-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-4 py-2.5 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
