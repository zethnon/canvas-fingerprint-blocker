'use strict';

const toast = document.getElementById('toast');
const say = (msg, ms = 750) => {
  toast.textContent = msg;
  setTimeout(() => toast.textContent = '', ms);
};

const toHost = s => {
  try {
    return /^[a-z]+:\/\//i.test(s) ? new URL(s).hostname : s.toLowerCase();
  }
  catch (e) {
    return '';
  }
};

const save = () => {
  const list = document.getElementById('list').value
    .split(',')
    .map(s => toHost(s.trim()))
    .filter((h, i, l) => h && l.indexOf(h) === i);
  document.getElementById('list').value = list.join(', ');
  chrome.storage.local.set({list}, () => say('Saved (reload open tabs)', 1500));
};

document.getElementById('save').addEventListener('click', save);
window.addEventListener('keydown', e => {
  if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    save();
  }
});

document.getElementById('reset').addEventListener('click', e => {
  if (e.detail === 1) {
    say('Double-click to reset!');
    return;
  }
  chrome.storage.local.clear(() => {
    chrome.runtime.reload();
    window.close();
  });
});

document.getElementById('test').addEventListener('click', () => {
  chrome.tabs.create({url: 'https://browserleaks.com/canvas'});
});

chrome.storage.local.get({list: []}, prefs => {
  document.getElementById('list').value = prefs.list.join(', ');
});
