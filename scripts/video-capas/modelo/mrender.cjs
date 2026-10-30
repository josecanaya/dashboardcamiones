// node mrender.cjs preview t1,t2  |  node mrender.cjs frames
const p=require('puppeteer-core'),fs=require('fs'),path=require('path');(async()=>{
const [mode,arg]=process.argv.slice(2);
const b=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const pg=await b.newPage();await pg.setViewport({width:1920,height:1080});
pg.on('console',m=>{if(['error','warn'].includes(m.type()))console.log('PAGE',m.text().slice(0,300))});pg.on('pageerror',e=>console.log('PAGEERR',e.message));
await pg.goto('http://127.0.0.1:8851/scripts/video-capas/modelo/modelo.html',{waitUntil:'load'});
await pg.waitForFunction('window.TOTAL>0',{timeout:180000});
const total=await pg.evaluate(()=>window.TOTAL);console.log('TOTAL',total);
if(mode==='preview'){for(const t of arg.split(',').map(Number)){await pg.evaluate(t=>seek(t),t);await pg.screenshot({path:path.join(__dirname,`mprev_${t}.jpg`),type:'jpeg',quality:80})}}
else{const OUTD=path.join(__dirname,'..','escenas');fs.mkdirSync(path.join(OUTD,'mframes'),{recursive:true});const fps=30,n=Math.ceil(total*fps);const idx=[];
 for(let i=0;i<n;i++){await pg.evaluate(t=>seek(t),i/fps);const f=`mframes/m_${String(i).padStart(4,'0')}.jpg`;await pg.screenshot({path:path.join(OUTD,f),type:'jpeg',quality:88});idx.push([f,+(i/fps).toFixed(3)]);if(i%90===0)console.log('frame',i,'/',n)}
 fs.writeFileSync(path.join(OUTD,'mframes/frames.js'),'window.MODEL_FRAMES='+JSON.stringify(idx)+';')}
await b.close()})();
