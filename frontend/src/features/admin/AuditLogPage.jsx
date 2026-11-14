import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { SearchInput } from '../../ui/Field';
import { Pagination } from '../../ui/Pagination';
import { personName, recordPath, useView } from '../../data/store';
import { Avatar } from '../../components/bits';
import { FacetSelect, useTable } from '../../components/listkit';
import { downloadCsv } from '../../lib/download';
import { formatDateTime } from '../../lib/format';

export default function AuditLogPage() {
  const view = useView();
  const [q, setQ] = useState('');
  const [actors, setActors] = useState([]);
  const [kinds, setKinds] = useState([]);
  const rows = useMemo(() => view.activity.filter((a) => (!actors.length || actors.includes(a.actor)) && (!kinds.length || kinds.includes(a.target?.kind)) && (!q || `${personName(a.actor, view)} ${a.verb} ${a.text}`.toLowerCase().includes(q.toLowerCase()))), [view, actors, kinds, q]);
  const table = useTable(rows, { pageSize: 50 });
  const actorOptions = [...new Set(view.activity.map((a) => a.actor))].map((r) => ({ value: r, label: personName(r, view), icon: <Avatar refId={r} size={18} /> }));
  const kindOptions = [...new Set(view.activity.map((a) => a.target?.kind).filter(Boolean))].map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audit log" lede="Every change anyone made in this workspace, newest first. Kept for 400 days." actions={<Button variant="secondary" icon={Download} onClick={() => downloadCsv('audit-log.csv', rows.map((a) => ({ time: a.at, actor: personName(a.actor, view), action: a.verb, subject: a.text, record: `${a.target?.kind || ''} ${a.target?.id || ''}` })))}>Export CSV</Button>} />
      <Panel flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} size="sm" placeholder="Search the log" className="w-64" />
          <FacetSelect label="Person" value={actors} onChange={setActors} options={actorOptions} />
          <FacetSelect label="Record" value={kinds} onChange={setKinds} options={kindOptions} />
          <span className="ml-auto text-[12px] text-ink-3">{rows.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead className="bg-surface-2 text-[11px] tracking-[0.06em] text-ink-3 uppercase">
              <tr><th className="px-4 py-2.5 font-semibold">Time</th><th className="px-4 py-2.5 font-semibold">Person</th><th className="px-4 py-2.5 font-semibold">Action</th><th className="px-4 py-2.5 font-semibold">Record</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {table.rows.map((a) => (
                <tr key={a.id} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-3" data-numeric="">{formatDateTime(a.at)}</td>
                  <td className="px-4 py-2.5"><span className="flex items-center gap-2"><Avatar refId={a.actor} size={22} /><span className="text-ink">{personName(a.actor, view)}</span></span></td>
                  <td className="px-4 py-2.5 text-ink-2"><span className="font-medium text-ink">{a.verb}</span> {a.text}</td>
                  <td className="px-4 py-2.5">{a.target && <Link to={recordPath(a.target)} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-2 hover:text-brand">{a.target.kind}:{String(a.target.id).slice(0, 18)}</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-3 py-2"><Pagination page={table.page} pageSize={table.pageSize} total={table.total} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} unit="entries" /></div>
      </Panel>
    </div>
  );
}
