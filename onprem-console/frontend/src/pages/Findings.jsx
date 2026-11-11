import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, CircleOff, RotateCcw, X } from 'lucide-react';
import { MANAGE_LOCK, useAuth } from '../auth';
import { api } from '../lib/api';
import { useDebouncedValue } from '../lib/hooks';
import { useApi } from '../lib/useApi';
import { DETECTOR_LABEL, SOURCE_LABEL, dateTime, timeAgo } from '../lib/format';
import { Button } from '../ui/Button';
import { SearchInput, Select } from '../ui/Field';
import { Drawer } from '../ui/Overlay';
import { PageHeader, Table } from '../ui/Page';
import { DetailList, DetailRow, Panel, SectionLabel } from '../ui/Panel';
import { Skeleton } from '../ui/Skeleton';
import { ClearState, EmptyState, ErrorState } from '../ui/States';
import { SeverityTag } from '../ui/Status';
import { Code, Tag } from '../ui/Tag';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';

const STATUS_TABS = [
  ['open', 'Open'],
  ['resolved', 'Resolved'],
  ['false_positive', 'False positive'],
  ['all', 'All'],
];
const STATUS_LABEL = { open: 'Open', resolved: 'Resolved', false_positive: 'False positive' };

const FIX = {
  private_key: 'Revoke the key pair where it is trusted, issue a new one, and keep it in a secrets manager.',
  aws_secret_access_key: 'Deactivate the access key in IAM, create a new one only if still needed, and load it from a secrets manager or a role.',
  aws_access_key_id: 'Find the matching secret, deactivate the key in IAM, and switch to a role or a secrets manager.',
  github_token: 'Revoke the token in GitHub (Settings → Developer settings) and use a GitHub App or an Actions secret instead.',
  github_fine_grained_token: 'Revoke the token in GitHub and use a GitHub App or an Actions secret instead.',
  stripe_live_key: 'Roll the key in the Stripe dashboard and keep the new one in your secrets manager.',
  slack_token: 'Revoke the token in the Slack app settings and reissue it.',
  slack_webhook: 'Regenerate the webhook URL in Slack; anyone with the old one can post to the channel.',
  google_api_key: 'Regenerate the key in Google Cloud and restrict it by API and referrer.',
  jwt: 'If it is a long-lived token, revoke it at its issuer; check whether it is a test fixture.',
  password_assignment: 'Change the password where it is used and read it from configuration or a secrets manager.',
};

function FindingDrawer({ finding, onClose, onChanged }) {
  const { canManage } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState('');
  if (!finding) return null;

  async function setStatus(status) {
    setBusy(status);
    try {
      await api(`/findings/${finding.id}`, { method: 'PATCH', body: { status } });
      notify({ variant: 'success', title: `Marked ${STATUS_LABEL[status].toLowerCase()}` });
      onChanged();
      onClose();
    } catch (error) {
      notify({ variant: 'error', title: 'Not changed', description: error.message });
    } finally {
      setBusy('');
    }
  }

  const lock = canManage ? undefined : MANAGE_LOCK;
  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={`${SOURCE_LABEL[finding.source]} · ${finding.repository}`}
      title={DETECTOR_LABEL[finding.detector] || finding.detector}
      subtitle={<span className="flex flex-wrap items-center gap-1.5"><SeverityTag severity={finding.severity} /><Tag size="sm">{STATUS_LABEL[finding.status]}</Tag></span>}
      footer={
        finding.status === 'open' ? (
          <>
            <Button icon={CircleOff} locked={lock} loading={busy === 'false_positive'} onClick={() => setStatus('false_positive')}>Not a secret</Button>
            <Button variant="primary" icon={CheckCircle2} locked={lock} loading={busy === 'resolved'} onClick={() => setStatus('resolved')}>Mark resolved</Button>
          </>
        ) : (
          <Button icon={RotateCcw} locked={lock} loading={busy === 'open'} onClick={() => setStatus('open')}>Reopen</Button>
        )
      }
    >
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        <div>
          <SectionLabel>Where it is</SectionLabel>
          <DetailList className="mt-1">
            <DetailRow label="File" mono>{finding.file_path}:{finding.line}</DetailRow>
            <DetailRow label="Branch" mono>{finding.branch || 'default'}</DetailRow>
            {finding.commit_sha && <DetailRow label="Commit" mono>{finding.commit_sha.slice(0, 12)}</DetailRow>}
            <DetailRow label="Value (redacted)"><Code>{finding.redacted}</Code></DetailRow>
            {finding.author && <DetailRow label="Pushed by">{finding.author}</DetailRow>}
            <DetailRow label="Found by">{finding.found_by === 'push' ? 'A push, as it landed' : 'A full scan'}</DetailRow>
            <DetailRow label="First seen">{dateTime(finding.first_seen)}</DetailRow>
            <DetailRow label="Last seen">{dateTime(finding.last_seen)}</DetailRow>
            {finding.status !== 'open' && <DetailRow label="Status set by">{finding.status_by} · {dateTime(finding.status_at)}</DetailRow>}
          </DetailList>
        </div>
        <div className="rounded-[var(--radius-control)] border border-line bg-surface-2 p-4">
          <SectionLabel>What to do</SectionLabel>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-ink-2">
            <li>{FIX[finding.detector] || 'Rotate the secret where it is used.'}</li>
            <li>Remove it from the code. Removing it alone is not enough: it stays in the Git history, so rotate first.</li>
            <li>The next push or scan that no longer sees it closes this finding on its own.</li>
          </ol>
        </div>
      </div>
    </Drawer>
  );
}

