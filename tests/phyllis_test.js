// 菲利德。2026-11-24 做城时一起写的，用 canvas-spy 从画出来的东西里读：
// ① 刚到：十七样花样（六座桥、四种窗、四种路面、刺山柑、三个女王、洋葱圆顶）全画着，用得着的东西一样都还没亮
// ② 按「再住一天」住到第 7 天：每一天画着的花样正好是「还没到它消失那天」的那些，页面上的数就是画着的数；
//    用得着的（近路、门、台阶、板凳、坑、帐篷）从第一天起亮；第 7 天按钮不能再按，底下才铺那张白纸
// ③ 那条近路一次也不经过债主家门口；两条拱廊里只有一条会暖，而且要住到第 3 天
// ④ 第 7 天：慢慢地看（每 100 毫秒挪 10 像素）扫过每一样花样，什么也不回来；
//    飞快地扫过运河，六座桥闪回来、页面说出是哪几座，窗户不跟着闪；闪 0.7 秒就没了
// ⑤ 「只看一眼就走」：回到第 0 天，十七样全在
// 跑法：node tests/phyllis_test.js        减少动效：REDUCE=1 node tests/phyllis_test.js
// 变异：node tests/canvas-spy-mutate.js --env REDUCE=1 -- node tests/phyllis_test.js
const path = require('path');
const { loadPage, sameColor } = require('./canvas-spy');

const REDUCE = process.env.REDUCE === '1';
const W = 1600, H = 1000, CANAL_Y = 600, STREET_Y = 760;
const ORN = '#d8c39a', PAPER = '#ece6d6';
// the book's list, and the day each stops being seen (the table on the page must agree)
const WONDERS = [
  ['驴背式罗锅桥', 'bridge', 150, 1], ['有顶篷的桥', 'bridge', 410, 2], ['有柱脚的桥', 'bridge', 670, 1],
  ['驳船托着的桥', 'bridge', 930, 3], ['悬空桥', 'bridge', 1190, 2], ['带雕花栏杆的桥', 'bridge', 1450, 4],
  ['双扇窗', 'window', 300, 2], ['摩尔式窗', 'window', 560, 3], ['哥特式窗', 'window', 1000, 4], ['彩色玻璃圆花窗', 'window', 1260, 6],
  ['鹅卵石路', 'paving', 200, 1], ['青石板路', 'paving', 600, 2], ['碎石子路', 'paving', 1000, 3], ['蓝白瓷砖路', 'paving', 1400, 5],
  ['城墙头上的刺山柑', 'caper', 90, 4], ['梁柱上的三个女王', 'queens', 780, 6], ['洋葱圆顶', 'onion', 1490, 7],
].map(([name, kind, x, gone]) => ({ name, kind, x, gone }));
const Y = { bridge: CANAL_Y + 10, window: 410, paving: STREET_Y + 110, caper: 250, queens: 200, onion: 170 };
const CREDITOR = [820, 560];

const page = loadPage(path.join(__dirname, '..', 'cities', 'phyllis.html'), {
  reducedMotion: REDUCE,
  viewport: { width: W, height: H },
  expose: { 'st = SC.stage(canvas, W, H, draw);': '{ redraw: () => st.redraw() }' },
  mutations: [
    ['FAST = 2400', 'FAST = 50'],                                                        // 1 盯着看也能看回来
    ['FLASH_MS = 700', 'FLASH_MS = 700000'],                                             // 2 闪回来就不走了
    ['REACH = 70', 'REACH = 400'],                                                       // 3 扫一下，没扫到的也跟着闪
    ['return day < WONDERS[i].gone;', 'return day <= WONDERS[i].gone;'],                 // 4 褪得比表上晚一天
    ["seenCount() + ' / '", "WONDERS.length + ' / '"],                                    // 5 页面上的数是编的
    ['const ROUTE = [HOME, ', 'const ROUTE = [HOME, CREDITOR, '],                          // 6 近路经过债主家门口
    ['a.warm && day >= 3 ? C.lamp', 'a.warm ? C.lamp'],                                   // 7 刚到就知道哪条拱廊好
    ["document.getElementById('leave').addEventListener('click', () => { day = 0; changed(); });",
     "document.getElementById('leave').addEventListener('click', () => { changed(); });"], // 8 走了再来，城还是褪着的
    ["'刚才那一眼，你看见了：' + lastSeen", "'刚才那一眼，你看见了'"],                        // 9 闪回来了却不说是什么
    ['if (day >= LAST_DAY){ ctx.globalAlpha = .08;', 'if (day >= 0){ ctx.globalAlpha = .08;'], // 10 一来就是白纸
    ['const k = Math.min(1, day / 2);', 'const k = Math.min(1, (day - 2) / 2);'],         // 11 住了一天还什么都不认得
  ],
});

