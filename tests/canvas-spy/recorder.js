'use strict';
// A fake CanvasRenderingContext2D that remembers what was drawn.
//
// Two views of the same drawing:
//   calls - every method call and property set, in order, raw.
//   ops   - one entry per paint (fill, stroke, fillRect, fillText, drawImage, ...),
//           with the colour, alpha and dash in force at that moment and the points
//           of what was painted, already mapped through the current transform.
//
// Nothing is rasterised. Curves are reduced to points that bound them
// (arcs are sampled, Bezier curves keep their control points), which is
// enough to ask "where is the gold thing" but not "which pixel is lit".

const IDENTITY = [1, 0, 0, 1, 0, 0];

function mul(m, n) {
  // m * n, both as [a, b, c, d, e, f]
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m, x, y) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

function arcPoints(x, y, rx, ry, rot, a0, a1, ccw) {
  let sweep = a1 - a0;
  if (!ccw && sweep < 0) sweep = sweep % (2 * Math.PI) + 2 * Math.PI;
  if (ccw && sweep > 0) sweep = sweep % (2 * Math.PI) - 2 * Math.PI;
  if (Math.abs(a1 - a0) >= 2 * Math.PI) sweep = ccw ? -2 * Math.PI : 2 * Math.PI;
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 12)) + 1);
  const cr = Math.cos(rot), sr = Math.sin(rot), pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + sweep * i / (n - 1);
    const px = rx * Math.cos(a), py = ry * Math.sin(a);
    pts.push([x + px * cr - py * sr, y + px * sr + py * cr]);
  }
  return pts;
}

// Path geometry in user space; shared by the context's current path and Path2D.
function pathMethods(push) {
  return {
    moveTo(x, y) { push([[x, y]], true); },
    lineTo(x, y) { push([[x, y]]); },
    rect(x, y, w, h) { push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true); },
    roundRect(x, y, w, h) { push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true); },
    arc(x, y, r, a0, a1, ccw) { push(arcPoints(x, y, r, r, 0, a0, a1, !!ccw)); },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) { push(arcPoints(x, y, rx, ry, rot, a0, a1, !!ccw)); },
    arcTo(x1, y1, x2, y2) { push([[x1, y1], [x2, y2]]); },
    quadraticCurveTo(cx, cy, x, y) { push([[cx, cy], [x, y]]); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { push([[c1x, c1y], [c2x, c2y], [x, y]]); },
    closePath() {},
  };
}

class Path2D {
  constructor(src) {
    this._pts = src instanceof Path2D ? src._pts.slice() : [];
    Object.assign(this, pathMethods(pts => { for (const p of pts) this._pts.push(p); }));
  }
  addPath(p) { for (const q of p._pts) this._pts.push(q); }
}

const PAINT = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage']);

function defaultProps() {
  return {
    fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', font: '10px sans-serif', textAlign: 'start',
    textBaseline: 'alphabetic', globalCompositeOperation: 'source-over',
    shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)', filter: 'none',
  };
}

