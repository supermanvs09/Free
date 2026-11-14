import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { formatNumber } from '../../lib/format';
import { PROVIDERS, ProviderIcon } from '../../ui/ProviderIcon';

const NOUN = { aws: 'AWS', azure: 'Azure', jenkins: 'Jenkins', vault: 'Vault' };

/** Where the identities come from: one tile per connected source, each opening its slice of Discovery. */
export function SourceStrip({ sources }) {
  const rows = (sources ?? []).filter((s) => s.value > 0 && PROVIDERS[s.key]);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, s) => sum + s.value, 0);
  return (
    <section aria-label="Identities by source" className="animate-rise rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--t-shadow-sm)]" data-stagger="" style={{ '--stagger': 2 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Identities by source</h2>
        <Link to="/integrations" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
          Manage sources <ArrowRight aria-hidden="true" className="size-3" />
        </Link>
      </div>
      <ul className="grid divide-line sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
        {rows.map((s) => (
          <li key={s.key} className="border-line max-sm:border-b max-sm:last:border-0">
            <Link to={`/identities?provider=${s.key}`} className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2/70">
              <ProviderIcon provider={s.key} size={18} tile />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span data-numeric="" className="text-[18px] leading-tight font-semibold text-ink">
                    {formatNumber(s.value)}
                  </span>
                  <span className="text-[12px] text-ink-3">identities in {NOUN[s.key]}</span>
                </span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-track">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (s.value / total) * 100)}%`, background: PROVIDERS[s.key].color.startsWith('var') ? 'var(--t-ink-2)' : PROVIDERS[s.key].color }} />
                </span>
                <span className="mt-1 block truncate text-[11.5px] text-ink-3">
                  {formatNumber(s.credentials)} credentials{s.critical ? <span className="text-critical"> · {formatNumber(s.critical)} critical</span> : null}
                </span>
              </span>
              <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
