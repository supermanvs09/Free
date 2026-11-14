import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, Fingerprint, UserX } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel } from '../../ui/Panel';
import { DataGrid, CellStack } from '../../ui/DataGrid';
import { Pagination } from '../../ui/Pagination';
import { SearchInput } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { useView } from '../../data/store';
import { FORMER, IDENTITY_TYPES, PROVIDERS, SOURCE_PROVIDERS } from '../../data/world';
import { AppLogo, IdentityLogo } from '../../components/Logo';
import { Avatar, MiniBars, PersonName, RiskBar, StatusPill, Time } from '../../components/bits';
import { FacetSelect, ProviderFilter, useTable } from '../../components/listkit';
import { downloadCsv } from '../../lib/download';

export default function IdentitiesPage() {
  const view = useView();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const provider = params.get('provider') || '';
  const [q, setQ] = useState('');
  const [types, setTypes] = useState(params.get('type') ? [params.get('type')] : []);
  const [risk, setRisk] = useState([]);
  const [status, setStatus] = useState([]);
  const [env, setEnv] = useState([]);
  const [ownerFilter, setOwnerFilter] = useState([]);

  const setProvider = (p) => {
    const next = new URLSearchParams(params);
    if (p) next.set('provider', p);
    else next.delete('provider');
    next.delete('type');
    setParams(next, { replace: true });
    setTypes([]);
  };

  const findingsBy = useMemo(() => {
    const m = new Map();
    for (const f of view.findings) if (f.status === 'open' || f.status === 'in_progress') m.set(f.identityId, (m.get(f.identityId) || 0) + 1);
    return m;
  }, [view.findings]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return view.identities.filter((i) => {
      if (provider && i.provider !== provider) return false;
      if (types.length && !types.includes(i.type)) return false;
      if (risk.length && !risk.includes(i.riskLevel)) return false;
      if (status.length && !status.includes(i.status)) return false;
      if (env.length && !env.includes(i.environment)) return false;
      if (ownerFilter.includes('none') && i.owner) return false;
      if (ownerFilter.includes('former') && !FORMER.some((p) => p.id === i.owner)) return false;
      if (term && !`${i.name} ${i.locator} ${i.team} ${view.connById.get(i.connectionId)?.name}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [view, provider, types, risk, status, env, ownerFilter, q]);

  const table = useTable(filtered, { sort: { key: 'risk', direction: 'desc' }, getters: { findings: (r) => findingsBy.get(r.id) || 0, lastUsedAt: (r) => (r.lastUsedAt ? Date.parse(r.lastUsedAt) : 0) } });
  const counts = Object.fromEntries(SOURCE_PROVIDERS.map((p) => [p, view.identities.filter((i) => i.provider === p).length]));
  counts.all = view.identities.length;
  const typeOptions = Object.entries(IDENTITY_TYPES)
    .filter(([, t]) => !provider || t.provider === provider)
    .map(([k, t]) => ({ value: k, label: t.label, icon: <AppLogo name={t.logo} size={18} />, count: view.identities.filter((i) => i.type === k).length }))
    .filter((o) => o.count);

  const columns = [
    {
      key: 'name',
      header: 'Identity',
      width: '30%',
      primary: true,
      sortable: true,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <IdentityLogo type={r.type} size={30} />
          <CellStack title={r.name} meta={`${IDENTITY_TYPES[r.type].label} · ${r.locator}`} />
        </div>
      ),
    },
    { key: 'connection', header: 'Where', width: '16%', cell: (r) => <span className="flex min-w-0 items-center gap-1.5"><AppLogo name={PROVIDERS[r.provider].logo} size={18} /><span className="truncate text-[12.5px]">{view.connById.get(r.connectionId)?.name}</span><span className="shrink-0 rounded bg-surface-3 px-1 text-[10.5px] text-ink-3">{r.environment}</span></span> },
    { key: 'owner', header: 'Owner', width: '15%', priority: 'wide', cell: (r) => <span className="flex min-w-0 items-center gap-1.5"><Avatar refId={r.owner} size={20} /><PersonName refId={r.owner} className="text-[12.5px]" /></span> },
    { key: 'risk', header: 'Risk', width: '10%', sortable: true, cell: (r) => <RiskBar value={r.risk} /> },
    { key: 'findings', header: 'Findings', width: '8%', sortable: true, align: 'right', cell: (r) => <span data-numeric="" className={findingsBy.get(r.id) ? 'font-semibold text-ink' : 'text-ink-3'}>{findingsBy.get(r.id) || 0}</span> },
    { key: 'status', header: 'Status', width: '9%', priority: 'wide', cell: (r) => <StatusPill status={r.status} /> },
    { key: 'lastUsedAt', header: 'Last used', width: '12%', sortable: true, priority: 'wide', cell: (r) => <span className="flex flex-col gap-0.5"><Time at={r.lastUsedAt} className="text-[12.5px]" /><MiniBars values={r.series.slice(-14)} className="h-3.5" /></span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Identities"
        lede="Every non-human identity in every connected application: cloud roles and service principals, CI workflows and tokens, Vault roles."
        actions={<Button variant="secondary" icon={Download} onClick={() => downloadCsv('identities.csv', filtered.map((i) => ({ name: i.name, type: IDENTITY_TYPES[i.type].label, application: PROVIDERS[i.provider].short, where: view.connById.get(i.connectionId)?.name, environment: i.environment, owner: view.personByRef.get(i.owner)?.name || '', risk: i.risk, status: i.status, last_used: i.lastUsedAt || 'never', locator: i.locator })))}>Export CSV</Button>}
      />
      <ProviderFilter providers={SOURCE_PROVIDERS} value={provider} onChange={setProvider} counts={counts} />
      <Panel flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, ARN, object ID, team…" size="sm" className="w-full sm:w-72" />
          <FacetSelect label="Type" options={typeOptions} value={types} onChange={setTypes} />
          <FacetSelect label="Risk" value={risk} onChange={setRisk} options={['critical', 'high', 'medium', 'low'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), count: filtered.filter((i) => i.riskLevel === v).length }))} />
          <FacetSelect label="Status" value={status} onChange={setStatus} options={['active', 'dormant', 'stale', 'disabled'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
          <FacetSelect label="Environment" value={env} onChange={setEnv} options={['prod', 'staging', 'dev'].map((v) => ({ value: v, label: v }))} />
          <FacetSelect label="Ownership" value={ownerFilter} onChange={setOwnerFilter} options={[{ value: 'none', label: 'No owner' }, { value: 'former', label: 'Owner has left', icon: <UserX aria-hidden="true" className="size-3.5 text-ink-3" /> }]} />
          <span className="ml-auto text-[12px] text-ink-3" data-numeric="">{filtered.length} of {view.identities.length}</span>
        </div>
        <DataGrid
          columns={columns}
          rows={table.rows}
          rowKey={(r) => r.id}
          sort={table.sort}
          onSortChange={table.setSort}
          onRowClick={(r) => navigate(`/identities/${r.id}`)}
          rowAccent={(r) => ({ critical: 'var(--t-critical)', high: 'var(--t-high)', medium: 'var(--t-medium)', low: 'var(--t-low)' })[r.riskLevel]}
          emptyState={<EmptyState icon={Fingerprint} title="No identities match" description="Clear a filter or search for something else." />}
        />
        <div className="border-t border-line px-3 py-2">
          <Pagination page={table.page} pageSize={table.pageSize} total={table.total} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} unit="identities" />
        </div>
      </Panel>
    </div>
  );
}
