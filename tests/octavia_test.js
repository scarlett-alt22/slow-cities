// 奥塔维亚。2026-11-23 做城时一起写，用 canvas-spy 从画出来的东西里读：
// ① 开头：一张网，两头钉在两边的山上；网下什么都没吊
// ② 每吊一样：网下恰好多一样，名字照书里的次序；网的两头不动，中间只往下坠；
//    每样东西整个在网的下面，挂绳上端正好落在网上；没有一样碰到云下面的谷底
// ③ 十三样吊完，按钮按不动、再按也不多；moral 换成「只能撑这么多」
// ④ 有人从网上走过去：每一步都踩在网上（正常动效逐帧查，减少动效一按就到对面）；走完记一回
// ⑤ reset 回到只有一张网
// 跑法：node tests/octavia_test.js        减少动效：REDUCE=1 node tests/octavia_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/octavia_test.js
const path = require('path');
const { loadPage, where, origin } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, AX = 170, BX = 1430, VALLEY = 975;
const ROPE = '#b9a98a', PLANK = '#8a6f4e', THING = '#e1c28a';
// 书里吊在网下的东西，照原章的次序（译林张密百年纪念版「轻盈的城市 之五」）
const BOOK = ['绳梯', '吊床', '麻袋似的房子', '晾衣架', '小艇似的凉台', '皮水袋', '煤气嘴子', '淋浴喷头', '高架秋千', '游戏套圈', '高架索道', '吊灯', '盆栽的下垂植物'];

