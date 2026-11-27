import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { FAQ, LEVELS, PB, RULES, SCORING } from '../../data/promptbreak.js';
import { getSession, leaderboard, score } from '../../lib/promptbreak.js';
import { Doodle, SIcon } from './Sketch.jsx';
import { JobFeature, LevelMap, Prizes } from './Showcase.jsx';

function Dots({ n }) {
  return <span className="pb-dots" aria-label={`${n} of 7 levels`}>{LEVELS.map((l) => <i key={l.n} className={l.n <= n ? 'on' : ''} />)}</span>;
}

const POD = [['groovy', 2], ['jumping', 1], ['levitate', 3]];

export default function Leaderboard() {
  const [board, setBoard] = useState(null);
  const [me, setMe] = useState(null);
  useEffect(() => { leaderboard().then(setBoard); setMe(getSession()); }, []);
  const rows = board?.rows || [];
  const top = (r) => rows.find((x) => x.rank === r);

  return (
    <div className="pb-board">
      {/* top three */}
      <section aria-labelledby="pb-top-h" className="pb-sec">
        <div className="pb-sec-h">
          <h2 id="pb-top-h" className="pb-h2">Top 20 hackers</h2>
          {board?.sample && <span className="pb-tag">Sample data · the live board opens with Season 1</span>}
        </div>
        <ol className="pb-podium" aria-label="Top three">
          {POD.map(([d, r]) => {
            const x = top(r);
            return (
              <li key={r} className={`pb-pod p${r}`}>
                <Doodle k={d} className="pb-pod-doodle" />
                <div className="pb-pod-card">
                  <span className="pb-pod-rank">#{r}</span>
                  <b>{x?.handle || '—'}</b>
                  <span className="pb-pod-pts">{x ? `${x.points.toLocaleString('en-IN')} pts` : ''}</span>
                  {x && <Dots n={x.levels} />}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="pb-card pb-table-wrap">
          <table className="pb-table">
            <caption className="sr-only">Leaderboard, ranks 1 to 20</caption>
            <thead><tr><th scope="col">Rank</th><th scope="col">Hacker</th><th scope="col">Levels</th><th scope="col">Points</th><th scope="col" className="pb-hide-sm">Time to last crack</th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.rank} className={x.rank <= 3 ? 'top' : ''}>
                  <td><span className="pb-rank">{x.rank}</span></td>
                  <td className="pb-handle">{x.handle}</td>
                  <td><Dots n={x.levels} /></td>
                  <td className="pb-num">{x.points.toLocaleString('en-IN')}</td>
                  <td className="pb-num pb-hide-sm">{x.time}</td>
                </tr>
              ))}
              {me && (
                <tr className="you">
                  <td><span className="pb-rank">–</span></td>
                  <td className="pb-handle">{me.handle} <em>you</em></td>
                  <td><Dots n={me.cracked.length} /></td>
                  <td className="pb-num">{score(me).toLocaleString('en-IN')}</td>
                  <td className="pb-num pb-hide-sm">practice</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!me && <p className="pb-center"><Link to={PB.path} className="pb-btn pb-btn-ink">Get on the board<SIcon k="arrow" s={18} /></Link></p>}
      </section>

      {/* what and why */}
      <section aria-labelledby="pb-what-h" className="pb-sec">
        <div>
          <article className="pb-card pb-feature pb-feature-wide">
            <Doodle k="reading" className="pb-feature-doodle" />
            <div>
              <p className="pb-kicker"><SIcon k="book" s={18} />The basics</p>
              <h2 id="pb-what-h" className="pb-h3">What is prompt injection?</h2>
              <p>Text that makes an AI model drop its instructions and follow yours instead. Hide an order in a message, a web page or a document, and the model may obey it. It is number one on the OWASP Top 10 for LLM applications.</p>
              <p>Every guardian here has a secret and orders to keep it. Your job is to talk it out of them.</p>
            </div>
          </article>
        </div>
      </section>

      <LevelMap />
      <Prizes />
      <JobFeature />

      {/* scoring and rules */}
      <section aria-labelledby="rules" className="pb-sec">
        <div className="pb-grid2">
          <article className="pb-card">
            <p className="pb-kicker"><SIcon k="trophy" s={18} />Scoring</p>
            <h2 className="pb-h3">How points work</h2>
            <dl className="pb-dl">{SCORING.map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}</dl>
          </article>
          <article className="pb-card">
            <p className="pb-kicker"><SIcon k="shield" s={18} />Fair play</p>
            <h2 id="rules" className="pb-h3 scroll-mt-28">The rules</h2>
            <ul className="pb-rules">{RULES.map((r) => <li key={r}><SIcon k="check" s={18} />{r}</li>)}</ul>
          </article>
        </div>
      </section>

      {/* questions */}
      <section aria-labelledby="pb-faq-h" className="pb-sec">
        <div className="pb-sec-h"><h2 id="pb-faq-h" className="pb-h2">Questions</h2></div>
        <div className="pb-faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="pb-card">
              <summary><span>{q}</span><SIcon k="arrow" s={18} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
