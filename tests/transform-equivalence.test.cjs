const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {harness,root}=require('./harness.cjs');
const digest=buffer=>createHash('sha256').update(Buffer.from(buffer)).digest('hex');
test('optimised transform preserves v1.2 output across dense-cache promotion and channel edges',()=>{
 const h=harness({protected:false});
 const legacy=fs.readFileSync(path.join(root,'tests/fixtures/v1.2-main.js'),'utf8');
 const current=fs.readFileSync(path.join(root,'data/inject/main.js'),'utf8');
 h.run(`(()=>{${legacy};globalThis.oldTransform=createCanvasTransform})();`);
 h.run(`(()=>{${current};globalThis.newTransform=createCanvasTransform})();`);
 for(const seed of ['0123456789abcdeffedcba9876543210','11111111222222223333333344444444']){
  const result=h.run(`(()=>{
   const data=new Uint8ClampedArray(120000*4);let s=123456789;
   for(let i=0;i<data.length;i+=4){s=(Math.imul(s,1664525)+1013904223)>>>0;data[i]=s>>>24;data[i+1]=(s>>>16)&255;data[i+2]=(s>>>8)&255;data[i+3]=(i%28===0)?0:255}
   const a=new Uint8ClampedArray(data),b=new Uint8ClampedArray(data);
   const old=oldTransform(${JSON.stringify(seed)},'https://test.example'),next=newTransform(${JSON.stringify(seed)},'https://test.example');
   old(a);next(b);next(b);
   return {a,b};
  })()`);
  assert.equal(digest(result.b),digest(result.a));
 }
});
