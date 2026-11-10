import { useReducer, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, Cloud, EyeOff, Fingerprint, GitBranch, Lock, Network, PlugZap, RotateCcw, ScanSearch, ServerCog, ShieldCheck, Webhook } from 'lucide-react';
import { useWorkspace } from '../../app/WorkspaceContext';
import { formatNumber } from '../../lib/format';
import { PageHeader } from '../../shell/PageHeader';
import { Button } from '../../ui/Button';
import { Panel, PanelHeader } from '../../ui/Panel';
import { SegmentedControl } from '../../ui/Tabs';
import { cn } from '../../ui/cn';
import { CODE_CICD_DASHBOARD, readProgress } from './area';
import { GUIDES } from './integrationGuides';
import { SOURCE_MARKS } from './IntegrationGuides';
import IntegrationsPage from './IntegrationsPage';
import { AwsMark } from './parts';
import { SetupWizard, wizardPages } from './SetupWizard';

/* Links that predate the chooser (?add=1 to connect an account, ?exposure=,
   ?account=) still mean the AWS dashboard. */
const AWS_PARAMS = ['add', 'exposure', 'account'];

/**
 * Integrations. With VITE_CODE_CICD_DASHBOARD on, a choice comes first: the
 * AWS cloud dashboard, or Code & CI/CD for on-premises sources (GitHub,
 * Bitbucket Data Center, Jenkins). Each has its own dashboard, with a switch
 * between them. Off: the AWS dashboard alone, exactly as before.
 */
export default function IntegrationsHub() {
  const [params, setParams] = useSearchParams();
  if (!CODE_CICD_DASHBOARD) return <IntegrationsPage />;

  const area = params.get('area') || (AWS_PARAMS.some((key) => params.has(key)) ? 'aws' : '');
  const open = (value) => {
    setParams(value ? { area: value } : {}, { replace: false });
    globalThis.scrollTo({ top: 0 });
  };
  const switcher = <AreaSwitch current={area} onChange={open} />;

  if (area === 'aws') return <IntegrationsPage areaSwitch={switcher} />;
  if (area === 'code') return <CodeCicdDashboard areaSwitch={switcher} />;
  return <Chooser onOpen={open} />;
}

function AreaSwitch({ current, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => onChange('')}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-3.5" />
        All integrations
      </button>
      <SegmentedControl
        label="Integration area"
        options={[
          { value: 'aws', label: 'AWS cloud' },
          { value: 'code', label: 'Code & CI/CD' },
        ]}
        value={current}
        onChange={onChange}
      />
    </div>
  );
}

/* ── The choice ─────────────────────────────────────────────────────────── */

function useCodeProgress() {
  /* Re-read after the wizard saves; the values live in this browser. */
  const [, bump] = useReducer((n) => n + 1, 0);
  const progress = Object.fromEntries(
    Object.values(GUIDES).map((guide) => {
      const pages = wizardPages(guide);
      const saved = readProgress(guide.key);
      const done = pages.filter((page) => saved.done.includes(page.key)).length;
      return [guide.key, { done, total: pages.length, current: Math.min(saved.current, pages.length - 1), complete: done === pages.length }];
    }),
  );
  return { progress, refresh: bump };
}

