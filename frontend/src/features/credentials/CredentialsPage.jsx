import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, KeyRound } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel } from '../../ui/Panel';
import { DataGrid } from '../../ui/DataGrid';
import { Pagination } from '../../ui/Pagination';
import { SearchInput } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { useView } from '../../data/store';
import { CREDENTIAL_TYPES, PROVIDERS, SOURCE_PROVIDERS } from '../../data/world';
import { AppLogo, CredentialLogo } from '../../components/Logo';
import { StatusPill, Time } from '../../components/bits';
import { FacetSelect, ProviderFilter, useTable } from '../../components/listkit';
import { downloadCsv } from '../../lib/download';
import { cn } from '../../ui/cn';

export default function CredentialsPage() {
  const view = useView();
  const navigate = useNavigate();
  const [provider, setProvider] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const [flags, setFlags] = useState([]);
  const [status, setStatus] = useState(['active']);

  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return view.credentials.filter((c) => {
      const i = view.idById.get(c.identityId);
      if (provider && c.provider !== provider) return false;
      if (types.length && !types.includes(c.type)) return false;
      if (status.length && !status.includes(c.status)) return false;
      if (flags.includes('overdue') && !(c.rotationDays && c.ageDays > c.rotationDays)) return false;
      if (flags.includes('noexpiry') && c.expiresAt) return false;
      if (flags.includes('expiring') && !(c.expiresAt && Date.parse(c.expiresAt) - Date.now() < 30 * 864e5 && Date.parse(c.expiresAt) > Date.now())) return false;
      if (flags.includes('unused') && !(c.lastUsedAt === null || Date.now() - Date.parse(c.lastUsedAt) > 90 * 864e5)) return false;
      if (term && !`${i?.name} ${c.display} ${c.storedIn}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [view, provider, types, flags, status, q]);
  const table = useTable(rows, { sort: { key: 'ageDays', direction: 'desc' }, getters: { lastUsedAt: (c) => (c.lastUsedAt ? Date.parse(c.lastUsedAt) : 0), expiresAt: (c) => (c.expiresAt ? Date.parse(c.expiresAt) : Infinity) } });
  const typeOptions = Object.entries(CREDENTIAL_TYPES).map(([k, t]) => ({ value: k, label: t.label, icon: <AppLogo name={t.logo} size={18} />, count: view.credentials.filter((c) => c.type === k).length })).filter((o) => o.count && (!provider || k(o.value) === provider));
  function k(v) { return v.split('.')[0]; }

  const columns = [
    { key: 'type', header: 'Credential', primary: true, width: '30%', cell: (c) => <span className="flex min-w-0 items-center gap-2.5"><CredentialLogo type={c.type} size={28} /><span className="min-w-0"><span className="block truncate text-[13px] font-medium text-ink">{CREDENTIAL_TYPES[c.type].label}</span><span className="block truncate font-mono text-[11px] text-ink-3">{c.display}</span></span></span> },
    { key: 'identity', header: 'Identity', width: '20%', cell: (c) => { const i = view.idById.get(c.identityId); return <span className="min-w-0"><span className="block truncate text-[12.5px] text-ink">{i?.name}</span><span className="block truncate text-[11px] text-ink-3">{view.connById.get(i?.connectionId)?.name}</span></span>; } },
    { key: 'storedIn', header: 'Stored in', width: '18%', priority: 'wide', cell: (c) => <span className="block truncate text-[12px] text-ink-2" title={c.storedIn}>{c.storedIn}</span> },
    { key: 'ageDays', header: 'Age', width: '9%', sortable: true, align: 'right', cell: (c) => <span data-numeric="" className={cn('text-[12.5px]', c.rotationDays && c.ageDays > c.rotationDays ? 'font-semibold text-high' : 'text-ink')}>{c.ageDays}d</span> },
    { key: 'expiresAt', header: 'Expires', width: '10%', sortable: true, cell: (c) => (c.expiresAt ? <Time at={c.expiresAt} className={cn('text-[12px]', Date.parse(c.expiresAt) - Date.now() < 14 * 864e5 && 'font-semibold text-high')} /> : <span className="text-[12px] text-ink-3">Never</span>) },
    { key: 'lastUsedAt', header: 'Last used', width: '9%', sortable: true, priority: 'wide', cell: (c) => <Time at={c.lastUsedAt} className="text-[12px]" /> },
    { key: 'status', header: 'Status', width: '9%', cell: (c) => <StatusPill status={c.status} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Credentials"
        lede="The secrets your identities sign in with: access keys, client secrets, tokens, deploy keys, Vault secret IDs. Where each one lives and how old it is."
        actions={<Button variant="secondary" icon={Download} onClick={() => downloadCsv('credentials.csv', rows.map((c) => ({ type: CREDENTIAL_TYPES[c.type].label, identity: view.idById.get(c.identityId)?.name, application: PROVIDERS[c.provider].short, stored_in: c.storedIn, age_days: c.ageDays, expires: c.expiresAt || 'never', last_used: c.lastUsedAt || 'never', status: c.status })))}>Export CSV</Button>}
      />
      <ProviderFilter providers={SOURCE_PROVIDERS} value={provider} onChange={(p) => { setProvider(p); setTypes([]); }} counts={{ all: view.credentials.length, ...Object.fromEntries(SOURCE_PROVIDERS.map((p) => [p, view.credentials.filter((c) => c.provider === p).length])) }} />
      <Panel flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search identity, key prefix, store…" size="sm" className="w-full sm:w-72" />
          <FacetSelect label="Type" value={types} onChange={setTypes} options={typeOptions} />
          <FacetSelect label="Hygiene" value={flags} onChange={setFlags} options={[{ value: 'overdue', label: 'Past rotation policy' }, { value: 'noexpiry', label: 'Never expires' }, { value: 'expiring', label: 'Expires within 30 days' }, { value: 'unused', label: 'Unused 90+ days' }]} />
          <FacetSelect label="Status" value={status} onChange={setStatus} options={['active', 'inactive', 'expired', 'revoked'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
          <span className="ml-auto text-[12px] text-ink-3">{rows.length} credentials</span>
        </div>
        <DataGrid columns={columns} rows={table.rows} rowKey={(c) => c.id} sort={table.sort} onSortChange={table.setSort} onRowClick={(c) => navigate(`/identities/${c.identityId}?tab=credentials`)} emptyState={<EmptyState icon={KeyRound} title="No credentials match" description="Clear a filter to see more." />} />
        <div className="border-t border-line px-3 py-2"><Pagination page={table.page} pageSize={table.pageSize} total={table.total} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} unit="credentials" /></div>
      </Panel>
    </div>
  );
}
