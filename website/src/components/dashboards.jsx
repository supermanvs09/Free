import { Area, Av, Bar, Brand, Btn, Card, Donut, Fit, Ico, Kpis, Pill, Window } from './Dash.jsx';

/* The product screens, one per product, with sample data. Each panel is its
   own component so a page can show it close up next to the copy about it. */

/* ───────── adapID · Continuous Identity Risk Management ───────── */
const RISKY = [
  ['Ananya Rao', 'Finance · Mumbai', 91, 'Impossible travel, new device', 'Step-up sent', 'crit', '#ef4444'],
  ['svc-payroll-sync', 'Service account', 84, 'Token used from a new subnet', 'Session held', 'crit', '#64748b'],
  ['Vikram Mehta', 'IT admin', 72, '6 MFA prompts rejected', 'Watching', 'warn', '#f59e0b'],
  ['Neha Kulkarni', 'Treasury', 58, 'Bulk export at 02:14', 'Watching', 'warn', '#8b5cf6'],
  ['Arjun Iyer', 'Engineering', 31, 'New repository access', 'Normal', 'ok', '#10b981'],
];
export const CirmRiskTable = () => (
  <Card title="Riskiest identities" meta="Every point has a reason">
    <table className="db-table">
      <thead><tr><th>Identity</th><th>Risk</th><th>Top reason</th><th>Response</th></tr></thead>
      <tbody>{RISKY.map(([n, s, r, why, act, tone, c]) => (
        <tr key={n}><td><span className="db-who"><Av n={n} c={c} /><span><b>{n}</b><em>{s}</em></span></span></td><td><span className="db-score"><b className={tone}>{r}</b><Bar v={r} tone={tone} /></span></td><td className="mute">{why}</td><td><Pill t={act} tone={tone} /></td></tr>
      ))}</tbody>
    </table>
  </Card>
);
export const CirmWhy = () => (
  <Card title="Why Ananya Rao scores 91" meta="Live">
    <ul className="db-why">
      {[['Sign-in from Singapore, 40 min after Mumbai', 28], ['Unrecognised device and browser', 22], ['Outside usual working hours', 16], ['Opened payroll export for the first time', 14], ['Role from HR: Finance analyst', 11]].map(([t, p]) => (
        <li key={t}><span>{t}</span><b>+{p}</b></li>
      ))}
    </ul>
    <div className="db-why-f"><span>Policy: score above 80</span><Pill t="Step-up sent · 09:41" tone="crit" /></div>
  </Card>
);
export const CirmSources = () => (
  <Card title="Risk by source">
    <ul className="db-src">
      {[['entra', 'Microsoft Entra ID', 41], ['okta', 'Okta', 27], ['aws', 'AWS IAM', 18], ['google', 'Google Workspace', 9], ['github', 'GitHub', 5]].map(([k, t, v]) => (
        <li key={k}><span className="db-src-n"><Brand k={k} s={16} />{t}</span><Bar v={v * 2} /><b>{v}%</b></li>
      ))}
    </ul>
  </Card>
);
export function CirmDash() {
  return (
    <Fit>
      <Window product="adapID" nav={[['home', 'Overview'], ['users', 'Identities'], ['pulse', 'Sessions'], ['shield', 'Policies'], ['plug', 'Integrations'], ['file', 'Reports']]}
        title="Identity risk overview" sub="All identities · 12,480 monitored" actions={<><Btn t="Export" /><Btn t="New policy" solid /></>}>
        <Kpis items={[['Identities monitored', '12,480', 'People 9,612 · Machine 2,868'], ['High risk now', '37', '▼ 18% this week', 'ok'], ['Step-ups today', '214', 'Genuine users passed 97%'], ['Median time to contain', '42 s', 'Signal to action']]} />
        <div className="db-row c2">
          <Card title="High-risk identities" meta="30 days"><Area pts={[42, 46, 44, 51, 49, 58, 63, 57, 52, 49, 47, 44, 40, 41, 38, 36]} base={[30, 31, 33, 32, 34, 35, 36, 36, 35, 35, 34, 34, 33, 33, 33, 32]} labels={['1 Oct', '8 Oct', '15 Oct', '22 Oct', '30 Oct']} /></Card>
          <CirmSources />
        </div>
        <div className="db-row c3"><CirmRiskTable /><CirmWhy /></div>
      </Window>
    </Fit>
  );
}