function Chooser({ onOpen }) {
  const workspace = useWorkspace();
  const { progress } = useCodeProgress();
  const accounts = workspace.integration?.accounts ?? [];
  const connected = accounts.filter((account) => account.status === 'connected').length;
  const complete = Object.values(progress).filter((p) => p.complete).length;
  const started = Object.values(progress).filter((p) => p.done > 0).length;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="Integrations"
        lede="Choose what to connect. Your cloud and your on-premises code and build tools each have their own dashboard, and every connection is read-only."
      />

      <div className="grid gap-5 @min-[60rem]:grid-cols-2">
        <ChoiceCard
          tone="aws"
          marks={<AwsMark size="lg" />}
          badge={{ icon: Cloud, label: 'Cloud' }}
          title="Amazon Web Services"
          lede="Discover every non-human identity in your AWS accounts, score its posture and learn how it normally behaves."
          unlocks={[
            { icon: Fingerprint, text: 'Identity and credential inventory across accounts and regions' },
            { icon: ShieldCheck, text: 'Posture scores, findings and guided fixes' },
            { icon: ScanSearch, text: 'Behaviour baselines and anomalies (NHI Genome), CodeCommit secret scanning' },
          ]}
          status={
            accounts.length
              ? { tone: connected ? 'low' : 'medium', text: `${formatNumber(connected)} of ${formatNumber(accounts.length)} ${accounts.length === 1 ? 'account' : 'accounts'} connected` }
              : { tone: 'neutral', text: 'Not connected yet' }
          }
          action={accounts.length ? 'Open AWS dashboard' : 'Connect AWS'}
          onOpen={() => onOpen('aws')}
        />
        <ChoiceCard
          tone="code"
          marks={
            <span className="flex -space-x-2">
              {['github', 'bitbucket', 'jenkins'].map((key) => {
                const Mark = SOURCE_MARKS[key];
                return <Mark key={key} size="lg" className="ring-4 ring-surface" />;
              })}
            </span>
          }
          badge={{ icon: Building2, label: 'On-premises' }}
          title="Code & CI/CD"
          lede="Connect the source control and build server you run yourself, so leaked secrets and the credentials your pipelines hold are found too."
          unlocks={[
            { icon: GitBranch, text: 'GitHub and Bitbucket Data Center: secrets found on every push' },
            { icon: ServerCog, text: 'Jenkins: every stored credential and the pipelines that use it' },
            { icon: Webhook, text: 'Signed webhooks, read-only tokens, revocable at any time' },
          ]}
          status={
            complete
              ? { tone: 'low', text: `${complete} of 3 sources set up` }
              : started
                ? { tone: 'medium', text: `Setup in progress for ${started} of 3 sources` }
                : { tone: 'neutral', text: 'Not set up yet' }
          }
          action={started ? 'Open Code & CI/CD' : 'Set up Code & CI/CD'}
          onOpen={() => onOpen('code')}
        />
      </div>

      <p className="flex items-center justify-center gap-2 text-center text-[12px] text-ink-3">
        <EyeOff aria-hidden="true" className="size-3.5" />
        Nothing is ever written to your accounts, repositories or build server. Source code and secret values are never stored.
      </p>
    </div>
  );
}

const STATUS_DOT = { low: 'bg-low', medium: 'bg-medium', neutral: 'bg-ink-3/50' };

