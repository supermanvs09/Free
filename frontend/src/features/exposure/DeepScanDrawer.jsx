import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, GitBranch, History, Play, RefreshCw, Radar } from 'lucide-react';
import { useAccess } from '../../app/useAccess';
import { fetchRepositories, startDeepScan } from '../../lib/api/exposure';
import { PLATFORM_ORDER, PLATFORMS, platformMeta } from '../../lib/domain';
import { formatDateTime, formatNumber, formatRelative, parseDate } from '../../lib/format';
import { Button } from '../../ui/Button';
import { SearchInput, Select } from '../../ui/Field';
import { Drawer } from '../../ui/Overlay';
import { SectionLabel } from '../../ui/Panel';
import { ClearState, EmptyState, ErrorState } from '../../ui/States';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { DEEP_SCAN_POLL_MS, deepScanStateMeta, describeDeepScanFailure, describeDeepScanRequestError } from './scannerState';

/**
 * Deep scan: walk a repository's history, commit by commit, on the branches
 * you choose.
 *
 * The normal scans read what each push changes (and, the first time, the
 * files as they are). A secret committed and deleted later is invisible to
 * them but still in every clone and fork; only a walk of the history finds
 * it. Its findings are kept apart from the live lists, under "Found in
 * history", one row per branch.
 *
 * The list is every repository the scanner has recorded in this workspace
 * (GET /repositories, built from the scanner's per-branch ledger), so a
 * repository with no finding - exactly the one whose history is worth
 * reading - is listed too. A repository appears after the scanner's first
 * scan of it, within an hour of being onboarded.
 *
 * One request reads every repository's branches and deep-scan states, and it
 * is repeated every five seconds only while a walk is running and the panel
 * is open (there is no push notification for a deep scan).
 */
