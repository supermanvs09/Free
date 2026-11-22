import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, ShieldCheck } from 'lucide-react';
import { downloadPostureReport, fetchPostureReportPreview } from '../../lib/api/reports';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { formatNumber } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { InlineError } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';

const CLASSES = [
  { value: 'all', label: 'All identities' },
  { value: 'human', label: 'Human' },
  { value: 'nhi', label: 'Non-human' },
];

const SEVERITIES = [
  { value: 'critical', label: 'Critical', dot: 'bg-critical' },
  { value: 'high', label: 'High', dot: 'bg-high' },
  { value: 'medium', label: 'Medium', dot: 'bg-medium' },
  { value: 'low', label: 'Low', dot: 'bg-low' },
];

const PARTS = [
  { value: 'severity', label: 'Severity', hint: 'How serious each failing check is' },
  { value: 'about', label: 'What the check looks at', hint: 'One line explaining the check' },
  { value: 'fix', label: 'How to fix', hint: 'The fix, when one is known' },
];

const FORMATS = [
  { value: 'pdf', label: 'PDF', hint: 'To read and share: a summary page, then each identity with what it fails', icon: FileText },
  { value: 'csv', label: 'CSV', hint: 'To sort and filter in a spreadsheet: one row per failing check', icon: FileSpreadsheet },
];

/**
 * Reports: files built from what the console already stores, to share with
 * people who do not use it (an auditor, a team lead, a ticket). One report for
 * now, the posture report. Every choice updates a plain-language preview of
 * what the file will hold before anything is downloaded.
 */
export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        lede="Download what the console found as a file to share or keep. Reports are built from the latest scan and cover every connected account."
      />
      <PostureReport />
    </div>
  );
}

