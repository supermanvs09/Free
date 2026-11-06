import { useState } from 'react';
import { Icon, Tabs, cx } from '../ui.jsx';
import { AppFrame, Badge } from '../ds.jsx';
import { Logo } from '../viz/kit.jsx';

/* NHI Security for AWS: the cloud identity explorer. Sample data. */
const IDS = [
  { id: 'ecs', name: 'ecs-notify-svc', type: 'IAM role', acct: 'prod-payments', owner: null, used: '2 h ago', granted: 214, usedN: 9, risk: 63, level: 'High', from: ['ecs', 'ECS task notify-worker'],
    res: [['s3', 'notify-templates', true, false], ['sns', 'payment-events', true, false], ['s3', 'prod-customer-exports', true, true], ['rds', 'payments-db (rds:*)', false, true], ['secrets', 'all secrets (*)', false, true]],
    fam: [['s3:*', 120, 3], ['rds:*', 41, 0], ['secretsmanager:*', 22, 0], ['sns:Publish', 2, 2], ['kms:*', 29, 4]],
    why: ['No owner on record; created by a 2023 deploy', '205 of 214 permissions unused in 90 days', 'Can read every secret and the payments database', 'Read prod-customer-exports at 02:14, outside its usual buckets'],
    remove: ['"s3:*"', '"rds:*"', '"secretsmanager:*"', '"kms:*"'], keep: ['"s3:GetObject" on notify-templates/*', '"sns:Publish" on payment-events', '"kms:Decrypt" on alias/notify'] },
  { id: 'lambda', name: 'lambda-kyc-sync', type: 'IAM role', acct: 'prod-kyc', owner: 'KYC platform', used: '5 min ago', granted: 48, usedN: 31, risk: 41, level: 'Medium', from: ['lambda', 'Lambda kyc-sync'],
    res: [['s3', 'kyc-documents', true, true], ['secrets', 'kyc/vendor-api-key', true, true], ['sns', 'kyc-status', true, false]],
    fam: [['s3:GetObject/PutObject', 12, 10], ['secretsmanager:GetSecretValue', 6, 4], ['sns:Publish', 4, 4], ['logs:*', 26, 13]],
    why: ['GetSecretValue called from eu-west-1 for the first time', '17 permissions unused in 90 days'], remove: ['"logs:*"'], keep: ['"logs:CreateLogStream", "logs:PutLogEvents" on its log group'] },
  { id: 'ci', name: 'ci-deploy', type: 'IAM user', acct: 'shared-services', owner: 'Platform team', used: 'Yesterday', granted: 96, usedN: 40, risk: 58, level: 'High', from: ['actions', 'GitHub Actions'],
    res: [['ecs', 'ECS services (all)', true, false], ['iam', 'iam:PassRole (*)', true, true], ['s3', 'artifacts', true, false]],
    fam: [['ecs:*', 30, 18], ['iam:PassRole', 1, 1], ['s3:*', 40, 12], ['ec2:*', 25, 9]],
    why: ['Long-lived access key, 410 days old', 'Can pass any role, including admin roles'], remove: ['iam:PassRole on "*"', 'access key AKIA…3HQ1 (410 days)'], keep: ['iam:PassRole on the two deploy roles', 'OIDC federation from GitHub Actions instead of keys'] },
  { id: 'akia', name: 'AKIA…7Q2N', type: 'Access key', acct: 'dev', owner: 'dev-ravi', used: '12 min ago', granted: 38, usedN: 6, risk: 92, level: 'Critical', from: ['github', 'Public GitHub commit'],
    res: [['s3', 'dev-uploads', true, false], ['ec2', 'EC2 (RunInstances)', true, true]],
    fam: [['s3:*', 20, 4], ['ec2:RunInstances', 1, 1], ['ec2:Describe*', 17, 1]],
    why: ['Committed to a public repository 3 hours ago', 'First use from a new region, 12 minutes ago', 'RunInstances called: possible crypto-mining'], remove: ['access key AKIA…7Q2N (disable now)'], keep: ['A new key for dev-ravi, stored in Secrets Manager'] },
  { id: 'glue', name: 'glue-ledger-etl', type: 'Workload', acct: 'prod-ledger', owner: 'Data platform', used: '1 h ago', granted: 22, usedN: 20, risk: 12, level: 'Low', from: ['glue', 'Glue job ledger-etl'],
    res: [['s3', 'ledger-raw', true, true], ['s3', 'ledger-curated', true, true]],
    fam: [['s3:GetObject/PutObject', 8, 8], ['glue:*', 14, 12]],
    why: ['Within its baseline: volumes, hours and destinations'], remove: [], keep: [] },
];
const LV = { Critical: 'crit', High: 'hold', Medium: 'warn', Low: 'ok' };

