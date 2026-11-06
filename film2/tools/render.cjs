// Frame renderer: node render.cjs <url> <outdir> [from] [to] [workers]
// Captures every frame at 1920x1080, 30 fps, as JPEG. Frames are pure functions of time, so workers split the range.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out, from = '0', to = '', W = '4'] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--disable-gpu-vsync', '--force-color-profile=srgb'] });
  const p0 = await b.newPage(); await p0.goto(url); const dur = await p0.evaluate(() => window.FILM.duration); const fps = 30;
  const events = await p0.evaluate(() => window.FILM.events()); fs.writeFileSync(out + '/../events.json', JSON.stringify(events)); await p0.close();
  const f0 = +from * fps, f1 = to ? +to * fps : Math.round(dur * fps);
  const todo = []; for (let f = f0; f < f1; f++) if (!fs.existsSync(`${out}/f${String(f).padStart(5, '0')}.jpg`)) todo.push(f);
  let done = 0; const t0 = Date.now();
  await Promise.all(Array.from({ length: +W }, async (_, w) => {
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage(); p.on('pageerror', (e) => console.log('ERR', e.message));
    await p.goto(url); await p.evaluate(() => window.FILM.ready);
    for (let i = w; i < todo.length; i += +W) {
      const f = todo[i];
      await p.evaluate((t) => window.FILM.render(t), f / fps);
      await p.screenshot({ path: `${out}/f${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
      if (++done % 150 === 0) console.log(done, '/', todo.length, ((Date.now() - t0) / done).toFixed(0), 'ms/frame');
    }
    await ctx.close();
  }));
  await b.close(); console.log('done', done);
})();