const page = loadPage(path.join(__dirname, '..', 'cities', 'octavia.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { "st = SC.stage(document.getElementById('c'), W, H, draw);": '{ redraw: () => st.redraw() }' },
  mutations: [
    ['y = top + drop(i);', 'y = top - drop(i) - 40;'],                                                  // 1 吊到网上面去
    ['const sag = n => 40 + 9 * n;', 'const sag = n => 40 + 9 * (n % 5);'],                              // 2 网会往上弹
    ['const full = hung >= THINGS.length;', 'const full = hung >= 20;'],                                // 3 不知道只能撑这么多
    ['AY + sag(n) * (1 - ((x - MID) / HALF) ** 2)', 'AY + sag(n) * (1.1 - ((x - MID) / HALF) ** 2)'],    // 4 网的两头也跟着坠
    ['ctx.fillText(THINGS[i],', 'ctx.fillText(THINGS[(i + 1) % THINGS.length],'],                        // 5 次序错
    ['const drop = i => 60 + (slot(i) % 2) * 100', 'const drop = i => 60 + (slot(i) % 2) * 600'],            // 6 吊到谷底
    ['SC.figure(ctx, C.ink, x, netY(x, hung) - 5,', 'SC.figure(ctx, C.ink, x, netY(x, 0) - 5,'],         // 7 走路的人没踩在网上
    ['hung = 0; walkT0 = -1; crossings = 0;', 'walkT0 = -1; crossings = 0;'],                            // 8 reset 不摘
    ['ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, y); ctx.stroke();', 'ctx.beginPath(); ctx.moveTo(x, top + 20); ctx.lineTo(x, y); ctx.stroke();'], // 9 挂绳没挂在网上
    ['const p = still ? 1 : Math.min(1,', 'const p = still ? .5 : Math.min(1,'],                         // 10 减少动效下走不到头
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const css = n => page.cssVars[n];
const INK = css('--ink');

function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const ropes = where(ops, { op: 'stroke', style: ROPE, test: o => o.points.length > 50 });
  const top = ropes.length ? ropes.reduce((a, b) => Math.min(...a.points.map(p => p.y)) < Math.min(...b.points.map(p => p.y)) ? a : b) : null;
  const lines = where(ops, { op: 'stroke', style: ROPE, test: o => o.points.length === 2 && Math.abs(o.points[0].x - o.points[1].x) < 1e-6 && Math.abs(o.points[0].y - o.points[1].y) > 40 });
  const things = where(ops, { op: 'fill', style: THING });
  const labels = where(ops, { op: 'fillText', style: INK }).map(o => o.text);
  const walker = where(ops, { op: 'stroke', style: INK });
  const planks = where(ops, { op: 'fillRect', style: PLANK });
  return { top, lines, things, labels, walker, planks };
}
// height of the top rope at x (its points are 10 px apart, so a straight line between them is close enough)
function ropeY(top, x){
  const ps = top.points;
  for (let i = 1; i < ps.length; i++) if (x <= ps[i].x + 1e-9){ const a = ps[i - 1], b = ps[i]; return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x); }
  return ps[ps.length - 1].y;
}
const ends = top => [top.points[0], top.points[top.points.length - 1]];
const sagOf = top => Math.max(...top.points.map(p => p.y)) - top.points[0].y;
const meter = () => { const m = /^网下吊了 (\d+) 样 · 从网上走过 (\d+) 回$/.exec(page.text('meter')); return m ? [+m[1], +m[2]] : null; };

// ① 开头
let v = look();
const [A0, B0] = ends(v.top);
check(Math.abs(A0.x - AX) < 1e-6 && Math.abs(B0.x - BX) < 1e-6 && Math.abs(A0.y - B0.y) < 1e-6, '① 网的两头钉在两边的山上（' + A0.x + ',' + A0.y + ' / ' + B0.x + ',' + B0.y + '）');
check(v.things.length === 0 && v.lines.length === 0 && v.planks.length > 20 && v.planks.every(p => Math.abs(p.box.y + p.box.h - ropeY(v.top, p.box.x + 8)) < 1), '① 网下什么都没吊；木板铺在网上（' + v.planks.length + ' 块）');
check(JSON.stringify(meter()) === '[0,0]', '① 开头页面：' + page.text('meter'));

// ② 吊十三样
let lastSag = sagOf(v.top), countOk = true, orderOk = true, endsOk = true, sagOk = true, belowOk = true, attachOk = true, valleyOk = true, why = '';
for (let n = 1; n <= BOOK.length; n++){
  page.click('hang'); page.frame(16);
  v = look();
  if (v.things.length !== n || v.lines.length !== n){ countOk = false; why = why || '第 ' + n + ' 次画了 ' + v.things.length + ' 样、' + v.lines.length + ' 根挂绳'; }
  if (JSON.stringify(v.labels) !== JSON.stringify(BOOK.slice(0, n))){ orderOk = false; why = why || '第 ' + n + ' 次名字：' + v.labels.join('/'); }
  const [a, b] = ends(v.top);
  if (Math.abs(a.x - A0.x) > 1e-6 || Math.abs(a.y - A0.y) > 1e-6 || Math.abs(b.x - B0.x) > 1e-6 || Math.abs(b.y - B0.y) > 1e-6){ endsOk = false; why = why || '第 ' + n + ' 次网的两头动了'; }
  const s = sagOf(v.top);
  if (!(s > lastSag)){ sagOk = false; why = why || '第 ' + n + ' 次网坠 ' + lastSag.toFixed(1) + '→' + s.toFixed(1); }
  lastSag = s;
  for (const t of v.things) for (const p of t.points){
    if (p.y <= ropeY(v.top, p.x) + .5){ belowOk = false; why = why || '第 ' + n + ' 次有东西在网上面（' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + '）'; }
    if (p.y >= VALLEY){ valleyOk = false; why = why || '第 ' + n + ' 次有东西碰到谷底'; }
  }
  for (const l of v.lines){
    const hi = l.points[0].y < l.points[1].y ? l.points[0] : l.points[1];
    if (Math.abs(hi.y - ropeY(v.top, hi.x)) > .5){ attachOk = false; why = why || '第 ' + n + ' 次有根挂绳上端离网 ' + (hi.y - ropeY(v.top, hi.x)).toFixed(1); }
  }
}
check(countOk, '② 每吊一次，网下恰好多一样，一样一根挂绳');
check(orderOk, '② 名字照书里的次序：' + BOOK.slice(0, 4).join('、') + '……' + BOOK[12]);
check(endsOk, '② 网的两头一直钉在山上');
check(sagOk, '② 网中间只往下坠（最后坠了 ' + lastSag.toFixed(0) + '）');
check(belowOk, '② 每样东西整个在网的下面');
check(attachOk, '② 每根挂绳的上端正好落在网上');
check(valleyOk, '② 没有一样碰到谷底');
if (why) console.log('  第一处不对：' + why);

// ③ 吊满了
const before = v.things.length;
page.click('hang'); page.frame(16); v = look();
check(page.el('hang').disabled && v.things.length === before && /只能撑这么多/.test(page.text('moral')), '③ 十三样吊完：按钮按不动、再按也还是 ' + v.things.length + ' 样，moral「' + page.text('moral').slice(0, 14) + '」');

// ④ 从网上走过去
page.click('walk');
let onNet = true, seen = 0, maxOff = 0;
if (!REDUCE){
  for (let f = 0; f < 380; f++){
    page.frame(1000 / 60);
    const w = look();
    if (!w.walker.length) continue;
    seen++;
    const o = origin(w.walker[0]);
    const off = Math.abs(o.y + 5 - ropeY(w.top, o.x));
    maxOff = Math.max(maxOff, off);
    if (off > .5) onNet = false;
  }
  check(seen > 200 && onNet, '④ 走路的人每一步都踩在网上（看了 ' + seen + ' 帧，最远离网 ' + maxOff.toFixed(2) + '）');
}
page.frame(16); v = look();
check(v.walker.length === 0 && JSON.stringify(meter()) === '[13,1]', '④ 走到对面，记一回：' + page.text('meter'));

// ⑤ reset
page.click('reset'); v = look();
check(v.things.length === 0 && v.lines.length === 0 && Math.abs(sagOf(v.top) - 40) < 1e-6 && !page.el('hang').disabled && JSON.stringify(meter()) === '[0,0]', '⑤ reset：只有一张网，网回到最开始的样子');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