/* ───────── adapID · NHI Security for AWS ───────── */
const NHI = [
  ['role/ci-deploy-prod', 'prod-payments', 412, 2, 'Admin-like, used 2%', 'crit'],
  ['user/legacy-backup', 'prod-core', 38, 0, 'Key 611 days old, unused', 'crit'],
  ['role/lambda-orders', 'prod-core', 38, 61, 'Wildcard on S3', 'warn'],
  ['role/eks-observability', 'data-lake', 24, 88, 'Right-sized', 'ok'],
];
export const NhiFixTable = () => (
  <Card title="Fix first" meta="Checked against 90 days of CloudTrail">
    <table className="db-table">
      <thead><tr><th>Identity</th><th>Account</th><th>Granted</th><th>Used</th><th>Finding</th></tr></thead>
      <tbody>{NHI.map(([n, a, g, u, f, tone]) => (
        <tr key={n}><td className="mono"><b>{n}</b></td><td className="mute">{a}</td><td>{g}</td><td><span className="db-score"><b className={tone}>{u}%</b><Bar v={Math.max(u, 3)} tone={tone} /></span></td><td><Pill t={f} tone={tone} /></td></tr>
      ))}</tbody>
    </table>
  </Card>
);
export function NhiDash() {
  return (
    <Fit>
      <Window product="adapID" nav={[['home', 'Overview'], ['key', 'Machine identities'], ['graph', 'Access graph'], ['shield', 'Findings'], ['plug', 'AWS accounts'], ['file', 'Reports']]}
        title="Machine identities · AWS" sub="14 accounts · synced 4 min ago" actions={<Btn t="Review fixes" solid />}>
        <Kpis items={[['Machine identities', '2,318', 'Roles, users, keys, workloads'], ['Permissions unused', '71%', 'Granted, never called', 'warn'], ['Keys over 90 days', '146', '12 in production', 'crit'], ['Without an owner', '58', '▼ 41 since connect', 'ok']]} />
        <div className="db-row c2r">
          <Card title="Granted vs used"><div className="db-center"><Donut v={29} label="29%" sub="of permissions used" /></div><p className="db-note">1,642 permissions can be removed without breaking a call.</p></Card>
          <Card title="By identity type">
            <ul className="db-src">
              {[['IAM roles', 1520, 66], ['IAM users with keys', 312, 14], ['Workload identities (EKS)', 344, 15], ['Lambda execution roles', 142, 6]].map(([t, n, v]) => (
                <li key={t}><span className="db-src-n"><Brand k="aws" s={18} />{t}</span><Bar v={v} /><b>{n.toLocaleString('en-IN')}</b></li>
              ))}
            </ul>
          </Card>
        </div>
        <NhiFixTable />
      </Window>
    </Fit>
  );
}

