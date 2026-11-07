'use strict';
const toast = document.getElementById('toast');
const status = document.getElementById('status');
const say = text => { toast.textContent = text; };
async function refresh() {
  try {
    const result = await chrome.runtime.sendMessage({type: 'recheck'});
    status.textContent = result?.detail || 'Registration status unavailable. Reload the extension and recheck.';
  }
  catch (error) { status.textContent = `Unable to check registration: ${error.message}`; }
}
async function save() {
  const values = document.getElementById('list').value.split(',').map(s => s.trim()).filter(Boolean);
  const list = values.map(FingerprintHosts.normalize);
  const invalid = list.findIndex(host => !host);
  if (invalid !== -1) { say(`Not saved: invalid or unsupported hostname "${values[invalid]}".`); return; }
  try {
    const unique = [...new Set(list)];
    await chrome.storage.local.set({list: unique});
    document.getElementById('list').value = unique.join(', ');
    await refresh();
    say('Saved. Reload affected tabs to apply the exceptions.');
  }
  catch (error) { say(`Save failed: ${error.message}`); }
}
document.getElementById('save').addEventListener('click', save);
document.getElementById('recheck').addEventListener('click', refresh);
window.addEventListener('keydown', event => {
  if (event.code === 'KeyS' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); save(); }
});
document.getElementById('reset').addEventListener('click', async () => {
  if (!confirm('Reset protection settings and exceptions? Open tabs will need reloading.')) return;
  try {
    // Keep session seed: resetting preferences must not create a new session.
    await chrome.storage.local.set({enabled: true, list: []});
    document.getElementById('list').value = '';
    await refresh();
    say('Settings reset. Reload open tabs.');
  }
  catch (error) { say(`Reset failed: ${error.message}`); }
});
document.getElementById('test').addEventListener('click', () => chrome.tabs.create({url: 'https://browserleaks.com/canvas'}));
chrome.storage.local.get({list: []}).then(prefs => {
  document.getElementById('list').value = prefs.list.join(', ');
}).catch(error => say(error.message));
refresh();
