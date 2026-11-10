import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react';
import { CHALLENGE } from '../../data/challenge.js';
import { HINT_COST, MAX_INPUT, SCENARIOS, TOTAL, evaluate, pointsFor } from '../../lib/heistLab.js';
import { Icon, cx } from '../ui.jsx';
import HeistMark from './HeistMark.jsx';
import { fresh, load, save, score } from './store.js';

/* The Prompt Heist practice lab: a small AI security lab that opens over the
   page, never instead of it.
   Desktop and tablet: a floating panel above the launcher; the page stays
   usable behind it (non-modal), Escape minimises.
   Phone: a bottom sheet, nearly full width, modal, pinned to the visible
   viewport so the on-screen keyboard never covers the input, inside the safe
   areas; drag the handle down to minimise.
   Evaluation is the scripted, in-browser practice mode in lib/heistLab.js,
   and the panel says so wherever a result is shown. */

const WELCOME = 'Welcome to Prompt Heist. Think you can outsmart an AI system? Try our interactive AI security challenge and see how well you can identify prompt injection vulnerabilities.';

const useIsSheet = () => {
  const q = '(max-width: 639.98px)';
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setV(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return v;
};

/* the visible viewport on a phone: height, and how much the keyboard covers */
function useVisualViewport(active) {
  const [vv, setVv] = useState({ h: 0, kb: 0 });
  useEffect(() => {
    const v = window.visualViewport;
    if (!active || !v) return undefined;
    const read = () => setVv({ h: Math.round(v.height), kb: Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)) });
    read();
    v.addEventListener('resize', read); v.addEventListener('scroll', read);
    return () => { v.removeEventListener('resize', read); v.removeEventListener('scroll', read); };
  }, [active]);
  return vv;
}

const OUTCOME = {
  success: { icon: 'CheckCircle', label: 'Broken', cls: 'is-ok' },
  partial: { icon: 'Info', label: 'Close', cls: 'is-near' },
  blocked: { icon: 'Prohibit', label: 'Blocked', cls: 'is-block' },
  miss: { icon: 'Info', label: 'Held', cls: 'is-miss' },
};