/* ───────── adapID · Identity Fraud Prevention ───────── */
const HOLDS = [
  ['TXN-88213', '₹ 95,000', 'Payment scam', ['Call in progress', 'Pasted account', 'New payee'], 72, 'warn'],
  ['TXN-88207', '₹ 2,40,000', 'Account takeover', ['New device', 'Typing mismatch'], 88, 'crit'],
  ['TXN-88190', '₹ 18,500', 'Mule payee', ['Payee on mule list'], 81, 'crit'],
];
export const FraudQueue = () => (
  <Card title="Held for review" meta="Each with its reasons">
    <table className="db-table">
      <thead><tr><th>Payment</th><th>Type</th><th>Reasons</th><th>Score</th></tr></thead>
      <tbody>{HOLDS.map(([id, amt, ty, why, sc, tone]) => (
        <tr key={id}><td><b className="mono">{id}</b><em>{amt}</em></td><td><Pill t={ty} tone={tone} /></td><td><span className="db-chips">{why.map((w) => <Pill key={w} t={w} />)}</span></td><td><b className={tone}>{sc}</b></td></tr>
      ))}</tbody>
    </table>
  </Card>
);
export function FraudDash() {
  const B = [[62, 8, 3], [70, 9, 4], [66, 11, 3], [74, 9, 5], [80, 12, 6], [77, 10, 4], [85, 13, 5], [90, 12, 7], [84, 11, 5], [79, 9, 4], [72, 8, 3], [68, 7, 3]];
  return (
    <Fit>
      <Window product="adapID" nav={[['home', 'Overview'], ['pulse', 'Live sessions'], ['card', 'Payments'], ['users', 'Cases'], ['shield', 'Rules'], ['file', 'Reports']]}
        title="Fraud operations" sub="Mobile, internet banking and UPI" actions={<Btn t="Open case queue" solid />}>
        <Kpis items={[['Sessions scored today', '4.2M'], ['Payments held', '312', '₹ 3.8 Cr protected', 'ok'], ['Median decision', '63 ms', 'In the channel'], ['Customers stepped up', '0.4%', 'Everyone else: no extra step']]} />
        <div className="db-row c2">
          <Card title="Decisions by hour" meta={<><i className="lg a" />Allow <i className="lg s" />Step-up <i className="lg h" />Hold</>}>
            <div className="db-stack">{B.map(([a, s, h], i) => <span key={i}><i className="h" style={{ height: `${h}%` }} /><i className="s" style={{ height: `${s}%` }} /><i className="a" style={{ height: `${a - 20}%` }} /></span>)}</div>
          </Card>
          <Card title="Scam risk, last payment"><div className="db-center"><Donut v={72} color="#d97706" label="72" sub="Hold · 63 ms" /></div></Card>
        </div>
        <FraudQueue />
      </Window>
    </Fit>
  );
}

/* ───────── adapID · Active Directory Security ───────── */
export const AdGraph = () => {
  const N = [['u', 60, 70, 'j.sharma', 'User'], ['g', 200, 40, 'Helpdesk', 'Group'], ['g', 200, 140, 'IT-Support', 'Group'], ['s', 350, 70, 'SRV-APP07', 'Server'], ['s', 350, 160, 'svc-sql', 'Service account'], ['t', 500, 110, 'Domain Admins', 'Tier 0']];
  const E = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]];
  const hot = (a, b) => (a === 0 && b === 1) || (a === 1 && b === 3) || (a === 3 && b === 5);
  return (
    <Card title="Shortest path to Tier 0" meta="3 hops">
      <svg className="db-graph" viewBox="0 0 560 210">
        {E.map(([a, b]) => { const [, x1, y1] = N[a], [, x2, y2] = N[b]; return <path key={`${a}${b}`} d={`M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`} className={hot(a, b) ? 'hot' : ''} />; })}
        {N.map(([k, x, y, t, s]) => (
          <g key={t} className={`n ${k}`} transform={`translate(${x} ${y})`}><circle r={k === 't' ? 16 : 12} /><text y={k === 't' ? 33 : 29} textAnchor="middle">{t}</text><text y={k === 't' ? 46 : 42} textAnchor="middle" className="s">{s}</text></g>
        ))}
      </svg>
      <div className="db-fix"><Ico n="check" s={14} w={2.4} /><span><b>Fix:</b> remove Helpdesk’s local admin on SRV-APP07</span><Pill t="Closes 38 paths" tone="ok" /></div>
    </Card>
  );
};
export const AdDetections = () => (
  <Card title="Detections" meta="Last 24 hours">
    <ul className="db-feed">
      {[['DCSync from WS-0417', 'Replication rights used by a workstation', 'Contained', 'crit', '09:41'], ['Kerberoasting burst', '41 service tickets in 30 s', 'Account locked', 'crit', '08:12'], ['Pass-the-hash', 'NTLM reuse on SRV-FILE02', 'Session killed', 'crit', '03:55'], ['GPO edit outside window', 'Default Domain Policy', 'Rolled back', 'warn', 'Yesterday'], ['New Domain Admins member', 'Approved by r.iyer', 'Approved', 'ok', 'Yesterday']].map(([a, b, r, tone, t]) => (
        <li key={a}><i className={`dot ${tone}`} /><span><b>{a}</b><em>{b}</em></span><Pill t={r} tone={tone} /><time>{t}</time></li>
      ))}
    </ul>
  </Card>
);
export function AdDash() {
  return (
    <Fit>
      <Window product="adapID" nav={[['home', 'Overview'], ['graph', 'Attack paths'], ['shield', 'Detections'], ['users', 'Privileged accounts'], ['file', 'Assessments']]}
        title="Active Directory · corp.bank.local" sub="3 domains · 18,402 objects · read-only" actions={<><Btn t="Run assessment" /><Btn t="Fix list" solid /></>}>
        <Kpis items={[['Paths to Domain Admins', '23', '▼ 61 after 3 fixes', 'ok'], ['Kerberoastable accounts', '41', '9 with admin rights', 'warn'], ['Stale privileged accounts', '12', 'No sign-in for 90 days'], ['Attacks contained', '3', 'Last 24 hours', 'ok']]} />
        <div className="db-row c2"><AdGraph /><AdDetections /></div>
      </Window>
    </Fit>
  );
}

