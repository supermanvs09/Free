import { useState } from 'react';
import { Icon, cx } from '../ui.jsx';
import { AppFrame, Badge, Decision } from '../ds.jsx';
import { Logo } from '../viz/kit.jsx';

/* Zenstra AI: the agent console. Inventory, identity, a tool-call evaluator and
   the decision record. `mode` focuses the console for a capability page.
   Sample agents, owners and data. */
export const AGENTS = [
  { id: 'invoice', name: 'invoice-agent', plat: 'copilotstudio', platName: 'Copilot Studio', owner: 'P. Nair · Finance ops', task: 'Process supplier invoices and pay approved vendors',
    grant: [['ERP · invoices', 'read'], ['ERP · payments', 'create ≤ ₹50,000, known vendors'], ['Email', 'send to finance@']], mcp: ['erp-mcp (official)', 'mail-mcp (official)'], expires: '47 min',
    calls: [
      { a: 'invoices.read INV-2291', checks: [1, 1, 1, 1], d: 'allow', why: 'In task and within grant.' },
      { a: 'payments.create ₹48,000 → Mehta Interiors', checks: [1, 1, 1, 1], d: 'allow', why: 'Known vendor, under the ₹50,000 limit.' },
      { a: 'payments.create ₹4,80,000 → new vendor', checks: [1, 0, 1, 1], d: 'hold', why: 'Over the grant limit and a new vendor: sent to R. Sharma (Finance controller) for approval.' },
      { a: 'vendors.export → outside email address', checks: [0, 0, 0, 0], d: 'block', why: 'Not part of invoice processing, and the destination is outside the company.' },
    ] },
  { id: 'support', name: 'support-triage', plat: 'claude', platName: 'Claude', owner: 'A. Khan · Support', task: 'Triage customer tickets and draft replies',
    grant: [['Helpdesk', 'read, draft'], ['Orders', 'read, own customer only'], ['Refunds', 'request ≤ ₹5,000']], mcp: ['helpdesk-mcp (official)'], expires: '2 h 10 min',
    calls: [
      { a: 'tickets.read #88412', checks: [1, 1, 1, 1], d: 'allow', why: 'In task and within grant.' },
      { a: 'refunds.issue ₹12,000', checks: [1, 0, 1, 1], d: 'hold', why: 'Above the ₹5,000 refund limit: sent to the support lead.' },
      { a: 'kyc.read another customer’s documents', checks: [0, 0, 0, 1], d: 'block', why: 'Outside its task, and sensitive data about a different customer.' },
    ] },
  { id: 'release', name: 'release-bot', plat: 'cursor', platName: 'Cursor', owner: 'V. Rao · Platform', task: 'Open pull requests for dependency upgrades',
    grant: [['GitHub · payments-api', 'branch, pull request'], ['CI', 'trigger tests']], mcp: ['github-mcp (official)'], expires: '25 min',
    calls: [
      { a: 'github.create_pull_request payments-api', checks: [1, 1, 1, 1], d: 'allow', why: 'In task and within grant.' },
      { a: 'github.merge main (no review)', checks: [1, 0, 1, 1], d: 'hold', why: 'Merging to main needs a reviewer: sent to the code owner.' },
      { a: 'secrets.read prod/*', checks: [0, 0, 0, 1], d: 'block', why: 'Production secrets are outside a dependency-upgrade task.' },
    ] },
  { id: 'lead', name: 'lead-enricher', plat: 'n8n', platName: 'n8n', owner: null, task: null, shadow: true,
    grant: [['CRM', 'full access (inherited token)'], ['Web', 'any URL']], mcp: ['scraper-mcp (unofficial)'], expires: 'never',
    calls: [
      { a: 'crm.export all contacts → spreadsheet', checks: [0, 0, 0, 0], d: 'block', why: 'No owner and no declared task: quarantined until an owner is assigned.' },
    ] },
];
const CHECKS = ['In declared task', 'Within grant', 'Data sensitivity allowed', 'Destination allowed'];

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
const SEED = [
  ['10:02:11', 'invoice-agent', 'invoices.read INV-2290', 'allow', 'invoice-processing v3'],
  ['10:01:47', 'support-triage', 'tickets.read #88409', 'allow', 'support-triage v2'],
  ['09:58:03', 'lead-enricher', 'crm.read contacts', 'block', 'unowned-agent v1'],
];
function chain(rows) {
  let prev = '00000000';
  return [...rows].reverse().map((r) => { prev = hash(prev + r.join('|')); return [...r, prev]; }).reverse();
}

