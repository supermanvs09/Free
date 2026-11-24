// Title card and the backdrop for the phone + tablet segment, drawn as HTML.
// node tools/walkthrough/cards.mjs <base-url> <out-dir>
import { chromium } from 'playwright';
const [, , base = 'http://localhost:4173', out = 'walkthrough-frames'] = process.argv;
const css = `*{margin:0;box-sizing:border-box}body{width:1920px;height:1080px;overflow:hidden;font-family:'Inter Variable',Inter,system-ui,sans-serif;color:#eef3fb;
  background:radial-gradient(70% 60% at 70% 30%,rgba(0,104,172,.35),transparent 70%),radial-gradient(50% 50% at 15% 90%,rgba(0,174,239,.16),transparent 70%),#04060b}
  .k{font-size:20px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#62d2ff}`;
const pages = {
  intro: `<div style="position:absolute;left:160px;top:50%;transform:translateY(-50%)">
    <img src="${base}/brand/logo-lockup-inverse.webp" style="height:56px">
    <p class="k" style="margin-top:90px">Website walkthrough</p>
    <h1 style="margin-top:22px;font-size:92px;line-height:1.02;letter-spacing:-.045em;font-weight:600;max-width:15ch">Every page, every interaction, one light theme.</h1>
    <p style="margin-top:34px;font-size:26px;color:#b4c0d0">Desktop at 1920 × 1080, then phone and tablet · November 2026</p></div>`,
  devices: `<p class="k" style="position:absolute;left:0;right:0;top:44px;text-align:center">Responsive · same pages, same build</p>
    <p style="position:absolute;left:300px;bottom:30px;width:444px;text-align:center;font-size:22px;font-weight:600">Phone <span style="color:#8a97aa;font-weight:500">· 390 px</span></p>
    <p style="position:absolute;left:880px;bottom:30px;width:740px;text-align:center;font-size:22px;font-weight:600">Tablet <span style="color:#8a97aa;font-weight:500">· 820 px</span></p>`,
};
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(base + '/sitemap', { waitUntil: 'networkidle' }); // for the site's fonts
for (const [k, html] of Object.entries(pages)) {
  await p.setContent(`<!doctype html><html><head><style>${css}</style>${await p.evaluate(() => [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.outerHTML).join(''))}</head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${out}/${k}.png` });
}
await b.close();
