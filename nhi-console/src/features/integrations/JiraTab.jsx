import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, Info, UserRound } from 'lucide-react';
import { fetchJiraIssues } from '../../lib/api/response';
import { useQuery } from '../../lib/hooks/useQuery';
import { formatRelative } from '../../lib/format';
import { severityMeta } from '../../lib/domain';
import { Panel } from '../../ui/Panel';
import { ProviderIcon } from '../../ui/ProviderIcon';
import { ListSkeleton } from '../../ui/Skeleton';
import { SegmentedControl } from '../../ui/Tabs';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { RequiredAccess } from './RequiredAccess';

/*
 * Jira: the project findings and remediation plans are tracked in, who each
 * ticket is assigned to (the identity's owner), and where it stands.
 */

const STATUS_TONE = { 'To Do': 'neutral', 'In Progress': 'brand', 'In Review': 'medium', Done: 'low' };
const RULES = [
  { when: 'Critical or High finding', then: 'Ticket in NHI, assigned to the identity’s owner' },
  { when: 'Identity has no owner', then: 'Assigned to the platform security on-call (Raju Varma)' },
  { when: 'Remediation plan created or approved', then: 'Comment on the ticket, link to the plan' },
  { when: 'Plan applied and the next scan confirms it', then: 'Ticket moved to Done' },
];

export function JiraTab() {
  const q = useQuery((signal) => fetchJiraIssues(signal), []);
  const [view, setView] = useState('open');
  const [expanded, setExpanded] = useState(false);
  const matching = useMemo(() => {
    const all = q.data?.issues ?? [];
    return view === 'open' ? all.filter((i) => i.status !== 'Done') : all;
  }, [q.data, view]);
  const issues = expanded ? matching : matching.slice(0, 12);
  const all = q.data?.issues ?? [];
  const byAssignee = useMemo(() => {
    const m = new Map();
    for (const i of all.filter((x) => x.status !== 'Done')) m.set(i.assignee, (m.get(i.assignee) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ProviderIcon provider="jira" size={22} tile />
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                Jira <Tag tone="low" size="sm" dot>Connected</Tag>
              </h2>
              <p className="mt-0.5 text-[12.5px] text-ink-2">
                Project <b>{q.data?.project_name ?? 'NHI Security'}</b> ({q.data?.project_key ?? 'NHI'}) on{' '}
                <span className="font-mono text-[12px]">{(q.data?.site_url ?? 'https://deepalgorithms.atlassian.net').replace('https://', '')}</span> · as nhi-bot@deepalgorithms.ai
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-right">
            <div>
              <p className="text-[11px] text-ink-3">Open tickets</p>
              <p data-numeric="" className="text-[20px] font-semibold text-ink">{all.filter((i) => i.status !== 'Done').length}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-3">Assignees</p>
              <p data-numeric="" className="text-[20px] font-semibold text-ink">{byAssignee.length}</p>
            </div>
            <div>
              <p className="text-[11px] text-ink-3">Done</p>
              <p data-numeric="" className="text-[20px] font-semibold text-low">{all.filter((i) => i.status === 'Done').length}</p>
            </div>
          </div>
        </div>
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {['Signed in with the bot’s API token', 'Project NHI reachable, issue type Task', 'Can create, assign and transition issues', 'Owners matched to Jira users by e-mail'].map((c) => (
            <li key={c} className="flex items-center gap-2 rounded-[8px] bg-surface-2/60 px-2.5 py-1.5 text-[12px] text-ink-2">
              <CheckCircle2 aria-hidden="true" className="size-3.5 text-low" /> {c}
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel flush className="overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div>
              <h3 className="text-[14px] font-semibold text-ink">Tickets</h3>
              <p className="text-[12px] text-ink-3">One per Critical or High finding the team tracks, assigned to the identity’s owner.</p>
            </div>
            <SegmentedControl label="Show" value={view} onChange={setView} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
          </header>
          {!q.data ? (
            <div className="p-5">
              <ListSkeleton rows={6} />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {issues.map((i) => (
                <li key={i.key} className="grid items-center gap-3 px-5 py-3 md:grid-cols-[90px_minmax(0,1fr)_170px_110px]">
                  <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[12.5px] font-semibold text-brand hover:underline">
                    {i.key} <ArrowUpRight aria-hidden="true" className="size-3" />
                  </a>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">{i.summary}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-ink-3">
                      <Tag tone={severityMeta(i.severity).tone} size="sm" dot>
                        {severityMeta(i.severity).label}
                      </Tag>
                      <Link to={`/remediation/findings/${encodeURIComponent(i.finding_id)}`} className="hover:text-brand hover:underline">
                        Finding
                      </Link>
                      {i.plan && <span>· plan {i.plan.status.toLowerCase().replace('_', ' ')}</span>}
                      <span>· {formatRelative(i.created_at)}</span>
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-2">
                    <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-ink-3" />
                    <span className="truncate">{i.assignee}</span>
                  </span>
                  <Tag tone={STATUS_TONE[i.status] ?? 'neutral'} size="sm" className="justify-self-start md:justify-self-end">
                    {i.status}
                  </Tag>
                </li>
              ))}
            </ul>
          )}
          {matching.length > 12 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full border-t border-line px-5 py-2.5 text-center text-[12.5px] font-medium text-brand hover:bg-surface-2/60"
            >
              {expanded ? 'Show the 12 most urgent' : `Show all ${matching.length} tickets`}
            </button>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel>
            <h3 className="text-[14px] font-semibold text-ink">Who gets what</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {byAssignee.map(([name, n]) => (
                <li key={name} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="flex items-center gap-2 text-ink-2">
                    <UserRound aria-hidden="true" className="size-3.5 text-ink-3" /> {name}
                  </span>
                  <span className="text-ink-3">{n} open</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <h3 className="text-[14px] font-semibold text-ink">Rules</h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {RULES.map((r) => (
                <li key={r.when} className="text-[12px]">
                  <span className="block font-medium text-ink">{r.when}</span>
                  <span className="block text-ink-3">→ {r.then}</span>
                </li>
              ))}
            </ul>
            <p className={cn('mt-3 flex items-start gap-1.5 rounded-[8px] bg-surface-2/60 px-2.5 py-2 text-[11.5px] text-ink-3')}>
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /> New tickets are opened by the platform’s worker; this console shows and links them.
            </p>
          </Panel>
        </div>
      </div>

      <RequiredAccess appKey="jira" />
    </div>
  );
}
