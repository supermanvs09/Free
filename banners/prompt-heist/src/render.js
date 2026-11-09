const { chromium } = require('playwright'); const path=require('path');
(async () => { const b=await chromium.launch(); const p=await b.newPage({ viewport:{width:1920,height:2500}, deviceScaleFactor: +(process.argv[2]||1) });
await p.goto('file://'+path.resolve(__dirname,process.argv[3]||'banner.html')); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(500);
const sfx = process.argv[2]==='2' ? '@2x' : '';
await p.locator('#landscape').screenshot({path:path.resolve(__dirname,'..',`prompt-heist${process.argv[4]||''}-landscape-1920x1080${sfx}.png`)});
await p.locator('#portrait').screenshot({path:path.resolve(__dirname,'..',`prompt-heist${process.argv[4]||''}-portrait-1080x1350${sfx}.png`)});
// overflow check
const issues = await p.evaluate(()=>{ const out=[]; for (const c of document.querySelectorAll('.canvas')) { const r=c.getBoundingClientRect(); c.querySelectorAll('h1,p,.pill,.cta,.kicker,.stamp,.art').forEach(e=>{const q=e.getBoundingClientRect(); if(q.left<r.left+40||q.right>r.right-40||q.top<r.top+20||q.bottom>r.bottom-20) out.push(c.id+':'+e.className.baseVal||e.className);}); } return out; });
console.log('edge issues:', issues);
await b.close(); })();
