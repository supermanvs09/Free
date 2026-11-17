import { KeySquare } from 'lucide-react';
import { Panel } from '../../ui/Panel';
import { PolicyCard } from './AccountRemediation';
import { REQUIRED_ACCESS } from './requiredAccess';

/** What the application needs from the client: the steps and the documents to paste. */
export function RequiredAccess({ appKey }) {
  const spec = REQUIRED_ACCESS[appKey];
  if (!spec) return null;
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-ink-2">
          <KeySquare aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-semibold text-ink">Required access</h2>
          <p className="mt-0.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-2">{spec.intro}</p>
        </div>
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {spec.steps.map((step, k) => (
          <li key={step} className="flex gap-2.5 text-[12.5px] text-ink-2">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">{k + 1}</span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-col gap-2">
        {spec.policies.map((p, k) => (
          <PolicyCard key={p.key} title={p.title} note={p.note} document={p.document} defaultOpen={k === 0} />
        ))}
      </div>
    </Panel>
  );
}