/* ───────── ICMS · PII classification ───────── */
const CLASS = [
  ['core_banking', 'customers.aadhaar_no', 'Aadhaar', '99.4%', 'Masked', 'ok'],
  ['core_banking', 'customers.pan', 'PAN', '99.1%', 'Masked', 'ok'],
  ['crm', 'contacts.mobile', 'Phone number', '97.8%', 'Owner review', 'warn'],
  ['s3://data-lake', 'exports/2026-10/kyc.csv', 'Aadhaar, PAN', '98.6%', 'Misplaced', 'crit'],
  ['his', 'patients.diagnosis', 'Health record', '96.2%', 'Tokenised', 'ok'],
];
export const IcmsTable = () => (
  <Card title="Classification results" meta="Live scan · 38 stores">
    <table className="db-table">
      <thead><tr><th>Store</th><th>Location</th><th>Detected</th><th>Confidence</th><th>Status</th></tr></thead>
      <tbody>{CLASS.map(([s, l, d, c, st, tone]) => (
        <tr key={l}><td><span className="db-src-n"><Ico n="db" s={14} />{s}</span></td><td className="mono mute">{l}</td><td><Pill t={d} tone="blue" /></td><td>{c}</td><td><Pill t={st} tone={tone} /></td></tr>
      ))}</tbody>
    </table>
  </Card>
);
export const IcmsTypes = () => (
  <Card title="Personal data by type" meta="Records">
    <ul className="db-src">
      {[['Aadhaar number', 1840000, 92], ['PAN', 1620000, 81], ['Mobile number', 2210000, 100], ['Bank account number', 940000, 47], ['Health record', 410000, 21], ['Email address', 260000, 13]].map(([t, n, v]) => (
        <li key={t}><span className="db-src-n"><i className="db-sq" />{t}</span><Bar v={v} /><b>{(n / 100000).toFixed(1)} L</b></li>
      ))}
    </ul>
  </Card>
);
export const IcmsRecord = () => (
  <Card title="Record preview" meta="As an analyst sees it">
    <dl className="db-rec">
      <dt>Name</dt><dd>Priya S••••••</dd>
      <dt>Aadhaar</dt><dd className="mono">XXXX XXXX 4821 <Pill t="Masked" tone="ok" /></dd>
      <dt>PAN</dt><dd className="mono">ABCPS••••K <Pill t="Masked" tone="ok" /></dd>
      <dt>Mobile</dt><dd className="mono">+91 98••• ••210</dd>
      <dt>Consent</dt><dd><Pill t="KYC, servicing" tone="blue" /> until 12 Mar 2027</dd>
    </dl>
  </Card>
);
export function IcmsDash() {
  return (
    <Fit>
      <Window product="ICMS" mark="icms" nav={[['home', 'Overview'], ['db', 'Data discovery'], ['file', 'Classification'], ['users', 'Consent'], ['shield', 'Breach response'], ['check', 'Audit evidence']]} active={2}
        title="PII classification" sub="38 data stores · last full scan 2 h ago" actions={<><Btn t="Rescan" /><Btn t="Export evidence" solid /></>}>
        <Kpis items={[['Data stores scanned', '38', 'Databases, buckets, drives'], ['Personal data records', '72.8 L', 'Aadhaar, PAN, phone, health'], ['Masked or tokenised', '94%', '▲ 12% this month', 'ok'], ['Outside approved place', '1,204', 'In 3 stores', 'crit']]} />
        <div className="db-row c3"><IcmsTable /><IcmsTypes /></div>
      </Window>
    </Fit>
  );
}

