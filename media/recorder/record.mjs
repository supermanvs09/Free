#!/usr/bin/env node
/*
 * Screen recorder for any web app: plays the steps in a JSON config in a real
 * browser (Playwright / Chromium), records each recording as a video and turns
 * it into a shareable MP4 (H.264, no audio) with ffmpeg.
 *
 *   npm i -D playwright && npx playwright install chromium     (once)
 *   ffmpeg must be on PATH                                     (apt/brew/choco install ffmpeg)
 *   node record.mjs recordings.json                            (all recordings)
 *   node record.mjs recordings.json leak                       (only the one named "leak")
 *
 * Config (see recordings.example.json):
 *   baseUrl      the app, e.g. http://localhost:3000
 *   outDir       where the MP4s go (default ./out)
 *   viewport     { width, height } of the video (default 1600x900)
 *   fps          frame rate of the MP4 (default 30)
 *   login        steps run once, NOT recorded (sign in); the session is reused
 *   recordings   [{ name, file, steps }]: one MP4 per entry
 *   combined     optional file name: all recordings joined into one MP4
 *
 * Steps (each an object with one action):
 *   { "goto": "/path" }                     open a page (relative to baseUrl)
 *   { "click": "css or text=… selector" }   click an element
 *   { "fill": ["#selector", "value"] }      type into a field; "$ENV_NAME" reads an env var
 *   { "press": "Control+Shift+L" }          press keys
 *   { "hover": "selector" }                 move the mouse over an element
 *   { "scroll": 600 }                       scroll the page down by pixels
 *   { "waitFor": "selector" }               wait until an element is visible
 *   { "waitForUrl": "/part/of/url" }        wait until the URL contains this
 *   { "wait": 3000 }                        wait (ms): let an animation or replay play
 *   { "mark": true }                        the MP4 starts here: everything before is cut
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [configPath, only] = process.argv.slice(2);
if (!configPath) {
  console.error('Usage: node record.mjs <config.json> [recording-name]');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const base = cfg.baseUrl.replace(/\/$/, '');
const out = path.resolve(path.dirname(configPath), cfg.outDir ?? 'out');
const viewport = cfg.viewport ?? { width: 1600, height: 900 };
const fps = cfg.fps ?? 30;
const tmp = path.join(out, '.raw');
fs.mkdirSync(tmp, { recursive: true });

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
} catch {
  console.error('ffmpeg was not found on PATH. Install it first.');
  process.exit(1);
}

const value = (v) => (typeof v === 'string' && v.startsWith('$') ? process.env[v.slice(1)] ?? '' : v);
const url = (u) => (/^https?:/.test(u) ? u : base + u);

async function run(page, steps, t0, marks) {
  for (const s of steps) {
    if (s.goto) await page.goto(url(s.goto), { waitUntil: 'domcontentloaded' });
    else if (s.click) await page.click(s.click);
    else if (s.fill) await page.fill(s.fill[0], String(value(s.fill[1])));
    else if (s.press) await page.keyboard.press(s.press);
    else if (s.hover) await page.hover(s.hover);
    else if (s.scroll) await page.mouse.wheel(0, s.scroll);
    else if (s.waitFor) await page.waitForSelector(s.waitFor, { state: 'visible', timeout: s.timeout ?? 15000 });
    else if (s.waitForUrl) await page.waitForURL((u) => u.href.includes(s.waitForUrl), { timeout: s.timeout ?? 15000 });
    else if (s.wait) await page.waitForTimeout(s.wait);
    else if (s.mark && marks) marks.start = (Date.now() - t0) / 1000;
    else throw new Error(`Unknown step: ${JSON.stringify(s)}`);
  }
}

const browser = await chromium.launch();
try {
  /* Sign in once, outside the videos; every recording starts signed in. */
  let storageState;
  if (cfg.login?.length) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await run(page, cfg.login, Date.now());
    await page.waitForTimeout(1000);
    storageState = await ctx.storageState();
    await ctx.close();
    console.log('signed in');
  }

  const made = [];
  for (const rec of cfg.recordings.filter((r) => !only || r.name === only)) {
    const ctx = await browser.newContext({ viewport, storageState, recordVideo: { dir: tmp, size: viewport } });
    const page = await ctx.newPage();
    const t0 = Date.now();
    const marks = { start: 0 };
    await run(page, rec.steps, t0, marks);
    const video = page.video();
    await ctx.close(); /* the video file is complete only once the context closes */
    const raw = await video.path();
    const file = path.join(out, rec.file ?? `${rec.name}.mp4`);
    /* Trim to the mark (minus a short lead-in) and encode a widely playable MP4. */
    const from = Math.max(0, marks.start - (rec.leadIn ?? 1.5));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', from.toFixed(2), '-i', raw, '-r', String(fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', file]);
    fs.rmSync(raw, { force: true });
    made.push(file);
    console.log('recorded', path.relative(process.cwd(), file));
  }

  if (cfg.combined && made.length > 1) {
    const list = path.join(tmp, 'list.txt');
    fs.writeFileSync(list, made.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const file = path.join(out, cfg.combined);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', file]);
    console.log('combined', path.relative(process.cwd(), file));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
} finally {
  await browser.close();
}
