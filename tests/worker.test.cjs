const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
const {root}=require('./harness.cjs');
function worker({local={},session={},denied=false}={}) {
 const scripts=new Map(),guards=new Map(),dynamicRules=new Map(),sessionRules=new Map(),calls=[];
 const event=()=>({addListener(){}});
 const storage=store=>({async get(defaults){if(typeof defaults==='string')return {[defaults]:store[defaults]};return {...defaults,...store}},async set(values){Object.assign(store,values)}});
 const registry=(map,label)=>({
  async getScripts(filter){if(denied&&label==='scripts')throw Error('denied');return [...map.values()].filter(s=>!filter?.ids||filter.ids.includes(s.id))},
  async register(values){calls.push(label+'.register');calls.push(...values.map(s=>label+'.register:'+s.id));for(const s of values)map.set(s.id,s)},
  async update(values){calls.push(label+'.update');calls.push(...values.map(s=>label+'.update:'+s.id));for(const s of values)map.set(s.id,s)},
  async unregister(filter){calls.push(label+'.unregister');if(!filter?.ids)map.clear();else for(const id of filter.ids)map.delete(id)}
 });
 const users=registry(scripts,'scripts'),guard=registry(guards,'guard');
 const updateRules=(map,label)=>async change=>{
  calls.push(label);
  for(const id of change.removeRuleIds||[])map.delete(id);
  for(const rule of change.addRules||[])map.set(rule.id,rule);
 };
 const chrome={declarativeNetRequest:{updateDynamicRules:updateRules(dynamicRules,'dynamic.rules'),updateSessionRules:updateRules(sessionRules,'session.rules')},storage:{local:storage(local),session:storage(session),onChanged:event()},
  userScripts:users,scripting:{getRegisteredContentScripts:guard.getScripts,registerContentScripts:guard.register,updateContentScripts:guard.update,unregisterContentScripts:guard.unregister},
  action:{async setIcon(){},async setTitle(){},async setBadgeText(){},async setBadgeBackgroundColor(){},onClicked:event()},
  runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onInstalled:event(),onStartup:event(),onMessage:event()},
  contextMenus:{removeAll(){},create(){},onClicked:event()},tabs:{async create(){},onRemoved:event(),onUpdated:event()}};
 const context=vm.createContext({chrome,URL,crypto:webcrypto,console:{error(){}},fetch:async url=>({text:async()=>fs.readFileSync(path.join(root,new URL(url).pathname),'utf8')})});
 context.importScripts=p=>vm.runInContext(fs.readFileSync(path.join(root,p),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'worker.js'),'utf8')+';globalThis.recheck=sync;',context);
 return {context,chrome,local,session,scripts,guards,dynamicRules,sessionRules,calls,sync:()=>context.recheck()};
}
test('register once, update settings atomically without unregister gap',async()=>{
 const w=worker();await w.sync();assert.equal(w.scripts.size,1);assert.equal(w.guards.size,1);
 assert.equal(w.calls.filter(s=>s==='scripts.register').length,1);
 w.local.list=['example.com'];await w.sync();assert.ok(w.calls.includes('scripts.update'));assert.ok(!w.calls.includes('scripts.unregister'));
 assert.deepEqual(Array.from(w.scripts.get('fp-main').excludeMatches),['*://example.com/*','*://*.example.com/*']);
});
test('session seed survives worker restarts and changes when session storage is cleared',async()=>{
 const session={};const one=worker({session});await one.sync();const seed=session.seed;
 const two=worker({session});await two.sync();assert.equal(session.seed,seed);
 const fresh=worker();await fresh.sync();assert.notEqual(fresh.session.seed,seed);assert.match(seed,/^[0-9a-f]{32}$/);
});
test('queued changes converge to final settings without being dropped',async()=>{
 const w=worker();await w.sync();w.local.list=['one.test'];const first=w.sync();await first;w.local.list=['two.test'];await Promise.all([w.sync(),w.sync()]);
 assert.equal(w.scripts.get('fp-main').excludeMatches[0],'*://two.test/*');
});
test('permission failures and invalid preferences have explicit status',async()=>{
 const denied=worker({denied:true});await denied.sync();assert.equal(denied.session.status.state,'permission-required');assert.equal(denied.scripts.size,0);
 const invalid=worker({local:{list:['not a host']}});await invalid.sync();assert.equal(invalid.session.status.state,'error');assert.equal(invalid.scripts.size,0);
});
test('disable unregisters both own script IDs and announces reload requirement',async()=>{
 const w=worker();await w.sync();w.local.enabled=false;await w.sync();assert.equal(w.scripts.size,0);assert.equal(w.guards.size,0);assert.equal(w.session.status.state,'disabled');assert.match(w.session.status.detail,/Reload/);
});
test('config is bundled into a closure, no page-visible global bridge',async()=>{
 const w=worker();await w.sync();const code=w.scripts.get('fp-main').js[0].code;
 assert.match(code,/^\(\(\)=>\{/);assert.ok(!code.includes('__fpsCfg'));assert.ok(!code.includes('cfp-json-data'));
});
test('host validation rejects ignored rules and normalises supported input',()=>{
 const ctx=vm.createContext({URL});vm.runInContext(fs.readFileSync(path.join(root,'data/hosts.js'),'utf8'),ctx);const h=ctx.FingerprintHosts;
 assert.equal(h.normalize('https://EXAMPLE.com/a'),'example.com');assert.equal(h.normalize('example.com.'),'example.com');
 for(const bad of ['[::1]','not a host','-bad.com','a..com','*.example.com','file://foo/','127.1','example.com:8080'])assert.equal(h.normalize(bad),'',bad);
 assert.deepEqual(Array.from(h.patterns('127.0.0.1')),['*://127.0.0.1/*']);
});


test('startup navigation redirect persists but its higher-priority release is session-only',async()=>{
 const w=worker();await w.sync();
 const gate=w.dynamicRules.get(41001),allow=w.sessionRules.get(41002);
 assert.equal(gate.action.type,'redirect');assert.equal(allow.action.type,'allow');assert.ok(allow.priority>gate.priority);
 assert.equal(gate.action.redirect.regexSubstitution,'chrome-extension://test/startup.html?target=\\0');
 assert.deepEqual(Array.from(gate.condition.resourceTypes),['main_frame']);
 assert.deepEqual(Array.from(gate.condition.requestMethods),['get']);
 assert.ok(w.calls.indexOf('scripts.register:fp-main')<w.calls.indexOf('session.rules'));
});
test('permission failure retains startup hold and never releases navigation',async()=>{
 const w=worker({denied:true});await w.sync();
 assert.equal(w.dynamicRules.size,1);assert.equal(w.sessionRules.size,0);assert.equal(w.session.status.state,'permission-required');
});
test('disable removes startup redirect and session release rules',async()=>{
 const w=worker();await w.sync();w.local.enabled=false;await w.sync();
 assert.equal(w.dynamicRules.size,0);assert.equal(w.sessionRules.size,0);
});
test('site exceptions are excluded from the persistent navigation hold',async()=>{
 const w=worker({local:{list:['example.com']}});await w.sync();
 assert.deepEqual(Array.from(w.dynamicRules.get(41001).condition.excludedRequestDomains),['example.com']);
});

test('radar is opt-in and changing it updates both the bridge and injected configuration',async()=>{
 const w=worker();await w.sync();assert.ok(!w.guards.has('fp-radar-bridge'));
 w.local.radar=true;await w.sync();assert.ok(w.guards.has('fp-radar-bridge'));assert.match(w.scripts.get('fp-main').js[0].code, /"radar":true/);
 w.local.radar=false;await w.sync();assert.ok(!w.guards.has('fp-radar-bridge'));
});

test('disabling protection recovers even with invalid saved exceptions',async()=>{
 const w=worker();await w.sync();w.local.list=['not a host'];await w.sync();assert.equal(w.session.status.state,'error');
 w.local.enabled=false;await w.sync();assert.equal(w.session.status.state,'disabled');assert.equal(w.dynamicRules.size,0);assert.equal(w.sessionRules.size,0);assert.equal(w.scripts.size,0);assert.equal(w.guards.size,0);
});
