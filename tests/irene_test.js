// 无头跑 irene.html：桩掉 DOM/canvas，在崖边、往下走的三段、回到崖边、换六个晚上，每次录下画出来的全部绘图调用。
// 测试往页面里插一个记号：每盏灯画之前 mark('light', id, x, y)；SC.figure 被包一层，记下每个人画在哪。
// 检查（书里的东西写在这个文件里，不从页面读）：
// ① 站在崖边时，画布上写着「伊莱那」，图注里也有
// ② 往下走哪怕一步，画布、图注、读数里都不再出现「伊莱那」（六个晚上、每一段都查）
// ③ 走到底看到的灯，跟崖上看到的不是同一批（编号不同，位置也没有一盏重合）
// ④ 崖边三个人从不挪动：每一帧的横坐标都一样，往下走时也一样
// ⑤ 回到崖边，同一个晚上的灯一盏不差（编号和位置都一样），名字回来
// ⑥ 换一个晚上，灯亮的地方变了
// ⑦ 点灯的时候：刚开始只亮几盏，过一会儿才全亮
// ⑧ 到了谷底「往下走」按不动，在崖边「回到高原上」按不动
// 变异（自检用）：MUT=1..7 各弄坏一处，这个文件必须以非 0 退出。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap("if (step === 0) drawName(", "if (step <= 1) drawName(");
if (MUT === '2') swap("NEAR.lights.forEach(l => drawLight(ctx, l, l.x, l.y + lift", "FAR.lights.forEach(l => drawLight(ctx, l, l.x, l.y + lift");
if (MUT === '3') swap("SC.figure(ctx, C.lamp, w.x, rimY", "SC.figure(ctx, C.lamp, w.x + step * 60, rimY");
if (MUT === '4') swap("step = 0; moralKey = 'back';", "step = 0; FAR = farCity(night + 1); moralKey = 'back';");
if (MUT === '5') swap("FAR = farCity(night); NEAR", "FAR = farCity(0); NEAR");
if (MUT === '6') swap("'往下走的路上'", "NAME + '，往下走的路上'");
if (MUT === '7') swap("if (t >= l.on) drawLight(", "if (true) drawLight(");

function hook(a, b){ if (!inline.includes(a)) throw new Error('hook point missing: ' + a); inline = inline.replace(a, b); }
hook("  function drawLight(ctx, l, x, y, s, color, a){\n", "  function drawLight(ctx, l, x, y, s, color, a){\n    ctx.__mark('light', l.id, Math.round(x), Math.round(y));\n");

const NAME = '伊莱那';
const els = {}, handlers = {};
function el(id){ return els[id] || (els[id] = { id, textContent: '', disabled: false, classList: { add(){}, remove(){} },
  addEventListener(ev, f){ handlers[id + ':' + ev] = f; },
  getBoundingClientRect(){ return { left: 0, top: 0, width: 800, height: 500 }; }, getContext(){ return ctx; } }); }
let calls = [];
const ctx = new Proxy({ canvas: { width: 1600, height: 1000 } }, { get(t, k){ if (k in t) return t[k];
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { calls.push([String(k), a]); return { addColorStop(...b){ calls.push(['addColorStop', b]); } }; };
  return (...a) => { for (const v of a) if (typeof v === 'number' && !isFinite(v)) throw new Error('non-finite arg to ' + String(k)); calls.push([String(k), a]); }; },
  set(t, k, v){ calls.push(['=' + String(k), v]); t[k] = v; return true; } });
let nowMs = 0;
global.window = { matchMedia: () => ({ matches: false }), addEventListener(){}, devicePixelRatio: 1 };
global.document = { getElementById: el, createElement: () => ({ getContext(){ return ctx; } }), documentElement: {}, fonts: null };
global.getComputedStyle = () => ({ getPropertyValue: n => n });
global.performance = { now: () => nowMs };
global.requestAnimationFrame = () => {};
eval(shared); global.SC = window.SC;
const realFigure = SC.figure;
SC.figure = function(c, color, x, y, s, sway){ calls.push(['__figure', [x, y]]); return realFigure(c, color, x, y, s, sway); };
// shared.js wires window resize to fit()+redraw(); keep that handler so the test can redraw at a chosen time.
let resizeHandler = null;
window.addEventListener = (ev, f) => { if (ev === 'resize') resizeHandler = f; };
calls = [];
eval(inline);

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };

