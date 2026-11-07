const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'data/inject/blob-workers.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'data/inject/main.js'), 'utf8');
const mock = `
const buffers = new WeakMap(), widths = new WeakMap(), heights = new WeakMap(), images = new WeakMap();
class ImageData {
  constructor(data, width, height) { images.set(this, data); this.width=width;this.height=height; }
  get data() { if (!images.has(this)) throw TypeError('Illegal invocation'); return images.get(this); }
}
class Node { get nodeType(){return 1} hasChildNodes(){return false} get baseURI(){return ORIGIN+'/'} appendChild(node) { return node; } insertBefore(node) { return node; } replaceChild(node) { return node; } }
class Element extends Node { get localName(){return 'div'} querySelectorAll() { return []; } append() {} prepend() {} replaceChildren() {} insertAdjacentElement() {} }
class HTMLCanvasElement extends Element {
  constructor(w=100,h=88) { super();widths.set(this,w); heights.set(this,h);buffers.set(this,new Uint8ClampedArray(w*h*4)); }
  get width() { if (!widths.has(this)) throw TypeError('Illegal invocation'); return widths.get(this); }
  set width(v) { widths.set(this,v); buffers.set(this,new Uint8ClampedArray(v*heights.get(this)*4)); }
  get height() { if (!heights.has(this)) throw TypeError('Illegal invocation'); return heights.get(this); }
  set height(v) { heights.set(this,v); buffers.set(this,new Uint8ClampedArray(v*widths.get(this)*4)); }
  getContext() { return new CanvasRenderingContext2D(this); }
  toDataURL() { if (!buffers.has(this)) throw TypeError('Illegal invocation'); if(this.tainted)throw new DOMException('tainted','SecurityError');return Array.from(buffers.get(this)).join(','); }
  toBlob(callback) { callback(this.toDataURL()); }
}
class CanvasRenderingContext2D {
  constructor(canvas) { this.canvas=canvas; }
  getImageData(x,y,w,h) {
    if(!this.canvas)throw TypeError('Illegal invocation');
    if(this.canvas.tainted)throw new DOMException('tainted','SecurityError');
    if(!w||!h)throw new DOMException('empty','IndexSizeError');
    const out=new Uint8ClampedArray(w*h*4), raw=buffers.get(this.canvas), cw=widths.get(this.canvas),ch=heights.get(this.canvas);
    for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(xx+x>=0&&xx+x<cw&&yy+y>=0&&yy+y<ch)out.set(raw.subarray(((yy+y)*cw+xx+x)*4,((yy+y)*cw+xx+x)*4+4),(yy*w+xx)*4);
    return new ImageData(out,w,h);
  }
  putImageData(image,x=0,y=0) {
    const raw=buffers.get(this.canvas),cw=widths.get(this.canvas),data=images.get(image);
    for(let yy=0;yy<image.height;yy++)for(let xx=0;xx<image.width;xx++)raw.set(data.subarray((yy*image.width+xx)*4,(yy*image.width+xx)*4+4),((yy+y)*cw+xx+x)*4);
  }
  drawImage(canvas) { if(canvas.tainted)this.canvas.tainted=true;buffers.get(this.canvas).set(buffers.get(canvas)); }
}
class OffscreenCanvas extends HTMLCanvasElement {
  get width(){return super.width} set width(v){super.width=v}
  get height(){return super.height} set height(v){super.height=v}
  getContext(){return new OffscreenCanvasRenderingContext2D(this)}
  convertToBlob(){return Promise.resolve(Array.from(buffers.get(this)).join(','))}
}
class OffscreenCanvasRenderingContext2D extends CanvasRenderingContext2D {
  getImageData(...args){return super.getImageData(...args)}
  putImageData(...args){return super.putImageData(...args)}
  drawImage(...args){return super.drawImage(...args)}
}
class DocumentFragment extends Element { get nodeType(){return 11} querySelectorAll(){return [];} }
class Document { createElement(tag) { return tag==='canvas'?new HTMLCanvasElement():new Element(); } }
class HTMLIFrameElement extends Element { get localName(){return 'iframe'} get contentWindow(){if(!(this instanceof HTMLIFrameElement))throw TypeError('Illegal invocation');return this.child} get contentDocument(){return this.child?.document} }
class MutationObserver { observe() {} }
Object.assign(globalThis,{OffscreenCanvas,OffscreenCanvasRenderingContext2D});
const document = new Document();
const location = {origin: ORIGIN, protocol:'https:', ancestorOrigins:ANCESTORS};
const window = globalThis, top=globalThis;
function makeCanvas() {
 const canvas=new HTMLCanvasElement(),raw=buffers.get(canvas);
 for(let i=0;i<raw.length;i++)raw[i]=i%4===3?255:(i*37+(i>>>4)*13)%256;
 return canvas;
}
function raw(canvas){return Array.from(buffers.get(canvas));}
`;
function harness({seed='0123456789abcdeffedcba9876543210', origin='https://one.test', ancestors=[], protected=true}={}) {
  const context=vm.createContext({DOMException, ORIGIN:origin, ANCESTORS:ancestors});
  vm.runInContext(mock,context);
  if(protected)vm.runInContext(`(()=>{${source};installCanvasProtection(${JSON.stringify({seed})})})();`,context);
  return {context, run:code=>vm.runInContext(code,context,{timeout:3000})};
}
module.exports={harness,root,source};
