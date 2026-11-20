// 无头跑 beersheba.html：桩掉 DOM/canvas，时间用假时钟往前走。东西在哪儿，从记录下来的绘图调用里读（每样东西先 translate 到位置，再设它的颜色），不读页面的计数。
// 检查：
// ① 供的东西一样也没到天上：每一帧里每块飞着的金子都在天上那一层下面；落定以后，地下的零件数＝供的次数，每个零件都在地下
// ② 扔的东西都到了天上：落定以后天上的杂物数＝扔的次数，每样都在天上那一层里；扔的次序照书（第 10 样又从马铃薯皮开始）
// ③ 尾巴：段数＝松快的次数，60 段也都在天上、不出画面
// ④ 一开始是「他们信的」：虚线金城全在天上、虚线粪堆全在地下，实情是淡的；掀开以后虚线没了、实情是实的；
//    掀开、盖上，零件、杂物、尾巴一样不多一样不少
// ⑤ 页面上的数跟画出来的对得上；三个问题的回答对得上
// ⑥ 连供 40 样、连扔 40 样，位置都还在自己那一层里、在画面里
// ⑦ REDUCE=1：按一下就落定，不画飞着的
// 变异：MUT=1..8 各弄坏一处，这个文件必须以非 0 退出。跑法见末尾。
const fs = require('fs');
const html = fs.readFileSync(process.argv[2], 'utf8');
const shared = fs.readFileSync(process.argv[3], 'utf8');
let inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const MUT = process.env.MUT || '';
function swap(a, b){ if (!inline.includes(a)) throw new Error('mutation anchor missing: ' + a); inline = inline.replace(a, b); }
if (MUT === '1') swap('y: top + (t.y - top) * k };', 'y: top - (top - 60) * Math.sin(e * 3.1416) + (t.y - top) * k * k * k };');
if (MUT === '2') swap('720 + row * 90', '720 + row * 190');
if (MUT === '3') swap('(j % 6) * 14', '(j % 6) * 44');
if (MUT === '4') swap("tosses.forEach(o => { if (prog(o, now) >= 1){", "tosses.forEach(o => { if (prog(o, now) >= 1 && o.j < 8){");
if (MUT === '5') swap('truth = !truth;', 'truth = !truth; if (truth) eased = Math.max(0, eased - 1);');
if (MUT === '6') swap('if (!truth) dreams(ctx);', 'dreams(ctx);');
if (MUT === '7') swap('const prog = (o, now) => still ? 1 :', 'const prog = (o, now) => false ? 1 :');
if (MUT === '8') swap('980 * (1 - Math.pow(.965, i + 1))', '1400 * (1 - Math.pow(.965, i + 1))');

const hook = 'const redraw = () => { if (st) st.redraw(); };';
if (!inline.includes(hook)) throw new Error('hook point missing');
inline = inline.replace(hook, hook + '\n  global.__T = { redraw };');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, SKY_B = 300, UNDER_T = 640;
const OFFER = '#f2cf5b', PART = '#c79a3a', JUNK = '#a7b0a8', TAIL = '#6a5341', DREAM_GOLD = '#f6dc8a', DREAM_MUCK = '#7b6a48';
const MARK = { [OFFER]: 'coin', [PART]: 'part', [JUNK]: 'junk', [TAIL]: 'tail' };
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

function frame(){
  calls = []; T.redraw();
  const f = { coin: [], part: [], junk: [], tail: [], gold: [], muck: [], alpha: {} };
  let pending = null, stroke = null, pts = [], alpha = 1;
  for (const [k, a] of calls){
    if (k === '=globalAlpha'){ alpha = a; continue; }
    if (k === 'translate'){ pending = { x: a[0], y: a[1] }; continue; }
    if (k === '=fillStyle' || k === '=strokeStyle'){
      if (k === '=strokeStyle') stroke = a;
      if (pending && MARK[a]){ f[MARK[a]].push(pending); if (!(MARK[a] in f.alpha)) f.alpha[MARK[a]] = alpha; }
      pending = null; continue;
    }
    if (k === 'beginPath'){ pts = []; continue; }
    if (k === 'moveTo' || k === 'lineTo'){ pts.push({ x: a[0], y: a[1] }); continue; }
    if (k === 'quadraticCurveTo'){ pts.push({ x: a[0], y: a[1] }, { x: a[2], y: a[3] }); continue; }
    if (k === 'stroke'){ if (stroke === DREAM_GOLD) f.gold.push(...pts); if (stroke === DREAM_MUCK) f.muck.push(...pts); }
  }
  return f;
}
const meter = () => (/供了 (\d+) 样 · 扔了 (\d+) 样 · 尾巴 (\d+) 截/.exec(el('meter').textContent) || []).slice(1).map(Number);
const settle = () => { NOW += 3; return frame(); };
const inSky = p => p.y < SKY_B && p.y > 0 && p.x > 0 && p.x < W;
const below = p => p.y > UNDER_T && p.y < H && p.x > 0 && p.x < W;

// ④ the start: what they believe
let f = frame();
check(f.gold.length > 20 && f.gold.every(p => p.y < SKY_B), '④ 开头：虚线金城画了，全在天上（' + f.gold.length + ' 个点）');
check(f.muck.length > 10 && f.muck.every(p => p.y > UNDER_T), '④ 开头：虚线粪堆画了，全在地下（' + f.muck.length + ' 个点）');
check(/他们信的/.test(el('caption').textContent), '⑤ 开头 caption: ' + el('caption').textContent);

