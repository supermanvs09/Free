import { Icon, Reveal, cx } from './ui.jsx';

/* "What changes with …": one comparison per product, each in the form that suits
   its story. Zenstra sets an agent's five moments side by side, before and
   after; adapID races two timelines of the same stolen password; ICMS answers
   the auditor's questions. */

/* ---------- Zenstra: five moments, before and after ---------- */
const ZEN = [
  ['Discover', 'Agents found after an incident, one platform at a time', 'One inventory of every agent, each with a named owner'],
  ['Access', 'Standing keys and service accounts with broad scope', 'Grants scoped to the task that expire on their own'],
  ['Act', 'Logs that show what happened, after it happened', 'Every action decided inline, before it runs'],
  ['Stop', 'A separate switch in every vendor to stop one agent', 'One revocation stops an agent everywhere, in seconds'],
  ['Prove', 'Evidence pulled together by hand for every exam', 'A tamper-evident record, exported as evidence'],
];

/* Before and after, side by side, the way enterprise pages show a change:
   the old way muted, the new way lit, the same five moments in each. */
export function ZenCompare() {
  const acc = 'var(--color-zen)';
  const Col = ({ on }) => (
    <div className={on ? 'chg-with' : 'chg-without'} style={{ '--acc': acc }}>
      <div className="flex items-center justify-between gap-3 px-6 pb-4 pt-6 md:px-7">
        <p className="text-[13px] font-semibold uppercase tracking-[.1em]" style={{ color: on ? acc : 'var(--color-crit)' }}>{on ? 'With Zenstra' : 'Without Zenstra'}</p>
        <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={on ? { background: 'color-mix(in oklab, var(--color-ok) 14%, transparent)', color: 'var(--color-ok)' } : { background: 'color-mix(in oklab, var(--color-crit) 12%, transparent)', color: 'var(--color-crit)' }}>{on ? 'Decided before it runs' : 'Found after the incident'}</span>
      </div>
      <ol className="px-3 pb-3 md:px-4 md:pb-4">
        {ZEN.map(([moment, off, onText], i) => (
          <Reveal as="li" key={moment} delay={(on ? 300 : 0) + i * 90} className="flex gap-3.5 rounded-[14px] px-3 py-3.5 md:px-3.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={on ? { background: acc, color: '#fff' } : { background: 'color-mix(in oklab, var(--color-crit) 12%, transparent)', color: 'var(--color-crit)' }}>
              <Icon name={on ? 'Check' : 'X'} size={15} weight="bold" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3"><span className="num mr-1.5">{String(i + 1).padStart(2, '0')}</span>{moment}</span>
              <span className={on ? 'mt-0.5 block text-[16px] font-medium leading-snug text-ink' : 'mt-0.5 block text-[15.5px] leading-snug text-ink-3'}>{on ? onText : off}</span>
            </span>
          </Reveal>
        ))}
      </ol>
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Col on={false} />
      <Col on />
    </div>
  );
}

/* ---------- adapID: the same stolen password, two endings ---------- */
const WITHOUT = [
  ['Day 0 · 02:14', 'Login from a new device. The password and MFA both pass.'],
  ['Day 3', 'A mailbox rule starts forwarding invoices outside.'],
  ['Day 12', 'Three years of finance files are exported.'],
  ['Day 47', 'Found during an audit. The data is long gone.'],
];
const WITH = [
  ['02:14:00', 'The same login. Risk jumps to 94: new device, Lagos, two hours after Mumbai.'],
  ['02:14:01', 'Session held. Kavya gets a step-up on her own phone.'],
  ['02:15', 'Kavya says it was not her. Sessions revoked, password reset.'],
  ['02:16', 'The SOC gets the case, with every reason attached.'],
];

