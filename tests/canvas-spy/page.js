'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseDocument, makeEvent, dispatch } = require('./dom');
const { createClock } = require('./clock');
const { Path2D } = require('./recorder');

// Exit codes the mutation runner understands. Used only when the runner set
// CANVAS_SPY_MUTANT, so a test's own try/catch cannot swallow them.
const EXIT_NO_SUCH_MUTANT = 3;
const EXIT_BAD_ANCHOR = 4;

class AnchorError extends Error {}

// One `find` must occur exactly once; a mutation or hook that silently does
// nothing would make a passing test look like it caught something.
function replaceOnce(sources, find, replace, what) {
  let hits = 0, at = -1;
  sources.forEach((s, i) => { const n = s.split(find).length - 1; hits += n; if (n) at = i; });
  if (hits !== 1) throw new AnchorError(`canvas-spy: ${what} anchor found ${hits} times (need exactly 1): ${JSON.stringify(find).slice(0, 120)}`);
  sources[at] = sources[at].replace(find, () => replace);
}

// --- CSS custom properties from the page's own <style>, light scheme by default ---
function blocks(css) {
  // yields [prelude, body] for top-level blocks
  const out = []; let depth = 0, start = 0, pre = '';
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') { if (depth === 0) { pre = css.slice(start, i).trim(); start = i + 1; } depth++; }
    else if (css[i] === '}') { depth--; if (depth === 0) { out.push([pre, css.slice(start, i)]); start = i + 1; } }
  }
  return out;
}
function rootVars(css, scheme) {
  const vars = {};
  const take = body => { for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);?/g)) vars[m[1]] = m[2].trim(); };
  const visit = (css, active) => {
    for (const [pre, body] of blocks(css.replace(/\/\*[\s\S]*?\*\//g, ''))) {
      if (pre.startsWith('@media')) {
        const q = pre.toLowerCase();
        const dark = /prefers-color-scheme\s*:\s*dark/.test(q), light = /prefers-color-scheme\s*:\s*light/.test(q);
        if ((dark && scheme === 'dark') || (light && scheme === 'light') || (!dark && !light)) visit(body, active);
      } else if (active && /(^|,)\s*:root\b(?!\[data-theme="(light|dark)"\])/.test(pre) || pre === `:root[data-theme="${scheme}"]`) take(body);
    }
  };
  visit(css, true);
  return vars;
}

function createStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

/**
 * Load an HTML page and run its scripts against a fake browser.
 *
 * @param {string} source  path to an .html file, or the HTML itself
 * @param {object} [o]
 * @param {boolean} [o.reducedMotion=false]  answer to prefers-reduced-motion
 * @param {'light'|'dark'} [o.colorScheme='light']
 * @param {{width:number,height:number}} [o.viewport]  CSS px; canvases get this size unless o.rects says otherwise
 * @param {object} [o.rects]  { elementId: {left, top, width, height} }
 * @param {number} [o.devicePixelRatio=1]
 * @param {object} [o.expose]  { 'anchor text in the page script': 'expression' }  -> page.exposed
 * @param {Array<[string,string]>} [o.mutations]  [find, replace] pairs; one is applied when o.mutant is set
 * @param {number|string} [o.mutant]  defaults to process.env.CANVAS_SPY_MUTANT
 * @param {object} [o.scripts]  { 'src as written in the page': 'code' } for scripts not on disk
 * @param {object} [o.styles]  { 'href as written in the page': 'css' } for stylesheets not on disk
 * @param {boolean} [o.warnCss=true]  warn when the page reads a CSS variable nobody defines
 * @param {boolean} [o.strictFinite=true]  throw when the page passes NaN/Infinity to the canvas
 * @param {object} [o.clock]  options for the fake clock ({ start })
 * @param {object} [o.globals]  extra globals for the page
 */
function loadPage(source, o = {}) {
  const isFile = !/[<\n]/.test(source) && fs.existsSync(source);
  const html = isFile ? fs.readFileSync(source, 'utf8') : source;
  const base = isFile ? path.dirname(path.resolve(source)) : process.cwd();

  const viewport = o.viewport || { width: 1600, height: 1000 };
  const { doc, scripts } = parseDocument(html, { viewport, rects: o.rects, strictFinite: o.strictFinite });
  const clock = createClock(o.clock);
  const scheme = o.colorScheme || 'light';
  // CSS for custom properties: inline <style> plus local <link rel=stylesheet>, in document order.
  // Remote stylesheets (fonts and the like) are skipped.
  const css = doc.querySelectorAll('style, link').map(n => {
    if (n.localName === 'style') return n.textContent;
    if (!/\bstylesheet\b/i.test(n.getAttribute('rel') || '')) return '';
    const href = n.getAttribute('href') || '';
    if (o.styles && href in o.styles) return o.styles[href];
    if (!href || /^[a-z]+:|^\/\//i.test(href)) return '';
    const file = path.resolve(base, href.split(/[?#]/)[0]);
    if (!fs.existsSync(file)) throw new Error(`canvas-spy: page links stylesheet ${href}, not found at ${file}`);
    return fs.readFileSync(file, 'utf8');
  }).join('\n');
  const vars = rootVars(css, scheme);

  // --- script sources, in document order ---
  const srcs = scripts.map(s => {
    if (!s.src) return { name: 'inline', code: s.text, own: true };
    if (o.scripts && s.src in o.scripts) return { name: s.src, code: o.scripts[s.src], own: false };
    if (/^[a-z]+:/i.test(s.src)) throw new Error(`canvas-spy: page loads ${s.src}; pass its code as options.scripts[${JSON.stringify(s.src)}]`);
    const file = path.resolve(base, s.src);
    if (!fs.existsSync(file)) throw new Error(`canvas-spy: page loads ${s.src}, not found at ${file}`);
    return { name: s.src, code: fs.readFileSync(file, 'utf8'), own: false };
  });
  const own = srcs.filter(s => s.own);
  const ownCode = own.map(s => s.code);

  // hooks first, on the page as written
  const exposed = {};
  for (const [anchor, expr] of Object.entries(o.expose || {})) {
    replaceOnce(ownCode, anchor, `${anchor}\n;__canvasSpyExpose(${expr});\n`, 'expose');
  }

  // then at most one mutation
  const underRunner = process.env.CANVAS_SPY_MUTANT !== undefined && o.mutant === undefined;
  const mutant = o.mutant ?? process.env.CANVAS_SPY_MUTANT;
  if (mutant !== undefined && mutant !== '' && mutant !== null) {
    const list = o.mutations || [];
    const k = +mutant;
    if (!(k >= 1 && k <= list.length)) {
      if (underRunner) { console.error(`canvas-spy: no mutant ${mutant} (this test has ${list.length})`); process.exit(EXIT_NO_SUCH_MUTANT); }
      throw new Error(`canvas-spy: no mutant ${mutant} (this test has ${list.length})`);
    }
    const [find, replace] = list[k - 1];
    try { replaceOnce(ownCode, find, replace, `mutant ${k}`); }
    catch (e) {
      if (underRunner && e instanceof AnchorError) { console.error(e.message); process.exit(EXIT_BAD_ANCHOR); }
      throw e;
    }
  }
  own.forEach((s, i) => { s.code = ownCode[i]; });

  // --- the window ---
  const listeners = {};
  const cssMisses = new Set();
  const media = q => {
    if (o.media) { const r = o.media(q); if (r !== undefined) return !!r; }
    if (/prefers-reduced-motion\s*:\s*reduce/.test(q)) return !!o.reducedMotion;
    if (/prefers-reduced-motion\s*:\s*no-preference/.test(q)) return !o.reducedMotion;
    if (/prefers-color-scheme\s*:\s*dark/.test(q)) return scheme === 'dark';
    if (/prefers-color-scheme\s*:\s*light/.test(q)) return scheme === 'light';
    return false;
  };
  const win = {
    _listeners: listeners,
    addEventListener(type, fn, opts) { if (fn) (listeners[type] ||= []).push({ fn, once: !!(opts && opts.once) }); },
    removeEventListener(type, fn) { if (listeners[type]) listeners[type] = listeners[type].filter(l => l.fn !== fn); },
    dispatchEvent(ev) { return dispatch(win, ev); },
    matchMedia: q => ({ matches: media(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    getComputedStyle: el => {
      const own = {};
      for (const [k, v] of Object.entries((el && el.style) || {})) if (typeof v !== 'function') own[k] = v;
      return { ...own, getPropertyValue: n => {
        if (own[n] !== undefined) return own[n];
        if (vars[n] !== undefined) return vars[n];
        // An unknown custom property is '' in a browser too, but in a test it usually means the
        // stylesheet wasn't found, and every colour silently becomes the same empty string.
        if (String(n).startsWith('--') && !cssMisses.has(n)) {
          cssMisses.add(n);
          if (o.warnCss !== false) console.warn(`canvas-spy: page read CSS variable ${n}, which no stylesheet defines (it gets '')`);
        }
        return '';
      } };
    },
    devicePixelRatio: o.devicePixelRatio ?? 1,
    innerWidth: viewport.width, innerHeight: viewport.height,
    performance: clock.performance,
    requestAnimationFrame: clock.requestAnimationFrame, cancelAnimationFrame: clock.cancelAnimationFrame,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    queueMicrotask,
    localStorage: createStorage(), sessionStorage: createStorage(),
    location: { href: isFile ? 'file://' + path.resolve(source) : 'about:blank', search: '', hash: '', pathname: isFile ? path.resolve(source) : '/' },
    navigator: { userAgent: 'canvas-spy', language: 'en', languages: ['en'], maxTouchPoints: 0 },
    history: { pushState() {}, replaceState() {} },
    Path2D,
    Image: class { constructor(w, h) { this.width = w || 0; this.height = h || 0; this.complete = false; } },
    ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    Event: class { constructor(type, init = {}) { return makeEvent(type, init); } },
    CustomEvent: class { constructor(type, init = {}) { return makeEvent(type, { detail: init.detail, ...init }); } },
    console,
    Date: (() => { const D = class extends Date { constructor(...a) { if (a.length) super(...a); else super(clock.dateNow()); } }; D.now = clock.dateNow; return D; })(),
    __canvasSpyExpose: v => Object.defineProperties(exposed, Object.getOwnPropertyDescriptors(v)),
    ...(o.globals || {}),
  };
  win.window = win.self = win.globalThis = win;
  win.document = doc;
  doc._window = win;
  doc.defaultView = win;
  const context = vm.createContext(win);

  for (const s of srcs) vm.runInContext(s.code, context, { filename: s.name });

  // the page is "loaded": fonts ready, DOMContentLoaded, load
  const waiters = doc._fontWaiters.splice(0);
  for (const fn of waiters) fn();
  dispatch(doc, makeEvent('DOMContentLoaded', { bubbles: false }));
  dispatch(win, makeEvent('load', { bubbles: false }));

  return makePage({ win, doc, clock, exposed, vars, cssMisses });
}

const FORM_CONTROL = /^(button|input|select|textarea)$/;
// disabled itself, or sitting inside a disabled <fieldset>
function isDisabled(el) {
  if (!el || !FORM_CONTROL.test(el.localName || '')) return false;
  for (let n = el; n && n.localName; n = n.parentNode) {
    if ((n === el || n.localName === 'fieldset') && n.disabled) return true;
  }
  return false;
}

function makePage({ win, doc, clock, exposed, vars, cssMisses }) {
  const resolve = t => {
    if (typeof t !== 'string') return t;
    const el = t.startsWith('#') || /[.\s[>]/.test(t) ? doc.querySelector(t) : doc.getElementById(t);
    if (!el) throw new Error(`canvas-spy: no element ${JSON.stringify(t)} on the page`);
    return el;
  };
  const firstCanvas = () => {
    const c = doc.querySelector('canvas');
    if (!c) throw new Error('canvas-spy: the page has no <canvas>');
    return c;
  };
  const recorderOf = c => {
    const el = c ? resolve(c) : firstCanvas();
    if (!el._recorder) el.getContext('2d');
    return el._recorder;
  };
  const pointerInit = (el, x, y, extra) => {
    const r = el.getBoundingClientRect();
    return { clientX: r.left + x, clientY: r.top + y, offsetX: x, offsetY: y, pageX: r.left + x, pageY: r.top + y,
      button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...extra };
  };

  const page = {
    window: win, document: doc, clock, exposed, cssVars: vars, cssMisses,

    el: resolve,
    text: t => resolve(t).textContent,
    $$: sel => doc.querySelectorAll(sel),

    /** The recorder behind a canvas (default: the first <canvas>). */
    canvas: c => recorderOf(c),

    /**
     * Advance time by `ms` (default one 60 Hz frame), run due timers and the
     * animation frames that were waiting, and return the paint ops drawn meanwhile.
     */
    frame(ms, c) {
      const rec = recorderOf(c);
      return rec.capture(() => clock.tick(ms ?? 1000 / 60));
    },

    /** Paint ops drawn while fn runs. */
    capture(fn, c) { return recorderOf(c).capture(fn); },

    /** Run frames for `ms` of page time; returns the ops of the last frame. */
    run(ms, step = 1000 / 60, c) {
      let last = [];
      const end = clock.now + ms;
      while (clock.now < end - 1e-9) last = page.frame(Math.min(step, end - clock.now), c);
      return last;
    },

    fire(target, type, init = {}) {
      const el = target === 'window' ? win : target === 'document' ? doc : resolve(target);
      return dispatch(el, makeEvent(type, init));
    },
    click(target, x = 0, y = 0, extra) {
      const el = resolve(target);
      // A browser fires no click on a disabled form control, so a page that only disables its
      // button (no guard in the handler) is right; dispatching anyway would fail it falsely.
      if (isDisabled(el)) return false;
      return dispatch(el, makeEvent('click', pointerInit(el, x, y, extra)));
    },
    /** Pointer event at (x, y) in the element's CSS px. */
    pointer(target, type, x, y, extra) {
      const el = resolve(target);
      const init = pointerInit(el, x, y, extra);
      const captured = doc._captures.get(init.pointerId);
      return dispatch(captured && type !== 'pointerdown' ? captured : el, makeEvent(type, init));
    },
    /** pointerdown, a few pointermoves, pointerup. */
    drag(target, from, to, steps = 5) {
      page.pointer(target, 'pointerdown', from[0], from[1]);
      for (let i = 1; i <= steps; i++) page.pointer(target, 'pointermove', from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
      page.pointer(target, 'pointerup', to[0], to[1]);
    },
    input(target, value) {
      const el = resolve(target);
      el.value = value;
      dispatch(el, makeEvent('input', {}));
      dispatch(el, makeEvent('change', {}));
    },
    key(key, target, extra = {}) {
      const el = target ? resolve(target) : doc.activeElement || doc.body;
      dispatch(el, makeEvent('keydown', { key, code: extra.code || key, ...extra }));
      dispatch(el, makeEvent('keyup', { key, code: extra.code || key, ...extra }));
    },
    resize(width, height) {
      doc._viewport = { width, height };
      win.innerWidth = width; win.innerHeight = height;
      dispatch(win, makeEvent('resize', { bubbles: false }));
    },
  };
  return page;
}

module.exports = { loadPage, EXIT_NO_SUCH_MUTANT, EXIT_BAD_ANCHOR, rootVars };
