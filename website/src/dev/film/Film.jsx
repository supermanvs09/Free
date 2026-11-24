import { useMemo } from 'react';
import { gsap } from 'gsap';
import TIM from '../../../tools/film/timings.json';
import FOOTAGE from '../../../tools/film/footage.json';
import { ZenGateway } from '../../components/viz/zenstra.jsx';
import { AdapRiskTimeline, NhiGraph } from '../../components/viz/adapid.jsx';
import { ScamCatch } from '../../components/viz/fraud.jsx';
import ProductMark from '../../components/ProductMark.jsx';
import { CUSTOMERS, CERTS } from '../../data/site.js';

/* The product film. Live-action shots (tools/film/footage.json, graded and cut to
   frames by footage.py) carry the world and the threat; the site's own product
   pictures carry the answer. Every frame is a pure function of time `t` (seconds):
   tools/film/render.mjs sets t, waits for the frame's images and captures 1920x1080.

   Structure, after the enterprise brand films it is measured against: the stakes
   in the real world, the threat in one line, the brand, then four times over a
   worst case on screen in silence followed by the product stopping it, proof, call
   to action. Hard cuts on the words; type is large, left-aligned and few. */

export const W = 1920, H = 1080, FPS = 30;
const C = Object.fromEntries(TIM.lines.map((l) => [l.id, l]));
export const LENGTH = Math.ceil((TIM.duration + 0.1) * 10) / 10;
const FRAMES = Object.fromEntries(FOOTAGE.clips.map((c) => [c.id, Math.floor(c.dur * FPS) - 1]));

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => 1 - Math.pow(1 - x, 3);
const inout = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a, b, x) => a + (b - a) * x;
const wordAt = (line, i) => line.start + (i / line.text.split(' ').length) * (line.end - line.start) * 0.92;
const MONO = 'JetBrains Mono Variable, ui-monospace, monospace';

/* ---------- footage ---------- */

/* one shot: the frame for time t, with a slow camera move (scale and drift) */
function Shot({ id, t, a, b, kb = [1.02, 1.1], pan = [0, 0, 0, 0], blur = 0, dim = 0, speed = 1, offset = 0, origin = '50% 50%' }) {
  const n = FRAMES[id];
  const f = clamp(Math.floor((t - a) * FPS * speed) + 1 + offset, 1, n);
  const x = (t - a) / Math.max(0.01, b - a);
  const s = lerp(kb[0], kb[1], x);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#05070a' }}>
      <img src={`/clips/${id}/${String(f).padStart(4, '0')}.jpg`} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transformOrigin: origin, transform: `translate(${lerp(pan[0], pan[2], x)}px, ${lerp(pan[1], pan[3], x)}px) scale(${s + blur * 0.004})`, filter: blur ? `blur(${blur}px)` : undefined }} />
      {dim > 0 && <div style={{ position: 'absolute', inset: 0, background: `rgb(4 6 9 / ${dim})` }} />}
    </div>
  );
}

/* film grain and lens falloff over everything, so stock from many cameras reads as one film */
function useGrain() {
  return useMemo(() => {
    if (typeof document === 'undefined') return [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 6 }, () => {
      const c = document.createElement('canvas'); c.width = c.height = 384;
      const g = c.getContext('2d'), im = g.createImageData(384, 384);
      for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (rnd() - 0.5) * 120; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
      g.putImageData(im, 0, 0);
      return c.toDataURL('image/png');
    });
  }, []);
}
function Finish({ t }) {
  const grain = useGrain();
  const g = grain[Math.floor(t * FPS) % (grain.length || 1)];
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 95% at 50% 45%, transparent 60%, rgb(0 0 0 / .38) 100%)' }} />
      {g && <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${g})`, backgroundSize: '384px 384px', mixBlendMode: 'overlay', opacity: 0.11 }} />}
    </>
  );
}

/* ---------- type ---------- */

/* words light up as they are spoken */
function Spoken({ line, t, size = 84, color = '#fff', dim = 0.22, width = 1400, align = 'left', weight = 600, words: override, part = [0, 1], style }) {
  const words = (override || line.text).split(' ');
  const span = (line.end - line.start) * (part[1] - part[0]);
  const t0 = line.start + (line.end - line.start) * part[0];
  return (
    <p style={{ fontSize: size, fontWeight: weight, letterSpacing: '-0.045em', lineHeight: 1.04, maxWidth: width, textAlign: align, color, margin: align === 'center' ? '0 auto' : 0, textShadow: '0 4px 40px rgb(0 0 0 / .45)', ...style }}>
      {words.map((w, i) => {
        const at = t0 + (i / words.length) * span * 0.92;
        const on = ease(seg(t, at - 0.05, at + 0.25));
        return <span key={i} style={{ opacity: dim + (1 - dim) * on, filter: `blur(${(1 - on) * 3}px)` }}>{w}{i < words.length - 1 ? ' ' : ''}</span>;
      })}
    </p>
  );
}

/* bottom-left scrim so type always sits on dark, whatever the shot */
const Scrim = ({ side = 'bl', o = 0.72 }) => (
  <div style={{ position: 'absolute', inset: 0, background: side === 'bl'
    ? `linear-gradient(20deg, rgb(3 5 8 / ${o}) 0%, rgb(3 5 8 / ${o * 0.55}) 35%, transparent 65%)`
    : side === 'l' ? `linear-gradient(90deg, rgb(3 5 8 / ${o}) 0%, rgb(3 5 8 / ${o * 0.5}) 40%, transparent 70%)`
    : `linear-gradient(180deg, rgb(3 5 8 / ${o}) 0%, transparent 45%)` }} />
);


/* ---------- the four worst cases, in silence ---------- */

/* a real incident: the shot, the date and organisation, one line, and the source.
   Red edge light, nothing else. */
function Incident({ t, a, b, clip, kb, pan, clock, where, line, sub, counter, ch, src, children }) {
  const e = ease(seg(t, a + 0.1, a + 0.5));
  const blink = Math.floor(t * 2.4) % 2 === 0;
  const k = seg(t, a + 0.15, b - 0.2);
  return (
    <>
      <Shot id={clip} t={t} a={a} b={b} kb={kb} pan={pan} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgb(3 5 8 / .86) 0%, rgb(3 5 8 / .18) 52%, rgb(3 5 8 / .38) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 ${180 + 60 * Math.sin(t * 7)}px rgb(255 60 50 / ${0.2 * e})` }} />
      <div style={{ position: 'absolute', left: 120, top: 96, display: 'flex', alignItems: 'center', gap: 18, opacity: e, fontFamily: MONO, fontSize: 26, letterSpacing: '.08em', color: '#ffb3ab' }}>
        <span style={{ width: 14, height: 14, borderRadius: 14, background: '#ff4d40', opacity: blink ? 1 : 0.25, boxShadow: '0 0 20px #ff4d40' }} />
        <span style={{ color: '#fff' }}>{clock}</span><span style={{ opacity: 0.85 }}>· {where}</span>
      </div>
      {children}
      <div style={{ position: 'absolute', left: 120, bottom: 175, width: 1640, opacity: e, transform: `translateY(${(1 - e) * 24}px)` }}>
        {counter && <p style={{ fontFamily: MONO, fontSize: 132, fontWeight: 600, letterSpacing: '-0.04em', color: '#ff6b5d', lineHeight: 1, marginBottom: 18, textShadow: '0 0 60px rgb(255 80 60 / .45)' }}>{counter(k)}</p>}
        <p style={{ fontSize: 76, fontWeight: 600, letterSpacing: '-0.045em', lineHeight: 1.06, color: '#fff' }}>{line}</p>
        {sub && <p style={{ marginTop: 18, fontSize: 32, color: 'rgb(255 255 255 / .66)', letterSpacing: '-0.01em' }}>{sub}</p>}
      </div>
      {src && <p style={{ position: 'absolute', left: 120, bottom: 70, fontSize: 20, color: 'rgb(255 255 255 / .5)', opacity: e }}>Source: {src}</p>}
      {ch && <Chapter t={t} a={a} {...ch} />}
    </>
  );
}

