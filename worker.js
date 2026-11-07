'use strict';
const SCRIPT_ID = 'fp-main';
const GUARD_ID = 'fp-fallback-guard';
const ICONS = {
  on: {16: 'data/icons/enabled/16.png', 32: 'data/icons/enabled/32.png', 48: 'data/icons/enabled/48.png'},
  off: {16: 'data/icons/16.png', 32: 'data/icons/32.png', 48: 'data/icons/48.png'}
};
// Strict hostname/IP parsing shared with options. Invalid rules must be
// reported, not silently saved and ignored.
importScripts('data/hosts.js');
let source;
let queue = Promise.resolve();
let currentSignature;

async function getSessionSeed() {
  const {seed} = await chrome.storage.session.get('seed');
  if (seed) return seed;
  const fresh = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  await chrome.storage.session.set({seed: fresh});
  return fresh;
}
async function setState(state, detail) {
  const ready = state === 'ready';
  await chrome.storage.session.set({status: {state, detail, at: Date.now()}});
  await Promise.all([
    chrome.action.setIcon({path: ICONS[ready ? 'on' : 'off']}),
    chrome.action.setTitle({title: detail}),
    chrome.action.setBadgeText({text: ready ? 'R' : state === 'disabled' ? 'OFF' : '!'}),
    chrome.action.setBadgeBackgroundColor({color: ready ? '#886000' : '#b00020'})
  ]);
}
async function upsertUserScript(script) {
  const scripts = await chrome.userScripts.getScripts({ids: [SCRIPT_ID]});
  if (scripts.length) await chrome.userScripts.update([script]);
  else await chrome.userScripts.register([script]);
}
async function upsertGuard(excludeMatches) {
  const script = {
    id: GUARD_ID, matches: ['*://*/*'], excludeMatches,
    allFrames: true, matchOriginAsFallback: true,
    runAt: 'document_start', world: 'MAIN',
    js: ['data/inject/fallback-guard.js'], persistAcrossSessions: true
  };
  const scripts = await chrome.scripting.getRegisteredContentScripts({ids: [GUARD_ID]});
  if (scripts.length) await chrome.scripting.updateContentScripts([script]);
  else await chrome.scripting.registerContentScripts([script]);
}
async function removeGuard() {
  const scripts = await chrome.scripting.getRegisteredContentScripts({ids: [GUARD_ID]});
  if (scripts.length) await chrome.scripting.unregisterContentScripts({ids: [GUARD_ID]});
}
async function applySettings() {
  const prefs = await chrome.storage.local.get({enabled: true, list: []});
  if (!Array.isArray(prefs.list)) throw Error('Exception list must be an array of hostnames');
  const hosts = prefs.list.map(FingerprintHosts.normalize);
  const invalid = hosts.findIndex(h => !h);
  if (invalid !== -1) throw Error(`Invalid exception hostname: ${prefs.list[invalid]}`);
  if (!prefs.enabled) {
    try {
      if (chrome.userScripts && (await chrome.userScripts.getScripts({ids: [SCRIPT_ID]})).length) {
        await chrome.userScripts.unregister({ids: [SCRIPT_ID]});
      }
    }
    catch (_) { /* Permission may already have been revoked. */ }
    await removeGuard();
    currentSignature = undefined;
    await setState('disabled', 'Canvas protection disabled for new documents. Reload open tabs to remove existing hooks.');
    return;
  }
  // Check availability by awaiting the result as well as handling sync throws.
  try {
    if (!chrome.userScripts) throw Error('User scripts are unavailable');
    await chrome.userScripts.getScripts({ids: [SCRIPT_ID]});
  }
  catch (_) {
    await removeGuard();
    currentSignature = undefined;
    await setState('permission-required', 'Enable Allow user scripts in extension Details. If still unavailable, reload the extension, recheck, then reload open tabs.');
    return;
  }
  const seed = await getSessionSeed();
  const signature = JSON.stringify({seed, hosts});
  if (signature === currentSignature) return;
  source ||= await (await fetch(chrome.runtime.getURL('data/inject/main.js'))).text();
  const excludeMatches = hosts.flatMap(FingerprintHosts.patterns);
  // Neither config nor an installer callback is left on the page's global.
  const code = `(()=>{\n${source}\ninstallCanvasProtection(${JSON.stringify({seed})});\n})();`;
  await upsertGuard(excludeMatches);
  await upsertUserScript({
    id: SCRIPT_ID, matches: ['*://*/*'], excludeMatches,
    allFrames: true, runAt: 'document_start', world: 'MAIN', js: [{code}]
  });
  currentSignature = signature;
  await setState('ready', 'Canvas hooks registered for new documents. Reload open tabs (R). Fallback frames block reads; workers are not covered.');
}
function sync() {
  queue = queue.then(applySettings).catch(async error => {
    console.error(error);
    currentSignature = undefined;
    await setState('error', `Canvas setup failed: ${error.message}. Existing documents may retain earlier settings; reload after fixing.`);
  });
  return queue;
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id: 'add-to-exception-list', title: 'Allow canvas reads on this hostname', contexts: ['action']});
    chrome.contextMenus.create({id: 'test-fingerprint', title: 'Test canvas protection', contexts: ['action']});
  });
  sync();
});
chrome.runtime.onStartup.addListener(sync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.list)) sync();
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Only extension pages may request settings/status work.
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  if (message?.type !== 'recheck') return;
  sync().then(async () => respond((await chrome.storage.session.get('status')).status));
  return true;
});
chrome.action.onClicked.addListener(async () => {
  const {enabled} = await chrome.storage.local.get({enabled: true});
  await chrome.storage.local.set({enabled: !enabled});
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'test-fingerprint') {
    await chrome.tabs.create({url: 'https://browserleaks.com/canvas'});
  }
  if (info.menuItemId === 'add-to-exception-list') {
    try {
      const url = new URL(tab.url || info.pageUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw Error('Use an HTTP(S) page');
      const host = FingerprintHosts.normalize(url.hostname);
      if (!host) throw Error('Unsupported hostname');
      const {list} = await chrome.storage.local.get({list: []});
      if (!list.includes(host)) await chrome.storage.local.set({list: [...list, host]});
    }
    catch (error) { await setState('error', error.message); }
  }
});
sync();
