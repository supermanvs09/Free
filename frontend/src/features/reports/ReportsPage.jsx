import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Sheet, ShieldCheck } from 'lucide-react';
import { fetchPostureFacets } from '../../lib/api/posture';
import { formatScore } from '../posture/parts';
import { downloadPostureReport, fetchPostureReportPreview } from '../../lib/api/reports';
import { useDebouncedValue, useQuery } from '../../lib/hooks';
import { formatNumber } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Overlay';
import { SearchInput } from '../../ui/Field';
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
  {
    value: 'pdf',
    label: 'PDF',
    hint: 'To read and share',
    holds: 'A summary and where the risk is, then each failing check once: how to fix it and the identities that fail it.',
    icon: FileText,
  },
  {
    value: 'xlsx',
    label: 'Excel',
    hint: 'To work through, with filters',
    holds: 'Three sheets: Summary, Identities (every scored identity) and Failing checks (one row each). Both lists can be filtered.',
    icon: Sheet,
  },
  {
    value: 'csv',
    label: 'CSV',
    hint: 'To import into another tool',
    holds: 'One row per failing check, to import into a ticketing or GRC tool.',
    icon: FileSpreadsheet,
  },
];
const FORMAT_LABEL = Object.fromEntries(FORMATS.map((f) => [f.value, f.label]));

/**
 * Reports: files built from what the console already stores, to share with
 * people who do not use it (an auditor, a team lead, a ticket). Each report is
 * a small card saying what it holds right now; Download opens the builder in a
 * dialog, where every choice updates a preview before anything is downloaded.
 */
export default function ReportsPage() {
  const [open, setOpen] = useState(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        lede="Download what the console found as a file to share or keep. Reports are built from the latest scan and cover every connected account."
      />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),26rem))] gap-4">
        <PostureCard onOpen={() => setOpen('posture')} />
      </div>
      <PostureReportDialog open={open === 'posture'} onClose={() => setOpen(null)} />
    </div>
  );
}

const ALL_SEVERITIES = SEVERITIES.map((s) => s.value);

/* The report's identity choice as the Posture page's identity_class filter. */
const CLASS_PARAM = { all: undefined, human: 'HI', nhi: 'NHI' };

/** The report as a card: what it is, what it would hold today, and the way in. */
function PostureCard({ onOpen }) {
  const preview = useQuery((signal) => fetchPostureReportPreview({ identityClass: 'all', severities: ALL_SEVERITIES }, signal), []);
  const p = preview.data;
  return (
    <article className="animate-rise group flex flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-ink-3/40 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] border border-brand/20 bg-info-soft">
          <ShieldCheck aria-hidden="true" className="size-5 text-brand" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Posture report</h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">Which identities fail which security checks, how serious each one is and how to fix it.</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <CardFigure label="Identities failing" value={p?.failing} loading={!p && !preview.isError} />
        <CardFigure label="Failing checks" value={p?.checks} loading={!p && !preview.isError} />
        <CardFigure label="Critical" value={p?.bySeverity?.critical ?? (p ? 0 : undefined)} loading={!p && !preview.isError} tone={p?.bySeverity?.critical ? 'text-critical' : undefined} />
      </dl>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <FileText aria-hidden="true" className="size-3.5" /> PDF
          <Sheet aria-hidden="true" className="ml-1.5 size-3.5" /> Excel
          <FileSpreadsheet aria-hidden="true" className="ml-1.5 size-3.5" /> CSV
        </span>
        <Button variant="primary" size="sm" icon={Download} onClick={onOpen}>
          Download
        </Button>
      </div>
    </article>
  );
}

function CardFigure({ label, value, loading, tone }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11.5px] text-ink-3">{label}</dt>
      <dd data-numeric="" className={cn('mt-0.5 text-[18px] leading-tight font-semibold', tone ?? 'text-ink')}>
        {loading ? <span className="inline-block h-4 w-8 animate-pulse rounded bg-surface-2" /> : value === undefined || value === null ? '-' : formatNumber(value)}
      </dd>
    </div>
  );
}

