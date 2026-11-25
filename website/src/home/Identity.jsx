import { useRef } from 'react';
import AppIcon from './AppIcon.jsx';
import { useScene, counter } from './scene.js';

const pct = (vb) => (x, y) => ({ left: `${(x / vb[0]) * 100}%`, top: `${(y / vb[1]) * 100}%` });
const Lock = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z" /></svg>;
const Check = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const swap = (el, sel, cls, on) => el.querySelectorAll(sel).forEach((n) => n.classList.toggle(cls, on));

/* ---------- the trust gap: authenticated is not the same as trusted ---------- */
const TG = [1200, 440];
const tp = pct(TG);
export function TrustGap() {
  const ref = useRef(null);
  useScene(ref, ({ createTimeline, stagger, svg }, el, $) => {
    const says = [...$('.tg-say')];
    const blurIn = { opacity: [0, 1], filter: ['blur(10px)', 'blur(0px)'], y: [10, 0], duration: 650, ease: 'outQuart' };
    const blurOut = { opacity: 0, filter: 'blur(10px)', y: -10, duration: 450, ease: 'inQuart' };
    return createTimeline({ loop: true })
      .set($('.tg-say, .tg-layer, .tg-s, .tg-verdict, .tg-ck'), { opacity: 0 }, 0)
      .set($('.tg-lock'), { scale: 0 }, 0)
      .set($('.tg-apps .dx-app'), { opacity: 1 }, 0)
      .add(svg.createDrawable($('.tg-ring')), { draw: ['0 0', '0 1'], duration: 900, ease: 'inOutQuad' }, 150)
      .add(svg.createDrawable($('.tg-line')), { draw: ['0 0', '0 1'], duration: 700, ease: 'outQuad' }, 400)
      .add($('.tg-ck'), { opacity: [0, 1], x: [-8, 0], duration: 400, delay: stagger(220) }, 600)
      .add(says[0], blurIn, 1500).add(says[0], blurOut, 2900)
      .add(says[1], blurIn, 3350).add(says[1], blurOut, 4500)
      .add(says[2], blurIn, 4950).add(says[2], blurOut, 6000)
      .add($('.tg-layer'), { opacity: [0, 1], scale: [0.9, 1], duration: 700, ease: 'outBack(1.6)' }, 6300)
      .add(svg.createDrawable($('.tg-mid')), { draw: ['0.5 0.5', '0 1'], duration: 700, ease: 'outQuad' }, 6300)
      .add($('.tg-s'), { opacity: [0, 1], y: [10, 0], duration: 450, delay: stagger(260), ease: 'outQuart' }, 6900)
      .add($('.tg-verdict'), { opacity: [0, 1], scale: [0.9, 1], duration: 500, ease: 'outBack(2)' }, 8000)
      .add($('.tg-lock'), { scale: [0, 1], duration: 450, delay: stagger(90), ease: 'outBack(2.5)' }, 8300)
      .add($('.tg-apps .dx-app'), { opacity: 0.55, duration: 400 }, 8400)
      .add($('.tg-layer, .tg-s, .tg-verdict, .tg-ck'), { opacity: 0, duration: 500 }, 11200)
      .add($('.tg-lock'), { scale: 0, duration: 300 }, 11200)
      .add(svg.createDrawable($('.tg-mid, .tg-line, .tg-ring')), { draw: '1 1', duration: 500 }, 11200);
  });
  return (
    <figure ref={ref} className="dx-media dx-scroll" aria-label="Animation: a user passes authentication with password and MFA. Most stacks then trust them blindly. Deep Algorithms asks whether they should keep access: a new device, impossible travel and a burst of MFA pushes raise the risk to 88, and the session is revoked across four apps.">
      <div className="dx-st" style={{ '--ar': `${TG[0]} / ${TG[1]}`, '--u': 80 }}>
        <div className="dx-s" aria-hidden="true">
          <svg className="dx-svg" viewBox={`0 0 ${TG[0]} ${TG[1]}`} preserveAspectRatio="none">
            <path className="tg-line" d="M248 180 H 395" stroke="rgb(170 190 220 / .45)" strokeWidth="1.2" fill="none" />
            <path className="tg-line" d="M805 180 H 950" stroke="rgb(170 190 220 / .45)" strokeWidth="1.2" fill="none" />
            <path className="tg-line" d="M395 150 V 210 M805 150 V 210" stroke="rgb(170 190 220 / .35)" strokeWidth="1.2" fill="none" />
            <path className="tg-mid" d="M395 180 H 805" stroke="#4cb4ff" strokeWidth="1.6" fill="none" style={{ filter: 'drop-shadow(0 0 6px #4cb4ff)' }} />
          </svg>
          <div className="dx-abs dx-c tg-node" style={tp(170, 180)}>
            <svg className="tg-rs" viewBox="0 0 100 100"><circle className="tg-ring" cx="50" cy="50" r="48" fill="none" stroke="#e8edf5" strokeWidth="1.4" transform="rotate(-90 50 50)" /></svg>
            <AppIcon k="okta" />
          </div>
          <p className="dx-abs dx-c tg-cap" style={tp(170, 268)}>Authentication</p>
          <ul className="dx-abs tg-check" style={{ ...tp(118, 300) }}>
            {['Username', 'Password', 'MFA approved'].map((x) => <li key={x} className="tg-ck"><i><Check /></i>{x}</li>)}
          </ul>

          <div className="dx-abs dx-c" style={tp(1030, 180)}>
            <div className="tg-apps">
              {['salesforce', 'aws', 'github', 'm365'].map((k) => <span key={k} style={{ position: 'relative' }}><AppIcon k={k} /><span className="tg-lock"><Lock /></span></span>)}
            </div>
          </div>
          <p className="dx-abs dx-c tg-cap" style={tp(1030, 268)}>Access</p>

          <p className="dx-abs dx-c tg-say bad" style={{ ...tp(600, 168), opacity: 0 }}>Trusted, blindly.<small>Logged in once, allowed everywhere</small></p>
          <p className="dx-abs dx-c tg-say" style={{ ...tp(600, 168), opacity: 0 }}>Can they get in?</p>
          <p className="dx-abs dx-c tg-say" style={{ ...tp(600, 168), opacity: 0 }}>Should they still?</p>

          <div className="dx-abs dx-c tg-layer" style={tp(600, 180)}>
            <p className="t">Deep Algorithms · continuous identity intelligence</p>
            <p className="s">Every session, compared with its own normal</p>
          </div>
          <div className="dx-abs dx-c tg-sigs" style={tp(600, 285)}>
            <span className="dx-pill warn tg-s"><i className="d" />New device · first seen 4 min ago</span>
            <span className="dx-pill bad tg-s"><i className="d" />Mumbai → Lagos in 22 min</span>
            <span className="dx-pill bad tg-s"><i className="d" />9 MFA pushes in 2 min</span>
          </div>
          <div className="dx-abs dx-c tg-verdict" style={tp(600, 360)}>
            <span className="dx-pill bad" style={{ fontSize: '1.05em' }}><i className="d" /><b>Risk 88</b> · session revoked in 4 apps · 1.4 s</span>
          </div>
        </div>
      </div>
      <figcaption className="dx-tag">Illustrative</figcaption>
    </figure>
  );
}

