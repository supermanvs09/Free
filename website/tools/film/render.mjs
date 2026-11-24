// Renders the product film frame by frame from the dev server's film.html.
// node tools/film/render.mjs <base-url> <frames-dir> <clips-dir> [from] [to]
// <clips-dir> holds the graded footage frames written by footage.py; they are
// served to the page as /clips/<id>/NNNN.jpg. Requires `npm run dev` and Playwright's Chromium.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const [, , base = 'http://localhost:5173', out = 'frames', clips = 'build/film/clips', from, to] = process.argv;
mkdirSync(out, { recursive: true });
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.route('**/clips/**', (r) => {
  const rel = new URL(r.request().url()).pathname.replace(/^\/clips\//, '');
  try { r.fulfill({ body: readFileSync(join(clips, rel)), contentType: 'image/jpeg', headers: { 'cache-control': 'max-age=3600' } }); }
  catch { r.fulfill({ status: 404, body: '' }); }
});
const open = async () => { await p.goto(`${base}/film.html`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1000); };
await open();
const { L, F } = await p.evaluate(() => ({ L: window.__LENGTH, F: window.__FPS }));
const n = Math.round(L * F), i0 = from ? +from : 0, i1 = to ? Math.min(+to, n) : n;
const t0 = Date.now();
for (let i = i0; i < i1; i++) {
  // the dev server reloads the page if a source file changes mid-render: reopen and redo the frame
  try { await p.evaluate((t) => window.__film(t), i / F); } catch { await open(); await p.evaluate((t) => window.__film(t), i / F); }
  await p.screenshot({ path: `${out}/f${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
  if (i % 150 === 0) console.log(`frame ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
if (errs.length) console.log('ERRORS', errs.slice(0, 5));
await b.close();
