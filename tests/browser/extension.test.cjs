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

test('unpacked extension integration', {timeout:120000}, async t=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Local canvas fixture</title><script>'+draw+'</script>');});
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
  return context.serviceWorkers()[0]||context.waitForEvent('serviceworker',{timeout:15000});
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
 // Chrome caches an unavailable userScripts namespace in an existing worker.
 // Reload the extension after granting permission, as the onboarding says.
 const nextWorker=context.waitForEvent('serviceworker',{timeout:15000});
 await worker.evaluate(()=>chrome.runtime.reload()).catch(()=>{});
 worker=await nextWorker;
 // Verify onboarding using the actual extension options page.

 const options=await context.newPage();
 await options.goto(`chrome-extension://${id}/data/options/index.html`);
 await options.getByRole('button',{name:'Recheck permission and registration'}).click();
 await waitStatus(worker,'ready');
 const page=await context.newPage();
 await page.goto(`http://localhost:${port}`);
 let baseline;
 await t.test('protection, repeatability, reloads and exceptions',async()=>{
  const first=await read(page);assert.deepEqual(first,await read(page));
  await page.reload();assert.deepEqual(first,await read(page));
  await setPrefs(worker,{enabled:false});await page.reload();baseline=await read(page);assert.notDeepEqual(first.data,baseline.data);
  await setPrefs(worker,{enabled:true,list:['localhost']});await page.reload();assert.deepEqual(await read(page),baseline);
  await setPrefs(worker,{list:[]});await page.reload();assert.deepEqual(await read(page),first);
 });
 await t.test('site and third-party partitioning use the top-level origin',async()=>{
  const other=await context.newPage();await other.goto(`http://127.0.0.1:${port}`);
  const otherTop=await read(other), firstTop=await read(page);
  assert.notDeepEqual(otherTop.data,firstTop.data);
  await page.evaluate(url=>{const f=document.createElement('iframe');f.src=url;document.body.appendChild(f)},`http://127.0.0.1:${port}/embedded`);
  const deadline=Date.now()+10000;let frame;
  while(Date.now()<deadline){frame=page.frames().find(f=>f.url().includes('/embedded'));if(frame&&await frame.evaluate(()=>typeof sample==='function').catch(()=>false))break;await new Promise(r=>setTimeout(r,50))}
  assert.ok(frame);const embedded=await read(frame);
  assert.deepEqual(embedded.data,firstTop.data);assert.notDeepEqual(embedded.data,otherTop.data);
  await other.close();
 });
 await t.test('own dimension getter cannot bypass exports and taint errors propagate',async()=>{
  const result=await page.evaluate(()=>{const c=sample(),before=c.toDataURL();Object.defineProperty(c,'width',{get(){throw Error('bypass')}});Object.defineProperty(c,'height',{value:0});return {before,after:c.toDataURL()}});
  assert.equal(result.after,result.before);assert.notEqual(result.after,baseline.url);
 });
 await t.test('overlapping reads and pixel writeback stay consistent',async()=>{
  const result=await page.evaluate(()=>{
   const c=sample(),x=c.getContext('2d'),full=x.getImageData(0,0,100,88);let differences=0;
   for(let w=50;w<82;w++){const a=x.getImageData(0,0,w,88).data;for(let y=0;y<88;y++)for(let xx=0;xx<50;xx++)for(let ch=0;ch<4;ch++)if(a[(y*w+xx)*4+ch]!==full.data[(y*100+xx)*4+ch])differences++}
   for(let i=0;i<5;i++)x.putImageData(x.getImageData(0,0,100,88),0,0);
   const final=x.getImageData(0,0,100,88).data;
   return {differences,stable:[...final].every((v,i)=>v===full.data[i])};
  });assert.equal(result.differences,0);assert.ok(result.stable);
 });
 await t.test('original canvas drawing is not modified by readbacks',async()=>{
  const ctx=await context.newCDPSession(page);
  const realm=await ctx.send('Page.createIsolatedWorld',{frameId:(await ctx.send('Page.getFrameTree')).frameTree.frame.id,worldName:'verification-only'});
  await page.evaluate(()=>{window.subject=sample();window.subject.id='subject';document.body.appendChild(window.subject);});
  const raw=async()=> (await ctx.send('Runtime.evaluate',{contextId:realm.executionContextId,expression:"Array.from(document.getElementById('subject').getContext('2d').getImageData(0,0,100,88).data).join(',')",returnByValue:true})).result.value;
  const before=await raw();await page.evaluate(()=>{subject.toDataURL();subject.getContext('2d').getImageData(0,0,100,88)});assert.equal(await raw(),before);
  await ctx.detach();
 });
 await t.test('toBlob export matches toDataURL PNG pixels',async()=>{
  assert.ok(await page.evaluate(async()=>{const c=sample();const url=await new Promise(resolve=>c.toBlob(blob=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob)}));return url===c.toDataURL()}));
 });
 await t.test('main-thread OffscreenCanvas is protected',async()=>{
  const value=await page.evaluate(async()=>{const c=new OffscreenCanvas(100,88);const x=c.getContext('2d');x.drawImage(sample(),0,0);const data=[...x.getImageData(0,0,100,88).data];const blob=await c.convertToBlob();return {data,size:blob.size}});
  assert.notDeepEqual(value.data,baseline.data);assert.ok(value.size>0);
 });
 await t.test('window.frames and nested blank iframe cannot export original data',async()=>{
  const result=await page.evaluate(draw=>{
   const frame=document.createElement('iframe');document.body.append(frame);
   const child=window.frames[window.frames.length-1];child.eval(draw);
   let url;try{url=child.sample().toDataURL()}catch(e){url=e.name}
   const nested=child.document.createElement('iframe');child.document.body.append(nested);
   let nestedUrl;try{const w=child.frames[0];w.eval(draw);nestedUrl=w.sample().toDataURL()}catch(e){nestedUrl=e.name}
   frame.remove();return {url,nestedUrl};
  },draw);
  for(const value of [result.url,result.nestedUrl]){assert.ok(value==='SecurityError'||value.startsWith('data:image/png'));assert.notEqual(value,baseline.url);}
 });
 await t.test('self-executing srcdoc readback is protected or denied',async()=>{
  const value=await page.evaluate(draw=>new Promise(resolve=>{
   const f=document.createElement('iframe');
   const listener=e=>{if(e.source===f.contentWindow&&e.data?.test==='srcdoc'){removeEventListener('message',listener);f.remove();resolve(e.data.value)}};
   addEventListener('message',listener);
   f.srcdoc='<script>'+draw+';let value;try{value=sample().toDataURL()}catch(e){value=e.name};parent.postMessage({test:"srcdoc",value},"*")<\/script>';
   document.body.appendChild(f);
  }),draw);assert.ok(value==='SecurityError'||value.startsWith('data:image/png'));assert.notEqual(value,baseline.url);
 });
 await t.test('no page-visible configuration/installer',async()=>{
  assert.deepEqual(await page.evaluate(()=>[typeof __fpsCfg,typeof installCanvasProtection,!!document.getElementById('cc-blck-fp')]),['undefined','undefined',false]);
 });
 const beforeRestart=await read(page);
 await context.close();context=null;
 worker=await launch();await worker.evaluate(()=>sync());await waitStatus(worker,'ready');
 const restarted=await context.newPage();await restarted.goto(`http://localhost:${port}`);
 await t.test('new browser session changes output after registration',async()=>assert.notDeepEqual((await read(restarted)).data,beforeRestart.data));
});
