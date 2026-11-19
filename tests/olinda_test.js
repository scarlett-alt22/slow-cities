// 无头跑 olinda.html：桩掉 DOM/canvas，时间用假时钟往前走。画面从记录下来的绘图调用里读，不读页面的计数。
// 检查：
// ① 新的只从正中心出现：每过一年，最里面那道城墙是针头大（半径 3）；旧城墙按从外往里的次序一道不少，
//    而且只往外走，不往里缩（年与年之间，和长的过程中间都查）
// ② 旧城不拆：城墙的道数＝年数＋2，只增不减；页面上的「几座」跟画出来的道数对得上
// ③ 长足了的圈面积不变（外半径²−内半径² 恒等于 120²），宽度只减不增——变细
// ④ 每一圈都有那七样东西，每样东西都落在自己那一圈里（按画出来的位置算），一圈 28 样
// ⑤ 放大镜：拿起来以后有一块裁剪区，里面放大 ≥ 8 倍，针头那道城墙在里面画到了；放下就没有；点画面，镜子挪到点的地方
// ⑥ caption 从里往外报大小（针头、半个柠檬、牛肝菌、汤盘），三个问题的回答对得上
// ⑦ 连按三下过一年＝过三年；REDUCE=1：按一下，不等就到下一年
// 变异：MUT=1..8 各弄坏一处，这个文件必须以非 0 退出。跑法见末尾。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap('for (let k = n - 1; k >= 0; k--){', 'for (let k = 0; k < n; k++){');
if (MUT === '2') swap('if (age >= 4) return STAGE[4];', 'if (age >= 4) return STAGE[4] * (1 + .02 * (age - 4));');
if (MUT === '3') swap('const n = Math.floor(Y + 1e-9) + 2', 'const n = Math.min(14, Math.floor(Y + 1e-9) + 2)');
if (MUT === '4') swap('for (let kind = 0; kind < KIND.length; kind++)', 'for (let kind = 0; kind < (k < 3 ? 6 : KIND.length); kind++)');
if (MUT === '5') swap('p: .2 + .6 * r()', 'p: .2 + 1.2 * r()');
if (MUT === '6') swap('ctx.scale(ZOOM, ZOOM)', 'ctx.scale(1, 1)');
if (MUT === '7') swap('target += 1;', 'target = Math.floor(Y) + 1;');
if (MUT === '8') swap('Y = still ? target :', 'Y = false ? target :');

const hook = 'const redraw = () => { if (st) st.redraw(); };';
if (!inline.includes(hook)) throw new Error('hook point missing');
inline = inline.replace(hook, hook + '\n  global.__T = { redraw };');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, CX = 800, CY = 500, WALL = '#8c7f6a';
const KIND = ['#c8765a', '#a9b4c2', '#e8d9a0', '#5f8a5a', '#c94c4c', '#d9b36a', '#b9a38a'];
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 1600, height: 1000 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({}, { get(t, k){ if (k in t) return t[k]; if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => ({ addColorStop(){} });
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
let NOW = 5000;
global.window = { matchMedia: () => ({ matches: REDUCE }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => NOW * 1000 };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const T = global.__T;
const press = id => handlers[id + ':click']({ clientX: 0, clientY: 0, currentTarget: el(id) });
const near = (a, b, e) => Math.abs(a - b) <= e;

function frame(){
  calls = []; T.redraw();
  let stroke = null, fill = null, path = [], inLens = false, pending = null;
  const f = { walls: [], glyphs: [], lens: null };
  for (const [k, a] of calls){
    if (k === 'clip'){ inLens = true; f.lens = { at: path.find(p => p.k === 'arc'), scale: 0, walls: [], moves: [] }; continue; }
    if (k === '=strokeStyle' || k === '=fillStyle'){
      if (k === '=strokeStyle') stroke = a; else fill = a;
      if (!inLens && pending && KIND.includes(a)){ f.glyphs.push({ x: pending.x, y: pending.y, kind: KIND.indexOf(a) }); pending = null; }
      continue;
    }
    if (k === 'translate'){ if (!inLens) pending = { x: a[0], y: a[1] }; else if (f.lens.moves.length < 2) f.lens.moves.push(a); continue; }
    if (k === 'scale'){ if (inLens && f.lens && !f.lens.scale) f.lens.scale = a[0]; continue; }
    if (k === 'beginPath'){ path = []; continue; }
    if (k === 'arc'){ path.push({ k: 'arc', x: a[0], y: a[1], r: a[2] }); continue; }
    if (k === 'stroke' && stroke === WALL){
      path.filter(p => p.k === 'arc' && p.x === CX && p.y === CY).forEach(p => (inLens ? f.lens.walls : f.walls).push(p.r));
    }
  }
  f.walls.sort((a, b) => b - a);                     // outermost (oldest) first
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
const focus = f => f.lens && f.lens.moves[1] ? { x: -f.lens.moves[1][0], y: -f.lens.moves[1][1] } : { x: NaN, y: NaN };
check(f.lens && focus(f).x === CX && focus(f).y === CY && f.lens.scale >= 8 && f.lens.walls.some(r => near(r, 3, .01)),
  '⑤ 拿起放大镜：对着正中心、放大 ' + (f.lens ? f.lens.scale : 0) + ' 倍、针头那道墙在镜子里画到了');
check(f.lens && f.lens.at && Math.hypot(f.lens.at.x - CX, f.lens.at.y - CY) > f.lens.at.r + 120, '⑤ 放大的那块在旁边，不盖住城（镜子中心 ' + (f.lens && f.lens.at ? f.lens.at.x + ',' + f.lens.at.y : '无') + '）');
handlers['c:click']({ clientX: 100, clientY: 120, currentTarget: el('c') }); f = frame();
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
    if (!REDUCE) NOW += .2;
    const g = frame();
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
  NOW += 10; frame();
  check(year() === y0 + 3, '⑦ 连按三下：' + y0 + ' → ' + year());
} else {
  press('year'); f = frame();
  check(year() === y0 + 1 && f.walls.length === y0 + 3, '⑦ 减少动效：按一下就到第 ' + year() + ' 年（' + f.walls.length + ' 道墙）');
}

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 变异自检：for m in 1 2 3 4 5 6 7 8; do MUT=$m node tests/olinda_test.js cities/olinda.html shared.js >/dev/null; a=$?; MUT=$m REDUCE=1 node tests/olinda_test.js cities/olinda.html shared.js >/dev/null; echo "MUT=$m exit=$a reduce=$?"; done
