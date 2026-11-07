/* Worker support is deliberately limited to Blob URLs created after injection.
 * HTTP(S) workers keep their native loader and response CSP; SharedWorkers keep
 * their native identity. Never silently turn those into Blob/importScripts
 * workers, which would change security policy and resource resolution.
 */
function installWorkerCanvasProtection(config, makeTransform) {
  'use strict';
  const apply = Reflect.apply, descriptor = Object.getOwnPropertyDescriptor;
  const define = Object.defineProperty, NativeProxy = Proxy;
  const transform = makeTransform(config.seed, config.topOrigin);
  const cp = OffscreenCanvas.prototype;
  const rp = OffscreenCanvasRenderingContext2D.prototype;
  const get = rp.getImageData, put = rp.putImageData, draw = rp.drawImage;
  const context = cp.getContext, NativeCanvas = OffscreenCanvas;
  const width = descriptor(cp, 'width').get, height = descriptor(cp, 'height').get;
  const pixels = descriptor(ImageData.prototype, 'data').get;
  const reject = Promise.reject.bind(Promise);
  const wrap = (proto, name, handler) => {
    const d = descriptor(proto, name);
    define(proto, name, {...d, value: new NativeProxy(d.value, {apply: handler})});
  };
  wrap(rp, 'getImageData', (target, self, args) => {
    const image = apply(target, self, args);
    transform(apply(pixels, image, []));
    return image;
  });
  wrap(cp, 'convertToBlob', (target, self, args) => {
    try {
      const w = apply(width, self, []), h = apply(height, self, []);
      if (!w || !h) return apply(target, self, args);
      const copy = new NativeCanvas(w, h);
      const ctx = apply(context, copy, ['2d', {willReadFrequently: true}]);
      apply(draw, ctx, [self, 0, 0]);
      const image = apply(get, ctx, [0, 0, w, h]);
      transform(apply(pixels, image, []));
      apply(put, ctx, [image, 0, 0]);
      return apply(target, copy, args);
    }
    catch (error) { return reject(error); }
  });
}

