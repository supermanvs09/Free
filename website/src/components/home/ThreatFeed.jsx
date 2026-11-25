import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../../lib/motion.js';
import { Icon } from '../ui.jsx';

/* AI-driven threats, told one at a time, after the threat-detection scene in
   Cisco's identity film: the endpoint and network layers see nothing; only
   the identity layer sees the attack. Left: the threats, in large type.
   Right: one detection panel for the selected threat (which identity, what
   gave it away, what was decided, by which product). Advances on its own
   while on screen until the visitor picks one. Sample data. */

const THREATS = [
  { k: 'AI-generated phishing', who: 'r.mehta', kind: 'Employee', icon: 'User', sig: 'Signed in with a password phished an hour earlier', act: 'Step-up verification enforced', by: 'adapID AI' },
  { k: 'Deepfake voice', who: 'IT help desk', kind: 'Password reset request', icon: 'Phone', sig: 'The voice matched the CFO. The request pattern did not.', act: 'Reset held for verification', by: 'adapID AI' },
  { k: 'MFA fatigue', who: 'Customer ****4821', kind: 'Customer', icon: 'UserCircle', sig: '14 push prompts in three minutes', act: 'Pushes stopped, number match required', by: 'adapID AI' },
  { k: 'Session hijacking', who: 'a.khan', kind: 'Employee', icon: 'User', sig: 'Same session, new device and new country', act: 'Session ended, sign-in required', by: 'adapID AI' },
  { k: 'Token theft', who: 'payment-service-prod', kind: 'Workload identity', icon: 'Key', sig: 'Access key used from an unfamiliar network', act: 'Key revoked and rotated', by: 'adapID AI' },
  { k: 'Prompt injection', who: 'support-triage', kind: 'AI agent', icon: 'Robot', sig: 'Instruction hidden in a customer email', act: 'Blocked before the tool ran', by: 'Zenstra AI' },
  { k: 'Tool poisoning', who: 'mcp-files', kind: 'MCP server', icon: 'Plug', sig: 'Tool description changed after approval', act: 'Server held for review', by: 'Zenstra AI' },
  { k: 'Agent hijacking', who: 'code-assist', kind: 'Coding agent', icon: 'Laptop', sig: 'Read ~/.aws/credentials, outside its task', act: 'Session contained on laptop-114', by: 'Zenstra AI' },
];

const STEP_MS = 5200;

export default function ThreatFeed() {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.35 });
  const reduce = useReducedMotion();
  const [k, setK] = useState(5);
  const [auto, setAuto] = useState(true);
  const [phase, setPhase] = useState(2); // 0 detecting, 1 deciding, 2 stopped
  const running = auto && inView && !reduce;

  useEffect(() => {
    if (reduce) { setPhase(2); return undefined; }
    setPhase(0);
    const a = setTimeout(() => setPhase(1), 900);
    const b = setTimeout(() => setPhase(2), 1700);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [k, reduce]);

  useEffect(() => {
    if (!running) return undefined;
    const t = setTimeout(() => setK((n) => (n + 1) % THREATS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [k, running]);

  const pick = (i) => { setAuto(false); setK(i); };
  const T = THREATS[k];
  const stopped = phase === 2;

  return (
    <div ref={ref} className="tf">
      <ol className="tf-list" aria-label="AI-driven threats">
        {THREATS.map((x, i) => (
          <li key={x.k}>
            <button type="button" className={cx('tf-item', i === k && 'on')} aria-pressed={i === k} onClick={() => pick(i)}>
              <span className="tf-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="tf-k">{x.k}</span>
              {i === k && <span className={cx('tf-bar', running && 'run')} style={{ '--ms': `${STEP_MS}ms` }} key={`${k}-${running}`} aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ol>

      <div className="tf-panel">
        <div className="tf-head">
          <span>Identity threat detection</span>
          <span className="tf-sample">Sample data</span>
        </div>

        <div className="tf-layers" aria-hidden="true">
          <div><small>Endpoint</small><b>0</b><em>anomalies</em></div>
          <div><small>Network</small><b>0</b><em>anomalies</em></div>
          <div className={cx('id', stopped ? 'ok' : 'hit')}><small>Identity</small><b>1</b><em>{stopped ? 'stopped' : 'anomaly'}</em></div>
        </div>

        <div className="tf-event" key={T.k}>
          <p className="tf-threat"><span className={cx('tf-sev', stopped && 'ok')}>{stopped ? 'Stopped' : 'Detected'}</span>{T.k}</p>
          <dl>
            <div><dt>Identity</dt><dd><Icon name={T.icon} size={15} />{T.who}<small>{T.kind}</small></dd></div>
            <div><dt>Signal</dt><dd>{T.sig}</dd></div>
            <div><dt>Decision</dt><dd className={cx('tf-act', stopped && 'ok')}>{stopped ? <><Icon name="ShieldCheck" size={15} weight="fill" />{T.act}</> : <span className="tf-eval">Evaluating</span>}</dd></div>
            <div><dt>Stopped by</dt><dd>{T.by}</dd></div>
          </dl>
          <ol className="tf-steps" aria-hidden="true">
            {['Detected', 'Decided inline', 'Recorded'].map((s, i) => <li key={s} className={cx(i <= phase && 'on')}>{s}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}
