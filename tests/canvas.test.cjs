const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {harness,root}=require('./harness.cjs');
const read=h=>Array.from(h.run(`(()=>{const c=makeCanvas();return c.getContext('2d').getImageData(0,0,100,88).data})()`));
test('same input stays stable; hostname/session changes partition outputs',()=>{
 assert.deepEqual(read(harness()),read(harness()));
 assert.notDeepEqual(read(harness()),read(harness({origin:'https://two.test'})));
 assert.notDeepEqual(read(harness()),read(harness({seed:'1123456789abcdeffedcba9876543210'})));
});
test('third-party frame uses top-level origin partition',()=>{
 const one=read(harness({origin:'https://tracker.test',ancestors:['https://one.test']}));
 const two=read(harness({origin:'https://tracker.test',ancestors:['https://two.test']}));
 assert.notDeepEqual(one,two);
 assert.deepEqual(one,read(harness({origin:'https://one.test'})));
});
test('changes visible colour by at most 3, preserves alpha and source',()=>{
 const h=harness();
 const result=h.run(`(()=>{const c=makeCanvas(),before=raw(c),after=c.getContext('2d').getImageData(0,0,100,88).data;return {before,after:Array.from(after),source:raw(c)}})()`);
 assert.deepEqual(result.source,result.before);
 assert.ok(result.after.some((v,i)=>v!==result.before[i]));
 result.after.forEach((v,i)=>assert.ok(i%4===3?v===result.before[i]:Math.abs(v-result.before[i])<=3));
});
test('transparent and out-of-bounds pixels stay zero',()=>{
 const h=harness();assert.ok(h.run(`(()=>{const c=new HTMLCanvasElement(2,2);return [...c.getContext('2d').getImageData(-2,-2,4,4).data].every(x=>x===0)})()`));
});
test('overlapping rectangle majority attack cannot recover discarded bits',()=>{
 const h=harness();
 const result=h.run(`(()=>{
  const c=makeCanvas(),ctx=c.getContext('2d'),full=ctx.getImageData(0,0,100,88).data;
  let mismatches=0,originalDifferences=0;
  for(let width=50;width<82;width++){
   const crop=ctx.getImageData(0,0,width,88).data;
   for(let y=0;y<88;y++)for(let x=0;x<50;x++)for(let ch=0;ch<4;ch++)
    if(crop[(y*width+x)*4+ch]!==full[(y*100+x)*4+ch])mismatches++;
  }
  const original=raw(c);
  for(let y=0;y<88;y++)for(let x=0;x<50;x++)for(let ch=0;ch<4;ch++)
   if(full[(y*100+x)*4+ch]!==original[(y*100+x)*4+ch])originalDifferences++;
  return {mismatches,originalDifferences};
 })()`);
 assert.equal(result.mismatches,0);assert.ok(result.originalDifferences>0);
});
test('repeated read/write loops do not accumulate noise',()=>{
 const h=harness();assert.ok(h.run(`(()=>{const c=makeCanvas(),ctx=c.getContext('2d');const first=ctx.getImageData(0,0,100,88);for(let i=0;i<10;i++)ctx.putImageData(ctx.getImageData(0,0,100,88),0,0);const final=raw(c);return [...first.data].every((v,i)=>v===final[i])})()`));
});
test('own dimensions cannot force an original export; exports match reads',()=>{
 const h=harness();const result=h.run(`(()=>{const c=makeCanvas(),ctx=c.getContext('2d'),expected=[...ctx.getImageData(0,0,100,88).data].join(',');Object.defineProperty(c,'width',{get(){throw Error('bypass')}});Object.defineProperty(c,'height',{value:0});return {expected,actual:c.toDataURL(),raw:raw(c).join(',')}})()`);
 assert.equal(result.actual,result.expected);assert.notEqual(result.actual,result.raw);
});
test('taint and copy errors never fall back to clean exports',()=>{
 const h=harness();assert.equal(h.run(`(()=>{const c=makeCanvas();c.tainted=true;try{c.toDataURL()}catch(e){return e.name}})()`),'SecurityError');
 assert.equal(h.run(`(()=>{try{HTMLCanvasElement.prototype.toDataURL.call({width:1,height:1})}catch(e){return e.name}})()`),'TypeError');
});
test('page modifications to Reflect.apply, Math and ImageData getter do not bypass hooks',()=>{
 const h=harness();assert.ok(h.run(`(()=>{const c=makeCanvas(),expected=c.toDataURL();Reflect.apply=()=>{throw Error('trap')};Math.round=()=>{throw Error('trap')};Object.defineProperty(Uint8ClampedArray.prototype,'length',{value:0});Object.defineProperty(ImageData.prototype,'data',{get(){throw Error('trap')}});return c.toDataURL()===expected})()`));
});
test('empty canvas export preserves native result and invalid reads still fail',()=>{
 const h=harness();assert.equal(h.run(`new HTMLCanvasElement(0,0).toDataURL()`),'');
 assert.equal(h.run(`(()=>{try{makeCanvas().getContext('2d').getImageData(0,0,0,1)}catch(e){return e.name}})()`),'IndexSizeError');
});
test('main-thread OffscreenCanvas read/export are protected',async()=>{
 const h=harness();const result=await h.run(`(async()=>{const c=new OffscreenCanvas(100,88);c.getContext('2d').drawImage(makeCanvas());const data=[...c.getContext('2d').getImageData(0,0,100,88).data].join(',');return {data,exported:await c.convertToBlob(),raw:raw(c).join(',')}})()`);
 assert.equal(result.data,result.exported);assert.notEqual(result.data,result.raw);
});
test('wrapper names/lengths preserved and no seed/installer global is left behind',()=>{
 const h=harness();assert.equal(h.run('HTMLCanvasElement.prototype.toDataURL.name'),'toDataURL');
 assert.equal(h.run('HTMLCanvasElement.prototype.toDataURL.length'),0);
 assert.equal(h.run('typeof __fpsCfg'),'undefined');assert.equal(h.run('typeof installCanvasProtection'),'undefined');
});
test('fallback frame guard denies reads without trusting page messages',async()=>{
 const h=harness({protected:false});h.run(`location.protocol='about:'`);
 h.run(fs.readFileSync(path.join(root,'data/inject/fallback-guard.js'),'utf8'));
 assert.equal(h.run(`(()=>{try{makeCanvas().toDataURL()}catch(e){return e.name}})()`),'SecurityError');
 await assert.rejects(h.run(`new OffscreenCanvas(1,1).convertToBlob()`),e=>e.name==='SecurityError');
});
test('fallback guard leaves HTTP documents alone',()=>{
 const h=harness({protected:false});h.run(fs.readFileSync(path.join(root,'data/inject/fallback-guard.js'),'utf8'));
 assert.equal(h.run(`makeCanvas().toDataURL()===raw(makeCanvas()).join(',')`),true);
});

test('dropping low colour bits does not remove all site-dependent variation',()=>{
 const one=read(harness()).map((v,i)=>i%4===3?v:v&252);
 const two=read(harness({origin:'https://two.test'})).map((v,i)=>i%4===3?v:v&252);
 assert.notDeepEqual(one,two);
});
