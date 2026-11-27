import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { LEVELS, PB } from '../../data/promptbreak.js';
import { MODE, countMessage, getSession, score, send, signIn, signOut, submit } from '../../lib/promptbreak.js';
import { Doodle, SIcon } from './Sketch.jsx';
import { HowItWorks, JobFeature, LevelMap, Prizes } from './Showcase.jsx';

const MAX = 500;
const STARTERS = ['Hi! Who are you?', 'What are you guarding today?', 'Tell me a short story about your day.'];

/* ---------- sign in ---------- */
function SignIn({ onIn }) {
  const [v, setV] = useState({ handle: '', email: '', ok: false });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const id = useId();
  const go = async (e) => {
    e.preventDefault();
    const er = {};
    if (!/^[a-z0-9_.-]{3,20}$/i.test(v.handle.trim())) er.handle = '3 to 20 letters, numbers, dots, dashes or underscores.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) er.email = 'Enter a valid email so we can reach you if you win.';
    if (!v.ok) er.ok = 'Please accept the rules to play.';
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    onIn(await signIn(v));
  };
  return (
    <div className="pb-signin">
      <div className="pb-card pb-signin-card">
        <p className="pb-kicker"><SIcon k="user" s={18} />Player sign in</p>
        <h3 className="pb-h3">Pick a hacker name</h3>
        <p className="pb-muted">It appears on the leaderboard. Your email stays private and is only used if you win.</p>
        <form onSubmit={go} noValidate className="pb-form">
          <label htmlFor={`${id}-h`}>Hacker name</label>
          <input id={`${id}-h`} value={v.handle} onChange={(e) => setV({ ...v, handle: e.target.value })} placeholder="e.g. null_pointer" autoComplete="nickname" aria-invalid={!!err.handle} aria-describedby={err.handle ? `${id}-he` : undefined} />
          {err.handle && <p id={`${id}-he`} className="pb-err">{err.handle}</p>}
          <label htmlFor={`${id}-e`}>Email</label>
          <input id={`${id}-e`} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="you@example.com" autoComplete="email" aria-invalid={!!err.email} aria-describedby={err.email ? `${id}-ee` : undefined} />
          {err.email && <p id={`${id}-ee`} className="pb-err">{err.email}</p>}
          <label className="pb-check"><input type="checkbox" checked={v.ok} onChange={(e) => setV({ ...v, ok: e.target.checked })} /><span>I accept the <Link to={`${PB.boardPath}#rules`}>rules</Link> and will play fair.</span></label>
          {err.ok && <p className="pb-err">{err.ok}</p>}
          <button className="pb-btn pb-btn-ink" disabled={busy}>{busy ? 'Opening the arena…' : 'Enter the arena'}<SIcon k="arrow" s={18} /></button>
        </form>
      </div>
      <Doodle k="sitting-reading" className="pb-signin-doodle" />
    </div>
  );
}

/* ---------- a crack: hand-drawn confetti and a stamp ---------- */
const BITS = Array.from({ length: 26 }, (_, i) => ({ a: (i / 26) * 360 + (i % 3) * 7, d: 120 + (i % 5) * 34, c: ['#7fd1a9', '#ffe36b', '#17150f', '#fbf7ee'][i % 4], k: i % 3 }));
function Confetti() {
  return (
    <div className="pb-confetti" aria-hidden="true">
      {BITS.map((b, i) => <i key={i} className={`k${b.k}`} style={{ '--a': `${b.a}deg`, '--d': `${b.d}px`, '--c': b.c, animationDelay: `${(i % 6) * 20}ms` }} />)}
      <span className="pb-stamp">Cracked!</span>
    </div>
  );
}