/* where we are in the night: attack n of 5, and the surface it hits */
function Chapter({ t, a, n, of = 5, what, acc = '#ff8b7e', side = 'r' }) {
  const e = ease(seg(t, a + 0.1, a + 0.5));
  return (
    <div style={{ position: 'absolute', zIndex: 4, ...(side === 'r' ? { right: 120 } : { left: 110 }), top: 88, display: 'flex', alignItems: 'center', gap: 14, opacity: e, padding: '12px 20px', borderRadius: 99, background: 'rgb(8 11 16 / .55)', border: '1px solid rgb(255 255 255 / .14)', backdropFilter: 'blur(10px)' }}>
      <span style={{ fontFamily: MONO, fontSize: 22, color: '#fff' }}>{String(n).padStart(2, '0')}<span style={{ color: 'rgb(255 255 255 / .4)' }}> / {String(of).padStart(2, '0')}</span></span>
      <span style={{ display: 'flex', gap: 5 }}>{Array.from({ length: of }, (_, j) => j + 1).map((i) => <i key={i} style={{ width: 20, height: 4, borderRadius: 4, background: i <= n ? acc : 'rgb(255 255 255 / .18)' }} />)}</span>
      <span style={{ fontSize: 21, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: acc }}>{what}</span>
    </div>
  );
}

/* ---------- the products ---------- */

function Stage({ lt, d, children, from = [6, -6, -90], to = [2, -2, 0], width = 1440 }) {
  const x = inout(seg(lt, 0, d));
  return (
    <div style={{ perspective: 2600, perspectiveOrigin: '50% 40%' }}>
      <div style={{ width, transformStyle: 'preserve-3d', transform: `translateZ(${lerp(from[2], to[2], x)}px) rotateX(${lerp(from[0], to[0], x)}deg) rotateY(${lerp(from[1], to[1], x)}deg)` }}>{children}</div>
    </div>
  );
}
const stepAt = (t, steps) => steps.filter((s) => t >= s).length;

function Pop({ t, at, style, children }) {
  const x = ease(seg(t, at, at + 0.6));
  return <div style={{ position: 'absolute', transform: `translateZ(${110 * x}px) translateY(${(1 - x) * 30}px) scale(${0.9 + 0.1 * x})`, opacity: x, ...style }}>{children}</div>;
}
const Verdict = ({ tone = 'bad', head, body, sub }) => (
  <div className="vz-pop" style={{ padding: '20px 26px', '--glow': tone === 'bad' ? 'rgb(255 107 93 / .55)' : 'rgb(63 217 143 / .5)' }}>
    <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: '.1em', color: tone === 'bad' ? '#ff7d70' : '#3fd98f' }}>{head}</p>
    <p style={{ marginTop: 6, fontSize: 23, fontWeight: 600 }}>{body}</p>
    {sub && <p style={{ fontSize: 18, color: '#9ea0a4' }}>{sub}</p>}
  </div>
);

/* frosted glass: the one surface every caption sits on */
const glass = (acc) => ({ background: 'rgb(9 12 18 / .72)', border: '1px solid rgb(190 210 240 / .16)', backdropFilter: 'blur(22px) saturate(1.2)', boxShadow: `0 40px 90px -30px rgb(0 0 0 / .85), inset 0 1px 0 rgb(255 255 255 / .06)${acc ? `, 0 0 80px -40px ${acc}` : ''}` });

/* a product answering its worst case. The product is the hero: large, centred, true to
   the real app. The world sits behind it, out of focus. The name, the promise and the
   result float on glass beside it, never inside it. */
