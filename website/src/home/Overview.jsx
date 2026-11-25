import { useRef } from 'react';
import AppIcon from './AppIcon.jsx';
import { useScene, counter } from './scene.js';

/* Continuous AI-SPM in one picture. Identity sources on the left, AI agent
   platforms on the right, both streaming signals into one posture engine
   that scores everything continuously. Every few seconds an agent action
   arrives outside its task: the engine catches it at the edge. */

const VB = [1200, 620];
const L = [['okta', 'Okta'], ['entra', 'Entra ID'], ['ad', 'Active Directory'], ['aws', 'AWS IAM'], ['google', 'Google Workspace'], ['salesforce', 'Salesforce'], ['github', 'GitHub']];
const R = [['claude', 'Claude'], ['copilot', 'Copilot'], ['cursor', 'Cursor'], ['gemini', 'Gemini'], ['n8n', 'n8n'], ['zapier', 'Zapier'], ['mcp', 'MCP servers']];
const YS = [95, 170, 245, 320, 395, 470, 545];
const CORE = [600, 285];
const ey = (y) => CORE[1] + (y - 320) * 0.25;
const pathL = (y) => `M232 ${y} C 360 ${y}, 360 ${ey(y)}, 468 ${ey(y)}`;
const pathR = (y) => `M968 ${y} C 840 ${y}, 840 ${ey(y)}, 732 ${ey(y)}`;
const pct = (x, y) => ({ left: `${(x / VB[0]) * 100}%`, top: `${(y / VB[1]) * 100}%` });

