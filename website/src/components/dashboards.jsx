import { Bar, DashWindow, Feed, Kpi, Line, Num, Pill } from './Dash.jsx';

/* One working screen per product. Each shows the one view a buyer of that
   product opens first, with sample data. */

/* adapID CIRM: the identity risk overview */
const RISKY = [
  ['Ananya Rao', 'Finance · Mumbai', 91, 'Impossible travel, new device', 'Step-up sent', 'crit'],
  ['svc-payroll-sync', 'Service account', 84, 'Used from a new subnet', 'Session held', 'crit'],
  ['Vikram Mehta', 'IT admin', 72, 'MFA prompts rejected ×6', 'Watching', 'warn'],
  ['Neha Kulkarni', 'Treasury', 58, 'Bulk export at 02:14', 'Watching', 'warn'],
];
const CIRM_FEED = [
  ['09:41:07', 'Step-up passed', 'Ananya Rao', 'ok'],
  ['09:41:02', 'Session revoked', 'svc-legacy-ftp', 'crit'],
  ['09:40:55', 'Risk 34 → 72', 'Vikram Mehta', 'warn'],
  ['09:40:31', 'New baseline learnt', '214 identities', ''],
  ['09:40:12', 'Token reuse blocked', 'svc-payroll-sync', 'crit'],
];
export function CirmDash() {
  return (
    <DashWindow product="adapID" crumb="Identity risk · All identities" rail={['grid', 'user', 'key', 'pulse', 'file']}>
      {(on) => (
        <div className="dg cirm">
          <div className="dg-kpis">
            <Kpi k="Identities scored" d="People 9,612 · Machine 2,868">{<Num to={12480} on={on} />}</Kpi>
            <Kpi k="High risk now" d="▼ 18% this week" tone="ok"><Num to={37} on={on} /></Kpi>
            <Kpi k="Sessions stepped up" d="Today"><Num to={214} on={on} /></Kpi>
            <Kpi k="Median time to contain" d="From signal to action"><Num to={42} on={on} suf=" s" /></Kpi>
          </div>
          <div className="dg-row">
            <section className="dg-card grow">
              <p className="dg-h">Risk across the estate <span>30 days</span></p>
              <Line pts={[42, 46, 44, 51, 49, 58, 63, 57, 52, 49, 47, 44, 40, 41, 38, 36]} second={[30, 31, 33, 32, 34, 35, 36, 36, 35, 35, 34, 34, 33, 33, 33, 32]} />
              <p className="dg-legend"><i className="b" />High-risk identities <i className="g" />Baseline</p>
            </section>
            <section className="dg-card feedcard">
              <p className="dg-h">Live decisions</p>
              <Feed on={on} rows={CIRM_FEED} render={([t, a, who, tone]) => <><span className="t">{t}</span><span><b className={tone}>{a}</b><em>{who}</em></span></>} />
            </section>
          </div>
          <section className="dg-card">
            <p className="dg-h">Riskiest identities <span>Reason shown for every point</span></p>
            <table className="dg-table">
              <tbody>{RISKY.map(([n, s, r, why, act, tone], i) => (
                <tr key={n}><td><b>{n}</b><em>{s}</em></td><td className="sc"><b className={tone}>{r}</b><Bar v={r} tone={tone} d={i * 120} /></td><td className="why">{why}</td><td><Pill t={act} tone={tone} /></td></tr>
              ))}</tbody>
            </table>
          </section>
        </div>
      )}
    </DashWindow>
  );
}