function Product({ t, a, b, bg, bgOffset = 0, acc, mark, name, short, role, head, steps, Pic, pic, pop, focus, outcome, ch, width = 1440, top = 152 }) {
  const lt = t - a, d = b - a;
  const e = ease(seg(t, a + 0.15, a + 0.75));
  const u = ease(seg(t, a - 0.05, a + 0.35));
  return (
    <>
      <Shot id={bg} t={t} a={a} b={b} kb={[1.12, 1.18]} blur={14} dim={0.38} offset={bgOffset} />
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(70% 70% at 50% 45%, ${acc}26, transparent 72%)` }} />
      <div className="film-light" style={{ position: 'absolute', left: (W - width) / 2, top, opacity: u, transform: `translateY(${(1 - u) * 40}px) scale(${0.97 + 0.03 * u})` }}>
        <Stage lt={lt} d={d} width={width}>
          <Focus t={t} b={b} f={focus} acc={acc}>
            <Pic k={stepAt(t, steps)} {...pic} />
            {pop && <Pop t={t} at={pop.at} style={pop.style}>{pop.el}</Pop>}
            <Guard t={t} a={a} at={outcome?.at ?? b} acc={acc} />
          </Focus>
        </Stage>
      </div>
      <Status t={t} a={a} at={outcome?.at ?? b} acc={acc} n={ch?.n} short={short || name} />
      <div style={{ position: 'absolute', zIndex: 3, left: 90, top: 56, display: 'flex', alignItems: 'center', gap: 16, padding: '12px 22px 12px 12px', borderRadius: 22, opacity: e, ...glass(acc) }}>
        <span style={{ width: 58, height: 58, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgb(255 255 255 / .08)' }}><ProductMark p={mark} size={44} loading="eager" /></span>
        <span><span style={{ display: 'block', fontSize: 27, fontWeight: 600, letterSpacing: '-0.02em' }}>{name}</span><span style={{ display: 'block', marginTop: 2, fontSize: 18, color: '#b9bcc2' }}>{role}</span></span>
      </div>
      <div style={{ position: 'absolute', zIndex: 3, left: 90, bottom: 52, maxWidth: 900, padding: '24px 34px', borderRadius: 28, opacity: e, transform: `translateY(${(1 - e) * 30}px)`, ...glass(acc) }}>
        <h2 style={{ fontSize: 50, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.06 }}>{head}</h2>
      </div>
      {outcome && <Outcome t={t} acc={acc} {...outcome} />}
    </>
  );
}

const Lock = ({ size = 28, color = '#fff', open }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d={open ? 'M8 10.5V7a4 4 0 0 1 7.6-1.7' : 'M8 10.5V7a4 4 0 0 1 8 0v3.5'} /><circle cx="12" cy="15.5" r="1.4" fill={color} />
  </svg>
);
const Shield = ({ size = 26, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" /><path d="M8.5 12l2.4 2.4 4.6-4.8" /></svg>
);
/* the product under protection: a scan sweeps it as it arrives, its edge glows in the
   product colour, and when the threat is contained the edge settles green */
function Guard({ t, a, at, acc }) {
  const sweep = seg(t, a + 0.25, a + 1.45), done = ease(seg(t, at, at + 0.5));
  const c = done > 0.5 ? '#3fd98f' : acc;
  return (
    <>
      <div style={{ position: 'absolute', inset: -10, borderRadius: 30, border: `2px solid ${c}`, opacity: 0.35 + 0.35 * done, boxShadow: `0 0 ${50 + 40 * done}px -6px ${c}`, pointerEvents: 'none' }} />
      {sweep > 0 && sweep < 1 && <div style={{ position: 'absolute', left: -10, right: -10, top: `${sweep * 100}%`, height: 120, marginTop: -120, background: `linear-gradient(180deg, transparent, ${acc}33 70%, ${acc}aa)`, borderBottom: `2px solid ${acc}`, boxShadow: `0 6px 30px ${acc}`, pointerEvents: 'none' }} />}
    </>
  );
}
/* top right: which chapter, and whether the threat is still live or contained */
function Status({ t, a, at, acc, n, short }) {
  const e = ease(seg(t, a + 0.2, a + 0.6)), done = seg(t, at, at + 0.01);
  const c = done ? '#3fd98f' : acc;
  return (
    <div style={{ position: 'absolute', zIndex: 4, right: 90, top: 56, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', borderRadius: 22, opacity: e, ...glass(c), border: `1px solid ${c}77` }}>
      {n && <span style={{ fontFamily: MONO, fontSize: 21, color: 'rgb(255 255 255 / .6)' }}>{String(n).padStart(2, '0')} / 04</span>}
      {done ? <Lock size={26} color={c} /> : <Shield size={26} color={c} />}
      <span style={{ fontSize: 22, fontWeight: 600, color: c }}>{done ? 'Contained' : 'Protected'}</span>
      <span style={{ fontSize: 20, color: 'rgb(255 255 255 / .7)' }}>{done ? 'before damage' : `by ${short}`}</span>
    </div>
  );
}

/* the camera leans into the one row that matters and the rest of the screen dims.
   f = { at, x, y, s, ring: [left, top, width, height] in % of the picture, measured from the DOM } */
function Focus({ t, b, f, acc, children }) {
  const z = f ? inout(seg(t, f.at, f.at + 0.9)) * (1 - inout(seg(t, b - 0.55, b))) : 0;
  return (
    <div style={{ position: 'relative', transformOrigin: f ? `${f.x}% ${f.y}%` : undefined, transform: `scale(${1 + ((f?.s || 1) - 1) * z})` }}>
      {children}
      {f && z > 0 && (
        <div style={{ position: 'absolute', left: `${f.ring[0]}%`, top: `${f.ring[1]}%`, width: `${f.ring[2]}%`, height: `${f.ring[3]}%`, borderRadius: 14, border: `2.5px solid ${acc}`, boxShadow: `0 0 0 4000px rgb(4 6 10 / ${0.4 * z}), 0 0 40px ${acc}`, opacity: z, pointerEvents: 'none' }} />
      )}
    </div>
  );
}

/* the result, as one number, on glass, bottom right */
function Outcome({ t, at, value, label, acc }) {
  const e = ease(seg(t, at, at + 0.6));
  return (
    <div style={{ position: 'absolute', zIndex: 3, right: 90, bottom: 52, width: 500, padding: '22px 30px', borderRadius: 28, opacity: e, transform: `translateY(${(1 - e) * 30}px) scale(${0.96 + 0.04 * e})`, ...glass(acc), border: `1px solid ${acc}66` }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 80, fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1, color: acc, textShadow: `0 0 50px ${acc}55` }}><Lock size={52} color={acc} />{value}</p>
      <p style={{ marginTop: 10, fontSize: 22, lineHeight: 1.3, color: 'rgb(255 255 255 / .82)' }}>{label}</p>
    </div>
  );
}

/* ---------- the timeline ---------- */

const Tr = C.trust, Br = C.brand, Hk = C.hook, Sh = C.shift;
const T = {
  hook2: wordAt(Hk, 5) - 0.1,
  rack: Sh.start - 0.05, cables: wordAt(Sh, 2) + 0.2, terminal: wordAt(Sh, 5) + 0.05, attacker: wordAt(Sh, 9) - 0.15,
  c1: C.c1a.start - 0.3, brand: Br.start - 0.45,
  mumbai: Tr.start - 0.15, skyline: wordAt(Tr, 3) - 0.1, gov: wordAt(Tr, 5) + 0.05, team: wordAt(Tr, 8) - 0.1,
  cta: C.cta.start - 0.3,
};

/* six chapters: a real situation (no names), the person doing it, then one product
   answering it in a small popup beside them. After the enterprise films studied:
   the person is the hero, the product a quiet helper; one card, the outcome in a few
   words, a confirmation, then cut. Choreography from Null Motion's notification
   stack (06) and phone notify (24), with GSAP eases. */
const PEOPLE = [
  { id: 'c1', n: 1, la: 'c1a', lb: 'c1b', clipA: 'login', speedA: 0.72, side: 'l', acc: '#3cc8f6',
    signals: [['Password correct', 'ok'], ['New device · 02:14', 'warn'], ['Unusual for this person', 'crit']],
    product: { bg: 'officepc', mark: 'adapid', name: 'adapID AI', short: 'adapID', role: 'Continuous Identity Risk Management', Pic: AdapRiskTimeline, nSteps: 7,
      head: 'Every session scored. The wrong one held.', outcome: { value: '1.4 s', label: 'from the odd sign-in to a held session' } } },
  { id: 'c2', n: 2, la: 'c2a', lb: 'c2b', clipA: 'code', speedA: 0.8, side: 'l', acc: '#3cc8f6',
    signals: [['AWS key in a public commit', 'crit'], ['214 permissions · 9 ever used', 'warn'], ['Called from a new country', 'crit']],
    product: { bg: 'code', mark: 'adapid', name: 'adapID AI', short: 'adapID', role: 'NHI Security for AWS', Pic: NhiGraph, nSteps: 5,
      head: 'Every cloud key found, right-sized and watched.', outcome: { value: '205', label: 'unused permissions removed from one role' } } },
  { id: 'c3', n: 3, la: 'c3a', lb: 'c3b', clipA: 'worried', speedA: 0.85, side: 'l', acc: '#3cc8f6',
    signals: [['On a video call · 6 min', 'warn'], ['Long pauses while typing', 'warn'], ['New payee · ₹4,80,000', 'crit']],
    product: { bg: 'payphone', mark: 'adapid', name: 'adapID AI', short: 'adapID', role: 'Identity Fraud Prevention', Pic: ScamCatch, nSteps: 6, pic: { time: '9:41' }, width: 1060, top: 130,
      head: 'From the first tap to the payment. The money stays.', outcome: { value: '38 ms', label: 'to hold the payment, with the reason' } } },
  { id: 'c4', n: 4, la: 'c4a', lb: 'c4b', clipA: 'dev', speedA: 0.8, side: 'l', acc: '#93a2ff',
    signals: [['chat-agent · OAuth token', 'warn'], ['Reading 41,200 records', 'warn'], ['Outside its declared task', 'crit']],
    product: { bg: 'dev', mark: 'zenstra', name: 'Zenstra AI', short: 'Zenstra', role: 'Security for AI agents', Pic: ZenGateway, nSteps: 6,
      head: 'Every agent owned. Every action checked first.', outcome: { value: '4 ms', label: 'to block an action outside the task' } } },
];
/* each chapter is two beats: the situation, with a person and the signals; then the
   product itself on screen, the pitch line spoken over its real console, and the result */
const PEOPLE_SCENES = PEOPLE.flatMap((p, i) => {
  const a = i ? C[p.la].start - 0.3 : T.c1;
  const cut = C[p.lb].start - 0.3;
  const b = i < PEOPLE.length - 1 ? C[PEOPLE[i + 1].la].start - 0.3 : T.brand;
  const pr = p.product, lb = C[p.lb];
  const steps = Array.from({ length: pr.nSteps }, (_, k) => cut + 0.7 + (k * (lb.end - cut - 0.9)) / pr.nSteps);
  return [
    [a, cut, (t) => <People t={t} a={a} b={cut} {...p} lb={null} />],
    [cut, b, (t) => (
      <>
        <Product t={t} a={cut} b={b} bg={pr.bg} acc={p.acc} mark={pr.mark} name={pr.name} short={pr.short} role={pr.role} head={pr.head}
          steps={steps} Pic={pr.Pic} pic={pr.pic} ch={{ n: p.n }} width={pr.width || 1320} top={pr.top || 170} outcome={{ at: lb.end - 0.6, ...pr.outcome }} />
      </>
    )],
  ];
});

const SCENES = [
  [0, T.hook2, (t) => (
    <>
      <Shot id="city" t={t} a={0} b={T.hook2} kb={[1.14, 1.04]} />
      <Scrim />
      <div style={{ position: 'absolute', left: 120, bottom: 130, opacity: 1 - seg(t, T.hook2 - 0.15, T.hook2) }}>
        <Spoken line={Hk} t={t} size={92} width={1250} words="Most access in your company" part={[0, 5 / 11]} />
      </div>
    </>
  )],
  [T.hook2, T.rack, (t) => (
    <>
      <Shot id="desk" t={t} a={T.hook2} b={T.rack} kb={[1.04, 1.12]} origin="40% 40%" />
      <Scrim />
      <div style={{ position: 'absolute', left: 120, bottom: 130 }}><Spoken line={Hk} t={t} size={92} width={1300} words="no longer belongs to a person." part={[5 / 11, 1]} /></div>
      <div style={{ position: 'absolute', right: 120, top: 110, textAlign: 'right', opacity: ease(seg(t, T.hook2 + 0.4, T.hook2 + 0.9)) }}>
        <p style={{ fontSize: 120, fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1, color: '#fff' }}>82<span style={{ color: '#7fd3ff' }}>:</span>1</p>
        <p style={{ marginTop: 10, fontSize: 25, color: 'rgb(255 255 255 / .75)' }}>machine identities for every human</p>
        <p style={{ marginTop: 6, fontSize: 17, color: 'rgb(255 255 255 / .45)' }}>CyberArk Identity Security Landscape, 2025</p>
      </div>
    </>
  )],
  [T.rack, T.cables, (t) => (
    <>
      <Shot id="rack" t={t} a={T.rack} b={T.cables} kb={[1.05, 1.13]} />
      <Scrim side="l" o={0.7} />
      <Tag t={t} at={T.rack + 0.15} x={1060} y={250} kind="Service account" name="svc-payments-prod" color="#a9c1de" />
      <div style={{ position: 'absolute', left: 120, bottom: 130 }}><Spoken line={Sh} t={t} size={84} words="Service accounts," part={[0, 2 / 14]} /></div>
    </>
  )],
  [T.cables, T.terminal, (t) => (
    <>
      <Shot id="cables" t={t} a={T.cables} b={T.terminal} kb={[1.1, 1.02]} />
      <Scrim side="l" o={0.7} />
      <Tag t={t} at={T.cables + 0.1} x={1120} y={300} kind="Cloud key" name="AKIA••••••7Q2F" color="#ffd27a" />
      <div style={{ position: 'absolute', left: 120, bottom: 130 }}><Spoken line={Sh} t={t} size={84} words="cloud keys" part={[2 / 14, 4 / 14]} /></div>
    </>
  )],
  [T.terminal, T.attacker, (t) => (
    <>
      <Shot id="terminal" t={t} a={T.terminal} b={T.attacker} kb={[1.04, 1.12]} />
      <Scrim side="l" o={0.75} />
      <Tag t={t} at={T.terminal + 0.1} x={1080} y={260} kind="AI agent" name="invoice-agent" color="#b4bfff" />
      <div style={{ position: 'absolute', left: 120, bottom: 130 }}><Spoken line={Sh} t={t} size={84} words="and AI agents hold it now." part={[4 / 14, 9 / 14]} /></div>
    </>
  )],
  [T.attacker, T.c1, (t) => (
    <>
      <Shot id="attacker" t={t} a={T.attacker} b={T.c1} kb={[1.02, 1.12]} origin="70% 40%" />
      <div style={{ position: 'absolute', inset: 0, background: 'rgb(120 10 0 / .14)', mixBlendMode: 'multiply' }} />
      <Scrim />
      <div style={{ position: 'absolute', left: 120, bottom: 130 }}><Spoken line={Sh} t={t} size={96} color="#ffd1cb" words="And attackers have noticed." part={[9 / 14, 1]} /></div>
    </>
  )],
  ...PEOPLE_SCENES,
  [T.brand, T.mumbai, (t) => <Brand t={t} a={T.brand} b={T.mumbai} />],
  [T.mumbai, T.skyline, (t) => (
    <>
      <Shot id="charminar" t={t} a={T.mumbai} b={T.skyline} kb={[1.02, 1.1]} origin="50% 70%" />
      <Scrim o={0.95} />
      <div style={{ position: 'absolute', left: 120, bottom: 130 }}><Spoken line={Tr} t={t} size={104} words="Built in India." part={[0, 3 / 14]} /></div>
    </>
  )],
  [T.skyline, T.gov, (t) => (
    <>
      <Shot id="payment" t={t} a={T.skyline} b={T.gov} kb={[1.04, 1.12]} />
      <Scrim o={0.85} />
      <div style={{ position: 'absolute', left: 120, bottom: 130 }}><Spoken line={Tr} t={t} size={88} words="Trusted by banks, government" part={[3 / 14, 7 / 14]} /></div>
    </>
  )],
  [T.gov, T.team, (t) => (
    <>
      <Shot id="delhi" t={t} a={T.gov} b={T.team} kb={[1.03, 1.1]} origin="50% 55%" />
      <Scrim o={0.95} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgb(3 5 8 / .55), transparent 40%)' }} />
      <div style={{ position: 'absolute', left: 120, bottom: 130 }}><Spoken line={Tr} t={t} size={88} words="Trusted by banks, government" part={[3 / 14, 7 / 14]} /></div>
    </>
  )],
  [T.team, T.cta, (t) => <Proof t={t} a={T.team} b={T.cta} />],
  [T.cta, LENGTH, (t) => <Cta t={t} a={T.cta} />],
];

/* ---------- scenes with more than a shot and a line ---------- */

/* Null Motion eases, from GSAP itself */
const EZ = { back: gsap.parseEase('back.out(1.4)'), back2: gsap.parseEase('back.out(1.7)'), p4: gsap.parseEase('power4.out'), p3: gsap.parseEase('power3.out') };
const ez = (name, t, a, d) => EZ[name](clamp((t - a) / d));

/* a machine identity named on screen: a glass tag pinned into the shot */
function Tag({ t, at, x, y, kind, name, color }) {
  const e = ez('p4', t, at, 0.5);
  return (
    <div style={{ position: 'absolute', left: x, top: y, opacity: e, transform: `translateY(${(1 - e) * 16}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px 16px 18px', borderRadius: 18, background: 'rgb(10 14 20 / .62)', border: `1px solid ${color}55`, backdropFilter: 'blur(14px)', boxShadow: `0 0 60px -20px ${color}` }}>
        <span style={{ width: 14, height: 14, borderRadius: 14, background: color, boxShadow: `0 0 18px ${color}` }} />
        <span>
          <span style={{ display: 'block', fontSize: 19, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color }}>{kind}</span>
          <span style={{ display: 'block', marginTop: 4, fontFamily: MONO, fontSize: 27, color: '#f2f4f7' }}>{name}</span>
        </span>
      </div>
    </div>
  );
}

const TONE = { ok: '#3fd98f', warn: '#ffc14d', crit: '#ff6b5d' };
/* 06-notification: one small toast, dropping in with a back ease */
function Toast({ t, at, text, tone }) {
  const e = ez('back', t, at, 0.7), o = clamp((t - at) / 0.25);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px 14px 16px', borderRadius: 18, opacity: o, transform: `translateY(${(1 - e) * -60}px) scale(${0.95 + 0.05 * e})`,
      background: 'linear-gradient(180deg, rgb(255 255 255 / .94), rgb(244 247 251 / .92))', boxShadow: '0 24px 50px -18px rgb(0 0 0 / .55), inset 0 1px 0 #fff', backdropFilter: 'blur(16px)' }}>
      <span style={{ width: 12, height: 12, borderRadius: 12, background: TONE[tone], boxShadow: `0 0 0 5px ${TONE[tone]}33`, flexShrink: 0 }} />
      <span style={{ fontSize: 25, fontWeight: 600, color: '#12171f', letterSpacing: '-0.01em' }}>{text}</span>
    </div>
  );
}

