/* Opt-in audit: real unpacked extension, never a per-push third-party crawler.
 * Includes same-runner v1.2/candidate/off comparisons. No fingerprint IDs saved.
 */
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const baselinePath=path.resolve(__dirname,'../fixtures/v1.2-main.js');
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
async function runAudit({context,worker,page,url,setPrefs}){
 const report={revision:process.env.GITHUB_SHA||'local',platform:os.platform(),cpu:os.cpus()[0]?.model,logicalCPUs:os.cpus().length,browser:await page.evaluate(()=>navigator.userAgent),benchmarks:[],external:[],limitations:['Headless CI, not user hardware','Heap figures exclude browser process and GPU memory','Timing is diagnostic, not a privacy score']};
 const baseline=await fs.readFile(baselinePath,'utf8');
 const candidate=await worker.evaluate(()=>source);
 await worker.evaluate(()=>chrome.storage.session.set({seed:'0123456789abcdeffedcba9876543210'}));
 async function mode(name){
  await worker.evaluate(({code})=>{source=code;currentSignature=undefined},{code:name==='v1.2'?baseline:candidate});
  await setPrefs(worker,{enabled:name!=='off',list:[],radar:false});
 }
 for(const variant of ['off','v1.2','candidate']){
  await mode(variant);
  for(const scene of ['text','random'])for(const [width,height] of [[256,128],[1024,1024],[2048,2048]]){
   await page.goto(url);
   const cdp=await context.newCDPSession(page);
   await cdp.send('HeapProfiler.collectGarbage');const before=await cdp.send('Runtime.getHeapUsage');
   const result=await page.evaluate(async({scene,width,height})=>{
    const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');
    if(scene==='random'){
     const image=x.createImageData(width,height);let s=123456789;
     for(let i=0;i<image.data.length;i+=4){s=(Math.imul(s,1664525)+1013904223)>>>0;image.data[i]=s>>>24;image.data[i+1]=s>>>16;image.data[i+2]=s>>>8;image.data[i+3]=255}x.putImageData(image,0,0);
    }else{x.fillStyle='#fff';x.fillRect(0,0,width,height);x.fillStyle='#327';x.font='20px sans-serif';for(let i=0;i<15;i++)x.fillText('Fingerprint Shield benchmark '+i,5,25+i*27)}
    const actions={read:()=>x.getImageData(0,0,width,height),dataURL:()=>c.toDataURL(),blob:()=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('null blob'))))};
    const out={};
    for(const [name,action]of Object.entries(actions)){
     const timings=[];for(let i=0;i<6;i++){const start=performance.now();await action();timings.push(performance.now()-start)}
     out[name]={firstMs:timings[0],samples:timings.slice(1)};
    }
    return out;
   },{scene,width,height});
   await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Runtime.getHeapUsage');await cdp.detach();
   for(const [api,value]of Object.entries(result))report.benchmarks.push({variant,scene,width,height,api,firstMs:value.firstMs,medianMs:median(value.samples),minMs:Math.min(...value.samples),maxMs:Math.max(...value.samples),retainedHeapDelta:after.usedSize-before.usedSize,retainedBackingDelta:(after.backingStorageSize||0)-(before.backingStorageSize||0)});
  }
  await page.goto(url);
  const dom=await page.evaluate(()=>{
   const samples=[];for(let j=0;j<6;j++){
    const host=document.createElement('div');document.body.appendChild(host);const start=performance.now();
    const f=document.createDocumentFragment();for(let i=0;i<2000;i++){const d=document.createElement('div');d.textContent='row '+i;f.appendChild(d)}host.appendChild(f);host.remove();samples.push(performance.now()-start);
   }return samples.slice(1);
  });report.benchmarks.push({variant,api:'dom-2000',medianMs:median(dom),minMs:Math.min(...dom),maxMs:Math.max(...dom)});
 }
 // External sites are diagnostic snapshots, never hard test pass/fail gates.
 // Each is visited once off and once on; failed/unready checks stay explicit.
 for(const enabled of [false,true]){
  await mode(enabled?'candidate':'off');
  for(const target of ['https://browserleaks.com/canvas','https://abrahamjuliot.github.io/creepjs/']){
   const external=await context.newPage(),errors=[];external.on('pageerror',e=>{if(errors.length<8)errors.push(e.message.slice(0,250))});
   try{
    const response=await external.goto(target,{waitUntil:'domcontentloaded',timeout:45000});
    let result;
    if(target.includes('creepjs')){
     await external.waitForFunction(()=>window.Fingerprint&&Object.keys(window.Fingerprint).length>5,null,{timeout:45000});
     result=await external.evaluate(()=>{
      const f=window.Fingerprint,l=f.lies||{};
      const records=l.data||l.lies||{};
      return {sections:Object.keys(f),liesKeys:Object.keys(l),totalLies:l.totalLies??null,lieAPIs:Object.keys(records).slice(0,60),canvasLied:f.canvas2d?.lied??null,canvasKeys:Object.keys(f.canvas2d||{}),workerKeys:Object.keys(f.workerScope||{})};
     });
    }else{
     await external.waitForFunction(()=>/Signature|Fingerprint/i.test(document.body.innerText),null,{timeout:20000});
     result=await external.evaluate(()=>({title:document.title,canvasElements:document.querySelectorAll('canvas').length,canvasLabels:document.body.innerText.split('\n').filter(x=>/Canvas Support|Text API|Fingerprint|Uniqueness|Signature|HTML Canvas/i.test(x)).map(x=>x.replace(/[a-f0-9]{16,}/gi,'[hash omitted]')).slice(0,16)}));
    }
    report.external.push({url:target,enabled,status:response?.status(),state:'completed',result,errors});
   }catch(error){report.external.push({url:target,enabled,state:'unavailable-or-incomplete',error:error.message.slice(0,500),errors})}
   finally{await external.close()}
  }
 }
 await mode('candidate');
 await fs.mkdir('test-results',{recursive:true});
 await fs.writeFile('test-results/audit.json',JSON.stringify(report,null,2));
 // Small comparable summaries in CI logs; full numeric report is an artifact.
 for(const row of report.benchmarks.filter(r=>(r.width===1024&&r.height===1024)||r.api==='dom-2000'))console.log('CANVAS_BENCH '+JSON.stringify(row));
 console.log('CANVAS_EXTERNAL '+JSON.stringify(report.external));
 return report;
}
module.exports={runAudit};