function PostureReportDialog({ open, onClose }) {
  const { notify } = useToast();
  const [identityClass, setIdentityClass] = useState('all');
  const [severities, setSeverities] = useState(ALL_SEVERITIES);
  const [parts, setParts] = useState(PARTS.map((p) => p.value));
  const [format, setFormat] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [accountMode, setAccountMode] = useState('all');
  const [chosen, setChosen] = useState([]);

  /* The accounts and how many identities of the chosen kind each holds: the
     Posture page's own account list. */
  const facets = useQuery((signal) => fetchPostureFacets({ identity_class: CLASS_PARAM[identityClass] }, signal), [identityClass], { enabled: open, keepPrevious: true });
  const accounts = useMemo(
    () =>
      Object.entries(facets.data?.facets?.account ?? {})
        .map(([id, entry]) => ({ id, name: entry?.name || id, count: Number(entry?.count) || 0 }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [facets.data],
  );
  const accountIds = accountMode === 'some' ? chosen : [];

  const sevKey = useDebouncedValue(severities.join(','), 200);
  const acctKey = useDebouncedValue(accountIds.join(','), 250);
  const preview = useQuery(
    (signal) => fetchPostureReportPreview({ identityClass, severities: sevKey ? sevKey.split(',') : [], accounts: acctKey ? acctKey.split(',') : [] }, signal),
    [identityClass, sevKey, acctKey],
    { enabled: open && sevKey !== '' && !(accountMode === 'some' && acctKey === ''), keepPrevious: true },
  );

  const toggle = (list, setList, value) => setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const p = preview.data;
  const noAccount = accountMode === 'some' && chosen.length === 0;
  const nothingChosen = severities.length === 0 || noAccount;

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const { filename } = await downloadPostureReport({ identityClass, severities, accounts: accountIds, include: parts, format });
      notify({ variant: 'success', title: 'Report downloaded', description: filename });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      flush
      icon={ShieldCheck}
      title="Posture report"
      description="Choose what goes in the file. The summary updates as you choose."
      footer={
        <>
          {error && (
            <div className="mr-auto min-w-0">
              <InlineError error={error} onRetry={download} label="The report could not be downloaded" />
            </div>
          )}
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon={Download} onClick={download} loading={busy} disabled={nothingChosen || busy}>
            {busy ? 'Preparing…' : `Download ${FORMAT_LABEL[format]}`}
          </Button>
        </>
      }
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex flex-col gap-6 px-5 py-5">
          <Step n={1} title="Who it covers">
            <div className="flex flex-col gap-3">
              <SegmentedControl label="Which identities" options={CLASSES} value={identityClass} onChange={setIdentityClass} />
              {accounts.length > 1 && (
                <div className="flex flex-col gap-2">
                  <SegmentedControl
                    label="Which accounts"
                    options={[
                      { value: 'all', label: `All ${formatNumber(accounts.length)} accounts` },
                      { value: 'some', label: 'Choose accounts' },
                    ]}
                    value={accountMode}
                    onChange={setAccountMode}
                  />
                  {accountMode === 'some' && <AccountChooser accounts={accounts} chosen={chosen} onChange={setChosen} />}
                </div>
              )}
            </div>
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
            <div role="radiogroup" aria-label="Format" className="grid gap-2 sm:grid-cols-3">
              {FORMATS.map((f) => {
                const on = format === f.value;
                const Icon = f.icon;
                return (
                  <label
                    key={f.value}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40',
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

        <aside aria-label="What the report holds" className="flex flex-col gap-4 border-t border-line bg-surface-2/50 px-5 py-5 md:border-t-0 md:border-l">
          <p className="text-[13px] font-semibold text-ink">This report will hold</p>
          {nothingChosen ? (
            <p className="text-[12.5px] text-ink-3">Nothing yet: choose at least one {noAccount ? 'account' : 'severity'}.</p>
          ) : preview.isError ? (
            <InlineError error={preview.error} onRetry={preview.refetch} label="Could not count what the report holds" />
          ) : !p ? (
            <p className="text-[12.5px] text-ink-3">Counting…</p>
          ) : (
            <>
              <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-3 transition-opacity', preview.isRefreshing && 'opacity-60')}>
                <Figure label="Identities scored" value={p.scored} />
                <Figure label="With failing checks" value={p.failing} />
                <Figure label="Failing checks" value={p.checks} />
                <Figure label={p.averageScope === 'NHI' ? 'Average score (non-human)' : 'Average score'} value={p.averageScore} decimals suffix=" / 100" />
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
                  : `Covers ${formatNumber(p.accounts)} ${p.accounts === 1 ? 'account' : 'accounts'}, most severe checks first.`}
              </p>
              <p className="mt-auto border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
                <span className="font-medium text-ink-2">{FORMAT_LABEL[format]}: </span>
                {FORMATS.find((f) => f.value === format)?.holds}
              </p>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}

/**
 * The accounts to cover, as a checklist in the dialog itself (a popover here
 * would close the dialog with it on Escape). Each line names the account and
 * how many identities of the chosen kind it holds; search appears once the
 * list is long.
 */
function AccountChooser({ accounts, chosen, onChange }) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const shown = term ? accounts.filter((a) => a.name.toLowerCase().includes(term) || a.id.includes(term)) : accounts;
  const allShown = shown.length > 0 && shown.every((a) => chosen.includes(a.id));
  const toggle = (id) => onChange(chosen.includes(id) ? chosen.filter((v) => v !== id) : [...chosen, id]);
  const toggleShown = () =>
    onChange(allShown ? chosen.filter((id) => !shown.some((a) => a.id === id)) : [...new Set([...chosen, ...shown.map((a) => a.id)])]);
  return (
    <div className="overflow-hidden rounded-[var(--radius-control)] border border-line">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-2.5 py-2">
        {accounts.length > 6 && (
          <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search accounts" aria-label="Search accounts" className="min-w-0 flex-1 basis-48" />
        )}
        <span className="text-[12px] text-ink-3" data-numeric="">
          {formatNumber(chosen.length)} of {formatNumber(accounts.length)} chosen
        </span>
        <span className="ml-auto flex gap-3 text-[12px] font-medium">
          {shown.length > 0 && (
            <button type="button" onClick={toggleShown} className="text-brand hover:underline">
              {allShown ? (term ? 'Clear these' : 'Clear all') : term ? 'Choose these' : 'Choose all'}
            </button>
          )}
        </span>
      </div>
      <ul className="max-h-44 overflow-y-auto py-1" aria-label="Accounts">
        {shown.map((a) => (
          <li key={a.id}>
            <label className="flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5 hover:bg-surface-2">
              <input type="checkbox" checked={chosen.includes(a.id)} onChange={() => toggle(a.id)} className="size-3.5 shrink-0 accent-[var(--t-brand)]" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{a.name}</span>
              {a.name !== a.id && <span className="hidden shrink-0 font-mono text-[11.5px] text-ink-3 sm:inline">{a.id}</span>}
              <span className="w-24 shrink-0 text-right text-[12px] text-ink-3" data-numeric="">
                {formatNumber(a.count)} {a.count === 1 ? 'identity' : 'identities'}
              </span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-2.5 py-3 text-[12.5px] text-ink-3">No account matches “{search.trim()}”.</li>}
      </ul>
    </div>
  );
}

function Step({ n, title, hint, children }) {
  return (
    <section aria-label={title}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full border border-line text-[11px] font-semibold text-ink-3">
          {n}
        </span>
        <h3 className="text-[13.5px] font-semibold text-ink">{title}</h3>
        {hint && <span className="basis-full pl-7.5 text-[12px] text-ink-3 sm:basis-auto sm:pl-0">{hint}</span>}
      </div>
      <div className="pl-7.5">{children}</div>
    </section>
  );
}

function Figure({ label, value, suffix = '', decimals = false }) {
  return (
    <div>
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd data-numeric="" className="mt-0.5 text-[20px] leading-tight font-bold text-ink">
        {value === null || value === undefined ? '-' : decimals ? formatScore(value) : formatNumber(value)}
        {value !== null && value !== undefined && suffix && <span className="text-[12px] font-medium text-ink-3">{suffix}</span>}
      </dd>
    </div>
  );
}
