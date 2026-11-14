import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CheckCircle2, ExternalLink, Eye, GitBranch, GitCommit, Globe, Lock, Mail, ShieldOff } from 'lucide-react';
import { PageHeader } from '../../shell/PageHeader';
import { Panel, SectionLabel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/States';
import { Tabs } from '../../ui/Tabs';
import { useToast } from '../../ui/Toast';
import { actions, useView } from '../../data/store';
import { CREDENTIAL_TYPES, PROVIDERS } from '../../data/world';
import { AppLogo, CredentialLogo, IdentityLogo } from '../../components/Logo';
import { AlsoViewing, StatusPill, Time } from '../../components/bits';
import { CommentThread, CreateTicketModal, EmailModal, TicketCard } from '../../components/collab';
import { useOpenParam } from '../../components/listkit';
import { RemediateModal } from '../../components/RemediateModal';
import { cn } from '../../ui/cn';



export default function ExposurePage() {
  const view = useView();
  const [openId, setOpen] = useOpenParam();
  const [tab, setTab] = useState('open');
  const list = useMemo(() => view.exposures.filter((x) => (tab === 'open' ? x.status === 'open' : tab === 'closed' ? x.status !== 'open' : true)), [view.exposures, tab]);
  const current = view.expById.get(openId) || list[0];
  useEffect(() => {
    if (!openId && list[0]) setOpen(list[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Leaked secrets"
        lede="Credentials committed to GitHub and Bitbucket. Every match is checked against the issuing application to see if it still works."
        tabs={<Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'Open', count: view.exposures.filter((x) => x.status === 'open').length }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />}
      />
      {list.length === 0 ? (
        <Panel><EmptyState icon={CheckCircle2} tone="positive" title="No open leaks" description="Every leaked secret has been revoked or dismissed." /></Panel>
      ) : (
        <div className="grid gap-4 @min-[72rem]:grid-cols-[380px_minmax(0,1fr)]">
          <Panel flush className="self-start">
            <ul className="divide-y divide-line">
              {list.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => setOpen(x.id)} className={cn('flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors', current?.id === x.id ? 'bg-info-soft' : 'hover:bg-surface-2')}>
                    <AppLogo name={PROVIDERS[x.provider].logo} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{x.repo}</span>
                      <span className="block truncate font-mono text-[11.5px] text-ink-3">{x.file}:{x.line}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {x.validated === 'live' ? <StatusPill status="live" /> : <StatusPill status="revoked" />}
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold', x.visibility === 'public' ? 'bg-critical-soft text-critical' : 'bg-surface-3 text-ink-2')}>
                          {x.visibility === 'public' ? <Globe aria-hidden="true" className="size-3" /> : <Lock aria-hidden="true" className="size-3" />}
                          {x.visibility}
                        </span>
                        <span className="text-[11px] text-ink-3"><Time at={x.detectedAt} /></span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {current && <ExposureDetail x={current} key={current.id} />}
        </div>
      )}
    </div>
  );
}

function ExposureDetail({ x }) {
  const view = useView();
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const cred = view.credById.get(x.credentialId);
  const identity = view.idById.get(x.identityId);
  const author = view.personByRef.get(x.authorRef);
  const host = x.provider === 'github' ? 'github.com' : 'bitbucket.org';
  const playbook = { 'aws.accesskey': 'pb-rotate-aws-key', 'azure.secret': 'pb-rotate-azure-secret', 'github.pat': 'pb-revoke-pat', 'github.finepat': 'pb-revoke-pat', 'vault.token': 'pb-revoke-vault-token', 'bitbucket.apppassword': 'pb-bb-token' }[x.secretType];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel prominence="lead">
        <div className="flex flex-wrap items-start gap-3">
          <CredentialLogo type={x.secretType} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">{x.id} · {CREDENTIAL_TYPES[x.secretType]?.label}</p>
            <h2 className="mt-0.5 text-[18px] font-bold tracking-[-0.015em] text-ink">{x.validated === 'live' ? 'A working secret is in source control' : 'A revoked secret is still in history'}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
              <span className="inline-flex items-center gap-1"><GitBranch aria-hidden="true" className="size-3.5" />{x.branch}</span>
              <span className="inline-flex items-center gap-1 font-mono"><GitCommit aria-hidden="true" className="size-3.5" />{x.commit.slice(0, 10)}</span>
              <span>committed <Time at={x.committedAt} /> by {x.author}{author?.former ? ' (has left)' : ''}</span>
              <span>· found <Time at={x.detectedAt} />{author?.former ? ' in a history rescan' : ''}</span>
            </p>
          </div>
          <AlsoViewing path={`/exposure?open=${x.id}`} />
        </div>
        <div className="mt-4 overflow-hidden rounded-[12px] border border-line bg-[#0d1117] text-[#c9d1d9]">
          <div className="flex items-center gap-2 border-b border-white/10 bg-[#161b22] px-3 py-2 text-[12px]">
            <AppLogo name={PROVIDERS[x.provider].logo} size={18} />
            <span className="truncate font-mono">{x.repo}/{x.file}</span>
            <a href={`https://${host}/${x.repo}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[#8b949e] hover:text-white">Open <ExternalLink aria-hidden="true" className="size-3" /></a>
          </div>
          <pre className="overflow-x-auto py-2 font-mono text-[12.5px] leading-[1.7]">
            {x.code.map((line, k) => (
              <div key={k} className={cn('flex px-3', k === x.highlight && 'bg-[#f8514926]')}>
                <span className="w-8 shrink-0 pr-3 text-right text-[#6e7681] select-none">{x.line - x.highlight + k}</span>
                <code className="whitespace-pre">{line || ' '}</code>
              </div>
            ))}
          </pre>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {x.status === 'open' && <Button variant="danger" icon={Ban} onClick={() => setModal('fix')}>Revoke and rotate</Button>}
          {!x.ticketKey && <Button variant="secondary" icon={() => <AppLogo name="jira" size={16} tile={false} />} onClick={() => setModal('ticket')}>Create Jira issue</Button>}
          <Button variant="secondary" icon={Mail} onClick={() => setModal('email')}>Email {x.author.split(' ')[0]}</Button>
          {x.status === 'open' ? (
            <>
              <Button variant="ghost" icon={CheckCircle2} onClick={() => { actions.updateExposure(x.id, { status: 'resolved' }, { verb: 'resolved', text: `leak in ${x.repo}` }); toast.notify({ variant: 'success', title: 'Leak resolved' }); }}>Mark resolved</Button>
              <Button variant="ghost" icon={ShieldOff} onClick={() => actions.updateExposure(x.id, { status: 'false_positive' }, { verb: 'dismissed', text: `leak in ${x.repo} as a false positive` })}>False positive</Button>
            </>
          ) : (
            <Button variant="ghost" icon={Eye} onClick={() => actions.updateExposure(x.id, { status: 'open' }, { verb: 'reopened', text: `leak in ${x.repo}` })}>Reopen</Button>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 @min-[60rem]:grid-cols-2">
        <Panel>
          <SectionLabel>What it unlocks</SectionLabel>
          {identity ? (
            <Link to={`/identities/${identity.id}`} className="mt-2 flex items-center gap-3 rounded-[10px] border border-line p-3 hover:border-line-strong">
              <IdentityLogo type={identity.type} size={34} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">{identity.name}</p>
                <p className="truncate text-[11.5px] text-ink-3">{identity.permissions.scopes.slice(0, 2).join(', ')}</p>
              </div>
            </Link>
          ) : <p className="mt-2 text-[12.5px] text-ink-3">Not matched to a known identity.</p>}
          {cred && <p className="mt-2 text-[12px] text-ink-3">Also stored in {cred.storedIn}. Status at the source: <StatusPill status={cred.status} /></p>}
          <p className="mt-3 text-[12.5px] text-ink-2">{x.visibility === 'public' ? 'The repository is public. Assume the secret has been collected by scanners within minutes of the push.' : `Anyone with read access to ${x.repo} can use it.`}</p>
        </Panel>
        <Panel>
          <SectionLabel>Tracking</SectionLabel>
          <div className="mt-2">{x.ticketKey ? <TicketCard ticketKey={x.ticketKey} /> : <p className="text-[12.5px] text-ink-3">No Jira issue yet.</p>}</div>
          <SectionLabel className="mt-4">Discussion</SectionLabel>
          <div className="mt-2"><CommentThread target={{ kind: 'exposure', id: x.id }} /></div>
        </Panel>
      </div>

      <RemediateModal open={modal === 'fix'} onClose={() => setModal(null)} identityIds={identity ? [identity.id] : []} playbookId={playbook} />
      <CreateTicketModal open={modal === 'ticket'} onClose={() => setModal(null)} link={{ kind: 'exposure', id: x.id }} defaults={{ summary: `Leaked ${CREDENTIAL_TYPES[x.secretType]?.label} in ${x.repo}`, type: 'Incident', priority: x.visibility === 'public' ? 'Highest' : 'High', assignee: author && !author.former ? author.ref : null, description: `${host}/${x.repo}/${x.file}#L${x.line}\nCommit ${x.commit}\n\n1. Revoke the secret at the source\n2. Rotate consumers\n3. Purge it from git history` }} />
      <EmailModal open={modal === 'email'} onClose={() => setModal(null)} link={{ kind: 'exposure', id: x.id }} defaults={{ to: author && !author.former ? [author.ref] : [], subject: `Secret committed to ${x.repo}`, body: `Hi ${x.author.split(' ')[0]},\n\nCommit ${x.commit.slice(0, 10)} on ${x.branch} adds a ${CREDENTIAL_TYPES[x.secretType]?.label} to ${x.file} (line ${x.line}).\n\nWe are rotating it now. Please remove it from the branch and use the secrets manager instead.\n\nThanks` }} />
    </div>
  );
}