function Inventory({ sel, setSel, owners, assign, scanned, scan, focus }) {
  const list = AGENTS.filter((a) => !a.shadow || scanned);
  return (
    <div className={cx('min-w-0 bg-bg-2', focus && 'ring-2 ring-inset ring-brand-100')}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <p className="app-label">Agents · {list.length}</p>
        {!scanned && <button type="button" onClick={scan} className="btn btn-secondary btn-sm !h-7 !px-2 !text-[12px]"><Icon name="MagnifyingGlass" size={13} />Run discovery scan</button>}
      </div>
      <ul className="divide-y divide-line">
        {list.map((a) => {
          const owner = owners[a.id] || a.owner;
          return (
            <li key={a.id} className={cx(a.shadow && 'row-in')}>
              <button type="button" onClick={() => setSel(a.id)} aria-pressed={sel === a.id} className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors', sel === a.id ? 'bg-brand-50' : 'hover:bg-bg-1')}>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-bg-2" aria-hidden="true"><Logo k={a.plat} size="17px" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[12.5px] font-semibold text-ink">{a.name}</span><span className="block truncate t-caption">{owner || 'No owner'} · {a.platName}</span></span>
                {!owner ? <Badge tone="warn">Shadow</Badge> : <Badge tone="ok">Scoped</Badge>}
              </button>
              {a.shadow && !owner && sel === a.id && focus && <div className="px-3 pb-3"><button type="button" onClick={() => assign(a.id)} className="btn btn-primary btn-sm !h-8 w-full">Assign an owner</button></div>}
            </li>
          );
        })}
      </ul>
      {!scanned && <p className="px-3 py-2.5 t-caption">Read-only connections to Copilot Studio, Claude, Cursor, n8n and LangGraph.</p>}
    </div>
  );
}

function Identity({ a, owner, focus }) {
  return (
    <div className={cx('min-w-0 p-4', focus && 'ring-2 ring-inset ring-brand-100')}>
      <div className="flex items-center justify-between gap-2"><p className="font-mono text-[13.5px] font-semibold text-ink">{a.name}</p>{owner ? <Badge tone="ok">Owned</Badge> : <Badge tone="warn">No owner</Badge>}</div>
      <dl className="mt-3 space-y-2.5 text-[13px]">
        <div><dt className="app-label">Owner</dt><dd className="mt-0.5 text-ink">{owner || 'Not assigned'}</dd></div>
        <div><dt className="app-label">Declared task</dt><dd className="mt-0.5 text-ink">{a.task || 'None declared'}</dd></div>
        <div><dt className="app-label">Grant · expires {a.expires === 'never' ? 'never' : `in ${a.expires}`}</dt>
          <dd className="mt-1 space-y-1">{a.grant.map(([sys, act]) => <div key={sys} className="flex justify-between gap-3 rounded-[6px] bg-bg-2 px-2 py-1.5"><span className="text-ink-2">{sys}</span><span className="text-right font-medium text-ink">{act}</span></div>)}</dd>
        </div>
        <div><dt className="app-label">MCP servers</dt><dd className="mt-1 flex flex-wrap gap-1.5">{a.mcp.map((m) => <Badge key={m} tone={m.includes('unofficial') ? 'warn' : 'neutral'}>{m}</Badge>)}</dd></div>
      </dl>
    </div>
  );
}

