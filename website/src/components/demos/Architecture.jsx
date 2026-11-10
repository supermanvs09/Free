import { Icon, cx } from '../ui.jsx';
import ProductMark from '../ProductMark.jsx';
import { Logo as AppLogo } from '../viz/kit.jsx';

/* How the products sit in a customer's environment: read from the sources you
   already run, decide in the middle, act through the tools you already use.
   Drawn to the deployment model on the product pages (read-only connectors,
   one read-only role per AWS account, a Zenstra gateway inside your VPC). */
const COLS = [
  {
    title: 'Your identity sources', note: 'Read-only connectors',
    rows: [['okta', 'Okta, Entra ID, Active Directory'], ['aws', 'AWS (one read-only role per account)'], ['m365', 'Microsoft 365, Google, Salesforce'], ['android', 'Banking app SDK (mobile and web)'], ['claude', 'AI agent platforms and MCP servers'], ['postgres', 'Stores holding personal data']],
  },
  {
    title: 'Deep Algorithms', note: 'Runs in your environment or ours',
    products: [['adapid', 'adapID AI', 'Baseline, risk score and reasons for people, machine identities and customers'], ['zenstra', 'Zenstra AI', 'A gateway in your VPC checks each agent action against its task'], ['icms', 'ICMS Compliance Suite', 'Every access to personal data checked against purpose and consent']],
  },
  {
    title: 'Your response', note: 'Through the tools you already run',
    rows: [['okta', 'Step-up or hold through your IdP'], ['splunk', 'Alerts and cases to your SOC'], ['slack', 'Approvals to named owners'], ['jira', 'Fixes ticketed to owners'], [null, 'Evidence for auditors and regulators']],
  },
];

export default function Architecture({ compact }) {
  return (
    <figure className="m-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_28px_minmax(0,1.15fr)_28px_minmax(0,1fr)] lg:items-stretch">
        {COLS.map((c, i) => (
          <div key={c.title} className="contents">
            {i > 0 && (
              <div aria-hidden="true" className="flex items-center justify-center text-ink-4 max-lg:py-1">
                <Icon name="ArrowRight" size={20} className="max-lg:rotate-90" />
              </div>
            )}
            <div className={cx('rounded-[14px] border p-5', i === 1 ? 'border-brand-100 bg-brand-50/60' : 'border-line bg-bg-2')}>
              <p className="app-label">{c.title}</p>
              <p className="mt-1 t-caption">{c.note}</p>
              {c.rows && (
                <ul className="mt-4 space-y-2.5">
                  {c.rows.map(([k, t]) => (
                    <li key={t} className="flex items-center gap-3 text-[14px] text-ink-2">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-bg-2">{k ? <AppLogo k={k} size="16px" /> : <Icon name="ClipboardText" size={16} />}</span>
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {c.products && (
                <ul className="mt-4 space-y-3">
                  {c.products.map(([k, n, d]) => (
                    <li key={k} className="flex gap-3 rounded-[10px] border border-line bg-bg-2 p-3.5">
                      <ProductMark p={k} size={30} />
                      <span><span className="block text-[14.5px] font-semibold text-ink">{n}</span>{!compact && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{d}</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