function lastFrame(){
  let start = -1;
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i][0] === 'createLinearGradient'){ start = i; break; }
  const f = calls.slice(start);
  return {
    lights: f.filter(c => c[0] === '__mark' && c[1][0] === 'light').map(c => ({ id: c[1][1], x: c[1][2], y: c[1][3] })),
    texts: f.filter(c => c[0] === 'fillText').map(c => String(c[1][0])),
    figs: f.filter(c => c[0] === '__figure').map(c => c[1][0])
  };
}
function redraw(){ calls = []; resizeHandler(); return lastFrame(); }
function press(id){ calls = []; handlers[id + ':click'](); return lastFrame(); }
const lightKey = L => JSON.stringify(L.map(l => [l.id, l.x, l.y]).sort());
const hasName = f => f.texts.some(t => t.includes(NAME));
const viewHasName = () => [els.caption.textContent, els.meter.textContent].some(t => t.includes(NAME));

// ⑦ lamp-lighting: right at the start only a few lamps; later all of them.
nowMs = 0; const T0 = redraw();
nowMs = 200; const T1 = redraw();
nowMs = 10000; const F0 = redraw();
check(T0.lights.length < F0.lights.length && T1.lights.length >= T0.lights.length && F0.lights.length > 10,
  '⑦ 点灯的时候一盏一盏亮（刚开始 ' + T0.lights.length + ' 盏，0.2 秒 ' + T1.lights.length + ' 盏，后来 ' + F0.lights.length + ' 盏）');

check(hasName(F0) && els.caption.textContent.includes(NAME), '① 站在崖边，画布上写着「伊莱那」，图注里也有');
check(els.back.disabled === true, '⑧ 在崖边「回到高原上」按不动');

const figX0 = F0.figs.slice();
let figFramesDown = 0, nameLeak = '', figMoved = '', farIdsAtBottom = 0, overlap = 0, backOk = true, nightsDiffer = true, bottomCount = 0;
let prevFarKey = lightKey(F0.lights);
for (let n = 0; n < 6; n++){
  if (n > 0){
    press('night'); nowMs += 10000;
    const Fn = redraw();
    if (!hasName(Fn)) nameLeak = nameLeak || '第 ' + (n + 1) + ' 个晚上崖边没有名字';
    if (lightKey(Fn.lights) === prevFarKey) nightsDiffer = false;
    prevFarKey = lightKey(Fn.lights);
  }
  const farHere = redraw();
  const farKey = lightKey(farHere.lights);
  const farPos = new Set(farHere.lights.map(l => l.x + ',' + l.y));
  if (JSON.stringify(farHere.figs) !== JSON.stringify(figX0)) figMoved = figMoved || '第 ' + (n + 1) + ' 个晚上崖边';
  for (let s = 1; s <= 3; s++){
    press('near'); nowMs += 3000;
    const F = redraw();
    if (hasName(F) || viewHasName()) nameLeak = nameLeak || '第 ' + (n + 1) + ' 个晚上往下第 ' + s + ' 段';
    if (F.figs.length) figFramesDown++;
    if (F.figs.length && JSON.stringify(F.figs) !== JSON.stringify(figX0.slice(0, F.figs.length))) figMoved = figMoved || '第 ' + (n + 1) + ' 个晚上往下第 ' + s + ' 段';
    if (s === 3){
      bottomCount = F.lights.length;
      farIdsAtBottom += F.lights.filter(l => l.id[0] === 'f').length;
      overlap += F.lights.filter(l => farPos.has(l.x + ',' + l.y)).length;
    }
  }
  const atBottomDisabled = els.near.disabled;
  press('back'); nowMs += 10000;
  const B2 = redraw();
  if (lightKey(B2.lights) !== farKey || !hasName(B2) || !els.caption.textContent.includes(NAME)) backOk = false;
  if (n === 0) check(atBottomDisabled === true, '⑧ 到了谷底「往下走」按不动');
}
check(!nameLeak, '② 往下走哪怕一步，画布、图注、读数里都没有「伊莱那」' + (nameLeak ? '（' + nameLeak + '出现了）' : '（六个晚上 × 三段）'));
check(farIdsAtBottom === 0 && overlap === 0 && bottomCount > 0, '③ 谷底的灯跟崖上那批不是同一批（谷底这一晚 ' + bottomCount + ' 盏，崖上的编号混进来 ' + farIdsAtBottom + ' 盏，位置重合 ' + overlap + ' 盏）');
check(!figMoved && figX0.length === 3 && figFramesDown > 0, '④ 崖边三个人从不挪动（往下走时有 ' + figFramesDown + ' 帧画到了他们）' + (figMoved ? '（' + figMoved + '动了）' : ''));
check(backOk, '⑤ 回到崖边，同一个晚上的灯一盏不差，名字回来');
check(nightsDiffer, '⑥ 换一个晚上，灯亮的地方变了');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 跑：node tests/irene_test.js cities/irene.html shared.js
// 变异：for m in 1 2 3 4 5 6 7; do MUT=$m node tests/irene_test.js cities/irene.html shared.js >/dev/null 2>&1 && echo "MUT=$m 没抓到" || echo "MUT=$m 抓到"; done
