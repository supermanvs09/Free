import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Mail, ShieldCheck, Wrench } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel } from '../../ui/Panel';
import { DataGrid } from '../../ui/DataGrid';
import { Pagination } from '../../ui/Pagination';
import { SearchInput, Select } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { Drawer } from '../../ui/Overlay';
import { DetailList, DetailRow, SectionLabel } from '../../ui/Panel';
import { EmptyState } from '../../ui/States';
import { Tabs } from '../../ui/Tabs';
import { actions, PLAYBOOKS, useView } from '../../data/store';
import { IDENTITY_TYPES, PROVIDERS, RULES, SOURCE_PROVIDERS } from '../../data/world';
import { AppLogo, IdentityLogo } from '../../components/Logo';
import { AlsoViewing, Avatar, PersonName, PersonPicker, SeverityTag, StatusPill, Time } from '../../components/bits';
import { CommentThread, CreateTicketModal, EmailModal, TicketCard, TicketLink } from '../../components/collab';
import { FacetSelect, ProviderFilter, useOpenParam, useTable } from '../../components/listkit';
import { RemediateModal } from '../../components/RemediateModal';
import { cn } from '../../ui/cn';

const SEV_W = { critical: 0, high: 1, medium: 2, low: 3 };

export default function FindingsPage() {
  const view = useView();
  const [openId, setOpen] = useOpenParam();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('view') || 'active');
  const [provider, setProvider] = useState('');
  const [sev, setSev] = useState([]);
  const [rules, setRules] = useState(params.get('rule') ? [params.get('rule')] : []);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const [bulk, setBulk] = useState(null);

  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return view.findings.filter((f) => {
      if (status === 'active' && !(f.status === 'open' || f.status === 'in_progress')) return false;
      if (status === 'mine' && f.assignee !== view.me?.ref) return false;
      if (status === 'overdue' && !((f.status === 'open' || f.status === 'in_progress') && Date.parse(f.dueAt) < Date.now())) return false;
      if (status === 'closed' && !(f.status === 'resolved' || f.status === 'risk_accepted')) return false;
      if (provider && f.provider !== provider) return false;
      if (sev.length && !sev.includes(f.severity)) return false;
      if (rules.length && !rules.includes(f.ruleId)) return false;
      if (term && !`${f.title} ${f.id} ${view.idById.get(f.identityId)?.name}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [view, status, provider, sev, rules, q]);
  const table = useTable(rows, { sort: { key: 'severity', direction: 'asc' }, getters: { dueAt: (f) => Date.parse(f.dueAt), severity: (f) => SEV_W[f.severity] * 1e13 - Date.parse(f.firstSeenAt) / 1, firstSeenAt: (f) => Date.parse(f.firstSeenAt) } });

  const active = view.findings.filter((f) => f.status === 'open' || f.status === 'in_progress');
  const pillars = ['Credential hygiene', 'Least privilege', 'Lifecycle', 'Ownership', 'Trust', 'Third party'].map((p) => {
    const all = view.findings.filter((f) => f.pillar === p);
    const open = all.filter((f) => f.status === 'open' || f.status === 'in_progress');
    return { p, open: open.length, critical: open.filter((f) => f.severity === 'critical').length, score: all.length ? Math.round(100 - (open.length / Math.max(1, all.length)) * 55 - open.filter((f) => f.severity === 'critical').length * 3) : 100 };
  });

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const columns = [
    { key: 'pick', header: '', width: '40px', cell: (f) => <input type="checkbox" aria-label={`Select ${f.id}`} checked={selected.includes(f.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(f.id)} className="size-4 accent-[var(--t-brand)]" /> },
    { key: 'severity', header: 'Severity', width: '108px', sortable: true, cell: (f) => <SeverityTag severity={f.severity} /> },
    {
      key: 'title', header: 'Finding', primary: true, width: '34%',
      cell: (f) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{f.title}</p>
          <p className="truncate text-[11.5px] text-ink-3">{f.ruleId} · {f.pillar}{f.frameworks?.length ? ` · ${f.frameworks[0]}` : ''}</p>
        </div>
      ),
    },
    { key: 'identity', header: 'Identity', width: '24%', cell: (f) => { const i = view.idById.get(f.identityId); return <span className="flex min-w-0 items-center gap-2"><IdentityLogo type={i?.type} size={22} /><span className="min-w-0"><span className="block truncate text-[12.5px] text-ink">{i?.name}</span><span className="block truncate text-[11px] text-ink-3">{view.connById.get(i?.connectionId)?.name}</span></span></span>; } },
    { key: 'assignee', header: 'Assignee', width: '13%', priority: 'wide', cell: (f) => <span className="flex min-w-0 items-center gap-1.5"><Avatar refId={f.assignee} size={20} /><PersonName refId={f.assignee} className="text-[12.5px]" /></span> },
    { key: 'status', header: 'Status', width: '12%', cell: (f) => <span className="flex flex-col items-start gap-1"><StatusPill status={f.status} />{f.ticketKey && <TicketLink ticketKey={f.ticketKey} compact />}</span> },
    { key: 'dueAt', header: 'Due', width: '10%', sortable: true, priority: 'wide', cell: (f) => <DueCell f={f} /> },
  ];

  const sel = selected.map((id) => view.findingById.get(id)).filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Posture findings" lede="Configuration that makes a machine identity easier to abuse: old keys, too much access, nobody accountable, trust that is too wide." />

      <div className="grid grid-cols-2 gap-2.5 @min-[48rem]:grid-cols-3 @min-[80rem]:grid-cols-6">
        {pillars.map((p) => (
          <div key={p.p} className="rounded-[12px] border border-line bg-surface p-3">
            <p className="truncate text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{p.p}</p>
            <p className="mt-1.5 flex items-baseline gap-1.5"><span data-numeric="" className="font-display text-[22px] font-extrabold text-ink">{p.open}</span><span className="text-[11.5px] text-ink-3">open</span></p>
            <p className={cn('text-[11.5px]', p.critical ? 'font-semibold text-critical' : 'text-ink-3')}>{p.critical ? `${p.critical} critical` : 'No critical'}</p>
          </div>
        ))}
      </div>

      <ProviderFilter providers={SOURCE_PROVIDERS} value={provider} onChange={setProvider} counts={{ all: active.length, ...Object.fromEntries(SOURCE_PROVIDERS.map((p) => [p, active.filter((f) => f.provider === p).length])) }} />

      <Panel flush>
        <div className="border-b border-line px-3 pt-1">
          <Tabs value={status} onChange={setStatus} tabs={[
            { value: 'active', label: 'Open', count: active.length },
            { value: 'overdue', label: 'Past SLA', count: active.filter((f) => Date.parse(f.dueAt) < Date.now()).length },
            { value: 'mine', label: 'Assigned to me', count: view.findings.filter((f) => f.assignee === view.me?.ref).length },
            { value: 'closed', label: 'Closed', count: view.findings.length - active.length },
            { value: 'all', label: 'All' },
          ]} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search findings or identities" size="sm" className="w-full sm:w-64" />
          <FacetSelect label="Severity" value={sev} onChange={setSev} options={['critical', 'high', 'medium', 'low'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
          <FacetSelect label="Check" value={rules} onChange={setRules} options={RULES.map((r) => ({ value: r.id, label: r.title, count: view.findings.filter((f) => f.ruleId === r.id && (f.status === 'open' || f.status === 'in_progress')).length })).filter((o) => o.count)} />
          {sel.length > 0 && (
            <div className="animate-fade ml-auto flex flex-wrap items-center gap-2 rounded-[10px] bg-info-soft px-2.5 py-1.5">
              <span className="text-[12.5px] font-semibold text-brand">{sel.length} selected</span>
              <Button size="sm" variant="secondary" onClick={() => setBulk('assign')}>Assign</Button>
              <Button size="sm" variant="secondary" icon={Wrench} onClick={() => setBulk('fix')}>Remediate</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
            </div>
          )}
        </div>
        <DataGrid
          columns={columns}
          rows={table.rows}
          rowKey={(f) => f.id}
          sort={table.sort}
          onSortChange={table.setSort}
          onRowClick={(f) => setOpen(f.id)}
          rowAccent={(f) => `var(--t-${f.severity})`}
          emptyState={<EmptyState icon={ShieldCheck} tone="positive" title="Nothing here" description={status === 'mine' ? 'No findings are assigned to you.' : 'No findings match these filters.'} />}
        />
        <div className="border-t border-line px-3 py-2"><Pagination page={table.page} pageSize={table.pageSize} total={table.total} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} unit="findings" /></div>
      </Panel>

      <FindingDrawer id={openId} onClose={() => setOpen(null)} />
      <RemediateModal open={bulk === 'fix'} onClose={() => { setBulk(null); setSelected([]); }} identityIds={[...new Set(sel.map((f) => f.identityId))]} playbookId={sel[0]?.playbook} />
      {bulk === 'assign' && <BulkAssign findings={sel} onDone={() => { setBulk(null); setSelected([]); }} />}
    </div>
  );
}

function DueCell({ f }) {
  const closed = f.status === 'resolved' || f.status === 'risk_accepted';
  const left = Math.round((Date.parse(f.dueAt) - Date.now()) / 864e5);
  if (closed) return <span className="text-[12px] text-ink-3">Closed</span>;
  return <span className={cn('text-[12px]', left < 0 ? 'font-medium text-critical' : left <= 3 ? 'text-ink' : 'text-ink-3')} title={`SLA due ${new Date(f.dueAt).toLocaleDateString()}`}>{left < 0 ? `${-left}d overdue` : left === 0 ? 'Due today' : `${left}d left`}</span>;
}

function BulkAssign({ findings, onDone }) {
  return (
    <div className="fixed inset-x-0 bottom-6 z-[60] mx-auto w-[min(420px,calc(100vw-24px))] rounded-[14px] border border-line bg-surface p-3 shadow-lg">
      <p className="mb-2 text-[13px] font-semibold text-ink">Assign {findings.length} findings to</p>
      <PersonPicker value={null} allowNone={false} onChange={async (ref) => { for (const f of findings) await actions.updateFinding(f.id, { assignee: ref, status: f.status === 'open' ? 'in_progress' : f.status }); onDone(); }} />
      <Button size="sm" variant="ghost" className="mt-2" onClick={onDone}>Cancel</Button>
    </div>
  );
}

export function FindingDrawer({ id, onClose }) {
  const view = useView();
  const f = id ? view.findingById.get(id) : null;
  const [modal, setModal] = useState(null);
  if (!f) return null;
  const i = view.idById.get(f.identityId);
  const pb = PLAYBOOKS.find((p) => p.id === f.playbook);
  const rule = RULES.find((r) => r.id === f.ruleId);

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={`${f.id} · ${f.ruleId}`}
      title={f.title}
      subtitle={<span className="flex flex-wrap items-center gap-2"><SeverityTag severity={f.severity} /><StatusPill status={f.status} /><AlsoViewing path={`/findings?open=${f.id}`} /></span>}
      footer={
        <>
          <Button variant="ghost" icon={Mail} onClick={() => setModal('email')}>Email owner</Button>
          {!f.ticketKey && <Button variant="secondary" icon={() => <AppLogo name="jira" size={16} tile={false} />} onClick={() => setModal('ticket')}>Create Jira issue</Button>}
          {f.status !== 'resolved' && <Button variant="primary" icon={Wrench} onClick={() => setModal('fix')}>{pb?.title || 'Remediate'}</Button>}
        </>
      }
    >
      <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-3 @min-[34rem]:grid-cols-2">
          <div>
            <SectionLabel>Status</SectionLabel>
            <Select className="mt-1.5" value={f.status} onChange={(e) => actions.updateFinding(f.id, { status: e.target.value })} options={[{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'risk_accepted', label: 'Risk accepted' }]} aria-label="Status" />
          </div>
          <div>
            <SectionLabel>Assignee</SectionLabel>
            <PersonPicker className="mt-1.5" value={f.assignee} onChange={(ref) => actions.updateFinding(f.id, { assignee: ref, ...(ref && f.status === 'open' ? { status: 'in_progress' } : {}) })} />
          </div>
        </div>

        <Link to={`/identities/${i?.id}`} className="flex items-center gap-3 rounded-[12px] border border-line p-3 transition-colors hover:border-line-strong hover:bg-surface-2">
          <IdentityLogo type={i?.type} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-ink">{i?.name}</p>
            <p className="truncate text-[12px] text-ink-3">{IDENTITY_TYPES[i?.type]?.label} · {PROVIDERS[i?.provider]?.short} · {view.connById.get(i?.connectionId)?.name}</p>
          </div>
          <span className="text-[12px] text-ink-3">Owner<br /><PersonName refId={i?.owner} className="text-ink" /></span>
        </Link>

        <section>
          <SectionLabel>Evidence</SectionLabel>
          <DetailList className="mt-1">
            {Object.entries(f.evidence || {}).map(([k, v]) => <DetailRow key={k} label={k.replace(/_/g, ' ')} mono>{String(v)}</DetailRow>)}
            <DetailRow label="First seen"><Time at={f.firstSeenAt} /></DetailRow>
            <DetailRow label="SLA"><DueCell f={f} /> · due {new Date(f.dueAt).toLocaleDateString()}</DetailRow>
            {f.resolvedAt && <DetailRow label="Resolved"><Time at={f.resolvedAt} />{f.resolvedBy ? ` by ${f.resolvedBy}` : ''}</DetailRow>}
            {rule?.frameworks?.length > 0 && <DetailRow label="Controls">{rule.frameworks.join(' · ')}</DetailRow>}
          </DetailList>
        </section>

        {pb && (
          <section>
            <SectionLabel>How to fix</SectionLabel>
            <ol className="mt-2 space-y-1.5 text-[12.5px] text-ink-2">
              {pb.steps.map((s, k) => <li key={s} className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-3">{k + 1}</span>{s}</li>)}
            </ol>
          </section>
        )}

        {f.ticketKey && (
          <section>
            <SectionLabel>Tracked in Jira</SectionLabel>
            <div className="mt-2"><TicketCard ticketKey={f.ticketKey} /></div>
          </section>
        )}

        {f.status === 'resolved' && <p className="flex items-center gap-2 rounded-[10px] bg-low-soft px-3 py-2 text-[12.5px] text-low"><CheckCircle2 aria-hidden="true" className="size-4" />Resolved. The next sync confirms the check passes.</p>}

        <section>
          <SectionLabel>Discussion</SectionLabel>
          <div className="mt-2"><CommentThread target={{ kind: 'finding', id: f.id }} /></div>
        </section>
      </div>
      <RemediateModal open={modal === 'fix'} onClose={() => setModal(null)} identityIds={[f.identityId]} playbookId={f.playbook} />
      <CreateTicketModal open={modal === 'ticket'} onClose={() => setModal(null)} link={{ kind: 'finding', id: f.id }} defaults={{ summary: `${f.title}: ${i?.name}`, priority: f.severity === 'critical' ? 'Highest' : f.severity === 'high' ? 'High' : 'Medium', assignee: f.assignee || i?.owner, description: `${f.ruleId} ${f.title}\nIdentity: ${i?.locator}\n\nEvidence:\n${Object.entries(f.evidence || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\nFix: ${pb?.title}` }} />
      <EmailModal open={modal === 'email'} onClose={() => setModal(null)} link={{ kind: 'finding', id: f.id }} defaults={{ to: i?.owner ? [i.owner] : [], subject: `${f.title} on ${i?.name}`, body: `Hi,\n\n${i?.name} has a ${f.severity} finding: ${f.title}.\n\nSuggested fix: ${pb?.title}.\n\nCan you take a look this week?` }} />
    </Drawer>
  );
}
