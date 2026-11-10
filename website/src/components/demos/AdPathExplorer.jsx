import { useState } from 'react';
import { Icon, cx } from '../ui.jsx';
import { AppFrame, Badge } from '../ds.jsx';

/* Active Directory Security: attack paths to Domain Admins, and the fix that
   closes each. Sample directory. */
const PATHS = [
  { id: 'phish', start: 'j.mehta', kind: 'Phished user', icon: 'User',
    hops: [['j.mehta', 'User · Tier 2', 'User'], ['IT-Helpdesk', 'Group · Tier 2', 'Users'], ['Tier1-Admins', 'Group · Tier 1', 'Users'], ['SRV-BACKUP01', 'Server · Tier 1', 'Desktop'], ['adm-rkumar', 'Domain admin · Tier 0', 'Crown']],
    edges: ['MemberOf', 'GenericAll', 'AdminTo', 'HasSession'], weak: 1,
    fix: 'Remove GenericAll for IT-Helpdesk on Tier1-Admins', closes: 41 },
  { id: 'roast', start: 'svc-backup', kind: 'Kerberoastable service account', icon: 'Key',
    hops: [['svc-backup', 'Service account · SPN', 'Key'], ['Cracked offline', '6-year-old password', 'LockOpen'], ['SRV-BACKUP01', 'Server · Tier 1', 'Desktop'], ['adm-rkumar', 'Domain admin · Tier 0', 'Crown']],
    edges: ['Kerberoasting', 'AdminTo', 'HasSession'], weak: 0,
    fix: 'Move svc-backup to a group-managed service account', closes: 12 },
  { id: 'stale', start: 'helpdesk-07', kind: 'Helpdesk operator', icon: 'Users',
    hops: [['helpdesk-07', 'User · Tier 2', 'User'], ['adm-legacy', 'Admin, unused 400 days', 'UserCircle'], ['Domain Admins', 'Group · Tier 0', 'Crown']],
    edges: ['ForceChangePassword', 'MemberOf'], weak: 0,
    fix: 'Disable stale admin adm-legacy and remove the delegation', closes: 7 },
];

function Node({ n, tier0, cut }) {
  return (
    <div className={cx('flex items-center gap-2.5 rounded-[10px] border bg-bg-2 p-2.5', tier0 ? 'border-crit/40' : 'border-line', cut && 'opacity-40')}>
      <span className={cx('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]', tier0 ? 'bg-crit-50 text-crit' : 'bg-bg-2 text-ink-2')}><Icon name={n[2] === 'Crown' ? 'ShieldWarning' : n[2]} size={16} /></span>
      <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-ink">{n[0]}</span><span className="block truncate text-[12px] text-ink-3">{n[1]}</span></span>
    </div>
  );
}

export default function AdPathExplorer() {
  const [sel, setSel] = useState('phish');
  const [fixed, setFixed] = useState({});
  const P = PATHS.find((x) => x.id === sel);
  const done = fixed[P.id];
  const openPaths = 60 - PATHS.filter((x) => fixed[x.id]).reduce((a, x) => a + x.closes, 0);
  return (
    <AppFrame product="adapid" title="adapID AD Security" crumb="corp.example.in" status={<Badge tone={openPaths > 0 ? 'crit' : 'ok'} dot>{openPaths} paths to Tier 0</Badge>}>
      <div className="grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="border-b border-line bg-bg-2 p-3 lg:border-b-0 lg:border-r">
          <p className="app-label px-1">Start from</p>
          <ul className="mt-2 space-y-1.5">
            {PATHS.map((x) => (
              <li key={x.id}>
                <button type="button" aria-pressed={sel === x.id} onClick={() => setSel(x.id)} className={cx('flex w-full items-center gap-3 rounded-[10px] border p-2.5 text-left transition-colors', sel === x.id ? 'border-brand bg-brand-50' : 'border-transparent hover:bg-bg-1')}>
                  <Icon name={x.icon} size={17} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1"><span className="block truncate font-mono text-[13px] font-semibold text-ink">{x.start}</span><span className="block truncate t-caption">{x.kind}</span></span>
                  {fixed[x.id] ? <Badge tone="ok">Closed</Badge> : <Badge tone="crit">{x.hops.length - 1} hops</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14.5px] font-semibold text-ink">Path from <span className="font-mono">{P.start}</span> to Domain Admins</p>
            {done ? <Badge tone="ok" dot>Closed · verified by re-check</Badge> : <Badge tone="crit" dot>Open</Badge>}
          </div>
          <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
          <div key={P.id} className="fadein flex flex-col">
            {P.hops.map((n, i) => (
              <div key={n[0]} className="contents">
                <Node n={n} tier0={i === P.hops.length - 1} cut={done && i > P.weak} />
                {i < P.edges.length && (
                  <div className="flex h-9 items-center gap-2 pl-[22px]">
                    <span className={cx('h-full w-px', done && i >= P.weak ? 'bg-line' : i === P.weak ? 'bg-crit' : 'bg-line-2')} />
                    <span className={cx('rounded-[4px] px-1.5 py-0.5 font-mono text-[12px] font-semibold', done && i === P.weak ? 'bg-ok-50 text-ok line-through' : i === P.weak ? 'bg-crit-50 text-crit' : 'bg-bg-2 text-ink-2')}>{P.edges[i]}</span>
                    {done && i === P.weak && <Icon name="X" size={14} weight="bold" className="text-ok" />}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div>
          <div className="rounded-[12px] border border-line bg-bg-2 p-4">
            <p className="app-label">Top fix for this path</p>
            <p className="mt-1.5 text-[14.5px] font-semibold text-ink">{P.fix}</p>
            <p className="mt-1 t-small">Closes <span className="num font-semibold text-ink">{P.closes}</span> paths to Tier 0, including this one. Weakest link: <span className="font-mono">{P.edges[P.weak]}</span>.</p>
            {done ? (
              <p role="status" className="slide-in mt-3 flex items-center gap-2 rounded-[8px] bg-ok-50 px-3 py-2 text-[13px] font-medium text-ok"><Icon name="CheckCircle" size={16} weight="fill" />Fix applied and checked again: the path no longer reaches Domain Admins.</p>
            ) : (
              <button type="button" onClick={() => setFixed({ ...fixed, [P.id]: true })} className="btn btn-primary btn-sm mt-3"><Icon name="Wrench" size={15} />Apply fix and re-check</button>
            )}
          </div>
          {Object.keys(fixed).length > 0 && <button type="button" onClick={() => setFixed({})} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-3 hover:text-brand"><Icon name="ArrowCounterClockwise" size={14} />Reset the directory</button>}
          </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
