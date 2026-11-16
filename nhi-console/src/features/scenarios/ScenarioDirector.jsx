import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, Clapperboard, Pause, Play, RotateCcw, SkipForward, Square, Subtitles, X } from 'lucide-react';
import { fetchScenarios, resetScenario, runScenario, setPresenting } from '../../lib/api/response';
import { useAccess } from '../../app/useAccess';
import { setWatcherPaused } from '../../lib/local/notifyBus';
import { cn } from '../../ui/cn';

/*
 * Live scenarios: each one replays on its own timeline, against the real
 * console. A step opens a screen, raises the event, or makes the same click a
 * person would (the cards pick up `?act=`), so what is recorded is the product
 * working, with captions for the video. Every run starts from a reset, so a
 * take can be repeated as often as needed.
 */

const SCRIPTS = {
  leak: {
    title: 'Leaked IAM key',
    narration: 'A developer commits an access key to a repo. Within minutes, it’s found.',
    close: 'Secret found, identity mapped, risk removed — in seconds.',
    length: 30,
    steps: (s) => [
      { at: 0, caption: 'A developer commits an AWS key', go: '/overview', peek: { kind: 'commit', key: s.leak.access_key_id } },
      { at: 5, caption: 'adapID detects it instantly', run: 'leak', go: '/alerts' },
      { at: 10, caption: 'Mapped to an admin identity — 4 accounts exposed', go: `/identities/${s.leak.identity_id}?tab=blast&act=map` },
      { at: 18, caption: 'Rotated before attackers reach it', go: `/identities/${s.leak.identity_id}?tab=blast&act=deactivate` },
      { at: 25, caption: 'Secret found, identity mapped, risk removed — in seconds.', close: true },
    ],
  },
  ec2: {
    title: 'EC2 role stolen via IMDS',
    narration: 'A web app has a vulnerability. Its EC2 role has admin.',
    close: 'The role could do anything. Now it can only do its job.',
    length: 32,
    steps: (s) => [
      { at: 0, caption: 'This server’s role has full admin', go: `/identities/${s.ec2.identity_id}` },
      { at: 6, caption: 'adapID: over-privileged — uses 4% of its access', run: 'ec2', go: `/identities/${s.ec2.identity_id}?act=usage` },
      { at: 12, caption: 'One app flaw = whole account exposed', go: `/identities/${s.ec2.identity_id}?tab=blast` },
      { at: 20, caption: `adapID right-sizes it — blast radius drops ${s.ec2.reduction_pct ?? 90}%`, go: `/identities/${s.ec2.identity_id}?tab=blast&act=lp-apply` },
      { at: 27, caption: 'The role could do anything. Now it can only do its job.', close: true },
    ],
  },
  chain: {
    title: 'Privilege escalation via AssumeRole chain',
    narration: 'A low-privilege role shouldn’t reach admin. This one can.',
    close: 'Attackers find these chains. So does adapID — first.',
    length: 31,
    steps: (s) => [
      { at: 0, caption: 'A harmless-looking role', go: `/identities/${s.chain.identity_id}?tab=permissions&act=quiet` },
      { at: 6, caption: 'But it can assume its way to admin', go: `/identities/${s.chain.identity_id}?tab=permissions&act=chain` },
      { at: 14, caption: 'adapID maps the full chain', run: 'chain', go: `/identities/${s.chain.identity_id}?tab=relationships&act=flag` },
      { at: 20, caption: 'One fix closes the path', go: `/identities/${s.chain.identity_id}?tab=relationships&act=fix` },
      { at: 23, go: `/identities/${s.chain.identity_id}?tab=relationships&act=break` },
      { at: 26, caption: 'Attackers find these chains. So does adapID — first.', close: true },
    ],
  },
  orphan: {
    title: 'Orphaned role after a Lambda is deleted',
    narration: 'The function is gone. Its access isn’t.',
    close: 'Forgotten identities are open doors. adapID closes them.',
    length: 25,
    steps: (s) => [
      { at: 0, caption: 'Function deleted — role left behind', run: 'orphan', go: '/alerts' },
      { at: 4, go: `/credentials?credential=${s.orphan.credential_id}` },
      { at: 6, caption: 'Still has access to your data stores', go: `/credentials?credential=${s.orphan.credential_id}` },
      { at: 13, caption: 'adapID flags it the day it’s orphaned', go: `/credentials?credential=${s.orphan.credential_id}&act=owner` },
      { at: 17, go: `/credentials?credential=${s.orphan.credential_id}&act=delete` },
      { at: 20, caption: 'Forgotten identities are open doors. adapID closes them.', close: true },
    ],
  },
  agent: {
    title: 'Runaway Bedrock AI agent',
    narration: 'An AI agent with a broad role starts acting on its own.',
    close: 'Every agent watched. Every departure caught.',
    length: 32,
    steps: (s) => [
      { at: 0, caption: 'An AI agent — with broad access', go: `/identities/${s.agent.identity_id}?tab=permissions` },
      { at: 6, caption: 'adapID learns its normal behavior', go: s.agent.genome ? `${s.agent.genome}?tab=genome` : `/identities/${s.agent.identity_id}` },
      { at: 12, caption: 'Then it does something it never has', run: 'agent', go: s.agent.genome ? `${s.agent.genome}?tab=anomalies` : `/identities/${s.agent.identity_id}` },
      { at: 20, caption: 'Flagged in real time — before data leaves', go: `/identities/${s.agent.identity_id}?act=detect` },
      { at: 24, go: `/identities/${s.agent.identity_id}?act=contain` },
      { at: 27, caption: 'Every agent watched. Every departure caught.', close: true },
    ],
  },
};
const ORDER = ['leak', 'ec2', 'chain', 'orphan', 'agent'];
const SESSION_KEY = 'nhi.scenarios.open';

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `0:${String(s).padStart(2, '0')}`;
}

