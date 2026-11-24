// Records the site walkthrough, frame by frame, on a virtual clock (clock.js).
// node tools/walkthrough/record.mjs <base-url> <out-dir> <segment> [width height]
// Serve a production build first: npm run build && npm run serve.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SEGMENTS } from './script.mjs';

const [, , base = 'http://localhost:4173', outRoot = 'walkthrough-frames', name, W = '1920', H = '1080', dpr = '1'] = process.argv;
const FPS = 30, DT = 1000 / FPS;
const out = `${outRoot}/${name}`; mkdirSync(out, { recursive: true });
const clock = readFileSync(new URL('./clock.js', import.meta.url), 'utf8');

const OVERLAY = `(() => {
  if (document.getElementById('__cur')) return;
  const s = document.createElement('style');
  s.textContent = '#__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:26px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45));will-change:transform}'
   + '#__rip{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid rgba(0,174,239,.9);background:rgba(0,174,239,.18);opacity:0}'
   + '#__lab{position:fixed;left:32px;bottom:30px;z-index:2147483645;pointer-events:none;display:flex;align-items:center;gap:12px;padding:10px 18px 10px 14px;border-radius:999px;background:rgba(6,10,18,.82);border:1px solid rgba(255,255,255,.16);color:#fff;font:600 17px/1.2 "Inter Variable",system-ui,sans-serif;letter-spacing:-.01em;opacity:0;box-shadow:0 12px 30px -12px rgba(0,0,0,.6)}'
   + '#__lab i{width:8px;height:8px;border-radius:50%;background:#27b8f2;box-shadow:0 0 10px #27b8f2}#__lab small{font-weight:500;color:rgba(255,255,255,.62);font-size:14px}';
  document.documentElement.appendChild(s);
  const c = document.createElement('div'); c.id = '__cur';
  c.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26"><path d="M5 3.5v17.2l4.6-4.3 2.9 6.6 3-1.3-2.9-6.5h6.3z" fill="#fff" stroke="#0a1526" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const r = document.createElement('div'); r.id = '__rip';
  const l = document.createElement('div'); l.id = '__lab'; l.innerHTML = '<i></i><span></span><small></small>';
  document.documentElement.append(c, r, l);
})()`;

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dpr, isMobile: +W < 900, hasTouch: +W < 900, reducedMotion: 'no-preference' });
await ctx.addInitScript(clock);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let frame = 0, y = 0, cur = { x: +W * 0.62, y: +H * 0.55 }, rip = -1, lab = { text: '', sub: '', at: -1, until: -1 };
const chapters = [];

