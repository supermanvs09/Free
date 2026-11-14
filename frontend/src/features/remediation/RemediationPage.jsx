import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, Clock, Loader2, ShieldCheck, Wrench, X } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, PanelHeader } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { actions, PLAYBOOKS, useView } from '../../data/store';
import { PROVIDERS } from '../../data/world';
import { AppLogo, IdentityLogo } from '../../components/Logo';
import { Avatar, PersonName, StatusPill, Time } from '../../components/bits';
import { RemediateModal } from '../../components/RemediateModal';
import { cn } from '../../ui/cn';

export default function RemediationPage() {
  const view = useView();
  const toast = useToast();
  const [start, setStart] = useState(null);
  const fixRuns = view.runs.filter((r) => r.kind !== 'sync');
  const waiting = fixRuns.filter((r) => r.status === 'awaiting_approval');
  const running = fixRuns.filter((r) => r.status === 'running' || r.status === 'queued');
  const done = fixRuns.filter((r) => r.status === 'succeeded' || r.status === 'cancelled');
  const me = view.people.find((p) => p.isMe);

  const library = useMemo(
    () =>
      PLAYBOOKS.map((p) => {
        const findings = view.findings.filter((f) => f.playbook === p.id && f.status === 'open');
        return { ...p, findings, identities: [...new Set(findings.map((f) => f.identityId))] };
      }).sort((a, b) => b.findings.length - a.findings.length),
    [view.findings],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Remediation" lede="Playbooks that fix findings at the source. Risky changes wait for an admin to approve; everyone sees each run move step by step." />

      {waiting.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[13px] font-semibold text-ink">Waiting for approval</h2>
          <div className="grid gap-3 @min-[64rem]:grid-cols-2">
            {waiting.map((r) => (
              <Panel key={r.id} prominence="lead" className="border-medium/40">
                <div className="flex items-start gap-3">
                  <Avatar refId={r.startedBy} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-ink-2"><PersonName refId={r.startedBy} className="font-semibold text-ink" /> wants to run</p>
                    <p className="text-[15px] font-bold text-ink">{r.playbookMeta?.title}</p>
                    <Targets r={r} />
                    {r.reason && <p className="mt-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-2">“{r.reason}”</p>}
                    <p className="mt-2 text-[11.5px] text-ink-3">Requested <Time at={r.startedAt} /></p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="ghost" icon={X} onClick={() => actions.cancelRun(r.id)}>Reject</Button>
                  <Button size="sm" variant="primary" icon={Check} locked={me?.role !== 'admin' ? 'Only admins approve playbooks' : undefined} onClick={async () => { await actions.approveRun(r.id); toast.notify({ variant: 'success', title: 'Approved', description: `${r.playbookMeta?.title} is running.` }); }}>Approve and run</Button>
                </div>
              </Panel>
            ))}
          </div>
        </section>
      )}

      {running.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[13px] font-semibold text-ink">Running now</h2>
          <div className="grid gap-3 @min-[64rem]:grid-cols-2">
            {running.map((r) => <RunCard key={r.id} r={r} />)}
          </div>
        </section>
      )}

      <Panel>
        <PanelHeader title="Playbooks" subtitle="Sorted by how many open findings each one fixes." />
        <ul className="mt-3 grid gap-2.5 @min-[56rem]:grid-cols-2 @min-[90rem]:grid-cols-3">
          {library.map((p) => (
            <li key={p.id} className="flex flex-col rounded-[12px] border border-line p-3.5">
              <div className="flex items-start gap-2.5">
                {p.provider === '*' ? <span className="grid size-7 place-items-center rounded-[8px] bg-info-soft text-brand"><Wrench aria-hidden="true" className="size-4" /></span> : <AppLogo name={PROVIDERS[p.provider].logo} size={28} />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-ink">{p.title}</p>
                  <p className="text-[11.5px] text-ink-3">{p.steps.length} steps · {p.est}{p.approval ? ' · approval' : ''}</p>
                </div>
              </div>
              <p className="mt-2 flex-1 text-[12px] text-ink-2">{p.steps[0]}, then {p.steps.length - 1} more.</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className={cn('text-[12px]', p.findings.length ? 'font-semibold text-ink' : 'text-ink-3')}>{p.findings.length ? `Fixes ${p.findings.length} open finding${p.findings.length === 1 ? '' : 's'}` : 'Nothing to fix'}</span>
                <Button size="sm" variant="secondary" disabled={!p.identities.length} onClick={() => setStart(p)}>Run on {p.identities.length}</Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel flush>
        <div className="border-b border-line px-4 py-3"><PanelHeader title="History" subtitle="Every run, who started it and who approved it." /></div>
        {done.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No runs yet" compact />
        ) : (
          <ul className="divide-y divide-line">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {r.status === 'succeeded' ? <CheckCircle2 aria-hidden="true" className="size-4.5 text-low" /> : <X aria-hidden="true" className="size-4.5 text-ink-3" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink">{r.playbookMeta?.title}</p>
                  <Targets r={r} small />
                </div>
                <span className="text-[12px] text-ink-3">Started by <PersonName refId={r.startedBy} className="text-ink-2" />{r.approvedBy && <> · approved by <PersonName refId={r.approvedBy} className="text-ink-2" /></>}</span>
                <span className="w-24 text-right text-[12px] text-ink-3"><Time at={r.finishedAt || r.startedAt} /></span>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <RemediateModal open={Boolean(start)} onClose={() => setStart(null)} identityIds={start?.identities || []} playbookId={start?.id} />
    </div>
  );
}

function Targets({ r, small = false }) {
  const view = useView();
  const ids = (r.targets || []).map((t) => view.idById.get(t)).filter(Boolean);
  return (
    <div className={cn('mt-1.5 flex flex-wrap gap-1.5', small && 'mt-1')}>
      {ids.slice(0, 4).map((i) => (
        <Link key={i.id} to={`/identities/${i.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-[11.5px] text-ink-2 hover:border-line-strong">
          <IdentityLogo type={i.type} size={14} />{i.name}
        </Link>
      ))}
      {ids.length > 4 && <span className="text-[11.5px] text-ink-3">+{ids.length - 4} more</span>}
    </div>
  );
}

function RunCard({ r }) {
  return (
    <Panel prominence="lead">
      <div className="flex items-start gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-info-soft text-info"><Loader2 aria-hidden="true" className="size-4.5 animate-spin" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-ink">{r.playbookMeta?.title}</p>
          <p className="text-[12px] text-ink-3">Started by <PersonName refId={r.startedBy} className="text-ink-2" /> <Time at={r.startedAt} /></p>
          <Targets r={r} />
        </div>
        <StatusPill status={r.status} pulse />
      </div>
      <ol className="mt-4 space-y-2">
        {r.steps.map((s, k) => {
          const state = k < r.step ? 'done' : k === r.step ? 'now' : 'next';
          return (
            <li key={s} className="flex items-center gap-2.5 text-[12.5px]">
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full', state === 'done' && 'bg-low-soft text-low', state === 'now' && 'bg-info-soft text-info', state === 'next' && 'bg-surface-3 text-ink-3')}>
                {state === 'done' ? <Check aria-hidden="true" className="size-3" /> : state === 'now' ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : <Clock aria-hidden="true" className="size-3" />}
              </span>
              <span className={cn(state === 'next' ? 'text-ink-3' : 'text-ink')}>{s}</span>
              {state === 'now' && <span className="ml-auto h-1 w-16 overflow-hidden rounded-full bg-info/20"><span className="block h-full bg-info transition-[width] duration-700" style={{ width: `${Math.round((r.fraction || 0) * 100)}%` }} /></span>}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