// ① three offerings, watched every tenth of a second on their way
press('offer'); press('offer'); press('offer');
let highest = Infinity, coinsSeen = 0, startY = null;
for (let s = 0; s < 25; s++){
  if (!REDUCE) NOW += .1;
  const g = frame();
  g.coin.forEach(p => { highest = Math.min(highest, p.y); coinsSeen++; if (startY === null) startY = p.y; });
}
f = settle();
if (!REDUCE){
  check(coinsSeen > 0 && highest > SKY_B, '① 金子飞的时候最高到 y=' + highest.toFixed(0) + '，没进天上那一层（界线 ' + SKY_B + '）');
  check(highest < startY - 30, '① 先往上举了一下（从 ' + (startY || 0).toFixed(0) + ' 升到 ' + highest.toFixed(0) + '）');
}
check(f.coin.length === 0 && f.part.length === 3 && f.part.every(below), '① 落定：地下 ' + f.part.length + ' 个零件，都在地下；没有飞着的金子');
check(JSON.stringify(meter()) === '[3,0,0]', '⑤ 页面：' + el('meter').textContent);
check(f.alpha.part < .5, '④ 没掀开时实情是淡的（零件 alpha ' + f.alpha.part + '）');

// ② litter, in the book's order
const said = [];
for (let i = 0; i < 10; i++){ press('toss'); said.push(el('caption').textContent.split('刚才')[1]); }
let junkTop = Infinity;
for (let s = 0; s < 25; s++){ if (!REDUCE) NOW += .1; frame().junk.forEach(p => junkTop = Math.min(junkTop, p.y)); }
f = settle();
check(f.junk.length === 10 && f.junk.every(inSky), '② 落定：天上 ' + f.junk.length + ' 样杂物，都在天上那一层');
const ORDER = ['马铃薯皮', '破伞', '旧袜子', '玻璃碎渣', '衣扣', '糖果纸', '废车票', '指甲和老茧皮', '鸡蛋壳', '马铃薯皮'];
check(said.every((s, i) => s === '扔了' + ORDER[i]), '② 扔的次序照书：' + said.join('、'));
check(f.part.length === 3, '① 扔东西没让地下多出零件（' + f.part.length + '）');

// ③ the tail
for (let i = 0; i < 5; i++) press('ease');
f = frame();
check(f.tail.length === 5 && f.tail.every(inSky), '③ 松快 5 回，尾巴 ' + f.tail.length + ' 截，都在天上');
check(JSON.stringify(meter()) === '[3,10,5]', '⑤ 页面：' + el('meter').textContent);

// ④ lifting the lid changes nothing but the looking
const before = [f.part.length, f.junk.length, f.tail.length].join(',');
press('look'); f = frame();
check(f.gold.length === 0 && f.muck.length === 0, '④ 掀开：虚线没了');
check(f.alpha.part === 1 && f.alpha.junk === 1, '④ 掀开：实情是实的');
check([f.part.length, f.junk.length, f.tail.length].join(',') === before, '④ 掀开不改东西（' + before + '）');
check(/实情/.test(el('caption').textContent) && el('look').textContent === '照他们信的看', '⑤ 掀开后 caption 和按钮字对了');
press('look'); press('look'); f = frame();
check([f.part.length, f.junk.length, f.tail.length].join(',') === before && f.gold.length === 0, '④ 再盖上、再掀开，东西还是 ' + before);
press('look'); f = frame();
check(f.gold.length > 20 && [f.part.length, f.junk.length, f.tail.length].join(',') === before, '④ 盖回去，虚线回来，东西还是 ' + before);

press('where'); check(/没到天上/.test(el('moral').textContent), '⑤ 供的去哪: ' + el('moral').textContent.slice(0, 24));
press('star'); check(/马铃薯皮/.test(el('moral').textContent), '⑤ 天上那颗: ' + el('moral').textContent.slice(0, 24));
press('tail'); check(/彗星尾巴/.test(el('moral').textContent), '⑤ 尾巴: ' + el('moral').textContent.slice(0, 24));

// ⑥ many
for (let i = 0; i < 37; i++) press('offer');
for (let i = 0; i < 30; i++) press('toss');
for (let i = 0; i < 55; i++) press('ease');
f = settle();
check(f.part.length === 40 && f.part.every(below), '⑥ 供了 40 样：' + f.part.length + ' 个零件，都在地下、在画面里');
check(f.junk.length === 40 && f.junk.every(inSky), '⑥ 扔了 40 样：' + f.junk.length + ' 样，都在天上、在画面里');
check(f.tail.length === 60 && f.tail.every(inSky), '③ 尾巴 60 截，都在天上、没出画面（最西 x=' + Math.min(...f.tail.map(p => p.x)).toFixed(0) + '）');
check(JSON.stringify(meter()) === '[40,40,60]', '⑤ 页面：' + el('meter').textContent);

// ⑦
if (REDUCE){
  press('offer'); f = frame();
  check(f.coin.length === 0 && f.part.length === 41, '⑦ 减少动效：按一下就落定（' + f.part.length + ' 个零件，飞着的 ' + f.coin.length + '）');
} else {
  press('offer'); f = frame();
  check(f.coin.length === 1 && f.part.length === 40, '⑦ 正常动效：刚按下时它还在飞（飞着的 ' + f.coin.length + '）');
}

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
// 变异自检：for m in 1 2 3 4 5 6 7 8; do MUT=$m node tests/beersheba_test.js cities/beersheba.html shared.js >/dev/null; a=$?; MUT=$m REDUCE=1 node tests/beersheba_test.js cities/beersheba.html shared.js >/dev/null; echo "MUT=$m exit=$a reduce=$?"; done
// 2026-11-21 跑出来：8 个变异都抓到。MUT=1（金子飞上天再落下）只在正常动效下抓得到，减少动效时根本不飞；MUT=7（减少动效还在飞）只在减少动效下抓得到。