let fail = 0; const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) fail++; };
const LAMP = page.cssVars['--lamp'];

function nearest(o){
  let best = null, bd = Infinity;
  WONDERS.forEach(w => { const d = Math.hypot(o.box.cx - w.x, o.box.cy - Y[w.kind]); if (d < bd){ bd = d; best = w; } });
  return best;
}
function look(){
  const ops = page.capture(() => page.exposed.redraw());
  const orn = ops.filter(o => /stroke|fill/.test(o.op) && sameColor(o.style, ORN) && o.alpha > 0);
  const drawn = new Set(orn.map(o => nearest(o).name));
  const lamp = ops.filter(o => /stroke|fill/.test(o.op) && sameColor(o.style, LAMP) && o.alpha > 0.2);
  const route = lamp.find(o => o.op === 'stroke' && o.lineDash.length && o.points.length > 5);
  const paper = ops.some(o => o.op === 'fillRect' && sameColor(o.style, PAPER));
  const arcades = lamp.filter(o => o.op === 'stroke' && o.box.y > 680 && o.box.y + o.box.h <= 745);
  return { ops, orn, drawn, lamp, route, paper, arcades };
}
const meter = () => { const m = /^住了 (\d) 天 · 还看得见 (\d+) \/ 17$/.exec(page.text('meter')); return m ? { day: +m[1], n: +m[2] } : null; };
const shouldSee = day => new Set(WONDERS.filter(w => day < w.gone).map(w => w.name));
const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

// ── ① 刚到 ──
let v = look();
check(same(v.drawn, shouldSee(0)) && v.drawn.size === 17, '① 刚到：十七样花样都画着（' + v.drawn.size + '）');
check(!v.route && v.lamp.length === 0 && !v.paper, '① 用得着的东西一样都还没亮，也没有白纸');
check(meter() && meter().day === 0 && meter().n === 17, '① 页面：' + page.text('meter'));

// ── ② 住下来 ──
let dayOk = true, meterOk = true, usedOk = true, paperOk = true, why = '';
for (let d = 1; d <= 7; d++){
  page.click('stay'); v = look();
  const want = shouldSee(d);
  if (!same(v.drawn, want)){ dayOk = false; why = why || '第 ' + d + ' 天画着 ' + [...v.drawn].join('、') + '；该是 ' + [...want].join('、'); }
  const m = meter();
  if (!m || m.day !== d || m.n !== v.drawn.size){ meterOk = false; why = why || '第 ' + d + ' 天页面「' + page.text('meter') + '」，画着 ' + v.drawn.size; }
  if (!v.route){ usedOk = false; why = why || '第 ' + d + ' 天近路没亮'; }
  if (v.paper !== (d === 7)){ paperOk = false; why = why || '第 ' + d + ' 天白纸' + (v.paper ? '铺了' : '没铺'); }
}
check(dayOk, '② 每一天画着的花样正好是还没到消失那天的');
check(meterOk, '② 页面上「还看得见 N」就是画着的个数');
check(usedOk, '② 近路从第一天起就亮');
check(paperOk, '② 白纸只在第 7 天铺');
check(page.el('stay').disabled === true && page.click('stay') === false && meter().day === 7, '② 第 7 天「再住一天」按不动了');
check(v.drawn.size === 0, '② 第 7 天一样花样都看不见了');
if (why) console.log('  第一处不对：' + why);

