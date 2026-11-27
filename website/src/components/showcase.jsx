import { useState } from 'react';
import { Brand, Fit } from './Dash.jsx';
import { Reveal } from './ui.jsx';

/* Product pictures in one visual language: a vivid blue panel with frosted
   white cards floating on it, each card a real piece of the product with
   sample data. Every picture is drawn at a fixed design size and scaled as
   one image. A feature row pairs one picture with an eyebrow question, a
   light headline and one short paragraph, alternating sides. */

const P = {
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8h.01M11 12h1v5h1',
  chev: 'M6 9l6 6 6-6',
  x: 'M7 7l10 10M17 7L7 17',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  key: 'M7.5 21a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zM10.7 13.3 20 4M16.5 7.5l3 3M14 10l2 2',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm-8 9c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm10 3-5-5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  sync: 'M20 12a8 8 0 0 1-14.3 5M4 12a8 8 0 0 1 14.3-5M18 3v4h-4M6 21v-4h4',
  finger: 'M12 11v4M8.5 7.5A5 5 0 0 1 17 11v2M7 11v2a8 8 0 0 0 1.2 4.2M15.8 15.5A12 12 0 0 1 15 19M12 3a8 8 0 0 1 8 8v1M4 13v-2a8 8 0 0 1 3-6.2',
  flow: 'M5 5h5v5H5zM14 14h5v5h-5zM7.5 10v4a3 3 0 0 0 3 3H14M16.5 14v-4a3 3 0 0 0-3-3H10',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  crown: 'M4 18h16M5 15l-1-9 5 4 3-6 3 6 5-4-1 9z',
  warn: 'M12 4 2 20h20zM12 10v4M12 17h.01',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
};
export const I = ({ n, s = 16, w = 1.8, c }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke={c || 'currentColor'} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>
);

/* the blue panel every picture sits on */
export function Panel({ w = 700, h = 660, children, label, className = '' }) {
  return (
    <Fit w={w} className={`sc-fit ${className}`}>
      <div className="sc-panel" style={{ height: h }}>
        {label && <p className="sc-label">{label}</p>}
        {children}
      </div>
    </Fit>
  );
}