/* 24-showreel-notify: the product answers, in one card with its mark large */
function Popup({ t, at, mark, name, outcome, chip, acc }) {
  const e = ez('back2', t, at, 0.8), o = clamp((t - at) / 0.3);
  const done = ez('back2', t, at + 1.3, 0.5);
  return (
    <div style={{ width: 720, padding: '28px 30px', borderRadius: 32, opacity: o, transform: `translateY(${(1 - e) * 50}px) scale(${0.9 + 0.1 * e})`, transformOrigin: '20% 100%',
      background: 'linear-gradient(180deg, #ffffff, #f2f6fb)', boxShadow: `0 50px 100px -30px rgb(0 0 0 / .7), 0 0 0 1px rgb(255 255 255 / .6), 0 0 80px -30px ${acc}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <span style={{ width: 150, height: 150, flexShrink: 0, borderRadius: 38, display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg, #fff, #e6eff9)', boxShadow: `0 16px 30px -12px ${acc}aa, inset 0 -6px 14px rgb(10 58 107 / .1)`, border: '1px solid rgb(10 58 107 / .08)' }}>
          <ProductMark p={mark} size={108} loading="eager" />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 22, fontWeight: 600, letterSpacing: '.02em', color: '#5b6270' }}>{name}</span>
          <span style={{ display: 'block', marginTop: 6, fontSize: 38, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.1, color: '#0e1116' }}>{outcome}</span>
        </span>
      </div>
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12, height: 50, opacity: done, transform: `scale(${0.85 + 0.15 * done})`, transformOrigin: '0 50%' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderRadius: 99, background: '#e8f7ef', color: '#0c7546', fontSize: 24, fontWeight: 700 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>{chip}
        </span>
        <span style={{ fontSize: 20, color: '#626873' }}>with the reason recorded</span>
      </div>
    </div>
  );
}

/* the login page placed on the laptop's green screen: corners tracked from the clip */
const GREEN = [[1, [949, 80], [1588, 238], [1455, 715], [840, 499]], [60, [1044, 90], [1703, 246], [1568, 729], [932, 511]], [120, [1159, 97], [1845, 256], [1707, 743], [1046, 524]], [180, [1280, 102], [1985, 266], [1848, 762], [1162, 533]], [240, [1386, 108], [2125, 278], [1990, 775], [1264, 542]]];
function quad(f) {
  const k = GREEN.findIndex((g) => g[0] >= f); const j = Math.max(1, k < 0 ? GREEN.length - 1 : k);
  const [f0, ...p0] = GREEN[j - 1], [f1, ...p1] = GREEN[j]; const x = clamp((f - f0) / (f1 - f0));
  return p0.map((p, i) => [lerp(p[0], p1[i][0], x), lerp(p[1], p1[i][1], x)]);
}
/* CSS matrix3d mapping a w×h box onto four corners (tl, tr, br, bl) */
function homography(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]) {
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (sx * dy2 - dx2 * sy) / det, hh = (dx1 * sy - sx * dy1) / det;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.join(',')})`;
}
function GreenLogin({ t, a, speed, n }) {
  const f = clamp(Math.floor((t - a) * FPS * speed) + 1, 1, n);
  const bots = Math.round(18204 * ease(seg(t, a + 0.6, a + 4)));
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 760, height: 470, transformOrigin: '0 0', transform: homography(760, 470, quad(f)), background: '#f5f7fa', overflow: 'hidden', boxShadow: '0 0 0 4px #f5f7fa' }}>
      <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 22px', background: '#fff', borderBottom: '1px solid #e3e6eb', fontSize: 20, fontWeight: 700, color: '#1e40af' }}><span style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', fontSize: 12, display: 'grid', placeItems: 'center' }}>YB</span>Your Bank · Sign in</div>
      <div style={{ padding: '36px 60px' }}>
        <div style={{ height: 50, borderRadius: 10, border: '1px solid #d7dbe2', background: '#fff', marginBottom: 14, padding: '12px 16px', fontSize: 19, color: '#5b616c' }}>customer@email.com</div>
        <div style={{ height: 50, borderRadius: 10, border: '1px solid #d7dbe2', background: '#fff', marginBottom: 20, padding: '12px 16px', fontSize: 19, letterSpacing: 4, color: '#5b616c' }}>••••••••</div>
        <div style={{ height: 50, borderRadius: 10, background: '#1e40af', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700 }}>Sign in</div>
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 18, color: '#c4352a' }}><span>login attempts</span><span>{bots.toLocaleString('en-US')}</span></div>
      </div>
    </div>
  );
}

