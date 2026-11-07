'use strict';

/*
 * Background service worker.
 *
 * Why userScripts instead of manifest content scripts:
 * the old version passed its settings to the page through a fake
 * Server-Timing header plus a hidden <div>. Both are readable by the page,
 * and the header contained the exact noise values. userScripts lets us bake
 * the config straight into the injected code, so nothing is exposed.
 *
 * Requires the per-extension "Allow user scripts" toggle
 * (chrome://extensions -> Details).
 */

const SCRIPT_ID = 'fp-main';
// Plain hostname check; rejects anything that would build an invalid match pattern.
const HOST_RE = /^(?=.{1,253}$)([a-z0-9-]+\.)*[a-z0-9-]+$/i;

const ICONS = {
  on: {16: '/data/icons/enabled/16.png', 32: '/data/icons/enabled/32.png', 48: '/data/icons/enabled/48.png'},
  off: {16: '/data/icons/16.png', 32: '/data/icons/32.png', 48: '/data/icons/48.png'}
};

const notify = async message => {
  const id = await chrome.notifications.create({
    type: 'basic',
    title: chrome.runtime.getManifest().name,
    message,
    iconUrl: '/data/icons/48.png'
  });
  setTimeout(() => chrome.notifications.clear(id), 3000);
};

// Throws (or is undefined) when the "Allow user scripts" toggle is off.
const userScriptsAvailable = () => {
  try {
    chrome.userScripts.getScripts();
    return true;
  }
  catch (e) {
    return false;
  }
};

// One seed per browser session. storage.session is wiped on browser restart,
// and survives service-worker restarts in between.
const getSessionSeed = async () => {
  const {seed} = await chrome.storage.session.get('seed');
  if (seed) {
    return seed;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const fresh = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  await chrome.storage.session.set({seed: fresh});
  return fresh;
};

const setState = (icon, title, badge = '') => {
  chrome.action.setIcon({path: ICONS[icon]});
  chrome.action.setTitle({title});
  chrome.action.setBadgeText({text: badge});
};

const apply = async () => {
  const prefs = await chrome.storage.local.get({enabled: true, list: []});

  if (!userScriptsAvailable()) {
    setState('off', 'Not running: enable "Allow user scripts" in chrome://extensions → Details', '!');
    chrome.action.setBadgeBackgroundColor({color: '#c00'});
    return;
  }

  await chrome.userScripts.unregister();

  if (!prefs.enabled) {
    setState('off', 'Fingerprint protection is disabled.');
    return;
  }

  const seed = await getSessionSeed();
  const excludeMatches = prefs.list
    .filter(h => HOST_RE.test(h))
    .flatMap(h => [`*://${h}/*`, `*://*.${h}/*`]);

  await chrome.userScripts.register([{
    id: SCRIPT_ID,
    matches: ['*://*/*'],
    excludeMatches,
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
    js: [
      // main.js reads this and deletes it before any page script runs.
      {code: `globalThis.__fpsCfg=${JSON.stringify({seed})};`},
      {file: 'data/inject/main.js'}
    ]
  }]);

  setState('on', 'Fingerprint protection is enabled.');
};

// Serialise calls so overlapping triggers can't interleave register/unregister.
// (The old version used a "busy" flag that silently dropped updates.)
let queue = Promise.resolve();
const sync = () => {
  queue = queue.then(apply).catch(e => {
    console.error(e);
    notify('Unexpected error: ' + e.message);
  });
  return queue;
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'add-to-exception-list',
      title: 'Allow fingerprinting on this hostname',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'test-fingerprint',
      title: 'Test canvas protection',
      contexts: ['action']
    });
  });
  sync();
});
// Re-register at startup so the new session seed gets baked in.
chrome.runtime.onStartup.addListener(sync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.list)) {
    sync();
  }
});
// The toggle can be flipped while the worker is alive; re-check on wake-ups.
sync();

chrome.action.onClicked.addListener(async () => {
  const {enabled} = await chrome.storage.local.get({enabled: true});
  await chrome.storage.local.set({enabled: !enabled});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'test-fingerprint') {
    chrome.tabs.create({
      url: 'https://browserleaks.com/canvas',
      index: tab.index + 1,
      openerTabId: tab.id
    });
    return;
  }
  if (info.menuItemId === 'add-to-exception-list') {
    const url = tab.url || info.pageUrl;
    if (!url || !url.startsWith('http')) {
      notify('Cannot add this page to the exception list');
      return;
    }
    const {hostname} = new URL(url);
    const {list} = await chrome.storage.local.get({list: []});
    if (list.includes(hostname)) {
      notify('This hostname is already in your exception list');
      return;
    }
    list.push(hostname);
    await chrome.storage.local.set({list});
    notify(`"${hostname}" added to the exception list (reload the tab)`);
  }
});
