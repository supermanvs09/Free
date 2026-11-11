import { useState } from 'react';
import { Icon, cx } from '../ui.jsx';
import { AppFrame, Badge, DemoControls, Stepper } from '../ds.jsx';
import { Logo } from '../viz/kit.jsx';
import { useSteps } from '../../lib/useSteps.js';

/* CIRM: the seven stages, on one identity. Sample data. */
const STAGES = ['Discover', 'Baseline', 'Score', 'Explain', 'Step-up', 'Contain', 'Evidence'];
const SUMMARY = [
  'Every person, service account and AI agent is found across your identity providers, cloud and SaaS.',
  'adapID learns each identity’s normal: places, hours, devices, apps and peer group.',
  'Each event is scored against that normal. Kavya’s score rises from 18 to 81 in two minutes.',
  'Every point of risk carries its reason, in language an analyst and an auditor can read.',
  'Above your step-up threshold, a stronger check is sent through your identity provider.',
  'The check fails. Sessions are revoked across systems and the forwarding rule is removed.',
  'The whole sequence is recorded with the policy that produced each action, ready to export.',
];
const SCORE = [null, 18, 81, 81, 81, 81, 81];
const FACTORS = [['Sign-in from a country never seen for her', 28], ['First-seen device, unmanaged', 18], ['Mail rule forwarding to an outside address', 17]];

