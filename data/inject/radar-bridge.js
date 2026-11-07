/* ISOLATED world: Chrome supplies real tab/frame/document identity. A page
 * can forge its own counts. Validate, rate-limit and label accordingly.
 */
(() => {
  'use strict';
  const apis=['getImageData','toDataURL','toBlob','offscreen.getImageData','offscreen.convertToBlob','worker.getImageData','worker.convertToBlob','worker.created','worker.uncovered'];
  let sentAt=0;
  addEventListener('message',event=>{
    if(event.source!==window||event.data?.type!=='fingerprint-shield.activity.v1')return;
    const now=Date.now();if(now-sentAt<900)return;
    const raw=event.data.counts;if(!raw||typeof raw!=='object'||Array.isArray(raw))return;
    const counts={};for(const api of apis){const n=raw[api];if(Number.isInteger(n)&&n>0&&n<=1000000)counts[api]=n}
    if(!Object.keys(counts).length)return;
    sentAt=now;chrome.runtime.sendMessage({type:'canvas-activity',counts}).catch(()=>{});
  });
})();