export default function Overview() {
  const ref = useRef(null);
  useScene(ref, (a, el, $) => {
    const { createTimeline, animate, stagger, svg, utils } = a;
    const packets = [];
    const tl = createTimeline({ loop: true, defaults: { ease: 'outQuart' } });
    tl.set($('.ov-t'), { opacity: 0, scale: 0.85 }, 0)
      .set($('.ov-o'), { opacity: 0, y: 14 }, 0)
      .set($('.ov-core'), { scale: 0.86, opacity: 0 }, 0)
      .call(() => { el.querySelector('.ov-core').classList.remove('hit'); el.querySelector('.ov-score').textContent = '0'; }, 0)
      .add($('.ov-core'), { scale: 1, opacity: 1, duration: 900, ease: 'outBack(1.4)' }, 100)
      .add($('.ov-t'), { opacity: 1, scale: 1, duration: 600, delay: stagger(55, { from: 'center' }) }, 250)
      .add(svg.createDrawable($('.ov-p')), { draw: ['0 0', '0 1'], duration: 1100, ease: 'inOutQuad', delay: stagger(40) }, 500)
      .add(svg.createDrawable($('.ov-arc')), { draw: ['0 0', '0 0.87'], duration: 1600, ease: 'outExpo' }, 1300)
      .call(() => counter(a, el.querySelector('.ov-score'), 0, 87, { duration: 1600 }), 1300)
      .call(() => {
        if (packets.length) return;
        el.querySelectorAll('.ov-pk').forEach((dot, i) => {
          const p = el.querySelector(`#ovp-${dot.dataset.p}`);
          packets.push(animate(dot, { ...svg.createMotionPath(p), opacity: [0, 1, 1, 0], duration: 2200 + (i % 5) * 260, delay: i * 330, loop: true, ease: 'inOutSine' }));
        });
      }, 1700)
      .add($('.ov-o'), { opacity: 1, y: 0, duration: 700, delay: stagger(160) }, 2300)
      // an agent action outside its task, stopped at the engine's edge
      .add($('.ov-threat'), { ...svg.createMotionPath(el.querySelector('#ovp-r2')), opacity: [0, 1], duration: 1500, ease: 'inQuad' }, 4600)
      .call(() => el.querySelector('.ov-core').classList.add('hit'), 6100)
      .add($('.ov-threat'), { scale: [1, 3], opacity: [1, 0], duration: 500 }, 6100)
      .add($('.ov-o.bad'), { scale: [1, 1.08, 1], duration: 600, ease: 'inOutQuad' }, 6150)
      .call(() => el.querySelector('.ov-core').classList.remove('hit'), 7300)
      .add($('.ov-t, .ov-o'), { opacity: 0, duration: 500, ease: 'inQuad' }, 9200)
      .add($('.ov-core'), { opacity: 0, scale: 0.92, duration: 500, ease: 'inQuad' }, 9300)
      .add(svg.createDrawable($('.ov-p')), { draw: ['0 1', '1 1'], duration: 600, ease: 'inQuad' }, 9200);
    utils.set($('.ov-threat'), { opacity: 0 });
    return { play: () => { tl.play(); packets.forEach((p) => p.play()); }, pause: () => { tl.pause(); packets.forEach((p) => p.pause()); }, revert: () => { tl.revert(); packets.forEach((p) => p.revert()); } };
  }, { threshold: 0.25 });

  return (
    <figure ref={ref} className="dx-media dx-scroll" aria-label="Diagram: identity sources and AI agent platforms stream signals into one continuous posture engine, which scores every identity and stops an agent action outside its task.">
      <div className="dx-st" style={{ '--ar': `${VB[0]} / ${VB[1]}`, '--u': 80 }}>
        <div className="dx-s" aria-hidden="true">
          <svg className="dx-svg" viewBox={`0 0 ${VB[0]} ${VB[1]}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="ov-gl" x1="0" x2="1"><stop offset="0" stopColor="#4cb4ff" stopOpacity=".15" /><stop offset="1" stopColor="#4cb4ff" stopOpacity=".7" /></linearGradient>
              <linearGradient id="ov-gr" x1="1" x2="0"><stop offset="0" stopColor="#9a8cff" stopOpacity=".15" /><stop offset="1" stopColor="#9a8cff" stopOpacity=".75" /></linearGradient>
              <filter id="ov-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3" /></filter>
            </defs>
            {YS.map((y, i) => <path key={`l${i}`} id={`ovp-l${i}`} className="ov-p" d={pathL(y)} fill="none" stroke="url(#ov-gl)" strokeWidth="1.3" />)}
            {YS.map((y, i) => <path key={`r${i}`} id={`ovp-r${i}`} className="ov-p" d={pathR(y)} fill="none" stroke="url(#ov-gr)" strokeWidth="1.3" />)}
            {YS.map((_, i) => <circle key={`pl${i}`} className="ov-pk" data-p={`l${i}`} r="3.2" fill="#bfe6ff" opacity="0" style={{ filter: 'drop-shadow(0 0 4px #4cb4ff)' }} />)}
            {YS.map((_, i) => <circle key={`pr${i}`} className="ov-pk" data-p={`r${i}`} r="3.2" fill="#ddd6ff" opacity="0" style={{ filter: 'drop-shadow(0 0 4px #9a8cff)' }} />)}
            <circle className="ov-threat" r="5" fill="#ff5b6e" style={{ filter: 'drop-shadow(0 0 6px #ff5b6e)' }} />
          </svg>

          <p className="dx-abs ov-col-h" style={{ left: '3.5%', top: '4%' }}>Human and machine identities</p>
          <p className="dx-abs ov-col-h" style={{ right: '3.5%', top: '4%', textAlign: 'right' }}>AI agents and workflows</p>
          {L.map(([k, n], i) => <div key={k} className="dx-abs dx-c ov-t" style={pct(135, YS[i])}><AppIcon k={k} label={n} /></div>)}
          {R.map(([k, n], i) => <div key={k} className="dx-abs dx-c ov-t" style={pct(1065, YS[i])}><AppIcon k={k} label={n} /></div>)}

          <div className="dx-abs dx-c ov-core" style={pct(...CORE)}>
            <svg className="ov-ring" viewBox="0 0 100 100">
              <g className="ov-spin"><circle cx="50" cy="50" r="49" fill="none" stroke="rgb(120 170 255 / .25)" strokeWidth=".3" strokeDasharray="1 2.2" /></g>
              <g className="ov-spin r"><circle cx="50" cy="50" r="45" fill="none" stroke="rgb(154 140 255 / .3)" strokeWidth=".3" strokeDasharray="6 4" /></g>
              <circle cx="50" cy="50" r="41.5" fill="none" stroke="rgb(255 255 255 / .07)" strokeWidth="1.2" />
              <circle className="ov-arc" cx="50" cy="50" r="41.5" fill="none" stroke="#4cb4ff" strokeWidth="1.2" strokeLinecap="round" transform="rotate(-90 50 50)" pathLength="1" strokeDasharray="0.87 1" />
            </svg>
            <div className="ov-core-disc">
              <img src="/brand/mark.webp" alt="" width="40" height="40" />
              <span className="ov-score">87</span>
              <span className="ov-core-l">Posture, live</span>
            </div>
          </div>

          <div className="dx-abs ov-out" style={{ left: '50%', top: '72%', translate: '-50% 0' }}>
            <span className="dx-pill ok ov-o"><i className="d" />58,432 identities in one inventory</span>
            <span className="dx-pill bad ov-o"><i className="d" /><b>Agent action blocked</b> · outside its task</span>
            <span className="dx-pill ov-o"><i className="d" />Every decision on the record</span>
          </div>
        </div>
      </div>
      <figcaption className="dx-tag">Illustrative</figcaption>
    </figure>
  );
}