function Lane({ title, items, tone, end, delay = 0 }) {
  const col = tone === 'crit' ? 'var(--color-crit)' : 'var(--color-adap)';
  return (
    <div className={cx('p-6 md:p-8', tone === 'crit' ? 'chg-without' : 'chg-with')} style={{ '--acc': col }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[.1em]" style={{ color: col }}>{title}</p>
        <p className="flex items-center gap-2 text-[14px] text-ink-2"><span className="num font-semibold text-ink">{end[0]}</span><span className="rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: tone === 'crit' ? 'color-mix(in oklab, var(--color-crit) 12%, transparent)' : 'color-mix(in oklab, var(--color-ok) 14%, transparent)', color: tone === 'crit' ? 'var(--color-crit)' : 'var(--color-ok)' }}>{end[1]}</span></p>
      </div>
      <ol className="relative mt-7 grid gap-6 md:grid-cols-4 md:gap-5">
        <span aria-hidden="true" className="absolute left-[11px] top-3 bottom-3 w-px md:left-3 md:right-3 md:top-[11px] md:bottom-auto md:h-px md:w-auto" style={{ background: `color-mix(in oklab, ${col} 35%, transparent)` }} />
        {items.map(([when, what], i) => (
          <Reveal as="li" key={when} delay={delay + i * 140} className="relative pl-9 md:pl-0 md:pt-9">
            <span aria-hidden="true" className="absolute left-0 top-0 grid h-[23px] w-[23px] place-items-center rounded-full border-2" style={{ borderColor: col, background: 'var(--color-bg-1)' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: col }} />
            </span>
            <span className="num block text-[13px] font-semibold" style={{ color: col }}>{when}</span>
            <span className="mt-1 block text-[15.5px] leading-snug text-ink-2">{what}</span>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}

export function IdentityTimelines() {
  return (
    <div className="space-y-4">
      <Lane title="Without adapID" tone="crit" items={WITHOUT} end={['47 days inside', '0 alerts']} />
      <Lane title="With adapID" tone="adap" items={WITH} end={['2 minutes', 'nothing lost']} delay={300} />
      <p className="text-[13px] text-ink-3">An illustration of one session, with sample names and times.</p>
    </div>
  );
}

/* ---------- ICMS: the auditor's questions ---------- */
const ASKS = [
  ['Where does our customers’ personal data live?', 'A spreadsheet from last year’s data survey', 'Weeks', 'A live inventory by store, category and owner', 'Now'],
  ['Who opened this customer’s record, and why?', 'Logs in five systems, none of them with a purpose', 'Days', 'Every access tied to an identity and its declared purpose', 'Seconds'],
  ['Did we have consent when we used it?', 'Consent in one tool, processing in another', 'Days', 'A consent ledger per principal, checked on every access', 'Seconds'],
  ['Can you report this breach within 72 hours?', 'Records scoped by hand, against the clock', 'Unsure', 'Affected records and principals scoped, the report drafted from evidence', 'Hours'],
  ['Show us the evidence.', 'Collected from every team, one request at a time', 'Weeks', 'One audit package mapped to DPDPA, RBI and SEBI', 'Minutes'],
];

export function AuditorQuestions() {
  return (
    <ol className="space-y-3">
      {ASKS.map(([q, today, t1, icms, t2], i) => (
        <Reveal as="li" key={q} delay={i * 60} className="card grid gap-4 p-5 md:grid-cols-[1.05fr_1fr_1fr] md:items-center md:gap-8 md:p-6">
          <p className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: 'color-mix(in oklab, var(--color-icms) 16%, transparent)', color: 'var(--color-icms)' }}><Icon name="ChatCircleText" size={16} /></span>
            <span><span className="block text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">The auditor asks</span><span className="mt-0.5 block text-[17px] font-semibold leading-snug tracking-[-0.015em]">“{q}”</span></span>
          </p>
          <p className="border-line md:border-l md:pl-6">
            <span className="flex items-center justify-between gap-3"><span className="text-[12px] font-semibold uppercase tracking-[.1em] text-ink-3">Today</span><span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: 'color-mix(in oklab, var(--color-crit) 12%, transparent)', color: 'var(--color-crit)' }}>{t1}</span></span>
            <span className="mt-1 block text-[15px] leading-snug text-ink-3">{today}</span>
          </p>
          <p className="rounded-[14px] border-l-[3px] bg-white p-3.5 shadow-[0_10px_24px_-16px_rgb(16_40_80/.35)] md:-my-2" style={{ borderColor: 'var(--color-icms)' }}>
            <span className="flex items-center justify-between gap-3"><span className="text-[12px] font-semibold uppercase tracking-[.1em]" style={{ color: 'var(--color-icms)' }}>With ICMS</span><span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: 'color-mix(in oklab, var(--color-ok) 14%, transparent)', color: 'var(--color-ok)' }}>{t2}</span></span>
            <span className="mt-1 block text-[15px] font-medium leading-snug">{icms}</span>
          </p>
        </Reveal>
      ))}
    </ol>
  );
}
