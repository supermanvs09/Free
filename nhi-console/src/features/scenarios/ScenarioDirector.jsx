import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, Clapperboard, Hand, Play, Radio, RotateCcw, Subtitles, X } from 'lucide-react';
import { fetchScenarios, resetScenario, runScenario, setPresenting } from '../../lib/api/response';
import { useAccess } from '../../app/useAccess';
import { setWatcherPaused } from '../../lib/local/notifyBus';
import { cn } from '../../ui/cn';
import { clearStage, click, focus, hidePointer, release } from './stage';

/*
 * Live scenarios, for presenting and recording. Present only when the build
 * sets VITE_LIVE_REPLAY=on; then ⌘/Ctrl + Shift + L opens the panel and
 * nothing else in the console mentions it.
 *
 *   Replay  plays a scenario on its timeline against the real console: the
 *           camera moves in on each beat, a pointer clicks the real buttons,
 *           captions run underneath. Nothing else is on screen.
 *           Space pauses, → skips to the next beat, Esc stops, C captions.
 *   Live    raises one of the five alerts for real, so it can be handled by
 *           hand on camera. Reset puts it back without a trace, for everyone.
 */
export const LIVE_REPLAY = import.meta.env.VITE_LIVE_REPLAY === 'on';

const SCRIPTS = {
  leak: {
    title: 'Leaked IAM key',
    narration: 'A developer commits an access key to a repo. Within minutes, it’s found.',
    then: 'Open svc-deploy-bot, then Deactivate key.',
    length: 30,
    steps: (s) => [
      { at: 0, caption: 'A developer commits an AWS key', go: '/overview', peek: { kind: 'commit', key: s.leak.access_key_id } },
      { at: 5, caption: 'adapID detects it instantly', run: 'leak', go: '/alerts', focus: '[data-scene="alert-selected"]', max: 1.5 },
      { at: 10, caption: 'Mapped to an admin identity — 4 accounts exposed', go: `/identities/${s.leak.identity_id}?tab=blast`, focus: '[data-scene="exposure-card"]', max: 1.25 },
      { at: 14, focus: '[data-scene="mapped"]', max: 1.6 },
      { at: 18, caption: 'Rotated before attackers reach it', focus: '[data-scene="exposure-card"]', max: 1.25, click: '[data-scene="deactivate"]' },
      { at: 24, caption: 'Secret found, identity mapped, risk removed — in seconds.', close: true, release: true },
    ],
  },
  ec2: {
    title: 'EC2 role stolen via IMDS',
    narration: 'A web app has a vulnerability. Its EC2 role has admin.',
    then: 'Open payments-gateway-01, Generate least-privilege policy, Apply.',
    length: 32,
    steps: (s) => [
      { at: 0, caption: 'This server’s role has full admin', go: `/identities/${s.ec2.identity_id}`, focus: '[data-scene="overpriv-card"]', max: 1.2 },
      { at: 6, caption: 'adapID: over-privileged — uses 4% of its access', run: 'ec2', focus: '[data-scene="usage"]', max: 1.7 },
      { at: 12, caption: 'One app flaw = whole account exposed', go: `/identities/${s.ec2.identity_id}?tab=blast`, focus: '[data-scene="blast-verdict"]', max: 1.35 },
      { at: 18, caption: `adapID right-sizes it — blast radius drops ${s.ec2.reduction_pct ?? 90}%`, release: true, click: '[data-scene="generate-lp"]' },
      { at: 21, click: '[data-scene="apply-lp"]' },
      { at: 25, click: '[data-scene="lp-done"]' },
      { at: 26.5, focus: '[data-scene="overpriv-card"]', max: 1.2 },
      { at: 28, caption: 'The role could do anything. Now it can only do its job.', close: true },
    ],
  },
  chain: {
    title: 'Privilege escalation via AssumeRole chain',
    narration: 'A low-privilege role shouldn’t reach admin. This one can.',
    then: 'Open reporting-readonly, then Remove trust.',
    length: 31,
    steps: (s) => [
      { at: 0, caption: 'A harmless-looking role', go: `/identities/${s.chain.identity_id}?tab=permissions&act=quiet` },
      { at: 6, caption: 'But it can assume its way to admin', go: `/identities/${s.chain.identity_id}?tab=permissions&act=chain`, focus: '[data-scene="chain"]', max: 1.35 },
      { at: 14, caption: 'adapID maps the full chain', run: 'chain', focus: '[data-scene="chain-card"]', max: 1.2 },
      { at: 20, caption: 'One fix closes the path', focus: '[data-scene="fix"]', max: 1.45 },
      { at: 23, click: '[data-scene="remove-trust"]' },
      { at: 25, focus: '[data-scene="chain-card"]', max: 1.2 },
      { at: 27, caption: 'Attackers find these chains. So does adapID — first.', close: true },
    ],
  },
  orphan: {
    title: 'Orphaned role after a Lambda is deleted',
    narration: 'The function is gone. Its access isn’t.',
    then: 'Open the alert, then Delete role in the drawer.',
    length: 25,
    steps: (s) => [
      { at: 0, caption: 'Function deleted — role left behind', run: 'orphan', go: '/alerts', focus: '[data-scene="alert-selected"]', max: 1.5 },
      { at: 5, release: true, go: `/credentials?credential=${s.orphan.credential_id}` },
      { at: 6.5, caption: 'Still has access to your data stores', focus: '[data-scene="orphan-access"]', max: 1.6 },
      { at: 13, caption: 'adapID flags it the day it’s orphaned', focus: '[data-scene="orphan-owner"]', max: 1.6 },
      { at: 17, release: true, click: '[data-scene="delete-role"]' },
      { at: 20, caption: 'Forgotten identities are open doors. adapID closes them.', close: true },
    ],
  },
  agent: {
    title: 'Runaway Bedrock AI agent',
    narration: 'An AI agent with a broad role starts acting on its own.',
    then: 'Open support-copilot-agent, then Restrict to its baseline.',
    length: 32,
    steps: (s) => [
      { at: 0, caption: 'An AI agent — with broad access', go: `/identities/${s.agent.identity_id}?tab=permissions` },
      { at: 6, caption: 'adapID learns its normal behavior', go: s.agent.genome ? `${s.agent.genome}?tab=genome` : `/identities/${s.agent.identity_id}`, focus: '[data-scene="genome-normal"]', max: 1.15 },
      { at: 12, caption: 'Then it does something it never has', run: 'agent', release: true, go: s.agent.genome ? `${s.agent.genome}?tab=anomalies` : `/identities/${s.agent.identity_id}` },
      { at: 14, focus: '[data-scene="genome-anomalies"]', max: 1.5 },
      { at: 20, caption: 'Flagged in real time — before data leaves', go: `/identities/${s.agent.identity_id}`, focus: '[data-scene="anomaly-card"]', max: 1.25 },
      { at: 24, click: '[data-scene="contain"]' },
      { at: 27, caption: 'Every agent watched. Every departure caught.', close: true },
    ],
  },
};
const ORDER = ['leak', 'ec2', 'chain', 'orphan', 'agent'];
const LIVE_LINK = {
  leak: (s) => `/identities/${s.leak.identity_id}`,
  ec2: (s) => `/identities/${s.ec2.identity_id}`,
  chain: (s) => `/identities/${s.chain.identity_id}`,
  orphan: () => '/alerts',
  agent: (s) => `/identities/${s.agent.identity_id}`,
};

