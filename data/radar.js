'use strict';
/* Local opt-in counters. Page-world reports are untrusted diagnostics, never
 * inputs to protection, permissions or tracker verdicts. No seeds or full URLs saved; frame origins only.
 */
globalThis.CanvasRadar = (() => {
  const APIS = ['getImageData','toDataURL','toBlob','offscreen.getImageData','offscreen.convertToBlob','worker.getImageData','worker.convertToBlob','worker.created','worker.uncovered'];
  let state = Object.create(null), enabled = false, pending = false;
  const ready = chrome.storage.session.get({radarState:{}}).then(value => {
    if (value.radarState && typeof value.radarState === 'object') state = value.radarState;
  });
  const persist = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {pending = false;chrome.storage.session.set({radarState:state}).catch(console.error)}, 1000);
  };
  const origin = url => {try{return new URL(url).origin}catch(_){return '(unknown frame)'}};
  async function setEnabled(value) {
    await ready;enabled = value === true;
    if (!enabled && Object.keys(state).length) {state=Object.create(null);await chrome.storage.session.set({radarState:state})}
  }
  async function record(counts, sender) {
    await ready;
    const tabId=sender.tab?.id, frameId=sender.frameId;
    if (!enabled || !Number.isInteger(tabId) || tabId<0 || !Number.isInteger(frameId) || frameId<0 || !counts || typeof counts!=='object' || Array.isArray(counts)) return false;
    const accepted=Object.create(null);
    for(const api of APIS){const n=counts[api];if(Number.isInteger(n)&&n>0)accepted[api]=Math.min(n,1000000)}
    if (!Object.keys(accepted).length) return false;
    const now=Date.now(),documentId=typeof sender.documentId==='string'?sender.documentId:'';
    let tab=state[tabId];
    if (!tab) {
      if(Object.keys(state).length>=30){const oldest=Object.keys(state).sort((a,b)=>state[a].updatedAt-state[b].updatedAt)[0];delete state[oldest]}
      tab=state[tabId]={frames:Object.create(null),updatedAt:now};
    }
    let frame=tab.frames[frameId];
    if(frame&&frame.documentId===documentId&&now-frame.updatedAt<100)return false;
    if(!frame||frame.documentId!==documentId){
      if(Object.keys(tab.frames).length>=20){const oldest=Object.keys(tab.frames).sort((a,b)=>tab.frames[a].updatedAt-tab.frames[b].updatedAt)[0];delete tab.frames[oldest]}
      frame=tab.frames[frameId]={origin:origin(sender.url),documentId,counts:Object.create(null),updatedAt:0};
    }
    for(const [api,n]of Object.entries(accepted))frame.counts[api]=Math.min(1000000000,(frame.counts[api]||0)+n);
    frame.updatedAt=now;tab.updatedAt=now;persist();return true;
  }
  async function clear(tabId) {await ready;delete state[tabId];await chrome.storage.session.set({radarState:state})}
  async function snapshot(tabId) {await ready;return JSON.parse(JSON.stringify(state[tabId]||{frames:{}}))}
  chrome.tabs.onRemoved.addListener(tabId=>{clear(tabId).catch(console.error)});
  chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='loading')clear(tabId).catch(console.error)});
  return Object.freeze({APIS,setEnabled,record,clear,snapshot});
})();