/* one chapter: the situation (a), then the product answering it (b) */
function People({ t, a, b, ...p }) {
  const la = C[p.la], lb = p.lb ? C[p.lb] : null;
  const cut = lb ? lb.start - 0.15 : b + 1;
  const inB = t >= cut;
  const clip = inB ? p.clipB : p.clipA;
  const sa = inB ? cut : a;
  const tSig = lb ? lb.start - 0.1 : la.start + 0.8;
  const tPop = lb ? lb.start + (lb.end - lb.start) * 0.42 : la.start + (la.end - la.start) * 0.5;
  const side = p.side === 'l' ? { left: 110 } : { right: 110 };
  const out = 1 - seg(t, b - 0.25, b);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: out }}>
      <Shot id={clip} t={t} a={sa} b={inB ? b : cut} kb={p.screen ? [1, 1] : [1.03, 1.1]} speed={inB ? 0.85 : p.speedA} offset={inB ? (p.offsetB || 0) : 0} />
      {p.screen && <GreenLogin t={t} a={sa} speed={inB ? 0.85 : p.speedA} n={FRAMES[clip]} />}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgb(3 5 8 / .7) 0%, rgb(3 5 8 / .1) 38%, transparent 60%)' }} />
      {/* the situation, spoken; then the answer */}
      <div style={{ position: 'absolute', left: 120, right: 120, bottom: 96, ...(inB && p.side === 'r' ? {} : {}) }}>
        {!inB && <Spoken line={la} t={t} size={70} width={1500} dim={0.3} />}
        {inB && lb && <Spoken line={lb} t={t} size={52} width={1600} dim={0.3} style={{ maxWidth: 1600 }} />}
      </div>
      {/* the signals, then the product */}
      <div style={{ position: 'absolute', top: 120, ...side, display: 'grid', gap: 14, justifyItems: p.side === 'l' ? 'start' : 'end' }}>
        {p.signals.map(([text, tone], i) => <Toast key={text} t={t} at={tSig + i * 0.45} text={text} tone={tone} />)}
        {p.card && <div style={{ marginTop: 10 }}><Popup t={t} at={tPop} acc={p.acc} {...p.card} /></div>}
      </div>
    </div>
  );
}