export function DeepScanDrawer({ open, onClose, onOpenHistory }) {
  const { notify } = useToast();
  const [repos, setRepos] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRepos(await fetchRepositories());
      setError(null);
    } catch (err) {
      if (err?.code !== 'CANCELLED') setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* Every opening re-reads: a walk requested elsewhere, or one that finished
     while the panel was shut, would otherwise show its old state. */
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const running = useMemo(
    () => (repos ?? []).some((repo) => repo.deep_scan?.status === 'running' || repo.branches.some((b) => b.deep_scan?.status === 'running')),
    [repos],
  );
  useEffect(() => {
    if (!open || !running) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') load();
    }, DEEP_SCAN_POLL_MS);
    return () => clearInterval(id);
  }, [open, running, load]);

  const platforms = useMemo(() => PLATFORM_ORDER.filter((p) => (repos ?? []).some((repo) => repo.platform === p)), [repos]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (repos ?? []).filter(
      (repo) =>
        (!platform || repo.platform === platform) &&
        (!needle || `${repo.repository} ${repo.client_id} ${repo.branches.map((b) => b.name).join(' ')}`.toLowerCase().includes(needle)),
    );
  }, [repos, search, platform]);

  const counts = useMemo(() => {
    const out = { branches: 0, running: 0, failed: 0, complete: 0 };
    for (const repo of repos ?? []) {
      for (const b of repo.branches) {
        out.branches += 1;
        const state = branchScan(repo, b)?.status;
        if (state in out) out[state] += 1;
      }
    }
    return out;
  }, [repos]);

  /* A request shows as running on the click that made it, not five seconds
     later; the next read replaces it with the server's state. */
  const markRunning = (repo, branches, accepted) => {
    const now = accepted?.requested_at || new Date().toISOString();
    const runningScan = { status: 'running', requested_at: now, completed_at: null, commits_scanned: null, findings: null, failed_at: null, error: null };
    setRepos((current) =>
      (current ?? []).map((r) => {
        if (r !== repo) return r;
        if (!branches.length) return { ...r, deep_scan: runningScan };
        return { ...r, branches: r.branches.map((b) => (branches.includes(b.name) ? { ...b, deep_scan: runningScan } : b)) };
      }),
    );
  };

  const onStart = async (repo, choice) => {
    try {
      const accepted = await startDeepScan({ clientId: repo.client_id, repository: repo.repository, platform: repo.platform, branches: choice.value });
      const branches = accepted?.branches ?? [];
      markRunning(repo, branches, accepted);
      const what = branches.length === 0 ? 'its default branch' : branches.length === 1 ? branches[0] : `${branches.length} branches`;
      notify(
        accepted?.already_running
          ? { variant: 'info', title: 'Already running', description: `${repo.repository} (${what}) is already being walked. This panel follows it.` }
          : { variant: 'success', title: 'Deep scan started', description: `${repo.repository}: walking ${what}, commit by commit. This panel follows it; you can close it.` },
      );
    } catch (err) {
      const described = describeDeepScanRequestError(err);
      notify({ variant: 'error', title: described.title, description: described.message });
      load();
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="xl"
      eyebrow="Credential exposure"
      title="Scan full history"
      subtitle="Walk every commit of a repository's branches - including secrets that were committed and later deleted."
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-3">
            {running ? `A walk is running: checked every ${DEEP_SCAN_POLL_MS / 1000} seconds while this panel is open.` : 'Nothing is running.'}
          </p>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="grid gap-3 @min-[34rem]:grid-cols-2">
          <div className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3.5">
            <SectionLabel>The scans that already run</SectionLabel>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              Every push, on every branch, within about 30 seconds: they find a secret that is in the code now.
            </p>
          </div>
          <div className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-3.5">
            <SectionLabel>What a deep scan adds</SectionLabel>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              Every commit from the first to the latest. It finds the secret somebody committed and deleted in the next commit - still in
              every clone and fork. Results go to <span className="font-medium text-ink">Found in history</span>.
            </p>
          </div>
        </div>

        {repos && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-[var(--radius-control)] border border-line bg-inset px-3.5 py-2.5 text-[12px]">
            <Fact label="Repositories" value={formatNumber(repos.length)} />
            <Fact label="Branches" value={formatNumber(counts.branches)} />
            <Fact label="Walking now" value={formatNumber(counts.running)} />
            <Fact label="History read" value={formatNumber(counts.complete)} />
            {counts.failed > 0 && <Fact label="Failed" value={formatNumber(counts.failed)} />}
          </dl>
        )}

        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line">
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-3.5 py-2.5">
            <SearchInput size="sm" value={search} onChange={setSearch} placeholder="Search repository, branch or client id…" className="w-full min-w-0 sm:max-w-xs" />
            {platforms.length > 1 && (
              <SegmentedControl
                label="Platform"
                options={[{ value: '', label: 'All' }, ...platforms.map((p) => ({ value: p, label: PLATFORMS[p].label }))]}
                value={platform}
                onChange={setPlatform}
              />
            )}
            <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={load} className="ml-auto">
              Refresh
            </Button>
          </div>

          {error && !repos ? (
            <div className="p-4">
              <ErrorState error={error} onRetry={load} compact title="The repositories could not be read" />
            </div>
          ) : !repos ? (
            <ul className="divide-y divide-line" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="px-4 py-4">
                  <div className="h-4 w-48 animate-pulse rounded bg-surface-3" />
                  <div className="mt-2 h-3 w-72 animate-pulse rounded bg-surface-3" />
                </li>
              ))}
            </ul>
          ) : visible.length === 0 ? (
            repos.length === 0 ? (
              <ClearState
                compact
                title="No repositories scanned yet"
                description="A repository appears here after the scanner's first scan of it - within an hour of turning on code scanning for it."
              />
            ) : (
              <EmptyState compact icon={Radar} title="No repository matches" description="Clear the search or platform to see every repository." />
            )
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((repo) => (
                <RepositoryRow key={`${repo.platform}|${repo.client_id}|${repo.repository}`} repo={repo} onStart={onStart} onOpenHistory={onOpenHistory} />
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Branches are listed once the scanner has scanned them (within an hour of their first push). A walk reads every commit, so a
          long history can take 30 minutes or more.
        </p>
      </div>
    </Drawer>
  );
}

/** A branch's latest walk; the default branch also shows a walk requested without choosing branches. */
function branchScan(repo, branch) {
  if (branch.deep_scan) return branch.deep_scan;
  if (branch.default && repo.deep_scan) return repo.deep_scan;
  return null;
}

/** The dropdown: the scanner guide's options (Default branch, All branches, each branch). */
function branchOptions(repo) {
  const named = repo.branches.filter((b) => b.name);
  const options = [{ key: 'default', value: 'default', label: `Default branch${repo.default_branch ? ` (${repo.default_branch})` : ''}` }];
  if (named.length > 1) options.push({ key: 'all', value: 'all', label: `All branches (${named.length})` });
  for (const b of named) {
    if (b.default) continue;
    options.push({ key: `b:${b.name}`, value: [b.name], label: b.name });
  }
  return options;
}

function RepositoryRow({ repo, onStart, onOpenHistory }) {
  const { lock } = useAccess();
  const platform = platformMeta(repo.platform);
  const options = useMemo(() => branchOptions(repo), [repo]);
  const [choice, setChoice] = useState('default');
  const [pending, setPending] = useState(false);
  const selected = options.find((o) => o.key === choice) ?? options[0];
  const chosen = selected.value === 'default' ? repo.branches.filter((b) => b.default) : selected.value === 'all' ? repo.branches : repo.branches.filter((b) => selected.value.includes(b.name));
  const allRunning = chosen.length > 0 && chosen.every((b) => branchScan(repo, b)?.status === 'running');

  const start = async () => {
    setPending(true);
    try {
      await onStart(repo, selected);
    } finally {
      setPending(false);
    }
  };

  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-[13.5px] font-semibold text-ink" title={repo.repository}>
              {repo.repository}
            </p>
            <Tag tone={platform.tone} size="sm">
              {platform.label}
            </Tag>
          </div>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            <span className="font-mono">{repo.client_id}</span>
            {' · '}
            {repo.findings > 0 ? `${formatNumber(repo.findings)} secret${repo.findings === 1 ? '' : 's'} in the code` : 'No secret in the code'}
            {repo.deep_findings > 0 && ` · ${formatNumber(repo.deep_findings)} found in history`}
            {repo.last_scanned_at && ` · last scanned ${formatRelative(repo.last_scanned_at)}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Select
            size="sm"
            aria-label={`Branches to walk in ${repo.repository}`}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
            options={options.map((o) => ({ value: o.key, label: o.label }))}
            className="w-52"
          />
          <Button
            variant="primary"
            size="sm"
            icon={allRunning ? undefined : Play}
            onClick={start}
            loading={pending}
            disabled={allRunning || pending}
            locked={allRunning ? undefined : lock('exposure.deepScan')}
            title={allRunning ? 'Already walking; this panel follows it' : undefined}
          >
            {allRunning ? 'Walking…' : 'Scan history'}
          </Button>
        </div>
      </div>

      <ul className="mt-2.5 flex flex-col gap-1.5">
        {repo.branches.map((b) => (
          <BranchLine key={b.name || '(default)'} repo={repo} branch={b} onOpenHistory={onOpenHistory} />
        ))}
      </ul>
    </li>
  );
}

function BranchLine({ repo, branch, onOpenHistory }) {
  const scan = branchScan(repo, branch);
  const meta = deepScanStateMeta(scan?.status);
  const name = branch.name || 'default branch';
  return (
    <li className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
        <GitBranch aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
        <span className="min-w-0 truncate font-mono text-ink" title={name}>
          {name}
        </span>
        {branch.default && (
          <Tag tone="neutral" size="sm">
            Default
          </Tag>
        )}
        <span className="text-ink-3" title={branch.last_scanned_at ? formatDateTime(branch.last_scanned_at) : undefined}>
          {branch.last_scanned_at ? `Scanned ${formatRelative(branch.last_scanned_at)}` : 'Not scanned yet'}
          {branch.pending_commit_id ? ' · a scan is in progress' : ''}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Tag tone={meta.tone} size="sm" dot={meta.tone !== 'neutral'}>
            {scan?.status === 'running' ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="deep-scan-pulse" />
                History: {meta.label.toLowerCase()}
              </span>
            ) : scan ? (
              `History: ${meta.label.toLowerCase()}`
            ) : (
              'History not read'
            )}
          </Tag>
          {branch.deep_findings > 0 && onOpenHistory && (
            <Button
              variant="ghost"
              size="sm"
              icon={History}
              onClick={() => onOpenHistory({ repository: repo.repository, branch: branch.name, platform: repo.platform })}
            >
              {formatNumber(branch.deep_findings)} in history
            </Button>
          )}
        </span>
      </div>
      {scan?.status === 'complete' && (
        <p className="mt-1 flex items-start gap-1.5 pl-5 text-[11.5px] text-ink-2">
          <CheckCircle2 aria-hidden="true" className="mt-px size-3 shrink-0 text-low" />
          {Number.isFinite(scan.commits_scanned) ? `${formatNumber(scan.commits_scanned)} commits read` : 'History read'}
          {scan.completed_at ? ` ${formatRelative(scan.completed_at)}` : ''}
          {Number.isFinite(scan.findings) ? ` · ${scan.findings === 0 ? 'no secret anywhere in it' : `${formatNumber(scan.findings)} secret${scan.findings === 1 ? '' : 's'} found`}` : ''}.
        </p>
      )}
      {scan?.status === 'running' && <RunningNote status={scan} />}
      {scan?.status === 'failed' && <FailureNote status={{ ...scan, platform: repo.platform }} />}
    </li>
  );
}

function RunningNote({ status }) {
  const startedAt = parseDate(status?.requested_at);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);
  const minutes = startedAt ? Math.max(0, Math.floor((now - startedAt.getTime()) / 60000)) : null;
  return (
    <p className="mt-1 pl-5 text-[11.5px] text-ink-2" role="status">
      {minutes === null ? 'Reading the history now.' : minutes < 1 ? 'Started less than a minute ago.' : `Running for ${formatNumber(minutes)} minute${minutes === 1 ? '' : 's'}.`}{' '}
      You can close this panel; the walk carries on.
    </p>
  );
}

function FailureNote({ status }) {
  const failure = describeDeepScanFailure(status);
  return (
    <div className="mt-1.5 ml-5 rounded-[var(--radius-control)] border border-critical/30 bg-critical-soft p-2.5">
      <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink">
        <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0 text-critical" />
        <span>
          <span className="font-semibold">{failure.cause}</span> {failure.fix}
          {status.failed_at && <span className="text-ink-3"> Failed {formatRelative(status.failed_at)}.</span>}
        </span>
      </p>
      {failure.raw && (
        <details className="mt-1.5 pl-5">
          <summary className="cursor-pointer text-[11.5px] font-medium text-ink-2">What the scanner reported</summary>
          <pre className="mt-1 overflow-x-auto rounded-[var(--radius-control)] border border-line bg-inset p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-ink-3">
            {failure.raw}
          </pre>
        </details>
      )}
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium text-ink-2" data-numeric="">
        {value}
      </dd>
    </div>
  );
}