export default function Findings() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'open';
  const severity = params.get('severity') || '';
  const source = params.get('source') || '';
  const repository = params.get('repository') || '';
  const page = Number(params.get('page') || 1);
  const [text, setText] = useState(params.get('q') || '');
  const q = useDebouncedValue(text);
  const [selected, setSelected] = useState(null);

  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') || '') !== q) set({ q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const path = useMemo(() => {
    const s = new URLSearchParams({ status, page: String(page) });
    if (severity) s.set('severity', severity);
    if (source) s.set('source', source);
    if (repository) s.set('repository', repository);
    if (q) s.set('q', q);
    return `/findings?${s}`;
  }, [status, severity, source, repository, q, page]);
  const { data, error, loading, reload } = useApi(path);

  /* ?open=<id> from the overview opens that finding's drawer. */
  const openID = params.get('open');
  useEffect(() => {
    if (openID && data?.findings) {
      const hit = data.findings.find((x) => String(x.id) === openID);
      if (hit) setSelected(hit);
    }
  }, [openID, data]);
  const close = () => {
    setSelected(null);
    if (openID) set({ open: '' });
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;
  const filtered = severity || source || repository || q;

  return (
    <>
      <PageHeader title="Secrets in code" description="Each row is one secret in one file. Rotate it, remove it, and the next scan closes it." />
      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:p-4">
          <div role="tablist" aria-label="Status" className="flex flex-wrap gap-1">
            {STATUS_TABS.map(([value, label]) => (
              <button key={value} role="tab" type="button" aria-selected={status === value} onClick={() => set({ status: value === 'open' ? '' : value })}
                className={cn('h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors', status === value ? 'bg-brand text-white' : 'bg-surface-2 text-ink-2 hover:bg-surface-3')}>
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_160px_160px]">
            <SearchInput value={text} onChange={setText} placeholder="Search repository, file, type or author" />
            <Select aria-label="Severity" value={severity} onChange={(e) => set({ severity: e.target.value })} placeholder="Any severity"
              options={['critical', 'high', 'medium', 'low'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
            <Select aria-label="Source" value={source} onChange={(e) => set({ source: e.target.value })} placeholder="Any source"
              options={[{ value: 'github', label: 'GitHub' }, { value: 'bitbucket', label: 'Bitbucket' }]} />
          </div>
          {repository && (
            <div><Tag>Repository: {repository} <button type="button" aria-label="Clear repository filter" onClick={() => set({ repository: '' })}><X className="size-3" /></button></Tag></div>
          )}
        </div>
        {error && !data ? (
          <ErrorState error={error} onRetry={() => reload()} compact />
        ) : loading && !data ? (
          <div className="p-4"><Skeleton className="h-48 w-full" /></div>
        ) : data.findings.length === 0 ? (
          filtered ? (
            <EmptyState compact title="Nothing matches these filters" action={<Button size="sm" onClick={() => { setText(''); set({ severity: '', source: '', repository: '', q: '' }); }}>Clear filters</Button>} />
          ) : status === 'open' ? (
            <ClearState compact title="No open secrets" description="Every scanned file is clean. New pushes are checked as they land." />
          ) : (
            <EmptyState compact title={`No ${STATUS_LABEL[status]?.toLowerCase() || ''} findings`} />
          )
        ) : (
          <>
            <Table columns={['Severity', 'Secret', 'Where', 'Value', 'First seen']}>
              {data.findings.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setSelected(r)}>
                  <td className="px-4 py-3"><SeverityTag severity={r.severity} /></td>
                  <td className="px-4 py-3">
                    <button type="button" className="text-left font-medium text-ink hover:text-brand" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
                      {DETECTOR_LABEL[r.detector] || r.detector}
                    </button>
                    {r.status !== 'open' && <span className="ml-2 text-[11.5px] text-ink-3">{STATUS_LABEL[r.status]}</span>}
                  </td>
                  <td className="max-w-[360px] px-4 py-3">
                    <span className="block truncate text-ink">{r.repository}</span>
                    <span className="block truncate font-mono text-[11.5px] text-ink-3">{r.file_path}:{r.line}</span>
                  </td>
                  <td className="px-4 py-3"><Code className="max-w-[170px]">{r.redacted}</Code></td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink-3">{timeAgo(r.first_seen)}</td>
                </tr>
              ))}
            </Table>
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[12.5px] text-ink-3">
              <span data-numeric>{data.total.toLocaleString()} total</span>
              {pages > 1 && (
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" icon={ChevronLeft} disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>Previous</Button>
                  <span data-numeric>{page} / {pages}</span>
                  <Button size="sm" variant="ghost" iconRight={ChevronRight} disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next</Button>
                </span>
              )}
            </div>
          </>
        )}
      </Panel>
      <FindingDrawer finding={selected} onClose={close} onChanged={() => reload(true)} />
    </>
  );
}
