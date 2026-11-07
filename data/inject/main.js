/*
 * Runs in the page's MAIN world at document_start, before any page script.
 *
 * Noise model (replaces the old "shift ~100 grid pixels by a fixed amount"):
 * - seed = per-browser-session random value (from the worker) + hostname
 *   -> same site, same session: stable result (repeated reads match, so the
 *      noise can't be spotted by reading twice)
 *   -> different site or new session: different result (not linkable)
 * - the PRNG is also seeded by the canvas content, so different drawings get
 *   different noise patterns
 * - ±1 on one channel of ~1/8 of visible pixels; transparent pixels are
 *   skipped because changing them is lost anyway
 * - we never modify the page's canvas: exports go through a noisy copy, and
 *   getImageData noises only the returned buffer (no revert race, no flicker)
 */
(() => {
  'use strict';

  const cfg = globalThis.__fpsCfg;
  try {
    delete globalThis.__fpsCfg;
  }
  catch (e) {}
  if (!cfg || !cfg.seed) {
    return;
  }

  // Grab natives before page scripts can touch them.
  const N = {
    toDataURL: HTMLCanvasElement.prototype.toDataURL,
    toBlob: HTMLCanvasElement.prototype.toBlob,
    getContext: HTMLCanvasElement.prototype.getContext,
    getImageData: CanvasRenderingContext2D.prototype.getImageData,
    putImageData: CanvasRenderingContext2D.prototype.putImageData,
    drawImage: CanvasRenderingContext2D.prototype.drawImage,
    createElement: Document.prototype.createElement,
    setWidth: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width').set,
    setHeight: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'height').set,
    imul: Math.imul
  };
  const doc = document;

  const fnv = str => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = N.imul(h, 0x01000193);
    }
    return h >>> 0;
  };
  const siteKey = fnv(cfg.seed + '|' + location.hostname);

  // In-place noise on an RGBA buffer (Uint8ClampedArray).
  const noisify = data => {
    const len = data.length;
    if (!len) {
      return;
    }
    // Content hash over up to ~4096 sampled pixels (keeps large canvases cheap).
    const step = Math.max(4, Math.floor(len / 4 / 4096) * 4);
    let h = siteKey;
    for (let i = 0; i < len; i += step) {
      h ^= data[i] | (data[i + 1] << 8) | (data[i + 2] << 16) | (data[i + 3] << 24);
      h = N.imul(h, 0x01000193);
    }
    // mulberry32
    let s = h | 0;
    const rnd = () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = N.imul(s ^ (s >>> 15), 1 | s);
      t = (t + N.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
    for (let i = 0; i < len; i += 4) {
      if (data[i + 3] === 0) {
        continue;
      }
      const r = rnd();
      if ((r & 7) !== 0) {
        continue;
      }
      const ch = i + ((r >>> 3) % 3);
      const v = data[ch] + ((r & 0x100) ? 1 : -1);
      // Bounce off 0/255 instead of clamping, so the change is never a no-op.
      data[ch] = v < 0 ? 1 : (v > 255 ? 254 : v);
    }
  };

  // Noisy copy of any canvas (2d or WebGL). Throws SecurityError on tainted
  // canvases, exactly like the real export would.
  const noisyCopy = canvas => {
    const {width, height} = canvas;
    if (!width || !height) {
      return null;
    }
    const copy = N.createElement.call(doc, 'canvas');
    N.setWidth.call(copy, width);
    N.setHeight.call(copy, height);
    const ctx = N.getContext.call(copy, '2d', {willReadFrequently: true});
    N.drawImage.call(ctx, canvas, 0, 0);
    const img = N.getImageData.call(ctx, 0, 0, width, height);
    noisify(img.data);
    N.putImageData.call(ctx, img, 0, 0);
    return copy;
  };

  // Proxy keeps the original name/length. Step 5 will harden toString.
  const wrap = (proto, name, apply) => {
    proto[name] = new Proxy(proto[name], {apply});
  };

  const exportVia = (target, self, args) => {
    let copy = null;
    try {
      copy = noisyCopy(self);
    }
    catch (e) {
      // tainted / unusual canvas: fall through so the native call behaves (and throws) normally
    }
    return Reflect.apply(target, copy || self, args);
  };

  wrap(HTMLCanvasElement.prototype, 'toDataURL', exportVia);
  wrap(HTMLCanvasElement.prototype, 'toBlob', exportVia);
  wrap(CanvasRenderingContext2D.prototype, 'getImageData', (target, self, args) => {
    const img = Reflect.apply(target, self, args);
    try {
      noisify(img.data);
    }
    catch (e) {}
    return img;
  });

  // Same-origin iframes (about:blank, srcdoc) don't get the user script, so a
  // fingerprinter could create one and use its clean canvas prototypes.
  // Patch the child window the moment the page grabs it.
  const patched = new WeakSet();
  const patchWindow = w => {
    if (!w || w === window || patched.has(w)) {
      return;
    }
    try {
      w.HTMLCanvasElement.prototype.toDataURL = HTMLCanvasElement.prototype.toDataURL;
      w.HTMLCanvasElement.prototype.toBlob = HTMLCanvasElement.prototype.toBlob;
      w.CanvasRenderingContext2D.prototype.getImageData = CanvasRenderingContext2D.prototype.getImageData;
      patched.add(w);
    }
    catch (e) {
      // cross-origin: that frame gets its own user script via allFrames
    }
  };
  const hookGetter = (proto, prop, toWindow) => {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.get) {
      return;
    }
    Object.defineProperty(proto, prop, {
      ...d,
      get: new Proxy(d.get, {
        apply(target, self, args) {
          const value = Reflect.apply(target, self, args);
          patchWindow(toWindow(value));
          return value;
        }
      })
    });
  };
  hookGetter(HTMLIFrameElement.prototype, 'contentWindow', v => v);
  hookGetter(HTMLIFrameElement.prototype, 'contentDocument', v => v && v.defaultView);
})();