export function ScenarioDirector() {
  return LIVE_REPLAY ? <Director /> : null;
}

function Director() {
  const navigate = useNavigate();
  const { can } = useAccess();
  const allowed = can('scan.run') || can('integrations.manage');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('replay');
  const [state, setState] = useState(null);
  const [captions, setCaptions] = useState(true);
  const [play, setPlay] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [peek, setPeek] = useState(null);
  const [busy, setBusy] = useState(null);
  const [hold, setHold] = useState(true);
  /* A by-hand session lasts from opening the Live tab until Reset all, panel open or not. */
  const [session, setSession] = useState(false);
  const timers = useRef([]);

  const load = useCallback(async () => {
    try {
      const list = await fetchScenarios();
      const next = Object.fromEntries(list.map((x) => [x.key, x]));
      setState(next);
      return next;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const doStep = useCallback(
    async (step) => {
      setPeek(step.peek ?? null);
      if (step.run) await runScenario(step.run).catch(() => {});
      if (step.release) await release();
      if (step.go) navigate(step.go);
      if (step.focus) await focus(step.focus, { max: step.max });
      if (step.click) {
        await click(step.click);
        hidePointer();
      }
    },
    [navigate],
  );

  const schedule = useCallback(
    (run, from) => {
      clearTimers();
      run.steps.forEach((step, index) => {
        if (step.at < from) return;
        timers.current.push(
          setTimeout(() => {
            setPlay((p) => (p ? { ...p, index } : p));
            doStep(step);
          }, (step.at - from) * 1000),
        );
      });
      timers.current.push(
        setTimeout(async () => {
          setPlay(null);
          setPeek(null);
          await clearStage();
          load();
        }, (run.length - from) * 1000),
      );
    },
    [doStep, load],
  );

  const start = async (key) => {
    clearTimers();
    setOpen(false);
    setPeek(null);
    await clearStage();
    await resetScenario(key).catch(() => {});
    const fresh = (await load()) ?? state;
    const script = SCRIPTS[key];
    const run = { key, steps: script.steps(fresh), length: script.length, startedAt: Date.now(), pausedAt: null, index: -1 };
    setPlay(run);
    setNow(Date.now());
    schedule(run, 0);
  };

  const stop = useCallback(async () => {
    clearTimers();
    setPlay(null);
    setPeek(null);
    await clearStage();
    load();
  }, [load]);

  /* Keys: ⌘/Ctrl+Shift+L opens the panel; while a replay runs, Space, →, Esc, C. */
  const playRef = useRef(play);
  playRef.current = play;
  useEffect(() => {
    if (!allowed) return undefined;
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.target?.isContentEditable;
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      const p = playRef.current;
      if (!p || typing(e)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        stop();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (p.pausedAt) {
          const resumed = { ...p, startedAt: p.startedAt + (Date.now() - p.pausedAt), pausedAt: null };
          setPlay(resumed);
          schedule(resumed, (Date.now() - resumed.startedAt) / 1000);
        } else {
          clearTimers();
          setPlay({ ...p, pausedAt: Date.now() });
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const step = p.steps.find((s, i) => i > p.index);
        if (!step) return;
        const moved = { ...p, startedAt: Date.now() - step.at * 1000, pausedAt: null, index: p.steps.indexOf(step) };
        setPlay(moved);
        doStep(step);
        schedule(moved, step.at + 0.01);
      } else if (e.key.toLowerCase() === 'c') setCaptions((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowed, stop, schedule, doStep]);

  useEffect(() => {
    if (!play || play.pausedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [play]);

  /* Other detections wait while recording: during a replay, and in Live mode while "Hold" is on. */
  useEffect(() => {
    if (open && mode === 'live') setSession(true);
  }, [open, mode]);
  const holding = Boolean(play) || (session && hold);
  useEffect(() => {
    setWatcherPaused(holding);
    setPresenting(holding ? (play ? play.length + 15 : 1800) : 0).catch(() => {});
    return () => setWatcherPaused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding]);

  useEffect(() => () => clearTimers(), []);

  const elapsed = play ? (play.pausedAt ?? now) - play.startedAt : 0;
  const caption = useMemo(() => {
    if (!play) return null;
    const passed = play.steps.filter((s) => s.caption && s.at * 1000 <= elapsed);
    return passed[passed.length - 1] ?? null;
  }, [play, elapsed]);

  const raise = async (key) => {
    setBusy(key);
    await runScenario(key).catch(() => {});
    const fresh = await load();
    setBusy(null);
    if (fresh) navigate(LIVE_LINK[key](fresh));
  };
  const reset = async (key) => {
    setBusy(key);
    await resetScenario(key).catch(() => {});
    await load();
    setBusy(null);
  };

  if (!allowed) return null;

  return createPortal(
    <>
      {play && captions && caption && (
        <div className="pointer-events-none fixed inset-x-0 bottom-7 z-[320] flex justify-center px-4" aria-live="polite">
          <p
            key={caption.caption}
            className={cn(
              'animate-rise max-w-3xl rounded-[18px] px-7 py-4 text-center text-[21px] leading-snug font-semibold tracking-[-0.01em] text-white shadow-[0_24px_60px_-24px_rgba(0,0,0,.6)] sm:text-[26px]',
              caption.close ? 'bg-[linear-gradient(120deg,var(--t-brand),color-mix(in_oklab,var(--t-brand)_55%,#7c3aed))]' : 'bg-[#0b1220]/88 backdrop-blur-md',
            )}
          >
            {caption.caption}
          </p>
        </div>
      )}
      {play && play.pausedAt && (
        <div className="pointer-events-none fixed top-5 left-1/2 z-[320] -translate-x-1/2 rounded-full bg-[#0b1220]/80 px-3 py-1 text-[12px] font-medium text-white backdrop-blur">
          Paused · Space to resume
        </div>
      )}
      {peek?.kind === 'commit' && <CommitPeek accessKey={peek.key} />}

      {open && !play && (
        <aside aria-label="Live scenarios" className="animate-pop fixed bottom-5 left-5 z-[330] w-[380px] max-w-[calc(100vw-40px)] overflow-hidden rounded-[18px] border border-line bg-surface shadow-[0_30px_80px_-30px_rgba(8,14,26,.55)]">
          <header className="flex items-center gap-2.5 px-4 pt-4 pb-3">
            <span className="grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(135deg,var(--t-brand),color-mix(in_oklab,var(--t-brand)_55%,#7c3aed))] text-white">
              <Clapperboard aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold text-ink">Live scenarios</span>
              <span className="block text-[11.5px] text-ink-3">Only you see this panel</span>
            </span>
            <button type="button" onClick={() => setCaptions((v) => !v)} aria-pressed={captions} title="Captions" className={cn('grid size-8 place-items-center rounded-full', captions ? 'bg-info-soft text-brand' : 'text-ink-3 hover:bg-surface-2')}>
              <Subtitles aria-hidden="true" className="size-4" />
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
              <X aria-hidden="true" className="size-4" />
            </button>
          </header>
          <div className="mx-4 grid grid-cols-2 rounded-[11px] bg-surface-2 p-1 text-[12.5px] font-medium" role="tablist">
            {[
              ['replay', 'Replay', Play],
              ['live', 'Live, by hand', Hand],
            ].map(([key, label, Icon]) => (
              <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)} className={cn('flex items-center justify-center gap-1.5 rounded-[8px] py-1.5 transition-colors', mode === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}>
                <Icon aria-hidden="true" className="size-3.5" /> {label}
              </button>
            ))}
          </div>

          <ul className="mt-3 max-h-[55vh] overflow-y-auto border-t border-line">
            {ORDER.map((key, i) => {
              const s = state?.[key];
              const status = s?.done ? 'Resolved' : s?.ran_at ? 'Raised' : 'Ready';
              return (
                <li key={key} className="border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2 tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-ink">{SCRIPTS[key].title}</span>
                        {mode === 'live' && (
                          <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold', status === 'Resolved' ? 'bg-low-soft text-low' : status === 'Raised' ? 'bg-critical-soft text-critical' : 'bg-surface-3 text-ink-3')}>
                            {status === 'Resolved' && <CheckCircle2 aria-hidden="true" className="-mt-px mr-0.5 inline size-3" />}
                            {status}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{mode === 'live' && s?.ran_at && !s?.done ? `Next: ${SCRIPTS[key].then}` : SCRIPTS[key].narration}</p>
                    </div>
                    {mode === 'replay' ? (
                      <button type="button" onClick={() => start(key)} aria-label={`Play ${SCRIPTS[key].title}`} className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-brand/40">
                        <Play aria-hidden="true" className="ml-0.5 size-4" />
                      </button>
                    ) : null}
                  </div>
                  {mode === 'live' && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 pl-9">
                      <button type="button" disabled={busy === key} onClick={() => raise(key)} className="inline-flex items-center gap-1.5 rounded-full bg-critical px-3 py-1 text-[12px] font-semibold text-white hover:brightness-110 disabled:opacity-60">
                        <Radio aria-hidden="true" className="size-3.5" /> {s?.ran_at ? 'Raise again' : 'Raise alert'}
                      </button>
                      {s?.ran_at && state && (
                        <button type="button" onClick={() => navigate(LIVE_LINK[key](state))} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-ink-2 hover:bg-surface-2">
                          Open <ArrowUpRight aria-hidden="true" className="size-3.5" />
                        </button>
                      )}
                      {s?.ran_at && (
                        <button type="button" disabled={busy === key} onClick={() => reset(key)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-3 hover:bg-surface-2 hover:text-ink">
                          <RotateCcw aria-hidden="true" className="size-3.5" /> Reset
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-2.5 text-[11.5px] text-ink-3">
            {mode === 'replay' ? (
              <span>
                While it plays: <Kbd>Space</Kbd> pause <Kbd>→</Kbd> next <Kbd>Esc</Kbd> stop <Kbd>C</Kbd> captions
              </span>
            ) : (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} className="accent-[var(--t-brand)]" />
                Hold other detections while recording
              </label>
            )}
            <button
              type="button"
              onClick={async () => {
                await resetScenario('all').catch(() => {});
                setSession(mode === 'live' && open);
                load();
              }}
              className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
            >
              <RotateCcw aria-hidden="true" className="size-3" /> Reset all
            </button>
          </footer>
        </aside>
      )}
    </>,
    document.body,
  );
}

function Kbd({ children }) {
  return <kbd className="mx-0.5 rounded border border-line bg-surface px-1 font-mono text-[10.5px] text-ink-2">{children}</kbd>;
}

/* What the developer pushed, as their Git host shows it. */
function CommitPeek({ accessKey }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[310] grid place-items-center bg-[#0b1220]/45 px-4 backdrop-blur-[3px]">
      <div className="animate-pop w-full max-w-2xl overflow-hidden rounded-2xl border border-[#30363d] bg-[#0d1117] font-mono text-[13.5px] text-[#c9d1d9] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[#30363d] bg-[#161b22] px-5 py-3 font-sans text-[13px]">
          <span className="grid size-6 place-items-center rounded-full bg-[#238636] text-[10.5px] font-bold text-white">RV</span>
          <span className="font-semibold text-white">Raju Varma</span>
          <span className="text-[#8b949e]">pushed to</span>
          <span className="rounded-full bg-[#1f6feb33] px-2 py-0.5 text-[12px] text-[#58a6ff]">main</span>
          <span className="ml-auto text-[#8b949e]">deepalgo-labs/payments-api</span>
        </div>
        <div className="border-b border-[#30363d] px-5 py-2.5 font-sans text-[14px] text-white">
          ci: add deploy creds for hotfix pipeline <span className="font-mono text-[12px] text-[#8b949e]">e3b9c41</span>
        </div>
        <div className="border-b border-[#30363d] bg-[#161b22] px-5 py-1.5 text-[12px] text-[#8b949e]">deploy/.env.production</div>
        <div className="py-2">
          {[
            ['11', ' ', 'AWS_REGION=ap-south-1'],
            ['12', '+', `AWS_ACCESS_KEY_ID=${accessKey ?? 'AKIA****************'}`],
            ['13', '+', 'AWS_SECRET_ACCESS_KEY=wJal***********************************'],
            ['14', ' ', 'ECS_CLUSTER=payments-prod'],
          ].map(([n, sign, text]) => (
            <div key={n} className={cn('flex px-5', sign === '+' && 'bg-[#2ea04326]')}>
              <span className="w-7 shrink-0 text-right text-[#6e7681]">{n}</span>
              <span className={cn('w-6 shrink-0 text-center', sign === '+' ? 'text-[#3fb950]' : 'text-[#6e7681]')}>{sign}</span>
              <span className={sign === '+' ? 'text-[#aff5b4]' : ''}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
