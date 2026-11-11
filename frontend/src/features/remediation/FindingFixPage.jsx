import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, ClipboardCopy, Hand, Info, Lock, Wand2 } from 'lucide-react';
import { createPlan, fetchFindingFix, fetchFindingPlans } from '../../lib/api/remediation';
import { useQuery } from '../../lib/hooks';
import { useAccess } from '../../app/useAccess';
import { formatRelative } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { Field, Input, Textarea } from '../../ui/Field';
import { Panel, PanelHeader, SectionLabel } from '../../ui/Panel';
import { DetailSkeleton } from '../../ui/Skeleton';
import { ErrorState } from '../../ui/States';
import { Tag } from '../../ui/Tag';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { FactRow, PlanStatusTag, RiskTag, SeverityTag, StepList } from './parts';

const OIDC_RULES = new Set(['STS-01', 'STS-04', 'EKS-04']);
const ARN = /^arn:aws:iam::\d{12}:\S+$/;
const lines = (text) =>
  String(text ?? '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/* What a fix needs from the person before a plan can be made (guide §5). */
function inputKind(fix, ruleId) {
  if (!fix || fix.manual) return null;
  if (fix.action_type === 'rewrite_trust') return OIDC_RULES.has(ruleId) ? 'oidc' : 'trust';
  if (fix.action_type === 'update_key_policy') return 'key';
  return null;
}

function ParamsForm({ kind, accountId, value, onChange, errors }) {
  const [more, setMore] = useState(false);
  if (kind === 'oidc') {
    return (
      <div className="flex flex-col gap-3">
        <Field label="OIDC subject the workload uses" htmlFor="p-sub" error={errors.oidc_sub} hint="For example repo:my-org/my-repo:ref:refs/heads/main">
          <Input id="p-sub" value={value.oidc_sub ?? ''} onChange={(e) => onChange({ ...value, oidc_sub: e.target.value })} />
        </Field>
        <Field label="Audience" htmlFor="p-aud" hint="Usually sts.amazonaws.com">
          <Input id="p-aud" value={value.oidc_aud ?? 'sts.amazonaws.com'} onChange={(e) => onChange({ ...value, oidc_aud: e.target.value })} />
        </Field>
      </div>
    );
  }
  if (kind === 'key') {
    return (
      <Field label="Principals to remove from the key policy" htmlFor="p-rm" error={errors.remove_principals} hint="One ARN per line">
        <Textarea id="p-rm" rows={3} className="font-mono text-[12px]" value={value.remove_principals ?? ''} onChange={(e) => onChange({ ...value, remove_principals: e.target.value })} />
      </Field>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Who may assume the role"
        htmlFor="p-keep"
        error={errors.keep_principals}
        hint={`One ARN per line. Your own account is filled in: arn:aws:iam::${accountId || '<account>'}:root`}
      >
        <Textarea id="p-keep" rows={3} className="font-mono text-[12px]" value={value.keep_principals ?? ''} onChange={(e) => onChange({ ...value, keep_principals: e.target.value })} />
      </Field>
      <button type="button" className="self-start text-[12.5px] font-medium text-brand hover:underline" onClick={() => setMore((m) => !m)}>
        {more ? 'Fewer options' : 'Add an ExternalId or AWS Organization'}
      </button>
      {more && (
        <>
          <Field label="ExternalId (optional)" htmlFor="p-ext" hint="Alone it does not fix a role any account can assume">
            <Input id="p-ext" value={value.external_id ?? ''} onChange={(e) => onChange({ ...value, external_id: e.target.value })} />
          </Field>
          <Field label="AWS Organization id (optional)" htmlFor="p-org" error={errors.org_id}>
            <Input id="p-org" placeholder="o-xxxxxxxxxx" value={value.org_id ?? ''} onChange={(e) => onChange({ ...value, org_id: e.target.value })} />
          </Field>
        </>
      )}
    </div>
  );
}

/* Turn the form into `params`, or field errors. */
function toParams(kind, value) {
  const errors = {};
  const params = {};
  if (kind === 'trust') {
    const keep = lines(value.keep_principals);
    const bad = keep.find((a) => !ARN.test(a));
    if (bad) errors.keep_principals = `Not an IAM ARN: ${bad}`;
    if (keep.length) params.keep_principals = keep;
    if (value.external_id?.trim()) params.external_id = value.external_id.trim();
    if (value.org_id?.trim()) {
      if (!/^o-[a-z0-9]{10,32}$/.test(value.org_id.trim())) errors.org_id = 'An Organization id looks like o-a1b2c3d4e5';
      else params.org_id = value.org_id.trim();
    }
    if (!keep.length && !params.org_id) errors.keep_principals = 'Name at least one principal (or an Organization).';
  } else if (kind === 'oidc') {
    if (!value.oidc_sub?.trim()) errors.oidc_sub = 'The subject is needed.';
    else params.oidc_sub = value.oidc_sub.trim();
    params.oidc_aud = (value.oidc_aud ?? 'sts.amazonaws.com').trim() || 'sts.amazonaws.com';
  } else if (kind === 'key') {
    const rm = lines(value.remove_principals);
    const bad = rm.find((a) => !ARN.test(a));
    if (!rm.length) errors.remove_principals = 'Name at least one principal.';
    else if (bad) errors.remove_principals = `Not an IAM ARN: ${bad}`;
    else params.remove_principals = rm;
  }
  return { params, errors };
}

function ModeOption({ icon: Icon, title, text, selected, disabled, reason }) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-[var(--radius-control)] border p-3',
        selected ? 'border-brand bg-info-soft/60' : 'border-line',
        disabled && 'opacity-60',
      )}
    >
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', selected ? 'bg-brand text-white' : 'bg-surface-3 text-ink-3')}>
        {disabled ? <Lock aria-hidden="true" className="size-4" /> : <Icon aria-hidden="true" className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ink">{title}</span>
        <span className="block text-[12px] leading-relaxed text-ink-3">{disabled ? reason : text}</span>
      </span>
    </div>
  );
}

