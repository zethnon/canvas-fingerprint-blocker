/* Bundled inside the seeded user script's closure; never a window callback. */
function installCanvasStartupGuard() {
  'use strict';
  const define = Object.defineProperty;
  const descriptor = Object.getOwnPropertyDescriptor;
  const SecurityError = DOMException;
  const reject = Promise.reject.bind(Promise);
  const guard = (proto, name, async) => {
    const d = proto && descriptor(proto, name);
    if (!d?.value) return;
    define(proto, name, {...d, value: new Proxy(d.value, {
      apply() {
        const error = new SecurityError('Canvas reads are waiting for the current browser session. Reload this tab after extension setup completes.', 'SecurityError');
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
  // An early document must not move the canvas probe into a newly created
  // worker while its page readbacks are denied. Existing service workers are
  // outside this extension's coverage.
  for (const name of ['Worker', 'SharedWorker']) {
    if (typeof globalThis[name] !== 'function') continue;
    globalThis[name] = new Proxy(globalThis[name], {
      construct() { throw new SecurityError('Worker startup is waiting for this browser session. Reload this tab after extension setup completes.', 'SecurityError'); }
    });
  }
}
