/* Browser-injected MAIN-world guard for opaque/fallback documents. A content
 * script supports match_origin_as_fallback; userScripts currently does not.
 * Never trust a page event to disable this guard or provide its configuration.
 */
(() => {
  'use strict';
  if (location.protocol === 'http:' || location.protocol === 'https:') return;
  const define = Object.defineProperty;
  const descriptor = Object.getOwnPropertyDescriptor;
  const SecurityError = DOMException;
  const reject = Promise.reject.bind(Promise);
  const guard = (proto, name, async) => {
    const d = proto && descriptor(proto, name);
    if (!d?.value) return;
    define(proto, name, {...d, value: new Proxy(d.value, {
      apply() {
        const error = new SecurityError('Canvas readback is blocked in this fallback frame', 'SecurityError');
        if (async) return reject(error);
        throw error;
      }
    })});
  };
  guard(HTMLCanvasElement.prototype, 'toDataURL');
  guard(HTMLCanvasElement.prototype, 'toBlob');
  guard(CanvasRenderingContext2D.prototype, 'getImageData');
  guard(globalThis.OffscreenCanvas?.prototype, 'convertToBlob', true);
  guard(globalThis.OffscreenCanvasRenderingContext2D?.prototype, 'getImageData');
  for (const name of ['Worker', 'SharedWorker']) {
    if (typeof globalThis[name] !== 'function') continue;
    globalThis[name] = new Proxy(globalThis[name], {
      construct() { throw new SecurityError('Worker construction is blocked in this fallback frame', 'SecurityError'); }
    });
  }
})();
