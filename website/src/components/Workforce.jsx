import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion, cx } from '../lib/motion.js';

/* The workforce, as it really is now: a floor of identity tiles that starts as
   people and turns, tile by tile, into keys, service accounts and AI agents,
   until two people are left. 160 tiles, 2 people: about 1 to 80, close to the
   sourced 1 to 82. The server render is the end state, so the picture is
   right without script and for reduced motion. */

const COLS = 16, ROWS = 10, N = COLS * ROWS;
const KEEP = [69, 106]; // the people who remain
const ICO = {
  person: 'M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6',
  key: 'M8 15.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM11.6 12H20m-3 0v3m-2.4-3v2.2',
  service: 'M5 4.5h14v6H5zM5 13.5h14v6H5zM8.5 7.5h.01M8.5 16.5h.01M12 7.5h4M12 16.5h4',
  agent: 'M6 8h12v10H6zM12 4.5V8M9.5 12.5h.01M14.5 12.5h.01M10 15.5h4M4 12v3M20 12v3',
};
const LABEL = { person: 'People', key: 'Keys and secrets', service: 'Service accounts', agent: 'AI agents' };

/* a fixed, even spread of what each tile becomes, and the order they turn */
const rnd = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const { END, ORDER } = (() => {
  const r = rnd(11);
  const end = Array.from({ length: N }, (_, i) => {
    if (KEEP.includes(i)) return 'person';
    const x = r();
    return x < 0.46 ? 'key' : x < 0.86 ? 'service' : 'agent';
  });
  const order = Array.from({ length: N }, (_, i) => i).filter((i) => !KEEP.includes(i));
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { END: end, ORDER: order };
})();
const count = (t) => t.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});

function Ico({ k }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICO[k]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function Workforce() {
  const ref = useRef(null);
  const seen = useInView(ref, { threshold: 0.35 });
  const reduce = useReducedMotion();
  const [tiles, setTiles] = useState(END);
  const [done, setDone] = useState(true);
  const played = useRef(false);

  // before it is seen, everyone is a person
  useEffect(() => { if (!reduce && !played.current) { setTiles(Array(N).fill('person')); setDone(false); } }, [reduce]);
  useEffect(() => {
    if (reduce || !seen || played.current) return undefined;
    played.current = true;
    let i = 0, t;
    const step = () => {
      const n = 2 + Math.floor(i / 26); // slow at first, then the flood
      const batch = ORDER.slice(i, i + n);
      i += n;
      setTiles((cur) => { const next = cur.slice(); batch.forEach((b) => { next[b] = END[b]; }); return next; });
      if (i < ORDER.length) t = setTimeout(step, 85);
      else t = setTimeout(() => setDone(true), 300);
    };
    t = setTimeout(step, 600);
    return () => clearTimeout(t);
  }, [seen, reduce]);

  const c = count(tiles);
  return (
    <figure ref={ref} className={cx('wf', done && 'done')} aria-label="Illustration: a floor of 160 identity tiles that starts as people and turns into keys, service accounts and AI agents until two people remain. For every person in an average organisation there are 82 machine identities.">
      <div aria-hidden="true">
        <div className="wf-head">
          <div>
            <p className="wf-k">For every person in your company</p>
            <p className="wf-big">82<span> machine identities</span></p>
          </div>
          <ul className="wf-count">
            {['person', 'key', 'service', 'agent'].map((k) => (
              <li key={k} className={`k-${k}`}><Ico k={k} /><b>{c[k] || 0}</b><span>{LABEL[k]}</span></li>
            ))}
          </ul>
        </div>
        <div className="wf-floor">
          <div className="wf-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
            {tiles.map((k, i) => (
              <i key={`${i}-${k}`} className={cx(`k-${k}`, KEEP.includes(i) && 'keep', k !== 'person' && 'turned')}><Ico k={k} /></i>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="wf-src">Source: CyberArk Identity Security Landscape, 2025. Most were created by a deploy, not a decision. Tiles are illustrative.</figcaption>
    </figure>
  );
}
