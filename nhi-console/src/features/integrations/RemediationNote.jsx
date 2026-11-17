import { Bot, ChevronRight, Zap } from 'lucide-react';
import { fetchRemediationAccounts } from '../../lib/api/remediation';
import { useQuery } from '../../lib/hooks/useQuery';
import { Tag } from '../../ui/Tag';

/*
 * On the AWS tab: where One-click and auto-remediation stand per account, and
 * the way in - each account's Remediation tab holds the role, the checks and
 * the policies to put in place.
 */
export function RemediationNote({ accounts, onOpen }) {
  const q = useQuery((signal) => fetchRemediationAccounts(signal), []);
  const rows = q.data ?? [];
  if (!rows.length) return null;
  const oneClick = rows.filter((a) => a.enabled).length;
  const auto = rows.filter((a) => a.autoEnabled).length;
  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface p-4 shadow-[var(--t-shadow-sm)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-[14.5px] font-semibold text-ink">One-click and auto-remediation</h2>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">
            The platform can fix a finding for you - after approval, through a role you create in each account (NHIPlatformRemediator) - and the rule engine can
            draft fixes after each scan. Open an account’s <b>Remediation</b> tab for how each works, the access checks and the exact policies.
          </p>
        </div>
        <div className="flex gap-2">
          <Tag tone="brand" size="sm" icon={Zap}>
            One-click on {oneClick} of {rows.length}
          </Tag>
          <Tag tone="low" size="sm" icon={Bot}>
            Auto on {auto} of {rows.length}
          </Tag>
        </div>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((a) => {
          const known = accounts.find((x) => x.accountId === a.accountId);
          return (
            <li key={a.accountId}>
              <button
                type="button"
                onClick={() => onOpen(a.accountId)}
                disabled={!known}
                className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-line px-3 py-2 text-left transition-colors hover:border-brand/50 disabled:opacity-60"
              >
                <span className="min-w-0">
                  <span className="block font-mono text-[12.5px] font-semibold text-ink">{a.accountId}</span>
                  <span className="block text-[11.5px] text-ink-3">
                    {a.account_name ?? ''} · One-click {a.enabled ? 'on' : 'off'} · Auto {a.autoEnabled ? 'on' : 'off'}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