function installBlobWorkerProtection(config, makeTransform, installWorkerCanvas) {
  'use strict';
  if (typeof Worker !== 'function' || typeof Blob !== 'function') return;
  const NativeWorker = Worker, NativeURL = URL, NativeBlob = Blob;
  const construct = Reflect.construct, apply = Reflect.apply;
  const descriptor = Object.getOwnPropertyDescriptor, define = Object.defineProperty;
  const stringify = JSON.stringify;
  const fnString = Function.prototype.toString;
  const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL;
  const arrayIterator = Array.prototype[Symbol.iterator];
  const random = crypto.getRandomValues.bind(crypto);
  const Bytes = Uint8Array;
  const post = Worker.prototype.postMessage;
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const stop = Event.prototype.stopImmediatePropagation;
  const data = descriptor(MessageEvent.prototype, 'data').get;
  const blobSize = descriptor(Blob.prototype, 'size').get;
  const MapGet = Map.prototype.get, MapSet = Map.prototype.set, MapDelete = Map.prototype.delete;
  const blobs = new Map();
  const SecurityError = DOMException;
  const getBase = typeof document === 'object'
    ? () => apply(descriptor(Node.prototype, 'baseURI').get, document, [])
    : () => location.href;
  const source = {
    transform: apply(fnString, makeTransform, []),
    canvas: apply(fnString, installWorkerCanvas, []),
    workers: apply(fnString, installBlobWorkerProtection, [])
  };
  const createDesc = descriptor(URL, 'createObjectURL');
  define(URL, 'createObjectURL', {...createDesc, value: new Proxy(createURL, {
    apply(target, self, args) {
      const url = apply(target, self, args);
      try { apply(blobSize, args[0], []); apply(MapSet, blobs, [url, args[0]]); }
      catch (_) { /* MediaSource URLs are not JavaScript worker scripts. */ }
      return url;
    }
  })});
  const revokeDesc = descriptor(URL, 'revokeObjectURL');
  define(URL, 'revokeObjectURL', {...revokeDesc, value: new Proxy(revokeURL, {
    apply(target, self, args) {
      apply(MapDelete, blobs, [String(args[0])]);
      return apply(target, self, args);
    }
  })});
  globalThis.Worker = new Proxy(NativeWorker, {
    construct(target, args, newTarget) {
      // Resolve once; original native constructor still validates non-Blob URL
      // origins, CSP and options. No cross-origin importScripts workaround.
      const url = new NativeURL(args[0], getBase());
      if (url.protocol !== 'blob:') return construct(target, [url.href, ...args.slice(1)], newTarget);
      const blob = apply(MapGet, blobs, [url.href]);
      if (!blob || url.origin !== location.origin) {
        throw new SecurityError('Cannot safely protect this external or pre-existing Blob worker. Add a site exception if needed.', 'SecurityError');
      }
      const options = args[1] ?? {};
      const kind = String(options.type ?? 'classic');
      if (!['classic', 'module'].includes(kind)) throw new TypeError('Invalid Worker type');
      const opts = {type: kind, name: String(options.name ?? ''), credentials: String(options.credentials ?? 'same-origin')};
      // Retain an alias so immediate revokeObjectURL(original) keeps working.
      const retainedURL = apply(createURL, NativeURL, [blob]);
      const tag = Array.from(random(new Bytes(16)), b => b.toString(16).padStart(2, '0')).join(''); // routing token, not a seed
      const body = `(()=>{
        const createCanvasTransform=${source.transform};
        const installWorkerCanvasProtection=${source.canvas};
        const installBlobWorkerProtection=${source.workers};
        const add=EventTarget.prototype.addEventListener;
        const remove=EventTarget.prototype.removeEventListener;
        const dispatch=EventTarget.prototype.dispatchEvent;
        const stop=Event.prototype.stopImmediatePropagation;
        const apply=Reflect.apply;
        const Message=MessageEvent;
        const post=postMessage;
        const read=Object.getOwnPropertyDescriptor(MessageEvent.prototype,'data').get;
        const imports=globalThis.importScripts;
        const tag=${stringify(tag)}, original=${stringify(retainedURL)};
        let initialized=false;
        const pending=[];
        const listener=async event=>{
          apply(stop,event,[]);
          if(initialized){ pending.push(event); return; }
          const value=apply(read,event,[]);
          if(value?.tag!==tag)return;
          initialized=true;
          try{
            installWorkerCanvasProtection(value.config,createCanvasTransform);
            installBlobWorkerProtection(value.config,createCanvasTransform,installWorkerCanvasProtection);
            if(${stringify(kind)}==='module')await import(original);
            else apply(imports,globalThis,[original]);
            apply(remove,globalThis,['message',listener]);
            apply(post,globalThis,[{tag,ready:true}]);
            for(const queued of pending){
              apply(dispatch,globalThis,[new Message('message',{
                data:apply(read,queued,[]),ports:queued.ports,origin:queued.origin,
                lastEventId:queued.lastEventId,source:queued.source
              })]);
            }
          }catch(error){
            apply(post,globalThis,[{tag,failed:true}]);
            setTimeout(()=>{throw error});
          }
        };
        apply(add,globalThis,['message',listener]);
      })();`;
      // No seed in fetchable Blob source. Config is the first message sent
      // through a captured native method, before returning the Worker to page.
      const parts = [body];
      // Blob() consumes an iterable: a page-modified Array iterator must not
      // replace the bootstrap and receive the private configuration message.
      define(parts, Symbol.iterator, {value: arrayIterator});
      const bootURL = apply(createURL, NativeURL, [new NativeBlob(parts, {type: 'text/javascript'})]);
      let worker;
      const cleanup = () => {
        apply(revokeURL, NativeURL, [retainedURL]);
        apply(revokeURL, NativeURL, [bootURL]);
      };
      try {
        worker = construct(target, [bootURL, opts], newTarget);
        const ready = event => {
          if (apply(data, event, [])?.tag !== tag) return;
          apply(stop, event, []);
          apply(remove, worker, ['message', ready]);
          cleanup();
        };
        apply(add, worker, ['message', ready]);
        apply(add, worker, ['error', cleanup, {once: true}]);
        const terminate = worker.terminate;
        define(worker, 'terminate', {configurable: true, writable: true, value: new Proxy(terminate, {
          apply(method, self, values) { if (self === worker) cleanup(); return apply(method, self, values); }
        })});
        apply(post, worker, [{tag, config}]);
        return worker;
      }
      catch (error) { cleanup(); throw error; }
    }
  });
}