/* ---------- see every identity ---------- */
const IG = [560, 400];
const ip = pct(IG);
const SRC = ['okta', 'entra', 'aws', 'gcp', 'salesforce', 'github', 'slack', 'm365'];
const HUB = [280, 188];
const srcAt = (i) => { const a = (i / SRC.length) * Math.PI * 2 - Math.PI / 2; return [HUB[0] + Math.cos(a) * 214, HUB[1] + Math.sin(a) * 140]; };
const KIND = ['#7fd3ff', '#7fd3ff', '#ffd27a', '#9a8cff'];
export function IdentityGraph() {
  const ref = useRef(null);
  useScene(ref, (a, el, $) => {
    const { createTimeline, animate, stagger, svg } = a;
    const flows = [];
    const tl = createTimeline({ loop: true })
      .set($('.ig-src'), { opacity: 0, scale: 0.7 }, 0)
      .set($('.ig-legend .dx-pill'), { opacity: 0, y: 8 }, 0)
      .add($('.ig-src'), { opacity: 1, scale: 1, duration: 500, delay: stagger(70), ease: 'outBack(1.8)' }, 100)
      .add(svg.createDrawable($('.ig-ln')), { draw: ['1 1', '0 1'], duration: 800, delay: stagger(70), ease: 'inOutQuad' }, 300)
      .call(() => {
        if (flows.length) return;
        el.querySelectorAll('.ig-dot').forEach((d, i) => flows.push(animate(d, { ...svg.createMotionPath(el.querySelector(`#igl-${i % SRC.length}`)), opacity: [0, 1, 0.2], duration: 1500, delay: 200 + i * 230, loop: true, ease: 'inQuad' })));
      }, 900)
      .call(() => { counter(a, el.querySelector('.ig-tot'), 0, 56005, { duration: 2600 }); counter(a, el.querySelector('.ig-a'), 0, 10656, { duration: 2400 }); counter(a, el.querySelector('.ig-b'), 0, 44245, { duration: 2600 }); counter(a, el.querySelector('.ig-c'), 0, 1104, { duration: 2800 }); }, 900)
      .add($('.ig-legend .dx-pill'), { opacity: 1, y: 0, duration: 500, delay: stagger(140), ease: 'outQuart' }, 1100)
      .add($('.ig-src, .ig-legend .dx-pill'), { opacity: 0, duration: 400 }, 8200)
      .add(svg.createDrawable($('.ig-ln')), { draw: '0 0', duration: 400 }, 8200);
    return { play: () => { tl.play(); flows.forEach((f) => f.play()); }, pause: () => { tl.pause(); flows.forEach((f) => f.pause()); }, revert: () => { tl.revert(); flows.forEach((f) => f.revert()); } };
  });
  return (
    <figure ref={ref} className="dx-media" aria-label="Animation: identities stream from Okta, Entra ID, AWS, Google Cloud, Salesforce, GitHub, Slack and Microsoft 365 into one inventory of people, machine identities and AI agents.">
      <div className="dx-st" style={{ '--ar': `${IG[0]} / ${IG[1]}`, '--u': 40 }}>
        <div className="dx-s" aria-hidden="true">
          <svg className="dx-svg" viewBox={`0 0 ${IG[0]} ${IG[1]}`} preserveAspectRatio="none">
            {SRC.map((_, i) => { const [x, y] = srcAt(i); return <path key={i} id={`igl-${i}`} className="ig-ln" d={`M${x} ${y} L${HUB[0]} ${HUB[1]}`} stroke="rgb(120 170 255 / .28)" strokeWidth="1" strokeDasharray="2 3" fill="none" />; })}
            {Array.from({ length: 16 }, (_, i) => <circle key={i} className="ig-dot" r="3" fill={KIND[i % 4]} opacity="0" style={{ filter: `drop-shadow(0 0 3px ${KIND[i % 4]})` }} />)}
          </svg>
          {SRC.map((k, i) => <div key={k} className="ig-src" style={ip(...srcAt(i))}><AppIcon k={k} /></div>)}
          <div className="dx-abs dx-c ig-hub" style={ip(...HUB)}>
            <b className="ig-tot">56,005</b>
            <span>Identities<br />one inventory</span>
          </div>
          <div className="dx-abs ig-legend" style={{ left: 0, right: 0, bottom: '5%' }}>
            <span className="dx-pill"><i className="d" />People <b className="ig-a">10,656</b></span>
            <span className="dx-pill warn"><i className="d" />Machines <b className="ig-b">44,245</b></span>
            <span className="dx-pill" style={{ '--sig': '#9a8cff' }}><i className="d" />AI agents <b className="ig-c">1,104</b></span>
          </div>
        </div>
      </div>
      <figcaption className="dx-tag">Illustrative</figcaption>
    </figure>
  );
}