/* NHI Security for AWS: cloud identity posture */
const NHI = [
  ['role/ci-deploy-prod', '412 granted', 9, 'Admin-like, used 2%', 'crit'],
  ['user/legacy-backup', 'Key age 611 days', 0, 'Unused 214 days', 'crit'],
  ['role/lambda-orders', '38 granted', 61, 'Wildcard on S3', 'warn'],
  ['role/eks-observability', '24 granted', 88, 'Right-sized', 'ok'],
];
export function NhiDash() {
  return (
    <DashWindow product="adapID" crumb="NHI · AWS · 14 accounts" rail={['grid', 'key', 'shield', 'pulse', 'file']}>
      {(on) => (
        <div className="dg nhi">
          <div className="dg-kpis">
            <Kpi k="Machine identities" d="Roles, users, keys, workloads"><Num to={2318} on={on} /></Kpi>
            <Kpi k="Permissions unused" d="Granted, never called" tone="warn"><Num to={71} on={on} suf="%" /></Kpi>
            <Kpi k="Keys over 90 days" tone="crit" d="12 in production"><Num to={146} on={on} /></Kpi>
            <Kpi k="Without an owner" d="▼ 41 since connect" tone="ok"><Num to={58} on={on} /></Kpi>
          </div>
          <div className="dg-row">
            <section className="dg-card donut">
              <p className="dg-h">Granted vs used</p>
              <div className="dg-donut">
                <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" className="trk" /><circle cx="60" cy="60" r="48" className="arc" pathLength="100" style={{ '--v': 29 }} /></svg>
                <p><b><Num to={29} on={on} suf="%" /></b><span>of permissions used</span></p>
              </div>
            </section>
            <section className="dg-card grow">
              <p className="dg-h">Key age by account <span>days since rotation</span></p>
              <div className="dg-heat">
                {['prod-payments', 'prod-core', 'data-lake', 'staging', 'sandbox'].map((a, r) => (
                  <p key={a}><span>{a}</span>{Array.from({ length: 14 }, (_, c) => { const v = (r * 37 + c * 53) % 100; return <i key={c} className={v > 82 ? 'h3' : v > 60 ? 'h2' : v > 30 ? 'h1' : ''} style={{ transitionDelay: `${(r * 14 + c) * 12}ms` }} />; })}</p>
                ))}
              </div>
            </section>
          </div>
          <section className="dg-card">
            <p className="dg-h">Fix first <span>Checked against 90 days of CloudTrail</span></p>
            <table className="dg-table">
              <tbody>{NHI.map(([n, g, u, why, tone], i) => (
                <tr key={n}><td className="mono"><b>{n}</b><em>{g}</em></td><td className="sc"><b className={tone}>{u}%</b><Bar v={Math.max(u, 3)} tone={tone} d={i * 120} /></td><td className="why">{why}</td><td><Pill t={tone === 'ok' ? 'No change' : 'Review fix'} tone={tone} /></td></tr>
              ))}</tbody>
            </table>
          </section>
        </div>
      )}
    </DashWindow>
  );
}

/* Identity Fraud Prevention: fraud operations */
const HOLDS = [
  ['TXN-88213', '₹ 95,000', 'Scam: KYC refund', ['Call in progress', 'Pasted account', 'New payee'], 72, 'warn'],
  ['TXN-88207', '₹ 2,40,000', 'Account takeover', ['New device', 'Typing mismatch'], 88, 'crit'],
  ['TXN-88190', '₹ 18,500', 'Mule payee', ['Payee on mule list'], 81, 'crit'],
];
const BARS = [[62, 8, 3], [70, 9, 4], [66, 11, 3], [74, 9, 5], [80, 12, 6], [77, 10, 4], [85, 13, 5], [90, 12, 7], [84, 11, 5], [79, 9, 4], [72, 8, 3], [68, 7, 3]];
export function FraudDash() {
  return (
    <DashWindow product="adapID" crumb="Fraud operations · Mobile, web, UPI" rail={['grid', 'pulse', 'shield', 'user', 'file']}>
      {(on) => (
        <div className="dg fraud">
          <div className="dg-kpis">
            <Kpi k="Sessions scored today"><Num to={4.2} dec={1} on={on} suf="M" /></Kpi>
            <Kpi k="Payments held" d="₹ 3.8 Cr protected" tone="ok"><Num to={312} on={on} /></Kpi>
            <Kpi k="Median decision" d="In the channel"><Num to={63} on={on} suf=" ms" /></Kpi>
            <Kpi k="Customers stepped up" d="Everyone else: no extra step"><Num to={0.4} dec={1} on={on} suf="%" /></Kpi>
          </div>
          <div className="dg-row">
            <section className="dg-card grow">
              <p className="dg-h">Decisions by hour <span><i className="lg a" />Allow <i className="lg s" />Step-up <i className="lg h" />Hold</span></p>
              <div className="dg-stack">
                {BARS.map(([a, s, h], i) => (
                  <span key={i} style={{ transitionDelay: `${i * 50}ms` }}><i className="h" style={{ height: `${h}%` }} /><i className="s" style={{ height: `${s}%` }} /><i className="a" style={{ height: `${a - 20}%` }} /></span>
                ))}
              </div>
            </section>
            <section className="dg-card gauge">
              <p className="dg-h">Scam risk, last payment</p>
              <div className="dg-donut amber">
                <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" className="trk" /><circle cx="60" cy="60" r="48" className="arc" pathLength="100" style={{ '--v': 72 }} /></svg>
                <p><b><Num to={72} on={on} /></b><span>Hold · 63 ms</span></p>
              </div>
            </section>
          </div>
          <section className="dg-card">
            <p className="dg-h">Held for review <span>Each with its reasons</span></p>
            <table className="dg-table">
              <tbody>{HOLDS.map(([id, amt, type, why, sc, tone]) => (
                <tr key={id}><td className="mono"><b>{id}</b><em>{amt}</em></td><td><b className={`ty ${tone}`}>{type}</b></td><td className="chips">{why.map((w) => <Pill key={w} t={w} />)}</td><td className="sc r"><b className={tone}>{sc}</b></td></tr>
              ))}</tbody>
            </table>
          </section>
        </div>
      )}
    </DashWindow>
  );
}

