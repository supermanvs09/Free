import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, Clock, Copy, Mail, MessageSquare, ShieldAlert, Waypoints, Wrench, XCircle } from 'lucide-react';
import { Panel, PanelHeader, DetailList, DetailRow, SectionLabel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Tabs } from '../../ui/Tabs';
import { EmptyState } from '../../ui/States';
import { Meter } from '../../ui/Meter';
import { useToast } from '../../ui/Toast';
import { TrendChart } from '../../charts/TrendChart';
import { actions, PLAYBOOKS, useView } from '../../data/store';
import { CREDENTIAL_TYPES, FORMER, IDENTITY_TYPES, PROVIDERS } from '../../data/world';
import { eventsFor, LOG_SOURCE } from '../../data/events';
import { AppLogo, CredentialLogo, IdentityLogo } from '../../components/Logo';
import { AlsoViewing, Avatar, PersonPicker, ScoreRing, SeverityTag, StatusPill, Time } from '../../components/bits';
import { CommentThread, CreateTicketModal, EmailModal, TicketLink } from '../../components/collab';
import { RemediateModal } from '../../components/RemediateModal';
import { GenomeDetail } from '../genome/GenomePage';
import { formatDateTime, formatNumber } from '../../lib/format';
import { cn } from '../../ui/cn';

