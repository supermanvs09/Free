import { Viz, Win, Chip, Gl, Logo, App, cx } from './kit.jsx';

const ICMS = '#f4c76c';

/* I1. Every access checked against purpose and consent, and written into evidence. */
const ACCESS = [
  ['kyc-review@bank', 'Aadhaar · 1 record', 'KYC review', 'ok', 'Within purpose', 'postgres'],
  ['svc-reporting', 'PAN · 4,210 records', 'Regulatory report', 'ok', 'Within purpose', 'snowflake'],
  ['m.sharma', 'Phone · 18,400 records', 'Marketing export', 'crit', 'No consent for marketing', 'hubspot'],
];
const PACK = ['Records of processing', 'Consent ledger', 'Access log, linked to identities', 'Breach readiness'];
export function IcmsEvidence({ k: fk } = {}) {
  return (
    <Viz k={fk} steps={[500, 800, 800, 1000, 700, 700, 900]} hold={4000} label="Illustration: three accesses to personal data are checked against purpose and consent; a marketing export without consent is flagged, and an audit package is assembled.">
      {(k) => (
        <Win title="ICMS · Personal data access" right={<Chip tone="warn" plain>DPDPA 2023</Chip>} glow="rgb(244 199 108 / .35)">
          <div className="vz-rows">
            <div className="hd" style={{ gridTemplateColumns: '1.2fr 1.3fr 1.1fr 1fr' }}><span>Who</span><span>Data</span><span>Purpose</span><span>Check</span></div>
            {ACCESS.map((a, i) => (
              <div key={a[0]} className={cx(`s${i + 1}`, a[3] === 'crit' && k >= 4 && 'hot')} style={{ gridTemplateColumns: '1.2fr 1.3fr 1.1fr 1fr' }}>
                <span className="min-w-0 vz-mono">{a[0]}</span><span className="flex min-w-0 items-center gap-[.4em]"><Logo k={a[5]} size="1.05em" /><span className="truncate vz-t" style={{ fontWeight: 450 }}>{a[1]}</span></span><span className="truncate vz-m">{a[2]}</span>
                <span>{k >= (a[3] === 'crit' ? 4 : i + 2) ? <Chip tone={a[3]}>{a[3] === 'ok' ? 'Consent ✓' : 'Flagged'}</Chip> : <Chip tone="mute">Checking</Chip>}</span>
              </div>
            ))}
          </div>
          <div className="s4 mt-[.6em] vz-m" style={{ color: 'var(--vz-red)' }}>m.sharma · {ACCESS[2][4]}. Owner notified, export held.</div>
          <div className="s5 mt-[1em] rounded-[.9em] p-[.9em]" style={{ background: 'rgb(244 199 108 / .07)', border: '1px solid rgb(244 199 108 / .3)' }}>
            <div className="flex items-center justify-between"><span className="vz-t">Audit package · Q3</span><span className="vz-mono">{k >= 7 ? 'ready · 4 min' : 'assembling…'}</span></div>
            <ul className="mt-[.7em] grid grid-cols-2 gap-[.45em]">
              {PACK.map((p, i) => (
                <li key={p} className={cx(i < 2 ? 's6' : 's7', 'flex items-center gap-[.45em] vz-m')}><span className="inline-flex h-[1.2em] w-[1.2em] items-center justify-center rounded-full" style={{ background: 'rgb(63 217 143 / .18)', color: '#4be29a' }}><Gl g="check" className="h-[.8em] w-[.8em]" /></span><span className="truncate">{p}</span></li>
              ))}
            </ul>
          </div>
        </Win>
      )}
    </Viz>
  );
}

