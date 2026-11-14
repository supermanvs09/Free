import { useState } from 'react';
import { Copy, UserPlus } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, PanelHeader } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Field';
import { useToast } from '../../ui/Toast';
import { actions, useView } from '../../data/store';
import { Avatar, Time } from '../../components/bits';
import { cn } from '../../ui/cn';

const ROLES = [
  { value: 'admin', label: 'Admin', note: 'Everything, including approvals and integrations' },
  { value: 'operator', label: 'Operator', note: 'Runs playbooks, owns identities' },
  { value: 'analyst', label: 'Analyst', note: 'Triages findings and detections' },
  { value: 'viewer', label: 'Viewer', note: 'Reads everything, changes nothing' },
];

export default function TeamPage() {
  const view = useView();
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const owned = new Map();
  for (const i of view.identities) if (i.owner) owned.set(i.owner, (owned.get(i.owner) || 0) + 1);
  const assigned = new Map();
  for (const t of view.tickets) if (t.assignee && t.status !== 'Done') assigned.set(t.assignee, (assigned.get(t.assignee) || 0) + 1);
  const me = view.people.find((p) => p.isMe);
  const isAdmin = me?.role === 'admin';
  const people = view.people.filter((p) => filter === 'all' || (filter === 'online' ? p.isViewer : p.role === filter));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Team"
        lede="Who can see and change this workspace. Everyone who opens the shared link and signs in appears here."
        actions={
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={() => {
              const link = window.location.href;
              navigator.clipboard?.writeText(link).then(
                () => toast.notify({ variant: 'success', title: 'Invite link copied', description: 'Anyone you share it with lands in this workspace after signing in.' }),
                () => toast.notify({ variant: 'info', title: 'Share this page', description: 'Use the Share button on this page to invite people.' }),
              );
            }}
          >
            Invite
          </Button>
        }
      />
      <div className="grid gap-3 @min-[64rem]:grid-cols-4">
        {ROLES.map((r) => (
          <button key={r.value} type="button" onClick={() => setFilter(filter === r.value ? 'all' : r.value)} className={cn('rounded-[12px] border bg-surface p-3 text-left transition-colors', filter === r.value ? 'border-brand' : 'border-line hover:border-line-strong')}>
            <p className="flex items-baseline justify-between"><span className="text-[13px] font-semibold text-ink">{r.label}</span><span data-numeric="" className="font-display text-[20px] font-extrabold text-ink">{view.people.filter((p) => p.role === r.value).length}</span></p>
            <p className="mt-0.5 text-[11.5px] text-ink-3">{r.note}</p>
          </button>
        ))}
      </div>
      <Panel flush>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <PanelHeader title={`${people.length} people`} />
          <button type="button" onClick={() => setFilter(filter === 'online' ? 'all' : 'online')} className={cn('ml-auto rounded-full border px-2.5 py-1 text-[12px] font-medium', filter === 'online' ? 'border-brand bg-info-soft text-brand' : 'border-line text-ink-2')}>Signed in here</button>
        </div>
        <ul className="divide-y divide-line">
          {people.map((p) => {
            const online = view.peers.some((x) => x.by && p.ref === `u:${x.by}`);
            return (
              <li key={p.ref} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="relative">
                  <Avatar person={p} size={36} />
                  {(online || p.isMe) && <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-low ring-2 ring-surface" title="Online" />}
                </span>
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{p.name}{p.isMe && <span className="font-normal text-ink-3"> (you)</span>}</p>
                  <p className="truncate text-[12px] text-ink-3">{p.title} · {p.team}{p.email ? ` · ${p.email}` : ''}</p>
                </div>
                <div className="w-40 text-[12px] text-ink-3">
                  <p><span className="font-semibold text-ink">{owned.get(p.ref) || 0}</span> identities owned</p>
                  <p><span className="font-semibold text-ink">{assigned.get(p.ref) || 0}</span> open Jira issues</p>
                </div>
                <div className="w-28 text-[12px] text-ink-3">{p.isViewer ? <>Active <Time at={p.lastSeenAt} /></> : 'Directory sync'}</div>
                <div className="w-36">
                  <Select size="sm" value={p.role} disabled={!isAdmin || p.isMe} onChange={(e) => actions.setMember(p.ref, { role: e.target.value })} aria-label={`Role for ${p.name}`} options={ROLES.map((r) => ({ value: r.value, label: r.label }))} />
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
      <p className="flex items-center gap-1.5 text-[12px] text-ink-3"><Copy aria-hidden="true" className="size-3.5" />Directory members sync from Google Workspace every hour.</p>
    </div>
  );
}
