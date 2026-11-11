import { useState } from 'react';
import { Icon, cx } from '../ui.jsx';
import { AppFrame, Badge, DemoControls, Stepper } from '../ds.jsx';
import { Logo } from '../viz/kit.jsx';
import { useSteps } from '../../lib/useSteps.js';

/* ICMS: where personal data lives, and every access to it checked against
   purpose and consent. Sample data. */
const STORES = [
  { id: 'core', name: 'core-banking (PostgreSQL)', k: 'postgres', pii: [['Account numbers', '4.1M'], ['PAN', '3.8M'], ['Phone numbers', '4.0M']], risk: 'ok',
    log: [['svc-statements', 'Machine', 'Monthly statements', 'pass'], ['R. Iyer · Ops', 'Person', 'Customer service request #4471', 'pass'], ['bi-export', 'Machine', 'Marketing analytics', 'flag']] },
  { id: 's3', name: 'kyc-uploads (Amazon S3)', k: 's3', pii: [['Aadhaar copies', '1.2M'], ['Photographs', '1.2M']], risk: 'hold',
    log: [['kyc-verifier', 'Machine', 'KYC verification', 'pass'], ['vendor-ocr', 'Machine', 'KYC verification', 'pass'], ['M. Shah · Analytics', 'Person', 'None declared', 'flag']] },
  { id: 'crm', name: 'Salesforce CRM', k: 'salesforce', pii: [['Phone numbers', '860K'], ['Email addresses', '910K']], risk: 'ok',
    log: [['Sales team', 'Person', 'Account servicing', 'pass'], ['campaign-sync', 'Machine', 'Marketing (consent withdrawn for 12,410)', 'flag']] },
  { id: 'drive', name: 'Shared drives (Microsoft 365)', k: 'm365', pii: [['PAN in spreadsheets', '38K'], ['Salary data', '2.1K']], risk: 'crit',
    log: [['Finance team', 'Person', 'Payroll', 'pass'], ['Anyone with the link', 'Link', 'No purpose: public link', 'flag']] },
];

export function IcmsMap() {
  const [sel, setSel] = useState('s3');
  const s = STORES.find((x) => x.id === sel);
  return (
    <AppFrame product="icms" title="ICMS" crumb="Personal data map" status={<Badge tone="hold" dot>4 flags today</Badge>}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <ul className="divide-y divide-line bg-bg-2 lg:border-r lg:border-line">
          {STORES.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setSel(x.id)} aria-pressed={sel === x.id} className={cx('flex w-full items-start gap-3 p-3.5 text-left transition-colors', sel === x.id ? 'bg-brand-50' : 'hover:bg-bg-1')}>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-line bg-bg-2" aria-hidden="true"><Logo k={x.k} size="18px" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-ink">{x.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">{x.pii.map(([c, n]) => <Badge key={c}>{c} · {n}</Badge>)}</span>
                </span>
                <Badge tone={x.risk} dot>{x.risk === 'ok' ? 'In policy' : x.risk === 'hold' ? 'Review' : 'Exposed'}</Badge>
              </button>
            </li>
          ))}
        </ul>
        <div key={sel} className="fadein min-w-0 p-4 md:p-5">
          <p className="text-[14.5px] font-semibold text-ink">Access to {s.name}</p>
          <p className="t-caption">Every read tied to an identity and checked against its purpose and consent</p>
          <div className="mt-4 overflow-x-auto rounded-[10px] border border-line bg-bg-2">
            <table className="dt min-w-[460px]">
              <thead><tr><th>Who</th><th>Purpose</th><th>Check</th></tr></thead>
              <tbody>{s.log.map(([w, t, pur, ok]) => <tr key={w}><td><span className="block font-semibold text-ink">{w}</span><span className="t-caption">{t}</span></td><td>{pur}</td><td>{ok === 'pass' ? <Badge tone="ok" dot>Purpose and consent</Badge> : <Badge tone="crit" dot>Flagged</Badge>}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mt-3 flex gap-2 text-[13px] leading-snug text-ink-2"><Icon name="Info" size={15} className="mt-0.5 shrink-0 text-brand" />Flagged access goes to the data owner with the evidence; masking can be applied where the data should not be seen.</p>
        </div>
      </div>
    </AppFrame>
  );
}

const BREACH = [
  ['Detect', 'T + 0', 'Unusual export of 18,240 KYC records by a service account, flagged by identity risk.'],
  ['Scope', 'T + 2 h', 'Affected records and 11,902 data principals identified from the data map and access log.'],
  ['Contain', 'T + 3 h', 'Service account disabled, public links removed, the export destination blocked.'],
  ['Report', 'Within 72 h', 'Report to the Data Protection Board drafted from evidence already held, with timeline and scope.'],
  ['Notify', 'Within 72 h', 'Notices for affected data principals prepared in their language, with what happened and what to do.'],
];
export function BreachTimeline() {
  const s = useSteps(BREACH.length, { ms: 3200 });
  const [t, when, what] = BREACH[s.i];
  return (
    <div ref={s.ref} onPointerDown={s.pause}>
      <Stepper steps={BREACH.map((b) => b[0])} s={s} label="Breach response" />
      <div className="card mt-6 flex flex-wrap items-center gap-6 p-6" aria-live="polite">
        <div key={s.i} className="fadein min-w-0 flex-1">
          <p className="app-label">{when}</p>
          <p className="mt-1 t-h4">{t}</p>
          <p className="mt-1 t-body measure">{what}</p>
        </div>
        <DemoControls s={s} n={BREACH.length} label={`${s.i + 1} of ${BREACH.length}`} />
      </div>
      <p className="mt-3 t-caption">Sample incident. The 72-hour window is set by the DPDP Rules 2025.</p>
    </div>
  );
}
