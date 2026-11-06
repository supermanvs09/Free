// Quick stills for review: node snap.mjs <outdir> t1 t2 ... (server on :8765)
(async () => {
const { chromium } = require('playwright');
const [out, ...ts] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', (e) => console.log('ERR', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await p.goto('http://127.0.0.1:8767/index.html'); await p.evaluate(() => window.FILM.ready);
for (const t of ts) { await p.evaluate((t) => window.FILM.render(t), +t); await p.screenshot({ path: `${out}/s_${String(t).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 85 }); }
await b.close();

})();
