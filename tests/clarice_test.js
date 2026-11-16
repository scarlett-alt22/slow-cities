// 无头跑 clarice.html：桩掉 DOM/canvas，按八十次「又过了一个世纪」，每次录下画出来的全部绘图调用。
// 测试往页面里插一个记号：每件旧物画之前 mark('old', id, x, y, 罩没罩玻璃, 用途)。
// 检查（书里的东西写在这个文件里，不从页面读）：
// ① 打开时是败落的年月：八件旧物都在街上派着别的用场，一件也不在玻璃下
// ② 旧物只会少、不会多：每个世纪画出来的旧物是上一个世纪的子集，件数只减不增，从不冒出八件以外的东西
// ③ 兴旺的世纪每一件都在玻璃下，败落的世纪一件也不在
// ④ 同一种年月，相邻两回的摆法不一样（位置或用场至少变一处）
// ⑤ 读书时记下的三样用场（种紫苏、托鸡蛋篮、当床单）八十个世纪里都出现过
// ⑥ 「最早那座」一件旧物也不画，caption 说没有留下图；再按世纪按钮回到原样
// ⑦ meter 报的件数等于画出来的件数
// 变异（自检用）：MUT=1..5 各弄坏一处，这个文件必须以非 0 退出。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap("    arr = arrange();\n  }", "    if (century === 10) left.push(OLD[0].id);\n    arr = arrange();\n  }");
if (MUT === '2') swap("drawOld(ctx, o, x, y, ph === 'bloom', a.use);", "drawOld(ctx, o, x, y, ph === 'bloom' && a.slot !== 3, a.use);");
if (MUT === '3') swap("const r = SC.rng(9100 + century * 31 + k * 7);", "const r = SC.rng(9100);");
if (MUT === '4') swap("if (showFirst){ backdrop(ctx, 'decay'); nothing(ctx); return; }", "if (showFirst){ backdrop(ctx, 'decay'); nothing(ctx); }");
if (MUT === '5') swap("旧物 ' + left.length", "旧物 ' + OLD.length");

function hook(a, b){ if (!inline.includes(a)) throw new Error('hook point missing: ' + a); inline = inline.replace(a, b); }
hook("  function drawOld(ctx, o, x, y, glass, use){\n", "  function drawOld(ctx, o, x, y, glass, use){\n    ctx.__mark('old', o.id, x, y, glass, use);\n");

const BOOK_OLD = ['cap1', 'cap2', 'urn1', 'urn2', 'cur', 'gr1', 'gr2', 'inl'];
const BOOK_USES = ['种着紫苏', '托着一篮鸡蛋', '当了床单'];
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 800, height: 500 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({ canvas: { width: 1600, height: 1000 } }, { get(t, k){ if (k in t) return t[k];
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { calls.push([String(k), a]); return { addColorStop(...b){ calls.push(['addColorStop', b]); } }; };
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, createElement: () => ({ getContext(){ return ctx; } }), documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => 0 };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
calls = [];
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };

// One frame = the calls of the last full draw. Each old thing: its mark, then the text drawn after it (the use or the name).
function lastFrame(){
  let start = -1;
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i][0] === 'createLinearGradient'){ start = i; break; }
  const f = calls.slice(start);
  const olds = [];
  f.forEach((c, i) => {
    if (c[0] === '__mark' && c[1][0] === 'old'){
      const t = f.slice(i + 1).find(d => d[0] === 'fillText');
      olds.push({ id: c[1][1], x: c[1][2], y: c[1][3], glass: c[1][4], use: c[1][5], text: t ? t[1][0] : null });
    }
  });
  return olds;
}
const layout = olds => JSON.stringify(olds.map(o => [o.id, o.x, o.y, o.text]).sort());
function press(id){ calls = []; handlers[id + ':click'](); return lastFrame(); }

const F0 = lastFrame();
check(F0.length === 8 && F0.every(o => BOOK_OLD.includes(o.id)), '① 打开时八件旧物都在（画了 ' + F0.length + ' 件）');
check(F0.every(o => o.glass === false), '① 打开时是败落的年月，一件也不在玻璃下');

const before = els.meter.textContent;
const FF = press('first');
check(FF.length === 0, '⑥ 「最早那座」一件旧物也不画（画了 ' + FF.length + ' 件）');
check(/没有留下一张图/.test(els.caption.textContent), '⑥ caption 说没有留下图');
const FB = press('go');
check(/第 2 个世纪/.test(els.meter.textContent) && FB.length > 0 && FB.length === +els.meter.textContent.match(/旧物 (\d+) 件/)[1] && !/没有留下/.test(els.caption.textContent),
  '⑥ 再按世纪按钮回到街上（' + before + ' → ' + els.meter.textContent + '，画了 ' + FB.length + ' 件）');


let prevIds = new Set(FB.map(o => o.id)), subset = true, onlyBook = true, glassOk = true, meterOk = true, changeOk = true, firstBad = '';
const lastLayout = { decay: null, bloom: layout(FB) };
const usesSeen = new Set([...F0, ...FB].map(o => o.text));
for (let c = 3; c <= 82; c++){
  const F = press('go');
  const ph = c % 2 ? 'decay' : 'bloom';
  const ids = new Set(F.map(o => o.id));
  if (F.length !== ids.size || [...ids].some(id => !prevIds.has(id))){ subset = false; if (!firstBad) firstBad = '第 ' + c + ' 个世纪'; }
  if (F.some(o => !BOOK_OLD.includes(o.id))) onlyBook = false;
  if (!F.every(o => o.glass === (ph === 'bloom'))) glassOk = false;
  const m = els.meter.textContent.match(/旧物 (\d+) 件/);
  if (!m || +m[1] !== F.length || !els.meter.textContent.includes('第 ' + c + ' 个世纪')) meterOk = false;
  const L = layout(F);
  if (F.length > 0 && lastLayout[ph] !== null && L === lastLayout[ph]) changeOk = false;
  lastLayout[ph] = L;
  if (ph === 'decay') F.forEach(o => usesSeen.add(o.text));
  prevIds = ids;
}
check(subset, '② 每个世纪的旧物都是上一个世纪的子集，件数只减不增' + (firstBad ? '（' + firstBad + '起不对）' : '') + '；八十个世纪后剩 ' + prevIds.size + ' 件');
check(onlyBook, '② 从没冒出八件以外的旧物');
check(glassOk, '③ 兴旺时每一件都在玻璃下，败落时一件也不在');
check(changeOk, '④ 同一种年月，相邻两回的摆法都不一样');
check(BOOK_USES.every(u => usesSeen.has(u)), '⑤ 读书时记下的三样用场都出现过（' + BOOK_USES.filter(u => !usesSeen.has(u)).join('、') + '）');
check(meterOk, '⑦ meter 的世纪数和件数都对得上画面');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 跑：node tests/clarice_test.js cities/clarice.html shared.js
// 变异：for m in 1 2 3 4 5; do MUT=$m node tests/clarice_test.js cities/clarice.html shared.js >/dev/null 2>&1 && echo "MUT=$m 没抓到" || echo "MUT=$m 抓到"; done
