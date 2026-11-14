import { useState } from 'react';
import { Radar } from 'lucide-react';
import { fetchIdentitySubjects } from '../../lib/api/blastRadius';
import { useQuery } from '../../lib/hooks/useQuery';
import { DetailSkeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { cn } from '../../ui/cn';
import { BlastRadiusView } from './BlastRadiusView';

const TYPE_LABEL = { iam_role: 'role', iam_user: 'user', access_key: 'access key' };

/**
 * An identity's blast radius is that of what it signs in with: its role
 * first. With more than one credential the reader can switch between them.
 */
export function IdentityBlastRadius({ identity }) {
  const query = useQuery((signal) => fetchIdentitySubjects(identity.id, signal), [identity.id]);
  const [picked, setPicked] = useState(null);

  if (query.isError && !query.data) return <ErrorState compact error={query.error} onRetry={query.refetch} />;
  if (!query.data) return <DetailSkeleton rows={6} />;

  /* An IAM user or role identity is its own credential. */
  const subjects = query.data.length ? query.data : identity.arn?.includes(':iam::') ? [{ arn: identity.arn, name: identity.name, credential_type: '' }] : [];
  if (subjects.length === 0) {
    return (
      <EmptyState
        compact
        icon={Radar}
        title="No credential to trace"
        description="This identity has no role or key on record, so there is nothing whose permissions can be followed."
      />
    );
  }
  const current = subjects.find((s) => s.arn === picked) ?? subjects[0];

  return (
    <div className="flex flex-col gap-4">
      {subjects.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <span>Signs in with</span>
          {subjects.map((s) => (
            <button
              key={s.arn}
              type="button"
              onClick={() => setPicked(s.arn)}
              aria-pressed={s.arn === current.arn}
              className={cn(
                'rounded-full border px-2.5 py-1 transition-colors',
                s.arn === current.arn ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2 hover:bg-surface-2',
              )}
            >
              {s.name || s.arn}
              {TYPE_LABEL[s.credential_type] ? <span className="opacity-60"> · {TYPE_LABEL[s.credential_type]}</span> : null}
            </button>
          ))}
        </div>
      )}
      <BlastRadiusView key={current.arn} arn={current.arn} />
    </div>
  );
}
