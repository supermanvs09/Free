import { useRef } from 'react';
import AppIcon from './AppIcon.jsx';
import { useScene, counter } from './scene.js';

const pct = (vb) => (x, y) => ({ left: `${(x / vb[0]) * 100}%`, top: `${(y / vb[1]) * 100}%` });
const Check = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const Cross = () => <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
const LockI = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1zm2 0h6V8a3 3 0 0 0-6 0v2z" /></svg>;
const Spark = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <rect key={i} x="11.1" y="1.5" width="1.8" height="9" rx=".9" transform={`rotate(${i * 30} 12 12)`} />)}</svg>;

/* ---------- the film's 1:00 scene, rebuilt: Claude, a pasted .env, blocked ---------- */
const ASK = 'Prod deploy of payments-service fails with AccessDenied. Here’s our .env, can you spot the problem?';
export function ClaudeBlock() {
  const ref = useRef(null);
  useScene(ref, ({ createTimeline, stagger }, el, $) => {
    const q = el.querySelector('.cl-q-t');
    const box = el.querySelector('.cl-box'), env = el.querySelector('.cl-env');
    const typed = { n: 0 };
    return createTimeline({ loop: true })
      .set($('.cl-main'), { opacity: 0 }, 0)
      .set($('.cl-hello'), { opacity: 1, y: 0 }, 0)
      .set($('.cl-toast'), { opacity: 0, y: '-1.2em' }, 0)
      .set($('.cl-env > div, .cl-note'), { opacity: 0 }, 0)
      .set($('.cl-sec .hl'), { opacity: 0 }, 0)
      .set($('.cl-lab'), { opacity: 0, scale: 0.6 }, 0)
      .set($('.cl-send .lock'), { opacity: 0 }, 0)
      .set($('.cl-send .go'), { opacity: 1 }, 0)
      .set($('.cl-ptr'), { opacity: 0, x: '7em', y: '6em' }, 0)
      .call(() => { q.textContent = ''; box.classList.remove('blocked'); env.classList.remove('blk'); }, 0)
      .add($('.cl-main'), { opacity: 1, duration: 400 }, 0)
      .add(typed, { n: [0, ASK.length], duration: 2600, ease: 'linear', onUpdate: () => { q.textContent = ASK.slice(0, Math.round(typed.n)); } }, 500)
      .add($('.cl-env > div'), { opacity: [0, 1], duration: 180, delay: stagger(45) }, 3350)
      .add($('.cl-ptr'), { opacity: [0, 1], x: '0em', y: '0em', duration: 900, ease: 'outCubic' }, 3800)
      .add($('.cl-ptr'), { scale: [1, 0.82, 1], duration: 260 }, 4750)
      .add($('.cl-send'), { scale: [1, 0.9, 1], duration: 260 }, 4750)
      // Zenstra decides on the device, before the prompt leaves
      .call(() => { box.classList.add('blocked'); env.classList.add('blk'); }, 5050)
      .add($('.cl-hello'), { opacity: 0, y: '-0.6em', duration: 350 }, 5050)
      .add($('.cl-toast'), { opacity: 1, y: '0em', duration: 650, ease: 'outBack(1.4)' }, 5150)
      .add($('.cl-send .go'), { opacity: 0, duration: 200 }, 5100)
      .add($('.cl-send .lock'), { opacity: 1, duration: 200 }, 5100)
      .add($('.cl-sec .hl'), { opacity: 1, duration: 300, delay: stagger(160) }, 5450)
      .add($('.cl-lab'), { opacity: 1, scale: 1, duration: 380, delay: stagger(160), ease: 'outBack(2)' }, 5600)
      .add($('.cl-ptr'), { opacity: 0, duration: 300 }, 5600)
      .add($('.cl-note'), { opacity: [0, 1], duration: 400 }, 6300)
      .add($('.cl-main'), { opacity: 0, duration: 450 }, 11000);
  }, { threshold: 0.35 });

  const S = ({ v, l }) => <><span className="cl-sec"><span className="hl" /><span className="v">{v}</span></span><span className="cl-lab">{l}</span></>;
  return (
    <figure ref={ref} className="dx-media dx-scroll" aria-label="Animation from the Deep Algorithms film: in Claude, a developer pastes a production .env file with an AWS access key, secret key and database password and presses send. Zenstra AI blocks the prompt on the device: it was not sent, each secret is highlighted, and the decision is recorded.">
      <div className="dx-st" style={{ '--ar': '1600 / 980', '--u': 92 }}>
        <div className="dx-s" aria-hidden="true">
          <div className="cl-win">
            <div className="cl-bar"><i /><i /><i /><span className="cl-url"><LockI />claude.ai/new</span></div>
            <div className="cl-rail">
              <span className="lg"><Spark /></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="5" width="14" height="14" rx="1.5" /></svg>
              <span className="cl-pk">PK</span>
            </div>
            <div className="cl-main">
              <p className="cl-hello" style={{ opacity: 0 }}><Spark />Good evening, Priya</p>
              <div className="cl-toast">
                <img src="/brand/products/zenstra.webp" alt="" width="48" height="48" />
                <div><b><em>Blocked!</em> This prompt contains credentials, API keys and tokens.</b><p>It was not sent.</p></div>
                <p className="cl-pol">Policy<strong>Sensitive credential protection</strong></p>
              </div>
              <div className="cl-box blocked">
                <p className="cl-q"><span className="cl-q-t">{ASK}</span><span className="cl-caret" /></p>
                <div className="cl-env blk">
                  <div><span className="k">NODE_ENV=</span>production</div>
                  <div><span className="k">AWS_REGION=</span>ap-south-1</div>
                  <div><span className="k">AWS_ACCESS_KEY_ID=</span><S v="AKIAIOSFODNN7EXAMPLE" l="AWS access key" /></div>
                  <div><span className="k">AWS_SECRET_ACCESS_KEY=</span><S v="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" l="AWS secret key" /></div>
                  <div><span className="k">DATABASE_URL=</span>postgres://payments_admin:<S v="Pr0d#Settle!2026" l="Production password" />@prod-db.internal:5432/payments</div>
                </div>
                <div className="cl-foot">
                  <span className="cl-plus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
                  <span className="cl-model">Opus <small>High ⌄</small>
                    <span className="cl-send" style={{ position: 'relative' }}>
                      <span className="go"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg></span>
                      <span className="lock"><LockI /></span>
                    </span>
                  </span>
                </div>
                <svg className="cl-ptr" viewBox="0 0 24 24" style={{ right: '-.1em', bottom: '-.4em' }}><path d="M5 3l14 8-6.2 1.6L16 20l-2.6 1.2-3.2-7.4L5 18z" fill="#111" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                <p className="cl-note" style={{ left: 0, bottom: '-2.6em' }}><i />Not sent · decision recorded by Zenstra AI</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="dx-tag">From the Deep Algorithms film · illustrative</figcaption>
    </figure>
  );
}

