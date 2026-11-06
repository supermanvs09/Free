const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://127.0.0.1:8766/index.html');
  fs.writeFileSync(process.argv[2], JSON.stringify(await p.evaluate(() => window.FILM.events()))); await b.close(); })();