/* I2. Where personal data lives, including where it should not. */
export function DataMap({ k: fk } = {}) {
  const stores = [['postgres', 'core-banking-db', [['Aadhaar', 1.2], ['PAN', 0.9], ['Phone', 2.1]]], ['s3', 's3://kyc-docs', [['Aadhaar', 0.4], ['Photos', 0.4]]], ['snowflake', 'analytics', [['Phone', 3.8], ['Email', 3.1]]], ['sharepoint', 'SharePoint · Ops', [['PAN', 0.02]]]];
  return (
    <Viz k={fk} steps={[500, 600, 600, 600, 900]} hold={3800} label="Illustration: personal data is found across a core banking database, an S3 bucket, an analytics warehouse and a SharePoint folder where PAN numbers should not be.">
      {(k) => (
        <Win title="Personal data map" right={<span className="vz-m"><b className="text-white num">9.4 M</b> records</span>} glow="rgb(244 199 108 / .3)">
          <div className="space-y-[.6em]">
            {stores.map(([lg, n, cats], i) => (
              <div key={n} className={cx(`s${i + 1}`, 'flex items-center gap-[.7em] rounded-[.7em] px-[.8em] py-[.6em]')} style={{ background: i === 3 && k >= 5 ? 'rgb(255 107 93 / .08)' : 'rgb(255 255 255 / .03)', border: `1px solid ${i === 3 && k >= 5 ? 'rgb(255 107 93 / .35)' : 'rgb(160 190 230 / .09)'}` }}>
                <App k={lg} />
                <span className="w-[32%] min-w-0 truncate vz-mono">{n}</span>
                <span className="flex min-w-0 flex-wrap gap-[.35em]">{cats.map(([c, v]) => <Chip key={c} tone={i === 3 ? 'crit' : 'warn'} plain>{c} · {v >= 1 ? `${v} M` : `${Math.round(v * 1000)} K`}</Chip>)}</span>
              </div>
            ))}
          </div>
          <div className="s5 mt-[.8em] vz-m" style={{ color: 'var(--vz-red)' }}>PAN found in an operations folder with no declared purpose.</div>
        </Win>
      )}
    </Viz>
  );
}

/* I3. The 72-hour clock after a personal data breach. */
export function BreachClock({ k: fk } = {}) {
  const tasks = [['Detected and scoped', 'Hour 0–4'], ['Affected principals identified', 'Hour 6'], ['Report drafted from the evidence', 'Hour 12'], ['Board and principals notified', 'Within 72 h']];
  return (
    <Viz k={fk} steps={[500, 800, 800, 800, 900]} hold={3800} label="Illustration: after a breach, ICMS scopes affected records, identifies data principals and drafts the report well inside the 72-hour window.">
      {(k) => (
        <Win title="Breach response" right={<Chip tone="warn">72-hour window</Chip>} glow="rgb(244 199 108 / .3)">
          <div className="relative h-[.6em] rounded-full" style={{ background: 'rgb(255 255 255 / .08)' }}>
            <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000" style={{ width: `${[0, 6, 9, 17, 22, 22][k] || 22}%`, background: `linear-gradient(90deg, ${ICMS}, #ffdf9b)` }} />
            {[0, 33, 66, 100].map((x) => <span key={x} className="absolute top-full mt-[.4em] -translate-x-1/2 vz-mono" style={{ left: `${x}%`, fontSize: 'max(var(--vz-min), .72em)' }}>{Math.round((x / 100) * 72)} h</span>)}
          </div>
          <ul className="mt-[2.2em] space-y-[.55em]">
            {tasks.map((t, i) => (
              <li key={t[0]} className={cx(`s${i + 1}`, 'flex items-center gap-[.7em] rounded-[.7em] px-[.8em] py-[.55em]')} style={{ background: 'rgb(255 255 255 / .03)' }}>
                <span className="inline-flex h-[1.4em] w-[1.4em] items-center justify-center rounded-full" style={{ background: k > i ? 'rgb(63 217 143 / .18)' : 'rgb(255 255 255 / .06)', color: '#4be29a' }}>{k > i && <Gl g="check" className="h-[.85em] w-[.85em]" />}</span>
                <span className="vz-t">{t[0]}</span><span className="ml-auto vz-mono">{t[1]}</span>
              </li>
            ))}
          </ul>
          <div className="s5 mt-[.8em] vz-m">Every step drawn from evidence ICMS already holds.</div>
        </Win>
      )}
    </Viz>
  );
}

