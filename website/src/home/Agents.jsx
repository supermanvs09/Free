import { useRef } from 'react';
import { useScene } from './scene.js';

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
