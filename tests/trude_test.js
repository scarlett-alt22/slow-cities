// 无头跑 trude.html：桩掉 DOM/canvas，按六十次「离开」（比名字表还长，绕回来也查到），每次录下画出来的全部绘图调用。
// 测试往页面里插一个记号：画机场上那行字之前 sign。那行字就是记号之后的第一个 fillText。
// 检查（书里的东西写在这个文件里，不从页面读）：
// ① 第一次降落，机场上写的是「特鲁德」
// ② 每次离开再降落，机场上的字都换了：跟上一次不同，也不再是「特鲁德」
// ③ 除了那一笔字，画面跟第一次降落逐个调用一模一样（同样的调用、同样的参数、同样的颜色）
// ④ meter 报离开的次数；离开后 moral 说的是「换的只是机场的名字」
// 变异（自检用）：MUT=1..5 各弄坏一处，这个文件必须以非 0 退出。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap("ctx.fillStyle = on ? C.lamp : C.sky;", "ctx.fillStyle = (on !== (left === 3)) ? C.lamp : C.sky;");
if (MUT === '2') swap("left === 0 ? FIRST :", "true ? FIRST :");
if (MUT === '3') swap("const FIRST = '特鲁德';", "const FIRST = '特鲁得';");
if (MUT === '4') swap("const r = SC.rng(77);", "const r = SC.rng(77 + left);");
if (MUT === '5') swap("'离开过 ' + left + ' 次'", "'离开过 ' + (left - 1) + ' 次'");

function hook(a, b){ if (!inline.includes(a)) throw new Error('hook point missing: ' + a); inline = inline.replace(a, b); }
hook("  function nameOnTheAirport(ctx){\n", "  function nameOnTheAirport(ctx){\n    ctx.__mark('sign');\n");

const BOOK_NAME = '特鲁德';
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 800, height: 500 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({ canvas: { width: 1600, height: 1000 } }, { get(t, k){ if (k in t) return t[k];
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { calls.push([String(k), a]); return { addColorStop(...b){ calls.push(['addColorStop', b]); } }; };
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };   // the loop draws once (rAF is a stub), then only clicks redraw
global.document = { getElementById: el, createElement: () => ({ getContext(){ return ctx; } }), documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => 0 };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
calls = [];
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };

// One landing = the calls of the last full draw (from the background gradient to the sign).
function lastFrame(){
  let start = -1;
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i][0] === 'createLinearGradient'){ start = i; break; }
  const f = calls.slice(start);
  const m = f.findIndex(c => c[0] === '__mark' && c[1][0] === 'sign');
  const s = f.findIndex((c, i) => i > m && c[0] === 'fillText');
  if (m < 0 || s < 0) throw new Error('no sign in frame');
  const sign = f[s][1][0];
  const rest = f.filter((c, i) => i !== s && c[0] !== '__mark');
  return { sign, rest: JSON.stringify(rest), n: f.filter(c => c[0] !== '__mark').length };
}
function land(){ calls = []; handlers['go:click'](); return lastFrame(); }

const L0 = lastFrame();   // the first landing: the page draws once when it opens
check(L0.sign === BOOK_NAME, '① 第一次降落，机场上写的是「' + BOOK_NAME + '」（画的是「' + L0.sign + '」）');
check(/刚到/.test(els.meter.textContent), '④ 刚到时 meter 不报离开次数（「' + els.meter.textContent + '」）');

let prev = L0.sign, changedEach = true, neverTrude = true, sameRest = true, meterOk = true, moralOk = true, firstDiff = '';
const seen = new Set();
for (let k = 1; k <= 60; k++){
  const L = land();
  seen.add(L.sign);
  if (L.sign === prev) changedEach = false;
  if (L.sign === BOOK_NAME) neverTrude = false;
  if (L.rest !== L0.rest){ sameRest = false; if (!firstDiff) firstDiff = '第 ' + k + ' 次'; }
  if (els.meter.textContent !== '离开过 ' + k + ' 次') meterOk = false;
  if (!/换的只是机场的名字/.test(els.moral.textContent)) moralOk = false;
  prev = L.sign;
}
check(changedEach, '② 每次降落机场上的字都跟上一次不同');
check(neverTrude, '② 离开以后机场上再没写过「特鲁德」');
check(seen.size >= 20, '② 换过的名字不止几个（六十次里 ' + seen.size + ' 个）');
check(sameRest, '③ 除了机场上那一笔字，六十次降落的画面跟第一次逐个调用相同' + (firstDiff ? '（' + firstDiff + '起不同）' : '') + '，每帧 ' + L0.n + ' 个调用');
check(meterOk, '④ meter 每次都报「离开过 n 次」');
check(moralOk, '④ 离开以后 moral 说「换的只是机场的名字」');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 跑：node tests/trude_test.js cities/trude.html shared.js
// 变异：for m in 1 2 3 4 5; do MUT=$m node tests/trude_test.js cities/trude.html shared.js >/dev/null 2>&1 && echo "MUT=$m 没抓到" || echo "MUT=$m 抓到"; done