function Evaluator({ a, owner, onDecide, focus }) {
  const [pick, setPick] = useState(null);
  const c = pick != null ? a.calls[pick] : null;
  const fire = (k) => { setPick(k); onDecide(a, a.calls[k], owner); };
  return (
    <div className={cx('min-w-0 bg-bg-2 p-4', focus && 'ring-2 ring-inset ring-brand-100')}>
      <p className="app-label">Try a tool call</p>
      <ul className="mt-2 space-y-1.5">
        {a.calls.map((x, k) => (
          <li key={x.a}><button type="button" onClick={() => fire(k)} aria-pressed={pick === k} className={cx('flex w-full items-center gap-2 rounded-[8px] border px-2.5 py-2 text-left font-mono text-[12px] transition-colors', pick === k ? 'border-brand bg-brand-50 text-ink' : 'border-line text-ink-2 hover:border-line-2 hover:text-ink')}><Icon name="Lightning" size={13} className="shrink-0 text-zen" />{x.a}</button></li>
        ))}
      </ul>
      <div className="mt-3 min-h-[150px]" aria-live="polite">
        {c ? (
          <div key={pick} className="fadein rounded-[10px] border border-line p-3">
            <ul className="space-y-1.5">{CHECKS.map((ch, i) => <li key={ch} className="flex items-center justify-between gap-2 text-[12.5px]"><span className="text-ink-2">{ch}</span>{c.checks[i] ? <Icon name="CheckCircle" size={15} weight="fill" className="text-ok" /> : <Icon name="XCircle" size={15} weight="fill" className="text-crit" />}</li>)}</ul>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5"><span className="t-caption">Decided in 6 ms</span><Decision d={c.d}>{c.d === 'hold' ? 'Held for approval' : undefined}</Decision></div>
            <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{c.why}</p>
          </div>
        ) : <p className="rounded-[10px] border border-dashed border-line-2 p-3 t-caption">Pick a call. The gateway checks it against the agent’s task, grant and your policy before it runs.</p>}
      </div>
    </div>
  );
}

function Record({ rows, focus }) {
  const [ok, setOk] = useState(false);
  return (
    <div className={cx('border-t border-line bg-bg-2', focus && 'ring-2 ring-inset ring-brand-100')}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <p className="app-label">Decision record · tamper-evident</p>
        {ok ? <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-ok"><Icon name="SealCheck" size={15} weight="fill" />Chain verified: {rows.length} entries, no gaps</span>
          : <button type="button" onClick={() => setOk(true)} className="btn btn-secondary btn-sm !h-7 !px-2 !text-[12px]"><Icon name="LinkSimple" size={13} />Verify chain</button>}
      </div>
      <div className="max-h-[230px] overflow-auto">
        <table className="dt min-w-[680px]">
          <thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Decision</th><th>Policy</th><th>Hash</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={`${r[5]}-${i}`} className={cx(i === 0 && rows.length > 3 && 'row-in')}><td className="mono">{r[0]}</td><td className="mono">{r[1]}</td><td className="mono max-w-[240px] truncate">{r[2]}</td><td><Decision d={r[3]} /></td><td>{r[4]}</td><td className="mono text-ink-3">{r[5]}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function ZenConsole({ mode = 'all', initial = 'invoice' }) {
  const [sel, setSel] = useState(initial);
  const [owners, setOwners] = useState({});
  const [scanned, setScanned] = useState(mode !== 'discovery');
  const [log, setLog] = useState(SEED);
  const a = AGENTS.find((x) => x.id === sel);
  const owner = owners[a.id] || a.owner;
  const onDecide = (ag, c, own) => {
    const now = new Date(); const t = `10:${String(3 + log.length).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const d = !own ? 'block' : c.d;
    setLog((l) => [[t, ag.name, c.a, d, ag.shadow ? 'unowned-agent v1' : `${ag.name.split('-')[0]} v3`], ...l]);
  };
  const rows = chain(log).map((r) => [r[0], r[1], r[2], r[3], r[4], r[5]]);
  return (
    <AppFrame product="zenstra" title="Zenstra AI" crumb="Agent console" status={<Badge tone="ok" dot>Gateway · in your VPC</Badge>}>
      <div className="grid lg:grid-cols-[250px_minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="border-b border-line lg:border-b-0 lg:border-r">
          <Inventory sel={sel} setSel={setSel} owners={owners} assign={(id) => setOwners({ ...owners, [id]: 'You · assigned just now' })} scanned={scanned} scan={() => { setScanned(true); setSel('lead'); }} focus={mode === 'discovery'} />
        </div>
        <div key={a.id} className="fadein border-b border-line lg:border-b-0 lg:border-r"><Identity a={a} owner={owner} focus={mode === 'identity'} /></div>
        <div key={`e-${a.id}`} className="fadein"><Evaluator a={a} owner={owner} onDecide={onDecide} focus={mode === 'enforce'} /></div>
      </div>
      <Record rows={rows} focus={mode === 'record'} />
    </AppFrame>
  );
}