/* cold open, in silence: a remote-access login screen, one password typed, no second factor */
function ColdOpen({ t, b }) {
  const e = ease(seg(t, 0.35, 0.9)), out = 1 - seg(t, b - 0.25, b);
  const typed = Math.round(clamp((t - 0.9) / 1.2) * 12);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: out }}>
      <Shot id="typing" t={t} a={0} b={b} kb={[1.16, 1.1]} blur={6} dim={0.55} offset={40} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 620, transform: `translate(-50%, -50%) translateY(${(1 - e) * 20}px)`, opacity: e, padding: '34px 38px', borderRadius: 26, ...glass('#7fd6ff') }}>
        <p style={{ fontFamily: MONO, fontSize: 20, letterSpacing: '.12em', color: 'rgb(255 255 255 / .55)' }}>REMOTE ACCESS · SIGN IN</p>
        <div style={{ marginTop: 22, padding: '14px 18px', borderRadius: 14, background: 'rgb(255 255 255 / .06)', border: '1px solid rgb(255 255 255 / .12)', fontSize: 26, color: '#e6eaf0' }}>j.smith</div>
        <div style={{ marginTop: 12, padding: '14px 18px', borderRadius: 14, background: 'rgb(255 255 255 / .06)', border: '1px solid rgb(127 214 255 / .5)', fontFamily: MONO, fontSize: 26, color: '#e6eaf0', letterSpacing: '.2em' }}>{'•'.repeat(typed)}<span style={{ opacity: Math.floor(t * 3) % 2 ? 1 : 0 }}>|</span></div>
        <p style={{ marginTop: 18, fontSize: 21, color: '#ffb3ab', opacity: ease(seg(t, 2.1, 2.4)) }}>Second factor: not required</p>
      </div>
    </div>
  );
}

