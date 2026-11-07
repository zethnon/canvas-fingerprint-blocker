/* Bundled by worker.js inside one closure. Never publish the seed on window. */
function createCanvasTransform(seed, topOrigin) {
  'use strict';
  const apply = Reflect.apply;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const imul = Math.imul;
  const typedArrayTag = getDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
  const dataLength = getDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'length').get;
  const {max, min, round} = Math;
  const mapGet = Map.prototype.get;
  const mapSet = Map.prototype.set;
  const mapForEach = Map.prototype.forEach;
  const Table = Uint32Array;
  let cache = new Map();
  let table = null;
  let cacheSize = 0;
  const keys = seed.match(/.{8}/g).map(s => parseInt(s, 16) >>> 0);
  for (let i = 0; i < topOrigin.length; i++) {
    keys[i & 3] = imul(keys[i & 3] ^ topOrigin.charCodeAt(i), 16777619) >>> 0;
  }

  // Site-dependent quantisation boundaries prevent simply dropping two low
  // bits from removing all site variation. Each shifted four-value bucket
  // projects to one keyed representative: crops agree and read/write loops
  // are idempotent. Coarse colour information remains; this is not anonymity.
  const offsets = [keys[0] & 3, keys[1] & 3, keys[2] & 3];
  const representative = (bucket, offset, bits) => {
    const low = max(0, bucket * 4 - offset);
    const high = min(255, bucket * 4 + 3 - offset);
    return low + bits % (high - low + 1);
  };
  // Keyed XTEA permutation over the three shifted RGB bucket indices.
  const bucketColor = (rb, gb, bb) => {
    // Small canvases retain a small Map. High-colour images promote once to
    // a dense, bounded 65^3 table (~1.05 MiB), avoiding the old clear/recompute
    // cycle. RGB+1 makes zero an empty entry even for black output.
    const bucket = rb | (gb << 7) | (bb << 14);
    const index = rb + gb * 65 + bb * 4225;
    const cached = table ? table[index] : apply(mapGet, cache, [bucket]);
    if (cached) return cached - 1;
    let a = bucket >>> 0, b = 0x46505331, sum = 0;
    for (let round = 0; round < 32; round++) {
      a = (a + ((((b << 4) ^ (b >>> 5)) + b) ^ (sum + keys[sum & 3]))) >>> 0;
      sum = (sum + 0x9e3779b9) >>> 0;
      b = (b + ((((a << 4) ^ (a >>> 5)) + a) ^ (sum + keys[(sum >>> 11) & 3]))) >>> 0;
    }
    const bits = (a ^ b) & 63;
    const color = representative(rb, offsets[0], bits & 3)
      | (representative(gb, offsets[1], (bits >>> 2) & 3) << 8)
      | (representative(bb, offsets[2], (bits >>> 4) & 3) << 16);
    const stored = color + 1;
    if (!table && cacheSize >= 4096) {
      table = new Table(65 * 65 * 65);
      apply(mapForEach, cache, [(value, key) => {
        table[(key & 127) + ((key >>> 7) & 127) * 65 + (key >>> 14) * 4225] = value;
      }]);
      cache = null;
    }
    if (table) table[index] = stored;
    else { apply(mapSet, cache, [bucket, stored]); cacheSize++; }
    return color;
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
      // Uint8ClampedArray already guarantees byte-range integers. Keep
      // clamping/rounding for float16; avoid it on the common byte path.
      const r = u8 ? data[i] : max(0, min(255, round(data[i] * scale)));
      const g = u8 ? data[i + 1] : max(0, min(255, round(data[i + 1] * scale)));
      const b = u8 ? data[i + 2] : max(0, min(255, round(data[i + 2] * scale)));
      const color = bucketColor((r + offsets[0]) >>> 2, (g + offsets[1]) >>> 2, (b + offsets[2]) >>> 2);
      data[i] = (color & 255) / scale;
      data[i + 1] = ((color >>> 8) & 255) / scale;
      data[i + 2] = (color >>> 16) / scale;
    }
    return data;
  };

  return transform;
}

function installCanvasProtection(config) {
  'use strict';
  const apply = Reflect.apply;
  const getDescriptor = Object.getOwnPropertyDescriptor;
  const define = Object.defineProperty;
  const NativeProxy = Proxy;
  const imageData = getDescriptor(ImageData.prototype, 'data').get;
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
  const transform = createCanvasTransform(config.seed, topOrigin);
  installBlobWorkerProtection({seed: config.seed, topOrigin}, createCanvasTransform, installWorkerCanvasProtection);
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
  const getNodeType = getDescriptor(Node.prototype, 'nodeType').get;
  const getLocalName = getDescriptor(Element.prototype, 'localName').get;
  const hasChildren = Node.prototype.hasChildNodes;
  const blockedWorkers = new WeakSet();
  const patchFrame = frame => {
    try {
      const child = apply(getWindow, frame, []);
      if (!child || child === window) return;
      const protocol = child.location.protocol;
      if (protocol === 'http:' || protocol === 'https:') return; // own registration/exceptions
      // Do not borrow the parent's Worker constructor: its creator realm/CSP
      // may differ from the child's. Fallback frames deny new workers instead.
      for (const name of ['Worker', 'SharedWorker']) {
        const constructor = child[name];
        if (typeof constructor !== 'function' || blockedWorkers.has(constructor)) continue;
        const guarded = new NativeProxy(constructor, {
          construct() { throw new native.SecurityError('Worker construction is blocked in this fallback frame', 'SecurityError'); }
        });
        blockedWorkers.add(guarded);
        child[name] = guarded;
      }
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
    // Captured native getters work across realms. Ordinary leaf nodes avoid
    // exceptions and selector scans on every append (the old DOM hot path).
    try {
      const type = apply(getNodeType, node, []);
      if (type === 1) {
        if (apply(getLocalName, node, []) === 'iframe') return [node];
        return apply(hasChildren, node, []) ? apply(queryAll, node, ['iframe']) : [];
      }
      if (type === 11) return apply(hasChildren, node, []) ? apply(queryFragment, node, ['iframe']) : [];
    }
    catch (_) { /* Non-Node objects are rejected by the native insertion call. */ }
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