function Graph({ x }) {
  const n = x.res.length;
  const H = Math.max(220, n * 52 + 20);
  const y = (i) => 30 + i * ((H - 60) / Math.max(1, n - 1));
  return (
    <svg viewBox={`0 0 560 ${H}`} className="w-full" role="img" aria-label={`${x.name} relationships: used by ${x.from[1]}; can reach ${x.res.map((r) => r[1]).join(', ')}`}>
      {x.res.map((r, i) => (
        <path key={r[1]} d={`M300 ${H / 2} C 360 ${H / 2}, 360 ${y(i)}, 410 ${y(i)}`} fill="none" strokeWidth={r[3] ? 2 : 1.5}
          stroke={r[3] && (x.risk >= 50) ? 'var(--color-crit)' : r[2] ? 'var(--color-brand)' : 'var(--color-line-2)'} strokeDasharray={r[2] ? undefined : '4 4'} />
      ))}
      <path d={`M150 ${H / 2} H190`} stroke="var(--color-brand)" strokeWidth="1.5" />
      <foreignObject x="0" y={H / 2 - 30} width="150" height="60"><div className="flex h-full items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 text-[12px] font-medium leading-tight text-ink"><Logo k={x.from[0]} size="18px" /><span>{x.from[1]}</span></div></foreignObject>
      <foreignObject x="190" y={H / 2 - 32} width="110" height="64"><div className="flex h-full flex-col justify-center rounded-[10px] border-2 border-brand bg-brand-50 px-2.5 text-[12px] leading-tight"><span className="font-semibold text-ink">{x.name}</span><span className="text-ink-3">{x.type}</span></div></foreignObject>
      {x.res.map((r, i) => (
        <foreignObject key={r[1]} x="410" y={y(i) - 20} width="150" height="40">
          <div className={cx('flex h-full items-center gap-2 rounded-[8px] border bg-white px-2 text-[11.5px] leading-tight', r[3] && x.risk >= 50 ? 'border-crit/50' : 'border-line')}>
            <Logo k={r[0]} size="16px" /><span className={cx('min-w-0', r[2] ? 'text-ink' : 'text-ink-3')}>{r[1]}</span>
          </div>
        </foreignObject>
      ))}
    </svg>
  );
}

