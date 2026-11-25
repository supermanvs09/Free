import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Dna, KeyRound } from 'lucide-react';
import { fetchEcsGenomeRoles } from '../../lib/api/genome';
import { genomeRoute, genomeRouteFor } from '../../lib/identityLinks';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Overlay';
import { InlineError } from '../../ui/States';
import { cn } from '../../ui/cn';
import { bindingLabel } from './meta';

/* Discovery lists an ECS task once, with its roles as credentials whose
   binding says which one they are (task_role, execution_role, ...). The Genome
   monitors the two as separate identities (binding_type task_role |
   execution_role), so the same two words are what ties them together. */
const roleOf = (binding) => {
  const value = String(binding ?? '').toLowerCase();
  if (value.includes('execution')) return 'execution_role';
  if (value.includes('task')) return 'task_role';
  return '';
};

/**
 * "Open NHI Genome" for a discovery identity.
 *
 * Every type opens its Genome page directly, except an ECS task: discovery
 * shows one task, the Genome has a page for its task role and another for its
 * execution role, so the reader chooses which one to see. The choices are the
 * task's credentials (credential_id, role ARN, binding) from the identity
 * overview; the page opened is the Genome identity for that role, found with
 * GET /genome/identities?source_type=ECS&search=<task ARN>.
 */
export function OpenInGenome({ identity, credentials }) {
  const direct = genomeRouteFor({ identity_type: identity.identity_type, arn: identity.arn });
  if (identity.identity_type !== 'ecs_task') {
    return direct ? (
      <Button variant="secondary" as={Link} to={direct} icon={Dna}>
        Open NHI Genome
      </Button>
    ) : null;
  }
  return <EcsGenomeLauncher identity={identity} credentials={credentials} />;
}

/* `renderTrigger(open)` lets another screen (the access graph's side panel)
   show its own control; the default is the identity page's header button. */
export function EcsGenomeLauncher({ identity, credentials, renderTrigger }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [missing, setMissing] = useState('');

  /* One choice per role the task is bound to. */
  const choices = [];
  for (const credential of credentials ?? []) {
    const role = roleOf(credential.binding_type);
    if (role && !choices.some((entry) => entry.credentialId === credential.credential_id)) {
      choices.push({ credentialId: credential.credential_id, role, name: credential.name, arn: credential.arn, binding: credential.binding_type });
    }
  }
  choices.sort((a, b) => (a.role === b.role ? 0 : a.role === 'task_role' ? -1 : 1));

  const close = () => {
    setOpen(false);
    setError(null);
    setMissing('');
  };

  const choose = async (choice) => {
    setBusy(choice.credentialId);
    setError(null);
    setMissing('');
    try {
      const rows = await fetchEcsGenomeRoles(identity.arn);
      const ofRole = rows.filter((row) => roleOf(row.bindingType ?? row.roleKind) === choice.role);
      /* The role itself settles it when the task has more than one row of a kind. */
      const row = ofRole.find((entry) => choice.arn && entry.principalArn === choice.arn) ?? ofRole[0];
      if (!row) {
        setMissing(choice.role);
        return;
      }
      close();
      navigate(genomeRoute(row.sourceType, row.identityName));
    } catch (err) {
      setError(err);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <Button variant="secondary" icon={Dna} onClick={() => setOpen(true)}>
          Open NHI Genome
        </Button>
      )}
      <Modal
        open={open}
        onClose={close}
        icon={Dna}
        title="Which role do you want to see in the Genome?"
        description="This ECS task has two roles, and the Genome learns the behaviour of each one separately."
      >
        {choices.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            Discovery has no task role or execution role recorded for this task, so there is no Genome page to open yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {choices.map((choice) => (
              <li key={choice.credentialId}>
                <button
                  type="button"
                  onClick={() => choose(choice)}
                  disabled={Boolean(busy)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[var(--radius-control)] border border-line bg-surface-2 p-3 text-left transition-colors',
                    'hover:border-brand/50 hover:bg-surface-3 disabled:opacity-60',
                  )}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-info-soft text-brand">
                    <KeyRound aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">
                      {choice.role === 'task_role' ? 'Task role' : 'Execution role'}
                      {busy === choice.credentialId && <span className="ml-2 text-[12px] font-normal text-ink-3">Opening…</span>}
                    </span>
                    <span className="block truncate font-mono text-[11.5px] text-ink-3" title={choice.arn}>
                      {choice.name || choice.arn}
                    </span>
                    <span className="block text-[11.5px] text-ink-3">{choice.role === 'task_role' ? 'What the task’s own code calls AWS with' : 'What ECS uses to start the task'} · {bindingLabel(choice.binding)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {missing && (
          <p role="status" className="mt-3 rounded-[var(--radius-control)] border border-line bg-surface-2 p-3 text-[12.5px] text-ink-2">
            The Genome has no {missing === 'task_role' ? 'task role' : 'execution role'} identity for this task yet. It appears once the
            behaviour pipeline has seen calls made with that role.
          </p>
        )}
        {error && (
          <div className="mt-3">
            <InlineError error={error} label="the Genome identities" />
          </div>
        )}
      </Modal>
    </>
  );
}
