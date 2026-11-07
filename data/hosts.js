'use strict';
// Also loaded by the options page; no network dependency or public-suffix guess.
globalThis.FingerprintHosts = Object.freeze({
  normalize(value) {
    if (typeof value !== 'string') return '';
    let text = value.trim().toLowerCase();
    if (!text) return '';
    try {
      if (/^[a-z]+:\/\//i.test(text)) {
        const url = new URL(text);
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        text = url.hostname;
      }
      text = text.replace(/\.$/, '');
      // IPv6 literals are intentionally rejected until match-pattern support
      // is browser-tested. Do not save an exception we cannot enforce.
      if (!/^(?=.{1,253}$)[a-z0-9.-]+$/.test(text)) return '';
      const host = new URL(`https://${text}/`).hostname;
      if (host !== text) return '';
      if (!text.split('.').every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return '';
      return text;
    }
    catch (_) { return ''; }
  },
  patterns(host) {
    return /^\d+\.\d+\.\d+\.\d+$/.test(host) || host === 'localhost'
      ? [`*://${host}/*`]
      : [`*://${host}/*`, `*://*.${host}/*`];
  }
});
