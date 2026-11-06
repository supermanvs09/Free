import { useRef } from 'react';
import { cx } from '../../lib/motion.js';
import { Logo } from './kit.jsx';
import ProductMark from '../ProductMark.jsx';
import { useBeat } from './light.jsx';

/* Four light product pictures, drawn the way identity vendors draw theirs:
   a key's lineage (NHI), the platform and what it connects to (home), the AI
   agent console (Zenstra) and the ITDR flow (AD Security). Names and numbers
   are illustrative. */

const ICO = {
  person: 'M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6',
  key: 'M8 15.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM11.6 12H20m-3 0v3m-2.4-3v2.2',
  origin: 'M4 12h11m-4-4 4 4-4 4M15 5h4v14h-4',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c.6-3 3-4.6 6-4.6s5.4 1.6 6 4.6M16 11a2.6 2.6 0 1 0 0-5.2M17.5 14.6c1.8.5 3 1.9 3.5 4.4',
  storage: 'M4 6h16v5H4zM4 13h16v5H4zM8 8.5h.01M8 15.5h.01',
  consumers: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  resources: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c.6-3 3-4.6 6-4.6s5.4 1.6 6 4.6M16 11a2.6 2.6 0 1 0 0-5.2M17.5 14.6c1.8.5 3 1.9 3.5 4.4',
};
const I = ({ k, s = 16 }) => <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true"><path d={ICO[k]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/* ── NHI: one key, from where it was made to everything it reaches ───────── */
const LCOLS = [['origin', 'Origin'], ['people', 'People'], ['storage', 'Storage'], ['consumers', 'Consumers'], ['resources', 'Resources']];
const LX = [10, 30, 50, 70, 90], LY = [16, 49, 82];
const LNODES = [
  { c: 0, r: 1, logo: 'aws', n: 'AKIA••••7Q2F', sub: 'access key · prod', brand: true },
  { c: 1, r: 0, person: true, n: 'Asha Nair', sub: 'can read it' },
  { c: 1, r: 1, person: true, n: 'Ravi Menon', sub: 'can read it' },
  { c: 1, r: 2, person: true, n: 'Kiran Rao', sub: 'created it · left in May', crit: true },
  { c: 2, r: 0, logo: 'aws', n: 'Secrets Manager', sub: 'stored', brand: true },
  { c: 2, r: 1, logo: 'vault', n: 'HashiCorp Vault', sub: 'stored', brand: true },
  { c: 2, r: 2, file: true, n: 'config/notify.env', sub: 'pasted in a repo', crit: true },
  { c: 3, r: 1, logo: 'actions', n: 'Deploy pipeline', sub: 'reads it nightly', brand: true },
  { c: 4, r: 0, logo: 'kubernetes', n: 'payments-service', sub: 'production', brand: true },
  { c: 4, r: 2, logo: 'aws', n: 's3://kyc-docs', sub: 'customer KYC files', brand: true },
];
/* links: from node, to node, label, step it appears, risky */
const LLINKS = [
  [0, 3, 'Created by', 1], [3, 4, 'Stored', 2], [3, 5, 'Stored', 2], [3, 6, 'Leaked', 3, true],
  [4, 7, 'Read by', 4], [7, 8, 'Deploys', 4], [7, 9, 'Reaches', 4],
];
const at = (i) => [LX[LNODES[i].c] * 10, LY[LNODES[i].r] * 4];
const lpath = (a, b) => {
  const [x1, y1] = at(a), [x2, y2] = at(b);
  const s = x1 + 34, e = x2 - 34, m = (s + e) / 2;
  if (y1 === y2) return `M${s} ${y1}H${e}`;
  const d = y2 > y1 ? 1 : -1, r = 10;
  return `M${s} ${y1}H${m - r}Q${m} ${y1} ${m} ${y1 + d * r}V${y2 - d * r}Q${m} ${y2} ${m + r} ${y2}H${e}`;
};

