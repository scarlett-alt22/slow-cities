// 佐艾。2026-11-21 用 canvas-spy 重写。原来那份（970b9a6 里）往页面里插钩子读 houses/uses/flash，没读画面，也没做过变异；这份从画出来的东西里读：
// ① 墙里 18 座、墙外 10 座（墙＝画出来的那个粉笔色椭圆）；28 座房子是同一个形状，一个像素都不差
// ② 每贴一次：亮起来的房子恰好 3 座，标签也是这 3 座、同一个用途；点的那座是墨色字，另外两座灯色带问号；
//    至少一座在墙的另一边；从点的那座拉两条虚线到另外两座
// ③ 房子下面的小点数＝画面上贴给它的不同用途数（最多 9）；画面上出现过的用途没有一样只属于一座房子，页面上的「0 个」对得上
// ④ 城墙每贴一次淡一截（透明度＝0.8×剩下的比例，跟页面上的百分比对得上），第 10 次起不画了，moral 换成「城墙没了」
// ⑤ 点画布：点在哪座房子上就选中哪座；点空地什么都不变；亮光 4 秒后熄（正常动效才查）
// ⑥ reset：小点没了、墙回到满的、页面回到 0
// 跑法：node tests/zoe_test.js        减少动效：REDUCE=1 node tests/zoe_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/zoe_test.js
const path = require('path');
const { loadPage, where, origin } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000;

