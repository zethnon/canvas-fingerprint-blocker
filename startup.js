'use strict';
const status = document.getElementById('status');
const retry = document.getElementById('retry');
const continueButton = document.getElementById('continue');
let continuing = false;
// A website may embed this public page. Never offer a global-disable control
// inside a frame, where the surrounding site could disguise what is clicked.
continueButton.hidden = window.top !== window;

function destination() {
  // Do NOT use URLSearchParams/decodeURIComponent: the redirect embeds the
  // original query verbatim. Ampersands, percent escapes and the original
  // fragment must survive unchanged. DNR network matching excludes fragments;
  // Chrome carries a fragment onto a redirect URL that specifies none.
  if (!location.search.startsWith('?target=')) throw Error('Missing destination');
  const target = new URL(location.search.slice('?target='.length) + location.hash);
  if (!['http:', 'https:'].includes(target.protocol)) throw Error('Unsupported destination');
  return target.href;
}
async function openWhenReady() {
  retry.hidden = true;
  try {
    const target = destination();
    const result = await chrome.runtime.sendMessage({type: 'startup-ready'});
    if (!continuing && (result?.state === 'ready' || result?.state === 'disabled')) {
      location.replace(target);
      return;
    }
    status.textContent = result?.detail || 'Protection is not ready. Open extension Details, check its permissions, then try again.';
  }
  catch (error) { status.textContent = error.message; }
  retry.hidden = false;
}
continueButton.addEventListener('click', async event => {
  if (!event.isTrusted || window.top !== window || continuing) return;
  continuing = true;
  continueButton.disabled = true;
  retry.disabled = true;
  try {
    const target = destination(); // Validate before changing any preference.
    await chrome.storage.local.set({enabled: false});
    const result = await chrome.runtime.sendMessage({type: 'recheck'});
    if (result?.state !== 'disabled') throw Error(result?.detail || 'Could not disable protection. Disable the extension at chrome://extensions.');
    location.replace(target);
  }
  catch (error) {
    status.textContent = error.message;
    continuing = false;
    continueButton.disabled = false;
    retry.disabled = false;
  }
});
retry.addEventListener('click', openWhenReady);
openWhenReady();
