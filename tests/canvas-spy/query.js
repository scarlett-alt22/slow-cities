'use strict';
// Small helpers for asking questions of paint ops.

function normColor(c) {
  if (typeof c !== 'string') return c;
  let s = c.trim().toLowerCase();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (m3) s = '#' + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3];
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (rgb && (rgb[4] === undefined || +rgb[4] === 1)) s = '#' + [rgb[1], rgb[2], rgb[3]].map(v => (+v).toString(16).padStart(2, '0')).join('');
  return s;
}

const sameColor = (a, b) => normColor(a) === normColor(b);

/**
 * Filter ops. Any field left out matches everything.
 *   op       'fill' | 'stroke' | 'fillRect' | ... (or an array)
 *   style    the colour this op painted with (fillStyle for fills, strokeStyle for strokes)
 *   inForce  a colour that was the fillStyle OR strokeStyle when the op ran, painted or not
 *            (pages often set a colour for a whole object and paint parts of it in others)
 *   dashed, alpha (value or predicate), text (string or RegExp), test (predicate)
 */
function where(ops, q = {}) {
  return ops.filter(op =>
    (q.op === undefined || (Array.isArray(q.op) ? q.op.includes(op.op) : op.op === q.op)) &&
    (q.style === undefined || (Array.isArray(q.style) ? q.style.some(s => sameColor(s, op.style)) : sameColor(q.style, op.style))) &&
    (q.inForce === undefined || sameColor(q.inForce, op.fillStyle) || sameColor(q.inForce, op.strokeStyle)) &&
    (q.dashed === undefined || (op.lineDash.length > 0) === q.dashed) &&
    (q.alpha === undefined || (typeof q.alpha === 'function' ? q.alpha(op.alpha) : op.alpha === q.alpha)) &&
    (q.text === undefined || (q.text instanceof RegExp ? q.text.test(op.text || '') : op.text === q.text)) &&
    (q.test === undefined || q.test(op)));
}

/** Where the op's local origin sits on the canvas: the point a translate() moved to. */
const origin = op => ({ x: op.transform[4], y: op.transform[5] });

/** Centres of the ops' bounding boxes. */
const centers = ops => ops.filter(o => o.box).map(o => ({ x: o.box.cx, y: o.box.cy }));

/** True if every point of every op lies inside the rectangle {x, y, w, h}. */
function allInside(ops, r) {
  return ops.every(o => o.points.every(p => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h));
}

/** Group consecutive paint ops that share the same transform: one drawn object each. */
function objects(ops) {
  const out = [];
  let cur = null, key = null;
  for (const op of ops) {
    const k = op.transform.join(',');
    if (!cur || k !== key) { cur = { origin: origin(op), ops: [] }; out.push(cur); key = k; }
    cur.ops.push(op);
  }
  return out;
}

module.exports = { normColor, sameColor, where, origin, centers, allInside, objects };
