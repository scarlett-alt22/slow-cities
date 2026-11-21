// 欧林达。2026-11-21 改用 canvas-spy（tests/canvas-spy/），检查条目跟原来手搭的版本（7d456b5 之前）一一对应。画面从画出来的东西里读，不读页面的计数。
// 检查：
// ① 新的只从正中心出现：每过一年，最里面那道城墙是针头大（半径 3）；旧城墙按从外往里的次序一道不少，
//    而且只往外走，不往里缩（年与年之间，和长的过程中间都查）
// ② 旧城不拆：城墙的道数＝年数＋2，只增不减；页面上的「几座」跟画出来的道数对得上
// ③ 长足了的圈面积不变（外半径²−内半径² 恒等于 120²），宽度只减不增——变细
// ④ 每一圈都有那七样东西，每样东西都落在自己那一圈里（按画出来的位置算），一圈 28 样
// ⑤ 放大镜：拿起来以后有一块裁剪区，里面放大 ≥ 8 倍，针头那道城墙在里面画到了；放下就没有；点画面，镜子挪到点的地方
// ⑥ caption 从里往外报大小（针头、半个柠檬、牛肝菌、汤盘），三个问题的回答对得上
// ⑦ 连按三下过一年＝过三年；REDUCE=1：按一下，不等就到下一年
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/olinda_test.js
const path = require('path');
const { loadPage, objects, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, CX = 800, CY = 500, WALL = '#8c7f6a';
const KIND = ['#c8765a', '#a9b4c2', '#e8d9a0', '#5f8a5a', '#c94c4c', '#d9b36a', '#b9a38a'];
const page = loadPage(path.join(__dirname, '..', 'cities', 'olinda.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { 'const redraw = () => { if (st) st.redraw(); };': '{ redraw }' },
  mutations: [
    ['for (let k = n - 1; k >= 0; k--){', 'for (let k = 0; k < n; k++){'],
    ['if (age >= 4) return STAGE[4];', 'if (age >= 4) return STAGE[4] * (1 + .02 * (age - 4));'],
    ['const n = Math.floor(Y + 1e-9) + 2', 'const n = Math.min(14, Math.floor(Y + 1e-9) + 2)'],
    ['for (let kind = 0; kind < KIND.length; kind++)', 'for (let kind = 0; kind < (k < 3 ? 6 : KIND.length); kind++)'],
    ['p: .2 + .6 * r()', 'p: .2 + 1.2 * r()'],
    ['ctx.scale(ZOOM, ZOOM)', 'ctx.scale(1, 1)'],
    ['target += 1;', 'target = Math.floor(Y) + 1;'],
    ['Y = still ? target :', 'Y = false ? target :'],
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const el = id => page.el(id);
const press = id => page.click(id);
const near = (a, b, e) => Math.abs(a - b) <= e;

// 城墙是以 (CX, CY) 为圆心的描边圆。圆被记成采样点，半径＝点到圆心（经过同一个变换）的距离除以缩放。
function radii(op){
  const [a, b, c, d, e, f] = op.transform;
  const cx = a * CX + c * CY + e, cy = b * CX + d * CY + f, s = Math.hypot(a, b);
  const out = new Set();
  for (const p of op.points) out.add(Math.round(Math.hypot(p.x - cx, p.y - cy) / s * 1e6) / 1e6);
  return [...out];
}
// 一帧：往前走 ms 毫秒画一帧（减少动效没有循环，直接重画）。clip 之后画的是放大镜里的东西。
function frame(ms = 0){
  const rec = page.canvas(); rec.clear();
  const ops = REDUCE ? page.capture(() => page.exposed.redraw()) : page.frame(ms);
  const clipAt = rec.calls.findIndex(c => c.name === 'clip');
  const outside = clipAt < 0 ? ops : ops.filter(op => op.index < clipAt);
  const inside = clipAt < 0 ? [] : ops.filter(op => op.index > clipAt);
  const f = { walls: [], glyphs: [], lens: null };
  for (const op of outside) if (op.op === 'stroke' && sameColor(op.style, WALL)) f.walls.push(...radii(op));
  f.walls.sort((x, y) => y - x);                     // outermost (oldest) first
  const kindOf = op => KIND.findIndex(k => sameColor(k, op.style));
  for (const obj of objects(outside)){
    const first = obj.ops.find(op => kindOf(op) >= 0);
    if (first) f.glyphs.push({ x: obj.origin.x, y: obj.origin.y, kind: kindOf(first) });
  }
  if (clipAt >= 0){
    const arc = rec.calls.slice(0, clipAt).reverse().find(c => c.name === 'arc');
    const wallsIn = inside.filter(op => op.op === 'stroke' && sameColor(op.style, WALL));
    const t = wallsIn.length ? wallsIn[0].transform : [0, 0, 0, 0, NaN, NaN];
    const at = arc ? { x: arc.args[0], y: arc.args[1], r: arc.args[2] } : null;
    f.lens = { at, scale: t[0], walls: wallsIn.flatMap(radii),
      focus: at ? { x: (at.x - t[4]) / t[0], y: (at.y - t[5]) / t[0] } : { x: NaN, y: NaN } };
  }
  return f;
}
const year = () => +(/第 (\d+) 年/.exec(el('meter').textContent) || [0, -1])[1];
const count = () => +(/(\d+) 座欧林达/.exec(el('meter').textContent) || [0, -1])[1];

// ⑤ / ⑥ at the start
let f = frame();
check(f.walls.length === 2 && near(f.walls[1], 3, .01), '① 开头：一座城，正中心一个针头（' + f.walls.map(r => r.toFixed(1)).join(', ') + '）');
check(el('caption').textContent === '从里往外：针头，再往外 1 圈是自然大小的城', '⑥ 开头 caption: ' + el('caption').textContent);
check(!f.lens, '⑤ 没拿放大镜时没有裁剪区');
press('lens'); f = frame();
const focus = f => f.lens ? f.lens.focus : { x: NaN, y: NaN };
check(f.lens && focus(f).x === CX && focus(f).y === CY && f.lens.scale >= 8 && f.lens.walls.some(r => near(r, 3, .01)),
  '⑤ 拿起放大镜：对着正中心、放大 ' + (f.lens ? f.lens.scale : 0) + ' 倍、针头那道墙在镜子里画到了');
check(f.lens && f.lens.at && Math.hypot(f.lens.at.x - CX, f.lens.at.y - CY) > f.lens.at.r + 120, '⑤ 放大的那块在旁边，不盖住城（镜子中心 ' + (f.lens && f.lens.at ? f.lens.at.x + ',' + f.lens.at.y : '无') + '）');
page.click('c', 100, 120); f = frame();
check(focus(f).x === 100 && focus(f).y === 120 && f.lens.at.x > W / 2, '⑤ 点画面，镜子对准点的地方（' + focus(f).x + ',' + focus(f).y + '），放大的那块挪到另一边');
press('lens'); f = frame();
check(!f.lens, '⑤ 放下放大镜，裁剪区没了');
press('other'); check(/腰带/.test(el('moral').textContent), '⑥ 别的城: ' + el('moral').textContent.slice(0, 30));
press('core'); check(/全新/.test(el('moral').textContent), '⑥ 最里面: ' + el('moral').textContent.slice(0, 30));
press('next'); check(/正中心/.test(el('moral').textContent), '⑥ 下一座: ' + el('moral').textContent);

// Thirty years, one press at a time, looking at the middle of each year as well as its end.
let prev = f.walls.slice(), centreOk = true, outwardOk = true, countOk = true, areaOk = true, thinOk = true, glyphOk = true, kindsOk = true, meterOk = true;
let badArea = '', badGlyph = '', prevW = null, Y3cap = '';
const D = 30;
for (let d = 1; d <= D; d++){
  press('year');
  const steps = REDUCE ? 1 : 10;
  for (let s = 0; s < steps; s++){
    const g = frame(200);
    // ① old walls only move outward (match from the outside in: the oldest is always outermost)
    for (let j = 0; j < prev.length; j++) if (!(g.walls[j] >= prev[j] - 1e-9)) outwardOk = false;
    if (g.walls.length < prev.length) countOk = false;
    prev = g.walls.slice();
  }
  const g = frame();
  if (year() !== d || count() !== g.walls.length) meterOk = false;
  if (g.walls.length !== d + 2) countOk = false;
  if (!near(g.walls[g.walls.length - 1], 3, .01)) centreOk = false;
  // ③ full-grown rings keep their area; their width never grows
  const widths = [];
  for (let j = 0; j < g.walls.length; j++){
    const rout = g.walls[j], rin = g.walls[j + 1] || 0;
    widths.push(rout - rin);
    const mature = j === 0 || d - (j - 1) >= 4;
    if (mature && !near(rout * rout - rin * rin, 14400, 1)){ areaOk = false; if (!badArea) badArea = '第' + d + '年第' + j + '圈 ' + (rout * rout - rin * rin).toFixed(0); }
    const matureBefore = j === 0 || (d - 1) - (j - 1) >= 4;        // compare only with a year when it was already full-grown
    if (matureBefore && prevW && prevW[j] !== undefined && widths[j] > prevW[j] + 1e-9) thinOk = false;
  }
  prevW = widths;
  // ④ every ring has all seven, and everything sits inside its own ring
  const per = g.walls.map(() => new Set()), num = g.walls.map(() => 0);
  g.glyphs.forEach(p => {
    const r = Math.hypot(p.x - CX, p.y - CY);
    let j = -1;
    for (let i = 0; i < g.walls.length; i++){ const rin = g.walls[i + 1] || 0; if (r > rin && r < g.walls[i]) j = i; }
    if (j < 0){ glyphOk = false; if (!badGlyph) badGlyph = '第' + d + '年 r=' + r.toFixed(2); return; }
    per[j].add(p.kind); num[j]++;
  });
  per.forEach((s, j) => { if (s.size !== 7 || num[j] !== 28) kindsOk = false; });
  if (d === 3) Y3cap = el('caption').textContent;
}
check(centreOk, '① ' + D + ' 年里每年最里面那道墙都是针头大');
check(outwardOk, '① 旧城墙一道道只往外走，长的过程中间也是');
check(countOk, '② 城墙道数＝年数＋2，从没少过（第 ' + D + ' 年 ' + prev.length + ' 道）');
check(meterOk, '② 页面上的年数和座数跟画出来的对得上');
check(areaOk, '③ 长足了的圈面积不变' + (badArea ? '；不对的：' + badArea : ''));
check(thinOk, '③ 长足了的圈只变细，不变宽');
check(glyphOk, '④ 每样东西都在自己那一圈里' + (badGlyph ? '；出圈的：' + badGlyph : ''));
check(kindsOk, '④ 每一圈都有七样、28 个');
check(/^从里往外：针头 · 半个柠檬 · 一朵牛肝菌 · 一只汤盘，再往外 1 圈/.test(Y3cap), '⑥ 第 3 年 caption: ' + Y3cap);

// ⑦ three quick presses are three years
const y0 = year();
if (!REDUCE){
  press('year'); press('year'); press('year'); frame();
  frame(10000);
  check(year() === y0 + 3, '⑦ 连按三下：' + y0 + ' → ' + year());
} else {
  press('year'); f = frame();
  check(year() === y0 + 1 && f.walls.length === y0 + 3, '⑦ 减少动效：按一下就到第 ' + year() + ' 年（' + f.walls.length + ' 道墙）');
}

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
