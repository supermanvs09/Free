import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Wrench } from 'lucide-react';
import { actions, PLAYBOOKS, useView } from '../data/store';
import { Button } from '../ui/Button';
import { Field, Textarea } from '../ui/Field';
import { Modal } from '../ui/Overlay';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { IdentityLogo } from './Logo';

/** Run a remediation playbook on one or more identities. */
export function RemediateModal({ open, onClose, identityIds = [], playbookId }) {
  const view = useView();
  const toast = useToast();
  const targets = identityIds.map((id) => view.idById.get(id)).filter(Boolean);
  const providers = new Set(targets.map((t) => t.provider));
  const options = PLAYBOOKS.filter((p) => p.provider === '*' || providers.has(p.provider));
  const [choice, setChoice] = useState(playbookId || options[0]?.id);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setChoice(playbookId || options[0]?.id);
      setReason('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, playbookId]);
  const pb = PLAYBOOKS.find((p) => p.id === choice);

  const run = async () => {
    setBusy(true);
    await actions.startRun(choice, identityIds, { reason });
    setBusy(false);
    onClose();
    toast.notify({
      variant: 'success',
      title: pb?.approval ? 'Sent for approval' : `${pb?.title} started`,
      description: pb?.approval ? 'Admins have been emailed. It runs as soon as one approves.' : 'Follow it on Remediation. Everyone sees the progress.',
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remediate"
      icon={Wrench}
      description={`${targets.length === 1 ? targets[0].name : `${targets.length} identities`}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={run} loading={busy} disabled={!pb}>{pb?.approval ? 'Request approval' : 'Run now'}</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {targets.length > 1 && (
          <ul className="flex flex-wrap gap-1.5">
            {targets.slice(0, 8).map((t) => (
              <li key={t.id} className="inline-flex items-center gap-1.5 rounded-md border border-line px-1.5 py-1 text-[12px]"><IdentityLogo type={t.type} size={16} />{t.name}</li>
            ))}
            {targets.length > 8 && <li className="text-[12px] text-ink-3">+{targets.length - 8} more</li>}
          </ul>
        )}
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-medium text-ink-2">Playbook</legend>
          <div className="grid gap-1.5">
            {options.map((p) => (
              <label key={p.id} className={cn('flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-2.5 transition-colors', choice === p.id ? 'border-brand bg-info-soft' : 'border-line hover:border-line-strong')}>
                <input type="radio" name="playbook" value={p.id} checked={choice === p.id} onChange={() => setChoice(p.id)} className="mt-0.5 accent-[var(--t-brand)]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{p.title}</span>
                  <span className="block text-[11.5px] text-ink-3">{p.steps.length} steps · about {p.est}{p.approval ? ' · needs an admin to approve' : ''}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {pb && (
          <ol className="space-y-1.5 rounded-[10px] bg-surface-2 p-3 text-[12.5px] text-ink-2">
            {pb.steps.map((s, k) => (
              <li key={s} className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold text-ink-3">{k + 1}</span>{s}</li>
            ))}
          </ol>
        )}
        <Field label="Reason" htmlFor="rm-reason" hint="Recorded in the audit log and in the approval email.">
          <Textarea id="rm-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. SEC-1422, key unused for 120 days" />
        </Field>
        <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><ShieldCheck aria-hidden="true" className="size-3.5" />Every step is reversible for 7 days from <Link to="/remediation" className="text-brand hover:underline">Remediation</Link>.</p>
      </div>
    </Modal>
  );
}