/* the portal login, signed in */
function PortalCard({ t, at }) {
  const x = ease(seg(t, at, at + 0.5));
  return (
    <div style={{ position: 'absolute', right: 120, top: 120, width: 560, padding: '26px 30px', borderRadius: 26, opacity: x, transform: `translateY(${(1 - x) * 26}px)`, ...glass('#ff6b5d') }}>
      <p style={{ fontFamily: MONO, fontSize: 19, letterSpacing: '.1em', color: 'rgb(255 255 255 / .55)' }}>REMOTE ACCESS PORTAL</p>
      <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        {[['✓ Password correct', '#4be29a', 'rgb(63 217 143 / .14)'], ['✕ No MFA', '#ff8b7e', 'rgb(255 107 93 / .14)'], ['✓ Signed in', '#4be29a', 'rgb(63 217 143 / .14)']].map(([s2, c, bg], i) => (
          <span key={s2} style={{ padding: '9px 18px', borderRadius: 99, background: bg, color: c, fontSize: 22, fontWeight: 600, opacity: ease(seg(t, at + 0.3 + i * 0.3, at + 0.6 + i * 0.3)) }}>{s2}</span>
        ))}
      </div>
    </div>
  );
}

/* same attacks, a different ending: each incident above with the control that answers it */
function Recap({ t, a, b }) {
  const e = ease(seg(t, a + 0.1, a + 0.6));
  const done = [['adapid', 'Stolen-password login', 'held', '#3cc8f6'], ['adapid', 'Help-desk reset', 'held', '#3cc8f6'], ['adapid', 'Malware-stolen keys', 'revoked', '#3cc8f6'], ['zenstra', 'Agent tokens', 'scoped', '#93a2ff'], ['adapid', 'Coached payment', 'held', '#3cc8f6']];
  return (
    <>
      <Shot id="morning" t={t} a={a} b={b} kb={[1.04, 1.12]} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgb(3 5 8 / .88) 0%, rgb(3 5 8 / .35) 50%, rgb(3 5 8 / .35) 80%, rgb(3 5 8 / .7) 100%)' }} />
      <div style={{ position: 'absolute', left: 120, bottom: 300 }}><Spoken line={Rc} t={t} size={108} width={1600} /></div>
      <div style={{ position: 'absolute', left: 120, right: 120, bottom: 130, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, opacity: e }}>
        {done.map(([k, s2, v, c], i) => {
          const x = ease(seg(t, a + 0.3 + i * 0.12, a + 0.8 + i * 0.12));
          return (
            <div key={s2} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderRadius: 20, background: 'rgb(8 12 18 / .62)', border: `1px solid ${c}66`, backdropFilter: 'blur(12px)', opacity: x, transform: `translateY(${(1 - x) * 20}px)` }}>
              <ProductMark p={k} size={42} loading="eager" />
              <span style={{ lineHeight: 1.15 }}><span style={{ display: 'block', fontSize: 20, fontWeight: 600, color: '#fff' }}>{s2}</span><span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 18, fontWeight: 600, color: '#3fd98f' }}><Lock size={18} color="#3fd98f" />{v}</span></span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const Mark = ({ size = 64, style }) => (
  <span style={{ display: 'inline-flex', width: size, height: size, borderRadius: size * 0.26, background: '#fff', padding: size * 0.16, boxShadow: '0 20px 50px -15px rgba(0,0,0,.6)', ...style }}><img src="/brand/mark.webp" alt="" style={{ width: '100%', height: '100%' }} /></span>
);

const LINE = [['adapid', 'Identity Risk', 'Every session, scored'], ['adapid', 'NHI Security', 'Every cloud key'], ['adapid', 'Fraud Prevention', 'Login to payment'], ['zenstra', 'Zenstra AI', 'Every AI agent']];

/* the brand: a blue plate opens over the city, says the line, shows the four products and closes back to the mark */
function Brand({ t, a, b }) {
  const L = Br;
  const app = ease(seg(t, a, a + 0.45)), open = inout(seg(t, L.start - 0.15, L.start + 0.6)), close = inout(seg(t, b - 0.5, b - 0.05));
  const w = lerp(lerp(120, 1560, open), 120, close), h = lerp(lerp(120, 720, open), 120, close);
  return (
    <>
      <Shot id="nightroad" t={t} a={a} b={b} kb={[1.15, 1.2]} blur={10} dim={0.35} offset={120} />
      <div style={{ position: 'absolute', left: W / 2 - w / 2, top: H / 2 - h / 2 + (1 - app) * 160, width: w, height: h, borderRadius: 36, overflow: 'hidden', opacity: app * (1 - seg(t, b - 0.12, b)), background: 'linear-gradient(135deg, #0068ac 0%, #0a7fcf 55%, #169fe6 100%)', boxShadow: `0 0 ${80 + 120 * open}px rgb(0 140 220 / .35)` }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 55% at 50% 0%, rgb(120 200 255 / .35), transparent 70%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: lerp(h / 2, 92, open * (1 - close)), transform: 'translate(-50%, -50%)' }}><Mark size={lerp(70, 84, open)} /></div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 170, opacity: open * (1 - seg(t, b - 0.75, b - 0.45)) }}>
          <p style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', color: 'rgb(255 255 255 / .88)' }}>Deep Algorithms</p>
          <div style={{ marginTop: 14 }}><Spoken line={L} t={t} size={80} width={1360} align="center" words="Every identity, verified before it acts." dim={0.28} part={[2 / 8, 1]} /></div>
          <div style={{ position: 'absolute', left: 40, right: 40, bottom: 40, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {LINE.map(([k, n, r], i) => {
              const x = ease(seg(t, wordAt(L, 2) + i * 0.12, wordAt(L, 2) + 0.5 + i * 0.12));
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderRadius: 20, background: 'rgb(4 22 48 / .42)', border: '1px solid rgb(255 255 255 / .2)', opacity: x, transform: `translateY(${(1 - x) * 24}px)` }}>
                  <span style={{ width: 84, height: 84, flexShrink: 0, borderRadius: 22, display: 'grid', placeItems: 'center', background: '#fff', boxShadow: '0 14px 30px -12px rgb(0 0 0 / .45)' }}><ProductMark p={k} size={62} loading="eager" /></span>
                  <span style={{ textAlign: 'left' }}><span style={{ display: 'block', fontSize: 25, fontWeight: 600, letterSpacing: '-0.02em', color: '#fff' }}>{n}</span><span style={{ display: 'block', marginTop: 3, fontSize: 18, color: 'rgb(255 255 255 / .75)' }}>{r}</span></span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

/* proof: the team at work, then the logos of the institutions that run on it */
function Proof({ t, a, b }) {
  const logos = ease(seg(t, a + 0.5, a + 1.1));
  return (
    <>
      <Shot id="office" t={t} a={a} b={b} kb={[1.03, 1.12]} dim={0.15 + 0.35 * logos} />
      <Scrim side="t" o={0.7} />
      <div style={{ position: 'absolute', left: 120, top: 110 }}><Spoken line={Tr} t={t} size={76} width={1700} words="and enterprises that cannot afford a breach." part={[7 / 14, 1]} /></div>
      <div style={{ position: 'absolute', left: 120, right: 120, bottom: 170, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 20, perspective: 1600 }}>
        {CUSTOMERS.filter(([k]) => !/^ii?t-|^iiit-/.test(k)).slice(0, 12).map(([k, n], i) => {
          const x = ease(seg(t, a + 0.5 + i * 0.07, a + 1.0 + i * 0.07));
          return (
            <div key={k} style={{ height: 118, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgb(10 14 20 / .55)', border: '1px solid rgb(160 190 230 / .16)', backdropFilter: 'blur(10px)', opacity: x, transform: `rotateX(${(1 - x) * -50}deg) translateY(${(1 - x) * 30}px)` }}>
              <img src={`/img/logos/${k}-white.webp`} alt={n} style={{ maxHeight: 52, maxWidth: 180, objectFit: 'contain', opacity: 0.9 }} />
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 90, display: 'flex', justifyContent: 'center', gap: 14, opacity: ease(seg(t, a + 1.6, a + 2.1)) }}>
        {CERTS.map((c) => <span key={c.code} style={{ padding: '10px 20px', borderRadius: 99, border: '1px solid rgb(160 190 230 / .28)', background: 'rgb(10 14 20 / .5)', fontSize: 21, color: '#d5d7db' }}>{c.name}</span>)}
      </div>
    </>
  );
}

/* the close, in two moves: the ask over the city, then the lockup with the four
   products and where to go. Something new arrives every couple of seconds. */
function Cta({ t, a }) {
  const L = C.cta;
  const x = ease(seg(t, a, a + 0.7));
  const L2 = C.cta2;
  const lock = ease(seg(t, L2.start - 0.35, L2.start + 0.45)); // "The future is decided today.", after a beat
  const out = 1 - seg(t, LENGTH - 0.9, LENGTH - 0.05);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: out }}>
      <Shot id="nightroad" t={t} a={a} b={LENGTH} kb={[1.0, 1.12]} dim={0.3 + 0.25 * lock} blur={lock * 8} offset={60} />
      <Scrim o={0.7 * (1 - lock)} />
      <div style={{ position: 'absolute', left: 120, bottom: 130, opacity: x * (1 - lock), transform: `translateY(${(1 - x) * 26 - lock * 40}px)` }}>
        <Spoken line={L} t={t} size={108} width={1500} dim={0.2} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 150, textAlign: 'center', opacity: lock, transform: `translateY(${(1 - lock) * 30}px)` }}>
        <img src="/brand/logo-lockup-inverse.webp" alt="Deep Algorithms" style={{ height: 110, margin: '0 auto' }} />
        <p style={{ marginTop: 50, fontSize: 80, fontWeight: 600, letterSpacing: '-0.045em', color: '#fff' }}>The future is decided today.</p>
        <div style={{ marginTop: 50, display: 'flex', justifyContent: 'center', gap: 18 }}>
          {LINE.map(([k, n], i) => {
            const y = ease(seg(t, wordAt(L2, 2) + i * 0.12, wordAt(L2, 2) + 0.5 + i * 0.12));
            return <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 20px 12px 14px', borderRadius: 18, background: 'rgb(10 14 20 / .55)', border: '1px solid rgb(180 200 230 / .2)', opacity: y, transform: `translateY(${(1 - y) * 16}px)` }}><ProductMark p={k} size={48} loading="eager" /><span style={{ fontSize: 28, fontWeight: 600 }}>{n}</span></span>;
          })}
        </div>
        <div style={{ marginTop: 56, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24, opacity: ease(seg(t, wordAt(L2, 5) - 0.4, wordAt(L2, 5) + 0.2)) }}>
          <span style={{ height: 96, padding: '0 52px', display: 'inline-flex', alignItems: 'center', borderRadius: 99, background: '#0a6dbb', color: '#fff', fontSize: 36, fontWeight: 600, boxShadow: '0 20px 60px -15px rgb(10 109 187 / .8)' }}>Book a demo</span>
          <span style={{ fontSize: 44, color: '#fff', fontWeight: 500, letterSpacing: '-0.01em' }}>deepalgorithms.io</span>
        </div>
      </div>
    </div>
  );
}

export default function Film({ t }) {
  const first = 1 - seg(t, 0, 0.6); // fade up from black
  return (
    <div className="film" style={{ position: 'relative', width: W, height: H, overflow: 'hidden', background: '#05070a', color: '#f2f3f5', fontFamily: 'Inter Variable, sans-serif' }}>
      {SCENES.map(([a, b, render], i) => (t >= a && t < b ? <div key={i} style={{ position: 'absolute', inset: 0 }}>{render(t)}</div> : null))}
      <Finish t={t} />
      {first > 0 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: first }} />}
    </div>
  );
}
