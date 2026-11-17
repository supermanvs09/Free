import { useState } from 'react';
import { CircleHelp, Info, TriangleAlert, UserRoundCheck } from 'lucide-react';
import { useAccess } from '../../app/useAccess';
import { setIdentityOwner } from '../../lib/api/inventory';
import { formatDateTime } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Field, Input, Textarea } from '../../ui/Field';
import { Modal } from '../../ui/Overlay';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { ownerName } from './meta';

/**
 * The Owner column.
 *
 * What is shown depends on what is known (row.owner_state):
 *   direct       an owner tag: the name, nothing to review
 *   assigned     a person set it: the name and, in brackets, who
 *   suggested    the scanner inferred one      -> the suggested name + an info button
 *                                                (the dialog says it is a suggestion and asks to confirm)
 *   conflicting  several people fit            -> "Conflicting"    (pick one)
 *   needs_review no evidence                   -> "Needs review"   (name one)
 * Conflicting and needs-review show a label, never a guessed name; the
 * reasoning is in the dialog the info button opens. The row behind opens the
 * identity, so every click here keeps to itself.
 */
const PENDING = {
  conflicting: { label: 'Conflicting', tone: 'high' },
  needs_review: { label: 'Needs review', tone: 'medium' },
};

/** "alice@acme.test" -> "alice": who did it, as people say it. */
const who = (email) => String(email ?? '').split('@')[0] || String(email ?? '');

export function OwnerCell({ row, onChanged }) {
  const [open, setOpen] = useState(false);
  const state = row.owner_state ?? (row.owner ? 'direct' : 'needs_review');
  const pending = PENDING[state];
  const stop = (event) => event.stopPropagation();

  const info = (
    <button
      type="button"
      aria-label={pending || state === 'suggested' ? `Review the owner of ${row.name}` : `Why ${ownerName(row.owner)} is the owner`}
      onClick={(event) => {
        stop(event);
        setOpen(true);
      }}
      className="grid size-5 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
    >
      <Info aria-hidden="true" className="size-3.5" />
    </button>
  );

  return (
    /* The row behind opens the record on a click and on Enter or Space, and
       React sends events from the dialog (a portal) up through here too -
       typing a space in the dialog opened the drawer. Both are stopped. */
    <span className="flex min-w-0 items-center gap-1.5" onClick={stop} onKeyDown={stop}>
      {pending ? (
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-full">
          <Tag tone={pending.tone} size="sm">
            {pending.label}
          </Tag>
        </button>
      ) : (
        <span className="min-w-0 truncate text-[12.5px] text-ink-2" title={row.owner}>
          {ownerName(row.owner)}
          {state === 'assigned' && row.owner_set_by && <span className="text-ink-3"> ({who(row.owner_set_by)})</span>}
        </span>
      )}
      {(pending || state === 'suggested' || state === 'assigned') && info}
      {open && <OwnerDialog row={row} state={state} onClose={() => setOpen(false)} onSaved={onChanged} />}
    </span>
  );
}

/* ── The dialog ──────────────────────────────────────────────────────────── */

const COPY = {
  suggested: { title: 'Confirm the owner', icon: UserRoundCheck, lede: 'This owner is a suggestion from discovery, not a confirmed fact. Confirm it, or name someone else.' },
  conflicting: { title: 'Pick the owner', icon: TriangleAlert, lede: 'More than one person fits, so picking one would be a guess. Choose who really owns it.' },
  needs_review: { title: 'Name the owner', icon: CircleHelp, lede: 'Discovery found nothing that says who owns this. Tell us who does, and why.' },
  assigned: { title: 'Owner', icon: UserRoundCheck, lede: '' },
};
const OTHER = 'other';

