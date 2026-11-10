import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Info, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Drawer } from '../../ui/Overlay';
import { SectionLabel } from '../../ui/Panel';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { readProgress, writeProgress } from './area';
import { GITHUB_APP_INSTALL_URL } from './integrationGuides';
import { GuideTable, SOURCE_MARKS } from './IntegrationGuides';

/** The pages of one source's setup: before you start, each step, then hand-over. */
export function wizardPages(guide) {
  return [
    { key: 'start', title: 'Before you start', hint: 'What we ask for and why' },
    ...guide.steps.map((step, index) => ({ key: `step-${index}`, title: step.title, step })),
    { key: 'finish', title: guide.after?.length ? 'Hand over and verify' : 'Hand over', hint: 'What happens next' },
  ];
}

/**
 * One on-premises source set up as a guided sequence: a rail of steps that can
 * be opened in any order, one step on screen at a time, Back and Next, and the
 * progress remembered so a setup left half-way picks up where it stopped.
 */
export function SetupWizard({ guide, onClose, onProgress }) {
  const pages = useMemo(() => (guide ? wizardPages(guide) : []), [guide]);
  const [state, setState] = useState(() => (guide ? readProgress(guide.key) : { done: [], current: 0 }));
  const { notify } = useToast();

  /* A different source opens on its own saved progress. */
  const [shownKey, setShownKey] = useState(guide?.key);
  if (guide && guide.key !== shownKey) {
    setShownKey(guide.key);
    setState(readProgress(guide.key));
  }

  useEffect(() => {
    if (!guide) return;
    writeProgress(guide.key, state);
    onProgress?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide?.key, state]);

  /* On a narrow screen the rail scrolls sideways: keep the current step in it. */
  useEffect(() => {
    document.querySelector('[aria-label="Setup steps"] [aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [state.current, guide?.key]);

  if (!guide) return <Drawer open={false} onClose={onClose} title="" />;

  const index = Math.min(state.current, pages.length - 1);
  const page = pages[index];
  const doneSet = new Set(state.done);
  const completed = pages.filter((p) => doneSet.has(p.key)).length;
  const pct = Math.round((completed / pages.length) * 100);
  const Mark = SOURCE_MARKS[guide.key];
  const last = index === pages.length - 1;

  const go = (to) => setState((prev) => ({ ...prev, current: Math.max(0, Math.min(pages.length - 1, to)) }));
  const next = () => {
    setState((prev) => ({ done: [...new Set([...prev.done, page.key])], current: Math.min(pages.length - 1, index + 1) }));
    globalThis.requestAnimationFrame(() => document.getElementById('setup-wizard-body')?.scrollTo({ top: 0 }));
  };
  const finish = () => {
    setState((prev) => ({ done: [...new Set([...prev.done, page.key])], current: index }));
    notify({ variant: 'success', title: `${guide.name} setup steps complete`, description: guide.handoff });
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={guide.kind}
      title={`Set up ${guide.name}`}
      width="xl"
      header={
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
            <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-[var(--ease-out-quint)]" style={{ width: `${pct}%` }} />
          </div>
          <span data-numeric="" className="shrink-0 text-[11.5px] text-ink-3">
            {completed} of {pages.length} done
          </span>
        </div>
      }
      footer={
        <>
          <span className="mr-auto text-[12px] text-ink-3" data-numeric="">
            Step {index + 1} of {pages.length}
          </span>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => go(index - 1)} disabled={index === 0}>
            Back
          </Button>
          {last ? (
            <Button variant="primary" icon={Check} onClick={finish}>
              Finish setup
            </Button>
          ) : (
            <Button variant="primary" iconRight={ArrowRight} onClick={next}>
              {index === 0 ? 'Start' : `Next: ${pages[index + 1].title}`}
            </Button>
          )}
        </>
      }
    >
      <div className="grid min-h-full grid-cols-[minmax(0,1fr)] content-start @min-[44rem]:grid-cols-[15rem_minmax(0,1fr)] @min-[44rem]:content-stretch">
        {/* The steps, always in view: where you are, what is done, any one a click away. */}
        <nav aria-label="Setup steps" className="border-b border-line bg-surface-2 px-3 py-3 @min-[44rem]:border-r @min-[44rem]:border-b-0 @min-[44rem]:py-5">
          <ol className="flex gap-1 overflow-x-auto @min-[44rem]:flex-col">
            {pages.map((p, i) => {
              const done = doneSet.has(p.key);
              const current = i === index;
              return (
                <li key={p.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 text-left transition-colors',
                      current ? 'bg-surface shadow-[var(--t-shadow-sm)] ring-1 ring-line' : 'hover:bg-surface-3',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                        done ? 'bg-low text-white' : current ? 'bg-brand text-white' : 'border border-line-strong text-ink-3',
                      )}
                    >
                      {done ? <Check aria-hidden="true" className="size-3.5" /> : i + 1}
                    </span>
                    <span className={cn('min-w-0 text-[12.5px] leading-snug @max-[44rem]:truncate', current ? 'font-semibold text-ink' : 'text-ink-2')}>{p.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div id="setup-wizard-body" className="min-w-0 px-5 py-5 @min-[44rem]:px-7">
          {page.key === 'start' && <StartPage guide={guide} Mark={Mark} />}
          {page.step && <StepPage guide={guide} step={page.step} number={index} />}
          {page.key === 'finish' && <FinishPage guide={guide} />}
        </div>
      </div>
    </Drawer>
  );
}

function StartPage({ guide, Mark }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <Mark size="lg" />
        <div className="min-w-0">
          <p className="text-[13.5px] leading-relaxed text-ink-2">{guide.intro}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
            <span>About {guide.minutes} minutes</span>
            <span aria-hidden="true">·</span>
            <span>Read-only</span>
          </p>
        </div>
      </div>
      {guide.already && (
        <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-low/30 bg-low-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" />
          {guide.already}
        </p>
      )}
      {guide.prerequisites && (
        <section>
          <SectionLabel>You will need</SectionLabel>
          <ul className="mt-2 flex flex-col gap-1.5">
            {guide.prerequisites.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
                <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-brand" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <SectionLabel>Exactly what we ask for</SectionLabel>
        <GuideTable table={guide.permissions} />
        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-ink-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-low" />
          {guide.permissions.note}
        </p>
        {guide.events && <GuideTable table={guide.events} className="mt-3" />}
      </section>
      {guide.sections.map((section) => (
        <section key={section.title}>
          <SectionLabel>{section.title}</SectionLabel>
          <GuideTable table={section.table} />
          {section.note && <p className="mt-2 text-[12px] text-ink-3">{section.note}</p>}
        </section>
      ))}
    </div>
  );
}

function StepPage({ guide, step, number }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.1em] text-brand uppercase">Step {number}</p>
        <h3 className="mt-1 text-[18px] font-bold tracking-[-0.01em] text-ink">{step.title}</h3>
        {step.body && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{step.body}</p>}
      </div>
      {step.list && (
        <ol className="flex flex-col gap-2">
          {step.list.map((item, i) => (
            <li key={item} className="flex items-start gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-3.5 py-2.5">
              <span data-numeric="" className="grid size-5 shrink-0 place-items-center rounded-full bg-info-soft text-[11px] font-semibold text-brand">
                {i + 1}
              </span>
              <span className="text-[13px] leading-relaxed text-ink">{item}</span>
            </li>
          ))}
        </ol>
      )}
      {step.action === 'install' &&
        (GITHUB_APP_INSTALL_URL ? (
          <Button as="a" href={GITHUB_APP_INSTALL_URL} target="_blank" rel="noreferrer noopener" variant="primary" iconRight={ExternalLink} className="self-start">
            Install the {guide.name} App
          </Button>
        ) : (
          <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-ink-2">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
            adapID sends the installation link for your workspace.
          </p>
        ))}
      {step.note && (
        <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-info-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
          {step.note}
        </p>
      )}
    </div>
  );
}

function FinishPage({ guide }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-low/30 bg-low-soft px-4 py-3.5">
        <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-low" />
        <div>
          <p className="text-[13.5px] font-semibold text-ink">Last step: {guide.handoff}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">Once adapID has it, scanning starts on its own and findings appear under Exposed credentials.</p>
        </div>
      </div>
      <section>
        <SectionLabel>What you get</SectionLabel>
        <ul className="mt-2 grid gap-2 @min-[36rem]:grid-cols-3">
          {guide.unlocks.map((item) => (
            <li key={item} className="rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
              {item}
            </li>
          ))}
        </ul>
      </section>
      {(guide.after ?? []).map((block) => (
        <section key={block.title}>
          <SectionLabel>{block.title}</SectionLabel>
          <ul className="mt-2 flex flex-col gap-1.5">
            {block.list.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-2">
                <ArrowRight aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                {item}
              </li>
            ))}
          </ul>
          {block.note && <p className="mt-1.5 text-[12px] text-ink-3">{block.note}</p>}
        </section>
      ))}
      {guide.footnote && <p className="border-t border-line pt-3 text-[12px] font-medium text-ink-2">{guide.footnote}</p>}
    </div>
  );
}
