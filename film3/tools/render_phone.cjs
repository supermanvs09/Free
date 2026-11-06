// Render the banking app frames for one phone shot: node render_phone.cjs <url> <shot> <dur> <height> <outdir>
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const [url, shot, dur, h, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: +h } });
  await p.goto(`${url}?h=${h}`); await p.evaluate(() => document.fonts.ready);
  for (let i = 0; i < Math.round(+dur * 30); i++) { await p.evaluate(([s, t]) => window.render(s, t), [shot, i / 30]); await p.screenshot({ path: `${out}/u${String(i + 1).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 95 }); }
  await b.close(); })();
