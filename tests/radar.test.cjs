const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function fixture(){
 const storage={};const timers=[];let now=1000;
 const c=vm.createContext({URL,Date:{now:()=>now},console,setTimeout:fn=>timers.push(fn),chrome:{storage:{session:{async get(){return {radarState:{}}},async set(v){Object.assign(storage,v)}}},tabs:{onRemoved:{addListener(){}},onUpdated:{addListener(){}}}}});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../data/radar.js'),'utf8'),c);
 return {radar:c.CanvasRadar,storage,timers,tick:()=>{now+=1000}};
}
const sender={tab:{id:7},frameId:0,documentId:'doc-a',url:'https://example.test/path?secret=not-saved'};
test('disabled radar rejects reports and turning it off clears session data',async()=>{
 const f=fixture();assert.equal(await f.radar.record({toBlob:1},sender),false);
 await f.radar.setEnabled(true);assert.equal(await f.radar.record({toBlob:1},sender),true);
 await f.radar.setEnabled(false);assert.equal(Object.keys((await f.radar.snapshot(7)).frames).length,0);
 assert.ok(!JSON.stringify(f.storage).includes('not-saved'));
});
test('counts are bounded/whitelisted, tab/frame identity comes from sender, full URLs are not retained',async()=>{
 const f=fixture();await f.radar.setEnabled(true);
 await f.radar.record({toBlob:2000000,toDataURL:-1,getImageData:'99',unknown:1},sender);
 const value=await f.radar.snapshot(7);assert.equal(value.frames[0].counts.toBlob,1000000);assert.equal(value.frames[0].origin,'https://example.test');assert.equal(Object.keys(value.frames[0].counts).length,1);
 assert.ok(!JSON.stringify(value).includes('not-saved'));
 assert.equal(await f.radar.record({toBlob:1},{...sender,tab:{id:-1}}),false);
});
test('bursts are rate-limited; reports batch persistence; navigation replaces old document counters',async()=>{
 const f=fixture();await f.radar.setEnabled(true);
 assert.equal(await f.radar.record({toBlob:1},sender),true);assert.equal(await f.radar.record({toBlob:1},sender),false);
 f.tick();await f.radar.record({toBlob:2},sender);assert.equal(f.timers.length,1);
 assert.equal((await f.radar.snapshot(7)).frames[0].counts.toBlob,3);
 f.tick();await f.radar.record({toDataURL:1},{...sender,documentId:'doc-b',url:'https://other.test/'});
 const frame=(await f.radar.snapshot(7)).frames[0];assert.equal(frame.origin,'https://other.test');assert.equal(frame.counts.toBlob,undefined);
});
test('tab and frame retention is bounded',async()=>{
 const f=fixture();await f.radar.setEnabled(true);
 for(let tab=0;tab<35;tab++){f.tick();await f.radar.record({toBlob:1},{...sender,tab:{id:tab}})}
 assert.equal(Object.keys((await f.radar.snapshot(0)).frames).length,0);
 for(let frame=0;frame<25;frame++){f.tick();await f.radar.record({toBlob:1},{...sender,tab:{id:34},frameId:frame})}
 assert.equal(Object.keys((await f.radar.snapshot(34)).frames).length,20);
});
test('isolated bridge rejects foreign/malformed reports and rate-limits valid packets',async()=>{
 const sent=[];let listener,now=1000;
 const window={};
 const c=vm.createContext({window,Date:{now:()=>now},addEventListener:(name,fn)=>{listener=fn},chrome:{runtime:{async sendMessage(value){sent.push(value)}}}});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../data/inject/radar-bridge.js'),'utf8'),c);
 const packet={type:'fingerprint-shield.activity.v1',counts:{toDataURL:2,unknown:9,toBlob:Infinity}};
 listener({source:{},data:packet});assert.equal(sent.length,0);
 listener({source:window,data:{...packet,counts:{toBlob:1000001}}});assert.equal(sent.length,0);
 listener({source:window,data:packet});assert.equal(sent.length,1);
 assert.equal(sent[0].counts.toDataURL,2);assert.equal(Object.keys(sent[0].counts).length,1);
 listener({source:window,data:packet});assert.equal(sent.length,1);
 now+=1000;listener({source:window,data:packet});assert.equal(sent.length,2);
 assert.ok(!JSON.stringify(sent).includes('seed'));
});