function Discover() {
  const src = [['okta', 'Okta'], ['entra', 'Entra ID'], ['ad', 'Active Directory'], ['google', 'Google Workspace'], ['aws', 'AWS (3 accounts)'], ['m365', 'Microsoft 365'], ['salesforce', 'Salesforce'], ['github', 'GitHub']];
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {[['People', '3,412'], ['Machine identities', '12,708'], ['AI agents', '64']].map(([l, v]) => <div key={l} className="rounded-[10px] border border-line bg-bg-2 p-3"><p className="num text-[22px] font-semibold text-ink">{v}</p><p className="t-caption">{l}</p></div>)}
      </div>
      <p className="mt-4 app-label">Sources · read-only</p>
      <ul className="mt-2 grid grid-cols-2 gap-2">
        {src.map(([k, n]) => <li key={k} className="flex items-center gap-2 rounded-[8px] border border-line bg-bg-2 px-2.5 py-2 text-[13px] text-ink"><span aria-hidden="true"><Logo k={k} size="16px" /></span><span className="min-w-0 flex-1 truncate">{n}</span><Icon name="CheckCircle" size={15} weight="fill" className="shrink-0 text-ok" /></li>)}
      </ul>
    </div>
  );
}
function Baseline() {
  const hours = [0, 0, 0, 0, 0, 0, 0, 1, 3, 9, 10, 9, 7, 9, 10, 9, 8, 6, 3, 1, 0, 0, 0, 0];
  return (
    <div>
      <dl className="divide-y divide-line rounded-[10px] border border-line bg-bg-2 text-[13.5px]">
        {[['Location', 'Mumbai office · 98% of sessions'], ['Device', 'Managed laptop LT-4471'], ['Apps', 'Okta, Microsoft 365, Salesforce (Treasury)'], ['Peer group', 'Treasury analysts (14)']].map(([k, v]) => <div key={k} className="flex gap-3 px-3 py-2.5"><dt className="w-[92px] shrink-0 text-ink-3">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>)}
      </dl>
      <p className="mt-4 app-label">Usual sign-in hours (90 days)</p>
      <div className="mt-2 flex h-16 items-end gap-[3px] rounded-[10px] border border-line bg-bg-2 p-2" role="img" aria-label="Sign-ins between 08:00 and 19:00, none at night">
        {hours.map((h, i) => <span key={i} className="flex-1 rounded-[2px]" style={{ height: `${8 + h * 9}%`, background: i === 2 ? 'var(--color-crit)' : h ? 'var(--color-brand)' : 'var(--color-bg-3)', opacity: h || i === 2 ? 1 : 0.6 }} />)}
      </div>
      <div className="mt-1 flex justify-between t-caption"><span>00:00</span><span className="text-crit">02:14 today</span><span>12:00</span><span>23:00</span></div>
    </div>
  );
}
function ScoreStream() {
  const ev = [['02:14:07', 'Okta sign-in from Lagos, Nigeria · MFA approved', 46], ['02:14:09', 'First-seen device, not enrolled', 0], ['02:16:31', 'Outlook rule: forward all to an outside address', 17]];
  return (
    <ol className="space-y-2">
      {ev.map(([t, e, w], i) => (
        <li key={t} className="row-in flex items-start justify-between gap-3 rounded-[10px] border border-line bg-bg-2 p-3" style={{ animationDelay: `${i * 220}ms` }}>
          <span><span className="block text-[13.5px] font-medium text-ink">{e}</span><span className="mono text-ink-3">{t}</span></span>
          {w > 0 ? <span className="num shrink-0 text-[13px] font-semibold text-crit">+{w}</span> : <span className="shrink-0 t-caption">in the +46</span>}
        </li>
      ))}
    </ol>
  );
}
function Explain() {
  return (
    <div className="space-y-3">
      {FACTORS.map(([t, w]) => (
        <div key={t} className="rounded-[10px] border border-line bg-bg-2 p-3">
          <div className="flex items-start justify-between gap-3 text-[13.5px]"><span className="font-medium text-ink">{t}</span><span className="num shrink-0 font-semibold text-crit">+{w}</span></div>
          <div className="meter mt-2 !h-1.5"><i style={{ width: `${(w / 63) * 100}%`, background: 'var(--color-crit)' }} /></div>
        </div>
      ))}
      <p className="text-[13px] leading-snug text-ink-2"><span className="font-semibold text-ink">In plain language:</span> Kavya has never signed in from outside India or at night. This session uses a new device and immediately set up mail forwarding to an outside address.</p>
    </div>
  );
}
function StepUp() {
  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-line bg-bg-2 p-3"><p className="app-label">Policy matched</p><p className="mt-1 text-[13.5px] font-medium text-ink">Treasury · score ≥ 60 → step-up before sensitive actions</p></div>
      <div className="flex items-center gap-3 rounded-[10px] border border-line bg-bg-2 p-3">
        <Logo k="okta" size="22px" />
        <span className="flex-1"><span className="block text-[13.5px] font-medium text-ink">Okta Verify push sent to Kavya’s registered phone</span><span className="mono text-ink-3">02:16:33</span></span>
      </div>
      <div className="flex items-center gap-3 rounded-[10px] border border-hold/30 bg-hold-50 p-3">
        <Icon name="Warning" size={20} className="shrink-0 text-hold" />
        <span className="text-[13.5px] font-medium text-ink">Denied on her phone at 02:16:52. Kavya: “This was not me.”</span>
      </div>
    </div>
  );
}
function Contain() {
  const acts = [['Okta session terminated', 'okta'], ['Microsoft 365 sessions revoked, forwarding rule removed', 'm365'], ['Salesforce session revoked', 'salesforce'], ['Slack session revoked', 'slack'], ['SOC case SOC-4471 opened with evidence', 'splunk']];
  return (
    <ul className="space-y-2">
      {acts.map(([t, k], i) => (
        <li key={t} className="row-in flex items-center gap-3 rounded-[10px] border border-line bg-bg-2 p-3 text-[13.5px] font-medium text-ink" style={{ animationDelay: `${i * 160}ms` }}>
          <span aria-hidden="true"><Logo k={k} size="18px" /></span><span className="flex-1">{t}</span><Icon name="CheckCircle" size={17} weight="fill" className="shrink-0 text-ok" />
        </li>
      ))}
    </ul>
  );
}
function Evidence() {
  const [made, setMade] = useState(false);
  const rows = [['02:14:07', 'Risk 18 → 64', 'Sign-in from a new country and device'], ['02:16:31', 'Risk 64 → 81', 'Outside forwarding rule'], ['02:16:33', 'Step-up', 'Policy: Treasury ≥ 60'], ['02:16:52', 'Contain', 'Step-up denied by the user'], ['02:17:04', 'Case opened', 'SOC-4471']];
  return (
    <div>
      <div className="overflow-hidden rounded-[10px] border border-line bg-bg-2">
        <table className="dt"><thead><tr><th>Time</th><th>Action</th><th>Reason</th></tr></thead>
          <tbody>{rows.map(([t, a, r]) => <tr key={t}><td className="mono">{t}</td><td className="font-medium !text-ink">{a}</td><td>{r}</td></tr>)}</tbody></table>
      </div>
      {made ? (
        <p className="slide-in mt-3 flex items-center gap-2 rounded-[8px] bg-ok-50 px-3 py-2 text-[13px] font-medium text-ok" role="status"><Icon name="CheckCircle" size={16} weight="fill" />Evidence package EV-2611-0412 generated (sample)</p>
      ) : (
        <button type="button" onClick={() => setMade(true)} className="btn btn-secondary btn-sm mt-3"><Icon name="Export" size={15} />Generate evidence package</button>
      )}
    </div>
  );
}
const VIEWS = [Discover, Baseline, ScoreStream, Explain, StepUp, Contain, Evidence];