export function KeyLineage() {
  const ref = useRef(null);
  // the story builds column by column as it comes into view
  const k = useBeat(ref, 5, 900, 0, true); // a dense picture: build it once, then leave it for reading
  return (
    <figure ref={ref} className="kl" aria-label="Illustration: the lineage of one AWS access key. It was created by Kiran Rao, who left in May, stored in AWS Secrets Manager and HashiCorp Vault, and also pasted into a config file in a repository. A deploy pipeline reads it nightly and through it reaches the payments service and the customer KYC bucket. adapID recommends rotating it in Secrets Manager and assigning a new owner.">
      <div aria-hidden="true" className="kl-scroll">
        <div className="kl-inner">
          <div className="kl-cols">
            {LCOLS.map(([ic, n]) => <span key={n} className="kl-col"><I k={ic} s={14} />{n}</span>)}
          </div>
          <div className="relative" style={{ height: 400 }}>
            {LX.slice(1).map((x) => <span key={x} className="kl-rule" style={{ left: `${x - 10}%` }} />)}
            <svg viewBox="0 0 1000 400" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {LLINKS.map(([a, b, l, s, bad]) => {
                const [x1, y1] = at(a), [x2, y2] = at(b), m = (x1 + 34 + x2 - 34) / 2;
                return (
                  <g key={`${a}-${b}`} className={cx('kl-link', k >= s && 'on', bad && 'bad')}>
                    <path d={lpath(a, b)} pathLength="1" />
                    <foreignObject x={m - 40} y={(y1 + y2) / 2 - 12} width="80" height="24"><span className="kl-tag">{l}</span></foreignObject>
                  </g>
                );
              })}
            </svg>
            {LNODES.map((n, i) => {
              const lit = i === 0 || (n.c === 1 && k >= 1) || LLINKS.some(([, b, , s]) => b === i && k >= s);
              return (
                <div key={n.n} className={cx('kl-node', lit && 'on', n.crit && 'crit', n.brand && 'brand')} style={{ left: `${LX[n.c]}%`, top: `${LY[n.r]}%` }}>
                  <span className="kl-ic">{n.logo ? <Logo k={n.logo} size="22px" /> : n.file ? <I k="storage" s={20} /> : <I k="person" s={20} />}</span>
                  <b>{n.n}</b><small>{n.sub}</small>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className={cx('kl-verdict', k >= 5 && 'on')} aria-hidden="true">
        <span className="kl-dot" /><span><b>Orphaned key, reaching customer data.</b> Rotate it in Secrets Manager, remove it from config/notify.env and assign a new owner. The pipeline picks up the new key on its next run.</span>
      </div>
    </figure>
  );
}

/* ── Home: the platform at the centre of what you already run ─────────────── */
/* [logo, ring (0 inner on the disc, 1 outer), angle in degrees, AI tool] */
const COINS = [
  ['okta', 0, 200], ['entra', 0, 245], ['ad', 0, 295], ['m365', 0, 340], ['github', 0, 25], ['aws', 0, 70], ['salesforce', 0, 115], ['slack', 0, 160],
  ['gcp', 1, 185], ['azure', 1, 215], ['google', 1, 250], ['kubernetes', 1, 290], ['vault', 1, 325], ['snowflake', 1, 355],
  ['databricks', 1, 30], ['claude', 1, 62, true], ['copilot', 1, 98, true], ['gemini', 1, 130, true], ['mcp', 1, 158, true],
];
export function PlatformOrbit() {
  return (
    <figure className="po" aria-label="Illustration: Deep Algorithms at the centre of a dark platform, surrounded by the identity providers, clouds, apps and AI tools it connects to: Okta, Microsoft Entra ID, Active Directory, Microsoft 365, GitHub, AWS, Salesforce, Slack, Google Cloud, Azure, Kubernetes, HashiCorp Vault, Snowflake, Databricks and AI assistants.">
      <div aria-hidden="true" className="relative mx-auto aspect-[16/9.4] w-full max-w-[880px]">
        <svg viewBox="0 0 800 470" className="absolute inset-0 h-full w-full">
          <defs>
            <radialGradient id="po-disc" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#1a212b" /><stop offset=".55" stopColor="#11161d" /><stop offset=".8" stopColor="#11161d" stopOpacity=".85" /><stop offset="1" stopColor="#11161d" stopOpacity="0" /></radialGradient>
            <radialGradient id="po-spot" cx="50%" cy="42%" r="50%"><stop offset="0" stopColor="#00aeef" stopOpacity=".35" /><stop offset="1" stopColor="#00aeef" stopOpacity="0" /></radialGradient>
            <filter id="po-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" /><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .06 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
          </defs>
          <ellipse cx="400" cy="250" rx="300" ry="168" fill="url(#po-disc)" />
          <ellipse cx="400" cy="250" rx="300" ry="168" fill="#fff" filter="url(#po-grain)" opacity=".9" />
          <ellipse cx="400" cy="232" rx="170" ry="96" fill="url(#po-spot)" />
          <ellipse cx="400" cy="250" rx="205" ry="114" className="po-ring" />
        </svg>
        {/* the core: the Deep Algorithms mark on a clean white tile */}
        <div className="po-core"><span className="po-glow" /><span className="po-halo" /><span className="po-tile"><img src="/brand/mark.webp" alt="" width="64" height="64" /></span></div>
        {COINS.map(([k, ring, deg, ai], i) => {
          const a = (deg * Math.PI) / 180;
          const rx = ring ? 352 : 205, ry = ring ? 196 : 114;
          const x = 400 + Math.cos(a) * rx, y = 250 + Math.sin(a) * ry;
          return (
            <span key={k} className={cx('po-coin', ai && 'ai', ring && 'out')} style={{ left: `${(x / 800) * 100}%`, top: `${(y / 470) * 100}%`, animationDelay: `${(i % 7) * -0.6}s`, zIndex: Math.round(y) }}>
              <Logo k={k} size="46%" color={ai ? '#2b2440' : '#fff'} />
            </span>
          );
        })}
      </div>
    </figure>
  );
}

/* ── Zenstra: the agent console ──────────────────────────────────────────── */
const AGENT_CAPS = [
  ['Discovery', 'Every agent, built or bought, with its owner', '#f3e8ff', '#7c3aed', 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4'],
  ['Scoped access', 'Only the tools and data its task needs', '#fff3e0', '#c2410c', 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z'],
  ['Action checks', 'Every action checked before it runs', '#e7f7ef', '#0c7546', 'M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6zM9 12l2 2 4-4'],
  ['Lifecycle', 'Created, reviewed, retired on schedule', '#e8efff', '#3346c8', 'M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4'],
  ['Audit record', 'A tamper-evident trail for every decision', '#f2ecff', '#6d28d9', 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h5M9.5 16h5'],
];
export function AgentConsole() {
  return (
    <figure className="ac" aria-label="Illustration: the Zenstra AI agent console. Every AI agent gets an identity, an owner and a scope. Five capabilities: discovery, scoped access, action checks, lifecycle and audit record.">
      <div aria-hidden="true">
        <div className="ac-bar">
          <span className="flex items-center gap-2"><ProductMark p="zenstra" size={18} /><b>Zenstra AI</b><span className="text-[#8a909b]">· Agents</span></span>
          <span className="flex items-center gap-3"><span className="ac-pill">142 agents · 9 owners</span><span className="ac-avatar">PS</span></span>
        </div>
        <div className="ac-hero">
          <div className="ac-orb">
            <span className="ac-halo" />
            <span className="ac-core"><img src="/img/zenstra/agent.webp" alt="" width="520" height="520" loading="lazy" decoding="async" /></span>
            <span className="ac-chip c1"><i />invoice-agent · owner: Finance</span>
            <span className="ac-chip c2"><i className="g" />Scope: pay approved invoices</span>
            <svg className="ac-spark" viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="#4fb3f6" /></svg>
          </div>
          <div className="ac-copy">
            <p className="ac-h">Every AI agent, with an identity and an owner.</p>
            <p className="ac-p">Zenstra gives each agent a scope, checks every action against its task before it runs, and keeps the record that proves it.</p>
            <span className="ac-btn">Register an agent<svg viewBox="0 0 24 24" width="13" height="13"><path d="M5 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          </div>
        </div>
        <ul className="ac-caps">
          {AGENT_CAPS.map(([h, p, bg, fg, d]) => (
            <li key={h}>
              <span className="ac-ic" style={{ background: bg, color: fg }}><svg viewBox="0 0 24 24" width="16" height="16"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              <b>{h}</b><span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

/* ── AD Security: how ITDR sits between identities and Tier 0 ─────────────── */
const ITDR_LEFT = [
  ['Attack path visibility', ['Every path to Tier 0, ranked', 'Risky delegations and ACLs', 'MITRE ATT&CK mapping']],
  ['Directory hygiene', ['Stale admins and weak service accounts', 'New misconfigurations, as they appear', 'The one change that closes each path']],
  ['Live attack detection', ['Kerberoasting, DCSync, pass-the-hash', 'Baselines for Kerberos, NTLM and LDAP', 'Contained by policy, in seconds']],
];
export function ItdrFlow() {
  return (
    <figure className="itf" aria-label="Diagram: attack path visibility, directory hygiene and live attack detection feed adapID AD Security, which sits between users and service accounts and your directory. Abuse is contained before it reaches Tier 0, the domain controllers, or your applications and file servers.">
      <div aria-hidden="true" className="itf-scroll">
        <svg viewBox="0 0 1000 420" className="block h-auto w-full min-w-[760px]">
          <defs>
            <marker id="itf-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#0a5ea3" /></marker>
            <linearGradient id="itf-core" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2b94e0" /><stop offset="1" stopColor="#0a5ea3" /></linearGradient>
          </defs>
          {/* the three capabilities, bracketed */}
          {ITDR_LEFT.map(([h, lines], i) => {
            const y = 58 + i * 132;
            return (
              <g key={h}>
                <text x="250" y={y} textAnchor="end" className="itf-h">{h.toUpperCase()}</text>
                {lines.map((l, j) => <text key={l} x="250" y={y + 22 + j * 19} textAnchor="end" className="itf-l">{l} –</text>)}
                <circle cx="268" cy={y + 30} r="3.5" fill="#0a5ea3" />
                <path d={`M268 ${y + 30}H290`} className="itf-line" />
              </g>
            );
          })}
          <path d="M290 88V352" className="itf-line" />
          <path d="M290 220H350" className="itf-line" />
          {/* identities */}
          <g transform="translate(395 220)">
            <rect x="-40" y="-32" width="80" height="56" rx="10" fill="#fff" stroke="#0a5ea3" strokeWidth="2" />
            <g transform="translate(-14 -18)" color="#0a5ea3"><svg width="28" height="28" viewBox="0 0 24 24"><path d={ICO.users} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></g>
            <text y="50" textAnchor="middle" className="itf-n">Users and service accounts</text>
          </g>
          <text x="395" y="120" textAnchor="middle" className="itf-k">READ-ONLY DIRECTORY ACCESS</text>
          <text x="395" y="140" textAnchor="middle" className="itf-l">Nothing installed on domain controllers</text>
          <path d="M395 150V182" className="itf-line" />
          <path d="M440 220H540" className="itf-line" markerEnd="url(#itf-a)" />
          {/* the core */}
          <g transform="translate(615 220)">
            <rect x="-70" y="-36" width="140" height="72" rx="36" fill="url(#itf-core)" />
            <text y="-3" textAnchor="middle" className="itf-c">adapID</text>
            <text y="17" textAnchor="middle" className="itf-c">AD Security</text>
          </g>
          {/* contain */}
          <text x="740" y="120" textAnchor="middle" className="itf-k">CONTAIN · DISABLE · RESET · ALERT</text>
          <text x="740" y="140" textAnchor="middle" className="itf-l">By your policy, with the reason attached</text>
          <path d="M740 150V198" className="itf-line" />
          <path d="M685 220H722" className="itf-line" />
          <g transform="translate(740 220)"><circle r="16" fill="#e5484d" /><path d="M-6 -6 6 6M6 -6-6 6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" /></g>
          <path d="M756 220C820 220 830 200 840 120" className="itf-line" markerEnd="url(#itf-a)" />
          <path d="M756 220C820 220 830 240 840 320" className="itf-line" markerEnd="url(#itf-a)" />
          {/* what it protects */}
          <g transform="translate(900 70)">
            <rect x="-90" y="-40" width="180" height="70" rx="12" className="itf-box" />
            <text y="-8" textAnchor="middle" className="itf-n">Tier 0</text>
            <text y="12" textAnchor="middle" className="itf-l">Domain controllers, admins</text>
          </g>
          <g transform="translate(900 370)">
            <rect x="-90" y="-40" width="180" height="70" rx="12" className="itf-box" />
            <text y="-8" textAnchor="middle" className="itf-n">Apps and servers</text>
            <text y="12" textAnchor="middle" className="itf-l">File shares, SQL, line-of-business</text>
          </g>
        </svg>
      </div>
    </figure>
  );
}

/* ── Zenstra: every agent tied to a person, every credential scoped ───────── */
const AA_AGENTS = [
  { y: 92, tool: 'n8n', via: 'n8n', name: 'Card dispute flow' },
  { y: 222, tool: 'claude', via: 'Claude', name: 'Member assist' },
  { y: 352, tool: 'cursor', via: 'Cursor', name: 'Dev agent' },
];
/* connector, the agent it belongs to, the system, the permission, scoped */
const AA_LINKS = [
  { a: 0, y: 92, cred: 'Service account', sys: 'bank', perm: ['hold write:core', 'read: member in task'], scoped: true },
  { a: 1, y: 182, cred: 'MCP', sys: 'doc', perm: ['kb.search'], blue: true },
  { a: 1, y: 272, cred: 'OAuth app', sys: 'gmail', perm: ['send: approved domains', 'expires in 15 min'], scoped: true },
  { a: 2, y: 352, cred: 'API key', sys: 'github', perm: ['contents:write · 1 repo', 'expires in 1 hour'], scoped: true },
];
const SYS_ICON = {
  bank: 'M4 10h16M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18M12 4l8 4H4z',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h5M9.5 16h5',
};
export function AgentAccess() {
  const ref = useRef(null);
  const k = useBeat(ref, 6, 700);
  return (
    <figure ref={ref} className="aa" aria-label="Illustration: one owner, Priya S., with three AI agents: an n8n card-dispute flow, a Claude member assistant and a Cursor developer agent. Each agent reaches systems through a credential (a service account, an MCP connection, an OAuth app and an API key), and each credential carries a permission scoped to the task, most of them expiring on their own.">
      <svg viewBox="0 0 860 444" className="block h-auto w-full" aria-hidden="true">
        <defs>
        </defs>
        {/* owner to agents */}
        <path d="M128 222 H170 V92 H210 M170 222 H210 M170 222 V352 H210" className={cx('aa-line', k >= 1 && 'on')} pathLength="1" />
        {/* agents to credentials to systems */}
        {AA_LINKS.map((l, i) => {
          const ay = AA_AGENTS[l.a].y;
          return <path key={i} d={`M372 ${ay} H${ay === l.y ? 470 : 400} ${ay === l.y ? '' : `V${l.y} H470`} M560 ${l.y} H610`} className={cx('aa-line', k >= 2 + (i > 1 ? 1 : 0) && 'on')} pathLength="1" />;
        })}
        {AA_LINKS.map((l, i) => <path key={`p${i}`} d={`M654 ${l.y} H676`} className={cx('aa-line', k >= 4 && 'on')} pathLength="1" />)}
        {/* traffic: a request from each agent, checked against its scope */}
        {k >= 5 && AA_LINKS.map((l, i) => <circle key={`d${i}`} r="3" className="aa-dot" style={{ offsetPath: `path('M372 ${AA_AGENTS[l.a].y} H400 V${l.y} H676')`, animationDelay: `${i * 0.45}s` }} />)}

        {/* the owner */}
        <g transform="translate(90 222)" className="aa-owner">
          <circle r="34" />
          <path d="M0 -2a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM-15 16c2-9 8-13 15-13s13 4 15 13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          <text y="56" textAnchor="middle" className="aa-name">Priya S.</text>
          <text y="72" textAnchor="middle" className="aa-sub">Owner · Payments ops</text>
        </g>
        {/* the agents */}
        {AA_AGENTS.map((g, i) => (
          <g key={g.name} transform={`translate(212 ${g.y - 28})`} className={cx('aa-agent', k >= 1 && 'on')} style={{ transitionDelay: `${i * 90}ms` }}>
            <rect x="0" y="-16" width="62" height="16" rx="4" className="aa-tab" /><text x="31" y="-5" textAnchor="middle" className="aa-tabt">AI agent</text>
            <rect width="160" height="56" rx="10" className="aa-card" />
            <g transform="translate(14 16)"><Logo k={g.tool} size="24" color="#fff" /></g>
            <text x="48" y="24" className="aa-via">{g.via}</text>
            <text x="48" y="41" className="aa-cn">{g.name}</text>
          </g>
        ))}
        {/* credentials and systems */}
        {AA_LINKS.map((l, i) => (
          <g key={l.cred}>
            <g transform={`translate(470 ${l.y - 13})`} className={cx('aa-cred', l.blue && 'blue', k >= 2 && 'on')}>
              <rect width="90" height="26" rx="13" /><text x="45" y="17" textAnchor="middle">{l.cred}</text>
            </g>
            <g transform={`translate(610 ${l.y - 22})`} className={cx('aa-sys', k >= 3 && 'on')}>
              <rect width="44" height="44" rx="11" />
              {SYS_ICON[l.sys]
                ? <path transform="translate(10 10)" d={SYS_ICON[l.sys]} fill="none" stroke="#dfe6ee" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                : <g transform="translate(11 11)"><Logo k={l.sys} size="22" /></g>}
            </g>
            <g transform={`translate(676 ${l.y - (l.perm.length > 1 ? 30 : 22)})`} className={cx('aa-perm', k >= 4 && 'on', l.scoped && 'scoped')} style={{ transitionDelay: `${i * 110}ms` }}>
              <rect width="170" height={l.perm.length > 1 ? 60 : 44} rx="9" />
              <rect x="10" y="-8" width="58" height="15" rx="4" className="aa-ptab" /><text x="39" y="3" textAnchor="middle" className="aa-ptabt">Permission</text>
              {l.scoped && <g className="aa-scope"><rect x="112" y="-8" width="50" height="15" rx="7.5" /><text x="137" y="3" textAnchor="middle">Scoped</text></g>}
              {l.perm.map((p, j) => <text key={p} x="14" y={24 + j * 18} className="aa-pt">{p}</text>)}
            </g>
          </g>
        ))}
      </svg>
    </figure>
  );
}