function PostureReport() {
  const { notify } = useToast();
  const [identityClass, setIdentityClass] = useState('all');
  const [severities, setSeverities] = useState(SEVERITIES.map((s) => s.value));
  const [parts, setParts] = useState(PARTS.map((p) => p.value));
  const [format, setFormat] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const sevKey = useDebouncedValue(severities.join(','), 200);
  const preview = useQuery(
    (signal) => fetchPostureReportPreview({ identityClass, severities: sevKey ? sevKey.split(',') : [] }, signal),
    [identityClass, sevKey],
    { enabled: sevKey !== '' },
  );

  const toggle = (list, setList, value) => setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const p = preview.data;
  const nothingChosen = severities.length === 0;

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const { filename } = await downloadPostureReport({ identityClass, severities, include: parts, format });
      notify({ variant: 'success', title: 'Report downloaded', description: filename });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel prominence="lead" flush className="animate-rise overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-control)] border border-line bg-surface-2">
          <ShieldCheck aria-hidden="true" className="size-4.5 text-brand" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Posture report</h2>
          <p className="mt-0.5 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-3">
            Which identities fail which security checks, how serious each one is and how to fix it. The same data as the Posture page, as a file.
          </p>
        </div>
      </div>

      <div className="grid @container lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-6 px-5 py-5">
          <Step n={1} title="Which identities">
            <SegmentedControl label="Which identities" options={CLASSES} value={identityClass} onChange={setIdentityClass} />
          </Step>

          <Step n={2} title="Which failing checks" hint="By severity. Leave all on for the full picture.">
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((s) => {
                const on = severities.includes(s.value);
                return (
                  <label
                    key={s.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border px-3 py-1.5 text-[12.5px] transition-colors',
                      on ? 'border-brand/40 bg-brand-soft/40 text-ink' : 'border-line text-ink-3 hover:border-ink-3/50',
                    )}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(severities, setSeverities, s.value)} className="size-3.5 accent-[var(--t-brand)]" />
                    <span aria-hidden="true" className={cn('size-2 rounded-full', s.dot)} />
                    {s.label}
                  </label>
                );
              })}
            </div>
            {nothingChosen && <p className="mt-2 text-[12px] text-high">Choose at least one severity.</p>}
          </Step>

          <Step n={3} title="What to include for each check" hint="Every row always names the identity, the check and what was found.">
            <div className="flex flex-col gap-2">
              {PARTS.map((part) => (
                <label key={part.value} className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={parts.includes(part.value)}
                    onChange={() => toggle(parts, setParts, part.value)}
                    className="mt-0.5 size-3.5 accent-[var(--t-brand)]"
                  />
                  <span>
                    <span className="block text-[13px] text-ink">{part.label}</span>
                    <span className="block text-[12px] text-ink-3">{part.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Step>

          <Step n={4} title="Format">
            <div role="radiogroup" aria-label="Format" className="grid gap-2 sm:grid-cols-2">
              {FORMATS.map((f) => {
                const on = format === f.value;
                const Icon = f.icon;
                return (
                  <label
                    key={f.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border p-3 transition-colors',
                      on ? 'border-brand/50 bg-brand-soft/30 shadow-[0_0_0_1px_var(--t-brand)]' : 'border-line hover:border-ink-3/50',
                    )}
                  >
                    <input type="radio" name="report-format" value={f.value} checked={on} onChange={() => setFormat(f.value)} className="sr-only" />
                    <Icon aria-hidden="true" className={cn('mt-0.5 size-4.5 shrink-0', on ? 'text-brand' : 'text-ink-3')} />
                    <span>
                      <span className="block text-[13px] font-semibold text-ink">{f.label}</span>
                      <span className="block text-[12px] leading-snug text-ink-3">{f.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Step>
        </div>

        <aside aria-label="What the report holds" className="flex flex-col gap-4 border-t border-line bg-surface-2/50 px-5 py-5 lg:border-t-0 lg:border-l">
          <p className="text-[13px] font-semibold text-ink">This report will hold</p>
          {nothingChosen ? (
            <p className="text-[12.5px] text-ink-3">Nothing yet: choose at least one severity.</p>
          ) : preview.isError && !p ? (
            <InlineError error={preview.error} onRetry={preview.refetch} label="Could not count what the report holds" />
          ) : !p ? (
            <p className="text-[12.5px] text-ink-3">Counting…</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Figure label="Identities scored" value={p.scored} />
                <Figure label="With failing checks" value={p.failing} />
                <Figure label="Failing checks" value={p.checks} />
                <Figure label="Average score" value={p.averageScore === null ? null : Math.round(p.averageScore)} suffix=" / 100" />
              </dl>
              {p.checks > 0 && (
                <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
                  {SEVERITIES.filter((s) => severities.includes(s.value)).map((s) => (
                    <li key={s.value} className="flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-2 text-ink-2">
                        <span aria-hidden="true" className={cn('size-2 rounded-full', s.dot)} />
                        {s.label}
                      </span>
                      <span data-numeric="" className="font-semibold text-ink">
                        {formatNumber(p.bySeverity[s.value] ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] leading-relaxed text-ink-3">
                {p.checks === 0
                  ? 'No identity fails a check of the chosen severity. The report will say so.'
                  : `Covers ${formatNumber(p.accounts)} ${p.accounts === 1 ? 'account' : 'accounts'}. Identities are listed worst score first, each with its most severe check first.`}
              </p>
            </>
          )}

          {error && <InlineError error={error} onRetry={download} label="The report could not be downloaded" />}

          <Button variant="primary" icon={Download} onClick={download} loading={busy} disabled={nothingChosen || busy} className="mt-auto w-full justify-center">
            {busy ? 'Preparing…' : `Download ${format.toUpperCase()}`}
          </Button>
        </aside>
      </div>
    </Panel>
  );
}

function Step({ n, title, hint, children }) {
  return (
    <section aria-label={title}>
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border border-line text-[11px] font-semibold text-ink-3">
          {n}
        </span>
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
      </div>
      <div className="pl-7.5">{children}</div>
    </section>
  );
}

function Figure({ label, value, suffix = '' }) {
  return (
    <div>
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd data-numeric="" className="mt-0.5 text-[20px] leading-tight font-bold text-ink">
        {value === null || value === undefined ? '-' : formatNumber(value)}
        {value !== null && value !== undefined && suffix && <span className="text-[12px] font-medium text-ink-3">{suffix}</span>}
      </dd>
    </div>
  );
}
