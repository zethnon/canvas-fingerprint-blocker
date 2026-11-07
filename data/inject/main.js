/* Bundled by worker.js inside one closure. Never publish the seed on window. */
function installCanvasProtection(config) {
  'use strict';
  const apply = Reflect.apply;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const define = Object.defineProperty;
  const NativeProxy = Proxy;
  const imul = Math.imul;
  const typedArrayTag = getDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
  const imageData = getDescriptor(ImageData.prototype, 'data').get;
  const dataLength = getDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length').get;
  const {max, min, round} = Math;
  const mapGet = Map.prototype.get;
  const mapSet = Map.prototype.set;
  const mapClear = Map.prototype.clear;
  const cache = new Map();
  let cacheSize = 0;
  const keys = config.seed.match(/.{8}/g).map(s => parseInt(s, 16) >>> 0);
  // Partition third-party frames by the top-level origin, not just frame host.
  let topOrigin = location.origin;
  try {
    if (location.ancestorOrigins.length) {
      topOrigin = location.ancestorOrigins[location.ancestorOrigins.length - 1];
    }
    else {
      topOrigin = top.location.origin;
    }
  }
  catch (_) { /* Chromium ancestorOrigins normally supplies cross-origin roots. */ }
  for (let i = 0; i < topOrigin.length; i++) {
    keys[i & 3] = imul(keys[i & 3] ^ topOrigin.charCodeAt(i), 16777619) >>> 0;
  }

  // Keyed XTEA permutation over each 6-bit RGB bucket. Low two bits are
  // replaced, not added: crops agree, read/write loops are idempotent, and
  // majority voting across rectangles cannot recover the discarded bits.
  // Upper bits remain visible: this is perturbation, NOT full anonymisation.
  const bucketBits = bucket => {
    const cached = apply(mapGet, cache, [bucket]);
    if (cached !== undefined) return cached;
    let a = bucket >>> 0, b = 0x46505331, sum = 0;
    for (let round = 0; round < 32; round++) {
      a = (a + ((((b << 4) ^ (b >>> 5)) + b) ^ (sum + keys[sum & 3]))) >>> 0;
      sum = (sum + 0x9e3779b9) >>> 0;
      b = (b + ((((a << 4) ^ (a >>> 5)) + a) ^ (sum + keys[(sum >>> 11) & 3]))) >>> 0;
    }
    const value = (a ^ b) & 63;
    if (cacheSize >= 4096) { apply(mapClear, cache, []); cacheSize = 0; }
    cacheSize++;
    apply(mapSet, cache, [bucket, value]);
    return value;
  };
  const transform = data => {
    const tag = apply(typedArrayTag, data, []);
    const u8 = tag === 'Uint8ClampedArray';
    const f16 = tag === 'Float16Array';
    if (!u8 && !f16) throw new DOMException('Unsupported canvas pixel format', 'NotSupportedError');
    const scale = u8 ? 1 : 255;
    const length = apply(dataLength, data, []);
    for (let i = 0; i < length; i += 4) {
      if (data[i + 3] === 0) continue;
      // Float formats use an explicit 8-bit privacy projection. Alpha stays
      // untouched; HDR fidelity is not preserved (documented in README).
      const r = max(0, min(255, round(data[i] * scale)));
      const g = max(0, min(255, round(data[i + 1] * scale)));
      const b = max(0, min(255, round(data[i + 2] * scale)));
      const bits = bucketBits((r >>> 2) | ((g >>> 2) << 6) | ((b >>> 2) << 12));
      data[i] = ((r & 252) | (bits & 3)) / scale;
      data[i + 1] = ((g & 252) | ((bits >>> 2) & 3)) / scale;
      data[i + 2] = ((b & 252) | ((bits >>> 4) & 3)) / scale;
    }
    return data;
  };

  const canvasProto = HTMLCanvasElement.prototype;
  const contextProto = CanvasRenderingContext2D.prototype;
  const offscreenProto = globalThis.OffscreenCanvas?.prototype;
  const offContextProto = globalThis.OffscreenCanvasRenderingContext2D?.prototype;
  const native = {
    get: contextProto.getImageData,
    put: contextProto.putImageData,
    draw: contextProto.drawImage,
    context: canvasProto.getContext,
    width: getDescriptor(canvasProto, 'width').get,
    height: getDescriptor(canvasProto, 'height').get,
    setWidth: getDescriptor(canvasProto, 'width').set,
    setHeight: getDescriptor(canvasProto, 'height').set,
    create: Document.prototype.createElement,
    offWidth: offscreenProto && getDescriptor(offscreenProto, 'width').get,
    offHeight: offscreenProto && getDescriptor(offscreenProto, 'height').get,
    offContext: offscreenProto?.getContext,
    offGet: offContextProto?.getImageData,
    offPut: offContextProto?.putImageData,
    offDraw: offContextProto?.drawImage,
    Offscreen: globalThis.OffscreenCanvas,
    SecurityError: DOMException
  };
  const doc = document;
  const wrap = (proto, name, handler) => {
    if (!proto || typeof proto[name] !== 'function') return;
    const descriptor = getDescriptor(proto, name);
    define(proto, name, {...descriptor, value: new NativeProxy(descriptor.value, {apply: handler})});
  };
  const copyCanvas = (canvas, offscreen) => {
    // Use brand-checking native accessors, never page-defined own properties.
    const width = apply(offscreen ? native.offWidth : native.width, canvas, []);
    const height = apply(offscreen ? native.offHeight : native.height, canvas, []);
    if (!width || !height) return null; // native empty-canvas behaviour
    const copy = offscreen ? new native.Offscreen(width, height) : apply(native.create, doc, ['canvas']);
    if (!offscreen) {
      apply(native.setWidth, copy, [width]);
      apply(native.setHeight, copy, [height]);
    }
    const ctx = apply(offscreen ? native.offContext : native.context, copy, ['2d', {willReadFrequently: true}]);
    if (!ctx) throw new native.SecurityError('Unable to protect canvas export', 'NotSupportedError');
    apply(offscreen ? native.offDraw : native.draw, ctx, [canvas, 0, 0]);
    const image = apply(offscreen ? native.offGet : native.get, ctx, [0, 0, width, height]);
    transform(apply(imageData, image, []));
    apply(offscreen ? native.offPut : native.put, ctx, [image, 0, 0]);
    return copy;
  };
  const exportVia = offscreen => (target, self, args) => {
    // No catch-and-export-original fallback. Taint, invalid receivers, and
    // allocation failures propagate instead of exposing clean pixels.
    const copy = copyCanvas(self, offscreen);
    return apply(target, copy || self, args);
  };
  wrap(canvasProto, 'toDataURL', exportVia(false));
  wrap(canvasProto, 'toBlob', exportVia(false));
  const readback = (target, self, args) => {
    const image = apply(target, self, args); // native validation/errors first
    transform(apply(imageData, image, []));
    return image;
  };
  wrap(contextProto, 'getImageData', readback);
  wrap(offContextProto, 'getImageData', readback);
  wrap(offscreenProto, 'convertToBlob', (target, self, args) => {
    // convertToBlob is promise-based, including failures.
    try { return exportVia(true)(target, self, args); }
    catch (error) { return Promise.reject(error); }
  });

  // Synchronously patch newly inserted same-origin fallback frames. The
  // separate manifest guard also denies readback in srcdoc/data/blob frames
  // that execute without the parent ever accessing their window.
  const frameProto = HTMLIFrameElement.prototype;
  const getWindow = getDescriptor(frameProto, 'contentWindow')?.get;
  const queryAll = Element.prototype.querySelectorAll;
  const queryFragment = DocumentFragment.prototype.querySelectorAll;
  const patchFrame = frame => {
    try {
      const child = apply(getWindow, frame, []);
      if (!child || child === window) return;
      const protocol = child.location.protocol;
      if (protocol === 'http:' || protocol === 'https:') return; // own registration/exceptions
      const cp = child.HTMLCanvasElement.prototype;
      const rp = child.CanvasRenderingContext2D.prototype;
      // Don't cache WindowProxy: navigation replaces its underlying realm.
      for (const name of ['toDataURL', 'toBlob']) {
        if (cp[name] !== canvasProto[name]) cp[name] = canvasProto[name];
      }
      if (rp.getImageData !== contextProto.getImageData) rp.getImageData = contextProto.getImageData;
      // Child-created nested frames must get the same synchronous interception.
      for (const property of ['contentWindow', 'contentDocument']) {
        define(child.HTMLIFrameElement.prototype, property, getDescriptor(frameProto, property));
      }
      for (const name of ['appendChild', 'insertBefore', 'replaceChild']) {
        child.Node.prototype[name] = Node.prototype[name];
      }
      for (const name of ['append', 'prepend', 'replaceChildren', 'insertAdjacentElement']) {
        child.Element.prototype[name] = Element.prototype[name];
      }
      if (child.OffscreenCanvas && offscreenProto) {
        child.OffscreenCanvas.prototype.convertToBlob = offscreenProto.convertToBlob;
        child.OffscreenCanvasRenderingContext2D.prototype.getImageData = offContextProto.getImageData;
      }
    }
    catch (_) { /* Opaque/cross-origin fallback frames rely on the manifest guard. */ }
  };
  const findFrames = node => {
    if (!node || typeof node !== 'object') return [];
    // Native brand checks also recognise elements from child realms.
    try { apply(getWindow, node, []); return [node]; } catch (_) {}
    try { return apply(queryAll, node, ['iframe']); } catch (_) {}
    try { return apply(queryFragment, node, ['iframe']); } catch (_) {}
    return [];
  };
  const patchTree = node => { for (const frame of findFrames(node)) patchFrame(frame); };
  for (const property of ['contentWindow', 'contentDocument']) {
    const d = getDescriptor(frameProto, property);
    if (!d?.get) continue;
    define(frameProto, property, {...d, get: new NativeProxy(d.get, {
      apply(target, self, args) {
        patchFrame(self);
        return apply(target, self, args);
      }
    })});
  }
  for (const name of ['appendChild', 'insertBefore', 'replaceChild']) {
    wrap(Node.prototype, name, (target, self, args) => {
      const frames = Array.from(findFrames(args[0]));
      const value = apply(target, self, args);
      for (const frame of frames) patchFrame(frame);
      return value;
    });
  }
  for (const name of ['append', 'prepend', 'replaceChildren', 'insertAdjacentElement']) {
    wrap(Element.prototype, name, (target, self, args) => {
      const frames = [];
      for (const node of args) for (const frame of findFrames(node)) frames.push(frame);
      const value = apply(target, self, args);
      for (const frame of frames) patchFrame(frame);
      return value;
    });
  }
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) patchTree(node);
  });
  observer.observe(doc, {childList: true, subtree: true});
}
