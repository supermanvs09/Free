const { chromium } = require('/opt/node22/lib/node_modules/playwright');const http=require('http'),fs=require('fs'),path=require('path');
const srv=http.createServer((q,res)=>{const f=path.join(__dirname,decodeURIComponent(q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return}res.writeHead(200,{'content-type':/\.m?js$/.test(f)?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.woff2')?'font/woff2':'application/octet-stream'});res.end(d)})}).listen(4322);
(async()=>{const b=await chromium.launch({args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
fs.mkdirSync(__dirname+'/covers',{recursive:true});
for(const slug of process.argv.slice(2)){const t0=Date.now();
 const p=await b.newPage({viewport:{width:1600,height:1000}});p.on('pageerror',e=>console.log('PE',e.message.slice(0,300)));p.on('console',m=>{if(m.type()==='error')console.log('CE',m.text().slice(0,200))});
 await p.goto(`http://127.0.0.1:4322/cover.html?slug=${slug}`);
 await p.waitForFunction('window.__done',null,{timeout:120000}).catch(()=>console.log('TIMEOUT',slug));
 await p.locator('#c').screenshot({path:`${__dirname}/covers/${slug}.png`});console.log(slug,((Date.now()-t0)/1000).toFixed(1)+'s');await p.close();}
await b.close();srv.close();})();
