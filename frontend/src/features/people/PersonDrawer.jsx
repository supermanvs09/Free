import { KeyRound, LogIn, ShieldCheck, UsersRound } from 'lucide-react';
import { fetchHumanIdentity } from '../../lib/api/humanIdentities';
import { useQuery } from '../../lib/hooks';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';
import { CopyableValue } from '../../ui/Copyable';
import { Drawer } from '../../ui/Overlay';
import { DetailList, DetailRow, SectionLabel } from '../../ui/Panel';
import { DetailSkeleton } from '../../ui/Skeleton';
import { EmptyState, ErrorState } from '../../ui/States';
import { Tag } from '../../ui/Tag';
import { cn } from '../../ui/cn';
import { Avatar } from './parts';
import { SOURCE_LABEL, humanTypeLabel, personName, sessionLength, statusMeta } from './peopleMeta';

const RISK_TONE = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' };

/**
 * One person: who they are, what is wrong (the risk signals come first, as
 * plain sentences), what they can reach and which groups they are in. Values
 * wrap, so an ARN or a long permission-set name can always be read in full.
 */
export function PersonDrawer({ id, onClose }) {
  const open = Boolean(id);
  const query = useQuery((signal) => fetchHumanIdentity(id, signal), [id], { enabled: open, keepPrevious: false });
  const d = query.data;
  const status = d ? statusMeta(d.status) : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="xl"
      eyebrow={d ? (SOURCE_LABEL[d.source] ?? d.source) : 'Person'}
      title={d ? personName(d) : query.isLoading ? 'Loading…' : 'Person'}
      subtitle={d?.email || d?.user_name || undefined}
      header={
        d ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Avatar name={personName(d)} seed={d.email || d.user_name || d.id} size={30} />
            <Tag tone={status.tone} size="sm" dot>
              {status.label}
            </Tag>
            {d.human_type && (
              <Tag tone="neutral" size="sm">
                {humanTypeLabel(d.human_type)}
              </Tag>
            )}
            {d.title && <span className="text-[12px] text-ink-3">{d.title}</span>}
          </div>
        ) : null
      }
    >
      <div className="flex flex-col gap-6 px-4 py-4 sm:px-5">
        {query.isError && !d ? (
          query.error?.status === 404 ? (
            <EmptyState compact icon={UsersRound} title="This person was not found" description="They may be outside the accounts you have selected, or have been removed." />
          ) : (
            <ErrorState compact error={query.error} onRetry={query.refetch} />
          )
        ) : !d ? (
          <DetailSkeleton rows={8} />
        ) : (
          <>
            <section aria-label="Risks">
              <SectionLabel>Risks</SectionLabel>
              {d.risk_signals.length === 0 ? (
                <p className="mt-2 flex items-center gap-2 rounded-[var(--radius-control)] border border-low/30 bg-low-soft px-3 py-2.5 text-[12.5px] text-ink-2">
                  <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-low" />
                  Nothing stands out for this person.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {d.risk_signals.map((signal) => (
                    <li key={signal.label} className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-line px-3 py-2">
                      <Tag tone={RISK_TONE[signal.severity] ?? 'neutral'} size="sm" dot>
                        {signal.severity}
                      </Tag>
                      <span className="min-w-0 flex-1 text-[12.5px] text-ink">{signal.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Profile">
              <SectionLabel>Profile</SectionLabel>
              <DetailList className="mt-1">
                <DetailRow label="Signs in with">
                  {SOURCE_LABEL[d.source] ?? d.source}
                  {d.idp_name ? <span className="text-ink-3"> · {d.idp_name}</span> : null}
                </DetailRow>
                <DetailRow label="MFA">
                  <span className={cn('font-medium', d.mfa_active === true ? 'text-low' : d.mfa_active === false ? 'text-critical' : 'text-ink-3')}>
                    {d.mfa_active === true ? 'On' : d.mfa_active === false ? 'Off' : 'Not reported'}
                  </span>
                  {mfaTypes(d).length > 0 && <span className="text-ink-3"> · {mfaTypes(d).join(', ')}</span>}
                </DetailRow>
                <DetailRow label="Console access">{d.console_access === true ? 'Yes' : d.console_access === false ? 'No' : <span className="text-ink-3">Not reported</span>}</DetailRow>
                <DetailRow label="Last active">
                  {d.last_activity_at ? (
                    <span title={formatDateTime(d.last_activity_at)}>{formatRelative(d.last_activity_at)}</span>
                  ) : d.source === 'iam' ? (
                    <span className="font-medium text-medium">Never signed in</span>
                  ) : (
                    <span className="text-ink-3">Not reported</span>
                  )}
                </DetailRow>
                <DetailRow label="Account created">{d.created_at_source ? formatDateTime(d.created_at_source) : <span className="text-ink-3">Not reported</span>}</DetailRow>
                {d.account_id && <DetailRow label="AWS account" mono>{d.account_id}</DetailRow>}
                {d.arn && (
                  <DetailRow label="ARN">
                    <CopyableValue value={d.arn} />
                  </DetailRow>
                )}
                {d.external_id && (
                  <DetailRow label="External ID">
                    <CopyableValue value={d.external_id} />
                    {d.external_id_issuer ? <span className="mt-0.5 block text-[11.5px] text-ink-3">Issued by {d.external_id_issuer}</span> : null}
                  </DetailRow>
                )}
                <DetailRow label="Linked person">{d.person_id ? 'Yes - matched across sources' : <span className="text-ink-3">Not linked to a person</span>}</DetailRow>
                <DetailRow label="First seen">{formatDateTime(d.first_seen_at)}</DetailRow>
                <DetailRow label="Last seen">{formatDateTime(d.last_seen_at)}</DetailRow>
              </DetailList>
            </section>

            {d.sign_in && (
              <section aria-label="Console sign-in">
                <SectionLabel>Console sign-in</SectionLabel>
                <DetailList className="mt-1">
                  <DetailRow label="Last sign-in">
                    <SignInValue login={d.sign_in.last_success} />
                  </DetailRow>
                  <DetailRow label="Last failed sign-in">
                    <SignInValue login={d.sign_in.last_failure} failed />
                  </DetailRow>
                </DetailList>
              </section>
            )}

            <section aria-label="Credentials">
              <SectionLabel>
                Credentials <span data-numeric="" className="font-normal text-ink-3">{formatNumber((d.credentials ?? []).length)}</span>
              </SectionLabel>
              {(d.credentials ?? []).length === 0 ? (
                <p className="mt-2 text-[12.5px] text-ink-3">{d.source === 'iam' ? 'No password, access key or MFA device recorded.' : 'Single sign-on users sign in through their identity provider.'}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {d.credentials.map((c) => (
                    <CredentialRow key={c.id} credential={c} />
                  ))}
                </ul>
              )}
            </section>

            <section aria-label="Access">
              <SectionLabel>
                Access <span data-numeric="" className="font-normal text-ink-3">{formatNumber(d.access.length)}</span>
              </SectionLabel>
              {d.access.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-ink-3">No access recorded.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {d.access.map((a) => {
                    const name = a.permission_set_name || a.role_arn || a.policy_arn || a.access_type;
                    /* The API flags admin and escalation from the policy document too; older answers without the flags fall back to the name. */
                    const admin = a.is_admin ?? /admin/i.test(`${a.permission_set_name ?? ''} ${a.policy_arn ?? ''}`);
                    return (
                      <li key={a.id} className="rounded-[var(--radius-control)] border border-line px-3 py-2.5">
                        <div className="flex items-start gap-2.5">
                          <KeyRound aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-semibold [overflow-wrap:anywhere] text-ink">{name}</p>
                            <p className="mt-0.5 text-[11.5px] text-ink-3">
                              Account <span className="font-mono">{a.account_id}</span> · {String(a.access_type).replace(/_/g, ' ')} · via {a.granted_via}
                              {a.session_duration ? ` · ${sessionLength(a.session_duration)} sessions` : ''}
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-ink-3">{a.last_used_at ? `Last used ${formatRelative(a.last_used_at)}` : 'Never used'}</p>
                            {a.policy_document && (
                              <details className="mt-1.5">
                                <summary className="cursor-pointer text-[11.5px] font-medium text-brand">Policy document</summary>
                                <pre className="mt-1.5 max-h-56 overflow-auto rounded-[var(--radius-control)] bg-surface-2 p-2.5 font-mono text-[11px] leading-relaxed text-ink-2">
                                  {JSON.stringify(a.policy_document, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {admin && (
                              <Tag tone="high" size="sm">
                                Admin-level
                              </Tag>
                            )}
                            {a.has_escalation && (
                              <Tag tone="critical" size="sm">
                                Escalation risk
                              </Tag>
                            )}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-label="Groups">
              <SectionLabel>
                Groups <span data-numeric="" className="font-normal text-ink-3">{formatNumber(d.groups.length)}</span>
              </SectionLabel>
              {d.groups.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-ink-3">Not in any group.</p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {d.groups.map((g) => (
                    <li key={g.id}>
                      <Tag tone="neutral" size="sm" icon={UsersRound}>
                        {g.group_name || g.group_id}
                      </Tag>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}

const CREDENTIAL_LABEL = { ACCESS_KEY: 'Access key', PASSWORD: 'Console password', MFA_DEVICE: 'MFA device' };

/** Active MFA device types, e.g. ["virtual"]. */
function mfaTypes(d) {
  return [...new Set((d.credentials ?? []).filter((c) => c.credential_type === 'MFA_DEVICE' && c.status === 'active' && c.mfa_type).map((c) => String(c.mfa_type).toLowerCase()))];
}

function SignInValue({ login, failed = false }) {
  if (!login) return <span className="text-ink-3">{failed ? 'None recorded' : 'Not recorded'}</span>;
  return (
    <span className="block">
      <span title={login.at ? formatDateTime(login.at) : undefined} className={cn(failed && 'font-medium text-medium')}>
        {login.at ? formatRelative(login.at) : 'Date not recorded'}
      </span>
      <span className="mt-0.5 block text-[11.5px] text-ink-3">
        {[login.source_ip && <span key="ip" className="font-mono">{login.source_ip}</span>, login.region].filter(Boolean).reduce((acc, part, i) => (i ? [...acc, ' · ', part] : [part]), [])}
        {login.mfa_used === false && <span className="font-medium text-critical">{login.source_ip || login.region ? ' · ' : ''}without MFA</span>}
        {login.mfa_used === true && <span>{login.source_ip || login.region ? ' · ' : ''}with MFA</span>}
      </span>
    </span>
  );
}

function CredentialRow({ credential: c }) {
  const active = String(c.status).toLowerCase() === 'active';
  const age = c.last_rotated_at || c.created_at;
  const old = c.credential_type !== 'MFA_DEVICE' && age && Date.now() - Date.parse(age) > 90 * 86400000;
  return (
    <li className="rounded-[var(--radius-control)] border border-line px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        {c.credential_type === 'PASSWORD' ? (
          <LogIn aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
        ) : c.credential_type === 'MFA_DEVICE' ? (
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
        ) : (
          <KeyRound aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-ink-3" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-ink">
            {CREDENTIAL_LABEL[c.credential_type] ?? String(c.credential_type).replace(/_/g, ' ').toLowerCase()}
            {c.mfa_type ? <span className="font-normal text-ink-3"> · {String(c.mfa_type).toLowerCase()}</span> : null}
          </p>
          {c.credential_ref && c.credential_type !== 'PASSWORD' && <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3" title={c.credential_ref}>{c.credential_ref}</p>}
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            {age ? `${c.last_rotated_at ? 'Rotated' : 'Created'} ${formatRelative(age)}` : 'Created date not recorded'}
            {c.credential_type === 'ACCESS_KEY' && (c.last_used_at ? ` · last used ${formatRelative(c.last_used_at)}${c.last_used_service ? ` (${c.last_used_service})` : ''}` : ' · never used')}
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Tag tone={active ? 'low' : 'neutral'} size="sm" dot>
            {active ? 'Active' : c.status || 'Unknown'}
          </Tag>
          {active && old && (
            <Tag tone="high" size="sm">
              Older than 90 days
            </Tag>
          )}
        </span>
      </div>
    </li>
  );
}