/* Active Directory Security: attack paths to Tier 0 */
const AD_FEED = [
  ['DCSync from WS-0417', 'Contained', 'crit'],
  ['Kerberoast burst · 41 SPNs', 'Account locked', 'crit'],
  ['Pass-the-hash · SRV-FILE02', 'Session killed', 'crit'],
  ['GPO edit outside window', 'Rolled back', 'warn'],
  ['New member of Domain Admins', 'Approved', 'ok'],
];
export function AdDash() {
  const N = [
    ['u', 70, 70, 'j.sharma', 'User'], ['g', 210, 40, 'Helpdesk', 'Group'], ['g', 210, 130, 'IT-Support', 'Group'],
    ['s', 360, 70, 'SRV-APP07', 'Server'], ['s', 360, 160, 'svc-sql', 'Service acct'], ['t', 510, 110, 'Domain Admins', 'Tier 0'],
  ];
  const E = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]];
  return (
    <DashWindow product="adapID" crumb="Active Directory · corp.bank.local" rail={['grid', 'shield', 'user', 'pulse', 'file']}>
      {(on) => (
        <div className="dg ad">
          <div className="dg-kpis">
            <Kpi k="Paths to Domain Admins" tone="ok" d="▼ 61 after 3 fixes"><Num to={23} on={on} /></Kpi>
            <Kpi k="Kerberoastable accounts" tone="warn"><Num to={41} on={on} /></Kpi>
            <Kpi k="Stale privileged accounts"><Num to={12} on={on} /></Kpi>
            <Kpi k="Attacks contained" d="Last 24 hours" tone="ok"><Num to={3} on={on} /></Kpi>
          </div>
          <div className="dg-row">
            <section className="dg-card grow">
              <p className="dg-h">Shortest path to Tier 0 <span>Fix: remove Helpdesk → SRV-APP07 · closes 38 paths</span></p>
              <svg className="dg-graph" viewBox="0 0 580 200">
                {E.map(([a, b], i) => { const [, x1, y1] = N[a], [, x2, y2] = N[b]; const hot = (a === 0 && b === 1) || (a === 1 && b === 3) || (a === 3 && b === 5); return <path key={i} d={`M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`} className={hot ? 'e hot' : 'e'} pathLength="1" style={{ transitionDelay: `${i * 160}ms` }} />; })}
                {N.map(([k, x, y, t, s], i) => (
                  <g key={t} className={`n ${k}`} style={{ transitionDelay: `${300 + i * 120}ms` }} transform={`translate(${x} ${y})`}>
                    <circle r={k === 't' ? 17 : 13} /><text y={k === 't' ? 34 : 30} textAnchor="middle">{t}</text><text y={k === 't' ? 47 : 43} textAnchor="middle" className="s">{s}</text>
                  </g>
                ))}
              </svg>
            </section>
            <section className="dg-card feedcard">
              <p className="dg-h">Live detections</p>
              <Feed on={on} rows={AD_FEED} every={2800} render={([a, r, tone]) => <><i className={`dot ${tone}`} /><span><b>{a}</b><em>{r}</em></span></>} />
            </section>
          </div>
        </div>
      )}
    </DashWindow>
  );
}

