'use strict';
// Just enough DOM for a canvas page: a tree built from the page's own markup,
// ids, classes, data-*, events that bubble, simple selectors, canvas elements
// whose getContext('2d') is a recorder. Not a browser: no layout, no CSS cascade.

const { createRecorder } = require('./recorder');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const camel = s => s.replace(/-([a-z])/g, (m, c) => c.toUpperCase());

class TextNode {
  constructor(text, doc) { this.nodeType = 3; this.nodeName = '#text'; this.data = String(text); this.parentNode = null; this.ownerDocument = doc; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
}

function parseAttrs(src) {
  const out = [];
  const re = /([^\s=/>"']+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(src))) out.push([m[1].toLowerCase(), decode(m[3] ?? m[4] ?? m[5] ?? '')]);
  return out;
}

// Tolerant tokenizer: good enough for hand-written pages, not for the open web.
function parseInto(parent, html, doc, scripts) {
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</gi;
  const stack = [parent];
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!')) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].localName === tag) { stack.length = i; break; }
      continue;
    }
    if (m[2]) {
      const tag = m[2].toLowerCase();
      const el = doc.createElement(tag);
      for (const [k, v] of parseAttrs(m[3])) el.setAttribute(k, v);
      top.appendChild(el);
      if (RAW.has(tag)) {
        const end = new RegExp('</' + tag + '\\s*>', 'ig');
        end.lastIndex = re.lastIndex;
        const e = end.exec(html);
        const body = html.slice(re.lastIndex, e ? e.index : html.length);
        re.lastIndex = e ? end.lastIndex : html.length;
        if (tag === 'script') { if (scripts) scripts.push({ el, src: el.getAttribute('src'), text: body }); }
        else el.appendChild(new TextNode(tag === 'style' ? body : decode(body), doc));
        continue;
      }
      if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(el);
      continue;
    }
    if (m[0].trim()) top.appendChild(new TextNode(decode(m[0]), doc));
  }
}

// --- selectors: compound simple selectors joined by descendant (space) or child (>) ---
function parseCompound(s) {
  const parts = { tag: null, id: null, classes: [], attrs: [] };
  const re = /^([a-zA-Z*][\w-]*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*("[^"]*"|'[^']*'|[^\]\s]+))?\s*\]/g;
  let m, used = 0;
  while ((m = re.exec(s))) {
    if (m.index !== used) break;
    used = re.lastIndex;
    if (m[1]) parts.tag = m[1] === '*' ? null : m[1].toLowerCase();
    else if (m[2]) parts.id = m[2];
    else if (m[3]) parts.classes.push(m[3]);
    else parts.attrs.push([m[4].toLowerCase(), m[5], m[6] != null ? m[6].replace(/^["']|["']$/g, '') : null]);
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  if (used !== s.length) throw new Error(`canvas-spy: selector "${s}" is beyond this small DOM`);
  return parts;
}

function matchCompound(el, p) {
  if (p.tag && el.localName !== p.tag) return false;
  if (p.id && el.id !== p.id) return false;
  for (const c of p.classes) if (!el.classList.contains(c)) return false;
  for (const [k, op, v] of p.attrs) {
    if (!el.hasAttribute(k)) return false;
    const a = el.getAttribute(k);
    if (op === '=' && a !== v) return false;
    if (op === '~=' && !a.split(/\s+/).includes(v)) return false;
    if (op === '^=' && !a.startsWith(v)) return false;
    if (op === '$=' && !a.endsWith(v)) return false;
    if (op === '*=' && !a.includes(v)) return false;
    if (op === '|=' && a !== v && !a.startsWith(v + '-')) return false;
  }
  return true;
}

function compile(selector) {
  return selector.split(',').map(part => {
    const toks = part.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/);
    const seq = [];
    let comb = ' ';
    for (const t of toks) { if (t === '>') { comb = '>'; continue; } seq.push({ comb, p: parseCompound(t) }); comb = ' '; }
    return seq;
  });
}

function matches(el, compiled) {
  return compiled.some(seq => {
    const test = (node, i) => {
      if (!matchCompound(node, seq[i].p)) return false;
      if (i === 0) return true;
      let up = node.parentNode;
      if (seq[i].comb === '>') return !!up && up.nodeType === 1 && test(up, i - 1);
      for (; up && up.nodeType === 1; up = up.parentNode) if (test(up, i - 1)) return true;
      return false;
    };
    return test(el, seq.length - 1);
  });
}

class Element {
  constructor(tag, doc) {
    this.nodeType = 1;
    this.localName = tag.toLowerCase();
    this.tagName = this.nodeName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.parentNode = null;
    this.childNodes = [];
    this._attrs = new Map();
    this._listeners = {};
    this._value = null;
    this.checked = false;
    this.style = new Proxy({ setProperty(k, v) { this[k] = String(v); }, getPropertyValue(k) { return this[k] ?? ''; }, removeProperty(k) { delete this[k]; } }, {});
    const self = this;
    this.dataset = new Proxy({}, {
      get: (t, k) => typeof k === 'string' ? self.getAttribute('data-' + kebab(k)) ?? undefined : undefined,
      set: (t, k, v) => { self.setAttribute('data-' + kebab(k), v); return true; },
      deleteProperty: (t, k) => { self.removeAttribute('data-' + kebab(k)); return true; },
      ownKeys: () => [...self._attrs.keys()].filter(a => a.startsWith('data-')).map(a => camel(a.slice(5))),
      getOwnPropertyDescriptor: (t, k) => ({ enumerable: true, configurable: true, value: self.getAttribute('data-' + kebab(k)) }),
    });
    this.classList = {
      _get: () => (self.getAttribute('class') || '').split(/\s+/).filter(Boolean),
      _set: list => self.setAttribute('class', list.join(' ')),
      contains(c) { return this._get().includes(c); },
      add(...cs) { const l = this._get(); for (const c of cs) if (!l.includes(c)) l.push(c); this._set(l); },
      remove(...cs) { this._set(this._get().filter(c => !cs.includes(c))); },
      toggle(c, force) { const has = this.contains(c); const want = force === undefined ? !has : !!force; if (want) this.add(c); else this.remove(c); return want; },
      get length() { return this._get().length; },
      [Symbol.iterator]() { return this._get()[Symbol.iterator](); },
    };
  }

  // attributes
  getAttribute(k) { k = String(k).toLowerCase(); return this._attrs.has(k) ? this._attrs.get(k) : null; }
  setAttribute(k, v) { this._attrs.set(String(k).toLowerCase(), String(v)); }
  removeAttribute(k) { this._attrs.delete(String(k).toLowerCase()); }
  hasAttribute(k) { return this._attrs.has(String(k).toLowerCase()); }
  get attributes() { return [...this._attrs].map(([name, value]) => ({ name, value })); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get value() { return this._value ?? this.getAttribute('value') ?? (this.localName === 'input' && this.getAttribute('type') === 'range' ? String(((+this.getAttribute('min') || 0) + (+(this.getAttribute('max') ?? 100))) / 2) : ''); }
  set value(v) { this._value = String(v); }
  get valueAsNumber() { return +this.value; }
  get type() { return this.getAttribute('type') || (this.localName === 'button' ? 'submit' : this.localName === 'input' ? 'text' : ''); }
  set type(v) { this.setAttribute('type', v); }
  get min() { return this.getAttribute('min') || ''; }
  set min(v) { this.setAttribute('min', v); }
  get max() { return this.getAttribute('max') || ''; }
  set max(v) { this.setAttribute('max', v); }
  get step() { return this.getAttribute('step') || ''; }
  set step(v) { this.setAttribute('step', v); }
  get title() { return this.getAttribute('title') || ''; }
  set title(v) { this.setAttribute('title', v); }
  get href() { return this.getAttribute('href') || ''; }
  set href(v) { this.setAttribute('href', v); }
  get name() { return this.getAttribute('name') || ''; }
  set name(v) { this.setAttribute('name', v); }

  // canvas size attributes
  get width() { return this.localName === 'canvas' ? +(this.getAttribute('width') ?? 300) : 0; }
  set width(v) { this.setAttribute('width', Math.floor(v)); }
  get height() { return this.localName === 'canvas' ? +(this.getAttribute('height') ?? 150) : 0; }
  set height(v) { this.setAttribute('height', Math.floor(v)); }
  getContext(kind) {
    if (this.localName !== 'canvas' || kind !== '2d') return null;
    if (!this._recorder) this._recorder = createRecorder({ canvas: this, strictFinite: this.ownerDocument._strictFinite });
    return this._recorder.ctx;
  }
  toDataURL() { return 'data:,'; }

  // tree
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get childElementCount() { return this.children.length; }
  get nextSibling() { const s = this.parentNode && this.parentNode.childNodes; return s ? s[s.indexOf(this) + 1] || null : null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument; }
  appendChild(n) {
    if (n.nodeType === 11) { for (const c of n.childNodes.slice()) this.appendChild(c); return n; }
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this; this.childNodes.push(n); return n;
  }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new TextNode(n, this.ownerDocument) : n); }
  prepend(...ns) { const keep = this.childNodes.slice(); this.childNodes = []; this.append(...ns); for (const k of keep) this.childNodes.push(k); }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n); return n;
  }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; }
  replaceChildren(...ns) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...ns); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  cloneNode(deep) {
    const c = this.ownerDocument.createElement(this.localName);
    for (const [k, v] of this._attrs) c.setAttribute(k, v);
    if (deep) for (const n of this.childNodes) c.appendChild(n.nodeType === 1 ? n.cloneNode(true) : new TextNode(n.data, this.ownerDocument));
    return c;
  }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); if (v !== '' && v != null) this.appendChild(new TextNode(v, this.ownerDocument)); }
  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }
  get innerHTML() { return this.textContent; }
  set innerHTML(v) { this.replaceChildren(); parseInto(this, String(v), this.ownerDocument, null); }

  // selectors
  matches(sel) { return matches(this, compile(sel)); }
  closest(sel) { const c = compile(sel); for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matches(n, c)) return n; return null; }
  querySelectorAll(sel) { const c = compile(sel), out = []; walk(this, n => { if (n !== this && matches(n, c)) out.push(n); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getElementsByTagName(t) { return this.querySelectorAll(t); }
  getElementsByClassName(c) { return this.querySelectorAll('.' + c.trim().split(/\s+/).join('.')); }

  // layout (fake)
  getBoundingClientRect() {
    const r = this.ownerDocument._rectOf(this);
    return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height };
  }
  get clientWidth() { return this.getBoundingClientRect().width; }
  get clientHeight() { return this.getBoundingClientRect().height; }
  get offsetWidth() { return this.getBoundingClientRect().width; }
  get offsetHeight() { return this.getBoundingClientRect().height; }

  // events
  addEventListener(type, fn, opts) { if (fn) (this._listeners[type] ||= []).push({ fn, once: !!(opts && opts.once) }); }
  removeEventListener(type, fn) { const l = this._listeners[type]; if (l) this._listeners[type] = l.filter(x => x.fn !== fn); }
  dispatchEvent(ev) { return dispatch(this, ev); }
  click() { this.dispatchEvent(makeEvent('click', {})); }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  setPointerCapture(id) { this.ownerDocument._captures.set(id, this); }
  releasePointerCapture(id) { if (this.ownerDocument._captures.get(id) === this) this.ownerDocument._captures.delete(id); }
  hasPointerCapture(id) { return this.ownerDocument._captures.get(id) === this; }
  scrollIntoView() {}
}

function walk(node, fn) { for (const c of node.childNodes) if (c.nodeType === 1) { fn(c); walk(c, fn); } }

function makeEvent(type, init) {
  const ev = {
    type, bubbles: init.bubbles !== false, cancelable: true, defaultPrevented: false,
    timeStamp: init.timeStamp ?? 0, isTrusted: false, _stop: false, _stopNow: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this._stop = true; },
    stopImmediatePropagation() { this._stop = this._stopNow = true; },
    composedPath() { return this._path || []; },
  };
  for (const k of Object.keys(init)) if (!(k in ev) || k === 'bubbles') ev[k] = init[k];
  return ev;
}

