import { Viz, Win, Chip, Gl, Logo, App, Av, cx } from './kit.jsx';
import { Ring } from './home.jsx';

const ADAP = '#3cc8f6';

/* A1. Continuous identity risk: signals from every system one person uses
   raise a single live score, with the reason for each point; when the score
   crosses the policy line, the response runs across those same systems. */
const DAY = [
  ['okta', '09:12', 'Signed in from Mumbai', 'Managed laptop · MFA', 12, 'ok', 'Normal'],
  ['okta', '11:05', 'Signed in from Lagos', 'New device · 2 h after Mumbai', 58, 'warn', 'Impossible travel'],
  ['outlook', '11:07', 'Mail forwarding rule to a Gmail address', 'First time in 14 months', 81, 'crit', 'Never seen'],
  ['salesforce', '11:09', 'Exported 3,200 customer records', '40× this role’s daily median', 94, 'crit', 'Peer outlier'],
];
const RESPOND = [['okta', 'Okta', 'All sessions revoked'], ['m365', 'Microsoft 365', 'Forwarding rule removed'], ['slack', 'Slack', 'SOC and manager told, with reasons']];
export function AdapRiskTimeline({ k: fk } = {}) {
  return (
    <Viz k={fk} steps={[500, 900, 950, 950, 950, 900, 1000]} hold={4200} label="Illustration: Kavya Reddy's identity risk score rises from 12 to 94 as an Okta sign-in from Lagos, a new Microsoft 365 forwarding rule and a bulk Salesforce export follow each other; at the policy line adapID revokes her Okta sessions, removes the rule and alerts the SOC on Slack.">
      {(k) => {
        const n = Math.max(1, Math.min(k, 4));
        const score = DAY[n - 1][4];
        const col = score >= 80 ? '#ff6b5d' : score >= 50 ? '#f6b955' : '#3fd98f';
        // score line through the morning, drawn up to the latest event
        const pts = DAY.slice(0, n).map((d, i) => [6 + i * 29, 52 - (d[4] / 100) * 46]);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1].toFixed(1)}`).join(' ');
        return (
          <Win title="adapID AI · Identity risk" right={k >= 6 ? <Chip tone="ok">Contained · 1.4 s</Chip> : <Chip tone="info">Live</Chip>} glow="rgb(0 174 239 / .45)">
            <div className="flex items-center gap-[.9em]">
              <Av name="Kavya Reddy" i={3} />
              <span className="min-w-0">
                <span className="block text-[1.12em] font-semibold">Kavya Reddy</span>
                <span className="flex items-center gap-[.4em] vz-m">Treasury · watched across <Logo k="okta" size="1em" /><Logo k="m365" size="1em" /><Logo k="salesforce" size="1em" /><Logo k="aws" size="1.2em" /></span>
              </span>
              <span className="ml-auto flex items-center gap-[.55em]"><Ring v={score} color={col} /><span className="vz-m">risk<br />score</span></span>
            </div>

            <div className="mt-[1em] grid gap-[.9em]" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
              <div className="space-y-[.45em]">
                {DAY.map((d, i) => (
                  <div key={d[1]} className={cx(`s${i + 1}`, 'flex items-center gap-[.6em] rounded-[.7em] px-[.6em] py-[.5em]')} style={{ background: d[5] === 'crit' ? 'rgb(255 107 93 / .07)' : 'rgb(255 255 255 / .03)', border: `1px solid ${d[5] === 'crit' ? 'rgb(255 107 93 / .22)' : 'rgb(160 190 230 / .08)'}` }}>
                    <App k={d[0]} />
                    <span className="min-w-0 flex-1"><span className="block truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .92em)' }}>{d[2]}</span><span className="block truncate vz-m" style={{ fontSize: 'max(var(--vz-min), .8em)' }}>{d[1]} · {d[3]}</span></span>
                    <span className="shrink-0 text-right"><span className="block vz-mono num" style={{ color: d[5] === 'ok' ? 'var(--vz-green)' : d[5] === 'warn' ? 'var(--vz-amber)' : 'var(--vz-red)' }}>+{i ? d[4] - DAY[i - 1][4] : d[4]}</span></span>
                  </div>
                ))}
              </div>
              <div className="vz-panel flex flex-col" style={{ padding: '.7em .7em .5em' }}>
                <span className="vz-h">Score this morning</span>
                <div className="relative mt-[.5em] flex-1" style={{ minHeight: '8em' }}>
                  <svg viewBox="0 0 100 56" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                    <rect x="0" y="6" width="100" height="9.2" fill="rgb(255 107 93 / .1)" />
                    <rect x="0" y="15.2" width="100" height="13.8" fill="rgb(246 185 85 / .08)" />
                    <line x1="0" y1="15.2" x2="100" y2="15.2" stroke="rgb(255 107 93 / .55)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1="29" x2="100" y2="29" stroke="rgb(246 185 85 / .5)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                    <path d={line} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ transition: 'stroke .4s' }} />
                    {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.6" fill={i === pts.length - 1 ? col : '#8fa3bd'} />)}
                  </svg>
                  <span className="absolute right-0 top-[2%] vz-m" style={{ fontSize: 'max(var(--vz-min), .72em)', color: 'var(--vz-red)' }}>Hold · 80</span>
                  <span className="absolute right-0 top-[38%] vz-m" style={{ fontSize: 'max(var(--vz-min), .72em)', color: 'var(--vz-amber)' }}>Step-up · 50</span>
                </div>
                <span className="vz-m" style={{ fontSize: 'max(var(--vz-min), .75em)' }}>Baseline from day one · peer group: Treasury</span>
              </div>
            </div>

            <div className="s5 mt-[.9em] rounded-[.8em] px-[.8em] py-[.65em]" style={{ background: 'rgb(0 174 239 / .07)', border: '1px solid rgb(0 174 239 / .28)' }}>
              <span className="block vz-h" style={{ color: 'var(--vz-blue)' }}>Policy: score above 80 → hold and contain</span>
              <div className="mt-[.5em] grid grid-cols-3 gap-[.5em]">
                {RESPOND.map(([app, n, t], i) => (
                  <span key={n} className={cx(i < 2 ? 's5' : 's6', 'flex items-center gap-[.5em] rounded-[.6em] px-[.5em] py-[.45em]')} style={{ background: 'rgb(255 255 255 / .04)' }}>
                    <Logo k={app} size="1.15em" />
                    <span className="min-w-0"><span className="block truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .8em)' }}>{n}</span><span className="block truncate vz-m" style={{ fontSize: 'max(var(--vz-min), .72em)', color: 'var(--vz-green)' }}>{t}</span></span>
                  </span>
                ))}
              </div>
            </div>
          </Win>
        );
      }}
    </Viz>
  );
}

/* A3. NHI for AWS: the account graph, and what a role uses against what it has. */
export function NhiGraph({ k: fk } = {}) {
  const nodes = [
    { id: 'acct', x: 50, y: 14, l: 'prod · 4471', g: 'aws', c: '#ffd27a' },
    { id: 'l1', x: 18, y: 48, l: 'lambda-kyc-sync', g: 'lambda', c: '#ff8b7e', hot: true },
    { id: 'l2', x: 50, y: 52, l: 'ecs-notify-svc', g: 'ecs', c: '#9fb4cf' },
    { id: 'l3', x: 82, y: 48, l: 'glue-ledger-etl', g: 'glue', c: '#9fb4cf' },
    { id: 'r1', x: 12, y: 86, l: 'secrets/*', g: 'secrets', c: '#ff8b7e', hot: true },
    { id: 'r2', x: 36, y: 88, l: 's3://kyc-docs', g: 's3', c: '#9fb4cf' },
    { id: 'r3', x: 66, y: 88, l: 'sns:notify', g: 'sns', c: '#9fb4cf' },
    { id: 'r4', x: 88, y: 86, l: 's3://ledger', g: 's3', c: '#9fb4cf' },
  ];
  const edges = [['acct', 'l1'], ['acct', 'l2'], ['acct', 'l3'], ['l1', 'r1'], ['l1', 'r2'], ['l2', 'r3'], ['l3', 'r4'], ['l2', 'r2']];
  const N = Object.fromEntries(nodes.map((n) => [n.id, n]));
  return (
    <Viz k={fk} steps={[500, 800, 800, 900, 1000]} hold={4000} label="Illustration: an AWS account graph shows a Lambda role with access to every secret; it has 214 permissions and has used 9 in 90 days.">
      {(k) => (
        <Win title="Non-human identities · AWS" right={<Chip tone="info" plain>adapID NHI</Chip>} glow="rgb(255 160 60 / .35)">
          <div className="grid gap-[1em]" style={{ gridTemplateColumns: '1.35fr 1fr' }}>
            <div className="relative" style={{ aspectRatio: '1.2' }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                {edges.map(([a, b], i) => {
                  const hot = N[a].hot || N[b].hot;
                  return <line key={i} x1={N[a].x} y1={N[a].y} x2={N[b].x} y2={N[b].y} stroke={hot && k >= 3 ? 'rgb(255 107 93 / .7)' : 'rgb(140 180 230 / .28)'} strokeWidth="1.2" vectorEffect="non-scaling-stroke" className={i < 3 ? 's1' : 's2'} />;
                })}
              </svg>
              {nodes.map((n, i) => (
                <span key={n.id} className={cx(i < 4 ? 's1' : 's2', 'absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center')} style={{ left: `${n.x}%`, top: `${n.y}%` }}>
                  <span className="vz-ic relative" style={{ color: n.hot && k >= 3 ? '#ff8b7e' : n.c, width: '2em', height: '2em', borderColor: n.hot && k >= 3 ? 'rgb(255 107 93 / .55)' : undefined }}>
                    <Logo k={n.g} size={n.g === 'aws' ? '1.6em' : '1.45em'} />{n.hot && k >= 3 && <span className="ping-h" style={{ color: 'rgb(255 107 93 / .6)' }} />}
                  </span>
                  <span className="mt-[.25em] whitespace-nowrap vz-mono" style={{ fontSize: 'max(var(--vz-min), .7em)' }}>{n.l}</span>
                </span>
              ))}
            </div>
            <div className="s3 flex flex-col gap-[.7em]">
              <div className="vz-panel" style={{ padding: '.8em .9em' }}>
                <span className="block vz-mono" style={{ color: 'var(--vz-red)' }}>lambda-kyc-sync</span>
                <span className="mt-[.5em] block vz-m">Posture score</span>
                <span className="block text-[1.9em] font-semibold num" style={{ color: '#ff7d70' }}>38<span className="vz-m" style={{ fontSize: 'max(var(--vz-min), .45em)' }}> / 100</span></span>
              </div>
              <div className="vz-panel" style={{ padding: '.8em .9em' }}>
                <span className="block vz-m">Permissions in 90 days</span>
                <div className="mt-[.5em] space-y-[.45em]">
                  <div><div className="flex justify-between vz-m"><span>Granted</span><span className="text-white num">214</span></div><div className="vz-meter mt-[.25em]"><i style={{ '--w': '100%', '--mc': '#686a6e' }} /></div></div>
                  <div><div className="flex justify-between vz-m"><span>Used</span><span className="text-white num">9</span></div><div className="vz-meter mt-[.25em]"><i style={{ '--w': k >= 4 ? '4.2%' : '0%', '--mc': '#3cc8f6' }} /></div></div>
                </div>
              </div>
              <div className="s5"><Chip tone="crit">secretsmanager:* on every secret</Chip></div>
            </div>
          </div>
        </Win>
      )}
    </Viz>
  );
}

/* A1b. One person's score, climbing with each reason, until the policy acts. */
const REASONS = [['okta', 'Signed in from Lagos, 2 h after Mumbai', 46], ['outlook', 'Mail forwarding rule to a Gmail address', 23], ['salesforce', '3,200 customer records exported', 13]];
export function RiskScoreCard({ k: fk } = {}) {
  return (
    <Viz k={fk} steps={[500, 1000, 1000, 1000, 1100]} hold={4200} label="Illustration: Kavya Reddy's risk score climbs from 12 to 94 as three unusual actions are added, each with its points; above 80 the policy holds and contains the identity in 1.4 seconds.">
      {(k) => {
        const v = 12 + REASONS.slice(0, Math.min(k, 3)).reduce((a, r) => a + r[2], 0);
        const col = v >= 80 ? '#ff7d70' : v >= 50 ? '#ffc566' : '#4be29a';
        return (
          <Win title="adapID AI · Identity risk" right={k >= 4 ? <Chip tone="ok">Contained · 1.4 s</Chip> : <Chip tone="info">Live</Chip>} glow="rgb(60 200 246 / .4)">
            <div className="flex items-center gap-[1em]">
              <Ring v={v} color={col} size="4.6em" />
              <span className="min-w-0"><span className="block vz-t" style={{ fontSize: '1.15em' }}>Kavya Reddy</span><span className="block vz-m">Treasury · baseline from day one</span></span>
              <span className="vz-wide ml-auto text-right"><span className="block vz-m">Policy</span><span className="block vz-t">Above 80 → hold</span></span>
            </div>
            <div className="mt-[.9em] space-y-[.5em]">
              {REASONS.map(([app, t, pts], i) => (
                <div key={t} className={cx(`s${i + 1}`, 'flex items-center gap-[.7em] rounded-[.7em] px-[.8em] py-[.6em]')} style={{ background: 'rgb(255 255 255 / .035)', border: '1px solid rgb(160 190 230 / .09)' }}>
                  <Logo k={app} size="1.2em" /><span className="truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .92em)' }}>{t}</span><span className="ml-auto font-semibold num" style={{ color: i ? 'var(--vz-red)' : 'var(--vz-amber)' }}>+{pts}</span>
                </div>
              ))}
            </div>
          </Win>
        );
      }}
    </Viz>
  );
}

/* A7. Active Directory: the path to Domain Admins, and the one change that cuts it. */
/* A5. Active Directory: the path an attacker would take to Tier 0, hop by hop
   with the technique on each edge; the one fix that cuts it; and live
   detection when someone tries anyway. Node positions are in % of the graph. */
const NODES = [
  { id: 'u', l: 'r.kapoor', s: 'User · phished', g: 'user', x: 9, y: 30 },
  { id: 'w', l: 'WKS-2140', s: 'Workstation', g: 'laptop', x: 30, y: 70 },
  { id: 's', l: 'svc-sql-report', s: 'Service account', g: 'key', x: 51, y: 30 },
  { id: 'g', l: 'Server Admins', s: 'Group · 3 levels deep', g: 'tree', x: 72, y: 70 },
  { id: 'd', l: 'Domain Admins', s: 'Tier 0', g: 'dc', x: 91, y: 30 },
];
const EDGES = [['u', 'w', 'Logs on as local admin'], ['w', 's', 'Kerberoasting'], ['s', 'g', 'GenericAll on group'], ['g', 'd', 'DCSync rights']];
const at = (id) => NODES.find((n) => n.id === id);
export function AdPath({ k: fk } = {}) {
  return (
    <Viz k={fk} steps={[500, 800, 800, 800, 800, 1200, 1000, 1000]} hold={4400} label="Illustration: an attacker moves from a phished user to a workstation, Kerberoasts a service account, abuses its GenericAll right on Server Admins and reaches Domain Admins; removing that one right cuts 41 of 57 paths, and a later DCSync attempt is blocked and the host isolated.">
      {(k) => {
        const hop = Math.min(k, 4), cut = k >= 5;
        const tok = cut ? at('s') : at(EDGES[Math.max(0, hop - 1)][hop ? 1 : 0]);
        return (
          <Win title={<span className="inline-flex items-center gap-[.5em]"><Logo k="windows" size="1em" />Attack paths · corp.local</span>} right={cut ? <Chip tone="ok">16 paths left · was 57</Chip> : <Chip tone="crit">{hop} of 4 hops to Tier 0</Chip>} glow="rgb(0 174 239 / .4)">
            <div className="relative" style={{ height: '19em' }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                {EDGES.map(([a, b], i) => {
                  const A = at(a), B = at(b), live = hop > i, dead = cut && i >= 2;
                  return <line key={a + b} x1={A.x} y1={A.y} x2={B.x} y2={B.y} vectorEffect="non-scaling-stroke" strokeWidth={live ? 2 : 1.2}
                    stroke={dead ? 'rgb(140 160 190 / .22)' : live ? 'rgb(255 107 93 / .85)' : 'rgb(160 190 230 / .28)'} strokeDasharray={live && !dead ? undefined : '3 4'} className={live && !dead && !cut ? 'flowline' : undefined} />;
                })}
              </svg>
              {EDGES.map(([a, b, t], i) => {
                const A = at(a), B = at(b), live = hop > i, dead = cut && i >= 2;
                return (
                  <span key={t} className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-[.55em] py-[.15em]" style={{ left: `${(A.x + B.x) / 2}%`, top: `${(A.y + B.y) / 2}%`, fontSize: 'max(var(--vz-min), .72em)', fontWeight: 600, transition: 'all .5s', opacity: live || cut ? 1 : 0.35, background: dead ? 'var(--vz-solid)' : live ? 'rgb(255 107 93 / .16)' : 'var(--vz-solid)', color: dead ? '#7a7c80' : live ? 'var(--vz-red)' : '#94969a', border: `1px solid ${live && !dead ? 'rgb(255 107 93 / .4)' : 'rgb(160 190 230 / .14)'}`, textDecoration: dead ? 'line-through' : 'none' }}>{t}</span>
                );
              })}
              {cut && <span className="absolute -translate-x-1/2 -translate-y-1/2 vz-chip c-ok" style={{ left: '61.5%', top: '50%', marginTop: '1.7em' }}>Right removed</span>}
              {NODES.map((n, i) => {
                const reached = !cut ? hop >= i : i <= 2, tier0 = n.id === 'd', top = n.y < 50;
                // names sit on the outer side of each node, so edges never cross them
                const name = <><span className="block w-full truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .82em)' }}>{n.l}</span><span className="block w-full truncate vz-m" style={{ fontSize: 'max(var(--vz-min), .7em)' }}>{n.s}</span></>;
                return (
                  <span key={n.id} className="absolute flex w-[8.6em] flex-col items-center text-center" style={{ left: `${n.x}%`, top: `${n.y}%`, transform: `translate(-50%, ${top ? 'calc(-100% + 1.25em)' : '-1.25em'})` }}>
                    {top && <span className="mb-[.35em] block w-full">{name}</span>}
                    <span className="vz-ic" style={{ width: '2.5em', height: '2.5em', borderRadius: '.75em', background: 'var(--vz-solid)', transition: 'all .5s', color: tier0 ? (cut ? '#4be29a' : '#ff8b7e') : reached ? '#ffb3aa' : '#dddfe3', borderColor: tier0 && !cut ? 'rgb(255 107 93 / .7)' : reached && !cut ? 'rgb(255 107 93 / .4)' : undefined, boxShadow: tier0 && !cut && hop >= 4 ? '0 0 1.6em rgb(255 107 93 / .5)' : 'none' }}>
                      {n.g === 'dc' ? <Logo k="dc" size="1.5em" /> : <Gl g={n.g} />}
                    </span>
                    {!top && <span className="mt-[.35em] block w-full">{name}</span>}
                  </span>
                );
              })}
              {k >= 1 && <span aria-hidden="true" className="absolute h-[.9em] w-[.9em] -translate-x-1/2 rounded-full" style={{ left: `calc(${tok.x}% + 1.6em)`, top: `calc(${tok.y}% - 1.75em)`, background: cut ? '#8a8c90' : '#ff6b5d', boxShadow: cut ? 'none' : '0 0 0 .35em rgb(255 107 93 / .2), 0 0 1.2em #ff6b5d', transition: 'left .75s cubic-bezier(.65,0,.35,1), top .75s cubic-bezier(.65,0,.35,1), background .4s' }} />}
            </div>
            <div className="s5 mt-[.6em] flex items-center gap-[.8em] rounded-[.8em] px-[.9em] py-[.65em]" style={{ background: 'rgb(63 217 143 / .08)', border: '1px solid rgb(63 217 143 / .3)' }}>
              <Gl g="check" className="h-[1.3em] w-[1.3em] shrink-0" style={{ color: '#4be29a' }} />
              <span className="min-w-0"><span className="block vz-t">Remove GenericAll from svc-sql-report</span><span className="block truncate vz-m">The one change that closes 41 of 57 paths · no business impact found</span></span>
            </div>
            <div className="s7 mt-[.6em] flex items-center gap-[.8em] rounded-[.8em] px-[.9em] py-[.6em]" style={{ background: 'rgb(255 255 255 / .03)', border: '1px solid rgb(160 190 230 / .1)' }}>
              <span className="vz-mono shrink-0" style={{ color: '#94969a' }}>14:22:07</span>
              <span className="min-w-0 flex-1 truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .9em)' }}>DCSync attempt from WKS-2140</span>
              <Chip tone="crit">Blocked</Chip><span className="s8"><Chip tone="ok">Host isolated</Chip></span>
            </div>
          </Win>
        );
      }}
    </Viz>
  );
}

/* Connectors strip used on adapID pages */
export function Connectors({ keys, k: fk }) {
  return (
    <ul className="flex flex-wrap items-center gap-2.5">
      {keys.map((k) => (
        <li key={k} className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-fg/[.03] px-4 text-[14px] text-ink-2"><Logo k={k} size="18px" />{({ okta: 'Okta', entra: 'Microsoft Entra ID', salesforce: 'Salesforce', slack: 'Slack', ad: 'Active Directory', m365: 'Microsoft 365', google: 'Google Workspace', aws: 'AWS', github: 'GitHub', atlassian: 'Atlassian', azure: 'Microsoft Entra ID', gitlab: 'GitLab', upi: 'UPI', snowflake: 'Snowflake', databricks: 'Databricks', postgres: 'PostgreSQL', cloudflare: 'Cloudflare', gcp: 'Google Cloud', kubernetes: 'Kubernetes' })[k] || k}</li>
      ))}
    </ul>
  );
}

/* A7. Identity graph and blast radius (CIRM). One person at the centre, the
   systems their identity opens on the first ring, what each system holds on
   the second. When the identity is compromised the blast radius spreads out
   along every edge; containment closes it again, one system at a time.
   Geometry is in a 1000 × 620 space; HTML labels sit on the same points. */
const IG_APPS = [
  { k: 'okta', n: 'Okta', a: -90, res: [['Admin console', 1], ['SSO to 42 apps', 0]] },
  { k: 'm365', n: 'Microsoft 365', a: -30, res: [['Mailbox · 3 years', 0], ['SharePoint · Finance', 0]] },
  { k: 'salesforce', n: 'Salesforce', a: 30, res: [['41,200 customers', 0], ['Report export', 0]] },
  { k: 'aws', n: 'AWS', a: 90, res: [['prod-admin role', 1], ['s3://kyc-docs', 0]] },
  { k: 'github', n: 'GitHub', a: 150, res: [['payments-service', 0], ['Actions secrets', 1]] },
  { k: 'slack', n: 'Slack', a: 210, res: [['#treasury', 0], ['Shared files', 0]] },
];
const IG_C = [500, 310];
const igPt = (deg, rx, ry) => [IG_C[0] + Math.cos((deg * Math.PI) / 180) * rx, IG_C[1] + Math.sin((deg * Math.PI) / 180) * ry];
const igCurve = ([x1, y1], [x2, y2], bend = 0.18) => {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};
const pct = ([x, y]) => ({ left: `${x / 10}%`, top: `${(y / 620) * 100}%` });

export function IdentityGraph({ k: fk } = {}) {
  const apps = IG_APPS.map((a) => ({ ...a, p: igPt(a.a, 235, 168), res: a.res.map(([n, crit], j) => ({ n, crit, p: igPt(a.a + (j ? 13 : -13), 420, 262) })) }));
  return (
    <Viz k={fk} className="vz-exact" steps={[600, 1000, 1200, 1400, 1500, 1500]} hold={4600} label="Illustration: Kavya Reddy's identity opens Okta, Microsoft 365, Salesforce, AWS, GitHub and Slack and, through them, twelve sensitive resources. After a suspicious sign-in her risk rises to 94, the blast radius spreads to every one of them, the two paths to admin access are highlighted, and containment closes each system until the blast radius is zero.">
      {(k) => {
        const hot = k >= 3, spread = k >= 4, crit = k >= 5, held = k >= 6;
        const reach = held ? 0 : spread ? 12 : 0;
        return (
          <Win title={<span className="inline-flex items-center gap-[.5em]">Identity graph · blast radius</span>}
            right={held ? <Chip tone="ok">Contained · 0 systems exposed</Chip> : spread ? <Chip tone="crit">6 systems · 12 resources exposed</Chip> : <Chip tone="info">Mapped</Chip>} glow="rgb(0 174 239 / .45)">
            <div className="tone-d relative overflow-hidden rounded-[.9em]" style={{ aspectRatio: '1000 / 620', background: 'radial-gradient(70% 60% at 50% 0%, rgb(60 160 255 / .30), transparent 70%), radial-gradient(50% 50% at 100% 100%, rgb(0 174 239 / .16), transparent 70%), linear-gradient(160deg, #0b3768, #062448 60%, #04182f)', boxShadow: 'inset 0 0 0 1px rgb(120 190 255 / .18), 0 30px 60px -30px rgb(10 94 163 / .55)' }}>
              <svg viewBox="0 0 1000 620" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                  <radialGradient id="ig-blast"><stop offset="0" stopColor="#ff6b5d" stopOpacity=".26" /><stop offset=".7" stopColor="#ff6b5d" stopOpacity=".08" /><stop offset="1" stopColor="#ff6b5d" stopOpacity="0" /></radialGradient>
                  <linearGradient id="ig-edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3cc8f6" stopOpacity=".55" /><stop offset="1" stopColor="#3cc8f6" stopOpacity=".18" /></linearGradient>
                </defs>
                {/* orbits */}
                <ellipse cx="500" cy="310" rx="235" ry="168" fill="none" stroke="rgb(160 190 230 / .1)" strokeDasharray="3 7" />
                <ellipse cx="500" cy="310" rx="420" ry="262" fill="none" stroke="rgb(160 190 230 / .07)" />
                {/* blast radius: a red field that grows with the spread, and waves while it is live */}
                <ellipse cx="500" cy="310" rx={spread && !held ? 470 : hot && !held ? 120 : 0} ry={spread && !held ? 300 : hot && !held ? 86 : 0} fill="url(#ig-blast)" style={{ transition: 'rx 1.4s cubic-bezier(.16,1,.3,1), ry 1.4s cubic-bezier(.16,1,.3,1)' }} />
                {spread && !held && [0, 1, 2].map((i) => <ellipse key={i} className="ig-wave" cx="500" cy="310" rx="470" ry="300" fill="none" stroke="rgb(255 107 93 / .45)" style={{ animationDelay: `${i * 1.1}s` }} />)}
                {/* edges: identity → system → resource */}
                {apps.map((a, i) => {
                  const d1 = igCurve(IG_C, a.p, 0.12), live = spread && !held;
                  return (
                    <g key={a.k}>
                      <path d={d1} fill="none" stroke={held ? 'rgb(63 217 143 / .35)' : live ? 'rgb(255 107 93 / .75)' : 'url(#ig-edge)'} strokeWidth={live ? 2.2 : 1.4} style={{ transition: `stroke .6s ${i * 0.12}s`, strokeDasharray: held ? '4 6' : undefined, animationDelay: `${i * 90}ms` }} className="ig-draw" />
                      {a.res.map((r) => {
                        const d2 = igCurve(a.p, r.p, 0.1), hi = crit && !held && r.crit;
                        return (
                          <g key={r.n}>
                            <path d={d2} fill="none" stroke={held ? 'rgb(140 160 190 / .18)' : hi ? '#ff6b5d' : live ? 'rgb(255 107 93 / .45)' : 'rgb(160 190 230 / .2)'} strokeWidth={hi ? 3 : 1.2} style={{ transition: 'stroke .6s, stroke-width .6s', filter: hi ? 'drop-shadow(0 0 6px #ff6b5d)' : undefined }} />
                            {hi && <circle r="4" fill="#ffd0ca"><animateMotion dur="1.4s" repeatCount="indefinite" path={`${d1} ${d2.replace('M', 'L')}`} /></circle>}
                          </g>
                        );
                      })}
                      {live && <circle r="3.2" fill="#ff8b7e"><animateMotion dur={`${1.6 + i * 0.15}s`} repeatCount="indefinite" path={d1} /></circle>}
                    </g>
                  );
                })}
              </svg>

              {/* the identity */}
              <span className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={pct(IG_C)}>
                <span className="relative flex h-[4.6em] w-[4.6em] items-center justify-center rounded-full" style={{ background: 'var(--vz-solid)', boxShadow: hot && !held ? '0 0 0 .3em rgb(255 107 93 / .25), 0 0 2.4em rgb(255 107 93 / .55)' : '0 0 0 .3em rgb(60 200 246 / .18), 0 0 2em rgb(60 200 246 / .35)', transition: 'box-shadow .8s' }}>
                  <Ring v={hot ? (held ? 94 : 94) : 18} color={held ? '#3fd98f' : hot ? '#ff6b5d' : '#3cc8f6'} size="4.6em" label={false} />
                  <span className="absolute"><Av name="Kavya Reddy" i={3} /></span>
                </span>
                <span className="mt-[.45em] whitespace-nowrap text-[.95em] font-semibold">Kavya Reddy</span>
                <span className="mt-[.25em] whitespace-nowrap rounded-full px-[.7em] py-[.15em] vz-m" style={{ background: 'rgb(5 21 44 / .88)', border: '1px solid rgb(160 190 230 / .18)', color: held ? 'var(--vz-green)' : hot ? 'var(--vz-red)' : undefined }}>{held ? 'Held · step-up sent' : hot ? 'Risk 94 · sign-in from Lagos' : 'Risk 18 · normal'}</span>
              </span>

              {/* systems */}
              {apps.map((a, i) => (
                <span key={a.k} className="s1 absolute -translate-x-1/2 -translate-y-1/2" style={{ ...pct(a.p), transitionDelay: `${i * 70}ms` }}>
                  <span className="flex items-center gap-[.45em] rounded-full py-[.3em] pl-[.3em] pr-[.75em] text-[#0e1116]" style={{ background: '#fff', border: `1px solid ${held ? 'rgb(63 217 143 / .45)' : spread ? 'rgb(255 107 93 / .5)' : 'rgb(160 190 230 / .2)'}`, boxShadow: '0 .6em 1.4em -.6em rgb(0 0 0 / .8)', transition: 'border-color .6s' }}>
                    <App k={a.k} />
                    <span className="whitespace-nowrap text-[max(var(--vz-min),.88em)] font-semibold">{a.n}</span>
                    {held && <Gl g="lock" className="h-[1em] w-[1em]" style={{ color: '#4be29a' }} />}
                  </span>
                </span>
              ))}

              {/* resources */}
              {apps.flatMap((a) => a.res).map((r, i) => (
                <span key={r.n} className="s2 absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-[.6em] py-[.18em] text-[max(var(--vz-min),.74em)] font-medium" style={{ ...pct(r.p), transitionDelay: `${i * 40}ms`, background: '#0b203f', color: held ? '#9aa6b8' : crit && r.crit ? '#ffe1dc' : spread ? '#ffb1a8' : '#c9d3e1', border: `1px solid ${crit && r.crit && !held ? 'rgb(255 107 93 / .7)' : 'rgb(160 190 230 / .14)'}`, boxShadow: crit && r.crit && !held ? '0 0 1.2em rgb(255 107 93 / .45)' : 'none', transition: 'all .6s' }}>{r.n}</span>
              ))}

              {/* reach counter */}
              <span className="s3 absolute left-[2.5%] top-[4%] rounded-[.7em] px-[.8em] py-[.5em]" style={{ background: 'rgb(11 32 63 / .9)', border: '1px solid rgb(160 190 230 / .14)' }}>
                <span className="block vz-h">Blast radius</span>
                <span className="block text-[1.6em] font-semibold tracking-[-0.03em] num" style={{ color: held ? '#4be29a' : spread ? '#ff7d70' : '#edeff3' }}>{reach}<span className="vz-m" style={{ fontSize: 'max(var(--vz-min), .5em)' }}> of 12 resources</span></span>
              </span>
            </div>
            <div className="mt-[.7em] grid grid-cols-3 gap-[.5em]">
              {[['okta', 'Okta', 'Sessions revoked', 'Admin console'], ['aws', 'AWS', 'prod-admin suspended', 'prod-admin role'], ['github', 'GitHub', 'Token rotated', 'Actions secrets']].map(([app, n, done, risk]) => (
                <span key={n} className="s3 flex items-center gap-[.55em] rounded-[.7em] px-[.6em] py-[.5em]" style={{ background: held ? 'rgb(63 217 143 / .08)' : crit ? 'rgb(255 107 93 / .09)' : 'rgb(255 255 255 / .03)', border: `1px solid ${held ? 'rgb(63 217 143 / .3)' : crit ? 'rgb(255 107 93 / .3)' : 'rgb(160 190 230 / .1)'}`, transition: 'all .6s' }}>
                  <App k={app} />
                  <span className="min-w-0"><span className="block truncate vz-t" style={{ fontSize: 'max(var(--vz-min), .85em)' }}>{n}</span><span className="block truncate vz-m" style={{ fontSize: 'max(var(--vz-min), .74em)', color: held ? 'var(--vz-green)' : crit ? 'var(--vz-red)' : undefined }}>{held ? done : crit ? `Path to admin · ${risk}` : 'Watching'}</span></span>
                </span>
              ))}
            </div>
          </Win>
        );
      }}
    </Viz>
  );
}

/* A8. Active Directory tiers: every path from ordinary users to Tier 0, the
   attacker's shortest route traced across the tiers, the chokepoint most
   paths cross, and the one change that closes them. 1000 × 640 space. */
const TIERS = [
  { y: 40, h: 132, l: 'Tier 0', s: 'Domain control', c: '255 210 122' },
  { y: 238, h: 132, l: 'Tier 1', s: 'Servers, service accounts', c: '60 200 246' },
  { y: 436, h: 160, l: 'Tier 2', s: 'Users and workstations', c: '160 190 230' },
];
const TN = {
  dc: { l: 'DC01', g: 'dc', x: 430, y: 112 }, da: { l: 'Domain Admins', g: 'shield', x: 640, y: 112 }, ea: { l: 'Enterprise Admins', g: 'shield', x: 860, y: 112 },
  s1: { l: 'svc-sql-report', g: 'key', x: 305, y: 282 }, s2: { l: 'SRV-APP-04', g: 'server', x: 400, y: 340 }, s4: { l: 'Server Admins', g: 'tree', x: 520, y: 282 },
  s3: { l: 'svc-backup', g: 'key', x: 640, y: 340 }, s5: { l: 'SRV-FILE-01', g: 'server', x: 760, y: 282 }, s6: { l: 'GPO · Servers', g: 'doc', x: 885, y: 340 },
  u1: { l: 'r.kapoor', g: 'user', x: 270, y: 482 }, w1: { l: 'WKS-2140', g: 'laptop', x: 340, y: 556 }, u2: { l: 'a.iyer', g: 'user', x: 430, y: 482 }, w2: { l: 'WKS-0388', g: 'laptop', x: 510, y: 556 },
  u3: { l: 'helpdesk-07', g: 'user', x: 600, y: 482 }, w3: { l: 'WKS-1177', g: 'laptop', x: 680, y: 556 }, u4: { l: 'contractor-12', g: 'user', x: 780, y: 482 }, w4: { l: 'LAPTOP-HR3', g: 'laptop', x: 875, y: 556 },
};
// [from, to, through the chokepoint?, technique on the traced path]
const TE = [
  ['u1', 'w1', 1, 'Phished login'], ['u2', 'w2', 1], ['u3', 'w3', 1], ['u4', 'w4', 0],
  ['w1', 's1', 1, 'Kerberoasting'], ['w2', 's1', 1], ['w2', 's2', 1], ['w3', 's2', 1], ['w3', 's3', 0], ['w4', 's5', 0], ['u3', 's6', 0],
  ['s1', 's4', 1, 'GenericAll'], ['s2', 's4', 1], ['s6', 's5', 0],
  ['s4', 'dc', 1, 'Admin on DC01'], ['s3', 'dc', 0], ['s5', 'dc', 0],
  ['dc', 'da', 1, 'DCSync'], ['dc', 'ea', 0],
];
const TPATH = ['u1', 'w1', 's1', 's4', 'dc', 'da'];
const tCurve = (a, b) => {
  const A = TN[a], B = TN[b];
  if (Math.abs(A.y - B.y) < 80) return `M${A.x} ${A.y} C${(A.x + B.x) / 2} ${A.y}, ${(A.x + B.x) / 2} ${B.y}, ${B.x} ${B.y}`;
  const my = (A.y + B.y) / 2;
  return `M${A.x} ${A.y} C${A.x} ${my}, ${B.x} ${my}, ${B.x} ${B.y}`;
};
const onPath = (a, b) => TPATH.some((n, i) => (n === a && TPATH[i + 1] === b));
const tp = (x, y) => ({ left: `${x / 10}%`, top: `${(y / 640) * 100}%` });

export function AdTierGraph({ k: fk } = {}) {
  return (
    <Viz k={fk} className="vz-exact" steps={[600, 1100, 1500, 1500, 1500, 1300, 1200]} hold={4800} label="Illustration: an Active Directory map in three tiers. 57 paths lead from users and workstations to Tier 0; the shortest runs from a phished user through Kerberoasting, GenericAll on Server Admins and admin rights on the domain controller to DCSync. 41 of the 57 paths cross Server Admins; removing its admin rights on DC01 closes them, leaving 16.">
      {(k) => {
        const all = k >= 2, trace = k >= 3, choke = k >= 4, cut = k >= 5, next = k >= 6;
        const paths = cut ? 16 : 57;
        const tracePath = TPATH.slice(1).map((n, i) => tCurve(TPATH[i], n)).map((d, i) => (i ? d.replace('M', 'L') : d)).join(' ');
        return (
          <Win title={<span className="inline-flex items-center gap-[.5em]"><Logo k="windows" size="1em" />corp.local · paths to Tier 0</span>}
            right={cut ? <Chip tone="ok">{paths} paths left · was 57</Chip> : all ? <Chip tone="crit">57 paths to Tier 0</Chip> : <Chip tone="info">Mapping…</Chip>} glow="rgb(0 174 239 / .45)">
            <div className="relative overflow-hidden rounded-[.9em]" style={{ aspectRatio: '1000 / 640', background: 'radial-gradient(70% 60% at 50% 0%, rgb(60 160 255 / .30), transparent 70%), radial-gradient(50% 50% at 100% 100%, rgb(0 174 239 / .16), transparent 70%), linear-gradient(160deg, #0b3768, #062448 60%, #04182f)', boxShadow: 'inset 0 0 0 1px rgb(120 190 255 / .18), 0 30px 60px -30px rgb(10 94 163 / .55)' }}>
              <svg viewBox="0 0 1000 640" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <defs>
                  {TIERS.map((t, i) => <linearGradient key={i} id={`tg${i}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={`rgb(${t.c})`} stopOpacity=".1" /><stop offset="1" stopColor={`rgb(${t.c})`} stopOpacity=".025" /></linearGradient>)}
                </defs>
                {TIERS.map((t, i) => <rect key={i} className="s1" x="14" y={t.y} width="972" height={t.h} rx="18" fill={`url(#tg${i})`} stroke={`rgb(${t.c} / ${i === 0 && trace && !cut ? 0.6 : 0.18})`} style={{ transition: 'stroke .6s' }} />)}
                {TE.map(([a, b, cp], i) => {
                  const traced = trace && onPath(a, b) && !cut, dead = cut && cp, isCut = cut && a === 's4' && b === 'dc';
                  const stroke = isCut ? 'rgb(63 217 143 / .9)' : dead ? 'rgb(140 160 190 / .14)' : traced ? '#ff6b5d' : choke && cp ? 'rgb(255 107 93 / .5)' : next && !cp ? 'rgb(246 185 85 / .7)' : all ? 'rgb(160 190 230 / .32)' : 'rgb(160 190 230 / 0)';
                  return <path key={i} d={tCurve(a, b)} fill="none" stroke={stroke} strokeWidth={traced ? 3 : isCut ? 2.4 : 1.3} strokeDasharray={dead || isCut ? '5 6' : undefined} style={{ transition: 'stroke .7s, stroke-width .5s', transitionDelay: all && !trace ? `${i * 40}ms` : '0ms', filter: traced ? 'drop-shadow(0 0 5px #ff6b5d)' : undefined }} />;
                })}
                {trace && !cut && <circle r="6" fill="#ffe1dc" style={{ filter: 'drop-shadow(0 0 8px #ff6b5d)' }}><animateMotion dur="3.2s" repeatCount="indefinite" path={tracePath} /></circle>}
                {choke && !cut && <circle className="ig-wave" cx={TN.s4.x} cy={TN.s4.y} r="60" fill="none" stroke="rgb(255 107 93 / .7)" />}
              </svg>

              {TIERS.map((t, i) => (
                <span key={t.l} className="s1 absolute" style={{ ...tp(30, t.y + 14) }}>
                  <span className="block text-[max(var(--vz-min),.72em)] font-bold uppercase tracking-[.12em]" style={{ color: `rgb(${t.c})` }}>{t.l}</span>
                  <span className="block whitespace-nowrap vz-m" style={{ fontSize: 'max(var(--vz-min), .7em)' }}>{t.s}</span>
                </span>
              ))}

              {Object.entries(TN).map(([id, n]) => {
                const inPath = TPATH.includes(id), tier0 = n.y < 200;
                const hotNode = trace && !cut && inPath, chokeNode = choke && id === 's4';
                return (
                  <span key={id} className="s1 absolute -translate-x-1/2 -translate-y-1/2" style={tp(n.x, n.y)}>
                    <span className="flex items-center gap-[.4em] whitespace-nowrap rounded-full py-[.25em] pl-[.28em] pr-[.65em]" style={{ background: 'var(--vz-solid)', border: `1px solid ${chokeNode && !cut ? 'rgb(255 107 93 / .9)' : hotNode ? 'rgb(255 107 93 / .6)' : tier0 ? 'rgb(255 210 122 / .45)' : 'rgb(160 190 230 / .18)'}`, boxShadow: chokeNode && !cut ? '0 0 1.4em rgb(255 107 93 / .6)' : hotNode ? '0 0 1em rgb(255 107 93 / .35)' : '0 .5em 1.2em -.6em rgb(0 0 0 / .8)', transition: 'border-color .6s, box-shadow .6s' }}>
                      <span className="vz-ic" style={{ width: '1.7em', height: '1.7em', borderRadius: '50%', color: hotNode ? '#ffb3aa' : tier0 ? '#ffd27a' : '#dddfe3' }}>{n.g === 'dc' ? <Logo k="dc" size="1.2em" /> : <Gl g={n.g} />}</span>
                      <span className="text-[max(var(--vz-min),.78em)] font-semibold">{n.l}</span>
                    </span>
                  </span>
                );
              })}

              {/* technique labels on the traced path */}
              {trace && !cut && TE.filter((e) => e[3]).map(([a, b, , t]) => {
                const A = TN[a], B = TN[b];
                const off = { dc: [0, -40], s4: [-52, 0], s1: [0, -36], w1: [-60, 0], u1: [-48, 0] }[a] || [0, 0];
                return <span key={t} className="fadein absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-[.55em] py-[.12em] text-[max(var(--vz-min),.68em)] font-semibold" style={{ ...tp((A.x + B.x) / 2 + off[0], (A.y + B.y) / 2 + off[1]), background: 'rgb(255 107 93 / .18)', color: 'var(--vz-red)', border: '1px solid rgb(255 107 93 / .45)' }}>{t}</span>;
              })}
              {cut && <span className="fadein absolute -translate-x-1/2 -translate-y-1/2 vz-chip c-ok" style={tp(530, 205)}>Admin rights removed</span>}

            </div>
            {/* what is happening now, in one line */}
            {(() => {
              const [tone, head, text] = next ? ['warn', 'Next fix', 'svc-backup’s replication rights on DC01 · closes 9 more paths']
                : cut ? ['ok', 'One change, 41 paths closed', 'Server Admins is no longer an administrator on DC01 · 57 → 16']
                : choke ? ['crit', 'Chokepoint', '41 of the 57 paths cross Server Admins']
                : trace ? ['crit', 'Shortest path · 5 hops', 'Phished login → Kerberoasting → GenericAll → admin on DC01 → DCSync']
                : all ? ['info', 'Mapped', '57 paths lead from Tier 2 to Tier 0'] : ['mute', 'Reading the directory', 'Users, groups, computers, GPOs and ACLs, read-only'];
              const col = { ok: ['63 217 143', 'var(--vz-green)'], warn: ['246 185 85', 'var(--vz-amber)'], crit: ['255 107 93', 'var(--vz-red)'], info: ['0 174 239', 'var(--vz-blue)'], mute: ['160 190 230', '#b2b4b8'] }[tone];
              return (
                <div key={head} className="fadein mt-[.7em] flex items-center gap-[.8em] rounded-[.8em] px-[.9em] py-[.6em]" style={{ background: `rgb(${col[0]} / .08)`, border: `1px solid rgb(${col[0]} / .32)` }}>
                  <span className="shrink-0 vz-h" style={{ color: col[1] }}>{head}</span>
                  <span className="min-w-0 truncate vz-m">{text}</span>
                </div>
              );
            })()}
          </Win>
        );
      }}
    </Viz>
  );
}
