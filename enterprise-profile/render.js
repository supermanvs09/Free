// node render.js <profile.html> <outdir>  — screenshot (2x, A4 @ 300dpi) and PDF
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [file, out] = process.argv.slice(2);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });
  await pg.goto('file://' + file, { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.locator('.page').screenshot({ path: path.join(out, 'deep-algorithms-enterprise-profile.png') });
  await pg.pdf({ path: path.join(out, 'deep-algorithms-enterprise-profile.pdf'), width: '1240px', height: '1754px',
    printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  const overflow = await pg.evaluate(() => { const p = document.querySelector('.page'); return [...p.children].reduce((s, c) => s + c.offsetHeight, 0) - p.clientHeight; });
  console.log('content vs page height overflow (px, <=0 is good):', overflow);
  await b.close();
})();