function OwnerDialog({ row, state, onClose, onSaved }) {
  const { can } = useAccess();
  const { notify } = useToast();
  const writable = can('identities.owner');
  const copy = COPY[state] ?? COPY.needs_review;

  /* What can be picked: the people discovery found (a suggestion, or the
     candidates of a conflict), then "someone else". Needs review has only the
     free text; so does changing an assigned owner. */
  const options = state === 'conflicting' ? (row.owner_candidates ?? []) : state === 'suggested' && row.owner ? [{ name: row.owner, evidence: row.owner_reason }] : [];
  const [changing, setChanging] = useState(state !== 'assigned');
  const [choice, setChoice] = useState(options.length === 1 ? '0' : options.length ? null : OTHER);
  const [other, setOther] = useState('');
  const reasonFor = (option) =>
    !option ? '' : state === 'suggested' ? `Confirmed. ${option.evidence ?? ''}`.trim() : `Chosen from discovery's candidates: ${option.evidence ?? 'matched the evidence'}.`;
  const [reason, setReason] = useState(() => (options.length === 1 ? reasonFor(options[0]) : ''));
  const [touched, setTouched] = useState(false); // a reason the person wrote is never overwritten
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const picked = choice !== null && choice !== OTHER ? options[Number(choice)] : null;
  const owner = (picked ? picked.name : other).trim();
  const reasonOk = reason.trim().length >= 3;
  const ready = writable && owner.length > 0 && reasonOk && !saving;

  const choose = (next) => {
    setChoice(next);
    if (!touched) setReason(next === OTHER ? '' : reasonFor(options[Number(next)]));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await setIdentityOwner(row.id, { owner, reason });
      notify({ variant: 'success', title: 'Owner saved', description: `${owner} now owns ${row.name}.` });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.status === 403 ? 'Your role cannot assign owners.' : 'The owner could not be saved. Try again in a moment.');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={copy.title}
      description={copy.lede || undefined}
      icon={copy.icon}
      tone={state === 'conflicting' ? 'medium' : 'brand'}
      footer={
        changing ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={!ready} locked={writable ? undefined : 'Your role cannot assign owners. Ask an analyst or admin.'}>
              Save owner
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            {writable && (
              <Button variant="secondary" onClick={() => setChanging(true)}>
                Change owner
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-4" onClick={(event) => event.stopPropagation()}>
        <p className="text-[12.5px] text-ink-3">
          Identity <span className="font-medium text-ink-2">{row.name}</span>
        </p>

        {state === 'assigned' && (
          <section className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3.5">
            <p className="text-[13px] font-semibold text-ink">{ownerName(row.owner)}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-3">
              Set by {who(row.owner_set_by) || 'someone'}
              {row.owner_set_at ? ` on ${formatDateTime(row.owner_set_at)}` : ''}
            </p>
            {row.owner_set_reason && <p className="mt-2 text-[12.5px] leading-relaxed whitespace-pre-line text-ink">{row.owner_set_reason}</p>}
          </section>
        )}

        {state !== 'assigned' && row.owner_reason && (
          <section className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3.5">
            <p className="text-[11px] font-semibold tracking-[0.1em] text-ink-3 uppercase">What discovery found</p>
            <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-line text-ink-2">{row.owner_reason}</p>
          </section>
        )}

        {changing && (
          <>
            {options.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[12.5px] font-medium text-ink-2">{state === 'conflicting' ? 'Who owns it?' : 'Is this the owner?'}</legend>
                {options.map((option, i) => (
                  <label
                    key={option.name}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border p-3 transition-colors',
                      choice === String(i) ? 'border-brand bg-info-soft' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <input type="radio" name="owner-choice" className="mt-0.5 size-4 accent-[var(--t-brand)]" checked={choice === String(i)} onChange={() => choose(String(i))} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-ink">{option.name}</span>
                        {Number.isFinite(option.confidence) && option.confidence > 0 && <span className="text-[11px] text-ink-3">{option.confidence}% match</span>}
                      </span>
                      {option.evidence && <span className="mt-0.5 block text-[11.5px] text-ink-3">{option.evidence}</span>}
                    </span>
                  </label>
                ))}
                <label className={cn('flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border p-3 transition-colors', choice === OTHER ? 'border-brand bg-info-soft' : 'border-line hover:border-line-strong')}>
                  <input type="radio" name="owner-choice" className="size-4 accent-[var(--t-brand)]" checked={choice === OTHER} onChange={() => choose(OTHER)} />
                  <span className="text-[13px] font-medium text-ink">Someone else</span>
                </label>
              </fieldset>
            )}

            {choice === OTHER && (
              <Field label="Owner" required htmlFor="owner-name" hint="A person (jane.doe) or a team (platform-team).">
                <Input id="owner-name" value={other} onChange={(e) => setOther(e.target.value)} placeholder="jane.doe" maxLength={255} autoFocus autoComplete="off" />
              </Field>
            )}

            {(choice !== null) && (
              <Field label="Why is this the owner?" required htmlFor="owner-reason" hint="Shown next to the owner so the next person can see the reasoning.">
                <Textarea
                  id="owner-reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setTouched(true);
                  }}
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. Runs the billing service and approved this role."
                />
              </Field>
            )}
            {error && (
              <p role="alert" className="text-[12.5px] text-critical">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
