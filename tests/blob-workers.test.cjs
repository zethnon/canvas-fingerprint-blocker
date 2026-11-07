const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
const {harness,root}=require('./harness.cjs');
function fixture(){
 const h=harness({protected:false});
 Object.assign(h.context,{NativeURL:URL,Blob,EventTarget,Event,MessageEvent,crypto:webcrypto});
 h.run(`
  const testURLs=new Map();let sequence=0;
  class URL extends NativeURL {
   static createObjectURL(blob){const u='blob:'+ORIGIN+'/'+(++sequence);testURLs.set(u,blob);return u}
   static revokeObjectURL(url){testURLs.delete(url)}
  }
  class TestWorker extends EventTarget {
   constructor(url,options){super();this.url=url;this.options=options;this.sent=[];}
   postMessage(value){this.sent.push(value)}
   terminate(){this.stopped=true}
  }
  Object.assign(globalThis,{URL,Worker:TestWorker});
 `);
 h.run(fs.readFileSync(path.join(root,'data/inject/blob-workers.js'),'utf8'));
 h.run(`installBlobWorkerProtection({seed:'0123456789abcdeffedcba9876543210',topOrigin:ORIGIN},function createCanvasTransform(){},function installWorkerCanvasProtection(){})`);
 return h;
}
test('native URL workers keep their URL/loader and receive no seed message',()=>{
 const h=fixture();const r=h.run(`(()=>{const w=new Worker('/native.js',{type:'module'});return {url:w.url,sent:w.sent.length}})()`);
 assert.equal(r.url,'https://one.test/native.js');assert.equal(r.sent,0);
});
test('Blob bootstrap contains no seed; native initialization is sent before returning',async()=>{
 const h=fixture();const r=await h.run(`(async()=>{const original=URL.createObjectURL(new Blob(['postMessage("user")']));const w=new Worker(original);URL.revokeObjectURL(original);return {body:await testURLs.get(w.url).text(),config:w.sent[0].config,resources:testURLs.size};})()`);
 assert.ok(!r.body.includes('0123456789abcdeffedcba9876543210'));
 assert.equal(r.config.seed,'0123456789abcdeffedcba9876543210');assert.equal(r.resources,2);
});
test('page-modified Array iterator cannot replace the bootstrap body',async()=>{
 const h=fixture();const body=await h.run(`(async()=>{const original=URL.createObjectURL(new Blob(['postMessage("user")']));Array.prototype[Symbol.iterator]=function*(){yield 'postMessage("stolen")'};const w=new Worker(original);return testURLs.get(w.url).text()})()`);
 assert.ok(body.includes('installWorkerCanvasProtection'));assert.ok(!body.includes('postMessage("stolen")'));
});
test('untracked Blob workers fail closed instead of exposing a seed or clean fallback',()=>{
 const h=fixture();assert.equal(h.run(`(()=>{try{new Worker('blob:https://one.test/missing')}catch(e){return e.name}})()`),'SecurityError');
});
test('termination releases retained Blob URLs',()=>{
 const h=fixture();assert.equal(h.run(`(()=>{const u=URL.createObjectURL(new Blob(['']));const w=new Worker(u);URL.revokeObjectURL(u);w.terminate();return testURLs.size})()`),0);
});