// ── ③ 近路和拱廊 ──
const pts = v.route ? v.route.points : [];
const segD = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy; const t = Math.max(0, Math.min(1, ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / (L || 1))); return Math.hypot(p[0] - a.x - t * dx, p[1] - a.y - t * dy); };
let closest = Infinity; for (let i = 1; i < pts.length; i++) closest = Math.min(closest, segD(CREDITOR, pts[i - 1], pts[i]));
check(pts.length > 5 && closest > 150, '③ 近路离债主家门口最近 ' + closest.toFixed(0) + ' 像素，从不经过');
page.click('leave');
const warmBy = [];
for (let d = 0; d <= 7; d++){ v = look(); warmBy.push(v.arcades.length ? new Set(v.arcades.map(o => Math.round(o.box.cx / 50) * 50)).size : 0); if (d < 7) page.click('stay'); }
check(JSON.stringify(warmBy) === JSON.stringify([0, 0, 0, 1, 1, 1, 1, 1]), '③ 暖的拱廊只有一条，第 3 天才暖（每天亮的拱廊数 ' + warmBy.join('') + '）');

// ── ④ 第 7 天：凝视和一瞥 ──
// slow: 10 px every 100 ms, over every wonder's spot
let slowShown = 0, slowCaption = false;
page.pointer('c', 'pointerdown', 40, Y.bridge); page.pointer('c', 'pointerup', 40, Y.bridge);
for (const kind of Object.keys(Y)){
  page.fire('c', 'pointerleave'); page.run(800);
  for (let x = 40; x <= 1560; x += 10){
    page.run(100); page.pointer('c', 'pointermove', x, Y[kind]);
    v = look(); slowShown += v.drawn.size; if (/刚才那一眼/.test(page.text('caption'))) slowCaption = true;
  }
}
check(slowShown === 0 && !slowCaption, '④ 慢慢地看，扫过每一样花样的位置，什么也没回来');
// a long stare: hold still on the onion dome for five seconds
page.pointer('c', 'pointermove', 1490, Y.onion); page.run(5000); page.pointer('c', 'pointermove', 1490, Y.onion);
check(look().drawn.size === 0, '④ 盯着洋葱圆顶五秒，也没回来');
// fast: across the canal, 100 px every 16 ms
page.fire('c', 'pointerleave'); page.run(800); page.pointer('c', 'pointermove', 40, Y.bridge);
for (let x = 140; x <= 1560; x += 100){ page.run(16); page.pointer('c', 'pointermove', x, Y.bridge); }
v = look();
const bridges = new Set(WONDERS.filter(w => w.kind === 'bridge').map(w => w.name));
const cap = page.text('caption');
check(same(v.drawn, bridges), '④ 飞快地扫过运河：六座桥闪回来，别的没有（' + [...v.drawn].join('、') + '）');
check([...bridges].every(b => cap.includes(b)) && !/窗/.test(cap), '④ 页面说出看见了哪几座桥：' + cap);
page.run(400); v = look();
check(same(v.drawn, bridges), '④ 0.4 秒时还在');
page.run(400); v = look();
check(v.drawn.size === 0 && !/刚才那一眼/.test(page.text('caption')), '④ 过了 0.7 秒就没了，页面也不再说');

// ── ⑤ 只看一眼就走 ──
page.click('leave'); v = look();
check(v.drawn.size === 17 && meter().day === 0 && !page.el('stay').disabled, '⑤ 走了再来：回到第 0 天，十七样都在');

// table
const rows = Array.from(page.$$('#rows tr')).map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent).join('→'));
check(JSON.stringify(rows) === JSON.stringify(WONDERS.map(w => w.name + '→第 ' + w.gone + ' 天')), '表格 ' + rows.length + ' 行，和页面画的消失日对得上');

console.log(fail ? fail + ' 条没过' : '全过');
process.exit(fail ? 1 : 0);
