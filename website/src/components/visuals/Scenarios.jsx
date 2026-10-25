import { useRef } from 'react';
import { Mark, Tile, Chip, useScript, cx } from './kit.jsx';

const Avatar = ({ name, bg = '#0068ac', size = 32 }) => (
  <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ width: size, height: size, background: bg }}>{name.split(' ').map((w) => w[0]).join('')}</span>
);

/* Three short "what goes wrong" vignettes for the home page problem section.
   Each is a small piece of product UI that plays once in view, holds, then
   loops. Sample data only. Reduced motion shows the final frame. */
const Show = ({ on, className, children }) => (
  <div className={cx('transition-all duration-500', on ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0', className)}>{children}</div>
);

function Stage({ box, label, children }) {
  return (
    <div className="frame">
      <div ref={box} role="img" aria-label={label} className="relative flex h-[372px] flex-col overflow-hidden rounded-[14px] bg-white p-3.5 shadow-[0_1px_2px_rgba(11,18,32,.06)] sm:p-4">{children}</div>
    </div>
  );
}

/* 1. An AI agent steps outside its task. */
const A = [{ dur: 800 }, { dur: 1100 }, { dur: 1100 }, { dur: 1400 }, { dur: 3600 }];
const CALLS = [
  ['contracts.read', 'vendor-q3.pdf', 'In task', 'green'],
  ['m365.search', '3 years of mail', 'Beyond task', 'amber'],
  ['crm.export', 'to external address', 'Blocked', 'coral'],
];
export function AgentScenario() {
  const box = useRef(null);
  const { i } = useScript(A, box, A.length - 1);
  return (
    <Stage box={box} label="Illustration: an AI agent summarising a contract also tries to search three years of mail and export customer data. Deep Algorithms blocks the export before it runs.">
      <div className="flex items-center gap-2.5">
        <Tile name="copilot" size={34} />
        <div className="min-w-0"><p className="truncate text-[13px] font-semibold text-ink">invoice-agent</p><p className="truncate text-[11px] text-ink-3">Copilot Studio · Finance</p></div>
        <Chip tone="blue" className="ml-auto">AI agent</Chip>
      </div>
      <p className="mt-3 rounded-[8px] bg-mist px-2.5 py-1.5 text-[11.5px] text-ink-2"><span className="text-ink-3">Task </span>Summarise the Q3 vendor contract</p>
      <ul className="mt-3 space-y-2">
        {CALLS.map(([t, a, s, tone], k) => (
          <li key={t}>
            <Show on={i > k} className={cx('flex items-center gap-2 rounded-[10px] border px-2.5 py-2', tone === 'coral' ? 'border-coral bg-coral-soft' : 'border-line')}>
              <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-ink">{t}</span><span className="block truncate text-[11px] text-ink-3">{a}</span></span>
              <Chip tone={tone}>{s}</Chip>
            </Show>
          </li>
        ))}
      </ul>
      <Show on={i > 3} className="mt-auto flex items-center gap-2 rounded-[10px] bg-navy px-3 py-2 text-white">
        <Mark size={18} /><span className="flex-1 text-[11.5px] font-medium">Blocked before it ran</span><span className="text-[11px] text-white/70">4 ms</span>
      </Show>
    </Stage>
  );
}

/* 2. Machine identities pile up around one person. */
const M = [{ dur: 700 }, { dur: 420 }, { dur: 420 }, { dur: 420 }, { dur: 420 }, { dur: 420 }, { dur: 3800 }];
const LOGOS = ['aws', 'github', 'gitlab', 'snowflake', 'okta', 'jira', 'atlassian', 'cloudflare', 'n8n', 'zapier', 'cursor', 'claude', 'gemini', 'databricks', 'kubernetes'];
export function MachineScenario() {
  const box = useRef(null);
  const { i } = useScript(M, box, M.length - 1);
  const count = Math.min(15, i * 3);
  return (
    <Stage box={box} label="Illustration: one person and fifteen machine identities such as keys, roles and service accounts, one of which is 412 days old with no owner.">
      <div className="flex items-end justify-between">
        <div className="flex items-center gap-2.5"><Avatar name="Meera Pillai" bg="#7a4fd0" size={36} /><div><p className="text-[12.5px] font-semibold text-ink">Meera Pillai</p><p className="text-[11px] text-ink-3">Platform lead</p></div></div>
        <div className="text-right"><p className="font-display text-[34px] font-light leading-none tracking-[-0.03em] text-ink tabular-nums">{count}<span className="text-ink-3">:1</span></p><p className="text-[10.5px] text-ink-3">machine identities per person</p></div>
      </div>
      <ul className="mt-3.5 grid grid-cols-5 gap-2">
        {LOGOS.map((l, k) => (
          <li key={l} className={cx('flex aspect-square items-center justify-center rounded-[10px] border bg-white transition-all duration-500', k < count ? 'scale-100 opacity-100' : 'scale-75 opacity-0', i === 6 && k === 7 ? 'border-coral bg-coral-soft ring-2 ring-coral/30' : 'border-line')}>
            <Tile name={l} size={26} />
          </li>
        ))}
      </ul>
      <Show on={i === 6} className="mt-auto rounded-[10px] border border-coral bg-white p-2.5 shadow-[0_8px_24px_-12px_rgba(179,54,29,.5)]">
        <div className="flex items-center gap-2"><span className="text-[12px] font-semibold text-ink">AKIA••••7Q2F</span><Chip tone="coral">Critical</Chip></div>
        <p className="mt-0.5 text-[11px] text-ink-3">Access key · 412 days old · exposed in a repo · no owner</p>
      </Show>
    </Stage>
  );
}

/* 3. A stolen login looks like any other. */
const L = [{ dur: 700 }, { dur: 1200 }, { dur: 1400 }, { dur: 1500 }, { dur: 3600 }];
export function LoginScenario() {
  const box = useRef(null);
  const { i } = useScript(L, box, L.length - 1);
  const score = i >= 3 ? 94 : 12;
  return (
    <Stage box={box} label="Illustration: two sign-ins for the same user, one from Mumbai and one from Lagos two minutes later. Both show Success, but Deep Algorithms scores the second 94 out of 100 and holds the session.">
      <div className="flex items-center justify-between"><p className="text-[12.5px] font-semibold text-ink">Sign-in log</p><Tile name="okta" size={24} /></div>
      <ul className="mt-2.5 space-y-2">
        {[['Mumbai', 'Managed laptop', '09:12'], ['Lagos', 'New device', '09:14']].map(([city, dev, t], k) => (
          <li key={city}>
            <Show on={i > k} className="flex items-center gap-2.5 rounded-[10px] border border-line px-2.5 py-2">
              <Avatar name="Kavya Reddy" bg="#c4520a" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-ink">Kavya Reddy · {city}</span><span className="block truncate text-[11px] text-ink-3">{dev} · MFA passed · {t}</span></span>
              <Chip tone="green">Success</Chip>
            </Show>
          </li>
        ))}
      </ul>
      <Show on={i > 2} className="mt-3 rounded-[10px] bg-mist p-2.5">
        <div className="flex items-baseline justify-between"><span className="text-[11.5px] text-ink-2">Risk score</span><span className="font-display text-[26px] font-light leading-none tabular-nums text-coral-2">{score}</span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gradient-to-r from-[#3fc58a] via-[#f2b04a] to-coral transition-all duration-[1400ms] ease-out" style={{ width: `${score}%` }} /></div>
      </Show>
      <Show on={i > 3} className="mt-auto rounded-[10px] border border-coral bg-coral-soft p-2.5">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-coral-2">Impossible travel<Chip tone="coral">Session held</Chip></p>
        <p className="mt-0.5 text-[11px] text-ink-2">3 treasury reports exported in 90 seconds</p>
      </Show>
    </Stage>
  );
}
