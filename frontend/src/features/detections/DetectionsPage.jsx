import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Ban, CheckCircle2, Eye, Radar, ShieldOff } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, SectionLabel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Drawer } from '../../ui/Overlay';
import { EmptyState } from '../../ui/States';
import { Tabs } from '../../ui/Tabs';
import { useToast } from '../../ui/Toast';
import { actions, useView } from '../../data/store';
import { IDENTITY_TYPES, PROVIDERS } from '../../data/world';
import { AppLogo, IdentityLogo } from '../../components/Logo';
import { AlsoViewing, Avatar, PersonName, PersonPicker, SeverityTag, StatusPill, Time } from '../../components/bits';
import { CommentThread, CreateTicketModal, TicketCard, TicketLink } from '../../components/collab';
import { useOpenParam } from '../../components/listkit';
import { RemediateModal } from '../../components/RemediateModal';
import { formatDateTime, formatNumber } from '../../lib/format';
import { cn } from '../../ui/cn';
import { AnalystNote } from './AnalystNote';

export default function DetectionsPage() {
  const view = useView();
  const [openId, setOpen] = useOpenParam();
  const [tab, setTab] = useState('active');
  const list = useMemo(() => {
    const items = view.detections.filter((d) => (tab === 'active' ? d.status === 'new' || d.status === 'investigating' : tab === 'closed' ? d.status === 'resolved' || d.status === 'false_positive' : true));
    return items.sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt));
  }, [view.detections, tab]);
  const counts = { new: view.detections.filter((d) => d.status === 'new').length, investigating: view.detections.filter((d) => d.status === 'investigating').length };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Detections"
        lede="Raised by NHI Genome when an identity leaves its own baseline: new places, new volumes, new actions, odd hours."
        meta={
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-critical/30 bg-critical-soft px-2.5 py-1 font-semibold text-critical">{counts.new} need triage</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-info/30 bg-info-soft px-2.5 py-1 font-semibold text-info">{counts.investigating} under investigation</span>
          </div>
        }
        tabs={<Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: 'Active', count: counts.new + counts.investigating }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All', count: view.detections.length }]} />}
      />
      {list.length === 0 && <Panel><EmptyState icon={Radar} tone="positive" title="Nothing active" description="Every detection has been triaged." /></Panel>}
      <ul className="grid gap-3">
        {list.map((d) => {
          const i = view.idById.get(d.identityId);
          return (
            <li key={d.id}>
              <button type="button" onClick={() => setOpen(d.id)} className={cn('group relative flex w-full flex-wrap items-center gap-4 overflow-hidden rounded-[var(--radius-panel)] border bg-surface p-4 text-left transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-md', d.status === 'new' ? 'border-line-strong' : 'border-line')}>
                <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', { critical: 'bg-critical', high: 'bg-high', medium: 'bg-medium', low: 'bg-low' }[d.severity])} />
                <IdentityLogo type={i?.type} size={40} />
                <div className="min-w-0 flex-1 basis-80">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityTag severity={d.severity} />
                    <span className="text-[11.5px] font-medium text-ink-3">{d.id}</span>
                    <span className="text-[11.5px] text-ink-3">· {d.tactic}</span>
                  </div>
                  <p className="mt-1 text-[14.5px] font-semibold text-ink group-hover:text-brand">{d.title}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{i?.name} · {PROVIDERS[d.provider].short} · {view.connById.get(i?.connectionId)?.name}</p>
                </div>
                <Metric metric={d.metric} />
                <div className="flex w-40 shrink-0 flex-col items-end gap-1.5">
                  <StatusPill status={d.status} pulse={d.status === 'new'} />
                  <span className="text-[11.5px] text-ink-3"><Time at={d.detectedAt} /></span>
                  {d.ticketKey ? <TicketLink ticketKey={d.ticketKey} compact /> : <span className="flex items-center gap-1 text-[11.5px] text-ink-3"><Avatar refId={d.assignee} size={16} /><PersonName refId={d.assignee} /></span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <DetectionDrawer id={openId} onClose={() => setOpen(null)} />
    </div>
  );
}

function Metric({ metric }) {
  const ratio = metric.baseline ? metric.observed / metric.baseline : null;
  return (
    <div className="hidden w-44 shrink-0 rounded-[10px] bg-surface-2 px-3 py-2 @min-[52rem]:block">
      <p className="truncate text-[10.5px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{metric.label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span data-numeric="" className="font-display text-[18px] font-extrabold text-ink">{formatNumber(metric.observed)}</span>
        <span className="text-[11.5px] text-ink-3">vs {formatNumber(metric.baseline)} usual</span>
      </p>
      {ratio && ratio > 1 && <p className="text-[11px] font-semibold text-critical">{ratio >= 10 ? `${Math.round(ratio)}x` : `${ratio.toFixed(1)}x`} baseline</p>}
    </div>
  );
}

function DetectionDrawer({ id, onClose }) {
  const view = useView();
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const d = id ? view.detById.get(id) : null;
  if (!d) return null;
  const i = view.idById.get(d.identityId);
  const set = (patch, msg) => {
    actions.updateDetection(d.id, patch);
    if (msg) toast.notify({ variant: 'success', title: msg });
  };
  const contain = i?.provider === 'vault' ? 'pb-revoke-vault-token' : i?.provider === 'github' ? 'pb-revoke-pat' : 'pb-disable';

  return (
    <Drawer
      open
      onClose={onClose}
      width="xl"
      eyebrow={`${d.id} · ${d.tactic}`}
      title={d.title}
      subtitle={<span className="flex flex-wrap items-center gap-2"><SeverityTag severity={d.severity} /><StatusPill status={d.status} /><span className="text-ink-3">Confidence {d.confidence}%</span><AlsoViewing path={`/detections?open=${d.id}`} /></span>}
      footer={
        <>
          {d.status === 'new' && <Button variant="secondary" icon={Eye} onClick={() => set({ status: 'investigating', assignee: d.assignee || view.me?.ref }, 'You are investigating')}>Investigate</Button>}
          {d.status !== 'false_positive' && d.status !== 'resolved' && <Button variant="ghost" icon={ShieldOff} onClick={() => set({ status: 'false_positive' }, 'Marked as false positive')}>False positive</Button>}
          {!d.ticketKey && <Button variant="secondary" icon={() => <AppLogo name="jira" size={16} tile={false} />} onClick={() => setModal('ticket')}>Open incident</Button>}
          {d.status !== 'resolved' ? <Button variant="danger" icon={Ban} onClick={() => setModal('fix')}>Contain</Button> : null}
          {d.status === 'investigating' && <Button variant="primary" icon={CheckCircle2} onClick={() => set({ status: 'resolved' }, 'Detection resolved')}>Resolve</Button>}
        </>
      }
    >
      <div className="grid gap-5 p-4 sm:p-5 @min-[52rem]:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-3 @min-[34rem]:grid-cols-2">
            <div className="rounded-[12px] border border-critical/25 bg-critical-soft p-3.5">
              <p className="text-[10.5px] font-semibold tracking-[0.1em] text-critical uppercase">Observed</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink">{d.observed}</p>
            </div>
            <div className="rounded-[12px] border border-line bg-surface-2 p-3.5">
              <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Baseline (30 days)</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{d.baseline}</p>
            </div>
          </div>

          <AnalystNote detection={d} identity={i} />

          <section>
            <SectionLabel>Timeline</SectionLabel>
            <ol className="relative mt-3 space-y-3 before:absolute before:top-1 before:bottom-1 before:left-[7px] before:w-px before:bg-line">
              {d.timeline.map((t, k) => (
                <li key={k} className="relative flex gap-3">
                  <span className={cn('relative mt-1 size-[15px] shrink-0 rounded-full border-2 border-surface', k === d.timeline.length - 1 ? 'bg-brand' : k === 1 ? 'bg-critical' : 'bg-line-strong')} />
                  <div><p className="text-[13px] text-ink">{t.text}</p><p className="text-[11.5px] text-ink-3">{formatDateTime(t.at)}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <SectionLabel>Discussion</SectionLabel>
            <div className="mt-2"><CommentThread target={{ kind: 'detection', id: d.id }} placeholder="Record what you checked. Type @ to pull someone in." /></div>
          </section>
        </div>

        <aside className="space-y-4">
          <div>
            <SectionLabel>Assignee</SectionLabel>
            <PersonPicker className="mt-1.5" value={d.assignee} onChange={(ref) => set({ assignee: ref, ...(d.status === 'new' && ref ? { status: 'investigating' } : {}) })} />
          </div>
          <Link to={`/identities/${i?.id}?tab=activity`} className="block rounded-[12px] border border-line p-3 hover:border-line-strong">
            <div className="flex items-center gap-2.5">
              <IdentityLogo type={i?.type} size={32} />
              <div className="min-w-0"><p className="truncate text-[13px] font-semibold text-ink">{i?.name}</p><p className="truncate text-[11.5px] text-ink-3">{IDENTITY_TYPES[i?.type]?.label}</p></div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-brand"><Activity aria-hidden="true" className="size-3.5" />See its activity</p>
          </Link>
          {d.ticketKey && <div><SectionLabel>Incident</SectionLabel><div className="mt-1.5"><TicketCard ticketKey={d.ticketKey} /></div></div>}
          <Link to={`/genome/${i?.id}`} className="block rounded-[10px] border border-line p-3 text-[12px] hover:border-line-strong">
            <p className="font-medium text-ink">Raised by NHI Genome</p>
            <p className="mt-0.5 text-ink-3">Compared with {i?.name}'s own baseline. Open its behaviour model.</p>
          </Link>
          <div className="rounded-[12px] bg-surface-2 p-3 text-[12px] text-ink-2">
            <p className="font-semibold text-ink">Detected</p>
            <p>{formatDateTime(d.detectedAt)}</p>
            <p className="mt-2 font-semibold text-ink">Source</p>
            <p className="flex items-center gap-1.5"><AppLogo name={PROVIDERS[d.provider].logo} size={16} />{PROVIDERS[d.provider].name}</p>
          </div>
        </aside>
      </div>
      <RemediateModal open={modal === 'fix'} onClose={() => setModal(null)} identityIds={[d.identityId]} playbookId={contain} />
      <CreateTicketModal open={modal === 'ticket'} onClose={() => setModal(null)} link={{ kind: 'detection', id: d.id }} defaults={{ summary: `${d.title} (${i?.name})`, type: 'Incident', priority: d.severity === 'critical' ? 'Highest' : 'High', assignee: d.assignee, description: `${d.tactic}\n\nObserved: ${d.observed}\nBaseline: ${d.baseline}` }} />
    </Drawer>
  );
}