export default function CirmWorkflow() {
  const s = useSteps(STAGES.length, { ms: 4200 });
  const V = VIEWS[s.i];
  const sc = SCORE[s.i];
  const state = s.i >= 5 ? ['crit', 'Contained'] : s.i >= 4 ? ['hold', 'Step-up sent'] : s.i >= 2 ? ['crit', 'High risk'] : s.i === 1 ? ['ok', 'Normal'] : ['neutral', 'Discovered'];
  return (
    <div ref={s.ref} onPointerDown={s.pause}>
      <Stepper steps={STAGES} s={s} label="CIRM stages" className="max-lg:!grid-cols-4 max-lg:gap-y-4 max-sm:!grid-cols-3" />
      <p className="mt-6 min-h-[48px] t-body measure" aria-live="polite"><span className="font-semibold text-ink">{String(s.i + 1).padStart(2, '0')} {STAGES[s.i]}.</span> {SUMMARY[s.i]}</p>
      <AppFrame product="adapid" title="adapID CIRM" crumb="Identities / Kavya Reddy" className="mt-6" status={<Badge tone={state[0]} dot>{state[1]}</Badge>}>
        <div className="grid lg:grid-cols-[230px_minmax(0,1fr)_250px]">
          <aside className="border-b border-line bg-bg-2 p-4 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-[14px] font-semibold text-brand">KR</span>
              <span><span className="block text-[14px] font-semibold text-ink">Kavya Reddy</span><span className="block t-caption">Treasury analyst</span></span>
            </div>
            <dl className="mt-4 space-y-2 text-[13px]">
              {[['Office', 'Mumbai'], ['Manager', 'S. Iyer'], ['Joined', 'Mar 2021'], ['Access', 'Treasury payments']].map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-ink-3">{k}</dt><dd className="font-medium text-ink">{v}</dd></div>)}
            </dl>
          </aside>
          <div key={s.i} className="fadein min-h-[300px] p-4 md:p-5">
            <p className="app-label mb-3">{STAGES[s.i]}</p>
            <V />
          </div>
          <aside className="border-t border-line bg-bg-2 p-4 lg:border-l lg:border-t-0">
            <p className="app-label">Identity risk</p>
            <p className={cx('num mt-2 text-[44px] font-semibold leading-none transition-colors', sc == null ? 'text-ink-4' : sc >= 80 ? 'text-crit' : 'text-ok')}>{sc ?? '—'}</p>
            <div className="meter mt-3"><i style={{ width: `${sc || 0}%`, background: sc >= 80 ? 'var(--color-crit)' : 'var(--color-ok)' }} /></div>
            <div className="mt-1.5 flex justify-between t-caption"><span>0</span><span>60</span><span>80</span><span>100</span></div>
            <p className="mt-5 app-label">Reasons</p>
            {s.i >= 2 ? (
              <ul className="mt-2 space-y-1.5">{FACTORS.map(([t, w]) => <li key={t} className="flex justify-between gap-2 text-[12.5px] leading-snug text-ink-2"><span>{t}</span><span className="num font-semibold text-crit">+{w}</span></li>)}</ul>
            ) : <p className="mt-2 t-caption">{s.i === 1 ? 'Activity matches her baseline.' : 'Not scored yet.'}</p>}
          </aside>
        </div>
      </AppFrame>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="t-caption">Sample data. Thresholds and responses are set by your policy.</p>
        <DemoControls s={s} n={STAGES.length} label={`Stage ${s.i + 1} of ${STAGES.length}`} />
      </div>
    </div>
  );
}