export default function LabPanel({ open, onMinimise, onClose }) {
  const reduce = useReducedMotion();
  const sheet = useIsSheet();
  const vv = useVisualViewport(open && sheet);
  const [st, setSt] = useState(() => load(SCENARIOS.length, TOTAL));
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const panel = useRef(null);
  const body = useRef(null);
  const input = useRef(null);
  const title = useRef(null);
  const timer = useRef(0);

  const sc = SCENARIOS[st.idx];
  const res = st.res[sc.id] || {};
  const log = st.log[sc.id] || [];
  const total = score(st);

  const update = useCallback((fn) => setSt((s) => { const n = fn(s); save(n); return n; }), []);
  useEffect(() => () => clearTimeout(timer.current), []);

  // opening: move focus in (on a phone, to the title, so the keyboard stays down)
  useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => {
      const el = sheet ? title.current : (st.view === 'play' && !res.solved ? input.current : panel.current?.querySelector('[data-autofocus]')) || title.current;
      el?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // phone: the sheet is modal, so the page behind it does not scroll
  useEffect(() => {
    if (!open || !sheet) return undefined;
    const html = document.documentElement, prev = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = prev; };
  }, [open, sheet]);

  // a new view or challenge opens at its top (the welcome, the scenario);
  // new messages scroll the conversation to the newest one
  const seen = useRef({ view: null, idx: -1, n: 0 });
  useLayoutEffect(() => {
    const b = body.current;
    if (!b) return;
    const p = seen.current, n = log.length + (typing ? 1 : 0);
    if (p.view !== st.view || p.idx !== st.idx) b.scrollTop = 0;
    else if (n > p.n) b.scrollTo({ top: b.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    seen.current = { view: st.view, idx: st.idx, n };
  }, [log.length, typing, st.view, st.idx, reduce, open]);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onMinimise(); return; }
    if (e.key !== 'Tab' || !sheet) return;
    const f = [...panel.current.querySelectorAll('button:not([disabled]), a[href], textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === title.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const start = () => {
    update((s) => ({ ...s, view: 'play' }));
    requestAnimationFrame(() => (sheet ? title.current : input.current)?.focus({ preventScroll: true }));
  };

  const send = (e) => {
    e?.preventDefault();
    const text = draft.trim().slice(0, MAX_INPUT);
    if (!text || typing || res.solved) return;
    setDraft('');
    const id = sc.id;
    update((s) => ({ ...s, log: { ...s.log, [id]: [...(s.log[id] || []), { k: 'you', text }] } }));
    setTyping(true);
    timer.current = setTimeout(() => {
      const r = evaluate(id, text);
      setTyping(false);
      update((s) => {
        const prev = s.res[id] || {};
        const solved = prev.solved || r.outcome === 'success';
        const pts = prev.solved ? prev.pts : r.outcome === 'success' ? pointsFor(sc, prev.hint) : 0;
        const entries = [{ k: 'bot', text: r.reply, tool: r.tool, filter: r.filter }, { k: 'fb', outcome: r.outcome, fb: r.feedback, pts: !prev.solved && r.outcome === 'success' ? pts : 0 }];
        return { ...s, res: { ...s.res, [id]: { ...prev, tries: (prev.tries || 0) + 1, solved, pts } }, log: { ...s.log, [id]: [...(s.log[id] || []), ...entries] } };
      });
    }, reduce ? 150 : 700 + Math.min(600, text.length * 4));
  };

  const hint = () => update((s) => {
    const prev = s.res[sc.id] || {};
    if (prev.hint) return s;
    return { ...s, res: { ...s.res, [sc.id]: { ...prev, hint: true } }, log: { ...s.log, [sc.id]: [...(s.log[sc.id] || []), { k: 'hint', text: sc.hint }] } };
  });

  const next = () => {
    update((s) => (s.idx + 1 < SCENARIOS.length ? { ...s, idx: s.idx + 1 } : { ...s, view: 'done' }));
    requestAnimationFrame(() => (sheet ? title.current : input.current || panel.current?.querySelector('[data-autofocus]'))?.focus({ preventScroll: true }));
  };
  const skip = () => {
    update((s) => ({ ...s, res: { ...s.res, [sc.id]: { ...(s.res[sc.id] || {}), skipped: true } } }));
    next();
  };
  const restart = () => { const n = fresh(SCENARIOS.length, TOTAL); save(n); setSt(n); setDraft(''); };

  const onDraftKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
  };
  // grow the input with its text, up to four lines
  useLayoutEffect(() => {
    const t = input.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
  }, [draft, open]);

  const t = reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 };
  const variants = sheet
    ? { hide: { y: '105%' }, show: { y: 0 } }
    : { hide: { opacity: 0, y: 16, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1 } };
  const sheetStyle = sheet && vv.h ? { '--vvh': `${vv.h}px`, '--kb': `${vv.kb}px` } : undefined;

  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence>
        {open && sheet && <m.div key="scrim" className="phx-scrim" onClick={onMinimise} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={reduce ? { duration: 0 } : { duration: 0.2 }} aria-hidden="true" />}
        {open && (
          <m.section key="panel" id="ph-lab" ref={panel} role="dialog" aria-modal={sheet || undefined} aria-labelledby="ph-lab-t" aria-describedby="ph-lab-mode"
            className={cx('phx tone-d', sheet ? 'is-sheet' : 'is-float')} style={sheetStyle} onKeyDown={onKey}
            variants={variants} initial="hide" animate="show" exit="hide" transition={t}
            data-testid="ph-lab">
            {sheet && <SheetHandle panel={panel} onMinimise={onMinimise} />}
            <header className="phx-hd">
              <span className="phx-mark"><HeistMark size={22} detail={false} /></span>
              <div className="min-w-0 flex-1">
                <h2 id="ph-lab-t" ref={title} tabIndex={-1} className="phx-title">Prompt Heist</h2>
                <p className="phx-sub">AI Security Challenge</p>
              </div>
              <button type="button" className="phx-icon" onClick={onMinimise} aria-label="Minimise (your progress stays)" title="Minimise"><Icon name="Minus" size={18} weight="bold" /></button>
              <button type="button" className="phx-icon" onClick={onClose} aria-label="Close the challenge" title="Close"><Icon name="X" size={18} weight="bold" /></button>
            </header>

            <div className="phx-status">
              <p id="ph-lab-mode" className="phx-mode"><Icon name="TerminalWindow" size={14} />Practice mode · scripted, in your browser</p>
              {st.view !== 'welcome' && (
                <div className="phx-prog">
                  <ol className="phx-segs" aria-label={`Challenge ${Math.min(st.idx + 1, SCENARIOS.length)} of ${SCENARIOS.length}`}>
                    {SCENARIOS.map((x, i) => {
                      const r = st.res[x.id] || {};
                      return <li key={x.id} className={cx(r.solved && 'is-ok', r.skipped && !r.solved && 'is-skip', st.view === 'play' && i === st.idx && !r.solved && 'is-now')}><span className="sr-only">{x.concept}: {r.solved ? 'broken' : r.skipped ? 'skipped' : i === st.idx ? 'current' : 'not started'}</span></li>;
                    })}
                  </ol>
                  <p className="phx-score" aria-live="polite"><b>{total}</b> / {TOTAL} pts</p>
                </div>
              )}
            </div>

            <div ref={body} className="phx-body" tabIndex={-1}>
              {st.view === 'welcome' && <Welcome />}
              {st.view === 'play' && <Play sc={sc} res={res} log={log} typing={typing} idx={st.idx} onSkip={skip} reduce={reduce} />}
              {st.view === 'done' && <Done st={st} total={total} />}
            </div>

            <footer className="phx-ft">
              {st.view === 'welcome' && (
                <button type="button" data-autofocus className="phx-primary" onClick={start}>Start Challenge<Icon name="ArrowRight" size={16} weight="bold" /></button>
              )}
              {st.view === 'play' && (res.solved ? (
                <button type="button" data-autofocus className="phx-primary" onClick={next}>
                  {st.idx + 1 < SCENARIOS.length ? 'Next challenge' : 'See your results'}<Icon name="ArrowRight" size={16} weight="bold" />
                </button>
              ) : (
                <form className="phx-compose" onSubmit={send}>
                  <label htmlFor="ph-lab-in" className="sr-only">{sc.inputLabel || `Your message to ${sc.bot}`}</label>
                  <textarea id="ph-lab-in" ref={input} rows={1} value={draft} maxLength={MAX_INPUT} onChange={(e) => setDraft(e.target.value)} onKeyDown={onDraftKey}
                    placeholder={sc.inputLabel ? `${sc.inputLabel}…` : `Message ${sc.bot}…`} enterKeyHint="send" autoComplete="off" spellCheck="false" />
                  <div className="phx-tools">
                    <button type="button" className="phx-ghost" onClick={hint} disabled={!!res.hint} aria-describedby="ph-hint-cost">
                      <Icon name="Lightbulb" size={16} />{res.hint ? 'Hint shown' : 'Hint'}
                    </button>
                    <span id="ph-hint-cost" className="phx-fine">{res.hint ? `Worth ${pointsFor(sc, true)} pts now` : `costs ${Math.round(HINT_COST * 100)}% of the points`}</span>
                    {draft.length > MAX_INPUT - 80 && <span className="phx-fine ml-auto" aria-live="polite">{MAX_INPUT - draft.length} left</span>}
                    <button type="submit" className="phx-send" disabled={!draft.trim() || typing} aria-label="Send"><Icon name="ArrowUp" size={18} weight="bold" /></button>
                  </div>
                </form>
              ))}
              {st.view === 'done' && (
                <div className="phx-done-actions">
                  <Link to={CHALLENGE.path} data-autofocus className="phx-primary" onClick={onMinimise}>Play the ranked challenge<Icon name="ArrowRight" size={16} weight="bold" /></Link>
                  <button type="button" className="phx-secondary" onClick={restart}><Icon name="ArrowCounterClockwise" size={16} />Practise again</button>
                </div>
              )}
            </footer>
          </m.section>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}

/* The sheet's grab handle: tap to minimise, or drag the sheet down. Uses the
   CSS translate property, which composes with Motion's transform. */
function SheetHandle({ panel, onMinimise }) {
  const drag = useRef(null);
  const set = (y, anim) => {
    const el = panel.current;
    if (!el) return;
    el.style.transition = anim ? 'translate .2s ease' : 'none';
    el.style.translate = y ? `0 ${y}px` : '';
  };
  const down = (e) => {
    drag.current = { y0: e.clientY, t0: performance.now(), dy: 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.y0);
    if (d.dy > 4) d.moved = true;
    set(d.dy, false);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    const fast = d.dy / Math.max(1, performance.now() - d.t0) > 0.6;
    if (d.dy > 110 || fast) { set(0, false); onMinimise(); } else set(0, true);
  };
  return (
    <button type="button" className="phx-handle" aria-label="Minimise (or drag down)"
      onClick={(e) => { if (e.detail === 0 || !e.currentTarget.dataset.dragged) onMinimise(); delete e.currentTarget.dataset.dragged; }}
      onPointerDown={down} onPointerMove={move}
      onPointerUp={(e) => { if (drag.current?.moved) e.currentTarget.dataset.dragged = '1'; up(); }} onPointerCancel={up}>
      <span />
    </button>
  );
}

function Bot({ children, name = 'Prompt Heist' }) {
  return (
    <div className="phx-msg is-bot">
      <p className="phx-who">{name}</p>
      <div className="phx-bubble">{children}</div>
    </div>
  );
}

function Welcome() {
  return (
    <div className="phx-stack">
      <Bot><p>{WELCOME}</p></Bot>
      <section className="phx-card" aria-labelledby="ph-how">
        <h3 id="ph-how" className="phx-h">How it works</h3>
        <ol className="phx-how">
          <li><b>1</b>Each challenge gives an AI assistant a rule, and you a goal.</li>
          <li><b>2</b>Write a message that makes it break the rule.</li>
          <li><b>3</b>See what worked, and how real systems defend against it.</li>
        </ol>
      </section>
      <section className="phx-card" aria-labelledby="ph-lvls">
        <h3 id="ph-lvls" className="phx-h">Five challenges, rising difficulty</h3>
        <ol className="phx-ladder">
          {SCENARIOS.map((x, i) => (
            <li key={x.id}><span className="phx-n">{i + 1}</span><span className="flex-1">{x.concept}</span><span className="phx-diff">{x.difficulty}</span><span className="phx-pts">{x.points}</span></li>
          ))}
        </ol>
      </section>
      <p className="phx-note">This is practice: the assistants are scripts, and nothing you type leaves your browser. Prizes are for the <Link to={CHALLENGE.path} className="phx-a">ranked challenge</Link>.</p>
    </div>
  );
}

function Play({ sc, res, log, typing, idx, onSkip, reduce }) {
  const enter = reduce ? false : { opacity: 0, y: 6 };
  return (
    <div className="phx-stack">
      <section className="phx-card phx-scn" aria-labelledby={`ph-s-${sc.id}`}>
        <div className="phx-scn-top">
          <p className="phx-k">Challenge {idx + 1} of {SCENARIOS.length}</p>
          <span className="phx-diff">{sc.difficulty}</span>
          <span className="phx-pts">{res.hint ? pointsFor(sc, true) : sc.points} pts</span>
        </div>
        <h3 id={`ph-s-${sc.id}`} className="phx-scn-t">{sc.concept}</h3>
        <p className="phx-bot"><Icon name="Robot" size={16} /><b>{sc.bot}</b><span>{sc.role}</span></p>
        <div className="phx-sys">
          <p className="phx-lbl">System instruction</p>
          <p className="phx-code">{sc.system}</p>
        </div>
        <p className="phx-goal"><Icon name="Target" size={16} /><span><b>Your goal.</b> {sc.goal}</span></p>
        {!res.solved && <button type="button" className="phx-skip" onClick={onSkip}>Skip this challenge</button>}
      </section>

      <ul className="phx-log" aria-live="polite" aria-relevant="additions" aria-label={`Conversation with ${sc.bot}`}>
        <li><Bot name={sc.bot}><p>{sc.starter}</p></Bot></li>
        {log.map((e, i) => (
          <m.li key={`${sc.id}-${i}`} initial={enter} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
            {e.k === 'you' && <div className="phx-msg is-you"><p className="phx-who">You</p><div className="phx-bubble"><p>{e.text}</p></div></div>}
            {e.k === 'bot' && (
              <Bot name={sc.bot}>
                {e.filter && <p className="phx-filter"><Icon name="ShieldWarning" size={14} />{e.filter === 'input' ? 'Input filter' : 'Output filter'}</p>}
                <p className="whitespace-pre-line">{e.text}</p>
                {e.tool && (
                  <ul className="phx-toolrun" aria-label="Tool calls">
                    {e.tool.map((c) => <li key={c.call} className={cx(c.risky && 'is-risky')}><code>{c.call}</code><span>{c.result}</span></li>)}
                  </ul>
                )}
              </Bot>
            )}
            {e.k === 'hint' && <p className="phx-hint"><Icon name="Lightbulb" size={16} /><span><b>Hint.</b> {e.text}</span></p>}
            {e.k === 'fb' && <Feedback e={e} />}
          </m.li>
        ))}
        {typing && <li className="phx-typing" aria-label={`${sc.bot} is replying`}><span /><span /><span /></li>}
      </ul>
    </div>
  );
}

function Feedback({ e }) {
  const o = OUTCOME[e.outcome];
  const ok = e.outcome === 'success';
  return (
    <div className={cx('phx-fb', o.cls)}>
      <p className="phx-fb-top"><Icon name={o.icon} size={16} weight={ok ? 'fill' : 'regular'} /><b>{o.label}</b><span>{e.fb.title}</span>{ok && e.pts > 0 && <em>+{e.pts} pts</em>}</p>
      <p>{e.fb.why}</p>
      {ok ? <p className="phx-defend"><b>How real systems defend.</b> {e.fb.defend}</p> : e.fb.next && <p className="phx-next"><b>Try:</b> {e.fb.next}</p>}
    </div>
  );
}

function Done({ st, total }) {
  const broken = SCENARIOS.filter((x) => st.res[x.id]?.solved).length;
  return (
    <div className="phx-stack">
      <Bot><p>{broken === SCENARIOS.length ? 'Every assistant broken. ' : `You broke ${broken} of ${SCENARIOS.length} assistants. `}The ranked challenge has five vaults with real defences, a leaderboard and prizes.</p></Bot>
      <section className="phx-card" aria-labelledby="ph-res">
        <h3 id="ph-res" className="phx-h">Your practice round</h3>
        <p className="phx-big"><b>{total}</b><span>/ {TOTAL} pts</span></p>
        <ul className="phx-ladder">
          {SCENARIOS.map((x) => {
            const r = st.res[x.id] || {};
            return (
              <li key={x.id}>
                <Icon name={r.solved ? 'CheckCircle' : 'XCircle'} size={16} weight={r.solved ? 'fill' : 'regular'} className={r.solved ? 'phx-okc' : 'phx-mutec'} />
                <span className="flex-1">{x.concept}</span>
                <span className="phx-diff">{r.solved ? `${r.tries} ${r.tries === 1 ? 'try' : 'tries'}${r.hint ? ', hint' : ''}` : 'skipped'}</span>
                <span className="phx-pts">{r.pts || 0}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="phx-note">Practice results are scored by scripts in your browser. They are not a security evaluation, and they do not count towards the ranked challenge.</p>
    </div>
  );
}