async function shoot() {
  const f = frame;
  const ripT = rip < 0 ? -1 : (f - rip) / (FPS * 0.45);
  const labA = lab.at < 0 ? 0 : Math.max(0, Math.min(1, (f - lab.at) / (FPS * 0.35), (lab.until - f) / (FPS * 0.5)));
  await p.evaluate(async ([dt, sy, cx, cy, rt, la, lt, ls]) => {
    await window.__frame(dt, sy);
    const c = document.getElementById('__cur'); if (c) c.style.transform = `translate(${cx - 5}px, ${cy - 3}px)`;
    const r = document.getElementById('__rip');
    if (r) { if (rt >= 0 && rt <= 1) { r.style.opacity = String(0.9 * (1 - rt)); r.style.transform = `translate(${cx}px, ${cy}px) scale(${0.3 + rt * 0.9})`; } else r.style.opacity = '0'; }
    const l = document.getElementById('__lab');
    if (l) { l.style.opacity = String(la); l.style.transform = `translateY(${(1 - la) * 8}px)`; l.querySelector('span').textContent = lt; l.querySelector('small').textContent = ls; }
  }, [DT, y, cur.x, cur.y, ripT, labA, lab.text, lab.sub]);
  if (!process.env.DRY) await p.screenshot({ path: `${out}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  frame++;
}
const frames = (sec) => Math.max(1, Math.round(sec * FPS));
const docY = (sel, off = 110) => p.evaluate(([s, o]) => { const el = typeof s === 'string' ? document.querySelector(s) : null; if (!el) return null; return Math.max(0, Math.min(el.getBoundingClientRect().top + scrollY - o, document.documentElement.scrollHeight - innerHeight)); }, [sel, off]);
const maxY = () => p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
async function ready() {
  await p.waitForLoadState('networkidle');
  await p.evaluate(OVERLAY);
  await p.evaluate(() => document.fonts.ready);
  // CSS animations began on the real clock while the page loaded; start them again so the
  // recording shows the page exactly as a visitor first sees it (e.g. the headline typing)
  await p.evaluate(() => document.getAnimations().forEach((a) => { if (!a.timeline || a.timeline === document.timeline) { a.cancel(); a.play(); } }));
  y = await p.evaluate(() => scrollY);
}

/* wait for a condition while the virtual clock ticks (React's timers need it), recording nothing */
async function settle(fn, arg) {
  for (let i = 0; i < 600; i++) {
    if (await p.evaluate(fn, arg)) { await p.waitForLoadState('networkidle'); await p.evaluate(() => document.fonts.ready); return; }
    await p.evaluate(() => window.__idle(16)); await p.waitForTimeout(15);
  }
  throw new Error('settle: timed out');
}

const R = {
  W: +W, H: +H,
  async open(path) { await p.goto(base + path, { waitUntil: 'networkidle' }); await ready(); await p.mouse.move(cur.x, cur.y); },
  async wait(sec) { for (let i = frames(sec); i > 0; i--) await shoot(); },
  async scrollTo(target, sec, off) {
    const y0 = y; let y1 = typeof target === 'number' ? target : target === 'bottom' ? await maxY() : await docY(target, off);
    if (y1 == null) throw new Error('no target ' + target);
    y1 = Math.min(y1, await maxY());
    const n = frames(sec); for (let i = 1; i <= n; i++) { y = y0 + (y1 - y0) * ease(i / n); await shoot(); }
    y = y1;
  },
  async scrollBy(dy, sec) { await R.scrollTo(Math.max(0, y + dy), sec); },
  async move(target, sec = 0.8) {
    let to = target;
    if (typeof target === 'string') {
      to = await p.evaluate((s) => {
        let el;
        if (s.startsWith('text:')) { const [, scope, txt] = s.match(/^text:(?:(.+?)>>)?(.+)$/); const root = scope ? document.querySelector(scope) : document; el = [...root.querySelectorAll('a, button, [role=tab], summary, label, span, p, h3')].find((e) => e.textContent.trim() === txt && e.getClientRects().length); }
        else el = document.querySelector(s);
        if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2 };
      }, target);
      if (!to) throw new Error('no element ' + target);
    }
    const a = { ...cur }, n = frames(sec);
    for (let i = 1; i <= n; i++) { const k = ease(i / n); cur = { x: a.x + (to.x - a.x) * k, y: a.y + (to.y - a.y) * k }; await p.mouse.move(cur.x, cur.y); await shoot(); }
  },
  async click(hold = 0.5) { rip = frame; await p.mouse.down(); await p.mouse.up(); await R.wait(hold); },
  async clickOn(target, sec = 0.8, hold = 0.6) { await R.move(target, sec); await R.click(hold); },
  /* client-side navigation (what a click on an in-app link does) */
  async nav(path, hold = 0) {
    await p.evaluate((u) => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, path);
    await settle((u) => location.pathname === u.split('?')[0] && !!document.querySelector('.page-in'), path);
    y = await p.evaluate(() => scrollY);
    if (hold) await R.wait(hold);
  },
  async afterClickNav(hold = 0) { await settle(() => !!document.querySelector('.page-in')); y = await p.evaluate(() => scrollY); if (hold) await R.wait(hold); },
  async type(text, cps = 12) { for (const ch of text) { await p.keyboard.type(ch); await R.wait(1 / cps); } },
  async key(k, hold = 0.4) { await p.keyboard.press(k); await R.wait(hold); },
  label(text, sub = '', sec = 3.2) { lab = { text, sub, at: frame, until: frame + frames(sec) }; chapters.push({ t: frame / FPS, text, sub }); },
  syncY: async () => { y = await p.evaluate(() => scrollY); },
  page: p,
};

const t0 = Date.now();
await SEGMENTS[name](R);
writeFileSync(`${out}/chapters.json`, JSON.stringify({ frames: frame, fps: FPS, chapters }, null, 1));
console.log(`${name}: ${frame} frames (${(frame / FPS).toFixed(1)} s) in ${((Date.now() - t0) / 1000).toFixed(0)} s`, errs.length ? errs.slice(0, 4) : '');
await b.close();