/* ---------- find every agent, including the shadow ones ---------- */
const BLIPS = [['claude', 30, 30, 0], ['cursor', 68, 24, 1], ['copilot', 80, 56, 0], ['n8n', 58, 74, 1], ['zapier', 28, 70, 0], ['gemini', 46, 44, 0], ['windsurf', 18, 48, 1], ['mcp', 72, 40, 1]];
export function AgentRadar() {
  const ref = useRef(null);
  useScene(ref, (a, el, $) => {
    const { createTimeline, stagger } = a;
    const shadows = $('.ar-blip.s');
    const found = el.querySelector('.ar-f'), own = el.querySelector('.ar-o'), ownL = el.querySelector('.ar-ol');
    return createTimeline({ loop: true })
      .set($('.ar-blip'), { opacity: 0, scale: 0.4 }, 0)
      .call(() => { shadows.forEach((b) => b.classList.add('unowned')); ownL.textContent = 'No owner'; el.querySelector('.ar-stat.o').classList.add('warn'); }, 0)
      .add($('.ar-blip'), { opacity: 1, scale: [0.4, 1], duration: 500, delay: stagger(420), ease: 'outBack(2.2)' }, 300)
      .call(() => counter(a, found, 0, 38, { duration: 3400, ease: 'linear' }), 300)
      .call(() => counter(a, own, 0, 12, { duration: 3400, ease: 'linear' }), 300)
      .call(() => { shadows.forEach((b) => b.classList.remove('unowned')); ownL.textContent = 'Owners assigned'; el.querySelector('.ar-stat.o').classList.remove('warn'); }, 5600)
      .add(shadows, { scale: [1, 1.15, 1], duration: 450, delay: stagger(90) }, 5600)
      .add($('.ar-blip'), { opacity: 0, duration: 400 }, 8800);
  });
  return (
    <figure ref={ref} className="dx-media" aria-label="Animation: a radar sweep across agent platforms and staff devices finds 38 AI agents, including Claude, Cursor, Copilot, n8n, Zapier, Gemini, Windsurf and MCP servers. Twelve have no owner, and each one is assigned an owner.">
      <div className="dx-st" style={{ '--ar': '400 / 380', '--u': 30 }}>
        <div className="dx-s" aria-hidden="true">
          <div className="dx-abs dx-c ar-scope" style={{ left: '50%', top: '42%', width: '19em', height: '19em' }}>
            <span className="ar-sweep" />
            {BLIPS.map(([k, x, y, s]) => <span key={k} className={`ar-blip${s ? ' s' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}><AppIcon k={k} /></span>)}
          </div>
          <div className="dx-abs" style={{ left: '6%', right: '6%', bottom: '5%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5em' }}>
            <span className="ar-stat">Agents found <b className="ar-f">38</b></span>
            <span className="ar-stat o"><span className="ar-ol">Owners assigned</span> <b className="ar-o">12</b></span>
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ---------- workflow security: every hop checked against the task ---------- */
const HOPS = [['gmail', 'New support email', 'Trigger', 'ok', 'In task · 3 ms'], ['n8n', 'Support triage agent', 'Reads the ticket', 'ok', 'In task · 5 ms'], ['salesforce', 'Look up the customer', 'Read 1 record', 'ok', 'In task · 6 ms'], ['salesforce', 'Export all contacts', '12,400 records', 'no', 'Outside task'], ['slack', 'Post the summary', 'Never ran', 'skip', '']];
export function WorkflowGuard() {
  const ref = useRef(null);
  useScene(ref, ({ createTimeline }, el, $) => {
    const nodes = [...$('.wf-node')], chks = [...$('.wf-chk')];
    const tl = createTimeline({ loop: true })
      .set(chks, { opacity: 0, x: -8 }, 0)
      .set($('.wf-tok'), { top: '17%', opacity: 1 }, 0)
      .call(() => { nodes.forEach((n) => n.classList.remove('no', 'skip')); }, 0);
    [17, 34, 51, 68].forEach((y, i) => {
      const at = 400 + i * 1100;
      tl.add($('.wf-tok'), { top: `${y + 6}%`, duration: 700, ease: 'inOutQuad' }, at)
        .add(chks[i], { opacity: 1, x: 0, duration: 400, ease: 'outBack(2)' }, at + 650);
    });
    return tl.call(() => { nodes[3].classList.add('no'); nodes[4].classList.add('skip'); }, 3950)
      .add($('.wf-tok'), { opacity: 0, scale: [1, 2.2], duration: 400 }, 4000)
      .add(chks, { opacity: 0, duration: 400 }, 8600);
  });
  return (
    <figure ref={ref} className="dx-media" aria-label="Animation: a support workflow runs hop by hop, each checked against its task: summarise the ticket and reply. Reading the email and one customer record pass. Exporting all 12,400 contacts is outside the task and blocked, so the final step never runs.">
      <div className="dx-st" style={{ '--ar': '400 / 380', '--u': 30 }}>
        <div className="dx-s" aria-hidden="true">
          <div className="dx-abs wf-task" style={{ left: '6%', top: '5%' }}><span>Task</span>Summarise the ticket and reply</div>
          <svg className="dx-svg" viewBox="0 0 400 380" preserveAspectRatio="none"><path d="M44 86 V 330" stroke="rgb(154 140 255 / .35)" strokeWidth="1.2" strokeDasharray="3 3" /></svg>
          <span className="dx-abs wf-tok" style={{ left: '11%', top: '74%', width: '.7em', height: '.7em', marginLeft: '-.35em', borderRadius: 99, background: '#c4bbff', boxShadow: '0 0 1em #9a8cff', opacity: 0 }} />
          {HOPS.map(([k, t, s, st, c], i) => (
            <div key={t}>
              <div className={`dx-abs wf-node ${st === 'no' ? 'no' : st === 'skip' ? 'skip' : ''}`} style={{ left: '6%', top: `${17 + i * 17}%` }}>
                <AppIcon k={k} /><span><b>{t}</b><small>{s}</small></span>
              </div>
              {c && <div className="wf-chk" style={{ left: '60%', top: `${23 + i * 17}%` }}><span className={`dx-pill ${st === 'no' ? 'bad' : 'ok'}`}>{st === 'no' ? <Cross /> : <Check />}{c}</span></div>}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

/* ---------- cloud security: a gateway in your VPC, in front of every tool ---------- */
const GV = [400, 380];
const gp = pct(GV);
const AG = [['claude', 70], ['gemini', 130], ['langchain', 190]];
const TO = [['github', 55], ['postgres', 110], ['jira', 165], ['s3', 220]];
const GW = [200, 132];
const LOGS = [['allow', 'ALLOW', 'github.create_pull_request', '11 ms'], ['block', 'BLOCK', 'postgres.drop_table', '9 ms'], ['ask', 'ASK', 's3.put_object · public', '14 ms']];
export function CloudGateway() {
  const ref = useRef(null);
  useScene(ref, (a, el, $) => {
    const { createTimeline, animate, stagger, svg } = a;
    const runs = [];
    const tl = createTimeline({ loop: true })
      .set($('.gw-log li'), { opacity: 0, y: 8 }, 0)
      .add(svg.createDrawable($('.gw-p')), { draw: ['0 0', '0 1'], duration: 900, delay: stagger(60), ease: 'inOutQuad' }, 100)
      .call(() => {
        if (runs.length) return;
        el.querySelectorAll('.gw-pk').forEach((d, i) => runs.push(animate(d, { ...svg.createMotionPath(el.querySelector(`#${d.dataset.p}`)), opacity: [0, 1, 1, 0], duration: 1400, delay: i * 420, loop: true, loopDelay: 700, ease: 'inOutSine' })));
      }, 900)
      .add($('.gw-log li'), { opacity: 1, y: 0, duration: 450, delay: stagger(900), ease: 'outQuart' }, 1200)
      .add($('.gw-box'), { scale: [1, 1.06, 1], duration: 500 }, 2100)
      .add($('.gw-log li'), { opacity: 0, duration: 400 }, 7600);
    return { play: () => { tl.play(); runs.forEach((r) => r.play()); }, pause: () => { tl.pause(); runs.forEach((r) => r.pause()); }, revert: () => { tl.revert(); runs.forEach((r) => r.revert()); } };
  });
  return (
    <figure ref={ref} className="dx-media" aria-label="Animation: agents built on Claude, Gemini and LangChain call GitHub, Postgres, Jira and S3 only through the Zenstra gateway inside your VPC, which allows, blocks or asks for each call in milliseconds.">
      <div className="dx-st" style={{ '--ar': `${GV[0]} / ${GV[1]}`, '--u': 30 }}>
        <div className="dx-s" aria-hidden="true">
          <div className="dx-abs gw-vpc" style={{ left: '35%', right: '3%', top: '6%', height: '58%' }}><span>Your VPC</span></div>
          <svg className="dx-svg" viewBox={`0 0 ${GV[0]} ${GV[1]}`} preserveAspectRatio="none">
            {AG.map(([k, y]) => <path key={k} id={`gwa-${k}`} className="gw-p" d={`M62 ${y} C 110 ${y}, 120 ${GW[1]}, 160 ${GW[1]}`} stroke="rgb(154 140 255 / .4)" strokeWidth="1.2" fill="none" />)}
            {TO.map(([k, y]) => <path key={k} id={`gwt-${k}`} className="gw-p" d={`M240 ${GW[1]} C 280 ${GW[1]}, 290 ${y}, 330 ${y}`} stroke="rgb(154 140 255 / .4)" strokeWidth="1.2" fill="none" />)}
            {AG.map(([k]) => <circle key={k} className="gw-pk" data-p={`gwa-${k}`} r="3" fill="#ddd6ff" opacity="0" style={{ filter: 'drop-shadow(0 0 4px #9a8cff)' }} />)}
            {TO.map(([k], i) => <circle key={k} className="gw-pk" data-p={`gwt-${k}`} r="3" fill={i === 1 ? '#ff5b6e' : '#bff5dc'} opacity="0" style={{ filter: `drop-shadow(0 0 4px ${i === 1 ? '#ff5b6e' : '#34d399'})` }} />)}
          </svg>
          {AG.map(([k, y]) => <div key={k} className="dx-abs dx-c" style={gp(40, y)}><AppIcon k={k} /></div>)}
          {TO.map(([k, y]) => <div key={k} className="dx-abs dx-c" style={gp(352, y)}><AppIcon k={k} /></div>)}
          <div className="dx-abs dx-c gw-box" style={gp(...GW)}>
            <img src="/brand/products/zenstra.webp" alt="" width="36" height="36" />
            <b>Zenstra gateway</b>
            <small>Inline · p95 18 ms</small>
          </div>
          <ul className="dx-abs gw-log" style={{ left: '6%', right: '6%', bottom: '5%', margin: 0, padding: 0 }}>
            {LOGS.map(([c, v, t, ms]) => <li key={t}><b className={c}>{v}</b><span>{t}</span><span>{ms}</span></li>)}
          </ul>
        </div>
      </div>
    </figure>
  );
}
