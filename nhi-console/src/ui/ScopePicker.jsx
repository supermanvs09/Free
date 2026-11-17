import { ProviderIcon, providerLabel } from './ProviderIcon';

/**
 * Application first, then account: the account list only offers accounts of
 * the chosen application, and changing the application clears an account
 * that does not belong to it.
 */
export function ScopePicker({ accounts = [], provider, accountId, onChange }) {
  const providers = [...new Set(accounts.map((a) => a.provider))];
  const shown = provider ? accounts.filter((a) => a.provider === provider) : accounts;
  const field = 'mt-1 w-full rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none';
  return (
    <div className="flex flex-col gap-2.5">
      <label className="block">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
          {provider && <ProviderIcon provider={provider} size={12} decorative />}
          Application
        </span>
        <select
          className={field}
          value={provider ?? ''}
          onChange={(event) => {
            const next = event.target.value || null;
            const keep = accountId && accounts.some((a) => a.account_id === accountId && a.provider === next);
            onChange({ provider: next, accountId: next && keep ? accountId : null });
          }}
        >
          <option value="">All applications</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {providerLabel(p) || p}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">Account</span>
        <select
          className={field}
          value={accountId ?? ''}
          disabled={!provider}
          title={provider ? undefined : 'Choose an application first'}
          onChange={(event) => onChange({ provider, accountId: event.target.value || null })}
        >
          <option value="">{provider ? `All ${providerLabel(provider) || provider} accounts` : 'Choose an application first'}</option>
          {shown.map((a) => (
            <option key={a.account_id} value={a.account_id}>
              {a.account_name ? `${a.account_name} · ${a.account_id}` : a.account_id}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