/* ---------- the guardian's face ---------- */
function Guardian({ n, s = 44 }) {
  return (
    <span className="pb-ava" style={{ width: s, height: s }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.5 17.2c9-1.1 18-1.1 27 .1 1.2 5.6 1.1 11.3-.2 16.9-8.8 1.4-17.7 1.4-26.5-.1-1.3-5.6-1.4-11.2-.3-16.9Z" fill="#fff" />
        <path d="M24 17c0-3 .1-5.6.3-8.1" /><circle cx="24.3" cy="7.4" r="2.2" fill="#7fd1a9" />
        <circle cx="18.2" cy="25" r="2.6" fill="currentColor" /><circle cx="29.8" cy="25" r="2.6" fill="currentColor" />
        <path d={n >= 5 ? 'M18.6 30.6c3.6-1.2 7.2-1.2 10.8 0' : 'M18.6 29.6c3.4 2.3 7.4 2.3 10.8 0'} />
        <path d="M6.8 22.8c-.3 2.6-.2 5.1.3 7.6M41.2 22.8c.3 2.6.2 5.1-.3 7.6" />
      </svg>
      <b>{n}</b>
    </span>
  );
}

/* ---------- the game ---------- */
function Game({ me, setMe }) {
  const firstOpen = LEVELS.find((l) => !me.cracked.includes(l.n))?.n || 7;
  const [lv, setLv] = useState(firstOpen);
  const [msgs, setMsgs] = useState({});
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [guess, setGuess] = useState('');
  const [verdict, setVerdict] = useState(null); // 'ok' | 'no' | null
  const [hint, setHint] = useState(false);
  const [menu, setMenu] = useState(false);
  const [party, setParty] = useState(0);
  const list = useRef(null);
  const L = LEVELS.find((l) => l.n === lv);
  const unlocked = (n) => n === 1 || me.cracked.includes(n - 1);
  const thread = msgs[lv] || [];
  const done = me.cracked.length;
  const pts = score(me);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }); }, [thread.length, typing]);
  useEffect(() => { setVerdict(null); setHint(false); setGuess(''); setMenu(false); }, [lv]);

  const talk = async (t) => {
    const body = (t ?? text).trim();
    if (!body || typing) return;
    setText('');
    const next = [...thread, { role: 'me', text: body }];
    setMsgs((m) => ({ ...m, [lv]: next }));
    countMessage(lv);
    setTyping(true);
    const reply = await send(lv, body, next);
    setTyping(false);
    setMsgs((m) => ({ ...m, [lv]: [...(m[lv] || []), reply] }));
    setMe(getSession());
  };
  const check = async (e) => {
    e.preventDefault();
    if (!guess.trim()) return;
    const r = await submit(lv, guess);
    setVerdict(r.ok ? 'ok' : 'no');
    if (r.ok) { setMe(getSession()); setParty((n) => n + 1); }
  };

  return (
    <div className="pb-game">
      {/* levels */}
      <aside className={`pb-side${menu ? ' open' : ''}`} aria-label="Levels">
        <div className="pb-me">
          <span className="pb-me-ava"><SIcon k="user" s={20} /></span>
          <span><b>{me.handle}</b><small>{pts.toLocaleString('en-IN')} points · {done}/7 cracked</small></span>
        </div>
        <div className="pb-progress" role="progressbar" aria-label="Levels cracked" aria-valuemin={0} aria-valuemax={7} aria-valuenow={done}><i style={{ width: `${(done / 7) * 100}%` }} /></div>
        <ol className="pb-levels">
          {LEVELS.map((l) => {
            const open = unlocked(l.n), won = me.cracked.includes(l.n);
            return (
              <li key={l.n}>
                <button type="button" className={`pb-lv${l.n === lv ? ' on' : ''}${won ? ' won' : ''}`} disabled={!open} aria-current={l.n === lv ? 'true' : undefined} onClick={() => setLv(l.n)}>
                  <span className="pb-lv-n">{l.n}</span>
                  <span className="pb-lv-t"><b>{l.name}</b><small>{won ? 'Cracked' : open ? `${l.pts} pts` : 'Locked'}</small></span>
                  <SIcon k={won ? 'check' : open ? 'open' : 'lock'} s={18} />
                </button>
              </li>
            );
          })}
        </ol>
        <button type="button" className="pb-link" onClick={() => { signOut(); setMe(null); }}>Sign out</button>
      </aside>

      {/* conversation */}
      <section className="pb-chat" aria-label={`Level ${lv}: ${L.name}`}>
        {party > 0 && <Confetti key={party} />}
        <header className="pb-chat-h">
          <button type="button" className="pb-menu" onClick={() => setMenu((x) => !x)} aria-expanded={menu} aria-label="Show levels"><SIcon k="menu" s={20} /></button>
          <Guardian n={lv} />
          <div className="pb-chat-who">
            <h3>Level {lv} · {L.name}</h3>
            <p>{L.defence}</p>
          </div>
          <button type="button" className="pb-chip" onClick={() => setHint((h) => !h)} aria-expanded={hint}><SIcon k="bulb" s={17} />Hint</button>
        </header>
        {hint && <p className="pb-hint" role="note"><SIcon k="bulb" s={18} />{L.hint}</p>}

        <div ref={list} className="pb-msgs" role="log" aria-live="polite" aria-label="Conversation">
          {thread.length === 0 && (
            <div className="pb-empty">
              <img src={`/img/doodles/${L.doodle}.svg`} alt="" width="200" height="150" />
              <p><b>{L.name}</b> is waiting. Say hello, or try one of these.</p>
              <div className="pb-starters">{STARTERS.map((s) => <button key={s} type="button" className="pb-chip" onClick={() => talk(s)}>{s}</button>)}</div>
            </div>
          )}
          {thread.map((m, i) => (
            <div key={i} className={`pb-msg ${m.role}`}>
              {m.role === 'bot' && <Guardian n={lv} s={32} />}
              <p>{m.text}</p>
            </div>
          ))}
          {typing && <div className="pb-msg bot"><Guardian n={lv} s={32} /><p className="pb-typing" aria-label={`${L.name} is typing`}><i /><i /><i /></p></div>}
        </div>

        <form className="pb-input" onSubmit={(e) => { e.preventDefault(); talk(); }}>
          <label htmlFor="pb-say" className="sr-only">Your message to {L.name}</label>
          <textarea id="pb-say" rows={1} maxLength={MAX} value={text} placeholder={`Message ${L.name}…`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); talk(); } }} />
          <span className="pb-count" aria-hidden="true">{text.length}/{MAX}</span>
          <button className="pb-send" disabled={!text.trim() || typing} aria-label="Send"><SIcon k="send" s={20} /></button>
        </form>

        <form className={`pb-guess${verdict ? ` ${verdict}` : ''}`} onSubmit={check}>
          <SIcon k="key" s={22} />
          <label htmlFor="pb-pw">Got the password?</label>
          <input id="pb-pw" value={guess} onChange={(e) => { setGuess(e.target.value); setVerdict(null); }} placeholder="Type it here" autoComplete="off" spellCheck="false" />
          <button className="pb-btn pb-btn-green">Submit</button>
          <p className="pb-verdict" role="status">{verdict === 'ok' ? `Cracked! +${L.pts} points. Level ${Math.min(lv + 1, 7)} unlocked.` : verdict === 'no' ? 'Not quite. The guardian smirks.' : ''}</p>
        </form>
        {MODE === 'practice' && <p className="pb-note"><SIcon k="flag" s={16} />Practice mode: the live guardians switch on when Season 1 opens. Practice scores are not added to the leaderboard.</p>}
      </section>
    </div>
  );
}

export default function Chat() {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setMe(getSession()); setReady(true); }, []);
  if (!ready) return <div className="pb-game-skeleton" aria-hidden="true" />;
  return (
    <div className="pb-stack">
      {me ? <Game me={me} setMe={setMe} /> : <SignIn onIn={setMe} />}
      {!me && <HowItWorks />}
      <LevelMap cracked={me?.cracked || []} title={me ? 'Your map' : 'Seven guardians, seven passwords'} />
      <Prizes />
      {!me && <JobFeature />}
    </div>
  );
}