export function ScenarioDirector() {
  const navigate = useNavigate();
  const { can } = useAccess();
  const allowed = can('scan.run') || can('integrations.manage');
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1' || new URLSearchParams(window.location.search).has('present');
    } catch {
      return false;
    }
  });
  const [state, setState] = useState(null);
  const [captions, setCaptions] = useState(true);
  const [play, setPlay] = useState(null); // { key, steps, startedAt, pausedAt, index }
  const [now, setNow] = useState(Date.now());
  const [peek, setPeek] = useState(null);
  const timers = useRef([]);

  const load = useCallback(async () => {
    try {
      const list = await fetchScenarios();
      setState(Object.fromEntries(list.map((x) => [x.key, x])));
      return Object.fromEntries(list.map((x) => [x.key, x]));
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, open ? '1' : '0');
    } catch {
      /* private window */
    }
    if (open) load();
  }, [open, load]);

  /* ⌘/Ctrl + Shift + L, or the command palette, opens it. */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scenarios:open', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scenarios:open', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!play || play.pausedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [play]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const doStep = useCallback(
    async (step) => {
      if (step.peek) setPeek(step.peek);
      else setPeek(null);
      if (step.run) await runScenario(step.run).catch(() => {});
      if (step.go) navigate(step.go);
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
        setTimeout(() => {
          setPlay((p) => (p ? { ...p, finished: true } : p));
          setPeek(null);
          load();
        }, (run.length - from) * 1000),
      );
    },
    [doStep, load],
  );

  const start = async (key) => {
    clearTimers();
    setPeek(null);
    await resetScenario(key).catch(() => {});
    const fresh = (await load()) ?? state;
    const script = SCRIPTS[key];
    const run = { key, title: script.title, steps: script.steps(fresh), length: script.length, startedAt: Date.now(), pausedAt: null, index: 0, offset: 0 };
    setPlay(run);
    setNow(Date.now());
    schedule(run, 0);
  };

  const elapsed = play ? (play.pausedAt ?? now) - play.startedAt : 0;
  const pause = () => {
    if (!play) return;
    if (play.pausedAt) {
      const shift = Date.now() - play.pausedAt;
      const resumed = { ...play, startedAt: play.startedAt + shift, pausedAt: null };
      setPlay(resumed);
      schedule(resumed, (Date.now() - resumed.startedAt) / 1000);
    } else {
      clearTimers();
      setPlay({ ...play, pausedAt: Date.now() });
    }
  };
  const next = () => {
    if (!play) return;
    const step = play.steps.find((s, i) => i > play.index);
    if (!step) return;
    const startedAt = Date.now() - step.at * 1000;
    const moved = { ...play, startedAt, pausedAt: null, index: play.steps.indexOf(step) };
    setPlay(moved);
    doStep(step);
    schedule(moved, step.at + 0.01);
  };
  const stop = () => {
    clearTimers();
    setPlay(null);
    setPeek(null);
    load();
  };
  const resetAll = async () => {
    stop();
    await resetScenario('all').catch(() => {});
    load();
  };

  useEffect(() => () => clearTimers(), []);

  /* Background detections wait while a take is being recorded. */
  const playing = Boolean(play && !play.finished);
  useEffect(() => {
    setWatcherPaused(playing);
    setPresenting(playing ? (play?.length ?? 30) + 15 : 0).catch(() => {});
    return () => setWatcherPaused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const caption = useMemo(() => {
    if (!play) return null;
    const passed = play.steps.filter((s) => s.caption && s.at * 1000 <= elapsed);
    return passed[passed.length - 1] ?? null;
  }, [play, elapsed]);

  if (!allowed) return null;

  return (
    <>
      {/* Captions for the recording */}
      {play && captions && caption && !play.finished && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex justify-center px-4" aria-live="polite">
          <div key={caption.caption} className={cn('animate-rise max-w-3xl rounded-2xl px-6 py-3.5 text-center shadow-[0_18px_50px_-20px_rgba(0,0,0,.55)]', caption.close ? 'bg-[linear-gradient(135deg,var(--t-brand)_0%,var(--t-accent,#7c3aed)_100%)] text-white' : 'bg-[#0b1220]/90 text-white backdrop-blur')}>
            <p className="text-[20px] leading-snug font-semibold tracking-[-0.01em] sm:text-[24px]">{caption.caption}</p>
          </div>
        </div>
      )}

      {/* The developer's side: the commit that leaks the key */}
      {peek?.kind === 'commit' && <CommitPeek accessKey={peek.key} />}

      {open &&
        (play && !play.finished ? (
          <div className="fixed bottom-4 left-4 z-[201] flex items-center gap-1 rounded-full border border-line bg-surface/95 py-1 pr-1 pl-3 shadow-lg backdrop-blur">
            <span className="relative mr-1 flex size-2">
              {!play.pausedAt && <span className="live-ping absolute inline-flex size-full rounded-full bg-[var(--t-critical,#b42318)]" />}
              <span className="relative inline-flex size-2 rounded-full bg-[var(--t-critical,#b42318)]" />
            </span>
            <span className="max-w-[180px] truncate text-[12px] font-semibold text-ink">{play.title}</span>
            <span data-numeric="" className="mx-1 text-[11.5px] text-ink-3 tabular-nums">
              {fmt(elapsed / 1000)} / {fmt(play.length)}
            </span>
            <IconBtn label={play.pausedAt ? 'Resume' : 'Pause'} onClick={pause} icon={play.pausedAt ? Play : Pause} />
            <IconBtn label="Next step" onClick={next} icon={SkipForward} />
            <IconBtn label="Captions" onClick={() => setCaptions((v) => !v)} icon={Subtitles} active={captions} />
            <IconBtn label="Stop" onClick={stop} icon={Square} />
          </div>
        ) : (
          <aside aria-label="Live scenarios" className="animate-pop fixed bottom-4 left-4 z-[201] w-[340px] overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-lg">
            <header className="flex items-center gap-2 border-b border-line bg-surface-2 px-3.5 py-2.5">
              <Clapperboard aria-hidden="true" className="size-4 text-brand" />
              <span className="flex-1 text-[13px] font-semibold text-ink">Live scenarios</span>
              <IconBtn label="Captions" onClick={() => setCaptions((v) => !v)} icon={Subtitles} active={captions} />
              <IconBtn label="Close" onClick={() => setOpen(false)} icon={X} />
            </header>
            <ul className="divide-y divide-line">
              {ORDER.map((key, i) => {
                const s = state?.[key];
                const status = s?.done ? 'Resolved' : s?.ran_at ? 'Live' : 'Ready';
                return (
                  <li key={key} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink-2">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">{SCRIPTS[key].title}</span>
                      <span className="block truncate text-[11px] text-ink-3">{SCRIPTS[key].narration}</span>
                    </span>
                    <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', status === 'Resolved' ? 'bg-low-soft text-low' : status === 'Live' ? 'bg-critical-soft text-critical' : 'bg-surface-3 text-ink-3')}>
                      {status === 'Resolved' ? <CheckCircle2 aria-hidden="true" className="-mt-px mr-0.5 inline size-3" /> : null}
                      {status}
                    </span>
                    <button type="button" onClick={() => start(key)} aria-label={`Play ${SCRIPTS[key].title}`} className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm transition-transform hover:scale-105">
                      <Play aria-hidden="true" className="ml-0.5 size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
            <footer className="flex items-center justify-between gap-2 border-t border-line px-3.5 py-2 text-[11px] text-ink-3">
              <span>
                <kbd className="rounded border border-line px-1 font-mono">⌘⇧L</kbd> show or hide
              </span>
              <button type="button" onClick={resetAll} className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
                <RotateCcw aria-hidden="true" className="size-3" /> Reset all
              </button>
            </footer>
            {play?.finished && (
              <div className="border-t border-line bg-low-soft/60 px-3.5 py-2 text-[11.5px] text-low">
                <ChevronDown aria-hidden="true" className="mr-1 inline size-3 rotate-[-90deg]" />
                {play.title} finished. Play again any time; it starts from a clean slate.
              </div>
            )}
          </aside>
        ))}
    </>
  );
}

function IconBtn({ label, onClick, icon: Icon, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn('grid size-7 place-items-center rounded-full transition-colors', active ? 'bg-info-soft text-brand' : 'text-ink-3 hover:bg-surface-3 hover:text-ink')}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
  );
}

/* What the developer pushed, as their Git host shows it. */
function CommitPeek({ accessKey }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[199] grid place-items-center bg-[#0b1220]/45 px-4 backdrop-blur-[2px]">
      <div className="animate-pop w-full max-w-xl overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117] font-mono text-[12.5px] text-[#c9d1d9] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[#30363d] bg-[#161b22] px-4 py-2.5 font-sans text-[12.5px]">
          <span className="grid size-5 place-items-center rounded-full bg-[#238636] text-[10px] font-bold text-white">RV</span>
          <span className="font-semibold text-white">Raju Varma</span>
          <span className="text-[#8b949e]">pushed to</span>
          <span className="rounded-full bg-[#1f6feb33] px-2 py-0.5 text-[11.5px] text-[#58a6ff]">main</span>
          <span className="ml-auto text-[#8b949e]">deepalgo-labs/payments-api</span>
        </div>
        <div className="border-b border-[#30363d] px-4 py-2 font-sans text-[13px] text-white">ci: add deploy creds for hotfix pipeline <span className="font-mono text-[11.5px] text-[#8b949e]">e3b9c41</span></div>
        <div className="border-b border-[#30363d] bg-[#161b22] px-4 py-1.5 text-[11.5px] text-[#8b949e]">deploy/.env.production</div>
        <div className="py-1.5">
          {[
            ['11', ' ', 'AWS_REGION=ap-south-1'],
            ['12', '+', `AWS_ACCESS_KEY_ID=${accessKey ?? 'AKIA****************'}`],
            ['13', '+', 'AWS_SECRET_ACCESS_KEY=wJal***********************************'],
            ['14', ' ', 'ECS_CLUSTER=payments-prod'],
          ].map(([n, sign, text]) => (
            <div key={n} className={cn('flex px-4', sign === '+' && 'bg-[#2ea04326]')}>
              <span className="w-7 shrink-0 text-right text-[#6e7681]">{n}</span>
              <span className={cn('w-5 shrink-0 text-center', sign === '+' ? 'text-[#3fb950]' : 'text-[#6e7681]')}>{sign}</span>
              <span className={sign === '+' ? 'text-[#aff5b4]' : ''}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