export default function IdentityPage() {
  const { id } = useParams();
  const view = useView();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const setTab = (t) => setParams({ tab: t }, { replace: true });
  const [modal, setModal] = useState(null);
  const i = view.idById.get(id);

  const data = useMemo(() => {
    if (!i) return null;
    return {
      creds: view.credentials.filter((c) => c.identityId === i.id),
      findings: view.findings.filter((f) => f.identityId === i.id),
      detections: view.detections.filter((d) => d.identityId === i.id),
      exposures: view.exposures.filter((x) => x.identityId === i.id),
      runs: view.runs.filter((r) => (r.targets || []).includes(i.id)),
      comments: view.commentsByTarget.get(`identity:${i.id}`) || [],
    };
  }, [view, i]);

  if (!i) {
    return (
      <Panel className="mt-4">
        <EmptyState title="This identity is no longer in the estate" description="It may belong to a connection that was removed, or it was deleted at the source." action={<Button as={Link} to="/identities" variant="primary" size="sm">Back to identities</Button>} />
      </Panel>
    );
  }

  const conn = view.connById.get(i.connectionId);
  const openFindings = data.findings.filter((f) => f.status === 'open' || f.status === 'in_progress');
  const former = FORMER.find((p) => p.id === i.owner);
  const ticketKeys = [...new Set([...data.findings, ...data.detections, ...data.exposures].map((x) => x.ticketKey).filter(Boolean))];

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'permissions', label: 'Permissions' },
    { value: 'credentials', label: 'Credentials', count: data.creds.length },
    { value: 'findings', label: 'Findings', count: openFindings.length },
    { value: 'behaviour', label: 'Behaviour' },
    { value: 'activity', label: 'Activity' },
    { value: 'discussion', label: 'Discussion', count: data.comments.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <header className="-mx-3 -mt-4 border-b border-line bg-canvas px-3 pt-4 sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
        <div className="mx-auto w-full max-w-[1760px]">
          <Link to="/identities" className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 hover:text-ink"><ArrowLeft aria-hidden="true" className="size-3.5" />Identities</Link>
          <div className="mt-2 flex flex-wrap items-start gap-4 pb-4">
            <IdentityLogo type={i.type} size={52} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-serif text-[28px] leading-tight font-normal tracking-[-0.02em] text-ink">{i.name}</h1>
                <StatusPill status={i.status} />
                {i.permissions.adminLike && <span className="rounded-full border border-high/30 bg-high-soft px-2 py-0.5 text-[11px] font-semibold text-high">{i.permissions.scopes[0]}</span>}
                {i.tags.map((t) => <span key={t} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">{t}</span>)}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                <span className="inline-flex items-center gap-1.5"><AppLogo name={PROVIDERS[i.provider].logo} size={18} />{PROVIDERS[i.provider].name}</span>·
                <span>{IDENTITY_TYPES[i.type].label}</span>·
                <span>{conn?.name} ({i.environment})</span>
              </p>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(i.locator).then(() => toast.notify({ title: 'Copied', variant: 'success', duration: 1800 }), () => {}); }} className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-inset px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 hover:border-line-strong" title="Copy">
                <span className="truncate">{i.locator}</span><Copy aria-hidden="true" className="size-3 shrink-0" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AlsoViewing path={`/identities/${i.id}`} />
              <Button variant="secondary" icon={Mail} onClick={() => setModal('email')}>Email owner</Button>
              <Button variant="secondary" icon={() => <AppLogo name="jira" size={16} tile={false} />} onClick={() => setModal('ticket')}>Jira issue</Button>
              <Button variant="primary" icon={Wrench} onClick={() => setModal('fix')}>Remediate</Button>
            </div>
          </div>
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
        </div>
      </header>

      {tab === 'overview' && (
        <div className="grid gap-4 @min-[72rem]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel prominence="lead">
              <div className="flex flex-wrap items-center gap-5">
                <ScoreRing value={i.risk} size={84} stroke={8} tone={{ critical: 'var(--t-critical)', high: 'var(--t-high)', medium: 'var(--t-medium)', low: 'var(--t-low)' }[i.riskLevel]} label="Risk" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold tracking-[0.1em] text-ink-3 uppercase">Risk {i.riskLevel}</p>
                  <p className="mt-1 text-[14px] font-semibold text-ink">{riskSentence(i, data, former)}</p>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {riskFactors(i, data, former).map((f) => (
                      <li key={f} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11.5px] text-ink-2">{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Activity, 30 days" subtitle={`Calls recorded in the ${LOG_SOURCE[i.provider]}.`} />
              {i.lastUsedAt ? (
                <TrendChart className="mt-3" variant="bar" data={i.series.map((v, k) => ({ label: new Date(Date.now() - (29 - k) * 864e5).toLocaleDateString([], { month: 'short', day: 'numeric' }), calls: v }))} dataKey="calls" label="Calls" height={150} />
              ) : (
                <p className="mt-3 text-[13px] text-ink-3">Never used since it was created on {formatDateTime(i.createdAt)}.</p>
              )}
            </Panel>
            {i.links.length > 0 && (
              <Panel>
                <PanelHeader title="Trust across applications" subtitle="Identities this one can become, or that can become it." actions={<Button as={Link} to={`/access-graph/${i.id}`} size="sm" variant="ghost" icon={Waypoints}>Open graph</Button>} />
                <ul className="mt-3 divide-y divide-line">
                  {i.links.map((l, k) => {
                    const other = view.idById.get(l.to || l.from);
                    if (!other) return null;
                    return (
                      <li key={k} className="flex items-center gap-3 py-2.5">
                        <span className="w-20 shrink-0 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{l.to ? 'Reaches' : 'Reached by'}</span>
                        <IdentityLogo type={other.type} size={26} />
                        <Link to={`/identities/${other.id}`} className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-ink hover:text-brand">{other.name}</span>
                          <span className="block truncate text-[11.5px] text-ink-3">{l.label} · {PROVIDERS[other.provider].short}</span>
                        </Link>
                        <SeverityTag severity={other.riskLevel} />
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Panel>
              <SectionLabel>Ownership</SectionLabel>
              <div className="mt-2">
                <PersonPicker value={i.owner} onChange={(ref) => actions.updateIdentity(i.id, { owner: ref })} label="Owner" />
              </div>
              {former && <p className="mt-2 rounded-md bg-high-soft px-2.5 py-1.5 text-[12px] text-high">{former.name} left on {new Date(former.departed).toLocaleDateString()}. Pick a new owner.</p>}
              {!i.owner && <p className="mt-2 rounded-md bg-medium-soft px-2.5 py-1.5 text-[12px] text-medium">Nobody is accountable for this identity.</p>}
              <p className="mt-2 text-[12px] text-ink-3">Team: {i.team}</p>
            </Panel>
            <Panel>
              <SectionLabel>Details</SectionLabel>
              <DetailList className="mt-1">
                <DetailRow label="Created"><Time at={i.createdAt} /> by {i.createdBy}</DetailRow>
                <DetailRow label="Last used"><Time at={i.lastUsedAt} /></DetailRow>
                {i.region && <DetailRow label="Region" mono>{i.region}</DetailRow>}
                <DetailRow label="Seen from">{i.countries.length ? i.countries.join(', ') : '-'}</DetailRow>
                {i.thirdParty && <DetailRow label="Vendor">{i.thirdParty}</DetailRow>}
                <DetailRow label="Reaches">
                  <span className="flex flex-wrap gap-1">{i.resources.map((r) => <code key={r} className="rounded bg-inset px-1 font-mono text-[11.5px]">{r}</code>)}</span>
                </DetailRow>
              </DetailList>
            </Panel>
            {(ticketKeys.length > 0 || data.runs.length > 0) && (
              <Panel>
                <SectionLabel>Work in progress</SectionLabel>
                <div className="mt-2 flex flex-col gap-2">
                  {ticketKeys.map((k) => <TicketLink key={k} ticketKey={k} />)}
                  {data.runs.slice(0, 3).map((r) => (
                    <Link key={r.id} to="/remediation" className="flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-[12.5px] hover:border-line-strong">
                      <Wrench aria-hidden="true" className="size-3.5 text-ink-3" />
                      <span className="min-w-0 flex-1 truncate">{r.playbookMeta?.title}</span>
                      <StatusPill status={r.status} pulse={r.status === 'running'} />
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </div>
      )}

      {tab === 'permissions' && <PermissionsTab i={i} />}
      {tab === 'credentials' && <CredentialsTab creds={data.creds} identity={i} onRotate={() => setModal('fix')} />}
      {tab === 'findings' && <FindingsTab findings={data.findings} identity={i} />}
      {tab === 'activity' && <ActivityTab i={i} />}
      {tab === 'behaviour' && <GenomeDetail identity={i} compact />}
      {tab === 'discussion' && (
        <Panel className="max-w-3xl">
          <PanelHeader title="Discussion" icon={MessageSquare} subtitle="Notes for whoever picks this up next." />
          <div className="mt-4"><CommentThread target={{ kind: 'identity', id: i.id }} /></div>
        </Panel>
      )}

      <RemediateModal open={modal === 'fix'} onClose={() => setModal(null)} identityIds={[i.id]} playbookId={openFindings[0]?.playbook} />
      <CreateTicketModal open={modal === 'ticket'} onClose={() => setModal(null)} link={openFindings[0] ? { kind: 'finding', id: openFindings[0].id } : { kind: 'identity', id: i.id }} defaults={{ summary: openFindings[0] ? `${openFindings[0].title}: ${i.name}` : `Review ${i.name}`, assignee: former ? null : i.owner, description: `${IDENTITY_TYPES[i.type].label} in ${conn?.name}.\n${i.locator}` }} />
      <EmailModal open={modal === 'email'} onClose={() => setModal(null)} link={{ kind: 'identity', id: i.id }} defaults={{ to: i.owner && !former ? [i.owner] : [], subject: `Action needed on ${i.name}`, body: `Hi,\n\nYou are listed as the owner of ${i.name} (${IDENTITY_TYPES[i.type].label}, ${conn?.name}).\n\n${openFindings.length ? `It has ${openFindings.length} open finding${openFindings.length > 1 ? 's' : ''}, the most serious: ${openFindings[0].title}.` : 'Please confirm it is still needed.'}\n\nThanks` }} />
    </div>
  );
}

function riskFactors(i, data, former) {
  const f = [];
  if (i.permissions.adminLike) f.push(`Holds ${i.permissions.scopes[0]}`);
  if (i.environment === 'prod') f.push('Production');
  if (i.status === 'stale') f.push('Unused 90+ days');
  if (former) f.push('Owner has left');
  if (!i.owner) f.push('No owner');
  if (data.exposures.some((x) => x.status === 'open')) f.push('Credential leaked');
  if (data.creds.some((c) => !c.expiresAt && /pat|token|secretid|apppassword/.test(c.type))) f.push('Never-expiring secret');
  if (i.links.length) f.push(`Trust with ${i.links.length} other identit${i.links.length === 1 ? 'y' : 'ies'}`);
  if (i.tags.includes('pci')) f.push('PCI scope');
  return f;
}
function riskSentence(i, data, former) {
  if (data.exposures.some((x) => x.status === 'open')) return 'A credential for this identity is exposed in source code.';
  if (i.permissions.adminLike) return `It can do almost anything, and used ${i.permissions.used} of ${formatNumber(i.permissions.granted)} permissions in 90 days.`;
  if (former) return 'Its owner has left, so nobody will notice if it is misused.';
  if (i.status === 'stale') return 'It has not been used in months but can still sign in.';
  return `Uses ${Math.round((i.permissions.used / Math.max(1, i.permissions.granted)) * 100)}% of what it is granted.`;
}

function PermissionsTab({ i }) {
  const pct = Math.round((i.permissions.used / Math.max(1, i.permissions.granted)) * 100);
  return (
    <div className="grid gap-4 @min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel prominence="lead">
        <PanelHeader prominence="lead" title="Granted versus used" subtitle="90 days of activity compared with every permission the identity holds." />
        <div className="mt-4 flex items-end gap-6">
          <div><p data-numeric="" className="font-display text-[34px] leading-none font-extrabold text-ink">{formatNumber(i.permissions.granted)}</p><p className="mt-1 text-[12px] text-ink-3">granted</p></div>
          <div><p data-numeric="" className="font-display text-[34px] leading-none font-extrabold text-brand">{formatNumber(i.permissions.used)}</p><p className="mt-1 text-[12px] text-ink-3">used</p></div>
          <div><p data-numeric="" className="font-display text-[34px] leading-none font-extrabold text-ink">{pct}%</p><p className="mt-1 text-[12px] text-ink-3">utilisation</p></div>
        </div>
        <Meter className="mt-4" value={pct} tone={pct < 10 ? 'critical' : pct < 40 ? 'medium' : 'low'} height={8} label="Permission utilisation" />
        <p className="mt-3 text-[12.5px] text-ink-2">{pct < 20 ? `Reducing to what is used removes ${formatNumber(i.permissions.granted - i.permissions.used)} permissions with no change in behaviour.` : 'Close to least privilege.'}</p>
      </Panel>
      <Panel>
        <PanelHeader title="Grants" subtitle="Highest-impact first." />
        <ul className="mt-3 divide-y divide-line">
          {i.permissions.scopes.map((s, k) => {
            const used = !/Administrator|Owner|admin|root|\*/.test(s) && k % 3 !== 2;
            return (
              <li key={s} className="flex items-center gap-3 py-2">
                {used ? <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-low" /> : <XCircle aria-hidden="true" className="size-4 shrink-0 text-ink-3" />}
                <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{s}</code>
                <span className={cn('text-[11.5px]', used ? 'text-low' : 'text-ink-3')}>{used ? 'Used' : 'Not used in 90 days'}</span>
              </li>
            );
          })}
        </ul>
        <SectionLabel className="mt-4">Resources reached</SectionLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">{i.resources.map((r) => <code key={r} className="rounded-md border border-line bg-inset px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{r}</code>)}</div>
      </Panel>
    </div>
  );
}

function CredentialsTab({ creds, identity, onRotate }) {
  if (!creds.length) {
    return <Panel><EmptyState icon={CheckCircle2} title="No long-lived secrets" description={identity.type === 'azure.mi' ? 'Managed identities get tokens from Azure; there is no secret to leak.' : 'This identity only receives short-lived credentials.'} /></Panel>;
  }
  return (
    <Panel flush>
      <ul className="divide-y divide-line">
        {creds.map((c) => {
          const overdue = c.rotationDays && c.ageDays > c.rotationDays;
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <CredentialLogo type={c.type} size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">{CREDENTIAL_TYPES[c.type].label}</p>
                <p className="truncate font-mono text-[11.5px] text-ink-3">{c.display}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">Stored in {c.storedIn}</p>
              </div>
              <div className="text-right text-[12px]">
                <p className={cn('font-semibold', overdue ? 'text-high' : 'text-ink')}>{c.ageDays} days old{overdue ? ` (policy ${c.rotationDays})` : ''}</p>
                <p className="text-ink-3">{c.expiresAt ? <>Expires <Time at={c.expiresAt} /></> : 'Never expires'} · used <Time at={c.lastUsedAt} /></p>
              </div>
              <StatusPill status={c.status} />
              {c.status === 'active' && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" icon={Clock} onClick={onRotate}>Rotate</Button>
                  <Button size="sm" variant="ghost" icon={Ban} onClick={() => actions.updateCredential(c.id, { status: 'revoked', revokedAt: new Date().toISOString() }, { verb: 'revoked', text: `${CREDENTIAL_TYPES[c.type].label} on ${identity.name}` })}>Revoke</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function FindingsTab({ findings, identity }) {
  const [fix, setFix] = useState(null);
  if (!findings.length) return <Panel><EmptyState icon={CheckCircle2} tone="positive" title="No findings" description="Every posture check passes for this identity." /></Panel>;
  return (
    <Panel flush>
      <ul className="divide-y divide-line">
        {findings.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <ShieldAlert aria-hidden="true" className={cn('size-4.5 shrink-0', { critical: 'text-critical', high: 'text-high', medium: 'text-medium', low: 'text-low' }[f.severity])} />
            <div className="min-w-0 flex-1">
              <Link to={`/findings?open=${f.id}`} className="text-[13px] font-semibold text-ink hover:text-brand">{f.title}</Link>
              <p className="text-[11.5px] text-ink-3">{f.ruleId} · {f.pillar} · first seen <Time at={f.firstSeenAt} /></p>
            </div>
            <SeverityTag severity={f.severity} />
            <StatusPill status={f.status} />
            {f.ticketKey && <TicketLink ticketKey={f.ticketKey} />}
            {(f.status === 'open' || f.status === 'in_progress') && <Button size="sm" variant="secondary" icon={Wrench} onClick={() => setFix(f)}>{PLAYBOOKS.find((p) => p.id === f.playbook)?.title || 'Fix'}</Button>}
          </li>
        ))}
      </ul>
      <RemediateModal open={Boolean(fix)} onClose={() => setFix(null)} identityIds={[identity.id]} playbookId={fix?.playbook} />
    </Panel>
  );
}

function ActivityTab({ i }) {
  const events = useMemo(() => eventsFor(i, 40), [i]);
  if (!events.length) return <Panel><EmptyState icon={Clock} title="No activity on record" description={`Nothing in the ${LOG_SOURCE[i.provider]} for this identity.`} /></Panel>;
  return (
    <Panel flush>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">Latest {events.length} entries</p>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3"><AppLogo name={PROVIDERS[i.provider].logo} size={16} />{LOG_SOURCE[i.provider]}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[12.5px]">
          <thead className="bg-surface-2 text-[11px] tracking-[0.06em] text-ink-3 uppercase">
            <tr><th className="px-4 py-2 font-semibold">When</th><th className="px-4 py-2 font-semibold">Action</th><th className="px-4 py-2 font-semibold">Target</th><th className="px-4 py-2 font-semibold">Source</th><th className="px-4 py-2 font-semibold">Result</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {events.map((e) => (
              <tr key={e.id} className="hover:bg-surface-2">
                <td className="px-4 py-2 whitespace-nowrap text-ink-2" title={formatDateTime(e.at)}><Time at={e.at} /></td>
                <td className="px-4 py-2 font-mono text-[12px] text-ink">{e.action}</td>
                <td className="max-w-[260px] truncate px-4 py-2 font-mono text-[12px] text-ink-2">{e.target}</td>
                <td className="px-4 py-2 text-ink-2">{e.source}</td>
                <td className="px-4 py-2">{e.result === 'denied' ? <span className="font-semibold text-critical">Denied</span> : <span className="text-low">Allowed</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
        <ArrowRight aria-hidden="true" className="size-3.5" /> Behaviour that leaves this pattern raises a detection.
        <Avatar refId="system" size={16} />
      </div>
    </Panel>
  );
}