function ChoiceCard({ tone, marks, badge, title, lede, unlocks, status, action, onOpen }) {
  const Badge = badge.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group animate-rise relative flex flex-col overflow-hidden rounded-[calc(var(--radius-panel)+4px)] border border-line bg-surface p-6 text-left shadow-[var(--t-shadow-sm)]',
        'transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-brand',
      )}
    >
      {/* A wash of the area's colour behind the marks, so the two read apart at a glance. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-32',
          tone === 'aws' ? 'bg-[radial-gradient(120%_100%_at_0%_0%,rgba(255,153,0,0.12),transparent_70%)]' : 'bg-[radial-gradient(120%_100%_at_0%_0%,rgba(0,82,204,0.12),transparent_70%)]',
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        {marks}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-ink-2">
          <Badge aria-hidden="true" className="size-3.5" />
          {badge.label}
        </span>
      </div>
      <h2 className="relative mt-5 text-[20px] font-bold tracking-[-0.015em] text-ink">{title}</h2>
      <p className="relative mt-1.5 text-[13px] leading-relaxed text-ink-2">{lede}</p>
      <ul className="relative mt-4 flex flex-1 flex-col gap-2.5">
        {unlocks.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-ink-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-info-soft text-brand">
              <Icon aria-hidden="true" className="size-3.5" />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
          <span aria-hidden="true" className={cn('size-2 rounded-full', STATUS_DOT[status.tone])} />
          {status.text}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand">
          {action}
          <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

/* ── Code & CI/CD dashboard ─────────────────────────────────────────────── */

const REACH = [
  { icon: Network, title: 'Public URL with an IP allowlist', text: 'Expose the tool on a public URL and allow only adapID’s IP range.' },
  { icon: Lock, title: 'VPN or private link', text: 'Site-to-site VPN or AWS PrivateLink between adapID and your network.' },
  { icon: Building2, title: 'On-premises deployment', text: 'The adapID platform runs inside your network; nothing is exposed.' },
];

const GUARANTEES = [
  { icon: EyeOff, title: 'Read-only', text: 'Every token and permission is read-only. Nothing is written, run or changed.' },
  { icon: Lock, title: 'No secret values kept', text: 'Source code and full secret values are never stored; findings are redacted.' },
  { icon: Webhook, title: 'Signed webhooks', text: 'Push events are verified with HMAC-SHA256; unsigned or tampered ones are rejected.' },
  { icon: RotateCcw, title: 'Revoke in one step', text: 'Uninstall the App, revoke the token or delete the user: access ends at once.' },
];

function CodeCicdDashboard({ areaSwitch }) {
  const [open, setOpen] = useState(null);
  const { progress, refresh } = useCodeProgress();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Code & CI/CD"
        lede="The source control and build server you run yourself. Set each one up once; after that, scanning follows every push and build on its own."
        meta={areaSwitch}
      />

      <div className="grid gap-4 @min-[60rem]:grid-cols-3">
        {Object.values(GUIDES).map((guide, index) => {
          const Mark = SOURCE_MARKS[guide.key];
          const p = progress[guide.key];
          const state = p.complete
            ? { tone: 'low', label: 'Steps complete' }
            : p.done
              ? { tone: 'medium', label: `Step ${p.current + 1} of ${p.total}` }
              : { tone: 'neutral', label: 'Not set up' };
          return (
            <article
              key={guide.key}
              className="animate-rise flex flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-[var(--t-shadow-sm)]"
              data-stagger=""
              style={{ '--stagger': index }}
            >
              <div className="flex items-start justify-between gap-3">
                <Mark size="md" />
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    state.tone === 'low' ? 'border-low/30 bg-low-soft text-low' : state.tone === 'medium' ? 'border-medium/35 bg-medium-soft text-medium' : 'border-line bg-surface-2 text-ink-3',
                  )}
                >
                  {state.label}
                </span>
              </div>
              <h2 className="mt-4 text-[15.5px] font-semibold text-ink">{guide.name}</h2>
              <p className="text-[11.5px] text-ink-3">{guide.kind}</p>
              <p className="mt-2.5 flex-1 text-[12.5px] leading-relaxed text-ink-2">{guide.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {guide.reads.map((item) => (
                  <span key={item} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-2">
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-track" aria-hidden="true">
                <div className={cn('h-full rounded-full', p.complete ? 'bg-low' : 'bg-brand')} style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-[12px] text-ink-3">About {guide.minutes} min</span>
                <Button variant={p.complete ? 'secondary' : 'primary'} size="sm" icon={PlugZap} onClick={() => setOpen(guide.key)}>
                  {p.complete ? 'Review steps' : p.done ? 'Continue setup' : 'Start setup'}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="grid gap-4 @min-[60rem]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Panel prominence="quiet">
          <PanelHeader prominence="quiet" title="Reaching your on-premises tools" subtitle="Self-hosted tools must be reachable from the adapID platform. Pick the route your security team prefers." />
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {REACH.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-info-soft text-brand">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-ink">{title}</span>
                  <span className="block text-[12.5px] leading-relaxed text-ink-2">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel prominence="quiet">
          <PanelHeader prominence="quiet" title="What we promise" subtitle="The same for all three sources." />
          <ul className="mt-3 grid gap-3 @min-[30rem]:grid-cols-2">
            {GUARANTEES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-[var(--radius-control)] border border-line bg-surface p-3">
                <Icon aria-hidden="true" className="size-4 text-low" />
                <p className="mt-2 text-[12.5px] font-semibold text-ink">{title}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{text}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <p className="text-[11.5px] text-ink-3">Setup progress is kept in this browser. Connection status appears here once adapID has your connection details.</p>

      {open && <SetupWizard guide={GUIDES[open]} onClose={() => setOpen(null)} onProgress={refresh} />}
    </div>
  );
}