export default function NhiExplorer() {
  const [sel, setSel] = useState('ecs');
  const [filter, setFilter] = useState('All');
  const [tab, setTab] = useState(0);
  const [proposed, setProposed] = useState({});
  const x = IDS.find((i) => i.id === sel);
  const rows = IDS.filter((i) => filter === 'All' || i.type === filter);
  const pct = Math.round((x.usedN / x.granted) * 100);
  return (
    <AppFrame product="adapid" title="adapID NHI Security" crumb="AWS · 3 accounts" status={<Badge tone="ok" dot>CloudTrail · 90 days</Badge>}>
      <div className="grid xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 border-b border-line bg-white xl:border-b-0 xl:border-r">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2.5">
            <div className="seg" role="group" aria-label="Filter by type">
              {['All', 'IAM role', 'IAM user', 'Access key', 'Workload'].map((t) => <button key={t} type="button" aria-pressed={filter === t} onClick={() => setFilter(t)} className="seg-btn !h-7 !text-[12.5px]">{t}</button>)}
            </div>
            <span className="t-caption num">{rows.length} shown · 12,708 total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="dt min-w-[560px]">
              <caption className="sr-only">Machine identities. Select one to see its relationships and recommendation.</caption>
              <thead><tr><th>Identity</th><th>Owner</th><th className="!text-right">Used / granted</th><th>Risk</th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} data-click className={cx(sel === i.id && 'is-sel')} onClick={() => setSel(i.id)}>
                    <td><button type="button" aria-pressed={sel === i.id} onClick={() => setSel(i.id)} className="text-left"><span className="mono block !text-[13px] font-semibold text-ink">{i.name}</span><span className="t-caption">{i.type} · {i.acct}</span></button></td>
                    <td>{i.owner || <Badge tone="warn">No owner</Badge>}</td>
                    <td className="num !text-right">{i.usedN} / {i.granted}</td>
                    <td><Badge tone={LV[i.level]} dot>{i.level}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="min-w-0 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="mono !text-[14px] font-semibold text-ink">{x.name}</p><p className="t-caption">{x.type} · {x.acct} · last used {x.used}</p></div>
            <div className="text-right"><p className="app-label">Risk</p><p className={cx('num text-[28px] font-semibold leading-none', `text-${LV[x.level]}`)}>{x.risk}</p></div>
          </div>
          <Tabs className="mt-4" items={['Relationships', 'Granted vs used', 'Recommendation']} value={tab} onChange={setTab} label="Identity detail" />
          <div key={`${x.id}-${tab}`} className="fadein mt-4" role="tabpanel">
            {tab === 0 && (
              <>
                <div className="rounded-[10px] border border-line bg-white p-2"><Graph x={x} /></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 t-caption"><span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 bg-brand" />Used</span><span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 border-t border-dashed border-ink-4" />Granted, never used</span><span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 bg-crit" />Sensitive and exposed</span></div>
                <ul className="mt-3 space-y-1.5">{x.why.map((w) => <li key={w} className="flex gap-2 text-[13px] leading-snug text-ink-2"><Icon name="Warning" size={14} className={cx('mt-0.5 shrink-0', x.risk >= 50 ? 'text-hold' : 'text-ok')} />{w}</li>)}</ul>
              </>
            )}
            {tab === 1 && (
              <>
                <div className="flex items-end justify-between"><span className="text-[13.5px] text-ink-2"><span className="num font-semibold text-ink">{x.usedN}</span> of {x.granted} permissions used in 90 days</span><span className="num t-caption">{pct}%</span></div>
                <div className="meter mt-2"><i style={{ width: `${pct}%`, background: 'var(--color-brand)' }} /></div>
                <table className="dt mt-4 rounded-[10px] border border-line bg-white">
                  <thead><tr><th>Permission family</th><th className="!text-right">Granted</th><th className="!text-right">Used</th></tr></thead>
                  <tbody>{x.fam.map(([f, g, u]) => <tr key={f}><td className="mono">{f}</td><td className="num !text-right">{g}</td><td className={cx('num !text-right font-semibold', u === 0 ? 'text-crit' : 'text-ink')}>{u}</td></tr>)}</tbody>
                </table>
              </>
            )}
            {tab === 2 && (x.remove.length ? (
              <>
                <div className="overflow-hidden rounded-[10px] border border-line bg-white font-mono text-[12.5px] leading-6">
                  {x.remove.map((r) => <div key={r} className="bg-crit-50 px-3 text-crit">- {r}</div>)}
                  {x.keep.map((k) => <div key={k} className="bg-ok-50 px-3 text-ok">+ {k}</div>)}
                </div>
                {proposed[x.id] ? (
                  <p role="status" className="slide-in mt-3 flex items-center gap-2 rounded-[8px] bg-ok-50 px-3 py-2 text-[13px] font-medium text-ok"><Icon name="CheckCircle" size={16} weight="fill" />Proposed to {x.owner || 'the account owner'} for approval · before and after kept as evidence</p>
                ) : (
                  <button type="button" onClick={() => setProposed({ ...proposed, [x.id]: true })} className="btn btn-primary btn-sm mt-3"><Icon name="PaperPlaneTilt" size={15} />Propose to owner</button>
                )}
                <p className="mt-2 t-caption">Nothing is changed in your accounts without approval.</p>
              </>
            ) : <p className="rounded-[10px] border border-line bg-white p-4 text-[13.5px] text-ink-2"><Icon name="CheckCircle" size={16} weight="fill" className="mr-1.5 inline text-ok" />Right-sized. No change recommended.</p>)}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