/* one row: copy on one side, the picture on the other */
export function Feature({ id, eyebrow, title, lead, bullets, children, flip }) {
  return (
    <section className={`sc-row${flip ? ' flip' : ''}`} aria-labelledby={id}>
      <div className="wrap sc-grid">
        <Reveal className="sc-copy">
          {eyebrow && <p className="sc-eyebrow">{eyebrow}</p>}
          <h2 id={id} className="sc-title">{title}</h2>
          {lead && <p className="sc-lead">{lead}</p>}
          {bullets && <ul className="sc-bullets">{bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
        </Reveal>
        <Reveal className="sc-pic">{children}</Reveal>
      </div>
    </section>
  );
}

const Bar = ({ v }) => <span className="sc-bar"><i style={{ width: `${v}%` }} /></span>;
const Mark = () => <span className="sc-mark"><img src="/brand/products/zenstra.webp" alt="" /></span>;

/* ── Zenstra: where are my agents? ── */
export function AgentsFound() {
  return (
    <Panel>
      <div className="sc-card" style={{ left: 380, top: 52, width: 260, padding: '22px 24px' }}>
        <p className="sc-count"><span className="sc-hex"><I n="cube" s={20} c="#fff" /></span>86 AI agents</p>
      </div>
      <div className="sc-card fade" style={{ left: 44, top: 128, width: 420 }}>
        <p className="sc-h">Agents by platform</p>
        {[['microsoft', 'Copilot Studio', 34], ['claude', 'Claude', 22], ['cursor', 'Cursor', 18], ['githubcopilot', 'GitHub Copilot', 12]].map(([k, t, n]) => (
          <p key={t} className="sc-stat"><Brand k={k} s={15} /><span>{t}</span><Bar v={n * 2.8} /><b>{n}</b></p>
        ))}
      </div>
      <div className="sc-card fade" style={{ left: 226, top: 318, width: 430 }}>
        <p className="sc-h">Agents by MCP server</p>
        {[['googledrive', 'Google Drive', 28], ['github', 'GitHub', 21], ['jira', 'Jira', 12]].map(([k, t, n]) => (
          <p key={t} className="sc-stat"><Brand k={k} s={15} /><span>{t}</span><Bar v={n * 3.4} /><b>{n}</b></p>
        ))}
      </div>
      <div className="sc-card fade" style={{ left: 44, top: 464, width: 300 }}>
        <p className="sc-h">Owned agents</p>
        <p className="sc-own"><span className="sc-tick"><I n="check" s={11} w={3} c="#fff" /></span>82% have a named owner</p>
        <span className="sc-prog"><i style={{ width: '82%' }} /></span>
      </div>
    </Panel>
  );
}

/* ── Zenstra: what can they do? ── */
export function AgentsDirectory() {
  const rows = [['Claims Copilot', 'Group', 'Ops-Admins'], ['Support Agent', '', 'R. Iyer, A. Khan'], ['Treasury Analyst', '', 'S. Gupta'], ['Invoice Bot', '', 'Unassigned']];
  return (
    <Panel>
      <div className="sc-card sc-app fade" style={{ left: 54, top: 80, width: 592, height: 470 }}>
        <aside className="sc-side">
          <p className="sc-brand"><img src="/brand/products/zenstra.webp" alt="" />Zenstra</p>
          <p className="sc-dim">Admin</p>
          <i className="sc-ph" />
          <p className="sc-grp">Inventory <I n="chev" s={10} /></p>
          <p className="sc-nav">Copilots</p>
          <p className="sc-nav on">AI agents</p>
          <i className="sc-ph" /><i className="sc-ph" /><i className="sc-ph" /><i className="sc-ph" />
        </aside>
        <div className="sc-app-main">
          <div className="sc-app-top"><b>AI agents</b><span className="sc-btn blue">Assign owner</span></div>
          <table className="sc-tbl">
            <thead><tr><th>Name</th><th>Status</th><th>Owner</th></tr></thead>
            <tbody>{rows.map(([n, g, o], i) => (
              <tr key={n} className={i > 1 ? 'blur' : ''}><td className="lnk">{n}</td><td><span className="sc-tag ok">Active</span></td><td className="lnk">{g && <em>{g}</em>}{g ? <><I n="gear" s={12} /> {o}</> : o}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div className="sc-acts" style={{ left: 440, top: 384 }}>
        <span><I n="shield" s={15} />Review access</span>
        <span><I n="gear" s={15} />Scope connections</span>
        <span><I n="check" s={15} />Remediate</span>
      </div>
    </Panel>
  );
}

/* ── Zenstra: what are they doing? ── */
export function AgentGateway() {
  return (
    <Panel>
      <div className="sc-card fade" style={{ left: 44, top: 52, width: 612, height: 470, padding: '34px 30px' }}>
        <p className="sc-over">Zenstra gateway</p>
        <p className="sc-big">Finance tools <span className="sc-tag ok">Active</span></p>
        <p className="sc-tabs"><b>Configuration</b><span>Recent activity</span></p>
        <div className="sc-cfg">
          <ul>
            {['Profile', 'AI agents', 'Tool connections', 'Tool policies'].map((t, i) => <li key={t} className={i === 1 ? 'on' : ''}>{t}<I n="check" s={14} w={2.2} /></li>)}
          </ul>
          <div>
            <p className="sc-h2">AI agents</p>
            <div className="sc-flow"><span><I n="cube" s={22} c="#0a6dbb" />AI agent</span><I n="arrow" s={16} c="#475569" /><span><img src="/brand/products/zenstra.webp" alt="" />Zenstra gateway</span></div>
            <p className="sc-p">Add the agents allowed to call these finance tools.</p>
            <p className="sc-h2">Allowed agents</p>
            <p className="sc-select"><span className="sc-chip"><Brand k="claude" s={12} />Claude <I n="x" s={10} w={2.4} /></span><I n="chev" s={14} /></p>
          </div>
        </div>
      </div>
      <div className="sc-card glass" style={{ left: 190, top: 470, width: 466, padding: '22px 26px' }}>
        <p className="sc-note"><span className="sc-i">i</span><b>Client configuration needed</b></p>
        <p className="sc-note-p">Route agent requests through the Zenstra gateway.</p>
      </div>
    </Panel>
  );
}

/* ── Zenstra: how do I respond? ── */
export function AgentKill() {
  return (
    <Panel>
      <div className="sc-card fade" style={{ left: 50, top: 80, width: 600, height: 400, padding: '32px 34px' }}>
        <p className="sc-over">AI agents</p>
        <p className="sc-big" style={{ marginTop: 6 }}>Invoice Bot</p>
        <p className="sc-dim2">Managed status <I n="info" s={14} /></p>
        <span className="sc-tag bad lg">Inactive</span>
        <hr className="sc-hr" />
        <dl className="sc-dl"><dt>Name<code>agentName</code></dt><dd>Invoice Bot</dd><dt>Description<code>agentDescription</code></dt><dd>Matches supplier invoices to purchase orders in SAP</dd></dl>
      </div>
      <div className="sc-menu" style={{ left: 420, top: 120 }}><p>Actions <I n="chev" s={14} /></p><b>Deactivate</b></div>
      <div className="sc-toast blue" style={{ left: 230, top: 440 }}><span className="sc-tick w"><I n="check" s={14} w={3} c="#0a6dbb" /></span>AI agent deactivated</div>
      <div className="sc-toast" style={{ left: 230, top: 528 }}><span className="sc-i">i</span>Revoking 6 credentials</div>
    </Panel>
  );
}

/* ── adapID: the risk engine ── */
export function RiskEngine() {
  const at = [[350, 150, 'sync'], [560, 360, 'search'], [350, 570, 'sync'], [140, 360, 'lock']];
  return (
    <Panel label="Risk engine">
      <svg className="sc-ring" viewBox="0 0 700 660"><circle cx="350" cy="360" r="210" /><path d="M120 572 H600" /><path d="M590 572l10 0-8-5M590 572l10 0-8 5" /></svg>
      {at.map(([x, y, n], i) => (
        <span key={i} className="sc-node" style={{ left: x - 44, top: y - 44 }}><I n={i === 1 ? 'search' : i === 3 ? 'lock' : i === 0 ? 'cube' : 'sync'} s={26} c="#0a6dbb" w={1.6} /></span>
      ))}
      <div className="sc-core"><I n="shield" s={44} c="#0f172a" w={1.4} /><p>Continuous risk<br />assessment</p></div>
    </Panel>
  );
}

/* ── adapID: adaptive responses ── */
export function ThreatResponses() {
  const out = [['finger', 'Step-up MFA', 170], ['x', 'Kill session', 360], ['flow', 'Workflow', 550]];
  return (
    <Panel label="Adaptive responses">
      <svg className="sc-lines" viewBox="0 0 700 660">
        <path d="M330 360 H400" /><path d="M400 170 V550" />
        {out.map(([, , y]) => <path key={y} d={`M400 ${y} H468`} />)}
        {out.map(([, , y]) => <path key={`a${y}`} d={`M460 ${y - 5} l8 5 -8 5`} />)}
      </svg>
      <div className="sc-pill" style={{ left: 110, top: 330 }}>Identity risk signal</div>
      {out.map(([ic, t, y]) => (
        <div key={t} className="sc-tile" style={{ left: 484, top: y - 54 }}><span /><span /><div><I n={ic} s={30} c="#0a6dbb" w={1.6} /><p>{t}</p></div></div>
      ))}
    </Panel>
  );
}

/* ── adapID: posture overview over a photograph ── */
export function CirmOverview() {
  const src = [['entra', 'Entra ID'], ['okta', 'Okta'], ['google', 'Google'], ['aws', 'AWS'], ['github', 'GitHub'], ['microsoft', 'Microsoft 365']];
  return (
    <Fit w={1240} className="sc-fit">
      <div className="sc-ov">
        <img className="sc-ov-photo" src="/img/photos/p-analyst.webp" alt="" />
        <div className="sc-ov-dash">
          <aside className="sc-ov-rail"><img src="/brand/products/adapid.webp" alt="" />{['search', 'shield', 'user', 'key'].map((n, i) => <span key={n} className={i === 2 ? 'on' : ''}><I n={n} s={14} /></span>)}</aside>
          <div className="sc-ov-main">
            <div className="sc-ov-top"><span className="sc-ov-search"><I n="search" s={12} />Search…</span><span className="sc-ov-me">a.rao@yourbank.in</span></div>
            <div className="sc-ov-head"><b>Overview</b><span className="sc-sync"><I n="check" s={11} />Last sync: 1 h ago</span>{src.map(([k]) => <span key={k} className="sc-src"><Brand k={k} s={14} /><i /></span>)}<span className="sc-ov-range">Last month <I n="chev" s={11} /></span><span className="sc-ov-rep"><I n="ext" s={12} />Executive report</span></div>
            <p className="sc-ov-k">Inventory</p>
            <div className="sc-ov-inv">{[['user', 'People', '9,612'], ['key', 'Accounts', '41K'], ['cube', 'Machine identities', '2,868'], ['crown', 'Admins', '152'], ['user', 'Groups & roles', '534'], ['gear', 'Apps', '571']].map(([n, t, v]) => <span key={t}><i><I n={n} s={12} c="#fff" /></i>{t}<b>{v}</b></span>)}</div>
            <p className="sc-ov-k">Risk status</p>
            <div className="sc-ov-risk">{[['finger', 'MFA', '64 of 120'], ['lock', 'Least privilege', '127 of 320'], ['shield', 'Password hygiene', '127 of 240'], ['cube', 'Machine identities', '127 of 240']].map(([n, t, v]) => <span key={t}><i><I n={n} s={20} c="#e11d48" /></i><b>{t}<em>{v} <small>(−3)</small></em></b><I n="chev" s={14} /></span>)}</div>
            <p className="sc-ov-k">Trends & top risks</p>
            <div className="sc-ov-tr">
              <div className="sc-ov-c"><p className="sc-ov-ch"><I n="shield" s={12} c="#16a34a" />MFA protection</p>
                <div className="sc-ov-d"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="46" stroke="#e5e7eb" strokeWidth="14" fill="none" /><circle cx="60" cy="60" r="46" stroke="#22c55e" strokeWidth="14" fill="none" pathLength="100" strokeDasharray="84 100" transform="rotate(-90 60 60)" /><circle cx="60" cy="60" r="46" stroke="#f97316" strokeWidth="14" fill="none" pathLength="100" strokeDasharray="6 100" strokeDashoffset="-84" transform="rotate(-90 60 60)" /><circle cx="60" cy="60" r="46" stroke="#facc15" strokeWidth="14" fill="none" pathLength="100" strokeDasharray="4 100" strokeDashoffset="-91" transform="rotate(-90 60 60)" /></svg><p><b>84%</b><span>Protected</span></p></div>
                <ul>{[['Unprotected', '6%'], ['Pending enrolment', '3%'], ['No policy', '7%'], ['Weak MFA', '33%'], ['Strong MFA', '51%']].map(([a, b]) => <li key={a}><span>{a}</span><b>{b}</b></li>)}</ul>
              </div>
              <div className="sc-ov-c"><p className="sc-ov-ch"><I n="user" s={12} />Unused admins</p>
                <div className="sc-ov-d sm"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="46" stroke="#e5e7eb" strokeWidth="14" fill="none" /><circle cx="60" cy="60" r="46" stroke="#ef4444" strokeWidth="14" fill="none" pathLength="100" strokeDasharray="12 100" transform="rotate(-90 60 60)" /></svg><p><b>12%</b><span>Unused</span></p></div>
                <span className="sc-ov-good">6 fewer unused accounts</span>
              </div>
              <div className="sc-ov-c"><p className="sc-ov-ch c">Remediation status</p>
                <svg className="sc-ov-line" viewBox="0 0 300 120"><path d="M10 22 H290" stroke="#ef4444" strokeWidth="1.5" /><path d="M10 104 H150 L200 70 H230 L250 48 H290" stroke="#22c55e" strokeWidth="1.8" fill="none" /><path d="M10 104 H150 L200 70 H230 L250 48 H290 V110 H10Z" fill="#22c55e" opacity=".12" /></svg>
                <p className="sc-ov-leg"><i className="g" />Resolved 173 <i className="r" />Detected 349</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Fit>
  );
}

/* ── AD: three questions, one picture each ── */
function SprawlGraph() {
  return (
    <div className="sc-sg">
      <svg viewBox="0 0 560 420"><path d="M88 210 C120 210 120 90 175 90" /><path d="M88 230 C120 230 120 330 175 330" /><path d="M235 90 H330" /></svg>
      <span className="sc-sg-me" style={{ left: 22, top: 180 }}><I n="user" s={26} c="#fff" /></span><p className="sc-sg-l" style={{ left: 0, top: 254 }}>A. Sharma</p>
      <span className="sc-sg-n" style={{ left: 175, top: 60 }}><img src="/brand/mark.webp" alt="" /></span>
      <p className="sc-sg-l c" style={{ left: 140, top: 128 }}>a.sharma<em>corp.bank.local</em></p>
      <span className="sc-sg-n bad" style={{ left: 330, top: 60 }}><Brand k="entra" s={26} /></span>
      <p className="sc-sg-l c" style={{ left: 300, top: 128 }}>a.sharma<em>Entra ID</em></p>
      <span className="sc-sg-flag" style={{ left: 300, top: 36 }}><I n="warn" s={13} c="#64748b" /><I n="crown" s={13} c="#0a6dbb" /></span>
      <span className="sc-sg-tip" style={{ left: 404, top: 52 }}><I n="crown" s={13} c="#64748b" />Unused Global Admin</span>
      <span className="sc-sg-n bad" style={{ left: 175, top: 300 }}><Brand k="microsoft" s={26} /></span>
      <p className="sc-sg-l c" style={{ left: 140, top: 368 }}>a.sharma-adm<em>Domain Admins</em></p>
      <span className="sc-sg-flag" style={{ left: 146, top: 276 }}><I n="warn" s={13} c="#64748b" /><I n="crown" s={13} c="#0a6dbb" /></span>
      <span className="sc-sg-tip" style={{ left: 250, top: 296 }}><I n="crown" s={13} c="#64748b" />Hidden admin path</span>
    </div>
  );
}
function MfaGap() {
  return (
    <div className="sc-mfa">
      <div className="sc-ov-d lg"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="46" stroke="#e5e7eb" strokeWidth="12" fill="none" /><circle cx="60" cy="60" r="46" stroke="#0a6dbb" strokeWidth="12" fill="none" pathLength="100" strokeDasharray="78 100" transform="rotate(-90 60 60)" /></svg><p><b>78%</b><span>Admins on MFA</span></p></div>
      <ul>{[['svc-backup-adm', 'No MFA · Domain Admins'], ['j.rao-adm', 'SMS only · Enterprise Admins'], ['helpdesk-t2', 'No MFA · Account Operators']].map(([a, b]) => <li key={a}><I n="warn" s={14} c="#e11d48" /><span><b>{a}</b><em>{b}</em></span></li>)}</ul>
    </div>
  );
}
function Offboard() {
  return (
    <ul className="sc-off">
      {[['K. Menon', 'Left 12 Oct', 'AD account enabled', 'bad'], ['P. Nair', 'Left 2 Oct', 'Still in VPN-Users', 'bad'], ['R. Das', 'Left 28 Sep', 'Disabled, groups removed', 'ok'], ['S. Bose', 'Left 21 Sep', 'Disabled, groups removed', 'ok']].map(([n, d, s, t]) => (
        <li key={n}><span className="sc-av">{n.split(' ').map((x) => x[0]).join('')}</span><span><b>{n}</b><em>{d}</em></span><span className={`sc-tag ${t}`}>{s}</span></li>
      ))}
    </ul>
  );
}
const AD_TABS = [
  ['Control admin sprawl', 'Find shadow admin accounts and hidden paths to Domain Admins, and enforce least privilege.', SprawlGraph, 'Control admin sprawl'],
  ['Validate MFA on privileged accounts', 'See which admins can still sign in without strong MFA, and close the gap first where it matters most.', MfaGap, 'MFA on admins'],
  ['Validate offboarding', 'Catch leavers whose accounts, groups or VPN access are still live after their last day.', Offboard, 'Leaver accounts'],
];
export function AdminSprawl() {
  const [i, setI] = useState(0);
  const V = AD_TABS[i][2];
  return (
    <section className="sc-row" aria-labelledby="sprawl-h">
      <div className="wrap sc-grid">
        <Reveal className="sc-pic">
          <Fit w={720} className="sc-fit">
            <div className="sc-soft"><div className="sc-card big"><p className="sc-cardh"><span className="sc-crown"><I n="crown" s={15} c="#e11d48" /></span>{AD_TABS[i][3]}</p><div key={i} className="sc-swap"><V /></div></div></div>
          </Fit>
        </Reveal>
        <div className="sc-copy">
          <h2 id="sprawl-h" className="sr-only">Privileged access in Active Directory</h2>
          <div className="sc-acc">
            {AD_TABS.map(([t, d], k) => (
              <div key={t} className={k === i ? 'on' : ''}>
                <button type="button" aria-expanded={k === i} onClick={() => setI(k)}><span>{t}</span><i aria-hidden="true">{k === i ? '' : '+'}</i></button>
                {k === i && <p>{d}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── NHI: machine identities at scale ── */
export function NhiScale() {
  return (
    <Panel w={720} h={660}>
      <div className="sc-card fade" style={{ left: 182, top: 60, width: 290, height: 250, padding: 0 }}>
        <p className="sc-km"><span className="sc-kb"><I n="key" s={18} /><Brand k="aws" s={14} /></span><b>Access keys<em>In prod-payments</em></b></p>
        <p className="sc-kh">Name</p>
        {['AKIAYBXIR5X7JS46MF', 'AKIAQ3M2F9TZR8E21K'].map((k, i) => <p key={k} className={`sc-key${i ? ' dim' : ''}`}><I n="key" s={14} /><b>{k}<em>Access key</em></b></p>)}
      </div>
      <div className="sc-card" style={{ left: 380, top: 158, width: 300, padding: '22px 18px 14px' }}>
        <p className="sc-tab-h">Service accounts</p>
        <p className="sc-kh row"><span>Account</span><span>Status</span></p>
        {[['Rotated', 'ok'], ['Rotation due', 'blue'], ['Key 611 days old', 'bad'], ['No owner', 'dark']].map(([t, c], i) => <p key={t} className="sc-svc"><Brand k={['aws', 'github', 'aws', 'kubernetes'][i]} s={15} /><i /><span className={`sc-tag ${c}`}>{t}</span></p>)}
      </div>
      <div className="sc-card glass" style={{ left: 58, top: 352, width: 444, padding: '22px 24px' }}>
        <p className="sc-cred"><Brand k="aws" s={20} /><b>Key details</b><I n="x" s={14} /></p>
        <div className="sc-cred-g">
          <p>Identity<span>role/ci-deploy-prod <I n="ext" s={12} /></span></p>
          <p>Owner<span>platform-team <I n="copy" s={12} /></span></p>
          <p>Last used<span>3 hours ago · us-east-1</span></p>
          <p>Unused permissions<span>404 of 412</span></p>
        </div>
      </div>
    </Panel>
  );
}

/* ── three benefits with line icons ── */
const BI = {
  watch: <svg viewBox="0 0 64 64" width="64" height="64" fill="none" strokeWidth="3" strokeLinecap="round"><path d="M4 22l8-8 6 6" stroke="#1597e5" /><path d="M46 8l-8 8" stroke="#1597e5" /><circle cx="30" cy="34" r="12" stroke="currentColor" /><path d="M39 43l9 9" stroke="currentColor" /><path d="M24 33l5 4 7-7" stroke="#1597e5" /></svg>,
  route: <svg viewBox="0 0 64 64" width="64" height="64" fill="none" strokeWidth="3" strokeLinecap="round"><path d="M6 10h30a8 8 0 0 1 0 16H18a8 8 0 0 0 0 16h30" stroke="#1597e5" /><path d="M44 36l6 6-6 6" stroke="#1597e5" /><path d="M20 12l8 8M28 12l-8 8" stroke="currentColor" /><circle cx="30" cy="34" r="5" stroke="currentColor" /></svg>,
  hub: <svg viewBox="0 0 64 64" width="64" height="64" fill="none" strokeWidth="3" strokeLinecap="round"><circle cx="32" cy="32" r="8" stroke="currentColor" />{[[32, 8], [32, 56], [10, 20], [54, 20], [10, 44], [54, 44]].map(([x, y]) => <g key={`${x}${y}`}><path d={`M32 32 L${x} ${y}`} stroke="#1597e5" strokeDasharray="2 5" /><circle cx={x} cy={y} r="3.5" fill="#1597e5" stroke="none" /></g>)}</svg>,
};
export function Benefits({ title, lead, items }) {
  return (
    <section className="sc-ben" aria-labelledby="ben-h">
      <div className="wrap">
        <h2 id="ben-h" className="sc-title">{title}</h2>
        {lead && <p className="sc-lead">{lead}</p>}
        <ul>{items.map(([ic, h, p], i) => <Reveal as="li" key={h} delay={i * 80}><span className="sc-ben-i">{BI[ic]}</span><h3>{h}</h3><p>{p}</p></Reveal>)}</ul>
      </div>
    </section>
  );
}

/* a centred heading over a wide picture */
export function Wide({ id, eyebrow, title, lead, children }) {
  return (
    <section className="sc-row" aria-labelledby={id}>
      <div className="wrap">
        <Reveal className="sc-wide-h">
          {eyebrow && <p className="sc-eyebrow">{eyebrow}</p>}
          <h2 id={id} className="sc-title">{title}</h2>
          {lead && <p className="sc-lead">{lead}</p>}
        </Reveal>
        <Reveal className="mt-14">{children}</Reveal>
      </div>
    </section>
  );
}

/* ── AI-driven threats, stopped at the identity ── */
const THREATS = [
  ['phone', 'Deepfake voice call to the helpdesk', 'Password reset for A. Rao', 'Reset held', 'bad'],
  ['mail', 'AI-written phishing, MFA prompt bombing', 'V. Mehta · IT admin', 'Session revoked', 'bad'],
  ['key', 'Leaked access key used by a bot', 'svc-payments-prod', 'Key disabled', 'bad'],
  ['sync', 'Session token replayed from a new device', 'N. Kulkarni · Treasury', 'Stepped up', 'warn'],
  ['cube', 'Agent asked to export customer data', 'Claims copilot', 'Blocked', 'bad'],
];
const TI = {
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
};
export function AiThreats() {
  return (
    <Panel w={720} h={660}>
      <div className="sc-card" style={{ left: 40, top: 56, width: 640, padding: '24px 26px 10px' }}>
        <p className="sc-th"><b>AI-driven threats</b><span>Last 24 hours</span><span className="sc-th-n">1,284 stopped</span></p>
        <ul className="sc-tl">
          {THREATS.map(([ic, t, who, act, tone], i) => (
            <li key={t} className={i > 3 ? 'blur' : ''}>
              <span className="sc-ti"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={TI[ic] || P[ic]} /></svg></span>
              <span className="sc-tt"><b>{t}</b><em>{who}</em></span>
              <span className={`sc-tag ${tone}`}>{act}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sc-toast blue" style={{ left: 230, top: 470, width: 450 }}><span className="sc-tick w"><I n="check" s={14} w={3} c="#0a6dbb" /></span>Voice clone detected, reset held</div>
      <div className="sc-toast" style={{ left: 230, top: 560, width: 450 }}><span className="sc-i">i</span>Owner verified on a trusted device</div>
    </Panel>
  );
}

/* ── Posture at a glance: a photograph with floating cards ── */
export function PostureGlance() {
  const sev = [['Critical', 6, '#dc2626'], ['High', 41, '#f97316'], ['Medium', 128, '#facc15'], ['Low', 302, '#94a3b8']];
  return (
    <Fit w={1240} className="sc-fit">
      <div className="pg">
        <img className="pg-photo" src="/img/photos/p-glance.webp" alt="" />
        <div className="pg-card pg-sev">
          <p className="pg-h">Open issues by severity <span>This week</span></p>
          <div className="pg-legend">{sev.map(([t, n, c]) => <span key={t}><i style={{ background: c }} />{t} <b>{n}</b></span>)}</div>
          <div className="pg-bar">{sev.map(([t, n, c]) => <i key={t} style={{ flex: n, background: c }} />)}</div>
        </div>
        <div className="pg-card pg-mfa">
          <p className="pg-h">MFA coverage</p>
          <div className="pg-donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="46" stroke="#e5e7eb" strokeWidth="12" fill="none" /><circle cx="60" cy="60" r="46" stroke="url(#pgg)" strokeWidth="12" fill="none" strokeLinecap="round" pathLength="100" strokeDasharray="88 100" transform="rotate(-90 60 60)" /><defs><linearGradient id="pgg"><stop offset="0" stopColor="#0a6dbb" /><stop offset="1" stopColor="#5cc0ff" /></linearGradient></defs></svg><p><b>88%</b><span>Strong MFA</span></p></div>
        </div>
        <div className="pg-card pg-src">
          <p className="pg-h">Sources</p>
          <div className="pg-srcs">{['entra', 'okta', 'aws', 'google', 'github'].map((k) => <span key={k}><Brand k={k} s={16} /><i /></span>)}</div>
        </div>
        <span className="pg-lock"><I n="lock" s={22} c="#0a6dbb" /></span>
      </div>
    </Fit>
  );
}

/* ── One person, every account they hold ── */
export function IdentityGraph() {
  const acc = [
    ['entra', 'a.rao@bank.in', 'Entra ID', 70, null],
    ['aws', 'arao-admin', 'AWS · prod-payments', 170, 'Admin, unused 94 days'],
    ['github', 'arao', 'GitHub · org owner', 270, null],
    ['google', 'a.rao@bank.in', 'Google Workspace', 370, 'No MFA'],
    ['microsoft', 'RAO-A', 'Active Directory', 470, 'Kerberoastable SPN'],
  ];
  return (
    <Panel w={720} h={660} label="Identity analysis">
      <div className="sc-card ig" style={{ left: 40, top: 92, width: 640, height: 520, padding: 0 }}>
        <svg className="ig-lines" viewBox="0 0 640 520">{acc.map(([, , , y]) => <path key={y} d={`M118 270 C 190 270 190 ${y} 262 ${y}`} />)}</svg>
        <span className="ig-me"><I n="user" s={30} c="#fff" /></span>
        <p className="ig-me-l">A. Rao<em>Finance · Mumbai</em></p>
        {acc.map(([k, id, where, y, risk]) => (
          <div key={where} className="ig-acc" style={{ top: y - 32 }}>
            <span className={`ig-ic${risk ? ' bad' : ''}`}><Brand k={k} s={22} /></span>
            <span className="ig-t"><b>{id}</b><em>{where}</em></span>
            {risk && <span className="ig-risk"><I n="warn" s={13} c="#dc2626" />{risk}</span>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ── Every machine identity, in one inventory ── */
export function NhiInventory() {
  const rows = [
    ['aws', 'role/ci-deploy-prod', 'IAM role', 'Admin-like', '2 h ago', 'ok'],
    ['github', 'deploy-bot', 'GitHub app', 'Repo write', '1 day ago', 'ok'],
    ['aws', 'user/legacy-backup', 'Access key', 'S3 full', '214 days', 'bad'],
    ['kubernetes', 'sa/payments-api', 'Workload', 'Secrets read', '5 min ago', 'ok'],
    ['google', 'svc-reports@bank', 'Service account', 'Owner', 'Never', 'bad'],
  ];
  return (
    <Panel w={720} h={660}>
      <div className="sc-card fade" style={{ left: 36, top: 70, width: 648, padding: '22px 22px 6px' }}>
        <p className="sc-th"><span className="nv-ic"><I n="key" s={18} c="#0a6dbb" /></span><b>Machine identities</b><span className="sc-th-n">2,318</span></p>
        <table className="nv">
          <thead><tr><th>Identity</th><th>Type</th><th>Privilege</th><th>Last used</th></tr></thead>
          <tbody>{rows.map(([k, n, t, p, u, tone]) => (
            <tr key={n}><td><span className="nv-n"><Brand k={k} s={15} /><b>{n}</b></span></td><td>{t}</td><td>{p}</td><td className={tone === 'bad' ? 'bad' : ''}>{u}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <div className="nv-chip" style={{ left: 420, top: 452 }}><I n="warn" s={15} c="#dc2626" />2 dormant keys found</div>
      <div className="nv-chip" style={{ left: 300, top: 512 }}><I n="user" s={15} c="#0a6dbb" />Owner assigned: platform-team</div>
      <div className="nv-chip solid" style={{ left: 440, top: 572 }}><I n="sync" s={15} c="#fff" />Rotate key</div>
    </Panel>
  );
}

/* ── Signals from the whole stack, feeding one risk engine ── */
export function SignalsPipeline() {
  const src = [['Voice and helpdesk', 'phone', 110, 470], ['Email security', 'mail', 230, 560], ['EDR', 'shield', 360, 590], ['Device management', 'lock', 490, 560], ['SaaS and cloud logs', 'search', 610, 470]];
  return (
    <Panel w={720} h={660} label="AI threat signals">
      <svg className="sc-lines" viewBox="0 0 720 660">{src.map(([, , x, y]) => <path key={x} d={`M${x} ${y - 40} C ${x} ${y - 140} 360 ${y - 140} 360 300`} />)}</svg>
      <div className="sp-core"><span><img src="/brand/products/adapid.webp" alt="" /></span><p>adapID risk engine</p></div>
      {src.map(([t, ic, x, y]) => (
        <div key={t} className="sp-src" style={{ left: x - 46, top: y - 46 }}><span><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#0a6dbb" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={TI[ic] || P[ic]} /></svg></span><p>{t}</p></div>
      ))}
      <div className="sp-out"><I n="check" s={14} w={3} c="#fff" />Deepfake reset attempt · held</div>
    </Panel>
  );
}