/* ICMS: PII, consent and the 72-hour clock */
const STORES = [['Core banking · Oracle', 'Aadhaar, PAN, phone', 1840000, 96], ['CRM · Salesforce', 'Phone, email, address', 920000, 88], ['Data lake · S3', 'PAN, account no.', 4310000, 61], ['Call recordings', 'Voice, phone', 210000, 74]];
export function IcmsDash() {
  return (
    <DashWindow product="ICMS" crumb="DPDPA · Data and consent" rail={['grid', 'file', 'user', 'shield', 'pulse']} live="Monitoring">
      {(on) => (
        <div className="dg icms">
          <div className="dg-kpis">
            <Kpi k="PII records found" d="Across 38 stores"><Num to={7.28} dec={2} on={on} suf="M" /></Kpi>
            <Kpi k="Covered by consent" tone="ok"><Num to={92} on={on} suf="%" /></Kpi>
            <Kpi k="Rights requests open" d="All inside SLA"><Num to={17} on={on} /></Kpi>
            <Kpi k="Audit evidence ready" d="DPDPA, RBI, SEBI" tone="ok"><Num to={100} on={on} suf="%" /></Kpi>
          </div>
          <div className="dg-row">
            <section className="dg-card grow">
              <p className="dg-h">Where personal data lives <span>Consent coverage</span></p>
              <table className="dg-table plain">
                <tbody>{STORES.map(([s, k, n, c], i) => (
                  <tr key={s}><td><b>{s}</b><em>{k}</em></td><td className="num">{n.toLocaleString('en-IN')}</td><td className="sc"><b className={c > 85 ? 'ok' : c > 70 ? 'warn' : 'crit'}>{c}%</b><Bar v={c} tone={c > 85 ? 'ok' : c > 70 ? 'warn' : 'crit'} d={i * 120} /></td></tr>
                ))}</tbody>
              </table>
            </section>
            <section className="dg-card clock">
              <p className="dg-h">Breach report clock</p>
              <div className="dg-donut">
                <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" className="trk" /><circle cx="60" cy="60" r="48" className="arc" pathLength="100" style={{ '--v': 18 }} /></svg>
                <p><b>58:42</b><span>hours left of 72</span></p>
              </div>
              <ul className="dg-checks"><li className="ok">Scope identified</li><li className="ok">Principals listed</li><li>Board notice drafted</li></ul>
            </section>
          </div>
        </div>
      )}
    </DashWindow>
  );
}

/* Zenstra: AI agents and every tool call */
const AGENTS = [['Claims copilot', 'R. Iyer · Ops', 'Read claims, draft letters', 142], ['Treasury analyst', 'S. Gupta · Finance', 'Read ledgers', 64], ['Support agent', 'A. Khan · CX', 'Read tickets, refund ≤ ₹5k', 318], ['Code assistant', 'M. Das · Eng', 'Repo read, PR write', 91]];
const CALLS = [
  ['Support agent', 'refund.issue(₹4,200)', 'Allowed', 'ok'],
  ['Claims copilot', 'email.send(external)', 'Blocked · outside task', 'crit'],
  ['Treasury analyst', 'payments.create(₹48 L)', 'Waiting for approver', 'warn'],
  ['Code assistant', 'mcp: fetch(untrusted)', 'Blocked · tool poisoning', 'crit'],
  ['Support agent', 'tickets.read(#5521)', 'Allowed', 'ok'],
];
export function ZenDash() {
  return (
    <DashWindow product="Zenstra" crumb="Agents · Production" rail={['grid', 'user', 'shield', 'pulse', 'file']}>
      {(on) => (
        <div className="dg zen">
          <div className="dg-kpis">
            <Kpi k="Agents discovered" d="Copilots, custom, MCP"><Num to={86} on={on} /></Kpi>
            <Kpi k="Tool calls checked" d="Last 24 hours"><Num to={1.9} dec={1} on={on} suf="M" /></Kpi>
            <Kpi k="Blocked before running" tone="crit"><Num to={214} on={on} /></Kpi>
            <Kpi k="Gateway decision" d="p95, inside your VPC"><Num to={9} on={on} suf=" ms" /></Kpi>
          </div>
          <div className="dg-row">
            <section className="dg-card grow">
              <p className="dg-h">Agents, owners and scope</p>
              <table className="dg-table plain">
                <tbody>{AGENTS.map(([a, o, s, n]) => (
                  <tr key={a}><td><b>{a}</b><em>{o}</em></td><td className="why">{s}</td><td className="num">{n}/min</td></tr>
                ))}</tbody>
              </table>
            </section>
            <section className="dg-card feedcard wide">
              <p className="dg-h">Every tool call, checked</p>
              <Feed on={on} rows={CALLS} every={2400} render={([a, c, r, tone]) => <><i className={`dot ${tone}`} /><span><b className="mono">{c}</b><em>{a} · <span className={tone}>{r}</span></em></span></>} />
            </section>
          </div>
        </div>
      )}
    </DashWindow>
  );
}