function dispatch(target, ev) {
  ev.target = target;
  const path = [];
  for (let n = target; n; n = n.parentNode) path.push(n);
  const doc = target.ownerDocument || target;
  if (doc && doc._window && path[path.length - 1] === doc) path.push(doc._window);
  ev._path = path;
  for (const node of ev.bubbles ? path : [target]) {
    ev.currentTarget = node;
    const prop = node['on' + ev.type];
    const list = (node._listeners && node._listeners[ev.type] || []).slice();
    for (const l of list) {
      if (l.once) node.removeEventListener(ev.type, l.fn);
      l.fn.call(node, ev);
      if (ev._stopNow) break;
    }
    if (typeof prop === 'function' && !ev._stopNow) prop.call(node, ev);
    if (ev._stop) break;
  }
  return !ev.defaultPrevented;
}

class Document extends Element {
  constructor(options = {}) {
    super('#document', null);
    this.nodeType = 9;
    this.ownerDocument = null;
    this._strictFinite = options.strictFinite !== false;
    this._rects = options.rects || {};
    this._viewport = options.viewport || { width: 1600, height: 1000 };
    this._captures = new Map();
    this._fontWaiters = [];
    this.visibilityState = 'visible';
    this.hidden = false;
    const self = this;
    this.fonts = {
      ready: { then(fn) { self._fontWaiters.push(fn); return this; }, catch() { return this; } },
      check: () => true, load: () => ({ then(fn) { fn([]); } }),
      addEventListener() {},
    };
  }
  createElement(tag) { return new Element(tag, this); }
  createElementNS(ns, tag) { return new Element(tag, this); }
  createTextNode(t) { return new TextNode(t, this); }
  createDocumentFragment() { const f = new Element('#fragment', this); f.nodeType = 11; return f; }
  getElementById(id) { let found = null; walk(this, n => { if (!found && n.id === id) found = n; }); return found; }
  get documentElement() { return this.children[0] || null; }
  get head() { return this.querySelector('head'); }
  get body() { return this.querySelector('body'); }
  get title() { const t = this.querySelector('title'); return t ? t.textContent : ''; }
  set title(v) { let t = this.querySelector('title'); if (!t) { t = this.createElement('title'); this.head.appendChild(t); } t.textContent = v; }
  // Size of an element, in CSS px. Canvases and anything unknown get the viewport;
  // pass `rects: { id: {left, top, width, height} }` to loadPage to say otherwise.
  _rectOf(el) {
    const r = (el.id && this._rects[el.id]) || null;
    if (r) return { left: r.left || 0, top: r.top || 0, width: r.width, height: r.height };
    return { left: 0, top: 0, width: this._viewport.width, height: this._viewport.height };
  }
}
// Document's tag-ish getters must not resolve through Element's attribute reflection.
Object.defineProperty(Document.prototype, 'hidden', { value: false, writable: true });

function parseDocument(html, options = {}) {
  const doc = new Document(options);
  const scripts = [];
  const body = /<html[\s>]/i.test(html) ? html : `<html><head></head><body>${html}</body></html>`;
  parseInto(doc, body, doc, scripts);
  if (!doc.querySelector('head')) doc.documentElement.insertBefore(doc.createElement('head'), doc.documentElement.firstChild);
  if (!doc.querySelector('body')) doc.documentElement.appendChild(doc.createElement('body'));
  doc.activeElement = doc.body;
  return { doc, scripts };
}

module.exports = { parseDocument, makeEvent, dispatch, Element, TextNode, compile, matches };
