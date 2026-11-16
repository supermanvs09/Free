import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock3, Database, Ghost, Trash2, UserRound } from 'lucide-react';
import { deleteRole, fetchCredentialStanding, onResponseChange } from '../../lib/api/response';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatRelative } from '../../lib/format';
import { Button } from '../../ui/Button';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';

const DATA_TONE = { PCI: 'text-critical', PII: 'text-critical', Secrets: 'text-critical', Financial: 'text-high' };

/**
 * An orphaned role, at the top of its drawer: what left it behind, how long
 * it has gone unused, what it can still reach, who owns it, and removal.
 */
export function OrphanPanel({ credentialId, onDeleted }) {
  const { notify } = useToast();
  const [params] = useSearchParams();
  const act = params.get('act');
  const query = useQuery((signal) => fetchCredentialStanding(credentialId, signal), [credentialId]);
  const { refetch } = query;
  useEffect(() => onResponseChange(refetch), [refetch]);
  const [busy, setBusy] = useState(false);
  const d = query.data;

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteRole(credentialId);
      notify({ variant: 'success', title: `${d.name} deleted`, description: 'The open door is closed: nothing can assume this role any more.' });
      onDeleted?.();
    } catch (error) {
      notify({ variant: 'error', title: 'Could not delete the role', description: error?.message });
      setBusy(false);
    }
  };
  useEffect(() => {
    if (act === 'delete' && d?.can_delete) {
      const t = setTimeout(remove, 500);
      return () => clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act, d?.can_delete]);

  if (!d?.orphaned || !d.orphaned_by) return null;
  return (
    <section aria-label="Orphaned role" className={cn('animate-rise mb-4 overflow-hidden rounded-[var(--radius-panel)] border border-high/40 bg-surface', act === 'owner' && 'animate-attention')}>
      <header className="flex items-start gap-3 border-b border-high/20 bg-high-soft/50 px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-high-soft text-high">
          <Ghost aria-hidden="true" className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold tracking-[0.12em] text-high uppercase">Orphaned {formatRelative(d.orphaned_by.at)}</span>
          <span className="mt-0.5 block text-[15px] leading-snug font-semibold text-ink">Function deleted - its role was left behind</span>
          <span className="mt-0.5 block text-[12px] text-ink-3">
            <span className="font-mono">{d.orphaned_by.name}</span> was deleted (lambda:DeleteFunction{d.orphaned_by.by ? ` by ${d.orphaned_by.by}` : ''}). Nothing uses <span className="font-mono">{d.name}</span> now, but its access is intact.
          </span>
        </span>
      </header>
      <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">
            <Database aria-hidden="true" className="size-3.5" /> Still has access to
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {d.access.map((a) => (
              <li key={`${a.actions.join()}-${a.resource}`} className="rounded-[8px] border border-line px-2.5 py-1.5">
                <span className="block font-mono text-[12px] font-semibold text-ink">{a.resource}</span>
                <span className="block text-[11px] text-ink-3">
                  {a.actions.join(', ')}
                  {a.data ? <span className={cn('ml-1 font-semibold', DATA_TONE[a.data])}>· {a.data}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 rounded-[8px] border border-line px-3 py-2">
            <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-high" />
            <span className="text-[12.5px] text-ink-2">
              <b className="text-ink">Unused for {d.unused_days} days.</b> No call in CloudTrail since before the function was deleted.
            </span>
          </div>
          {d.owner && (
            <div className={cn('flex items-start gap-2 rounded-[8px] border border-line px-3 py-2', act === 'owner' && 'border-brand bg-info-soft/50')}>
              <UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
              <span className="text-[12.5px] text-ink-2">
                <b className="text-ink">Owner: {d.owner.name}</b> ({d.owner.team}) from the owner tag; created by <span className="font-mono">{d.owner.created_by}</span> for <span className="font-mono">{d.owner.workload}</span>.
              </span>
            </div>
          )}
          <div className="mt-auto rounded-[8px] border border-line bg-surface-2 px-3 py-2.5">
            <p className="text-[12.5px] font-semibold text-ink">Recommended: delete the role</p>
            <p className="mt-0.5 text-[11.5px] text-ink-3">Nothing references it. {d.owner ? `${d.owner.name.split(' ')[0]} is notified.` : ''}</p>
            <Button className="mt-2" variant="danger" size="sm" icon={Trash2} loading={busy} disabled={!d.can_delete} onClick={remove}>
              Delete role
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
