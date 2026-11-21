// 莱奥尼亚。2026-11-22 做城时一起写，用 canvas-spy 从画出来的东西里读：
// ① 开头：城在，城外什么都没有
// ② 每过一天：恰好多一层（左右各一块）；旧的层一个点都不动；新的一层压在旧的上面、山更高、铺得更远；
//    城里（白色房子的范围内）从来没有一点垃圾；新一层上写的是书里那份清单的下一样；清洁工的路只会变长；
//    正常动效下清洁工走到半路时今天这层还没铺上
// ③ 山不够高时滚下一个罐头盒：什么都不变，「山还不够高」
// ④ 不滚的话，十四天起莱奥尼亚的山跟邻城的山碰上、叠在一起
// ⑤ 山够高（十二层起）滚一个下来：雪崩——城没了，山没了，剩一片平地，莱奥尼亚的颜色和邻城的颜色混在一起；罐头按钮不能按了
// ⑥ 之后每按一次，邻城的压路机往里开一截
// ⑦ reset 回到第一天早上
// 跑法：node tests/leonia_test.js        减少动效：REDUCE=1 node tests/leonia_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/leonia_test.js
const path = require('path');
const { loadPage, where, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, CX = 800;
const NEIGHBOR = '#3f4a5a', ROLLER = '#c9b27a';
// 书里人行道上那份清单，照原章的次序（译林张密百年纪念版「连绵的城市 之一」）
const BOOK = ['挤过的牙膏皮', '烧坏的灯泡', '报纸', '容器', '包装纸', '热水器', '百科全书', '钢琴', '瓷器餐具'];

const page = loadPage(path.join(__dirname, '..', 'cities', 'leonia.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['const reach = k => 380 + 14 * k;', 'const reach = k => 380 + 14 * k + day;'],                       // 1 旧的层跟着挪
    ['const FOOT = 260,', 'const FOOT = 120,'],                                                           // 2 垃圾堆进城里
    ['for (let j = 1; j <= k; j++) h += bump(j, r);', 'for (let j = 1; j <= k; j++) h = Math.max(h, bump(j, r));'], // 3 不往上叠
    ['const reach = k => 380 + 14 * k;', 'const reach = k => 380 + 0 * k;'],                              // 4 不往外铺，路不变长
    ['if (k < DANGER){', 'if (k < 1){'],                                                                  // 5 山矮也塌
    ['if (k < DANGER){', 'if (true){'],                                                                   // 6 永远不塌
    ['if (fp < 1){', 'if (true){'],                                                                       // 7 塌了城还在
    ['ctx.fillText(ITEMS[(k - 1) % ITEMS.length]', 'ctx.fillText(ITEMS[k % ITEMS.length]'],               // 8 清单错位
    ['day = 0; walkT0 = -1; fallen = false;', 'day = 0; walkT0 = -1;'],                                   // 9 reset 不扶起来
    ['walkT0 < 0 ? 1 : still ? 1 :', 'walkT0 < 0 ? 1 : still ? .5 :'],                                    // 10 减少动效下永远铺不上
    ['rollers += 1;', 'rollers += 0;'],                                                                   // 11 压路机不动
    ['const mine = x + seg <= inL || x >= inR ? false :', 'const mine ='],                                // 12 压过的地还是莱奥尼亚的
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const CHALK = css('--chalk'), LAMP = css('--lamp'), DIM = css('--dim'), INK = css('--ink');
const notIn = (c, list) => !list.some(x => sameColor(x, c));

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const layers = where(ops, { op: 'fill', test: o => notIn(o.style, [NEIGHBOR, ROLLER, LAMP, DIM]) });
  const houses = where(ops, { op: 'fillRect', style: CHALK });
  const city = houses.length ? { lo: Math.min(...houses.map(h => h.box.x)), hi: Math.max(...houses.map(h => h.box.x + h.box.w)) } : null;
  const hood = where(ops, { op: 'fill', style: NEIGHBOR });
  const flat = where(ops, { op: 'fillRect', test: o => o.box.y < 760 && o.box.y + o.box.h >= 759.5 && o.box.w <= 40.5 });
  const rollers = where(ops, { op: 'fill', style: ROLLER });
  const labels = where(ops, { op: 'fillText', style: INK }).map(o => o.text);
  const walkers = where(ops, { op: 'stroke', style: INK }).length;
  return { layers, city, hood, flat, rollers, labels, walkers };
}
const pts = ops => JSON.stringify(ops.map(o => o.points.map(p => [Math.round(p.x * 100), Math.round(p.y * 100)])));
const peak = v => Math.min(...v.layers.flatMap(o => o.points.map(p => p.y)));
const outer = v => Math.max(...v.layers.flatMap(o => o.points.map(p => Math.abs(p.x - CX))));
const meter = () => page.text('meter');
const steps = () => { const m = /清洁工单程 (\d+) 步/.exec(meter()); return m ? +m[1] : -1; };

function finish(){ if (!REDUCE) page.run(1700); }
function nextDay(n, track){
  const before = look();
  page.click('day');
  if (!REDUCE){
    page.frame(16); page.run(600);
    const mid = look();
    if (mid.layers.length !== 2 * (n - 1) || mid.walkers === 0) track.midOk = false;
  }
  finish();
  const v = look();
  if (v.layers.length !== 2 * n){ track.countOk = false; track.why = track.why || '第 ' + n + ' 天有 ' + v.layers.length + ' 块'; }
  if (pts(v.layers.slice(0, 2 * (n - 1))) !== pts(before.layers)){ track.stillOk = false; track.why = track.why || '第 ' + n + ' 天旧的层动了'; }
  if (n > 1 && !(peak(v) < peak(before) - 1)){ track.upOk = false; track.why = track.why || '第 ' + n + ' 天山没变高'; }
  if (n > 1 && !(outer(v) > outer(before))){ track.outOk = false; track.why = track.why || '第 ' + n + ' 天没铺得更远'; }
  // the newest layer is on top: wherever it is, nothing older is higher
  const newest = v.layers.slice(-2), older = v.layers.slice(0, -2);
  for (const nw of newest){
    const top = new Map(); for (const p of nw.points){ const x = Math.round(p.x); top.set(x, Math.min(top.get(x) ?? Infinity, p.y)); }
    for (const o of older) for (const p of o.points){ const t = top.get(Math.round(p.x)); if (t !== undefined && p.y < t - .01){ track.topOk = false; track.why = track.why || '第 ' + n + ' 天新层底下压着更高的旧层'; } }
  }
  if (!v.city || v.layers.some(o => o.points.some(p => p.x > v.city.lo + .5 && p.x < v.city.hi - .5))){ track.cleanOk = false; track.why = track.why || '第 ' + n + ' 天城里有垃圾'; }
  if (v.labels[v.labels.length - 1] !== BOOK[(n - 1) % BOOK.length]){ track.bookOk = false; track.why = track.why || '第 ' + n + ' 天写的是「' + v.labels.join('/') + '」'; }
  const s = steps();
  if (!(s > track.lastSteps)){ track.walkOk = false; track.why = track.why || '第 ' + n + ' 天清洁工单程 ' + s + ' 步'; }
  track.lastSteps = s;
  return v;
}

// ① 开头
let v = look();
check(v.layers.length === 0 && v.city && v.city.lo < CX && v.city.hi > CX, '① 开头：城在（' + (v.city && Math.round(v.city.hi - v.city.lo)) + ' 宽），城外没有垃圾');
check(/^过了 0 天/.test(meter()) && /每天都是新的/.test(page.text('moral')), '① 开头页面：' + meter());

// ②③ 过十一天，第十一天滚一个罐头
const t = { countOk: true, stillOk: true, upOk: true, outOk: true, topOk: true, cleanOk: true, bookOk: true, walkOk: true, midOk: true, lastSteps: 0, why: '' };
for (let n = 1; n <= 11; n++) v = nextDay(n, t);
check(t.countOk, '② 每天恰好多一层，左右各一块');
check(t.stillOk, '② 旧的层一个点都不动');
check(t.upOk && t.topOk, '② 新的一层压在旧的上面，山每天更高');
check(t.outOk, '② 每天铺得更远');
check(t.cleanOk, '② 城里从来没有一点垃圾');
check(t.bookOk, '② 每天新铺的那层写的是书里清单的下一样：' + BOOK.slice(0, 3).join('、') + '……');
check(t.walkOk, '② 清洁工的路只会变长（到第 11 天单程 ' + t.lastSteps + ' 步）');
if (!REDUCE) check(t.midOk, '② 清洁工走到半路，今天这层还没铺上');
if (t.why) console.log('  第一处不对：' + t.why);
const before = pts(v.layers);
page.click('roll'); finish();
v = look();
check(pts(v.layers) === before && v.city && /山还不够高/.test(page.text('moral')) && !page.el('roll').disabled, '③ 十一层时滚下一个罐头盒：什么都没变、「山还不够高」');

// ⑤ 第十二天，再滚
v = nextDay(12, t);
page.click('roll'); finish();
v = look();
const flatTop = new Set(v.flat.map(o => Math.round(o.box.y)));
const colors = new Set(v.flat.map(o => sameColor(o.style, NEIGHBOR) ? 'n' : 'l'));
check(v.layers.length === 0 && !v.city && v.hood.length === 0, '⑤ 十二层时滚一个：城没了、山没了（剩 ' + v.layers.length + ' 块坡、' + (v.city ? '城还在' : '没有城') + '）');
check(v.flat.length >= 40 && flatTop.size === 1 && colors.size === 2 && Math.min(...v.flat.map(o => o.box.x)) <= 0 && Math.max(...v.flat.map(o => o.box.x + o.box.w)) >= W,
  '⑤ 剩一片平地，从左边铺到右边，莱奥尼亚的和邻城的混在一起');
check(page.el('roll').disabled && /^莱奥尼亚：没了/.test(meter()) && /彻底干净/.test(page.text('moral')), '⑤ 页面：' + meter());

// ⑥ 压路机
const gap = vv => { const xs = vv.rollers.map(o => o.box.cx); return Math.max(...xs) - Math.min(...xs); };
const g0 = gap(v);
page.click('day'); page.click('day'); finish();
v = look();
check(v.rollers.length >= 2 && gap(v) < g0 - 100 && /压路机开进来 2 次/.test(meter()), '⑥ 按两次，两边的压路机往里开（相隔 ' + Math.round(g0) + ' → ' + Math.round(gap(v)) + '）');
const lo = Math.min(...v.rollers.map(o => o.box.cx)), hi = Math.max(...v.rollers.map(o => o.box.cx));
const behind = v.flat.filter(o => o.box.x + o.box.w <= lo || o.box.x >= hi);
check(behind.length > 0 && behind.every(o => sameColor(o.style, NEIGHBOR)) && v.flat.some(o => !sameColor(o.style, NEIGHBOR)), '⑥ 压路机压过的地方都成了邻城的（' + behind.length + ' 段），前面还混着');

// ⑦ reset，再一路过到第十五天不滚：两边的山碰上
page.click('reset');
v = look();
check(v.layers.length === 0 && v.city && /^过了 0 天/.test(meter()) && !page.el('roll').disabled, '⑦ reset：城回来了，城外什么都没有');
const t2 = { countOk: true, stillOk: true, upOk: true, outOk: true, topOk: true, cleanOk: true, bookOk: true, walkOk: true, midOk: true, lastSteps: 0, why: '' };
let metAt = 0;
for (let n = 1; n <= 15; n++){
  v = nextDay(n, t2);
  const hoodReach = Math.max(...v.hood.map(o => Math.max(...o.points.filter(p => p.x < CX).map(p => p.x))));
  if (!metAt && CX - outer(v) <= hoodReach) metAt = n;
}
check(metAt >= 13 && metAt <= 15 && /别的城也在往这边堆/.test(page.text('moral')), (metAt ? '④ 第 ' + metAt + ' 天起' : '④ 到第 15 天都没') + '莱奥尼亚的山跟邻城的山碰上，页面也这么说');
check(t2.countOk && t2.stillOk && t2.cleanOk && t2.bookOk, '④ reset 以后一路到十五天，层照样只叠不动、城里照样干净、清单照样接着往下');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