function bbox(points) {
  if (!points.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function createRecorder(options = {}) {
  const strictFinite = options.strictFinite !== false;
  const canvas = options.canvas || null;
  const calls = [];
  let ops = [];
  let props = defaultProps(), matrix = IDENTITY.slice(), dash = [];
  const stack = [];
  let path = [];

  const pushPath = (pts) => { for (const [x, y] of pts) path.push(apply(matrix, x, y)); };
  const current = pathMethods(pushPath);

  function check(name, args) {
    if (!strictFinite) return;
    for (const v of args) {
      if (typeof v === 'number' && !Number.isFinite(v)) {
        throw new Error(`canvas-spy: ${name}() got ${v}; a browser would silently draw nothing here`);
      }
    }
  }

  function paint(op, points, extra) {
    const style = op.startsWith('stroke') ? props.strokeStyle : props.fillStyle;
    const rec = {
      op, points, box: bbox(points), style,
      fillStyle: props.fillStyle, strokeStyle: props.strokeStyle,
      alpha: props.globalAlpha, lineWidth: props.lineWidth, lineDash: dash.slice(),
      composite: props.globalCompositeOperation, font: props.font,
      transform: matrix.slice(), index: calls.length - 1,
      ...extra,
    };
    ops.push(rec);
    return rec;
  }

  const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => apply(matrix, a, b));

  const methods = {
    save() { stack.push({ props: { ...props }, matrix: matrix.slice(), dash: dash.slice() }); },
    restore() { const s = stack.pop(); if (s) { props = s.props; matrix = s.matrix; dash = s.dash; } },
    translate(x, y) { matrix = mul(matrix, [1, 0, 0, 1, x, y]); },
    scale(x, y) { matrix = mul(matrix, [x, 0, 0, y, 0, 0]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); matrix = mul(matrix, [c, s, -s, c, 0, 0]); },
    transform(a, b, c, d, e, f) { matrix = mul(matrix, [a, b, c, d, e, f]); },
    setTransform(a, b, c, d, e, f) {
      if (a && typeof a === 'object') matrix = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
      else if (a === undefined) matrix = IDENTITY.slice();
      else matrix = [a, b, c, d, e, f];
    },
    resetTransform() { matrix = IDENTITY.slice(); },
    getTransform() { const [a, b, c, d, e, f] = matrix; return { a, b, c, d, e, f }; },
    setLineDash(d) { dash = Array.from(d || []); },
    getLineDash() { return dash.slice(); },
    beginPath() { path = []; },
    ...current,
    fill(p) { paint('fill', p instanceof Path2D ? p._pts.map(([x, y]) => apply(matrix, x, y)) : path.slice()); },
    stroke(p) { paint('stroke', p instanceof Path2D ? p._pts.map(([x, y]) => apply(matrix, x, y)) : path.slice()); },
    clip() {},
    fillRect(x, y, w, h) { paint('fillRect', rectPts(x, y, w, h)); },
    strokeRect(x, y, w, h) { paint('strokeRect', rectPts(x, y, w, h)); },
    clearRect(x, y, w, h) { paint('clearRect', rectPts(x, y, w, h)); },
    fillText(text, x, y) { paint('fillText', [apply(matrix, x, y)], { text: String(text) }); },
    strokeText(text, x, y) { paint('strokeText', [apply(matrix, x, y)], { text: String(text) }); },
    drawImage(img, ...a) {
      const [dx, dy, dw, dh] = a.length >= 8 ? a.slice(4, 8) : a.length >= 4 ? a : [a[0], a[1], img && img.width || 0, img && img.height || 0];
      paint('drawImage', rectPts(dx, dy, dw, dh), { image: img });
    },
    measureText(text) {
      const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(props.font)?.[1] || '10');
      const width = String(text).length * size * 0.6;
      return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 };
    },
    createLinearGradient(...a) { return { kind: 'linear', args: a, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; },
    createRadialGradient(...a) { return { kind: 'radial', args: a, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; },
    createConicGradient(...a) { return { kind: 'conic', args: a, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } }; },
    createPattern(img, rep) { return { kind: 'pattern', image: img, repetition: rep }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }; },
    putImageData() {},
    isPointInPath() { return false; },
    isPointInStroke() { return false; },
  };

  const target = {};
  const ctx = new Proxy(target, {
    get(t, k) {
      if (typeof k === 'symbol') return t[k];
      if (k === 'canvas') return canvas;
      if (k === 'lineDashOffset') return props.lineDashOffset || 0;
      if (k in props) return props[k];
      if (k in t) return t[k];
      const name = String(k);
      return (...args) => {
        check(name, args);
        calls.push({ kind: 'call', name, args });
        if (methods[name]) return methods[name](...args);
        return undefined;
      };
    },
    set(t, k, v) {
      const name = String(k);
      if (typeof v === 'number' && strictFinite && !Number.isFinite(v)) {
        throw new Error(`canvas-spy: ${name} = ${v}; a browser would ignore this assignment`);
      }
      calls.push({ kind: 'set', name, value: v });
      props[name] = v;
      return true;
    },
  });

  return {
    ctx,
    calls,
    get ops() { return ops; },
    // Paint ops recorded while fn runs (fn may be omitted: then everything so far).
    capture(fn) {
      const start = ops.length;
      fn();
      return ops.slice(start);
    },
    clear() { calls.length = 0; ops = []; },
    get transform() { return matrix.slice(); },
    get depth() { return stack.length; },
  };
}

module.exports = { createRecorder, Path2D, bbox, PAINT };
