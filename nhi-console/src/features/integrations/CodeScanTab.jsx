import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, GitBranch, RefreshCcw, ShieldAlert } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { useAccess } from '../../app/useAccess';
import { fetchRepositories } from '../../lib/api/exposure';
import { verifyCodeSource } from '../../lib/api/hub';
import { useQuery } from '../../lib/hooks';
import { formatNumber, formatDate } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Field, Input, PasswordInput } from '../../ui/Field';
import { Panel, PanelHeader } from '../../ui/Panel';
import { ProviderIcon } from '../../ui/ProviderIcon';
import { useToast } from '../../ui/Toast';
import { AppHeader, CheckRows, Stat, When } from './hubParts';

export function CodeScanTab({ app, canManage }) {
  const key = app.key;
  const workspace = useWorkspace();
  const { can } = useAccess();
  const { notify } = useToast();
  const repos = useQuery((signal) => (can('exposure.view') ? fetchRepositories(signal) : Promise.resolve([])), [key]);
  const mine = (repos.data ?? []).filter((r) => r.platform === key);
  const [editing, setEditing] = useState(false);
  const [org, setOrg] = useState(app.org ?? '');
  const [baseUrl, setBaseUrl] = useState(app.base_url ?? '');
  const [token, setToken] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const verify = async (event) => {
    event?.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await verifyCodeSource(key, key === 'github' ? { org } : { base_url: baseUrl, ...(token ? { token } : {}) });
      notify({ variant: 'success', title: key === 'github' ? `GitHub organisation ${org} verified` : 'Bitbucket verified', description: 'Repositories are scanned on every push and once a day.' });
      setEditing(false);
      setToken('');
      workspace.refreshApps();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const findings = mine.reduce((s, r) => s + (Number(r.findings) || 0), 0);
  const expiry = key === 'bitbucket' && app.token_expires_at ? Math.round((Date.parse(app.token_expires_at) - Date.now()) / 86400000) : null;

  return (
    <>
      <Panel>
        <AppHeader
          app={app}
          actions={
            <>
              {can('exposure.view') && (
                <Button variant="secondary" size="sm" icon={ShieldAlert} as={Link} to={`/exposure?platform=${key}`}>
                  Open findings
                </Button>
              )}
              {canManage && (
                <Button variant="secondary" size="sm" icon={RefreshCcw} loading={saving && !editing} onClick={() => (editing ? setEditing(false) : verify())}>
                  Check again
                </Button>
              )}
            </>
          }
        >
          {key === 'github'
            ? 'A GitHub App reads every repository in the organisation (contents read-only). New pushes are scanned within a minute; history on request.'
            : 'An HTTP access token reads the projects you grant it on your Bitbucket Data Center. New pushes are scanned within a minute; history on request.'}
        </AppHeader>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={key === 'github' ? 'Organisation' : 'Server'} value={<span className="block truncate text-[14px]">{key === 'github' ? app.org : String(app.base_url ?? '').replace(/^https?:\/\//, '')}</span>} />
          <Stat label="Repositories" value={formatNumber(mine.length || app.repositories)} />
          <Stat label="Open findings" value={formatNumber(findings || app.findings)} hint={<span className="text-critical">traced to identities</span>} />
          <Stat label={expiry !== null ? 'Token expires' : 'Last verified'} value={<span className="text-[15px]">{expiry !== null ? `in ${expiry} days` : <When at={app.verified_at} />}</span>} hint={expiry !== null ? formatDate(app.token_expires_at) : null} />
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel flush className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <h3 className="text-[14px] font-semibold text-ink">Repositories</h3>
            <span className="text-[12px] text-ink-3">Scanned on every push</span>
          </div>
          {mine.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13px] text-ink-3">{repos.isLoading ? 'Loading…' : 'No repositories readable yet.'}</p>
          ) : (
            <ul className="divide-y divide-line">
              {mine.map((r) => (
                <li key={r.repository} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                  <ProviderIcon provider={key} size={15} decorative />
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block truncate font-mono text-[12.5px] text-ink">{r.repository}</span>
                    <span className="flex items-center gap-1 text-[11.5px] text-ink-3">
                      <GitBranch aria-hidden="true" className="size-3" />
                      {r.default_branch} · {r.branches.length} {r.branches.length === 1 ? 'branch' : 'branches'}
                    </span>
                  </span>
                  <span className="w-28 text-[12px] text-ink-3">
                    <When at={r.last_scanned_at} prefix="Scanned " />
                  </span>
                  <span className="w-24 text-right">
                    {r.findings ? (
                      <Link to={`/exposure?search=${encodeURIComponent(r.repository)}`} className="text-[12.5px] font-semibold text-critical hover:underline">
                        {formatNumber(r.findings)} {r.findings === 1 ? 'finding' : 'findings'}
                      </Link>
                    ) : (
                      <span className="text-[12.5px] text-low">Clean</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHeader title="Connection" subtitle={key === 'github' ? 'The organisation the GitHub App is installed on.' : 'Where Bitbucket is, and the token it reads with.'} />
            {!editing ? (
              <div className="mt-3 flex flex-col gap-3">
                <CheckRows checks={app.checks} />
                {canManage && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    {key === 'github' ? 'Change organisation' : 'Change server or token'}
                  </Button>
                )}
              </div>
            ) : (
              <form className="mt-3 flex flex-col gap-3" onSubmit={verify} noValidate>
                {key === 'github' ? (
                  <Field label="Organisation" htmlFor="gh-org" hint="As in github.com/<organisation>. Install the NHI Secret Scanner app on it first." error={error?.field === 'org' ? error.message : null}>
                    <Input id="gh-org" value={org} onChange={(e) => setOrg(e.target.value)} className="font-mono text-[12.5px]" />
                  </Field>
                ) : (
                  <>
                    <Field label="Bitbucket address" htmlFor="bb-url" error={error?.field === 'base_url' ? error.message : null}>
                      <Input id="bb-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono text-[12.5px]" />
                    </Field>
                    <Field label="New HTTP access token" htmlFor="bb-token" hint="Project read and Repository read. Leave empty to keep the current token." error={error?.field === 'token' ? error.message : null}>
                      <PasswordInput id="bb-token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
                    </Field>
                  </>
                )}
                {error && !error.field && <p className="text-[12.5px] text-critical">{error.message}</p>}
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" size="sm" loading={saving}>
                    Check and save
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </Panel>
          {key === 'github' && (
            <a href={`https://github.com/organizations/${app.org}/settings/installations`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-1 text-[12.5px] text-brand hover:underline">
              Manage the app installation on GitHub <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>
          )}
        </div>
      </div>
    </>
  );
}
