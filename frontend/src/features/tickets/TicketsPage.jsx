import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Columns3, List, Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, SectionLabel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { SearchInput, Select } from '../../ui/Field';
import { Drawer } from '../../ui/Overlay';
import { SegmentedControl } from '../../ui/Tabs';
import { actions, personName, recordLabel, recordPath, useView } from '../../data/store';
import { ORG } from '../../data/world';
import { AppLogo } from '../../components/Logo';
import { AlsoViewing, Avatar, JiraPriority, JiraStatus, JiraTypeIcon, PersonName, PersonPicker, Time } from '../../components/bits';
import { CommentThread, CreateTicketModal } from '../../components/collab';
import { useOpenParam } from '../../components/listkit';
import { formatDateTime } from '../../lib/format';
import { cn } from '../../ui/cn';

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done'];

export default function TicketsPage() {
  const view = useView();
  const [openKey, setOpen] = useOpenParam();
  const [mode, setMode] = useState('board');
  const [q, setQ] = useState('');
  const [who, setWho] = useState([]);
  const [creating, setCreating] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const [over, setOver] = useState(null);
  const jira = view.connections.find((c) => c.provider === 'jira');

  const tickets = useMemo(() => view.tickets.filter((t) => (!q || `${t.key} ${t.summary}`.toLowerCase().includes(q.toLowerCase())) && (!who.length || who.includes(t.assignee))), [view.tickets, q, who]);
  const assignees = [...new Set(view.tickets.map((t) => t.assignee).filter(Boolean))];
  if (view.me && !assignees.includes(view.me.ref)) assignees.unshift(view.me.ref);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={<span className="inline-flex items-center gap-2.5"><AppLogo name="jira" size={30} />Jira issues</span>}
        lede={<>Project {ORG.jiraProject.name} ({ORG.jiraProject.key}) on {jira?.name || ORG.jiraSite}. Changes here sync both ways and email the people on the issue.</>}
        actions={
          <>
            <span className="hidden items-center gap-1.5 text-[12px] text-ink-3 sm:inline-flex"><RefreshCw aria-hidden="true" className="size-3.5" />Synced <Time at={jira?.lastSyncAt} /></span>
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Create issue</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search this board" size="sm" className="w-56" />
        <div className="flex items-center -space-x-1.5" role="group" aria-label="Filter by assignee">
          {assignees.slice(0, 9).map((ref) => (
            <button key={ref} type="button" onClick={() => setWho(who.includes(ref) ? who.filter((x) => x !== ref) : [...who, ref])} aria-pressed={who.includes(ref)} title={personName(ref, view)} className={cn('rounded-full transition-transform hover:z-10 hover:-translate-y-0.5', who.includes(ref) && 'z-10 ring-2 ring-brand')}>
              <Avatar refId={ref} size={30} ring />
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setWho(who.includes(view.me?.ref) && who.length === 1 ? [] : [view.me?.ref])} className={cn('h-8 rounded-[var(--radius-control)] border px-2.5 text-[12.5px] font-medium', who.length === 1 && who[0] === view.me?.ref ? 'border-brand bg-info-soft text-brand' : 'border-line-strong text-ink-2 hover:border-ink-3/50')}>Only my issues</button>
        {who.length > 0 && <button type="button" onClick={() => setWho([])} className="text-[12.5px] font-medium text-brand hover:underline">Clear filters</button>}
        <SegmentedControl className="ml-auto" label="View" value={mode} onChange={setMode} options={[{ value: 'board', label: 'Board', icon: Columns3 }, { value: 'list', label: 'List', icon: List }]} />
      </div>

      {mode === 'board' ? (
        <div className="grid gap-3 overflow-x-auto pb-2 @min-[64rem]:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = tickets.filter((t) => t.status === col);
            return (
              <section
                key={col}
                onDragOver={(e) => { e.preventDefault(); setOver(col); }}
                onDragLeave={() => setOver((o) => (o === col ? null : o))}
                onDrop={(e) => { e.preventDefault(); setOver(null); if (dragKey) actions.updateTicket(dragKey, { status: col }); setDragKey(null); }}
                className={cn('flex min-h-[320px] min-w-[260px] flex-col rounded-[12px] bg-surface-3/70 p-2 transition-colors', over === col && 'bg-info-soft ring-2 ring-brand/40')}
              >
                <h2 className="flex items-center gap-2 px-1.5 pt-1 pb-2 text-[11.5px] font-semibold tracking-[0.04em] text-ink-3 uppercase">{col}<span className="text-ink-3/80">{items.length}</span></h2>
                <ul className="flex flex-col gap-2">
                  {items.map((t) => (
                    <li key={t.key}>
                      <button
                        type="button"
                        draggable
                        onDragStart={() => setDragKey(t.key)}
                        onDragEnd={() => setDragKey(null)}
                        onClick={() => setOpen(t.key)}
                        className={cn('w-full cursor-grab rounded-[8px] border border-line bg-surface p-2.5 text-left shadow-[0_1px_1px_rgba(9,30,66,0.12)] transition-[box-shadow,background-color] hover:bg-surface-2 active:cursor-grabbing', dragKey === t.key && 'opacity-50')}
                      >
                        <p className={cn('text-[13px] leading-snug text-ink', t.status === 'Done' && 'text-ink-3 line-through decoration-ink-3/40')}>{t.summary}</p>
                        {t.links?.[0] && <p className="mt-1.5 truncate rounded bg-surface-3 px-1.5 py-0.5 text-[11px] text-ink-2">{t.links[0].kind}: {recordLabel(t.links[0], view)}</p>}
                        <div className="mt-2.5 flex items-center gap-1.5">
                          <JiraTypeIcon type={t.type} />
                          <span className={cn('text-[11.5px] font-semibold text-ink-3', t.status === 'Done' && 'line-through')}>{t.key}</span>
                          {t.auto && <span className="rounded bg-surface-3 px-1 text-[10px] text-ink-3">auto</span>}
                          <span className="ml-auto flex items-center gap-1.5"><JiraPriority priority={t.priority} /><Avatar refId={t.assignee} size={22} /></span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                {col === 'To Do' && <button type="button" onClick={() => setCreating(true)} className="mt-2 flex items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-left text-[12.5px] font-medium text-ink-3 hover:bg-surface"><Plus aria-hidden="true" className="size-4" />Create issue</button>}
              </section>
            );
          })}
        </div>
      ) : (
        <Panel flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="bg-surface-2 text-[11px] tracking-[0.06em] text-ink-3 uppercase">
                <tr><th className="px-4 py-2.5 font-semibold">Key</th><th className="px-4 py-2.5 font-semibold">Summary</th><th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Priority</th><th className="px-4 py-2.5 font-semibold">Assignee</th><th className="px-4 py-2.5 font-semibold">Updated</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tickets.map((t) => (
                  <tr key={t.key} onClick={() => setOpen(t.key)} className="cursor-pointer hover:bg-surface-2">
                    <td className="px-4 py-2.5 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><JiraTypeIcon type={t.type} /><span className="font-semibold text-ink-2">{t.key}</span></span></td>
                    <td className="max-w-[420px] truncate px-4 py-2.5 text-ink">{t.summary}</td>
                    <td className="px-4 py-2.5"><JiraStatus status={t.status} /></td>
                    <td className="px-4 py-2.5"><JiraPriority priority={t.priority} withLabel /></td>
                    <td className="px-4 py-2.5"><span className="flex items-center gap-1.5"><Avatar refId={t.assignee} size={20} /><PersonName refId={t.assignee} /></span></td>
                    <td className="px-4 py-2.5 text-ink-3"><Time at={t.updatedAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <TicketDrawer ticketKey={openKey} onClose={() => setOpen(null)} />
      <CreateTicketModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function TicketDrawer({ ticketKey, onClose }) {
  const view = useView();
  const t = ticketKey ? view.ticketByKey.get(ticketKey) : null;
  if (!t) return null;
  return (
    <Drawer
      open
      onClose={onClose}
      width="xl"
      eyebrow={<span className="inline-flex items-center gap-1.5 normal-case tracking-normal"><AppLogo name="jira" size={16} />{ORG.jiraProject.name} / <span className="font-semibold">{t.key}</span></span>}
      title={t.summary}
      subtitle={<AlsoViewing path={`/tickets?open=${t.key}`} />}
    >
      <div className="grid gap-6 p-4 sm:p-5 @min-[50rem]:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-5">
          <section>
            <SectionLabel>Description</SectionLabel>
            <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">{t.description || 'No description.'}</p>
          </section>
          {t.links?.length > 0 && (
            <section>
              <SectionLabel>Linked from the console</SectionLabel>
              <ul className="mt-2 space-y-1.5">
                {t.links.map((l) => (
                  <li key={`${l.kind}-${l.id}`}>
                    <Link to={recordPath(l)} onClick={onClose} className="flex items-center gap-2 rounded-[8px] border border-line px-2.5 py-2 text-[12.5px] hover:border-line-strong">
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.04em] text-ink-3 uppercase">{l.kind}</span>
                      <span className="truncate text-ink">{recordLabel(l, view)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <SectionLabel>Activity</SectionLabel>
            <div className="mt-2"><CommentThread target={{ kind: 'ticket', id: t.key }} /></div>
          </section>
        </div>
        <aside className="space-y-4">
          <Select value={t.status} onChange={(e) => actions.updateTicket(t.key, { status: e.target.value })} aria-label="Status" options={COLUMNS.map((c) => ({ value: c, label: c }))} className={cn('font-semibold', t.status === 'Done' ? 'text-low' : t.status === 'To Do' ? 'text-ink' : 'text-brand')} />
          <div className="rounded-[10px] border border-line">
            <p className="border-b border-line px-3 py-2 text-[12.5px] font-semibold text-ink">Details</p>
            <dl className="space-y-3 p-3 text-[12.5px]">
              <div><dt className="mb-1 text-ink-3">Assignee</dt><dd><PersonPicker value={t.assignee} onChange={(ref) => actions.updateTicket(t.key, { assignee: ref })} size="sm" align="end" /></dd></div>
              <div><dt className="mb-1 text-ink-3">Reporter</dt><dd className="flex items-center gap-1.5"><Avatar refId={t.reporter} size={20} /><PersonName refId={t.reporter} /></dd></div>
              <div><dt className="mb-1 text-ink-3">Priority</dt><dd><Select size="sm" value={t.priority} onChange={(e) => actions.updateTicket(t.key, { priority: e.target.value })} aria-label="Priority" options={['Highest', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))} /></dd></div>
              <div><dt className="mb-1 text-ink-3">Type</dt><dd className="flex items-center gap-1.5"><JiraTypeIcon type={t.type} />{t.type}</dd></div>
              <div><dt className="mb-1 text-ink-3">Labels</dt><dd className="flex flex-wrap gap-1">{(t.labels || []).map((l) => <span key={l} className="rounded bg-surface-3 px-1.5 py-0.5 text-[11.5px]">{l}</span>)}</dd></div>
            </dl>
          </div>
          <p className="text-[11.5px] leading-relaxed text-ink-3">Created {formatDateTime(t.createdAt)}<br />Updated <Time at={t.updatedAt} /></p>
        </aside>
      </div>
    </Drawer>
  );
}
