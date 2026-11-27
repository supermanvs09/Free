import { Link } from 'react-router';
import { LEVELS, PB, PRIZES } from '../../data/promptbreak.js';
import { ChatScribble, Megaphone, OfferLetter, Swag, Trophy } from './Art.jsx';
import { Doodle, SIcon } from './Sketch.jsx';

/* the pieces both tabs share: how it works, the map of guardians, the
   prizes and the job offer */

export function HowItWorks() {
  const steps = [
    ['Pick a hacker name', 'Sign in with a name for the leaderboard. It takes ten seconds.', <Doodle key="a" k="selfie" className="pb-step-art" />],
    ['Talk the guardian round', 'Chat, roleplay, reframe, misdirect. Make it say what it was told to keep.', <ChatScribble key="b" className="pb-step-art" />],
    ['Submit the password', 'Crack a level, unlock the next, and climb the board for prizes.', <Trophy key="c" className="pb-step-art" />],
  ];
  return (
    <section className="pb-sec" aria-labelledby="pb-how-h">
      <div className="pb-sec-h"><h2 id="pb-how-h" className="pb-h2">How it works</h2></div>
      <ol className="pb-steps">
        {steps.map(([t, d, art], i) => (
          <li key={t} className="pb-card pb-step">
            <span className="pb-step-n">{i + 1}</span>
            {art}
            <h3 className="pb-h3">{t}</h3>
            <p>{d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* seven stops along a dashed path; cracked ones go green, the next one glows */
export function LevelMap({ cracked = [], title = 'Seven guardians, seven passwords', id = 'pb-map-h' }) {
  const next = LEVELS.find((l) => !cracked.includes(l.n))?.n;
  return (
    <section className="pb-sec" aria-labelledby={id}>
      <div className="pb-sec-h"><h2 id={id} className="pb-h2">{title}</h2><span className="pb-tag">Each one adds a defence</span></div>
      <ol className="pb-map">
        {LEVELS.map((l) => {
          const st = cracked.includes(l.n) ? 'won' : l.n === next ? 'next' : '';
          return (
            <li key={l.n} className={`pb-stop ${st}`}>
              <span className="pb-stop-n">{st === 'won' ? <SIcon k="check" s={22} /> : l.n}</span>
              <b>{l.name}</b>
              <small>{l.defence}</small>
              <em>{l.pts} pts</em>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const ART = { cash: Trophy, job: OfferLetter, swag: Swag, fame: Megaphone };

export function Prizes() {
  return (
    <section className="pb-sec" aria-labelledby="pb-prize-h">
      <div className="pb-sec-h"><h2 id="pb-prize-h" className="pb-h2">What you can win</h2></div>
      <ul className="pb-prizes">
        {PRIZES.map((p) => {
          const A = ART[p.k];
          return (
            <li key={p.k} className={`pb-card pb-prize pb-prize-${p.k}`}>
              <A className="pb-prize-art" />
              <p className="pb-kicker"><SIcon k={p.k === 'job' ? 'case' : p.k === 'cash' ? 'trophy' : p.k === 'swag' ? 'gift' : 'spark'} s={18} />{p.k === 'job' ? 'The big one' : 'Prize'}</p>
              <h3 className="pb-h3">{p.title}</h3>
              <p>{p.body}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function JobFeature() {
  return (
    <section className="pb-sec" aria-labelledby="pb-job-h">
      <div className="pb-card pb-job">
        <OfferLetter className="pb-job-art" />
        <div>
          <p className="pb-kicker"><SIcon k="case" s={18} />Hiring through hacking</p>
          <h2 id="pb-job-h" className="pb-h2">Break our AI. Get hired to protect it.</h2>
          <p>We build Zenstra, the security layer for AI agents. The people who break our guardians best are the people we want on our AI red team and security engineering team. Standout players are invited to interview, and the best get offers.</p>
          <ul className="pb-rules">
            <li><SIcon k="check" s={18} />No CV needed to be noticed: your crack log speaks for you.</li>
            <li><SIcon k="check" s={18} />Interviews for the top finishers, offers for the best.</li>
          </ul>
          <Link to={PB.path} className="pb-btn pb-btn-ink">Start hacking<SIcon k="arrow" s={18} /></Link>
        </div>
      </div>
    </section>
  );
}