const page = loadPage(path.join(__dirname, '..', 'cities', 'zoe.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { 'const st = SC.stage(canvas, W, H, draw);': '{ redraw: () => st.redraw() }' },
  mutations: [
    ['.filter(j => j !== i && houses[j].in !== houses[i].in);', '.filter(j => j !== i);'],                           // 1 另外两座可能都在墙的同一边
    ['const b = pool[Math.floor(rand() * pool.length)];', 'const b = a;'],                                          // 2 只落到两座房子
    ['house(ctx, h.x, h.y, 1, lit', 'house(ctx, h.x, h.y, h.in ? 1 : 1.04, lit'],                                    // 3 墙外的房子大一圈
    ['const wall = Math.max(0, 1 - asked / FADE);', 'const wall = Math.max(0, 1 - asked / (FADE * 2));'],           // 4 墙淡得比说的慢
    ['const n = uses[i].size;', 'const n = Math.min(uses[i].size, 2);'],                                            // 5 小点最多画两个
    ['let best = -1, bd = 70;', 'let best = -1, bd = 1e9;'],                                                        // 6 点空地也会选中一座
    ['&& now - flash.at < 4;', ';'],                                                                                 // 7 亮光不熄
    ['clearTimeout(timer);\n    uses = houses.map(() => new Set());', 'clearTimeout(timer);\n    uses = uses || houses.map(() => new Set());'], // 8 reset 不清用途
    ['.filter(n => n === 1).length;', '.filter(n => n === 3).length;'],                                              // 9 页面上的数是算错的（原来写的 === 2 是等价变异：一个用途一次就落三座，永远不会恰好两座）
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const RULE = css('--rule'), LAMP = css('--lamp'), DIM = css('--dim'), CHALK = css('--chalk'), INK = css('--ink');
const key = p => Math.round(p.x) + ',' + Math.round(p.y);
const near = (a, b) => Math.abs(a.x - b.x) < .5 && Math.abs(a.y - b.y) < .5;

// 画面里读出：房子（灰底的身子，按原点认）、每座房子的轮廓颜色和形状、墙、虚线、标签、小点
function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const bodies = where(ops, { op: 'fill', style: RULE });
  const houses = bodies.map(b => {
    const o = origin(b);
    const own = ops.filter(op => op.op === 'stroke' && op.transform.join() === b.transform.join());
    return { at: o, outline: own[0], color: own[0] && own[0].style, shape: own.map(op => op.points.map(p => key({ x: p.x - o.x, y: p.y - o.y })).join(' ')).join(' | ') };
  });
  const wallOp = where(ops, { op: 'stroke', style: CHALK })[0] || null;
  const wall = wallOp ? { cx: wallOp.box.cx, cy: wallOp.box.cy, rx: wallOp.box.w / 2, ry: wallOp.box.h / 2, alpha: wallOp.alpha } : null;
  const dashes = where(ops, { op: 'stroke', style: LAMP, dashed: true });
  const labels = where(ops, { op: 'fillText', test: op => op.alpha > 0 }).map(op => ({ text: op.text, color: op.style, at: op.points[0] }));
  const dots = where(ops, { op: 'fill', style: LAMP });
  return { ops, houses, wall, dashes, labels, dots };
}
// 哪座房子：按画出来的位置找最近的那座
const nearestHouse = (v, p) => { let best = -1, bd = Infinity; v.houses.forEach((h, i) => { const d = Math.hypot(h.at.x - p.x, h.at.y - p.y); if (d < bd){ bd = d; best = i; } }); return best; };
const meter = () => { const m = /^贴过 (\d+) 次 · 只属于一座房子的用途 (\d+) 个 · 城墙还剩 (\d+)%$/.exec(page.text('meter')); return m ? m.slice(1).map(Number) : null; };

// ① 开头
let v = look();
const W0 = v.wall;
const inside = h => ((h.at.x - W0.cx) / W0.rx) ** 2 + ((h.at.y - W0.cy) / W0.ry) ** 2 < 1;
const sides = v.houses.map(inside);
check(v.houses.length === 28 && sides.filter(Boolean).length === 18, '① 画出来 ' + v.houses.length + ' 座房子，墙里 ' + sides.filter(Boolean).length + ' 座');
check(new Set(v.houses.map(h => h.shape)).size === 1, '① 所有房子是同一个形状（不同的形状 ' + new Set(v.houses.map(h => h.shape)).size + ' 种）');
check(v.houses.every(h => h.color === DIM) && v.dots.length === 0 && Math.abs(W0.alpha - .8) < 1e-9, '① 开头没有亮的房子、没有小点，墙是满的');
check(JSON.stringify(meter()) === '[0,0,100]', '① 开头页面：' + page.text('meter'));

// ②③④⑤ 贴 30 次：单数按按钮，双数点画布上某一座
const got = v.houses.map(() => new Set());   // 画面上贴给每座房子的用途
let litOk = true, labelOk = true, crossOk = true, dashOk = true, pickOk = true, dotsOk = true, wallOk = true, meterOk = true, fadeOk = true, why = '';
const fail1 = (flag, msg) => { if (!why) why = msg; return false; };
for (let k = 0; k < 30; k++){
  let want = -1;
  if (k % 2) page.click('ask');
  else { want = (k * 7) % 28; const h = v.houses[want]; page.click('c', h.at.x, h.at.y - 30); }
  page.frame(16);
  v = look();
  const lit = v.houses.map((h, i) => h.color === LAMP ? i : -1).filter(i => i >= 0);
  const tagged = v.labels.map(l => ({ ...l, house: nearestHouse(v, { x: l.at.x, y: l.at.y + 70 }) }));
  const main = tagged.filter(l => l.color === INK), others = tagged.filter(l => l.color === LAMP);
  const use = main[0] && main[0].text;
  if (lit.length !== 3) litOk = fail1(0, '第 ' + (k + 1) + ' 次亮了 ' + lit.length + ' 座');
  const labelHouses = tagged.map(l => l.house).sort((a, b) => a - b).join();
  if (main.length !== 1 || others.length !== 2 || !others.every(l => l.text === use + '？') || labelHouses !== lit.slice().sort((a, b) => a - b).join())
    labelOk = fail1(0, '第 ' + (k + 1) + ' 次标签：' + tagged.map(l => l.text + '@' + l.house).join(' '));
  if (main.length === 1){
    const m = main[0].house;
    if (want >= 0 && m !== want) pickOk = fail1(0, '第 ' + (k + 1) + ' 次点了第 ' + want + ' 座，选中的是第 ' + m + ' 座');
    if (!lit.some(i => sides[i] !== sides[m])) crossOk = fail1(0, '第 ' + (k + 1) + ' 次三座都在墙' + (sides[m] ? '里' : '外'));
    const ends = v.dashes.map(d => d.points);
    const from = { x: v.houses[m].at.x, y: v.houses[m].at.y - 30 };
    const tos = lit.filter(i => i !== m).map(i => ({ x: v.houses[i].at.x, y: v.houses[i].at.y - 30 }));
    if (ends.length !== 2 || !tos.every(t => ends.some(e => near(e[0], from) && near(e[e.length - 1], t)))) dashOk = fail1(0, '第 ' + (k + 1) + ' 次虚线 ' + ends.length + ' 条，没连对');
    for (const i of lit) got[i].add(use);
  }
  // ③ 小点：每座房子下方 (x, y+14) 一排
  const counts = v.houses.map(() => 0);
  for (const d of v.dots){ const c = { x: d.box.cx, y: d.box.cy }; const i = nearestHouse(v, { x: c.x, y: c.y - 14 }); if (Math.abs(c.y - (v.houses[i].at.y + 14)) < .5) counts[i]++; }
  if (!counts.every((n, i) => n === Math.min(got[i].size, 9))) dotsOk = fail1(0, '第 ' + (k + 1) + ' 次小点 ' + counts.join('') + ' 对 ' + got.map(s => Math.min(s.size, 9)).join(''));
  // ④ 墙
  const left = Math.max(0, 1 - (k + 1) / 10);
  const wallNow = v.wall ? v.wall.alpha / .8 : 0;
  if (Math.abs(wallNow - left) > 1e-9) wallOk = fail1(0, '第 ' + (k + 1) + ' 次墙还剩 ' + wallNow.toFixed(2) + '，该是 ' + left.toFixed(2));
  const owners = new Map(); got.forEach(s => s.forEach(u => owners.set(u, (owners.get(u) || 0) + 1)));
  const lonely = [...owners.values()].filter(n => n === 1).length;
  const mt = meter();
  if (!mt || mt[0] !== k + 1 || mt[1] !== lonely || mt[2] !== Math.round(wallNow * 100)) meterOk = fail1(0, '第 ' + (k + 1) + ' 次页面：' + page.text('meter') + '；画面上只属于一座的 ' + lonely + '、墙 ' + Math.round(wallNow * 100) + '%');
  if (lonely !== 0) meterOk = fail1(0, '第 ' + (k + 1) + ' 次画面上有 ' + lonely + ' 个用途只属于一座房子');
  if (k === 9) check(/^城墙没了/.test(page.text('moral')) && !v.wall, '④ 第 10 次：墙不画了、moral「' + page.text('moral').slice(0, 5) + '」');
  // ⑤ 亮光 4 秒后熄
  if (!REDUCE && k === 4){
    page.frame(4200);
    const after = look();
    if (after.houses.some(h => h.color === LAMP) || after.dashes.length || after.labels.length) fadeOk = fail1(0, '4.2 秒后还亮着');
  }
}
check(litOk, '② 每贴一次恰好亮 3 座房子');
check(labelOk, '② 标签就在这 3 座上：点的那座墨色字，另外两座灯色、同一个用途带问号');
check(crossOk, '② 每次至少一座在墙的另一边');
check(dashOk, '② 从点的那座拉两条虚线到另外两座');
check(pickOk, '⑤ 点画布选中的就是点的那座');
check(dotsOk, '③ 每座房子下面的小点数＝画面上贴给它的不同用途数');
check(wallOk, '④ 墙每次淡一截，跟贴过的次数对得上');
check(meterOk, '③④ 页面上的数跟画面对得上，只属于一座房子的用途一直是 0');
if (!REDUCE) check(fadeOk, '⑤ 亮光 4 秒后熄了');
if (why) console.log('  第一处不对：' + why);

const before = page.text('meter');
const dotsBefore = look().dots.length;
page.click('c', 5, 5);
check(page.text('meter') === before && look().dots.length === dotsBefore, '⑤ 点空地什么都不变');

// ⑥ reset
page.click('reset');
v = look();
check(v.dots.length === 0 && v.wall && Math.abs(v.wall.alpha - .8) < 1e-9 && v.houses.every(h => h.color === DIM), '⑥ reset：小点 ' + v.dots.length + ' 个、墙回来了、没有亮的');
check(JSON.stringify(meter()) === '[0,0,100]', '⑥ reset 后页面：' + page.text('meter'));
page.click('ask'); page.frame(16); v = look();
const fresh = v.dots.length;
check(fresh === 3, '⑥ reset 后再贴一次，小点一共 ' + fresh + ' 个（三座各一个）');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