/* I4. Consent ledger: a principal withdraws consent and the next read is refused. */
export function ConsentLedger({ k: fk } = {}) {
  const rows = [['KYC verification', 'Given', 'ok', '12 Jan 2025'], ['Loan servicing', 'Given', 'ok', '12 Jan 2025'], ['Marketing offers', 'Withdrawn', 'crit', 'Today, 10:42']];
  return (
    <Viz k={fk} steps={[500, 700, 700, 900, 1000, 900]} hold={3800} label="Illustration: a customer withdraws consent for marketing; a marketing system's next read of their phone number is refused while KYC access continues.">
      {(k) => (
        <Win title="Consent ledger" right={<span className="vz-mono">principal · C-20931</span>} glow="rgb(244 199 108 / .3)">
          <div className="flex items-center gap-[.8em]">
            <span className="vz-ic" style={{ color: ICMS, width: '2.6em', height: '2.6em', borderRadius: '50%' }}><Gl g="user" /></span>
            <span><span className="block vz-t">Customer C-20931</span><span className="block vz-m">3 purposes on record · mobile app</span></span>
          </div>
          <div className="mt-[1em] space-y-[.5em]">
            {rows.map((r, i) => {
              const withdrawn = r[2] === 'crit' && k >= 3;
              return (
                <div key={r[0]} className={cx(`s${i + 1}`, 'flex items-center gap-[.7em] rounded-[.7em] px-[.8em] py-[.6em]')} style={{ background: withdrawn ? 'rgb(255 107 93 / .07)' : 'rgb(255 255 255 / .03)', border: `1px solid ${withdrawn ? 'rgb(255 107 93 / .3)' : 'rgb(160 190 230 / .09)'}` }}>
                  <span className="vz-t">{r[0]}</span><span className="ml-auto vz-mono">{withdrawn ? r[3] : '12 Jan 2025'}</span>
                  <Chip tone={withdrawn ? 'crit' : 'ok'}>{withdrawn ? 'Withdrawn' : 'Given'}</Chip>
                </div>
              );
            })}
          </div>
          <div className="s5 mt-[1em] flex items-center gap-[.7em] rounded-[.8em] px-[.9em] py-[.7em]" style={{ background: 'rgb(255 107 93 / .08)', border: '1px solid rgb(255 107 93 / .3)' }}>
            <Gl g="lock" className="h-[1.2em] w-[1.2em]" style={{ color: 'var(--vz-coral)' }} />
            <span className="min-w-0"><span className="block vz-t">campaign-svc read refused</span><span className="block truncate vz-m">phone number · purpose: marketing offers</span></span>
          </div>
          <div className="s6 mt-[.7em] vz-m">KYC and loan servicing access continue as before.</div>
        </Win>
      )}
    </Viz>
  );
}

/* I5. Healthcare: who opened which patient record, and was it part of their care? */
export function PatientAccess({ k: fk } = {}) {
  const rows = [
    ['Dr. A. Menon', 'Cardiology', 'Patient 4471 · ECG report', 'Treating clinician', 'ok'],
    ['N. Joseph', 'Ward 3 nursing', 'Patient 4471 · medication chart', 'Care team', 'ok'],
    ['svc-lab-sync', 'Lab integration', 'Results for 212 patients', 'Lab results feed', 'ok'],
    ['billing-07', 'Billing desk', '1,840 records · full history', 'No care relationship', 'crit'],
  ];
  return (
    <Viz k={fk} steps={[500, 600, 600, 600, 1000, 900]} hold={3800} label="Illustration: clinicians and a lab integration open patient records within their purpose; a billing account exporting 1,840 full histories at night is flagged.">
      {(k) => (
        <Win title="Patient record access" right={<Chip tone="warn" plain>DPDPA</Chip>} glow="rgb(244 199 108 / .3)">
          <div className="vz-rows">
            <div className="hd" style={{ gridTemplateColumns: '1.1fr 1.5fr 1.05fr' }}><span>Who</span><span>Record</span><span>Purpose</span></div>
            {rows.map((r, i) => (
              <div key={r[0]} className={cx(`s${Math.min(i + 1, 4)}`, r[4] === 'crit' && k >= 5 && 'hot')} style={{ gridTemplateColumns: '1.1fr 1.5fr 1.05fr' }}>
                <span className="min-w-0"><span className={cx('block truncate vz-t', r[0].startsWith('svc') && 'mono')}>{r[0]}</span><span className="block truncate vz-m">{r[1]}</span></span>
                <span className="truncate vz-m">{r[2]}</span>
                <span>{r[4] === 'crit' && k >= 5 ? <Chip tone="crit">{r[3]}</Chip> : r[4] === 'crit' ? <Chip tone="mute">Checking</Chip> : <Chip tone="ok" plain>{r[3]}</Chip>}</span>
              </div>
            ))}
          </div>
          <div className="s5 mt-[.9em] flex items-center gap-[.7em] rounded-[.8em] px-[.9em] py-[.7em]" style={{ background: 'rgb(255 107 93 / .08)', border: '1px solid rgb(255 107 93 / .3)' }}>
            <Gl g="clock" className="h-[1.2em] w-[1.2em]" style={{ color: 'var(--vz-coral)' }} />
            <span className="min-w-0"><span className="block vz-t">Bulk export at 02:10, held</span><span className="block truncate vz-m">Privacy officer notified with the access trail</span></span>
          </div>
          <div className="s6 mt-[.7em] vz-m">Every read tied to a person or a system, and to a purpose.</div>
        </Win>
      )}
    </Viz>
  );
}
