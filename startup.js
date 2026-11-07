'use strict';
const status = document.getElementById('status');
const retry = document.getElementById('retry');
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
    if (result?.state === 'ready' || result?.state === 'disabled') {
      location.replace(target);
      return;
    }
    status.textContent = result?.detail || 'Protection is not ready. Open extension Details, check its permissions, then try again.';
  }
  catch (error) { status.textContent = error.message; }
  retry.hidden = false;
}
retry.addEventListener('click', openWhenReady);
openWhenReady();
