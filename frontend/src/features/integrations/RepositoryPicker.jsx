import { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, FolderGit2, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { fetchCodeCommitRepos } from '../../lib/api/integrations';
import { formatNumber } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { Button } from '../../ui/Button';
import { SearchInput } from '../../ui/Field';
import { DetailSkeleton } from '../../ui/Skeleton';
import { InlineError } from '../../ui/States';
import { cn } from '../../ui/cn';

/**
 * Choose which CodeCommit repositories to scan.
 *
 * Scanning used to be all or nothing: if the role could not read one
 * repository the whole check failed. Here every repository the role can see is
 * listed with whether it can be read now; the ones that work are ready ticked,
 * the ones that don't say which permission is missing, and only what is ticked
 * is checked, scanned and kept. The rest are left out.
 */
const STATE = {
  readable: { label: 'Ready', tone: 'text-low', icon: CheckCircle2 },
  empty: { label: 'No commits yet', tone: 'text-ink-3', icon: CircleDashed },
  blocked: { label: 'Needs permission', tone: 'text-medium', icon: ShieldAlert },
  error: { label: "Couldn't check", tone: 'text-medium', icon: TriangleAlert },
  unchecked: { label: 'Checked when chosen', tone: 'text-ink-3', icon: CircleDashed },
};

const keyOf = (repo) => `${repo.region}/${repo.name}`;
/** Ready to scan as they are: readable, empty (scanned once they have code) and not yet tried. */
const usable = (repo) => repo.state === 'readable' || repo.state === 'empty' || repo.state === 'unchecked';

export function RepositoryPicker({ accountId, disabled, onApply }) {
  const [nonce, setNonce] = useState(0);
  const query = useQuery((signal) => fetchCodeCommitRepos({ accountId }, signal), [accountId, nonce], { keepPrevious: false });
  const data = query.data;
  const repos = useMemo(() => data?.repositories ?? [], [data]);
  /* null until the person changes something: then the sensible default. */
  const [picked, setPicked] = useState(null);
  const [search, setSearch] = useState('');

  const selected = useMemo(() => {
    if (picked) return picked;
    const saved = new Set((data?.selected ?? []).map(keyOf));
    const base = saved.size ? repos.filter((repo) => saved.has(keyOf(repo))) : repos.filter(usable);
    return new Set(base.map(keyOf));
  }, [picked, repos, data]);

  const toggle = (repo) => {
    const next = new Set(selected);
    if (next.has(keyOf(repo))) next.delete(keyOf(repo));
    else next.add(keyOf(repo));
    setPicked(next);
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? repos.filter((repo) => repo.name.toLowerCase().includes(q)) : repos;
  }, [repos, search]);
  const byRegion = useMemo(() => {
    const groups = new Map();
    for (const repo of shown) groups.set(repo.region, [...(groups.get(repo.region) ?? []), repo]);
    return [...groups.entries()];
  }, [shown]);

  const readyCount = repos.filter((repo) => repo.state === 'readable').length;
  const blockedCount = repos.filter((repo) => repo.state === 'blocked').length;
  const chosen = repos.filter((repo) => selected.has(keyOf(repo)));
  const leftOut = repos.length - chosen.length;

  return (
    <section className="animate-rise overflow-hidden rounded-[var(--radius-panel)] border border-line-strong bg-surface shadow-[var(--t-shadow-sm)]" aria-label="Choose repositories to scan">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-brand/25 bg-info-soft text-brand">
          <FolderGit2 aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-ink">Choose which repositories to scan</h3>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">
            {data
              ? blockedCount > 0
                ? `${formatNumber(readyCount)} of ${formatNumber(repos.length)} can be read now. Scan those, or fix the policy for the rest first. Anything you leave unticked is not scanned.`
                : `All ${formatNumber(repos.length)} can be read. Untick any you do not want scanned.`
              : 'Reading what the role can see…'}
          </p>
        </div>
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => { setPicked(null); setNonce((n) => n + 1); }} disabled={disabled || query.isLoading}>
          Check again
        </Button>
      </header>

      <div className="px-4 py-3">
        {query.isLoading && !data ? (
          <DetailSkeleton rows={4} />
        ) : query.isError && !data ? (
          <InlineError error={query.error} onRetry={query.refetch} label="Repositories could not be listed" />
        ) : repos.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-ink-3">No repositories found in this account&rsquo;s regions yet. New ones are scanned as they appear.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {repos.length > 8 && <SearchInput value={search} onChange={setSearch} placeholder="Find a repository…" size="sm" className="min-w-[12rem] flex-1" />}
              <div className="ml-auto flex items-center gap-3 text-[12px]">
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => setPicked(new Set(repos.filter(usable).map(keyOf)))} disabled={disabled}>
                  Select all ready
                </button>
                <span aria-hidden="true" className="text-ink-3">·</span>
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => setPicked(new Set())} disabled={disabled}>
                  Clear
                </button>
              </div>
            </div>

            <div className="mt-2.5 flex max-h-[22rem] flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
              {byRegion.map(([region, items]) => (
                <div key={region}>
                  <p className="mb-1 text-[10.5px] font-semibold tracking-[0.12em] text-ink-3 uppercase">
                    {region} · {formatNumber(items.length)}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {items.map((repo) => {
                      const meta = STATE[repo.state] ?? STATE.unchecked;
                      const on = selected.has(keyOf(repo));
                      return (
                        <li key={keyOf(repo)}>
                          <label
                            className={cn(
                              'flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 transition-colors',
                              on ? 'border-brand/50 bg-info-soft/40' : 'border-line hover:border-line-strong',
                              disabled && 'cursor-not-allowed opacity-70',
                            )}
                          >
                            <input type="checkbox" checked={on} onChange={() => toggle(repo)} disabled={disabled} className="mt-0.5 size-4 shrink-0 accent-[var(--t-brand)]" />
                            <span className="min-w-0 flex-1">
                              <span className="block font-mono text-[12.5px] font-medium [overflow-wrap:anywhere] text-ink">{repo.name}</span>
                              {repo.state === 'blocked' && (
                                <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">
                                  The role cannot read it yet. Add <span className="font-mono text-[11px] text-ink-2">{repo.denied.join(', ')}</span> to include it.
                                </span>
                              )}
                            </span>
                            <span className={cn('inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium', meta.tone)}>
                              <meta.icon aria-hidden="true" className="size-3.5" />
                              {meta.label}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {shown.length === 0 && <p className="py-3 text-center text-[12.5px] text-ink-3">No repository matches &ldquo;{search}&rdquo;.</p>}
            </div>
          </>
        )}
      </div>

      {data && repos.length > 0 && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-2 px-4 py-3">
          <p className="min-w-0 flex-1 text-[12px] text-ink-2" aria-live="polite">
            <span className="font-semibold text-ink">{formatNumber(chosen.length)}</span> selected
            {leftOut > 0 ? <span className="text-ink-3"> · {formatNumber(leftOut)} left out, not scanned</span> : null}
          </p>
          <Button
            variant="primary"
            icon={CheckCircle2}
            disabled={disabled || chosen.length === 0}
            onClick={() => onApply(chosen.map((repo) => ({ region: repo.region, name: repo.name })))}
          >
            {chosen.length === 0 ? 'Choose at least one' : `Scan ${formatNumber(chosen.length)} ${chosen.length === 1 ? 'repository' : 'repositories'}`}
          </Button>
        </footer>
      )}
    </section>
  );
}
