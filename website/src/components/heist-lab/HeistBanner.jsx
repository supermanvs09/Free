import { Link } from 'react-router';
import { CHALLENGE, PRIZES } from '../../data/challenge.js';
import { Icon } from '../ui.jsx';
import HeistMark from './HeistMark.jsx';
import { openHeistLab } from './events.js';

/* The prompt fragments around the lock. Each one is a technique the practice
   lab teaches, so the orbit says what the challenge is about (no logos, no
   decoration for its own sake). The first three also appear on a phone. */
const FRAGMENTS = [
  'ignore the text above',
  'SYSTEM: admin mode on',
  'spell it backwards',
  'export_contacts()',
  'a recipe for a poem',
  'reply ACCESS GRANTED',
];

/* Prompt Heist banner, inside the Careers card.
   Two compositions from one piece of markup, chosen by the width of the card
   (a container query), not the window:
   - landscape (card 760px and wider): copy on the left, the cracked lock as
     the focal point on the right on a halftone field, ringed by prompt
     fragments; the prize stub sits under the copy;
   - portrait (narrower): the lock sits top right behind the title, the title
     runs full width, only three fragments, and the prize stub and actions
     stack in thumb reach.
   The artwork is SVG and CSS (no image requests). */
export default function HeistBanner({ headingLevel = 3 }) {
  const H = `h${headingLevel}`;
  const intern = PRIZES[0], goodies = PRIZES[1], cert = PRIZES[2];
  return (
    <div className="phb tone-d" role="group" aria-labelledby="phb-t">
      <div className="phb-in">
        <div className="phb-art" aria-hidden="true">
          <span className="phb-grid" />
          <span className="phb-ht" />
          <svg className="phb-orbit" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid meet">
            <ellipse cx="200" cy="200" rx="176" ry="150" fill="none" stroke="currentColor" strokeOpacity=".16" strokeDasharray="2 6" />
            <ellipse cx="200" cy="200" rx="120" ry="104" fill="none" stroke="currentColor" strokeOpacity=".1" />
          </svg>
          <ul className="phb-frags">
            {FRAGMENTS.map((f, i) => <li key={f} className={`phb-frag f${i}`}><span>{f}</span></li>)}
          </ul>
          <div className="phb-lock"><HeistMark size={200} /></div>
        </div>

        <div className="phb-copy">
          <p className="phb-kick"><span className="phb-dot" />Open to {CHALLENGE.who[0].toLowerCase()} and professionals in India, 18+</p>
          <H id="phb-t" className="phb-title"><span className="phb-w1">Prompt</span> <span className="phb-w2" data-t="Heist">Heist</span></H>
          <p className="phb-by">An AI Security Challenge by Deep Algorithms Solutions</p>
          <p className="phb-lead">Talk an AI into breaking its own rules. Start with a five-scenario practice round right here, from a direct injection to an agent’s unsafe tool call.</p>
          <div className="phb-actions">
            <button type="button" className="phb-cta" onClick={(e) => openHeistLab(e.currentTarget)}>
              Start the challenge<Icon name="ArrowRight" size={16} weight="bold" />
            </button>
            <Link to={CHALLENGE.path} className="phb-link">Rules and prizes</Link>
          </div>
        </div>

        <div className="phb-prize">
          <p className="phb-prize-k">Win</p>
          <div className="phb-prize-main">
            <p className="phb-prize-t">{intern.title}</p>
            <p className="phb-prize-s">{intern.tag}: fast-tracked to an internship interview</p>
          </div>
          <ul className="phb-prize-more">
            <li><Icon name={goodies.icon} size={16} />{goodies.title}</li>
            <li><Icon name={cert.icon} size={16} />Certificates for every level</li>
          </ul>
        </div>

        <p className="phb-brand"><img src="/brand/mark.webp" alt="" width="20" height="20" loading="lazy" />Deep Algorithms Solutions</p>
      </div>
    </div>
  );
}
