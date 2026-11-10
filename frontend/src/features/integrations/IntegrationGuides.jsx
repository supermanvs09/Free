import { useState } from 'react';
import { BookOpen, ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Drawer } from '../../ui/Overlay';
import { SectionLabel } from '../../ui/Panel';
import { cn } from '../../ui/cn';
import { GitHubMark } from './parts';
import { GITHUB_APP_INSTALL_URL, GUIDES } from './integrationGuides';

const BOX = { sm: 'size-8 rounded-[8px]', md: 'size-10 rounded-[10px]' };

/** Bitbucket's blue bucket on its own tile. */
export function BitbucketMark({ size = 'md', className }) {
  return (
    <span className={cn('grid shrink-0 place-items-center bg-[#0052cc] text-white', BOX[size] ?? BOX.md, className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-[56%]" fill="currentColor">
        <path d="M3.3 3a.7.7 0 0 0-.7.8l2.8 16.9a1 1 0 0 0 1 .8h11.4a.7.7 0 0 0 .7-.6l2.9-17.1a.7.7 0 0 0-.7-.8H3.3zm10.6 12H10.1L9.1 9.6h5.8l-1 5.4z" />
      </svg>
      <span className="sr-only">Bitbucket</span>
    </span>
  );
}

/** Jenkins: a neutral tile with a "J" in the brand red. */
export function JenkinsMark({ size = 'md', className }) {
  return (
    <span className={cn('grid shrink-0 place-items-center bg-[#d33833] text-white', BOX[size] ?? BOX.md, className)}>
      <span aria-hidden="true" className="font-display text-[15px] leading-none font-extrabold">
        J
      </span>
      <span className="sr-only">Jenkins</span>
    </span>
  );
}

const MARKS = { github: GitHubMark, bitbucket: BitbucketMark, jenkins: JenkinsMark };

/**
 * Code scanning (GitHub App, Bitbucket Data Center) and CI/CD (Jenkins): what
 * each connection asks for and the exact steps on your side, read-only.
 */
export function IntegrationGuides() {
  const [open, setOpen] = useState(null);
  return (
    <section aria-label="Code scanning and CI/CD" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14.5px] font-semibold text-ink">Code scanning and CI/CD</h2>
        <p className="text-[12px] text-ink-3">Read-only. Source code and full secret values are never stored.</p>
      </div>
      <div className="grid gap-3 @min-[56rem]:grid-cols-3">
        {Object.values(GUIDES).map((guide) => {
          const Mark = MARKS[guide.key];
          return (
            <div key={guide.key} className="flex flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-[var(--t-shadow-sm)]">
              <div className="flex items-start gap-3">
                <Mark size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-ink">{guide.name}</p>
                  <p className="text-[11.5px] text-ink-3">{guide.kind}</p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-ink-2">{guide.summary}</p>
              <div className="mt-3">
                <Button variant="secondary" size="sm" icon={BookOpen} onClick={() => setOpen(guide.key)}>
                  Setup steps
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <GuideDrawer guide={open ? GUIDES[open] : null} onClose={() => setOpen(null)} />
    </section>
  );
}

function GuideDrawer({ guide, onClose }) {
  const Mark = guide ? MARKS[guide.key] : null;
  return (
    <Drawer open={Boolean(guide)} onClose={onClose} eyebrow={guide?.kind} title={guide ? `Connect ${guide.name}` : ''} width="lg">
      {guide && (
        <div className="flex flex-col gap-6 px-4 py-5 sm:px-5">
          <div className="flex items-start gap-3">
            <Mark size="md" />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-2">{guide.intro}</p>
          </div>

          {guide.already && (
            <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-low/30 bg-low-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
              <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-low" />
              {guide.already}
            </p>
          )}

          {guide.prerequisites && (
            <section>
              <SectionLabel>Prerequisites</SectionLabel>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[12.5px] text-ink-2">
                {guide.prerequisites.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionLabel>Exact permissions</SectionLabel>
            <GuideTable table={guide.permissions} />
            <p className="mt-2 text-[12px] text-ink-3">{guide.permissions.note}</p>
            {guide.events && <GuideTable table={guide.events} className="mt-3" />}
          </section>

          {guide.sections.map((section) => (
            <section key={section.title}>
              <SectionLabel>{section.title}</SectionLabel>
              <GuideTable table={section.table} />
              {section.note && <p className="mt-2 text-[12px] text-ink-3">{section.note}</p>}
            </section>
          ))}

          <section>
            <SectionLabel>Steps</SectionLabel>
            <ol className="mt-3 flex flex-col gap-4">
              {guide.steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-info-soft text-[12px] font-semibold text-brand">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-ink">{step.title}</p>
                    {step.body && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{step.body}</p>}
                    {step.list && (
                      <ol className="mt-1.5 flex list-decimal flex-col gap-0.5 pl-5 text-[12.5px] leading-relaxed text-ink-2">
                        {step.list.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    )}
                    {step.action === 'install' &&
                      (GITHUB_APP_INSTALL_URL ? (
                        <Button as="a" href={GITHUB_APP_INSTALL_URL} target="_blank" rel="noreferrer noopener" size="sm" iconRight={ExternalLink} className="mt-2">
                          Install the GitHub App
                        </Button>
                      ) : (
                        <p className="mt-2 flex items-start gap-1.5 text-[12px] text-ink-3">
                          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                          adapID sends the installation link for your workspace.
                        </p>
                      ))}
                    {step.note && <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{step.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {(guide.after ?? []).map((block) => (
            <section key={block.title}>
              <SectionLabel>{block.title}</SectionLabel>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-relaxed text-ink-2">
                {block.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {block.note && <p className="mt-1.5 text-[12px] text-ink-3">{block.note}</p>}
            </section>
          ))}

          {guide.footnote && <p className="border-t border-line pt-3 text-[12px] font-medium text-ink-2">{guide.footnote}</p>}
        </div>
      )}
    </Drawer>
  );
}

function GuideTable({ table, className }) {
  return (
    <div className={cn('mt-2 overflow-x-auto rounded-[var(--radius-control)] border border-line', className)}>
      <table className="w-full min-w-[30rem] text-left text-[12.5px]">
        <thead className="bg-surface-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {table.rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={index} className={cn('px-3 py-2 align-top', index === 0 ? 'font-medium text-ink' : 'text-ink-2')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