/* ───────── Zenstra · AI agents ───────── */
const AGENTS = [
  ['Claims copilot', 'microsoft', 'Copilot Studio', 'R. Iyer · Ops', 'Read claims, draft letters', 'Low', 'ok'],
  ['Support agent', 'claude', 'Claude', 'A. Khan · CX', 'Read tickets, refund ≤ ₹5k', 'Low', 'ok'],
  ['Treasury analyst', 'langchain', 'LangGraph', 'S. Gupta · Finance', 'Read ledgers', 'Medium', 'warn'],
  ['Invoice bot', 'n8n', 'n8n', 'No owner', 'Wildcard on finance API', 'High', 'crit'],
  ['Code assistant', 'cursor', 'Cursor', 'M. Das · Eng', 'Repo read, PR write', 'Low', 'ok'],
];
export const ZenAgents = () => (
  <Card title="Agents, owners and scope" meta="86 discovered">
    <table className="db-table">
      <thead><tr><th>Agent</th><th>Owner</th><th>Scope</th><th>Risk</th></tr></thead>
      <tbody>{AGENTS.map(([a, k, p, o, s, r, tone]) => (
        <tr key={a}><td><span className="db-who"><span className="db-logo"><Brand k={k} s={16} /></span><span><b>{a}</b><em>{p}</em></span></span></td><td className={o === 'No owner' ? 'crit' : 'mute'}>{o}</td><td className="mute">{s}</td><td><Pill t={r} tone={tone} /></td></tr>
      ))}</tbody>
    </table>
  </Card>
);
export const ZenApproval = () => (
  <Card title="Waiting for approval" meta="High-impact action">
    <div className="db-appr">
      <p className="db-appr-a"><span className="db-logo"><Brand k="langchain" s={16} /></span><span><b>Treasury analyst</b><em>wants to run</em></span></p>
      <p className="db-code">payments.create(amount: ₹48,00,000, to: “Vendor 2291”)</p>
      <ul><li><Ico n="check" s={13} w={2.4} />Within agent’s task: <b>no</b></li><li><Ico n="check" s={13} w={2.4} />Grant allows payments: <b>no</b></li><li><Ico n="check" s={13} w={2.4} />Owner: S. Gupta, Finance</li></ul>
      <div className="db-appr-b"><Btn t="Deny" /><Btn t="Approve once" solid /></div>
    </div>
  </Card>
);
export const ZenCalls = () => (
  <Card title="Tool calls, checked before they run" meta="Live">
    <ul className="db-feed">
      {[['refund.issue(₹4,200)', 'Support agent', 'Allowed', 'ok'], ['email.send(external)', 'Claims copilot', 'Blocked · outside task', 'crit'], ['fetch(untrusted MCP)', 'Code assistant', 'Blocked · tool changed', 'crit'], ['tickets.read(#5521)', 'Support agent', 'Allowed', 'ok']].map(([c, a, r, tone]) => (
        <li key={c}><i className={`dot ${tone}`} /><span><b className="mono">{c}</b><em>{a}</em></span><Pill t={r} tone={tone} /></li>
      ))}
    </ul>
  </Card>
);
export function ZenDash() {
  return (
    <Fit>
      <Window product="Zenstra" mark="zenstra" nav={[['home', 'Overview'], ['bot', 'Agents'], ['plug', 'MCP servers'], ['shield', 'Policies'], ['check', 'Approvals'], ['file', 'Audit log']]}
        title="AI agents · Production" sub="Gateway in your VPC · p95 decision 9 ms" actions={<Btn t="Add policy" solid />}>
        <Kpis items={[['Agents discovered', '86', 'Copilots, custom, MCP'], ['Without an owner', '4', 'Assign before Friday', 'crit'], ['Tool calls checked', '1.9M', 'Last 24 hours'], ['Blocked before running', '214', 'Outside task or policy', 'ok']]} />
        <div className="db-row c3"><ZenAgents /><ZenApproval /></div>
        <ZenCalls />
      </Window>
    </Fit>
  );
}