export default function FindingFixPage() {
  const { findingId } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { can } = useAccess();
  const fixQuery = useQuery((signal) => fetchFindingFix(findingId, signal), [findingId]);
  const plansQuery = useQuery((signal) => fetchFindingPlans(findingId, signal).catch(() => []), [findingId]);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const d = fixQuery.data;
  const fix = d?.fix ?? null;
  const kind = inputKind(fix, d?.rule_id);
  const formValue = form ?? (kind === 'trust' ? { keep_principals: d?.account_id ? `arn:aws:iam::${d.account_id}:root` : '' } : {});
  const openPlan = useMemo(
    () => (plansQuery.data ?? []).find((p) => p.mode === 'GUIDED' && ['READY', 'DRAFT', 'WAITING_EXTERNAL'].includes(p.status)),
    [plansQuery.data],
  );
  const donePlan = useMemo(() => (plansQuery.data ?? []).find((p) => p.mode === 'GUIDED' && p.status === 'MANUALLY_DONE'), [plansQuery.data]);

  if (fixQuery.isError && !d) return <ErrorState error={fixQuery.error} onRetry={fixQuery.refetch} />;
  if (!d) {
    return (
      <Panel>
        <DetailSkeleton rows={8} />
      </Panel>
    );
  }

  const guided = d.modes?.guided ?? {};
  const oneClick = d.modes?.one_click ?? {};
  const canWrite = can('remediation.plan');

  const start = async () => {
    const { params, errors: errs } = kind ? toParams(kind, formValue) : { params: {}, errors: {} };
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { plan } = await createPlan({ findingIds: [findingId], mode: 'GUIDED', params });
      notify(
        plan.status === 'DRAFT'
          ? { variant: 'error', title: 'Plan made, but it needs input', description: plan.statusReason || 'Check the plan page.' }
          : { variant: 'success', title: 'Guided plan ready', description: 'Follow the steps, then mark it done.' },
      );
      navigate(`/remediation/plans/${encodeURIComponent(plan.id)}`);
    } catch (error) {
      setBusy(false);
      if (error?.field) setErrors({ [error.field]: error.message });
      notify({ variant: 'error', title: 'Could not start the fix', description: error?.message });
    }
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(d.summary_text || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard refused */
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={d.title || d.rule_name}
        lede={
          <span className="flex flex-wrap items-center gap-1.5">
            <SeverityTag severity={d.severity} />
            <Tag size="sm">{d.status === 'OPEN' ? 'Open' : String(d.status).toLowerCase()}</Tag>
            {fix?.manual && <Tag size="sm" tone="brand">Manual fix</Tag>}
          </span>
        }
        actions={
          <Button variant="secondary" as={Link} to="/remediation" icon={ArrowLeft}>
            Remediation
          </Button>
        }
      />

      <Panel>
        <FactRow
          items={[
            { label: 'Rule', value: `${d.rule_id} · ${d.rule_name}` },
            { label: 'Identity', value: `${d.identity_name}${d.identity_type ? ` (${String(d.identity_type).replace(/_/g, ' ').toLowerCase()})` : ''}` },
            d.account_id && { label: 'AWS account', value: d.account_id, copy: d.account_id },
            d.resource && { label: 'Resource', value: d.resource, copy: d.resource },
          ]}
        />
      </Panel>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <PanelHeader title="What is wrong" icon={AlertTriangle} />
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{d.description}</p>
            {d.why_it_matters && d.why_it_matters.trim() !== '-' && (
              <p className="mt-3 rounded-[var(--radius-control)] border border-high/25 bg-high-soft px-3.5 py-2.5 text-[13px] text-ink-2">
                <b className="font-semibold text-ink">Why it matters: </b>
                {d.why_it_matters}
              </p>
            )}
            {d.how_to_fix && (
              <>
                <SectionLabel className="mt-4">How to fix</SectionLabel>
                <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{d.how_to_fix}</p>
              </>
            )}
          </Panel>

          {fix ? (
            <Panel prominence="lead">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <SectionLabel>The fix</SectionLabel>
                  <h2 className="mt-1 text-[17px] font-bold text-ink">{fix.title}</h2>
                  <p className="mt-1 max-w-2xl text-[13px] text-ink-2">{fix.description}</p>
                </div>
                <span className="flex flex-wrap gap-1.5">
                  <RiskTag risk={fix.risk_level} />
                  {!fix.manual && <Tag size="sm">{fix.reversible ? 'Can be undone' : 'Cannot be undone'}</Tag>}
                </span>
              </div>
              {fix.manual && (
                <p className="mt-3 flex gap-2 rounded-[var(--radius-control)] bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-ink-2">
                  <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
                  No automatic fix exists for this rule. Follow the steps by hand.
                </p>
              )}
              <div className="mt-5">
                <SectionLabel className="mb-3">Steps {fix.manual ? '' : '(preview: the plan adds the exact file to paste)'}</SectionLabel>
                <StepList steps={fix.steps} />
              </div>
            </Panel>
          ) : (
            <Panel>
              <p className="text-[13px] text-ink-2">{guided.reason || 'No fix is recorded for this rule yet.'}</p>
            </Panel>
          )}
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-20">
          <Panel prominence="lead">
            <PanelHeader title="Fix it" subtitle="Nothing is changed in AWS from here: you apply the steps, then mark the plan done." />
            {openPlan ? (
              <div className="mt-4 flex flex-col gap-3">
                <p className="text-[13px] text-ink-2">
                  A guided plan already exists, made by {openPlan.createdBy || 'someone'} {formatRelative(openPlan.createdAt)}.
                </p>
                <PlanStatusTag status={openPlan.status} />
                <Button variant="primary" iconRight={ArrowRight} as={Link} to={`/remediation/plans/${encodeURIComponent(openPlan.id)}`}>
                  Continue the plan
                </Button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <ModeOption icon={Hand} title="Guided: do it yourself in AWS" text={guided.flow} selected={guided.available} disabled={!guided.available} reason={guided.reason} />
                <ModeOption
                  icon={Wand2}
                  title="One-click: let the platform fix it"
                  disabled
                  reason={oneClick.available ? 'Not offered in this console: every fix is applied by hand.' : oneClick.reason || 'Not available for this finding.'}
                />
                {donePlan && (
                  <p className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                    Marked done {formatRelative(donePlan.updatedAt)}; the next scan confirms it.{' '}
                    <Link className="font-medium text-brand hover:underline" to={`/remediation/plans/${encodeURIComponent(donePlan.id)}`}>
                      See the plan
                    </Link>
                  </p>
                )}
                {guided.available && kind && (
                  <div className="border-t border-line pt-3">
                    <SectionLabel className="mb-2">The fix needs your input</SectionLabel>
                    <ParamsForm kind={kind} accountId={d.account_id} value={formValue} onChange={setForm} errors={errors} />
                  </div>
                )}
                {guided.available && (
                  <Button variant="primary" size="lg" iconRight={ArrowRight} loading={busy} onClick={start} locked={canWrite ? undefined : 'Analysts, operators and admins can start a fix. Your role can read only.'}>
                    Start guided fix
                  </Button>
                )}
              </div>
            )}
          </Panel>
          {d.summary_text && (
            <Button variant="ghost" icon={ClipboardCopy} onClick={copyAll}>
              {copied ? 'Copied for a ticket' : 'Copy all, for a ticket'}
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