/* ---------- fix posture before it is used ---------- */
const FIND = [['crit', 'MFA not enforced', '214 accounts'], ['crit', 'Dormant domain admins', '12'], ['warn', 'Keys unused for 90 days', '38'], ['warn', 'Shared service passwords', '9']];
const SCORES = [61, 72, 80, 86, 91];
export function PostureScore() {
  const ref = useRef(null);
  useScene(ref, (a, el, $) => {
    const { createTimeline, svg } = a;
    const num = el.querySelector('.ps-num');
    const arc = svg.createDrawable($('.ps-arc'));
    const tl = createTimeline({ loop: true })
      .set($('.ps-row .fix'), { opacity: 0, x: -10 }, 0)
      .set($('.ps-row'), { opacity: 1 }, 0)
      .call(() => { num.textContent = '61'; }, 0)
      .add(arc, { draw: ['0 0', `0 ${SCORES[0] / 100}`], duration: 900, ease: 'outExpo' }, 100);
    FIND.forEach((_, i) => {
      const at = 1400 + i * 1250;
      tl.add($('.ps-row .fix')[i], { opacity: 1, x: 0, duration: 450, ease: 'outQuart' }, at)
        .add($('.ps-row')[i], { opacity: 0.55, duration: 500 }, at + 400)
        .add(arc, { draw: `0 ${SCORES[i + 1] / 100}`, duration: 700, ease: 'outQuart' }, at + 150)
        .call(() => counter(a, num, SCORES[i], SCORES[i + 1], { duration: 700 }), at + 150);
    });
    return tl.add($('.ps-row .fix'), { opacity: 0, duration: 400 }, 8800).add($('.ps-row'), { opacity: 1, duration: 400 }, 8800);
  });
  return (
    <figure ref={ref} className="dx-media" aria-label="Animation: an identity posture score rises from 61 to 91 as four findings are fixed: MFA gaps, dormant domain admins, unused keys and shared service passwords.">
      <div className="dx-st" style={{ '--ar': '560 / 400', '--u': 40 }}>
        <div className="dx-s" aria-hidden="true">
          <div className="dx-abs dx-c ps-gauge" style={{ left: '26%', top: '48%' }}>
            <svg className="dx-svg" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="44" fill="none" stroke="rgb(255 255 255 / .07)" strokeWidth="5" />
              <circle className="ps-arc" cx="50" cy="50" r="44" fill="none" stroke="url(#ps-g)" strokeWidth="5" strokeLinecap="round" transform="rotate(-90 50 50)" pathLength="1" strokeDasharray="0.91 1" />
              <defs><linearGradient id="ps-g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#4cb4ff" /><stop offset="1" stopColor="#34d399" /></linearGradient></defs>
            </svg>
            <div className="dx-abs dx-c" style={{ left: '50%', top: '50%', textAlign: 'center' }}>
              <p className="ps-num">91</p>
              <p className="ps-lab">Identity<br />posture</p>
            </div>
          </div>
          <div className="dx-abs ps-list" style={{ left: '50.5%', top: '50%', translate: '0 -50%' }}>
            {FIND.map(([s, t, c]) => (
              <div key={t} className={`ps-row ${s}`}>
                <i className="sev" /><span>{t}</span><span className="cnt">{c}</span>
                <span className="fix"><Check />Fixed</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="dx-tag">Illustrative</figcaption>
    </figure>
  );
}

/* ---------- catch the threat inside the session ---------- */
const SS = [560, 400];
const BAND = 'M30 236 C 120 228, 200 244, 290 232 S 450 238, 530 230 L 530 268 C 450 276, 370 262, 290 270 S 120 266, 30 272 Z';
const LIVE = 'M30 254 C 110 246, 170 258, 230 250 S 300 236, 330 200 S 380 150, 420 158 S 470 120, 530 104';
const FLAGS = [[322, 196, 'warn', 'New device'], [418, 150, 'bad', 'Mumbai → Lagos, 22 min'], [512, 106, 'bad', 'MFA push ×9']];
export function SessionSignals() {
  const ref = useRef(null);
  useScene(ref, (a, el, $) => {
    const { createTimeline, stagger, svg } = a;
    const risk = el.querySelector('.ss-risk b');
    return createTimeline({ loop: true })
      .set($('.ss-flag, .ss-foot'), { opacity: 0 }, 0)
      .call(() => { risk.textContent = '8'; }, 0)
      .add(svg.createDrawable($('.ss-live')), { draw: ['0 0', '0 1'], duration: 4200, ease: 'inOutSine' }, 300)
      .add($('.ss-flag'), { opacity: [0, 1], y: [8, 0], duration: 450, delay: stagger(1050, { start: 0 }), ease: 'outBack(2)' }, 2300)
      .call(() => counter(a, risk, 8, 34, { duration: 600 }), 2300)
      .call(() => counter(a, risk, 34, 61, { duration: 600 }), 3350)
      .call(() => counter(a, risk, 61, 88, { duration: 600 }), 4400)
      .add($('.ss-foot'), { opacity: [0, 1], y: [10, 0], duration: 500, ease: 'outQuart' }, 5000)
      .add($('.ss-flag, .ss-foot'), { opacity: 0, duration: 400 }, 9000)
      .add(svg.createDrawable($('.ss-live')), { draw: '1 1', duration: 400 }, 9000);
  });
  return (
    <figure ref={ref} className="dx-media" aria-label="Animation: a treasury analyst's session drifts away from their normal behaviour band. A new device, impossible travel and repeated MFA pushes raise the risk score from 8 to 88, and the session is revoked in 1.4 seconds.">
      <div className="dx-st" style={{ '--ar': `${SS[0]} / ${SS[1]}`, '--u': 40 }}>
        <div className="dx-s" aria-hidden="true">
          <div className="dx-abs ss-who" style={{ left: '5.5%', top: '7%' }}>
            <span className="ss-av">RM</span>
            <span><b>r.mehta</b><span>Treasury analyst · via Okta</span></span>
          </div>
          <div className="dx-abs ss-risk" style={{ right: '5.5%', top: '6%' }}><b>88</b><span>Identity risk</span></div>
          <svg className="dx-svg" viewBox={`0 0 ${SS[0]} ${SS[1]}`} preserveAspectRatio="none">
            {[120, 170, 220, 270].map((y) => <path key={y} d={`M30 ${y} H530`} stroke="rgb(150 180 240 / .07)" strokeWidth="1" />)}
            <path d={BAND} fill="rgb(76 180 255 / .12)" stroke="rgb(76 180 255 / .3)" strokeWidth="1" />
            <path className="ss-live" d={LIVE} fill="none" stroke="#ff8a98" strokeWidth="2.2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 5px rgb(255 91 110 / .6))' }} />
            {FLAGS.map(([x, y]) => <circle key={x} className="ss-flag" cx={x} cy={y} r="4.5" fill="#fff" stroke="#ff5b6e" strokeWidth="2" />)}
          </svg>
          <p className="dx-abs" style={{ left: '6%', top: '71%', font: '500 .62em/1 "Geist Mono Variable", monospace', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--sig-2)' }}>Their normal, learned</p>
          {FLAGS.map(([x, y, t, l]) => <div key={l} className="ss-flag" style={{ left: `${(x / SS[0]) * 100 - (x > 480 ? 8 : 0)}%`, top: `${((y - 10) / SS[1]) * 100}%` }}><span className={`dx-pill ${t}`}><i className="d" />{l}</span></div>)}
          <div className="dx-abs ss-foot" style={{ left: '5.5%', right: '5.5%', bottom: '6%' }}>
            <span className="dx-pill bad" style={{ padding: '.3em .5em' }}><i className="d" /></span>
            <span><b>Session revoked</b> in Okta, Microsoft 365 and Salesforce · 1.4 s</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ---------- respond in proportion ---------- */
const RUNGS = [['Allow', '0–29', 'var(--ok)'], ['Step-up MFA', '30–59', 'var(--sig)'], ['Hold the action', '60–79', 'var(--warn)'], ['Revoke everywhere', '80+', 'var(--bad)']];
const LOG = [['okta', 'Okta', 'Step-up MFA sent to r.mehta'], ['salesforce', 'Salesforce', 'Report export held for review'], ['entra', 'Entra ID', 'All sessions revoked'], ['slack', 'Slack', '#soc-alerts: case DA-4127 opened']];
export function ResponseLadder() {
  const ref = useRef(null);
  useScene(ref, (a, el, $) => {
    const { createTimeline } = a;
    const num = el.querySelector('.rl-meter b');
    const rungs = [...$('.rl-rung')], logs = [...$('.rl-log li')];
    const on = (i) => rungs.forEach((r, j) => r.classList.toggle('on', j === i));
    const tl = createTimeline({ loop: true })
      .set(logs, { opacity: 0, x: 14 }, 0)
      .call(() => { on(0); num.textContent = '12'; }, 0);
    [[46, 1, 1200], [71, 2, 3000], [88, 3, 4800]].forEach(([v, i, at], k) => {
      tl.call(() => { counter(a, num, [12, 46, 71][k], v, { duration: 700 }); }, at)
        .call(() => on(i), at + 500)
        .add(logs[k], { opacity: 1, x: 0, duration: 500, ease: 'outQuart' }, at + 600);
    });
    return tl.add(logs[3], { opacity: 1, x: 0, duration: 500, ease: 'outQuart' }, 6000)
      .add(logs, { opacity: 0, duration: 400 }, 9200);
  });
  return (
    <figure ref={ref} className="dx-media" aria-label="Animation: as identity risk rises from 12 to 88, the response steps from allow to step-up MFA, to holding the action, to revoking every session, with actions taken in Okta, Salesforce, Entra ID and Slack.">
      <div className="dx-st" style={{ '--ar': '560 / 400', '--u': 40 }}>
        <div className="dx-s" aria-hidden="true">
          <p className="dx-abs rl-meter" style={{ left: '6%', top: '7%' }}>RISK <b>88</b></p>
          <div className="dx-abs rl-rungs" style={{ left: '6%', top: '30%' }}>
            {RUNGS.map(([n, r, c], i) => <div key={n} className={`rl-rung${i === 3 ? ' on' : ''}`} style={{ '--c': c }}>{n}<span>{r}</span></div>)}
          </div>
          <ul className="dx-abs rl-log" style={{ right: '5%', top: '50%', translate: '0 -50%', margin: 0, padding: 0 }}>
            {LOG.map(([k, n, t]) => <li key={k}><AppIcon k={k} /><span>{n}<small>{t}</small></span></li>)}
          </ul>
        </div>
      </div>
      <figcaption className="dx-tag">Illustrative</figcaption>
    </figure>
  );
}
