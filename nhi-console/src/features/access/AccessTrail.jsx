import { ArrowDown, ArrowUp } from 'lucide-react';
import { edgePhrase } from './graphModel';
import { KIND_LABEL } from './graphTheme';
import { cn } from '../../ui/cn';

/**
 * "How it gets here": the chain from the starting point to the selected box,
 * one arrow at a time, each saying what it is - the role it runs as, the
 * policy attached to that role, what the policy grants. Read top to bottom.
 */
export function AccessTrail({ steps, onSelect }) {
  if (!steps?.length) return null;
  const Box = ({ node, strong }) => (
    <button
      type="button"
      onClick={() => onSelect?.(node.id)}
      className={cn(
        'flex w-full min-w-0 items-center justify-between gap-2 rounded-[8px] border px-2.5 py-1.5 text-left hover:border-brand/50',
        strong ? 'border-brand/40 bg-info-soft/40' : node.isAdmin ? 'border-critical/40 bg-critical-soft/40' : 'border-line bg-surface',
      )}
    >
      <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink" title={node.name}>
        {node.name}
      </span>
      <span className="shrink-0 text-[10.5px] text-ink-3">{node.typeLabel || KIND_LABEL[node.kind]}</span>
    </button>
  );
  return (
    <section aria-label="How it gets here" className="rounded-[10px] border border-line bg-surface-2/60 p-3">
      <p className="mb-2 text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">How it gets here</p>
      <ol className="flex flex-col gap-1">
        <li>
          <Box node={steps[0].from} />
        </li>
        {steps.map((step, index) => (
          <li key={`${step.edge.id}-${index}`} className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 pl-3 text-[11.5px] text-ink-2">
              {step.forward ? <ArrowDown aria-hidden="true" className="size-3.5 text-brand" /> : <ArrowUp aria-hidden="true" className="size-3.5 text-high" />}
              {step.forward ? edgePhrase(step.edge, step.to) : `${step.to.name} ${edgePhrase(step.edge, step.from)} it`}
            </span>
            <Box node={step.to} strong={index === steps.length - 1} />
          </li>
        ))}
      </ol>
    </section>
  );
}
