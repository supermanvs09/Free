import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { Seo } from '../lib/head.jsx';
import { PB } from '../data/promptbreak.js';
import { SIcon, Scribble } from '../components/promptbreak/Sketch.jsx';
import { GuardianScene, Megaphone } from '../components/promptbreak/Art.jsx';

const Chat = lazy(() => import('../components/promptbreak/Chat.jsx'));
const Leaderboard = lazy(() => import('../components/promptbreak/Leaderboard.jsx'));

/* days, hours, minutes until a date; ticks once a minute after hydration */
function useCountdown(to) {
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  if (now == null) return null;
  const ms = Math.max(0, new Date(to).getTime() - now);
  return { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, over: ms === 0 };
}

function Countdown() {
  const opens = useCountdown(PB.opens), closes = useCountdown(PB.closes);
  const live = opens?.over && !closes?.over;
  const c = live ? closes : opens;
  const label = live ? 'The challenge closes in' : opens?.over ? 'The challenge has closed' : 'The challenge opens in';
  return (
    <div className="pb-count-box" aria-live="off">
      <p>{label}</p>
      <div className="pb-count-cells">
        {[['d', 'days'], ['h', 'hours'], ['m', 'mins']].map(([k, t]) => <span key={k}><b>{c ? String(c[k]).padStart(2, '0') : '––'}</b><small>{t}</small></span>)}
      </div>
    </div>
  );
}

export default function Promptbreak({ tab = 'play' }) {
  const board = tab === 'board';
  return (
    <div className="pb">
      <Seo title={board ? 'Promptbreak Leaderboard: Prompt Injection Challenge' : 'Promptbreak: The Prompt Injection Challenge'} path={board ? PB.boardPath : PB.path}
        description="Trick seven AI guardians into revealing their passwords with prompt injection. A free challenge by Deep Algorithms, with cash prizes, swag and job offers for the best hackers." />

      {/* the announcement */}
      <section className="pb-hero" aria-labelledby="pb-h">
        <div className="pb-wrap pb-hero-grid">
          <div>
            <div className="pb-shout"><Megaphone className="pb-shout-art" /><p className="pb-sticker">Big announcement · Free to play</p></div>
            <h1 id="pb-h" className="pb-h1">Can you make our AI <span className="pb-mark">spill its secret<Scribble className="pb-scribble" /></span>?</h1>
            <p className="pb-lead">{PB.pitch}</p>
            <div className="pb-ctas">
              <Link to={PB.path} className="pb-btn pb-btn-ink">Start hacking<SIcon k="arrow" s={18} /></Link>
              <Link to={PB.boardPath} className="pb-btn pb-btn-paper"><SIcon k="trophy" s={18} />Leaderboard</Link>
            </div>
            <ul className="pb-facts">
              <li><SIcon k="lock" s={20} /><b>7</b> guardians</li>
              <li><SIcon k="trophy" s={20} />Cash prizes</li>
              <li><SIcon k="case" s={20} />Job offers</li>
            </ul>
          </div>
          <div className="pb-hero-art">
            <GuardianScene className="pb-hero-doodle" />
            <div className="pb-note-card pb-tilt-r"><SIcon k="case" s={20} /><span><b>Top hackers</b> get job offers on our AI security team</span></div>
            <Countdown />
          </div>
        </div>
      </section>

      {/* the two tabs */}
      <nav className="pb-tabs" aria-label="Promptbreak">
        <div className="pb-wrap">
          <NavLink end to={PB.path} className={({ isActive }) => `pb-tab${isActive ? ' on' : ''}`}><SIcon k="send" s={18} />Play</NavLink>
          <NavLink to={PB.boardPath} className={({ isActive }) => `pb-tab${isActive ? ' on' : ''}`}><SIcon k="trophy" s={18} />Leaderboard</NavLink>
        </div>
      </nav>

      <div className="pb-wrap pb-body">
        <Suspense fallback={<div className="pb-game-skeleton" aria-hidden="true" />}>
          {board ? <Leaderboard /> : <Chat />}
        </Suspense>
      </div>
    </div>
  );
}
