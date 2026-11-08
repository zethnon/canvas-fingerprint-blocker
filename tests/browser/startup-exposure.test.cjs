/* Real Chromium integration, no page.addInitScript substitute for extension
 * injection. Requires `npm install` and `npx playwright install chromium`.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const extension=path.resolve(__dirname,'../..');
const draw=`globalThis.sample=()=>{const c=document.createElement('canvas');c.width=100;c.height=88;const x=c.getContext('2d');x.fillStyle='#a749d3';x.fillRect(0,0,100,88);x.fillStyle='#398765';x.font='18px sans-serif';x.fillText('Canvas test 123',4,35);return c;};`;
async function waitStatus(worker,state) {
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){
  const value=await worker.evaluate(async()=> (await chrome.storage.session.get('status')).status);
  if(value?.state===state)return value;
  if(value?.state==='error')throw Error(value.detail);
  await new Promise(r=>setTimeout(r,50));
 }
 throw Error(`Timed out waiting for extension status ${state}`);
}
async function setPrefs(worker,values){
 await worker.evaluate(values=>chrome.storage.local.set(values),values);
 await worker.evaluate(()=>sync());
}
async function read(page){return page.evaluate(()=>{const c=sample();return {data:[...c.getContext('2d').getImageData(0,0,100,88).data],url:c.toDataURL()}})}

test('isolated dynamic startup URL investigation', {timeout:120000}, async t=>{
 const server=http.createServer((req,res)=>{
  if(req.url==='/audit-url-worker.js'){
   res.setHeader('Content-Type','text/javascript');res.end(`const c=new OffscreenCanvas(1,1);const x=c.getContext('2d');x.fillStyle='rgb(123,45,67)';x.fillRect(0,0,1,1);postMessage([...x.getImageData(0,0,1,1).data]);`);return;
  }
  if(req.url==='/audit-sw.js'){
   const html='<!doctype html><script>'+draw+';window.auditCached=true;</script>';
   res.setHeader('Content-Type','text/javascript');
   res.end(`addEventListener('install',e=>e.waitUntil(caches.open('fps-audit').then(c=>c.put('/audit-sw-page',new Response(${JSON.stringify(html)},{headers:{'Content-Type':'text/html'}}))).then(()=>skipWaiting())));addEventListener('activate',e=>e.waitUntil(clients.claim()));addEventListener('fetch',e=>{if(new URL(e.request.url).pathname==='/audit-sw-page')e.respondWith(caches.match('/audit-sw-page'))});`);return;
  }
  if(req.url==='/post-check'){
   let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><script>'+draw+';globalThis.postResult='+JSON.stringify({method:req.method,body})+'</script>');
   });return;
  }
  if(req.url==='/policy-worker.js'){
   res.setHeader('Content-Type','text/javascript');res.setHeader('Content-Security-Policy',"script-src 'none'");
   res.end(`let blocked=false;try{importScripts('/helper.js')}catch(e){blocked=true}postMessage({blocked,path:location.pathname});`);return;
  }
  if(req.url==='/helper.js'){res.setHeader('Content-Type','text/javascript');res.end('globalThis.helper=true;');return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local canvas fixture</title><script>'+draw+'</script>');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'0.0.0.0',resolve)});
 const port=server.address().port;
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'fps-browser-'));
 let context;
 async function launch(){
  context=await chromium.launchPersistentContext(profile,{
   channel:'chromium',headless:true,
   ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),
   args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]
  });
  return context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'))||context.waitForEvent('serviceworker',{predicate:w=>w.url().startsWith('chrome-extension://'),timeout:15000});
 }
 t.after(async()=>{
  if(context)await context.close();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  await fs.rm(profile,{recursive:true,force:true});
 });
 let worker=await launch();
 const id=new URL(worker.url()).hostname;
 const settings=await context.newPage();
 await settings.goto(`chrome://extensions/?id=${id}`);
 // Drive the real extension permission control, not a test bypass in product code.
 const row=settings.locator('extensions-detail-view extensions-toggle-row').filter({hasText:/Allow user scripts/i});
 const toggle=row.locator('cr-toggle');
 await toggle.waitFor({state:'visible',timeout:10000});
 if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
 await settings.close();
 // Chrome caches an unavailable namespace in an existing worker. A full
 // browser restart after granting permission gives the integration fixture a
 // fresh worker context without assuming runtime.reload eagerly starts one.
 await context.close();context=null;
 worker=await launch();
 const options=await context.newPage();
 await options.goto(`chrome-extension://${id}/data/options/index.html`);
 await options.getByRole('button',{name:'Recheck permission and registration'}).click();
 await waitStatus(worker,'ready');
 const page=await context.newPage();

 const observations={browser:await page.evaluate(()=>navigator.userAgent),experimental:true,dynamicURL:true};
 const staticURL=`chrome-extension://${id}/startup.html`;
 const runtimeURL=await worker.evaluate(()=>chrome.runtime.getURL('startup.html'));
 observations.runtimeUsesDynamicId=new URL(runtimeURL).hostname!==id;
 await page.goto(`http://localhost:${port}`);
 observations.staticResourceProbe=await page.evaluate(async url=>{try{const r=await fetch(url);return {ok:r.ok,status:r.status}}catch(e){return {error:e.name}}},staticURL);
 const target=`http://localhost:${port}/dynamic-check?a=1&b=x%26y&c=%23z#anchor`;
 await worker.evaluate(()=>{currentSignature=undefined;return chrome.declarativeNetRequest.updateSessionRules({removeRuleIds:[41002]})});
 const navigations=[];page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(frame.url())});
 try{
  await page.goto(target,{timeout:15000});
  await page.waitForURL(target,{timeout:5000});
  observations.freshBroker={destinationPreserved:page.url()===target};
 }catch(error){observations.freshBroker={destinationPreserved:false,error:error.message.slice(0,500),actualURL:page.url(),body:(await page.locator('body').innerText().catch(()=>'' )).slice(0,800)}}
 observations.navigations=navigations;
 // A persistent redirect retains its URL across browser restart, while dynamic
 // resource IDs rotate. Simulate the old rule surviving before applySettings.
 await worker.evaluate(async()=>{await chrome.storage.local.set({enabled:false});await sync()});
 await context.close();context=null;worker=await launch();await worker.evaluate(()=>sync());
 const nowRuntimeURL=await worker.evaluate(()=>chrome.runtime.getURL('startup.html'));
 observations.resourceIdRotated=nowRuntimeURL!==runtimeURL;
 await worker.evaluate(async oldURL=>{
  await chrome.declarativeNetRequest.updateDynamicRules({removeRuleIds:[41001],addRules:[{id:41001,priority:1,condition:{regexFilter:'^https?://.*',resourceTypes:['main_frame'],requestMethods:['get']},action:{type:'redirect',redirect:{regexSubstitution:oldURL+'?target=\\0'}}}]});
 },runtimeURL);
 const stale=await context.newPage();
 try{await stale.goto(target,{timeout:15000});await stale.waitForURL(target,{timeout:3000});observations.persistedOldDynamicURL={destinationPreserved:stale.url()===target}}
 catch(error){observations.persistedOldDynamicURL={destinationPreserved:false,error:error.message.slice(0,500),actualURL:stale.url()}}
 console.log('STARTUP_EXPOSURE '+JSON.stringify(observations));
 await fs.mkdir(path.join(extension,'test-results'),{recursive:true});
 await fs.writeFile(path.join(extension,'test-results/startup-exposure.json'),JSON.stringify(observations,null,2));
 assert.ok(observations.freshBroker,'investigation produced a result');
});
